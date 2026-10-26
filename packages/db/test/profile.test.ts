import { describe, expect, it } from "vitest";
import type { SqlDriver } from "../src/index.ts";
import { computeProfileStats, createMatch, createPlayer, finishMatch } from "../src/index.ts";
import { newMatch, nextTimestamp, seededDriver } from "./fixtures.ts";

interface Fixture {
  readonly id: string;
  readonly partner: string;
  readonly opponents: readonly [string, string];
  readonly won: boolean;
}

function storeFinished(driver: SqlDriver, fixture: Fixture): void {
  createMatch(
    driver,
    newMatch(fixture.id, {
      players: { A: ["nico", fixture.partner], B: [fixture.opponents[0], fixture.opponents[1]] },
    }),
  );
  finishMatch(driver, fixture.id, {
    winner: fixture.won ? "A" : "B",
    endedAt: nextTimestamp(),
    scoreLine: "6-3 · 7-6",
  });
}

describe("profile stats", () => {
  it("computes record, win rate, form, partners and head-to-head", () => {
    const driver = seededDriver();
    const fixtures: readonly Fixture[] = [
      { id: "m1", partner: "javi", opponents: ["marta", "leo"], won: true },
      { id: "m2", partner: "javi", opponents: ["marta", "leo"], won: false },
      { id: "m3", partner: "javi", opponents: ["ana", "pablo"], won: true },
      { id: "m4", partner: "ana", opponents: ["marta", "leo"], won: false },
      { id: "m5", partner: "javi", opponents: ["marta", "leo"], won: true },
      { id: "m6", partner: "javi", opponents: ["ana", "pablo"], won: true },
    ];
    for (const fixture of fixtures) {
      storeFinished(driver, fixture);
    }

    const stats = computeProfileStats(driver, "nico");
    expect(stats.played).toBe(6);
    expect(stats.record).toEqual({ won: 4, lost: 2, drew: 0 });
    expect(stats.winRatePercent).toBe(67);
    // Most recent first: m6 W, m5 W, m4 L, m3 W, m2 L.
    expect(stats.form).toEqual(["won", "won", "lost", "won", "lost"]);

    expect(stats.partners).toEqual([
      { playerId: "javi", name: "Javi", won: 4, lost: 1, drew: 0 },
      { playerId: "ana", name: "Ana", won: 0, lost: 1, drew: 0 },
    ]);

    expect(stats.headToHead).toEqual([
      { label: "Marta & Leo", won: 2, lost: 2, drew: 0 },
      { label: "Ana & Pablo", won: 2, lost: 0, drew: 0 },
    ]);
  });

  it("handles singles rows: no self-partner and a single opponent name", () => {
    const driver = seededDriver();
    createPlayer(driver, { id: "cameron", name: "Cameron", createdAt: nextTimestamp() });
    createMatch(
      driver,
      newMatch("s1", { players: { A: ["nico", "nico"], B: ["cameron", "cameron"] } }),
    );
    finishMatch(driver, "s1", {
      winner: "A",
      endedAt: nextTimestamp(),
      scoreLine: "11-5",
    });

    const stats = computeProfileStats(driver, "nico");
    expect(stats.played).toBe(1);
    expect(stats.partners).toEqual([]);
    expect(stats.headToHead).toEqual([{ label: "Cameron", won: 1, lost: 0, drew: 0 }]);
  });

  it("ignores live matches and handles an empty database", () => {
    const driver = seededDriver();
    createMatch(driver, newMatch("live-one"));
    const stats = computeProfileStats(driver, "nico");
    expect(stats.played).toBe(0);
    expect(stats.winRatePercent).toBe(0);
    expect(stats.form).toEqual([]);
  });

  it("counts a level early stop as a draw, not a loss", () => {
    const driver = seededDriver();
    storeFinished(driver, { id: "w1", partner: "javi", opponents: ["marta", "leo"], won: true });
    storeFinished(driver, { id: "w2", partner: "javi", opponents: ["marta", "leo"], won: true });
    createMatch(driver, newMatch("d1", { players: { A: ["nico", "javi"], B: ["marta", "leo"] } }));
    finishMatch(driver, "d1", { winner: undefined, endedAt: nextTimestamp(), scoreLine: "10-10" });

    const stats = computeProfileStats(driver, "nico");
    expect(stats.played).toBe(3);
    expect(stats.record).toEqual({ won: 2, lost: 0, drew: 1 });
    expect(stats.winRatePercent).toBe(67);
    expect(stats.form).toEqual(["drew", "won", "won"]);
    // The draw is the most recent result, so there is no current run.
    expect(stats.streak).toBeUndefined();
    expect(stats.bestWinStreak).toBe(2);
    expect(stats.partners).toEqual([{ playerId: "javi", name: "Javi", won: 2, lost: 0, drew: 1 }]);
    expect(stats.headToHead).toEqual([{ label: "Marta & Leo", won: 2, lost: 0, drew: 1 }]);
  });

  it("breaks a win streak on a draw without counting it as a loss", () => {
    const driver = seededDriver();
    storeFinished(driver, { id: "w1", partner: "javi", opponents: ["marta", "leo"], won: true });
    createMatch(driver, newMatch("d1", { players: { A: ["nico", "javi"], B: ["marta", "leo"] } }));
    finishMatch(driver, "d1", { winner: undefined, endedAt: nextTimestamp(), scoreLine: "4-4" });
    storeFinished(driver, { id: "w2", partner: "javi", opponents: ["marta", "leo"], won: true });

    const stats = computeProfileStats(driver, "nico");
    expect(stats.record).toEqual({ won: 2, lost: 0, drew: 1 });
    expect(stats.streak).toEqual({ kind: "won", count: 1 });
    expect(stats.bestWinStreak).toBe(1);
  });
});
