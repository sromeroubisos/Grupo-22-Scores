// API pública del motor de Carrera de Rugby. La UI (fase siguiente) consume
// desde acá; el motor no depende de React ni de la red.

export type {
    Player, Position, PositionGroup, Attributes, AttributeKey, Dynamics, PlayerRole, Injury, Sanction,
    EligibilityClaim, EligibilityRoute,
} from './types/player.ts';
export {
    AXIS_META, VISIBLE_AXES, effectChips, optionPreview, ovrDeltaOf, spreadValoracion, toneOf, visibleChips,
} from './engine/impact.ts';
export type { ImpactAxis, ImpactChip, ImpactTone, OutcomePreview } from './engine/impact.ts';
export {
    adjustShare, applyStatBoost, banFraction, bannedMatches, playingTimeFactor,
} from './engine/season-modifiers.ts';
export { applyDivisionMove, divisionMoveFor, resolveClub } from './engine/promotion.ts';
export type { DivisionMove } from './engine/promotion.ts';
export type { SeasonResult, SeasonStats, LeagueStanding, SeasonCompetitionParticipation } from './types/season.ts';
export type { NationalStatus, NationalTeamStats } from './types/player.ts';
export {
    debutLevel, starterLevel, selectionValue, evaluateNationalTeam,
} from './engine/national-team.ts';
export type { NationalTeamResult, NationalCallContext, SelectionValueBreakdown } from './engine/national-team.ts';
export { worldRankingAt, worldRankingDelta, worldRankingTable } from './engine/world-ranking.ts';
export {
    INTERNATIONAL_CALENDAR_VERSION, INTERNATIONAL_COMPETITIONS, UNIONS_WITH_FIXTURE,
    NATIONS_CHAMPIONSHIP_ID, WORLD_CUP_ID, JULY_WINDOW_ID, NOVEMBER_WINDOW_ID,
    competitionsFor, getInternationalCompetition, internationalMatches, internationalSeason,
    isEditionSeason, isPreWorldCupSeason, isWorldCupYear, playsEndOfYearTour, seasonYear,
} from './data/international-calendar.ts';
export type {
    InternationalCompetitionKind, InternationalCompetition, InternationalSeason, Trophy, TrophyTier,
} from './data/international-calendar.ts';
export { positionScarcity } from './data/positions.ts';
export { POINTS_PER, computePoints, emptyStats } from './types/season.ts';
export type { GameEvent, EventOption, EventCategory } from './types/event.ts';
export type { CareerState, CareerSummary, CareerPhase, ClubOffer, ClubSpell, MovementKind } from './types/career.ts';
export { ENGINE_VERSION, MILESTONE_LABELS, PACE_MODES, SEASONS_PER_DECISION, START_ROUTES } from './types/career.ts';
export type { PaceModeId, StartRouteId } from './types/career.ts';
export type { CareerSeasonEntry, CareerMilestone } from './types/career.ts';
export { MOVEMENT_LABELS, DIRECTION_LABELS, movementOptionCopy, movementResultText, offerReason, stayHint } from './data/movement-copy.ts';
export type { OfferSignals } from './data/movement-copy.ts';
export {
    SQUAD_ROLE_LABELS, matchShareFor, playerRoleAt, playerRoleOf, roleAt,
} from './engine/squad-role.ts';
export type { SquadRole } from './engine/squad-role.ts';
export { clubTenure, tenureCounter, TENURE_TIERS } from './engine/club-tenure.ts';
export type { ClubTenure, TenureTier } from './engine/club-tenure.ts';
export {
    SHARE_TOKEN_VERSION, decodeCareerToken, encodeCareerToken, recipeFromCareer, recipeInput, replayRecipe,
} from './engine/share-token.ts';
export type { CareerRecipe, CareerReceipt, DecodeResult, ReplayResult, ShareIdentity } from './engine/share-token.ts';
export type { OfferPresentation } from './types/event.ts';
export { clubLeagueIdentity, isUmbrellaSystem, CAREER_COMPETITION_VERSION, type CompetitionIdentity } from './engine/competition-identity.ts';
export { domesticSystemKey, sameDomesticSystem } from './engine/domestic-system.ts';
export { CAREER_MARKET_VERSION, familyBoost } from './engine/event-selector.ts';
export type { EventFamily } from './engine/event-selector.ts';
export {
    RETIRE_OPTION_ID,
    RETIREMENT_CHOICE_AGE,
    FORCED_RETIREMENT_AGE,
    retirementIsOptional,
} from './engine/retirement.ts';
export { careerArchetype, allArchetypeIds } from './engine/archetypes.ts';
export { AWARD_FLAGS, AWARD_LABELS, evaluateSeasonAwards } from './engine/awards.ts';
export type { SeasonAwardId, SeasonAwardInput } from './engine/awards.ts';
export type { CareerArchetype, CareerArchetypeId, ArchetypeInput } from './engine/archetypes.ts';
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
    kickAccuracy,
    secondaryStatOf,
    type SecondaryStat,
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

export { createRng, hashSeed, rngFromState } from './engine/random.ts';
export { createPlayer, type CreatePlayerInput } from './engine/create-player.ts';
export { computeOvr, computeEffectiveOvr } from './engine/scoring.ts';
export { referenceStanding, standingFor } from './engine/competition-results.ts';
export {
    internationalTitlesFor, resolveInternationalChampion, unresolvedTrophies,
    type InternationalTitle,
} from './engine/international-results.ts';
export type { EligibilityState } from './types/player.ts';
export {
    ELIGIBILITY_RULES_VERSION, PRESENCE_MONTHS_REQUIRED, REGISTRATION_MONTHS_REQUIRED,
    availableUnions, canRepresent, playerCanRepresent, targetUnion,
} from './engine/eligibility.ts';
export type { SelectableCountry, RugbyUnionMapping } from './data/nations.ts';
export {
    NATIONS_VERSION, SELECTABLE_COUNTRIES, SELECTABLE_NATIONALITIES, SUSPENDED_UNIONS,
    FREQUENT_COUNTRY_CODES, RUGBY_UNIONS, RUGBY_UNION_MAPPINGS, unionReputation,
    countryCodeOfNationality, findCountry, findCountryByName, flagPathOf, hasUnion,
    normalizeSearch, regionOfCountry, searchCountries, unionAbsenceReason, unionName,
    worldRanking, RANKED_UNION_COUNT, unionMembership, HERITAGE_LINKS,
} from './data/nations.ts';
export type { NoUnionReason, UnionMembership, HeritageLink } from './data/nations.ts';
export {
    TRANSFER_PATHWAYS, TRANSFER_RULES_VERSION, classifyMovement, marketRung, movementBetween,
    pathwayFor, pathwaysFrom, pathwayTargets, startClubChoices, isStartClubChoice,
} from './engine/market-routes.ts';
export {
    firstClubIdOf, homecomingIsAvailable, homecomingOffer, isHomecomingOption,
} from './engine/homecoming.ts';
export { getPendingEvent } from './engine/event-selector.ts';
export { buildCareerSummary } from './engine/statistics.ts';
export {
    runCareer, DEFAULT_CHOOSER, firstOptionChooser, stayChooser, acceptBestEligibleOfferChooser,
    type Chooser,
} from './engine/run-career.ts';

export { createInitialCareer, careerReducer } from './state/career-reducer.ts';
export * from './state/career-actions.ts';
export {
    DEVELOPMENT_PROFILES, peakShiftOf, profileDistribution, profileGrowthFactor,
    profileRevealText, rollDevelopmentProfile,
} from './engine/development-profile.ts';
export type { DevelopmentProfile } from './engine/development-profile.ts';
export { SURNAME_MAX, sanitizeSurname, defaultNumberFor } from './engine/create-player.ts';

// Capa de idioma. Va al final y en bloque porque no es motor: no simula nada,
// sólo reescribe lo que se va a dibujar (ver `i18n/index.ts`).
export * from './i18n/index.ts';
export type { ChipValue } from './engine/impact.ts';
export { offerReasonKey, type OfferReasonKey } from './data/movement-copy.ts';
