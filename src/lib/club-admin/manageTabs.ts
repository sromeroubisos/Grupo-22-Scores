export type ClubManageTabId =
    | 'general'
    | 'equipos'
    | 'planteles'
    | 'rendimiento'
    | 'competencias'
    | 'partidos'
    | 'contenido'
    | 'pizarra'
    | 'sponsors'
    | 'entrenamientos'
    | 'configuracion';

export const CLUB_MANAGE_ALLOWED_TABS = new Set<ClubManageTabId>([
    'general',
    'equipos',
    'planteles',
    'rendimiento',
    'competencias',
    'partidos',
    'contenido',
    'pizarra',
    'sponsors',
    'entrenamientos',
    'configuracion',
]);

export const CLUB_MANAGE_TAB_ALIASES: Record<string, ClubManageTabId> = {
    resumen: 'general',
    gimnasio: 'rendimiento',
    testeos: 'rendimiento',
    fisico: 'rendimiento',
    rendimiento: 'rendimiento',
    fixture: 'partidos',
    posiciones: 'competencias',
    relacionados: 'equipos',
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
