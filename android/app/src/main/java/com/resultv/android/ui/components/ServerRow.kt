package com.resultv.android.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Bolt
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.outlined.Public
import androidx.compose.material.icons.outlined.StarBorder
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.resultv.android.theme.Brand

/**
 * Server / profile row used by Home selector and Proxies list. Highlights
 * when active and shows a leading flag (or AUTO bolt) + name + optional
 * favorite star.
 */
@Composable
fun ServerRow(
    name: String,
    subtitle: String,
    countryCode: String?,
    isAuto: Boolean,
    isActive: Boolean,
    isFavorite: Boolean,
    onClick: () -> Unit,
    onToggleFavorite: (() -> Unit)? = null,
    trailing: @Composable (() -> Unit)? = null,
) {
    val border = if (isActive) Brand.Green.copy(alpha = 0.45f) else Color.White.copy(alpha = 0.06f)
    val bg = if (isActive) Brand.Green.copy(alpha = 0.10f) else Color.White.copy(alpha = 0.03f)
    val titleColor = if (isActive) Brand.GreenLight else MaterialTheme.colorScheme.onBackground

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(14.dp))
            .background(bg)
            .border(1.dp, border, RoundedCornerShape(14.dp))
            .padding(horizontal = 12.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        // Leading icon — flag emoji, AUTO bolt, or globe fallback.
        Box(
            modifier = Modifier
                .size(38.dp)
                .clip(RoundedCornerShape(10.dp))
                .background(
                    if (isActive) Brand.Green.copy(alpha = 0.18f)
                    else Color.White.copy(alpha = 0.07f)
                )
                .border(
                    1.dp,
                    if (isActive) Brand.Green.copy(alpha = 0.28f)
                    else Color.White.copy(alpha = 0.09f),
                    RoundedCornerShape(10.dp)
                ),
            contentAlignment = Alignment.Center,
        ) {
            when {
                isAuto -> Icon(
                    imageVector = Icons.Filled.Bolt,
                    contentDescription = null,
                    tint = Brand.GreenLight,
                    modifier = Modifier.size(20.dp),
                )
                countryCode != null -> Text(
                    text = flagFromCountry(countryCode),
                    style = MaterialTheme.typography.titleMedium,
                )
                else -> Icon(
                    imageVector = Icons.Outlined.Public,
                    contentDescription = null,
                    tint = Brand.SecondaryText,
                    modifier = Modifier.size(20.dp),
                )
            }
        }

        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = name,
                color = titleColor,
                style = MaterialTheme.typography.bodyMedium,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                text = subtitle,
                color = Brand.MutedText,
                style = MaterialTheme.typography.bodySmall,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }

        if (onToggleFavorite != null) {
            IconButton(onClick = onToggleFavorite, modifier = Modifier.size(28.dp)) {
                Icon(
                    imageVector = if (isFavorite) Icons.Filled.Star else Icons.Outlined.StarBorder,
                    contentDescription = if (isFavorite) "Unfavorite" else "Favorite",
                    tint = if (isFavorite) Brand.Favorite else Brand.MutedText,
                    modifier = Modifier.size(16.dp),
                )
            }
        }

        if (trailing != null) trailing()

        // Active dot.
        Box(
            modifier = Modifier
                .size(8.dp)
                .clip(RoundedCornerShape(50))
                .background(if (isActive) Brand.GreenLight else Color.White.copy(alpha = 0.15f))
        )
    }
}

/** Convert a 2-letter ISO country code to the corresponding flag emoji. */
fun flagFromCountry(code: String): String {
    if (code.length != 2) return "🌐"
    val upper = code.uppercase()
    val a = 0x1F1E6 - 'A'.code + upper[0].code
    val b = 0x1F1E6 - 'A'.code + upper[1].code
    return runCatching {
        String(Character.toChars(a)) + String(Character.toChars(b))
    }.getOrDefault("🌐")
}
