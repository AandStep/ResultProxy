package com.resultv.android

import android.content.Intent
import android.net.VpnService
import android.os.Bundle
import android.util.Log
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.resultv.android.vpn.ACTION_START
import com.resultv.android.vpn.ACTION_STOP
import com.resultv.android.vpn.EXTRA_CONFIG_JSON
import com.resultv.android.vpn.ResultVpnService
import mobile.Mobile

private const val TAG = "ResultV/UI"

class MainActivity : ComponentActivity() {

    private var pendingConfig: String? = null

    private val vpnPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult(),
    ) { result ->
        if (result.resultCode == RESULT_OK) {
            val cfg = pendingConfig
            pendingConfig = null
            if (cfg != null) startService(cfg)
        } else {
            Log.w(TAG, "VPN permission denied (resultCode=${result.resultCode})")
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            MaterialTheme {
                Surface(modifier = Modifier.fillMaxSize()) {
                    PocScreen(
                        onConnect = ::onConnectPressed,
                        onDisconnect = ::onDisconnectPressed,
                    )
                }
            }
        }
    }

    private fun onConnectPressed() {
        val uri = BuildConfig.VLESS_URI
        if (uri.isBlank()) {
            Log.e(TAG, "VLESS_URI not configured in local.properties")
            return
        }
        val configJson = try {
            Mobile.buildSingBoxConfig(uri, filesDir.absolutePath, "8.8.8.8,1.1.1.1")
        } catch (t: Throwable) {
            Log.e(TAG, "buildSingBoxConfig failed", t)
            return
        }

        val prepareIntent = VpnService.prepare(this)
        if (prepareIntent != null) {
            pendingConfig = configJson
            vpnPermissionLauncher.launch(prepareIntent)
        } else {
            startService(configJson)
        }
    }

    private fun onDisconnectPressed() {
        val intent = Intent(this, ResultVpnService::class.java).apply {
            action = ACTION_STOP
        }
        startService(intent)
    }

    private fun startService(configJson: String) {
        val intent = Intent(this, ResultVpnService::class.java).apply {
            action = ACTION_START
            putExtra(EXTRA_CONFIG_JSON, configJson)
        }
        startForegroundService(intent)
    }
}

@Composable
private fun PocScreen(
    onConnect: () -> Unit,
    onDisconnect: () -> Unit,
) {
    var version by remember { mutableStateOf("(not loaded)") }
    var parsed by remember { mutableStateOf("") }

    Column(
        modifier = Modifier.fillMaxSize().padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp, Alignment.CenterVertically),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text("ResultV PoC", style = MaterialTheme.typography.headlineMedium)
        Text("libbox version: $version")

        Button(onClick = {
            version = try { Mobile.version() } catch (t: Throwable) { "ERR: ${t.message}" }
        }) { Text("Load libbox.version()") }

        Button(onClick = {
            parsed = try {
                Mobile.parseProxyURI(BuildConfig.VLESS_URI.ifBlank {
                    "vless://uuid@example.com:443?type=tcp&security=tls#poc"
                })
            } catch (t: Throwable) { "ERR: ${t.message}" }
        }) { Text("Parse VLESS URI") }

        Button(onClick = onConnect) { Text("Connect VPN") }
        Button(onClick = onDisconnect) { Text("Disconnect") }

        if (parsed.isNotEmpty()) {
            Text("parsed: $parsed", style = MaterialTheme.typography.bodySmall)
        }
    }
}
