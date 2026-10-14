// La puerta del feature. `app/**` importa de acá y nunca de un archivo interno.
//
// Regla de dependencia: `engine/**` no importa nada de `app/**` ni de React. El
// motor tiene que poder correr en un test de Node sin DOM.

export type {
    BenchCoach,
    BoardReview,
    ClubProject,
    Coach,
    CoachAttributes,
    CoachState,
    ClubFinances,
    ClubRuntime,
    CostCutId,
    DealKind,
    DebtStatus,
    DecisionLogEntry,
    FinanceState,
    GonePlayer,
    HalfAdjustId,
    ImpactChip,
    InSeason,
    InjuryNote,
    JobOffer,
    KeyFirstHalf,
    KeyMatch,
    KeyPlanId,
    KnockoutRun,
    KnockoutStage,
    KnockoutTie,
    LineupPolicy,
    MarketNews,
    MarketState,
    MatchOutcome,
    MatchResult,
    Objective,
    ObjectiveAxis,
    ObjectiveKind,
    ObjectiveMeasure,
    ObjectiveResult,
    PendingPlayoff,
    PendingReveal,
    Personality,
    Phase,
    PlayerDeal,
    PlayerStats,
    PlayoffApproachId,
    PositionGroup,
    ProjectKind,
    ProjectSnapshot,
    SeasonEntry,
    SeasonFinance,
    SeasonMods,
    SeasonObjective,
    SeasonStar,
    SeasonStars,
    SquadPlayer,
    TableRow,
    TrainingDay,
    TrainingFocus,
    TrainingLoad,
    TrainingPlan,
    TrainingWeek,
    UnionLoan,
    VacancyReason,
} from './types/coach.ts';
export { ENGINE_VERSION } from './types/coach.ts';

export type {
    CoachEffect,
    CoachEvent,
    CoachOption,
    CoachOutcome,
    EventFamily,
    EventRequirements,
} from './types/event.ts';
export { FAMILY_PREFIX } from './types/event.ts';

export type { ClubDef } from './data/clubs.ts';
export { CLUBS, CLUB_CATALOG_VERSION, CLUB_CRESTS, LEGACY_CLUB_IDS, codeOf, getClub } from './data/clubs.ts';
export { CLUB_META_PENDING } from './data/club-meta.generated.ts';

export type { RegionDef, UnionDef } from './data/geo.generated.ts';
export { GEO_VERSION, REGIONS, UNIONS, getRegion, getUnion } from './data/geo.generated.ts';

export type { CompetitionDef } from './data/competitions.ts';
export {
    COMPETITIONS,
    COMPETITION_CATALOG_VERSION,
    NACIONAL_ID,
    TDI_A_ID,
    TDI_TEAMS,
    MIN_LEAGUE_TEAMS,
    UNPLAYABLE_COMPETITIONS,
    URBA_TOP_ID,
    competitionName,
    fechasOf,
    regionName,
    getCompetition,
    tierAbove,
    tierBelow,
} from './data/competitions.ts';

export type { FormatEdition, PromotionRule, TitleRule } from './data/formats.ts';
export {
    FORMATS_VERSION,
    FORMAT_EDITIONS,
    formatFor,
    formatSummary,
    promotionSlotsOf,
    promotionSummary,
    relegationSlotsOf,
    relegationSummary,
    titleSeedsOf,
} from './data/formats.ts';

export type { CoachProfile } from './data/profiles.ts';
export { COACH_PROFILES, PROFILE_POINTS, TUNE_RANGE, getProfile, tuneAttrs } from './data/profiles.ts';

export type { UpgradeDef, UpgradeId } from './data/upgrades.ts';
export { UPGRADES, UPGRADE_EFFECT, UPGRADE_MAX_LEVEL, UPGRADE_UPKEEP_FRACTION, getUpgrade } from './data/upgrades.ts';
export type { UpgradeBlock } from './engine/upgrades.ts';
export {
    buyUpgrade,
    upgradeBlock,
    upgradeCost,
    upgradeEffect,
    upgradeLevel,
    upgradeLevels,
    upkeepOf,
    upkeepStep,
} from './engine/upgrades.ts';

export type { ProStatus } from './data/professionalism.ts';
export {
    COACHING_STAFF_ANNUAL,
    PAY_REFERENCE,
    PROFESSIONALISM_VERSION,
    STATUS_LABEL,
    statusOf,
} from './data/professionalism.ts';

export type { CostCutOption, DebtRestrictions, DebtSettlement, DebtView, FinanceAction, LoanOffer } from './engine/finance.ts';
export {
    COST_CUTS,
    EMPTY_FINANCE,
    LOAN_RATE,
    LOAN_SEASONS,
    activeCuts,
    advanceDues,
    advanceOffer,
    advancedDues,
    benefitEvent,
    benefitOffer,
    budgetOf,
    cutCosts,
    debtRank,
    debtState,
    financeActionBlock,
    graveStreak,
    loanOffer,
    netDebt,
    settleDebt,
    takeUnionLoan,
} from './engine/finance.ts';

export type { ObjectiveEffects, SeasonFacts } from './engine/objectives.ts';
export {
    OBJECTIVE_WEIGHTS,
    PROJECT_SEASONS,
    advanceProject,
    directRival,
    evaluateObjectives,
    isOwnProduct,
    measureObjective,
    nextProject,
    seasonObjectives,
} from './engine/objectives.ts';

export type { ClubOffer, OfferTier } from './engine/offers.ts';
export { jobOffers, offerFor, reachableLevel, startingOffers, tierOf } from './engine/offers.ts';

export type { PlayerProfile } from './engine/market.ts';
export { MAX_OFFERS, formScore, marketTick, playerInterest, requiredRep } from './engine/market.ts';

export type { BoardObjective } from './engine/board.ts';
export { BOARD_WEIGHTS, CANTERA_MAX_AGE, boardObjectives, boardReview, boardWord, youthInSquad } from './engine/board.ts';

export { ALL_EVENTS, EVENTS_VERSION, getEvent } from './data/events/index.ts';

export type { WorldState } from './engine/world.ts';
export { clubsIn, levelOf, repairWorld, seedWorld, selectableClubs } from './engine/world.ts';

export { sanitizeCoach } from './engine/sanitize.ts';

export { createRng, hashSeed, rngFromState } from './engine/random.ts';

export type { SeasonBudget } from './engine/economy.ts';
export {
    debtLevel,
    debtMonths,
    formatMoney,
    initialFinances,
    seasonBudget,
    sociosOf,
} from './engine/economy.ts';

export { FIRING_PRESSURE, INITIAL_PRESSURE, objectiveFor, pressureBand } from './engine/pressure.ts';

export { CARDS_PER_TRAMO, DECISIONS_PER_SEASON, optionPreview } from './engine/event-selector.ts';

export type { WeekEffect } from './engine/training.ts';
export {
    DEFAULT_TRAINING,
    LINEUP_POLICIES,
    TRAINING_DAYS,
    TRAINING_FOCUSES,
    TRAINING_LOADS,
    planOf,
    rivalWeakness,
    validTraining,
    weekEffect,
} from './engine/training.ts';

export type { Matchday, MatchdaySlot } from './engine/lineup.ts';
export { formativeYouthOnly, isFormativeOwn, matchday } from './engine/lineup.ts';

export type { Fixture } from './engine/tramos.ts';
export {
    HALF_ADJUSTS,
    KEY_PLANS,
    TRAMOS,
    halfAdjustChances,
    keyPlanChances,
    myFixtures,
    ownStarts,
    seasonFixture,
    squadTotals,
    todayOf,
    totalRounds,
    tramoRange,
    upcomingKeyRival,
    xvFatigueOf,
} from './engine/tramos.ts';

export { decisionImpact, revealTone } from './engine/impact.ts';

export {
    SQUAD_SIZE,
    completePlayer,
    marketValue,
    payrollOf,
    benchImpact,
    clubRatingOf,
    hasFrontRowCover,
    isForward,
    isFrontRowShirt,
    playerLevelOf,
    startingXV,
    teamRating,
} from './engine/squad.ts';

export {
    FIRST_YEAR,
    acceptOffer,
    acknowledgeReveal,
    beginDecisions,
    chooseOption,
    closeSeason,
    createCareer,
    currentFormat,
    declineOffer,
    mySideOf,
    nextTramo,
    playKeyFirstHalf,
    playKeySecondHalf,
    playPlayoffMatch,
    playSeason,
    reachedTdi,
    redrawPending,
    retire,
    setTrainingDefault,
    simulateTramo,
    submitTraining,
    takeNewClub,
    withSeasonPlan,
} from './engine/run-season.ts';

export { qualifiesForTdi } from './engine/knockout.ts';

export type { PlayoffApproach } from './engine/playoff.ts';
export { PLAYOFF_APPROACHES, playoffChances } from './engine/playoff.ts';

export { directPromoted, movementOf, reducidoSeeds, sortTable, titleSeeds } from './engine/season.ts';
export { stagePairs } from './engine/bracket.ts';
export { bonusDefensive, bonusOffensive } from './engine/match.ts';

export type {
    ActiveNegotiation,
    ArrivalCandidate,
    ExitRequest,
    LoanedPlayer,
    Negotiation,
    NegotiationReply,
    NegotiationRound,
    NegotiationTarget,
    OfferRoute,
    OfferedDeal,
    PlayerOffer,
    TransferLogEntry,
    TransferState,
    WindowKind,
} from './types/coach.ts';
export { closeMarketWindow } from './engine/run-season.ts';
export type { ClubInfo, FeeTerms, ForeignClub, FormRef, Inclination, RetainTerms } from './engine/transfers.ts';
export {
    ABROAD_SHARE,
    ARRIVALS,
    EMPTY_TRANSFERS,
    MAX_OFFERS as TRANSFER_MAX_OFFERS,
    OFFERED_DEAL_LABEL,
    SQUAD_MAX,
    SQUAD_MIN,
    acceptPlayerOffer,
    clubAttraction,
    clubInfo,
    closeWindow,
    dealWords,
    denyRequest,
    dismissCandidate,
    expiringPlayers,
    feeIsReal,
    feeNegotiationBlock,
    feeWords,
    grantRequest,
    inclinationWord,
    letExpire,
    loanBlock,
    loanDestination,
    loanEligible,
    loanPlayer,
    negotiationAcceptCounter,
    negotiationOffer,
    negotiationWalkAway,
    openFeeNegotiation,
    openRenewalNegotiation,
    openSigningNegotiation,
    rejectPlayerOffer,
    releaseBlock,
    releaseCost,
    releasePlayer,
    renewAllAtAsk,
    renewAtAsk,
    renewBlock,
    renewalAsk,
    renewalNegotiationBlock,
    retainBlock,
    retainPlayer,
    retainTerms,
    rosterSize,
    routeWords,
    signBlock,
    signCandidate,
    signingNegotiationBlock,
    viaticoReference,
} from './engine/transfers.ts';
export type { NegotiationSpec } from './engine/negotiation.ts';
export { REPLY_TEXT, acceptCounter, makeOffer, patienceWord, replyFor, startNegotiation, walkAway } from './engine/negotiation.ts';
export { TRANSFER_PATHWAYS, TRANSFER_PATHWAYS_VERSION, getPathway } from './data/transfer-pathways.ts';

export type {
    AcademyLogEntry,
    AcademyPlayer,
    AcademyState,
    DevPlan,
    ScoutCandidate,
    ScoutingDay,
} from './types/coach.ts';
export {
    ACADEMY_LOANS,
    ACADEMY_MAX,
    ACADEMY_MAX_AGE,
    ACADEMY_MIN,
    AUTO_MIN_AGE,
    DEV_PLANS,
    EMPTY_ACADEMY,
    PROMOTE_MIN_AGE,
    SCOUT_PICKS,
    academyNews,
    currentScouting,
    estimateOf,
    estimateWords,
    finishScouting,
    kidLoanDestination,
    loanKid,
    loanKidBlock,
    observationPoints,
    observeBlock,
    observeCandidate,
    promoteBlock,
    promoteKid,
    promotionsIn,
    readyKids,
    releaseKid,
    releaseKidBlock,
    scoutSignBlock,
    seedAcademy,
    setDevPlan,
    signScout,
    toggleReserve,
} from './engine/academy.ts';
export type { FormativeKind } from './engine/objectives.ts';
export { formativeKind } from './engine/objectives.ts';
