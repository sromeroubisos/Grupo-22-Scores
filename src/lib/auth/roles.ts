export type AppUserRole =
    | 'fan'
    | 'jugador'
    | 'entrenador'
    | 'redactor'
    | 'admin_general'
    | 'super_admin'
    | 'admin_union'
    | 'admin_torneo'
    | 'operador'
    | 'admin_club'
    | 'familia_club'
    | 'gestor_deportes'
    | 'gestor_torneos'
    | 'gestor_partidos'
    | 'gestor_clubes';

export type MembershipScope = 'union' | 'sport' | 'tournament' | 'match' | 'club' | 'club_family';
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
    'familia_club',
    'gestor_deportes',
    'gestor_torneos',
    'gestor_partidos',
    'gestor_clubes',
];

const ROLE_ALIASES: Record<string, AppUserRole> = {
    admin: 'admin_general',
    global_admin: 'admin_general',
    super_admin: 'super_admin',
    superadmin: 'super_admin',
    admin_general: 'admin_general',
    redactor: 'redactor',
    editor_noticias: 'redactor',
    editorial: 'redactor',
    admin_union: 'admin_union',
    admin_torneo: 'admin_torneo',
    tournament_admin: 'admin_torneo',
    admin_tournament: 'admin_torneo',
    admin_club: 'admin_club',
    club_admin: 'admin_club',
    familia_club: 'familia_club',
    family_club: 'familia_club',
    club_family: 'familia_club',
    club_family_admin: 'familia_club',
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
    admin_club: 'Administrador de Club',
    familia_club: 'Familia de Club',
    gestor_deportes: 'Gestor de Deportes',
    gestor_torneos: 'Gestor de Torneos',
    gestor_partidos: 'Gestor de Partidos',
    gestor_clubes: 'Gestor de Clubes',
};

export const DEFAULT_SCOPE_FOR_ROLE: Partial<Record<AppUserRole, MembershipScope>> = {
    admin_union: 'union',
    admin_torneo: 'tournament',
    admin_club: 'club',
    familia_club: 'club_family',
    gestor_deportes: 'sport',
    gestor_torneos: 'tournament',
    gestor_partidos: 'match',
    gestor_clubes: 'club',
};

export const CLUB_MEMBERSHIP_SCOPE_TYPES = new Set<MembershipScope>(['club', 'club_family']);

const ADMIN_PANEL_ROLES = new Set<AppUserRole>([
    'admin_union',
    'admin_torneo',
    'operador',
    'gestor_deportes',
    'gestor_torneos',
    'gestor_partidos',
    'gestor_clubes',
]);

export const TOURNAMENT_ADMIN_PANEL_ROLES = new Set<AppUserRole>([
    'admin_torneo',
    'gestor_torneos',
]);

const EDITORIAL_PANEL_ROLES = new Set<AppUserRole>(['redactor']);
const CLUB_PANEL_SCOPE_TYPES = CLUB_MEMBERSHIP_SCOPE_TYPES;
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
    const normalizedRawRole = rawRole?.trim();

    if (!normalizedRawRole) {
        return 'fan';
    }

    const direct = ROLE_ALIASES[normalizedRawRole];
    if (direct) {
        return direct;
    }

    const lower = normalizedRawRole.toLowerCase();
    if (lower !== normalizedRawRole && ROLE_ALIASES[lower]) {
        return ROLE_ALIASES[lower];
    }

    if ((APP_ROLES as string[]).includes(normalizedRawRole)) {
        return normalizedRawRole as AppUserRole;
    }

    return 'fan';
}

export function isDefaultRoleValue(rawRole?: string | null): boolean {
    const normalizedRawRole = rawRole?.trim().toLowerCase();
    return !normalizedRawRole || normalizedRawRole === 'fan' || normalizedRawRole === 'user';
}

export function normalizeStoredRole(rawRole?: string | null): AppUserRole | null {
    const normalizedRawRole = rawRole?.trim();
    if (!normalizedRawRole) return null;

    const role = normalizeRole(normalizedRawRole);
    if (role === 'fan' && !isDefaultRoleValue(normalizedRawRole)) {
        return null;
    }

    return role;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function getRoleFromMetadata(metadata?: Record<string, unknown> | null): AppUserRole | null {
    if (!isRecord(metadata)) return null;

    const directRole = normalizeStoredRole(typeof metadata.role === 'string' ? metadata.role : null);
    if (directRole) return directRole;

    const roles = metadata.roles;
    if (Array.isArray(roles)) {
        for (const role of roles) {
            if (typeof role !== 'string') continue;
            const normalized = normalizeStoredRole(role);
            if (normalized) return normalized;
        }
    }

    if (isRecord(roles)) {
        for (const [role, enabled] of Object.entries(roles)) {
            if (enabled !== true) continue;
            const normalized = normalizeStoredRole(role);
            if (normalized) return normalized;
        }
    }

    return null;
}

export function resolveBestUserRole({
    reservedRole,
    profileRole,
    appMetadata,
    userMetadata,
    fallback = 'fan',
}: {
    reservedRole?: string | null;
    profileRole?: string | null;
    appMetadata?: Record<string, unknown> | null;
    userMetadata?: Record<string, unknown> | null;
    fallback?: AppUserRole;
}): AppUserRole {
    const reserved = normalizeStoredRole(reservedRole);
    if (reserved) return reserved;

    const profile = normalizeStoredRole(profileRole);
    if (profile && !isDefaultRoleValue(profileRole)) return profile;

    const appMetadataRole = getRoleFromMetadata(appMetadata);
    if (appMetadataRole) return appMetadataRole;

    const userMetadataRole = getRoleFromMetadata(userMetadata);
    if (userMetadataRole) return userMetadataRole;

    return profile ?? fallback;
}

export function isAppRole(value: string): value is AppUserRole {
    return APP_ROLES.includes(value as AppUserRole);
}

export function isGlobalAdminRole(role?: string | null): boolean {
    const normalized = normalizeRole(role);
    return normalized === 'admin_general' || normalized === 'super_admin';
}

export function canUseRestrictedContentActions(role?: string | null): boolean {
    return isGlobalAdminRole(role);
}

export function isSuperAdminRole(role?: string | null): boolean {
    return normalizeRole(role) === 'super_admin';
}

export function isTournamentAdminRole(role?: string | null): boolean {
    const normalized = normalizeRole(role);
    return TOURNAMENT_ADMIN_PANEL_ROLES.has(normalized);
}

export function getRoleLabel(role?: string | null): string {
    const normalized = normalizeRole(role);
    return ROLE_LABELS[normalized];
}

export function getDefaultScopeForRole(role?: string | null): MembershipScope | null {
    const normalized = normalizeRole(role);
    return DEFAULT_SCOPE_FOR_ROLE[normalized] ?? null;
}

export function getAllowedScopesForRole(role?: string | null): MembershipScope[] | null {
    const normalized = normalizeRole(role);

    if (normalized === 'admin_club' || normalized === 'gestor_clubes') {
        return ['club', 'club_family'];
    }

    if (normalized === 'admin_torneo' || normalized === 'gestor_torneos') {
        return ['tournament', 'club'];
    }

    const defaultScope = DEFAULT_SCOPE_FOR_ROLE[normalized];
    return defaultScope ? [defaultScope] : null;
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

    if (normalized === 'admin_club' || normalized === 'familia_club') {
        return { href: '/club-admin', label: 'Panel Club' };
    }

    if (EDITORIAL_PANEL_ROLES.has(normalized)) {
        return { href: '/admin/editorial', label: 'Panel Editorial' };
    }

    if (TOURNAMENT_ADMIN_PANEL_ROLES.has(normalized)) {
        return { href: '/admin/torneo', label: 'Panel Torneos' };
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

export function hasNewsManagementAccess(
    role?: string | null,
    _memberships?: MembershipLike[] | null
): boolean {
    void _memberships;
    return isSuperAdminRole(role);
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
        normalized === 'familia_club' ||
        hasClubPanelMembershipAccess(memberships)
    );
}
