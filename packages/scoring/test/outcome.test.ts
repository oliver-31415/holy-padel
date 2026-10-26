import { describe, expect, it } from "vitest";
import type { OutcomeSnapshot } from "../src/index.ts";
import { outcomeWinner } from "../src/index.ts";
import { ADVANTAGE_MATCH, loveSet, snap } from "./helpers.ts";

const NO_SETS: OutcomeSnapshot["completedSets"] = [];

function padel(
  overrides: Partial<OutcomeSnapshot> & { readonly points?: { A: number; B: number } },
): OutcomeSnapshot {
  const { points = { A: 0, B: 0 }, ...rest } = overrides;
  return {
    finished: false,
    winner: undefined,
    completedSets: NO_SETS,
    currentSetGames: { A: 0, B: 0 },
    currentGame: { kind: "standard", points, calls: { A: "0", B: "0" } },
    ...rest,
  };
}

describe("outcomeWinner", () => {
  it("keeps the engine's winner for a natural finish", () => {
    const snapshot = snap(ADVANTAGE_MATCH, loveSet("A").repeat(2));
    expect(snapshot.finished).toBe(true);
    expect(outcomeWinner(snapshot)).toBe("A");
  });

  it("returns undefined for a finished match with no winner", () => {
    expect(outcomeWinner({ ...padel({}), finished: true, winner: undefined })).toBeUndefined();
  });

  it("calls padel 6-6 at 30-30 a draw", () => {
    const snapshot = padel({ currentSetGames: { A: 6, B: 6 }, points: { A: 2, B: 2 } });
    expect(outcomeWinner(snapshot)).toBeUndefined();
  });

  it("credits padel 1-1 in sets, then 3-3 at 40-30 to the leader on points", () => {
    const completedSets = [
      { games: { A: 6, B: 4 }, winner: "A", kind: "set" },
      { games: { A: 4, B: 6 }, winner: "B", kind: "set" },
    ] as const;
    const snapshot = padel({
      completedSets,
      currentSetGames: { A: 3, B: 3 },
      points: { A: 3, B: 2 },
    });
    expect(outcomeWinner(snapshot)).toBe("A");
  });

  it("ranks sets above games in the set in play", () => {
    const completedSets = [{ games: { A: 6, B: 0 }, winner: "A", kind: "set" }] as const;
    const snapshot = padel({ completedSets, currentSetGames: { A: 0, B: 5 } });
    expect(outcomeWinner(snapshot)).toBe("A");
  });

  it("calls squash 10-10 in the only game a draw", () => {
    const snapshot = padel({ points: { A: 10, B: 10 } });
    const squash = {
      ...snapshot,
      currentGame: { kind: "squash" as const, points: { A: 10, B: 10 } },
    };
    expect(outcomeWinner(squash)).toBeUndefined();
  });

  it("calls squash 1-1 in games and 5-5 in the game in play a draw", () => {
    const completedSets = [
      { games: { A: 11, B: 9 }, winner: "A", kind: "set" },
      { games: { A: 9, B: 11 }, winner: "B", kind: "set" },
    ] as const;
    const level = {
      ...padel({}),
      completedSets,
      currentGame: { kind: "squash" as const, points: { A: 5, B: 5 } },
    };
    expect(outcomeWinner(level)).toBeUndefined();
    const ahead = { ...level, currentGame: { kind: "squash" as const, points: { A: 6, B: 5 } } };
    expect(outcomeWinner(ahead)).toBe("A");
  });
});
