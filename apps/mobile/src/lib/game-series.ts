import type {
  MatchConfig,
  MatchSnapshot,
  PointEvent,
  TeamId,
  TeamValues,
} from "@holy-padel/scoring";
import { replayMatch } from "@holy-padel/scoring";

/**
 * A pickleball server call: the team read first (omitted at 0-0 before the
 * first serve) and the server number (omitted in singles, which has none).
 */
export interface PickleballCall {
  readonly team?: TeamId;
  readonly serverNumber?: 1 | 2;
}

/** One point inside a game: when it was played and the lead after it. */
export interface GameSeriesStep {
  readonly t: number;
  /** Points for team A minus points for team B, within the game. */
  readonly lead: number;
  /** The team that won the rally (a hand-out is won by the receiver). */
  readonly winner: TeamId;
  /**
   * True when the serve passed on the rally: a squash HI-HO rally won by the
   * receiver, or any pickleball side-out. Marked on the score-race chart so
   * serve stretches read as plateaus between markers. Padel and PAR never set it.
   */
  readonly handOut: boolean;
  /** The team serving the rally; omitted when the engine has no server for it. */
  readonly serving?: TeamId;
  /** The in-game points once the rally is settled, for the scrub readout. */
  readonly points: TeamValues<number>;
  /** Games each team holds in the set once the rally is settled, for the scrub readout. */
  readonly setGames: TeamValues<number>;
  /**
   * Pickleball only, once the rally settles and its game is still open: the
   * server call behind the readout's "1–0–2". Omitted for other sports and
   * when the game or set just ended.
   */
  readonly call?: PickleballCall;
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

/** The in-game score after a rally: the engine's game points when it gives them, else a count. */
function scoreAfterRally(
  current: OpenGame,
  winner: TeamId,
  enginePoints: TeamValues<number> | undefined,
): { readonly a: number; readonly b: number } {
  if (enginePoints !== undefined) {
    return { a: enginePoints.A, b: enginePoints.B };
  }
  return {
    a: current.a + (winner === "A" ? 1 : 0),
    b: current.b + (winner === "B" ? 1 : 0),
  };
}

/**
 * The engine's in-game points after a rally. Squash and pickleball keep them
 * in the engine (pickleball only scores on the serving team's rallies, so a
 * count would be wrong). Once a game ends, pickleball's final points sit on the
 * set it completed; other games fall back to a count.
 */
function enginePointsAfter(after: MatchSnapshot, settled: boolean): TeamValues<number> | undefined {
  if (after.currentGame?.kind === "pickleball") {
    return settled ? after.completedSets.at(-1)?.games : after.currentGame.points;
  }
  return settled || after.currentGame?.kind !== "squash" ? undefined : after.currentGame.points;
}

/** The pickleball server call after a rally, while its game is still open. */
function callAfter(after: MatchSnapshot, settled: boolean): PickleballCall | undefined {
  const game = after.currentGame;
  if (settled || game?.kind !== "pickleball") {
    return;
  }
  return {
    ...(after.servingTeam === undefined ? {} : { team: after.servingTeam }),
    ...(game.serverNumber === undefined ? {} : { serverNumber: game.serverNumber }),
  };
}

/**
 * A rally that passes the serve: a squash HI-HO rally won by the receiver, or
 * any pickleball rally the serving team loses (a side-out, including the first
 * server's loss in doubles).
 */
function isHandOut(config: MatchConfig, servingTeam: TeamId | undefined, winner: TeamId): boolean {
  if (servingTeam === undefined) {
    return false;
  }
  if (config.sport === "pickleball") {
    return winner !== servingTeam;
  }
  return config.sport === "squash" && config.squashMode === "hiho" && winner !== servingTeam;
}

/** The set's games per team once a rally settles: a game-ending rally adds one to its winner. */
function setGamesAfter(
  before: TeamValues<number>,
  winner: TeamId,
  gameFinished: boolean,
): TeamValues<number> {
  return {
    A: before.A + (gameFinished && winner === "A" ? 1 : 0),
    B: before.B + (gameFinished && winner === "B" ? 1 : 0),
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
    const settled = gameFinished || setFinished;

    if (open === undefined) {
      open = { setNumber: before.setNumber, a: 0, b: 0, steps: [] };
    }
    const current: OpenGame = open;
    // Squash HI-HO awards no point to a receiver's rally, and pickleball only
    // scores on the serving team's rallies, so the lead must come from the
    // engine's game points rather than from counting winners. A squash
    // game-ending rally always scores, so counting it directly is exact.
    const { a, b } = scoreAfterRally(current, event.winner, enginePointsAfter(after, settled));
    const call = callAfter(after, settled);
    // A game-ending rally adds to the set's games for its winner; the set's last
    // game counts too, so the readout shows the set's final games.
    const serving = before.servingTeam === undefined ? {} : { serving: before.servingTeam };
    open = {
      setNumber: current.setNumber,
      a,
      b,
      steps: [
        ...current.steps,
        {
          t: event.at,
          lead: a - b,
          winner: event.winner,
          handOut: isHandOut(config, before.servingTeam, event.winner),
          ...serving,
          points: { A: a, B: b },
          setGames: setGamesAfter(before.currentSetGames, event.winner, gameFinished),
          ...(call === undefined ? {} : { call }),
        },
      ],
    };
    previousTotalGames = after.totalGames;
    previousSetCount = after.completedSets.length;

    // Close AFTER the rally lands on it: the final point of a game belongs
    // to that game, not to a phantom follow-up series.
    if (open.steps.length > 0 && settled) {
      closeGame(open, games);
      open = undefined;
    }
  });

  if (open !== undefined) {
    closeGame(open, games);
  }
  return games;
}
