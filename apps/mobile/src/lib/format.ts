import type { MatchSummary, NewMatchDefaults } from "@holy-padel/db";
import type { DeuceMode, MatchSnapshot, TeamId, TeamValues } from "@holy-padel/scoring";

const DAY_MS = 86_400_000;
const WEEKDAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"] as const;
const MONTHS = [
  "JAN",
  "FEB",
  "MAR",
  "APR",
  "MAY",
  "JUN",
  "JUL",
  "AUG",
  "SEP",
  "OCT",
  "NOV",
  "DEC",
] as const;

/**
 * "Nico & Javi" — the second slot is undefined for singles-era rows whose
 * second player column is NULL; the pair is then just the one player.
 */
export function pairLabel(names: readonly [string, string | undefined]): string {
  if (names[1] === undefined || names[0] === names[1]) {
    return names[0];
  }
  return `${names[0]} & ${names[1]}`;
}

/** "N&J" */
export function pairInitials(names: readonly [string, string | undefined]): string {
  if (names[1] === undefined || names[0] === names[1]) {
    return names[0].slice(0, 2).toUpperCase();
  }
  return `${names[0].charAt(0).toUpperCase()}&${names[1].charAt(0).toUpperCase()}`;
}

export function teamNames(match: MatchSummary): TeamValues<string> {
  return { A: pairLabel(match.names.A), B: pairLabel(match.names.B) };
}

export function teamInitials(match: MatchSummary): TeamValues<string> {
  return { A: pairInitials(match.names.A), B: pairInitials(match.names.B) };
}

/** The pair facing the owner's team. */
export function opponentsOf(
  match: MatchSummary,
  ownerTeam: TeamId,
): readonly [string, string | undefined] {
  return ownerTeam === "A" ? match.names.B : match.names.A;
}

export function ownerTeamOf(match: MatchSummary, ownerId: string): TeamId {
  return match.players.B.includes(ownerId) ? "B" : "A";
}

/** "TODAY", "TUE", or "JUN 24" — the design's match-row date style. */
export function dayLabel(timestamp: number, now: number): string {
  const date = new Date(timestamp);
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  if (timestamp >= startOfToday.getTime()) {
    return "TODAY";
  }
  const daysAgo = Math.ceil((startOfToday.getTime() - timestamp) / DAY_MS);
  if (daysAgo <= 6) {
    return WEEKDAYS[date.getDay()] ?? "";
  }
  return `${MONTHS[date.getMonth()] ?? ""} ${String(date.getDate())}`;
}

/** "TUE JUN 30" — the overview header's date style. */
export function fullDayLabel(timestamp: number): string {
  const date = new Date(timestamp);
  const weekday = WEEKDAYS[date.getDay()] ?? "";
  const month = MONTHS[date.getMonth()] ?? "";
  return `${weekday} ${month} ${String(date.getDate())}`;
}

/** "3–2" for a record, "3–2–1" once there are level early stops to show. */
export function recordLabel(record: {
  readonly won: number;
  readonly lost: number;
  readonly drew: number;
}): string {
  const base = `${String(record.won)}–${String(record.lost)}`;
  return record.drew === 0 ? base : `${base}–${String(record.drew)}`;
}

/** The hero's line under the headline team: "DEF. CAMERON", or "DREW WITH CAMERON" for a level early stop. */
export function resultLabel(opponent: string, drew: boolean): string {
  return `${drew ? "DREW WITH" : "DEF."} ${opponent.toUpperCase()}`;
}

/** "18:32" */
export function timeLabel(timestamp: number): string {
  const date = new Date(timestamp);
  const hours = String(date.getHours());
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

/** "1:23" — match clock, hours:minutes. */
export function durationLabel(durationMs: number): string {
  const totalMinutes = Math.max(0, Math.round(durationMs / 60_000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = String(totalMinutes % 60).padStart(2, "0");
  return `${String(hours)}:${minutes}`;
}

/**
 * Elapsed play time (ms) excluding paused breaks — the match's accurate duration.
 * `at` is `now` while live (freezes during an open pause, since the open interval
 * grows with `now`) or `endedAt` once finished.
 */
export function playedMs(
  match: {
    readonly startedAt: number;
    readonly pausedMs: number;
    readonly pausedAt: number | undefined;
  },
  at: number,
): number {
  const openPause = match.pausedAt === undefined ? 0 : Math.max(0, at - match.pausedAt);
  return Math.max(0, at - match.startedAt - match.pausedMs - openPause);
}

/** "TODAY · 18:32 · COURT 4" or "TUE · CLUB PADEL NORTE". */
export function matchMetaLabel(match: MatchSummary, now: number): string {
  const day = dayLabel(match.startedAt, now);
  const place = match.court ?? match.location;
  const parts =
    day === "TODAY"
      ? [day, timeLabel(match.startedAt), match.court ?? match.location]
      : [day, place];
  return parts
    .filter((part): part is string => part !== undefined)
    .map((part) => part.toUpperCase())
    .join(" · ");
}

export function currentSetScore(snapshot: MatchSnapshot): string {
  const game = snapshot.currentGame;
  if (snapshot.config.sport === "pickleball" && game?.kind === "pickleball") {
    const serverNum = game.serverNumber === undefined ? "" : `-${game.serverNumber}`;
    const serverPoints = snapshot.servingTeam === "B" ? game.points.B : game.points.A;
    const receiverPoints = snapshot.servingTeam === "B" ? game.points.A : game.points.B;
    return `${String(serverPoints)}-${String(receiverPoints)}${serverNum}`;
  }
  if (snapshot.config.sport === "squash" && game?.kind === "squash") {
    return `${String(game.points.A)}-${String(game.points.B)}`;
  }
  if (game?.kind === "tieBreak" && game.tieBreakKind === "superTieBreak") {
    return `${String(game.points.A)}-${String(game.points.B)}`;
  }
  return `${String(snapshot.currentSetGames.A)}-${String(snapshot.currentSetGames.B)}`;
}

/** "6-4 · 4-3" — completed sets plus the set in play (super TB shows its points). */
export function liveScoreLine(snapshot: MatchSnapshot): string {
  const parts = snapshot.completedSets.map(
    (set) => `${String(set.games.A)}-${String(set.games.B)}`,
  );
  if (!snapshot.finished) {
    parts.push(currentSetScore(snapshot));
  }
  return parts.join(" · ");
}

/** "6-3 · 7-6" for a finished match, from the snapshot. */
export function finalScoreLine(snapshot: MatchSnapshot): string {
  const parts = snapshot.completedSets.map(
    (set) => `${String(set.games.A)}-${String(set.games.B)}`,
  );
  if (snapshot.config.sport === "pickleball" && snapshot.completedSets.length > 0) {
    // For pickleball, just return the sets as usual
  }
  return parts.join(" · ");
}

/** The point call for a team — "0/15/30/40/AD" in a game, the number in a tie-break. */
export function pointDisplay(snapshot: MatchSnapshot, team: TeamId): string {
  const game = snapshot.currentGame;
  if (game === undefined) {
    return "";
  }
  return game.kind === "standard" ? game.calls[team] : String(game.points[team]);
}

/**
 * The match around the live point, without repeating it — the watches show
 * the point score big already. Padel: "SET 2" and "6-4 · 3-2" (set scores and
 * games in this set). Squash: "GAME 2" and the games won, "1-0" (nothing in
 * game 1). Pickleball: "GAME 2" and the finished games' points plus the game
 * in play with its server call, "11-7 · 1-0-2" — the call is the part the score
 * needs, so it is never dropped. The label only appears when the match has more
 * than one set or game; a super tie-break is always labelled, with just the set
 * scores beside it.
 */
export function matchContext(snapshot: MatchSnapshot): {
  readonly label: string;
  readonly score: string;
} {
  const { config, completedSets, currentGame } = snapshot;
  const sets = completedSets.map((set) => `${String(set.games.A)}-${String(set.games.B)}`);
  if (currentGame?.kind === "tieBreak" && currentGame.tieBreakKind === "superTieBreak") {
    return { label: "SUPER TB", score: sets.join(" · ") };
  }
  const several = config.bestOf > 1;
  if (config.sport === "pickleball") {
    return {
      label: several ? `GAME ${String(snapshot.setNumber)}` : "",
      score: liveScoreLine(snapshot),
    };
  }
  if (config.sport === "squash") {
    const wonA = completedSets.filter((set) => set.winner === "A").length;
    return {
      label: several ? `GAME ${String(snapshot.setNumber)}` : "",
      score:
        completedSets.length === 0 ? "" : `${String(wonA)}-${String(completedSets.length - wonA)}`,
    };
  }
  const games = `${String(snapshot.currentSetGames.A)}-${String(snapshot.currentSetGames.B)}`;
  return {
    label: several ? `SET ${String(snapshot.setNumber)}` : "",
    score: [...sets, games].join(" · "),
  };
}

/** "SET 2" / "SUPER TB" / "GAME 1" — the set in play, in the watch header's compact style. */
export function watchSetLabel(snapshot: MatchSnapshot): string {
  const game = snapshot.currentGame;
  if (game?.kind === "tieBreak" && game.tieBreakKind === "superTieBreak") {
    return "SUPER TB";
  }
  const isSquash = snapshot.config.sport === "squash";
  return `${isSquash ? "GAME" : "SET"} ${String(snapshot.setNumber)}`;
}

/** "1.2 MB" */
export function megabytesLabel(bytes: number): string {
  const megabytes = bytes / (1024 * 1024);
  return `${megabytes.toFixed(1)} MB`;
}

const SPORT_LABELS: Record<NewMatchDefaults["sport"], string> = {
  padel: "Padel",
  squash: "Squash",
  pickleball: "Pickleball",
};

/** "Padel · Doubles" — the rules summary card's title. */
export function setupTitle(setup: NewMatchDefaults): string {
  return `${SPORT_LABELS[setup.sport]} · ${setup.format === "singles" ? "Singles" : "Doubles"}`;
}

/**
 * Whether two setups describe the exact same rules — the saved preset chip
 * for the current setup reads as active. Compared field by field (not
 * stringified) so key ordering can never make equal setups look different.
 */
export function sameSetup(left: NewMatchDefaults, right: NewMatchDefaults): boolean {
  return (
    left.format === right.format &&
    left.bestOf === right.bestOf &&
    left.thirdSet === right.thirdSet &&
    left.deuceMode === right.deuceMode &&
    left.firstServe === right.firstServe &&
    left.sport === right.sport &&
    left.squashMode === right.squashMode &&
    left.squashTarget === right.squashTarget &&
    left.squashTiebreak === right.squashTiebreak &&
    left.squashServeBoxes === right.squashServeBoxes &&
    left.pbTarget === right.pbTarget &&
    left.pbTiebreak === right.pbTiebreak
  );
}

function serveLabel(firstServe: NewMatchDefaults["firstServe"]): string {
  if (firstServe === "undecided") {
    return "Serve: toss";
  }
  return `Serve: Team ${firstServe}`;
}

function squashTiebreakLabel(setup: NewMatchDefaults): string {
  if (setup.squashTiebreak === "winByTwo") {
    return "Win by 2";
  }
  if (setup.squashTiebreak === "choice") {
    return `Ask at ${String(setup.squashTarget - 1)}`;
  }
  return setup.squashTiebreak === "setOne" ? "Set 1" : "Set 2";
}

function squashBoxLabel(boxes: NewMatchDefaults["squashServeBoxes"]): string {
  return `Box: ${boxes === "player" ? "auto" : boxes}`;
}

/**
 * The rules summary card's small pills — the current setup in the sport's own
 * vocabulary, most distinctive rule first. Squash leads with its mode and
 * target; padel and pickleball lead with the set/goal format.
 */
export function setupSummary(setup: NewMatchDefaults): string[] {
  if (setup.sport === "squash") {
    return [
      `${setup.squashMode === "par" ? "PAR" : "HIHO"} to ${String(setup.squashTarget)}`,
      `Best of ${String(setup.bestOf)}`,
      squashTiebreakLabel(setup),
      squashBoxLabel(setup.squashServeBoxes),
    ];
  }
  if (setup.sport === "pickleball") {
    return [
      `To ${String(setup.pbTarget)}`,
      `Best of ${String(setup.bestOf)}`,
      setup.pbTiebreak === "winByTwo" ? "Win by 2" : "Win by 1",
      serveLabel(setup.firstServe),
    ];
  }
  const thirdSet = setup.thirdSet === "superTieBreak" ? "Super TB" : "Full set";
  return [
    `Best of ${String(setup.bestOf)}`,
    // A single set has no decider to describe.
    ...(setup.bestOf === 1 ? [] : [`${thirdSet} decider`]),
    deuceLabel(setup.deuceMode),
    serveLabel(setup.firstServe),
  ];
}

function deuceLabel(deuceMode: DeuceMode): "Golden pt" | "Star pt" | "Advantage" {
  if (deuceMode === "goldenPoint") {
    return "Golden pt";
  }
  return deuceMode === "starPoint" ? "Star pt" : "Advantage";
}
