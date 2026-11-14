# Holy Padel — Wear OS

The Android watch companion. Kotlin + Jetpack Compose, a thin mirror of the
phone's live match. It runs **no scoring engine** — the phone owns the FIP rules
and pushes rendered state; the watch just draws it and sends intents back. See
[`docs/watch-sync.md`](../../docs/watch-sync.md) for the shared contract.

## How it syncs

Over the **Wearable Data Layer** (Google Play services):

- **Phone → watch:** a `DataItem` at `/holy-padel/state` carries the match-state
  JSON. `WatchSync` (a `DataClient.OnDataChangedListener`) decodes it into
  `MatchState` and exposes a `StateFlow` the Compose UI collects.
- **Watch → phone:** `score` / `undo` / `pause` / `set-choice` / `stop` /
  `cancel` / `start-last` go back as `MessageClient` messages to the matching
  paths, and the finished workout summary goes to `/holy-padel/workout`. All of
  them go through `IntentOutbox`, which queues each one and retries until the
  phone accepts it, so a tap made while the phone is out of reach is not lost.
  A tap still waiting when the phone returns with a different match is dropped.

The watch's `applicationId` **must equal the phone app's** (`com.holypadel.app`)
for the Data Layer to pair them — see `app/build.gradle.kts`.

## Layout

| Path                                        | What                                                  |
| ------------------------------------------- | ----------------------------------------------------- |
| `app/src/main/java/.../MatchState.kt`       | The mirrored state, palette + JSON decode             |
| `app/src/main/java/.../WatchSync.kt`        | Data Layer client — state in, intents out             |
| `app/src/main/java/.../IntentOutbox.kt`     | Ordered, retried delivery of intents to the phone     |
| `app/src/main/java/.../MainActivity.kt`     | Hosts the Compose UI, drives the exercise session     |
| `app/src/main/java/.../ExerciseTracker.kt`  | Health Services exercise (heart rate, steps, calories)|
| `app/src/main/java/.../ScoreTileService.kt` | The tile: live score, or Start last when idle         |
| `app/src/main/java/.../ui/`                 | `Screens.kt` (idle/live/won), theme, icons            |

## Design

**Material 3 Expressive for Wear OS**, built on Wear Compose Material 3
(`AppScaffold`, `HorizontalPagerScaffold`, `EdgeButton`, `ButtonGroup`,
`SwitchButton`) and, for the tile, ProtoLayout Material 3 (`primaryLayout`,
`textEdgeButton`).

- **Colour comes from the phone.** The state payload's `palette.roles` carries
  the Wear colour roles derived from the user's highlight and Team B picks;
  `WatchColors` (`ui/Colors.kt`) turns them into the `ColorScheme`. The watch
  does no colour maths — a missing role falls back to the built-in orange /
  violet scheme in `Palette`.
- **Copy is sentence case**, like the phone. The set label arrives in capitals
  ("SET 2") and is shown as "Set 2" (`MatchState.contextLine`).
- **Icons** are Material Symbols built from path data (`ui/Icons.kt`), so there
  is no icon dependency.
- **Flip** turns every face 180°. Each face is rotated on its own; the live
  pager is *not* inside a rotated layer (it runs in reverse instead), because a
  rotated pager loses its fling direction.

## Building

Compiled on every change by the [`watch-wear`](../../.github/workflows/watch-wear.yml)
CI workflow (`gradle assembleDebug`). `androidx.core` is pinned to `1.18.0`; when
adding or bumping an androidx dependency, check the signatures you use against
the pinned **release** AAR or its sources jar, never androidx-main.

Locally you need a JDK 17 + the Android SDK (open in Android Studio, or run
`./gradlew :app:assembleDebug` with `ANDROID_HOME` set).
