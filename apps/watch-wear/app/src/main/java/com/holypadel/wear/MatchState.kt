package com.holypadel.wear

import org.json.JSONObject

/** Which screen the watch shows — driven entirely by the phone's payload. */
enum class Phase { IDLE, LIVE, WON }

data class TeamState(val short: String, val serving: Boolean, val servingSide: String?)

/** [ownerWon] is true from older phone builds, which don't say who won. */
data class WonState(
    val winnerShort: String,
    val scoreLine: String,
    val duration: String,
    val ownerWon: Boolean = true,
)

data class LastState(val line: String, val won: Boolean)

/**
 * The user's highlight and Team B colours as ARGB, plus the Material 3 colour roles the
 * phone derived from them (docs/watch-sync.md). The watch does no colour maths: a role the
 * phone didn't send falls back to the built-in orange / violet scheme.
 */
data class Palette(val accent: Long, val teamB: Long, val roles: Map<String, Long> = emptyMap()) {
    fun role(name: String): Long = roles[name] ?: DEFAULT_ROLES.getValue(name)

    companion object {
        /** Orange and violet — the phone's default picks. */
        val DEFAULT = Palette(accent = 0xFFFF6B35L, teamB = 0xFF8B7CFFL)

        /** The roles the phone sends for [DEFAULT] (`watchRoles` in the phone's colors.ts). */
        private val DEFAULT_ROLES = mapOf(
            "primary" to 0xFFFFDBD0L,
            "primaryDim" to 0xFFFFB59DL,
            "primaryContainer" to 0xFF832600L,
            "onPrimary" to 0xFF390C00L,
            "onPrimaryContainer" to 0xFFFFEDE8L,
            "secondary" to 0xFFFFDBD0L,
            "secondaryDim" to 0xFFEBBCAEL,
            "secondaryContainer" to 0xFF5F3F34L,
            "onSecondary" to 0xFF2E150CL,
            "onSecondaryContainer" to 0xFFFFEDE8L,
            "tertiary" to 0xFFE4DFFFL,
            "tertiaryDim" to 0xFFC7BFFFL,
            "tertiaryContainer" to 0xFF422DB2L,
            "onTertiary" to 0xFF170065L,
            "onTertiaryContainer" to 0xFFF3EEFFL,
            "surfaceContainerLow" to 0xFF2A2523L,
            "surfaceContainer" to 0xFF352F2EL,
            "surfaceContainerHigh" to 0xFF4C4544L,
            "onSurface" to 0xFFF9EEECL,
            "onSurfaceVariant" to 0xFFD6C2BDL,
            "outline" to 0xFF9E8D88L,
            "outlineVariant" to 0xFF6A5B57L,
            "error" to 0xFFFFB4ABL,
            "errorDim" to 0xFFFF897DL,
            "errorContainer" to 0xFF93000AL,
            "onError" to 0xFF410002L,
            "onErrorContainer" to 0xFFFFEDEAL,
        )
    }
}

/** `#RRGGBB` → opaque ARGB, or null when it isn't a 6-digit hex colour. */
internal fun parseHexColor(hex: String): Long? {
    val digits = hex.removePrefix("#")
    if (digits.length != 6) return null
    return digits.toLongOrNull(16)?.let { it or 0xFF000000L }
}

/**
 * The mirrored match state pushed by the phone. See docs/watch-sync.md — the
 * watch renders this and never computes score itself.
 */
data class MatchState(
    val phase: Phase,
    val clock: String,
    val setLabel: String,
    val teamA: TeamState,
    val teamB: TeamState,
    val pointA: String,
    val pointB: String,
    val games: String,
    val status: String,
    /** Epoch ms the match started — workout session start + dedup key. 0 when idle. */
    val startedAt: Long,
    /** Epoch ms the match clock counts up from, so the watch ticks it itself; 0 = use [clock]. */
    val clockBase: Long = 0L,
    /** True while a live match is paused — dim scoring and pause the workout. */
    val paused: Boolean,
    /** Squash "choice" tie-break at target-1 all — show the SHORT/LONG buttons. */
    val choicePending: Boolean,
    val won: WonState?,
    val last: LastState?,
    /** Null from older phone builds — the watch keeps its built-in colours. */
    val palette: Palette? = null,
) {
    /**
     * Which set or game, and the score around the point: "Set 2 6-4 · 4-3". The phone sends
     * the label in capitals ("SET 2", "SUPER TB"); here it reads in sentence case.
     */
    val contextLine: String
        get() {
            val label = setLabel.lowercase().replaceFirstChar { it.uppercase() }.replace(" tb", " TB")
            return listOf(label, games).filter { it.isNotEmpty() }.joinToString(" ")
        }

    companion object {
        val IDLE = MatchState(
            phase = Phase.IDLE,
            clock = "",
            setLabel = "",
            teamA = TeamState("N&J", serving = false, servingSide = null),
            teamB = TeamState("M&L", serving = false, servingSide = null),
            pointA = "",
            pointB = "",
            games = "",
            status = "",
            startedAt = 0L,
            paused = false,
            choicePending = false,
            won = null,
            last = null,
        )

        fun fromJson(json: String): MatchState {
            val root = JSONObject(json)
            val phase = when (root.optString("phase")) {
                "live" -> Phase.LIVE
                "won" -> Phase.WON
                else -> Phase.IDLE
            }
            val team = { key: String ->
                val obj = root.optJSONObject(key) ?: JSONObject()
                TeamState(
                    short = obj.optString("short"),
                    serving = obj.optBoolean("serving", false),
                    servingSide = if (obj.has("servingSide") && !obj.isNull("servingSide")) obj.getString("servingSide") else null
                )
            }
            val won = root.optJSONObject("won")?.let {
                WonState(
                    it.optString("winnerShort"),
                    it.optString("scoreLine"),
                    it.optString("duration"),
                    it.optBoolean("ownerWon", true),
                )
            }
            val last = root.optJSONObject("last")?.let {
                LastState(it.optString("line"), it.optBoolean("won", false))
            }
            val palette = root.optJSONObject("palette")?.let {
                val accent = parseHexColor(it.optString("accent"))
                val teamB = parseHexColor(it.optString("teamB"))
                // Unknown or malformed roles are skipped; Palette.role falls back per role.
                val roles = buildMap {
                    val sent = it.optJSONObject("roles") ?: return@buildMap
                    for (name in sent.keys()) {
                        parseHexColor(sent.optString(name))?.let { argb -> put(name, argb) }
                    }
                }
                if (accent != null && teamB != null) Palette(accent, teamB, roles) else null
            }
            return MatchState(
                phase = phase,
                clock = root.optString("clock"),
                setLabel = root.optString("setLabel"),
                teamA = team("teamA"),
                teamB = team("teamB"),
                pointA = root.optString("pointA"),
                pointB = root.optString("pointB"),
                games = root.optString("games"),
                status = root.optString("status"),
                startedAt = root.optLong("startedAt", 0L),
                clockBase = root.optLong("clockBase", 0L),
                paused = root.optBoolean("paused", false),
                choicePending = root.optBoolean("choicePending", false),
                won = won,
                last = last,
                palette = palette,
            )
        }
    }
}
