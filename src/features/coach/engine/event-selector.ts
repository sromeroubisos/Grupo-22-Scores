// Qué tarjeta sale. Un solo pool, filtrado por el contexto: no hay un motor de
// eventos por familia. Si hace falta una precondición nueva se extiende
// `EventRequirements` y se la evalúa acá — nunca un `if` para un evento suelto.

import { getCompetition } from '../data/competitions.ts';
import { ALL_EVENTS, getEvent } from '../data/events/index.ts';
import type { CoachState } from '../types/coach.ts';
import type { CoachEvent, EventRequirements } from '../types/event.ts';
import { debtMonths } from './economy.ts';
import { budgetOf } from './finance.ts';
import type { Rng } from './random.ts';

/**
 * Las tarjetas de cada tramo. Desde la etapa 2 no salen cinco juntas antes de
 * jugar: salen de a una o dos al arrancar cada tramo, y lo que dejan pesa en las
 * fechas que quedan. Suman cinco, las mismas que antes: el balance de la caja y
 * de la presión, medido con cinco tarjetas por año, no se mueve por el reparto.
 */
export const CARDS_PER_TRAMO: readonly number[] = [2, 2, 1];

/** Cuántas decisiones se toman por temporada. */
export const DECISIONS_PER_SEASON = CARDS_PER_TRAMO.reduce((s, n) => s + n, 0);

/** El contexto contra el que se filtra el pool. Todo se deriva del estado. */
interface Context {
    level: number;
    pressure: number;
    debtMonths: number;
    season: number;
    tenure: number;
    lastTdi: boolean;
    lastPromotion: boolean;
    lastRelegation: boolean;
}

function contextOf(state: CoachState): Context {
    const comp = getCompetition(state.competitionId);
    const budget = budgetOf(state, { bancoCorto: false });
    const last = state.seasons[state.seasons.length - 1];

    return {
        level: comp?.level ?? 4,
        pressure: state.pressure,
        debtMonths: debtMonths(state.club.finances.caja, budget.ingresos),
        season: state.season,
        // Temporadas seguidas en el club: se CUENTA de `seasons`, no se guarda.
        // Un contador guardado sería una segunda fuente de verdad y alcanzaría un
        // pase que se olvide de resetearlo para que la cabecera mienta.
        tenure: state.seasons.filter((s) => s.clubId === state.clubId).length,
        lastTdi: !!last?.tdi,
        lastPromotion: last?.movement === 'ascenso',
        lastRelegation: last?.movement === 'descenso',
    };
}

function meets(req: EventRequirements | undefined, ctx: Context): boolean {
    if (!req) return true;
    if (req.minLevel !== undefined && ctx.level < req.minLevel) return false;
    if (req.maxLevel !== undefined && ctx.level > req.maxLevel) return false;
    if (req.minPressure !== undefined && ctx.pressure < req.minPressure) return false;
    if (req.maxPressure !== undefined && ctx.pressure > req.maxPressure) return false;
    if (req.minDebtMonths !== undefined && ctx.debtMonths < req.minDebtMonths) return false;
    if (req.minSeason !== undefined && ctx.season < req.minSeason) return false;
    if (req.minTenure !== undefined && ctx.tenure < req.minTenure) return false;
    if (req.requiresTdi && !ctx.lastTdi) return false;
    if (req.requiresPromotion && !ctx.lastPromotion) return false;
    if (req.requiresRelegation && !ctx.lastRelegation) return false;
    return true;
}

/** Los eventos que hoy podrían salir, ya ordenados de forma estable por id. */
export function eligibleEvents(state: CoachState): CoachEvent[] {
    const ctx = contextOf(state);
    return ALL_EVENTS.filter((ev) => {
        const seen = state.seenEvents[ev.id];
        if (seen !== undefined) {
            if (!ev.repeatable) return false;
            if (ev.cooldown !== undefined && state.season - seen < ev.cooldown) return false;
        }
        if (!meets(ev.requires, ctx)) return false;
        if (ev.condition && !ev.condition(state)) return false;
        return true;
    }).sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * Elige la próxima tarjeta. Ordena antes de sortear: sin eso el resultado
 * dependería del orden de los arrays de `data/events/`, que es una fuente de
 * no-determinismo encubierta.
 */
export function pickEvent(rng: Rng, state: CoachState): CoachEvent | null {
    const pool = eligibleEvents(state);
    if (pool.length === 0) return null;
    return rng.weighted(pool, (ev) => ev.weight);
}

/**
 * Los porcentajes que se muestran en cada opción. Enteros que suman 100.
 * Elegir a ciegas entre dos frases no es decidir.
 */
export function optionPreview(eventId: string, optionId: string): number[] {
    const option = getEvent(eventId)?.options.find((o) => o.id === optionId);
    if (!option) return [];
    const total = option.outcomes.reduce((s, o) => s + o.weight, 0);
    if (total <= 0) return option.outcomes.map(() => 0);

    // Se reparte al entero y el resto se le da a los de mayor fracción, para que
    // la suma dé 100 exacto: "70 / 29" en pantalla se lee como un error.
    const raw = option.outcomes.map((o) => (o.weight / total) * 100);
    const floored = raw.map((v) => Math.floor(v));
    let left = 100 - floored.reduce((s, x) => s + x, 0);
    const order = raw
        .map((v, i) => ({ i, frac: v - Math.floor(v) }))
        .sort((a, b) => b.frac - a.frac || a.i - b.i);
    for (const { i } of order) {
        if (left <= 0) break;
        floored[i] += 1;
        left -= 1;
    }
    return floored;
}
