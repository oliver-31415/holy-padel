import type { MatchSummary } from "@holy-padel/db";
import type { MatchConfig, PointEvent, TeamId } from "@holy-padel/scoring";
import { computeMatch } from "@holy-padel/scoring";
import { describe, expect, it } from "vitest";
import { buildWatchState } from "../src/watch/build-state.ts";

// Wednesday 2026-07-01 12:00 local; the match started 47 minutes earlier.
const NOW = new Date(2026, 6, 1, 12, 0).getTime();
const STARTED = NOW - 47 * 60_000;

const bestOfThree: MatchConfig = {
  bestOf: 3,
  deuceMode: "advantage",
  thirdSet: "superTieBreak",
  firstServe: "A",
};

function baseMatch(overrides: Partial<MatchSummary> = {}): MatchSummary {
  return {
    id: "m1",
    status: "live",
    config: bestOfThree,
    players: { A: ["nico", "javi"], B: ["marta", "leo"] },
    location: undefined,
    startedAt: STARTED,
    endedAt: undefined,
    winner: undefined,
    scoreLine: undefined,
    pausedMs: 0,
    pausedAt: undefined,
    pendingGameSet: undefined,
    note: undefined,
    names: { A: ["Nico", "Javi"], B: ["Marta", "Leo"] },
    ...overrides,
  };
}

function wins(team: TeamId, count: number): PointEvent[] {
  return Array.from({ length: count }, () => ({ winner: team, at: 0 }));
}

describe("buildWatchState — squash set choice", () => {
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

  function choiceSnapshot(pendingGameSet: MatchSummary["pendingGameSet"]) {
    // 8-8 in PAR scoring reaches the receiver's choice point.
    const winners = "AAAAAAAABBBBBBBB";
    const events: PointEvent[] = [...winners].map((winner, index) => ({
      winner: winner === "A" ? ("A" as const) : ("B" as const),
      at: index,
    }));
    const snapshot = computeMatch(squashConfig, events);
    return { match: baseMatch({ pendingGameSet }), snapshot };
  }

  it("with no staged decision the watch shows its SHORT/LONG buttons", () => {
    const state = buildWatchState({
      ownerId: "nico",
      now: NOW,
      live: choiceSnapshot(undefined),
    });
    expect(state.status).toBe("SET 1 OR 2");
    expect(state.choicePending).toBe(true);
    expect(state.status).toBe("SET 1 OR 2");
  });

  it("once staged the buttons clear and the staged call becomes the status", () => {
    const state = buildWatchState({
      ownerId: "nico",
      now: NOW,
      live: choiceSnapshot("two"),
    });
    expect(state.choicePending).toBeUndefined();
    expect(state.status).toBe("LONG · SET 2");
  });
});

describe("buildWatchState", () => {
  it("mirrors a live game — serving, point calls, clock and status", () => {
    // A 40, B 15 in the opening game: A holds game point.
    const events: PointEvent[] = [...wins("A", 3), ...wins("B", 1)];
    const snapshot = computeMatch(bestOfThree, events);

    const state = buildWatchState({
      ownerId: "nico",
      now: NOW,
      live: { match: baseMatch(), snapshot },
    });

    expect(state.phase).toBe("live");
    expect(state.teamA).toEqual({ short: "N&J", serving: true, servingSide: "right" });
    expect(state.teamB).toEqual({ short: "M&L", serving: false, servingSide: null });
    expect(state.pointA).toBe("40");
    expect(state.pointB).toBe("15");
    expect(state.games).toBe("0-0");
    expect(state.setLabel).toBe("SET 1");
    expect(state.clock).toBe("0:47");
    // The watch runs the clock itself from here between pushes.
    expect(state.clockBase).toBe(STARTED);
    expect(state.startedAt).toBe(STARTED);
    expect(state.status).toBe("GAME PT");
    expect(state.paused).toBe(false);
    expect(state.won).toBeUndefined();
    expect(state.last).toBeUndefined();
  });

  it("flags a paused match and freezes the clock at play time", () => {
    // Started 47m ago, paused 5m ago → 42m of play, frozen.
    const events: PointEvent[] = [...wins("A", 3), ...wins("B", 1)];
    const snapshot = computeMatch(bestOfThree, events);
    const pausedAt = NOW - 5 * 60_000;

    const state = buildWatchState({
      ownerId: "nico",
      now: NOW,
      live: { match: baseMatch({ pausedAt }), snapshot },
    });

    expect(state.phase).toBe("live");
    expect(state.paused).toBe(true);
    expect(state.clock).toBe("0:42"); // 47m elapsed − 5m open pause
    expect(state.clockBase).toBeUndefined();
  });

  it("labels the deciding super tie-break", () => {
    // Set 1 to A (6-0), set 2 to B (6-0), then one point into the super tie-break.
    const events: PointEvent[] = [...wins("A", 24), ...wins("B", 24), ...wins("A", 1)];
    const snapshot = computeMatch(bestOfThree, events);

    const state = buildWatchState({
      ownerId: "nico",
      now: NOW,
      live: { match: baseMatch(), snapshot },
    });

    expect(state.phase).toBe("live");
    expect(state.setLabel).toBe("SUPER TB");
    // Just the sets beside it — the tie-break points are already the big numbers.
    expect(state.games).toBe("6-0 · 0-6");
    expect(state.pointA).toBe("1");
    expect(state.pointB).toBe("0");
  });

  it("celebrates a finished match", () => {
    const singleSet: MatchConfig = { ...bestOfThree, bestOf: 1, thirdSet: "fullSet" };
    const snapshot = computeMatch(singleSet, wins("A", 24)); // 6-0 to A
    expect(snapshot.finished).toBe(true);

    const state = buildWatchState({
      ownerId: "nico",
      now: NOW,
      live: { match: baseMatch({ config: singleSet }), snapshot },
    });

    expect(state.phase).toBe("won");
    expect(state.games).toBe("6-0");
    expect(state.pointA).toBe("");
    expect(state.won).toEqual({
      winnerShort: "N&J",
      scoreLine: "6-0",
      duration: "0:47",
      ownerWon: true,
    });
    expect(state.startedAt).toBe(STARTED);
  });

  it("tells the watch when the owner's team lost", () => {
    const singleSet: MatchConfig = { ...bestOfThree, bestOf: 1, thirdSet: "fullSet" };
    const snapshot = computeMatch(singleSet, wins("B", 24)); // 0-6 to B

    const state = buildWatchState({
      ownerId: "nico",
      now: NOW,
      live: { match: baseMatch({ config: singleSet }), snapshot },
    });

    expect(state.won).toMatchObject({ winnerShort: "M&L", ownerWon: false });
  });

  it("is idle with no hint when there is no history", () => {
    const state = buildWatchState({ ownerId: "nico", now: NOW });

    expect(state.phase).toBe("idle");
    expect(state.last).toBeUndefined();
    expect(state.teamA).toEqual({ short: "", serving: false });
    expect(state.clock).toBe("");
  });

  it("shows the last match as a quick-start hint, from the owner's perspective", () => {
    const owedWin = baseMatch({
      status: "finished",
      winner: "A",
      scoreLine: "6-3 · 7-6",
      endedAt: NOW,
    });
    expect(buildWatchState({ ownerId: "nico", now: NOW, last: owedWin }).last).toEqual({
      line: "6-3 · 7-6 vs M&L",
      won: true,
    });

    const owedLoss = baseMatch({
      status: "finished",
      winner: "B",
      scoreLine: "4-6 · 6-7",
      endedAt: NOW,
    });
    expect(buildWatchState({ ownerId: "nico", now: NOW, last: owedLoss }).last).toEqual({
      line: "4-6 · 6-7 vs M&L",
      won: false,
    });
  });
});
