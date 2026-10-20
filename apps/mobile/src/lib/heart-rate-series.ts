import type { HeartRateSample } from "@holy-padel/db";

/** The span a reading's neighbourhood covers when smoothing: ten seconds either side. */
export const SMOOTHING_WINDOW_MS = 20_000;

const smoothed = new WeakMap<readonly HeartRateSample[], HeartRateSample[]>();

function median(sorted: readonly number[]): number {
  const middle = Math.floor(sorted.length / 2);
  const above = sorted[middle] ?? 0;
  return sorted.length % 2 === 1 ? above : ((sorted[middle - 1] ?? 0) + above) / 2;
}

/**
 * Readings in time order with each one replaced by the median of the readings
 * within ten seconds of it, so a one-sample sensor spike never reaches the
 * chart, the peak or the zones. Time-based, so irregular spacing is fair.
 * Memoised per input array, since the same series is read several times a render.
 */
export function smoothHeartRate(samples: readonly HeartRateSample[]): HeartRateSample[] {
  const cached = smoothed.get(samples);
  if (cached !== undefined) {
    return cached;
  }
  const sorted = [...samples].sort((left, right) => left.t - right.t);
  const half = SMOOTHING_WINDOW_MS / 2;
  let low = 0;
  let high = 0;
  const result = sorted.map((sample) => {
    while (low < sorted.length && (sorted[low]?.t ?? 0) < sample.t - half) {
      low += 1;
    }
    while (high < sorted.length && (sorted[high]?.t ?? 0) <= sample.t + half) {
      high += 1;
    }
    const bpms = sorted
      .slice(low, high)
      .map((neighbour) => neighbour.bpm)
      .sort((left, right) => left - right);
    return { t: sample.t, bpm: median(bpms) };
  });
  smoothed.set(samples, result);
  return result;
}
