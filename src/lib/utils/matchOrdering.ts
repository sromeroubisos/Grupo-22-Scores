type MatchLike = Record<string, unknown> | null | undefined;

function normalizeMatchTimeValue(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return value > 1_000_000_000_000 ? value : value * 1000;
    }

    if (typeof value === 'string') {
        const trimmed = value.trim();
        if (!trimmed) return null;

        const numeric = Number(trimmed);
        if (Number.isFinite(numeric)) {
            return numeric > 1_000_000_000_000 ? numeric : numeric * 1000;
        }

        const parsed = Date.parse(trimmed);
        return Number.isNaN(parsed) ? null : parsed;
    }

    if (value instanceof Date) {
        const timestamp = value.getTime();
        return Number.isNaN(timestamp) ? null : timestamp;
    }

    return null;
}

function getMatchField(match: MatchLike, key: string): unknown {
    if (!match || typeof match !== 'object') return undefined;
    return match[key];
}

function getMatchStableId(match: MatchLike): string {
    return String(
        getMatchField(match, 'event_key') ||
        getMatchField(match, 'match_id') ||
        getMatchField(match, 'id') ||
        '',
    );
}

export function getMatchSortTimestamp(match: MatchLike): number {
    const candidates = [
        getMatchField(match, 'timestamp'),
        getMatchField(match, 'start_time'),
        getMatchField(match, 'scheduledAt'),
        getMatchField(match, 'date_time'),
        getMatchField(match, 'kickoffISO'),
        getMatchField(match, 'time'),
    ];

    for (const candidate of candidates) {
        const normalized = normalizeMatchTimeValue(candidate);
        if (normalized !== null) return normalized;
    }

    return 0;
}

export function sortMatchesByDate<T>(matches: T[] | null | undefined, direction: 'asc' | 'desc' = 'asc'): T[] {
    if (!Array.isArray(matches)) return [];

    const directionFactor = direction === 'desc' ? -1 : 1;

    return [...matches].sort((left, right) => {
        const leftTimestamp = getMatchSortTimestamp(left);
        const rightTimestamp = getMatchSortTimestamp(right);
        const timestampDiff = leftTimestamp - rightTimestamp;

        if (timestampDiff !== 0) {
            return timestampDiff * directionFactor;
        }

        return getMatchStableId(left).localeCompare(getMatchStableId(right));
    });
}
