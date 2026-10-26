import type { TeamId } from "@holy-padel/scoring";
import { computeMatch } from "@holy-padel/scoring";
import type { SqlDriver } from "./driver.ts";
import type { MatchSummary } from "./match-types.ts";
import { listMatches, loadEvents } from "./matches.ts";

/** How a finished match went for one team. A level early stop is a draw. */
export type Outcome = "won" | "lost" | "drew";

/** The owner's (or a player's) result in a finished match, from their team's side. */
export function outcomeFor(winner: TeamId | undefined, team: TeamId): Outcome {
  if (winner === undefined) {
    return "drew";
  }
  return winner === team ? "won" : "lost";
}

export interface WinLoss {
  readonly won: number;
  readonly lost: number;
  /** Level early stops — played, but neither a win nor a loss. */
  readonly drew: number;
}

export interface PartnerRecord extends WinLoss {
  readonly playerId: string;
  readonly name: string;
}

export interface HeadToHeadRecord extends WinLoss {
  /** Opponent pair label, e.g. "Marta & Leo" (names sorted by first appearance). */
  readonly label: string;
}

export interface ProfileStats {
  readonly played: number;
  readonly record: WinLoss;
  /** 0-100, rounded — the design shows "67%". */
  readonly winRatePercent: number;
  /** Most recent finished matches first. */
  readonly form: readonly Outcome[];
  /** The run the owner is on right now (undefined with no finished matches). */
  readonly streak: { readonly kind: "won" | "lost"; readonly count: number } | undefined;
  /** Longest winning run across all finished matches. */
  readonly bestWinStreak: number;
  /** Pause-adjusted play time across finished matches, and its average. */
  readonly totalDurationMs: number;
  readonly avgDurationMs: number;
  /** Won–lost per sport, for the by-sport record card. */
  readonly recordsBySport: {
    readonly padel: WinLoss;
    readonly squash: WinLoss;
    readonly pickleball: WinLoss;
  };
  readonly partners: readonly PartnerRecord[];
  readonly headToHead: readonly HeadToHeadRecord[];
}

const FORM_LENGTH = 5;
const PERCENT = 100;

/** "Marta & Leo" — duplicated singles slots collapse to one name. */
function pairText(names: readonly (string | undefined)[]): string {
  const seen: string[] = [];
  for (const name of names) {
    if (name !== undefined && !seen.includes(name)) {
      seen.push(name);
    }
  }
  return seen.join(" & ");
}

/** Pause-adjusted play time of a finished match (open pauses are closed on finish). */
function matchDurationMs(match: MatchSummary): number {
  if (match.endedAt === undefined) {
    return 0;
  }
  return Math.max(0, match.endedAt - match.startedAt - match.pausedMs);
}

/** Consecutive wins/losses starting at the most recent result; a draw breaks the run. */
function currentStreakOf(
  byRecency: readonly OwnedResult[],
): { kind: "won" | "lost"; count: number } | undefined {
  const [first] = byRecency;
  if (first === undefined || first.outcome === "drew") {
    return;
  }
  const kind = first.outcome;
  let count = 0;
  for (const result of byRecency) {
    if (result.outcome !== kind) {
      break;
    }
    count += 1;
  }
  return { kind, count };
}

/** Longest run of wins, oldest to newest. */
function bestWinStreakOf(chronological: readonly OwnedResult[]): number {
  let best = 0;
  let run = 0;
  for (const result of chronological) {
    run = result.outcome === "won" ? run + 1 : 0;
    best = Math.max(best, run);
  }
  return best;
}

function ownerTeamOf(match: MatchSummary, ownerId: string): TeamId | undefined {
  if (match.players.A.includes(ownerId)) {
    return "A";
  }
  return match.players.B.includes(ownerId) ? "B" : undefined;
}

interface OwnedResult {
  readonly match: MatchSummary;
  readonly ownerTeam: TeamId;
  readonly outcome: Outcome;
}

interface MutableWinLoss {
  won: number;
  lost: number;
  drew: number;
}

function emptyTally(): MutableWinLoss {
  return { won: 0, lost: 0, drew: 0 };
}

function tally(record: MutableWinLoss, outcome: Outcome): void {
  if (outcome === "won") {
    record.won += 1;
  } else if (outcome === "lost") {
    record.lost += 1;
  } else {
    record.drew += 1;
  }
}

function finishedResults(matches: readonly MatchSummary[], ownerId: string): OwnedResult[] {
  const results: OwnedResult[] = [];
  for (const match of matches) {
    const ownerTeam = ownerTeamOf(match, ownerId);
    if (match.status === "finished" && ownerTeam !== undefined) {
      results.push({ match, ownerTeam, outcome: outcomeFor(match.winner, ownerTeam) });
    }
  }
  return results;
}

function partnerRecords(results: readonly OwnedResult[], ownerId: string): PartnerRecord[] {
  const byPartner = new Map<string, { name: string } & MutableWinLoss>();
  for (const { match, ownerTeam, outcome } of results) {
    const ids = match.players[ownerTeam];
    const names = match.names[ownerTeam];
    const partnerIndex = ids[0] === ownerId ? 1 : 0;
    const partnerId = ids[partnerIndex];
    const partnerName = names[partnerIndex];
    // Legacy rows may repeat the owner in both slots — that's not a partner.
    if (partnerId !== undefined && partnerName !== undefined && partnerId !== ownerId) {
      const entry = byPartner.get(partnerId) ?? { name: partnerName, ...emptyTally() };
      tally(entry, outcome);
      byPartner.set(partnerId, entry);
    }
  }
  return [...byPartner.entries()]
    .map(([playerId, entry]) => ({ playerId, ...entry }))
    .sort((left, right) => playedOf(right) - playedOf(left));
}

function headToHeadRecords(results: readonly OwnedResult[]): HeadToHeadRecord[] {
  const byOpponents = new Map<string, { label: string } & MutableWinLoss>();
  for (const { match, ownerTeam, outcome } of results) {
    const opponentTeam: TeamId = ownerTeam === "A" ? "B" : "A";
    const label = pairText(match.names[opponentTeam]);
    const key = [...match.players[opponentTeam]]
      .filter((p): p is string => p !== undefined)
      .sort()
      .join("+");
    const entry = byOpponents.get(key) ?? { label, ...emptyTally() };
    tally(entry, outcome);
    byOpponents.set(key, entry);
  }
  return [...byOpponents.values()].sort((left, right) => playedOf(right) - playedOf(left));
}

/** Every finished match counts as played, draws included. */
function playedOf(record: WinLoss): number {
  return record.won + record.lost + record.drew;
}

/**
 * Everything the profile tab shows, computed from the local match database
 * ("records computed from local match DB" in the design).
 */
export function computeProfileStats(driver: SqlDriver, ownerId: string): ProfileStats {
  const results = finishedResults(listMatches(driver), ownerId);
  const record = emptyTally();
  for (const result of results) {
    tally(record, result.outcome);
  }
  const byRecency = [...results].sort(
    (left, right) => (right.match.endedAt ?? 0) - (left.match.endedAt ?? 0),
  );
  const chronological = [...byRecency].reverse();
  const totalDurationMs = results.reduce((sum, result) => sum + matchDurationMs(result.match), 0);
  const bySportRecords: Record<"padel" | "squash" | "pickleball", MutableWinLoss> = {
    padel: emptyTally(),
    squash: emptyTally(),
    pickleball: emptyTally(),
  };
  for (const result of results) {
    tally(bySportRecords[result.match.config.sport ?? "padel"], result.outcome);
  }
  return {
    played: results.length,
    record,
    winRatePercent: results.length === 0 ? 0 : Math.round((record.won / results.length) * PERCENT),
    form: byRecency.slice(0, FORM_LENGTH).map((result) => result.outcome),
    streak: currentStreakOf(byRecency),
    bestWinStreak: bestWinStreakOf(chronological),
    totalDurationMs,
    avgDurationMs: results.length === 0 ? 0 : Math.round(totalDurationMs / results.length),
    recordsBySport: bySportRecords,
    partners: partnerRecords(results, ownerId),
    headToHead: headToHeadRecords(results),
  };
}

/** Points scored by the owner's teams and by their opponents. */
export interface PointsTotals {
  readonly for: number;
  readonly against: number;
}

export interface LifetimePoints extends PointsTotals {
  readonly bySport: {
    readonly padel: PointsTotals;
    readonly squash: PointsTotals;
    readonly pickleball: PointsTotals;
  };
}

const EMPTY_SPORT: () => { for: number; against: number } = () => ({ for: 0, against: 0 });

/**
 * Lifetime points scored for and against the owner across every finished
 * match, overall and per sport — replayed from the event ledgers.
 */
export function computePointsTotals(driver: SqlDriver, ownerId: string): LifetimePoints {
  const padel = EMPTY_SPORT();
  const squash = EMPTY_SPORT();
  const pickleball = EMPTY_SPORT();
  let forTotal = 0;
  let againstTotal = 0;
  const bySport: Record<"padel" | "squash" | "pickleball", { for: number; against: number }> = {
    padel,
    squash,
    pickleball,
  };
  for (const match of listMatches(driver)) {
    if (match.status !== "finished") {
      continue;
    }
    const ownerTeam = ownerTeamOf(match, ownerId);
    if (ownerTeam === undefined) {
      continue;
    }
    const { totalPoints } = computeMatch(match.config, loadEvents(driver, match.id));
    const scored: PointsTotals = {
      for: totalPoints[ownerTeam],
      against: totalPoints[ownerTeam === "A" ? "B" : "A"],
    };
    forTotal += scored.for;
    againstTotal += scored.against;
    const sport = bySport[match.config.sport ?? "padel"];
    sport.for += scored.for;
    sport.against += scored.against;
  }
  return { for: forTotal, against: againstTotal, bySport };
}
