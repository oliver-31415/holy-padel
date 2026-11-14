package com.holypadel.wear.ui

import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.graphics.Color
import androidx.wear.compose.material3.ColorScheme
import androidx.wear.compose.material3.MaterialTheme
import androidx.wear.compose.material3.MotionScheme
import com.holypadel.wear.Palette

private fun schemeOf(palette: Palette): ColorScheme {
    val role = { name: String -> Color(palette.role(name)) }
    return ColorScheme(
        primary = role("primary"),
        primaryDim = role("primaryDim"),
        primaryContainer = role("primaryContainer"),
        onPrimary = role("onPrimary"),
        onPrimaryContainer = role("onPrimaryContainer"),
        secondary = role("secondary"),
        secondaryDim = role("secondaryDim"),
        secondaryContainer = role("secondaryContainer"),
        onSecondary = role("onSecondary"),
        onSecondaryContainer = role("onSecondaryContainer"),
        tertiary = role("tertiary"),
        tertiaryDim = role("tertiaryDim"),
        tertiaryContainer = role("tertiaryContainer"),
        onTertiary = role("onTertiary"),
        onTertiaryContainer = role("onTertiaryContainer"),
        surfaceContainerLow = role("surfaceContainerLow"),
        surfaceContainer = role("surfaceContainer"),
        surfaceContainerHigh = role("surfaceContainerHigh"),
        onSurface = role("onSurface"),
        onSurfaceVariant = role("onSurfaceVariant"),
        outline = role("outline"),
        outlineVariant = role("outlineVariant"),
        // True black: the pixels are off on an OLED watch face.
        background = Color.Black,
        onBackground = role("onSurface"),
        error = role("error"),
        errorDim = role("errorDim"),
        errorContainer = role("errorContainer"),
        onError = role("onError"),
        onErrorContainer = role("onErrorContainer"),
    )
}

/**
 * The watch's colours, mirrored from the phone through the state payload's `palette`:
 * the Material 3 scheme, and the user's two picks themselves for team names and the serve
 * mark. Snapshot state, so every face recomposes when they change; orange / violet until
 * the first push.
 */
object WatchColors {
    var scheme by mutableStateOf(schemeOf(Palette.DEFAULT))
        private set

    /** The highlight colour itself — Team A, the serve mark, wins. */
    var accent by mutableStateOf(Color(Palette.DEFAULT.accent))
        private set

    /** The Team B colour itself. */
    var teamB by mutableStateOf(Color(Palette.DEFAULT.teamB))
        private set

    fun applyPalette(palette: Palette?) {
        if (palette == null) return
        accent = Color(palette.accent)
        teamB = Color(palette.teamB)
        scheme = schemeOf(palette)
    }
}

/** Material 3 Expressive for Wear OS, in the phone's colours. */
@Composable
fun HolyPadelTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = WatchColors.scheme,
        motionScheme = MotionScheme.expressive(),
        content = content,
    )
}
