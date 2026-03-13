package com.resultproxymobile.tun2http

import android.net.VpnService
import android.util.Log
import java.io.OutputStream
import java.net.InetSocketAddress
import java.net.Socket
import java.util.concurrent.ConcurrentLinkedQueue

class TcpConnection(
    val key: String,
    val srcIp: ByteArray,
    val dstIp: ByteArray,
    val srcPort: Int,
    val dstPort: Int,
    private val proxyHost: String,
    private val proxyPort: Int,
    private val vpnService: VpnService
) {
    enum class State { SYN_RECEIVED, ESTABLISHED, FIN_WAIT, CLOSED }

    var state = State.SYN_RECEIVED
        private set

    private var localSeq: Long = (System.nanoTime() and 0xFFFFFFFFL)
    private var localAck: Long = 0
    private var remoteWindow: Int = 65535

    private var proxySocket: Socket? = null
    private var proxyOutput: OutputStream? = null
    private var readerThread: Thread? = null

    val outputQueue = ConcurrentLinkedQueue<ByteArray>()

    var lastActivity = System.currentTimeMillis()
        private set

    private val dstIpString = dstIp.joinToString(".") { (it.toInt() and 0xFF).toString() }

    fun handleSyn(tcpHeader: Packet.TcpHeader): Boolean {
        localAck = (tcpHeader.seqNum + 1) and 0xFFFFFFFFL
        lastActivity = System.currentTimeMillis()

        val connectThread = Thread({
            try {
                val sock = Socket()
                vpnService.protect(sock)
                sock.connect(InetSocketAddress(proxyHost, proxyPort), 10000)
                sock.soTimeout = 0
                sock.tcpNoDelay = true

                val out = sock.getOutputStream()
                val connectReq = "CONNECT $dstIpString:$dstPort HTTP/1.1\r\nHost: $dstIpString:$dstPort\r\n\r\n"
                out.write(connectReq.toByteArray())
                out.flush()

                val input = sock.getInputStream()
                val respBuf = ByteArray(1024)
                val respLen = input.read(respBuf)
                if (respLen <= 0) {
                    sendRst()
                    sock.close()
                    return@Thread
                }

                val response = String(respBuf, 0, respLen)
                if (!response.startsWith("HTTP/1.1 200") && !response.startsWith("HTTP/1.0 200")) {
                    Log.e(TAG, "[$key] Proxy CONNECT failed: ${response.trim().take(80)}")
                    sendRst()
                    sock.close()
                    return@Thread
                }

                proxySocket = sock
                proxyOutput = out

                val synAck = Packet.buildTcpPacket(
                    dstIp, srcIp, dstPort, srcPort,
                    localSeq, localAck,
                    Packet.TCP_SYN or Packet.TCP_ACK,
                    65535
                )
                localSeq = (localSeq + 1) and 0xFFFFFFFFL
                outputQueue.add(synAck)

                state = State.SYN_RECEIVED
                startProxyReader(input)

            } catch (e: Exception) {
                Log.e(TAG, "[$key] Proxy connect error: ${e.message}")
                sendRst()
            }
        }, "TcpConnect-$key")
        connectThread.isDaemon = true
        connectThread.start()

        return true
    }

    fun handleAck(tcpHeader: Packet.TcpHeader, payload: ByteArray?) {
        lastActivity = System.currentTimeMillis()

        if (state == State.SYN_RECEIVED && tcpHeader.hasAck()) {
            state = State.ESTABLISHED
        }

        if (state == State.FIN_WAIT && tcpHeader.hasAck()) {
            state = State.CLOSED
            close()
            return
        }

        if (payload != null && payload.isNotEmpty() && state == State.ESTABLISHED) {
            localAck = (tcpHeader.seqNum + payload.size) and 0xFFFFFFFFL

            val ack = Packet.buildTcpPacket(
                dstIp, srcIp, dstPort, srcPort,
                localSeq, localAck,
                Packet.TCP_ACK,
                65535
            )
            outputQueue.add(ack)

            try {
                proxyOutput?.write(payload)
                proxyOutput?.flush()
            } catch (e: Exception) {
                Log.e(TAG, "[$key] Write to proxy failed: ${e.message}")
                sendRst()
            }
        }
    }

    fun handleFin(tcpHeader: Packet.TcpHeader) {
        lastActivity = System.currentTimeMillis()
        localAck = (tcpHeader.seqNum + 1) and 0xFFFFFFFFL

        val finAck = Packet.buildTcpPacket(
            dstIp, srcIp, dstPort, srcPort,
            localSeq, localAck,
            Packet.TCP_FIN or Packet.TCP_ACK,
            65535
        )
        localSeq = (localSeq + 1) and 0xFFFFFFFFL
        outputQueue.add(finAck)

        state = State.FIN_WAIT
        close()
    }

    fun handleRst() {
        state = State.CLOSED
        close()
    }

    private fun startProxyReader(input: java.io.InputStream) {
        readerThread = Thread({
            val buf = ByteArray(16384)
            try {
                while (state != State.CLOSED) {
                    val len = input.read(buf)
                    if (len <= 0) break

                    lastActivity = System.currentTimeMillis()

                    var offset = 0
                    while (offset < len) {
                        val chunkSize = minOf(len - offset, 1400)
                        val chunk = buf.copyOfRange(offset, offset + chunkSize)

                        val dataPacket = Packet.buildTcpPacket(
                            dstIp, srcIp, dstPort, srcPort,
                            localSeq, localAck,
                            Packet.TCP_ACK or Packet.TCP_PSH,
                            65535,
                            chunk
                        )
                        localSeq = (localSeq + chunkSize) and 0xFFFFFFFFL
                        outputQueue.add(dataPacket)
                        offset += chunkSize
                    }
                }
            } catch (e: Exception) {
                if (state != State.CLOSED) {
                    Log.d(TAG, "[$key] Proxy read ended: ${e.message}")
                }
            }

            if (state == State.ESTABLISHED) {
                val fin = Packet.buildTcpPacket(
                    dstIp, srcIp, dstPort, srcPort,
                    localSeq, localAck,
                    Packet.TCP_FIN or Packet.TCP_ACK,
                    65535
                )
                localSeq = (localSeq + 1) and 0xFFFFFFFFL
                outputQueue.add(fin)
                state = State.FIN_WAIT
            }
        }, "TcpReader-$key")
        readerThread?.isDaemon = true
        readerThread?.start()
    }

    private fun sendRst() {
        val rst = Packet.buildRstPacket(dstIp, srcIp, dstPort, srcPort, localSeq, localAck)
        outputQueue.add(rst)
        state = State.CLOSED
    }

    fun close() {
        state = State.CLOSED
        try { readerThread?.interrupt() } catch (_: Exception) {}
        try { proxySocket?.close() } catch (_: Exception) {}
        proxySocket = null
        proxyOutput = null
    }

    fun isExpired(timeoutMs: Long = 120_000): Boolean {
        return System.currentTimeMillis() - lastActivity > timeoutMs
    }

    companion object {
        private const val TAG = "TcpConnection"
    }
}
