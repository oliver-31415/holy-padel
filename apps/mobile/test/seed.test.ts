import {
  computeProfileStats,
  countMatches,
  getLiveMatch,
  getOwner,
  listMatches,
  listPlayers,
  loadEvents,
  migrate,
} from "@holy-padel/db";
import { computeMatch } from "@holy-padel/scoring";
import { describe, expect, it } from "vitest";
import { seedIfEmpty } from "../src/db/seed.ts";
import { finalScoreLine } from "../src/lib/format.ts";
import { memoryDriver } from "./memory-driver.ts";

function seeded(): ReturnType<typeof memoryDriver> {
  const driver = memoryDriver();
  migrate(driver);
  seedIfEmpty(driver);
  return driver;
}

describe("first-launch seed", () => {
  it("installs the owner and the design roster", () => {
    const driver = seeded();
    expect(getOwner(driver)).toMatchObject({
      id: "nico",
      name: "Nico",
      club: "Club Padel Norte",
      side: "left",
    });
    expect(listPlayers(driver)).toHaveLength(8);
  });

  it("is idempotent", () => {
    const driver = seeded();
    seedIfEmpty(driver);
    expect(countMatches(driver)).toBe(13);
    expect(listPlayers(driver)).toHaveLength(8);
  });

  it("leaves the live match exactly at the design's moment", () => {
    const driver = seeded();
    const live = getLiveMatch(driver);
    expect(live?.id).toBe("seed-live");
    if (live === undefined) {
      return;
    }
    const snapshot = computeMatch(live.config, loadEvents(driver, live.id));
    expect(snapshot.finished).toBe(false);
    expect(snapshot.completedSets).toEqual([{ games: { A: 6, B: 4 }, winner: "A", kind: "set" }]);
    expect(snapshot.currentSetGames).toEqual({ A: 4, B: 3 });
    expect(snapshot.currentGame).toMatchObject({ calls: { A: "40", B: "30" } });
    expect(snapshot.moment).toEqual({ kind: "gamePoint", team: "A" });
    expect(snapshot.servingTeam).toBe("B");
  });

  it("stores score lines that agree with the engine's replay", () => {
    const driver = seeded();
    const finished = listMatches(driver).filter((match) => match.status === "finished");
    expect(finished).toHaveLength(12);
    for (const match of finished) {
      const snapshot = computeMatch(match.config, loadEvents(driver, match.id));
      expect(snapshot.finished).toBe(true);
      expect(snapshot.winner).toBe(match.winner);
      expect(match.scoreLine).toBe(finalScoreLine(snapshot));
    }
  });

  it("produces the profile numbers the design shows", () => {
    const driver = seeded();
    const stats = computeProfileStats(driver, "nico");
    expect(stats.played).toBe(12);
    expect(stats.record).toEqual({ won: 8, lost: 4, drew: 0 });
    expect(stats.winRatePercent).toBe(67);
    expect(stats.form).toEqual(["won", "lost", "won", "won", "won"]);
    expect(stats.partners).toEqual([
      { playerId: "javi", name: "Javi", won: 8, lost: 3, drew: 0 },
      { playerId: "ana", name: "Ana", won: 0, lost: 1, drew: 0 },
    ]);
    expect(stats.headToHead).toEqual([
      { label: "Marta & Leo", won: 4, lost: 3, drew: 0 },
      { label: "Ana & Pablo", won: 3, lost: 1, drew: 0 },
      { label: "Carla & Hugo", won: 1, lost: 0, drew: 0 },
    ]);
  });
});
