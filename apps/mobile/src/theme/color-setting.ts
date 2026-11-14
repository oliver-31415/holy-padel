import { getSetting, type SqlDriver } from "@holy-padel/db";
import type { AccentChoice, TeamColorChoice, WatchRoles } from "./colors.ts";
import { ACCENT_CHOICES, TEAM_B_CHOICES, watchRoles } from "./colors.ts";

export const ACCENT_KEY = "accentColor";
export const TEAM_B_KEY = "teamBColor";

/** The user's colour picks (ids); undefined = the default (orange / violet). */
export interface ColorSetting {
  readonly accent: string | undefined;
  readonly teamB: string | undefined;
}

/** Read the persisted accent and Team B colour choices. */
export function loadColorSetting(driver: SqlDriver): ColorSetting {
  return { accent: getSetting(driver, ACCENT_KEY), teamB: getSetting(driver, TEAM_B_KEY) };
}

/**
 * The two user colours as `#RRGGBB`, for surfaces that can't read `colors`,
 * plus the Wear OS colour roles derived from them.
 */
export interface Palette {
  readonly accent: string;
  readonly teamB: string;
  /** Wear OS Material 3 roles for these two colours — see `watchRoles`. */
  readonly roles: WatchRoles;
}

/**
 * The hex values for a colour setting: the two picks themselves (the bright
 * colours a dark watch face draws team names and the serve mark in) and the
 * Wear colour roles derived from them.
 */
export function paletteFor(setting: ColorSetting): Palette {
  const [defaultAccent] = ACCENT_CHOICES as readonly [AccentChoice];
  const [defaultTeamB] = TEAM_B_CHOICES as readonly [TeamColorChoice];
  const accent = ACCENT_CHOICES.find((choice) => choice.id === setting.accent) ?? defaultAccent;
  const teamB = TEAM_B_CHOICES.find((choice) => choice.id === setting.teamB) ?? defaultTeamB;
  return {
    accent: accent.accent,
    teamB: teamB.color,
    roles: watchRoles(accent.accent, teamB.color),
  };
}
