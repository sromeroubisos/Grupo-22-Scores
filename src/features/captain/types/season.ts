// EL CAPITÁN — la temporada: el presupuesto de partidos y lo que queda escrito.

import type { CaptainStage } from './player.ts';

// ═══════════════════════════════════════════════════════════════════════════
//  EL TECHO DE 30 PARTIDOS
// ═══════════════════════════════════════════════════════════════════════════
//
// Va acá y no con las seis monedas porque no es una moneda: es un presupuesto
// que se reparte y se vacía todas las temporadas.
//
// En octubre de 2025 World Rugby aprobó por primera vez directrices globales de
// carga: 30 partidos como máximo por temporada, 6 semanas consecutivas de
// partido, una semana de descanso obligatorio después de la selección. No es un
// número inventado para que el juego tenga tensión — es lo que hizo que en la
// ventana de julio de 2026 Contepomi descansara a casi todos los Pumas del Top
// 14, capitán incluido.
//
// La gracia mecánica es que los compromisos SUMAN MÁS DE 30. Liga, copa, las
// dos ventanas internacionales y el Nacional de Clubes no entran juntos, y
// cada bloque que resignás tiene a alguien del otro lado que se enoja.

export const MATCH_CAP_PER_SEASON = 30;

export type MatchBucket = 'liga' | 'copa' | 'internacional' | 'nacional-de-clubes';

/** Orden canónico: se itera por acá, nunca por `Object.keys(planned)`. */
export const MATCH_BUCKETS: readonly MatchBucket[] = ['liga', 'copa', 'internacional', 'nacional-de-clubes'];

export interface MatchBudget {
    /** El techo de ESTA temporada. Sale de `MATCH_CAP_PER_SEASON`. */
    cap: number;
    /** Cuántos pensás jugar de cada cosa. Las cuatro claves siempre presentes. */
    planned: Record<MatchBucket, number>;
    /** Cuántos jugaste de verdad. */
    played: number;
}

// ═══════════════════════════════════════════════════════════════════════════
//  LO QUE QUEDA ESCRITO
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Una temporada cerrada. Es la fila de la trayectoria y no se vuelve a tocar.
 *
 * Guarda VALORES, no referencias: el club va por id y se resuelve contra el
 * catálogo, y la media va congelada —el número que el jugador vio esa
 * temporada— aunque los atributos después se muevan.
 */
export interface CaptainSeasonEntry {
    season: number;
    age: number;
    clubId: string | null;
    stage: CaptainStage;
    ovr: number;
    /** La Pertenencia con el club de ESA temporada. */
    belonging: number;
    fame: number;
    money: number;
    matchesPlayed: number;
    /** La métrica-gloria del puesto, en la unidad que declara la familia. */
    glory: number;
    /** La secundaria, si la familia declara una. */
    glorySecondary: number;
    /** Caps con la mayor en ESTA temporada. */
    caps: number;
    /** En qué escalón de la vía representativa terminaste. */
    track: string;
    /** Cuánto de la temporada del club jugaste, de 0 a 1. */
    share: number;
    /** Lo que ganaste esta temporada, si algo ganaste. */
    titles: string[];
    /** Se fue de gira, se lesionó, lo suspendieron: lo que le pasó al año. */
    note: string | null;
    /** Qué entrenaste esa pretemporada. Id del catálogo, o `null` si no se eligió. */
    training: string | null;
    headDamage: number;
    bodyDamage: number;
    /**
     * El desenlace de la decisión de la temporada, tal como se leyó en pantalla.
     * Se persiste, así que cambiarlo mueve el estado guardado (CLAUDE.md §2).
     */
    decisionText: string | null;
}

/**
 * Una decisión tomada. El desenlace real sale de `outcomeIndex`, nunca de
 * adivinarlo por el texto: es la lección de `career/CareerFlow.tsx`, donde la
 * tarjeta ya no se puede reconstruir después de resolver.
 */
export interface CaptainDecisionEntry {
    season: number;
    eventId: string;
    optionId: string;
    outcomeIndex: number;
    text: string;
}
