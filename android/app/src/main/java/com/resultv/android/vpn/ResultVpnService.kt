package com.resultv.android.vpn

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Intent
import android.net.VpnService
import android.os.Build
import android.os.ParcelFileDescriptor
import android.util.Log
import com.resultv.android.MainActivity
import com.resultv.android.R

private const val TAG = "ResultV/Service"
private const val CHANNEL_ID = "resultv_vpn"
private const val NOTIFICATION_ID = 1

const val ACTION_START = "com.resultv.android.START"
const val ACTION_STOP = "com.resultv.android.STOP"
const val EXTRA_CONFIG_JSON = "configJson"

/**
 * VpnService host. The actual sing-box engine runs inside libbox via
 * BoxModule. This service exists only so Android trusts us with
 * VpnService.Builder and so the engine can outlive the UI process.
 */
class ResultVpnService : VpnService() {

    // Owned by the service so we can close the fd when the user hits
    // Disconnect — without this, the kernel keeps the tun alive and
    // Android keeps showing the VPN key icon even after sing-box is dead.
    @Volatile var tunPfd: ParcelFileDescriptor? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_STOP -> {
                Log.i(TAG, "received STOP")
                BoxModule.stop()
                closeTun()
                stopForeground(STOP_FOREGROUND_REMOVE)
                stopSelf()
                return START_NOT_STICKY
            }
            else -> {
                val config = intent?.getStringExtra(EXTRA_CONFIG_JSON)
                if (config.isNullOrEmpty()) {
                    Log.e(TAG, "no config JSON in intent — stopping")
                    stopSelf()
                    return START_NOT_STICKY
                }
                startForeground(NOTIFICATION_ID, buildNotification())
                try {
                    BoxModule.start(this, config)
                } catch (t: Throwable) {
                    Log.e(TAG, "BoxModule.start failed", t)
                    stopForeground(STOP_FOREGROUND_REMOVE)
                    stopSelf()
                    return START_NOT_STICKY
                }
                return START_STICKY
            }
        }
    }

    override fun onRevoke() {
        Log.i(TAG, "VPN permission revoked")
        BoxModule.stop()
        closeTun()
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    override fun onDestroy() {
        BoxModule.stop()
        closeTun()
        super.onDestroy()
    }

    private fun closeTun() {
        val pfd = tunPfd ?: return
        tunPfd = null
        try {
            pfd.close()
        } catch (t: Throwable) {
            Log.w(TAG, "tun pfd close threw", t)
        }
    }

    private fun buildNotification(): Notification {
        val nm = getSystemService(NotificationManager::class.java)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val ch = NotificationChannel(
                CHANNEL_ID,
                "VPN status",
                NotificationManager.IMPORTANCE_LOW,
            )
            nm.createNotificationChannel(ch)
        }
        val openApp = PendingIntent.getActivity(
            this, 0,
            Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_IMMUTABLE,
        )
        return Notification.Builder(this, CHANNEL_ID)
            .setContentTitle(getString(R.string.app_name))
            .setContentText("VPN running")
            .setSmallIcon(android.R.drawable.ic_lock_lock)
            .setContentIntent(openApp)
            .setOngoing(true)
            .build()
    }
}
