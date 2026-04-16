const STORAGE_PREFIX = 'g22.clubAdmin.activeTeamId';

function buildStorageKey(clubId: string) {
    return `${STORAGE_PREFIX}.${clubId}`;
}

export function getStoredActiveTeamId(clubId: string): string | null {
    if (typeof window === 'undefined') return null;
    return window.localStorage.getItem(buildStorageKey(clubId));
}

export function persistActiveTeamId(clubId: string, teamId: string | null) {
    if (typeof window === 'undefined') return;

    const key = buildStorageKey(clubId);
    if (teamId) {
        window.localStorage.setItem(key, teamId);
        return;
    }

    window.localStorage.removeItem(key);
}
