import type { MatchConfig, PointEvent, TeamId } from "@holy-padel/scoring";
import { describe, expect, it } from "vitest";
import {
  addRallies,
  leftOutLabel,
  MIN_RALLY_MS,
  type Rally,
  rallyLengthLabel,
  rallyLengths,
  rallyMoments,
  summarizeRallies,
} from "@/lib/rallies.ts";

const padel: MatchConfig = {
  bestOf: 1,
  deuceMode: "goldenPoint",
  thirdSet: "fullSet",
  firstServe: "A",
};

const par: MatchConfig = {
  sport: "squash",
  bestOf: 1,
  deuceMode: "advantage",
  thirdSet: "fullSet",
  squashMode: "par",
  squashTarget: 11,
  squashTiebreak: "winByTwo",
  firstServe: "A",
};

/** Points won in order, each `gaps[i]` seconds after the one before. */
function timed(winners: string, gaps: readonly number[]): PointEvent[] {
  let at = 0;
  return [...winners].map((winner, index) => {
    at += (gaps[index] ?? 10) * 1000;
    return { winner: (winner === "A" ? "A" : "B") satisfies TeamId, at };
  });
}

describe("rallyLengths", () => {
  it("times each rally from the point before and skips the first of each game", () => {
    // Game one: A A A A; game two opens after a 60 s changeover: B B.
    const lengths = rallyLengths(padel, timed("AAAABB", [5, 12, 20, 8, 60, 15]), "A");

    expect(lengths.rallies).toEqual([
      { ms: 12_000, won: true },
      { ms: 20_000, won: true },
      { ms: 8000, won: true },
      { ms: 15_000, won: false },
    ]);
    expect(lengths.tooShort).toBe(0);
    expect(lengths.tooLong).toBe(0);
  });

  it("leaves out double taps", () => {
    const lengths = rallyLengths(padel, timed("ABAB", [5, 12, 1, 9]), "B");

    expect(lengths.rallies.map((rally) => rally.ms)).toEqual([12_000, 9000]);
    expect(lengths.tooShort).toBe(1);
    expect(MIN_RALLY_MS).toBe(4000);
  });

  it("leaves out a break far longer than the rest of the match, but keeps a long rally", () => {
    // One PAR game to 11 alternating points, so every rally after the first is timed.
    const lengths = rallyLengths(
      par,
      timed("ABABABABABAB", [5, 10, 12, 11, 13, 10, 12, 55, 11, 170, 12, 13]),
      "A",
    );
    const kept = lengths.rallies.map((rally) => rally.ms);

    expect(kept).toContain(55_000);
    expect(kept).not.toContain(170_000);
    expect(lengths.tooLong).toBe(1);
  });

  it("keeps everything under three minutes when there are too few rallies to judge", () => {
    const lengths = rallyLengths(par, timed("ABAB", [5, 11, 150, 14]), "A");

    expect(lengths.rallies.map((rally) => rally.ms)).toEqual([11_000, 150_000, 14_000]);
  });

  it("ignores anything scored after the match is won", () => {
    const lengths = rallyLengths(par, timed("A".repeat(13), []), "A");

    // Eleven points win the game; the first opens it and the last two came after.
    expect(lengths.rallies).toHaveLength(10);
  });
});

describe("summarizeRallies", () => {
  it("needs a handful of rallies", () => {
    expect(summarizeRallies([{ ms: 10_000, won: true }])).toBeUndefined();
  });

  it("splits at the typical rally and counts what you won in each half", () => {
    const summary = summarizeRallies([
      { ms: 6000, won: true },
      { ms: 8000, won: true },
      { ms: 10_000, won: false },
      { ms: 14_000, won: false },
      { ms: 20_000, won: true },
      { ms: 30_000, won: false },
    ]);

    expect(summary?.medianMs).toBe(12_000);
    expect(summary?.averageMs).toBeCloseTo(14_666.67, 1);
    expect(summary?.longestMs).toBe(30_000);
    expect(summary?.short).toEqual({ won: 2, of: 3 });
    expect(summary?.long).toEqual({ won: 1, of: 3 });
  });
});

describe("labels", () => {
  it("reads seconds, then minutes", () => {
    expect(rallyLengthLabel(14_400)).toBe("14s");
    expect(rallyLengthLabel(65_000)).toBe("1:05");
  });

  it("says what was left out, and nothing when nothing was", () => {
    expect(leftOutLabel({ rallies: [], tooShort: 0, tooLong: 0 })).toBeUndefined();
    expect(leftOutLabel({ rallies: [], tooShort: 2, tooLong: 1 })).toBe(
      "2 under 4s left out as likely double taps · 1 left out as a break, not a rally.",
    );
  });

  it("adds up across matches", () => {
    const total = addRallies(
      { rallies: [{ ms: 9000, won: true }], tooShort: 1, tooLong: 0 },
      { rallies: [{ ms: 7000, won: false }], tooShort: 0, tooLong: 2 },
    );

    expect(total.rallies).toHaveLength(2);
    expect(total.tooShort).toBe(1);
    expect(total.tooLong).toBe(2);
  });
});

/** Rallies in play order, from a list of `[seconds, won]` pairs. */
function rallySeries(series: readonly (readonly [number, boolean])[]): Rally[] {
  return series.map(([seconds, won]) => ({ ms: seconds * 1000, won }));
}

describe("rallyMoments", () => {
  it("says nothing without enough rallies to summarise", () => {
    expect(
      rallyMoments(
        rallySeries([
          [8, true],
          [9, false],
          [30, true],
        ]),
      ),
    ).toEqual([]);
  });

  it("says nothing when no rally stands out", () => {
    const quiet = rallySeries([
      [8, true],
      [9, false],
      [10, true],
      [11, true],
      [12, false],
      [13, true],
    ]);

    expect(rallyMoments(quiet)).toEqual([]);
  });

  it("names a clear edge in the long rallies, and that you are weaker in the short ones", () => {
    // Short (up to 12s): won 2 of 7. Long (over 12s): won 5 of 6. Interleaved, so no run.
    const moments = rallyMoments(
      rallySeries([
        [6, true],
        [13, true],
        [7, true],
        [14, true],
        [8, false],
        [15, true],
        [9, false],
        [16, true],
        [10, false],
        [17, true],
        [11, false],
        [17, false],
        [12, false],
      ]),
    );

    expect(moments).toEqual([
      {
        key: "rally-edge",
        text: "You won 5 of 6 rallies over 12s, but only 2 of 7 up to 12s.",
        good: false,
      },
    ]);
  });

  it("names the reverse edge, where you do better in the short rallies", () => {
    const moments = rallyMoments(
      rallySeries([
        [6, true],
        [13, true],
        [7, true],
        [14, false],
        [8, true],
        [15, false],
        [9, true],
        [16, true],
        [10, true],
        [17, false],
        [11, false],
        [17, false],
        [12, false],
      ]),
    );

    expect(moments).toEqual([
      {
        key: "rally-edge",
        text: "You won 5 of 7 rallies up to 12s, but only 2 of 6 over 12s.",
        good: false,
      },
    ]);
  });

  it("names the longest rally when it is well clear of the typical one, and who won it", () => {
    // Median 10s; the 40s rally is four times that and went to them.
    const moments = rallyMoments(
      rallySeries([
        [8, true],
        [9, false],
        [10, true],
        [10, false],
        [11, true],
        [12, false],
        [40, false],
      ]),
    );

    expect(moments).toEqual([
      { key: "rally-longest", text: "They won the longest rally at 40s.", good: false },
    ]);
  });

  it("names a run of long rallies won in a row", () => {
    const moments = rallyMoments(
      rallySeries([
        [8, true],
        [9, false],
        [10, true],
        [11, false],
        [12, true],
        [13, true],
        [14, true],
      ]),
    );

    expect(moments).toEqual([
      {
        key: "rally-edge",
        text: "You won 3 of 3 rallies over 11s and 2 of 4 up to 11s.",
        good: true,
      },
      { key: "rally-run", text: "You won 3 rallies over 11s in a row.", good: true },
    ]);
  });

  it("keeps the two strongest lines, longest first", () => {
    // Median 10s. Long: won 3 of 4, including a run of three. Short: won 1 of 5.
    // The 40s rally is the strongest line, then the edge; the run is left out.
    const moments = rallyMoments(
      rallySeries([
        [6, false],
        [7, false],
        [8, true],
        [9, false],
        [10, false],
        [11, true],
        [12, true],
        [13, true],
        [40, false],
      ]),
    );

    expect(moments.map((moment) => moment.key)).toEqual(["rally-longest", "rally-edge"]);
    expect(moments[1]?.text).toBe("You won 3 of 4 rallies over 10s, but only 1 of 5 up to 10s.");
  });
});
