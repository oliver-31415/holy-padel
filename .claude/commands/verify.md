---
argument-hint: "[optional package filter, e.g. @holy-padel/db]"
---

Run the full local verification for Holy Padel and report the result of each phase. Working tree at the start:

!`git status --short`

Run these three phases in order, from the repo root. Do not skip ahead — a failing phase means the branch is not ready, so stop and report.

1. **Install** — `pnpm install`. If it touched `pnpm-lock.yaml` or appended an approval to `minimumReleaseAgeExclude` in `pnpm-workspace.yaml`, flag that those files must be committed together (CI fails otherwise).
2. **Check** — `pnpm check` (Biome + `tsc` + vitest/property tests across every package). If `$ARGUMENTS` is given, scope to that package instead: `pnpm --filter $ARGUMENTS check`.
3. **E2E** — `pnpm --filter @holy-padel/mobile e2e:changed` (Playwright vs the Expo web build, limited to the specs the working-tree and branch changes can affect; it reports when it falls back to the full suite). Skip this phase only if `$ARGUMENTS` was given and names a package other than `@holy-padel/mobile`. The full `pnpm --filter @holy-padel/mobile e2e` is for pre-merge and CI, not this command.

Report each phase as PASS or FAIL. For any failure, surface the tool's output **verbatim** — the exact Biome rule, `tsc` diagnostic, or failing test name and assertion — then stop; do not attempt fixes unless asked.

Do not run native builds (`expo run:ios`, `android`), the Swift/Kotlin engine-port tests, or the golden-vector regen here — those live in their own workflows and are not part of `/verify`.
