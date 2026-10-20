import { describe, expect, it } from "vitest";
import {
  activityIn,
  bpmScale,
  distanceLabel,
  gameWindows,
  HR_GAP_MS,
  heartRateRuns,
  matchWindow,
} from "../src/lib/game-activity.ts";
import type { GameSeries } from "../src/lib/game-series.ts";

const game = (startedAt: number, endedAt: number): GameSeries => ({
  setNumber: 1,
  gameNumber: 1,
  pointsA: 11,
  pointsB: 5,
  startedAt,
  endedAt,
  steps: [],
});

describe("gameWindows", () => {
  it("tiles the match: each game runs from the previous game's end", () => {
    const series = [game(10_000, 200_000), game(260_000, 500_000)];
    expect(gameWindows(series, 0)).toEqual([
      { from: 0, to: 200_000 },
      { from: 200_000, to: 500_000 },
    ]);
    expect(matchWindow(series, 0)).toEqual({ from: 0, to: 500_000 });
  });

  it("never starts a window after its own first rally", () => {
    expect(gameWindows([game(5000, 9000)], 8000)).toEqual([{ from: 5000, to: 9000 }]);
  });
});

describe("activityIn", () => {
  const window = { from: 100_000, to: 200_000 };

  it("sums the movement intervals that ended inside the window", () => {
    const motion = [
      { t: 100_000, steps: 50, meters: 30 }, // ended exactly at the start: previous window
      { t: 150_000, steps: 20, meters: 14 },
      { t: 200_000, steps: 12, meters: 8.5 },
      { t: 210_000, steps: 99, meters: 70 },
    ];
    expect(activityIn(window, undefined, motion)).toEqual({ steps: 32, meters: 22.5 });
  });

  it("summarises heart rate inside the window", () => {
    const heartRate = [
      { t: 90_000, bpm: 100 },
      { t: 120_000, bpm: 140 },
      { t: 180_000, bpm: 160 },
    ];
    // Time-weighted: 140 holds for its 30 s cap, 160 for the 20 s to the window's end.
    expect(activityIn(window, heartRate, undefined)).toEqual({ avgBpm: 148, maxBpm: 160 });
  });

  it("omits what wasn't measured", () => {
    expect(activityIn(window, [], [])).toEqual({});
    expect(activityIn(window, undefined, [{ t: 150_000, steps: 10, meters: 0 }])).toEqual({
      steps: 10,
    });
  });
});

describe("heartRateRuns", () => {
  const window = { from: 100_000, to: 200_000 };

  it("extends the line to both edges from the readings just outside", () => {
    const runs = heartRateRuns(
      [
        { t: 90_000, bpm: 100 },
        { t: 110_000, bpm: 120 },
        { t: 190_000, bpm: 150 },
        { t: 210_000, bpm: 170 },
      ],
      window,
    );
    // The 20 s pair is solid, the 80 s gap between them is bridged, the last pair is solid.
    expect(runs.map((run) => run.bridged)).toEqual([false, true, false]);
    expect(runs[0]?.points[0]).toEqual({ t: 100_000, bpm: 110 });
    expect(runs[1]?.points).toEqual([
      { t: 110_000, bpm: 120 },
      { t: 190_000, bpm: 150 },
    ]);
    expect(runs.at(-1)?.points.at(-1)).toEqual({ t: 200_000, bpm: 160 });
  });

  it("only breaks the line at a real dropout", () => {
    const gap = HR_GAP_MS + 1;
    const runs = heartRateRuns(
      [
        { t: 100_000, bpm: 120 },
        { t: 130_000, bpm: 125 },
        { t: 130_000 + gap, bpm: 140 },
        { t: 140_000 + gap, bpm: 142 },
      ],
      { from: 100_000, to: 140_000 + gap },
    );
    // The 30 s pair is bridged; the 300 s+1 ms gap is a break, so nothing joins the two.
    expect(runs.map((run) => run.points.length)).toEqual([2, 2]);
    expect(runs.map((run) => run.bridged)).toEqual([true, false]);
  });

  it("bridges a window that falls inside a gap between two readings", () => {
    const runs = heartRateRuns(
      [
        { t: 90_000, bpm: 100 },
        { t: 150_000, bpm: 160 },
      ],
      { from: 100_000, to: 120_000 },
    );
    expect(runs).toEqual([
      {
        bridged: true,
        points: [
          { t: 100_000, bpm: 110 },
          { t: 120_000, bpm: 130 },
        ],
      },
    ]);
  });

  it("draws a lone reading as a single-point dot", () => {
    expect(heartRateRuns([{ t: 150_000, bpm: 140 }], window)).toEqual([
      { bridged: false, points: [{ t: 150_000, bpm: 140 }] },
    ]);
  });
});

describe("distanceLabel", () => {
  it("uses metres under a kilometre and km above", () => {
    expect(distanceLabel(86.4)).toBe("86 m");
    expect(distanceLabel(1240)).toBe("1.24 km");
  });
});

describe("bpmScale", () => {
  it("spans the readings with round-number ticks every 10", () => {
    expect(bpmScale([118, 154])).toEqual({
      min: 110,
      max: 160,
      ticks: [110, 120, 130, 140, 150, 160],
    });
  });

  it("steps by 20 for a wide range", () => {
    // 95–178 plus the 5 bpm pad reaches 200, so the top tick is 200.
    expect(bpmScale([95, 178])?.ticks).toEqual([80, 100, 120, 140, 160, 180, 200]);
  });

  it("ignores a single sensor spike when fitting the axis", () => {
    const readings = Array.from({ length: 100 }, (_, index) => 120 + (index % 30));
    expect(bpmScale([...readings, 250])).toEqual({
      min: 110,
      max: 160,
      ticks: [110, 120, 130, 140, 150, 160],
    });
  });

  it("never collapses to a single tick", () => {
    expect(bpmScale([140, 140])?.ticks).toEqual([130, 140, 150]);
  });

  it("is undefined without readings", () => {
    expect(bpmScale([])).toBeUndefined();
  });
});
