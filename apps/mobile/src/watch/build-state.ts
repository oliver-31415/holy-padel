import type { MatchSummary } from "@holy-padel/db";
import type { MatchSnapshot, TeamId } from "@holy-padel/scoring";
import { watchStatusLabel } from "@holy-padel/scoring";
import {
  durationLabel,
  finalScoreLine,
  matchContext,
  opponentsOf,
  ownerTeamOf,
  pairInitials,
  playedMs,
  pointDisplay,
  teamInitials,
} from "@/lib/format.ts";
import type { Palette } from "@/theme/color-setting.ts";

/**
 * Builds the `/holy-padel/state` payload the phone pushes to the watches
 * (docs/watch-sync.md). Pure and transport-agnostic — the WatchConnectivity and
 * Wearable Data Layer bridges serialise the same object. Every display string is
 * produced by the existing phone formatters, so the FIP rules and their wording
 * live in exactly one place.
 */

const SCHEMA_VERSION = 1;

export interface WatchTeam {
  readonly short: string;
  readonly serving: boolean;
  /** Box the server is serving from — additive since payload v1; watches may ignore it. */
  readonly servingSide?: "right" | "left" | null | undefined;
}

export interface WatchWon {
  readonly winnerShort: string;
  readonly scoreLine: string;
  readonly duration: string;
  /** Whether the device owner's team won — additive since payload v1 ("Match won" / "Match lost"). */
  readonly ownerWon: boolean;
}

export interface WatchLast {
  readonly line: string;
  readonly won: boolean;
}

export interface WatchState {
  readonly v: number;
  readonly phase: "idle" | "live" | "won";
  readonly clock: string;
  readonly setLabel: string;
  readonly teamA: WatchTeam;
  readonly teamB: WatchTeam;
  readonly pointA: string;
  readonly pointB: string;
  readonly games: string;
  readonly status: string;
  /** True while a live match is paused — the watches pause the workout too. */
  readonly paused?: boolean;
  /**
   * Squash "choice" tie-break: the game is at target-1 all and the receiver
   * must pick long or short. Watches show their choice buttons while set.
   */
  readonly choicePending?: boolean | undefined;
  /**
   * Epoch ms the live/won match started — the watches use it as the workout
   * session's start time and as the cross-device dedup key. Absent when idle.
   */
  readonly startedAt?: number;
  /**
   * Epoch ms the match clock counts up from (the start, pushed later by any
   * paused time), so a watch can run the clock itself between pushes. Absent
   * while paused (show `clock`, frozen) and when not live. Additive since v1.
   */
  readonly clockBase?: number;
  readonly won?: WatchWon;
  readonly last?: WatchLast;
  /**
   * The user's highlight and Team B colours as `#RRGGBB` — additive since
   * payload v1; a watch that ignores it keeps its built-in orange / violet.
   */
  readonly palette?: Palette;
}

export interface WatchStateInput {
  /** The device owner's player id — decides the win/loss of the idle hint. */
  readonly ownerId: string;
  /** Epoch ms, for the match clock. */
  readonly now: number;
  /** The live match and its snapshot, when one is in progress or just finished. */
  readonly live?: { readonly match: MatchSummary; readonly snapshot: MatchSnapshot };
  /** Most recent finished match, shown as the idle quick-start hint. */
  readonly last?: MatchSummary;
  /** The user's colours, mirrored onto the watch faces. */
  readonly palette?: Palette;
}

const EMPTY_TEAM: WatchTeam = { short: "", serving: false };

export function buildWatchState(input: WatchStateInput): WatchState {
  const { live, last, now, ownerId, palette } = input;
  // exactOptionalPropertyTypes: omit the key rather than set it to undefined.
  const paletteField = palette === undefined ? {} : { palette };
  if (live !== undefined) {
    return {
      ...(live.snapshot.finished
        ? wonState(live.match, live.snapshot, now, ownerId)
        : liveState(live.match, live.snapshot, now)),
      ...paletteField,
    };
  }
  return { ...idleState(last, ownerId), ...paletteField };
}

/** The watch status line while a long/short decision is staged for the next rally. */
function stagedChoiceStatus(staged: MatchSummary["pendingGameSet"]): string | undefined {
  if (staged === "one") {
    return "SHORT · SET 1";
  }
  return staged === "two" ? "LONG · SET 2" : undefined;
}

function liveState(match: MatchSummary, snapshot: MatchSnapshot, now: number): WatchState {
  const shorts = teamInitials(match);
  // Squash "choice" tie-break: while no decision is staged the watch shows its
  // SHORT/LONG buttons; once staged (from either surface) the buttons clear —
  // the score face returns with the staged call as the status line.
  const choicePending = snapshot.moment.kind === "setChoice" && match.pendingGameSet === undefined;
  const stagedStatus = stagedChoiceStatus(match.pendingGameSet);
  const context = matchContext(snapshot);
  const paused = match.pausedAt !== undefined;
  return {
    v: SCHEMA_VERSION,
    phase: "live",
    clock: durationLabel(playedMs(match, now)),
    setLabel: context.label,
    teamA: {
      short: shorts.A,
      serving: snapshot.servingTeam === "A",
      servingSide: snapshot.servingTeam === "A" ? snapshot.servingSide : null,
    },
    teamB: {
      short: shorts.B,
      serving: snapshot.servingTeam === "B",
      servingSide: snapshot.servingTeam === "B" ? snapshot.servingSide : null,
    },
    pointA: pointDisplay(snapshot, "A"),
    pointB: pointDisplay(snapshot, "B"),
    games: context.score,
    status: stagedStatus ?? watchStatusLabel(snapshot.moment, shorts, snapshot.config.sport) ?? "",
    paused,
    choicePending: choicePending || undefined,
    startedAt: match.startedAt,
    ...(paused ? {} : { clockBase: now - playedMs(match, now) }),
  };
}

function wonState(
  match: MatchSummary,
  snapshot: MatchSnapshot,
  now: number,
  ownerId: string,
): WatchState {
  const shorts = teamInitials(match);
  const winner: TeamId = snapshot.winner ?? "A";
  const scoreLine = finalScoreLine(snapshot);
  const duration = durationLabel(playedMs(match, match.endedAt ?? now));
  return {
    v: SCHEMA_VERSION,
    phase: "won",
    clock: duration,
    setLabel: "",
    teamA: { short: shorts.A, serving: false },
    teamB: { short: shorts.B, serving: false },
    pointA: "",
    pointB: "",
    games: scoreLine,
    status: "",
    startedAt: match.startedAt,
    won: {
      winnerShort: winner === "A" ? shorts.A : shorts.B,
      scoreLine,
      duration,
      ownerWon: winner === ownerTeamOf(match, ownerId),
    },
  };
}

function idleState(last: MatchSummary | undefined, ownerId: string): WatchState {
  const base: WatchState = {
    v: SCHEMA_VERSION,
    phase: "idle",
    clock: "",
    setLabel: "",
    teamA: EMPTY_TEAM,
    teamB: EMPTY_TEAM,
    pointA: "",
    pointB: "",
    games: "",
    status: "",
  };
  if (last === undefined) {
    return base;
  }
  const ownerTeam = ownerTeamOf(last, ownerId);
  const opponentShort = pairInitials(opponentsOf(last, ownerTeam));
  return {
    ...base,
    last: {
      line: `${last.scoreLine ?? ""} vs ${opponentShort}`.trim(),
      won: last.winner === ownerTeam,
    },
  };
}
