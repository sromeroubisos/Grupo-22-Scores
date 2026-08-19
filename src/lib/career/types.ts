/**
 * Modelo de datos del simulador de Carrera de Rugby.
 *
 * Todo el motor es TS puro (sin React/Next) para poder ejecutarlo por consola y
 * testearlo con `node --test`. Por eso este archivo sólo exporta TIPOS: los que
 * lo importen deben usar `import type`.
 */

export type AttributeKey =
    | 'power'      // POT - potencia
    | 'speed'      // VEL - velocidad
    | 'technique'  // TÉC - técnica
    | 'tackle'     // TAC - tackle
    | 'kick'       // PAT - patada
    | 'vision'     // VIS - visión
    | 'mental'     // MEN - mental
    | 'stamina';   // RES - resistencia

export type Attributes = Record<AttributeKey, number>;

export type Position =
    | 'prop'       // Pilar
    | 'hooker'     // Hooker
    | 'lock'       // Segunda línea
    | 'flanker'    // Tercera línea
    | 'scrumhalf'  // Medio scrum
    | 'flyhalf'    // Apertura
    | 'centre'     // Centro
    | 'wing'       // Wing
    | 'fullback';  // Fullback

export type PositionGroup = 'forward' | 'back';

export type OriginId =
    | 'potrero'
    | 'clubBarrio'
    | 'academia'
    | 'colegioTradicional'
    | 'universidad'
    | 'seleccionJuvenil';

export type PlayerRole = 'promesa' | 'suplente' | 'rotacion' | 'titular' | 'estrella';

export type InjurySeverity = 'leve' | 'moderada' | 'grave';

export interface Injury {
    id: string;
    name: string;
    severity: InjurySeverity;
    seasonsOut: number;          // temporadas que arrastra el efecto
    ageAtInjury: number;
    attributeHit: Partial<Attributes>;
}

export interface Player {
    // Identidad
    nickname: string;
    position: Position;
    number: number;
    nationality: string;
    origin: OriginId;
    // Estado
    age: number;
    clubId: string | null;
    clubName: string;
    league: string;
    role: PlayerRole;
    inNationalTeam: boolean;
    // Atributos permanentes
    attributes: Attributes;
    // Variables dinámicas (0-100)
    morale: number;
    form: number;
    fatigue: number;
    fame: number;
    injuryRisk: number;          // riesgo base de lesión
    // Acumuladores de carrera
    caps: number;
    titles: number;
    seasonsPlayed: number;
    value: number;               // valor de mercado (unidades arbitrarias)
    usedEventIds: string[];
    recentEventIds: string[];
    injuries: Injury[];
    retired: boolean;
}

export interface SeasonStats {
    matches: number;
    minutes: number;
    tries: number;
    tackles: number;
    metres: number;              // metros ganados (backs)
    points: number;              // puntos al pie (pateadores)
    turnovers: number;           // robos (terceras líneas)
    lineoutsWon: number;         // lines ganados (segundas/hooker)
}

export interface SeasonRecord {
    season: number;              // índice 1..N
    age: number;
    clubName: string;
    league: string;
    role: PlayerRole;
    ovrStart: number;
    ovrEnd: number;
    stats: SeasonStats;
    rating: number;              // 1-10
    titles: number;
    calledUp: boolean;
    capsThisSeason: number;
    injury: Injury | null;
    headline: string;
    eventId: string | null;
    decisionLabel: string | null;
}

export type EventCategory =
    | 'club'
    | 'injury'
    | 'national'
    | 'personal'
    | 'tactical'
    | 'media'
    | 'milestone';

export type ClubMove = 'offerBest' | 'loan' | 'stay';

export interface Consequence {
    attributes?: Partial<Attributes>;
    morale?: number;
    form?: number;
    fatigue?: number;
    fame?: number;
    injuryRisk?: number;
    value?: number;              // delta de valor
    clubMove?: ClubMove;
    setRole?: PlayerRole;
    changePosition?: Position;
    titleChance?: number;        // prob. extra de ganar un título esa temporada
    capsBonus?: number;          // caps garantizados
    injure?: InjurySeverity;     // fuerza una lesión
    flags?: string[];            // marca flags narrativos
    // Rama probabilística ("50% titular / 50% rotación")
    probabilistic?: { chance: number; ifHit: Consequence; ifMiss: Consequence };
    note: string;                // línea narrativa para el resumen
}

export interface EventOption {
    id: string;
    label: string;
    description?: string;
    consequence: Consequence;
}

export interface EventCondition {
    positions?: Position[];
    groups?: PositionGroup[];
    origins?: OriginId[];
    minAge?: number;
    maxAge?: number;
    minOvr?: number;
    maxOvr?: number;
    requiresNationalTeam?: boolean;
    requiresFlags?: string[];
}

export interface CareerEvent {
    id: string;
    category: EventCategory;
    title: string;
    text: string;                // soporta {nickname} y {club}
    condition?: EventCondition;
    weight: number;              // peso base para el sorteo
    repeatable?: boolean;        // default false (evento único)
    options: EventOption[];      // 2-3 opciones
}

export type CareerPhase = 'active' | 'retired';

export interface CareerConfig {
    nickname: string;
    position: Position;
    nationality?: string;
    origin?: OriginId;
    number?: number;
}

export interface CareerState {
    seed: number;
    version: string;
    player: Player;
    history: SeasonRecord[];
    pendingEvent: CareerEvent | null;   // decisión de la temporada por jugarse
    phase: CareerPhase;
    flags: string[];
    rngState: number;                   // snapshot del PRNG entre pasos
}

/** PRNG determinístico + utilidades de muestreo. */
export interface Rng {
    next(): number;                                   // [0, 1)
    range(min: number, max: number): number;          // [min, max)
    int(min: number, max: number): number;            // entero [min, max]
    chance(p: number): boolean;
    pick<T>(arr: readonly T[]): T;
    weightedPick<T>(items: readonly T[], weightOf: (item: T) => number): T;
    gaussian(mean: number, sd: number): number;
    snapshot(): number;
}
