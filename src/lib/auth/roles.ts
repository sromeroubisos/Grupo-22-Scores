export type AppUserRole =
    | 'fan'
    | 'jugador'
    | 'entrenador'
    | 'redactor'
    | 'admin_general'
    | 'super_admin' // Added explicitly
    | 'admin_union'
    | 'admin_torneo'
    | 'operador'
    | 'admin_club'
    | 'gestor_deportes'
    | 'gestor_torneos'
    | 'gestor_partidos'
    | 'gestor_clubes';

export type MembershipScope = 'union' | 'sport' | 'tournament' | 'match' | 'club';
export type MembershipRole = 'admin' | 'editor' | 'operator' | 'viewer';

export interface MembershipLike {
    scopeType: MembershipScope;
    scopeId?: string;
    role: string;
}

export interface AdminPanelConfig {
    href: string;
    label: string;
}

export const APP_ROLES: AppUserRole[] = [
    'fan',
    'jugador',
    'entrenador',
    'redactor',
    'admin_general',
    'super_admin',
    'admin_union',
    'admin_torneo',
    'operador',
    'admin_club',
    'gestor_deportes',
    'gestor_torneos',
    'gestor_partidos',
    'gestor_clubes',
];

const ROLE_ALIASES: Record<string, AppUserRole> = {
    super_admin: 'super_admin', // Identity mapping
    admin_general: 'admin_general',
    redactor: 'redactor',
    editor_noticias: 'redactor',
    editorial: 'redactor',
    admin_union: 'admin_union',
    admin_torneo: 'admin_torneo',
    admin_club: 'admin_club',
    club_admin: 'admin_club',
    operador: 'operador',
    operator: 'operador',
    gestor_deportes: 'gestor_deportes',
    gestor_torneos: 'gestor_torneos',
    gestor_partidos: 'gestor_partidos',
    gestor_clubes: 'gestor_clubes',
    sports_manager: 'gestor_deportes',
    tournament_manager: 'gestor_torneos',
    match_manager: 'gestor_partidos',
    club_manager: 'gestor_clubes',
    fan: 'fan',
    user: 'fan',
    jugador: 'jugador',
    entrenador: 'entrenador',
};

export const VIEW_MEMBERSHIP_ROLES = new Set<MembershipRole>(['admin', 'editor', 'operator', 'viewer']);
export const MANAGEMENT_MEMBERSHIP_ROLES = new Set<MembershipRole>(['admin', 'editor', 'operator']);
export const EDIT_MEMBERSHIP_ROLES = new Set<MembershipRole>(['admin', 'editor']);
export const ADMIN_ONLY_MEMBERSHIP_ROLES = new Set<MembershipRole>(['admin']);

export const ROLE_LABELS: Record<AppUserRole, string> = {
    fan: 'Fan',
    jugador: 'Jugador',
    entrenador: 'Entrenador',
    redactor: 'Redactor',
    admin_general: 'Admin General',
    super_admin: 'Super Admin',
    admin_union: 'Admin Unión',
    admin_torneo: 'Admin Torneo',
    operador: 'Operador',
    admin_club: 'Admin Club',
    gestor_deportes: 'Gestor de Deportes',
    gestor_torneos: 'Gestor de Torneos',
    gestor_partidos: 'Gestor de Partidos',
    gestor_clubes: 'Gestor de Clubes',
};

export const DEFAULT_SCOPE_FOR_ROLE: Partial<Record<AppUserRole, MembershipScope>> = {
    admin_union: 'union',
    admin_torneo: 'tournament',
    admin_club: 'club',
    gestor_deportes: 'sport',
    gestor_torneos: 'tournament',
    gestor_partidos: 'match',
    gestor_clubes: 'club',
};

const ADMIN_PANEL_ROLES = new Set<AppUserRole>([
    'admin_union',
    'admin_torneo',
    'operador',
    'gestor_deportes',
    'gestor_torneos',
    'gestor_partidos',
    'gestor_clubes',
]);

const EDITORIAL_PANEL_ROLES = new Set<AppUserRole>(['redactor']);
const CLUB_PANEL_SCOPE_TYPES = new Set<MembershipScope>(['club']);
const ADMIN_PANEL_SCOPE_TYPES = new Set<MembershipScope>(['union', 'sport', 'tournament', 'match']);

function hasAdminPanelMembershipAccess(memberships?: MembershipLike[] | null) {
    return hasMembershipRoleAccess(
        memberships,
        MANAGEMENT_MEMBERSHIP_ROLES,
        ADMIN_PANEL_SCOPE_TYPES
    );
}

function hasClubPanelMembershipAccess(memberships?: MembershipLike[] | null) {
    return hasMembershipRoleAccess(
        memberships,
        MANAGEMENT_MEMBERSHIP_ROLES,
        CLUB_PANEL_SCOPE_TYPES
    );
}

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

export function isAppRole(value: string): value is AppUserRole {
    return APP_ROLES.includes(value as AppUserRole);
}

export function isGlobalAdminRole(role?: string | null): boolean {
    const normalized = normalizeRole(role);
    return normalized === 'admin_general' || normalized === 'super_admin';
}

export function getRoleLabel(role?: string | null): string {
    const normalized = normalizeRole(role);
    return ROLE_LABELS[normalized];
}

export function getDefaultScopeForRole(role?: string | null): MembershipScope | null {
    const normalized = normalizeRole(role);
    return DEFAULT_SCOPE_FOR_ROLE[normalized] ?? null;
}

export function hasMembershipRoleAccess(
    memberships: MembershipLike[] | null | undefined,
    allowedRoles: ReadonlySet<string>,
    scopeTypes?: ReadonlySet<MembershipScope>
): boolean {
    return Boolean(
        memberships?.some((membership) => {
            if (!allowedRoles.has(membership.role)) {
                return false;
            }

            if (!scopeTypes) {
                return true;
            }

            return scopeTypes.has(membership.scopeType);
        })
    );
}

export function resolveAdminPanel(
    role?: string | null,
    memberships?: MembershipLike[] | null
): AdminPanelConfig | null {
    const normalized = normalizeRole(role);

    if (isGlobalAdminRole(normalized)) {
        return { href: '/admin/super', label: 'Super Admin' };
    }

    if (normalized === 'admin_club') {
        return { href: '/club-admin', label: 'Panel Club' };
    }

    if (EDITORIAL_PANEL_ROLES.has(normalized)) {
        return { href: '/admin/editorial', label: 'Panel Editorial' };
    }

    if (ADMIN_PANEL_ROLES.has(normalized)) {
        return { href: '/admin', label: 'Panel Admin' };
    }

    if (memberships?.length) {
        const hasAdminPanelAccess = hasAdminPanelMembershipAccess(memberships);
        const hasClubPanelAccess = hasClubPanelMembershipAccess(memberships);

        if (hasAdminPanelAccess) {
            return { href: '/admin', label: 'Panel Admin' };
        }

        if (hasClubPanelAccess) {
            return { href: '/club-admin', label: 'Panel Club' };
        }
    }

    return null;
}

export function hasEditorialAccess(
    role?: string | null,
    memberships?: MembershipLike[] | null
): boolean {
    void memberships;
    const normalized = normalizeRole(role);
    return isGlobalAdminRole(normalized) || EDITORIAL_PANEL_ROLES.has(normalized);
}

export function hasFederationAdminAccess(
    role?: string | null,
    memberships?: MembershipLike[] | null
): boolean {
    const normalized = normalizeRole(role);

    return (
        isGlobalAdminRole(normalized) ||
        ADMIN_PANEL_ROLES.has(normalized) ||
        hasAdminPanelMembershipAccess(memberships)
    );
}

export function isAdminUser(role?: string | null, memberships?: MembershipLike[] | null): boolean {
    const normalized = normalizeRole(role);

    return (
        hasFederationAdminAccess(normalized, memberships) ||
        normalized === 'admin_club' ||
        hasClubPanelMembershipAccess(memberships)
    );
}
