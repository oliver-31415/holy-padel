package com.holypadel.wear

import android.content.Context
import androidx.core.content.edit

/**
 * The watch-only display and lock preferences. The "app lock" toggle: while a match is
 * live and this is on, back and swipe-to-dismiss are blocked until a deliberate unlock.
 * The "flip" toggle turns the whole UI 180° for wearing the watch upside-down. Neither
 * changes match state, so both stay on the watch and are not part of the phone sync
 * contract. Both off by default.
 */
class MatchLockPrefs(context: Context) {
    private val prefs = context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    fun isEnabled(): Boolean = prefs.getBoolean(KEY_ENABLED, false)

    fun setEnabled(on: Boolean) {
        prefs.edit { putBoolean(KEY_ENABLED, on) }
    }

    fun isFlipped(): Boolean = prefs.getBoolean(KEY_FLIPPED, false)

    fun setFlipped(on: Boolean) {
        prefs.edit { putBoolean(KEY_FLIPPED, on) }
    }

    private companion object {
        const val PREFS = "match_lock"
        const val KEY_ENABLED = "enabled"
        const val KEY_FLIPPED = "flipped"
    }
}
