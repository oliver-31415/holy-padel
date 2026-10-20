import type { MatchConfig, PointEvent, TeamId } from "@holy-padel/scoring";
import { replayMatch } from "@holy-padel/scoring";

/** One point inside a game: when it was played and the lead after it. */
export interface GameSeriesStep {
  readonly t: number;
  /** Points for team A minus points for team B, within the game. */
  readonly lead: number;
  /** The team that won the rally (a hand-out is won by the receiver). */
  readonly winner: TeamId;
  /**
   * True when a squash HI-HO rally was won by the receiver: no point is
   * scored and the serve passes. Marked on the score-race chart so serve
   * stretches read as plateaus between markers. Padel and PAR never set it.
   */
  readonly handOut: boolean;
}

/** The point-by-point lead ("snake") of one completed game. */
export interface GameSeries {
  readonly setNumber: number;
  /** 1-based position of the game within its set. */
  readonly gameNumber: number;
  readonly pointsA: number;
  readonly pointsB: number;
  readonly startedAt: number;
  readonly endedAt: number;
  readonly steps: readonly GameSeriesStep[];
}

interface OpenGame {
  readonly setNumber: number;
  readonly a: number;
  readonly b: number;
  readonly steps: readonly GameSeriesStep[];
}

/** The in-game score after a rally: the engine's squash game points when it gives them, else a count. */
function scoreAfterRally(
  current: OpenGame,
  winner: TeamId,
  squashPoints: { readonly A: number; readonly B: number } | undefined,
): { readonly a: number; readonly b: number } {
  if (squashPoints !== undefined) {
    return { a: squashPoints.A, b: squashPoints.B };
  }
  return {
    a: current.a + (winner === "A" ? 1 : 0),
    b: current.b + (winner === "B" ? 1 : 0),
  };
}

function closeGame(open: OpenGame, games: GameSeries[]): void {
  const [first] = open.steps;
  const last = open.steps.at(-1);
  if (first === undefined || last === undefined) {
    return;
  }
  games.push({
    setNumber: open.setNumber,
    gameNumber: games.filter((game) => game.setNumber === open.setNumber).length + 1,
    pointsA: open.a,
    pointsB: open.b,
    startedAt: first.t,
    endedAt: last.t,
    steps: open.steps,
  });
}

/**
 * Walk a match's ledger and split it into per-game point sequences, tracking
 * the in-game lead after every rally — the data behind the score-race chart.
 * Serve events score no rally and are skipped (as in computeStats).
 */
export function computeGameSeries(
  config: MatchConfig,
  events: readonly PointEvent[],
): GameSeries[] {
  const games: GameSeries[] = [];
  let open: OpenGame | undefined;
  let previousTotalGames = { A: 0, B: 0 };
  let previousSetCount = 0;
  const snapshots = replayMatch(config, events);

  events.forEach((event, index) => {
    const before = snapshots[index];
    const after = snapshots[index + 1];
    if (event.kind === "serve" || before === undefined || after === undefined) {
      return;
    }
    const gameFinished =
      after.totalGames.A !== previousTotalGames.A || after.totalGames.B !== previousTotalGames.B;
    const setFinished = after.completedSets.length > previousSetCount;

    if (open === undefined) {
      open = { setNumber: before.setNumber, a: 0, b: 0, steps: [] };
    }
    const current: OpenGame = open;
    // Squash HI-HO awards no point to a receiver's rally, so the lead must
    // come from the engine's game points rather than from counting winners.
    // A game-ending rally always scores (only points end a game), and the
    // snapshot after it already shows the next game, so count it directly.
    const squashPoints =
      gameFinished || setFinished || after.currentGame?.kind !== "squash"
        ? undefined
        : after.currentGame.points;
    const { a, b } = scoreAfterRally(current, event.winner, squashPoints);
    const handOut =
      config.sport === "squash" &&
      config.squashMode === "hiho" &&
      before.servingTeam !== undefined &&
      event.winner !== before.servingTeam;
    open = {
      setNumber: current.setNumber,
      a,
      b,
      steps: [...current.steps, { t: event.at, lead: a - b, winner: event.winner, handOut }],
    };
    previousTotalGames = after.totalGames;
    previousSetCount = after.completedSets.length;

    // Close AFTER the rally lands on it: the final point of a game belongs
    // to that game, not to a phantom follow-up series.
    if (open.steps.length > 0 && (gameFinished || setFinished)) {
      closeGame(open, games);
      open = undefined;
    }
  });

  if (open !== undefined) {
    closeGame(open, games);
  }
  return games;
}
