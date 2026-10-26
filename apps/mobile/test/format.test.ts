import type { MatchConfig, PointEvent } from "@holy-padel/scoring";
import { computeMatch } from "@holy-padel/scoring";
import { describe, expect, it } from "vitest";
import {
  dayLabel,
  durationLabel,
  finalScoreLine,
  fullDayLabel,
  liveScoreLine,
  matchContext,
  megabytesLabel,
  pairInitials,
  pairLabel,
  recordLabel,
  resultLabel,
  timeLabel,
} from "../src/lib/format.ts";

// Wednesday 2026-07-01 12:00 local time.
const NOW = new Date(2026, 6, 1, 12, 0).getTime();
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

describe("format helpers", () => {
  it("labels pairs and initials", () => {
    expect(pairLabel(["Nico", "Javi"])).toBe("Nico & Javi");
    expect(pairInitials(["Nico", "Javi"])).toBe("N&J");
    expect(pairInitials(["marta", "leo"])).toBe("M&L");
  });

  it("labels days as TODAY, weekday, or date", () => {
    expect(dayLabel(NOW - HOUR, NOW)).toBe("TODAY");
    expect(dayLabel(NOW - DAY, NOW)).toBe("TUE");
    expect(dayLabel(NOW - 3 * DAY, NOW)).toBe("SUN");
    expect(dayLabel(NOW - 10 * DAY, NOW)).toBe("JUN 21");
  });

  it("formats times, full dates and durations", () => {
    expect(timeLabel(new Date(2026, 6, 1, 18, 5).getTime())).toBe("18:05");
    expect(fullDayLabel(new Date(2026, 5, 30, 18, 32).getTime())).toBe("TUE JUN 30");
    expect(durationLabel(47 * 60_000)).toBe("0:47");
    expect(durationLabel(83 * 60_000)).toBe("1:23");
    expect(durationLabel(0)).toBe("0:00");
  });

  it("renders live and final score lines from snapshots", () => {
    const config = {
      bestOf: 3,
      deuceMode: "advantage",
      thirdSet: "superTieBreak",
      firstServe: "A",
    } as const;
    const gameA = Array.from({ length: 4 }, (_, index) => ({
      winner: "A" as const,
      at: index,
    }));
    const live = computeMatch(config, gameA);
    expect(liveScoreLine(live)).toBe("1-0");

    const set = Array.from({ length: 24 }, (_, index) => ({
      winner: "A" as const,
      at: index,
    }));
    const oneSet = computeMatch(config, set);
    expect(liveScoreLine(oneSet)).toBe("6-0 · 0-0");
    expect(finalScoreLine(oneSet)).toBe("6-0");
  });

  it("shows super tie-break points in the live line, not a frozen 0-0", () => {
    const config = {
      bestOf: 3,
      deuceMode: "advantage",
      thirdSet: "superTieBreak",
      firstServe: "A",
    } as const;
    const oneSetAll = [
      ...Array.from({ length: 24 }, () => "A" as const),
      ...Array.from({ length: 24 }, () => "B" as const),
    ];
    const intoSuperTb = [...oneSetAll, "A", "A", "A", "B"] as const;
    const snapshot = computeMatch(
      config,
      intoSuperTb.map((winner, index) => ({ winner, at: index })),
    );
    expect(liveScoreLine(snapshot)).toBe("6-0 · 0-6 · 3-1");
  });

  it("labels storage sizes", () => {
    expect(megabytesLabel(1_258_291)).toBe("1.2 MB");
    expect(megabytesLabel(0)).toBe("0.0 MB");
  });
});

describe("matchContext", () => {
  const winners = (pattern: string): PointEvent[] =>
    [...pattern].map((winner, index) => ({ winner: winner === "A" ? "A" : "B", at: index }));
  const squash = (bestOf: 1 | 3): MatchConfig => ({
    sport: "squash",
    bestOf,
    deuceMode: "advantage",
    thirdSet: "fullSet",
    squashMode: "par",
    squashTarget: 11,
    squashTiebreak: "winByTwo",
    firstServe: "A",
  });

  it("never repeats the rally score in squash", () => {
    const snapshot = computeMatch(squash(3), winners("AAB"));
    expect(matchContext(snapshot)).toEqual({ label: "GAME 1", score: "" });
  });

  it("shows games won once a game is done", () => {
    const snapshot = computeMatch(squash(3), winners(`${"A".repeat(11)}B`));
    expect(matchContext(snapshot)).toEqual({ label: "GAME 2", score: "1-0" });
  });

  it("drops the game number in a one-game match", () => {
    const snapshot = computeMatch(squash(1), winners("AB"));
    expect(matchContext(snapshot)).toEqual({ label: "", score: "" });
  });

  it("keeps padel's games in the set, without the set label in a one-set match", () => {
    const config: MatchConfig = {
      bestOf: 1,
      deuceMode: "advantage",
      thirdSet: "fullSet",
      firstServe: "A",
    };
    const snapshot = computeMatch(config, winners("AAAAB"));
    expect(matchContext(snapshot)).toEqual({ label: "", score: "1-0" });
  });
});

describe("pickleball score lines", () => {
  const doubles: MatchConfig = {
    sport: "pickleball",
    bestOf: 3,
    deuceMode: "advantage",
    thirdSet: "superTieBreak",
    pbType: "doubles",
    pbTarget: 11,
    pbTiebreak: "winByTwo",
    firstServe: "A",
  };
  const points = (pattern: string): PointEvent[] =>
    [...pattern].map((winner, index) => ({ winner: winner === "A" ? "A" : "B", at: index }));

  it("opens at 0-0-2, team A serving as server 2", () => {
    const snapshot = computeMatch(doubles, []);
    expect(liveScoreLine(snapshot)).toBe("0-0-2");
    expect(matchContext(snapshot)).toEqual({ label: "GAME 1", score: "0-0-2" });
  });

  it("shows the serving team's points first with its server call", () => {
    const snapshot = computeMatch(doubles, points("AA"));
    expect(liveScoreLine(snapshot)).toBe("2-0-2");
  });

  it("keeps the finished game's points ahead of the game in play", () => {
    // A wins game 1 11-0; B takes the undecided serve of game 2 and wins a rally.
    const events: PointEvent[] = [
      ...points("A".repeat(11)),
      { winner: "B", kind: "serve", at: 100 },
      { winner: "B", at: 101 },
    ];
    const snapshot = computeMatch(doubles, events);
    expect(matchContext(snapshot)).toEqual({ label: "GAME 2", score: "11-0 · 1-0-2" });
    expect(matchContext(snapshot).score).toBe(liveScoreLine(snapshot));
  });
});

describe("draw wording", () => {
  it("reads a win as DEF. and a level early stop as DREW WITH", () => {
    expect(resultLabel("Cameron", false)).toBe("DEF. CAMERON");
    expect(resultLabel("Cameron", true)).toBe("DREW WITH CAMERON");
  });

  it("omits the draw count from a record with no level stops", () => {
    expect(recordLabel({ won: 3, lost: 2, drew: 0 })).toBe("3–2");
  });

  it("appends the draw count once there are level early stops", () => {
    expect(recordLabel({ won: 3, lost: 2, drew: 1 })).toBe("3–2–1");
  });
});
