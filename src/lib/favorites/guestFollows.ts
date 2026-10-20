import type { ClubFollowRow, LeagueFollowRow } from '@/lib/services/followingService';

/**
 * Seguidos de un visitante SIN cuenta, guardados en el dispositivo.
 *
 * Seguir un torneo antes exigía crear una cuenta: el botón mandaba al login.
 * Para una persona que solo quiere tener a mano el torneo de su club, esa
 * barrera era más alta que el beneficio. Ahora el seguimiento vive acá hasta
 * que la persona inicia sesión; en ese momento `useFavorites` lo sube a
 * Supabase y vacía esta clave.
 */
const STORAGE_KEY = 'g22:guest-follows:v1';
const MAX_ITEMS = 50;

export type GuestFollows = {
    leagues: LeagueFollowRow[];
    clubs: ClubFollowRow[];
};

const EMPTY: GuestFollows = { leagues: [], clubs: [] };

function isRow(value: unknown, idKey: 'league_id' | 'club_id'): boolean {
    return Boolean(
        value
        && typeof value === 'object'
        && typeof (value as Record<string, unknown>)[idKey] === 'string'
        && typeof (value as Record<string, unknown>).display_name === 'string',
    );
}

export function readGuestFollows(): GuestFollows {
    if (typeof window === 'undefined') return EMPTY;
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw) return EMPTY;
        const parsed = JSON.parse(raw) as Partial<GuestFollows>;
        return {
            leagues: Array.isArray(parsed.leagues)
                ? parsed.leagues.filter((row) => isRow(row, 'league_id')).slice(0, MAX_ITEMS)
                : [],
            clubs: Array.isArray(parsed.clubs)
                ? parsed.clubs.filter((row) => isRow(row, 'club_id')).slice(0, MAX_ITEMS)
                : [],
        };
    } catch {
        // Modo privado o dato corrupto: se arranca vacío.
        return EMPTY;
    }
}

export function writeGuestFollows(next: GuestFollows): void {
    if (typeof window === 'undefined') return;
    try {
        if (next.leagues.length === 0 && next.clubs.length === 0) {
            window.localStorage.removeItem(STORAGE_KEY);
            return;
        }
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify({
            leagues: next.leagues.slice(0, MAX_ITEMS),
            clubs: next.clubs.slice(0, MAX_ITEMS),
        }));
    } catch {
        // Sin acceso a localStorage (modo privado, cuota): sigue en memoria.
    }
}

export function clearGuestFollows(): void {
    writeGuestFollows(EMPTY);
}
