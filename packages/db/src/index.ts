export type { BackupData, BackupRow } from "./backup.ts";
export { exportBackup, importBackup, parseBackup } from "./backup.ts";
export type { SqlDriver, SqlRow, SqlValue } from "./driver.ts";
export { inTransaction } from "./driver.ts";
export type { HeartRateSample } from "./heart-rate.ts";
export { loadMatchHeartRate, saveMatchHeartRate } from "./heart-rate.ts";
export { createMatch } from "./match-config.ts";
export type { MatchDraft, NewMatchDefaults } from "./match-defaults.ts";
export {
  clearMatchDraft,
  DRAFT_TTL_MS,
  loadMatchDefaults,
  loadMatchDraft,
  parseNewMatchDefaults,
  pickDefaults,
  resolveNewMatchDefaults,
  saveMatchDefaults,
  saveMatchDraft,
} from "./match-defaults.ts";
export type { MatchPreset } from "./match-presets.ts";
export {
  deleteMatchPreset,
  loadLastSetup,
  loadMatchPresets,
  saveLastSetup,
  saveMatchPreset,
} from "./match-presets.ts";
export type {
  MatchStatus,
  MatchSummary,
  NewMatch,
  StoredMatch,
  TeamPlayers,
} from "./match-types.ts";
export {
  appendEvent,
  appendEvents,
  appendServeEvent,
  countMatches,
  deleteMatch,
  finishMatch,
  getLiveMatch,
  getMatch,
  listMatches,
  loadEvents,
  pauseMatch,
  removeLastEvent,
  reopenMatch,
  resumeMatch,
  scorePoint,
  setFinishedWinner,
  setMatchNote,
  setPendingGameSet,
  updateFirstServe,
} from "./matches.ts";
export type { MotionSample } from "./motion.ts";
export { loadMatchMotion, parseMotionSamples, saveMatchMotion } from "./motion.ts";
export type { MatchTogether, PlayerStats } from "./player-stats.ts";
export { computePlayerStats } from "./player-stats.ts";
export type { CourtSide, NewPlayer, Player, PlayerDeleteMode, RosterEntry } from "./players.ts";
export {
  countPlayerMatches,
  createPlayer,
  deletePlayer,
  getOwner,
  getPlayer,
  listPlayers,
  listRoster,
  REMOVED_PLAYER_ID,
  updatePlayer,
} from "./players.ts";
export type {
  HeadToHeadRecord,
  LifetimePoints,
  Outcome,
  PartnerRecord,
  PointsTotals,
  ProfileStats,
  WinLoss,
} from "./profile.ts";
export { computePointsTotals, computeProfileStats, outcomeFor } from "./profile.ts";
export { repairEarlyStopWinners, repairMissingEvents } from "./repair.ts";
export { databaseSizeBytes, migrate } from "./schema.ts";
export { getSetting, setSetting } from "./settings.ts";
