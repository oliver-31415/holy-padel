package com.holypadel.wear

import android.content.Context
import androidx.wear.protolayout.ActionBuilders
import androidx.wear.protolayout.DimensionBuilders.dp
import androidx.wear.protolayout.LayoutElementBuilders
import androidx.wear.protolayout.ModifiersBuilders
import androidx.wear.protolayout.ResourceBuilders
import androidx.wear.protolayout.TimelineBuilders
import androidx.wear.protolayout.material3.ColorScheme
import androidx.wear.protolayout.material3.MaterialScope
import androidx.wear.protolayout.material3.Typography
import androidx.wear.protolayout.material3.materialScope
import androidx.wear.protolayout.material3.primaryLayout
import androidx.wear.protolayout.material3.text
import androidx.wear.protolayout.material3.textEdgeButton
import androidx.wear.protolayout.types.argb
import androidx.wear.protolayout.types.layoutString
import androidx.wear.tiles.RequestBuilders
import androidx.wear.tiles.TileBuilders
import androidx.wear.tiles.TileService
import com.google.android.gms.wearable.DataMapItem
import com.google.android.gms.wearable.Wearable
import com.google.common.util.concurrent.ListenableFuture
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.guava.future
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlin.coroutines.resume

/** The extra MainActivity reads when it's opened from the tile's button. */
const val TILE_ACTION_EXTRA = "tileAction"
const val TILE_ACTION_START_LAST = "start-last"

private const val RESOURCES_VERSION = "1"

/** The last state the phone published, read straight from the Data Layer. */
private suspend fun readState(context: Context): MatchState = suspendCancellableCoroutine { cont ->
    Wearable.getDataClient(context).dataItems
        .addOnSuccessListener { buffer ->
            var state = MatchState.IDLE
            try {
                for (item in buffer) {
                    if (item.uri.path == SyncPaths.STATE) {
                        val json = DataMapItem.fromDataItem(item).dataMap.getString(SyncPaths.STATE_KEY)
                        if (json != null) state = MatchState.fromJson(json)
                    }
                }
            } finally {
                buffer.release()
            }
            cont.resume(state)
        }
        .addOnFailureListener { cont.resume(MatchState.IDLE) }
}

private fun launch(context: Context, action: String?): ModifiersBuilders.Clickable {
    val activity = ActionBuilders.AndroidActivity.Builder()
        .setPackageName(context.packageName)
        .setClassName(MainActivity::class.java.name)
    if (action != null) {
        activity.addKeyToExtraMapping(
            TILE_ACTION_EXTRA,
            ActionBuilders.AndroidStringExtra.Builder().setValue(action).build(),
        )
    }
    return ModifiersBuilders.Clickable.Builder()
        .setId(action ?: "open")
        .setOnClick(ActionBuilders.LaunchAction.Builder().setAndroidActivity(activity.build()).build())
        .build()
}

/** The tile's Material 3 scheme: the same roles the app's theme uses, from the phone's palette. */
private fun tileScheme(palette: Palette): ColorScheme {
    val role = { name: String -> palette.role(name).toInt().argb }
    return ColorScheme(
        primary = role("primary"),
        primaryDim = role("primaryDim"),
        primaryContainer = role("primaryContainer"),
        onPrimary = role("onPrimary"),
        onPrimaryContainer = role("onPrimaryContainer"),
        secondary = role("secondary"),
        secondaryDim = role("secondaryDim"),
        secondaryContainer = role("secondaryContainer"),
        onSecondary = role("onSecondary"),
        onSecondaryContainer = role("onSecondaryContainer"),
        tertiary = role("tertiary"),
        tertiaryDim = role("tertiaryDim"),
        tertiaryContainer = role("tertiaryContainer"),
        onTertiary = role("onTertiary"),
        onTertiaryContainer = role("onTertiaryContainer"),
        surfaceContainerLow = role("surfaceContainerLow"),
        surfaceContainer = role("surfaceContainer"),
        surfaceContainerHigh = role("surfaceContainerHigh"),
        onSurface = role("onSurface"),
        onSurfaceVariant = role("onSurfaceVariant"),
        outline = role("outline"),
        outlineVariant = role("outlineVariant"),
        onBackground = role("onSurface"),
        error = role("error"),
        errorDim = role("errorDim"),
        errorContainer = role("errorContainer"),
        onError = role("onError"),
        onErrorContainer = role("onErrorContainer"),
    )
}

private fun column(vararg children: LayoutElementBuilders.LayoutElement): LayoutElementBuilders.Column {
    val column = LayoutElementBuilders.Column.Builder()
        .setHorizontalAlignment(LayoutElementBuilders.HORIZONTAL_ALIGN_CENTER)
    children.forEach(column::addContent)
    return column.build()
}

private fun spacer(widthDp: Float): LayoutElementBuilders.Spacer =
    LayoutElementBuilders.Spacer.Builder().setWidth(dp(widthDp)).build()

/** A live match: the point score big between the team initials, over the set and game line. */
private fun MaterialScope.liveSlot(state: MatchState, palette: Palette): LayoutElementBuilders.LayoutElement {
    val score = LayoutElementBuilders.Row.Builder()
        .setVerticalAlignment(LayoutElementBuilders.VERTICAL_ALIGN_CENTER)
        .addContent(
            text(
                state.teamA.short.layoutString,
                typography = Typography.LABEL_MEDIUM,
                color = palette.accent.toInt().argb,
            ),
        )
        .addContent(spacer(8f))
        .addContent(
            text(
                "${state.pointA} – ${state.pointB}".layoutString,
                typography = Typography.NUMERAL_SMALL,
                color = colorScheme.onBackground,
            ),
        )
        .addContent(spacer(8f))
        .addContent(
            text(
                state.teamB.short.layoutString,
                typography = Typography.LABEL_MEDIUM,
                color = palette.teamB.toInt().argb,
            ),
        )
        .build()
    val line = state.contextLine
    if (line.isEmpty()) return score
    return column(
        score,
        text(line.layoutString, typography = Typography.BODY_SMALL, color = colorScheme.onSurfaceVariant),
    )
}

/** Idle: the last result, ready for a one-tap rematch of the last setup. */
private fun MaterialScope.idleSlot(state: MatchState): LayoutElementBuilders.LayoutElement {
    val last = state.last
    if (last == null || last.line.isEmpty()) {
        return text(
            "No matches yet".layoutString,
            typography = Typography.BODY_MEDIUM,
            color = colorScheme.onSurfaceVariant,
        )
    }
    return column(
        text(
            (if (last.won) "Last match · won" else "Last match · lost").layoutString,
            typography = Typography.BODY_SMALL,
            color = colorScheme.onSurfaceVariant,
        ),
        text(last.line.layoutString, typography = Typography.TITLE_MEDIUM, color = colorScheme.onBackground),
    )
}

/** A just-finished match: the winner and the final score. */
private fun MaterialScope.wonSlot(state: MatchState): LayoutElementBuilders.LayoutElement =
    column(
        text(
            (state.won?.winnerShort ?: "").layoutString,
            typography = Typography.DISPLAY_SMALL,
            color = colorScheme.onBackground,
        ),
        text(
            (state.won?.scoreLine ?: state.games).layoutString,
            typography = Typography.TITLE_MEDIUM,
            color = colorScheme.onSurfaceVariant,
        ),
    )

/** The title above the main slot: what the tile is showing right now. */
private fun tileTitle(state: MatchState): String = when (state.phase) {
    Phase.LIVE -> if (state.paused) "Paused" else "Live match"
    Phase.WON -> if (state.won?.ownerWon != false) "Match won" else "Match lost"
    Phase.IDLE -> "Holy Padel"
}

/**
 * The Holy Padel tile, one swipe from the watch face: the live score while a
 * match is on, otherwise the last result and Start last — a rematch of the last
 * setup without opening the app first. Laid out with Material 3 Expressive's
 * primary layout: a title, the main slot, and an edge button hugging the bottom. Like the app it only mirrors the
 * phone's state; the rematch itself is the same start-last intent the app sends.
 */
class ScoreTileService : TileService() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)

    override fun onTileRequest(requestParams: RequestBuilders.TileRequest): ListenableFuture<TileBuilders.Tile> =
        scope.future {
            val state = readState(this@ScoreTileService)
            val palette = state.palette ?: Palette.DEFAULT
            val context = this@ScoreTileService
            // Never the system's dynamic theme: the tile wears the colours picked on the phone.
            val root = materialScope(
                context = context,
                deviceConfiguration = requestParams.deviceConfiguration,
                allowDynamicTheme = false,
                defaultColorScheme = tileScheme(palette),
            ) {
                // Idle with nothing to rematch has no action worth an edge button.
                val startable = state.phase != Phase.IDLE || state.last != null
                primaryLayout(
                    titleSlot = { text(tileTitle(state).layoutString) },
                    mainSlot = {
                        when (state.phase) {
                            Phase.LIVE -> liveSlot(state, palette)
                            Phase.WON -> wonSlot(state)
                            Phase.IDLE -> idleSlot(state)
                        }
                    },
                    bottomSlot = if (startable) {
                        {
                            val idle = state.phase == Phase.IDLE
                            textEdgeButton(
                                onClick = launch(context, if (idle) TILE_ACTION_START_LAST else null),
                                labelContent = { text((if (idle) "Start last" else "Open").layoutString) },
                            )
                        }
                    } else {
                        null
                    },
                    onClick = launch(context, null),
                )
            }
            TileBuilders.Tile.Builder()
                .setResourcesVersion(RESOURCES_VERSION)
                // Updates are pushed by StateListenerService on every state change;
                // this is only a fallback.
                .setFreshnessIntervalMillis(if (state.phase == Phase.IDLE) 30 * 60_000L else 60_000L)
                .setTileTimeline(TimelineBuilders.Timeline.fromLayoutElement(root))
                .build()
        }

    override fun onTileResourcesRequest(
        requestParams: RequestBuilders.ResourcesRequest,
    ): ListenableFuture<ResourceBuilders.Resources> =
        scope.future { ResourceBuilders.Resources.Builder().setVersion(RESOURCES_VERSION).build() }

    override fun onDestroy() {
        super.onDestroy()
        scope.cancel()
    }
}
