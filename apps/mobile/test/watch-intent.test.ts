import type { TeamPlayers } from "@holy-padel/db";
import {
  appendEvent,
  createMatch,
  createPlayer,
  finishMatch,
  getLiveMatch,
  getMatch,
  loadEvents,
  migrate,
} from "@holy-padel/db";
import type { MatchConfig } from "@holy-padel/scoring";
import { describe, expect, it } from "vitest";
import { applyWatchIntent, INTENT_PATHS } from "../src/watch/apply-intent.ts";
import { memoryDriver } from "./memory-driver.ts";

const config: MatchConfig = {
  bestOf: 3,
  deuceMode: "advantage",
  thirdSet: "superTieBreak",
  firstServe: "A",
};
const players: TeamPlayers = { A: ["nico", "javi"], B: ["marta", "leo"] };
const ctx = { now: 1000, newMatchId: () => "rematch" };

function freshDb() {
  const driver = memoryDriver();
  migrate(driver);
  // Matches carry foreign keys to players, so the roster must exist first.
  for (const id of ["nico", "javi", "marta", "leo"]) {
    createPlayer(driver, { id, name: id, createdAt: 0 });
  }
  return driver;
}

describe("applyWatchIntent", () => {
  it("scores points on the live match", () => {
    const driver = freshDb();
    createMatch(driver, { id: "m1", config, players, startedAt: 0 });

    applyWatchIntent(driver, { path: INTENT_PATHS.score, body: "A" }, ctx);
    applyWatchIntent(driver, { path: INTENT_PATHS.score, body: "B" }, ctx);

    expect(loadEvents(driver, "m1").map((event) => event.winner)).toEqual(["A", "B"]);
  });

  it("ignores an invalid score body", () => {
    const driver = freshDb();
    createMatch(driver, { id: "m1", config, players, startedAt: 0 });

    applyWatchIntent(driver, { path: INTENT_PATHS.score, body: "X" }, ctx);

    expect(loadEvents(driver, "m1")).toHaveLength(0);
  });

  it("undoes the last point", () => {
    const driver = freshDb();
    createMatch(driver, { id: "m1", config, players, startedAt: 0 });
    appendEvent(driver, "m1", { winner: "A", at: 0 });
    appendEvent(driver, "m1", { winner: "B", at: 0 });

    applyWatchIntent(driver, { path: INTENT_PATHS.undo, body: "" }, ctx);

    expect(loadEvents(driver, "m1").map((event) => event.winner)).toEqual(["A"]);
  });

  it("rematches the last finished lineup when idle", () => {
    const driver = freshDb();
    createMatch(driver, { id: "m1", config, players, startedAt: 0, location: "Club Norte" });
    finishMatch(driver, "m1", { winner: "A", endedAt: 10, scoreLine: "6-0 · 6-0" });

    applyWatchIntent(driver, { path: INTENT_PATHS.startLast, body: "" }, ctx);

    const live = getLiveMatch(driver);
    expect(live?.id).toBe("rematch");
    expect(live?.players).toEqual(players);
    expect(live?.location).toBe("Club Norte");
  });

  it("leaves the rematch's first serve undecided when the original was", () => {
    const driver = freshDb();
    createMatch(driver, {
      id: "m1",
      config: { ...config, firstServePending: true, firstServeOriginallyUndecided: true },
      players,
      startedAt: 0,
    });
    finishMatch(driver, "m1", { winner: "A", endedAt: 10, scoreLine: "6-0 · 6-0" });

    applyWatchIntent(driver, { path: INTENT_PATHS.startLast, body: "" }, ctx);

    expect(getLiveMatch(driver)?.config.firstServePending).toBe(true);
  });

  it("resolves a decided first serve in the rematch", () => {
    const driver = freshDb();
    createMatch(driver, { id: "m1", config, players, startedAt: 0 });
    finishMatch(driver, "m1", { winner: "A", endedAt: 10, scoreLine: "6-0 · 6-0" });

    applyWatchIntent(driver, { path: INTENT_PATHS.startLast, body: "" }, ctx);

    expect(getLiveMatch(driver)?.config.firstServePending).toBe(false);
  });

  it("does not rematch while a match is already live", () => {
    const driver = freshDb();
    createMatch(driver, { id: "m1", config, players, startedAt: 0 });

    applyWatchIntent(driver, { path: INTENT_PATHS.startLast, body: "" }, ctx);

    expect(getLiveMatch(driver)?.id).toBe("m1");
  });

  it("toggles pause and resume, banking the interval", () => {
    const driver = freshDb();
    createMatch(driver, { id: "m1", config, players, startedAt: 0 });

    applyWatchIntent(driver, { path: INTENT_PATHS.pause, body: "" }, { ...ctx, now: 1000 });
    expect(getMatch(driver, "m1")?.pausedAt).toBe(1000);

    applyWatchIntent(driver, { path: INTENT_PATHS.pause, body: "" }, { ...ctx, now: 3000 });
    const match = getMatch(driver, "m1");
    expect(match?.pausedAt).toBeUndefined();
    expect(match?.pausedMs).toBe(2000);
  });

  it("ignores score intents while paused", () => {
    const driver = freshDb();
    createMatch(driver, { id: "m1", config, players, startedAt: 0 });

    applyWatchIntent(driver, { path: INTENT_PATHS.pause, body: "" }, ctx);
    applyWatchIntent(driver, { path: INTENT_PATHS.score, body: "A" }, ctx);

    expect(loadEvents(driver, "m1")).toHaveLength(0);
  });

  it("stops an in-progress match by saving it, crediting the leader", () => {
    const driver = freshDb();
    // Court time's up mid-play: A leads the first game 30-0. Don't lose the score.
    createMatch(driver, { id: "m1", config, players, startedAt: 0 });
    appendEvent(driver, "m1", { winner: "A", at: 0 });
    appendEvent(driver, "m1", { winner: "A", at: 0 });

    applyWatchIntent(driver, { path: INTENT_PATHS.stop, body: "" }, { ...ctx, now: 5000 });

    expect(getLiveMatch(driver)).toBeUndefined();
    const match = getMatch(driver, "m1");
    expect(match?.status).toBe("finished");
    expect(match?.winner).toBe("A");
    // The partial set (still 0-0 in games) is preserved as the saved line.
    expect(match?.scoreLine).toBe("0-0");
  });

  it("cancels an in-progress match by discarding it", () => {
    const driver = freshDb();
    createMatch(driver, { id: "m1", config, players, startedAt: 0 });
    appendEvent(driver, "m1", { winner: "A", at: 0 });

    applyWatchIntent(driver, { path: INTENT_PATHS.cancel, body: "" }, ctx);

    expect(getLiveMatch(driver)).toBeUndefined();
    expect(getMatch(driver, "m1")).toBeUndefined();
  });

  it("stops a finished match by persisting the engine's win", () => {
    const driver = freshDb();
    // bestOf:1 finishes at 6 love games — 24 points to A wins the set 6-0.
    createMatch(driver, { id: "m1", config: { ...config, bestOf: 1 }, players, startedAt: 0 });
    for (let i = 0; i < 24; i += 1) {
      appendEvent(driver, "m1", { winner: "A", at: 0 });
    }

    applyWatchIntent(driver, { path: INTENT_PATHS.stop, body: "" }, { ...ctx, now: 5000 });

    expect(getLiveMatch(driver)).toBeUndefined();
    const match = getMatch(driver, "m1");
    expect(match?.status).toBe("finished");
    expect(match?.winner).toBe("A");
    expect(match?.scoreLine).toBe("6-0");
  });

  it("keeps the legacy `end` intent as an alias for stop-and-save", () => {
    const driver = freshDb();
    createMatch(driver, { id: "m1", config, players, startedAt: 0 });
    appendEvent(driver, "m1", { winner: "B", at: 0 });

    applyWatchIntent(driver, { path: INTENT_PATHS.end, body: "" }, { ...ctx, now: 5000 });

    expect(getLiveMatch(driver)).toBeUndefined();
    expect(getMatch(driver, "m1")?.status).toBe("finished");
    expect(getMatch(driver, "m1")?.winner).toBe("B");
  });
});

describe("undecided serves and the squash set choice", () => {
  it("translates a score intent into taking the serve during pickleball game 2+", () => {
    const driver = freshDb();
    const pbConfig: MatchConfig = {
      sport: "pickleball",
      bestOf: 3,
      deuceMode: "advantage",
      thirdSet: "superTieBreak",
      pbType: "doubles",
      pbTarget: 11,
      pbTiebreak: "winByTwo",
      firstServe: "A",
    };
    createMatch(driver, { id: "m1", config: pbConfig, players, startedAt: 0 });

    // A wins game 1 (11 straight rallies), then the watch taps B.
    for (let i = 0; i < 11; i += 1) {
      applyWatchIntent(driver, { path: INTENT_PATHS.score, body: "A" }, ctx);
    }
    applyWatchIntent(driver, { path: INTENT_PATHS.score, body: "B" }, ctx);

    const events = loadEvents(driver, "m1");
    // 11 rallies for game 1, then a serve event — no rally scored for B.
    expect(events).toHaveLength(12);
    expect(events[11]?.kind).toBe("serve");
    expect(events[11]?.winner).toBe("B");
  });

  it("stages the squash long/short decision via the set-choice intent", () => {
    const driver = freshDb();
    const squashConfig: MatchConfig = {
      sport: "squash",
      bestOf: 3,
      deuceMode: "advantage",
      thirdSet: "fullSet",
      squashMode: "par",
      squashTarget: 9,
      squashTiebreak: "choice",
      firstServe: "A",
    };
    createMatch(driver, { id: "m1", config: squashConfig, players, startedAt: 0 });

    // 8-8 in PAR scoring.
    const winners = "AAAAAAAABBBBBBBB";
    for (const winner of winners) {
      applyWatchIntent(driver, { path: INTENT_PATHS.score, body: winner }, ctx);
    }
    // A score before the decision is refused.
    applyWatchIntent(driver, { path: INTENT_PATHS.score, body: "A" }, ctx);
    expect(loadEvents(driver, "m1")).toHaveLength(16);

    // The watch chooses long, then the rally carries it to 9-8, 10-8.
    applyWatchIntent(driver, { path: INTENT_PATHS.setChoice, body: "two" }, ctx);
    applyWatchIntent(driver, { path: INTENT_PATHS.score, body: "A" }, ctx);
    applyWatchIntent(driver, { path: INTENT_PATHS.score, body: "A" }, ctx);
    expect(loadEvents(driver, "m1")).toHaveLength(18);
    expect(loadEvents(driver, "m1")[16]?.gameSet).toBe("two");
  });
});
