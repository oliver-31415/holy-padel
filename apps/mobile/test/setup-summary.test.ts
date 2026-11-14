import type { MatchSummary, NewMatchDefaults } from "@holy-padel/db";
import { pickDefaults } from "@holy-padel/db";
import { describe, expect, it } from "vitest";
import { sameSetup, setupSummary, setupTitle } from "../src/lib/format.ts";
import { recentOpponents } from "../src/lib/recent-opponents.ts";

const PADEL: NewMatchDefaults = {
  ...pickDefaults(undefined),
  sport: "padel",
  format: "doubles",
  bestOf: 3,
  thirdSet: "superTieBreak",
  deuceMode: "advantage",
  firstServe: "undecided",
};

describe("setupSummary", () => {
  it("describes a padel setup", () => {
    expect(setupSummary(PADEL)).toEqual([
      "Best of 3",
      "Super TB decider",
      "Advantage",
      "Serve: toss",
    ]);
  });

  it("describes a full-third-set padel setup with a decided serve", () => {
    expect(
      setupSummary({ ...PADEL, thirdSet: "fullSet", deuceMode: "goldenPoint", firstServe: "B" }),
    ).toEqual(["Best of 3", "Full set decider", "Golden pt", "Serve: Team B"]);
  });

  it("drops the decider pill for a single set", () => {
    expect(setupSummary({ ...PADEL, bestOf: 1 })).toEqual([
      "Best of 1",
      "Advantage",
      "Serve: toss",
    ]);
  });

  it("describes a squash setup", () => {
    const squash: NewMatchDefaults = {
      ...PADEL,
      sport: "squash",
      format: "singles",
      squashMode: "par",
      squashTarget: 11,
      squashTiebreak: "winByTwo",
      squashServeBoxes: "player",
    };
    expect(setupSummary(squash)).toEqual(["PAR to 11", "Best of 3", "Win by 2", "Box: auto"]);
  });

  it("labels a squash choice tie-break by its target", () => {
    const squash: NewMatchDefaults = {
      ...PADEL,
      sport: "squash",
      squashMode: "hiho",
      squashTarget: 11,
      squashTiebreak: "choice",
      squashServeBoxes: "left",
    };
    expect(setupSummary(squash)).toEqual(["HIHO to 11", "Best of 3", "Ask at 10", "Box: left"]);
  });

  it("describes a pickleball setup", () => {
    const pb: NewMatchDefaults = {
      ...PADEL,
      sport: "pickleball",
      pbTarget: 11,
      pbTiebreak: "winByTwo",
      firstServe: "A",
    };
    expect(setupSummary(pb)).toEqual(["To 11", "Best of 3", "Win by 2", "Serve: Team A"]);
  });

  it("titles the summary with the sport and format", () => {
    expect(setupTitle(PADEL)).toBe("Padel · Doubles");
    expect(setupTitle({ ...PADEL, sport: "squash", format: "singles" })).toBe("Squash · Singles");
  });

  it("compares setups field by field", () => {
    expect(sameSetup(PADEL, { ...PADEL })).toBe(true);
    expect(sameSetup(PADEL, { ...PADEL, bestOf: 5 })).toBe(false);
  });
});

const NAMES: Record<string, string> = {
  nico: "Nico",
  javi: "Javi",
  marta: "Marta",
  leo: "Leo",
  ana: "Ana",
  pablo: "Pablo",
  carla: "Carla",
  hugo: "Hugo",
};

/** The summary carries display names (not ids) from the joined match row. */
function displayName(id: string): string {
  return NAMES[id] ?? id;
}

function matchConfig(
  sport: "padel" | "squash" | "pickleball",
  format: "singles" | "doubles",
): MatchSummary["config"] {
  if (sport === "pickleball") {
    return {
      sport,
      bestOf: 3,
      deuceMode: "advantage",
      thirdSet: "superTieBreak",
      firstServe: "A",
      pbType: format,
      pbTarget: 11,
      pbTiebreak: "winByTwo",
    };
  }
  if (sport === "squash") {
    return {
      sport,
      bestOf: 3,
      deuceMode: "advantage",
      thirdSet: "fullSet",
      firstServe: "A",
      squashMode: "par",
      squashTarget: 11,
      squashTiebreak: "winByTwo",
    };
  }
  return { sport, bestOf: 3, deuceMode: "advantage", thirdSet: "superTieBreak", firstServe: "A" };
}

function match(
  id: string,
  sport: "padel" | "squash" | "pickleball",
  a: readonly [string, string | undefined],
  b: readonly [string, string | undefined],
): MatchSummary {
  return {
    id,
    status: "finished",
    config: matchConfig(sport, a[1] === undefined ? "singles" : "doubles"),
    players: { A: a, B: b },
    names: {
      A: [displayName(a[0]), a[1] === undefined ? undefined : displayName(a[1])],
      B: [displayName(b[0]), b[1] === undefined ? undefined : displayName(b[1])],
    },
    location: undefined,
    startedAt: 0,
    endedAt: 1,
    winner: "A",
    scoreLine: "6-0",
    pausedMs: 0,
    pausedAt: undefined,
    pendingGameSet: undefined,
    note: undefined,
  };
}

/** A doubles pair literal; the name avoids Biome's React-component heuristic. */
function pairOf(...ids: readonly [string, string]): readonly [string, string] {
  return ids;
}

describe("recentOpponents", () => {
  it("lists recent distinct doubles pairs newest first", () => {
    const matches = [
      match("m1", "padel", pairOf("nico", "javi"), pairOf("marta", "leo")),
      match("m2", "padel", pairOf("nico", "javi"), pairOf("ana", "pablo")),
      match("m3", "padel", pairOf("nico", "ana"), pairOf("leo", "marta")),
      match("m4", "padel", pairOf("nico", "javi"), pairOf("carla", "hugo")),
    ];
    // m3 lists the same pair as m1 (order-independent) so it dedupes.
    const rivals = recentOpponents(matches, "nico", "doubles");
    expect(rivals.map((entry) => entry.label)).toEqual([
      "Marta & Leo",
      "Ana & Pablo",
      "Carla & Hugo",
    ]);
    expect(rivals[0]?.playerIds).toEqual(["marta", "leo"]);
  });

  it("only returns opponents for the requested format", () => {
    const matches = [
      match("d1", "padel", pairOf("nico", "javi"), pairOf("marta", "leo")),
      match("s1", "squash", ["nico", undefined], ["ana", undefined]),
    ];
    expect(recentOpponents(matches, "nico", "singles").map((entry) => entry.label)).toEqual([
      "Ana",
    ]);
    expect(recentOpponents(matches, "nico", "doubles").map((entry) => entry.label)).toEqual([
      "Marta & Leo",
    ]);
  });

  it("finds the opponents even when the owner is on team B", () => {
    const matches = [match("m1", "padel", pairOf("marta", "leo"), pairOf("nico", "javi"))];
    expect(recentOpponents(matches, "nico", "doubles").map((entry) => entry.label)).toEqual([
      "Marta & Leo",
    ]);
  });

  it("caps the list at the limit", () => {
    const matches = Array.from({ length: 6 }, (_, index) =>
      match(`m${String(index)}`, "padel", pairOf("nico", "javi"), [
        `p${String(index)}a`,
        `p${String(index)}b`,
      ]),
    );
    expect(recentOpponents(matches, "nico", "doubles", 4)).toHaveLength(4);
  });

  it("returns nothing for an empty ledger", () => {
    expect(recentOpponents([], "nico", "doubles")).toEqual([]);
  });
});
