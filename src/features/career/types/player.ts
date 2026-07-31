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

/**
 * Planilla con LA SELECCIÓN, por unión.
 *
 * Es un diccionario y no un total plano porque la elegibilidad puede cambiar
 * (`nt-eligibility-switch`): los caps de Gales no se suman con los de Argentina,
 * y un total único mentiría en cuanto alguien cambia de camiseta.
 *
 * Guarda los ingredientes crudos de la columna del puesto —tackles, metros y el
 * par de patadas— para que la fila de selección se dibuje con las MISMAS
 * columnas que las de club sin recalcular nada al renderizar.
 */
/**
 * Dónde está el jugador respecto de la selección.
 *
 * `dropped` NO es lo mismo que `uncapped`: el que perdió la camiseta conserva
 * sus caps, la fila de selección los sigue mostrando, y puede volver — pero para
 * volver tiene que pasar el umbral COMPLETO otra vez, sin el descuento que
 * protege al que está adentro.
 *
 * `starter` vs `squad` no es un segundo corte para seguir convocado: decide si
 * arranca de titular o entra del banco, y con eso cuántos tests juega.
 *
 * `trial` es el que cruzó el umbral por poco: lo llevaron de gira y juega SÓLO
 * partidos secundarios. Nadie debuta en la primera fecha del Seis Naciones — se
 * debuta en una gira de julio contra un rival menor, con medio plantel
 * descansando. Para pasar a `squad` hay que volver a cruzar el umbral con
 * margen; si no lo logra en dos temporadas, sale.
 */
export type NationalStatus = 'uncapped' | 'trial' | 'squad' | 'starter' | 'dropped';

export interface NationalTeamStats {
    caps: number;
    /**
     * Caps ganados ESTANDO en el plantel principal (`squad` o `starter`).
     *
     * Va aparte del total porque los caps de gira NO COMPRAN TITULARIDAD: si el
     * descuento se ganara con caps de `trial`, el debutante acumularía caps
     * baratos y se protegería solo, que es exactamente el agujero que el estado
     * `trial` vino a cerrar.
     */
    squadCaps: number;
    points: number;
    tries: number;
    tackles: number;
    metres: number;
    kicksAtGoal: number;
    kicksMade: number;
    /** Tests ganados. La selección es lo único donde el resultado se registra. */
    wins: number;
}

export interface Injury {
    season: number; // índice de temporada en que ocurrió
    age: number;
    name: string;
    severity: 'leve' | 'moderada' | 'grave';
    seasonsOut: number; // temporadas perdidas (fracción de la temporada)
    ovrImpact: number; // penalización temporal al OVR efectivo
}

/**
 * SANCIÓN DISCIPLINARIA. Es el quinto eje de una decisión, junto con valoración,
 * tiempo de juego, lesión y reputación.
 *
 * Va GUARDADA y no derivada por el mismo motivo que las lesiones: es un hecho de
 * una temporada concreta —la fecha en que te echaron y los partidos que te
 * comiste— y no se puede recalcular después desde el estado actual.
 *
 * La tarjeta y la suspensión son campos SEPARADOS porque en rugby no van
 * siempre juntos: una amarilla son diez minutos afuera y ningún partido, una
 * roja puede quedar en nada si la comisión no cita, y una citación puede
 * suspenderte sin que hayas visto una tarjeta en la cancha.
 */
export interface Sanction {
    /** Índice de la temporada sobre la que cae la suspensión. */
    season: number;
    age: number;
    /** Tarjeta que la originó. null = citación o sanción administrativa. */
    card: 'amarilla' | 'roja' | null;
    /** Partidos de suspensión. 0 = tarjeta sin partidos. */
    matches: number;
    /** Motivo, para el relato y la trayectoria. */
    reason: string;
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
    /**
     * Situación actual en la selección. Se guarda porque NO es derivable: el
     * umbral con el que se lo midió depende del club, la forma y la edad que
     * tenía en cada temporada, y nada de eso queda registrado con el detalle
     * necesario para recalcularlo.
     */
    nationalStatus: NationalStatus;

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
    /**
     * Caps con la unión que representa HOY. Es un DERIVADO de `nationalStats`:
     * lo sincroniza `simulate-season` en cada temporada. Se conserva como campo
     * porque medio motor lo lee (arquetipos, resumen, cabecera) y porque el
     * jugador tiene una sola camiseta por vez.
     */
    caps: number;
    /** Planilla con cada selección que representó. Ver `NationalTeamStats`. */
    nationalStats: Record<string, NationalTeamStats>;
    titles: number; // títulos ganados
    seasonsPlayed: number;
    injuries: Injury[];
    /** Historial disciplinario. Una entrada por tarjeta o citación. */
    sanctions: Sanction[];
    usedEventIds: string[]; // eventos únicos ya vistos
    flags: Record<string, number>; // banderas narrativas (leal, mercenario, capitán, etc.)
    retired: boolean;
    retirementReason: string | null;
}
