package com.holypadel.wear

import androidx.wear.tiles.TileService
import com.google.android.gms.wearable.DataEvent
import com.google.android.gms.wearable.DataEventBuffer
import com.google.android.gms.wearable.DataMapItem
import com.google.android.gms.wearable.WearableListenerService

/**
 * Wakes on every state push from the phone — even with the app closed — and
 * asks the system to refresh the tile, so it never shows a stale score.
 *
 * It also ends the match's exercise when the phone stops, ends or cancels the
 * match while the activity is closed. The activity is the only other place that
 * observes the phase, and it is not running in that case.
 */
class StateListenerService : WearableListenerService() {
    override fun onDataChanged(dataEvents: DataEventBuffer) {
        for (event in dataEvents) {
            if (event.type != DataEvent.TYPE_CHANGED) continue
            val item = event.dataItem
            if (item.uri.path != SyncPaths.STATE) continue
            val json = DataMapItem.fromDataItem(item).dataMap.getString(SyncPaths.STATE_KEY) ?: continue
            val state = MatchState.fromJson(json)
            // end() is a no-op when no session is running, so non-LIVE pushes are harmless.
            if (state.phase != Phase.LIVE) {
                ExerciseSession.tracker(this).end()
            }
            // The phone just reached us, so a workout summary still waiting from an earlier
            // match (sent while the phone was away) can go now, even with the app closed.
            IntentOutbox.matchChanged(this, state.startedAt)
        }
        TileService.getUpdater(this).requestUpdate(ScoreTileService::class.java)
    }
}
