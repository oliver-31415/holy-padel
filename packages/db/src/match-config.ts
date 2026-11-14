import type { MatchConfig, SquashServeBoxes, TeamId } from "@holy-padel/scoring";
import type { SqlDriver, SqlRow } from "./driver.ts";
import { expectNumber, expectString, optionalNumber, optionalString } from "./driver.ts";
import type { NewMatch, TeamPlayers } from "./match-types.ts";

/** Default game target for squash and pickleball when a row predates the column. */
const DEFAULT_GAME_TARGET = 11;

const BEST_OF_THREE = 3;
const BEST_OF_FIVE = 5;

export function parseTeam(value: string): TeamId {
  if (value !== "A" && value !== "B") {
    throw new Error(`invalid team id: ${value}`);
  }
  return value;
}

function flag(row: SqlRow, column: string): boolean {
  return expectNumber(row, column) === 1;
}

function parsePickleballConfig(row: SqlRow): MatchConfig {
  return {
    sport: "pickleball",
    bestOf: expectNumber(row, "pb_best_of") as 1 | 3 | 5,
    deuceMode: "advantage",
    thirdSet: "superTieBreak",
    firstServe: parseTeam(expectString(row, "first_serve")),
    firstServePending: flag(row, "first_serve_pending"),
    firstServeOriginallyUndecided: flag(row, "first_serve_originally_undecided"),
    pbType: (optionalString(row, "pb_type") as "singles" | "doubles" | undefined) ?? "doubles",
    pbTarget: optionalNumber(row, "pb_target") ?? DEFAULT_GAME_TARGET,
    pbTiebreak:
      (optionalString(row, "pb_tiebreak") as "winByTwo" | "winByOne" | undefined) ?? "winByTwo",
  };
}

/**
 * Legacy builds stored "alternate" (start right, then alternate) — under the
 * corrected serving model that is simply the fixed-right mode. Anything
 * unknown falls back to fixed right as well.
 */
function parseServeBoxes(value: string | undefined): SquashServeBoxes {
  if (value === "left" || value === "player") {
    return value;
  }
  return "right";
}

function parseSquashConfig(row: SqlRow): MatchConfig {
  const serveBoxA = optionalString(row, "squash_box_a") as "right" | "left" | undefined;
  const serveBoxB = optionalString(row, "squash_box_b") as "right" | "left" | undefined;
  return {
    sport: "squash",
    bestOf: expectNumber(row, "squash_best_of") as 1 | 3 | 5,
    deuceMode: "advantage",
    thirdSet: "fullSet",
    firstServe: parseTeam(expectString(row, "first_serve")),
    firstServePending: flag(row, "first_serve_pending"),
    firstServeOriginallyUndecided: flag(row, "first_serve_originally_undecided"),
    squashMode: (optionalString(row, "squash_mode") as "par" | "hiho" | undefined) ?? "par",
    squashTarget: optionalNumber(row, "squash_target") ?? DEFAULT_GAME_TARGET,
    squashTiebreak:
      (optionalString(row, "squash_tiebreak") as
        | "winByTwo"
        | "setOne"
        | "setTwo"
        | "choice"
        | undefined) ?? "winByTwo",
    squashServeBoxes: parseServeBoxes(optionalString(row, "squash_serve_boxes")),
    ...(serveBoxA === undefined ? {} : { squashServeBoxA: serveBoxA }),
    ...(serveBoxB === undefined ? {} : { squashServeBoxB: serveBoxB }),
  };
}

function parsePadelConfig(row: SqlRow): MatchConfig {
  const padelBestOf = optionalNumber(row, "padel_best_of");
  const bestOf = padelBestOf ?? expectNumber(row, "best_of");
  if (bestOf !== 1 && bestOf !== BEST_OF_THREE && bestOf !== BEST_OF_FIVE) {
    throw new Error(`invalid best_of for padel: ${String(bestOf)}`);
  }
  const deuceMode = expectString(row, "deuce_mode");
  if (deuceMode !== "advantage" && deuceMode !== "starPoint" && deuceMode !== "goldenPoint") {
    throw new Error(`invalid deuce_mode: ${deuceMode}`);
  }
  const thirdSet = expectString(row, "third_set");
  if (thirdSet !== "fullSet" && thirdSet !== "advantageSet" && thirdSet !== "superTieBreak") {
    throw new Error(`invalid third_set: ${thirdSet}`);
  }
  return {
    sport: "padel",
    bestOf,
    deuceMode,
    thirdSet,
    firstServe: parseTeam(expectString(row, "first_serve")),
    firstServePending: flag(row, "first_serve_pending"),
    firstServeOriginallyUndecided: flag(row, "first_serve_originally_undecided"),
  };
}

/** Rebuild a MatchConfig from a matches row (any sport). */
export function parseConfig(row: SqlRow): MatchConfig {
  const sport = optionalString(row, "sport") ?? "padel";
  if (sport === "pickleball") {
    return parsePickleballConfig(row);
  }
  if (sport === "squash") {
    return parseSquashConfig(row);
  }
  return parsePadelConfig(row);
}

/** Players who only have one entry (singles) repeat them for the paired slots. */
function playerParams(players: TeamPlayers): (string | null)[] {
  return [players.A[0], players.A[1] ?? null, players.B[0], players.B[1] ?? null];
}

function insertPickleballMatch(driver: SqlDriver, match: NewMatch): void {
  if (match.config.sport !== "pickleball") {
    throw new Error("not a pickleball match");
  }
  const { config, players } = match;
  driver.execute(
    `INSERT INTO matches (
       id, status, sport, best_of, deuce_mode, third_set, first_serve, first_serve_pending, first_serve_originally_undecided,
       pb_type, pb_target, pb_tiebreak, pb_best_of,
       team_a_player_1, team_a_player_2, team_b_player_1, team_b_player_2,
       location, note, started_at
       ) VALUES (?, 'live', ?, ?, 'advantage', 'superTieBreak', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      match.id,
      "pickleball",
      config.bestOf,
      config.firstServePending ? "A" : config.firstServe,
      config.firstServePending ? 1 : 0,
      config.firstServeOriginallyUndecided ? 1 : 0,
      config.pbType,
      config.pbTarget,
      config.pbTiebreak,
      config.bestOf,
      ...playerParams(players),
      match.location ?? null,
      match.note ?? null,
      match.startedAt,
    ],
  );
}

function insertSquashMatch(driver: SqlDriver, match: NewMatch): void {
  if (match.config.sport !== "squash") {
    throw new Error("not a squash match");
  }
  const { config, players } = match;
  driver.execute(
    `INSERT INTO matches (
        id, status, sport, best_of, deuce_mode, third_set, first_serve, first_serve_pending, first_serve_originally_undecided,
        squash_mode, squash_target, squash_tiebreak, squash_serve_boxes, squash_box_a, squash_box_b, squash_best_of, padel_best_of,
        team_a_player_1, team_a_player_2, team_b_player_1, team_b_player_2,
        location, note, started_at
        ) VALUES (?, 'live', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      match.id,
      "squash",
      config.bestOf === BEST_OF_FIVE ? 1 : config.bestOf, // dummy padel value
      "advantage",
      "fullSet",
      config.firstServePending ? "A" : config.firstServe,
      config.firstServePending ? 1 : 0,
      config.firstServeOriginallyUndecided ? 1 : 0,
      config.squashMode,
      config.squashTarget,
      config.squashTiebreak,
      config.squashServeBoxes ?? "right",
      config.squashServeBoxA ?? null,
      config.squashServeBoxB ?? null,
      config.bestOf,
      null, // padel_best_of
      ...playerParams(players),
      match.location ?? null,
      match.note ?? null,
      match.startedAt,
    ],
  );
}

function insertPadelMatch(driver: SqlDriver, match: NewMatch): void {
  if (match.config.sport === "pickleball" || match.config.sport === "squash") {
    throw new Error("not a padel match");
  }
  const { config, players } = match;
  driver.execute(
    `INSERT INTO matches (
        id, status, sport, best_of, deuce_mode, third_set, first_serve, first_serve_pending, first_serve_originally_undecided,
        padel_best_of,
        team_a_player_1, team_a_player_2, team_b_player_1, team_b_player_2,
        location, note, started_at
      ) VALUES (?, 'live', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      match.id,
      "padel",
      config.bestOf,
      config.deuceMode,
      config.thirdSet,
      config.firstServePending ? "A" : config.firstServe,
      config.firstServePending ? 1 : 0,
      config.firstServeOriginallyUndecided ? 1 : 0,
      config.bestOf,
      ...playerParams(players),
      match.location ?? null,
      match.note ?? null,
      match.startedAt,
    ],
  );
}

/** Persist a new live match with its per-sport config. */
export function createMatch(driver: SqlDriver, match: NewMatch): void {
  if (match.config.sport === "pickleball") {
    insertPickleballMatch(driver, match);
    return;
  }
  if (match.config.sport === "squash") {
    insertSquashMatch(driver, match);
    return;
  }
  insertPadelMatch(driver, match);
}
