import { describe, expect, it } from "vitest";
import type { MatchConfig, MatchSnapshot, PointEvent } from "../src/index.ts";
import { computeMatch, computeStats } from "../src/index.ts";
import { ADVANTAGE_MATCH, loveSet, snap } from "./helpers.ts";

interface EventSpec {
  readonly winner: "A" | "B";
  readonly kind?: "point" | "serve";
  readonly gameSet?: "one" | "two";
}

/** Fold from explicit event specs (rallies, serve events, and choices). */
function fold(config: MatchConfig, specs: readonly EventSpec[]): MatchSnapshot {
  return computeMatch(config, eventsOf(specs));
}

/** Materialise specs into PointEvents with synthetic timestamps. */
function eventsOf(specs: readonly EventSpec[]): PointEvent[] {
  return specs.map((spec, index) => ({
    winner: spec.winner,
    at: index,
    ...(spec.kind === undefined ? {} : { kind: spec.kind }),
    ...(spec.gameSet === undefined ? {} : { gameSet: spec.gameSet }),
  }));
}

const rallies = (winners: string): readonly EventSpec[] =>
  [...winners].map((winner) => ({ winner: winner === "A" ? "A" : "B" }));

const SQUASH_CHOICE: MatchConfig = {
  sport: "squash",
  bestOf: 3,
  deuceMode: "advantage",
  thirdSet: "fullSet",
  squashMode: "par",
  squashTarget: 9,
  squashTiebreak: "choice",
  firstServe: "A",
};

describe("squash choice tie-break (traditional HIHO long/short)", () => {
  it("asks for the receiver's choice at target-1 all", () => {
    const atChoicePoint = fold(SQUASH_CHOICE, rallies("AAAAAAAABBBBBBBB"));
    expect(atChoicePoint.currentGame).toMatchObject({ kind: "squash", points: { A: 8, B: 8 } });
    expect(atChoicePoint.moment).toEqual({ kind: "setChoice" });
  });

  it("asks at 8-8 in HIHO too (server-only scoring reaches the same moment)", () => {
    const hiho: MatchConfig = { ...SQUASH_CHOICE, squashMode: "hiho" as const };
    // A serves and scores 8; B hands out and scores 8.
    const atChoicePoint = fold(hiho, rallies("AAAAAAAABBBBBBBBB"));
    expect(atChoicePoint.currentGame).toMatchObject({ kind: "squash", points: { A: 8, B: 8 } });
    expect(atChoicePoint.moment).toEqual({ kind: "setChoice" });
  });

  it("short (set one) ends the game at 9-8", () => {
    const after = fold(SQUASH_CHOICE, [
      ...rallies("AAAAAAAABBBBBBBB"),
      { winner: "A", gameSet: "one" },
    ]);
    expect(after.completedSets).toHaveLength(1);
    expect(after.completedSets[0]?.games).toEqual({ A: 9, B: 8 });
    expect(after.setNumber).toBe(2);
  });

  it("long (set two) extends the game to 10", () => {
    const chosen = fold(SQUASH_CHOICE, [
      ...rallies("AAAAAAAABBBBBBBB"),
      { winner: "A", gameSet: "two" },
    ]);
    // 9-8 with the game extended to 10: it continues, game point to A.
    expect(chosen.completedSets).toHaveLength(0);
    expect(chosen.moment).toEqual({ kind: "gamePoint", team: "A" });
    const finished = fold(SQUASH_CHOICE, [
      ...rallies("AAAAAAAABBBBBBBB"),
      { winner: "A", gameSet: "two" },
      { winner: "A" },
    ]);
    expect(finished.completedSets[0]?.games).toEqual({ A: 10, B: 8 });
  });

  it("undo naturally re-asks: dropping the decided rally returns to the choice point", () => {
    const rewound = fold(SQUASH_CHOICE, rallies("AAAAAAAABBBBBBBB"));
    expect(rewound.moment).toEqual({ kind: "setChoice" });
  });
});

describe("squash serve box preferences", () => {
  const base: MatchConfig = {
    sport: "squash",
    bestOf: 1,
    deuceMode: "advantage",
    thirdSet: "fullSet",
    squashMode: "par",
    squashTarget: 11,
    squashTiebreak: "winByTwo",
    firstServe: "A",
  };

  it("without a preference every hand starts from the right box, then alternates", () => {
    expect(snap(base, "").servingSide).toBe("right"); // hand starts right
    expect(snap(base, "A").servingSide).toBe("left"); // alternates each point
    expect(snap(base, "AA").servingSide).toBe("right");
    expect(snap(base, "AB").servingSide).toBe("right"); // B's hand starts right too
  });

  it("a saved preference picks the starting box of each hand, then alternates", () => {
    const pref: MatchConfig = {
      ...base,
      squashServeBoxes: "player" as const,
      squashServeBoxA: "left" as const,
      squashServeBoxB: "left" as const,
    };
    expect(snap(pref, "").servingSide).toBe("left"); // A's hand starts left
    expect(snap(pref, "A").servingSide).toBe("right"); // alternates from there
    expect(snap(pref, "AA").servingSide).toBe("left");
    expect(snap(pref, "AB").servingSide).toBe("left"); // B's hand starts left too
  });

  it("each new hand restarts from the team's preferred box", () => {
    const pref: MatchConfig = {
      ...base,
      squashServeBoxes: "player" as const,
      squashServeBoxA: "left" as const,
    };
    // A holds serve for two points (hand 1), B takes a rally (handout), A wins
    // it back: the new hand starts from A's preference again.
    expect(snap(pref, "AAB").servingSide).toBe("right"); // B's hand, no pref -> right
    expect(snap(pref, "AABA").servingSide).toBe("left"); // A's new hand starts left
  });
  it("a fixed left box starts every hand from the left, then alternates", () => {
    const fixed: MatchConfig = { ...base, squashServeBoxes: "left" as const };
    expect(snap(fixed, "").servingSide).toBe("left");
    expect(snap(fixed, "A").servingSide).toBe("right");
    expect(snap(fixed, "AB").servingSide).toBe("left"); // B's hand also starts left
  });
});

describe("pickleball undecided first serve (games 2+)", () => {
  const Singles: MatchConfig = {
    sport: "pickleball",
    bestOf: 3,
    deuceMode: "advantage",
    thirdSet: "superTieBreak",
    pbType: "singles",
    pbTarget: 11,
    pbTiebreak: "winByTwo",
    firstServe: "A",
  };

  const gameForA = rallies("A".repeat(11));

  it("leaves the first serve of game 2 undecided instead of handing it to the winner", () => {
    const atGameTwo = fold(Singles, gameForA);
    expect(atGameTwo.setNumber).toBe(2);
    expect(atGameTwo.servingTeam).toBeUndefined();
    expect(atGameTwo.moment).toEqual({ kind: "normal" });
  });

  it("a serve event takes the serve without scoring a rally", () => {
    const state = fold(Singles, [...gameForA, { winner: "B", kind: "serve" }]);
    expect(state.servingTeam).toBe("B");
    expect(state.totalPoints).toEqual({ A: 11, B: 0 });
    expect(state.currentGame).toMatchObject({ kind: "pickleball", points: { A: 0, B: 0 } });
  });

  it("undo drops the serve choice and re-asks", () => {
    const decided = fold(Singles, [...gameForA, { winner: "B", kind: "serve" }]);
    expect(decided.servingTeam).toBe("B");
    const backAtGameTwo = fold(Singles, gameForA);
    expect(backAtGameTwo.servingTeam).toBeUndefined();
  });

  it("a serve event during game 1 is ignored (stray replay)", () => {
    const stray = fold(Singles, [...rallies("A"), { winner: "B", kind: "serve" }]);
    expect(stray.servingTeam).toBe("A");
    expect(stray.totalPoints).toEqual({ A: 1, B: 0 });
  });

  it("singles serving side follows the server's own score parity", () => {
    expect(snap(Singles, "A").servingSide).toBe("left"); // server A at 1-0 (odd)
    expect(snap(Singles, "AA").servingSide).toBe("right"); // 2-0 (even)
  });
});

describe("pickleball stats are recorded as standard games", () => {
  it("computes service holds and breaks from sideout scoring", () => {
    const config: MatchConfig = {
      sport: "pickleball",
      bestOf: 1,
      deuceMode: "advantage",
      thirdSet: "superTieBreak",
      pbType: "singles",
      pbTarget: 11,
      pbTiebreak: "winByOne",
      firstServe: "A",
    };
    // A serves and scores 4; B sideouts (no point), then serves out 11-4.
    const stats = computeStats(config, eventsOf(rallies(`AAAAB${"B".repeat(11)}`)));
    expect(stats.games).toHaveLength(1);
    expect(stats.games.every((game) => game.kind === "standard")).toBe(true);
    expect(stats.games[0]?.server).toBe("A");
    expect(stats.games[0]?.winner).toBe("B");
    expect(stats.service.A).toEqual({ held: 0, served: 1 });
    expect(stats.breaks.B).toBe(1);
  });
});

describe("padel regression: super tie-break still starts at one set all", () => {
  it("starts the super tie-break for configs that omit sport (legacy padel)", () => {
    const legacy: MatchConfig = {
      ...ADVANTAGE_MATCH,
      bestOf: 3,
      thirdSet: "superTieBreak",
    };
    const oneSetAll = `${loveSet("A")}${loveSet("B")}`;
    const snapshot = snap(legacy, oneSetAll);
    expect(snapshot.currentGame).toMatchObject({ tieBreakKind: "superTieBreak" });
  });
});

describe("pickleball doubles server call", () => {
  const Doubles: MatchConfig = {
    sport: "pickleball",
    bestOf: 3,
    deuceMode: "advantage",
    thirdSet: "superTieBreak",
    pbType: "doubles",
    pbTarget: 11,
    pbTiebreak: "winByTwo",
    firstServe: "A",
  };

  it("opens game 1 with team A serving as server 2, at 0-0", () => {
    const state = fold(Doubles, []);
    expect(state.servingTeam).toBe("A");
    expect(state.currentGame).toMatchObject({
      kind: "pickleball",
      points: { A: 0, B: 0 },
      serverNumber: 2,
    });
  });

  it("walks server 2 to a side-out, then server 1 to server 2 in the same team", () => {
    // A (server 2) wins: 1-0-2. B wins the next rally: A's server 2 loses, so B takes
    // serve as server 1 with the score unchanged (0-1-1 read as B's points first).
    const sideOut = fold(Doubles, rallies("AB"));
    expect(sideOut.servingTeam).toBe("B");
    expect(sideOut.currentGame).toMatchObject({ points: { A: 1, B: 0 }, serverNumber: 1 });

    // A wins the rally: B's server 1 loses, so the serve passes to B's partner (server 2).
    const partner = fold(Doubles, rallies("ABA"));
    expect(partner.servingTeam).toBe("B");
    expect(partner.currentGame).toMatchObject({ points: { A: 1, B: 0 }, serverNumber: 2 });

    // B wins as server 2: the serving team scores.
    const scored = fold(Doubles, rallies("ABAB"));
    expect(scored.servingTeam).toBe("B");
    expect(scored.currentGame).toMatchObject({ points: { A: 1, B: 1 }, serverNumber: 2 });
  });
});
