// API pública del motor de Carrera de Rugby. La UI (fase siguiente) consume
// desde acá; el motor no depende de React ni de la red.

export type {
    Player, Position, PositionGroup, Attributes, AttributeKey, Dynamics, PlayerRole, Injury,
    EligibilityClaim, EligibilityRoute,
} from './types/player.ts';
export type { SeasonResult, SeasonStats, LeagueStanding, SeasonCompetitionParticipation } from './types/season.ts';
export type { GameEvent, EventOption, EventCategory } from './types/event.ts';
export type { CareerState, CareerSummary, CareerPhase, ClubOffer, ClubSpell, MovementKind } from './types/career.ts';
export { ENGINE_VERSION, MILESTONE_LABELS } from './types/career.ts';
export type { CareerSeasonEntry, CareerMilestone } from './types/career.ts';
export { MOVEMENT_LABELS, movementOptionCopy, movementResultText } from './data/movement-copy.ts';
export { clubLeagueIdentity, isUmbrellaSystem, CAREER_COMPETITION_VERSION, type CompetitionIdentity } from './engine/competition-identity.ts';
export { domesticSystemKey, sameDomesticSystem } from './engine/domestic-system.ts';
export { CAREER_MARKET_VERSION } from './engine/event-selector.ts';
export type { EmploymentStatus, SquadTrack } from './engine/contracts.ts';
export {
    EMPLOYMENT_LABELS, EMPLOYMENT_ORDER, contractLabel, employmentCeiling, employmentRank,
    isProfessionalEmployment, renewContract, resolveContract,
} from './engine/contracts.ts';
export type { EntryMode } from './types/career.ts';
export { CAREER_ENVIRONMENT_VERSION, BY_EMPLOYMENT, DEVELOPMENT_TRACK } from './engine/environment.ts';
export type { EmploymentProfile } from './engine/environment.ts';
export type { CompetitionLevelProfile, EconomicModel, SportingBand } from './data/competition-levels2026.ts';
export {
    COMPETITION_LEVELS, COMPETITION_LEVELS_VERSION, competitionLabelOf, economicModelOf,
    levelProfileOf, profiledCompetitionIds, sportingBandOf,
} from './data/competition-levels2026.ts';

export { POSITIONS, ALL_POSITIONS, getPosition } from './data/positions.ts';
export { ORIGINS, ALL_ORIGINS, getOrigin } from './data/origins.ts';
export { CLUBS, LEAGUES, getClub, clubLeague, clubLevel, clubRegion, CLUB_CATALOG_VERSION } from './data/clubs.ts';
export { ALL_EVENTS } from './data/events/index.ts';
export {
    describePosition,
    describeAllPositions,
    describeOrigin,
    describeAllOrigins,
    ATTRIBUTE_LABELS,
    STAT_LABELS,
    type PositionGuide,
    type OriginGuide,
    type OriginPerk,
    type DominantAttribute,
} from './data/guides.ts';

export type {
    CompetitionDef, CompetitionKind, CompetitionScope, QualificationRule, QualificationCriterion, TitleWon,
} from './data/clubs2026/competitions2026.ts';
export {
    ALL_COMPETITIONS, CUPS, LEAGUES_COMP, MOVEMENTS, PARALLEL_COMPETITIONS, PENDING_QUALIFICATIONS,
    getCompetition, participatingCompetitions, qualifiesFor, transferDestinations,
} from './data/clubs2026/competitions2026.ts';

export { createRng, hashSeed } from './engine/random.ts';
export { createPlayer, type CreatePlayerInput } from './engine/create-player.ts';
export { computeOvr, computeEffectiveOvr } from './engine/scoring.ts';
export { referenceStanding, standingFor } from './engine/competition-results.ts';
export type { EligibilityState } from './types/player.ts';
export {
    ELIGIBILITY_RULES_VERSION, PRESENCE_MONTHS_REQUIRED, REGISTRATION_MONTHS_REQUIRED,
    availableUnions, canRepresent, playerCanRepresent, targetUnion,
} from './engine/eligibility.ts';
export type { SelectableCountry, RugbyUnionMapping } from './data/nations.ts';
export {
    NATIONS_VERSION, SELECTABLE_COUNTRIES, FREQUENT_COUNTRY_CODES, RUGBY_UNIONS, RUGBY_UNION_MAPPINGS,
    countryCodeOfNationality, findCountry, findCountryByName, flagPathOf, hasUnion,
    normalizeSearch, regionOfCountry, searchCountries, unionName,
} from './data/nations.ts';
export {
    TRANSFER_PATHWAYS, TRANSFER_RULES_VERSION, classifyMovement, marketRung, movementBetween,
    pathwayFor, pathwaysFrom, pathwayTargets,
} from './engine/market-routes.ts';
export { getPendingEvent } from './engine/event-selector.ts';
export { buildCareerSummary } from './engine/statistics.ts';
export {
    runCareer, DEFAULT_CHOOSER, firstOptionChooser, stayChooser, acceptBestEligibleOfferChooser,
    type Chooser,
} from './engine/run-career.ts';

export { createInitialCareer, careerReducer } from './state/career-reducer.ts';
export * from './state/career-actions.ts';
