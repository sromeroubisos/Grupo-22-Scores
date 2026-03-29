const BLOCKED_TOURNAMENT_IDS = [
    'fs-ofv2oc3e',
    'ras-league-1',
] as const;

const BLOCKED_TOURNAMENT_ID_SET = new Set(
    BLOCKED_TOURNAMENT_IDS.map((value) => value.toLowerCase()),
);

const BLOCKED_RUGBY_API_SPORTS_LEAGUE_ID_SET = new Set(
    BLOCKED_TOURNAMENT_IDS
        .map((value) => /^ras-league-(\d+)$/i.exec(value)?.[1] ?? null)
        .filter((value): value is string => Boolean(value)),
);

function normalizeValue(value: unknown): string | null {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return String(value);
    }

    if (typeof value !== 'string') return null;

    const normalized = value.trim().toLowerCase();
    return normalized || null;
}

export function isBlockedTournamentId(value: unknown): boolean {
    const normalized = normalizeValue(value);
    return normalized ? BLOCKED_TOURNAMENT_ID_SET.has(normalized) : false;
}

export function isBlockedRugbyApiSportsLeagueId(value: unknown): boolean {
    const normalized = normalizeValue(value);
    if (!normalized) return false;

    const prefixedMatch = /^ras-league-(\d+)$/i.exec(normalized);
    const leagueId = prefixedMatch?.[1] ?? normalized;

    return BLOCKED_RUGBY_API_SPORTS_LEAGUE_ID_SET.has(leagueId);
}

export function getBlockedTournamentIds(): string[] {
    return [...BLOCKED_TOURNAMENT_IDS];
}
