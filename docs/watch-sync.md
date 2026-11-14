# Phone ↔ watch sync contract

The phone is the **single source of truth**: it owns the SQLite ledger and the
`@holy-padel/scoring` engine. The watch is a thin mirror — it renders the match
state the phone pushes, and sends back score/undo *intents*. The watch never
runs the scoring engine, so there is exactly one implementation of the rules.

This is transport-agnostic: on Apple Watch it rides **WatchConnectivity**
(`updateApplicationContext` for state, `sendMessage` for intents); on Wear OS it
rides the **Wearable Data Layer** (`DataClient` for state, `MessageClient` for
intents). Both carry the same JSON payloads defined here.

## Phone → watch: match state

Sent whenever the live match changes (point scored, undo, match finished) and on
conn+resume. Latest-wins (application context / a single Data Layer item at path
`/holy-padel/state`).

```jsonc
{
  "v": 1,                         // schema version
  "phase": "idle" | "live" | "won",
  "clock": "0:47",                // elapsed, mm or h:mm — empty when idle
  "setLabel": "SET 2",            // "SET 2" / "GAME 2" / "SUPER TB"; empty in a
                                  // one-set (or one-game) match
  "teamA": { "short": "N&J", "serving": true, "servingSide": "right" },
  "teamB": { "short": "M&L", "serving": false },
  "pointA": "40",                 // display call: 0/15/30/40/AD or tie-break number
  "pointB": "30",
  "games": "6-4 · 4-3",           // the score AROUND the point, never the point
                                  // score itself: padel = set scores + games in
                                  // this set; squash/pickleball = games won
                                  // ("1-0"), empty in game 1; super TB = sets
  "status": "GAME PT",            // watchStatusLabel(), may be empty; both
                                  // watches show it on the score face
  "choicePending": true,          // squash "choice" tie-break at target-1 all:
                                  // the watch shows its SHORT/LONG buttons while
                                  // set; absent otherwise
  "startedAt": 1783200000000,     // epoch ms the match started — the watch's
                                  // workout-session start time and cross-device
                                  // dedup key; absent when idle
  "clockBase": 1783200300000,     // epoch ms the match clock counts up from
                                  // (start + paused time): the watch ticks the
                                  // clock itself between pushes. Absent while
                                  // paused (show the frozen `clock`) and idle
  "won": {                        // present only when phase = "won"
    "winnerShort": "N&J",
    "scoreLine": "6-4 · 7-5",
    "duration": "1:23",
    "ownerWon": true              // whether the phone owner's team won, so the
                                  // watch can say "Match won" or "Match lost";
                                  // additive — absent from older phone builds
  },
  "last": {                       // present when phase = "idle" (quick-start hint)
    "line": "6-3 7-6 vs M&L",
    "won": true
  },
  "palette": {                    // the user's colours from Settings, always sent;
    "accent": "#FF6B35",          // the highlight colour itself
    "teamB": "#8B7CFF",           // Team B's colour
    "roles": {                    // Wear OS Material 3 colour roles derived from
      "primary": "#ffdbd0",       // the two picks (`watchRoles` in colors.ts) —
      "primaryContainer": "#832600", // 27 of them, `#rrggbb`. Additive: Apple
      "onPrimary": "#390c00"      // Watch ignores them; Wear falls back per role
      // …                        // to its built-in orange / violet scheme
    }
  }                               // additive: a watch that ignores it keeps its
                                  // built-in orange / violet
}
```

**Colours are computed on the phone.** The watch does no colour maths, just as
it does no scoring: the phone derives the Wear scheme from the same tonal
palettes as its own theme, using Wear's tone table (pale `primary` at tone 90,
containers at tone 30, true-black background), and sends the result. Team names
and the serve mark use `accent` / `teamB` directly.

## Watch → phone: intents

Fire-and-forget messages; the phone applies them to the engine, persists, and
pushes fresh state back.

| Path                     | Body        | Effect on the phone                          |
| ------------------------ | ----------- | -------------------------------------------- |
| `/holy-padel/score`      | `"A"`\|`"B"`| Append a point event for that team. While a first serve is undecided (game 1, or pickleball games 2+) the tap instead *takes* the serve — no rally is scored |
| `/holy-padel/undo`       | `""`        | Remove the last point event                   |
| `/holy-padel/pause`      | `""`        | Toggle pause ↔ resume on the live match       |
| `/holy-padel/start-last` | `""`        | From idle: start a rematch of the last lineup |
| `/holy-padel/set-choice` | `"one"`\|`"two"` | Squash "choice" tie-break: stage the receiver's long/short decision; the next scored rally carries it |
| `/holy-padel/stop`       | `""`        | **Stop AND save** the match in its current state |
| `/holy-padel/cancel`     | `""`        | **Discard** the live match — nothing is saved  |
| `/holy-padel/end`        | `""`        | Legacy alias for `stop` (older builds)         |
| `/holy-padel/workout`    | summary JSON| Persist the watch-tracked workout (see below) |

**`/holy-padel/stop` vs `/holy-padel/cancel` — save vs discard.** Court time
routinely runs out mid-match, so *stopping must never lose the score*. `stop`
recomputes the snapshot and always `finishMatch`es: a truly finished match keeps
the engine's winner and final line; a match stopped mid-play is credited to
whoever's ahead (`currentLeader`) so the partial result still counts. `cancel` is
the only path that `deleteMatch`es. Both leave `live`, so the watch's next state
is `phase = "idle"`. This is shared with the phone's END sheet via
`stopAndSaveMatch` (`apps/mobile/src/lib/match-actions.ts`) so the two surfaces
persist identically. `end` remains a back-compat alias for `stop`, and still
backs the **DONE** control on the `won` screen — the user is never stuck on MATCH
WON; with nothing live, `stop`/`end` just dismisses it and the watch returns to idle.

**Finishing is saved on the deciding rally.** `score` goes through `recordPoint`
(`match-actions.ts`), which marks the match finished in the same write as the
rally that decides it — whether or not the phone's scoreboard is open. The phone
then keeps the `won` phase for that match (`gatherWatchInput` in
`apps/mobile/src/watch/gather-input.ts`) until DONE on either surface, a new
match starts, or `WON_HOLD_MS` (30 min) passes. A match stopped mid-play goes
straight to idle.

### Watch → phone: workout summary

Wear OS has no Health Connect, so the watch tracks the match with **Health
Services** (heart rate, calories, and — where the device supports them for the
exercise — steps and distance; `RACQUETBALL` calorie model) and ships the
result to the phone, which is the **single Health Connect writer**. Sent once,
when the live phase ends:

```jsonc
{
  "startedAt": 1783200000000,  // echoes the state payload's startedAt
  "endedAt": 1783204500000,
  "kcal": 412.5,
  "avgBpm": 132,
  "maxBpm": 171,
  // Every reading at its own sensor timestamp, downsampled to one per ~5s.
  // (Readings arrive batched while the screen is off; older builds kept only
  // the newest per batch, stamped on arrival, which left long gaps.)
  "samples": [ { "t": 1783200015000, "bpm": 120 } ],
  // Steps and metres per 10s bucket, keyed by the bucket's end — deltas, so
  // the phone sums the buckets inside each game for per-game totals. Absent
  // from older builds; empty when the device can't measure them.
  "motion": [ { "t": 1783200020000, "steps": 18, "meters": 12.5 } ]
}
```

The phone stores `samples` under `hr:<matchId>` and `motion` under
`motion:<matchId>` (settings table). Each game's window runs from the previous
game's last rally to its own, so the per-game heart rate, steps and distance on
the score-race card tile the match without gaps.

The phone writes `ExerciseSessionRecord` + `HeartRateRecord` + `TotalCaloriesBurnedRecord`
with `Device.TYPE_WATCH` provenance and the same deterministic
`clientRecordId` as the manual "LOG WORKOUT" path but a **higher
`clientRecordVersion`** — watch data replaces a bare manual log, never
duplicates it. On Apple Watch this path is unused: the watch runs its own
`HKWorkoutSession` and saves straight to Health.

## Transport specifics

The two platforms carry the identical JSON above; only the wire differs.

### Wear OS — Wearable Data Layer

- **State:** the phone puts a single `DataItem` at path `/holy-padel/state`
  holding the state JSON; the watch's `DataClient.OnDataChangedListener` reads it
  and pulls the existing item on connect. Latest-wins is native to `DataItem`.
- **Intents:** the watch sends a `MessageClient` message to the path above with
  the body as the message bytes, to every connected node.

### Apple Watch — WatchConnectivity

- **State:** the phone calls `updateApplicationContext(["state": "<json>"])`
  (latest-wins, survives relaunch); when the watch is reachable it may also
  arrive via `sendMessage`. The watch decodes the `"state"` string either way.
- **Intents:** the watch sends `sendMessage(["path": "/holy-padel/…", "body": …])`
  when reachable, falling back to `transferUserInfo` (queued, background-tolerant)
  when the phone is asleep. Using the same `{ path, body }` shape as the Wear OS
  paths lets the phone decode both transports with one code path.

## Phone-side pipeline

The phone half of the sync lives in [`apps/mobile/src/watch`](../apps/mobile/src/watch):

1. **`build-state.ts`** — `buildWatchState()` maps the live/finished/absent match to
   the state payload above, reusing the phone's own formatters (`watchStatusLabel`,
   `liveScoreLine`, `durationLabel`, …). Pure and unit-tested.
2. **`apply-intent.ts`** — `applyWatchIntent()` applies a `{ path, body }` intent to
   the ledger with the same writes the live screen uses (`appendEvent`,
   `removeLastEvent`, `createMatch`). Pure and unit-tested.
3. **`use-watch-sync.ts`** — `useWatchSync()` (mounted once under `DbProvider`)
   rebuilds and pushes the payload on every ledger mutation and a 30 s clock tick,
   and feeds incoming intents through `applyWatchIntent`.
4. **`bridge.ts`** — the boundary to the native transport, resolved with
   `requireOptionalNativeModule("WatchBridge")`. When no native module is linked
   (web, or a build without it) every call is a no-op, so the phone app is unchanged.

### Native `WatchBridge` module

The transport is a local Expo module named **`WatchBridge`**
([`apps/mobile/modules/watch-bridge`](../apps/mobile/modules/watch-bridge)) that
autolinks into the app on `expo prebuild`. It exposes:

- `pushState(json: string): void` — publish the state JSON to the paired watch.
  - **Android** (`WatchBridgeModule.kt`): `Wearable.getDataClient(context).putDataItem`
    of a `PutDataMapRequest` at `/holy-padel/state` with `dataMap.putString("json", json)`
    (plus a bumped `ts` key so identical-looking updates still propagate) — the exact
    `"json"` key at `/holy-padel/state` the Wear app reads (`WatchSync.kt`).
  - **iOS** (`WatchBridgeModule.swift`): `WCSession.updateApplicationContext(["state": json])`,
    plus `sendMessage(["state": json])` when reachable — the `"state"` key the watch
    target decodes (`WatchConnectivityManager.swift`).
- `connectedWatchCount(): Promise<number>` — how many watches are connected right now
  (Android: `NodeClient.connectedNodes` size; 0 when Play services are missing or
  Bluetooth is off; absent on iOS builds older than the feature). The phone app polls
  this every ~8 s (`use-watch-connection.ts`), refreshes early whenever an intent
  arrives (an intent is proof of a connection) and on foregrounding, and drives the
  live screen's "Synced — N watches connected" line and the home pill. The e2e suite
  fakes the count on web with `EXPO_PUBLIC_MOCK_WATCH_COUNT`.
- an **`onIntent`** event carrying `{ path, body }` — emitted when the watch sends one.
  - **Android:** a `MessageClient.OnMessageReceivedListener` → `{ path: event.path,
    body: String(event.data) }`.
  - **iOS:** `WCSessionDelegate.session(_:didReceiveMessage:)` / `didReceiveUserInfo`.

Both platforms are compiled on every change by the
[`watch-bridge`](../.github/workflows/watch-bridge.yml) workflow (Kotlin via Gradle,
Swift via `xcodebuild`). End-to-end Bluetooth pairing is only exercisable on
physically paired devices.

## Other mirrors of the same state

Two more surfaces render the live match without opening an app. Like the
watches, neither scores anything itself.

- **Wear OS tile** (`ScoreTileService.kt`): reads the latest `/holy-padel/state`
  DataItem and shows the point score while `live` (and the winner while `won`).
  While `idle` it shows the last result and a **START LAST** button. That button
  opens the app with a `tileAction=start-last` extra, which sends the normal
  `/holy-padel/start-last` intent. `StateListenerService` (a
  `WearableListenerService` filtered to the state path) asks for a tile refresh
  on every push, even when the app is closed.
- **Android live notification** (`apps/mobile/src/live`, native module
  `modules/live-notification`): the notification of the foreground service that
  keeps the app alive during a match (see Transport resilience), built from the same
  gathered input as the watch payload (`buildLiveNotification`). It carries the
  point score, the match line, a running match clock, and **+ team** / **UNDO**
  buttons (**RESUME** while paused). A button tap comes back as an `onAction`
  event and is applied through `applyWatchIntent`, exactly like a watch intent.
  On Android 16 the notification asks to be promoted to a Live Update, which shows
  the point score as a status-bar chip. The notification permission is requested
  once, the first time a match is live.

## Notes

- The watch UI derives entirely from `phase`: `idle` → quick-start card,
  `live` → the scoreboard (square + round variants), `won` → the result.
- The Wear OS app is Material 3 Expressive (Wear Compose Material 3, plus
  ProtoLayout Material 3 for the tile); the Apple Watch app keeps its own
  SwiftUI look. Both render the same payload.
- Serving dots, status pill and point calls come straight from the fields above —
  the watch does no scoring math.
- **Undecided serves** (game 1 of any match, and pickleball games 2+): the phone
  sends no serving team (`serving` false on both); the next score intent from
  either surface *takes* the serve rather than scoring a rally.
- **Squash "choice" tie-break** (HIHO at target-1 all): `status` reads
  "SET 1 OR 2" and `choicePending` is set; the phone shows a mandatory SHORT/LONG
  sheet and the watch shows the same two buttons, firing `/holy-padel/set-choice`.
  Scoring is refused until a choice is staged. The decision rides on the next
  rally in the event log, so undo/resume re-ask naturally.
- Because the payload is tiny and latest-wins, a missed update self-heals on the
  next point; there is no event replay on the watch.

## Transport resilience — keep it local, sync in the background

A watch tap must never be lost and must never block the UI on the round-trip:

- **Instant local feedback.** Every tap fires a haptic immediately. The visible
  score, however, still comes from the phone's *next* state push (instant on real
  devices) — the watch has no scoring engine and never computes score locally.
- **Immediate channel + guaranteed fallback.** Each intent is sent on the
  immediate channel when the phone is reachable *and* falls back to the
  queued/background-tolerant channel when it is not, so intents flush
  automatically on reconnect. On Apple Watch that is `sendMessage` (reachable) →
  `transferUserInfo` (queued, survives the phone being asleep). On Wear OS every
  intent goes through `IntentOutbox`: a queue sent strictly in order and retried
  (every 1.5 s, and whenever a state push proves the phone is back) until a
  phone node accepts it. While taps are waiting the watch says so — "Waiting for
  phone · 3" — so a score that isn't moving doesn't read as a missed tap. A tap
  belongs to the match it was made in (its `startedAt`): if the phone comes back
  showing a different match, or none, the taps still waiting are dropped rather
  than replayed into the wrong score. The workout summary is also written to
  disk, so it survives the watch app closing before the phone returns.
- **The Android phone stays alive for the whole match.** Intents are applied by
  the phone app's JS, so the app must still be running when the watch taps. While
  a match is live the app runs a foreground service (`LiveMatchService` in
  `modules/live-notification`, type `connectedDevice`) whose notification is the
  live-score notification; Android then won't freeze or kill the app in a pocket.
  It stops when the match ends, and when the app is swiped away. A match started
  from the watch while the phone app is in the background can't start the service
  (Android forbids it) — it starts the next time the app is opened.
- **Latest-wins self-heals.** State is latest-wins and the phone re-pushes on
  every change and every 30 s, so a reconnect converges the watch to the truth
  even if an intermediate push was missed — no event replay is needed.
