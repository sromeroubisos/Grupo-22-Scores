const STORAGE_KEY_PREFIX = 'g22.clubAdmin.activeSeason';

export function getStoredActiveSeason(clubId: string): string | null {
    if (typeof window === 'undefined') return null;
    try {
        const raw = localStorage.getItem(`${STORAGE_KEY_PREFIX}.${clubId}`);
        return raw ?? null;
    } catch {
        return null;
    }
}

export function persistActiveSeason(clubId: string, season: string | null) {
    if (typeof window === 'undefined') return;
    try {
        if (season) {
            localStorage.setItem(`${STORAGE_KEY_PREFIX}.${clubId}`, season);
        } else {
            localStorage.removeItem(`${STORAGE_KEY_PREFIX}.${clubId}`);
        }
    } catch {
        // ignore
    }
}

export function getDefaultSeason(): string {
    return String(new Date().getFullYear());
}

export function resolveActiveSeason(clubId: string): string {
    return getStoredActiveSeason(clubId) ?? getDefaultSeason();
}
