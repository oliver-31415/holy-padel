import type { MatchConfig, PointEvent } from "@holy-padel/scoring";
import { describe, expect, it } from "vitest";
import { computeGameSeries } from "../src/lib/game-series.ts";

const config: MatchConfig = {
  sport: "squash",
  bestOf: 1,
  deuceMode: "advantage",
  thirdSet: "fullSet",
  squashMode: "hiho",
  squashTarget: 11,
  squashTiebreak: "winByTwo",
  squashServeBoxes: "player",
  firstServe: "A",
  firstServePending: false,
  firstServeOriginallyUndecided: false,
};

/** A 5-rally stretch: A holds serve and scores, then B wins a hand-out. */
const events: PointEvent[] = [
  { winner: "A", at: 0 },
  { winner: "A", at: 9000 },
  { winner: "A", at: 24_000 },
  { winner: "A", at: 25_000 },
  { winner: "B", at: 70_000 },
  { winner: "B", at: 72_000 },
  { winner: "A", at: 120_000 },
];

describe("computeGameSeries", () => {
  it("keeps real rally timestamps so the chart's x-axis is time", () => {
    const [game] = computeGameSeries(config, events);
    expect(game).toBeDefined();
    const xs = game?.steps.map((step) => step.t);
    // The gaps are wildly uneven (9s, 15s, 1s, 45s …) — the chart maps x to
    // these, so plateaus reflect how long each score stood.
    expect(xs).toEqual([0, 9000, 24_000, 25_000, 70_000, 72_000, 120_000]);
  });

  it("flags HI-HO hand-outs (receiver wins, serve passes) on the steps", () => {
    const [game] = computeGameSeries(config, events);
    const flags = game?.steps.map((step) => step.handOut);
    // A holds serve for the opener, B's first rally is a hand-out, and B's
    // rally after that is a scored point for the new server, so no flag. A
    // then wins a hand-out back.
    expect(flags).toEqual([false, false, false, false, true, false, true]);
  });

  it("counts the lead from scored points, so hand-outs do not move the score", () => {
    const [game] = computeGameSeries(config, events);
    // Hand-outs score nothing: A goes 1-4, B's hand-out leaves the lead at 4,
    // B scores once (lead 3), and A's hand-out leaves it at 3.
    expect(game?.steps.map((step) => step.lead)).toEqual([1, 2, 3, 4, 4, 3, 3]);
    expect(game?.pointsA).toBe(4);
    expect(game?.pointsB).toBe(1);
  });

  it("records who won each rally", () => {
    const [game] = computeGameSeries(config, events);
    expect(game?.steps.map((step) => step.winner)).toEqual(["A", "A", "A", "A", "B", "B", "A"]);
  });

  it("never flags hand-outs in PAR, where every rally scores", () => {
    const par: MatchConfig = { ...config, squashMode: "par" as const };
    const [game] = computeGameSeries(par, events);
    expect(game?.steps.map((step) => step.handOut)).toEqual([
      false,
      false,
      false,
      false,
      false,
      false,
      false,
    ]);
    // Under PAR B's rallies score, so the lead tracks every winner.
    expect(game?.steps.map((step) => step.lead)).toEqual([1, 2, 3, 4, 3, 2, 3]);
    expect(game?.pointsB).toBe(2);
  });

  it("never flags hand-outs in padel, even when the serve changes at a game boundary", () => {
    const padel: MatchConfig = {
      bestOf: 1,
      deuceMode: "advantage",
      thirdSet: "fullSet",
      firstServe: "A",
      firstServePending: false,
      firstServeOriginallyUndecided: false,
    };
    // A wins the first game (serve passes to B at the boundary), then B wins
    // the second game.
    const padelEvents: PointEvent[] = [
      { winner: "A", at: 0 },
      { winner: "A", at: 1000 },
      { winner: "A", at: 2000 },
      { winner: "A", at: 3000 },
      { winner: "B", at: 4000 },
      { winner: "B", at: 5000 },
      { winner: "B", at: 6000 },
      { winner: "B", at: 7000 },
    ];
    const games = computeGameSeries(padel, padelEvents);
    expect(games.length).toBeGreaterThanOrEqual(2);
    for (const game of games) {
      expect(game.steps.every((step) => !step.handOut)).toBe(true);
    }
  });

  it("records the in-game points and the server after every rally", () => {
    const [game] = computeGameSeries(config, events);
    expect(game?.steps.map((step) => step.points)).toEqual([
      { A: 1, B: 0 },
      { A: 2, B: 0 },
      { A: 3, B: 0 },
      { A: 4, B: 0 },
      { A: 4, B: 0 },
      { A: 4, B: 1 },
      { A: 4, B: 1 },
    ]);
    // B takes serve on its hand-out, so the rally after it is served by B.
    expect(game?.steps.map((step) => step.serving)).toEqual(["A", "A", "A", "A", "A", "B", "B"]);
  });

  it("keeps the set's games at zero while no game has finished", () => {
    const [game] = computeGameSeries(config, events);
    expect(game?.steps.every((step) => step.setGames.A === 0 && step.setGames.B === 0)).toBe(true);
  });

  it("counts a finished game in the set's games, from the rally that ends it", () => {
    const padel: MatchConfig = {
      bestOf: 1,
      deuceMode: "advantage",
      thirdSet: "fullSet",
      firstServe: "A",
      firstServePending: false,
      firstServeOriginallyUndecided: false,
    };
    const padelEvents: PointEvent[] = [
      { winner: "A", at: 0 },
      { winner: "A", at: 1000 },
      { winner: "A", at: 2000 },
      { winner: "A", at: 3000 },
      { winner: "B", at: 4000 },
      { winner: "B", at: 5000 },
      { winner: "B", at: 6000 },
      { winner: "B", at: 7000 },
    ];
    const [first, second] = computeGameSeries(padel, padelEvents);
    expect(first?.steps.at(-1)?.setGames).toEqual({ A: 1, B: 0 });
    // The next game starts from the set's score, and its points restart at zero.
    expect(second?.steps[0]?.setGames).toEqual({ A: 1, B: 0 });
    expect(second?.steps[0]?.points).toEqual({ A: 0, B: 1 });
    expect(second?.steps.at(-1)?.setGames).toEqual({ A: 1, B: 1 });
  });
});

describe("computeGameSeries for pickleball", () => {
  const doubles: MatchConfig = {
    sport: "pickleball",
    bestOf: 1,
    deuceMode: "advantage",
    thirdSet: "superTieBreak",
    pbType: "doubles",
    pbTarget: 11,
    pbTiebreak: "winByTwo",
    firstServe: "A",
    firstServePending: false,
    firstServeOriginallyUndecided: false,
  };
  const at = (winners: string): PointEvent[] =>
    [...winners].map((winner, index) => ({ winner: winner === "A" ? "A" : "B", at: index * 1000 }));

  it("scores only the serving team's rallies, and marks each side-out", () => {
    const [game] = computeGameSeries(doubles, at("ABAB"));
    // A (server 2) scores, B's hand-out is a side-out, A's loss hands serve to B's partner
    // with the score unchanged, and B's rally then scores for B.
    expect(game?.steps.map((step) => step.points)).toEqual([
      { A: 1, B: 0 },
      { A: 1, B: 0 },
      { A: 1, B: 0 },
      { A: 1, B: 1 },
    ]);
    expect(game?.steps.map((step) => step.handOut)).toEqual([false, true, true, false]);
    expect(game?.steps.map((step) => step.serving)).toEqual(["A", "A", "B", "B"]);
  });

  it("carries the server call on each open-game rally, with the team read first", () => {
    const [game] = computeGameSeries(doubles, at("ABAB"));
    expect(game?.steps.map((step) => step.call)).toEqual([
      { team: "A", serverNumber: 2 },
      { team: "B", serverNumber: 1 },
      { team: "B", serverNumber: 2 },
      { team: "B", serverNumber: 2 },
    ]);
  });

  it("drops the call on the game-ending rally and ends on the final game points", () => {
    const [game] = computeGameSeries(doubles, at("A".repeat(11)));
    const last = game?.steps.at(-1);
    expect(last?.call).toBeUndefined();
    expect(last?.points).toEqual({ A: 11, B: 0 });
    expect(game?.pointsA).toBe(11);
    expect(game?.pointsB).toBe(0);
  });
});
