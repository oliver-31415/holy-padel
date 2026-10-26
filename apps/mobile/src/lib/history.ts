import type { MatchSummary } from "@holy-padel/db";
import type { TeamId } from "@holy-padel/scoring";

/**
 * Day-by-day win/loss history for the home screen's activity grid — the same
 * "last N weeks" rectangle of days GitHub uses, but for matches.
 */

export interface DayCell {
  /** Local midnight timestamp for the day. */
  readonly day: number;
  /** Days after today render as nothing, so the grid ends at today. */
  readonly future: boolean;
  readonly today: boolean;
  readonly played: number;
  readonly won: number;
  readonly lost: number;
  /** Level early stops — played, but neither a win nor a loss. */
  readonly drew: number;
}

export interface History {
  /** Columns of 7 (oldest first), each cell a local day. */
  readonly weeks: readonly (readonly DayCell[])[];
  readonly played: number;
  readonly won: number;
  readonly lost: number;
  readonly drew: number;
}

const DAYS_PER_WEEK = 7;
const MS_PER_DAY = 86_400_000;

/** Local midnight of `timestamp` — the key matches are grouped by. */
export function midnightOf(timestamp: number): number {
  const date = new Date(timestamp);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

/**
 * Group the owner's finished matches by local day and lay out the last
 * `weeks` calendar weeks ending with the current one (future days stay
 * empty so the grid ends at today).
 */
export function computeHistory(
  matches: readonly MatchSummary[],
  ownerId: string,
  now: number,
  weeks = 6,
): History {
  const byDay = new Map<number, { played: number; won: number; lost: number; drew: number }>();
  const playedByOwner = matches.filter((match) => ownerTeamIn(match, ownerId) !== undefined);
  for (const match of playedByOwner) {
    const ownerTeam = ownerTeamIn(match, ownerId) ?? "A";
    const day = midnightOf(match.startedAt);
    const entry = byDay.get(day) ?? { played: 0, won: 0, lost: 0, drew: 0 };
    entry.played += 1;
    if (match.winner === undefined) {
      entry.drew += 1;
    } else if (match.winner === ownerTeam) {
      entry.won += 1;
    } else {
      entry.lost += 1;
    }
    byDay.set(day, entry);
  }

  const today = midnightOf(now);
  // End the grid on the current week's Saturday so columns align.
  const endOfWeek = today + (6 - new Date(today).getDay()) * MS_PER_DAY;
  const gridStart = endOfWeek - (weeks * DAYS_PER_WEEK - 1) * MS_PER_DAY;

  const cells: DayCell[] = [];
  let played = 0;
  let won = 0;
  let lost = 0;
  let drew = 0;
  for (let day = gridStart; day <= endOfWeek; day += MS_PER_DAY) {
    const entry = day > today ? undefined : byDay.get(day);
    const cell: DayCell = {
      day,
      future: day > today,
      today: day === today,
      played: entry?.played ?? 0,
      won: entry?.won ?? 0,
      lost: entry?.lost ?? 0,
      drew: entry?.drew ?? 0,
    };
    played += cell.played;
    won += cell.won;
    lost += cell.lost;
    drew += cell.drew;
    cells.push(cell);
  }

  const weeksColumns: DayCell[][] = [];
  for (let start = 0; start < cells.length; start += DAYS_PER_WEEK) {
    weeksColumns.push(cells.slice(start, start + DAYS_PER_WEEK));
  }

  return { weeks: weeksColumns, played, won, lost, drew };
}

/** The owner's team in a finished match, or undefined when they didn't play. */
function ownerTeamIn(match: MatchSummary, ownerId: string): TeamId | undefined {
  if (match.status !== "finished") {
    return;
  }
  if (match.players.A.includes(ownerId)) {
    return "A";
  }
  return match.players.B.includes(ownerId) ? "B" : undefined;
}
