package com.resultv.android.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.DeleteOutline
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.resultv.android.R
import com.resultv.android.theme.Brand
import com.resultv.android.ui.components.ServerRow
import com.resultv.android.vpn.Profile
import com.resultv.android.vpn.ProfileRepository

@Composable
fun ProxiesScreen(onAddPressed: () -> Unit) {
    val state by ProfileRepository.state.collectAsStateWithLifecycle()
    var pendingDelete by remember { mutableStateOf<Profile?>(null) }

    Column(modifier = Modifier.fillMaxSize().padding(horizontal = 16.dp, vertical = 12.dp)) {
        if (state.profiles.isEmpty()) {
            EmptyState(onAddPressed)
            return@Column
        }

        Text(
            text = stringResource(R.string.proxies_count, state.profiles.size),
            style = MaterialTheme.typography.labelLarge,
            color = Brand.SecondaryText,
            modifier = Modifier.padding(bottom = 8.dp),
        )

        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            verticalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            items(state.profiles, key = { it.id }) { p ->
                ServerRow(
                    name = p.name,
                    subtitle = profileSubtitle(p),
                    countryCode = profileCountry(p),
                    isAuto = profileIsAuto(p),
                    isActive = p.id == state.activeId,
                    isFavorite = false,
                    onClick = { ProfileRepository.setActive(p.id) },
                    latencyMs = mockLatencyMs(p.id),
                    trailing = {
                        IconButton(
                            onClick = { pendingDelete = p },
                            modifier = Modifier.height(28.dp),
                        ) {
                            Icon(
                                imageVector = Icons.Outlined.DeleteOutline,
                                contentDescription = stringResource(R.string.proxies_delete_cd),
                                tint = Brand.MutedText,
                            )
                        }
                    },
                )
            }
        }
    }

    val target = pendingDelete
    if (target != null) {
        AlertDialog(
            onDismissRequest = { pendingDelete = null },
            title = { Text(stringResource(R.string.proxies_delete_title)) },
            text = { Text(stringResource(R.string.proxies_delete_message, target.name), color = Brand.SecondaryText) },
            confirmButton = {
                TextButton(onClick = {
                    ProfileRepository.remove(target.id)
                    pendingDelete = null
                }) { Text(stringResource(R.string.action_delete), color = Brand.Danger) }
            },
            dismissButton = {
                TextButton(onClick = { pendingDelete = null }) { Text(stringResource(R.string.action_cancel)) }
            },
        )
    }
}

@Composable
private fun EmptyState(onAddPressed: () -> Unit) {
    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text(
                stringResource(R.string.proxies_empty_title),
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.SemiBold,
            )
            Text(
                stringResource(R.string.proxies_empty_subtitle),
                style = MaterialTheme.typography.bodyMedium,
                color = Brand.SecondaryText,
            )
            Spacer(Modifier.height(4.dp))
            FilledTonalButton(onClick = onAddPressed) {
                Icon(Icons.Outlined.Add, contentDescription = null)
                Spacer(Modifier.fillMaxWidth(0.05f))
                Text(stringResource(R.string.home_add_server))
            }
        }
    }
}
