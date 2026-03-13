package com.resultproxymobile.tun2http

import android.net.VpnService
import android.os.ParcelFileDescriptor
import android.util.Log
import java.io.FileInputStream
import java.io.FileOutputStream
import java.util.concurrent.ConcurrentHashMap

class Tun2HttpEngine(
    private val vpnInterface: ParcelFileDescriptor,
    private val proxyHost: String,
    private val proxyPort: Int,
    private val vpnService: VpnService
) {
    private val connections = ConcurrentHashMap<String, TcpConnection>()
    private val dnsHandler = DnsHandler(vpnService)

    @Volatile
    private var running = false
    private var readerThread: Thread? = null
    private var writerThread: Thread? = null
    private var cleanupThread: Thread? = null

    fun start() {
        running = true
        readerThread = Thread({ runReader() }, "Tun2Http-Reader")
        writerThread = Thread({ runWriter() }, "Tun2Http-Writer")
        cleanupThread = Thread({ runCleanup() }, "Tun2Http-Cleanup")

        readerThread?.isDaemon = true
        writerThread?.isDaemon = true
        cleanupThread?.isDaemon = true

        readerThread?.start()
        writerThread?.start()
        cleanupThread?.start()

        Log.i(TAG, "Tun2Http engine started. Proxy: $proxyHost:$proxyPort")
    }

    fun stop() {
        running = false
        readerThread?.interrupt()
        writerThread?.interrupt()
        cleanupThread?.interrupt()

        connections.values.forEach { it.close() }
        connections.clear()

        Log.i(TAG, "Tun2Http engine stopped")
    }

    private fun runReader() {
        val buffer = ByteArray(32768)
        val input = FileInputStream(vpnInterface.fileDescriptor)

        try {
            while (running && !Thread.interrupted()) {
                val length = input.read(buffer)
                if (length <= 0) {
                    Thread.sleep(10)
                    continue
                }

                val data = buffer.copyOfRange(0, length)
                processPacket(data, length)
            }
        } catch (e: InterruptedException) {
            Log.d(TAG, "Reader interrupted")
        } catch (e: Exception) {
            if (running) Log.e(TAG, "Reader error: ${e.message}")
        }
    }

    private fun runWriter() {
        val output = FileOutputStream(vpnInterface.fileDescriptor)

        try {
            while (running && !Thread.interrupted()) {
                var wrote = false

                for (conn in connections.values) {
                    var packet = conn.outputQueue.poll()
                    while (packet != null) {
                        output.write(packet)
                        wrote = true
                        packet = conn.outputQueue.poll()
                    }
                }

                var dnsPacket = dnsHandler.outputQueue.poll()
                while (dnsPacket != null) {
                    output.write(dnsPacket)
                    wrote = true
                    dnsPacket = dnsHandler.outputQueue.poll()
                }

                if (!wrote) {
                    Thread.sleep(1)
                }
            }
        } catch (e: InterruptedException) {
            Log.d(TAG, "Writer interrupted")
        } catch (e: Exception) {
            if (running) Log.e(TAG, "Writer error: ${e.message}")
        }
    }

    private fun runCleanup() {
        try {
            while (running && !Thread.interrupted()) {
                Thread.sleep(30_000)

                val expired = connections.entries.filter { it.value.isExpired() || it.value.state == TcpConnection.State.CLOSED }
                for (entry in expired) {
                    entry.value.close()
                    connections.remove(entry.key)
                }

                if (expired.isNotEmpty()) {
                    Log.d(TAG, "Cleaned ${expired.size} connections. Active: ${connections.size}")
                }
            }
        } catch (_: InterruptedException) {}
    }

    private fun processPacket(data: ByteArray, length: Int) {
        val ipHeader = Packet.parseIp(data, length) ?: return

        when (ipHeader.protocol) {
            Packet.PROTO_TCP -> processTcp(data, length, ipHeader)
            Packet.PROTO_UDP -> processUdp(data, length, ipHeader)
        }
    }

    private fun processTcp(data: ByteArray, length: Int, ipHeader: Packet.IpHeader) {
        val tcpHeader = Packet.parseTcp(data, ipHeader.headerLength, length) ?: return

        val key = "${ipHeader.srcIpString()}:${tcpHeader.srcPort}-${ipHeader.dstIpString()}:${tcpHeader.dstPort}"

        if (tcpHeader.hasRst()) {
            connections[key]?.handleRst()
            connections.remove(key)
            return
        }

        if (tcpHeader.hasSyn() && !tcpHeader.hasAck()) {
            connections[key]?.close()

            val conn = TcpConnection(
                key, ipHeader.srcIp, ipHeader.dstIp,
                tcpHeader.srcPort, tcpHeader.dstPort,
                proxyHost, proxyPort, vpnService
            )
            connections[key] = conn
            conn.handleSyn(tcpHeader)
            return
        }

        val conn = connections[key] ?: return

        if (tcpHeader.hasFin()) {
            conn.handleFin(tcpHeader)
            return
        }

        val payloadOffset = ipHeader.headerLength + tcpHeader.headerLength
        val payloadLength = ipHeader.totalLength - payloadOffset
        val payload = if (payloadLength > 0 && payloadOffset + payloadLength <= length) {
            data.copyOfRange(payloadOffset, payloadOffset + payloadLength)
        } else null

        conn.handleAck(tcpHeader, payload)
    }

    private fun processUdp(data: ByteArray, length: Int, ipHeader: Packet.IpHeader) {
        val udpHeader = Packet.parseUdp(data, ipHeader.headerLength, length) ?: return

        if (udpHeader.dstPort == 53) {
            val payloadOffset = ipHeader.headerLength + Packet.UDP_HEADER_LEN
            val payloadLength = udpHeader.length - Packet.UDP_HEADER_LEN
            if (payloadLength > 0 && payloadOffset + payloadLength <= length) {
                val dnsPayload = data.copyOfRange(payloadOffset, payloadOffset + payloadLength)
                dnsHandler.handleDnsQuery(ipHeader.srcIp, ipHeader.dstIp, udpHeader.srcPort, dnsPayload)
            }
        }
    }

    companion object {
        private const val TAG = "Tun2HttpEngine"
    }
}
