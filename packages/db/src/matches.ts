import type { PointEvent, TeamId } from "@holy-padel/scoring";
import { computeMatch } from "@holy-padel/scoring";
import type { SqlDriver, SqlRow } from "./driver.ts";
import {
  expectNumber,
  expectString,
  inTransaction,
  optionalNumber,
  optionalString,
  queryOne,
} from "./driver.ts";
import { parseConfig, parseTeam } from "./match-config.ts";
import type { MatchSummary, StoredMatch } from "./match-types.ts";

function toStoredMatch(row: SqlRow): StoredMatch {
  const status = expectString(row, "status");
  if (status !== "live" && status !== "finished") {
    throw new Error(`invalid match status: ${status}`);
  }
  const winner = optionalString(row, "winner");
  return {
    id: expectString(row, "id"),
    status,
    config: parseConfig(row),
    players: {
      A: [expectString(row, "team_a_player_1"), optionalString(row, "team_a_player_2")],
      B: [expectString(row, "team_b_player_1"), optionalString(row, "team_b_player_2")],
    },
    court: optionalString(row, "court"),
    location: optionalString(row, "location"),
    startedAt: expectNumber(row, "started_at"),
    endedAt: optionalNumber(row, "ended_at"),
    winner: winner === undefined ? undefined : parseTeam(winner),
    scoreLine: optionalString(row, "score_line"),
    pausedMs: expectNumber(row, "paused_ms"),
    pausedAt: optionalNumber(row, "paused_at"),
    pendingGameSet: parseGameSet(optionalString(row, "pending_game_set")),
    note: optionalString(row, "note"),
  };
}

function parseGameSet(value: string | undefined): "one" | "two" | undefined {
  return value === "one" || value === "two" ? value : undefined;
}

function toSummary(row: SqlRow): MatchSummary {
  return {
    ...toStoredMatch(row),
    names: {
      A: [expectString(row, "name_a_1"), optionalString(row, "name_a_2")],
      B: [expectString(row, "name_b_1"), optionalString(row, "name_b_2")],
    },
  };
}

const SUMMARY_SELECT = `
  SELECT m.*,
         pa1.name AS name_a_1, pa2.name AS name_a_2,
         pb1.name AS name_b_1, pb2.name AS name_b_2
  FROM matches m
  JOIN players pa1 ON pa1.id = m.team_a_player_1
  LEFT JOIN players pa2 ON pa2.id = m.team_a_player_2
  JOIN players pb1 ON pb1.id = m.team_b_player_1
  LEFT JOIN players pb2 ON pb2.id = m.team_b_player_2
`;

export function getMatch(driver: SqlDriver, id: string): MatchSummary | undefined {
  const row = queryOne(driver, `${SUMMARY_SELECT} WHERE m.id = ?`, [id]);
  return row === undefined ? undefined : toSummary(row);
}

/** The one live match, if any — the home screen's "resume scoring" card. */
export function getLiveMatch(driver: SqlDriver): MatchSummary | undefined {
  const row = queryOne(
    driver,
    `${SUMMARY_SELECT} WHERE m.status = 'live' ORDER BY m.started_at DESC LIMIT 1`,
  );
  return row === undefined ? undefined : toSummary(row);
}

export function listMatches(driver: SqlDriver): MatchSummary[] {
  return driver.queryAll(`${SUMMARY_SELECT} ORDER BY m.started_at DESC`).map(toSummary);
}

export function deleteMatch(driver: SqlDriver, id: string): void {
  inTransaction(driver, () => {
    driver.execute("DELETE FROM match_events WHERE match_id = ?", [id]);
    driver.execute("DELETE FROM matches WHERE id = ?", [id]);
  });
}

export function updateFirstServe(driver: SqlDriver, id: string, team: TeamId): void {
  driver.execute("UPDATE matches SET first_serve = ?, first_serve_pending = 0 WHERE id = ?", [
    team,
    id,
  ]);
}

export function loadEvents(driver: SqlDriver, matchId: string): PointEvent[] {
  return driver
    .queryAll(
      "SELECT winner, at, kind, game_set FROM match_events WHERE match_id = ? ORDER BY seq",
      [matchId],
    )
    .map((row) => {
      const kind = optionalString(row, "kind") ?? "point";
      const gameSet = optionalString(row, "game_set");
      return {
        winner: parseTeam(expectString(row, "winner")),
        at: expectNumber(row, "at"),
        ...(kind === "serve" ? { kind: "serve" as const } : {}),
        ...(gameSet === "one" || gameSet === "two" ? { gameSet } : {}),
      };
    });
}

/**
 * Append one rally. A no-op unless the match exists and is still live —
 * a stray write after the final point must never poison the event log.
 */
export function appendEvent(driver: SqlDriver, matchId: string, event: PointEvent): void {
  driver.execute(
    `INSERT INTO match_events (match_id, seq, winner, at, kind, game_set)
     SELECT ?, (SELECT COALESCE(MAX(seq), 0) + 1 FROM match_events WHERE match_id = ?), ?, ?, ?, ?
     WHERE EXISTS (SELECT 1 FROM matches WHERE id = ? AND status = 'live')`,
    [
      matchId,
      matchId,
      event.winner,
      event.at,
      event.kind ?? "point",
      event.gameSet ?? null,
      matchId,
    ],
  );
}

/**
 * Record which team takes the undecided first serve of a pickleball game 2+.
 * Scores no rally; a no-op unless the match is still live.
 */
export function appendServeEvent(driver: SqlDriver, matchId: string, event: PointEvent): void {
  driver.execute(
    `INSERT INTO match_events (match_id, seq, winner, at, kind)
     SELECT ?, (SELECT COALESCE(MAX(seq), 0) + 1 FROM match_events WHERE match_id = ?), ?, ?, 'serve'
     WHERE EXISTS (SELECT 1 FROM matches WHERE id = ? AND status = 'live')`,
    [matchId, matchId, event.winner, event.at, matchId],
  );
}

/**
 * Score a rally — the guarded entry point for every "+1" from the phone or a
 * watch. Reads the committed state fresh and refuses the point when the match
 * isn't live, is paused, or the engine already considers it decided. Because
 * each call re-reads, a burst of fast taps (e.g. mashing the watch) can't append
 * events past match point — the second tap sees the finished fold and stops.
 *
 * The same guard rail resolves undecided serves: while the first serve of the
 * match is undecided the tap chooses the server (a config fix-up), and while a
 * pickleball game 2+ awaits its first serve the tap takes serve (a serve
 * event, no rally scored). A squash "choice" tie-break stages its long/short
 * decision and rides it on the next rally.
 */
export function scorePoint(driver: SqlDriver, matchId: string, winner: TeamId, at: number): void {
  const match = getMatch(driver, matchId);
  if (match === undefined || match.status !== "live" || match.pausedAt !== undefined) {
    return;
  }
  const snapshot = computeMatch(match.config, loadEvents(driver, matchId));
  if (snapshot.finished) {
    return;
  }
  if (
    match.config.firstServePending &&
    snapshot.totalPoints.A === 0 &&
    snapshot.totalPoints.B === 0
  ) {
    updateFirstServe(driver, matchId, winner);
    return;
  }
  if (snapshot.servingTeam === undefined) {
    appendServeEvent(driver, matchId, { winner, at });
    return;
  }
  scoreRally(driver, { matchId, momentKind: snapshot.moment.kind, winner, at });
}

/** Append one rally, attaching (or clearing) any staged squash long/short decision. */
function scoreRally(
  driver: SqlDriver,
  rally: {
    readonly matchId: string;
    readonly momentKind: string;
    readonly winner: TeamId;
    readonly at: number;
  },
): void {
  const { matchId, momentKind, winner, at } = rally;
  const staged = queryOne(driver, "SELECT pending_game_set FROM matches WHERE id = ?", [matchId]);
  const pendingGameSet =
    staged === undefined ? undefined : optionalString(staged, "pending_game_set");
  if (momentKind === "setChoice") {
    if (pendingGameSet !== "one" && pendingGameSet !== "two") {
      // No long/short decision yet — the phone or watch popup asks first.
      return;
    }
    inTransaction(driver, () => {
      appendEvent(driver, matchId, { winner, at, gameSet: pendingGameSet });
      clearPendingGameSet(driver, matchId);
    });
    return;
  }
  if (pendingGameSet !== undefined) {
    // Stale decision (the user undid past the choice point) — drop it.
    clearPendingGameSet(driver, matchId);
  }
  appendEvent(driver, matchId, { winner, at });
}

function clearPendingGameSet(driver: SqlDriver, matchId: string): void {
  driver.execute("UPDATE matches SET pending_game_set = NULL WHERE id = ?", [matchId]);
}

/**
 * Stage the squash "choice" tie-break decision (long/short). Consumed — and
 * cleared — by the next scored rally, or dropped on undo.
 */
export function setPendingGameSet(
  driver: SqlDriver,
  matchId: string,
  choice: "one" | "two" | null,
): void {
  driver.execute("UPDATE matches SET pending_game_set = ? WHERE id = ?", [choice, matchId]);
}
const APPEND_CHUNK = 100;

/** Append many events in a few multi-row inserts (bulk seeding, imports). */
export function appendEvents(
  driver: SqlDriver,
  matchId: string,
  events: readonly PointEvent[],
): void {
  const row = queryOne(
    driver,
    "SELECT COALESCE(MAX(seq), 0) AS seq FROM match_events WHERE match_id = ?",
    [matchId],
  );
  const baseSeq = row === undefined ? 0 : expectNumber(row, "seq");
  for (let start = 0; start < events.length; start += APPEND_CHUNK) {
    const chunk = events.slice(start, start + APPEND_CHUNK);
    const placeholders = chunk.map(() => "(?, ?, ?, ?)").join(", ");
    const chunkBase = baseSeq + start;
    const params = chunk.flatMap((event, offset) => [
      matchId,
      chunkBase + offset + 1,
      event.winner,
      event.at,
    ]);
    driver.execute(
      `INSERT INTO match_events (match_id, seq, winner, at) VALUES ${placeholders}`,
      params,
    );
  }
}

export function removeLastEvent(driver: SqlDriver, matchId: string): void {
  inTransaction(driver, () => {
    driver.execute(
      `DELETE FROM match_events
       WHERE match_id = ? AND seq = (SELECT MAX(seq) FROM match_events WHERE match_id = ?)`,
      [matchId, matchId],
    );
    // Undoing back to an empty ledger restores an originally-undecided first
    // serve, bringing back the "tap to decide" state.
    const row = queryOne(
      driver,
      "SELECT first_serve_originally_undecided AS undecided FROM matches WHERE id = ?",
      [matchId],
    );
    if (row !== undefined && expectNumber(row, "undecided") === 1) {
      driver.execute("UPDATE matches SET first_serve_pending = 1 WHERE id = ?", [matchId]);
    }
    // A staged long/short decision is invalid after a rewind — ask again.
    driver.execute("UPDATE matches SET pending_game_set = NULL WHERE id = ?", [matchId]);
  });
}

/**
 * Mark a live match as finished and cache its display score line. A `winner`
 * of undefined records a draw: a match ended early while level.
 */
export function finishMatch(
  driver: SqlDriver,
  id: string,
  outcome: {
    readonly winner: TeamId | undefined;
    readonly endedAt: number;
    readonly scoreLine: string;
  },
): void {
  // Close any open pause at the end time so the stored paused_ms is final.
  driver.execute(
    `UPDATE matches
       SET status = 'finished', winner = ?, ended_at = ?, score_line = ?,
           paused_ms = paused_ms + CASE WHEN paused_at IS NULL THEN 0 ELSE ? - paused_at END,
           paused_at = NULL
     WHERE id = ?`,
    [outcome.winner ?? null, outcome.endedAt, outcome.scoreLine, outcome.endedAt, id],
  );
}

/** Correct the cached result of a finished match; undefined stores a draw. */
export function setFinishedWinner(driver: SqlDriver, id: string, winner: TeamId | undefined): void {
  driver.execute("UPDATE matches SET winner = ? WHERE id = ? AND status = 'finished'", [
    winner ?? null,
    id,
  ]);
}

/**
 * Put a finished match back into play — the result screen's "undo last point"
 * after a mis-tapped match point. Clears the cached result; the caller then
 * drops the deciding rally. A no-op unless the match is finished.
 */
export function reopenMatch(driver: SqlDriver, id: string): void {
  driver.execute(
    `UPDATE matches SET status = 'live', winner = NULL, ended_at = NULL, score_line = NULL
     WHERE id = ? AND status = 'finished'`,
    [id],
  );
}

/** Pause a live match — records the pause start; a no-op if already paused. */
export function pauseMatch(driver: SqlDriver, id: string, now: number): void {
  driver.execute(
    "UPDATE matches SET paused_at = ? WHERE id = ? AND status = 'live' AND paused_at IS NULL",
    [now, id],
  );
}

/** Resume a paused match — banks the elapsed pause into paused_ms. No-op if running. */
export function resumeMatch(driver: SqlDriver, id: string, now: number): void {
  driver.execute(
    "UPDATE matches SET paused_ms = paused_ms + (? - paused_at), paused_at = NULL WHERE id = ? AND paused_at IS NOT NULL",
    [now, id],
  );
}

/** Set or clear a match's free-text note (editable before and after play). */
export function setMatchNote(driver: SqlDriver, id: string, note: string): void {
  driver.execute("UPDATE matches SET note = ? WHERE id = ?", [note === "" ? null : note, id]);
}

export function countMatches(driver: SqlDriver): number {
  const row = queryOne(driver, "SELECT COUNT(*) AS n FROM matches");
  return row === undefined ? 0 : expectNumber(row, "n");
}
