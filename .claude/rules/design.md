# Design system — Material 3 Expressive

`DESIGN.md` at the repo root is the source of truth for the phone app: Material 3
Expressive — colour roles generated from the user's highlight and Team B picks,
Google Sans Flex, large round tonal shapes, no shadows. When a value is in doubt,
`DESIGN.md` wins.

## Where tokens live

- **`apps/mobile/src/theme/colors.ts` is canonical.** `buildScheme()` derives
  every Material role from the two seed colours; components read `colors.*`
  (and `onSurfaceAlpha` / `primaryAlpha` / `winRgb` / `lossRgb`). Don't
  hard-code hex in components.
- Components come from `apps/mobile/src/components/ui.tsx` and `controls.tsx` (`Button`,
  `IconButton`, `Chip`, `Card`, `ListItem`, `ProgressBar`, `TextField`, …),
  `sheet.tsx` and `segmented-row.tsx`. Reach for these before hand-rolling an
  `XStack` button.
- Icons are Material Symbols Rounded via `<Icon name="…" />`; add a glyph's path
  to `components/icon-paths.ts`.
- Wear OS is Material 3 Expressive too; its colour roles are computed on the
  phone (`watchRoles()` in `colors.ts`) and sent as `palette.roles`, then read
  through `WatchColors` in `apps/watch-wear/.../ui/Colors.kt`. The Apple Watch
  (`Court` in `apps/mobile/targets/watch/Theme.swift`) keeps its own near-black
  look and takes only the two seed colours.

## Colour intent

- **One vivid surface per screen**: `primaryContainer` marks the thing that
  matters now (live card, serving team, wins). `primary` is the filled button
  and active text. Tonal fills are `secondaryContainer`.
- **Always pair a container with its own on-colour** so contrast holds for
  every highlight pick in light and dark.
- **Teams read by colour**: Team A is the primary pair, Team B the tertiary
  pair. Both seeds are user-selectable — never hard-code the default hex.
- Muted text is `onSurfaceVariant`, not `onSurface` at an opacity.
- Use `error` for destructive actions only.

## Type and copy

Google Sans Flex throughout: `Display` (bold) for numerals and headlines, `Body`,
`SectionTitle`, `Label`. Copy is **sentence case** — no all-caps labels, no wide
tracking.

## Shape

Buttons are fully round and tighten on press; selection changes shape (round vs
soft-square); cards are 28, hero cards 36, chips 8. Grouped lists use
`groupCorners`. No shadows — depth is tonal.
