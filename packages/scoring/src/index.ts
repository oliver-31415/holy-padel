export { computeMatch, replayMatch, undoLastPoint } from "./engine.ts";
export { statusLabel, watchStatusLabel } from "./labels.ts";
export type { OutcomeSnapshot } from "./outcome.ts";
export { outcomeWinner } from "./outcome.ts";
export {
  EXTENDED_SET_TARGET,
  GAME_TARGET,
  otherTeam,
  SET_TARGET,
  SUPER_TIE_BREAK_TARGET,
  TIE_BREAK_TARGET,
  tieBreakServer,
} from "./rules.ts";
export type { GameKind, GameRecord, MatchStats, ServiceRecord, SetStats } from "./stats.ts";
export { computeStats } from "./stats.ts";
export type {
  CurrentGame,
  DeuceMode,
  MatchConfig,
  MatchSnapshot,
  Moment,
  PbTiebreak,
  PointCall,
  PointEvent,
  SetSummary,
  SquashServeBoxes,
  SquashTiebreak,
  TeamId,
  TeamValues,
  ThirdSetMode,
  TieBreakKind,
} from "./types.ts";
