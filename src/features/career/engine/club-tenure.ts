// PERMANENCIA EN EL CLUB. Es DERIVADA, no un campo del estado.
//
// `seasons[]` ya dice en qué club se jugó cada temporada, así que un contador
// guardado sería una segunda fuente de verdad: alcanzaría un pase que se olvide
// de resetearlo para que la cabecera mienta y para que un guardado viejo quede
// inconsistente. Se recalcula al renderizar y no toca el schema.
//
// Se cuentan TEMPORADAS, NO DECISIONES. Con ritmo Exprés un solo "Seguir en X"
// son tres temporadas en el club; si el contador midiera decisiones, la misma
// carrera parecería tres veces menos fiel solo por haberse jugado más rápido.

import type { CareerState } from '../types/career.ts';

/**
 * Distinción por permanencia. La escalera es corta a propósito: son dos escalones
 * separados por cinco temporadas, no una barra de progreso.
 */
export interface TenureTier {
    id: 'referente' | 'idolo';
    label: string;
    /** Temporada en el club a partir de la cual se ostenta. */
    seasons: number;
}

export const TENURE_TIERS: readonly TenureTier[] = [
    { id: 'referente', label: 'Referente', seasons: 5 },
    { id: 'idolo', label: 'Ídolo', seasons: 10 },
];

export interface ClubTenure {
    /** Club al que pertenece el jugador ahora. */
    clubId: string;
    /** Temporadas consecutivas YA JUGADAS en ese club. */
    played: number;
    /**
     * Ordinal de la temporada EN CURSO en el club (`played + 1`). Es el número
     * que se muestra: cuando el jugador decide, decide sobre esta temporada.
     */
    current: number;
    /** Distinción ya alcanzada, o null. */
    tier: TenureTier | null;
    /** La que sigue y cuántas temporadas faltan. null si ya está la última. */
    next: { tier: TenureTier; seasonsAway: number } | null;
}

/**
 * Temporadas consecutivas en el club actual, contando hacia atrás desde la
 * última jugada. Un pase corta la cuenta: volver años después al mismo club
 * empieza un ciclo nuevo, que es lo que la hinchada entiende por permanencia.
 */
export function clubTenure(state: CareerState): ClubTenure {
    const clubId = state.player.club;

    let played = 0;
    for (let i = state.seasons.length - 1; i >= 0; i--) {
        if (state.seasons[i].club !== clubId) break;
        played++;
    }

    const current = played + 1;

    let tier: TenureTier | null = null;
    let next: { tier: TenureTier; seasonsAway: number } | null = null;
    for (const t of TENURE_TIERS) {
        if (current >= t.seasons) {
            tier = t;
            continue;
        }
        next = { tier: t, seasonsAway: t.seasons - current };
        break;
    }

    return { clubId, played, current, tier, next };
}

/** Contador corto para la cabecera: "4ª temporada". */
export function tenureCounter(tenure: ClubTenure): string {
    return `${tenure.current}ª temporada`;
}
