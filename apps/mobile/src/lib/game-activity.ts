import type { HeartRateSample, MotionSample } from "@holy-padel/db";
import type { GameSeries } from "@/lib/game-series.ts";
import { smoothHeartRate } from "@/lib/heart-rate-series.ts";

/** A slice of a match in wall-clock time. */
export interface ActivityWindow {
  readonly from: number;
  readonly to: number;
}

/** What the watch measured inside one window; a key is omitted when unmeasured. */
export interface WindowActivity {
  readonly steps?: number;
  readonly meters?: number;
  readonly avgBpm?: number;
  readonly maxBpm?: number;
}

/**
 * Each game's window runs from the end of the game before (the match start for
 * the first) to its own last rally — so the walk between rallies and the
 * change of ends count toward the game they lead into, and the windows tile
 * the match with no gaps or overlaps.
 */
export function gameWindows(
  series: readonly GameSeries[],
  matchStartedAt: number,
): ActivityWindow[] {
  return series.map((game, index) => ({
    from: Math.min(series[index - 1]?.endedAt ?? matchStartedAt, game.startedAt),
    to: game.endedAt,
  }));
}

/** The whole match as one window — the first game's start to the last game's end. */
export function matchWindow(
  series: readonly GameSeries[],
  matchStartedAt: number,
): ActivityWindow | undefined {
  const last = series.at(-1);
  return last === undefined ? undefined : { from: matchStartedAt, to: last.endedAt };
}

/** A reading and how long it holds, for weighting averages and time in zones. */
export interface ReadingHold {
  readonly bpm: number;
  readonly ms: number;
}

/**
 * How long each reading holds: until the next reading in the list or the end of
 * the window, capped at `capMs` so a dropout isn't counted as time at that rate.
 * The readings must already be in time order.
 */
export function readingHolds(
  readings: readonly HeartRateSample[],
  window: ActivityWindow,
  capMs: number,
): ReadingHold[] {
  return readings.map((reading, index) => {
    const next = readings[index + 1]?.t ?? window.to;
    return { bpm: reading.bpm, ms: Math.min(Math.max(next - reading.t, 0), capMs) };
  });
}

/** Holding a reading for this long or less is what a time-weighted average uses. */
export const AVERAGE_HOLD_CAP_MS = 30_000;

/**
 * Sum the movement deltas and summarise the heart rate inside a window. A
 * motion interval counts toward the window it ended in. Heart rate is smoothed
 * first, so a sensor spike can't set the peak, and the average is time-weighted.
 */
export function activityIn(
  window: ActivityWindow,
  heartRate: readonly HeartRateSample[] | undefined,
  motion: readonly MotionSample[] | undefined,
): WindowActivity {
  const inside = (t: number): boolean => t > window.from && t <= window.to;
  let steps = 0;
  let meters = 0;
  let movement = false;
  for (const sample of motion ?? []) {
    if (inside(sample.t)) {
      movement = true;
      steps += sample.steps;
      meters += sample.meters;
    }
  }
  const readings = smoothHeartRate(heartRate ?? []).filter((sample) => inside(sample.t));
  const holds = readingHolds(readings, window, AVERAGE_HOLD_CAP_MS);
  const held = holds.reduce((sum, hold) => sum + hold.ms, 0);
  const plainMean =
    readings.reduce((sum, sample) => sum + sample.bpm, 0) / Math.max(readings.length, 1);
  const weightedMean =
    held > 0 ? holds.reduce((sum, hold) => sum + hold.bpm * hold.ms, 0) / held : plainMean;
  return {
    ...(movement ? { steps: Math.round(steps) } : {}),
    ...(movement && meters > 0 ? { meters } : {}),
    ...(readings.length > 0
      ? {
          avgBpm: Math.round(weightedMean),
          maxBpm: Math.max(...readings.map((sample) => sample.bpm)),
        }
      : {}),
  };
}

/** "86 m" under a kilometre, "1.24 km" above. */
export function distanceLabel(meters: number): string {
  return meters < 1000 ? `${String(Math.round(meters))} m` : `${(meters / 1000).toFixed(2)} km`;
}

/** Longer than this between two readings is a real dropout, drawn as a break. */
export const HR_GAP_MS = 5 * 60_000;

/** Readings further apart than this are a bridged gap: drawn dashed and faint. */
export const HR_SOLID_GAP_MS = 20_000;

function bpmAt(before: HeartRateSample, after: HeartRateSample, t: number): number {
  const span = after.t - before.t;
  return span <= 0 ? before.bpm : before.bpm + ((after.bpm - before.bpm) * (t - before.t)) / span;
}

/**
 * A stretch of the heart-rate line. Solid where readings are close together;
 * `bridged` marks a gap of up to `HR_GAP_MS` that was crossed, drawn dashed. A
 * single point is an isolated reading, drawn as a dot.
 */
export interface HeartRateSpan {
  readonly points: readonly HeartRateSample[];
  readonly bridged: boolean;
}

interface MutableSpan {
  points: HeartRateSample[];
  bridged: boolean;
}

/**
 * The heart-rate readings to draw across a window, as spans. The readings are
 * smoothed first. The reading just outside each edge is interpolated onto the
 * edge, so the line reaches the start and end of the game, and that edge may
 * cross a bridged gap. A line only breaks where readings are more than
 * `HR_GAP_MS` apart — a real dropout.
 */
export function heartRateRuns(
  samples: readonly HeartRateSample[],
  window: ActivityWindow,
): HeartRateSpan[] {
  const sorted = smoothHeartRate(samples);
  const inside = sorted.filter((sample) => sample.t >= window.from && sample.t <= window.to);
  const before = sorted.filter((sample) => sample.t < window.from).at(-1);
  const after = sorted.find((sample) => sample.t > window.to);
  // The readings around the window, in time order; the outer two are only there to bound it.
  const readings = [...(before === undefined ? [] : [before]), ...inside];
  if (after !== undefined) {
    readings.push(after);
  }
  const linked = new Set<HeartRateSample>();
  const segments: { from: HeartRateSample; to: HeartRateSample; bridged: boolean }[] = [];
  for (let index = 1; index < readings.length; index += 1) {
    const left = readings[index - 1];
    const right = readings[index];
    if (left === undefined || right === undefined || right.t - left.t > HR_GAP_MS) {
      continue;
    }
    // Clip each pair to the window; only the outermost readings reach past it.
    const start = Math.max(left.t, window.from);
    const end = Math.min(right.t, window.to);
    linked.add(left);
    linked.add(right);
    segments.push({
      from: { t: start, bpm: bpmAt(left, right, start) },
      to: { t: end, bpm: bpmAt(left, right, end) },
      bridged: right.t - left.t > HR_SOLID_GAP_MS,
    });
  }
  const spans: MutableSpan[] = [];
  for (const segment of segments) {
    const open = spans.at(-1);
    const joined = open !== undefined && open.points.at(-1)?.t === segment.from.t;
    if (open !== undefined && joined && open.bridged === segment.bridged) {
      open.points.push(segment.to);
    } else {
      spans.push({ points: [segment.from, segment.to], bridged: segment.bridged });
    }
  }
  for (const reading of inside) {
    if (!linked.has(reading)) {
      spans.push({ points: [reading], bridged: false });
    }
  }
  return spans.sort((left, right) => (left.points[0]?.t ?? 0) - (right.points[0]?.t ?? 0));
}

/** A heart-rate axis: the plotted bpm range and the round-number ticks on it. */
export interface BpmScale {
  readonly min: number;
  readonly max: number;
  readonly ticks: readonly number[];
}

/** Share of readings ignored at each end of the range, so one stray value can't stretch it. */
const AXIS_TRIM = 0.02;

/** Headroom added above and below the trimmed readings, in bpm. */
const AXIS_PAD_BPM = 5;

/** Linear interpolation between the readings at `fraction` through a sorted list. */
function percentile(sorted: readonly number[], fraction: number): number {
  const position = (sorted.length - 1) * fraction;
  const lower = Math.floor(position);
  const low = sorted[lower] ?? 0;
  const high = sorted[Math.ceil(position)] ?? low;
  return low + (high - low) * (position - lower);
}

/**
 * Round-number ticks spanning the readings, e.g. 118–154 → 110…160 every 10.
 * The range is the 2nd–98th percentile, padded by 5 bpm, so a single spike
 * can't stretch the axis. Wide ranges step by 20 so the axis never shows more
 * than a handful of labels.
 */
export function bpmScale(bpms: readonly number[]): BpmScale | undefined {
  if (bpms.length === 0) {
    return;
  }
  const sorted = [...bpms].sort((left, right) => left - right);
  const trimmedLow = percentile(sorted, AXIS_TRIM);
  const trimmedHigh = percentile(sorted, 1 - AXIS_TRIM);
  const step = trimmedHigh - trimmedLow > 40 ? 20 : 10;
  const min = Math.floor((trimmedLow - AXIS_PAD_BPM) / step) * step;
  const max = Math.max(min + step, Math.ceil((trimmedHigh + AXIS_PAD_BPM) / step) * step);
  const ticks: number[] = [];
  for (let tick = min; tick <= max; tick += step) {
    ticks.push(tick);
  }
  return { min, max, ticks };
}
