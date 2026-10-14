// La forma de una decisión. Los eventos son DATOS, no código: para agregar
// contenido se suma un objeto al archivo de su familia y no se toca el selector.
// Si hace falta una precondición que `requires` todavía no soporta, se extiende
// `requires` y su evaluador en `engine/event-selector.ts` — nunca un `if`
// especial para un evento.

import type { CoachState } from './coach.ts';

export type EventFamily =
    | 'club' // la subcomisión, la sede, el sponsor
    | 'plantel' // el vestuario y los que se van
    | 'cantera' // el M19
    | 'lesiones' // el parte médico y la disciplina
    | 'prensa' // los medios y el barrio
    | 'viaje'; // el micro, la logística, la fecha suspendida

/** Prefijos de id vigentes, uno por familia. `events-shape.test.ts` los exige. */
export const FAMILY_PREFIX: Record<EventFamily, string> = {
    club: 'club-',
    plantel: 'pla-',
    cantera: 'can-',
    lesiones: 'les-',
    prensa: 'pre-',
    viaje: 'via-',
};

/** Requisitos de entorno para que una tarjeta sea elegible. Todos opcionales. */
export interface EventRequirements {
    /** Nivel de la competición: 2 es el Top 14, 5 es el fondo de la pirámide. */
    minLevel?: number;
    maxLevel?: number;
    /** Presión sobre el entrenador. */
    minPressure?: number;
    maxPressure?: number;
    /** Meses de deuda del club. 0 = la caja está sana. */
    minDebtMonths?: number;
    /** Temporada de la carrera. Los hitos de vestuario no salen en la primera. */
    minSeason?: number;
    /** Temporadas seguidas en el club. */
    minTenure?: number;
    /** Que el club haya clasificado al Torneo del Interior el año pasado. */
    requiresTdi?: boolean;
    /** Que venga de ascender o de descender. */
    requiresPromotion?: boolean;
    requiresRelegation?: boolean;
}

/**
 * El efecto de una opción, declarativo. Todo se suma (puede ser negativo).
 *
 * Ninguno de estos campos se le muestra al jugador tal cual: los chips salen de
 * RESTAR el estado antes y después (`engine/impact.ts`), así que si el motor
 * recorta un efecto por un techo, la ficha dice lo que de verdad pasó. Es la
 * mejora de El Capitán que se trae desde el día uno.
 */
export interface CoachEffect {
    /** Porcentaje de la caja: −0,35 es "se va el 35% de lo que hay". */
    cajaPct?: number;
    /** Pesos, en firme. Para lo que no escala con el tamaño del club. */
    cajaFijo?: number;
    cohesion?: number;
    hinchada?: number;
    estructura?: number;
    socios?: number;
    /** Presión sobre el entrenador. Sube = te aprieta. */
    presion?: number;
    /** Nombre del entrenador en el ambiente. */
    reputacion?: number;

    /** Puntos de rating para LA TEMPORADA que se está por jugar. Se apaga al cerrar. */
    rating?: number;
    /** Riesgo extra de lesión por partido, esta temporada. */
    injuryRisk?: number;
    /** Viajar con 22 en vez de 26: el banco se queda sin primera línea. */
    bancoCorto?: true;

    /** Le suma nivel a un jugador del plantel. `target` dice a cuál. */
    jugador?: {
        delta: number;
        target: 'mejor' | 'peor' | 'joven' | 'primera-linea';
        /** Si además le sube el techo: formarlo, no solo entrenarlo. */
        potencial?: number;
    };
    /** Se va el mejor del plantel. No cobrás nada: en rugby no hay traspaso. */
    pierdeMejor?: true;
    /** Sube uno del M19 al lugar del dorsal más flojo. */
    subeDelM19?: true;
    /** Le da la certificación de primera línea al que no la tenía. */
    certificaPrimeraLinea?: true;

    flags?: Record<string, number>;
}

/** Un desenlace posible de una opción. */
export interface CoachOutcome {
    /** Peso relativo. Escribilos como se leen: 70/30, no 7/3. */
    weight: number;
    effect: CoachEffect;
    /** La narración de lo que pasó. */
    resultText: string;
}

export interface CoachOption {
    id: string;
    label: string;
    /** Corto, y dice el COSTO, no solo el beneficio. */
    hint: string;
    /** Uno o más. Con uno solo, la opción es determinística. */
    outcomes: CoachOutcome[];
}

export interface CoachEvent {
    id: string;
    family: EventFamily;
    title: string;
    /** El planteo. Crónica deportiva, no videojuego. */
    text: string;
    /** Peso relativo dentro del pool. */
    weight: number;
    repeatable: boolean;
    /** Temporadas hasta que puede volver a salir. */
    cooldown?: number;
    requires?: EventRequirements;
    /** Condición imperativa, para lo que `requires` no cubre. */
    condition?: (state: CoachState) => boolean;
    /**
     * Nunca una sola opción. Si el jugador no elige nada, no es una decisión: es
     * un resultado, y va como tarjeta de resultado. `events-shape.test.ts` lo exige.
     */
    options: CoachOption[];
}
