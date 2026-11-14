package com.holypadel.wear.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.wear.compose.material3.MaterialTheme
import androidx.wear.compose.material3.Text

/** W/L result chip: a win is a round badge in the highlight colour, a loss a soft square. */
@Composable
fun ResultBadge(won: Boolean, sizeDp: Int = 24) {
    val scheme = MaterialTheme.colorScheme
    Box(
        modifier = Modifier
            .size(sizeDp.dp)
            .clip(if (won) CircleShape else RoundedCornerShape((sizeDp * 0.3).dp))
            .background(if (won) WatchColors.accent else scheme.surfaceContainerHigh),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = if (won) "W" else "L",
            color = if (won) scheme.onPrimary else scheme.onSurfaceVariant,
            fontSize = (sizeDp * 0.48).sp,
            fontWeight = FontWeight.Bold,
        )
    }
}

/** The serve mark: a dot in the team's colour, carrying the serving box (R/L) when known. */
@Composable
fun ServeMark(color: Color, onColor: Color, label: String?, modifier: Modifier = Modifier) {
    val sizeDp = if (label != null) 16 else 8
    Box(
        contentAlignment = Alignment.Center,
        modifier = modifier
            .size(sizeDp.dp)
            .clip(CircleShape)
            .background(color),
    ) {
        if (label != null) {
            Text(
                text = label,
                color = onColor,
                fontSize = 10.sp,
                lineHeight = 10.sp,
                fontWeight = FontWeight.Bold,
            )
        }
    }
}
