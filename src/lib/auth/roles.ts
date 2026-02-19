export type AppUserRole =
    | 'fan'
    | 'jugador'
    | 'entrenador'
    | 'admin_general'
    | 'super_admin' // Added explicitly
    | 'admin_union'
    | 'admin_torneo'
    | 'operador'
    | 'admin_club';

export type MembershipScope = 'union' | 'tournament' | 'club';

export interface MembershipLike {
    scopeType: MembershipScope;
    scopeId?: string;
    role: string;
}

export interface AdminPanelConfig {
    href: string;
    label: string;
}

const APP_ROLES: AppUserRole[] = [
    'fan',
    'jugador',
    'entrenador',
    'admin_general',
    'super_admin',
    'admin_union',
    'admin_torneo',
    'operador',
    'admin_club',
];

const ROLE_ALIASES: Record<string, AppUserRole> = {
    super_admin: 'super_admin', // Identity mapping
    admin_general: 'admin_general',
    admin_union: 'admin_union',
    admin_torneo: 'admin_torneo',
    admin_club: 'admin_club',
    club_admin: 'admin_club',
    operador: 'operador',
    operator: 'operador',
    fan: 'fan',
    user: 'fan',
    jugador: 'jugador',
    entrenador: 'entrenador',
};

const ADMIN_MEMBERSHIP_ROLES = new Set(['admin', 'operator', 'editor']);

export function normalizeRole(rawRole?: string | null): AppUserRole {
    if (!rawRole) {
        return 'fan';
    }

    const direct = ROLE_ALIASES[rawRole];
    if (direct) {
        return direct;
    }

    const lower = rawRole.toLowerCase?.() ?? rawRole;
    if (lower !== rawRole && ROLE_ALIASES[lower]) {
        return ROLE_ALIASES[lower];
    }

    if ((APP_ROLES as string[]).includes(rawRole)) {
        return rawRole as AppUserRole;
    }

    return 'fan';
}

export function resolveAdminPanel(
    role?: string | null,
    memberships?: MembershipLike[] | null
): AdminPanelConfig | null {
    const normalized = normalizeRole(role);

    if (normalized === 'admin_general' || normalized === 'super_admin') {
        return { href: '/admin/super', label: 'Super Admin' };
    }

    if (normalized === 'admin_club') {
        return { href: '/club-admin', label: 'Panel Club' };
    }

    if (normalized === 'admin_union' || normalized === 'admin_torneo' || normalized === 'operador') {
        return { href: '/admin', label: 'Panel Admin' };
    }

    if (memberships?.length) {
        const hasUnionAccess = memberships.some((m) => m.scopeType === 'union' && ADMIN_MEMBERSHIP_ROLES.has(m.role));
        const hasTournamentAccess = memberships.some((m) => m.scopeType === 'tournament' && ADMIN_MEMBERSHIP_ROLES.has(m.role));
        const hasClubAccess = memberships.some((m) => m.scopeType === 'club' && ADMIN_MEMBERSHIP_ROLES.has(m.role));

        if (hasUnionAccess || hasTournamentAccess) {
            return { href: '/admin', label: 'Panel Admin' };
        }

        if (hasClubAccess) {
            return { href: '/club-admin', label: 'Panel Club' };
        }
    }

    return null;
}

export function isAdminUser(role?: string | null, memberships?: MembershipLike[] | null): boolean {
    return Boolean(resolveAdminPanel(role, memberships));
}
