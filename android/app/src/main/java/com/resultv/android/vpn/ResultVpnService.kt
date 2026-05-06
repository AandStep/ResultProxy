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
import java.util.concurrent.Executors

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

    @Volatile var tunPfd: ParcelFileDescriptor? = null

    // libbox start/stop is synchronous and blocks (DNS, REALITY handshake,
    // tun setup) — keep it off the main thread to avoid ANR on Connect.
    private val worker = Executors.newSingleThreadExecutor { r ->
        Thread(r, "ResultV-Box").apply { isDaemon = true }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_STOP -> {
                Log.i(TAG, "received STOP")
                // Close the tun fd up front — this drops the system VPN
                // lock icon immediately. libbox.closeService() takes a
                // couple of seconds to drain connections, so push it to
                // the worker and let the user see Idle right away.
                closeTun()
                VpnState.set(VpnStatus.Idle)
                stopForeground(STOP_FOREGROUND_REMOVE)
                worker.execute { BoxModule.stop() }
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
                VpnState.set(VpnStatus.Connecting)
                startForeground(NOTIFICATION_ID, buildNotification(VpnStatus.Connecting))
                worker.execute {
                    try {
                        BoxModule.start(this, config)
                        VpnState.set(VpnStatus.Connected)
                        renotify(buildNotification(VpnStatus.Connected))
                    } catch (t: Throwable) {
                        Log.e(TAG, "BoxModule.start failed", t)
                        VpnState.set(VpnStatus.Error(t.message ?: t.javaClass.simpleName))
                        closeTun()
                        stopForeground(STOP_FOREGROUND_REMOVE)
                        stopSelf()
                    }
                }
                return START_STICKY
            }
        }
    }

    override fun onRevoke() {
        Log.i(TAG, "VPN permission revoked")
        closeTun()
        VpnState.set(VpnStatus.Idle)
        stopForeground(STOP_FOREGROUND_REMOVE)
        worker.execute { BoxModule.stop() }
        stopSelf()
    }

    override fun onDestroy() {
        closeTun()
        VpnState.set(VpnStatus.Idle)
        worker.execute { BoxModule.stop() }
        worker.shutdown()
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

    private fun renotify(n: Notification) {
        getSystemService(NotificationManager::class.java).notify(NOTIFICATION_ID, n)
    }

    private fun buildNotification(status: VpnStatus): Notification {
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
        val stopIntent = PendingIntent.getService(
            this, 1,
            Intent(this, ResultVpnService::class.java).apply { action = ACTION_STOP },
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        val text = when (status) {
            VpnStatus.Connecting -> "Connecting…"
            VpnStatus.Connected -> "Connected"
            VpnStatus.Idle -> "Idle"
            is VpnStatus.Error -> "Error: ${status.message}"
        }
        return Notification.Builder(this, CHANNEL_ID)
            .setContentTitle(getString(R.string.app_name))
            .setContentText(text)
            .setSmallIcon(android.R.drawable.ic_lock_lock)
            .setContentIntent(openApp)
            .setOngoing(true)
            .addAction(
                Notification.Action.Builder(null, "Disconnect", stopIntent).build()
            )
            .build()
    }
}
