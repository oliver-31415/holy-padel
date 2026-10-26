import { describe, expect, it } from "vitest";
import type { SqlDriver } from "../src/index.ts";
import { computePlayerStats, createMatch, finishMatch } from "../src/index.ts";
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

describe("player stats", () => {
  it("computes a partner's record from their own perspective", () => {
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

    const javi = computePlayerStats(driver, "javi", "nico");
    expect(javi.played).toBe(5);
    expect(javi.record).toEqual({ won: 4, lost: 1, drew: 0 });
    expect(javi.winRatePercent).toBe(80);
    // Most recent first: m6 W, m5 W, m3 W, m2 L, m1 W.
    expect(javi.form).toEqual(["won", "won", "won", "lost", "won"]);
    expect(javi.withOwner).toEqual({ won: 4, lost: 1, drew: 0 });
    expect(javi.againstOwner).toEqual({ won: 0, lost: 0, drew: 0 });
    expect(javi.matchesTogether).toEqual([
      { id: "m6", startedAt: expect.any(Number), scoreLine: "6-3 · 7-6", outcome: "won" },
      { id: "m5", startedAt: expect.any(Number), scoreLine: "6-3 · 7-6", outcome: "won" },
      { id: "m3", startedAt: expect.any(Number), scoreLine: "6-3 · 7-6", outcome: "won" },
      { id: "m2", startedAt: expect.any(Number), scoreLine: "6-3 · 7-6", outcome: "lost" },
      { id: "m1", startedAt: expect.any(Number), scoreLine: "6-3 · 7-6", outcome: "won" },
    ]);

    // Ana played m3 and m6 as an opponent (lost) and m4 as the owner's partner (lost).
    const ana = computePlayerStats(driver, "ana", "nico");
    expect(ana.played).toBe(3);
    expect(ana.record).toEqual({ won: 0, lost: 3, drew: 0 });
    expect(ana.withOwner).toEqual({ won: 0, lost: 1, drew: 0 });
    expect(ana.againstOwner).toEqual({ won: 0, lost: 2, drew: 0 });
    expect(ana.matchesTogether).toEqual([
      { id: "m4", startedAt: expect.any(Number), scoreLine: "6-3 · 7-6", outcome: "lost" },
    ]);
  });

  it("ignores live matches and handles a player with no matches", () => {
    const driver = seededDriver();
    createMatch(driver, newMatch("live-one"));
    const stats = computePlayerStats(driver, "javi", "nico");
    expect(stats.played).toBe(0);
    expect(stats.winRatePercent).toBe(0);
    expect(stats.form).toEqual([]);
    expect(stats.matchesTogether).toEqual([]);
  });

  it("counts a draw as played but neither a win nor a loss", () => {
    const driver = seededDriver();
    storeFinished(driver, { id: "m1", partner: "javi", opponents: ["marta", "leo"], won: false });
    createMatch(driver, newMatch("d1", { players: { A: ["nico", "javi"], B: ["marta", "leo"] } }));
    finishMatch(driver, "d1", { winner: undefined, endedAt: nextTimestamp(), scoreLine: "10-10" });

    const javi = computePlayerStats(driver, "javi", "nico");
    expect(javi.played).toBe(2);
    expect(javi.record).toEqual({ won: 0, lost: 1, drew: 1 });
    expect(javi.winRatePercent).toBe(0);
    expect(javi.form).toEqual(["drew", "lost"]);
    expect(javi.withOwner).toEqual({ won: 0, lost: 1, drew: 1 });
    expect(javi.matchesTogether.map((match) => match.outcome)).toEqual(["drew", "lost"]);
  });
});
