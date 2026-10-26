package com.holypadel.wear

import android.content.Context
import androidx.core.content.edit

/**
 * The watch-only "app lock" toggle. While a match is live and this is on, back and
 * swipe-to-dismiss are blocked until a deliberate unlock. It changes no match state,
 * so it stays on the watch and is not part of the phone sync contract. Off by default.
 */
class MatchLockPrefs(context: Context) {
    private val prefs = context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    fun isEnabled(): Boolean = prefs.getBoolean(KEY_ENABLED, false)

    fun setEnabled(on: Boolean) {
        prefs.edit { putBoolean(KEY_ENABLED, on) }
    }

    private companion object {
        const val PREFS = "match_lock"
        const val KEY_ENABLED = "enabled"
    }
}
