# Holy Padel — agent guide

Local-first **padel score tracker**: an Expo/React Native phone app plus **Apple Watch
and Wear OS companions**, with an event-sourced FIP-rules scoring engine. Matches never
leave the device by default. The [FIP Rules of Padel](design/FIP_Rules-of-Padel.pdf) are
the **leading source of truth** for all scoring behaviour — when in doubt, the rulebook wins.

## Monorepo layout (Turborepo + pnpm)

| Path | What |
| --- | --- |
| `packages/scoring` | Pure FIP match engine — `computeMatch(config, events)` folds point events → snapshot; `computeStats`, `watchStatusLabel`. Event-sourced, undoable, no I/O. |
| `packages/db` | SQLite schema + typed repositories (`SqlDriver` interface). Versioned migrations in `schema.ts`. |
| `apps/mobile` | Expo app (expo-router). Screens in `src/app`, watch sync in `src/watch`, health in `src/health`, native modules in `modules/`, watchOS target in `targets/watch`. |
| `apps/watch-wear` | Wear OS app — Kotlin + Jetpack Compose, Wearable Data Layer. |
| `docs/` | `fip-scoring-spec.md` (rules), `watch-sync.md` (phone↔watch contract). |
| `design/` | Source design file + the FIP rules PDF. |

## Core architecture

- **Event sourcing**: a match is its `MatchConfig` + an append-only `PointEvent[]` (each with a timestamp). The engine folds events into a snapshot. Undo = drop the last event. Every stat is computed, never stored denormalised (except a cached final score line).
- **Phone is the single source of truth.** Watches are thin mirrors: they render the pushed state and send back `score`/`undo`/`start-last`/`pause` intents. No scoring logic on the watch. Contract: [docs/watch-sync.md](docs/watch-sync.md). Payload builder: `apps/mobile/src/watch/build-state.ts`; intents: `apps/mobile/src/watch/apply-intent.ts`; native transport: the optional `WatchBridge` module (`modules/watch-bridge`, web-safe no-op).
- **Health/workout**: matches log to Apple Health / Health Connect (free, opt-in, write-only). Live tracking runs a real workout session on the watch (HR/calories); the phone persists the Wear summary. Duration excludes paused breaks via `playedMs()` in `src/lib/format.ts`.
- **Owner** is hard-coded `"nico"` throughout (see the matches screen); use that constant, don't call `getOwner` in new sync code.

## Conventions (do these)

- **TypeScript strict**, `exactOptionalPropertyTypes` on — omit optional keys, never set them to `undefined` (see the `courtField` spread pattern in `build-state.ts`).
- **Biome** at max strictness (`preset: "all"` + nursery). Run `pnpm lint`; auto-fix formatting with `pnpm exec biome check --write <file>`. `apps/mobile/targets` and `apps/mobile/modules` native dirs are excluded.
- **Gitmoji micro-commits**, one logical change each. Branch off `main`; open a PR (main is protected — see below). Never commit/push unless asked.
- Match the surrounding file's style, comment density, and idioms. App code imports via the `@/` alias (mirrored in `vitest.config.ts`).

## Verify before pushing

```sh
pnpm install
pnpm check                                   # biome + typecheck + unit/property tests, all packages
pnpm --filter @holy-padel/mobile e2e:changed # only the Playwright specs your changes can affect
```
`e2e:changed` diffs against `main` plus the working tree and runs the matching specs; anything it cannot map (shared `src/lib|components|theme|db|watch`, `packages/**`, `e2e/helpers.ts`, config) falls back to the full suite. Use `--plan` to see the selection without running, `--full` to force everything. Run the full `pnpm --filter @holy-padel/mobile e2e` before merging; CI runs it anyway.

Per package: `pnpm --filter @holy-padel/db test`, etc. Unit tests use `vitest`; the DB tests run on `node:sqlite` via `test/memory-driver.ts`. Turbo caches `lint`/`typecheck`/`test` per package, so a repeat `pnpm check` with no changes replays from cache.

## Building & running natively

Gradle speed-ups (build cache, parallel, 3 GB heap, 2 workers) are set in `apps/mobile/plugins/with-gradle-perf.js` and `apps/watch-wear/gradle.properties`. Run `npx expo prebuild` to apply the plugin to the generated `android/`; `prebuild --clean` regenerates it from scratch. Configuration cache stays off.

**This is a dev-client app — Expo Go cannot run it** (custom native modules + a watch target). See the **`ios-build-run` skill** in `.claude/skills/` for the full recipe. In short, on this machine:

```sh
export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer   # full Xcode, no sudo
export LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8                        # or CocoaPods crashes (ASCII-8BIT)
cd apps/mobile && npx expo run:ios --device "<iPhone UDID>"       # prebuild + pods + build + Metro
```
CocoaPods must be present (`brew install cocoapods` — the system Ruby 2.6 is too old). For the watch app, pair the sims first: `xcrun simctl pair <watch-udid> <iphone-udid>`. Android: `pnpm --filter @holy-padel/mobile android`.

## CI & branch protection

Six workflows in `.github/workflows` (see the README's CI table). `main` is protected by the `protect-main` ruleset: PRs required; `quality` / `e2e` / `web-build` must pass and be up to date. **Native compiles (`watch-wear`, `watchos`, `compile-android`/`compile-ios`, `native-e2e`) are NOT required checks** — so for native-touching PRs, don't let auto-merge land before the native jobs report; merge manually once they're green (a wrong androidx signature once broke `main`).

## Gotchas that have bitten us (read `~/.claude` memory too)

- **Local Expo modules** need all three: a `package.json`, a `link:` dependency in the app, and `.gitignore` negation for their native dirs — or iOS silently drops the module while Android looks green. Copy `modules/watch-bridge` exactly.
- **Changing `userInterfaceStyle` (or any config) needs `npx expo prebuild --clean`.** The
  generated `android/` is gitignored and keeps its old value otherwise: an `expo-system-ui`
  listener reads the generated `expo_system_ui_user_interface_style` string at startup and
  overrides `MainActivity`'s follow-system mode, so a stale `light` there pins the whole app
  to light no matter what the OS does.
- **androidx APIs**: verify signatures against the pinned **release AAR** (`javap` on the downloaded `.aar`), never androidx-main source (it's ahead of releases).
- **`androidx.core`** is pinned to 1.18.0 (1.19.0 demands compileSdk 37, absent from the CI SDK repo).
- **pnpm supply-chain gate**: new deps get an approval appended to `minimumReleaseAgeExclude` in `pnpm-workspace.yaml` on local install — commit that file with the lockfile or CI fails.
- **expo-sqlite web patch** in `apps/mobile/patches` fixes a length-truncation bug; keep it until upstream ships.

## Where to look first

- Scoring questions → `packages/scoring/src` + `docs/fip-scoring-spec.md` +
  `docs/squash-scoring-spec.md`.
- Watch questions → `docs/watch-sync.md` + `apps/mobile/src/watch` + the two watch apps.
- "How does X render?" → `apps/mobile/src/app` (expo-router screens) + `src/lib/format.ts` (all display strings).
- Design/colors/typography → **[DESIGN.md](DESIGN.md)** (the token source of truth) + `apps/mobile/src/theme/colors.ts`.

## Agentic workspace (`.claude/`)

This repo ships a committed agentic workspace. Prefer these over ad-hoc work — they encode the conventions above.

- **Subagents** (`.claude/agents/`) — delegate to these; they auto-trigger by task:
  `scoring-guardian` (FIP engine + spec + vectors), `engine-port-parity` (Swift/Kotlin ports vs `golden.json`), `watch-sync-specialist` (phone↔watch contract + native), `design-system-keeper` (Court Bold tokens across platforms), `verify-gate` (pre-merge checks + required-vs-native CI), `holy-padel-reviewer` (repo-tuned review).
- **Slash commands** (`.claude/commands/`) — `/verify` (install → check → e2e:changed), `/regen-vectors` (regen `golden.json` + port tests), `/ship-pr` (gitmoji micro-commits → PR → manual merge after native jobs green), `/new-native-module` (the Expo-module triad).
- **Skills** (`.claude/skills/`) — `ios-build-run` (dev-client build/run + fast watch rebuild), `gitnexus/*` (code-intelligence CLI).
- **Path rules** (`.claude/rules/`) — load automatically when you open matching files: `scoring`, `watch`, `design`, `native-modules`, `typescript`.
- **Enforced config** — `.claude/settings.json` (permission allowlist, UTF-8/telemetry env, a Biome auto-format hook in `.claude/hooks/`), and `.mcp.json` (the GitNexus MCP server). Personal overrides go in the git-ignored `.claude/settings.local.json`.

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **holy-padel** (2039 symbols, 4670 relationships, 168 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> Index stale? Run `node .gitnexus/run.cjs analyze` from the project root — it auto-selects an available runner. No `.gitnexus/run.cjs` yet? `npx gitnexus analyze` (npm 11 crash → `npm i -g gitnexus`; #1939).

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows. For regression review, compare against the default branch: `detect_changes({scope: "compare", base_ref: "main"})`.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `query({search_query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `context({name: "symbolName"})`.
- For security review, `explain({target: "fileOrSymbol"})` lists taint findings (source→sink flows; needs `analyze --pdg`).

## Never Do

- NEVER edit a function, class, or method without first running `impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `rename` which understands the call graph.
- NEVER commit changes without running `detect_changes()` to check affected scope.

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/holy-padel/context` | Codebase overview, check index freshness |
| `gitnexus://repo/holy-padel/clusters` | All functional areas |
| `gitnexus://repo/holy-padel/processes` | All execution flows |
| `gitnexus://repo/holy-padel/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->
