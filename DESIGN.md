---
version: alpha
name: Holy Padel — Material 3 Expressive
description: >-
  The persistent design system for the Holy Padel phone app: Material 3
  Expressive. Colour roles are generated at runtime with Material's HCT colour
  maths from the two colours the user picks (highlight → primary, Team B →
  tertiary); type is Google Sans Flex; shapes are large, round and tonal, with
  no shadows. Canonical values live in apps/mobile/src/theme/colors.ts and
  tamagui.config.ts — this file is their human- and machine-readable contract.
  The Wear OS app is Material 3 Expressive too, in colours the phone computes
  for it; the Apple Watch keeps its earlier near-black look (see Platforms).
colors:
  # Seeds — the only hand-picked colours. Everything below is derived from them
  # by buildScheme() in colors.ts; the hex shown is the default pair, light mode.
  seed-highlight: "#FF6B35"   # default highlight (orange); user-selectable
  seed-team-b: "#8B7CFF"      # default Team B (violet); user-selectable
  # Primary — the highlight: Team A, CTAs, active states, wins.
  primary: "#AB3500"               # filled buttons, active text and icons
  on-primary: "#FFFFFF"
  primary-container: "#FF6B35"     # the highlight itself: hero cards, wins, serve
  on-primary-container: "#5F1900"
  # Secondary — calm tonal fills.
  secondary-container: "#FCCDBE"   # tonal buttons, selected chips, nav indicator
  on-secondary-container: "#785549"
  # Tertiary — Team B.
  tertiary: "#5A49CB"              # Team B as text and marks
  tertiary-container: "#978AFF"    # the Team B colour (nearest tone): avatars, losses
  on-tertiary-container: "#2B079D"
  # Error — destructive actions only.
  error: "#BA1A1A"
  on-error: "#FFFFFF"
  # Surfaces — neutrals carrying a whisper of the highlight hue.
  background: "#F6ECE9"            # screen (light: surface-container; dark: surface)
  card: "#FFFFFF"                  # card on the screen (dark: surface-container)
  card-inset: "#F6ECE9"            # nested fill inside a card
  surface-container-low: "#FCF1EE" # bottom sheets
  surface-container-high: "#F1E6E3" # navigation bar, dialogs
  surface-container-highest: "#EBE0DD" # text fields, losses, empty tracks
  on-surface: "#1F1A19"
  on-surface-variant: "#514440"    # supporting text, inactive icons
  outline: "#84746F"
  outline-variant: "#D6C2BD"       # hairlines, chip and button outlines
  inverse-surface: "#352F2E"       # the status pill on the live screen
  inverse-on-surface: "#F9EEEC"
  # Sport markers — fixed, the same in both modes. Small dots and tags only.
  sport-padel: "#C8A464"
  sport-squash: "#8B7CFF"
  sport-pickleball: "#19B5C8"
  on-sport: "#1D1B20"
typography:
  # One family: Google Sans Flex. "Display" is the emphasized (bold) cut.
  display-score:  { fontFamily: Google Sans Flex, fontSize: 104px, fontWeight: 700, letterSpacing: -3px }
  display-lg:     { fontFamily: Google Sans Flex, fontSize: 64px,  fontWeight: 700, letterSpacing: -2px }
  display-md:     { fontFamily: Google Sans Flex, fontSize: 48px,  fontWeight: 700, letterSpacing: -1px }
  headline-lg:    { fontFamily: Google Sans Flex, fontSize: 32px,  fontWeight: 700 }
  headline-md:    { fontFamily: Google Sans Flex, fontSize: 28px,  fontWeight: 700 }
  headline-sm:    { fontFamily: Google Sans Flex, fontSize: 24px,  fontWeight: 600 }
  title-lg:       { fontFamily: Google Sans Flex, fontSize: 22px,  fontWeight: 600 }
  title-md:       { fontFamily: Google Sans Flex, fontSize: 16px,  fontWeight: 500 }
  title-sm:       { fontFamily: Google Sans Flex, fontSize: 14px,  fontWeight: 600, letterSpacing: 0.1px }
  body-lg:        { fontFamily: Google Sans Flex, fontSize: 16px,  fontWeight: 400 }
  body-md:        { fontFamily: Google Sans Flex, fontSize: 14px,  fontWeight: 400, lineHeight: 20px }
  label-lg:       { fontFamily: Google Sans Flex, fontSize: 14px,  fontWeight: 500, letterSpacing: 0.1px }
  label-md:       { fontFamily: Google Sans Flex, fontSize: 12px,  fontWeight: 500, letterSpacing: 0.2px }
rounded:
  xs: 6px      # the seams between rows of a grouped list
  sm: 8px      # chips, tags, unselected segments
  md: 16px     # text fields, small tiles
  lg: 20px     # inset tiles inside a card
  xl: 28px     # cards, sheets, dialogs, stat tiles
  xxl: 36px    # hero cards
  full: 9999px # buttons, pills, the nav indicator, avatars
spacing:
  # Material's 4dp grid.
  xs: 4px
  sm: 8px
  md: 12px
  lg: 16px
  xl: 20px
  xxl: 24px
components:
  button-filled:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.title-md}"
    rounded: "{rounded.full}"
    height: 56px
  button-tonal:
    backgroundColor: "{colors.secondary-container}"
    textColor: "{colors.on-secondary-container}"
    rounded: "{rounded.full}"
  button-outlined:
    backgroundColor: transparent
    textColor: "{colors.on-surface-variant}"
    rounded: "{rounded.full}"
  button-text:
    backgroundColor: transparent
    textColor: "{colors.primary}"
  button-danger:
    backgroundColor: "{colors.error}"
    textColor: "{colors.on-error}"
    rounded: "{rounded.full}"
  card:
    backgroundColor: "{colors.card}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.xl}"
  card-hero:
    backgroundColor: "{colors.primary-container}"
    textColor: "{colors.on-primary-container}"
    rounded: "{rounded.xxl}"
  chip:
    backgroundColor: transparent
    textColor: "{colors.on-surface-variant}"
    rounded: "{rounded.sm}"
    height: 32px
  chip-selected:
    backgroundColor: "{colors.secondary-container}"
    textColor: "{colors.on-secondary-container}"
    rounded: "{rounded.sm}"
  navigation-bar:
    backgroundColor: "{colors.surface-container-high}"
    height: 80px
  navigation-indicator:
    backgroundColor: "{colors.secondary-container}"
    rounded: "{rounded.full}"
  avatar-team-a:
    backgroundColor: "{colors.primary-container}"
    textColor: "{colors.on-primary-container}"
    rounded: "{rounded.full}"
  avatar-team-b:
    backgroundColor: "{colors.tertiary-container}"
    textColor: "{colors.on-tertiary-container}"
    rounded: "{rounded.full}"
  result-badge-won:
    backgroundColor: "{colors.primary-container}"
    textColor: "{colors.on-primary-container}"
    rounded: "{rounded.full}"
  result-badge-lost:
    backgroundColor: "{colors.surface-container-highest}"
    textColor: "{colors.on-surface-variant}"
    rounded: "{rounded.sm}"
---

# Holy Padel — Material 3 Expressive

## Overview

Holy Padel is a **local-first padel score tracker**. The phone app follows
**Material 3 Expressive**, so it sits naturally beside Google's own apps: tonal
surfaces tinted from one seed colour, Google Sans Flex, big round shapes,
sentence-case copy and Material Symbols.

The personality comes from Expressive's levers rather than from decoration:
**emphasized type** for the score, **shape contrast** (round against
soft-square) to carry state, and **one vivid container colour** for the thing
that matters right now. Everything stays glanceable at arm's length.

Audience: padel players logging matches themselves, offline, on phone **and**
wearable. Priorities, in order: **legibility at a glance → clear hierarchy →
expressive energy**.

## Colors

Colours are **roles, not hexes**. `buildScheme()` in `colors.ts` runs Material's
colour utilities (`@material/material-color-utilities`, the *fidelity* variant)
over two seeds and returns the roles for light and dark:

- **Highlight seed → primary, secondary and the neutrals.** Chosen in Settings
  (orange default; gold, mint, sky, pink). `primaryContainer` is the picked
  colour itself; `primary` is its legible-as-text tone. The neutral surfaces
  carry a low-chroma tint of the same hue, so the whole app shifts with the pick.
- **Team B seed → tertiary.** Chosen in Settings (violet default; slate, blue,
  teal). `tertiaryContainer` is the picked colour, nudged to the nearest tone that
  keeps its on-colour legible.

How the roles are used:

- **`primary` / `onPrimary`** — the filled button, active text and icons, chart
  marks for "you", selected segments.
- **`primaryContainer` / `onPrimaryContainer`** — the vivid fill: the live hero
  card, the serving team's card, W badges, Team A avatars, wins on the calendar.
  Use it for the **one** surface per screen that should pull the eye.
- **`secondaryContainer` / `onSecondaryContainer`** — tonal buttons, selected
  chips, the navigation indicator, leading icons in list rows.
- **`tertiary` / `tertiaryContainer`** — Team B: avatars, the "Team B ahead"
  line, losses on the calendar.
- **`error`** — destructive actions only (delete, discard), always behind a
  confirm.
- **Surfaces** — `background` is the screen, `card` sits on it, `cardInset` nests
  inside a card. Sheets use `surfaceContainerLow`; the navigation bar and
  dialogs `surfaceContainerHigh`; text fields and empty tracks
  `surfaceContainerHighest`.
- **`onSurface` / `onSurfaceVariant`** — body text, and supporting text. Muted
  text is always `onSurfaceVariant`, never `onSurface` at an opacity.
- **`outlineVariant`** — hairlines and the outline of chips and outlined buttons.
- **Sport markers** (`sportColor(sport)`) — fixed sand / violet / cyan dots and
  tags naming the sport. Never a button fill or a large area; text on one is
  `onSport`.
- **Effort reads as one ramp.** Heart-rate zones and per-game effort bars are
  `primaryAlpha` at 0.2 / 0.36 / 0.55 / 0.78 / 1 (`zoneColor` in
  `insight-parts.tsx`). No traffic-light greens and reds.

**Helpers.** `onSurfaceAlpha(a)` is for Material state layers and the disabled
treatment only (container 0.1, content 0.38). `primaryAlpha(a)` is the effort
ramp. `winRgb()` / `lossRgb()` feed scales that interpolate (the calendar).
Never hard-code a hex in a component — every colour comes from `colors`.

## Typography

One family, **Google Sans Flex**, loaded in `apps/mobile/src/app/_layout.tsx`
via `@expo-google-fonts/google-sans-flex` at weights 400–800.

- **`Display`** (`$heading`) — the emphasized cut, bold by default: score
  numerals, screen headlines, team names, big figures. Large sizes take slightly
  negative tracking.
- **`Body`** — regular by default; titles pass `fontWeight="500"` or `"600"`.
- **`SectionTitle`** — title-small, the heading at the top of a card.
- **`Label`** — label-medium in `onSurfaceVariant`: captions under figures,
  metadata, hints.

**Copy is sentence case.** No all-caps labels and no wide tracking. The one
exception is the live status call ("GAME POINT — …"), which is the scoring
engine's own string, shared with the watches.

## Layout

Screens use safe-area insets plus Material's 4dp grid: 16 horizontal padding,
12 between cards, 20 inside a card. Tab screens end with the 80dp **navigation
bar**; pushed and modal screens start with a top app bar (`ModalHeader`: a 48dp
icon button, then the headline). On long forms the primary action sits in a
**fixed footer** so it never scrolls away.

Lists of like things (matches, players, settings) are **grouped lists**: rows
2dp apart, the group's outer corners large and the seams tight
(`groupCorners`), each row at least 72dp with a 40dp leading element.

## Elevation & Depth

**No shadows.** Depth is tonal: `background` → `card` → `cardInset`, and the
container colours for emphasis. Sheets and dialogs separate from the screen
with a `scrim`, not a shadow.

## Shapes

Shape is expressive, and it carries meaning:

- **Buttons are fully round** and their corners tighten while pressed (the
  shape morph).
- **Selection changes shape**: in a connected button group the selected segment
  turns fully round while the others keep tight inner corners; a picked colour
  swatch turns from a circle into a soft square; a picked roster row rounds out.
- **Results read by shape**: a W badge is a circle, L and D are soft squares.
- **The serving card** on the live screen takes larger corners along with the
  highlight colour.
- **The hero avatar** on Home, Profile and a player's page is the scalloped
  "cookie"; every other avatar is a circle.
- Cards are `xl` (28), hero cards `xxl` (36), inset tiles `lg` (20), chips `sm` (8).

## Components

Display atoms live in `apps/mobile/src/components/ui.tsx`, interactive controls in `controls.tsx`.

- **`Button`** — `filled` (the one primary action), `tonal`, `outlined`, `text`,
  `danger`, `dangerText`; sizes `sm` 40 / `md` 56 / `lg` 72. Optional leading and
  trailing icons.
- **`IconButton`** — `standard`, `tonal`, `filled`, `outlined`.
- **`Chip`** — filter chip: outlined at rest, tonal with a leading check when
  selected.
- **`SegmentedGroup` / `SegmentedRow`** (`segmented-row.tsx`) — the connected
  button group, with its label above.
- **`Card`**, **`ListItem`**, **`Divider`**, **`Pill`**.
- **`ProgressBar`** — thick, rounded, with a gap between the active segment and
  the track.
- **`TextField`** — filled, label above.
- **`Sheet`** (`sheet.tsx`) — the bottom sheet scaffold: scrim, 28dp top
  corners, drag handle.
- **`Avatar`**, **`ResultBadge`**, **`LiveDot`**, **`LegendKey`**.
- **`Icon`** (`icons.tsx`) — Material Symbols Rounded, drawn from path data in
  `icon-paths.ts` so only the glyphs in use ship and they render the same on
  every platform.
- **Navigation bar** (`app/(tabs)/_layout.tsx`) — four destinations; the active
  one gets a tonal pill behind a filled icon.

## Do's and Don'ts

- **Do** take every colour from a role in `colors`. **Don't** hard-code a hex,
  and don't mute text with opacity — use `onSurfaceVariant`.
- **Do** pair each container with its own on-colour (`onPrimaryContainer` on
  `primaryContainer`, and so on) so contrast holds for every highlight pick in
  both modes.
- **Do** keep one filled button and at most one `primaryContainer` surface per
  screen. **Don't** use `primaryContainer` as a neutral surface.
- **Do** use sport markers for small dots and tags only.
- **Do** write sentence case. **Don't** add all-caps labels or wide tracking.
- **Don't** add shadows; reach for a tonal step or a scrim.
- **Do** keep the primary action on a fixed footer on long screens.
- **Do** treat WCAG AA (4.5:1 body text) as the floor.

## Platforms & Mirroring

- **Phone (Tamagui)** — `apps/mobile/src/theme/colors.ts` is canonical: the
  seeds, `buildScheme()` and the helpers. Fonts are wired in
  `tamagui.config.ts`; the components live in `components/ui.tsx` and `components/controls.tsx`.
- **Wear OS (Compose)** — also Material 3 Expressive, on Wear Compose Material 3
  and, for the tile, ProtoLayout Material 3. Its colours are **computed on the
  phone**: `watchRoles()` in `colors.ts` runs Wear's tone table (pale `primary`
  at tone 90, containers at tone 30, true-black background) over the same tonal
  palettes and sends the result as `palette.roles` in the sync payload
  (docs/watch-sync.md). `WatchColors` in `apps/watch-wear/.../ui/Colors.kt`
  turns them into the scheme; team names and the serve mark use the two picks
  themselves. See `apps/watch-wear/README.md`.
- **Apple Watch (SwiftUI)** — `apps/mobile/targets/watch/Theme.swift`, `enum
  Court`. **Not restyled**: it keeps its near-black scoreboard look and takes
  only the two picks (`palette.accent` / `palette.teamB`).

When you add a highlight or Team B choice, add it to `ACCENT_CHOICES` /
`TEAM_B_CHOICES` in `colors.ts`; the phone derives its own roles and the Wear
roles automatically, and both watches receive the new hex through `palette`.
