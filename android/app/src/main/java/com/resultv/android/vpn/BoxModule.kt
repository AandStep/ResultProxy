package com.resultv.android.vpn

import android.content.Context
import android.os.ParcelFileDescriptor
import android.util.Log
import libbox.CommandServer
import libbox.CommandServerHandler
import libbox.ConnectionOwner
import libbox.InterfaceUpdateListener
import libbox.Libbox
import libbox.LocalDNSTransport
import libbox.NetworkInterfaceIterator
import libbox.Notification
import libbox.OverrideOptions
import libbox.PlatformInterface
import libbox.SetupOptions
import libbox.StringIterator
import libbox.SystemProxyStatus
import libbox.TunOptions
import libbox.WIFIState
import java.io.File

private const val TAG = "ResultV/Box"

// gomobile names Java packages by the Go package name only — for
// `package libbox` the Java imports live under the unqualified `libbox.*`
// namespace. The same applies to our wrapper `package mobile` -> `mobile.*`.

/**
 * Singleton that owns the libbox CommandServer for the lifetime of the
 * VPN service. Setup is one-shot (idempotent); start/stop can cycle.
 */
object BoxModule {
    private var setupDone = false
    private var commandServer: CommandServer? = null

    /**
     * Configure libbox global paths. Must be called before any Service
     * construction. Safe to call multiple times.
     */
    @Synchronized
    fun ensureSetup(ctx: Context) {
        if (setupDone) return
        val base = ctx.filesDir
        val work = File(base, "work").apply { mkdirs() }
        val tmp = ctx.cacheDir
        val opts = SetupOptions().apply {
            basePath = base.absolutePath
            workingPath = work.absolutePath
            tempPath = tmp.absolutePath
            // grpc command socket — picking 0 forces a unix-domain socket
            // under basePath/command.sock, which is what we want on Android
            commandServerListenPort = 0
            // Workaround for golang.org/issues/68760 on Android.
            fixAndroidStack = true
        }
        Libbox.setup(opts)
        setupDone = true
        Log.i(TAG, "libbox.Setup done; basePath=${base.absolutePath}")
    }

    @Synchronized
    fun start(service: ResultVpnService, configJson: String) {
        if (commandServer != null) {
            Log.w(TAG, "start() called while already running; ignoring")
            return
        }
        ensureSetup(service)

        // Dump config in chunks (logcat caps lines around 4 KB).
        Log.i(TAG, "── config begin ──")
        configJson.chunked(3500).forEach { Log.i(TAG, it) }
        Log.i(TAG, "── config end ──")

        val platform = BoxPlatform(service)
        val handler = StubCommandHandler()
        val server = Libbox.newCommandServer(handler, platform)
        server.start()
        // OverrideOptions is empty — no per-app routing yet.
        server.startOrReloadService(configJson, OverrideOptions())
        commandServer = server
        Log.i(TAG, "BoxModule started")
    }

    @Synchronized
    fun stop() {
        val server = commandServer ?: return
        commandServer = null
        try {
            server.closeService()
        } catch (t: Throwable) {
            Log.w(TAG, "closeService threw", t)
        }
        try {
            server.close()
        } catch (t: Throwable) {
            Log.w(TAG, "close threw", t)
        }
        Log.i(TAG, "BoxModule stopped")
    }
}

/**
 * Implementation of libbox.PlatformInterface. The interesting method is
 * [openTun]; the rest are stubs that return safe defaults so libbox
 * stops asking us about features we do not support in the PoC.
 */
private class BoxPlatform(private val service: ResultVpnService) : PlatformInterface {

    override fun openTun(options: TunOptions): Int {
        // Use explicit getters to side-step Kotlin's ambiguous bean-name
        // mapping for all-caps Go names like getMTU / getDNSServerAddress.
        val builder = service.Builder()
        builder.setSession("ResultV")
        // Kotlin's bean-mapping is unreliable for all-caps acronyms
        // (getMTU / getDNSServerAddress) — call the explicit getters.
        val mtu = options.getMTU()
        builder.setMtu(if (mtu > 0) mtu else 9000)

        // RoutePrefix uses Go-style methods (address(), prefix()), not bean getters.
        val inet4 = options.inet4Address
        while (inet4.hasNext()) {
            val p = inet4.next()
            builder.addAddress(p.address(), p.prefix())
        }
        val inet6 = options.inet6Address
        while (inet6.hasNext()) {
            val p = inet6.next()
            builder.addAddress(p.address(), p.prefix())
        }

        // Auto-route: libbox passes 0.0.0.0/0 (and ::/0) via RouteRange.
        // If autoRoute is off we still respect the explicit route list.
        val ipv4Routes = if (options.autoRoute) options.inet4RouteRange else options.inet4RouteAddress
        while (ipv4Routes.hasNext()) {
            val p = ipv4Routes.next()
            builder.addRoute(p.address(), p.prefix())
        }
        val ipv6Routes = if (options.autoRoute) options.inet6RouteRange else options.inet6RouteAddress
        while (ipv6Routes.hasNext()) {
            val p = ipv6Routes.next()
            builder.addRoute(p.address(), p.prefix())
        }

        // DNS — libbox builds a synthetic in-tunnel DNS server it
        // intercepts itself. Throws if the IPv4 prefix is too narrow.
        try {
            val dns = options.getDNSServerAddress()
            if (dns != null && dns.value.isNotEmpty()) {
                builder.addDnsServer(dns.value)
            }
        } catch (t: Throwable) {
            Log.w(TAG, "no DNS hijack address from libbox; falling back to 8.8.8.8", t)
            builder.addDnsServer("8.8.8.8")
        }

        // Bypass our own package so the gRPC command socket and any
        // outbound connect from sing-box itself never recurses into the tunnel.
        try {
            builder.addDisallowedApplication(service.packageName)
        } catch (t: Throwable) {
            Log.w(TAG, "addDisallowedApplication failed", t)
        }

        builder.setBlocking(false)

        val pfd: ParcelFileDescriptor = builder.establish()
            ?: error("VpnService.Builder.establish() returned null — VPN permission revoked?")
        // Service owns the PFD so it can close it on Disconnect/destroy.
        // libbox dup()s the fd internally (service.go:76), so closing the
        // original later does not invalidate libbox's tun handle.
        service.tunPfd?.let {
            try { it.close() } catch (_: Throwable) {}
        }
        service.tunPfd = pfd
        val fd = pfd.fd
        Log.i(TAG, "openTun → fd=$fd, mtu=$mtu, autoRoute=${options.autoRoute}")
        return fd
    }

    override fun usePlatformAutoDetectInterfaceControl(): Boolean = true

    override fun autoDetectInterfaceControl(fd: Int) {
        // VpnService.protect: keep this socket OUT of the tunnel.
        // sing-box uses this for its outbound connection to the proxy
        // server — without it we'd recurse into the tunnel.
        val ok = service.protect(fd)
        if (!ok) {
            Log.w(TAG, "protect($fd) returned false")
        }
    }

    override fun useProcFS(): Boolean = false
    override fun localDNSTransport(): LocalDNSTransport? = null

    // Returning null from this method crashes the libbox wrapper —
    // service.go:218 dereferences result.UserId without a nil check.
    // Throw instead so the wrapper takes the (nil, err) path and the
    // router treats the connection owner as "not found" cleanly.
    override fun findConnectionOwner(
        ipProtocol: Int,
        sourceAddress: String?,
        sourcePort: Int,
        destinationAddress: String?,
        destinationPort: Int,
    ): ConnectionOwner = throw UnsupportedOperationException("connection owner lookup not supported")

    override fun startDefaultInterfaceMonitor(listener: InterfaceUpdateListener?) {}
    override fun closeDefaultInterfaceMonitor(listener: InterfaceUpdateListener?) {}
    override fun getInterfaces(): NetworkInterfaceIterator = EmptyIterator
    override fun underNetworkExtension(): Boolean = false
    override fun includeAllNetworks(): Boolean = false
    override fun readWIFIState(): WIFIState? = null
    override fun systemCertificates(): StringIterator = EmptyStringIterator
    override fun clearDNSCache() {}
    override fun sendNotification(notification: Notification?) {}
}

private object EmptyIterator : NetworkInterfaceIterator {
    override fun hasNext(): Boolean = false
    override fun next() = throw NoSuchElementException()
}

private object EmptyStringIterator : StringIterator {
    override fun hasNext(): Boolean = false
    override fun next(): String = throw NoSuchElementException()
    override fun len(): Int = 0
}

private class StubCommandHandler : CommandServerHandler {
    override fun serviceStop() { Log.i(TAG, "cmd: serviceStop") }
    override fun serviceReload() { Log.i(TAG, "cmd: serviceReload") }
    override fun getSystemProxyStatus(): SystemProxyStatus? = null
    override fun setSystemProxyEnabled(enabled: Boolean) {}
    override fun writeDebugMessage(message: String?) {
        Log.d(TAG, "libbox: $message")
    }
}
