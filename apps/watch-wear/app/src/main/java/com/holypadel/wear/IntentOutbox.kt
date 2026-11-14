package com.holypadel.wear

import android.content.Context
import android.os.Handler
import android.os.Looper
import androidx.core.content.edit
import com.google.android.gms.wearable.Wearable
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import org.json.JSONArray

/**
 * Delivers the watch's intents to the phone, and keeps them until it has.
 *
 * A tap used to be sent once to whichever nodes were connected at that instant, so a
 * tap made while the phone was briefly out of reach was dropped. Now every intent joins
 * a queue that is sent strictly in order and retried until a phone node accepts it —
 * a point scored during a Bluetooth hiccup lands when the link returns. [pending]
 * tells the UI how many taps are still waiting, so a score that isn't moving reads as
 * "waiting for the phone" rather than as a missed tap to repeat.
 *
 * A tap belongs to the match that was on screen when it was made. If the phone comes back
 * showing a different match — or none — the tap is dropped rather than replayed into a
 * match it was never meant for ([matchChanged]).
 *
 * Taps live in memory (they only mean anything while the match is on screen). A workout
 * summary is an hour of sensor data that cannot be re-recorded, so it is also written to
 * disk and survives the app being closed before the phone comes back.
 *
 * The phone still owns all scoring: this only carries `{ path, body }` messages
 * (docs/watch-sync.md). Everything here runs on the main thread.
 */
object IntentOutbox {
    /** [match] is the `startedAt` of the match the tap was made on; null = not tied to one. */
    private data class Pending(val path: String, val body: String, val match: Long?)

    /** How long to wait before trying again when no phone accepted the message. */
    private const val RETRY_MS = 1_500L

    /** A runaway backlog helps nobody: past this, new taps are refused. */
    private const val MAX_QUEUED = 64
    private const val PREFS = "outbox"
    private const val KEY_WORKOUTS = "workouts"

    private val handler = Handler(Looper.getMainLooper())
    private val queue = ArrayDeque<Pending>()
    private var sending = false
    private var retryScheduled = false
    private var restored = false

    /** `startedAt` of the match the watch is mirroring right now; 0 when there is none. */
    private var currentMatch = 0L

    private val pendingFlow = MutableStateFlow(0)

    /** Taps (not workout summaries) the phone has not accepted yet. */
    val pending: StateFlow<Int> = pendingFlow

    /**
     * Queue an intent for the phone. [match] ties a tap to the match on screen (its
     * `startedAt`, 0 from the idle face); leave it null for anything that must arrive
     * regardless, like a workout summary. Safe to call from any thread.
     */
    fun send(context: Context, path: String, body: String, match: Long? = null) {
        val appContext = context.applicationContext
        handler.post {
            restore(appContext)
            if (queue.size >= MAX_QUEUED) return@post
            queue.addLast(Pending(path, body, match))
            if (path == SyncPaths.WORKOUT) persistWorkouts(appContext)
            publish()
            flush(appContext)
        }
    }

    /** Try to deliver now — called when something suggests the phone is back in reach. */
    fun flush(context: Context) {
        val appContext = context.applicationContext
        handler.post {
            restore(appContext)
            deliverNext(appContext)
        }
    }

    /**
     * The phone pushed state: [startedAt] is the match it shows now (0 = none). Taps made on
     * any other match are stale — drop them — and the push itself proves the phone is in
     * reach, so whatever is left goes out. Safe to call from any thread.
     */
    fun matchChanged(context: Context, startedAt: Long) {
        val appContext = context.applicationContext
        handler.post {
            currentMatch = startedAt
            // Never the head while it is in flight: its completion still has to find it.
            val inFlight = if (sending) queue.firstOrNull() else null
            if (queue.removeAll { it !== inFlight && it.match != null && it.match != startedAt }) publish()
            restore(appContext)
            deliverNext(appContext)
        }
    }

    private fun deliverNext(context: Context) {
        if (sending) return
        // Skip taps whose match is no longer the one on screen.
        while (true) {
            val candidate = queue.firstOrNull() ?: return
            if (candidate.match == null || candidate.match == currentMatch) break
            queue.removeFirst()
            publish()
        }
        val head = queue.firstOrNull() ?: return
        sending = true
        val messages = Wearable.getMessageClient(context)
        Wearable.getNodeClient(context).connectedNodes
            .addOnSuccessListener { nodes ->
                if (nodes.isEmpty()) {
                    failed(context)
                    return@addOnSuccessListener
                }
                // Delivered once any phone node takes it; failed only if none did.
                var remaining = nodes.size
                var accepted = false
                for (node in nodes) {
                    messages.sendMessage(node.id, head.path, head.body.toByteArray())
                        .addOnCompleteListener { task ->
                            if (task.isSuccessful) accepted = true
                            remaining -= 1
                            if (remaining == 0) {
                                if (accepted) delivered(context, head) else failed(context)
                            }
                        }
                }
            }
            .addOnFailureListener { failed(context) }
    }

    private fun delivered(context: Context, sent: Pending) {
        sending = false
        if (queue.firstOrNull() === sent) queue.removeFirst()
        if (sent.path == SyncPaths.WORKOUT) persistWorkouts(context)
        publish()
        deliverNext(context)
    }

    private fun failed(context: Context) {
        sending = false
        if (retryScheduled) return
        retryScheduled = true
        handler.postDelayed(
            {
                retryScheduled = false
                deliverNext(context)
            },
            RETRY_MS,
        )
    }

    private fun publish() {
        pendingFlow.value = queue.count { it.path != SyncPaths.WORKOUT }
    }

    /** Workout summaries written by an earlier run of the app go back on the queue, once. */
    private fun restore(context: Context) {
        if (restored) return
        restored = true
        val stored = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY_WORKOUTS, null)
            ?: return
        runCatching {
            val summaries = JSONArray(stored)
            for (index in 0 until summaries.length()) {
                queue.addLast(Pending(SyncPaths.WORKOUT, summaries.getString(index), match = null))
            }
        }
    }

    private fun persistWorkouts(context: Context) {
        val summaries = JSONArray()
        queue.filter { it.path == SyncPaths.WORKOUT }.forEach { summaries.put(it.body) }
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit {
            if (summaries.length() == 0) remove(KEY_WORKOUTS) else putString(KEY_WORKOUTS, summaries.toString())
        }
    }
}
