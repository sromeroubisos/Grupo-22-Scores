import type { EmploymentStatus, SquadTrack } from '../engine/contracts.ts';
import type { EconomicModel } from '../data/competition-levels2026.ts';
import type { EntryMode } from './career.ts';
import type { DevelopmentProfile } from '../engine/development-profile.ts';
// Modelo del jugador. Todo el motor de Carrera de Rugby gira alrededor de esto.
// Atributos y variables dinámicas se guardan como números flotantes (0..100) y
// se redondean solo para mostrar; así el envejecimiento no destruye técnica de golpe.

export type Position =
    | 'prop' // Pilar
    | 'hooker' // Hooker
    | 'lock' // Segunda línea
    | 'backrow' // Tercera línea (ala / octavo)
    | 'scrumhalf' // Medio scrum
    | 'flyhalf' // Apertura
    | 'centre' // Centro
    | 'wing' // Wing
    | 'fullback'; // Fullback

export type PositionGroup = 'forward' | 'back';

// Claves de atributo. El comentario indica la sigla del spec.
export type AttributeKey =
    | 'power' // POT
    | 'speed' // VEL
    | 'technique' // TÉC
    | 'tackle' // TAC
    | 'kick' // PAT
    | 'vision' // VIS
    | 'mental' // MEN
    | 'stamina'; // RES

export type Attributes = Record<AttributeKey, number>;

// Variables que cambian temporada a temporada y alimentan el OVR efectivo.
export interface Dynamics {
    morale: number; // moral (0..100)
    form: number; // forma (0..100)
    fatigue: number; // fatiga (0..100)
    fame: number; // fama (0..100)
    injuryRisk: number; // riesgo de lesión (0..100)
}

export type PlayerRole = 'starter' | 'rotation' | 'fringe';

// ── Elegibilidad internacional (World Rugby, Regulación 8) ───────────────────
// Se separa a propósito: NACIONALIDAD elegida ≠ país de nacimiento ≠ unión de
// registro actual ≠ uniones para las que se es elegible ≠ unión que capturó al
// jugador. La UI sigue preguntando SOLO la nacionalidad.
export type EligibilityRoute =
    | 'birth' // 8.1(a) nacimiento en el país
    | 'parent' // 8.1(b) padre o madre nacido allí
    | 'grandparent' // 8.1(b) abuelo o abuela nacido allí
    | 'registration-60m' // 8.1(c) 60 meses de registro exclusivo y consecutivo
    | 'presence-10y'; // 8.1(d) 10 años de presencia acumulada

export interface EligibilityClaim {
    union: string; // código de país de la unión
    route: EligibilityRoute;
}

export interface EligibilityState {
    /** Identidad, bandera y rutas migratorias. null si el motor no la modela. */
    nationalityCountryCode: string | null;
    /** 8.1(a). Por defecto coincide con la nacionalidad elegida. */
    birthCountryCode: string | null;
    /** Unión con la que el jugador está registrado HOY (país del club actual). */
    registeredUnion: string | null;
    /** 8.1(c): meses CONSECUTIVOS por unión. Se reinicia al cambiar de unión. */
    registrationMonths: Record<string, number>;
    /** 8.1(d): presencia ACUMULADA por unión. Nunca se reinicia. */
    presenceMonths: Record<string, number>;
    claims: EligibilityClaim[];
    /** 8.2: unión que lo capturó internacionalmente, si ya debutó. */
    capturedBy: string | null;
}

export interface Injury {
    season: number; // índice de temporada en que ocurrió
    age: number;
    name: string;
    severity: 'leve' | 'moderada' | 'grave';
    seasonsOut: number; // temporadas perdidas (fracción de la temporada)
    ovrImpact: number; // penalización temporal al OVR efectivo
}

export interface Player {
    // Identidad
    nickname: string;
    /**
     * Apellido elegido por el usuario. Es el nombre con el que se lo nombra en
     * la cabecera y en el retiro. Saneado y acotado a 15 caracteres al crear
     * (ver `sanitizeSurname`): entra texto libre, así que no se guarda crudo.
     */
    surname: string;
    position: Position;
    number: number;
    nationality: string; // la ÚNICA que elige el usuario (nombre, para mostrar)
    origin: string; // id de origen (data/origins)

    /**
     * Forma de la curva de desarrollo. OCULTO durante la partida —como
     * `potential`— y revelado recién en el resumen de retiro.
     */
    developmentProfile: DevelopmentProfile;

    // Estado
    age: number;
    club: string; // id de club (data/clubs)
    league: string; // id de liga derivado del club
    role: PlayerRole;
    nationalTeam: string | null; // unión efectivamente representada, o null

    /** Estado completo de la Regulación 8. Serializable y determinístico. */
    eligibility: EligibilityState;

    /** Vínculo económico actual. Eje propio, distinto del nivel del torneo. */
    employment: EmploymentStatus;
    /** Lugar en el plantel (desarrollo/senior). Independiente del empleo. */
    squadTrack: SquadTrack;
    /** Cómo entró al rugby senior/profesional. Se sella al crear. */
    entryMode: EntryMode;
    /**
     * Modelo económico del club de arranque, sellado al crear. NO se mete en
     * `entryMode` a propósito: ese eje describe de dónde vino (doméstico,
     * extranjero, academia) y son dos cosas distintas.
     */
    startRouteModel: EconomicModel;
    /**
     * true si la ruta elegida no tenía clubes disponibles y hubo que degradar.
     * En Chile no hay clubes profesionales: un "profesional chileno" arranca en
     * lo más cercano que exista, y el juego se lo puede explicar en vez de mentir.
     */
    routeDowngraded: boolean;
    /**
     * Mayor banda deportiva DISPUTADA (con aparición senior real), no la del
     * club al que pertenece. Un juvenil de desarrollo en Toulouse no "jugó Top 14".
     */
    competitiveBandReached: number;
    /** Hitos ya alcanzados, para no repetirlos. */
    milestonesReached: string[];

    // Atributos y dinámica
    attributes: Attributes;
    /** Techo de OVR alcanzable. OCULTO: nunca se muestra en la UI. */
    potential: number;
    dynamics: Dynamics;

    // Acumuladores de carrera
    caps: number; // partidos con la selección
    titles: number; // títulos ganados
    seasonsPlayed: number;
    injuries: Injury[];
    usedEventIds: string[]; // eventos únicos ya vistos
    flags: Record<string, number>; // banderas narrativas (leal, mercenario, capitán, etc.)
    retired: boolean;
    retirementReason: string | null;
}
