// Minijuego 1: la semana de entrenamiento.
//
// Antes de cada tramo el entrenador reparte cinco días. Cada día tiene una CARGA
// (alta, media, baja) y un FOCO (scrum y line, defensa, ataque, físico,
// recuperación). La semana no sortea nada: mismo plan, mismo plantel, mismo
// efecto. Lo que mueve:
//
//   · el cansancio del plantel, de una vez, al cerrar la semana;
//   · un bono de rendimiento para las fechas del tramo (`bonus`);
//   · un bono EXTRA para el partido clave (`keyBonus`): solo los días cuyo foco
//     ataca la debilidad del rival clave;
//   · el riesgo de lesión por partido durante el tramo;
//   · cuánto menos se cansa el XV en cada fecha (los días de físico);
//   · el crecimiento de los pibes (21 o menos), hasta su techo.
//
// La debilidad de un rival es un DATO del club: sale de un hash de su id, sin
// RNG. El mismo club tiene la misma debilidad todas las temporadas, y se puede
// leer antes de entrenar.
//
// LOS NÚMEROS SON CHICOS A PROPÓSITO. Un punto de rating son ~2 puntos de
// marcador (`PTS_PER_RATING`). La semana por defecto deja +0,43 de rating en el
// tramo; la más agresiva posible, +0,75 con +30 de cansancio de entrada. Nunca
// tocan las constantes del dado.

import type {
    LineupPolicy,
    SquadPlayer,
    TrainingDay,
    TrainingFocus,
    TrainingLoad,
    TrainingPlan,
    TrainingWeek,
} from '../types/coach.ts';
import { hashSeed } from './random.ts';

export const TRAINING_DAYS = 5;

export const TRAINING_LOADS: readonly { id: TrainingLoad; label: string; hint: string }[] = [
    { id: 'alta', label: 'Alta', hint: 'Rinde más y cansa. Suma riesgo de lesión.' },
    { id: 'media', label: 'Media', hint: 'El equilibrio de siempre.' },
    { id: 'baja', label: 'Baja', hint: 'Cuida las piernas. Rinde poco.' },
];

export const TRAINING_FOCUSES: readonly { id: TrainingFocus; label: string; hint: string }[] = [
    { id: 'scrum-line', label: 'Scrum y line', hint: 'La pelota parada. Pega si el rival flojea ahí.' },
    { id: 'defensa', label: 'Defensa', hint: 'Tackle y línea. Pega si el rival flojea ahí.' },
    { id: 'ataque', label: 'Ataque', hint: 'Jugadas y apoyo. Pega si el rival flojea ahí.' },
    { id: 'fisico', label: 'Físico', hint: 'Rinde menos hoy, pero el XV se cansa menos y se lastima menos.' },
    { id: 'recuperacion', label: 'Recuperación', hint: 'No suma rendimiento: baja el cansancio.' },
];

export const LINEUP_POLICIES: readonly { id: LineupPolicy; label: string; hint: string }[] = [
    { id: 'mejores', label: 'Los mejores', hint: 'Juegan los de más nivel. Solo descansa el que está fundido.' },
    { id: 'rotacion', label: 'Rotar', hint: 'Descansa al cansado antes. Pierde algo de nivel, cuida las piernas.' },
    { id: 'cantera', label: 'Pista a los pibes', hint: 'El propio juega si la diferencia es chica. Cumple el formativo, resigna nivel.' },
];

/** Los focos que pueden ser la debilidad de un rival. */
export const WEAKNESSES: readonly TrainingFocus[] = ['scrum-line', 'defensa', 'ataque'];

/** Lo que vale cada carga. `growth` es nivel de los pibes por día; `risk`, riesgo de lesión por partido. */
const LOAD: Readonly<Record<TrainingLoad, { gain: number; fatigue: number; risk: number; growth: number; rest: number; relief: number }>> = {
    alta: { gain: 0.3, fatigue: 6, risk: 0.004, growth: 0.06, rest: 4, relief: 1.2 },
    media: { gain: 0.2, fatigue: 3, risk: 0, growth: 0.04, rest: 7, relief: 0.8 },
    baja: { gain: 0.08, fatigue: 0, risk: -0.001, growth: 0.015, rest: 10, relief: 0.3 },
};

/** Lo que rinde para todo el tramo un día técnico, como fracción de su `gain`. */
const GENERAL_SHARE = 0.5;
/** Lo que rinde en el partido clave un día que ataca la debilidad del rival. */
const KEY_SHARE = 1.5;
/** Lo que rinde un día de físico para todo el tramo. */
const PHYSICAL_SHARE = 0.4;
/** El físico baja el riesgo de lesión; la recuperación también. */
const PREVENTION = 0.002;

export const MAX_BONUS = 1.2;
export const MAX_KEY_BONUS = 2;

/**
 * La semana por defecto: un día de cada foco técnico, uno de físico y uno de
 * recuperación, y rotar el XV. Es razonable, no es la mejor: no sabe contra quién
 * se juega.
 */
export const DEFAULT_TRAINING: TrainingPlan = {
    days: [
        { load: 'media', focus: 'scrum-line' },
        { load: 'media', focus: 'defensa' },
        { load: 'alta', focus: 'ataque' },
        { load: 'media', focus: 'fisico' },
        { load: 'baja', focus: 'recuperacion' },
    ],
    lineup: 'rotacion',
};

/** La debilidad de un club. Un dato derivado de su id, sin azar. */
export function rivalWeakness(clubId: string): TrainingFocus {
    return WEAKNESSES[hashSeed(`debilidad:${clubId}`) % WEAKNESSES.length];
}

const LOAD_IDS = new Set<string>(TRAINING_LOADS.map((l) => l.id));
const FOCUS_IDS = new Set<string>(TRAINING_FOCUSES.map((f) => f.id));
const POLICY_IDS = new Set<string>(LINEUP_POLICIES.map((p) => p.id));

/** Un plan legal: cinco días con carga y foco conocidos, y una política del XV. */
export function validTraining(plan: unknown): plan is TrainingPlan {
    if (typeof plan !== 'object' || plan === null) return false;
    const p = plan as Partial<TrainingPlan>;
    return (
        Array.isArray(p.days)
        && p.days.length === TRAINING_DAYS
        && p.days.every(
            (d: unknown) =>
                typeof d === 'object'
                && d !== null
                && LOAD_IDS.has((d as TrainingDay).load)
                && FOCUS_IDS.has((d as TrainingDay).focus),
        )
        && POLICY_IDS.has(p.lineup as string)
    );
}

/** El plan con el que se simula: el que el entrenador dejó fijo, o el del motor. */
export function planOf(fixed: TrainingPlan | null | undefined): TrainingPlan {
    return fixed && validTraining(fixed) ? fixed : DEFAULT_TRAINING;
}

export interface WeekEffect extends TrainingWeek {
    /** Cansancio que suma la semana a todo el plantel (negativo: descansa). */
    fatigue: number;
    /** Nivel que suman los pibes de 21 o menos, antes del factor del entrenador. */
    growth: number;
}

/**
 * Lo que deja una semana, contra un rival clave con esa debilidad. Puro: se usa
 * para la vista previa de la pantalla y para aplicarla, con la misma cuenta.
 */
export function weekEffect(plan: TrainingPlan, weakness: TrainingFocus | null): WeekEffect {
    let bonus = 0;
    let keyBonus = 0;
    let injuryRisk = 0;
    let fatigue = 0;
    let fatigueRelief = 0;
    let growth = 0;
    for (const day of plan.days) {
        const l = LOAD[day.load];
        injuryRisk += l.risk;
        if (day.focus === 'recuperacion') {
            fatigue -= l.rest;
            injuryRisk -= PREVENTION;
            continue;
        }
        fatigue += l.fatigue;
        if (day.focus === 'fisico') {
            bonus += l.gain * PHYSICAL_SHARE;
            fatigueRelief += l.relief;
            injuryRisk -= PREVENTION;
            growth += l.growth * 1.3;
            continue;
        }
        bonus += l.gain * GENERAL_SHARE;
        growth += l.growth;
        if (weakness && day.focus === weakness) keyBonus += l.gain * KEY_SHARE;
    }
    return {
        plan,
        bonus: round3(Math.min(MAX_BONUS, bonus)),
        keyBonus: round3(Math.min(MAX_KEY_BONUS, keyBonus)),
        injuryRisk: round3(injuryRisk),
        fatigueRelief: round3(fatigueRelief),
        fatigue,
        growth: round3(growth),
    };
}

/**
 * Aplica la semana al plantel: el cansancio a todos (los lesionados también
 * entrenan aparte, pero no cargan: a ellos solo les baja) y el crecimiento a los
 * pibes, multiplicado por la formación del entrenador y nunca por encima del
 * techo.
 */
export function applyWeek(squad: readonly SquadPlayer[], effect: WeekEffect, formacion: number): SquadPlayer[] {
    const factor = 0.6 + formacion / 12;
    return squad.map((p) => {
        const load = p.injury > 0 ? Math.min(0, effect.fatigue) : effect.fatigue;
        const fatigue = clamp(Math.round(p.fatigue + load), 0, 100);
        const level = p.age <= 21 && effect.growth > 0
            ? Math.min(p.potential, Math.round((p.level + effect.growth * factor) * 10) / 10)
            : p.level;
        return fatigue === p.fatigue && level === p.level ? p : { ...p, fatigue, level: Math.max(p.level, level) };
    });
}

function round3(v: number): number {
    return Math.round(v * 1000) / 1000;
}

function clamp(v: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, v));
}
