import type { MatchSummary } from "@holy-padel/db";
import { describe, expect, it } from "vitest";
import { computeHistory } from "../src/lib/history.ts";

// Wednesday 2026-07-01 12:00 local time.
const NOW = new Date(2026, 6, 1, 12, 0).getTime();
const DAY = 86_400_000;
const OWNER = "nico";
const OPPONENT = "marta";

function finishedMatch(id: string, startedAt: number, won: boolean): MatchSummary {
  return {
    id,
    status: "finished",
    config: { bestOf: 1, deuceMode: "advantage", thirdSet: "fullSet", firstServe: "A" },
    players: { A: [OWNER, undefined], B: [OPPONENT, undefined] },
    names: { A: ["Nico", undefined], B: ["Marta", undefined] },
    location: undefined,
    startedAt,
    endedAt: startedAt + 3_600_000,
    winner: won ? "A" : "B",
    scoreLine: won ? "6-0" : "0-6",
    pausedMs: 0,
    pausedAt: undefined,
    pendingGameSet: undefined,
    note: undefined,
  };
}

describe("computeHistory", () => {
  it("lays out the last six calendar weeks ending with today's", () => {
    const history = computeHistory([], OWNER, NOW);
    expect(history.weeks).toHaveLength(6);
    // Every week is a full 7-day row.
    for (const week of history.weeks) {
      expect(week).toHaveLength(7);
    }
    // The grid starts on a Sunday and ends on the current week's Saturday.
    const first = history.weeks[0]?.[0];
    const last = history.weeks[5]?.[6];
    expect(new Date(first?.day ?? 0).getDay()).toBe(0);
    expect(new Date(last?.day ?? 0).getDay()).toBe(6);
    // Days after today are marked future so the grid ends at today.
    expect(last?.future).toBe(true);
  });

  it("groups matches by local day and counts wins and losses", () => {
    const history = computeHistory(
      [
        finishedMatch("w1", NOW - 2 * DAY, true),
        finishedMatch("l1", NOW - 2 * DAY, false),
        finishedMatch("w2", NOW - 9 * DAY, true),
        // Outside the six-week window — ignored.
        finishedMatch("old", NOW - 60 * DAY, true),
      ],
      OWNER,
      NOW,
    );
    expect(history.played).toBe(3);
    expect(history.won).toBe(2);
    expect(history.lost).toBe(1);

    const days = history.weeks.flat();
    const twoDaysAgo = days.find(
      (cell) => cell.day === new Date(NOW - 2 * DAY).setHours(0, 0, 0, 0),
    );
    expect(twoDaysAgo).toMatchObject({ played: 2, won: 1, lost: 1 });
  });

  it("ignores matches the owner did not play", () => {
    const other = finishedMatch("other", NOW, true);
    const history = computeHistory(
      [{ ...other, players: { A: ["marta", undefined], B: ["leo", undefined] } }],
      OWNER,
      NOW,
    );
    expect(history.played).toBe(0);
  });
});
