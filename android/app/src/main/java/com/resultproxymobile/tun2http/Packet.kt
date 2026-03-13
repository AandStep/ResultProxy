package com.resultproxymobile.tun2http

import java.nio.ByteBuffer

object Packet {

    const val IP_HEADER_MIN = 20
    const val TCP_HEADER_MIN = 20
    const val UDP_HEADER_LEN = 8

    const val PROTO_TCP: Byte = 6
    const val PROTO_UDP: Byte = 17

    const val TCP_FIN = 0x01
    const val TCP_SYN = 0x02
    const val TCP_RST = 0x04
    const val TCP_PSH = 0x08
    const val TCP_ACK = 0x10

    class IpHeader(
        val version: Int,
        val ihl: Int,
        val totalLength: Int,
        val identification: Int,
        val flags: Int,
        val fragmentOffset: Int,
        val ttl: Int,
        val protocol: Byte,
        val srcIp: ByteArray,
        val dstIp: ByteArray,
        val headerLength: Int
    ) {
        fun srcIpString(): String = srcIp.joinToString(".") { (it.toInt() and 0xFF).toString() }
        fun dstIpString(): String = dstIp.joinToString(".") { (it.toInt() and 0xFF).toString() }
    }

    class TcpHeader(
        val srcPort: Int,
        val dstPort: Int,
        val seqNum: Long,
        val ackNum: Long,
        val dataOffset: Int,
        val flags: Int,
        val window: Int,
        val headerLength: Int
    ) {
        fun hasSyn() = flags and TCP_SYN != 0
        fun hasAck() = flags and TCP_ACK != 0
        fun hasFin() = flags and TCP_FIN != 0
        fun hasRst() = flags and TCP_RST != 0
        fun hasPsh() = flags and TCP_PSH != 0
    }

    class UdpHeader(
        val srcPort: Int,
        val dstPort: Int,
        val length: Int
    )

    fun parseIp(data: ByteArray, length: Int): IpHeader? {
        if (length < IP_HEADER_MIN) return null
        val version = (data[0].toInt() shr 4) and 0x0F
        if (version != 4) return null

        val ihl = data[0].toInt() and 0x0F
        val headerLength = ihl * 4
        if (length < headerLength) return null

        val totalLength = ((data[2].toInt() and 0xFF) shl 8) or (data[3].toInt() and 0xFF)
        val identification = ((data[4].toInt() and 0xFF) shl 8) or (data[5].toInt() and 0xFF)
        val flagsAndOffset = ((data[6].toInt() and 0xFF) shl 8) or (data[7].toInt() and 0xFF)
        val flags = (flagsAndOffset shr 13) and 0x07
        val fragmentOffset = flagsAndOffset and 0x1FFF
        val ttl = data[8].toInt() and 0xFF
        val protocol = data[9]

        val srcIp = data.copyOfRange(12, 16)
        val dstIp = data.copyOfRange(16, 20)

        return IpHeader(version, ihl, totalLength, identification, flags, fragmentOffset, ttl, protocol, srcIp, dstIp, headerLength)
    }

    fun parseTcp(data: ByteArray, offset: Int, length: Int): TcpHeader? {
        if (length - offset < TCP_HEADER_MIN) return null

        val srcPort = ((data[offset].toInt() and 0xFF) shl 8) or (data[offset + 1].toInt() and 0xFF)
        val dstPort = ((data[offset + 2].toInt() and 0xFF) shl 8) or (data[offset + 3].toInt() and 0xFF)
        val seqNum = ((data[offset + 4].toLong() and 0xFF) shl 24) or
                ((data[offset + 5].toLong() and 0xFF) shl 16) or
                ((data[offset + 6].toLong() and 0xFF) shl 8) or
                (data[offset + 7].toLong() and 0xFF)
        val ackNum = ((data[offset + 8].toLong() and 0xFF) shl 24) or
                ((data[offset + 9].toLong() and 0xFF) shl 16) or
                ((data[offset + 10].toLong() and 0xFF) shl 8) or
                (data[offset + 11].toLong() and 0xFF)
        val dataOffset = (data[offset + 12].toInt() shr 4) and 0x0F
        val headerLength = dataOffset * 4
        val flags = data[offset + 13].toInt() and 0x3F
        val window = ((data[offset + 14].toInt() and 0xFF) shl 8) or (data[offset + 15].toInt() and 0xFF)

        return TcpHeader(srcPort, dstPort, seqNum, ackNum, dataOffset, flags, window, headerLength)
    }

    fun parseUdp(data: ByteArray, offset: Int, length: Int): UdpHeader? {
        if (length - offset < UDP_HEADER_LEN) return null

        val srcPort = ((data[offset].toInt() and 0xFF) shl 8) or (data[offset + 1].toInt() and 0xFF)
        val dstPort = ((data[offset + 2].toInt() and 0xFF) shl 8) or (data[offset + 3].toInt() and 0xFF)
        val udpLen = ((data[offset + 4].toInt() and 0xFF) shl 8) or (data[offset + 5].toInt() and 0xFF)

        return UdpHeader(srcPort, dstPort, udpLen)
    }

    fun ipChecksum(header: ByteArray, offset: Int, length: Int): Short {
        var sum = 0L
        var i = offset
        var remaining = length
        while (remaining > 1) {
            sum += ((header[i].toInt() and 0xFF) shl 8) or (header[i + 1].toInt() and 0xFF)
            i += 2
            remaining -= 2
        }
        if (remaining == 1) {
            sum += (header[i].toInt() and 0xFF) shl 8
        }
        while (sum shr 16 != 0L) {
            sum = (sum and 0xFFFF) + (sum shr 16)
        }
        return (sum.inv() and 0xFFFF).toShort()
    }

    fun transportChecksum(srcIp: ByteArray, dstIp: ByteArray, protocol: Byte, transportData: ByteArray, offset: Int, length: Int): Short {
        var sum = 0L
        for (i in 0 until 4 step 2) {
            sum += ((srcIp[i].toInt() and 0xFF) shl 8) or (srcIp[i + 1].toInt() and 0xFF)
        }
        for (i in 0 until 4 step 2) {
            sum += ((dstIp[i].toInt() and 0xFF) shl 8) or (dstIp[i + 1].toInt() and 0xFF)
        }
        sum += protocol.toInt() and 0xFF
        sum += length

        var i = offset
        var remaining = length
        while (remaining > 1) {
            sum += ((transportData[i].toInt() and 0xFF) shl 8) or (transportData[i + 1].toInt() and 0xFF)
            i += 2
            remaining -= 2
        }
        if (remaining == 1) {
            sum += (transportData[i].toInt() and 0xFF) shl 8
        }
        while (sum shr 16 != 0L) {
            sum = (sum and 0xFFFF) + (sum shr 16)
        }
        return (sum.inv() and 0xFFFF).toShort()
    }

    fun buildTcpPacket(
        srcIp: ByteArray,
        dstIp: ByteArray,
        srcPort: Int,
        dstPort: Int,
        seqNum: Long,
        ackNum: Long,
        flags: Int,
        window: Int,
        payload: ByteArray? = null
    ): ByteArray {
        val payloadLen = payload?.size ?: 0
        val tcpLen = TCP_HEADER_MIN + payloadLen
        val totalLen = IP_HEADER_MIN + tcpLen

        val buf = ByteBuffer.allocate(totalLen)

        buf.put((0x45).toByte())
        buf.put(0)
        buf.putShort(totalLen.toShort())
        buf.putShort(0)
        buf.putShort(0x4000.toShort())
        buf.put(64)
        buf.put(PROTO_TCP)
        buf.putShort(0)
        buf.put(srcIp)
        buf.put(dstIp)

        val ipChecksum = ipChecksum(buf.array(), 0, IP_HEADER_MIN)
        buf.putShort(10, ipChecksum)

        val tcpOffset = IP_HEADER_MIN
        buf.putShort(srcPort.toShort())
        buf.putShort(dstPort.toShort())
        buf.putInt((seqNum and 0xFFFFFFFFL).toInt())
        buf.putInt((ackNum and 0xFFFFFFFFL).toInt())
        buf.put(((TCP_HEADER_MIN / 4) shl 4).toByte())
        buf.put(flags.toByte())
        buf.putShort(window.toShort())
        buf.putShort(0)
        buf.putShort(0)

        if (payload != null && payloadLen > 0) {
            buf.put(payload)
        }

        val tcpChecksum = transportChecksum(srcIp, dstIp, PROTO_TCP, buf.array(), tcpOffset, tcpLen)
        buf.putShort(tcpOffset + 16, tcpChecksum)

        return buf.array()
    }

    fun buildUdpPacket(
        srcIp: ByteArray,
        dstIp: ByteArray,
        srcPort: Int,
        dstPort: Int,
        payload: ByteArray
    ): ByteArray {
        val udpLen = UDP_HEADER_LEN + payload.size
        val totalLen = IP_HEADER_MIN + udpLen

        val buf = ByteBuffer.allocate(totalLen)

        buf.put((0x45).toByte())
        buf.put(0)
        buf.putShort(totalLen.toShort())
        buf.putShort(0)
        buf.putShort(0x4000.toShort())
        buf.put(64)
        buf.put(PROTO_UDP)
        buf.putShort(0)
        buf.put(srcIp)
        buf.put(dstIp)

        val ipChecksum = ipChecksum(buf.array(), 0, IP_HEADER_MIN)
        buf.putShort(10, ipChecksum)

        val udpOffset = IP_HEADER_MIN
        buf.putShort(srcPort.toShort())
        buf.putShort(dstPort.toShort())
        buf.putShort(udpLen.toShort())
        buf.putShort(0)
        buf.put(payload)

        val udpChecksum = transportChecksum(srcIp, dstIp, PROTO_UDP, buf.array(), udpOffset, udpLen)
        buf.putShort(udpOffset + 6, udpChecksum)

        return buf.array()
    }

    fun buildRstPacket(
        srcIp: ByteArray,
        dstIp: ByteArray,
        srcPort: Int,
        dstPort: Int,
        seqNum: Long,
        ackNum: Long
    ): ByteArray {
        return buildTcpPacket(srcIp, dstIp, srcPort, dstPort, seqNum, ackNum, TCP_RST or TCP_ACK, 0)
    }
}
