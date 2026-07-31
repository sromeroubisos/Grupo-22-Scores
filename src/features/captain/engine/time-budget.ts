// EL CAPITÁN — las seis fichas de Tiempo.
//
// El corazón de la adaptación. En El Ídolo la plata se acumula y se gasta en
// una tienda; en el rugby amateur argentino no hay plata que administrar —el
// jugador es socio, paga la cuota y hasta paga el fichaje— y lo que compite de
// verdad es el TIEMPO: el laburo, la facultad, el club y la familia te piden
// las mismas horas que el entrenamiento.
//
// Seis fichas por temporada. No hay reparto obviamente correcto, y esa es la
// gracia: el que entrena de más y no tiene laburo, el que labura y llega tarde
// a entrenar, el que es el alma del club y nunca sube de nivel. Los tres son
// carreras distintas y las tres son ciertas.
//
// ── La regla del reducer ──
// Poner y sacar fichas NO CONSUME AZAR. Repartirlas veinte veces tiene que
// dejar el `rngState` idéntico: si no, la carrera terminaría dependiendo de
// cuántas veces dudaste antes de confirmar. Por eso estas funciones son
// aritmética pura y no reciben un `rng`.

import { TIME_SLOTS, TIME_TOKENS_PER_SEASON } from '../types/currencies.ts';
import type { TimeBudget, TimeSlot } from '../types/currencies.ts';

/** Seis fichas sin repartir, con las cinco ranuras presentes y en cero. */
export function resetTimeBudget(total = TIME_TOKENS_PER_SEASON): TimeBudget {
    const spent = {} as Record<TimeSlot, number>;
    for (const slot of TIME_SLOTS) spent[slot] = 0;
    return { total, spent };
}

/** Cuántas fichas hay puestas. Itera por `TIME_SLOTS`, nunca por `Object.keys`. */
export function tokensSpent(budget: TimeBudget): number {
    let total = 0;
    for (const slot of TIME_SLOTS) total += budget.spent[slot] ?? 0;
    return total;
}

/** Cuántas quedan por repartir. */
export function tokensLeft(budget: TimeBudget): number {
    return Math.max(0, budget.total - tokensSpent(budget));
}

/** ¿Está cerrado el reparto? Es lo que habilita el botón de jugar la temporada. */
export function isTimeBudgetFull(budget: TimeBudget): boolean {
    return tokensLeft(budget) === 0;
}

/**
 * Pone una ficha. Si no quedan, no pasa nada y devuelve el mismo presupuesto:
 * el tope es del modelo, no de la pantalla que lo dibuja.
 */
export function spendToken(budget: TimeBudget, slot: TimeSlot): TimeBudget {
    if (tokensLeft(budget) <= 0) return budget;
    return { total: budget.total, spent: { ...budget.spent, [slot]: (budget.spent[slot] ?? 0) + 1 } };
}

/** Saca una ficha. Nunca baja de cero. */
export function unspendToken(budget: TimeBudget, slot: TimeSlot): TimeBudget {
    const current = budget.spent[slot] ?? 0;
    if (current <= 0) return budget;
    return { total: budget.total, spent: { ...budget.spent, [slot]: current - 1 } };
}
