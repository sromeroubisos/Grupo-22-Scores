export type ClubManageTabId =
    | 'general'
    | 'planteles'
    | 'rendimiento'
    | 'competencias'
    | 'partidos'
    | 'contenido'
    | 'pizarra'
    | 'sponsors'
    | 'entrenamientos'
    | 'usuarios'
    | 'configuracion';

export const CLUB_MANAGE_ALLOWED_TABS = new Set<ClubManageTabId>([
    'general',
    'planteles',
    'competencias',
    'partidos',
    'contenido',
    'pizarra',
    'usuarios',
    'configuracion',
]);

export const CLUB_MANAGE_DASHBOARD_TABS = new Set<ClubManageTabId>([
    'general',
    'competencias',
    'partidos',
    'contenido',
]);

export const CLUB_MANAGE_DIVISION_TABS = new Set<ClubManageTabId>([
    'general',
    'partidos',
    'planteles',
]);

export const CLUB_MANAGE_TAB_ALIASES: Record<string, ClubManageTabId> = {
    resumen: 'general',
    gimnasio: 'general',
    testeos: 'general',
    fisico: 'general',
    rendimiento: 'general',
    fixture: 'partidos',
    posiciones: 'competencias',
    identidad: 'configuracion',
    staff: 'configuracion',
    medios: 'contenido',
    estadisticas: 'general',
    auditoria: 'configuracion',
};

export function normalizeClubManageTab(requestedTab?: string | null): ClubManageTabId {
    const normalizedRequestedTab = CLUB_MANAGE_TAB_ALIASES[requestedTab ?? ''] || requestedTab || 'general';

    if (CLUB_MANAGE_ALLOWED_TABS.has(normalizedRequestedTab as ClubManageTabId)) {
        return normalizedRequestedTab as ClubManageTabId;
    }

    return 'general';
}

export function shouldLoadClubDashboardForTab(tab: ClubManageTabId) {
    return CLUB_MANAGE_DASHBOARD_TABS.has(tab);
}

export function shouldLoadClubDivisionsForTab(tab: ClubManageTabId) {
    return CLUB_MANAGE_DIVISION_TABS.has(tab);
}

export function getClubDashboardModeForTab(tab: ClubManageTabId): 'summary' | 'operational' {
    return tab === 'partidos' ? 'operational' : 'summary';
}
