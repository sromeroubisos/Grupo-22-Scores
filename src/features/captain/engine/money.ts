// EL CAPITÁN — la plata.
//
// Existe, pero recién después de firmar profesional. Antes de eso el rugby de
// club argentino no paga: el jugador es socio, paga la cuota y paga el fichaje.
// Esa es la diferencia más grande con el fútbol y la que rompe la traducción
// directa de El Ídolo — si el juego te muestra una billetera en la M19, miente
// desde la primera pantalla.
//
// ── Por qué la puerta vive acá ──
// Porque una invariante que depende de que nadie se olvide, se rompe. Cualquier
// evento puede prometer un premio material sin saber en qué etapa está la
// carrera; esta función lo ignora si todavía sos amateur, y listo. El eje
// económico del amateur son las seis fichas de Tiempo (CLAUDE.md §5: nada de
// plata en las decisiones; si el premio es material, se cobra en cancha).
//
// La escalera de después sí es real y los saltos son enormes: Super Rugby
// Américas paga entre 14.000 y 18.000 euros anuales, el Championship inglés
// 25.000, la Pro D2 francesa 75.000, y el Top 14 promedia 223.000 para un wing
// y 343.000 para un apertura. El puesto que más tries hace es el peor pago del
// Top 14: la gloria y la plata no viven en el mismo lado.

import { MONEY_MIN } from '../types/currencies.ts';
import type { CaptainStage } from '../types/player.ts';

/** ¿Corre la plata en esta etapa? */
export function canEarnMoney(stage: CaptainStage): boolean {
    return stage === 'professional';
}

/**
 * Mueve la plata y devuelve el saldo nuevo.
 *
 * En amateur devuelve el saldo SIN TOCAR —no cero: sin tocar— para que el
 * jugador que acaba de rescindir un contrato no pierda lo que ya cobró.
 * Nunca baja de cero: acá no se debe plata.
 */
export function applyMoney(current: number, delta: number, stage: CaptainStage): number {
    if (!canEarnMoney(stage)) return current;
    return Math.max(MONEY_MIN, Math.round(current + delta));
}
