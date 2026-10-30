// API pública del motor de partido.

export * from './types.ts'
export { simulateMatch, MatchRunner, type SimulateOpts, type MatchSnapshot } from './matchEngine.ts'
export { runBatch, createStreamingRunner, type StreamingRunner } from './runner.ts'
export { buildMatchTeam, computeTeamRating, pickStartingXV, computePlayerOverall, depthAdjustment } from './teamRating.ts'
export {
  type CompetitionLevel, type LevelParams,
  competitionLevel, paramsForLevel, DEFAULT_LEVEL
} from './levels.ts'
export {
  computeRugbyAttrs, computeUnitIndices, tierFor, coreAttrsOrdered, dominantSpecialist,
  RUGBY_ATTR_LABELS, RUGBY_ATTR_SHORT, CORE_ATTR_KEYS, SPECIALIST_ATTR_KEYS, POSITION_TIER_MATRIX,
  type RugbyAttrs, type RugbyAttrKey, type Tier, type UnitIndices
} from './rugbyAttributes.ts'
export { createRNG } from './rng.ts'
export { generateFixtures } from './fixtures.ts'
export { computeStandings, findPosition, type StandingsRow } from './standings.ts'
export {
  simulateRound, simulateScheduledMatchesUntil, getCurrentRound, totalRounds,
  getNextMatch, getLastMatch, getLastWeeklyReport,
  commitLivedMatch, fixtureSimOptions, buildTeamsForMatch, simulateSingleMatchWithLineup,
  type FixtureSimOptions
} from './season.ts'
export { attributePlayerStats, autoSubsFor, type SubLog } from './playerMatchStats.ts'
export { pickAutoBench, type BuildMatchTeamOpts } from './teamRating.ts'
export type { WeeklyReport, WeeklyEvent } from './weekly.ts'
export { applyMonthlyFinances, getLastMonthlyReport, type MonthlyReport, type MonthlyMovement } from './finances.ts'
export { expectedScore, marginMultiplier, eloDelta, applyEloDelta, ELO_HOME_ADVANTAGE } from './elo.ts'
export { simulateBatch, type MatchPrediction } from './monteCarlo.ts'
export { placeKickProb } from './placeKick.ts'
export { expectedPoints, decidePenaltyOption, shouldAttemptDropGoal, type PenaltyDecision, type TryBonusRule } from './expectedPoints.ts'
export {
  verifyCalibration, formatCalibrationRow, type CalibrationRow,
  verifyCalibrationReport, marginsMatchLevelTarget,
  type CalibrationReport, type MarginBin, type VerifyOpts
} from './calibration.ts'
export { createLiveSim, type LiveSim } from './liveRunner.ts'
export * from './live/index.ts'
export { penaltyChoices, type PenaltyChoices } from './phases.ts'
