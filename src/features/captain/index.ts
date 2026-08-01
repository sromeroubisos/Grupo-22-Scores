// EL CAPITÁN — la puerta pública del feature.
//
// Chico a propósito. El barrel de Carrera de Rugby creció hasta re-exportar el
// motor entero, y hoy cualquiera que quiera un club se lleva el simulador de
// temporada al bundle. Acá se exporta lo que `app/` consume y nada más.
//
// En particular NO se re-exporta `data/catalogs.ts`: quien necesite el catálogo
// de clubes lo pide por su ruta, y así se ve quién lo está trayendo.

// ── Tipos ───────────────────────────────────────────────────────────────────
export type {
    CaptainAttributeKey,
    CaptainAttributes,
    CaptainPlayer,
    CaptainStage,
    PositionFamilyId,
    PositionGroup,
} from './types/player.ts';
export { START_AGE } from './types/player.ts';

export type {
    CaptainPhase,
    CaptainState,
    ClubOffer,
    CreateCaptainInput,
    NationalRecord,
    Rival,
    SquadTrack,
    Title,
} from './types/captain.ts';
export { CAPTAIN_ENGINE_VERSION, SQUAD_TRACKS } from './types/captain.ts';

export type {
    CaptainEffect,
    CaptainEvent,
    CaptainOption,
    CaptainOutcome,
    EventCategory,
} from './types/event.ts';

export type {
    BelongingLedger,
    BelongingTier,
    BelongingTierId,
    DamageLedger,
    TimeBudget,
    TimeSlot,
    TimeSlotDef,
} from './types/currencies.ts';
export {
    BELONGING_ABROAD_FACTOR,
    BELONGING_CAP_NO_TITLES,
    BELONGING_CAP_RIVAL_JUMP,
    BELONGING_DAMPEN_FACTOR,
    BELONGING_DAMPEN_FROM,
    BELONGING_MAX,
    BELONGING_MIN,
    BELONGING_PRO_PENALTY,
    BELONGING_TIERS,
    FAME_MAX,
    FAME_MIN,
    HEAD_PER_HIA,
    MONEY_START,
    OVR_MAX,
    OVR_MIN,
    TIME_SLOTS,
    TIME_SLOT_DEFS,
    TIME_TOKENS_PER_SEASON,
} from './types/currencies.ts';

export type {
    CaptainDecisionEntry,
    CaptainSeasonEntry,
    MatchBucket,
    MatchBudget,
} from './types/season.ts';
export { MATCH_BUCKETS, MATCH_CAP_PER_SEASON } from './types/season.ts';

// ── Las ocho familias ───────────────────────────────────────────────────────
export type { AgeCurve, GloryMetric, GloryUnit, PositionFamily } from './data/positions.ts';
export {
    ALL_FAMILIES,
    ATTRIBUTE_FLOOR,
    ATTRIBUTE_KEYS,
    CAPTAIN_POSITIONS_VERSION,
    POSITION_FAMILIES,
    baseAttributes,
    familyOfNumber,
    getFamily,
} from './data/positions.ts';

// ── Las versiones de catálogo que sella el guardado ─────────────────────────
// Se exponen desde acá para que `captainStorage.ts` tenga un solo import y no
// tenga que conocer la ruta interna hacia los catálogos de career.
export {
    COMPETITION_LEVELS_VERSION,
    NATIONS_VERSION,
    NORMALIZED_CATALOG_VERSION,
} from './data/catalogs.ts';

// ── Motor ───────────────────────────────────────────────────────────────────
export type { Rng } from './engine/random.ts';
export { createRng, hashSeed, rngFromState } from './engine/random.ts';

export { gapToPotential, ovrFromAttributes, ovrOf } from './engine/ovr.ts';

export type { BelongingContext } from './engine/belonging.ts';
export {
    applyBelonging,
    belongingCap,
    belongingOf,
    belongingTier,
    emptyBelonging,
    setFrozen,
} from './engine/belonging.ts';

export { addBodyDamage, addHeadDamage, emptyDamage } from './engine/damage.ts';

export {
    isTimeBudgetFull,
    resetTimeBudget,
    spendToken,
    tokensLeft,
    tokensSpent,
    unspendToken,
} from './engine/time-budget.ts';

export { applyMoney, canEarnMoney } from './engine/money.ts';

// ── Las dos escaleras ───────────────────────────────────────────────────────
export { clubLabel, clubRatingOf, competitionLabel, salaryFor } from './engine/clubs.ts';
export { TRACK_LABEL, thresholdFor, trackIndex } from './engine/national-team.ts';
export { BELONGING_RETURN_BONUS } from './engine/contracts.ts';

// ── Los Momentos ────────────────────────────────────────────────────────────
export type {
    BunkerVerdict,
    MomentKind,
    MomentOutcome,
    MomentRecord,
    PendingMoment,
    TackleZone,
} from './types/moment.ts';
export { MOMENT_LABEL, SELECTABLE_MOMENTS } from './types/moment-kinds.ts';

// El contrato. Lo consume `app/` para tipar la pantalla de cada Momento, y los
// tests para escribir defs de mentira sin fabricar una carrera.
export type {
    MomentDef,
    MomentDeltas,
    MomentResult,
    MomentSetup,
    MomentSetupCtx,
} from './types/moment-def.ts';

export type { TackleZones } from './engine/moments.ts';
export {
    applyMomentDeltas,
    momentSeed,
    nextChain,
    pickMomentKind,
    proficiencyFor,
    rollMoment,
    tackleZones,
    zoneAt,
} from './engine/moments.ts';

export type { AnyMomentDef, JackalSetup } from './engine/moment-defs/index.ts';
export {
    JACKAL_ROUNDS,
    MOMENT_DEFS,
    getMomentDef,
    jackalBeat,
    jackalGrade,
    jackalWindows,
} from './engine/moment-defs/index.ts';

// ── Temporada y decisiones ──────────────────────────────────────────────────
export type { PlayingTime } from './engine/statistics.ts';
export { playingTimeOf } from './engine/statistics.ts';
export type { SeasonReport } from './engine/simulate-season.ts';
export { getPendingEvent } from './engine/event-selector.ts';
export { ALL_EVENTS, getEvent } from './data/events/index.ts';

// ── Estado ──────────────────────────────────────────────────────────────────
export type { CaptainAction } from './state/captain-actions.ts';
export {
    advanceSeason,
    chooseOption,
    confirmTime,
    retire,
    spendTime,
    startCaptain,
    unspendTime,
} from './state/captain-actions.ts';

export type { RetirementReason } from './state/captain-reducer.ts';
export { captainReducer, createInitialCaptain } from './state/captain-reducer.ts';
