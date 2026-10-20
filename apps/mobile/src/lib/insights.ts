import type { HeartRateSample, MatchSummary, MotionSample, SqlDriver } from "@holy-padel/db";
import {
  getSetting,
  listMatches,
  loadEvents,
  loadMatchHeartRate,
  loadMatchMotion,
} from "@holy-padel/db";
import type { PointEvent, TeamId } from "@holy-padel/scoring";
import type { Clutch } from "@/lib/clutch.ts";
import { addClutch, EMPTY_CLUTCH, matchClutch, matchTurnarounds } from "@/lib/clutch.ts";
import type { EffortBand, GameEffort } from "@/lib/effort.ts";
import { effortBands, estimatedMaxHr, timeInZones, ZONES } from "@/lib/effort.ts";
import { activityIn, gameWindows, matchWindow } from "@/lib/game-activity.ts";
import { computeGameSeries } from "@/lib/game-series.ts";
import { smoothHeartRate } from "@/lib/heart-rate-series.ts";
import type { RallyLengths } from "@/lib/rallies.ts";
import { addRallies, NO_RALLIES, rallyLengths } from "@/lib/rallies.ts";

export type Sport = "padel" | "squash" | "pickleball";

/** A finished match with everything the insights read. */
export interface InsightMatch {
  readonly match: MatchSummary;
  readonly events: readonly PointEvent[];
  readonly heartRate: readonly HeartRateSample[] | undefined;
  readonly motion: readonly MotionSample[] | undefined;
}

/** Every finished match, newest first, with its ledger and watch data. */
export function loadInsightData(driver: SqlDriver): InsightMatch[] {
  return listMatches(driver)
    .filter((match) => match.status === "finished" && match.winner !== undefined)
    .map((match) => ({
      match,
      events: loadEvents(driver, match.id),
      heartRate: loadMatchHeartRate(driver, match.id),
      motion: loadMatchMotion(driver, match.id),
    }));
}

export function sportOf(match: MatchSummary): Sport {
  return match.config.sport ?? "padel";
}

/** The sports played, in a stable order — the filter only shows when there's more than one. */
export function sportsPlayed(data: readonly InsightMatch[]): Sport[] {
  const played = new Set(data.map((entry) => sportOf(entry.match)));
  return (["padel", "squash", "pickleball"] as const).filter((sport) => played.has(sport));
}

/** Your record with one other player — as your partner or across the net. */
export interface PersonRecord {
  readonly playerId: string;
  readonly name: string;
  readonly won: number;
  readonly lost: number;
}

/** One tracked match on the trend chart. */
export interface TrendPoint {
  readonly matchId: string;
  readonly startedAt: number;
  readonly won: boolean;
  readonly avgBpm?: number;
  readonly steps?: number;
  readonly meters?: number;
}

export interface Insights {
  readonly matches: number;
  readonly clutch: Clutch;
  /** Sets won from two games (four points) down, and sets lost from that far up. */
  readonly comebacks: number;
  readonly slips: number;
  /** Every timed rally, outliers already left out. */
  readonly rallies: RallyLengths;
  readonly partners: readonly PersonRecord[];
  readonly rivals: readonly PersonRecord[];
  /** Win share by game heart rate; undefined until enough games were tracked. */
  readonly effort: readonly EffortBand[] | undefined;
  readonly trackedGames: number;
  /** Tracked matches, oldest first — the last `TREND_LENGTH`. */
  readonly trend: readonly TrendPoint[];
  /** Milliseconds per zone across tracked matches; undefined with no heart rate. */
  readonly zones: readonly number[] | undefined;
}

export const TREND_LENGTH = 8;

function bump(
  records: Map<string, { name: string; won: number; lost: number }>,
  id: string | undefined,
  name: string | undefined,
  won: boolean,
): void {
  if (id === undefined || name === undefined) {
    return;
  }
  const entry = records.get(id) ?? { name, won: 0, lost: 0 };
  if (won) {
    entry.won += 1;
  } else {
    entry.lost += 1;
  }
  records.set(id, entry);
}

function ranked(records: Map<string, { name: string; won: number; lost: number }>): PersonRecord[] {
  return [...records.entries()]
    .map(([playerId, entry]) => ({ playerId, ...entry }))
    .sort((left, right) => right.won + right.lost - (left.won + left.lost) || right.won - left.won);
}

function ownerTeam(match: MatchSummary, ownerId: string): TeamId {
  return match.players.B.includes(ownerId) ? "B" : "A";
}

/** The partners and opponents you've played, most-played first; singles have no partner. */
function peopleRecords(
  data: readonly InsightMatch[],
  ownerId: string,
): { partners: PersonRecord[]; rivals: PersonRecord[] } {
  const partners = new Map<string, { name: string; won: number; lost: number }>();
  const rivals = new Map<string, { name: string; won: number; lost: number }>();
  for (const { match } of data) {
    const team = ownerTeam(match, ownerId);
    const other: TeamId = team === "A" ? "B" : "A";
    const won = match.winner === team;
    match.players[team].forEach((id, index) => {
      if (id !== ownerId) {
        bump(partners, id, match.names[team][index], won);
      }
    });
    const seen = new Set<string>();
    match.players[other].forEach((id, index) => {
      if (id !== undefined && !seen.has(id)) {
        seen.add(id);
        bump(rivals, id, match.names[other][index], won);
      }
    });
  }
  return { partners: ranked(partners), rivals: ranked(rivals) };
}

interface Tracked {
  readonly games: GameEffort[];
  readonly trend: TrendPoint[];
  readonly zones: number[] | undefined;
}

/** Per-game effort, the trend points and time in zones, from the watch-tracked matches. */
function trackedActivity(data: readonly InsightMatch[], ownerId: string, maxHr: number): Tracked {
  const games: GameEffort[] = [];
  const trend: TrendPoint[] = [];
  let zones: number[] | undefined;
  for (const { match, events, heartRate, motion } of data) {
    if (heartRate === undefined && motion === undefined) {
      continue;
    }
    const team = ownerTeam(match, ownerId);
    const series = computeGameSeries(match.config, events);
    const windows = gameWindows(series, match.startedAt);
    series.forEach((game, index) => {
      const window = windows[index];
      const avgBpm = window === undefined ? undefined : activityIn(window, heartRate, []).avgBpm;
      if (avgBpm !== undefined) {
        const won = team === "A" ? game.pointsA > game.pointsB : game.pointsB > game.pointsA;
        games.push({ avgBpm, won });
      }
    });
    const whole = matchWindow(series, match.startedAt);
    if (whole === undefined) {
      continue;
    }
    const total = activityIn(whole, heartRate, motion);
    trend.push({
      matchId: match.id,
      startedAt: match.startedAt,
      won: match.winner === team,
      ...(total.avgBpm === undefined ? {} : { avgBpm: total.avgBpm }),
      ...(total.steps === undefined ? {} : { steps: total.steps }),
      ...(total.meters === undefined ? {} : { meters: total.meters }),
    });
    if (heartRate !== undefined && heartRate.length > 0) {
      const inMatch = timeInZones(heartRate, whole, maxHr);
      zones = (zones ?? ZONES.map(() => 0)).map((ms, index) => ms + (inMatch[index] ?? 0));
    }
  }
  return { games, trend, zones };
}

/**
 * Everything the Stats tab shows, for one sport (or all of them). Pure — the
 * screen memoises it on the loaded data, the sport filter and the max heart rate.
 */
export function computeInsights(
  all: readonly InsightMatch[],
  ownerId: string,
  sport: Sport | "all",
  maxHr: number,
): Insights {
  const data = sport === "all" ? all : all.filter((entry) => sportOf(entry.match) === sport);
  let clutch = EMPTY_CLUTCH;
  let comebacks = 0;
  let slips = 0;
  let rallies = NO_RALLIES;
  for (const { match, events } of data) {
    const team = ownerTeam(match, ownerId);
    clutch = addClutch(clutch, matchClutch(match.config, events, team));
    rallies = addRallies(rallies, rallyLengths(match.config, events, team));
    for (const turnaround of matchTurnarounds(match.config, events, team)) {
      if (turnaround.cameBack) {
        comebacks += 1;
      } else {
        slips += 1;
      }
    }
  }
  const tracked = trackedActivity(data, ownerId, maxHr);
  const trend = tracked.trend.sort((left, right) => left.startedAt - right.startedAt);
  return {
    matches: data.length,
    clutch,
    comebacks,
    slips,
    rallies,
    ...peopleRecords(data, ownerId),
    effort: effortBands(tracked.games),
    trackedGames: tracked.games.length,
    trend: trend.slice(-TREND_LENGTH),
    zones: tracked.zones,
  };
}

/** The settings key for the player's own max heart rate, in bpm. */
export const MAX_HR_KEY = "maxHeartRate";

/** The max heart rate the zones use, and whether it's estimated rather than set. */
export interface MaxHr {
  readonly bpm: number;
  readonly estimated: boolean;
}

/** The player's max heart rate, or an estimate from the highest reading on record. */
export function resolveMaxHr(driver: SqlDriver): MaxHr {
  const stored = Number(getSetting(driver, MAX_HR_KEY));
  if (Number.isInteger(stored) && stored >= 120 && stored <= 230) {
    return { bpm: stored, estimated: false };
  }
  const tracked = listMatches(driver).map((match) => ({
    heartRate: loadMatchHeartRate(driver, match.id),
  }));
  let peak: number | undefined;
  for (const { heartRate } of tracked) {
    // Smoothed, so a one-sample sensor spike can't set the estimate.
    for (const sample of smoothHeartRate(heartRate ?? [])) {
      peak = peak === undefined ? sample.bpm : Math.max(peak, sample.bpm);
    }
  }
  return { bpm: estimatedMaxHr(peak), estimated: true };
}
