import type { SqlDriver, SqlRow, SqlValue } from "@holy-padel/db";
import { migrate, repairEarlyStopWinners, repairMissingEvents } from "@holy-padel/db";
import type { SQLiteDatabase } from "expo-sqlite";
import { openDatabaseAsync } from "expo-sqlite";
import { settleLiveMatches } from "@/lib/match-actions.ts";
import { seedIfEmpty } from "./seed.ts";

/** Adapt expo-sqlite's synchronous API to the db package's driver. */
export function expoDriver(database: SQLiteDatabase): SqlDriver {
  return {
    execute: (sql: string, params: readonly SqlValue[] = []): void => {
      database.runSync(sql, [...params]);
    },
    queryAll: (sql: string, params: readonly SqlValue[] = []): SqlRow[] =>
      database.getAllSync<SqlRow>(sql, [...params]),
  };
}

/**
 * Open (and migrate) the one local database. The open is asynchronous — on web
 * the sqlite worker must boot before the synchronous query bridge can be used.
 *
 * The demo ledger is seeded only when EXPO_PUBLIC_SEED_DEMO is set (the e2e
 * suite's fixture); real installs start empty.
 */
export async function openAppDatabase(): Promise<SqlDriver> {
  const database = await openDatabaseAsync("holy-padel.db");
  const driver = expoDriver(database);
  migrate(driver);
  // Matches whose rallies were lost (e.g. a device restore) get their ledgers
  // replayed from the cached score line so graphs and stats work again.
  repairMissingEvents(driver);
  repairEarlyStopWinners(driver);
  // Decided-but-unsaved and orphaned "live" matches get their results saved.
  settleLiveMatches(driver);
  // biome-ignore lint/style/noProcessEnv: Expo inlines EXPO_PUBLIC_* at bundle time
  // biome-ignore lint/correctness/noProcessGlobal: Expo's standard env access
  // biome-ignore lint/complexity/useLiteralKeys: tsc requires the index form
  if (process.env["EXPO_PUBLIC_SEED_DEMO"] === "1") {
    seedIfEmpty(driver);
  }
  return driver;
}
