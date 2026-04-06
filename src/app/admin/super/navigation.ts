export type SuperNavItem = {
    id: string;
    label: string;
    href: string;
    iconPath: string;
    description: string;
};

export type SuperNavGroup = {
    id: string;
    label: string;
    items: SuperNavItem[];
};

export const superNavGroups: SuperNavGroup[] = [
    {
        id: 'core',
        label: 'Core Engine',
        items: [
            {
                id: 'dashboard',
                label: 'Dashboard',
                href: '/admin/super',
                iconPath:
                    'M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z',
                description: 'KPIs, estado global y accesos rapidos del sistema.',
            },
            {
                id: 'tournaments',
                label: 'Torneos',
                href: '/admin/super/torneos',
                iconPath:
                    'M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10',
                description: 'Altas, edicion y administracion integral de torneos.',
            },
            {
                id: 'matches',
                label: 'Partidos',
                href: '/admin/super/partidos',
                iconPath: 'M13 10V3L4 14h7v7l9-11h-7z',
                description: 'Agenda, consola operativa y seguimiento de partidos.',
            },
            {
                id: 'clubs',
                label: 'Clubes',
                href: '/admin/super/clubes',
                iconPath:
                    'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z',
                description: 'Padron, identidad visual y gestion deportiva de clubes.',
            },
            {
                id: 'players',
                label: 'Jugadores',
                href: '/admin/super/jugadores',
                iconPath:
                    'M9.75 2.75a2.5 2.5 0 015 0v1.5a2.5 2.5 0 01-5 0v-1.5zM4 9a4 4 0 014-4h8a4 4 0 014 4v8a4 4 0 01-4 4H8a4 4 0 01-4-4V9z',
                description: 'Fichas, seguimiento y visibilidad de jugadores.',
            },
            {
                id: 'sports',
                label: 'Gestion de Deportes',
                href: '/admin/super/deportes',
                iconPath:
                    'M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5c1.743 3.511 2.846 7.42 3.12 11.5',
                description: 'Taxonomia, activacion y parametros globales por deporte.',
            },
            {
                id: 'folders',
                label: 'Carpetas',
                href: '/admin/super/carpetas',
                iconPath:
                    'M3 7a2 2 0 012-2h5l2 2h7a2 2 0 012 2v7a2 2 0 01-2 2H5a2 2 0 01-2-2V7z',
                description: 'Organizacion interna de recursos y agrupadores.',
            },
        ],
    },
    {
        id: 'entities',
        label: 'Entidades',
        items: [
            {
                id: 'entities',
                label: 'Entidades Globales',
                href: '/admin/super/entidades',
                iconPath:
                    'M4 6a2 2 0 012-2h4v4H4V6zm10-2h4a2 2 0 012 2v2h-6V4zM4 12h6v8H6a2 2 0 01-2-2v-6zm10 0h6v6a2 2 0 01-2 2h-4v-8z',
                description: 'Vista transversal de deportes, paises y federaciones.',
            },
            {
                id: 'unions',
                label: 'Uniones / Federaciones',
                href: '/admin/super/uniones',
                iconPath:
                    'M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9',
                description: 'Estructura territorial, branding y relaciones institucionales.',
            },
            {
                id: 'roles',
                label: 'Personas y Roles',
                href: '/admin/super/personas-roles',
                iconPath:
                    'M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z',
                description: 'Permisos, accesos y asignacion de operadores.',
            },
            {
                id: 'news',
                label: 'Noticias',
                href: '/admin/super/noticias',
                iconPath:
                    'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
                description: 'CMS, publicaciones y gestion editorial.',
            },
            {
                id: 'moderation',
                label: 'Moderacion / Auditoria',
                href: '/admin/super/moderacion',
                iconPath:
                    'M11 11V7a1 1 0 112 0v4a1 1 0 11-2 0zM10 15a1.5 1.5 0 113 0 1.5 1.5 0 01-3 0zM12 2a9 9 0 00-9 9v2a9 9 0 006 8.485V22a1 1 0 002 0v-0.515A9 9 0 0021 13v-2a9 9 0 00-9-9z',
                description: 'Revision operativa, alertas y trazabilidad de cambios.',
            },
        ],
    },
    {
        id: 'system',
        label: 'Sistema',
        items: [
            {
                id: 'sync',
                label: 'Fuentes / Sync API',
                href: '/admin/super/sync',
                iconPath:
                    'M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15',
                description: 'Integraciones, proveedores y estado de sincronizacion.',
            },
            {
                id: 'ingesta',
                label: 'Ingesta de Torneos',
                href: '/admin/super/torneos/ingesta',
                iconPath:
                    'M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10',
                description: 'Importacion masiva y control de datos desde providers.',
            },
            {
                id: 'rankings',
                label: 'Ranking Clubes',
                href: '/admin/super/rankings',
                iconPath:
                    'M8 21h8M12 17v4M7 4h10v3a5 5 0 01-10 0V4zM5 4H3a1 1 0 00-1 1v1a5 5 0 005 5M19 4h2a1 1 0 011 1v1a5 5 0 01-5 5',
                description: 'Carga por Excel y base inicial del ranking de clubes.',
            },
        ],
    },
];

export const superNavItems: SuperNavItem[] = superNavGroups.flatMap((group) => group.items);

const superNavItemsByPriority = [...superNavItems].sort((left, right) => right.href.length - left.href.length);

export function isSuperNavItemActive(pathname: string | null | undefined, href: string) {
    if (!pathname) return false;
    if (href === '/admin/super') return pathname === href;
    return pathname === href || pathname.startsWith(`${href}/`);
}

export function findActiveSuperNavItem(pathname: string | null | undefined) {
    return superNavItemsByPriority.find((item) => isSuperNavItemActive(pathname, item.href)) ?? null;
}
