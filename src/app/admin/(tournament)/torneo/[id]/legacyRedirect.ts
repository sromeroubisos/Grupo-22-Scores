export function buildLegacyTournamentManageHref(
    tournamentId: string,
    legacySection?: 'info' | 'participantes' | 'fases' | 'fixture' | 'resultados' | 'config' | 'operadores',
) {
    const params = new URLSearchParams({ type: 'tournament' });

    switch (legacySection) {
        case 'participantes':
            params.set('tab', 'participantes');
            break;
        case 'fases':
            params.set('tab', 'estructura');
            break;
        case 'fixture':
            params.set('tab', 'operacion');
            params.set('subtab', 'fixture');
            break;
        case 'resultados':
            params.set('tab', 'operacion');
            params.set('subtab', 'fixture');
            break;
        case 'config':
            params.set('tab', 'detalles');
            break;
        case 'operadores':
            params.set('tab', 'resumen');
            break;
        case 'info':
        default:
            params.set('tab', 'resumen');
            break;
    }

    return `/admin/entities/${tournamentId}/manage?${params.toString()}`;
}
