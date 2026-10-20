import { describe, expect, it } from "vitest";
import { smoothHeartRate } from "../src/lib/heart-rate-series.ts";

describe("smoothHeartRate", () => {
  it("removes a one-sample sensor spike", () => {
    const smoothed = smoothHeartRate([
      { t: 0, bpm: 120 },
      { t: 5000, bpm: 121 },
      { t: 10_000, bpm: 250 },
      { t: 15_000, bpm: 122 },
      { t: 20_000, bpm: 123 },
    ]);
    // Each reading becomes the median of the readings within ±10 s of it.
    expect(smoothed.map((sample) => sample.bpm)).toEqual([121, 121.5, 122, 122.5, 123]);
  });

  it("keeps the timestamps and returns readings in time order", () => {
    const smoothed = smoothHeartRate([
      { t: 10_000, bpm: 130 },
      { t: 0, bpm: 100 },
    ]);
    expect(smoothed.map((sample) => sample.t)).toEqual([0, 10_000]);
  });

  it("windows by time, so a long gap is not averaged with its neighbours", () => {
    const smoothed = smoothHeartRate([
      { t: 0, bpm: 100 },
      { t: 1000, bpm: 100 },
      { t: 2000, bpm: 100 },
      { t: 60_000, bpm: 200 },
    ]);
    expect(smoothed.at(-1)?.bpm).toBe(200);
    expect(smoothed[0]?.bpm).toBe(100);
  });

  it("averages the two middle readings when a window has an even count", () => {
    const smoothed = smoothHeartRate([
      { t: 0, bpm: 100 },
      { t: 5000, bpm: 200 },
    ]);
    expect(smoothed.map((sample) => sample.bpm)).toEqual([150, 150]);
  });

  it("returns an empty series for no readings", () => {
    expect(smoothHeartRate([])).toEqual([]);
  });

  it("memoises per input array", () => {
    const samples = [
      { t: 0, bpm: 100 },
      { t: 5000, bpm: 110 },
    ];
    expect(smoothHeartRate(samples)).toBe(smoothHeartRate(samples));
  });
});
