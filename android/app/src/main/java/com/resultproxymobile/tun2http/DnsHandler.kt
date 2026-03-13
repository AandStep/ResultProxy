package com.resultproxymobile.tun2http

import android.net.VpnService
import android.util.Log
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.InetAddress
import java.util.concurrent.ConcurrentLinkedQueue

class DnsHandler(
    private val vpnService: VpnService,
    private val dnsServer: String = "8.8.8.8"
) {
    val outputQueue = ConcurrentLinkedQueue<ByteArray>()

    fun handleDnsQuery(
        srcIp: ByteArray,
        dstIp: ByteArray,
        srcPort: Int,
        dnsPayload: ByteArray
    ) {
        val thread = Thread({
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
