package com.resultv.android.ui.screens

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Bolt
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.ExpandMore
import androidx.compose.material.icons.outlined.Public
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.resultv.android.theme.Brand
import com.resultv.android.ui.components.PowerButton
import com.resultv.android.ui.components.ServerRow
import com.resultv.android.ui.components.StatusHeader
import com.resultv.android.ui.components.flagFromCountry
import com.resultv.android.vpn.Profile
import com.resultv.android.vpn.ProfileRepository
import com.resultv.android.vpn.VpnState
import com.resultv.android.vpn.VpnStatus
import org.json.JSONObject

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HomeScreen(
    onPowerPressed: () -> Unit,
    onOpenProxies: () -> Unit,
    onOpenAdd: () -> Unit,
) {
    val status by VpnState.status.collectAsStateWithLifecycle()
    val profilesState by ProfileRepository.state.collectAsStateWithLifecycle()
    var dropdownOpen by remember { mutableStateOf(false) }

    val active = profilesState.active
    val canConnect = active != null && (status is VpnStatus.Idle || status is VpnStatus.Error)
    val canDisconnect = status is VpnStatus.Connecting || status is VpnStatus.Connected

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 16.dp, vertical = 12.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        StatusHeader(status = status, activeProfileName = active?.name)

        PowerButton(
            status = status,
            enabled = canConnect || canDisconnect,
            onClick = onPowerPressed,
        )

        // Active profile selector — tap to expand inline picker.
        Card(
            shape = RoundedCornerShape(20.dp),
            colors = CardDefaults.cardColors(
                containerColor = if (status is VpnStatus.Connected)
                    Brand.Green.copy(alpha = 0.07f)
                else Brand.Surface,
            ),
            modifier = Modifier
                .fillMaxWidth()
                .border(
                    1.dp,
                    if (status is VpnStatus.Connected) Brand.Green.copy(alpha = 0.45f)
                    else Color.White.copy(alpha = 0.09f),
                    RoundedCornerShape(20.dp),
                ),
        ) {
            ActiveProfileRow(
                active = active,
                connected = status is VpnStatus.Connected,
                expanded = dropdownOpen,
                onToggle = { dropdownOpen = !dropdownOpen },
            )

            AnimatedVisibility(visible = dropdownOpen) {
                ProfileDropdown(
                    profiles = profilesState.profiles,
                    activeId = profilesState.activeId,
                    onSelect = {
                        ProfileRepository.setActive(it.id)
                        dropdownOpen = false
                    },
                    onSeeAll = {
                        dropdownOpen = false
                        onOpenProxies()
                    },
                )
            }
        }

        // Promo / add-server entry only when idle.
        if (status is VpnStatus.Idle || status is VpnStatus.Error) {
            AddProfileShortcut(onClick = onOpenAdd)
        }
    }
}

@Composable
private fun ActiveProfileRow(
    active: Profile?,
    connected: Boolean,
    expanded: Boolean,
    onToggle: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onToggle)
            .padding(horizontal = 14.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Box(
            modifier = Modifier
                .size(42.dp)
                .clip(RoundedCornerShape(11.dp))
                .background(
                    if (connected) Brand.Green.copy(alpha = 0.18f)
                    else Color.White.copy(alpha = 0.07f)
                ),
            contentAlignment = Alignment.Center,
        ) {
            val country = active?.let { profileCountry(it) }
            val isAuto = active?.let { profileIsAuto(it) } ?: false
            when {
                active == null -> Icon(
                    imageVector = Icons.Outlined.Public,
                    contentDescription = null,
                    tint = Brand.SecondaryText,
                )
                isAuto -> Icon(
                    imageVector = Icons.Filled.Bolt,
                    contentDescription = null,
                    tint = Brand.GreenLight,
                )
                country != null -> Text(text = flagFromCountry(country), style = MaterialTheme.typography.titleLarge)
                else -> Icon(
                    imageVector = Icons.Outlined.Public,
                    contentDescription = null,
                    tint = Brand.SecondaryText,
                )
            }
        }

        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = "CURRENT SERVER",
                style = MaterialTheme.typography.labelSmall,
                color = Brand.MutedText,
            )
            Text(
                text = active?.name ?: "No profile selected",
                style = MaterialTheme.typography.titleSmall,
                color = if (connected) Brand.GreenLight else MaterialTheme.colorScheme.onBackground,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }

        Icon(
            imageVector = Icons.Outlined.ExpandMore,
            contentDescription = if (expanded) "Collapse" else "Expand",
            tint = Brand.SecondaryText,
        )
    }
}

@Composable
private fun ProfileDropdown(
    profiles: List<Profile>,
    activeId: String?,
    onSelect: (Profile) -> Unit,
    onSeeAll: () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(Color.Black.copy(alpha = 0.30f))
            .padding(8.dp),
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        if (profiles.isEmpty()) {
            Text(
                text = "No profiles yet — add one to get started.",
                style = MaterialTheme.typography.bodySmall,
                color = Brand.MutedText,
                modifier = Modifier.padding(8.dp),
            )
        } else {
            // Cap the inline list; tapping "See all" jumps to Proxies tab.
            val visible = profiles.take(6)
            LazyColumn(
                modifier = Modifier.heightIn(max = 280.dp),
                verticalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                items(visible, key = { it.id }) { p ->
                    ServerRow(
                        name = p.name,
                        subtitle = profileSubtitle(p),
                        countryCode = profileCountry(p),
                        isAuto = profileIsAuto(p),
                        isActive = p.id == activeId,
                        isFavorite = false,
                        onClick = { onSelect(p) },
                    )
                }
            }
        }

        if (profiles.size > 6) {
            Text(
                text = "View all ${profiles.size} profiles",
                style = MaterialTheme.typography.labelMedium,
                color = Brand.SecondaryText,
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable(onClick = onSeeAll)
                    .padding(8.dp),
            )
        }
    }
}

@Composable
private fun AddProfileShortcut(onClick: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(20.dp))
            .clickable(onClick = onClick)
            .border(
                1.dp,
                Color.White.copy(alpha = 0.12f),
                RoundedCornerShape(20.dp),
            )
            .background(Color.White.copy(alpha = 0.02f))
            .padding(horizontal = 14.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Box(
            modifier = Modifier
                .size(38.dp)
                .clip(RoundedCornerShape(11.dp))
                .background(Color.White.copy(alpha = 0.07f)),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector = Icons.Outlined.Add,
                contentDescription = null,
                tint = Brand.SecondaryText,
            )
        }
        Column {
            Text("Add server", style = MaterialTheme.typography.titleSmall)
            Text(
                "Paste link or subscription URL",
                style = MaterialTheme.typography.bodySmall,
                color = Brand.MutedText,
            )
        }
    }
}

// ───────────────────────── Profile field helpers ──────────────────────────

/** Best-effort country code from a profile's parsed entry JSON. */
internal fun profileCountry(p: Profile): String? {
    val src = p.entryJson.ifBlank { return null }
    return runCatching {
        val o = JSONObject(src)
        o.optString("country").takeIf { it.length == 2 }
    }.getOrNull()
}

internal fun profileIsAuto(p: Profile): Boolean {
    val src = p.entryJson.ifBlank { return false }
    return runCatching {
        JSONObject(src).optString("type").equals("AUTO", ignoreCase = true)
    }.getOrDefault(false)
}

internal fun profileSubtitle(p: Profile): String {
    if (p.uri.isNotBlank()) {
        // Trim long URIs into "vless://… host"
        val short = p.uri.substringBefore("?").take(64)
        return short
    }
    val src = p.entryJson
    if (src.isBlank()) return ""
    return runCatching {
        val o = JSONObject(src)
        val type = o.optString("type")
        val ip = o.optString("ip")
        val port = o.optInt("port")
        listOfNotNull(
            type.takeIf { it.isNotBlank() },
            "$ip:$port".takeIf { ip.isNotBlank() }
        ).joinToString("  ·  ")
    }.getOrDefault("")
}
