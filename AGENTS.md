# Holy Padel — agent guide

> Tool-neutral entry point (the [AGENTS.md](https://agents.md) standard). Claude Code
> also reads the richer **[CLAUDE.md](CLAUDE.md)** and the committed `.claude/` workspace
> (subagents, slash commands, path rules, skills); other agents should start here. The
> GitNexus code-intelligence block below is **auto-generated** — never edit inside the
> `gitnexus` markers (run `node .gitnexus/run.cjs analyze` to refresh it); add hand-written
> content only above them.

Local-first **padel score tracker**: an Expo / React Native phone app plus **Apple Watch
and Wear OS** companions, with an event-sourced FIP-rules scoring engine. Matches never
leave the device by default. The **FIP Rules of Padel** PDF (`design/`) + `docs/fip-scoring-spec.md`
are the leading source of truth for all scoring.

## Monorepo (Turborepo + pnpm)

- `packages/scoring` — pure, event-sourced FIP engine: `computeMatch(config, events)` folds a
  `PointEvent[]` into a snapshot; **undo = drop the last event**. No I/O.
- `packages/db` — SQLite schema + typed repositories.
- `apps/mobile` — Expo app (expo-router, Tamagui); watch sync in `src/watch`, watchOS target in `targets/watch`.
- `apps/watch-wear` — Wear OS (Kotlin + Compose).
- `packages/scoring-swift` / `packages/scoring-kotlin` — engine ports kept byte-identical to the TS golden vectors.

## Golden rules

- **Phone is the single source of truth; watches only mirror it.** No scoring logic on a watch.
- When scoring behaviour changes: update `docs/fip-scoring-spec.md` (or
  `docs/squash-scoring-spec.md` for squash), regenerate the golden vectors
  (`node packages/scoring/scripts/write-vectors.ts`), and keep the Swift + Kotlin ports passing.
- **Design tokens live in [DESIGN.md](DESIGN.md)** (source of truth) + `apps/mobile/src/theme/colors.ts`.
  Never set a tight `lineHeight` on Anton/Display text — round glyphs clip ("0" reads "U").

## Conventions

- TypeScript strict + `exactOptionalPropertyTypes`: **omit** optional keys, never assign `undefined`. App code imports via the `@/` alias.
- Biome preset `all` + nursery (max strict). Autofix a file: `pnpm exec biome check --write <file>`.
- Gitmoji micro-commits, one logical change each. Branch off `main` (protected); open a PR.

## Verify before pushing

```sh
pnpm install
pnpm check                              # Biome + tsc + unit/property tests, all packages
pnpm --filter @holy-padel/mobile e2e:changed    # Playwright specs your changes affect (full `e2e` before merge)
```

## CI & merging

Required checks: **quality**, **e2e**, **web-build**. NOT required (native): `watch-wear`,
`watchos`, `watch-bridge`, `compile-android`/`compile-ios`, `native-e2e`, `engine-ports`. For
native-touching PRs, **merge manually once the native jobs report green** — never let auto-merge
land before them (a wrong androidx signature once broke `main`).

More: full guide + `.claude/` workspace map in **[CLAUDE.md](CLAUDE.md)**; design system in
**[DESIGN.md](DESIGN.md)**; contracts in `docs/fip-scoring-spec.md`,
`docs/squash-scoring-spec.md` and `docs/watch-sync.md`.

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
