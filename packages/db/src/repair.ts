import type { MatchConfig, PointEvent, TeamId } from "@holy-padel/scoring";
import { computeMatch, outcomeWinner } from "@holy-padel/scoring";
import type { SqlDriver } from "./driver.ts";
import type { MatchSummary } from "./match-types.ts";
import { appendEvents, listMatches, loadEvents, setFinishedWinner } from "./matches.ts";

/**
 * Rebuild a finished match's point ledger from its cached score line — the
 * repair path for matches whose rallies were lost (e.g. a device restore that
 * carried the matches table but not the events). The score line and winner
 * survive on the match row, so the per-game scores are replayed rally-by-rally
 * through the engine itself: the synthesized rallies fold to exactly the
 * recorded result, which brings the score-race graph, the points bar and every
 * derived stat back to life. Synthesized timestamps spread evenly across the
 * match's real wall-clock window; the true rally order is gone.
 *
 * Squash only: its score line is one score per game, which maps 1:1 to a set
 * plan. Padel lines describe sets of games and would need a deeper synthesis.
 */

/** Safety valve per game — real squash games never approach this. */
const MAX_RALLIES_PER_GAME = 300;
/** Fallback duration for finished matches with no recorded end time. */
const FALLBACK_DURATION_MS = 60_000;
/** Probe timestamps used while folding partial ledgers (values don't matter). */
const PROBE_WINDOW_MS = 1;

export function repairMissingEvents(driver: SqlDriver): number {
  const candidates = listMatches(driver).filter(
    (match) =>
      match.status === "finished" &&
      match.config.sport === "squash" &&
      match.scoreLine !== undefined &&
      match.scoreLine !== "" &&
      loadEvents(driver, match.id).length === 0,
  );
  let repaired = 0;
  for (const match of candidates) {
    const events = synthesizeMatchEvents(match);
    if (events !== undefined) {
      appendEvents(driver, match.id, events);
      repaired += 1;
    }
  }
  return repaired;
}

/**
 * Turn level early stops that were saved with a winner into draws. Matches
 * ended before a natural finish used to be saved with a winner picked by the
 * leader's total points, so a level stop was recorded as a win. The ledger
 * decides only the level case: when `outcomeWinner` reads the replayed
 * snapshot as undefined (a draw), a stored winner is cleared to NULL. A stored
 * winner is never flipped to the other side, so a result the user has already
 * seen does not change. Natural finishes, stops the current rule still
 * credits, and matches with no ledger are left alone. Idempotent.
 */
export function repairEarlyStopWinners(driver: SqlDriver): number {
  let repaired = 0;
  for (const match of listMatches(driver)) {
    if (match.status !== "finished" || match.winner === undefined) {
      continue;
    }
    const events = loadEvents(driver, match.id);
    if (events.length === 0) {
      continue;
    }
    const snapshot = computeMatch(match.config, events);
    if (snapshot.finished || outcomeWinner(snapshot) !== undefined) {
      continue;
    }
    setFinishedWinner(driver, match.id, undefined);
    repaired += 1;
  }
  return repaired;
}

/** "13-11 · 7-11" → per-game scores in team order, or undefined when malformed. */
function parseScoreLine(scoreLine: string): readonly (readonly [number, number])[] | undefined {
  const sets: (readonly [number, number])[] = [];
  for (const part of scoreLine.split("·")) {
    const [left, right] = part.trim().split("-");
    const a = Number(left);
    const b = Number(right);
    const valid = Number.isInteger(a) && Number.isInteger(b) && a >= 0 && b >= 0;
    if (!valid) {
      return;
    }
    sets.push([a, b]);
  }
  return sets.length > 0 ? sets : undefined;
}

function synthesizeMatchEvents(match: MatchSummary): PointEvent[] | undefined {
  const { config, scoreLine, startedAt, endedAt, winner } = match;
  if (config.sport !== "squash" || config.squashTiebreak === "choice") {
    return;
  }
  const sets = parseScoreLine(scoreLine ?? "");
  if (sets === undefined) {
    return;
  }

  const window = endedAt ?? startedAt + FALLBACK_DURATION_MS;
  let winners: TeamId[] = [];
  for (const [scoreA, scoreB] of sets) {
    if (scoreA === scoreB) {
      return;
    }
    const setWinner: TeamId = scoreA > scoreB ? "A" : "B";
    try {
      winners = synthesizeGame({
        config,
        prefix: winners,
        win: Math.max(scoreA, scoreB),
        los: Math.min(scoreA, scoreB),
        setWinner,
      });
    } catch {
      // Malformed line or an engine mismatch — leave the match untouched.
      return;
    }
  }
  if (winners.length === 0) {
    return;
  }

  const events = eventsFrom(winners, startedAt, window);
  // Sanity: the engine must fold the synthesized rallies to a match won by
  // the stored winner — otherwise the line and the ledger would disagree.
  const snapshot = computeMatch(config, events);
  if (!snapshot.finished || snapshot.winner !== winner) {
    return;
  }
  return events;
}

/**
 * Extend `prefix` with rallies that take the open game to `win`–`los` and end
 * it, simulated through the engine so both PAR and HIHO serve scoring are
 * honoured. Points alternate winner/loser — the lead never crosses the
 * game-ending threshold early, so the game lands exactly on the recorded
 * score. Under HIHO a rally won from the non-serving side transfers the serve
 * without scoring (engine behaviour), so the sequence simply repeats the
 * point's team until the point lands.
 */
/** One game's replay target: the recorded score in winner/loser terms. */
interface GameTarget {
  readonly config: MatchConfig;
  readonly prefix: TeamId[];
  readonly win: number;
  readonly los: number;
  readonly setWinner: TeamId;
}

function synthesizeGame(target: GameTarget): TeamId[] {
  const { config, prefix, win, los, setWinner } = target;
  const events = [...prefix];
  const setsBefore = fold(config, events).completedSets.length;

  for (let guard = 0; guard < MAX_RALLIES_PER_GAME; guard += 1) {
    const snapshot = fold(config, events);
    if (snapshot.completedSets.length > setsBefore) {
      verifyLanded(snapshot, setWinner, win, los);
      return events;
    }
    const game = snapshot.currentGame;
    if (snapshot.finished || game === undefined) {
      throw new Error("match finished before the score line was fully replayed");
    }
    events.push(nextPointTeam(game.points, setWinner, win, los));
  }
  throw new Error("score line replay did not converge");
}

/** The game just completed must carry exactly the recorded score. */
function verifyLanded(
  snapshot: ReturnType<typeof computeMatch>,
  setWinner: TeamId,
  win: number,
  los: number,
): void {
  const last = snapshot.completedSets.at(-1);
  const landed =
    last !== undefined &&
    (setWinner === "A"
      ? last.games.A === win && last.games.B === los
      : last.games.B === win && last.games.A === los);
  if (!landed) {
    throw new Error("replayed game score diverged from the score line");
  }
}

/** The team that should land the next point of the game being replayed. */
function nextPointTeam(
  points: { readonly A: number; readonly B: number },
  setWinner: TeamId,
  win: number,
  los: number,
): TeamId {
  const winnerPoints = setWinner === "A" ? points.A : points.B;
  const loserPoints = setWinner === "A" ? points.B : points.A;
  if (winnerPoints < win - 1 && winnerPoints <= loserPoints) {
    return setWinner;
  }
  if (loserPoints < los) {
    return setWinner === "A" ? "B" : "A";
  }
  return setWinner;
}

function fold(config: MatchConfig, winners: readonly TeamId[]): ReturnType<typeof computeMatch> {
  return computeMatch(config, eventsFrom(winners, 0, PROBE_WINDOW_MS));
}

function eventsFrom(winners: readonly TeamId[], startedAt: number, endedAt: number): PointEvent[] {
  const span = Math.max(1, endedAt - startedAt);
  return winners.map((winner, index) => ({
    winner,
    at: startedAt + Math.round(((index + 1) / (winners.length + 1)) * span),
  }));
}
