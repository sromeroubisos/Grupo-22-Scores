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
    DevelopmentProfile,
    PositionFamilyId,
    PositionGroup,
    SquadRole,
} from './types/player.ts';
export { FIRST_TEAM_AGE, POTENTIAL_BAND, START_AGE } from './types/player.ts';

export type {
    Milestone,
    MilestoneId,
    SeasonAward,
    SeasonAwardId,
} from './types/achievements.ts';

export type {
    CaptainPhase,
    CaptainState,
    ClubOffer,
    Contract,
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
    EventRarity,
} from './types/event.ts';

export type {
    BelongingLedger,
    BelongingTier,
    BelongingTierId,
    DamageLedger,
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
    ATTRIBUTE_LABEL,
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
    // Las vías de circulación: de ellas salen de qué país es una franquicia
    // regional y cuánto hay que valer para entrar a ella. Desde la 0.24.0 el
    // mercado de este juego las lee, así que el guardado las sella.
    TRANSFER_RULES_VERSION,
    // El mapa de uniones. Lo pide `tournament.test.ts` para verificar que los
    // códigos del catálogo de torneos EXISTAN — un `'AR'` en mayúscula compila,
    // no falla y deja el torneo inalcanzable para siempre.
    RUGBY_UNIONS,
    // El nombre de una unión. Lo pide la línea de partido de El Hueco: «Argentina
    // vs Escocia» y no «Tu selección vs Escocia», que era la voz equivocada — el
    // juego nombra a los clubes y a las provincias por su nombre, y la selección
    // no tiene por qué ser la excepción.
    unionName,
    // La bandera y el nombre del país. Los pide la cabecera —de dónde sos va al
    // lado de quién sos— y la tarjeta de la otra bandera, que sin el escudo de la
    // unión que llama pide una decisión irreversible contra un texto genérico.
    findCountry,
    flagPathOf,
    // La región geográfica de un país. La piden los continentales M18 —cuál te
    // toca sale de acá y no de una lista de países escrita en el catálogo— y el
    // test que verifica que cada uno de los seis tenga al menos una unión que
    // pueda jugarlo.
    regionOfCountry,
} from './data/catalogs.ts';

// El rótulo de una competición por id. Lo necesita la cabecera para nombrar la
// división de ESTA carrera —que después de un ascenso ya no es la del catálogo—,
// y por eso viaja acá y no se resuelve leyendo el club.
export { competitionLabelOf } from './data/catalogs.ts';

// El calendario de selecciones NO es de este juego: es el de
// `career/data/international-calendar.ts`, y entra por la misma puerta que los
// clubes. Hubo un momento en que captain tuvo el suyo; está contado en
// `data/catalogs.ts` y en el changelog de la 0.12.0.
export { INTERNATIONAL_CALENDAR_VERSION } from './data/catalogs.ts';

// ── Motor ───────────────────────────────────────────────────────────────────
export type { Rng } from './engine/random.ts';
export { createRng, hashSeed, rngFromState } from './engine/random.ts';

export { gapToPotential, ovrFromAttributes, ovrOf, potentialOf, shopCeilingOf } from './engine/ovr.ts';

export type { BelongingContext } from './engine/belonging.ts';
export {
    applyBelonging,
    belongingCap,
    belongingOf,
    belongingTier,
    clearBelonging,
    emptyBelonging,
    setFrozen,
} from './engine/belonging.ts';

// ── El salto al clásico ─────────────────────────────────────────────────────
// El catálogo de clásicos NO se re-exporta: es dato de rugby y se lee por
// `data/rivalries.ts`, igual que los clubes se leen por `data/catalogs.ts`. Lo
// que sale por acá son las tres preguntas que la pantalla puede necesitar —¿de
// qué clubes te fuiste al clásico?, ¿este pase lo es?, ¿tal club está marcado?—
// y la versión, que la sella el guardado.
export { CAPTAIN_RIVALRIES_VERSION } from './data/rivalries.ts';
export { betrayedClubs, isBetrayedClub, isRivalJump } from './engine/betrayal.ts';

export { addBodyDamage, addHeadDamage, emptyDamage } from './engine/damage.ts';

// ── La carta de pretemporada ────────────────────────────────────────────────
export type { TrainingCost, TrainingDef, TrainingGain, TrainingTier } from './data/trainings.ts';
export {
    TRAINING_CEILING,
    TRAINING_POINTS,
    TRAININGS,
    getTraining,
    isFree,
    trainingPoints,
    trainingsFor,
} from './data/trainings.ts';

export { applyMoney, canEarnMoney } from './engine/money.ts';

// ── La tienda ───────────────────────────────────────────────────────────────
// El catálogo entero viaja a `app/`, que es quien dibuja la góndola. Las reglas
// también: la pantalla necesita `canBuy` para apagar un botón CON SU RAZÓN y
// `previewGain` para decir cuánto entra de verdad antes de cobrar — dos cosas
// que no se pueden recalcular afuera sin que se separen de la compra.
export type {
    ShopCategory,
    ShopEffect,
    ShopHarm,
    ShopItem,
    ShopRuleId,
    ShopTarget,
} from './data/shop.ts';
export {
    CAPTAIN_SHOP_VERSION,
    SHOP_CATEGORIES,
    SHOP_CATEGORY_HINT,
    SHOP_CATEGORY_LABEL,
    SHOP_HARM_LABEL,
    SHOP_ITEMS,
    getShopItem,
    resolveShopTarget,
    shopItemsOf,
} from './data/shop.ts';
export type { ShopGain, ShopPurchase } from './types/player.ts';
export type { ShopPerks, ShopVerdict } from './engine/shop.ts';
export {
    SHOP_AGUANTE_CAP,
    SHOP_BELONGING_CAP,
    aguanteBoughtOf,
    aguanteCapOf,
    belongingBoughtOf,
    canBuy,
    money,
    needsPick,
    pickableAttributes,
    previewGain,
    shopPerks,
    shopSpentOf,
} from './engine/shop.ts';
export { mainAttributeOf } from './data/positions.ts';

// ── Las dos escaleras ───────────────────────────────────────────────────────
export type { LeagueStanding } from './types/season.ts';
export {
    TITLE_MIN_SHARE,
    championOf,
    clubLabel,
    clubRatingOf,
    competitionLabel,
    cupChampionOf,
    cupsFor,
    leagueStandingOf,
    leagueTableOf,
    contractYearsFor,
    renewalFor,
    salaryFor,
    startingClubPool,
} from './engine/clubs.ts';
export type { SelectionDiagnosis, SelectionVisibility } from './engine/national-team.ts';
export {
    selectionVisibility,
    representativeMatchesOf,
    thresholdFor,
    trackIndex,
    trackLabelOf,
} from './engine/national-team.ts';
export type { NamedTest } from './engine/test-match.ts';
export { namedTestOf } from './engine/test-match.ts';
/**
 * La verificación de coherencia del guardado. La consume `captainStorage.ts`
 * para poder contestar `'outdated'` en vez de dejar que el motor derive una
 * división equivocada en silencio (ver `engine/validate.ts`).
 */
export { validateCaptainState } from './engine/validate.ts';
// El contrato viaja a `app/` porque la billetera lo muestra: cuántos años te
// quedan es la mitad de «cuánto ganás» y el jugador lo necesita para saber en qué
// junio le toca renovar.
export {
    BELONGING_RETURN_BONUS,
    contractExpiring,
    currentContract,
    lastSeasonOf,
    seasonsLeftAfter,
    underContract,
} from './engine/contracts.ts';

// ── La progresión ───────────────────────────────────────────────────────────
export type { CareerShapeInput } from './engine/development-profile.ts';
export {
    CAREER_HARD_CAP,
    DEVELOPMENT_PROFILES,
    LONGEVITY_MAX,
    LONGEVITY_MIN,
    longevityRevealText,
    peakShiftOf,
    profileDistribution,
    profileGrowthFactor,
    profileRevealText,
    resolveAgeCurve,
    rollDevelopmentProfile,
    rollLongevity,
} from './engine/development-profile.ts';
export type { GrowthFactors, GrowthInput, GrowthScale } from './engine/growth.ts';
export {
    environmentFactor,
    meritFactor,
    seasonGrowthScale,
    youthFactor,
} from './engine/growth.ts';
export { RATING_MAX, RATING_MIN, RATING_PIVOT, seasonRating } from './engine/season-rating.ts';
export {
    INJURY_ATTRIBUTE_LOSS_MAX,
    INJURY_ATTRIBUTE_LOSS_MIN,
    OVR_GROWTH_CAP_PER_SEASON,
} from './engine/aging.ts';

// ── Los cinco carriles de logros ────────────────────────────────────────────
export { AWARD_LABELS, evaluateSeasonAwards } from './engine/awards.ts';
export type { DivisionMove } from './engine/promotion.ts';
export {
    applyDivisionMove,
    competitionOf,
    divisionMoveFor,
    resolveClub,
} from './engine/promotion.ts';
export type { InternationalCompetition, Trophy } from './data/catalogs.ts';
export {
    INTERNATIONAL_COMPETITIONS,
    WORLD_CUP_ID,
    competitionsFor,
    internationalMatches,
    internationalSeason,
    isWorldCupYear,
    seasonYear,
} from './data/catalogs.ts';
export {
    awardableTrophies,
    championOfTournament,
    isAwardable,
    nationalTitlesFor,
} from './engine/international-results.ts';
export { detectMilestones } from './engine/milestones.ts';

// ── Los Momentos ────────────────────────────────────────────────────────────
export type {
    BandaMove,
    BunkerVerdict,
    MomentKind,
    MomentOutcome,
    MomentRecord,
    PendingMoment,
    TackleZone,
} from './types/moment.ts';
export type { ContractKind, LegacyMomentKind, PreContractKind } from './types/moment-kinds.ts';
export {
    ALL_MOMENT_KINDS,
    LEGACY_SELECTABLE,
    MOMENT_LABEL,
    PRE_CONTRACT_KINDS,
} from './types/moment-kinds.ts';

// ── Los minijuegos por dorsal ───────────────────────────────────────────────
// El catálogo de los sesenta y cinco y los siete verbos con los que se juegan.
// `app/` los consume para dibujar una pantalla por verbo en vez de una por
// minijuego, que es toda la razón de que sesenta y cinco entren sin que la
// carpeta de componentes tenga sesenta y cinco archivos.
export type {
    AnyMinigameSpec,
    MechanicCtx,
    MechanicId,
    Mechanic,
    MinigameCopy,
    MinigameGrade,
    MinigameGloria,
    MinigameKind,
    MinigameLegacy,
    MinigamePlay,
    MinigameRisk,
    MinigameSetup,
    MinigameSlot,
    MinigameSpec,
    MinigameStake,
    LecturaParams,
    MemoriaParams,
    PunteriaParams,
    PuntoParams,
    SecuenciaParams,
    SostenParams,
    VentanaParams,
} from './types/minigame.ts';
export {
    ALL_GRADES,
    ALL_MECHANICS,
    MECHANIC_LABEL,
    gradeIsGood,
    isLegacySlot,
} from './types/minigame.ts';

export type {
    LecturaSetup,
    LecturaInput,
    MemoriaSetup,
    MemoriaInput,
    PunteriaSetup,
    PunteriaInput,
    PuntoSetup,
    PuntoInput,
    SecuenciaSetup,
    SecuenciaInput,
    SostenSetup,
    SostenInput,
    VentanaSetup,
    VentanaInput,
} from './engine/mechanics/index.ts';
export {
    SOSTEN_CORRECCION,
    lecturaGrade,
    memoriaAciertos,
    memoriaGrade,
    punteriaGrade,
    punteriaLanding,
    puntoGrade,
    secuenciaAciertos,
    secuenciaGrade,
    sostenDentro,
    sostenGrade,
    sostenTrack,
    ventanaGrade,
} from './engine/mechanics/index.ts';

export {
    ALL_MINIGAMES,
    ALL_SHIRTS,
    CAPTAIN_MINIGAMES_VERSION,
    LEGACY_SLOTS,
    MINIGAME_SPECS,
    PER_SHIRT,
    getMinigame,
    minigamesOfShirt,
    universalMinigames,
} from './data/minigames/index.ts';

// El contrato. Lo consume `app/` para tipar la pantalla de cada Momento, y los
// tests para escribir defs de mentira sin fabricar una carrera.
export type {
    MomentDef,
    MomentDeltas,
    MomentResult,
    MomentSetup,
    MomentSetupCtx,
    PlayLevel,
} from './types/moment-def.ts';
export { PLAY_LEVELS } from './types/moment-def.ts';

export type { TackleZones } from './engine/moments.ts';
export {
    applyMomentDeltas,
    momentLabel,
    momentSeed,
    nextChain,
    pickMomentKind,
    proficiencyFor,
    rollMoment,
    shirtOfKind,
    tacklePlayAt,
    tackleZones,
    zoneAt,
} from './engine/moments.ts';

export { defFromSpec, familiesOfShirt, marginOf } from './engine/moment-defs/from-spec.ts';

export type {
    AnclaSetup,
    AnyMomentDef,
    BandaSetup,
    CodigoSetup,
    JackalSetup,
    PalosSetup,
} from './engine/moment-defs/index.ts';
export {
    ACADEMIA_AGE,
    ACADEMIA_KIND,
    ACADEMIA_UNION,
    ANCLA_MAX_PUSHES,
    CODIGO_LENGTH,
    CODIGO_SYMBOLS,
    JACKAL_ROUNDS,
    MOMENT_DEFS,
    anclaHoldChance,
    bandaAmagueEnd,
    bandaCloseMs,
    bandaGrade,
    bandaMoveAt,
    bandaMuscleRisk,
    bandaSpaceCost,
    codigoAciertos,
    getMomentDef,
    isContractKind,
    jackalBeat,
    jackalGrade,
    jackalWindows,
    palosGrade,
    palosLanding,
    palosPerfectAim,
} from './engine/moment-defs/index.ts';

// ── Temporada y decisiones ──────────────────────────────────────────────────
export type { PlayingTime } from './engine/statistics.ts';
export { playingTimeOf } from './engine/statistics.ts';

// LA PLANILLA DE LA CARRERA: partidos, tries, puntos y tackles. Es DERIVADA del
// historial y no se guarda, así que la cabecera la puede pedir en cada render
// sin que ninguna partida en curso se entere.
export type { CareerTally } from './engine/career-tally.ts';
export { careerTally } from './engine/career-tally.ts';
export type { SeasonReport } from './engine/simulate-season.ts';
// `rarityOf` viaja a `app/` porque la tarjeta dibuja el sello, y el default de
// `rarity` tiene que resolverse en UN solo lugar: si la pantalla hiciera su
// propio `?? 'normal'`, el día que el default cambie habría dos respuestas.
export { RARITIES, RARITY_BAND, getPendingEvent, rarityOf } from './engine/event-selector.ts';
export { ALL_EVENTS, getEvent } from './data/events/index.ts';

// ── Torneos representativos ─────────────────────────────────────────────────
export type {
    CasillasGrid,
    ComodinDef,
    ComodinId,
    KickOff,
    MatchGrid,
    MatchResult,
    PendingTournament,
    RoundId,
    TournamentDef,
    TournamentGate,
    TournamentTier,
    TournamentId,
    TournamentMatch,
    TournamentReward,
} from './types/tournament.ts';
export {
    ALL_TOURNAMENTS,
    ARBITRO_BELONGING,
    ARBITRO_TACHADAS,
    ARENGA_LIDERAZGO,
    COMODINES,
    getComodin,
    PLAN_VISION,
    CASILLAS_TOTAL,
    CASILLAS_TRIES,
    CASILLAS_VISION,
    GRID_COLS,
    GRID_MIN_WINS,
    GRID_ROWS,
    GRID_TOTAL,
    ARENGA_PUSH,
    DRAW_POINTS,
    LOSS_BONUS_MARGIN,
    ROUND_LABEL,
    ROUND_SHORT,
    TRY_BONUS_TRIES,
    WIN_POINTS,
    tournamentCompetitionId,
} from './types/tournament.ts';

export type { ProvinciaDef } from './data/tournaments.ts';
export {
    PROVINCIAS,
    TOURNAMENTS,
    TOURNAMENTS_VERSION,
    getTournament,
    provinciaOf,
} from './data/tournaments.ts';

export type { Bracket, RivalDef } from './engine/tournament.ts';
export {
    buildCasillas,
    buildMatchGrid,
    winProbability,
    winsInGrid,
    bracketOf,
    bracketSize,
    bracketsOf,
    bronzeFrom,
    casillasEncontrados,
    casillasResultado,
    casillasRestantes,
    finalPlace,
    forTheTitle,
    groupPoints,
    groupWins,
    hasPlacement,
    isTitleDecider,
    lastRound,
    matchResult,
    matchesOf,
    nextMatch,
    openRound,
    ordinal,
    qualified,
    roundTag,
    roundTitle,
    stakeOf,
    survives,
    tablePoints,
    tierMoveOf,
    unionStrength,
} from './engine/tournament.ts';

export type { DivisionRow, DivisionTable } from './engine/tournament-gate.ts';
export {
    buildCtxOf,
    canUseComodin,
    comodinesFor,
    divisionOf,
    divisionTablesOf,
    entryDivisionOf,
    gateOpen,
    openTournament,
    partidoParaRehacer,
    proximoConGrilla,
    regionOf,
    rewardOf,
    tierChainOf,
    tournamentDue,
} from './engine/tournament-gate.ts';

// ── Estado ──────────────────────────────────────────────────────────────────
export type { CaptainAction } from './state/captain-actions.ts';
export {
    advanceSeason,
    buy,
    chooseComodin,
    chooseOption,
    chooseTraining,
    finishTournament,
    pickCell,
    pickGrid,
    useComodin,
    retire,
    revealMatch,
    startCaptain,
} from './state/captain-actions.ts';

export type { RetirementReason } from './state/captain-reducer.ts';
export { captainReducer, createInitialCaptain } from './state/captain-reducer.ts';

/**
 * EL RELOJ DEL CUERPO, por la puerta pública.
 *
 * Lo pide la cabecera para pintar el desgaste: la pantalla no puede tener su
 * propia tabla de umbrales o el día que el motor mueva el piso, el número
 * seguiría cambiando de color donde ya no pasa nada (CLAUDE de captain §1.9).
 */
export {
    BODY_ANTICIPATION_FLOOR,
    BODY_ANTICIPATION_MAX,
    BODY_ANTICIPATION_STEP,
    bodyAnticipation,
    retirementChance,
    retirementHold,
} from './engine/retirement.ts';

/**
 * EL JUGADOR SIN PANTALLA. Es a un torneo lo que `playAt` a un Momento.
 *
 * Se exporta por la puerta pública porque lo usa el digest congelado, que corre
 * carreras enteras sin DOM: un torneo que solo se pueda destapar con el dedo es
 * un torneo que el digest no puede atravesar.
 */
export { quemarPolicy, playTournament } from './state/captain-autoplay.ts';
