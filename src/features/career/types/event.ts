import type { AttributeKey, Position } from './player.ts';
import type { CareerState, ClubOffer } from './career.ts';
import type { EmploymentStatus, SquadTrack } from '../engine/contracts.ts';
import type { NationalStatus } from './player.ts';
import type { EconomicModel } from '../data/competition-levels2026.ts';

export type EventCategory =
    | 'club'
    | 'injury'
    | 'national-team'
    | 'personal'
    | 'tactical'
    | 'media'
    | 'milestone'
    | 'discipline';

/**
 * Requisitos de ENTORNO para que un evento sea elegible. Reemplazan a los cinco
 * motores paralelos que se evitaron: un solo pool de eventos, filtrado por el
 * contexto contractual/deportivo. Todos opcionales.
 */
export interface EventRequirements {
    employment?: EmploymentStatus[];
    squadTrack?: SquadTrack[];
    economicModels?: EconomicModel[];
    // Había acá un `startRoutes`, y existía para un caso solo: que al que empezaba
    // con contrato no le ofrecieran "dar el salto al profesionalismo", porque para
    // él ya había pasado. Con el arranque unificado (1.26.0) nadie empieza con
    // contrato, así que la cláusula pasaba siempre y un `requires` que nunca
    // rechaza es peor que no tenerlo: se lee como si cubriera un caso real.
    // Si algún día hace falta filtrar por rama, se vuelve a agregar acá y en
    // `meetsRequirements`, que es donde la convención dice que va.
    minSportingBand?: number;
    maxSportingBand?: number;
    minAge?: number;
    maxAge?: number;
    requiresRecentPromotion?: boolean;
    requiresRecentInjury?: boolean;
    requiresInternationalLoad?: boolean;
    /** Requiere que el jugador pueda representar a una unión (para eventos de selección). */
    requiresEligibleUnion?: boolean;
    /**
     * Requiere que exista OTRA unión que lo pueda representar, además de la suya.
     *
     * Es lo que hace real a `nt-eligibility-switch`. Sin esto la tarjeta decía
     * "otra selección más poderosa te tantea" sin que hubiera ninguna otra
     * selección: el claim rival se gana de verdad —60 meses de registro exclusivo
     * en otra unión, o 10 años de presencia acumulada (Reg. 8.1(c)/(d))— y
     * `advanceRegistration` ya lo viene acumulando desde siempre. Nadie lo miraba.
     *
     * Con el requisito puesto, la tarjeta sale solo cuando el jugador emigró y se
     * quedó, que es exactamente cuando pasa en el deporte.
     */
    requiresRivalUnion?: boolean;
    /**
     * Situación en la selección. Es lo que permite que los eventos de selección
     * distingan al que está en el plantel del que perdió la camiseta: sin esto,
     * a un jugador `dropped` le seguían ofreciendo la gira de fin de año.
     */
    nationalStatus?: NationalStatus[];
}

// Efecto declarativo que se aplica al jugador cuando se resuelve una opción.
// Contrato ÚNICO: los deltas de atributos van planos, por su nombre real
// (`{ mental: 4, stamina: -2 }`), tipados vía AttributeKey (tsc valida los
// nombres). La dinámica (moral/forma/fatiga/fama/riesgo) también es plana.
// Todos los deltas se suman (pueden ser negativos).
export interface Effect extends Partial<Record<AttributeKey, number>> {
    morale?: number;
    form?: number;
    fatigue?: number;
    fame?: number;
    injuryRisk?: number;
    /**
     * ⭐ VALORACIÓN, en puntos de OVR. Es el eje que el jugador lee.
     *
     * Existe porque los dos caminos dicen cosas distintas y las dos hacen falta:
     * un delta de atributo declara QUÉ tipo de jugador estás construyendo
     * (`{ kick: 5 }` es hacerte cargo de los palos), y `valoracion` declara que
     * simplemente sos mejor —el verano entrenando con un ex Puma no te vuelve
     * pateador, te vuelve mejor jugador—.
     *
     * Se reparte entre los atributos PROPORCIONALMENTE al peso que cada uno tiene
     * en el OVR del puesto (`spreadValoracion`), así que el número que promete la
     * tarjeta es exactamente el que termina en la cabecera. Un delta de atributo
     * suelto también produce ⭐, pero al revés: se lo calcula
     * (`ovrDeltaOf`) en vez de declararlo.
     *
     * Mantenelo en ±1 a ±3. Más que eso compite con la progresión de la
     * temporada, que es de donde tiene que salir el grueso del crecimiento.
     */
    valoracion?: number;
    /**
     * 🕒 TIEMPO DE JUEGO, en escalones (±1 a ±3), para la temporada que se está
     * por jugar. Multiplica la fracción de fechas que le toca por su lugar en el
     * plantel (`engine/season-modifiers.ts`), no la reemplaza: el que no entra en
     * los planes del técnico no pasa a titular por hablar con él.
     *
     * Es el eje que el escalafón de plantel NO cubría: hasta ahora una decisión
     * sólo podía mover minutos de refilón, empujando la forma.
     */
    playingTime?: number;
    /**
     * 🚫 SANCIÓN. La tarjeta es el relato y los partidos son la consecuencia:
     * los partidos suspendidos se descuentan de la disponibilidad de la
     * temporada, por el mismo camino que una lesión.
     *
     * `reason` es opcional — si no viene, queda el título del evento, que es lo
     * que el jugador acaba de leer.
     */
    sanction?: { card?: 'amarilla' | 'roja'; matches?: number; reason?: string };
    /**
     * PLANILLA de la temporada que se está por jugar. Es lo que reemplaza a la
     * plata: en este juego una decisión no paga en dinero —el rugby no tiene
     * valor de mercado en euros y el escalafón de empleo es el eje económico—,
     * así que cuando el premio de una decisión es material, se cobra en cancha.
     *
     * Los tries suman puntos por la tabla de siempre (`computePoints`), no por
     * una cuenta aparte.
     */
    statBoost?: { tries?: number; tackles?: number };
    flags?: Record<string, number>; // setea/incrementa banderas narrativas
    changePosition?: Position; // cambios de posición (solo eventos excepcionales)
    forceInjury?: { name: string; severity: 'leve' | 'moderada' | 'grave'; seasonsOut: number };
    titleBoost?: number; // empuje a la chance de título esta temporada
    /**
     * Multiplicador sobre la fracción de tests que juega con la selección esta
     * temporada (1 = sin efecto). NO otorga caps: reemplazó a `capBoost`, que
     * era un segundo camino de código para lo mismo y terminó regalando caps de
     * los All Blacks a un jugador de OVR 66. Ver `engine/national-team.ts`.
     */
    testShare?: number;
    /**
     * Le saca puntos a la valoración de selección durante N temporadas. Es la
     * ÚNICA vía por la que una decisión puede costarte la camiseta, y no lo hace
     * escribiendo `nationalStatus` sino empujándote por debajo del umbral: quien
     * decide sigue siendo `evaluateNationalTeam`.
     */
    selectionPenalty?: { points: number; seasons: number };
    moveToOffer?: ClubOffer; // fichaje: cambia club/liga/rol (transfer window)
    /**
     * Cierra la carrera. Es el efecto de la opción "Retirarte ahora", y va acá
     * —como dato— y no como un `if` en la UI porque el retiro pasó a ser una
     * decisión más del juego (ver `engine/retirement.ts`).
     */
    retire?: true;
}

// Un posible resultado de una opción. Permite decisiones probabilísticas
// (ej. "50% titular / 50% rotación"): se elige por peso con el RNG seedeado.
export interface Outcome {
    weight: number;
    effect: Effect;
    resultText: string; // narración del desenlace
}

/**
 * Ficha del club que hay detrás de una opción de mercado. Sin esto, dos ofertas
 * de "Contrato profesional · titular" son indistinguibles y el jugador elige a
 * ciegas entre dos nombres. Es SOLO presentación: se reconstruye desde
 * `state.offers` en cada render, no se guarda en `CareerState`.
 */
export interface OfferPresentation {
    clubId: string;
    clubName: string;
    /** Competición del club destino, ya resuelta a nombre mostrable. */
    league: string;
    /** Hacia dónde te mueve el pase, según el escalafón de mercado. */
    direction: 'up' | 'down' | 'lateral';
    /** Por qué te llegó esta oferta. null si no hay una señal clara. */
    reason: string | null;
    /**
     * El mismo motivo COMO DATO, para que otro idioma lo pueda escribir sin
     * deducirlo del español. Mismo criterio que `ChipValue` en `engine/impact.ts`.
     */
    reasonKey: import('../data/movement-copy.ts').OfferReasonKey | null;
    /** Temporadas de titularidad, que es el único motivo con un número adentro. */
    starterSeasons: number;
    /** Naturaleza del movimiento, para reescribir la opción en otro idioma. */
    movementKind: import('./career.ts').MovementKind;
}

export interface EventOption {
    id: string;
    label: string;
    hint?: string; // descripción corta de la consecuencia esperada
    outcomes: Outcome[]; // >=1; si es 1, es determinístico
    /** Solo en el mercado de pases: el club concreto detrás de la opción. */
    offer?: OfferPresentation;
    /**
     * Escudo que acompaña a la opción cuando NO hay `offer` detrás. Existe por
     * la opción de quedarse: dos tarjetas con escudo contra una pelada hacen que
     * seguir en el club parezca la opción menor antes de que el jugador lea una
     * palabra. Es SOLO presentación y se reconstruye en cada render.
     */
    crestClubId?: string;
    /**
     * Bandera que acompaña a la opción. Mismo contrato que `crestClubId`: es SOLO
     * presentación y se reconstruye en cada render, así que no entra en el estado
     * guardado ni en el `stateHash`.
     *
     * Existe por el cambio de selección: la tarjeta decía "otra selección más
     * poderosa te tantea" y no mostraba cuál, así que el jugador elegía a ciegas
     * entre dos banderas de las que sólo conocía una.
     */
    flagCountryCode?: string;
}

// Contexto que reciben las condiciones de aparición.
export interface EventContext {
    state: CareerState;
    ovr: number;
    group: 'forward' | 'back';
}

export interface GameEvent {
    id: string;
    category: EventCategory;
    title: string;
    text: string; // planteo narrativo mostrado al jugador

    weight: number; // peso base de aparición
    repeatable: boolean; // si puede repetirse en la carrera
    cooldown?: number; // temporadas mínimas entre apariciones (si repeatable)

    // Filtros declarativos de aparición (todos opcionales).
    positions?: Position[];
    origins?: string[];
    minAge?: number;
    maxAge?: number;
    minOvr?: number;
    maxOvr?: number;
    requiresFlags?: string[]; // banderas que deben estar presentes (>0)
    forbidsFlags?: string[]; // banderas que NO deben estar presentes

    // Requisitos de entorno contractual/deportivo (nuevo).
    requires?: EventRequirements;

    // Condición imperativa para casos complejos (opcional).
    condition?: (ctx: EventContext) => boolean;

    options: EventOption[];
}
