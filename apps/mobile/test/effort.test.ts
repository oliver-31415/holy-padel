import { describe, expect, it } from "vitest";
import {
  effortBands,
  effortFloor,
  estimatedMaxHr,
  MIN_EFFORT_GAMES,
  timeInZones,
  ZONE_SAMPLE_CAP_MS,
  zoneIndex,
} from "@/lib/effort.ts";

describe("heart-rate zones", () => {
  it("places readings by share of max heart rate", () => {
    expect(zoneIndex(80, 200)).toBe(0);
    expect(zoneIndex(119, 200)).toBe(0);
    expect(zoneIndex(120, 200)).toBe(1);
    expect(zoneIndex(150, 200)).toBe(2);
    expect(zoneIndex(170, 200)).toBe(3);
    expect(zoneIndex(185, 200)).toBe(4);
  });

  it("defaults max heart rate to the peak rounded up, never under 185", () => {
    expect(estimatedMaxHr(undefined)).toBe(185);
    expect(estimatedMaxHr(171)).toBe(185);
    expect(estimatedMaxHr(192)).toBe(195);
  });

  it("holds each reading until the next, capping dropouts", () => {
    const samples = [
      { t: 0, bpm: 150 },
      { t: 10_000, bpm: 190 },
      { t: 100_000, bpm: 150 },
    ];
    const zones = timeInZones(samples, { from: 0, to: 110_000 }, 200);

    // The 150/190 pair smooths to 170 each, so the first 10 s land in zone 3, not zone 5.
    expect(zones[2]).toBe(10_000); // last 10 s at 150 bpm
    expect(zones[3]).toBe(10_000 + ZONE_SAMPLE_CAP_MS); // 10 s, then the 90 s dropout capped at 30 s
    expect(zones.reduce((sum, ms) => sum + ms, 0)).toBe(50_000);
  });
});

describe("effort strip floor", () => {
  it("sits 20 bpm under the calmest game when that is lower than the easy line", () => {
    // Easy line at max 190 is 95; 100 - 20 = 80 is lower, so 80 wins.
    expect(effortFloor([100, 150], 190)).toBe(80);
  });

  it("never rises above the easy-zone line", () => {
    // 120 - 20 = 100 is higher than 95, so the easy line caps the floor at 95.
    expect(effortFloor([120, 150], 190)).toBe(95);
  });
});

describe("effortBands", () => {
  it("needs enough games", () => {
    const games = Array.from({ length: MIN_EFFORT_GAMES - 1 }, (_, index) => ({
      avgBpm: 120 + index,
      won: true,
    }));
    expect(effortBands(games)).toBeUndefined();
  });

  it("splits games into thirds by heart rate and counts the wins", () => {
    const games = [120, 122, 124, 140, 142, 144, 160, 162, 164].map((avgBpm, index) => ({
      avgBpm,
      won: index < 3 || index === 4,
    }));

    expect(effortBands(games)).toEqual([
      { to: 140, won: 3, of: 3 },
      { from: 140, to: 160, won: 1, of: 3 },
      { from: 160, won: 0, of: 3 },
    ]);
  });

  it("gives up when every game reads the same", () => {
    const games = Array.from({ length: 12 }, () => ({ avgBpm: 140, won: true }));
    expect(effortBands(games)).toBeUndefined();
  });
});
