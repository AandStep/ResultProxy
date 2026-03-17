package com.resultproxymobile.tun2http

import android.net.VpnService
import android.util.Log
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.InetAddress
import java.util.concurrent.ConcurrentLinkedQueue

import org.json.JSONArray
import java.io.File
import java.io.BufferedReader
import java.io.FileReader

class DnsHandler(
    private val vpnService: VpnService,
    private val dnsServer: String = "8.8.8.8",
    private var adblockEnabled: Boolean = false,
    private var adblockHosts: Set<String> = mutableSetOf()
) {
    val outputQueue = ConcurrentLinkedQueue<ByteArray>()

    fun setAdblock(enabled: Boolean, hostsPath: String?) {
        adblockEnabled = enabled
        if (enabled && hostsPath != null) {
            loadHosts(hostsPath)
        }
    }

    private fun loadHosts(path: String) {
        try {
            val file = File(path)
            if (file.exists()) {
                val reader = BufferedReader(FileReader(file))
                val content = reader.use { it.readText() }
                val json = JSONArray(content)
                val hosts = mutableSetOf<String>()
                for (i in 0 until json.length()) {
                    hosts.add(json.getString(i))
                }
                adblockHosts = hosts
                Log.d(TAG, "Loaded ${adblockHosts.size} adblock hosts")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to load hosts: ${e.message}")
        }
    }

    private fun extractDomain(payload: ByteArray): String? {
        try {
            if (payload.size < 12) return null
            // DNS Question starts at byte 12
            var pos = 12
            val sb = StringBuilder()
            while (pos < payload.size) {
                val len = payload[pos].toInt() and 0xFF
                if (len == 0) break
                pos++
                if (pos + len > payload.size) break
                if (sb.isNotEmpty()) sb.append(".")
                for (i in 0 until len) {
                    sb.append(payload[pos + i].toInt().toChar())
                }
                pos += len
            }
            return sb.toString()
        } catch (e: Exception) {
            return null
        }
    }

    fun handleDnsQuery(
        srcIp: ByteArray,
        dstIp: ByteArray,
        srcPort: Int,
        dnsPayload: ByteArray
    ) {
        if (adblockEnabled) {
            val domain = extractDomain(dnsPayload)
            if (domain != null && adblockHosts.contains(domain)) {
                Log.i(TAG, "AdBlock: blocked domain $domain")
                return // Просто игнорируем запрос — браузер получит таймаут или NXDOMAIN
            }
        }

        val thread = Thread(Runnable {
            var socket: DatagramSocket? = null
            try {
                socket = DatagramSocket()
                vpnService.protect(socket)

                val addr = InetAddress.getByName(dnsServer)
                val request = DatagramPacket(dnsPayload, dnsPayload.size, addr, 53)
                socket.soTimeout = 5000
                socket.send(request)

                val responseBuf = ByteArray(1500)
                val response = DatagramPacket(responseBuf, responseBuf.size)
                socket.receive(response)

                val responseData = responseBuf.copyOfRange(0, response.length)
                val packet = Packet.buildUdpPacket(
                    dstIp, srcIp,
                    53, srcPort,
                    responseData
                )
                outputQueue.add(packet)

            } catch (e: Exception) {
                Log.e(TAG, "DNS query failed: ${e.message}")
            } finally {
                socket?.close()
            }
        }, "DNS-$srcPort")
        thread.isDaemon = true
        thread.start()
    }

    companion object {
        private const val TAG = "DnsHandler"
    }
}
