// El puntaje de la gente: semáforo por jugador + figura del partido.
//
// Tipos compartidos entre la ruta de API y la vista pública, para que las dos
// hablen de lo mismo. Sin dependencias: se puede importar desde cualquier lado.

/** 1 rojo · 2 amarillo · 3 verde. Es un semáforo, no una escala de 1 a 10. */
export type PlayerRatingValue = 1 | 2 | 3;

export const RATING_LABELS: Record<PlayerRatingValue, string> = {
    1: 'Flojo',
    2: 'Correcto',
    3: 'Muy bueno',
};

/** Lo que el usuario que está mirando ya votó en este partido. */
export interface MyPlayerRating {
    playerKey: string;
    rating: PlayerRatingValue | null;
    isMvp: boolean;
}

/** El agregado público de un jugador. */
export interface PlayerRatingSummary {
    playerKey: string;
    playerName: string;
    team: 'home' | 'away';
    /** Cuántos votaron cada color. */
    counts: { 1: number; 2: number; 3: number };
    /** Votos de semáforo (la suma de `counts`). */
    votes: number;
    /**
     * El puntaje de la gente, de 1 a 10.
     *
     * El semáforo tiene tres posiciones pero la gente lee notas sobre 10, así
     * que el promedio de 1..3 se estira a 1..10 y se muestra con un decimal.
     * Sin votos no hay puntaje: `null`, no 0 — un jugador que nadie votó no es
     * un jugador con la peor nota.
     */
    score: number | null;
    /** Cuántos lo eligieron figura del partido. */
    mvpVotes: number;
}

export interface MatchPlayerRatingsSummary {
    players: PlayerRatingSummary[];
    /** Total de personas que participaron (votaron algo) en este partido. */
    voters: number;
    /** El más votado como figura, si alguien votó. */
    mvp: PlayerRatingSummary | null;
    /** Lo que votó quien está mirando. Vacío si no hay sesión. */
    mine: MyPlayerRating[];
}

export function createEmptyPlayerRatingsSummary(): MatchPlayerRatingsSummary {
    return { players: [], voters: 0, mvp: null, mine: [] };
}

/** Estira el promedio del semáforo (1..3) a la nota sobre 10 que se muestra. */
export function toPeopleScore(counts: { 1: number; 2: number; 3: number }): number | null {
    const votes = counts[1] + counts[2] + counts[3];
    if (votes <= 0) return null;
    const average = (counts[1] * 1 + counts[2] * 2 + counts[3] * 3) / votes;
    // 1 → 1.0, 2 → 5.5, 3 → 10.0
    const scaled = 1 + ((average - 1) / 2) * 9;
    return Math.round(scaled * 10) / 10;
}

/**
 * Topes del voto. El servidor no conoce la formación de cada partido (puede ser
 * de un proveedor), así que la clave y el nombre del jugador llegan del cliente:
 * sin topes, una cuenta inventaba jugadores sin límite y con cualquier nombre.
 * 60 alcanza para dos planteles de 23 con suplentes de sobra.
 */
export const PLAYER_KEY_MAX = 120;
export const PLAYER_NAME_MAX = 80;
export const MAX_RATED_PLAYERS_PER_MATCH = 60;

export function isValidPlayerKey(key: string): boolean {
    return key.length > 0 && key.length <= PLAYER_KEY_MAX && !/[\u0000-\u001f\u007f]/.test(key);
}

/** Nombre visible: sin caracteres de control, espacios colapsados y con tope. */
export function cleanPlayerName(raw: string): string {
    return raw.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, PLAYER_NAME_MAX);
}

/**
 * La figura: la más votada; a igualdad de votos gana la mejor nota, y si
 * también empatan queda la primera por nombre para que el orden no baile entre
 * recargas. Con `allowedKeys` solo compiten los jugadores de la formación: una
 * clave que no está en la cancha no puede quedarse con la figura y dejar el
 * lugar vacío.
 */
export function pickMvp(
    players: readonly PlayerRatingSummary[],
    allowedKeys?: ReadonlySet<string>,
): PlayerRatingSummary | null {
    const candidates = players.filter((p) => p.mvpVotes > 0 && (!allowedKeys || allowedKeys.has(p.playerKey)));
    candidates.sort((a, b) =>
        b.mvpVotes - a.mvpVotes ||
        (b.score ?? 0) - (a.score ?? 0) ||
        a.playerName.localeCompare(b.playerName, 'es'));
    return candidates[0] ?? null;
}

/** El color del semáforo que le corresponde a una nota sobre 10. */
export function scoreTone(score: number | null): 'low' | 'mid' | 'high' | 'none' {
    if (score == null) return 'none';
    if (score < 4) return 'low';
    if (score < 7) return 'mid';
    return 'high';
}
