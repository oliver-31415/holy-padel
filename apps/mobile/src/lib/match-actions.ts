import type { MatchSummary, SqlDriver } from "@holy-padel/db";
import {
  deleteMatch,
  finishMatch,
  getLiveMatch,
  getMatch,
  listMatches,
  loadEvents,
  removeLastEvent,
  reopenMatch,
  scorePoint,
} from "@holy-padel/db";
import type { MatchConfig, PointEvent, TeamId } from "@holy-padel/scoring";
import { computeMatch, outcomeWinner } from "@holy-padel/scoring";
import { finalScoreLine, liveScoreLine } from "@/lib/format.ts";

/**
 * The config for a rematch: the same scoring setup, except a match whose first
 * serve was originally undecided starts its rematch undecided too. Rematching
 * must not silently award the serve to whichever team the coin toss happened
 * to resolve to last time. Shared by the two phone rematch buttons and the
 * watch's `start-last` intent so all three behave identically.
 */
export function rematchConfig(config: MatchConfig): MatchConfig {
  return {
    ...config,
    firstServePending: config.firstServeOriginallyUndecided ?? false,
  };
}

/**
 * Stop AND save a match in whatever state it's in — the "court time's up, don't
 * lose the score" path. A truly finished match keeps the engine's winner and
 * final line; a match stopped mid-play is credited to whoever's ahead (sets,
 * then games, then points in the current game). A level stop is a draw.
 *
 * Shared by the phone's END sheet and the watch's stop intent so both surfaces
 * persist byte-identically — the phone stays the single writer either way.
 * No-op if the match is already gone.
 */
export function stopAndSaveMatch(driver: SqlDriver, id: string, at: number): void {
  const match = getMatch(driver, id);
  if (match === undefined) {
    return;
  }
  const snapshot = computeMatch(match.config, loadEvents(driver, id));
  finishMatch(driver, id, {
    winner: outcomeWinner(snapshot),
    endedAt: at,
    scoreLine: snapshot.finished ? finalScoreLine(snapshot) : liveScoreLine(snapshot),
  });
}

/**
 * When the match was last touched: its last rally, or a pause started after it.
 * Used as the end time when settling a match after the fact, so the pause that
 * finishing closes never banks a negative stretch.
 */
function lastActivity(match: MatchSummary, events: readonly PointEvent[]): number {
  return Math.max(events.at(-1)?.at ?? match.startedAt, match.pausedAt ?? 0);
}

/**
 * Mark a live match finished if its ledger has already decided it. Returns
 * whether it did. The result is credited at the deciding rally's time.
 */
function finishIfDecided(driver: SqlDriver, id: string): boolean {
  const match = getMatch(driver, id);
  if (match?.status !== "live") {
    return false;
  }
  const events = loadEvents(driver, id);
  const snapshot = computeMatch(match.config, events);
  if (!snapshot.finished || snapshot.winner === undefined) {
    return false;
  }
  finishMatch(driver, id, {
    winner: snapshot.winner,
    endedAt: lastActivity(match, events),
    scoreLine: finalScoreLine(snapshot),
  });
  return true;
}

/**
 * Score one tap and, if it decides the match, save the result in the same
 * write. Finishing used to live in an effect on the scoreboard screen, so a
 * match won from the watch (phone pocketed, or on another tab) stayed "live" —
 * missing from every stat — until someone reopened it. Shared by the phone's
 * scoreboard and the watch's score intent so the two can't drift.
 */
export function recordPoint(driver: SqlDriver, id: string, team: TeamId, at: number): void {
  scorePoint(driver, id, team, at);
  finishIfDecided(driver, id);
}

/**
 * Undo a mis-tapped match point from the result screen: put the match back
 * into play and drop the deciding rally. Refused (returns false) when another
 * match has gone live meanwhile — e.g. a rematch started from the watch —
 * because only one match may be live at a time.
 */
export function undoMatchPoint(driver: SqlDriver, id: string): boolean {
  const live = getLiveMatch(driver);
  const match = getMatch(driver, id);
  if (match?.status !== "finished" || (live !== undefined && live.id !== id)) {
    return false;
  }
  reopenMatch(driver, id);
  removeLastEvent(driver, id);
  return true;
}

/**
 * Close the live match, if any, before another one starts — only one match is
 * ever live (home, the watch and scoring all follow the newest). Saves it as it
 * stands, like the END sheet's stop.
 */
export function closeLiveMatch(driver: SqlDriver, at: number): void {
  const live = getLiveMatch(driver);
  if (live !== undefined) {
    stopAndSaveMatch(driver, live.id, at);
  }
}

/**
 * Startup repair for the ledger's "live" rows. A live match whose rallies
 * already decided it is saved with its real result (matches won from the watch
 * before finishing moved into `recordPoint`). Only the newest undecided match
 * stays live; older ones were orphaned by starting a second match and nothing
 * can reach them, so they're saved as they stood — or dropped when no rally
 * was ever played. Returns how many rows changed.
 */
export function settleLiveMatches(driver: SqlDriver): number {
  // listMatches is newest first, so the first undecided live match is kept.
  const live = listMatches(driver).filter((match) => match.status === "live");
  let settled = 0;
  let keptOne = false;
  for (const match of live) {
    if (finishIfDecided(driver, match.id)) {
      settled += 1;
    } else if (keptOne) {
      const events = loadEvents(driver, match.id);
      if (events.length === 0) {
        deleteMatch(driver, match.id);
      } else {
        stopAndSaveMatch(driver, match.id, lastActivity(match, events));
      }
      settled += 1;
    } else {
      keptOne = true;
    }
  }
  return settled;
}
