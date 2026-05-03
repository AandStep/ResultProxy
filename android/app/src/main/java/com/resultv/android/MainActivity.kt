package com.resultv.android

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
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
import mobile.Mobile

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            MaterialTheme {
                Surface(modifier = Modifier.fillMaxSize()) {
                    PocScreen()
                }
            }
        }
    }
}

@Composable
private fun PocScreen() {
    var version by remember { mutableStateOf("(not loaded)") }
    var parsed by remember { mutableStateOf("") }

    Column(
        modifier = Modifier.fillMaxSize().padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp, Alignment.CenterVertically),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text("ResultV PoC", style = MaterialTheme.typography.headlineMedium)
        Text("libbox version: $version")

        Button(onClick = {
            version = try {
                Mobile.version()
            } catch (t: Throwable) {
                "ERR: ${t.message}"
            }
        }) {
            Text("Load libbox.version()")
        }

        Button(onClick = {
            parsed = try {
                // Throwaway URI just to exercise the JNI round-trip and
                // confirm the Go-side parser is reachable from the APK.
                Mobile.parseProxyURI("vless://uuid@example.com:443?type=tcp&security=tls#poc")
            } catch (t: Throwable) {
                "ERR: ${t.message}"
            }
        }) {
            Text("Parse sample VLESS URI")
        }

        if (parsed.isNotEmpty()) {
            Text("parsed: $parsed", style = MaterialTheme.typography.bodySmall)
        }
    }
}
