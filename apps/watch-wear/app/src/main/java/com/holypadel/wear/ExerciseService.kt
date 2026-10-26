package com.holypadel.wear

import android.app.Notification
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.util.Log
import androidx.core.app.NotificationChannelCompat
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat
import androidx.wear.ongoing.OngoingActivity
import androidx.wear.ongoing.Status

/**
 * The process-level owner of a live match's Health Services exercise.
 *
 * The activity can be closed or the screen can dim at any time, and an activity-scoped
 * exercise would die with it, cutting heart rate out early. Running the exercise inside
 * a foreground service of type `health` keeps it alive for the whole match. The service
 * stops only once the exercise has finished (see [ExerciseTracker.onFinished]).
 */
class ExerciseService : Service() {
    private lateinit var tracker: ExerciseTracker

    override fun onCreate() {
        super.onCreate()
        tracker = ExerciseSession.tracker(this)
        tracker.onFinished = { stopForegroundAndSelf() }
        createChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val startedAt = intent?.getLongExtra(EXTRA_STARTED_AT, 0L) ?: 0L
        // Promote before anything else: the system requires startForeground within
        // a few seconds of startForegroundService.
        // The health type only exists from API 34 (minSdk here is 30); older releases
        // take no type and the manifest attribute is not enforced there.
        val foregroundType = if (Build.VERSION.SDK_INT >= 34) {
            ServiceInfo.FOREGROUND_SERVICE_TYPE_HEALTH
        } else {
            0
        }
        try {
            ServiceCompat.startForeground(
                this,
                NOTIFICATION_ID,
                buildNotification(),
                foregroundType,
            )
        } catch (e: Exception) {
            Log.e(EXERCISE_LOG_TAG, "startForeground failed; exercise not started", e)
            stopSelf()
            return START_NOT_STICKY
        }
        if (!tracker.start(startedAt)) {
            stopForegroundAndSelf()
        }
        return START_NOT_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun stopForegroundAndSelf() {
        ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    private fun createChannel() {
        val channel = NotificationChannelCompat.Builder(
            CHANNEL_ID,
            NotificationManager.IMPORTANCE_LOW,
        )
            .setName(getString(R.string.exercise_channel_name))
            .build()
        NotificationManagerCompat.from(this).createNotificationChannel(channel)
    }

    private fun buildNotification(): Notification {
        val builder = NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(getString(R.string.app_name))
            .setContentText(getString(R.string.exercise_notification_text))
            .setOngoing(true)
            .setOnlyAlertOnce(true)
        // Surfaces the live match on the watch face (ongoing chip). Tapping it reopens
        // the app; the service stays a health foreground service either way.
        val touchIntent = PendingIntent.getActivity(
            this,
            0,
            Intent(this, MainActivity::class.java)
                .addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        OngoingActivity.Builder(this, NOTIFICATION_ID, builder)
            .setStaticIcon(R.mipmap.ic_launcher)
            .setTouchIntent(touchIntent)
            .setTitle(getString(R.string.app_name))
            .setStatus(
                Status.Builder().addTemplate(getString(R.string.ongoing_status)).build(),
            )
            .build()
            .apply(this)
        return builder.build()
    }

    companion object {
        const val EXTRA_STARTED_AT = "startedAt"
        private const val CHANNEL_ID = "exercise"
        private const val NOTIFICATION_ID = 1001

        /**
         * Start the exercise for a live match. The caller must be in the foreground
         * (the activity is) and the heart-rate permission must already be granted —
         * otherwise the system refuses the foreground promotion.
         */
        fun start(context: Context, startedAt: Long) {
            val intent = Intent(context, ExerciseService::class.java)
                .putExtra(EXTRA_STARTED_AT, startedAt)
            try {
                ContextCompat.startForegroundService(context, intent)
            } catch (e: IllegalStateException) {
                Log.e(EXERCISE_LOG_TAG, "startForegroundService refused; no heart rate for this match", e)
            }
        }
    }
}

/**
 * Holds the one [ExerciseTracker] for the process, so the activity, the service and
 * the phone-state listener share the same session regardless of which one is alive.
 * The workout summary is sent through the application context, so it still reaches
 * the phone when the session ends with the activity closed.
 */
object ExerciseSession {
    @Volatile
    private var instance: ExerciseTracker? = null

    @Synchronized
    fun tracker(context: Context): ExerciseTracker =
        instance ?: ExerciseTracker(context.applicationContext).also { tracker ->
            val sync = WatchSync(context.applicationContext)
            tracker.onSummary = { summary -> sync.sendWorkout(summary) }
            instance = tracker
        }
}
