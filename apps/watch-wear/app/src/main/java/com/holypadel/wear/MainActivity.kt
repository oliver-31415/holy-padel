package com.holypadel.wear

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.view.WindowManager
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.core.content.ContextCompat
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

    /** Ask for the runtime permissions at most once per process — never nag. */
    private var permissionRequested = false

    private val permissionLauncher =
        registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { _ ->
            // Heart rate starts the exercise if it isn't running yet. If it is, only the
            // notification permission was asked for, so re-post the ongoing notification
            // rather than restart the tracker. Declining heart rate just means no bpm.
            // Only a live match starts one: the lock toggle can ask from the idle screen.
            if (lastPhase == Phase.LIVE && hasHeartRatePermission(this) && !ExerciseService.running) {
                ExerciseService.start(this, pendingStartedAt)
            } else {
                ExerciseService.refreshNotification(this)
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
                // Keep the screen awake for the whole match: a dimmed or sleeping screen
                // costs an extra tap to wake before every point can be scored.
                if (phase == Phase.LIVE) {
                    window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
                } else {
                    window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
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
            var flipped by remember { mutableStateOf(lockPrefs.isFlipped()) }
            WatchApp(
                lockEnabled = lockEnabled,
                onLockChange = { on ->
                    lockEnabled = on
                    lockPrefs.setEnabled(on)
                    // The lock is for a live match, and its ongoing chip needs the permission.
                    if (on) requestNotificationIfMissing()
                },
                flipped = flipped,
                onFlipChange = { on ->
                    flipped = on
                    lockPrefs.setFlipped(on)
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
        // Ask only for what is missing, once per process; if it's declined we never ask
        // again. The UI is already up and interactive either way — nothing gates on this.
        if (hasHeartRatePermission(this)) {
            // The exercise doesn't need the notification permission, so start now. The
            // service re-posts its notification when that permission is granted.
            ExerciseService.start(this, startedAt)
            requestNotificationIfMissing()
        } else if (!permissionRequested) {
            permissionRequested = true
            val permissions = buildList {
                add(heartRatePermission())
                if (!isGranted(Manifest.permission.ACTIVITY_RECOGNITION)) {
                    add(Manifest.permission.ACTIVITY_RECOGNITION)
                }
                if (needsNotificationPermission()) add(Manifest.permission.POST_NOTIFICATIONS)
            }
            permissionLauncher.launch(permissions.toTypedArray())
        }
    }

    /** Without the notification permission the ongoing chip and foreground notification stay hidden. */
    private fun requestNotificationIfMissing() {
        if (!permissionRequested && needsNotificationPermission()) {
            permissionRequested = true
            permissionLauncher.launch(arrayOf(Manifest.permission.POST_NOTIFICATIONS))
        }
    }

    /** Runtime notification permission only exists from API 33. */
    private fun needsNotificationPermission(): Boolean =
        Build.VERSION.SDK_INT >= 33 && !isGranted(Manifest.permission.POST_NOTIFICATIONS)

    private fun isGranted(permission: String): Boolean =
        ContextCompat.checkSelfPermission(this, permission) == PackageManager.PERMISSION_GRANTED

    override fun onResume() {
        super.onResume()
        sync.start()
    }

    override fun onPause() {
        super.onPause()
        sync.stop()
    }
}
