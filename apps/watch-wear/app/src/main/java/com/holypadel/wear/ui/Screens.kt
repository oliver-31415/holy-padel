package com.holypadel.wear.ui

import androidx.activity.compose.BackHandler
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.focusable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.input.rotary.onRotaryScrollEvent
import androidx.compose.ui.layout.LayoutCoordinates
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.semantics.ScrollAxisRange
import androidx.compose.ui.semantics.horizontalScrollAxisRange
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.wear.compose.foundation.GestureInclusion
import androidx.wear.compose.foundation.pager.HorizontalPager
import androidx.wear.compose.foundation.pager.PagerDefaults
import androidx.wear.compose.foundation.pager.rememberPagerState
import androidx.wear.compose.material3.AnimatedPage
import androidx.wear.compose.material3.AppScaffold
import androidx.wear.compose.material3.Button
import androidx.wear.compose.material3.ButtonDefaults
import androidx.wear.compose.material3.ButtonGroup
import androidx.wear.compose.material3.CompactButton
import androidx.wear.compose.material3.EdgeButton
import androidx.wear.compose.material3.FilledIconButton
import androidx.wear.compose.material3.FilledTonalButton
import androidx.wear.compose.material3.FilledTonalIconButton
import androidx.wear.compose.material3.HorizontalPageIndicator
import androidx.wear.compose.material3.HorizontalPagerScaffold
import androidx.wear.compose.material3.Icon
import androidx.wear.compose.material3.MaterialTheme
import androidx.wear.compose.material3.SwitchButton
import androidx.wear.compose.material3.Text
import androidx.wear.compose.material3.TextToggleButton
import androidx.wear.compose.material3.TextToggleButtonDefaults
import androidx.wear.compose.material3.TimeText
import androidx.wear.compose.material3.onehandedgesture.OneHandedGestureAction
import androidx.wear.compose.material3.onehandedgesture.oneHandedGesture
import androidx.wear.compose.material3.onehandedgesture.rememberOneHandedGestureConfiguration
import com.holypadel.wear.MatchState
import com.holypadel.wear.Phase
import kotlin.math.abs
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/** App lock timings: hold length, crown distance to unlock, crown idle reset, unlock window. */
private const val HOLD_MS = 1_000
private const val CROWN_UNLOCK_PX = 1_200f
private const val CROWN_IDLE_MS = 1_500L
private const val UNLOCK_WINDOW_MS = 10_000L

/** Dimmed, as Material does for disabled content. */
private const val DISABLED_ALPHA = 0.38f

/** Fills the face and turns it 180° when the watch is worn upside-down. */
private fun Modifier.flipFace(flipped: Boolean): Modifier =
    fillMaxSize().graphicsLayer { rotationZ = if (flipped) 180f else 0f }

/**
 * Routes to the right screen purely from the mirrored [MatchState.phase]. Everything sits
 * inside one [AppScaffold], which draws the curved time of day along the top edge.
 */
@Composable
fun WatchApp(
    state: MatchState,
    liveBpm: Int,
    pendingTaps: Int,
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
    flipped: Boolean,
    onFlipChange: (Boolean) -> Unit,
) {
    HolyPadelTheme {
        // An upside-down wear turns every face 180°. Compose maps pointer input through
        // graphicsLayer transforms, so taps still hit the right buttons. The live pager is
        // deliberately NOT inside a rotated layer (see LiveScoreScreen), and there are no
        // dialogs: they open in their own window and would not rotate.
        val flip = Modifier.flipFace(flipped)
        AppScaffold(timeText = { Box(flip) { TimeText() } }) {
            when (state.phase) {
                Phase.IDLE -> Box(flip) {
                    IdleScreen(state, pendingTaps, onStartLast, lockEnabled, onLockChange, flipped, onFlipChange)
                }
                Phase.LIVE -> LiveScoreScreen(
                    state,
                    liveBpm,
                    pendingTaps,
                    onScore,
                    onSetChoice,
                    onUndo,
                    onPause,
                    onStop,
                    onCancel,
                    lockEnabled,
                    onLockChange,
                    flipped,
                    onFlipChange,
                )
                Phase.WON -> Box(flip) { MatchWonScreen(state, onEnd) }
            }
        }
    }
}

/**
 * Nothing live: the last result, the two watch settings, and the edge button that starts a
 * rematch of the last lineup — all on one face, so starting is a single tap. With no match
 * on the phone yet there is nothing to rematch, so the button is disabled and the screen
 * points at the phone instead.
 */
@Composable
private fun IdleScreen(
    state: MatchState,
    pendingTaps: Int,
    onStartLast: () -> Unit,
    lockEnabled: Boolean,
    onLockChange: (Boolean) -> Unit,
    flipped: Boolean,
    onFlipChange: (Boolean) -> Unit,
) {
    val last = state.last
    val scheme = MaterialTheme.colorScheme
    Box(Modifier.fillMaxSize()) {
        Column(
            modifier = Modifier.fillMaxSize().padding(start = 20.dp, end = 20.dp, top = 26.dp, bottom = 62.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(6.dp, Alignment.CenterVertically),
        ) {
            // A tap that has not reached the phone yet (Start match, most likely): say so,
            // or the face just sits there looking as if nothing was pressed.
            Text(
                if (pendingTaps > 0) "Waiting for phone…" else "No live match",
                style = MaterialTheme.typography.titleSmall,
                color = if (pendingTaps > 0) scheme.primary else scheme.onSurfaceVariant,
            )
            if (last == null) {
                Text(
                    "Start your first match on the phone",
                    style = MaterialTheme.typography.bodySmall,
                    textAlign = TextAlign.Center,
                )
            } else {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    ResultBadge(last.won, sizeDp = 22)
                    Text(
                        last.line,
                        style = MaterialTheme.typography.labelMedium,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                SettingToggle("Lock", Symbols.Lock, lockEnabled, onLockChange, Modifier.weight(1f))
                SettingToggle("Flip", Symbols.Flip, flipped, onFlipChange, Modifier.weight(1f))
            }
        }
        EdgeButton(
            onClick = onStartLast,
            modifier = Modifier.align(Alignment.BottomCenter),
            enabled = last != null,
        ) {
            Text("Start match")
        }
    }
}

/** A labelled on/off pill for the idle face: its shape and fill change when it's on. */
@Composable
private fun SettingToggle(
    label: String,
    icon: ImageVector,
    checked: Boolean,
    onCheckedChange: (Boolean) -> Unit,
    modifier: Modifier = Modifier,
) {
    TextToggleButton(
        checked = checked,
        onCheckedChange = onCheckedChange,
        modifier = modifier.height(40.dp),
        shapes = TextToggleButtonDefaults.animatedShapes(),
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            Icon(icon, contentDescription = null, modifier = Modifier.size(16.dp))
            Text(label, style = MaterialTheme.typography.labelMedium)
        }
    }
}

/**
 * Three sideways pages, like the Wear/Apple workout app: swipe between the
 * **settings** (lock and flip), the **controls** (undo, pause, stop-and-save, cancel)
 * and the **score face** (tap a team to score). Separating them keeps the score clean
 * and makes an accidental stop impossible while you're tapping points every rally.
 */
@Composable
private fun LiveScoreScreen(
    state: MatchState,
    liveBpm: Int,
    pendingTaps: Int,
    onScore: (String) -> Unit,
    onSetChoice: (String) -> Unit,
    onUndo: () -> Unit,
    onPause: () -> Unit,
    onStop: () -> Unit,
    onCancel: () -> Unit,
    lockEnabled: Boolean,
    onLockChange: (Boolean) -> Unit,
    flipped: Boolean,
    onFlipChange: (Boolean) -> Unit,
) {
    val flip = Modifier.flipFace(flipped)
    // Land on the score face (page 2) — the surface you touch every rally.
    val pagerState = rememberPagerState(initialPage = 2) { 3 }
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
    // Wrist turn is the system dismiss (back) on Pixel Watch. An empty subscription swallows it
    // while locked, as Google advises for active workout screens.
    val wristTurn = rememberOneHandedGestureConfiguration(action = OneHandedGestureAction.Dismiss)
    val wristModifier = if (locked) {
        Modifier.oneHandedGesture(
            gestureConfiguration = wristTurn,
            onGestureLabel = "match locked",
            onGesture = {},
        )
    } else {
        Modifier
    }
    // The system's swipe-to-dismiss is a left-to-right swipe on the glass. Flipped, that is
    // the wearer's "next page" swipe, and from the settings page the system would take it
    // and close the app. So while flipped the pager claims every horizontal swipe, by
    // reporting that it can always scroll that way; the crown still leaves the app.
    val swipeOwner = if (flipped) {
        Modifier.semantics {
            horizontalScrollAxisRange = ScrollAxisRange(value = { 1f }, maxValue = { 1f })
        }
    } else {
        Modifier
    }
    val crownArc = MaterialTheme.colorScheme.primary
    Box(modifier = Modifier.fillMaxSize().then(wristModifier).then(crownModifier)) {
        // Flipping: each page (and the page dots) is rotated on its own and the pager runs
        // in reverse, which adds up to the whole pager turned 180°. Rotating the pager itself
        // looks the same but breaks swiping: a fling's velocity is not mapped through the
        // rotation, so a quick swipe snaps back to the page it left.
        HorizontalPagerScaffold(
            pagerState = pagerState,
            modifier = swipeOwner,
            pageIndicator = {
                Box(flip, contentAlignment = Alignment.BottomCenter) { HorizontalPageIndicator(pagerState) }
            },
        ) {
            // The pager leaves the crown alone (no rotary behaviour), so it stays free for the unlock.
            HorizontalPager(
                state = pagerState,
                reverseLayout = flipped,
                gestureInclusion = if (flipped) wholeFace else PagerDefaults.gestureInclusion(pagerState),
            ) { page ->
                AnimatedPage(pageIndex = page, pagerState = pagerState) {
                    Box(flip) {
                        when (page) {
                            0 -> SettingsPage(
                                lockEnabled,
                                locked,
                                flipped,
                                onLockChange,
                                onFlipChange,
                                onUnlock = { unlocked = true },
                            )
                            1 -> ControlsPage(
                                state,
                                onUndo,
                                onPause,
                                onStop,
                                onCancel,
                                locked,
                                onUnlock = { unlocked = true },
                            )
                            else -> ScorePage(state, liveBpm, pendingTaps, onScore, onSetChoice, locked)
                        }
                    }
                }
            }
        }
        // Crown progress: a thin arc around the bezel that fills as you turn.
        if (locked && crownProgress > 0f) {
            Canvas(flip) {
                val stroke = 4.dp.toPx()
                val inset = stroke / 2f
                drawArc(
                    crownArc,
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

/** Flipped, no edge of the first page is left to swipe-to-dismiss (see `swipeOwner`). */
private val wholeFace = object : GestureInclusion {
    override fun ignoreGestureStart(offset: Offset, layoutCoordinates: LayoutCoordinates): Boolean = false
}

/** Side margin for full-width rows: a tenth of the face, so their corners clear a round screen. */
@Composable
private fun edgeInset(): Dp = (LocalConfiguration.current.screenWidthDp * 0.1f).dp

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

/**
 * Time played in the match, ticking every second on the watch itself from the
 * phone's `clockBase` — the phone only pushes on points, so its `clock` string
 * would sit still between them. Paused (no base): the frozen `clock`. The timer glyph
 * keeps it from being mistaken for the time of day curved along the top.
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
    val color = MaterialTheme.colorScheme.onSurfaceVariant
    Row(verticalAlignment = Alignment.CenterVertically) {
        Icon(Symbols.Timer, contentDescription = null, modifier = Modifier.size(12.dp), tint = color)
        Spacer(Modifier.width(2.dp))
        Text(label, style = MaterialTheme.typography.bodySmall, color = color)
    }
}

/**
 * The score face, laid out for a ROUND screen: heart rate and match clock centred under
 * the curved time of day, the two teams side by side as big tappable halves, and the set
 * and game score centred at the bottom, above the page dots.
 */
@Composable
private fun ScorePage(
    state: MatchState,
    liveBpm: Int,
    pendingTaps: Int,
    onScore: (String) -> Unit,
    onSetChoice: (String) -> Unit,
    locked: Boolean,
) {
    val paused = state.paused
    val scheme = MaterialTheme.colorScheme
    Column(
        // The bottom padding lifts the footer to where the round face is still wide enough for
        // it; the page dots sit in the gap underneath.
        modifier = Modifier.fillMaxSize().padding(top = 24.dp, bottom = 26.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            if (liveBpm > 0) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(
                        Symbols.Heart,
                        contentDescription = "Heart rate",
                        modifier = Modifier.size(12.dp),
                        tint = WatchColors.accent,
                    )
                    Spacer(Modifier.width(2.dp))
                    Text("$liveBpm", style = MaterialTheme.typography.bodySmall, color = WatchColors.accent)
                }
            }
            MatchClock(state)
        }

        // During a squash "choice" tie-break the decision is mandatory: the
        // short/long buttons replace the score halves. Once a choice is staged
        // (from either surface) the phone clears choicePending and moves the
        // staged call into `status`, so the score face returns on the next
        // state push — the phone owns the truth (docs/watch-sync.md).
        if (state.choicePending) {
            ChoiceButtons(onChoose = onSetChoice)
            return@Column
        }

        // While paused, dim the halves and swallow taps — the phone rejects points
        // when paused anyway, but this keeps the watch honest (docs/watch-sync.md).
        Box(
            modifier = Modifier
                .weight(1f)
                .fillMaxWidth()
                .padding(horizontal = 10.dp, vertical = 4.dp)
                .alpha(if (paused) DISABLED_ALPHA else 1f),
        ) {
            Row(modifier = Modifier.fillMaxSize(), horizontalArrangement = Arrangement.spacedBy(3.dp)) {
                // Outer corners follow the round screen; the seam between the halves stays tight.
                TeamHalf(
                    modifier = Modifier.weight(1f).fillMaxHeight(),
                    shape = RoundedCornerShape(topStart = 52.dp, bottomStart = 52.dp, topEnd = 8.dp, bottomEnd = 8.dp),
                    short = state.teamA.short,
                    point = state.pointA,
                    serving = state.teamA.serving,
                    servingSide = state.teamA.servingSide,
                    teamColor = WatchColors.accent,
                    servingContainer = scheme.primaryContainer,
                    onServingContainer = scheme.onPrimaryContainer,
                    onTeamColor = scheme.onPrimary,
                    enabled = !paused,
                    onClick = { onScore("A") },
                )
                TeamHalf(
                    modifier = Modifier.weight(1f).fillMaxHeight(),
                    shape = RoundedCornerShape(topStart = 8.dp, bottomStart = 8.dp, topEnd = 52.dp, bottomEnd = 52.dp),
                    short = state.teamB.short,
                    point = state.pointB,
                    serving = state.teamB.serving,
                    servingSide = state.teamB.servingSide,
                    teamColor = WatchColors.teamB,
                    servingContainer = scheme.tertiaryContainer,
                    onServingContainer = scheme.onTertiaryContainer,
                    onTeamColor = scheme.onTertiary,
                    enabled = !paused,
                    onClick = { onScore("B") },
                )
            }
            // The call that matters right now — game point, set point, deuce — as the phone
            // words it, in a pill over the seam where the two halves meet.
            if (state.status.isNotEmpty()) {
                Text(
                    state.status,
                    modifier = Modifier
                        .align(Alignment.BottomCenter)
                        .clip(CircleShape)
                        .background(scheme.primary)
                        .padding(horizontal = 10.dp, vertical = 2.dp),
                    style = MaterialTheme.typography.labelSmall,
                    color = scheme.onPrimary,
                    maxLines = 1,
                )
            }
        }

        // Which set/game and the score around it — never the point score again. A live
        // match needs no status label; only "Paused" and "Locked" are worth one. While the
        // first serve is still open the next tap takes the serve, so say so.
        val undecidedServe = !state.teamA.serving && !state.teamB.serving
        val footer = listOfNotNull(
            if (paused) "Paused" else null,
            if (locked) "Locked" else null,
            if (undecidedServe && !paused) "Tap who serves" else state.contextLine.ifEmpty { null },
        ).joinToString(" · ")
        // Taps the phone has not taken yet: the score above is not moving because the
        // phone is out of reach, not because the tap missed — so say how many are waiting.
        Text(
            if (pendingTaps > 0) "Waiting for phone · $pendingTaps" else footer,
            style = MaterialTheme.typography.bodySmall,
            color = if (pendingTaps > 0) scheme.primary else scheme.onSurfaceVariant,
            maxLines = 1,
        )
    }
}

/** The squash "choice" tie-break decision — short (set 1) or long (set 2). */
@Composable
private fun ChoiceButtons(onChoose: (String) -> Unit) {
    Column(
        modifier = Modifier.fillMaxSize().padding(horizontal = 16.dp, vertical = 4.dp),
        verticalArrangement = Arrangement.spacedBy(4.dp, Alignment.CenterVertically),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(
            "Set 1 or 2?",
            style = MaterialTheme.typography.titleSmall,
            color = MaterialTheme.colorScheme.primary,
        )
        Button(
            onClick = { onChoose("one") },
            modifier = Modifier.fillMaxWidth(),
            secondaryLabel = { Text("Next point wins") },
        ) {
            Text("Short · set 1")
        }
        FilledTonalButton(
            onClick = { onChoose("two") },
            modifier = Modifier.fillMaxWidth(),
            secondaryLabel = { Text("Two more points") },
        ) {
            Text("Long · set 2")
        }
    }
}

/** The actions face — undo, pause/resume, stop-and-save, and a guarded full cancel. */
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
    val undoSource = remember { MutableInteractionSource() }
    val pauseSource = remember { MutableInteractionSource() }
    Column(
        modifier = Modifier.fillMaxSize().padding(horizontal = edgeInset(), vertical = 22.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(4.dp, Alignment.CenterVertically),
    ) {
        if (locked) {
            HoldToUnlock(onUnlock)
        } else if (paused) {
            Text(
                "Paused",
                style = MaterialTheme.typography.titleSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        // A button group: the pressed button widens and squeezes its neighbour.
        ButtonGroup(modifier = Modifier.fillMaxWidth().height(48.dp), contentPadding = PaddingValues(0.dp)) {
            FilledTonalIconButton(
                onClick = onUndo,
                modifier = Modifier.animateWidth(undoSource).fillMaxHeight(),
                enabled = !paused,
                interactionSource = undoSource,
            ) {
                Icon(Symbols.Undo, contentDescription = "Undo")
            }
            FilledIconButton(
                onClick = onPause,
                modifier = Modifier.animateWidth(pauseSource).fillMaxHeight().weight(1.4f),
                interactionSource = pauseSource,
            ) {
                Icon(
                    if (paused) Symbols.Play else Symbols.Pause,
                    contentDescription = if (paused) "Resume" else "Pause",
                )
            }
        }
        if (confirmingCancel) {
            // Inline confirm rather than a dialog: a dialog would not rotate with a flipped
            // screen. Discard is one deliberate tap away.
            Text(
                "Discard? The score is lost",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                CompactButton(
                    onClick = onCancel,
                    colors = ButtonDefaults.buttonColors(
                        containerColor = MaterialTheme.colorScheme.errorContainer,
                        contentColor = MaterialTheme.colorScheme.onErrorContainer,
                    ),
                ) {
                    Text("Discard")
                }
                CompactButton(onClick = { confirmingCancel = false }) { Text("Keep") }
            }
        } else {
            // Stop AND save — "court time's up, don't lose the score". Tonal: pause is the
            // one filled action on this face.
            FilledTonalButton(
                onClick = onStop,
                modifier = Modifier.fillMaxWidth().height(44.dp),
                icon = { Icon(Symbols.Stop, contentDescription = null) },
            ) {
                Text("Stop & save")
            }
            CompactButton(
                onClick = { confirmingCancel = true },
                colors = ButtonDefaults.childButtonColors(contentColor = MaterialTheme.colorScheme.error),
            ) {
                Text("Cancel match")
            }
        }
    }
}

/**
 * Lock and flip toggles for a live match (the idle screen has them too). Turning the lock
 * on is always allowed; turning it off waits for the hold-to-unlock, so a stray tap can't
 * drop the lock.
 */
@Composable
private fun SettingsPage(
    lockEnabled: Boolean,
    locked: Boolean,
    flipped: Boolean,
    onLockChange: (Boolean) -> Unit,
    onFlipChange: (Boolean) -> Unit,
    onUnlock: () -> Unit,
) {
    Column(
        modifier = Modifier.fillMaxSize().padding(horizontal = edgeInset(), vertical = 22.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(4.dp, Alignment.CenterVertically),
    ) {
        if (locked) HoldToUnlock(onUnlock)
        SwitchButton(
            checked = lockEnabled,
            // Locked means the lock is on and not yet released, so this is the only blocked toggle.
            onCheckedChange = onLockChange,
            enabled = !locked,
            modifier = Modifier.fillMaxWidth(),
            icon = { Icon(Symbols.Lock, contentDescription = null) },
        ) {
            Text("Match lock")
        }
        SwitchButton(
            checked = flipped,
            onCheckedChange = onFlipChange,
            modifier = Modifier.fillMaxWidth(),
            icon = { Icon(Symbols.Flip, contentDescription = null) },
        ) {
            Text("Flip screen")
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
    val scheme = MaterialTheme.colorScheme
    Row(
        modifier = Modifier
            .clip(CircleShape)
            .background(scheme.surfaceContainerLow)
            .pointerInput(Unit) {
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
            }
            .padding(start = 6.dp, end = 12.dp, top = 4.dp, bottom = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Box(contentAlignment = Alignment.Center) {
            Canvas(Modifier.size(24.dp)) {
                val stroke = 3.dp.toPx()
                val inset = stroke / 2f
                drawCircle(
                    color = scheme.outlineVariant,
                    radius = size.minDimension / 2f - inset,
                    style = Stroke(width = stroke),
                )
                drawArc(
                    scheme.primary,
                    startAngle = -90f,
                    sweepAngle = 360f * progress.value,
                    useCenter = false,
                    topLeft = Offset(inset, inset),
                    size = Size(size.width - stroke, size.height - stroke),
                    style = Stroke(width = stroke, cap = StrokeCap.Round),
                )
            }
            Icon(
                Symbols.Lock,
                contentDescription = null,
                modifier = Modifier.size(12.dp),
                tint = scheme.primary,
            )
        }
        Text("Hold to unlock", style = MaterialTheme.typography.labelSmall, color = scheme.primary)
    }
}

/**
 * One team's half of the side-by-side score face: serve mark + name over the big point.
 * The serving team's half lights up in its own colour — the one thing that must read at a
 * glance mid-rally.
 */
@Composable
private fun TeamHalf(
    modifier: Modifier,
    shape: Shape,
    short: String,
    point: String,
    serving: Boolean,
    servingSide: String?,
    teamColor: Color,
    servingContainer: Color,
    onServingContainer: Color,
    onTeamColor: Color,
    enabled: Boolean,
    onClick: () -> Unit,
) {
    val scheme = MaterialTheme.colorScheme
    Column(
        modifier = modifier
            .clip(shape)
            .background(if (serving) servingContainer else scheme.surfaceContainerLow)
            .clickable(enabled = enabled, onClickLabel = "Point $short", onClick = onClick),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            if (serving) {
                ServeMark(
                    color = teamColor,
                    onColor = onTeamColor,
                    label = if (servingSide == "right") "R" else if (servingSide == "left") "L" else null,
                )
            }
            Text(
                short,
                style = MaterialTheme.typography.labelMedium,
                color = if (serving) onServingContainer else teamColor,
                maxLines = 1,
            )
        }
        Text(
            point,
            style = MaterialTheme.typography.numeralLarge,
            color = if (serving) onServingContainer else scheme.onSurface,
            maxLines = 1,
        )
    }
}

/**
 * The result: who won, the final line, and Done on the edge. The phone already saved the
 * match on the deciding rally; Done only sends the watch back to idle.
 */
@Composable
private fun MatchWonScreen(state: MatchState, onEnd: () -> Unit) {
    val won = state.won
    val scheme = MaterialTheme.colorScheme
    val scoreLine = won?.scoreLine ?: state.games
    Box(Modifier.fillMaxSize()) {
        Column(
            modifier = Modifier.fillMaxSize().padding(start = 14.dp, end = 14.dp, top = 26.dp, bottom = 58.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            Text(
                if (won?.ownerWon != false) "Match won" else "Match lost",
                style = MaterialTheme.typography.titleMedium,
                color = scheme.primary,
            )
            Text(
                won?.winnerShort ?: state.teamA.short,
                style = MaterialTheme.typography.displayMedium,
                maxLines = 1,
            )
            Text(
                scoreLine,
                // Three sets ("6-0 · 0-6 · 10-8") only fit the round face one size down.
                style = if (scoreLine.length > 9) {
                    MaterialTheme.typography.titleLarge
                } else {
                    MaterialTheme.typography.displaySmall
                },
                color = scheme.onSurfaceVariant,
                textAlign = TextAlign.Center,
                maxLines = 1,
            )
            Text(
                listOf(won?.duration ?: "", "Saved to phone").filter { it.isNotEmpty() }.joinToString(" · "),
                style = MaterialTheme.typography.bodyExtraSmall,
                color = scheme.onSurfaceVariant,
            )
        }
        // Done lets the user leave the result — the next state push lands the watch on idle.
        EdgeButton(onClick = onEnd, modifier = Modifier.align(Alignment.BottomCenter)) { Text("Done") }
    }
}
