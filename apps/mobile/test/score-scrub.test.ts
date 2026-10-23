import { describe, expect, it } from "vitest";
import type { GameSeriesStep } from "../src/lib/game-series.ts";
import {
  clockLabel,
  nearestBpm,
  nearestStep,
  openingSetGames,
  scrubReadout,
} from "../src/lib/score-scrub.ts";

/** One unit of time is one pixel. */
const xOf = (t: number): number => t / 1000;

function step(t: number, overrides: Partial<GameSeriesStep> = {}): GameSeriesStep {
  return {
    t,
    lead: 0,
    winner: "A",
    handOut: false,
    points: { A: 0, B: 0 },
    setGames: { A: 0, B: 0 },
    ...overrides,
  };
}

const names = { A: "Nico", B: "Sam" };
const noSet = { A: 0, B: 0 };
/** The labels a padel readout carries; squash swaps them for POINTS and GAMES. */
const padel = { pointsLabel: "GAME", gamesLabel: "SET" };

describe("nearestStep", () => {
  const steps = [step(0), step(10_000), step(30_000)];

  it("picks the rally whose x is closest to the touch", () => {
    expect(nearestStep(steps, xOf, 9)).toBe(1);
    expect(nearestStep(steps, xOf, 19)).toBe(1);
    expect(nearestStep(steps, xOf, 21)).toBe(2);
  });

  it("clamps touches beyond either end to the first or last rally", () => {
    expect(nearestStep(steps, xOf, -50)).toBe(0);
    expect(nearestStep(steps, xOf, 500)).toBe(2);
  });

  it("sends an exact tie to the earlier rally", () => {
    expect(nearestStep(steps, xOf, 5)).toBe(0);
  });

  it("has no rally to pick in a game with none", () => {
    expect(nearestStep([], xOf, 5)).toBeUndefined();
  });
});

describe("openingSetGames", () => {
  it("takes the set count after the first rally", () => {
    expect(openingSetGames([step(0, { setGames: { A: 1, B: 2 } })])).toEqual({ A: 1, B: 2 });
  });

  it("is level for a game with no rallies", () => {
    expect(openingSetGames([])).toEqual(noSet);
  });
});

describe("clockLabel", () => {
  it("shows minutes and zero-padded seconds into the game", () => {
    expect(clockLabel(0)).toBe("0:00");
    expect(clockLabel(192_000)).toBe("3:12");
    expect(clockLabel(3_605_400)).toBe("60:05");
  });
});

describe("nearestBpm", () => {
  const readings = [
    { t: 60_000, bpm: 150 },
    { t: 0, bpm: 120 },
    { t: 30_000, bpm: 140 },
  ];

  it("takes the reading nearest the time, whatever the order", () => {
    expect(nearestBpm(readings, 28_000)).toBe(140);
    expect(nearestBpm(readings, 2000)).toBe(120);
  });

  it("has no reading when none lies within tolerance", () => {
    expect(nearestBpm(readings, 200_000)).toBeUndefined();
    expect(nearestBpm([], 0)).toBeUndefined();
  });
});

describe("scrubReadout", () => {
  it("on a padel game with heart rate, names the server and shows the BPM and elapsed time", () => {
    const readout = scrubReadout(
      step(192_000, { serving: "B", points: { A: 4, B: 1 }, setGames: { A: 2, B: 1 } }),
      {
        names,
        startedAt: 0,
        openingSetGames: { A: 2, B: 1 },
        heartRate: [{ t: 191_000, bpm: 142.4 }],
      },
    );
    // The set is unchanged from the opening games, so SET gives way to the BPM and the elapsed cell.
    expect(readout).toEqual({
      ...padel,
      serving: "Sam",
      points: "4–1",
      bpm: "142",
      elapsed: "3:12",
    });
  });

  it("flags a hand-out and still names the team that served it", () => {
    const readout = scrubReadout(step(60_000, { handOut: true, serving: "B" }), {
      names,
      startedAt: 0,
      openingSetGames: noSet,
    });
    expect(readout).toMatchObject({ handOut: true, serving: "Sam" });
  });

  it("keeps SET for a game with no server when there is heart rate", () => {
    const readout = scrubReadout(step(60_000, { setGames: { A: 1, B: 0 } }), {
      names,
      startedAt: 0,
      openingSetGames: noSet,
      heartRate: [{ t: 60_000, bpm: 130 }],
    });
    expect(readout).toEqual({
      ...padel,
      points: "0–0",
      games: "1–0",
      bpm: "130",
      elapsed: "1:00",
    });
  });

  it("drops the elapsed cell rather than the BPM once SET has moved", () => {
    const readout = scrubReadout(
      step(192_000, { serving: "A", points: { A: 0, B: 0 }, setGames: { A: 1, B: 0 } }),
      {
        names,
        startedAt: 0,
        openingSetGames: noSet,
        heartRate: [{ t: 192_000, bpm: 150 }],
      },
    );
    expect(readout).toEqual({
      ...padel,
      serving: "Nico",
      points: "0–0",
      games: "1–0",
      bpm: "150",
    });
  });

  it("shows a dash when heart rate exists but no reading is near the rally", () => {
    const readout = scrubReadout(step(0), {
      names,
      startedAt: 0,
      openingSetGames: noSet,
      heartRate: [{ t: 600_000, bpm: 150 }],
    });
    expect(readout.bpm).toBe("–");
  });

  it("omits the BPM cell when the match has no heart rate", () => {
    const readout = scrubReadout(step(192_000, { serving: "A" }), {
      names,
      startedAt: 0,
      openingSetGames: noSet,
    });
    expect(readout).not.toHaveProperty("bpm");
    expect(readout).toEqual({
      ...padel,
      serving: "Nico",
      points: "0–0",
      games: "0–0",
      elapsed: "3:12",
    });
  });

  it("omits the server when the engine has none", () => {
    const readout = scrubReadout(step(0, { points: { A: 0, B: 0 } }), {
      names,
      startedAt: 0,
      openingSetGames: noSet,
    });
    expect(readout).not.toHaveProperty("serving");
    expect(readout).toEqual({ ...padel, points: "0–0", games: "0–0", elapsed: "0:00" });
  });

  it("labels a squash game POINTS and GAMES, since squash has no sets", () => {
    const readout = scrubReadout(step(0, { points: { A: 3, B: 2 }, setGames: { A: 1, B: 0 } }), {
      names,
      startedAt: 0,
      openingSetGames: noSet,
      squash: true,
    });
    expect(readout).toMatchObject({ pointsLabel: "POINTS", gamesLabel: "GAMES", points: "3–2" });
  });
});

describe("scrubReadout for pickleball", () => {
  const pickleball = { pickleball: true, openingSetGames: noSet, startedAt: 0, names };

  it("reads the server call in the points cell, with en dashes", () => {
    const readout = scrubReadout(
      step(60_000, {
        serving: "A",
        points: { A: 1, B: 0 },
        call: { team: "A", serverNumber: 2 },
      }),
      pickleball,
    );
    expect(readout).toEqual({
      serving: "Nico",
      pointsLabel: "POINTS",
      points: "1–0–2",
      gamesLabel: "GAMES",
      elapsed: "1:00",
    });
  });

  it("names a side-out SIDE-OUT and reads the receiving team's points second", () => {
    const readout = scrubReadout(
      step(60_000, {
        handOut: true,
        serving: "A",
        points: { A: 1, B: 0 },
        call: { team: "B", serverNumber: 1 },
      }),
      pickleball,
    );
    expect(readout).toMatchObject({
      handOut: true,
      sideOut: true,
      serving: "Nico",
      points: "0–1–1",
    });
  });

  it("never shows a games cell, even when the set count moves", () => {
    const readout = scrubReadout(
      step(60_000, { points: { A: 11, B: 9 }, setGames: { A: 1, B: 0 } }),
      pickleball,
    );
    expect(readout).not.toHaveProperty("games");
    expect(readout).toMatchObject({ points: "11–9" });
  });

  it("leaves sideOut off a padel or squash hand-out", () => {
    const readout = scrubReadout(step(0, { handOut: true, serving: "B" }), {
      names,
      startedAt: 0,
      openingSetGames: noSet,
    });
    expect(readout).not.toHaveProperty("sideOut");
  });
});
