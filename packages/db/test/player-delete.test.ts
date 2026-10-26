import { describe, expect, it } from "vitest";
import {
  computeProfileStats,
  countMatches,
  countPlayerMatches,
  createMatch,
  createPlayer,
  deletePlayer,
  finishMatch,
  getMatch,
  getPlayer,
  listPlayers,
  listRoster,
  REMOVED_PLAYER_ID,
} from "../src/index.ts";
import { newMatch, nextTimestamp, seededDriver } from "./fixtures.ts";

describe("player deletion", () => {
  it("keepMatches re-points match slots at the tombstone and hides the player", () => {
    const driver = seededDriver();
    createMatch(driver, newMatch("m1"));
    finishMatch(driver, "m1", {
      winner: "A",
      endedAt: nextTimestamp(),
      scoreLine: "6-0 · 6-0",
    });
    createPlayer(driver, { id: "cameron", name: "Cameron", createdAt: nextTimestamp() });

    deletePlayer(driver, "javi", "keepMatches");

    expect(getPlayer(driver, "javi")).toBeUndefined();
    expect(getPlayer(driver, "cameron")).toBeDefined();
    expect(countPlayerMatches(driver, "javi")).toBe(0);

    // The match survives, with the tombstone standing in for the deleted player.
    const match = getMatch(driver, "m1");
    expect(match?.players.A[1]).toBe(REMOVED_PLAYER_ID);
    expect(match?.names.A[1]).toBe("Former player");

    // Roster and players list exclude both the deleted player and the tombstone.
    const ids = listRoster(driver).map((entry) => entry.id);
    expect(ids).not.toContain("javi");
    expect(ids).not.toContain(REMOVED_PLAYER_ID);
    expect(listPlayers(driver).some((player) => player.removed)).toBe(false);

    // The owner's history still counts the kept match.
    const stats = computeProfileStats(driver, "nico");
    expect(stats.played).toBe(1);
    expect(stats.partners).toEqual([
      { playerId: REMOVED_PLAYER_ID, name: "Former player", won: 1, lost: 0, drew: 0 },
    ]);
  });

  it("keepMatches re-points every duplicated slot of a singles row", () => {
    const driver = seededDriver();
    createMatch(
      driver,
      newMatch("s1", { players: { A: ["javi", "javi"], B: ["marta", "marta"] } }),
    );

    deletePlayer(driver, "javi", "keepMatches");

    const singles = getMatch(driver, "s1");
    expect(singles?.players.A).toEqual([REMOVED_PLAYER_ID, REMOVED_PLAYER_ID]);
    expect(singles?.players.B).toEqual(["marta", "marta"]);
  });

  it("withMatches removes the player's matches and the player, with no tombstone", () => {
    const driver = seededDriver();
    createMatch(driver, newMatch("m1"));
    createMatch(driver, newMatch("m2", { players: { A: ["nico", "ana"], B: ["javi", "pablo"] } }));
    expect(countPlayerMatches(driver, "javi")).toBe(2);

    deletePlayer(driver, "javi", "withMatches");

    expect(getPlayer(driver, "javi")).toBeUndefined();
    expect(countMatches(driver)).toBe(0);
    expect(listPlayers(driver).some((player) => player.removed)).toBe(false);
  });

  it("refuses to delete the profile owner", () => {
    const driver = seededDriver();
    expect(() => deletePlayer(driver, "nico", "withMatches")).toThrow();
    expect(() => deletePlayer(driver, "nico", "keepMatches")).toThrow();
    expect(getPlayer(driver, "nico")).toBeDefined();
  });

  it("deleting a missing player is a no-op", () => {
    const driver = seededDriver();
    expect(() => deletePlayer(driver, "ghost", "keepMatches")).not.toThrow();
    expect(() => deletePlayer(driver, "ghost", "withMatches")).not.toThrow();
    expect(countMatches(driver)).toBe(0);
  });
});
