export type RankingTableClub = {
    name?: string | null;
    short_name?: string | null;
    logo_url?: string | null;
} | null | undefined;

export type RankingTableEntryLike = {
    current_position?: number | null;
    current_rating?: number | string | null;
    initial_rating?: number | string | null;
    previous_rating?: number | string | null;
    source_name: string;
    source_region?: string | null;
    source_previous_position?: number | null;
    clubs?: RankingTableClub;
};

export function formatRankingRating(value: number | string | null | undefined) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return '-';
    return numeric.toFixed(2);
}

export function getRankingDelta(
    current: number | string | null | undefined,
    initial: number | string | null | undefined,
) {
    const currentValue = Number(current);
    const initialValue = Number(initial);

    if (!Number.isFinite(currentValue) || !Number.isFinite(initialValue)) {
        return {
            value: 0,
            label: '-',
            tone: 'neutral' as const,
        };
    }

    const delta = Number((currentValue - initialValue).toFixed(2));

    if (delta > 0) {
        return { value: delta, label: `+${delta.toFixed(2)}`, tone: 'positive' as const };
    }

    if (delta < 0) {
        return { value: delta, label: delta.toFixed(2), tone: 'negative' as const };
    }

    return { value: delta, label: '0.00', tone: 'neutral' as const };
}

export function getRankingClubName(entry: RankingTableEntryLike) {
    return entry.clubs?.name || entry.source_name;
}

export function getRankingClubShortName(entry: RankingTableEntryLike) {
    return entry.clubs?.short_name || entry.clubs?.name || entry.source_name;
}

export function getRankingPreviousRating(entry: RankingTableEntryLike) {
    const previousValue = Number(entry.previous_rating);
    if (Number.isFinite(previousValue)) return previousValue;

    const initialValue = Number(entry.initial_rating);
    if (Number.isFinite(initialValue)) return initialValue;

    return null;
}

export function getRankingPositionChange(
    current: number | null | undefined,
    previous: number | null | undefined,
) {
    if (!Number.isFinite(current) || !Number.isFinite(previous)) {
        return null;
    }

    const delta = Number(previous) - Number(current);

    if (delta > 0) {
        return { value: delta, label: `+${delta}`, tone: 'positive' as const };
    }

    if (delta < 0) {
        return { value: delta, label: String(delta), tone: 'negative' as const };
    }

    return { value: delta, label: '0', tone: 'neutral' as const };
}

export function paginateRankingEntries<T>(entries: T[], page: number, pageSize: number) {
    const totalPages = Math.max(1, Math.ceil(entries.length / pageSize));
    const safePage = Math.min(Math.max(1, page), totalPages);
    const start = (safePage - 1) * pageSize;

    return {
        page: safePage,
        totalPages,
        pageSize,
        start,
        items: entries.slice(start, start + pageSize),
    };
}

export function buildRankingExportRows(entries: RankingTableEntryLike[]) {
    return entries.map((entry, index) => {
        const previousRating = getRankingPreviousRating(entry);
        const delta = getRankingDelta(entry.current_rating, previousRating);
        const positionChange = getRankingPositionChange(entry.current_position, entry.source_previous_position);

        return {
            pos: entry.current_position || index + 1,
            team: getRankingClubShortName(entry),
            teamLogo: entry.clubs?.logo_url || '',
            played: formatRankingRating(entry.current_rating),
            won: formatRankingRating(previousRating),
            lost: delta.label,
            diff: entry.source_region || '-',
            points: entry.source_previous_position ?? '-',
            pointsDeltaLabel: positionChange?.label || '',
            pointsDeltaTone: positionChange?.tone || 'neutral',
        };
    });
}

export const RANKING_EXPORT_COLUMN_LABELS = {
    played: 'OVR',
    won: 'ANT',
    lost: 'DEL',
    diff: 'TR',
    points: 'VAR',
} as const;
