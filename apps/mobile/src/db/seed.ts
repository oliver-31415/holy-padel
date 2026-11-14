import type {
  CourtSide,
  HeartRateSample,
  MotionSample,
  SqlDriver,
  TeamPlayers,
} from "@holy-padel/db";
import {
  appendEvents,
  countMatches,
  createMatch,
  createPlayer,
  finishMatch,
  getMatch,
  inTransaction,
  listPlayers,
  saveMatchHeartRate,
  saveMatchMotion,
} from "@holy-padel/db";
import type { MatchConfig, PointEvent, TeamId } from "@holy-padel/scoring";
import { computeMatch } from "@holy-padel/scoring";

const MINUTE_MS = 60_000;
const DAY_MS: number = 24 * 60 * MINUTE_MS;
const SECONDS_PER_POINT = 35;

interface SetPlan {
  /** Games for the set winner and loser IN TEAM ORDER, e.g. [6, 3]. */
  readonly games: readonly [number, number];
  /** Tie-break points when the set went to 6-6 (or a super tie-break). */
  readonly tieBreak?: readonly [number, number];
  readonly superTieBreak?: boolean;
}

interface MatchPlan {
  readonly id: string;
  readonly daysAgo: number;
  readonly partner: string;
  readonly opponents: readonly [string, string];
  readonly sets: readonly SetPlan[];
  readonly location?: string;
  readonly config?: Partial<MatchConfig>;
}

/** Interleave game/point winners so the sequence ends on the winner. */
function interleave(winnerCount: number, loserCount: number, winner: TeamId): TeamId[] {
  const loser: TeamId = winner === "A" ? "B" : "A";
  const sequence: TeamId[] = [];
  let winnersLeft = winnerCount - 1;
  let losersLeft = loserCount;
  while (winnersLeft > 0 || losersLeft > 0) {
    if (winnersLeft > 0) {
      sequence.push(winner);
      winnersLeft -= 1;
    }
    if (losersLeft > 0) {
      sequence.push(loser);
      losersLeft -= 1;
    }
  }
  sequence.push(winner);
  return sequence;
}

/** Expand a set plan into rally winners (love games; tie-breaks point by point). */
function setPoints(plan: SetPlan): TeamId[] {
  const [gamesA, gamesB] = plan.games;
  const winner: TeamId = gamesA > gamesB ? "A" : "B";
  if (plan.superTieBreak === true) {
    const [pointsA, pointsB] = plan.games;
    return winner === "A" ? interleave(pointsA, pointsB, "A") : interleave(pointsB, pointsA, "B");
  }
  const points: TeamId[] = [];
  if (plan.tieBreak === undefined) {
    const winnerGames = winner === "A" ? gamesA : gamesB;
    const loserGames = winner === "A" ? gamesB : gamesA;
    for (const game of interleave(winnerGames, loserGames, winner)) {
      points.push(game, game, game, game);
    }
    return points;
  }
  // 6-6 first (alternating games), then the tie-break points.
  for (let index = 0; index < 6; index += 1) {
    points.push("A", "A", "A", "A", "B", "B", "B", "B");
  }
  const [tieBreakA, tieBreakB] = plan.tieBreak;
  const tieBreakPoints =
    winner === "A" ? interleave(tieBreakA, tieBreakB, "A") : interleave(tieBreakB, tieBreakA, "B");
  return [...points, ...tieBreakPoints];
}

/**
 * A repeatable wobble on each point's time, up to 18 s late, so the demo's
 * rallies run long and short instead of all lasting exactly `SECONDS_PER_POINT`.
 */
function wobbleMs(index: number): number {
  return ((index * index * 7 + index * 3) % 13) * 1500;
}

function planEvents(plans: readonly SetPlan[], startedAt: number): PointEvent[] {
  const winners = plans.flatMap(setPoints);
  return winners.map((winner, index) => ({
    winner,
    at: startedAt + index * SECONDS_PER_POINT * 1000 + wobbleMs(index),
  }));
}

function scoreLineOf(plans: readonly SetPlan[]): string {
  return plans.map((plan) => plan.games.join("-")).join(" · ");
}

const DEFAULT_CONFIG: MatchConfig = {
  bestOf: 3,
  deuceMode: "advantage",
  thirdSet: "superTieBreak",
  firstServe: "A",
};

const ROSTER: readonly {
  readonly id: string;
  readonly name: string;
  readonly club?: string;
  readonly side: CourtSide;
}[] = [
  { id: "javi", name: "Javi", club: "Club Padel Norte", side: "right" },
  { id: "marta", name: "Marta", club: "Club Padel Norte", side: "left" },
  { id: "leo", name: "Leo", side: "right" },
  { id: "ana", name: "Ana", club: "Club Río Sur", side: "left" },
  { id: "pablo", name: "Pablo", side: "left" },
  { id: "carla", name: "Carla", club: "Club Río Sur", side: "right" },
  { id: "hugo", name: "Hugo", side: "left" },
];

/**
 * Twelve finished matches (8-4 with Javi mostly, like the design's profile)
 * plus the live match from the home screen: set 1 taken 6-4, 4-3 up in set 2,
 * 40-30 on the current game — game point, Nico & Javi serving.
 */
const FINISHED: readonly MatchPlan[] = [
  {
    id: "seed-12",
    daysAgo: 3,
    partner: "javi",
    opponents: ["marta", "leo"],
    sets: [{ games: [6, 3] }, { games: [7, 6], tieBreak: [7, 4] }],
  },
  {
    id: "seed-11",
    daysAgo: 6,
    partner: "javi",
    opponents: ["ana", "pablo"],
    sets: [{ games: [4, 6] }, { games: [6, 7], tieBreak: [5, 7] }],
  },
  {
    id: "seed-10",
    daysAgo: 9,
    partner: "javi",
    opponents: ["ana", "pablo"],
    sets: [{ games: [7, 5] }, { games: [2, 6] }, { games: [10, 7], superTieBreak: true }],
  },
  {
    id: "seed-09",
    daysAgo: 12,
    partner: "javi",
    opponents: ["carla", "hugo"],
    sets: [{ games: [6, 2] }, { games: [6, 4] }],
  },
  {
    id: "seed-08",
    daysAgo: 16,
    partner: "javi",
    opponents: ["marta", "leo"],
    sets: [{ games: [6, 4] }, { games: [7, 5] }],
  },
  {
    id: "seed-07",
    daysAgo: 20,
    partner: "ana",
    opponents: ["marta", "leo"],
    sets: [{ games: [3, 6] }, { games: [4, 6] }],
  },
  {
    id: "seed-06",
    daysAgo: 23,
    partner: "javi",
    opponents: ["ana", "pablo"],
    sets: [{ games: [6, 3] }, { games: [6, 4] }],
  },
  {
    id: "seed-05",
    daysAgo: 27,
    partner: "javi",
    opponents: ["marta", "leo"],
    sets: [{ games: [7, 6], tieBreak: [7, 5] }, { games: [6, 4] }],
  },
  {
    id: "seed-04",
    daysAgo: 31,
    partner: "javi",
    opponents: ["marta", "leo"],
    sets: [{ games: [6, 7], tieBreak: [4, 7] }, { games: [5, 7] }],
  },
  {
    id: "seed-03",
    daysAgo: 35,
    partner: "javi",
    opponents: ["marta", "leo"],
    sets: [{ games: [6, 2] }, { games: [6, 3] }],
  },
  {
    id: "seed-02",
    daysAgo: 39,
    partner: "javi",
    opponents: ["ana", "pablo"],
    sets: [{ games: [6, 4] }, { games: [3, 6] }, { games: [10, 8], superTieBreak: true }],
  },
  {
    id: "seed-01",
    daysAgo: 43,
    partner: "javi",
    opponents: ["marta", "leo"],
    sets: [{ games: [4, 6] }, { games: [2, 6] }],
  },
];

function seedFinishedMatch(driver: SqlDriver, plan: MatchPlan, now: number): void {
  const startedAt = now - plan.daysAgo * DAY_MS;
  const players: TeamPlayers = {
    A: ["nico", plan.partner],
    B: [plan.opponents[0], plan.opponents[1]],
  };
  // The spread widens optional keys to `| undefined`, which
  // exactOptionalPropertyTypes rejects — seed plans only ever tighten
  // the default config, so the cast is safe.
  const config = { ...DEFAULT_CONFIG, ...plan.config } as MatchConfig;
  const match = {
    id: plan.id,
    config,
    players,
    startedAt,
    location: plan.location ?? "Club Padel Norte",
  };
  createMatch(driver, match);
  const events = planEvents(plan.sets, startedAt);
  appendEvents(driver, plan.id, events);
  const snapshot = computeMatch(config, events);
  if (!snapshot.finished || snapshot.winner === undefined) {
    throw new Error(`seed match ${plan.id} did not finish as planned`);
  }
  const lastEvent = events.at(-1);
  finishMatch(driver, plan.id, {
    winner: snapshot.winner,
    endedAt: lastEvent === undefined ? startedAt : lastEvent.at,
    scoreLine: scoreLineOf(plan.sets),
  });
}

const HR_STEP_MS = 5000;
const MOTION_STEP_MS = 10_000;

/**
 * Watch data for the latest finished match, so the demo shows the heart-rate
 * curve and per-game steps/distance. Deterministic waves, not random noise,
 * so screenshots and e2e assertions stay stable.
 */
function seedWatchData(driver: SqlDriver, matchId: string, baseBpm = 138): void {
  const match = getMatch(driver, matchId);
  if (match?.endedAt === undefined) {
    return;
  }
  const { startedAt, endedAt } = match;
  const heartRate: HeartRateSample[] = [];
  for (let t = startedAt; t <= endedAt; t += HR_STEP_MS) {
    const minutes = (t - startedAt) / MINUTE_MS;
    const bpm = baseBpm + 14 * Math.sin(minutes / 2.3) + 6 * Math.sin(minutes * 1.7);
    heartRate.push({ t, bpm: Math.round(bpm) });
  }
  const motion: MotionSample[] = [];
  for (let t = startedAt + MOTION_STEP_MS; t <= endedAt; t += MOTION_STEP_MS) {
    const steps = Math.round(13 + 6 * Math.sin((t - startedAt) / 47_000));
    motion.push({ t, steps, meters: Math.round(steps * 6.8) / 10 });
  }
  saveMatchHeartRate(driver, matchId, heartRate);
  saveMatchMotion(driver, matchId, motion);
}

function seedLiveMatch(driver: SqlDriver, now: number): void {
  const startedAt = now - 47 * MINUTE_MS;
  createMatch(driver, {
    id: "seed-live",
    config: DEFAULT_CONFIG,
    players: { A: ["nico", "javi"], B: ["marta", "leo"] },
    location: "Club Padel Norte",
    startedAt,
  });
  // Set 1 6-4, set 2 games 4-3, current game 40-30: game point Nico & Javi.
  const setOne: SetPlan = { games: [6, 4] };
  const gameWinners = interleave(4, 3, "A");
  const winners = [
    ...setPoints(setOne),
    ...gameWinners.flatMap((game): TeamId[] => [game, game, game, game]),
    "A",
    "A",
    "B",
    "B",
    "A",
  ] as const;
  appendEvents(
    driver,
    "seed-live",
    winners.map((winner, index) => ({
      winner,
      at: startedAt + index * SECONDS_PER_POINT * 1000,
    })),
  );
}

/** First launch: install the owner, the roster and the design's demo ledger. */
export function seedIfEmpty(driver: SqlDriver): void {
  if (listPlayers(driver).length > 0 || countMatches(driver) > 0) {
    return;
  }
  const now = Date.now();
  // One transaction: atomic, and orders of magnitude faster than ~900
  // individually committed inserts (the web OPFS backend pays I/O per commit).
  inTransaction(driver, () => {
    let createdAt = now - 100 * DAY_MS;
    createPlayer(driver, {
      id: "nico",
      name: "Nico",
      club: "Club Padel Norte",
      side: "left",
      isOwner: true,
      createdAt,
    });
    for (const entry of ROSTER) {
      createdAt += MINUTE_MS;
      createPlayer(driver, {
        id: entry.id,
        name: entry.name,
        createdAt,
        side: entry.side,
        ...(entry.club === undefined ? {} : { club: entry.club }),
      });
    }
    for (const plan of FINISHED) {
      seedFinishedMatch(driver, plan, now);
    }
    // Four tracked matches give the Stats trend something to draw.
    seedWatchData(driver, "seed-09", 133);
    seedWatchData(driver, "seed-10", 144);
    seedWatchData(driver, "seed-11", 129);
    seedWatchData(driver, "seed-12");
    seedLiveMatch(driver, now);
  });
}
