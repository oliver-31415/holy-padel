package expo.modules.livenotification

import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.util.Log
import androidx.core.app.ServiceCompat

/**
 * Keeps the app alive for as long as a match is live.
 *
 * Watch intents and the notification's buttons are applied by the app's JS, which only
 * runs while Android keeps the process. A phone pocketed for a ninety-minute match is
 * exactly when Android likes to freeze or kill a background app — and then every point
 * tapped on the watch went nowhere. A foreground service tells Android the app is doing
 * something the user can see (the live-score notification is its notification), so the
 * process, the watch sync and the buttons all stay up until the match ends.
 *
 * It holds no state and does no work of its own: [LiveNotificationModule] starts it when
 * a match goes live, keeps the notification current, and stops it when the match ends.
 */
class LiveMatchService : Service() {
  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val notification = LiveNotificationModule.latest
    if (notification == null) {
      // The match ended between the start request and now.
      stopSelf()
      return START_NOT_STICKY
    }
    // The type only exists from API 29, and is only required from API 34.
    val type = if (Build.VERSION.SDK_INT >= 29) {
      ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE
    } else {
      0
    }
    try {
      ServiceCompat.startForeground(this, LiveNotificationModule.NOTIFICATION_ID, notification, type)
      running = true
    } catch (e: Exception) {
      // Refused (app not in the foreground, or the type is not allowed on this device):
      // the match still works, it just isn't protected. The module falls back to a
      // plain notification and tries again the next time the app is opened.
      Log.w(TAG, "Foreground promotion refused; live match not kept alive", e)
      running = false
      stopSelf()
    }
    // Not sticky: restarted without the app's JS there would be nothing to keep alive.
    return START_NOT_STICKY
  }

  override fun onDestroy() {
    running = false
    super.onDestroy()
  }

  companion object {
    private const val TAG = "HolyPadelLive"

    /** True while the service is in the foreground with the live notification. */
    @Volatile
    var running = false
      private set

    /**
     * Ask for the service. Only allowed while the app is in the foreground — in the
     * background Android throws, which is caught: false means "not started".
     */
    fun start(context: Context): Boolean =
      try {
        context.startService(Intent(context, LiveMatchService::class.java))
        true
      } catch (e: Exception) {
        Log.i(TAG, "Live match service not started (app in the background)")
        false
      }

    fun stop(context: Context) {
      runCatching { context.stopService(Intent(context, LiveMatchService::class.java)) }
      running = false
    }
  }
}
