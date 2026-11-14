import {
  argbFromHex,
  DynamicScheme,
  Hct,
  hexFromArgb,
  TonalPalette,
} from "@material/material-color-utilities";

/**
 * Material 3 Expressive colour roles, generated with Material's own colour
 * maths (HCT tonal palettes) from the two colours the user picks in Settings:
 *
 * - the **highlight** colour seeds the `primary`, `secondary` and neutral
 *   palettes — it is Team A, the CTAs, the active states and the surface tint;
 * - the **Team B** colour seeds the `tertiary` palette — the other side.
 *
 * The scheme is the "fidelity" variant, so `primaryContainer` and
 * `tertiaryContainer` stay the exact colours the user picked while `primary`
 * / `tertiary` are their legible-as-text tones. Two palettes — light and dark —
 * come from the same seeds. Theme selection lives in the `theme` setting
 * (settings table) and is applied by the ThemeProvider via `applyTheme`.
 */

export type ThemeMode = "light" | "dark";

/** One selectable highlight colour — the seed of the primary palette. */
export interface AccentChoice {
  readonly id: string;
  readonly label: string;
  readonly accent: string;
}

/** One selectable Team B colour — the seed of the tertiary palette. */
export interface TeamColorChoice {
  readonly id: string;
  readonly label: string;
  readonly color: string;
}

/** The highlight colours offered in Settings; orange is the default. */
export const ACCENT_CHOICES: readonly AccentChoice[] = [
  { id: "orange", label: "Orange", accent: "#FF6B35" },
  { id: "gold", label: "Gold", accent: "#FFB627" },
  { id: "mint", label: "Mint", accent: "#2EE6A0" },
  { id: "sky", label: "Sky", accent: "#38BDF8" },
  { id: "pink", label: "Pink", accent: "#FF5FA2" },
];

/** The Team B colours offered in Settings; violet is the default. */
export const TEAM_B_CHOICES: readonly TeamColorChoice[] = [
  { id: "violet", label: "Violet", color: "#8B7CFF" },
  { id: "slate", label: "Slate", color: "#5B6B82" },
  { id: "blue", label: "Blue", color: "#2E5BFF" },
  { id: "teal", label: "Teal", color: "#12A594" },
];

const [DEFAULT_ACCENT] = ACCENT_CHOICES as readonly [AccentChoice];
const [DEFAULT_TEAM_B] = TEAM_B_CHOICES as readonly [TeamColorChoice];

/** `Variant.FIDELITY` — the containers keep the seed colours themselves. */
const FIDELITY = 6;
/** Chroma of the neutral palettes: a whisper of the highlight in every surface. */
const NEUTRAL_CHROMA = 3;
const NEUTRAL_VARIANT_CHROMA = 7;
/** Chroma of the secondary palette — the calm tonal fills. */
const SECONDARY_CHROMA = 18;

/** The tonal palettes behind a seed pair — shared by the phone scheme and the watch roles. */
function seedPalettes(accentHex: string, teamBHex: string) {
  const source = Hct.fromInt(argbFromHex(accentHex));
  const teamB = Hct.fromInt(argbFromHex(teamBHex));
  return {
    source,
    primary: TonalPalette.fromHueAndChroma(source.hue, source.chroma),
    secondary: TonalPalette.fromHueAndChroma(source.hue, SECONDARY_CHROMA),
    tertiary: TonalPalette.fromHueAndChroma(teamB.hue, Math.max(teamB.chroma, 24)),
    neutral: TonalPalette.fromHueAndChroma(source.hue, NEUTRAL_CHROMA),
    neutralVariant: TonalPalette.fromHueAndChroma(source.hue, NEUTRAL_VARIANT_CHROMA),
  };
}

/** The Material colour roles for one seed pair in one mode. */
function buildScheme(accentHex: string, teamBHex: string, dark: boolean) {
  const palettes = seedPalettes(accentHex, teamBHex);
  const scheme = new DynamicScheme({
    sourceColorArgb: palettes.source.toInt(),
    variant: FIDELITY,
    contrastLevel: 0,
    isDark: dark,
    primaryPalette: palettes.primary,
    secondaryPalette: palettes.secondary,
    tertiaryPalette: palettes.tertiary,
    neutralPalette: palettes.neutral,
    neutralVariantPalette: palettes.neutralVariant,
  });
  return {
    /** Legible highlight: filled buttons, active text and icons, Team A. */
    primary: hexFromArgb(scheme.primary),
    onPrimary: hexFromArgb(scheme.onPrimary),
    /** The highlight colour itself: hero cards, the FAB, wins. */
    primaryContainer: hexFromArgb(scheme.primaryContainer),
    onPrimaryContainer: hexFromArgb(scheme.onPrimaryContainer),
    secondary: hexFromArgb(scheme.secondary),
    onSecondary: hexFromArgb(scheme.onSecondary),
    /** Tonal fills: selected chips, the nav indicator, tonal buttons. */
    secondaryContainer: hexFromArgb(scheme.secondaryContainer),
    onSecondaryContainer: hexFromArgb(scheme.onSecondaryContainer),
    /** Team B as text and marks. */
    tertiary: hexFromArgb(scheme.tertiary),
    onTertiary: hexFromArgb(scheme.onTertiary),
    /** The Team B colour itself: avatar discs, losses on the calendar. */
    tertiaryContainer: hexFromArgb(scheme.tertiaryContainer),
    onTertiaryContainer: hexFromArgb(scheme.onTertiaryContainer),
    /** Destructive actions (delete, discard). */
    error: hexFromArgb(scheme.error),
    onError: hexFromArgb(scheme.onError),
    errorContainer: hexFromArgb(scheme.errorContainer),
    onErrorContainer: hexFromArgb(scheme.onErrorContainer),
    /** Screen background. */
    background: hexFromArgb(dark ? scheme.surface : scheme.surfaceContainer),
    /** Card surface on the screen background. */
    card: hexFromArgb(dark ? scheme.surfaceContainer : scheme.surfaceContainerLowest),
    /** Nested fill inside a card: tiles, rows, tracks, text fields. */
    cardInset: hexFromArgb(dark ? scheme.surfaceContainerHighest : scheme.surfaceContainer),
    surface: hexFromArgb(scheme.surface),
    surfaceContainerLow: hexFromArgb(scheme.surfaceContainerLow),
    surfaceContainer: hexFromArgb(scheme.surfaceContainer),
    surfaceContainerHigh: hexFromArgb(scheme.surfaceContainerHigh),
    surfaceContainerHighest: hexFromArgb(scheme.surfaceContainerHighest),
    /** Body text and icons. */
    onSurface: hexFromArgb(scheme.onSurface),
    /** Supporting text, labels, inactive icons. */
    onSurfaceVariant: hexFromArgb(scheme.onSurfaceVariant),
    /** Borders that must be seen (outlined buttons, focused fields). */
    outline: hexFromArgb(scheme.outline),
    /** Hairlines and dividers. */
    outlineVariant: hexFromArgb(scheme.outlineVariant),
    inverseSurface: hexFromArgb(scheme.inverseSurface),
    inverseOnSurface: hexFromArgb(scheme.inverseOnSurface),
    inversePrimary: hexFromArgb(scheme.inversePrimary),
    /** Sport markers: small dots, stripes and tags — the same in both modes. */
    sportPadel: "#C8A464",
    sportSquash: "#8B7CFF",
    sportPickleball: "#19B5C8",
    /** Text drawn on a sport marker fill. */
    onSport: "#1D1B20",
    /** The veil behind a bottom sheet. */
    scrim: "rgba(0, 0, 0, 0.4)",
  };
}

/** Material's error palette (hue 25, chroma 84) — the same for every seed. */
const ERROR_HUE = 25;
const ERROR_CHROMA = 84;

/**
 * The Wear OS Material 3 colour roles for a seed pair, as `#rrggbb`. Watch
 * faces are always dark on a true-black background, and Wear maps roles to
 * tones differently from the phone (a pale `primary` at tone 90, containers at
 * tone 30), so this uses Wear's own tone table over the same tonal palettes.
 * The phone computes it and sends it in the sync payload's `palette.roles`,
 * so the watch needs no colour maths of its own (docs/watch-sync.md).
 */
export function watchRoles(accentHex: string, teamBHex: string): WatchRoles {
  const key = `${accentHex}:${teamBHex}`;
  const cached = watchRoleCache.get(key);
  if (cached !== undefined) {
    return cached;
  }
  const built = buildWatchRoles(accentHex, teamBHex);
  watchRoleCache.set(key, built);
  return built;
}

function buildWatchRoles(accentHex: string, teamBHex: string) {
  const palettes = seedPalettes(accentHex, teamBHex);
  const error = TonalPalette.fromHueAndChroma(ERROR_HUE, ERROR_CHROMA);
  const tone = (palette: TonalPalette, value: number): string => hexFromArgb(palette.tone(value));
  return {
    primary: tone(palettes.primary, 90),
    primaryDim: tone(palettes.primary, 80),
    primaryContainer: tone(palettes.primary, 30),
    onPrimary: tone(palettes.primary, 10),
    onPrimaryContainer: tone(palettes.primary, 95),
    secondary: tone(palettes.secondary, 90),
    secondaryDim: tone(palettes.secondary, 80),
    secondaryContainer: tone(palettes.secondary, 30),
    onSecondary: tone(palettes.secondary, 10),
    onSecondaryContainer: tone(palettes.secondary, 95),
    tertiary: tone(palettes.tertiary, 90),
    tertiaryDim: tone(palettes.tertiary, 80),
    tertiaryContainer: tone(palettes.tertiary, 30),
    onTertiary: tone(palettes.tertiary, 10),
    onTertiaryContainer: tone(palettes.tertiary, 95),
    surfaceContainerLow: tone(palettes.neutral, 15),
    surfaceContainer: tone(palettes.neutral, 20),
    surfaceContainerHigh: tone(palettes.neutral, 30),
    onSurface: tone(palettes.neutral, 95),
    onSurfaceVariant: tone(palettes.neutralVariant, 80),
    outline: tone(palettes.neutralVariant, 60),
    outlineVariant: tone(palettes.neutralVariant, 40),
    error: tone(error, 80),
    errorDim: tone(error, 70),
    errorContainer: tone(error, 30),
    onError: tone(error, 10),
    onErrorContainer: tone(error, 95),
  };
}

export type WatchRoles = Readonly<ReturnType<typeof buildWatchRoles>>;

/** The payload is rebuilt on every ledger change; the roles only change with the picks. */
const watchRoleCache = new Map<string, WatchRoles>();

export type ColorRoles = ReturnType<typeof buildScheme>;

let mode: ThemeMode = "light";
let accentChoice: AccentChoice = DEFAULT_ACCENT;
let teamBChoice: TeamColorChoice = DEFAULT_TEAM_B;

const schemes = new Map<string, ColorRoles>();

/** The scheme for the current mode and colour picks — built once per combination. */
function currentScheme(): ColorRoles {
  const key = `${mode}:${accentChoice.id}:${teamBChoice.id}`;
  const cached = schemes.get(key);
  if (cached !== undefined) {
    return cached;
  }
  const built = buildScheme(accentChoice.accent, teamBChoice.color, mode === "dark");
  schemes.set(key, built);
  return built;
}

/** The resolved palette — its values are swapped in place by `applyTheme`. */
export const colors: ColorRoles = { ...currentScheme() };

function rgbOf(hex: string): readonly [number, number, number] {
  const value = Number.parseInt(hex.slice(1), 16);
  // biome-ignore lint/suspicious/noBitwiseOperators: unpacking the #RRGGBB channels
  return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
}

function withAlpha(hex: string, alpha: number): string {
  const [r, g, b] = rgbOf(hex);
  return `rgba(${String(r)}, ${String(g)}, ${String(b)}, ${String(alpha)})`;
}

/**
 * `onSurface` at an opacity — Material's state layers (hover 0.08, press 0.1)
 * and the disabled treatment (container 0.1, content 0.38).
 */
export function onSurfaceAlpha(alpha: number): string {
  return withAlpha(colors.onSurface, alpha);
}

/** `primary` at an opacity — the tint under a selected or serving surface. */
export function primaryAlpha(alpha: number): string {
  return withAlpha(colors.primary, alpha);
}

/** The win colour (`primaryContainer`) as RGB — for scales that interpolate. */
export function winRgb(): readonly [number, number, number] {
  return rgbOf(colors.primaryContainer);
}

/** The loss colour (`tertiaryContainer`) as RGB — for scales that interpolate. */
export function lossRgb(): readonly [number, number, number] {
  return rgbOf(colors.tertiaryContainer);
}

/** The ids of the colours currently applied. */
export function appliedColors(): { readonly accent: string; readonly teamB: string } {
  return { accent: accentChoice.id, teamB: teamBChoice.id };
}

/**
 * Apply the user's highlight and Team B colours (unknown ids fall back to the
 * defaults). Like `applyTheme`, it swaps `colors` in place during render;
 * the caller notifies subscribers after commit.
 */
export function applyColors(accentId: string | undefined, teamBId: string | undefined): void {
  accentChoice = ACCENT_CHOICES.find((choice) => choice.id === accentId) ?? DEFAULT_ACCENT;
  teamBChoice = TEAM_B_CHOICES.find((choice) => choice.id === teamBId) ?? DEFAULT_TEAM_B;
  Object.assign(colors, currentScheme());
}

/**
 * The marker colour for a sport — small dots, stripes and tags only, never
 * CTA fills or large areas. Text drawn on a sport-colour fill is
 * `colors.onSport`. Padel is the default when the config leaves `sport` unset.
 */
export function sportColor(sport: "padel" | "squash" | "pickleball" | undefined): string {
  if (sport === "squash") {
    return colors.sportSquash;
  }
  if (sport === "pickleball") {
    return colors.sportPickleball;
  }
  return colors.sportPadel;
}

/** The currently applied palette mode. */
export function themeMode(): ThemeMode {
  return mode;
}

const listeners = new Set<() => void>();

/** Subscribe to theme flips (useSyncExternalStore) — see ThemeController. */
export function subscribeTheme(listener: () => void): () => void {
  listeners.add(listener);
  return (): void => {
    listeners.delete(listener);
  };
}

/**
 * Swap the palette in place. Called by the ThemeProvider during render —
 * every component that reads `colors` picks the mode up on its next render
 * without per-component subscriptions. Callers must eventually
 * `notifyThemeChanged()` (after commit) so root-level consumers re-render.
 */
export function applyTheme(next: ThemeMode): void {
  mode = next;
  Object.assign(colors, currentScheme());
}

/** Fire the theme subscriptions — after commit (useLayoutEffect). */
export function notifyThemeChanged(): void {
  for (const listener of listeners) {
    listener();
  }
}
