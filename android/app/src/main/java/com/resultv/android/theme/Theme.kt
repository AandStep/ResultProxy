package com.resultv.android.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val ResultVColors = darkColorScheme(
    primary = Brand.Green,
    onPrimary = Color.White,
    primaryContainer = Brand.GreenDark,
    onPrimaryContainer = Color.White,

    secondary = Brand.GreenLight,
    onSecondary = Color.Black,

    tertiary = Brand.Favorite,
    onTertiary = Color.Black,

    error = Brand.Danger,
    onError = Color.White,
    errorContainer = Color(0x1AF43F5E),
    onErrorContainer = Brand.Danger,

    background = Brand.Bg,
    onBackground = Color(0xFFEDEDEF),
    surface = Brand.Surface,
    onSurface = Color(0xFFEDEDEF),
    surfaceVariant = Brand.SurfaceHigh,
    onSurfaceVariant = Brand.SecondaryText,

    outline = Brand.SurfaceBorder,
    outlineVariant = Brand.SurfaceHigh,
)

@Composable
fun ResultVTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = ResultVColors,
        content = content,
    )
}
