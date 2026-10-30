/**
 * Ranking oficial de jugadores para torneos sin eventos por partido.
 *
 * La fuente (BD UAR, placas de prensa) publica el total por jugador y nada más.
 * Vive en `tournaments.ruleset.official_player_leaders` y, cuando está, la tabla
 * de Jugadores de Estadísticas sale de acá en vez de sumar eventos: con uno o
 * dos partidos cargados esa suma da cifras parciales que contradicen al total.
 */

export type OfficialLeaderRow = {
    rank: number;
    name: string;
    value: number;
    club_id?: string;
    club_name?: string;
    person_id?: string;
    tries?: number;
    conversions?: number;
    penalties?: number;
    matches?: number;
};

export type OfficialLeaderCategory = {
    id: string;
    label: string;
    unit: string;
    rows: OfficialLeaderRow[];
};

export type OfficialPlayerLeaders = {
    source?: string;
    captured_at?: string;
    categories: OfficialLeaderCategory[];
};

export function readOfficialLeaders(ruleset: unknown): OfficialPlayerLeaders | null {
    const raw = (ruleset as { official_player_leaders?: OfficialPlayerLeaders } | null)?.official_player_leaders;
    if (!raw || !Array.isArray(raw.categories)) return null;
    const categories = raw.categories.filter((c) => Array.isArray(c?.rows) && c.rows.length > 0);
    return categories.length > 0 ? { ...raw, categories } : null;
}

const normalizeName = (name: string) =>
    name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

/**
 * Une las categorías en una fila por jugador. Lo que la fuente no publica queda
 * `undefined` (la tabla lo muestra "—"): un 0 afirmaría que no hizo nada.
 */
export function buildOfficialPlayerRows(leaders: OfficialPlayerLeaders): any[] {
    const byPlayer = new Map<string, any>();
    leaders.categories.forEach((category) => {
        category.rows.forEach((row) => {
            const key = normalizeName(row.name);
            if (!byPlayer.has(key)) {
                byPlayer.set(key, {
                    entityId: `official:${key}`,
                    entityName: row.name,
                    entityLogo: null,
                    teamId: row.club_id ?? '',
                    playerId: row.person_id ?? null,
                    secondary: row.club_name ?? '',
                });
            }
            const player = byPlayer.get(key);
            if (category.id === 'points') player.points = row.value;
            if (category.id === 'tries') player.tries = row.value;
            if (row.tries !== undefined) player.tries = row.tries;
            if (row.conversions !== undefined) player.conversions = row.conversions;
            if (row.penalties !== undefined) player.penalty_goals = row.penalties;
            if (row.matches !== undefined) player.matches_played = row.matches;
        });
    });
    return Array.from(byPlayer.values());
}
