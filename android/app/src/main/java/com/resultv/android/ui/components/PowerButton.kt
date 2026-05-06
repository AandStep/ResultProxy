package com.resultv.android.ui.components

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.PowerSettingsNew
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.blur
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import com.resultv.android.theme.Brand
import com.resultv.android.vpn.VpnStatus

/**
 * Big circular Connect/Disconnect button with status-driven glow.
 *
 * Compose has no direct M3 primitive for an oversized circular action with
 * an animated halo, so this is custom — but everything inside (Icon, Surface,
 * progress) uses M3.
 */
@Composable
fun PowerButton(
    status: VpnStatus,
    enabled: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val connected = status is VpnStatus.Connected
    val connecting = status is VpnStatus.Connecting
    val errored = status is VpnStatus.Error

    val ringColor by animateColorAsState(
        targetValue = when {
            connected -> Brand.GreenLight
            connecting -> Brand.Warning
            errored -> Brand.Danger
            else -> Brand.SurfaceBorder
        },
        animationSpec = tween(350),
        label = "ringColor",
    )
    val fillColor by animateColorAsState(
        targetValue = when {
            connected -> Brand.Green
            connecting -> Brand.Warning.copy(alpha = 0.85f)
            errored -> Brand.Danger.copy(alpha = 0.85f)
            else -> Brand.SurfaceHigh
        },
        animationSpec = tween(350),
        label = "fillColor",
    )
    val glowColor = when {
        connected -> Brand.Green.copy(alpha = 0.40f)
        connecting -> Brand.Warning.copy(alpha = 0.30f)
        errored -> Brand.Danger.copy(alpha = 0.30f)
        else -> Color.Transparent
    }
    val glowSize by animateDpAsState(
        targetValue = if (connected || connecting || errored) 200.dp else 0.dp,
        animationSpec = tween(600),
        label = "glow",
    )

    Box(
        modifier = modifier.size(220.dp),
        contentAlignment = Alignment.Center,
    ) {
        // Halo behind the button.
        Box(
            modifier = Modifier
                .size(glowSize)
                .background(glowColor, CircleShape)
                .blur(40.dp),
        )
        // Main button surface.
        Surface(
            onClick = onClick,
            enabled = enabled,
            shape = CircleShape,
            color = fillColor,
            contentColor = if (connected) Color.Black.copy(alpha = 0.78f) else Color.White,
            modifier = Modifier
                .size(160.dp)
                .border(width = 4.dp, color = ringColor, shape = CircleShape),
        ) {
            Box(contentAlignment = Alignment.Center) {
                Icon(
                    imageVector = Icons.Filled.PowerSettingsNew,
                    contentDescription = if (connected) "Disconnect" else "Connect",
                    modifier = Modifier.size(64.dp),
                )
                if (connecting) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(152.dp),
                        color = Brand.Warning,
                        strokeWidth = 3.dp,
                        trackColor = Color.Transparent,
                    )
                }
            }
        }
    }
}

/** Status text shown above the power button. */
@Composable
fun StatusHeader(status: VpnStatus, activeProfileName: String?) {
    val color = when (status) {
        is VpnStatus.Connected -> Brand.Green
        is VpnStatus.Connecting -> Brand.Warning
        is VpnStatus.Error -> Brand.Danger
        is VpnStatus.Idle -> Brand.SecondaryText
    }
    val title = when (status) {
        is VpnStatus.Connected -> "Protected"
        is VpnStatus.Connecting -> "Connecting…"
        is VpnStatus.Error -> "Error"
        is VpnStatus.Idle -> "Unprotected"
    }
    val subtitle = when (status) {
        is VpnStatus.Connected -> activeProfileName?.let { "Traffic routed via $it" }
        is VpnStatus.Error -> status.message
        else -> "Your connection is not protected"
    }
    androidx.compose.foundation.layout.Column(
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        androidx.compose.material3.Text(
            text = title,
            style = MaterialTheme.typography.headlineMedium,
            color = color,
        )
        if (subtitle != null) {
            androidx.compose.material3.Text(
                text = subtitle,
                style = MaterialTheme.typography.bodySmall,
                color = Brand.SecondaryText,
            )
        }
    }
}
