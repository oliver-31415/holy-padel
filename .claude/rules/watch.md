---
paths:
  - "apps/mobile/src/watch/**"
  - "apps/mobile/targets/watch/**"
  - "apps/watch-wear/**"
  - "apps/mobile/modules/watch-bridge/**"
  - "docs/watch-sync.md"
---

# Watch companions

The phone is the single writer; the watches are thin mirrors. All scoring lives
in `packages/scoring` — **never** put scoring logic on a watch. A watch renders
the state the phone pushes and sends back intents; the phone folds them into the
`PointEvent[]` and pushes fresh state. Full contract: [docs/watch-sync.md](../../docs/watch-sync.md).

## Intent contract

Watches emit `{ path, body }` messages. The phone builds the outbound payload in
`apps/mobile/src/watch/build-state.ts` and handles intents in
`apps/mobile/src/watch/apply-intent.ts`. Paths:

- `/holy-padel/score` — record a point
- `/holy-padel/undo` — drop the last event
- `/holy-padel/start-last` — start a match from the last config
- `/holy-padel/pause`
- `/holy-padel/stop` — `finishMatch` **as-is** (winner = `snapshot.winner ?? currentLeader`): court time's up, don't lose the score. Saves via `stopAndSaveMatch` in `apps/mobile/src/lib/match-actions.ts`.
- `/holy-padel/cancel` — `deleteMatch`: discard the match entirely
- `/holy-padel/end` — back-compat alias for `stop`

Match duration excludes paused breaks via `playedMs()` in `src/lib/format.ts`.

## Building the payload

Strict + `exactOptionalPropertyTypes`: **omit** optional keys, never set them to
`undefined`. Follow the `paletteField` spread pattern already in `build-state.ts`.

## Native CI is not required — merge manually

The native watch checks (`watchos`, `watch-wear`, `watch-bridge`) are **not**
required checks. On a native-touching PR, do **not** let auto-merge land before
these jobs report — merge manually once they're green (a wrong androidx signature
once broke `main`).

## Wear OS gotchas

- `androidx.core` is pinned to **1.18.0** (1.19.0 needs compileSdk 37, absent from
  CI). Verify androidx signatures against the pinned **release AAR** (`javap` on the
  `.aar`), never androidx-main source — it's ahead of releases.
- `watch-bridge` is a local Expo module: it needs a `package.json`, a `link:`
  dependency in the app, and a `.gitignore` negation for its native dirs, or iOS
  silently drops the module while Android looks green. Copy `modules/watch-bridge`
  exactly.

## Rebuilding natively

The fast watch-only rebuild — plus the `simctl` pairing gotchas — lives in the
`ios-build-run` skill (`.claude/skills/ios-build-run/SKILL.md`). Reference it;
don't duplicate it here.
