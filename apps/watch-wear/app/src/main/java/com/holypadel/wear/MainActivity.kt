package com.holypadel.wear

import android.Manifest
import android.content.Intent
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.lifecycle.lifecycleScope
import com.holypadel.wear.ui.CourtColors
import com.holypadel.wear.ui.WatchApp
import kotlinx.coroutines.launch

/**
 * The whole Wear app: mirror the phone's live match, send score/undo intents
 * back, and track the match as a Health Services exercise (heart rate +
 * calories) while it runs. All scoring lives on the phone (docs/watch-sync.md);
 * the finished workout summary is sent there too — the phone is the single
 * Health Connect writer (Health Connect does not exist on Wear OS).
 */
class MainActivity : ComponentActivity() {
    private lateinit var sync: WatchSync
    private lateinit var tracker: ExerciseTracker
    private lateinit var lockPrefs: MatchLockPrefs
    private var lastPhase = Phase.IDLE
    private var lastPaused = false
    private var pendingStartedAt = 0L

    /** Ask for the sensor permission at most once per process — never nag. */
    private var permissionRequested = false

    private val permissionLauncher =
        registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { _ ->
            // Only the heart-rate grant matters: the service needs it to promote to a
            // health foreground service. If it was declined the scoreboard simply runs
            // without bpm, which is fine.
            if (hasHeartRatePermission(this)) {
                ExerciseService.start(this, pendingStartedAt)
            }
        }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        sync = WatchSync(this)
        tracker = ExerciseSession.tracker(this)
        lockPrefs = MatchLockPrefs(this)

        // Drive the exercise session from phase transitions in the mirrored state.
        lifecycleScope.launch {
            sync.state.collect { state ->
                CourtColors.applyPalette(state.palette)
                val phase = state.phase
                if (phase == Phase.LIVE && lastPhase != Phase.LIVE) {
                    startTracking(state.startedAt)
                } else if (phase != Phase.LIVE && lastPhase == Phase.LIVE) {
                    tracker.end()
                }
                // Mirror pause/resume onto the workout session while live; only act
                // on a real change so we never spam the exercise client.
                if (phase == Phase.LIVE && state.paused != lastPaused) {
                    if (state.paused) tracker.pause() else tracker.resume()
                }
                lastPhase = phase
                lastPaused = if (phase == Phase.LIVE) state.paused else false
            }
        }

        handleTileAction(intent)

        setContent {
            val state by sync.state.collectAsState()
            val stats by tracker.stats.collectAsState()
            var lockEnabled by remember { mutableStateOf(lockPrefs.isEnabled()) }
            WatchApp(
                lockEnabled = lockEnabled,
                onLockChange = { on ->
                    lockEnabled = on
                    lockPrefs.setEnabled(on)
                },
                state = state,
                liveBpm = if (stats.tracking) stats.bpm else 0,
                onScore = { team -> sync.score(team) },
                onUndo = { sync.undo() },
                onSetChoice = { choice -> sync.setChoice(choice) },
                onStartLast = { sync.startLast() },
                onPause = { sync.pause() },
                onStop = { sync.stopMatch() },
                onCancel = { sync.cancelMatch() },
                onEnd = { sync.end() },
            )
        }
    }

    /**
     * START LAST on the tile opens the app with an extra: send the same
     * start-last intent the idle screen's button does. Consumed so a rotation
     * or recreation doesn't start a second rematch; the phone ignores it while
     * a match is already live.
     */
    private fun handleTileAction(intent: Intent?) {
        if (intent?.getStringExtra(TILE_ACTION_EXTRA) == TILE_ACTION_START_LAST) {
            intent.removeExtra(TILE_ACTION_EXTRA)
            sync.startLast()
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handleTileAction(intent)
    }

    private fun startTracking(startedAt: Long) {
        pendingStartedAt = startedAt
        // Already granted (e.g. a previous match): start straight away, no prompt.
        // Otherwise ask exactly once per process; if it's declined we simply never
        // ask again and the scoreboard runs on without any fitness data. Either
        // way the UI is already up and fully interactive — nothing gates on this.
        when {
            hasHeartRatePermission(this) -> ExerciseService.start(this, startedAt)
            !permissionRequested -> {
                permissionRequested = true
                val permissions = buildList {
                    add(heartRatePermission())
                    add(Manifest.permission.ACTIVITY_RECOGNITION)
                    // Runtime notification permission only exists from API 33.
                    if (Build.VERSION.SDK_INT >= 33) add(Manifest.permission.POST_NOTIFICATIONS)
                }
                permissionLauncher.launch(permissions.toTypedArray())
            }
        }
    }

    override fun onResume() {
        super.onResume()
        sync.start()
    }

    override fun onPause() {
        super.onPause()
        sync.stop()
    }
}
