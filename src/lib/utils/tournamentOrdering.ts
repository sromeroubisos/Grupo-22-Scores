type TournamentOrderingInput = {
    id?: string | null;
    name?: string | null;
    display_name?: string | null;
    displayName?: string | null;
    priority?: number | null;
};

export function getTournamentPriority(tournament: TournamentOrderingInput): number {
    return typeof tournament.priority === 'number' && Number.isFinite(tournament.priority)
        ? Math.trunc(tournament.priority)
        : 0;
}

export function getTournamentSortLabel(tournament: TournamentOrderingInput): string {
    return String(
        tournament.display_name ??
        tournament.displayName ??
        tournament.name ??
        '',
    ).trim();
}

export function compareTournamentsByPriority<T extends TournamentOrderingInput>(left: T, right: T): number {
    const priorityDiff = getTournamentPriority(right) - getTournamentPriority(left);
    if (priorityDiff !== 0) return priorityDiff;

    const labelDiff = getTournamentSortLabel(left).localeCompare(
        getTournamentSortLabel(right),
        'es',
        { sensitivity: 'base' },
    );
    if (labelDiff !== 0) return labelDiff;

    return String(left.id ?? '').localeCompare(String(right.id ?? ''), 'es', { sensitivity: 'base' });
}

export function sortTournamentsByPriority<T extends TournamentOrderingInput>(tournaments: T[]): T[] {
    return [...tournaments].sort(compareTournamentsByPriority);
}
