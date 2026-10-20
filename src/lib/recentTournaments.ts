/**
 * Torneos vistos hace poco, guardados en el dispositivo.
 *
 * Volver a un torneo consultado ayer obligaba a repetir todo el recorrido
 * (Torneos → país → unión → torneo) o a buscarlo de nuevo. Con esta lista,
 * Inicio y Torneos lo ofrecen a un toque. No necesita cuenta.
 *
 * Se guarda el `href` completo con el que se abrió el torneo: los torneos
 * externos (FlashScore, ESPN…) necesitan `?url=&sport=&name=` para cargar, y
 * reconstruirlos desde el id solo no alcanza.
 */
const STORAGE_KEY = 'g22:recent-tournaments:v1';
const MAX_ITEMS = 8;
export const RECENT_TOURNAMENTS_EVENT = 'g22:recent-tournaments';

export type RecentTournament = {
    id: string;
    name: string;
    href: string;
    logoUrl?: string | null;
    subtitle?: string | null;
    sportId?: string | null;
    viewedAt: string;
};

export function readRecentTournaments(): RecentTournament[] {
    if (typeof window === 'undefined') return [];
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed
            .filter((item): item is RecentTournament => (
                item
                && typeof item.id === 'string'
                && typeof item.name === 'string'
                && typeof item.href === 'string'
                && item.href.startsWith('/tournaments/')
            ))
            .slice(0, MAX_ITEMS);
    } catch {
        return [];
    }
}

/** Saca de la URL lo que no hace falta para volver al torneo (la pestaña). */
function cleanHref(href: string): string {
    try {
        const url = new URL(href, 'https://g22.local');
        url.searchParams.delete('tab');
        const query = url.searchParams.toString();
        return `${url.pathname}${query ? `?${query}` : ''}`;
    } catch {
        return href;
    }
}

export function rememberTournament(entry: Omit<RecentTournament, 'viewedAt'>): void {
    if (typeof window === 'undefined') return;
    const name = entry.name.trim();
    if (!entry.id || !name || /^cargando/i.test(name)) return;
    try {
        const next: RecentTournament = {
            ...entry,
            name,
            href: cleanHref(entry.href),
            viewedAt: new Date().toISOString(),
        };
        const rest = readRecentTournaments().filter((item) => item.id !== entry.id);
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify([next, ...rest].slice(0, MAX_ITEMS)));
        window.dispatchEvent(new CustomEvent(RECENT_TOURNAMENTS_EVENT));
    } catch {
        // Modo privado o cuota llena: el historial es una comodidad, no un dato.
    }
}

export function findRecentHref(id: string): string | null {
    return readRecentTournaments().find((item) => item.id === id)?.href ?? null;
}

/**
 * El último nivel de Torneos que se miró (`/tournaments?nivel=…`), por
 * pestaña del navegador. La flecha "‹ Torneos" de la página de un torneo
 * vuelve ahí y no al principio de la lista.
 */
const LAST_DIRECTORY_KEY = 'g22:last-directory';

export function saveLastDirectoryHref(href: string): void {
    if (typeof window === 'undefined' || !href.startsWith('/tournaments')) return;
    try {
        window.sessionStorage.setItem(LAST_DIRECTORY_KEY, href);
    } catch {
        // Sin sessionStorage la flecha vuelve a /tournaments.
    }
}

export function readLastDirectoryHref(): string | null {
    if (typeof window === 'undefined') return null;
    try {
        const value = window.sessionStorage.getItem(LAST_DIRECTORY_KEY);
        return value && value.startsWith('/tournaments') ? value : null;
    } catch {
        return null;
    }
}
