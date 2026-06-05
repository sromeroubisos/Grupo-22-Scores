// Preferencias del popup del Prode del Mundial (WC 2026).
// Todo en localStorage (persiste entre sesiones):
//  - joined: si el usuario ya se sumó.
//  - dismiss_count: cuántas veces lo descartó.
//  - last_shown_at: timestamp de la última vez que se mostró (para el cooldown de 12 hs).

const JOINED_KEY = 'g22_prode_wc_joined';
const DISMISS_COUNT_KEY = 'g22_prode_wc_dismiss_count';
const LAST_SHOWN_KEY = 'g22_prode_wc_last_shown_at';

const MAX_DISMISSALS = 2;
// Se muestra como máximo una vez cada 12 horas.
const SHOW_INTERVAL_MS = 12 * 60 * 60 * 1000;

function canUseLocal(): boolean {
    return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function readNumber(key: string): number {
    if (!canUseLocal()) return 0;
    const raw = window.localStorage.getItem(key);
    const parsed = raw ? Number.parseInt(raw, 10) : 0;
    return Number.isFinite(parsed) ? parsed : 0;
}

export function hasJoinedProde(): boolean {
    if (!canUseLocal()) return false;
    return window.localStorage.getItem(JOINED_KEY) === 'true';
}

export function markProdeJoined(): void {
    if (!canUseLocal()) return;
    window.localStorage.setItem(JOINED_KEY, 'true');
}

export function getDismissCount(): number {
    return readNumber(DISMISS_COUNT_KEY);
}

export function incrementDismissCount(): number {
    if (!canUseLocal()) return MAX_DISMISSALS;
    const next = getDismissCount() + 1;
    window.localStorage.setItem(DISMISS_COUNT_KEY, String(next));
    return next;
}

/** ¿Se mostró dentro de las últimas 12 horas? */
function wasShownWithinInterval(): boolean {
    const last = readNumber(LAST_SHOWN_KEY);
    if (!last) return false;
    return Date.now() - last < SHOW_INTERVAL_MS;
}

/** Registra que el popup se mostró ahora (arranca el cooldown de 12 hs). */
export function markShown(): void {
    if (!canUseLocal()) return;
    window.localStorage.setItem(LAST_SHOWN_KEY, String(Date.now()));
}

/**
 * Reglas de reaparición:
 *  - No mostrar si el usuario ya se sumó.
 *  - No mostrar si lo descartó 2 veces o más.
 *  - Mostrar como máximo una vez cada 12 horas.
 */
export function shouldShowProdeBanner(): boolean {
    if (hasJoinedProde()) return false;
    if (getDismissCount() >= MAX_DISMISSALS) return false;
    if (wasShownWithinInterval()) return false;
    return true;
}
