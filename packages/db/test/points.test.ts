import { describe, expect, it } from "vitest";
import {
  appendEvent,
  computePointsTotals,
  createMatch,
  finishMatch,
  loadMatchHeartRate,
  saveMatchHeartRate,
} from "../src/index.ts";
import { newMatch, nextTimestamp, seededDriver } from "./fixtures.ts";

/** Store a 6-0 · 6-0 win as a real ledger: 12 love games, 48 rallies. */
function storeFinished(
  driver: ReturnType<typeof seededDriver>,
  id: string,
  partner: string,
  opponents: readonly [string, string],
  won: boolean,
): void {
  createMatch(
    driver,
    newMatch(id, {
      players: { A: ["nico", partner], B: [opponents[0], opponents[1]] },
    }),
  );
  const winner: "A" | "B" = won ? "A" : "B";
  for (let rally = 0; rally < 48; rally += 1) {
    appendEvent(driver, id, { winner, at: nextTimestamp() });
  }
  finishMatch(driver, id, {
    winner,
    endedAt: nextTimestamp(),
    scoreLine: "6-0 · 6-0",
  });
}

describe("lifetime points", () => {
  it("totals points for and against the owner, overall and per sport", () => {
    const driver = seededDriver();
    storeFinished(driver, "m1", "javi", ["marta", "leo"], true);
    storeFinished(driver, "m2", "javi", ["marta", "leo"], false);

    const totals = computePointsTotals(driver, "nico");
    // 6-0 · 6-0 is 12 love games: 48 points to the winner, 0 to the loser.
    expect(totals.for).toBe(48);
    expect(totals.against).toBe(48);
    expect(totals.bySport.padel).toEqual({ for: 48, against: 48 });
    expect(totals.bySport.squash).toEqual({ for: 0, against: 0 });
  });

  it("ignores matches the owner did not play", () => {
    const driver = seededDriver();
    createMatch(
      driver,
      newMatch("other", { players: { A: ["javi", "ana"], B: ["marta", "leo"] } }),
    );
    finishMatch(driver, "other", {
      winner: "A",
      endedAt: nextTimestamp(),
      scoreLine: "6-0 · 6-0",
    });
    const totals = computePointsTotals(driver, "nico");
    expect(totals.for).toBe(0);
    expect(totals.against).toBe(0);
  });
});

describe("match heart rate storage", () => {
  it("round-trips the watch samples and ignores malformed readings", () => {
    const driver = seededDriver();
    saveMatchHeartRate(driver, "m1", [
      { t: 1000, bpm: 140 },
      { t: 2000, bpm: 152 },
    ]);
    expect(loadMatchHeartRate(driver, "m1")).toEqual([
      { t: 1000, bpm: 140 },
      { t: 2000, bpm: 152 },
    ]);

    saveMatchHeartRate(driver, "m1", [{ t: 3000, bpm: 900 }]);
    expect(loadMatchHeartRate(driver, "m1")).toEqual([
      { t: 1000, bpm: 140 },
      { t: 2000, bpm: 152 },
    ]);

    saveMatchHeartRate(driver, "m2", []);
    expect(loadMatchHeartRate(driver, "m2")).toBeUndefined();
    expect(loadMatchHeartRate(driver, "missing")).toBeUndefined();
  });
});
