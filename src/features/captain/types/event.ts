// EL CAPITÁN — la forma de una decisión.
//
// Los eventos son DATOS, no código. Para agregar contenido no se toca el
// selector: se agregan objetos al archivo de la familia que corresponda. Si
// hace falta una precondición que `requires` todavía no soporta, se extiende
// `requires` y su evaluador — nunca un `if` especial para un evento.
//
// ── Nunca una decisión de una sola opción ──
// Si el jugador no elige nada, no es una decisión: es un resultado, y va como
// tarjeta de resultado. Lo verifica `events-shape.test.ts`.
//
// ── Las probabilidades se muestran ──
// Cada opción lista sus desenlaces con su porcentaje. Elegir a ciegas entre dos
// frases no es decidir. Por eso los pesos se escriben como se van a leer —70 y
// 30, no 7 y 3— y el test verifica que sumen 100.

import type { CaptainAttributeKey, CaptainStage, PositionFamilyId, PositionGroup } from './player.ts';
import type { SquadTrack } from './captain.ts';

export type EventCategory =
    | 'club'
    | 'personal'
    | 'seleccion'
    | 'cuerpo'
    | 'disciplina'
    | 'mercado'
    | 'veterano';

/**
 * Lo que un desenlace le hace a la carrera.
 *
 * NADA DE PLATA en la etapa amateur (CLAUDE.md §5): si el premio de una
 * decisión es material, se cobra en cancha con `statBoost`. `engine/money.ts`
 * ignora el delta si todavía sos amateur, así que la regla no depende de que
 * quien escriba el próximo evento se acuerde.
 */
export interface CaptainEffect {
    /** Deltas de atributo. La ⭐ de la tarjeta sale de acá, no se declara. */
    attrs?: Partial<Record<CaptainAttributeKey, number>>;
    belonging?: number;
    fame?: number;
    money?: number;
    /** HIA positivos. Sube 🧠 y no baja nunca. */
    head?: number;
    body?: number;
    /** Escalones de 🕒 tiempo de juego. Dura UNA temporada y se apaga sola. */
    playingTime?: number;
    /** Empuje a la planilla del puesto. Dura UNA temporada. */
    statBoost?: number;
    /** Partidos de suspensión. Se descuentan de la temporada que viene. */
    sanction?: number;
    /** Contadores libres del jugador: caps declarados, HIA ocultados, lo que sea. */
    flags?: Record<string, number>;
    /** Acepta la oferta que trajo la tarjeta. Solo en eventos de mercado. */
    takeOffer?: boolean;
    /** Vuelve al club de origen y rescinde. */
    returnHome?: boolean;
    /** Se termina acá. */
    retire?: boolean;
}

export interface CaptainOutcome {
    /** Porcentaje. Los de una opción suman 100. */
    weight: number;
    effect: CaptainEffect;
    resultText: string;
}

export interface CaptainOption {
    id: string;
    label: string;
    /** Corto, y dice EL COSTO además del beneficio (CLAUDE.md §4). */
    hint: string;
    outcomes: CaptainOutcome[];
}

/** Gates duros. Todos se evalúan en cascada y cualquiera que falle deja fuera. */
export interface EventRequirements {
    stage?: CaptainStage[];
    tracks?: SquadTrack[];
    minAge?: number;
    maxAge?: number;
    minOvr?: number;
    maxOvr?: number;
    families?: PositionFamilyId[];
    group?: PositionGroup;
    minBelonging?: number;
    maxBelonging?: number;
    /** Temporadas jugadas como mínimo. Para que los hitos no salgan el primer año. */
    minSeasons?: number;
    /** Necesita tener club. */
    needsClub?: boolean;
    /** Necesita unión con selección. */
    needsUnion?: boolean;
    /** Necesita estar lejos del club de origen. */
    awayFromHome?: boolean;
}

export interface CaptainEvent {
    /** Prefijo de familia + kebab-case, único. Lo verifica el test de forma. */
    id: string;
    category: EventCategory;
    title: string;
    text: string;
    /** Probabilidad relativa dentro del pool. */
    weight: number;
    repeatable: boolean;
    /** Temporadas hasta que puede repetirse. Solo con `repeatable`. */
    cooldown?: number;
    requires?: EventRequirements;
    options: CaptainOption[];
}
