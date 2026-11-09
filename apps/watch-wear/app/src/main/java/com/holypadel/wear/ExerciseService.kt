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
        if (intent?.action == ACTION_REFRESH) {
            // Re-post the notification only. A refresh must never start a second tracker,
            // so it is ignored (and the service stopped) if no exercise is running.
            if (running) promote() else stopSelf()
            return START_NOT_STICKY
        }
        val startedAt = intent?.getLongExtra(EXTRA_STARTED_AT, 0L) ?: 0L
        // Promote before anything else: the system requires startForeground within
        // a few seconds of startForegroundService.
        if (!promote()) {
            stopSelf()
            return START_NOT_STICKY
        }
        if (tracker.start(startedAt)) {
            running = true
        } else {
            stopForegroundAndSelf()
        }
        return START_NOT_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        running = false
        super.onDestroy()
    }

    /** Post the foreground notification. False if the system refused the promotion. */
    private fun promote(): Boolean {
        // The health type only exists from API 34 (minSdk here is 30); older releases
        // take no type and the manifest attribute is not enforced there.
        val foregroundType = if (Build.VERSION.SDK_INT >= 34) {
            ServiceInfo.FOREGROUND_SERVICE_TYPE_HEALTH
        } else {
            0
        }
        return try {
            ServiceCompat.startForeground(
                this,
                NOTIFICATION_ID,
                buildNotification(),
                foregroundType,
            )
            true
        } catch (e: Exception) {
            Log.e(EXERCISE_LOG_TAG, "startForeground refused", e)
            false
        }
    }

    private fun stopForegroundAndSelf() {
        running = false
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
            // Workout category and immediate display keep the notification from being
            // deferred or demoted by the system while the exercise runs.
            .setCategory(NotificationCompat.CATEGORY_WORKOUT)
            .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
        // Surfaces the live match on the watch face (ongoing chip). Tapping it reopens
        // the app; the service stays a health foreground service either way.
        val touchIntent = PendingIntent.getActivity(
            this,
            0,
            Intent(this, MainActivity::class.java)
                .addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_NEW_TASK),
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
        private const val ACTION_REFRESH = "com.holypadel.wear.action.REFRESH_NOTIFICATION"
        private const val CHANNEL_ID = "exercise"
        private const val NOTIFICATION_ID = 1001

        /** True from a successful tracker start until the exercise finishes or is torn down. */
        @Volatile
        var running = false
            private set

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

        /**
         * Re-post the live notification, e.g. once POST_NOTIFICATIONS is granted: the
         * service was promoted without it, so the ongoing chip was never shown. Only an
         * already-running exercise is refreshed, so this never starts a tracker. It uses
         * startService, not startForegroundService, which would demand a fresh promotion.
         */
        fun refreshNotification(context: Context) {
            if (!running) return
            val intent = Intent(context, ExerciseService::class.java).setAction(ACTION_REFRESH)
            try {
                context.startService(intent)
            } catch (e: IllegalStateException) {
                Log.e(EXERCISE_LOG_TAG, "startService refused; notification not refreshed", e)
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
