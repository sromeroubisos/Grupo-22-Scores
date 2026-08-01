// EL CAPITÁN — el estado de la carrera.
//
// `CaptainState` es JSON PURO: nada de `Date`, `Map`, `Set`, funciones ni
// referencias circulares. Si te tienta guardar un club entero, guardá el `id` y
// resolvelo contra el catálogo (CLAUDE.md §2). Hay un test que lo verifica
// serializando y comparando.

import type { CaptainPlayer, CaptainStage, PositionFamilyId } from './player.ts';
import type { BelongingLedger, DamageLedger, TimeBudget } from './currencies.ts';
import type { CaptainDecisionEntry, CaptainSeasonEntry, MatchBudget } from './season.ts';
import type { MomentRecord, PendingMoment } from './moment.ts';

/**
 * VERSIÓN DEL MOTOR.
 *
 * Se sube cuando cambia lógica que altera resultados con la misma semilla. No
 * se sube por un texto de UI que no se persista, ni por nada derivado.
 *
 * ── Changelog ──
 * 0.1.0 — El esqueleto. Tipos, las seis monedas, las ocho familias de puesto,
 *         el reducer con el ciclo de temporada y el chequeo de retiro. Todavía
 *         no hay simulación de partidos, ni eventos, ni mercado: las funciones
 *         que faltan están declaradas como TODO en `state/captain-reducer.ts`,
 *         nombrando el archivo que las va a llenar.
 * 0.2.0 — El juego. Simulación de temporada (tiempo de juego, planilla del
 *         puesto, desgaste y conmociones), crecimiento y declive de atributos,
 *         la escalera de club con ofertas y títulos, la escalera representativa
 *         con caps y archirrival, el momento bisagra de firmar profesional, y
 *         el catálogo de eventos con su selector.
 * 0.3.0 — Los Momentos: la jugada que decide y que no se simula, se juega. El
 *         armazón (cuándo aparece, con qué márgenes, cómo vuelve a la
 *         temporada) y los dos transversales, El Tackle y El Bunker. Los quince
 *         por puesto entran por el mismo carril sin tocar el reducer.
 * 0.4.0 — El CONTRATO de un Momento (`types/moment-def.ts`) y el primero que lo
 *         cumple, El Jackal, para la tercera línea. Tres cosas que el contrato
 *         impone y antes eran disciplina: `resolve` no ve el contexto —lo que
 *         necesita viaja masticado en el Setup, así que la jugada se resuelve
 *         igual antes y después de un F5—, `MomentDeltas` está cerrado a los
 *         carriles del motor, y una cadena se resuelve a lo sumo una vez.
 *         Las semillas son DERIVADAS: `hash(semilla:temporada:momentPick)` para
 *         elegir el kind y `hash(semilla:kind:temporada:idx)` para el minijuego.
 *         `rollMoment` sigue consumiendo lo mismo del stream principal, así que
 *         el digest congelado no se mueve por agregar Momentos: se mueve solo
 *         donde uno cambió de verdad el resultado.
 */
export const CAPTAIN_ENGINE_VERSION = '0.4.0';

/**
 * Las fases del ciclo. `offseason` es propia de este juego y no la tiene
 * Carrera de Rugby: es donde se reparten las seis fichas de Tiempo, que es la
 * decisión que se toma todas las temporadas y nunca tiene respuesta obvia.
 */
export type CaptainPhase =
    | 'setup' // creando el jugador
    | 'offseason' // repartiendo las seis fichas
    | 'moment' // hay una jugada esperando que la juegues
    | 'event' // hay una decisión esperando
    | 'season' // el reparto está cerrado, falta jugar
    | 'retired';

/**
 * Los escalones de la vía representativa, de menor a mayor.
 *
 * El orden importa: `engine/national-team.ts` compara escalones para saber si
 * subiste o bajaste, y la cabecera muestra el más alto que alcanzaste. `club`
 * no es un escalón de selección: es no estar en ninguno.
 */
export type SquadTrack = 'club' | 'union' | 'academia' | 'm20' | 'a-xv' | 'nacional';

export const SQUAD_TRACKS: readonly SquadTrack[] = ['club', 'union', 'academia', 'm20', 'a-xv', 'nacional'];

export interface NationalRecord {
    track: SquadTrack;
    /** El más alto que pisaste. No baja aunque te dejen afuera. */
    bestTrack: SquadTrack;
    /** Partidos con la mayor. Los caps valen más que los títulos (CLAUDE.md §5). */
    caps: number;
    debutSeason: number | null;
}

/**
 * El otro tipo que juega en tu puesto.
 *
 * En El Ídolo el archirrival te compite en goles. Acá te compite LA CAMISETA:
 * en cada convocatoria entra uno de los dos, y el marcador que importa es el de
 * caps. Es la traducción correcta —el rugby no tiene tabla de goleadores— y
 * tiene precedente: Isgró quedó afuera de los doce de París y viajó de reserva.
 */
export interface Rival {
    name: string;
    surname: string;
    ovr: number;
    caps: number;
}

/** Una copa en la vitrina. */
export interface Title {
    season: number;
    competitionId: string;
    labelEs: string;
    clubId: string | null;
    kind: 'club' | 'national';
}

/**
 * Una oferta sobre la mesa. Las amateur no traen plata —no existe— y las
 * profesionales sí, con el sueldo anual en dólares.
 */
export interface ClubOffer {
    clubId: string;
    kind: 'amateur' | 'professional';
    salary: number;
    /** Temporada en que apareció. Una oferta no espera para siempre. */
    season: number;
}

/** Lo que hace falta para arrancar una carrera. */
export interface CreateCaptainInput {
    name: string;
    surname: string;
    family: PositionFamilyId;
    countryCode: string;
    /** Dorsal dentro de la familia. Si no viene, lo sortea el motor. */
    number?: number;
    /** Club del catálogo. Si no viene o no existe, arranca sin club resuelto. */
    clubId?: string;
}

export interface CaptainState {
    // ── Versiones congeladas al empezar la partida ──────────────────────────
    // Se guardan EN EL ESTADO y no solo en el envoltorio del guardado, para que
    // una partida cargada sepa contra qué datos se jugó.
    version: string; // CAPTAIN_ENGINE_VERSION
    positionsVersion: string; // CAPTAIN_POSITIONS_VERSION
    clubCatalogVersion: string; // NORMALIZED_CATALOG_VERSION

    // ── Azar ────────────────────────────────────────────────────────────────
    /** La semilla original. Con esto y la secuencia de decisiones se rehace todo. */
    seed: number;
    /** Estado actual del PRNG. Se sella al final de cada paso del reducer. */
    rngState: number;

    // ── Dónde está la carrera ───────────────────────────────────────────────
    season: number;
    stage: CaptainStage;
    phase: CaptainPhase;
    /** La temporada en que firmaste profesional. `null` mientras seas amateur. */
    signedProSeason: number | null;

    player: CaptainPlayer;

    /**
     * El club de origen: donde te hiciste. Es el único que puede ponerle tu
     * nombre a la cancha, y el que te espera si volvés.
     */
    homeClubId: string | null;

    // ── Las dos escaleras ───────────────────────────────────────────────────
    national: NationalRecord;
    rival: Rival | null;
    titles: Title[];
    /** Ofertas sobre la mesa. Se limpian al resolverse la decisión de mercado. */
    offers: ClubOffer[];

    // ── Las seis monedas ────────────────────────────────────────────────────
    time: TimeBudget; // ⏳ las seis fichas de ESTA temporada
    belonging: BelongingLedger; // por club
    fame: number; // Cartel
    money: number; // US$: quieta hasta firmar
    damage: DamageLedger; // 🧠 + 🦴

    // ── Presupuesto de partidos ─────────────────────────────────────────────
    matches: MatchBudget;

    // ── Lo que una decisión le deja a LA TEMPORADA QUE VIENE ────────────────
    // Duran una sola temporada y se apagan solos al cerrarla. Si duraran más,
    // una decisión buena del año tres seguiría empujando en el año doce y nadie
    // podría explicar por qué.
    pendingPlayingTime: number;
    pendingStatBoost: number;
    /** Partidos de suspensión que te vas a comer. */
    pendingSanction: number;

    // ── Momentos ────────────────────────────────────────────────────────────
    /** La jugada que te espera esta temporada. `null` si no hay ninguna. */
    pendingMoment: PendingMoment | null;
    /** Las jugadas que ya jugaste. Es tu mano, no un dado: se persiste. */
    moments: MomentRecord[];

    // ── Eventos ─────────────────────────────────────────────────────────────
    pendingEventId: string | null;
    /**
     * Los últimos eventos vistos, MÁS RECIENTE PRIMERO. El cooldown es una
     * ventana de N entradas sobre esta lista, no un contador de temporadas:
     * es el patrón de `career/engine/event-selector.ts`.
     */
    recentEventIds: string[];

    // ── Lo que queda escrito ────────────────────────────────────────────────
    history: CaptainSeasonEntry[];
    decisionLog: CaptainDecisionEntry[];
}
