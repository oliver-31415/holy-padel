import type { HeartRateSample } from "@holy-padel/db";
import type { TeamValues } from "@holy-padel/scoring";
import type { GameSeriesStep } from "@/lib/game-series.ts";

/** Most figures one readout row holds across a 375 px card. */
const MAX_CELLS = 4;
/** How far either side of a rally a heart-rate reading may sit and still stand for it. */
const BPM_TOLERANCE_MS = 30_000;

/** What the scrub readout says about the rally the cursor is on. */
export interface ScrubReadout {
  /** The name of the team that served the rally; omitted when the engine has no server. */
  readonly serving?: string;
  /** True when the rally was a hand-out: the receiver won it, so the serve passed on. */
  readonly handOut?: boolean;
  /** The label over the points cell: GAME for padel, POINTS for squash. */
  readonly pointsLabel: string;
  /** The in-game points once the rally is settled, as "4–1". */
  readonly points: string;
  /** The label over the games cell: SET for padel, GAMES for squash (which has no sets). */
  readonly gamesLabel: string;
  /** Games each team holds in the set once the rally is settled, as "2–1"; omitted to fit the row. */
  readonly games?: string;
  /** The smoothed heart rate near the rally, as "142", or "–" when no reading is near it. */
  readonly bpm?: string;
  /** Time into the game when the rally was settled, as "3:12"; omitted to fit the row. */
  readonly elapsed?: string;
}

/** What a readout needs beyond the rally itself. */
export interface ScrubContext {
  readonly names: TeamValues<string>;
  /** Start of the game's window, the origin of the elapsed time. */
  readonly startedAt: number;
  /** The smoothed heart-rate readings the chart draws across the game; omitted when the match has none. */
  readonly heartRate?: readonly HeartRateSample[];
  /** The set count the game opened on, so a rally that moves it can be told apart. */
  readonly openingSetGames: TeamValues<number>;
  /** True for squash, which has no sets: its cells read POINTS and GAMES. */
  readonly squash?: boolean;
}

/**
 * The index of the rally whose x sits nearest a touch at `x`, or undefined for a
 * game with no rallies. A tie goes to the earlier rally.
 */
export function nearestStep(
  steps: readonly GameSeriesStep[],
  xOf: (t: number) => number,
  x: number,
): number | undefined {
  let nearest: number | undefined;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (const [index, step] of steps.entries()) {
    const distance = Math.abs(xOf(step.t) - x);
    if (distance < nearestDistance) {
      nearest = index;
      nearestDistance = distance;
    }
  }
  return nearest;
}

/** The set count a game opens on: the count after its first rally, which cannot end it. */
export function openingSetGames(steps: readonly GameSeriesStep[]): TeamValues<number> {
  return steps[0]?.setGames ?? { A: 0, B: 0 };
}

/** "3:07" — minutes and seconds into the game. */
export function clockLabel(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  return `${String(Math.floor(total / 60))}:${String(total % 60).padStart(2, "0")}`;
}

/** The reading nearest `t`, if one lies within tolerance; the readings need not be sorted. */
export function nearestBpm(readings: readonly HeartRateSample[], t: number): number | undefined {
  let nearest: HeartRateSample | undefined;
  for (const reading of readings) {
    if (nearest === undefined || Math.abs(reading.t - t) < Math.abs(nearest.t - t)) {
      nearest = reading;
    }
  }
  return nearest !== undefined && Math.abs(nearest.t - t) <= BPM_TOLERANCE_MS
    ? nearest.bpm
    : undefined;
}

function pair(values: TeamValues<number>): string {
  return `${String(values.A)}–${String(values.B)}`;
}

/**
 * The readout for one rally. Four cells fit a row: GAME and IN GAME always, with
 * SERVING and BPM when the engine names a server and the match has heart rate.
 * A fifth cell gives way to SET while the set count holds through the game, and
 * to the elapsed time once SET has moved (the closing rally of a game).
 */
export function scrubReadout(step: GameSeriesStep, context: ScrubContext): ScrubReadout {
  const { names, startedAt, heartRate, openingSetGames: opening, squash } = context;
  const serving = step.serving === undefined ? undefined : names[step.serving];
  const bpm = heartRate === undefined ? undefined : nearestBpm(heartRate, step.t);
  const setMoved = step.setGames.A !== opening.A || step.setGames.B !== opening.B;
  const others = 1 + (serving === undefined ? 0 : 1) + (heartRate === undefined ? 0 : 1);
  const showGames = setMoved || others + 2 <= MAX_CELLS;
  const showElapsed = others + (showGames ? 1 : 0) + 1 <= MAX_CELLS;
  return {
    ...(serving === undefined ? {} : { serving }),
    ...(step.handOut ? { handOut: true } : {}),
    pointsLabel: squash === true ? "POINTS" : "GAME",
    points: pair(step.points),
    gamesLabel: squash === true ? "GAMES" : "SET",
    ...(showGames ? { games: pair(step.setGames) } : {}),
    ...(heartRate === undefined ? {} : { bpm: bpm === undefined ? "–" : String(Math.round(bpm)) }),
    ...(showElapsed ? { elapsed: clockLabel(step.t - startedAt) } : {}),
  };
}
