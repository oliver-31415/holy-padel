import type { MatchConfig, PointEvent, TeamId } from "@holy-padel/scoring";
import type { NewMatch, SqlDriver } from "../src/index.ts";
import { appendEvent, createMatch, createPlayer, migrate } from "../src/index.ts";
import { memoryDriver } from "./memory-driver.ts";

export const CONFIG: MatchConfig = {
  bestOf: 3,
  deuceMode: "advantage",
  thirdSet: "superTieBreak",
  firstServe: "A",
};

export const ROSTER = ["nico", "javi", "marta", "leo", "ana", "pablo"] as const;

let now = 1_700_000_000_000;

export function nextTimestamp(): number {
  now += 60_000;
  const stamp: number = now;
  return stamp;
}

/** A migrated database seeded with the design's six players; nico owns it. */
export function seededDriver(): SqlDriver {
  const driver = memoryDriver();
  migrate(driver);
  for (const name of ROSTER) {
    const owner =
      name === "nico" ? { isOwner: true, club: "Club Padel Norte", side: "left" as const } : {};
    createPlayer(driver, {
      id: name,
      name: name.charAt(0).toUpperCase() + name.slice(1),
      createdAt: nextTimestamp(),
      ...owner,
    });
  }
  return driver;
}

export function newMatch(id: string, overrides?: Partial<NewMatch>): NewMatch {
  return {
    id,
    config: CONFIG,
    players: { A: ["nico", "javi"], B: ["marta", "leo"] },
    location: "Club Padel Norte",
    startedAt: nextTimestamp(),
    ...overrides,
  };
}

/** Store a match and its points; pattern letters are the rally winners. */
export function storeMatchWithPoints(driver: SqlDriver, id: string, pattern: string): PointEvent[] {
  createMatch(driver, newMatch(id));
  const events: PointEvent[] = [...pattern].map((letter) => {
    if (letter !== "A" && letter !== "B") {
      throw new Error(`bad pattern letter: ${letter}`);
    }
    const winner: TeamId = letter;
    return { winner, at: nextTimestamp() };
  });
  for (const event of events) {
    appendEvent(driver, id, event);
  }
  return events;
}
