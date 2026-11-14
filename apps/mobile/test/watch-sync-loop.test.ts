import type { SqlDriver, TeamPlayers } from "@holy-padel/db";
import { createMatch, createPlayer, getMatch, migrate, setSetting } from "@holy-padel/db";
import type { MatchConfig } from "@holy-padel/scoring";
import { describe, expect, it } from "vitest";
import { watchRoles } from "../src/theme/colors.ts";
import { applyWatchIntent, INTENT_PATHS } from "../src/watch/apply-intent.ts";
import type { WatchState } from "../src/watch/build-state.ts";
import { buildWatchState } from "../src/watch/build-state.ts";
import { acknowledgeWon, gatherWatchInput, WON_HOLD_MS } from "../src/watch/gather-input.ts";
import { memoryDriver } from "./memory-driver.ts";

// Ties the two pure halves together over a real driver: an intent from the watch
// mutates the ledger, and the next payload the phone would push reflects it.
const config: MatchConfig = {
  bestOf: 1,
  deuceMode: "advantage",
  thirdSet: "fullSet",
  firstServe: "A",
};
const players: TeamPlayers = { A: ["nico", "javi"], B: ["marta", "leo"] };
const ctx = { now: 1000, newMatchId: () => "rematch" };

function freshDb() {
  const driver = memoryDriver();
  migrate(driver);
  for (const id of ["nico", "javi", "marta", "leo"]) {
    createPlayer(driver, { id, name: id, createdAt: 0 });
  }
  return driver;
}

// What the phone would push right now, gathered exactly like useWatchSync does.
function currentState(driver: SqlDriver, now = ctx.now): WatchState {
  return buildWatchState({ ...gatherWatchInput(driver, now), now });
}

function scoreOut(driver: SqlDriver): void {
  // best-of-1, six love games = 24 straight points to A.
  for (let point = 0; point < 24; point += 1) {
    applyWatchIntent(driver, { path: INTENT_PATHS.score, body: "A" }, ctx);
  }
}

describe("watch sync loop", () => {
  it("score intents advance the mirrored payload; undo reverses it", () => {
    const driver = freshDb();
    createMatch(driver, { id: "m1", config, players, startedAt: 0 });

    expect(currentState(driver).phase).toBe("live");
    expect(currentState(driver).pointA).toBe("0");

    applyWatchIntent(driver, { path: INTENT_PATHS.score, body: "A" }, ctx);
    expect(currentState(driver).pointA).toBe("15");

    applyWatchIntent(driver, { path: INTENT_PATHS.score, body: "A" }, ctx);
    expect(currentState(driver).pointA).toBe("30");

    applyWatchIntent(driver, { path: INTENT_PATHS.undo, body: "" }, ctx);
    expect(currentState(driver).pointA).toBe("15");
  });

  it("scoring the match out saves it and flips the payload to won", () => {
    const driver = freshDb();
    createMatch(driver, { id: "m1", config, players, startedAt: 0 });
    scoreOut(driver);

    expect(getMatch(driver, "m1")?.status).toBe("finished");
    const state = currentState(driver);
    expect(state.phase).toBe("won");
    expect(state.won?.winnerShort).toBe("N&J");
    expect(state.games).toBe("6-0");
  });

  it("the watch's DONE dismisses MATCH WON back to idle", () => {
    const driver = freshDb();
    createMatch(driver, { id: "m1", config, players, startedAt: 0 });
    scoreOut(driver);

    applyWatchIntent(driver, { path: INTENT_PATHS.end, body: "" }, ctx);

    const state = currentState(driver);
    expect(state.phase).toBe("idle");
    expect(state.last?.won).toBe(true);
  });

  it("the phone's DONE dismisses it too", () => {
    const driver = freshDb();
    createMatch(driver, { id: "m1", config, players, startedAt: 0 });
    scoreOut(driver);

    acknowledgeWon(driver);

    expect(currentState(driver).phase).toBe("idle");
  });

  it("MATCH WON times out on its own", () => {
    const driver = freshDb();
    createMatch(driver, { id: "m1", config, players, startedAt: 0 });
    scoreOut(driver);

    expect(currentState(driver, ctx.now + WON_HOLD_MS + 1).phase).toBe("idle");
  });

  it("a match stopped mid-play goes straight to idle", () => {
    const driver = freshDb();
    createMatch(driver, { id: "m1", config, players, startedAt: 0 });
    applyWatchIntent(driver, { path: INTENT_PATHS.score, body: "A" }, ctx);

    applyWatchIntent(driver, { path: INTENT_PATHS.stop, body: "" }, ctx);

    expect(currentState(driver).phase).toBe("idle");
  });

  it("carries the user's colours, defaulting to orange and violet", () => {
    const driver = freshDb();
    expect(currentState(driver).palette).toMatchObject({ accent: "#FF6B35", teamB: "#8B7CFF" });

    setSetting(driver, "accentColor", "mint");
    setSetting(driver, "teamBColor", "teal");
    createMatch(driver, { id: "m1", config, players, startedAt: 0 });

    expect(currentState(driver).palette).toMatchObject({ accent: "#2EE6A0", teamB: "#12A594" });
  });

  it("sends the Wear colour roles derived from those colours", () => {
    const driver = freshDb();
    const orange = watchRoles("#FF6B35", "#8B7CFF");
    // Wear's tone table: a pale primary, a dark container, every value `#rrggbb`.
    expect(orange.primary).toBe("#ffdbd0");
    expect(orange.primaryContainer).toBe("#832600");
    expect(Object.values(orange).every((hex) => /^#[0-9a-f]{6}$/u.test(hex))).toBe(true);
    expect(currentState(driver).palette).toMatchObject({ roles: orange });

    setSetting(driver, "accentColor", "sky");
    expect(currentState(driver).palette).toMatchObject({
      roles: watchRoles("#38BDF8", "#8B7CFF"),
    });
    expect(watchRoles("#38BDF8", "#8B7CFF").primary).not.toBe(orange.primary);
  });
});
