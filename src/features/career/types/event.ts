import type { AttributeKey, Position } from './player.ts';
import type { CareerState, ClubOffer } from './career.ts';
import type { EmploymentStatus, SquadTrack } from '../engine/contracts.ts';
import type { EconomicModel } from '../data/competition-levels2026.ts';

export type EventCategory =
    | 'club'
    | 'injury'
    | 'national-team'
    | 'personal'
    | 'tactical'
    | 'media'
    | 'milestone';

/**
 * Requisitos de ENTORNO para que un evento sea elegible. Reemplazan a los cinco
 * motores paralelos que se evitaron: un solo pool de eventos, filtrado por el
 * contexto contractual/deportivo. Todos opcionales.
 */
export interface EventRequirements {
    employment?: EmploymentStatus[];
    squadTrack?: SquadTrack[];
    economicModels?: EconomicModel[];
    minSportingBand?: number;
    maxSportingBand?: number;
    minAge?: number;
    maxAge?: number;
    requiresRecentPromotion?: boolean;
    requiresRecentInjury?: boolean;
    requiresInternationalLoad?: boolean;
    /** Requiere que el jugador pueda representar a una unión (para eventos de selección). */
    requiresEligibleUnion?: boolean;
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
    flags?: Record<string, number>; // setea/incrementa banderas narrativas
    changePosition?: Position; // cambios de posición (solo eventos excepcionales)
    forceInjury?: { name: string; severity: 'leve' | 'moderada' | 'grave'; seasonsOut: number };
    titleBoost?: number; // empuje a la chance de título esta temporada
    capBoost?: number; // caps garantizados esta temporada
    moveToOffer?: ClubOffer; // fichaje: cambia club/liga/rol (transfer window)
}

// Un posible resultado de una opción. Permite decisiones probabilísticas
// (ej. "50% titular / 50% rotación"): se elige por peso con el RNG seedeado.
export interface Outcome {
    weight: number;
    effect: Effect;
    resultText: string; // narración del desenlace
}

export interface EventOption {
    id: string;
    label: string;
    hint?: string; // descripción corta de la consecuencia esperada
    outcomes: Outcome[]; // >=1; si es 1, es determinístico
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
