package expo.modules.livenotification

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.net.Uri
import android.os.Build
import androidx.core.app.ActivityCompat
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record

/** One notification button: the id JS gets back, and its label. */
class LiveAction : Record {
  @Field val id: String = ""
  @Field val label: String = ""
}

/** Everything the notification shows — built in JS from the live match. */
class LiveContent : Record {
  @Field val title: String = ""
  @Field val text: String = ""
  /** Short status-bar chip text for Android 16 Live Updates, e.g. "40–30". */
  @Field val chip: String = ""
  /** Epoch ms the match clock counts from; 0 = no clock (paused). */
  @Field val clockBase: Double = 0.0
  @Field val color: String = "#FF6B35"
  /** Deep link the notification opens, e.g. holy-padel://live/<id>. */
  @Field val url: String = ""
  @Field val actions: List<LiveAction> = emptyList()
}

/**
 * The live match as an ongoing notification, so the score (and +point / undo)
 * is a pull-down away without opening the app. JS owns every string and every
 * decision; this only renders and forwards button taps as `onAction` events.
 * On Android 16 it asks to be promoted to a Live Update (a status-bar chip).
 *
 * While a match is live the notification belongs to [LiveMatchService], a
 * foreground service whose only job is to stop Android freezing or killing the
 * app mid-match — the watch sync and these buttons need the app's JS running.
 */
class LiveNotificationModule : Module() {
  companion object {
    const val CHANNEL_ID = "live-match"
    const val NOTIFICATION_ID = 4711
    const val EXTRA_ACTION = "action"

    /** The module instance whose JS is alive — the receiver forwards taps to it. */
    @Volatile
    internal var active: LiveNotificationModule? = null

    /** The notification for the match in play; null when nothing is live. */
    @Volatile
    internal var latest: Notification? = null
  }

  private val context: Context?
    get() = appContext.reactContext

  internal fun emitAction(action: String) {
    sendEvent("onAction", mapOf("action" to action))
  }

  override fun definition() = ModuleDefinition {
    Name("LiveNotification")

    Events("onAction")

    OnCreate { active = this@LiveNotificationModule }

    OnDestroy {
      if (active === this@LiveNotificationModule) active = null
      // The JS that kept the score current is gone; don't hold the process for nothing.
      latest = null
      context?.let { LiveMatchService.stop(it) }
    }

    // A match started from the watch finds the app in the background, where Android
    // refuses to start the service. Opening the app is the first chance to make good.
    OnActivityEntersForeground {
      val ctx = context
      if (ctx != null && latest != null && !LiveMatchService.running) LiveMatchService.start(ctx)
    }

    /** Ask for the notification permission (Android 13+); true when already granted. */
    Function("requestPermission") {
      val ctx = context ?: return@Function false
      if (canPost(ctx)) return@Function true
      val activity = appContext.currentActivity ?: return@Function false
      if (Build.VERSION.SDK_INT >= 33) {
        ActivityCompat.requestPermissions(activity, arrayOf(Manifest.permission.POST_NOTIFICATIONS), 0)
      }
      return@Function false
    }

    /**
     * Post or update the notification, and keep the app alive behind it. False when
     * notifications are blocked — the service still runs then, it just shows nothing.
     */
    Function("show") { content: LiveContent ->
      val ctx = context ?: return@Function false
      runCatching {
        ensureChannel(ctx)
        val notification = build(ctx, content)
        latest = notification
        // Not running yet: start it, and it posts `latest` itself as it goes foreground.
        if (!LiveMatchService.running) LiveMatchService.start(ctx)
        if (canPost(ctx)) NotificationManagerCompat.from(ctx).notify(NOTIFICATION_ID, notification)
      }
      canPost(ctx)
    }

    Function("hide") {
      latest = null
      context?.let {
        LiveMatchService.stop(it)
        NotificationManagerCompat.from(it).cancel(NOTIFICATION_ID)
      }
    }
  }

  private fun canPost(ctx: Context): Boolean =
    Build.VERSION.SDK_INT < 33 ||
      ContextCompat.checkSelfPermission(ctx, Manifest.permission.POST_NOTIFICATIONS) ==
      PackageManager.PERMISSION_GRANTED

  private fun ensureChannel(ctx: Context) {
    if (Build.VERSION.SDK_INT < 26) return
    val manager = ctx.getSystemService(NotificationManager::class.java) ?: return
    if (manager.getNotificationChannel(CHANNEL_ID) != null) return
    // LOW: in the status bar and shade, never a sound or a heads-up on every point.
    val channel = NotificationChannel(CHANNEL_ID, "Live match", NotificationManager.IMPORTANCE_LOW)
    channel.description = "The score of the match you're playing, with quick scoring buttons"
    channel.setShowBadge(false)
    manager.createNotificationChannel(channel)
  }

  private fun openIntent(ctx: Context, url: String): PendingIntent? {
    val intent = if (url.isEmpty()) {
      ctx.packageManager.getLaunchIntentForPackage(ctx.packageName)
    } else {
      Intent(Intent.ACTION_VIEW, Uri.parse(url)).setPackage(ctx.packageName)
    } ?: return null
    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
    return PendingIntent.getActivity(
      ctx,
      0,
      intent,
      PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
    )
  }

  private fun actionIntent(ctx: Context, index: Int, id: String): PendingIntent {
    val intent = Intent(ctx, LiveNotificationReceiver::class.java).putExtra(EXTRA_ACTION, id)
    return PendingIntent.getBroadcast(
      ctx,
      index + 1,
      intent,
      PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
    )
  }

  private fun build(ctx: Context, content: LiveContent): Notification {
    val builder = NotificationCompat.Builder(ctx, CHANNEL_ID)
      .setSmallIcon(R.drawable.ic_live_score)
      .setContentTitle(content.title)
      .setContentText(content.text)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setSilent(true)
      .setCategory(NotificationCompat.CATEGORY_STATUS)
      .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
      .setRequestPromotedOngoing(true)
    runCatching { builder.setColor(Color.parseColor(content.color)) }
    if (content.chip.isNotEmpty()) builder.setShortCriticalText(content.chip)
    if (content.clockBase > 0) {
      builder.setWhen(content.clockBase.toLong()).setShowWhen(true).setUsesChronometer(true)
    } else {
      builder.setShowWhen(false)
    }
    openIntent(ctx, content.url)?.let { builder.setContentIntent(it) }
    content.actions.forEachIndexed { index, action ->
      builder.addAction(0, action.label, actionIntent(ctx, index, action.id))
    }
    return builder.build()
  }
}
