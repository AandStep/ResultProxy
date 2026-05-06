package com.resultv.android.theme

import androidx.compose.ui.graphics.Color

/** ResultV brand palette — mirrors `colors_and_type.css` from the design bundle. */
object Brand {
    val Green = Color(0xFF007E3A)        // primary, connected
    val GreenLight = Color(0xFF00A819)    // accents, upload speed
    val GreenDark = Color(0xFF005C2A)     // hover

    val Danger = Color(0xFFF43F5E)        // disconnect, error
    val Warning = Color(0xFFF59E0B)       // connecting
    val Favorite = Color(0xFFFBBF24)      // star

    // Background scale (dark only — design has no light theme).
    val Bg = Color(0xFF060608)            // app background
    val Surface = Color(0xFF18181B)       // cards
    val SurfaceHigh = Color(0xFF27272A)   // hover, elevated
    val SurfaceBorder = Color(0xFF3F3F46) // divider on hover

    val MutedText = Color(0xFF71717A)
    val SecondaryText = Color(0xFFA1A1AA)
}
