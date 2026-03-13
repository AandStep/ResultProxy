package com.resultproxymobile

import android.app.Activity
import android.content.Intent
import android.net.VpnService
import android.os.Build
import com.facebook.react.bridge.ActivityEventListener
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableArray

class VpnModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
    override fun getName() = "VpnModule"

    private var pendingProxyHost: String? = null
    private var pendingProxyPort: Int = 14081
    private var pendingAppWhitelist: Array<String> = emptyArray()

    init {
        reactContext.addActivityEventListener(object : ActivityEventListener {
            override fun onActivityResult(activity: Activity, requestCode: Int, resultCode: Int, data: Intent?) {
                if (requestCode == VPN_REQUEST_CODE && resultCode == Activity.RESULT_OK) {
                    launchVpnService()
                }
            }

            override fun onNewIntent(intent: Intent) {}
        })
    }

    @ReactMethod
    fun startVpn(proxyHost: String, proxyPort: Int, appWhitelist: ReadableArray) {
        pendingProxyHost = proxyHost
        pendingProxyPort = proxyPort
        pendingAppWhitelist = Array(appWhitelist.size()) { i -> appWhitelist.getString(i) ?: "" }

        val vpnIntent = VpnService.prepare(reactApplicationContext)
        if (vpnIntent != null) {
            reactApplicationContext.currentActivity?.startActivityForResult(vpnIntent, VPN_REQUEST_CODE)
        } else {
            launchVpnService()
        }
    }

    @ReactMethod
    fun stopVpn() {
        val intent = Intent(reactApplicationContext, ProxyVpnService::class.java).apply {
            action = "STOP"
        }
        reactApplicationContext.startService(intent)
    }

    private fun launchVpnService() {
        val host = pendingProxyHost ?: return
        val intent = Intent(reactApplicationContext, ProxyVpnService::class.java).apply {
            putExtra("proxyHost", host)
            putExtra("proxyPort", pendingProxyPort)
            putExtra("appWhitelist", pendingAppWhitelist)
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            reactApplicationContext.startForegroundService(intent)
        } else {
            reactApplicationContext.startService(intent)
        }
    }

    companion object {
        private const val VPN_REQUEST_CODE = 0x0F
    }
}
