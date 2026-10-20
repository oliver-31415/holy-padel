import type { SqlDriver } from "./driver.ts";
import { getSetting, setSetting } from "./settings.ts";

/** One heart-rate reading from the watch's workout tracking. */
export interface HeartRateSample {
  /** Epoch milliseconds. */
  readonly t: number;
  readonly bpm: number;
}

const MAX_SAMPLES = 3000;

const storageKey = (matchId: string): string => `hr:${matchId}`;

/** A physically plausible reading, or undefined when the value is malformed. */
function parseSample(raw: unknown): HeartRateSample | undefined {
  if (typeof raw !== "object" || raw === null) {
    return;
  }
  const { t, bpm } = raw as { readonly t?: unknown; readonly bpm?: unknown };
  if (
    typeof t !== "number" ||
    !Number.isFinite(t) ||
    typeof bpm !== "number" ||
    !Number.isFinite(bpm) ||
    bpm <= 20 ||
    bpm >= 260
  ) {
    return;
  }
  return { t, bpm };
}

/** Physically plausible readings only — a malformed sample is dropped. */
function parseSamples(value: unknown): HeartRateSample[] | undefined {
  if (typeof value !== "object" || value === null) {
    return;
  }
  const samples = (value as { samples?: unknown }).samples;
  if (!Array.isArray(samples)) {
    return;
  }
  const out: HeartRateSample[] = [];
  for (const raw of samples) {
    const sample = parseSample(raw);
    if (sample !== undefined) {
      out.push(sample);
    }
  }
  return out.length > 0 ? out.slice(0, MAX_SAMPLES) : undefined;
}

/**
 * Merge watch-tracked heart-rate readings into a match's stored series. The
 * union is keyed by timestamp (an incoming reading wins on an equal `t`), kept
 * in time order and capped at MAX_SAMPLES, so a re-sync of a partial workout
 * never discards readings already stored.
 */
export function saveMatchHeartRate(
  driver: SqlDriver,
  matchId: string,
  samples: readonly HeartRateSample[],
): void {
  const incoming = samples.flatMap((raw) => {
    const sample = parseSample(raw);
    return sample === undefined ? [] : [sample];
  });
  if (incoming.length === 0) {
    return;
  }
  const byTime = new Map<number, HeartRateSample>();
  for (const sample of loadMatchHeartRate(driver, matchId) ?? []) {
    byTime.set(sample.t, sample);
  }
  for (const sample of incoming) {
    byTime.set(sample.t, sample);
  }
  const merged = [...byTime.values()].sort((a, b) => a.t - b.t).slice(0, MAX_SAMPLES);
  setSetting(driver, storageKey(matchId), JSON.stringify({ samples: merged }));
}

/** The stored heart-rate series for a match; undefined when none was tracked. */
export function loadMatchHeartRate(
  driver: SqlDriver,
  matchId: string,
): readonly HeartRateSample[] | undefined {
  const raw = getSetting(driver, storageKey(matchId));
  if (raw === undefined) {
    return;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = undefined;
  }
  return parseSamples(parsed);
}
