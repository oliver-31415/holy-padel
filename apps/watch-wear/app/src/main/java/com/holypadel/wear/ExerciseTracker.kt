package com.holypadel.wear

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.os.SystemClock
import android.util.Log
import androidx.core.content.ContextCompat
import androidx.health.services.client.ExerciseUpdateCallback
import androidx.health.services.client.HealthServices
import androidx.health.services.client.data.Availability
import androidx.health.services.client.data.DataType
import androidx.health.services.client.data.DataTypeAvailability
import androidx.health.services.client.data.ExerciseConfig
import androidx.health.services.client.data.ExerciseLapSummary
import androidx.health.services.client.data.ExerciseState
import androidx.health.services.client.data.ExerciseType
import androidx.health.services.client.data.ExerciseUpdate
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.guava.await
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import org.json.JSONArray
import org.json.JSONObject
import java.time.Instant

/** Logcat tag for everything the exercise session does — filter on this when a match loses HR. */
internal const val EXERCISE_LOG_TAG = "HolyPadelExercise"

/**
 * The heart-rate permission for this OS level. Wear OS 6 (API 36) replaces
 * BODY_SENSORS with granular health permissions.
 */
internal fun heartRatePermission(): String =
    if (Build.VERSION.SDK_INT >= 36) {
        "android.permission.health.READ_HEART_RATE"
    } else {
        Manifest.permission.BODY_SENSORS
    }

internal fun hasHeartRatePermission(context: Context): Boolean =
    ContextCompat.checkSelfPermission(context, heartRatePermission()) ==
        PackageManager.PERMISSION_GRANTED

/**
 * Tracks the live match as a Health Services exercise: workout-grade heart rate,
 * calories, steps and distance while the scoreboard is up. Everything is best-effort — a watch
 * without sensors (or a declined permission) just means no fitness data; the
 * scoreboard itself must never be affected.
 *
 * Health Services has no padel type; RACQUETBALL is the closest calorie model
 * (enclosed-court racquet sport). Health Connect does not exist on Wear OS, so
 * the finished summary is sent to the phone (via WatchSync), which owns the
 * single Health Connect write.
 *
 * The single instance lives in [ExerciseSession] so it outlives the activity. It is
 * started by [ExerciseService], which keeps the process in the foreground for the
 * whole session. Only an explicit [end] (match stopped/cancelled on the phone) or
 * Health Services ending the exercise itself finishes a session — closing the
 * activity does not.
 */
class ExerciseTracker(context: Context) {
    data class LiveStats(val bpm: Int, val kcal: Double, val tracking: Boolean)

    private val appContext = context.applicationContext
    private val client = HealthServices.getClient(appContext).exerciseClient
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

    /**
     * Serialises every start/pause/resume/end call to Health Services. Without it an
     * end() racing a slow start could run before the start and leave the exercise
     * running on the watch with nothing tracking it.
     */
    private val lifecycle = Mutex()

    private val statsFlow = MutableStateFlow(LiveStats(bpm = 0, kcal = 0.0, tracking = false))
    val stats: StateFlow<LiveStats> = statsFlow

    /** Fired once per finished exercise with the summary JSON for the phone. */
    var onSummary: ((String) -> Unit)? = null

    /**
     * Fired when a session stops existing: after [end] completes, when the exercise
     * fails to start, or when Health Services ends it. The service stops itself here.
     */
    var onFinished: (() -> Unit)? = null

    /** True from a [start] call until the session is ended or fails. Guards double starts. */
    private var active = false

    /** True once Health Services has actually accepted the exercise; guarded by [lifecycle]. */
    private var exerciseStarted = false
    private var lastState: ExerciseState? = null

    private var matchStartedAt = 0L
    private var maxBpm = 0
    private val samples = mutableListOf<Pair<Long, Int>>()
    private var lastSampleAt = 0L

    /** Steps and metres per [MOTION_BUCKET_MS] bucket, keyed by the bucket's end. */
    private val motion = sortedMapOf<Long, DoubleArray>()

    /** The wall-clock instant the device booted — data points are stamped from boot. */
    private fun bootInstant(): Instant =
        Instant.ofEpochMilli(System.currentTimeMillis() - SystemClock.elapsedRealtime())

    private val callback = object : ExerciseUpdateCallback {
        override fun onExerciseUpdateReceived(update: ExerciseUpdate) {
            val boot = bootInstant()
            val info = update.exerciseStateInfo
            if (info.state != lastState) {
                Log.i(EXERCISE_LOG_TAG, "Exercise state ${lastState ?: "none"} -> ${info.state}")
                lastState = info.state
            }
            if (active && (info.state.isEnding || info.state.isEnded)) {
                Log.w(
                    EXERCISE_LOG_TAG,
                    "Health Services ended the exercise mid-match: state=${info.state}, " +
                        "endReason=${info.endReason}",
                )
                active = false
                scope.launch { finishSession(endExercise = false) }
                return
            }
            val metrics = update.latestMetrics
            // Keep EVERY reading in the update at its own timestamp. With the
            // screen off Health Services batches readings and delivers them
            // minutes apart; taking only the newest one per delivery (stamped
            // with arrival time) left long gaps in the stored series.
            val heartRate = metrics.getData(DataType.HEART_RATE_BPM)
            for (point in heartRate) {
                val bpm = point.value.toInt()
                if (bpm <= 0) continue
                if (bpm > maxBpm) maxBpm = bpm
                val t = point.getTimeInstant(boot).toEpochMilli()
                // Downsample to one point per 5s — a 90-minute match stays well
                // under the Data Layer message size limit.
                if (t - lastSampleAt >= SAMPLE_INTERVAL_MS) {
                    samples.add(t to bpm)
                    lastSampleAt = t
                }
            }
            for (point in metrics.getData(DataType.STEPS)) {
                addMotion(point.getEndInstant(boot).toEpochMilli(), steps = point.value.toDouble())
            }
            for (point in metrics.getData(DataType.DISTANCE)) {
                addMotion(point.getEndInstant(boot).toEpochMilli(), meters = point.value)
            }
            val kcal = metrics.getData(DataType.CALORIES_TOTAL)?.total
            statsFlow.value = LiveStats(
                bpm = heartRate.lastOrNull()?.value?.toInt()?.takeIf { it > 0 } ?: statsFlow.value.bpm,
                kcal = kcal ?: statsFlow.value.kcal,
                tracking = true,
            )
        }

        override fun onLapSummaryReceived(lapSummary: ExerciseLapSummary) = Unit

        override fun onAvailabilityChanged(dataType: DataType<*, *>, availability: Availability) {
            // Heart rate dropping out (strap off, sensor lost) is the usual cause of a
            // gap in the series, so make it visible in logcat.
            if (availability.isMissingData()) {
                Log.w(EXERCISE_LOG_TAG, "Availability of $dataType changed to $availability")
            } else {
                Log.i(EXERCISE_LOG_TAG, "Availability of $dataType changed to $availability")
            }
        }

        override fun onRegistered() {
            Log.i(EXERCISE_LOG_TAG, "Exercise update callback registered")
        }

        override fun onRegistrationFailed(throwable: Throwable) {
            Log.e(EXERCISE_LOG_TAG, "Exercise update callback registration failed", throwable)
        }
    }

    /** Fold one steps/distance delta into its time bucket. */
    private fun addMotion(endedAt: Long, steps: Double = 0.0, meters: Double = 0.0) {
        val bucketEnd = (endedAt / MOTION_BUCKET_MS + 1) * MOTION_BUCKET_MS
        val bucket = motion.getOrPut(bucketEnd) { DoubleArray(2) }
        bucket[0] += steps
        bucket[1] += meters
    }

    /**
     * The data types to request: heart rate and calories always, steps and
     * distance only when the device supports them for this exercise — asking
     * for an unsupported type makes the whole exercise fail to start.
     */
    private suspend fun requestedDataTypes(): Set<DataType<*, *>> {
        val wanted = setOf<DataType<*, *>>(DataType.STEPS, DataType.DISTANCE)
        val supported = runCatching {
            client.getCapabilitiesAsync().await()
                .typeToCapabilities[ExerciseType.RACQUETBALL]
                ?.supportedDataTypes
                .orEmpty()
        }.getOrDefault(emptySet())
        return setOf<DataType<*, *>>(DataType.HEART_RATE_BPM, DataType.CALORIES_TOTAL) +
            wanted.intersect(supported)
    }

    /**
     * Start the exercise session. Returns false only when no session can run at all
     * (heart-rate permission missing), so the caller can drop its foreground service.
     * Returns true when a session is already running or has been launched. A failed
     * launch is logged and reported through [onFinished].
     */
    fun start(startedAt: Long): Boolean {
        if (active) return true
        // Opt-in only: with no sensor permission the exercise would fail to start
        // (or throw), so skip it — the scoreboard never depends on it.
        if (!hasHeartRatePermission(appContext)) {
            Log.w(EXERCISE_LOG_TAG, "Not starting exercise: heart-rate permission not granted")
            return false
        }
        active = true
        matchStartedAt = if (startedAt > 0) startedAt else System.currentTimeMillis()
        maxBpm = 0
        samples.clear()
        lastSampleAt = 0L
        motion.clear()
        lastState = null
        scope.launch {
            try {
                val dataTypes = requestedDataTypes()
                client.setUpdateCallback(callback)
                lifecycle.withLock {
                    // An end() that arrived while this was queued has already finished the session.
                    if (!active) return@launch
                    client.startExerciseAsync(
                        ExerciseConfig(
                            exerciseType = ExerciseType.RACQUETBALL,
                            dataTypes = dataTypes,
                            isAutoPauseAndResumeEnabled = false,
                            isGpsEnabled = false,
                            exerciseGoals = emptyList(),
                        ),
                    ).await()
                    exerciseStarted = true
                }
                Log.i(EXERCISE_LOG_TAG, "Exercise started")
                statsFlow.value = LiveStats(bpm = 0, kcal = 0.0, tracking = true)
            } catch (e: Exception) {
                Log.e(EXERCISE_LOG_TAG, "startExerciseAsync failed; no heart rate for this match", e)
                if (active) {
                    active = false
                    onFinished?.invoke()
                }
            }
        }
        return true
    }

    /** Pause the exercise session while the match is paused. No-op when idle. */
    fun pause() {
        if (!statsFlow.value.tracking) return
        scope.launch {
            lifecycle.withLock {
                try {
                    client.pauseExerciseAsync().await()
                } catch (e: Exception) {
                    Log.w(EXERCISE_LOG_TAG, "pauseExerciseAsync failed", e)
                }
            }
        }
    }

    /** Resume the exercise session when the match resumes. No-op when idle. */
    fun resume() {
        if (!statsFlow.value.tracking) return
        scope.launch {
            lifecycle.withLock {
                try {
                    client.resumeExerciseAsync().await()
                } catch (e: Exception) {
                    Log.w(EXERCISE_LOG_TAG, "resumeExerciseAsync failed", e)
                }
            }
        }
    }

    /** End tracking and hand the summary to [onSummary]. No-op when idle. */
    fun end() {
        if (!active) return
        active = false
        statsFlow.value = statsFlow.value.copy(tracking = false)
        scope.launch { finishSession(endExercise = true) }
    }

    private suspend fun finishSession(endExercise: Boolean) {
        lifecycle.withLock {
            if (endExercise && exerciseStarted) {
                try {
                    client.endExerciseAsync().await()
                } catch (e: Exception) {
                    Log.e(EXERCISE_LOG_TAG, "endExerciseAsync failed", e)
                }
            }
            exerciseStarted = false
        }
        val summary = buildSummary()
        statsFlow.value = LiveStats(bpm = 0, kcal = 0.0, tracking = false)
        if (summary != null) {
            onSummary?.invoke(summary)
        } else {
            Log.w(EXERCISE_LOG_TAG, "No heart-rate or motion data recorded; no workout summary sent")
        }
        onFinished?.invoke()
    }

    private fun buildSummary(): String? {
        val kcal = statsFlow.value.kcal
        if (samples.isEmpty() && kcal <= 0.0 && motion.isEmpty()) {
            return null
        }
        val avgBpm = if (samples.isEmpty()) 0 else samples.sumOf { it.second } / samples.size
        return JSONObject().apply {
            put("startedAt", matchStartedAt)
            put("endedAt", System.currentTimeMillis())
            put("kcal", kcal)
            put("avgBpm", avgBpm)
            put("maxBpm", maxBpm)
            put(
                "samples",
                JSONArray().apply {
                    for ((t, bpm) in samples) {
                        put(JSONObject().apply { put("t", t); put("bpm", bpm) })
                    }
                },
            )
            put(
                "motion",
                JSONArray().apply {
                    for ((t, bucket) in motion) {
                        put(
                            JSONObject().apply {
                                put("t", t)
                                put("steps", bucket[0].toLong())
                                put("meters", Math.round(bucket[1] * 10) / 10.0)
                            },
                        )
                    }
                },
            )
        }.toString()
    }

    private companion object {
        const val SAMPLE_INTERVAL_MS = 5_000L
        const val MOTION_BUCKET_MS = 10_000L
    }
}

private fun Availability.isMissingData(): Boolean =
    this == DataTypeAvailability.UNAVAILABLE || this == DataTypeAvailability.UNAVAILABLE_DEVICE_OFF_BODY
