package com.holypadel.wear.ui

import androidx.activity.compose.BackHandler
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.focusable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.input.rotary.onRotaryScrollEvent
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import android.text.format.DateFormat
import java.util.Date
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import androidx.compose.foundation.Canvas
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
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.unit.dp
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.sin
import com.holypadel.wear.MatchState
import com.holypadel.wear.Phase

/** App lock timings: hold length, crown distance to unlock, crown idle reset, unlock window. */
private const val HOLD_MS = 1_000
private const val CROWN_UNLOCK_PX = 1_200f
private const val CROWN_IDLE_MS = 1_500L
private const val UNLOCK_WINDOW_MS = 10_000L

/** Routes to the right screen purely from the mirrored [MatchState.phase]. */
@Composable
fun WatchApp(
    state: MatchState,
    liveBpm: Int,
    onScore: (String) -> Unit,
    onUndo: () -> Unit,
    onSetChoice: (String) -> Unit,
    onStartLast: () -> Unit,
    onPause: () -> Unit,
    onStop: () -> Unit,
    onCancel: () -> Unit,
    onEnd: () -> Unit,
    lockEnabled: Boolean,
    onLockChange: (Boolean) -> Unit,
) {
    Box(
        modifier = Modifier.fillMaxSize().background(CourtColors.Black),
        contentAlignment = Alignment.Center,
    ) {
        when (state.phase) {
            Phase.IDLE -> IdleScreen(state, onStartLast, lockEnabled, onLockChange)
            Phase.LIVE -> LiveScoreScreen(
                state,
                liveBpm,
                onScore,
                onSetChoice,
                onUndo,
                onPause,
                onStop,
                onCancel,
                lockEnabled,
            )
            Phase.WON -> MatchWonScreen(state, onEnd)
        }
    }
}

@Composable
private fun IdleScreen(
    state: MatchState,
    onStartLast: () -> Unit,
    lockEnabled: Boolean,
    onLockChange: (Boolean) -> Unit,
) {
    Column(
        modifier = Modifier.fillMaxSize().padding(horizontal = 22.dp, vertical = 20.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        LabelText("NO LIVE MATCH", sizeSp = 11)
        state.last?.let { last ->
            Spacer(Modifier.height(10.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                ResultBadge(last.won, sizeDp = 20)
                Spacer(Modifier.width(8.dp))
                BodyText("Last · ${last.line}", color = CourtColors.White45, sizeSp = 12)
            }
        }
        Spacer(Modifier.height(18.dp))
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(28.dp))
                .background(CourtColors.Accent)
                .clickable { onStartLast() }
                .padding(vertical = 12.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            DisplayText("START MATCH", sizeSp = 16, color = CourtColors.Ink)
            state.last?.let {
                LabelText("LAST LINEUP", color = CourtColors.Ink, sizeSp = 9)
            }
        }
        Spacer(Modifier.height(10.dp))
        PillButton(
            label = if (lockEnabled) "APP LOCK: ON" else "APP LOCK: OFF",
            background = if (lockEnabled) CourtColors.Accent else CourtColors.White.copy(alpha = 0.14f),
            text = if (lockEnabled) CourtColors.Ink else CourtColors.White,
            onClick = { onLockChange(!lockEnabled) },
        )
        Spacer(Modifier.height(10.dp))
        BodyText("or set up on phone", color = CourtColors.White40, sizeSp = 10)
    }
}

/**
 * Two sideways pages, like the Wear/Apple workout app: swipe between the
 * **controls** (undo, pause, stop-and-save, cancel) and the **score face** (tap a
 * team to score). Separating them keeps the score clean and makes an accidental
 * stop impossible while you're tapping points every rally.
 */
@Composable
private fun LiveScoreScreen(
    state: MatchState,
    liveBpm: Int,
    onScore: (String) -> Unit,
    onSetChoice: (String) -> Unit,
    onUndo: () -> Unit,
    onPause: () -> Unit,
    onStop: () -> Unit,
    onCancel: () -> Unit,
    lockEnabled: Boolean,
) {
    // Land on the score face (page 1) — the surface you touch every rally.
    val pagerState = rememberPagerState(initialPage = 1) { 2 }
    // App lock: while locked, back and swipe-to-dismiss are swallowed. A hold on the
    // controls page or a crown turn unlocks for UNLOCK_WINDOW_MS, or until the score moves.
    var unlocked by remember { mutableStateOf(false) }
    val locked = lockEnabled && !unlocked
    var crownProgress by remember { mutableFloatStateOf(0f) }
    val focusRequester = remember { FocusRequester() }

    BackHandler(enabled = locked) {}
    LaunchedEffect(state.pointA, state.pointB, state.games, state.setLabel) { unlocked = false }
    LaunchedEffect(unlocked) {
        if (unlocked) {
            delay(UNLOCK_WINDOW_MS)
            unlocked = false
        }
    }
    LaunchedEffect(crownProgress) {
        if (crownProgress > 0f) {
            delay(CROWN_IDLE_MS)
            crownProgress = 0f
        }
    }
    LaunchedEffect(locked) {
        if (locked) focusRequester.requestFocus()
    }

    val crownModifier = if (locked) {
        Modifier
            .focusRequester(focusRequester)
            .focusable()
            .onRotaryScrollEvent { event ->
                crownProgress += abs(event.verticalScrollPixels)
                if (crownProgress >= CROWN_UNLOCK_PX) {
                    unlocked = true
                    crownProgress = 0f
                }
                true
            }
    } else {
        Modifier
    }
    Box(modifier = Modifier.fillMaxSize().then(crownModifier)) {
        HorizontalPager(state = pagerState, modifier = Modifier.fillMaxSize()) { page ->
            if (page == 0) {
                ControlsPage(state, onUndo, onPause, onStop, onCancel, locked, onUnlock = { unlocked = true })
            } else {
                ScorePage(state, liveBpm, onScore, onSetChoice, locked)
            }
        }
        PagerDots(
            count = 2,
            current = pagerState.currentPage,
            modifier = Modifier.align(Alignment.BottomCenter).padding(bottom = 3.dp),
        )
        // Crown progress: a thin arc around the bezel that fills as you turn.
        if (locked && crownProgress > 0f) {
            Canvas(Modifier.fillMaxSize()) {
                val stroke = 4.dp.toPx()
                val inset = stroke / 2f
                drawArc(
                    CourtColors.Accent,
                    startAngle = -90f,
                    sweepAngle = 360f * (crownProgress / CROWN_UNLOCK_PX).coerceAtMost(1f),
                    useCenter = false,
                    topLeft = Offset(inset, inset),
                    size = Size(size.width - stroke, size.height - stroke),
                    style = Stroke(width = stroke, cap = StrokeCap.Round),
                )
            }
        }
    }
}

/** The time of day, refreshed on the minute, in the watch's 12/24h format. */
@Composable
private fun TimeOfDay() {
    val context = LocalContext.current
    val now by produceState(System.currentTimeMillis()) {
        while (true) {
            value = System.currentTimeMillis()
            delay(60_000L - value % 60_000L)
        }
    }
    BodyText(
        DateFormat.getTimeFormat(context).format(Date(now)),
        color = CourtColors.White,
        sizeSp = 14,
        weight = FontWeight.Bold,
    )
}

/** "12:34", or "1:02:09" past the hour. */
private fun elapsedLabel(ms: Long): String {
    val total = (ms / 1000).coerceAtLeast(0)
    val hours = total / 3600
    val minutes = (total % 3600) / 60
    val seconds = total % 60
    return if (hours > 0) {
        "%d:%02d:%02d".format(hours, minutes, seconds)
    } else {
        "%d:%02d".format(minutes, seconds)
    }
}

/** A small stopwatch glyph so the match clock can't be mistaken for the time of day. */
@Composable
private fun StopwatchIcon(color: Color) {
    Canvas(Modifier.size(10.dp)) {
        val stroke = size.width * 0.13f
        val radius = size.width * 0.38f
        val center = Offset(size.width / 2, size.height * 0.58f)
        drawCircle(color, radius = radius, center = center, style = Stroke(width = stroke))
        drawLine(
            color,
            Offset(size.width * 0.38f, size.height * 0.06f),
            Offset(size.width * 0.62f, size.height * 0.06f),
            strokeWidth = stroke,
            cap = StrokeCap.Round,
        )
        drawLine(color, center, Offset(center.x, center.y - radius * 0.6f), strokeWidth = stroke, cap = StrokeCap.Round)
    }
}

/**
 * Time played in the match, ticking every second on the watch itself from the
 * phone's `clockBase` — the phone only pushes on points, so its `clock` string
 * would sit still between them. Paused (no base): the frozen `clock`.
 */
@Composable
private fun MatchClock(state: MatchState) {
    val base = state.clockBase
    val label = if (base > 0 && !state.paused) {
        val now by produceState(System.currentTimeMillis(), base) {
            while (true) {
                value = System.currentTimeMillis()
                delay(1_000L - value % 1_000L)
            }
        }
        elapsedLabel(now - base)
    } else {
        state.clock
    }
    if (label.isEmpty()) return
    Row(verticalAlignment = Alignment.CenterVertically) {
        StopwatchIcon(CourtColors.White45)
        Spacer(Modifier.width(4.dp))
        BodyText(label, color = CourtColors.White45, sizeSp = 12)
    }
}

/**
 * The score face, laid out for a ROUND screen: time, heart rate and match
 * clock centred at the top (the corners of a round face are cut off), the two
 * teams side by side as big tappable halves, and the game score + LIVE centred
 * at the bottom.
 */
@Composable
private fun ScorePage(
    state: MatchState,
    liveBpm: Int,
    onScore: (String) -> Unit,
    onSetChoice: (String) -> Unit,
    locked: Boolean,
) {
    val paused = state.paused
    Column(
        modifier = Modifier.fillMaxSize().padding(top = 12.dp, bottom = 20.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        TimeOfDay()
        Row(verticalAlignment = Alignment.CenterVertically) {
            if (liveBpm > 0) {
                BodyText("♥ $liveBpm", color = CourtColors.Accent, sizeSp = 12, weight = FontWeight.Bold)
                Spacer(Modifier.width(8.dp))
            }
            MatchClock(state)
        }

        // During a squash "choice" tie-break the decision is mandatory: the
        // SHORT/LONG buttons replace the score halves. Once a choice is staged
        // (from either surface) the phone clears choicePending and moves the
        // staged call into `status`, so the score face returns on the next
        // state push — the phone owns the truth (docs/watch-sync.md).
        if (state.choicePending) {
            ChoiceButtons(onChoose = onSetChoice)
            return@Column
        }

        // While paused, dim the halves and swallow taps — the phone rejects points
        // when paused anyway, but this keeps the watch honest (docs/watch-sync.md).
        val scoreEnabled = !paused
        Row(
            modifier = Modifier.weight(1f).fillMaxWidth().padding(horizontal = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            TeamHalf(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxHeight()
                    .alpha(if (paused) 0.35f else 1f)
                    .clickable(enabled = scoreEnabled) { onScore("A") },
                short = state.teamA.short,
                point = state.pointA,
                serving = state.teamA.serving,
                servingSide = state.teamA.servingSide,
                teamColor = CourtColors.Accent,
            )
            Box(
                modifier = Modifier
                    .width(1.dp)
                    .fillMaxHeight(0.55f)
                    .background(CourtColors.White25),
            )
            TeamHalf(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxHeight()
                    .alpha(if (paused) 0.35f else 1f)
                    .clickable(enabled = scoreEnabled) { onScore("B") },
                short = state.teamB.short,
                point = state.pointB,
                serving = state.teamB.serving,
                servingSide = state.teamB.servingSide,
                teamColor = CourtColors.TeamB,
            )
        }

        // Which set/game and the score around it — never the point score again,
        // and only "PAUSED" as a status (a live match needs no label).
        val context = listOf(state.setLabel, state.games).filter { it.isNotEmpty() }.joinToString("  ")
        val tags = listOfNotNull(
            if (paused) "PAUSED" else null,
            if (locked) "LOCKED" else null,
        )
        val footer = (tags + context).filter { it.isNotEmpty() }.joinToString("  ")
        if (footer.isNotEmpty()) LabelText(footer)
    }
}

/** The squash "choice" tie-break decision — short (set 1) or long (set 2). */
@Composable
private fun ChoiceButtons(onChoose: (String) -> Unit) {
    Column(
        modifier = Modifier.fillMaxSize().padding(horizontal = 20.dp, vertical = 10.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp, Alignment.CenterVertically),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        LabelText("SET 1 OR 2?", color = CourtColors.Accent, sizeSp = 14)
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(10.dp))
                .background(CourtColors.Accent)
                .clickable { onChoose("one") }
                .padding(vertical = 10.dp),
            contentAlignment = Alignment.Center,
        ) {
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                BodyText("SHORT · SET 1", color = CourtColors.Black, sizeSp = 13)
                LabelText("next point wins", color = CourtColors.Black.copy(alpha = 0.55f), sizeSp = 9)
            }
        }
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(10.dp))
                .background(CourtColors.Accent)
                .clickable { onChoose("two") }
                .padding(vertical = 10.dp),
            contentAlignment = Alignment.Center,
        ) {
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                BodyText("LONG · SET 2", color = CourtColors.Black, sizeSp = 13)
                LabelText("two more points", color = CourtColors.Black.copy(alpha = 0.55f), sizeSp = 9)
            }
        }
    }
}

/** The actions face — undo, pause/resume, the square stop-and-save, and a guarded full cancel. */
@Composable
private fun ControlsPage(
    state: MatchState,
    onUndo: () -> Unit,
    onPause: () -> Unit,
    onStop: () -> Unit,
    onCancel: () -> Unit,
    locked: Boolean,
    onUnlock: () -> Unit,
) {
    val paused = state.paused
    var confirmingCancel by remember { mutableStateOf(false) }
    Column(
        modifier = Modifier.fillMaxSize().padding(horizontal = 18.dp, vertical = 14.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(9.dp, Alignment.CenterVertically),
    ) {
        if (locked) {
            HoldToUnlock(onUnlock)
        } else {
            LabelText(
                if (paused) "PAUSED" else "CONTROLS",
                color = if (paused) CourtColors.White45 else CourtColors.Accent,
                sizeSp = 11,
            )
        }
        Row(
            horizontalArrangement = Arrangement.spacedBy(18.dp, Alignment.CenterHorizontally),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            LabeledControl("UNDO") {
                CircleIconButton(ControlIcon.UNDO, onClick = onUndo, enabled = !paused)
            }
            LabeledControl(if (paused) "RESUME" else "PAUSE") {
                CircleIconButton(
                    if (paused) ControlIcon.PLAY else ControlIcon.PAUSE,
                    onClick = onPause,
                    accent = true,
                    diameterDp = 44,
                )
            }
        }
        if (confirmingCancel) {
            // Inline confirm — no dialog dependency; discard is one deliberate tap away.
            LabelText("DISCARD? SCORE LOST", color = CourtColors.White45, sizeSp = 9)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                PillButton("DISCARD", CourtColors.White.copy(alpha = 0.14f), CourtColors.White, onCancel)
                PillButton("KEEP", CourtColors.Accent, CourtColors.Ink) { confirmingCancel = false }
            }
        } else {
            // Stop AND save — the filled square, "court time's up, don't lose the score".
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(12.dp))
                    .background(CourtColors.Accent)
                    .clickable { onStop() }
                    .padding(vertical = 9.dp),
                horizontalArrangement = Arrangement.spacedBy(6.dp, Alignment.CenterHorizontally),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Box(Modifier.size(12.dp).clip(RoundedCornerShape(2.dp)).background(CourtColors.Ink))
                DisplayText("STOP & SAVE", sizeSp = 14, color = CourtColors.Ink)
            }
            Box(
                modifier = Modifier.clickable { confirmingCancel = true }.padding(vertical = 2.dp),
            ) {
                LabelText("CANCEL MATCH", color = CourtColors.White.copy(alpha = 0.55f), sizeSp = 12)
            }
        }
    }
}

/**
 * App-lock release: press and hold for HOLD_MS. The ring fills while held and
 * snaps back if the finger lifts early, so a stray tap never unlocks.
 */
@Composable
private fun HoldToUnlock(onUnlock: () -> Unit) {
    val progress = remember { Animatable(0f) }
    val scope = rememberCoroutineScope()
    Row(
        modifier = Modifier.pointerInput(Unit) {
            detectTapGestures(
                onPress = {
                    val fill = scope.launch {
                        progress.animateTo(1f, tween(HOLD_MS, easing = LinearEasing))
                        onUnlock()
                    }
                    tryAwaitRelease()
                    // Lifted before the ring filled: cancel the fill and wind it back down.
                    if (fill.isActive) {
                        fill.cancel()
                        scope.launch { progress.animateTo(0f) }
                    }
                },
            )
        },
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Canvas(Modifier.size(30.dp)) {
            val stroke = 3.dp.toPx()
            val inset = stroke / 2f
            drawCircle(
                color = CourtColors.White.copy(alpha = 0.18f),
                radius = size.minDimension / 2f - inset,
                style = Stroke(width = stroke),
            )
            drawArc(
                CourtColors.Accent,
                startAngle = -90f,
                sweepAngle = 360f * progress.value,
                useCenter = false,
                topLeft = Offset(inset, inset),
                size = Size(size.width - stroke, size.height - stroke),
                style = Stroke(width = stroke, cap = StrokeCap.Round),
            )
        }
        LabelText("HOLD TO UNLOCK", color = CourtColors.Accent, sizeSp = 10)
    }
}

@Composable
private fun LabeledControl(title: String, content: @Composable () -> Unit) {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(3.dp),
    ) {
        content()
        LabelText(title, color = CourtColors.White45, sizeSp = 9)
    }
}

@Composable
private fun PillButton(label: String, background: Color, text: Color, onClick: () -> Unit) {
    Box(
        modifier = Modifier
            .clip(RoundedCornerShape(20.dp))
            .background(background)
            .clickable { onClick() }
            .padding(horizontal = 14.dp, vertical = 7.dp),
    ) {
        LabelText(label, color = text, sizeSp = 11)
    }
}

/** Two-page swipe indicator, drawn from the shared [Dot]. */
@Composable
private fun PagerDots(count: Int, current: Int, modifier: Modifier = Modifier) {
    Row(modifier = modifier, horizontalArrangement = Arrangement.spacedBy(5.dp)) {
        for (index in 0 until count) {
            Dot(
                sizeDp = 5,
                color = if (index == current) CourtColors.Accent else CourtColors.White.copy(alpha = 0.3f),
            )
        }
    }
}

private enum class ControlIcon { UNDO, PAUSE, PLAY, CLOSE }

/** A round icon button, icon drawn with Canvas — no icon dependency, crisp on the watch. */
@Composable
private fun CircleIconButton(
    icon: ControlIcon,
    onClick: () -> Unit,
    accent: Boolean = false,
    enabled: Boolean = true,
    diameterDp: Int = 36,
) {
    val background = if (accent) CourtColors.Accent else CourtColors.White.copy(alpha = 0.14f)
    val tint = if (accent) CourtColors.Ink else CourtColors.White
    Box(
        modifier = Modifier
            .size(diameterDp.dp)
            .alpha(if (enabled) 1f else 0.35f)
            .clip(CircleShape)
            .background(background)
            .clickable(enabled = enabled) { onClick() },
        contentAlignment = Alignment.Center,
    ) {
        Canvas(Modifier.size((diameterDp * 0.42f).dp)) { drawControlIcon(icon, tint) }
    }
}

private fun DrawScope.drawControlIcon(icon: ControlIcon, color: Color) {
    val w = size.width
    val h = size.height
    val stroke = w * 0.16f
    when (icon) {
        ControlIcon.PAUSE -> {
            val bar = w * 0.26f
            val radius = CornerRadius(bar / 2f)
            drawRoundRect(color, topLeft = Offset(w * 0.16f, 0f), size = Size(bar, h), cornerRadius = radius)
            drawRoundRect(color, topLeft = Offset(w * 0.58f, 0f), size = Size(bar, h), cornerRadius = radius)
        }
        ControlIcon.PLAY -> {
            val path = Path().apply {
                moveTo(w * 0.2f, 0f)
                lineTo(w * 0.92f, h / 2f)
                lineTo(w * 0.2f, h)
                close()
            }
            drawPath(path, color)
        }
        ControlIcon.CLOSE -> {
            drawLine(color, Offset(0f, 0f), Offset(w, h), strokeWidth = stroke, cap = StrokeCap.Round)
            drawLine(color, Offset(w, 0f), Offset(0f, h), strokeWidth = stroke, cap = StrokeCap.Round)
        }
        ControlIcon.UNDO -> {
            // Counterclockwise arc (gap at top-right) + an arrowhead at its start.
            val inset = stroke / 2f
            drawArc(
                color,
                startAngle = -50f,
                sweepAngle = 300f,
                useCenter = false,
                topLeft = Offset(inset, inset),
                size = Size(w - stroke, h - stroke),
                style = Stroke(width = stroke, cap = StrokeCap.Round),
            )
            // Arrowhead at the arc start point (angle -50°), pointing along the sweep.
            val cx = w / 2f
            val cy = h / 2f
            val r = (w - stroke) / 2f
            val a = Math.toRadians(-50.0)
            val tip = Offset(cx + r * cos(a).toFloat(), cy + r * sin(a).toFloat())
            val head = w * 0.28f
            drawLine(color, tip, Offset(tip.x - head, tip.y), strokeWidth = stroke, cap = StrokeCap.Round)
            drawLine(color, tip, Offset(tip.x, tip.y - head), strokeWidth = stroke, cap = StrokeCap.Round)
        }
    }
}

/** One team's half of the side-by-side score face: serve dot + name over the big point. */
@Composable
private fun TeamHalf(
    modifier: Modifier,
    short: String,
    point: String,
    serving: Boolean,
    servingSide: String?,
    teamColor: Color,
) {
    Column(
        modifier = modifier,
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.alpha(if (serving) 1f else 0f)) {
                Dot(
                    sizeDp = if (servingSide != null) 14 else 8,
                    visible = true,
                    label = if (servingSide == "right") "R" else if (servingSide == "left") "L" else null,
                )
            }
            Spacer(Modifier.width(5.dp))
            DisplayText(short, sizeSp = 16, color = teamColor)
        }
        DisplayText(point, sizeSp = 52, color = CourtColors.White)
    }
}

@Composable
private fun MatchWonScreen(state: MatchState, onEnd: () -> Unit) {
    val won = state.won
    Column(
        modifier = Modifier.fillMaxSize().padding(horizontal = 18.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        DisplayText("MATCH WON", sizeSp = 24, color = CourtColors.Accent)
        Spacer(Modifier.height(6.dp))
        DisplayText(won?.winnerShort ?: state.teamA.short, sizeSp = 30, color = CourtColors.White)
        Spacer(Modifier.height(6.dp))
        DisplayText(won?.scoreLine ?: state.games, sizeSp = 26, color = CourtColors.White45)
        Spacer(Modifier.height(10.dp))
        LabelText(
            listOf(won?.duration ?: "", "SAVED TO PHONE").filter { it.isNotEmpty() }.joinToString(" · "),
            sizeSp = 10,
        )
        Spacer(Modifier.height(14.dp))
        // DONE lets the user leave MATCH WON — the phone persists the finished
        // match and the next state push lands the watch back on IDLE.
        Box(
            modifier = Modifier
                .clip(RoundedCornerShape(28.dp))
                .background(CourtColors.Accent)
                .clickable { onEnd() }
                .padding(horizontal = 22.dp, vertical = 10.dp),
        ) {
            DisplayText("DONE", sizeSp = 15, color = CourtColors.Ink)
        }
    }
}
