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
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import com.resultv.android.ui.SubscriptionImportPanel
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.resultv.android.ui.AppPickerScreen
import com.resultv.android.vpn.ACTION_START
import com.resultv.android.vpn.ACTION_STOP
import com.resultv.android.vpn.AppRoutingMode
import com.resultv.android.vpn.AppRoutingRepository
import com.resultv.android.vpn.EXTRA_CONFIG_JSON
import com.resultv.android.vpn.Profile
import com.resultv.android.vpn.ProfileRepository
import com.resultv.android.vpn.ResultVpnService
import com.resultv.android.vpn.VpnState
import com.resultv.android.vpn.VpnStatus
import mobile.Mobile
import org.json.JSONObject

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
        ProfileRepository.init(applicationContext)
        AppRoutingRepository.init(applicationContext)
        seedFromBuildConfigIfEmpty()
        setContent {
            MaterialTheme {
                Surface(modifier = Modifier.fillMaxSize()) {
                    var screen by remember { mutableStateOf(Screen.Home) }
                    when (screen) {
                        Screen.Home -> HomeScreen(
                            dataDir = filesDir.absolutePath,
                            onConnect = ::onConnectPressed,
                            onDisconnect = ::onDisconnectPressed,
                            onOpenAppRouting = { screen = Screen.AppRouting },
                        )
                        Screen.AppRouting -> AppPickerScreen(
                            onClose = { screen = Screen.Home },
                        )
                    }
                }
            }
        }
    }

    private enum class Screen { Home, AppRouting }

    /** First-run convenience: if local.properties had a URI, import it once. */
    private fun seedFromBuildConfigIfEmpty() {
        val seed = BuildConfig.VLESS_URI
        if (seed.isBlank()) return
        if (ProfileRepository.state.value.profiles.isNotEmpty()) return
        val name = nameFromUri(seed) ?: "PoC profile"
        ProfileRepository.add(Profile.fromUri(name, seed))
    }

    private fun onConnectPressed() {
        val active = ProfileRepository.state.value.active
        if (active == null) {
            Log.e(TAG, "no active profile")
            return
        }
        val dataDir = filesDir.absolutePath
        val configJson = try {
            when {
                active.entryJson.isNotBlank() ->
                    Mobile.buildSingBoxConfigFromEntry(active.entryJson, dataDir, "8.8.8.8,1.1.1.1")
                active.uri.isNotBlank() ->
                    Mobile.buildSingBoxConfig(active.uri, dataDir, "8.8.8.8,1.1.1.1")
                else -> {
                    Log.e(TAG, "active profile has neither URI nor entry JSON")
                    return
                }
            }
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
        // Optimistic UI: flip status right away so the button reacts on
        // the same frame. The service will repeat the same transition
        // when it processes the intent — that's idempotent.
        VpnState.set(VpnStatus.Idle)
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

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun HomeScreen(
    dataDir: String,
    onConnect: () -> Unit,
    onDisconnect: () -> Unit,
    onOpenAppRouting: () -> Unit,
) {
    val status by VpnState.status.collectAsStateWithLifecycle()
    val profiles by ProfileRepository.state.collectAsStateWithLifecycle()
    val routing by AppRoutingRepository.state.collectAsStateWithLifecycle()
    var addUri by remember { mutableStateOf("") }
    var addError by remember { mutableStateOf<String?>(null) }
    var showSubscriptionSheet by remember { mutableStateOf(false) }
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val focusManager = LocalFocusManager.current
    val keyboard = LocalSoftwareKeyboardController.current

    val tryAdd = tryAdd@{
        val uri = addUri.trim()
        if (uri.isEmpty()) { addError = "URI is empty"; return@tryAdd }
        val name = try {
            Mobile.parseProxyURI(uri)
            nameFromUri(uri) ?: "Profile ${profiles.profiles.size + 1}"
        } catch (t: Throwable) {
            addError = t.message ?: "Invalid URI"
            return@tryAdd
        }
        ProfileRepository.add(Profile.fromUri(name, uri))
        addUri = ""
        addError = null
        keyboard?.hide()
        focusManager.clearFocus()
    }

    Column(
        modifier = Modifier.fillMaxSize().padding(16.dp)
            .pointerInput(Unit) {
                detectTapGestures(onTap = {
                    keyboard?.hide()
                    focusManager.clearFocus()
                })
            },
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text("ResultV", style = MaterialTheme.typography.headlineMedium)

        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("Status: ${statusLabel(status)}", style = MaterialTheme.typography.titleMedium)
            if (status is VpnStatus.Connecting) {
                Spacer(Modifier.width(12.dp))
                CircularProgressIndicator(modifier = Modifier.height(20.dp))
            }
        }

        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Button(
                onClick = onConnect,
                enabled = profiles.active != null &&
                    (status is VpnStatus.Idle || status is VpnStatus.Error),
            ) { Text("Connect") }
            OutlinedButton(
                onClick = onDisconnect,
                enabled = status is VpnStatus.Connecting || status is VpnStatus.Connected,
            ) { Text("Disconnect") }
        }

        TextButton(
            onClick = onOpenAppRouting,
            enabled = status is VpnStatus.Idle || status is VpnStatus.Error,
        ) {
            Text("Per-app routing: ${routingSummary(routing.mode, routing.selectedPackages.size)}")
        }

        Text("Profiles", style = MaterialTheme.typography.titleMedium)

        OutlinedTextField(
            value = addUri,
            onValueChange = { addUri = it; addError = null },
            modifier = Modifier.fillMaxWidth(),
            label = { Text("Paste vless:// / vmess:// / trojan:// / hy2:// / wg:// / awg://") },
            singleLine = true,
            isError = addError != null,
            supportingText = addError?.let { { Text(it) } },
            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
            keyboardActions = KeyboardActions(onDone = { tryAdd() }),
        )
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Button(onClick = tryAdd) { Text("Add") }
            OutlinedButton(onClick = {
                keyboard?.hide()
                focusManager.clearFocus()
                showSubscriptionSheet = true
            }) { Text("From subscription") }
            TextButton(onClick = {
                addUri = ""
                addError = null
                keyboard?.hide()
                focusManager.clearFocus()
            }) { Text("Clear") }
        }

        if (showSubscriptionSheet) {
            ModalBottomSheet(
                onDismissRequest = { showSubscriptionSheet = false },
                sheetState = sheetState,
            ) {
                SubscriptionImportPanel(
                    dataDir = dataDir,
                    onClose = { showSubscriptionSheet = false },
                )
            }
        }

        if (profiles.profiles.isEmpty()) {
            Text(
                "No profiles yet — paste a URI above.",
                style = MaterialTheme.typography.bodySmall,
            )
        } else {
            LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                items(profiles.profiles, key = { it.id }) { p ->
                    ProfileRow(
                        profile = p,
                        isActive = p.id == profiles.activeId,
                        onSelect = { ProfileRepository.setActive(p.id) },
                        onDelete = { ProfileRepository.remove(p.id) },
                    )
                }
            }
        }
    }
}

@Composable
private fun ProfileRow(
    profile: Profile,
    isActive: Boolean,
    onSelect: () -> Unit,
    onDelete: () -> Unit,
) {
    Card(modifier = Modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier.padding(8.dp).fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            RadioButton(selected = isActive, onClick = onSelect)
            Column(modifier = Modifier.weight(1f).padding(horizontal = 4.dp)) {
                Text(profile.name, style = MaterialTheme.typography.titleSmall)
                Text(
                    profile.uri,
                    style = MaterialTheme.typography.bodySmall,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            TextButton(onClick = onDelete) { Text("Delete") }
        }
    }
}

private fun routingSummary(mode: AppRoutingMode, count: Int): String = when (mode) {
    AppRoutingMode.All -> "All apps"
    AppRoutingMode.AllowList -> if (count == 0) "Whitelist (empty)" else "$count whitelisted"
    AppRoutingMode.DisallowList -> if (count == 0) "Blacklist (empty)" else "$count blacklisted"
}

private fun statusLabel(s: VpnStatus): String = when (s) {
    VpnStatus.Idle -> "Idle"
    VpnStatus.Connecting -> "Connecting…"
    VpnStatus.Connected -> "Connected"
    is VpnStatus.Error -> "Error — ${s.message}"
}

/** Best-effort display name from a parsed URI: prefer fragment/name, fall back to host. */
private fun nameFromUri(uri: String): String? = try {
    val parsed = JSONObject(Mobile.parseProxyURI(uri))
    parsed.optString("name").ifBlank { parsed.optString("ip").ifBlank { null } }
} catch (_: Throwable) {
    null
}
