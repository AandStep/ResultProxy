package com.resultv.android.ui.screens

import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.Check
import androidx.compose.material.icons.outlined.CloudDownload
import androidx.compose.material.icons.outlined.Link
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.resultv.android.theme.Brand
import com.resultv.android.vpn.Profile
import com.resultv.android.vpn.ProfileRepository
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import mobile.Mobile
import org.json.JSONArray
import org.json.JSONObject

private enum class AddMode { Paste, Subscription }

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AddScreen(
    dataDir: String,
    onDone: () -> Unit,
) {
    var mode by remember { mutableStateOf(AddMode.Paste) }
    val focusManager = LocalFocusManager.current
    val keyboard = LocalSoftwareKeyboardController.current

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .pointerInput(Unit) {
                detectTapGestures(onTap = {
                    keyboard?.hide()
                    focusManager.clearFocus()
                })
            }
            .padding(horizontal = 16.dp, vertical = 12.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        SingleChoiceSegmentedButtonRow(modifier = Modifier.fillMaxWidth()) {
            AddMode.entries.forEachIndexed { i, m ->
                SegmentedButton(
                    selected = mode == m,
                    onClick = { mode = m },
                    shape = SegmentedButtonDefaults.itemShape(i, AddMode.entries.size),
                ) {
                    Text(
                        text = when (m) {
                            AddMode.Paste -> "Paste link"
                            AddMode.Subscription -> "Subscription"
                        },
                    )
                }
            }
        }

        when (mode) {
            AddMode.Paste -> PastePane(onDone = onDone)
            AddMode.Subscription -> SubscriptionPane(dataDir = dataDir, onDone = onDone)
        }
    }
}

// ──────────────────────────── Paste pane ────────────────────────────

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun PastePane(onDone: () -> Unit) {
    var uri by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }
    val focusManager = LocalFocusManager.current
    val keyboard = LocalSoftwareKeyboardController.current

    val tryAdd = tryAdd@{
        val trimmed = uri.trim()
        if (trimmed.isEmpty()) { error = "URI is empty"; return@tryAdd }
        val name = try {
            Mobile.parseProxyURI(trimmed)
            nameFromUri(trimmed) ?: "Profile"
        } catch (t: Throwable) {
            error = t.message ?: "Invalid URI"
            return@tryAdd
        }
        ProfileRepository.add(Profile.fromUri(name, trimmed))
        keyboard?.hide()
        focusManager.clearFocus()
        onDone()
    }

    Card(
        shape = androidx.compose.foundation.shape.RoundedCornerShape(20.dp),
        colors = CardDefaults.cardColors(containerColor = Brand.Surface),
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text(
                "Share link",
                style = MaterialTheme.typography.labelLarge,
                color = Brand.SecondaryText,
            )
            OutlinedTextField(
                value = uri,
                onValueChange = { uri = it; error = null },
                modifier = Modifier.fillMaxWidth(),
                placeholder = { Text("vless:// vmess:// trojan:// hy2:// …") },
                isError = error != null,
                supportingText = error?.let { { Text(it) } },
                singleLine = true,
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
                keyboardActions = KeyboardActions(onDone = { tryAdd() }),
            )
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                FilledTonalButton(onClick = tryAdd) {
                    Icon(Icons.Outlined.Add, contentDescription = null)
                    Spacer(Modifier.width(8.dp))
                    Text("Add")
                }
                TextButton(onClick = {
                    uri = ""; error = null
                    keyboard?.hide(); focusManager.clearFocus()
                }) { Text("Clear") }
            }
        }
    }
}

// ──────────────────────────── Subscription pane ─────────────────────

private data class FetchedEntry(
    val key: String,
    val name: String,
    val uri: String,
    val entryJson: String,
    val preview: String,
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun SubscriptionPane(dataDir: String, onDone: () -> Unit) {
    var url by remember { mutableStateOf("") }
    var loading by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var fetched by remember { mutableStateOf<List<FetchedEntry>>(emptyList()) }
    val selected = remember { mutableStateOf(setOf<String>()) }
    val scope = rememberCoroutineScope()
    val focusManager = LocalFocusManager.current
    val keyboard = LocalSoftwareKeyboardController.current

    LaunchedEffect(fetched) { selected.value = fetched.map { it.key }.toSet() }

    val triggerFetch: () -> Unit = {
        if (!loading && url.isNotBlank()) {
            keyboard?.hide(); focusManager.clearFocus()
            doFetch(scope, url, dataDir,
                onLoad = { loading = it },
                onError = { error = it; fetched = emptyList() },
                onResult = { fetched = it; error = null },
            )
        }
    }

    Card(
        shape = androidx.compose.foundation.shape.RoundedCornerShape(20.dp),
        colors = CardDefaults.cardColors(containerColor = Brand.Surface),
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text(
                "Subscription URL",
                style = MaterialTheme.typography.labelLarge,
                color = Brand.SecondaryText,
            )
            OutlinedTextField(
                value = url,
                onValueChange = { url = it; error = null },
                modifier = Modifier.fillMaxWidth(),
                placeholder = { Text("https://example.com/sub/…") },
                singleLine = true,
                isError = error != null,
                supportingText = error?.let { { Text(it) } },
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
                keyboardActions = KeyboardActions(onDone = { triggerFetch() }),
                leadingIcon = { Icon(Icons.Outlined.Link, contentDescription = null) },
            )
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                FilledTonalButton(
                    onClick = triggerFetch,
                    enabled = !loading && url.isNotBlank(),
                ) {
                    Icon(Icons.Outlined.CloudDownload, contentDescription = null)
                    Spacer(Modifier.width(8.dp))
                    Text(if (loading) "Fetching…" else "Fetch")
                }
                if (loading) {
                    CircularProgressIndicator(
                        modifier = Modifier.heightIn(max = 18.dp).width(18.dp),
                        strokeWidth = 2.dp,
                    )
                }
            }

            if (fetched.isNotEmpty()) {
                Text(
                    text = "${selected.value.size} of ${fetched.size} selected",
                    style = MaterialTheme.typography.bodySmall,
                    color = Brand.SecondaryText,
                )
                LazyColumn(
                    modifier = Modifier.heightIn(max = 360.dp),
                    verticalArrangement = Arrangement.spacedBy(2.dp),
                ) {
                    items(fetched, key = { it.key }) { e ->
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            val checked = e.key in selected.value
                            Checkbox(
                                checked = checked,
                                onCheckedChange = { now ->
                                    selected.value = if (now) selected.value + e.key
                                    else selected.value - e.key
                                },
                            )
                            Column(modifier = Modifier.padding(start = 4.dp)) {
                                Text(
                                    e.name,
                                    style = MaterialTheme.typography.bodyMedium,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis,
                                )
                                Text(
                                    e.preview,
                                    style = MaterialTheme.typography.bodySmall,
                                    color = Brand.MutedText,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis,
                                )
                            }
                        }
                    }
                }

                FilledTonalButton(
                    enabled = selected.value.isNotEmpty(),
                    onClick = {
                        fetched.filter { it.key in selected.value }.forEach { e ->
                            val p = if (e.uri.isNotBlank()) Profile.fromUri(e.name, e.uri)
                            else Profile.fromEntryJson(e.name, e.entryJson)
                            ProfileRepository.add(p)
                        }
                        onDone()
                    },
                ) {
                    Icon(Icons.Outlined.Check, contentDescription = null)
                    Spacer(Modifier.width(8.dp))
                    Text("Import ${selected.value.size}")
                }
            }
        }
    }
}

private fun doFetch(
    scope: CoroutineScope,
    url: String,
    dataDir: String,
    onLoad: (Boolean) -> Unit,
    onError: (String) -> Unit,
    onResult: (List<FetchedEntry>) -> Unit,
) {
    scope.launch {
        onLoad(true)
        try {
            val json = withContext(Dispatchers.IO) { Mobile.fetchSubscription(url.trim(), dataDir) }
            val arr = JSONArray(json)
            val list = (0 until arr.length()).map { i ->
                val o = arr.getJSONObject(i)
                val uri = o.optString("uri")
                val ip = o.optString("ip")
                val port = o.optInt("port")
                val type = o.optString("type")
                val name = o.optString("name")
                    .ifBlank { ip }
                    .ifBlank { "Profile ${i + 1}" }
                val preview = if (uri.isNotBlank()) uri
                else listOf(type, "$ip:$port").filter { it.isNotBlank() }.joinToString("  ·  ")
                val key = uri.ifBlank { "$type|$ip|$port|$i" }
                FetchedEntry(key, name, uri, o.toString(), preview)
            }
            onResult(list)
        } catch (t: Throwable) {
            onError(t.message ?: t.javaClass.simpleName)
        } finally {
            onLoad(false)
        }
    }
}

private fun nameFromUri(uri: String): String? = runCatching {
    val parsed = JSONObject(Mobile.parseProxyURI(uri))
    parsed.optString("name").ifBlank { parsed.optString("ip").ifBlank { null } }
}.getOrNull()
