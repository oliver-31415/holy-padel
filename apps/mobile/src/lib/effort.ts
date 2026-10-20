import type { HeartRateSample } from "@holy-padel/db";
import { type ActivityWindow, readingHolds } from "@/lib/game-activity.ts";
import { smoothHeartRate } from "@/lib/heart-rate-series.ts";

/** A heart-rate zone: its name and the share of max heart rate where it starts. */
export interface Zone {
  readonly label: string;
  readonly from: number;
}

/** The five classic zones, by share of max heart rate. Zone 1 also takes anything lower. */
export const ZONES: readonly Zone[] = [
  { label: "EASY", from: 0.5 },
  { label: "LIGHT", from: 0.6 },
  { label: "STEADY", from: 0.7 },
  { label: "HARD", from: 0.8 },
  { label: "MAX", from: 0.9 },
];

/** Readings further apart than this only count this long — a dropout isn't time in a zone. */
export const ZONE_SAMPLE_CAP_MS = 30_000;

/** The max heart rate assumed until the player sets one: their peak, never below 185. */
export function estimatedMaxHr(peakBpm: number | undefined): number {
  return Math.max(185, peakBpm === undefined ? 0 : Math.ceil(peakBpm / 5) * 5);
}

/** 0-based zone for a reading. */
export function zoneIndex(bpm: number, maxHr: number): number {
  const share = bpm / maxHr;
  let index = 0;
  ZONES.forEach((zone, zoneAt) => {
    if (share >= zone.from) {
      index = zoneAt;
    }
  });
  return index;
}

/**
 * Milliseconds spent in each zone inside a window. The readings are smoothed
 * first, so a sensor spike can't put time in a high zone. Each reading holds
 * until the next one (or the window's end), capped at `ZONE_SAMPLE_CAP_MS`.
 */
export function timeInZones(
  samples: readonly HeartRateSample[],
  window: ActivityWindow,
  maxHr: number,
): number[] {
  const totals = ZONES.map(() => 0);
  const inside = smoothHeartRate(samples).filter(
    (sample) => sample.t >= window.from && sample.t <= window.to,
  );
  for (const hold of readingHolds(inside, window, ZONE_SAMPLE_CAP_MS)) {
    const zone = zoneIndex(hold.bpm, maxHr);
    totals[zone] = (totals[zone] ?? 0) + hold.ms;
  }
  return totals;
}

/**
 * The bottom of the effort strip: 20 bpm under the calmest game, or the easy-zone
 * line for this max heart rate if that's lower, so a calm game isn't a stub.
 */
export function effortFloor(measured: readonly number[], maxHr: number): number {
  return Math.min(Math.min(...measured) - 20, maxHr * (ZONES[0]?.from ?? 0));
}

/** A game's average heart rate and whether you won it. */
export interface GameEffort {
  readonly avgBpm: number;
  readonly won: boolean;
}

/** Games won within a heart-rate band; open-ended at the low and high ends. */
export interface EffortBand {
  readonly from?: number;
  readonly to?: number;
  readonly won: number;
  readonly of: number;
}

/** Fewer games than this and the bands are noise. */
export const MIN_EFFORT_GAMES = 9;

/**
 * Split games into thirds by average heart rate — calm, working, flat out — and
 * count the wins in each, so you can see whether you win more when you're
 * fresher. Undefined until there are enough games or when every game reads the same.
 */
export function effortBands(games: readonly GameEffort[]): EffortBand[] | undefined {
  if (games.length < MIN_EFFORT_GAMES) {
    return;
  }
  const sorted = games.map((game) => game.avgBpm).sort((left, right) => left - right);
  const low = sorted[Math.floor(sorted.length / 3)];
  const high = sorted[Math.floor((sorted.length * 2) / 3)];
  if (low === undefined || high === undefined || low >= high) {
    return;
  }
  const tally = (inBand: (bpm: number) => boolean): { won: number; of: number } => {
    const band = games.filter((game) => inBand(game.avgBpm));
    return { won: band.filter((game) => game.won).length, of: band.length };
  };
  return [
    { to: low, ...tally((bpm) => bpm < low) },
    { from: low, to: high, ...tally((bpm) => bpm >= low && bpm < high) },
    { from: high, ...tally((bpm) => bpm >= high) },
  ];
}
