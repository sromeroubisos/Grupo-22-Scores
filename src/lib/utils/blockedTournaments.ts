const BLOCKED_TOURNAMENT_IDS = [
    'fs-ofv2oc3e',
    'fs-folzz955',
    'ras-league-1',
    'ras-league-41',
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

function buildBlockedCandidates(value: unknown): string[] {
    const normalized = normalizeValue(value);
    if (!normalized) return [];

    const candidates = new Set<string>([normalized]);

    if (normalized.startsWith('fs-')) {
        const stripped = normalized.slice(3);
        if (stripped) candidates.add(stripped);
    }

    if (normalized.startsWith('ras-league-')) {
        const stripped = normalized.slice('ras-league-'.length);
        if (stripped) candidates.add(stripped);
    }

    return [...candidates];
}

export function isBlockedTournamentId(value: unknown): boolean {
    return buildBlockedCandidates(value).some((candidate) => BLOCKED_TOURNAMENT_ID_SET.has(candidate));
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
