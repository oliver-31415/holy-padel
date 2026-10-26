import type { MatchSnapshot, TeamId } from "./types.ts";

/** The snapshot fields the outcome rule reads — a `MatchSnapshot` satisfies it. */
export type OutcomeSnapshot = Pick<
  MatchSnapshot,
  "finished" | "winner" | "completedSets" | "currentSetGames" | "currentGame"
>;

/**
 * Who a match is credited to, or `undefined` for a draw.
 *
 * A natural finish keeps the engine's winner. A match ended early (court time
 * up) is judged on the same ladder the scoreboard reads, most significant first:
 *   1. sets won (squash and pickleball: games won, since each game is a set),
 *   2. games in the set in play (padel; always 0 in squash and pickleball),
 *   3. points in the game in play (padel tie-break points included).
 * Level on all three is a draw: neither side is credited with the match.
 */
export function outcomeWinner(snapshot: OutcomeSnapshot): TeamId | undefined {
  if (snapshot.finished) {
    return snapshot.winner;
  }
  const setsA = snapshot.completedSets.filter((set) => set.winner === "A").length;
  const setsB = snapshot.completedSets.length - setsA;
  const points = snapshot.currentGame?.points ?? { A: 0, B: 0 };
  const ladder: readonly (readonly [number, number])[] = [
    [setsA, setsB],
    [snapshot.currentSetGames.A, snapshot.currentSetGames.B],
    [points.A, points.B],
  ];
  const decider = ladder.find(([a, b]) => a !== b);
  if (decider === undefined) {
    return;
  }
  return decider[0] > decider[1] ? "A" : "B";
}
