// Aliases de IDs de favoritos + limpieza del caché local.
//
// Acá vivía la cadena legacy de lectura (RPC get_my_favorites_enriched_v2 →
// get_my_favorites_enriched → tabla `favorites`). Esos tres objetos nunca
// existieron en la base activa (ver AUDITORIA_21_FALTANTES.md): cada sondeo
// eran tres 404 por sesión sin posibilidad de devolver datos. Los favoritos
// se sirven desde `user_favorite_clubs` / `user_favorite_leagues` vía
// followingService. No reintroducir la cadena sin crear antes el backend.

export const FAVORITES_LOCAL_CACHE_KEY = 'g22_favorites_v5_fix';
export const FAVORITES_LOCAL_CACHE_OWNER_KEY = `${FAVORITES_LOCAL_CACHE_KEY}:owner`;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function clearFavoritesLocalCache(): void {
    if (typeof window === 'undefined') return;
    window.localStorage.removeItem(FAVORITES_LOCAL_CACHE_KEY);
    window.localStorage.removeItem(FAVORITES_LOCAL_CACHE_OWNER_KEY);
}

function isUuid(value: string): boolean {
    return UUID_RE.test(value.trim());
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
    return Array.from(new Set(values.filter((value): value is string => Boolean(value && value.trim())).map((value) => value.trim())));
}

export function buildClubCandidateIds(entityId: string): string[] {
    const raw = entityId.trim();
    if (!raw) return [];

    const lower = raw.toLowerCase();
    const values = [raw, lower];
    let stripped = raw;

    if (lower.startsWith('fs-team-')) {
        stripped = raw.slice(8);
        values.push(stripped, stripped.toLowerCase(), `fs-${stripped}`, `fs-${stripped.toLowerCase()}`);
    } else if (lower.startsWith('fs-')) {
        stripped = raw.slice(3);
        values.push(stripped, stripped.toLowerCase(), `fs-team-${stripped}`, `fs-team-${stripped.toLowerCase()}`);
    } else if (lower.startsWith('ras-team-')) {
        stripped = raw.slice(9);
        values.push(stripped, stripped.toLowerCase());
    } else if (lower.startsWith('espn-team-')) {
        stripped = raw.slice(10);
        values.push(stripped, stripped.toLowerCase());
    }

    const aliasSeed = stripped.trim();
    if (aliasSeed && !isUuid(aliasSeed)) {
        const aliasSeedLower = aliasSeed.toLowerCase();
        values.push(
            `fs-${aliasSeed}`,
            `fs-${aliasSeedLower}`,
            `fs-team-${aliasSeed}`,
            `fs-team-${aliasSeedLower}`,
            `ras-team-${aliasSeed}`,
            `ras-team-${aliasSeedLower}`,
            `espn-team-${aliasSeed}`,
            `espn-team-${aliasSeedLower}`,
        );
    }

    return uniqueStrings(values);
}

export function buildTournamentCandidateIds(entityId: string): string[] {
    const raw = entityId.trim();
    if (!raw) return [];

    const lower = raw.toLowerCase();
    const values = [raw, lower];
    let stripped = raw;

    if (lower.startsWith('fs-')) {
        stripped = raw.slice(3);
        values.push(stripped, stripped.toLowerCase());
    } else if (lower.startsWith('ras-league-')) {
        stripped = raw.slice('ras-league-'.length);
        values.push(stripped, stripped.toLowerCase());
    } else if (lower.startsWith('espn-league-')) {
        stripped = raw.slice('espn-league-'.length);
        values.push(stripped, stripped.toLowerCase());
    }

    const aliasSeed = stripped.trim();
    if (aliasSeed && !isUuid(aliasSeed)) {
        const aliasSeedLower = aliasSeed.toLowerCase();
        values.push(
            `fs-${aliasSeed}`,
            `fs-${aliasSeedLower}`,
            `ras-league-${aliasSeed}`,
            `ras-league-${aliasSeedLower}`,
            `espn-league-${aliasSeed}`,
            `espn-league-${aliasSeedLower}`,
        );
    }

    return uniqueStrings(values);
}
