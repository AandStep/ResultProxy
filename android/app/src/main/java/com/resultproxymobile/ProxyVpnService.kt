package com.resultproxymobile

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Intent
import android.net.VpnService
import android.os.Build
import android.os.ParcelFileDescriptor
import android.util.Log
import com.resultproxymobile.tun2http.Tun2HttpEngine

class ProxyVpnService : VpnService() {
    private var vpnInterface: ParcelFileDescriptor? = null
    private var engine: Tun2HttpEngine? = null

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == "STOP") {
            stopVpn()
            return START_NOT_STICKY
        }

        val proxyHost = intent?.getStringExtra("proxyHost") ?: "10.0.2.2"
        val proxyPort = intent?.getIntExtra("proxyPort", 14081) ?: 14081
        val appWhitelist = intent?.getStringArrayExtra("appWhitelist") ?: emptyArray()

        startForegroundNotification()
        startVpn(proxyHost, proxyPort, appWhitelist)
        return START_STICKY
    }

    private fun startVpn(proxyHost: String, proxyPort: Int, appWhitelist: Array<String>) {
        try {
            stopVpnEngine()

            val builder = Builder()
                .setSession("ResultProxy")
                .addAddress("10.0.0.2", 32)
                .addRoute("0.0.0.0", 0)
                .addDnsServer("8.8.8.8")
                .addDnsServer("8.8.4.4")
                .setMtu(1500)
                .setBlocking(true)

            try {
                builder.addDisallowedApplication(packageName)
            } catch (e: Exception) {
                Log.e(TAG, "Failed to exclude own package: ${e.message}")
            }

            if (appWhitelist.isNotEmpty()) {
                for (pkg in appWhitelist) {
                    try {
                        builder.addAllowedApplication(pkg)
                    } catch (e: Exception) {
                        Log.e(TAG, "Failed to add app $pkg: ${e.message}")
                    }
                }
            }

            vpnInterface = builder.establish()
            if (vpnInterface == null) {
                Log.e(TAG, "VPN interface is null — permission not granted?")
                return
            }

            Log.i(TAG, "VPN interface established. Starting tun2http engine → $proxyHost:$proxyPort")

            engine = Tun2HttpEngine(vpnInterface!!, proxyHost, proxyPort, this)
            engine?.start()

        } catch (e: Exception) {
            Log.e(TAG, "Failed to start VPN: ${e.message}")
        }
    }

    private fun stopVpnEngine() {
        engine?.stop()
        engine = null
    }

    private fun stopVpn() {
        stopVpnEngine()
        vpnInterface?.close()
        vpnInterface = null
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "VPN Service",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "ResultProxy VPN connection"
                setShowBadge(false)
            }
            val nm = getSystemService(NotificationManager::class.java)
            nm.createNotificationChannel(channel)
        }
    }

    private fun startForegroundNotification() {
        val notification = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Notification.Builder(this, CHANNEL_ID)
                .setContentTitle("ResultProxy")
                .setContentText("VPN активен")
                .setSmallIcon(android.R.drawable.ic_lock_lock)
                .setOngoing(true)
                .build()
        } else {
            @Suppress("DEPRECATION")
            Notification.Builder(this)
                .setContentTitle("ResultProxy")
                .setContentText("VPN активен")
                .setSmallIcon(android.R.drawable.ic_lock_lock)
                .setOngoing(true)
                .build()
        }
        startForeground(NOTIFICATION_ID, notification)
    }

    override fun onDestroy() {
        stopVpn()
        super.onDestroy()
    }

    companion object {
        private const val TAG = "ProxyVpnService"
        private const val CHANNEL_ID = "vpn_channel"
        private const val NOTIFICATION_ID = 1
    }
}
