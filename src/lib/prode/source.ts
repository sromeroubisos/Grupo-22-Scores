import type { ProdeExternalProvider, ProdeSourceBinding, ProdeSourceType } from '@/lib/prode/types';

type NullableString = string | null | undefined;

function asString(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
}

export function normalizeProdeSourceType(value: unknown): ProdeSourceType {
    return value === 'local' || value === 'external' || value === 'mixed'
        ? value
        : 'mixed';
}

export function normalizeProdeSourceBinding(input: {
    source_type?: unknown;
    local_tournament_id?: unknown;
    local_match_id?: unknown;
    external_provider?: unknown;
    external_tournament_id?: unknown;
    external_match_id?: unknown;
}): ProdeSourceBinding {
    return {
        sourceType: normalizeProdeSourceType(input.source_type),
        localTournamentId: asString(input.local_tournament_id),
        localMatchId: asString(input.local_match_id),
        externalProvider: asString(input.external_provider) as ProdeExternalProvider | null,
        externalTournamentId: asString(input.external_tournament_id),
        externalMatchId: asString(input.external_match_id),
    };
}

export function getProdeProviderLabel(provider: NullableString) {
    switch (provider) {
        case 'flashscore':
            return 'Flashscore';
        case 'rugby-api-sports':
            return 'Rugby API Sports';
        case 'espn':
            return 'ESPN';
        case 'manual':
            return 'Manual';
        default:
            return provider || 'Externo';
    }
}

export function getProdeSourceSummary(binding: ProdeSourceBinding) {
    if (binding.sourceType === 'local') {
        return 'Torneo local';
    }

    if (binding.sourceType === 'external') {
        return `Torneo API · ${getProdeProviderLabel(binding.externalProvider)}`;
    }

    return 'Mixto · local + API';
}
