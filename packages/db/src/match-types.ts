import type { MatchConfig, TeamId } from "@holy-padel/scoring";

export type MatchStatus = "live" | "finished";

export interface TeamPlayers {
  readonly A: readonly [string, string | undefined];
  readonly B: readonly [string, string | undefined];
}

export interface NewMatch {
  readonly id: string;
  readonly config: MatchConfig;
  readonly players: TeamPlayers;
  readonly location?: string;
  /** Optional free-text note, editable before or after the match. */
  readonly note?: string;
  readonly startedAt: number;
}

export interface StoredMatch {
  readonly id: string;
  readonly status: MatchStatus;
  readonly config: MatchConfig;
  readonly players: TeamPlayers;
  readonly location: string | undefined;
  readonly startedAt: number;
  readonly endedAt: number | undefined;
  readonly winner: TeamId | undefined;
  readonly scoreLine: string | undefined;
  /** Accumulated paused time (ms), excluded from the match duration. */
  readonly pausedMs: number;
  /** Start of the current pause (ms), or undefined while the match is running. */
  readonly pausedAt: number | undefined;
  /**
   * A staged squash long/short decision awaiting the next rally (set from the
   * phone popup or a watch intent). Cleared when the rally is played or undone.
   */
  readonly pendingGameSet: "one" | "two" | undefined;
  /** Optional free-text note ("training, court felt slow"). */
  readonly note: string | undefined;
}

/** A match row joined with the four player names, for list screens. */
export interface MatchSummary extends StoredMatch {
  readonly names: {
    readonly A: readonly [string, string | undefined];
    readonly B: readonly [string, string | undefined];
  };
}
