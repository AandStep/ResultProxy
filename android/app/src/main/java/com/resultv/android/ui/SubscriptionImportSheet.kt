package com.resultv.android.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
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
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.resultv.android.vpn.Profile
import com.resultv.android.vpn.ProfileRepository
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import mobile.Mobile
import org.json.JSONArray

private data class FetchedEntry(
    val key: String,        // unique handle for selection (uri if present, else type+ip+port)
    val name: String,
    val uri: String,        // empty when entry came from JSON-only Xray subscription
    val entryJson: String,  // full ProxyEntry JSON for non-URI imports
    val preview: String,    // human-readable line under the name
)

@Composable
fun SubscriptionImportPanel(
    dataDir: String,
    onClose: () -> Unit,
) {
    var url by remember { mutableStateOf("") }
    var loading by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var fetched by remember { mutableStateOf<List<FetchedEntry>>(emptyList()) }
    val selected = remember { mutableStateOf(setOf<String>()) }
    val scope = rememberCoroutineScope()

    LaunchedEffect(fetched) {
        // Default to selecting everything fresh after a fetch.
        selected.value = fetched.map { it.key }.toSet()
    }

    Column(
        modifier = Modifier.fillMaxWidth().padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text("Import from subscription", style = MaterialTheme.typography.titleLarge)

        OutlinedTextField(
            value = url,
            onValueChange = { url = it; error = null },
            modifier = Modifier.fillMaxWidth(),
            label = { Text("Subscription URL") },
            singleLine = true,
            isError = error != null,
            supportingText = error?.let { { Text(it) } },
            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
            keyboardActions = KeyboardActions(onDone = {
                if (!loading && url.isNotBlank()) {
                    triggerFetch(scope, url, dataDir, onLoad = { loading = it },
                        onError = { error = it; fetched = emptyList() },
                        onResult = { fetched = it; error = null })
                }
            }),
        )

        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Button(
                enabled = !loading && url.isNotBlank(),
                onClick = {
                    triggerFetch(scope, url, dataDir, onLoad = { loading = it },
                        onError = { error = it; fetched = emptyList() },
                        onResult = { fetched = it; error = null })
                },
            ) { Text(if (loading) "Fetching…" else "Fetch") }
            if (loading) {
                Spacer(Modifier.width(8.dp))
                CircularProgressIndicator(modifier = Modifier.heightIn(max = 20.dp))
            }
        }

        if (fetched.isNotEmpty()) {
            Text(
                "${selected.value.size} of ${fetched.size} selected",
                style = MaterialTheme.typography.bodyMedium,
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
                                style = MaterialTheme.typography.bodyLarge,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                            Text(
                                e.preview,
                                style = MaterialTheme.typography.bodySmall,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                        }
                    }
                }
            }
        }

        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Button(
                enabled = selected.value.isNotEmpty(),
                onClick = {
                    fetched.filter { it.key in selected.value }.forEach { e ->
                        val p = if (e.uri.isNotBlank()) Profile.fromUri(e.name, e.uri)
                        else Profile.fromEntryJson(e.name, e.entryJson)
                        ProfileRepository.add(p)
                    }
                    onClose()
                },
            ) { Text("Import ${selected.value.size}") }
            OutlinedButton(onClick = onClose) { Text("Cancel") }
        }
    }
}

private fun triggerFetch(
    scope: kotlinx.coroutines.CoroutineScope,
    url: String,
    dataDir: String,
    onLoad: (Boolean) -> Unit,
    onError: (String) -> Unit,
    onResult: (List<FetchedEntry>) -> Unit,
) {
    scope.launch {
        onLoad(true)
        try {
            val json = withContext(Dispatchers.IO) {
                Mobile.fetchSubscription(url.trim(), dataDir)
            }
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
                else listOf(type, "$ip:$port").filter { it.isNotBlank() }.joinToString("  ")
                val key = uri.ifBlank { "$type|$ip|$port|$i" }
                FetchedEntry(
                    key = key,
                    name = name,
                    uri = uri,
                    entryJson = o.toString(),
                    preview = preview,
                )
            }
            onResult(list)
        } catch (t: Throwable) {
            onError(t.message ?: t.javaClass.simpleName)
        } finally {
            onLoad(false)
        }
    }
}

