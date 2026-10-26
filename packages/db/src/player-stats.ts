import type { TeamId } from "@holy-padel/scoring";
import type { SqlDriver } from "./driver.ts";
import type { MatchSummary } from "./match-types.ts";
import { listMatches } from "./matches.ts";
import type { Outcome, WinLoss } from "./profile.ts";
import { outcomeFor } from "./profile.ts";

/** One finished match the player took part in alongside the owner. */
export interface MatchTogether {
  readonly id: string;
  readonly startedAt: number;
  readonly scoreLine: string | undefined;
  /** From the player's perspective. */
  readonly outcome: Outcome;
}

export interface PlayerStats {
  readonly played: number;
  readonly record: WinLoss;
  /** 0-100, rounded. */
  readonly winRatePercent: number;
  /** Most recent finished matches first. */
  readonly form: readonly Outcome[];
  /** Record in matches partnering the owner. */
  readonly withOwner: WinLoss;
  /** Record when facing the owner's team, from the player's perspective. */
  readonly againstOwner: WinLoss;
  /** Matches partnering the owner, most recent first. */
  readonly matchesTogether: readonly MatchTogether[];
}

const FORM_LENGTH = 5;
const PERCENT = 100;

interface PlayerResult {
  readonly match: MatchSummary;
  readonly playerTeam: TeamId;
  readonly outcome: Outcome;
}

function teamOf(match: MatchSummary, playerId: string): TeamId | undefined {
  if (match.players.A.includes(playerId)) {
    return "A";
  }
  return match.players.B.includes(playerId) ? "B" : undefined;
}

function playerResults(matches: readonly MatchSummary[], playerId: string): PlayerResult[] {
  const results: PlayerResult[] = [];
  for (const match of matches) {
    const playerTeam = teamOf(match, playerId);
    if (match.status === "finished" && playerTeam !== undefined) {
      results.push({ match, playerTeam, outcome: outcomeFor(match.winner, playerTeam) });
    }
  }
  return results;
}

/** Won, lost and drew counts; draws are played but neither a win nor a loss. */
function recordOf(results: readonly PlayerResult[]): WinLoss {
  let won = 0;
  let lost = 0;
  let drew = 0;
  for (const result of results) {
    if (result.outcome === "won") {
      won += 1;
    } else if (result.outcome === "lost") {
      lost += 1;
    } else {
      drew += 1;
    }
  }
  return { won, lost, drew };
}

/**
 * Everything a player's profile screen shows, computed from the local match
 * database — the per-player counterpart of `computeProfileStats`.
 */
export function computePlayerStats(
  driver: SqlDriver,
  playerId: string,
  ownerId: string,
): PlayerStats {
  const results = playerResults(listMatches(driver), playerId);
  const record = recordOf(results);
  const byRecency = [...results].sort(
    (left, right) => (right.match.endedAt ?? 0) - (left.match.endedAt ?? 0),
  );
  const withOwnerResults = results.filter((result) =>
    result.match.players[result.playerTeam].includes(ownerId),
  );
  const againstOwnerResults = results.filter((result) => {
    const opponentTeam: TeamId = result.playerTeam === "A" ? "B" : "A";
    return result.match.players[opponentTeam].includes(ownerId);
  });
  return {
    played: results.length,
    record,
    winRatePercent: results.length === 0 ? 0 : Math.round((record.won / results.length) * PERCENT),
    form: byRecency.slice(0, FORM_LENGTH).map((result) => result.outcome),
    withOwner: recordOf(withOwnerResults),
    againstOwner: recordOf(againstOwnerResults),
    matchesTogether: withOwnerResults
      .sort((left, right) => (right.match.endedAt ?? 0) - (left.match.endedAt ?? 0))
      .map((result) => ({
        id: result.match.id,
        startedAt: result.match.startedAt,
        scoreLine: result.match.scoreLine,
        outcome: result.outcome,
      })),
  };
}
