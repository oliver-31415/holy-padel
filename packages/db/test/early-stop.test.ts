import type { MatchConfig, PointEvent, TeamId } from "@holy-padel/scoring";
import { describe, expect, it } from "vitest";
import { appendEvents, createMatch, finishMatch, getMatch, loadEvents } from "../src/index.ts";
import { repairEarlyStopWinners } from "../src/repair.ts";
import { migrate } from "../src/schema.ts";
import { memoryDriver } from "./memory-driver.ts";

/** Squash to 11, win by 2, best of 1, rally-scoring (PAR). */
const PAR: MatchConfig = {
  sport: "squash",
  bestOf: 1,
  deuceMode: "advantage",
  thirdSet: "fullSet",
  squashMode: "par",
  squashTarget: 11,
  squashTiebreak: "winByTwo",
  squashServeBoxes: "player",
  firstServe: "A",
  firstServePending: false,
  firstServeOriginallyUndecided: false,
} as const;

function freshDriver(): ReturnType<typeof memoryDriver> {
  const driver = memoryDriver();
  migrate(driver);
  for (const id of ["nico", "marta"]) {
    driver.execute(
      "INSERT INTO players (id, name, is_owner, removed, created_at) VALUES (?, ?, 1, 0, 0) ON CONFLICT DO NOTHING",
      [id, id],
    );
  }
  return driver;
}

/** A stored match with a given ledger, stopped with a (possibly wrong) winner. */
function stoppedMatch(
  driver: ReturnType<typeof memoryDriver>,
  id: string,
  rallies: readonly TeamId[],
  winner: TeamId | undefined,
): void {
  createMatch(driver, {
    id,
    config: PAR,
    players: { A: ["nico", undefined], B: ["marta", undefined] },
    startedAt: 1000,
  });
  const events: PointEvent[] = rallies.map((team, index) => ({
    winner: team,
    at: 2000 + index * 1000,
  }));
  appendEvents(driver, id, events);
  finishMatch(driver, id, { winner, endedAt: 60_000, scoreLine: "" });
}

/** Alternating rallies: A and B each land `count` points. */
function level(count: number): TeamId[] {
  return Array.from({ length: count * 2 }, (_, index) => (index % 2 === 0 ? "A" : "B"));
}

describe("draw persistence", () => {
  it("stores an undefined winner as NULL and reads it back as undefined", () => {
    const driver = freshDriver();
    stoppedMatch(driver, "m1", level(10), undefined);
    expect(getMatch(driver, "m1")?.winner).toBeUndefined();
  });
});

describe("repairEarlyStopWinners", () => {
  it("turns a level early stop that was saved as a win into a draw", () => {
    const driver = freshDriver();
    stoppedMatch(driver, "m1", level(10), "A");
    expect(repairEarlyStopWinners(driver)).toBe(1);
    expect(getMatch(driver, "m1")?.winner).toBeUndefined();
    expect(repairEarlyStopWinners(driver)).toBe(0);
  });

  it("keeps a stored winner even when the current rule would pick the other side", () => {
    const driver = freshDriver();
    // Ledger leads A 6-3 on points, so the rule would now credit A; the stored B stays.
    stoppedMatch(driver, "m1", [...level(3), "A", "A", "A"], "B");
    expect(repairEarlyStopWinners(driver)).toBe(0);
    expect(getMatch(driver, "m1")?.winner).toBe("B");
  });

  it("does not credit a stored draw to the leader", () => {
    const driver = freshDriver();
    stoppedMatch(driver, "m1", [...level(3), "A", "A", "A"], undefined);
    expect(repairEarlyStopWinners(driver)).toBe(0);
    expect(getMatch(driver, "m1")?.winner).toBeUndefined();
  });

  it("leaves a natural finish alone", () => {
    const driver = freshDriver();
    const rallies: TeamId[] = [...Array.from({ length: 11 }, () => "A" as const)];
    stoppedMatch(driver, "m1", rallies, "A");
    expect(repairEarlyStopWinners(driver)).toBe(0);
    expect(getMatch(driver, "m1")?.winner).toBe("A");
  });

  it("leaves a match with no ledger alone", () => {
    const driver = freshDriver();
    createMatch(driver, {
      id: "m2",
      config: PAR,
      players: { A: ["nico", undefined], B: ["marta", undefined] },
      startedAt: 1000,
    });
    finishMatch(driver, "m2", { winner: "A", endedAt: 2000, scoreLine: "" });
    expect(repairEarlyStopWinners(driver)).toBe(0);
    expect(getMatch(driver, "m2")?.winner).toBe("A");
    expect(loadEvents(driver, "m2")).toHaveLength(0);
  });
});
