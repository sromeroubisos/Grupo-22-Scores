'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, Filter, Pencil, Search, Shield, User as UserIcon, X } from 'lucide-react';
import styles from '../page.module.css';
import { APP_ROLES, getRoleLabel, ROLE_LABELS } from '@/lib/auth/roles';
import { normalizeError, serializeUnknownError } from '@/lib/utils/errorUtils';

type AppUserRow = {
    id: string;
    name: string | null;
    email: string;
    role: string;
    created_at?: string | null;
    last_login_at?: string | null;
    avatar_url?: string | null;
};

type MembershipRow = {
    id: string;
    user_id: string;
    scope_type: 'union' | 'sport' | 'tournament' | 'match' | 'club' | 'club_family';
    scope_id: string;
    role: 'admin' | 'editor' | 'operator' | 'viewer';
    created_at: string | null;
};

type ClubCatalogItem = {
    id: string;
    label: string;
    meta?: string;
};

type RoleAssignment = {
    id: string;
    userId: string;
    userName: string;
    email: string;
    roleLabel: string;
    scopeLabel: string;
    assignedAt: string | null;
    accessLevel: string;
    status: 'active' | 'inactive';
};

type PersonasRolesResponse = {
    data?: {
        users?: AppUserRow[];
        memberships?: MembershipRow[];
        entityNames?: Record<string, string>;
    };
    error?: string;
    details?: unknown;
};

function stringifyDetails(details: unknown) {
    if (typeof details === 'string') {
        return details;
    }

    if (details == null) {
        return null;
    }

    try {
        return JSON.stringify(details);
    } catch {
        return serializeUnknownError(details);
    }
}

function getResponsePreview(rawBody: string) {
    return rawBody
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 220);
}

function formatShortDate(value?: string | null) {
    return value ? new Date(value).toLocaleDateString() : '-';
}

function getDisplayInitials(value?: string | null) {
    return (value || '?').substring(0, 2).toUpperCase();
}

function getAccessSummary(accessCount: number) {
    return accessCount === 0 ? 'Sin alcances especificos' : `${accessCount} asignacion(es)`;
}

const MANAGEMENT_PRESETS = [
    {
        id: 'redactor',
        title: 'Redactor',
        desc: 'Crea, edita y publica noticias desde el panel editorial sin acceso al resto de la consola operativa.',
        accent: '#f97316',
    },
    {
        id: 'gestor_deportes',
        title: 'Gestor de Deportes',
        desc: 'Administra uno o varios deportes y hereda acceso a sus torneos, clubes y partidos.',
        accent: 'var(--color-accent)',
    },
    {
        id: 'gestor_torneos',
        title: 'Gestor de Torneos',
        desc: 'Opera torneos específicos y todo su fixture asociado.',
        accent: '#38bdf8',
    },
    {
        id: 'gestor_partidos',
        title: 'Gestor de Partidos',
        desc: 'Gestiona partidos concretos sin necesidad de acceder al torneo completo.',
        accent: '#f59e0b',
    },
    {
        id: 'gestor_clubes',
        title: 'Gestor de Clubes',
        desc: 'Gestiona clubes específicos con permisos focalizados por entidad.',
        accent: '#34d399',
    },
];

const SCOPE_ROLE_LABELS: Record<MembershipRow['scope_type'], string> = {
    union: 'Admin Unión',
    sport: 'Gestor de Deportes',
    tournament: 'Gestor de Torneos',
    match: 'Gestor de Partidos',
    club: 'Gestor de Clubes',
    club_family: 'Familia de Club',
};

const LOCAL_ROLE_LABELS: Record<MembershipRow['role'], string> = {
    admin: 'Admin',
    editor: 'Editor',
    operator: 'Operador',
    viewer: 'Lectura',
};

export default function PersonasRolesPage() {
    const [searchQuery, setSearchQuery] = useState('');
    const [activeTab, setActiveTab] = useState<'all' | 'roles'>('all');
    const [users, setUsers] = useState<AppUserRow[]>([]);
    const [memberships, setMemberships] = useState<MembershipRow[]>([]);
    const [entityNames, setEntityNames] = useState<Record<string, string>>({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Edit role modal state
    const [editingUser, setEditingUser] = useState<AppUserRow | null>(null);
    const [editingRole, setEditingRole] = useState<string>('');
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);
    const [clubCatalog, setClubCatalog] = useState<ClubCatalogItem[]>([]);
    const [loadingClubCatalog, setLoadingClubCatalog] = useState(false);
    const [clubManagementType, setClubManagementType] = useState<'club' | 'club_family'>('club');
    const [clubMembershipRole, setClubMembershipRole] = useState<MembershipRow['role']>('admin');
    const [clubScopeId, setClubScopeId] = useState('');

    const loadClubCatalog = useCallback(async () => {
        if (clubCatalog.length > 0) {
            return;
        }

        setLoadingClubCatalog(true);
        try {
            const response = await fetch('/api/catalog/clubs?limit=200', {
                cache: 'no-store',
                credentials: 'include',
            });
            const payload = await response.json() as { data?: ClubCatalogItem[]; error?: string };
            if (!response.ok) {
                throw new Error(payload.error || 'No se pudo cargar el catálogo de clubes');
            }

            setClubCatalog(payload.data ?? []);
        } catch (err) {
            setSaveError(err instanceof Error ? err.message : 'No se pudo cargar el catálogo de clubes');
        } finally {
            setLoadingClubCatalog(false);
        }
    }, [clubCatalog.length]);

    const openEdit = useCallback((user: AppUserRow) => {
        const clubAssignments = memberships.filter(
            (membership) =>
                membership.user_id === user.id &&
                (membership.scope_type === 'club' || membership.scope_type === 'club_family')
        );
        const primaryClubAssignment = clubAssignments[0] ?? null;

        setEditingUser(user);
        setEditingRole(user.role);
        setClubManagementType(primaryClubAssignment?.scope_type === 'club_family' ? 'club_family' : 'club');
        setClubMembershipRole(primaryClubAssignment?.role ?? 'admin');
        setClubScopeId(primaryClubAssignment?.scope_id ?? '');
        setSaveError(null);
        void loadClubCatalog();
    }, [loadClubCatalog, memberships]);

    const closeEdit = useCallback(() => {
        setEditingUser(null);
        setClubManagementType('club');
        setClubMembershipRole('admin');
        setClubScopeId('');
        setSaveError(null);
    }, []);

    const handleSaveRole = useCallback(async () => {
        if (!editingUser) return;
        setSaving(true);
        setSaveError(null);
        try {
            const needsClubScope = editingRole === 'gestor_clubes' || editingRole === 'admin_club';
            if (needsClubScope && !clubScopeId) {
                setSaveError('Seleccioná un club o una familia de club para este usuario.');
                return;
            }

            const response = await fetch(
                needsClubScope
                    ? `/api/admin/users/${editingUser.id}/access`
                    : `/api/admin/super/personas-roles/${editingUser.id}`,
                {
                    method: needsClubScope ? 'PUT' : 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify(
                        needsClubScope
                            ? {
                                role: editingRole,
                                scopeType: clubManagementType,
                                membershipRole: clubMembershipRole,
                                scopeIds: [clubScopeId],
                            }
                            : { role: editingRole }
                    ),
                }
            );
            const payload = await response.json() as {
                data?: {
                    id?: string;
                    role?: string;
                    memberships?: MembershipRow[];
                };
                error?: string;
            };
            if (!response.ok) {
                setSaveError(payload.error || 'Error al guardar');
                return;
            }
            setUsers((prev) =>
                prev.map((u) => (u.id === editingUser.id ? { ...u, role: editingRole } : u))
            );

            if (needsClubScope) {
                setMemberships((prev) => {
                    const next = prev.filter(
                        (membership) =>
                            membership.user_id !== editingUser.id ||
                            (membership.scope_type !== 'club' && membership.scope_type !== 'club_family')
                    );

                    const nextClubMemberships = ((payload.data?.memberships ?? []) as MembershipRow[]).filter(
                        (membership) =>
                            membership.scope_type === 'club' || membership.scope_type === 'club_family'
                    );

                    return [...next, ...nextClubMemberships];
                });
            }

            closeEdit();
        } catch (err) {
            setSaveError(err instanceof Error ? err.message : 'Error desconocido');
        } finally {
            setSaving(false);
        }
    }, [
        clubManagementType,
        clubMembershipRole,
        clubScopeId,
        closeEdit,
        editingRole,
        editingUser,
    ]);

    useEffect(() => {
        void fetchUsers();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const fetchUsers = useCallback(async () => {
        setLoading(true);
        setError(null);

        const abortController = new AbortController();
        const timeoutId = setTimeout(
            () => abortController.abort(new DOMException('Personas y roles request timed out', 'AbortError')),
            12000
        );

        try {
            const response = await fetch('/api/admin/super/personas-roles', {
                cache: 'no-store',
                credentials: 'include',
                signal: abortController.signal,
            });
            const rawBody = await response.text();
            let payload: PersonasRolesResponse | null = null;

            if (rawBody) {
                try {
                    payload = JSON.parse(rawBody) as PersonasRolesResponse;
                } catch {
                    const preview = getResponsePreview(rawBody);
                    const statusLabel = `${response.status} ${response.statusText}`.trim();

                    throw new Error(
                        response.ok
                            ? `La API de personas y roles devolvio una respuesta invalida (${statusLabel}).`
                            : `No se pudieron cargar los accesos (${statusLabel}). ${preview || 'Respuesta no JSON del servidor.'}`
                    );
                }
            }

            if (!response.ok) {
                const detail = stringifyDetails(payload?.details);

                throw new Error(
                    detail
                        ? `${payload?.error || 'No se pudieron cargar los accesos'}: ${detail}`
                        : (payload?.error || 'No se pudieron cargar los accesos')
                );
            }

            const usersResult = { data: payload?.data?.users ?? [] };
            const membershipsResult = { data: payload?.data?.memberships ?? [] };
            const sportsResult = { data: [] as Array<{ id: string; name: string }> };
            const unionsResult = { data: [] as Array<{ id: string; name: string }> };
            const tournamentsResult = { data: [] as Array<{ id: string; name: string }> };
            const clubsResult = { data: [] as Array<{ id: string; name: string }> };
            const matchesResult = { data: [] as Array<{ id: string; date_time?: string | null; tournament_id?: string | null }> };

            const tournamentsById = new Map(
                (tournamentsResult.data || []).map((tournament) => [tournament.id, tournament.name])
            );

            const nextEntityNames: Record<string, string> = { ...(payload?.data?.entityNames ?? {}) };

            setUsers((payload?.data?.users ?? []) as AppUserRow[]);
            setMemberships((payload?.data?.memberships ?? []) as MembershipRow[]);
            setEntityNames(payload?.data?.entityNames ?? {});

            (sportsResult.data || []).forEach((sport) => {
                nextEntityNames[`sport:${sport.id}`] = sport.name;
            });

            (unionsResult.data || []).forEach((union) => {
                nextEntityNames[`union:${union.id}`] = union.name;
            });

            (tournamentsResult.data || []).forEach((tournament) => {
                nextEntityNames[`tournament:${tournament.id}`] = tournament.name;
            });

            (clubsResult.data || []).forEach((club) => {
                nextEntityNames[`club:${club.id}`] = club.name;
            });

            (matchesResult.data || []).forEach((match) => {
                const tournamentName = match.tournament_id ? tournamentsById.get(match.tournament_id) : null;
                const dateLabel = match.date_time
                    ? new Date(match.date_time).toLocaleString('es-AR', {
                        day: '2-digit',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                    })
                    : match.id;

                nextEntityNames[`match:${match.id}`] = tournamentName
                    ? `${tournamentName} • ${dateLabel}`
                    : `Partido ${dateLabel}`;
            });

            setUsers((usersResult.data || []) as AppUserRow[]);
            setMemberships((membershipsResult.data || []) as MembershipRow[]);
            setEntityNames(nextEntityNames);
        } catch (err: unknown) {
            const normalized = normalizeError(err);
            console.error('Error fetching personas/roles:', {
                message: normalized.message,
                details: normalized.details,
                code: normalized.code,
                raw: serializeUnknownError(normalized.raw),
            });

            const isAbort =
                normalized.message.toLowerCase().includes('abort') ||
                normalized.message.toLowerCase().includes('timed out') ||
                normalized.code === 'AbortError';

            if (isAbort) {
                setError('La consulta tardó demasiado. Revisá RLS, el service role o la conectividad con Supabase.');
            } else {
                setError(
                    normalized.details
                        ? `${normalized.message}. ${normalized.details}`
                        : normalized.message
                );
            }

            return;
            /* legacy client-side error handler removed
            if (message.includes('abort')) {
                setError('La consulta tardó demasiado. Revisá RLS o la conectividad con Supabase.');
            } else {
                setError(message);
            }
            */
        } finally {
            clearTimeout(timeoutId);
            setLoading(false);
        }
    }, []);

    const filteredUsers = useMemo(() => {
        const query = searchQuery.trim().toLowerCase();

        return users.filter((user) => {
            if (!query) return true;

            return (
                user.name?.toLowerCase().includes(query) ||
                user.email?.toLowerCase().includes(query) ||
                user.role?.toLowerCase().includes(query)
            );
        });
    }, [searchQuery, users]);

    const derivedRoleAssignments = useMemo<RoleAssignment[]>(() => {
        const usersById = new Map(users.map((user) => [user.id, user]));

        const globalAssignments = users
            .filter((user) => ['super_admin', 'admin_general', 'redactor'].includes(user.role))
            .map((user) => ({
                id: `global-${user.id}`,
                userId: user.id,
                userName: user.name || 'Usuario',
                email: user.email || '',
                roleLabel: getRoleLabel(user.role),
                scopeLabel: 'Global',
                assignedAt: user.created_at || new Date().toISOString(),
                accessLevel: 'Global',
                status: 'active' as const,
            }));

        const membershipAssignments = memberships
            .map((membership) => {
                const user = usersById.get(membership.user_id);
                if (!user) return null;

                const scopeLabel =
                    entityNames[`${membership.scope_type}:${membership.scope_id}`] ||
                    `${membership.scope_type}:${membership.scope_id}`;

                return {
                    id: membership.id,
                    userId: user.id,
                    userName: user.name || 'Usuario',
                    email: user.email || '',
                    roleLabel: SCOPE_ROLE_LABELS[membership.scope_type],
                    scopeLabel,
                    assignedAt: membership.created_at,
                    accessLevel: LOCAL_ROLE_LABELS[membership.role],
                    status: 'active' as const,
                };
            })
            .filter(Boolean) as RoleAssignment[];

        return [...globalAssignments, ...membershipAssignments];
    }, [entityNames, memberships, users]);

    const filteredAssignments = useMemo(() => {
        const query = searchQuery.trim().toLowerCase();

        return derivedRoleAssignments.filter((assignment) => {
            if (!query) return true;

            return (
                assignment.userName.toLowerCase().includes(query) ||
                assignment.email.toLowerCase().includes(query) ||
                assignment.roleLabel.toLowerCase().includes(query) ||
                assignment.scopeLabel.toLowerCase().includes(query) ||
                assignment.accessLevel.toLowerCase().includes(query)
            );
        });
    }, [derivedRoleAssignments, searchQuery]);

    const editingClubAssignments = useMemo(
        () =>
            editingUser
                ? memberships.filter(
                    (membership) =>
                        membership.user_id === editingUser.id &&
                        (membership.scope_type === 'club' || membership.scope_type === 'club_family')
                )
                : [],
        [editingUser, memberships]
    );

    const selectedClubLabel = useMemo(
        () => clubCatalog.find((club) => club.id === clubScopeId)?.label ?? clubScopeId,
        [clubCatalog, clubScopeId]
    );

    return (
        <>
        <div style={{ paddingBottom: 40 }}>
            <header className={styles.tectonicHeader}>
                <div className={styles.headerInfo}>
                    <p>Gestión de Accesos</p>
                    <h1>Personas y Roles</h1>
                </div>
                <div className={styles.statusSync}>
                    <button className={`${styles.btn} ${styles.btnPrimary}`} type="button">
                        <UserIcon size={16} /> Invitar Usuario
                    </button>
                </div>
            </header>

            <section
                className={styles.slab}
                style={{
                    marginBottom: 24,
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                    gap: 16,
                }}
            >
                {MANAGEMENT_PRESETS.map((preset) => (
                    <article
                        key={preset.id}
                        style={{
                            border: '1px solid rgba(255,255,255,0.08)',
                            borderRadius: 18,
                            padding: 18,
                            background: 'rgba(255,255,255,0.02)',
                        }}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                            <span
                                style={{
                                    width: 10,
                                    height: 10,
                                    borderRadius: '50%',
                                    background: preset.accent,
                                    boxShadow: `0 0 12px ${preset.accent}`,
                                }}
                            />
                            <h3 style={{ margin: 0, fontSize: 15 }}>{preset.title}</h3>
                        </div>
                        <p style={{ margin: 0, color: 'var(--basalt-400)', fontSize: 13, lineHeight: 1.55 }}>
                            {preset.desc}
                        </p>
                    </article>
                ))}
            </section>

            <div className={styles.slab} style={{ marginBottom: 24, padding: '0 24px' }}>
                <div className={styles.personasTabBar}>
                    <button
                        className={styles.tabInfo}
                        style={{
                            borderBottom: activeTab === 'all' ? '2px solid var(--color-accent)' : '2px solid transparent',
                            color: activeTab === 'all' ? '#fff' : 'var(--basalt-400)',
                            padding: '16px 0',
                            background: 'none',
                            cursor: 'pointer',
                        }}
                        onClick={() => setActiveTab('all')}
                        type="button"
                    >
                        Todos los Usuarios ({users.length})
                    </button>
                    <button
                        className={styles.tabInfo}
                        style={{
                            borderBottom: activeTab === 'roles' ? '2px solid var(--color-accent)' : '2px solid transparent',
                            color: activeTab === 'roles' ? '#fff' : 'var(--basalt-400)',
                            padding: '16px 0',
                            background: 'none',
                            cursor: 'pointer',
                        }}
                        onClick={() => setActiveTab('roles')}
                        type="button"
                    >
                        Accesos Granulares ({derivedRoleAssignments.length})
                    </button>
                </div>
            </div>

            <div className={styles.slab} style={{ marginBottom: 24 }}>
                <div className={`${styles.slabHeader} ${styles.personasToolbar}`}>
                    <div className={styles.personasToolbarLead}>
                        <div className={`${styles.filterInput} ${styles.personasSearch}`}>
                            <Search size={16} className={styles.personasSearchIcon} />
                            <input
                                className={styles.personasSearchInput}
                                placeholder={activeTab === 'all' ? 'Buscar usuario por nombre o email...' : 'Buscar por alcance, rol o entidad...'}
                                value={searchQuery}
                                onChange={(event) => setSearchQuery(event.target.value)}
                            />
                        </div>
                        <button className={styles.btn} type="button">
                            <Filter size={14} /> Filtros
                        </button>
                    </div>
                    <button className={styles.btn} onClick={fetchUsers} type="button">
                        <Download size={14} /> Recargar
                    </button>
                </div>
            </div>

            <div className={styles.content}>
                {loading && <div style={{ padding: 20, textAlign: 'center', color: '#888' }}>Cargando usuarios...</div>}

                {error && (
                    <div style={{ padding: 20, color: '#f87171', background: 'rgba(239, 68, 68, 0.1)', borderRadius: 8, marginBottom: 20 }}>
                        Error al cargar usuarios: {error}
                    </div>
                )}

                {!loading && !error && activeTab === 'all' && (
                    <section className={styles.section}>
                        <div className={styles.sectionHeaderRow} style={{ marginBottom: 16 }}>
                            <h2 className={styles.sectionTitle}>Directorio de Usuarios ({filteredUsers.length})</h2>
                        </div>
                        <div className={styles.card}>
                            <div className={styles.personasDesktopTable}>
                            <table className={styles.table}>
                                <thead>
                                    <tr>
                                        <th>Usuario</th>
                                        <th>Email</th>
                                        <th>Rol Base</th>
                                        <th>Accesos</th>
                                        <th>Fecha Registro</th>
                                        <th>Último Acceso</th>
                                        <th style={{ textAlign: 'right' }}>Acciones</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredUsers.length === 0 ? (
                                        <tr>
                                            <td colSpan={7} style={{ textAlign: 'center', padding: 40, color: '#666' }}>
                                                No se encontraron usuarios
                                            </td>
                                        </tr>
                                    ) : (
                                        filteredUsers.map((user) => {
                                            const accessCount = memberships.filter((membership) => membership.user_id === user.id).length;

                                            return (
                                                <tr key={user.id} className={styles.tableRow}>
                                                    <td style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                                        <div
                                                            style={{
                                                                width: 32,
                                                                height: 32,
                                                                borderRadius: '50%',
                                                                background: 'var(--basalt-800)',
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                justifyContent: 'center',
                                                                fontSize: 12,
                                                                fontWeight: 700,
                                                                overflow: 'hidden',
                                                            }}
                                                        >
                                                            {user.avatar_url ? (
                                                                <img src={user.avatar_url} alt={user.name || 'User'} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                                            ) : (
                                                                (user.name || user.email || '?').substring(0, 2).toUpperCase()
                                                            )}
                                                        </div>
                                                        <span style={{ fontWeight: 600 }}>{user.name || user.email || 'Sin nombre'}</span>
                                                    </td>
                                                    <td style={{ color: 'var(--basalt-400)' }}>{user.email}</td>
                                                    <td>
                                                        <span
                                                            className={styles.badge}
                                                            style={{
                                                                background: ['super_admin', 'admin_general'].includes(user.role) ? 'var(--color-accent)' : 'var(--basalt-800)',
                                                                color: ['super_admin', 'admin_general'].includes(user.role) ? '#000' : '#fff',
                                                            }}
                                                        >
                                                            {getRoleLabel(user.role)}
                                                        </span>
                                                    </td>
                                                    <td style={{ color: 'var(--basalt-400)' }}>
                                                        {accessCount === 0 ? 'Sin alcances específicos' : `${accessCount} asignación(es)`}
                                                    </td>
                                                    <td>{user.created_at ? new Date(user.created_at).toLocaleDateString() : '-'}</td>
                                                    <td>{user.last_login_at ? new Date(user.last_login_at).toLocaleDateString() : '-'}</td>
                                                    <td style={{ textAlign: 'right' }}>
                                                        <button
                                                            className={styles.btn}
                                                            style={{ padding: 8 }}
                                                            type="button"
                                                            onClick={() => openEdit(user)}
                                                            title="Editar rol del usuario"
                                                        >
                                                            <Pencil size={15} />
                                                        </button>
                                                    </td>
                                                </tr>
                                            );
                                        })
                                    )}
                                </tbody>
                            </table>
                            </div>
                            <div className={styles.personasMobileList}>
                                {filteredUsers.length === 0 ? (
                                    <div className={styles.personasEmptyState}>No se encontraron usuarios</div>
                                ) : (
                                    filteredUsers.map((user) => {
                                        const accessCount = memberships.filter((membership) => membership.user_id === user.id).length;
                                        const isGlobalAdmin = ['super_admin', 'admin_general'].includes(user.role);

                                        return (
                                            <article key={`mobile-${user.id}`} className={styles.personasMobileCard}>
                                                <div className={styles.personasMobileCardHeader}>
                                                    <div className={styles.personasMobileIdentity}>
                                                        <div className={styles.personasAvatar}>
                                                            {user.avatar_url ? (
                                                                <img src={user.avatar_url} alt={user.name || 'User'} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                                            ) : (
                                                                getDisplayInitials(user.name || user.email)
                                                            )}
                                                        </div>
                                                        <div className={styles.personasIdentityBody}>
                                                            <div className={styles.personasMobileName}>{user.name || user.email || 'Sin nombre'}</div>
                                                            <div className={styles.personasMobileEmail}>{user.email}</div>
                                                        </div>
                                                    </div>
                                                    <span
                                                        className={styles.badge}
                                                        style={{
                                                            background: isGlobalAdmin ? 'var(--color-accent)' : 'var(--basalt-800)',
                                                            color: isGlobalAdmin ? '#000' : '#fff',
                                                        }}
                                                    >
                                                        {getRoleLabel(user.role)}
                                                    </span>
                                                </div>

                                                <div className={styles.personasMetaGrid}>
                                                    <div className={styles.personasMetaItem}>
                                                        <span className={styles.personasMetaLabel}>Accesos</span>
                                                        <span className={styles.personasMetaValue}>{getAccessSummary(accessCount)}</span>
                                                    </div>
                                                    <div className={styles.personasMetaItem}>
                                                        <span className={styles.personasMetaLabel}>Registro</span>
                                                        <span className={styles.personasMetaValue}>{formatShortDate(user.created_at)}</span>
                                                    </div>
                                                    <div className={styles.personasMetaItem}>
                                                        <span className={styles.personasMetaLabel}>Ultimo acceso</span>
                                                        <span className={styles.personasMetaValue}>{formatShortDate(user.last_login_at)}</span>
                                                    </div>
                                                </div>

                                                <div className={styles.personasCardActions}>
                                                    <button
                                                        className={`${styles.btn} ${styles.btnPrimary}`}
                                                        style={{ width: '100%', justifyContent: 'center' }}
                                                        type="button"
                                                        onClick={() => openEdit(user)}
                                                    >
                                                        <Pencil size={14} /> Editar Rol
                                                    </button>
                                                </div>
                                            </article>
                                        );
                                    })
                                )}
                            </div>
                        </div>
                    </section>
                )}

                {!loading && !error && activeTab === 'roles' && (
                    <section className={styles.section}>
                        <div className={styles.sectionHeaderRow} style={{ marginBottom: 16 }}>
                            <h2 className={styles.sectionTitle}>Asignaciones por Alcance ({filteredAssignments.length})</h2>
                        </div>
                        <div className={styles.card}>
                            <div className={styles.personasDesktopTable}>
                            <table className={styles.table}>
                                <thead>
                                    <tr>
                                        <th>Usuario</th>
                                        <th>Tipo de Acceso</th>
                                        <th>Entidad</th>
                                        <th>Nivel</th>
                                        <th>Desde</th>
                                        <th>Estado</th>
                                        <th style={{ textAlign: 'right' }}>Acciones</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredAssignments.length === 0 ? (
                                        <tr>
                                            <td colSpan={7} style={{ textAlign: 'center', padding: 40, color: '#666' }}>
                                                No hay accesos especiales asignados
                                            </td>
                                        </tr>
                                    ) : (
                                        filteredAssignments.map((assignment) => (
                                            <tr key={assignment.id} className={styles.tableRow}>
                                                <td style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                                    <div
                                                        style={{
                                                            width: 32,
                                                            height: 32,
                                                            borderRadius: '50%',
                                                            background: 'var(--basalt-800)',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            justifyContent: 'center',
                                                            fontSize: 12,
                                                            fontWeight: 700,
                                                            color: 'var(--color-accent)',
                                                        }}
                                                    >
                                                        {assignment.userName.substring(0, 2).toUpperCase()}
                                                    </div>
                                                    <div>
                                                        <div style={{ fontWeight: 600 }}>{assignment.userName}</div>
                                                        <div style={{ fontSize: 11, color: 'var(--basalt-400)' }}>{assignment.email}</div>
                                                    </div>
                                                </td>
                                                <td>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                        <Shield size={14} color="var(--color-accent)" />
                                                        {assignment.roleLabel}
                                                    </div>
                                                </td>
                                                <td>
                                                    <span className={styles.badge} style={{ background: 'var(--basalt-800)', border: '1px solid var(--surface-edge)', padding: '2px 8px' }}>
                                                        {assignment.scopeLabel}
                                                    </span>
                                                </td>
                                                <td>{assignment.accessLevel}</td>
                                                <td>{assignment.assignedAt ? new Date(assignment.assignedAt).toLocaleDateString() : '-'}</td>
                                                <td>
                                                    <span className={`${styles.pill} ${styles.pillSuccess}`}>ACTIVO</span>
                                                </td>
                                                <td style={{ textAlign: 'right' }}>
                                                    <button
                                                        className={`${styles.btn} ${styles.btnPrimary}`}
                                                        style={{ fontSize: 11, padding: '4px 8px', height: 28, opacity: 0.65 }}
                                                        type="button"
                                                        disabled
                                                        title="Vista de lectura. La edición programática está disponible en /api/admin/users/:id/access"
                                                    >
                                                        Solo lectura
                                                    </button>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                            </div>
                            <div className={styles.personasMobileList}>
                                {filteredAssignments.length === 0 ? (
                                    <div className={styles.personasEmptyState}>No hay accesos especiales asignados</div>
                                ) : (
                                    filteredAssignments.map((assignment) => (
                                        <article key={`mobile-${assignment.id}`} className={styles.personasMobileCard}>
                                            <div className={styles.personasMobileCardHeader}>
                                                <div className={styles.personasMobileIdentity}>
                                                    <div className={`${styles.personasAvatar} ${styles.personasAvatarAccent}`}>
                                                        {getDisplayInitials(assignment.userName)}
                                                    </div>
                                                    <div className={styles.personasIdentityBody}>
                                                        <div className={styles.personasMobileName}>{assignment.userName}</div>
                                                        <div className={styles.personasMobileEmail}>{assignment.email}</div>
                                                    </div>
                                                </div>
                                                <span className={`${styles.pill} ${styles.pillSuccess}`}>Activo</span>
                                            </div>

                                            <div className={styles.personasMetaGrid}>
                                                <div className={styles.personasMetaItem}>
                                                    <span className={styles.personasMetaLabel}>Tipo</span>
                                                    <span className={styles.personasMetaValue}>
                                                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                                            <Shield size={14} color="var(--color-accent)" />
                                                            {assignment.roleLabel}
                                                        </span>
                                                    </span>
                                                </div>
                                                <div className={styles.personasMetaItem}>
                                                    <span className={styles.personasMetaLabel}>Entidad</span>
                                                    <span className={styles.personasMetaValue}>{assignment.scopeLabel}</span>
                                                </div>
                                                <div className={styles.personasMetaItem}>
                                                    <span className={styles.personasMetaLabel}>Nivel</span>
                                                    <span className={styles.personasMetaValue}>{assignment.accessLevel}</span>
                                                </div>
                                                <div className={styles.personasMetaItem}>
                                                    <span className={styles.personasMetaLabel}>Desde</span>
                                                    <span className={styles.personasMetaValue}>{formatShortDate(assignment.assignedAt)}</span>
                                                </div>
                                            </div>

                                            <div className={styles.personasCardActions}>
                                                <button
                                                    className={`${styles.btn} ${styles.btnPrimary}`}
                                                    style={{ width: '100%', justifyContent: 'center', fontSize: 11, opacity: 0.65 }}
                                                    type="button"
                                                    disabled
                                                    title="Vista de lectura. La ediciÃ³n programÃ¡tica estÃ¡ disponible en /api/admin/users/:id/access"
                                                >
                                                    Solo lectura
                                                </button>
                                            </div>
                                        </article>
                                    ))
                                )}
                            </div>
                        </div>
                    </section>
                )}
            </div>
        </div>

        {/* Edit Role Modal */}
        {editingUser && (
            <div
                role="dialog"
                aria-modal="true"
                aria-label="Editar rol de usuario"
                style={{
                    position: 'fixed',
                    inset: 0,
                    background: 'rgba(0,0,0,0.75)',
                    zIndex: 1000,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: 16,
                }}
                onClick={(e) => { if (e.target === e.currentTarget) closeEdit(); }}
            >
                <div style={{
                    background: 'var(--color-bg-secondary, #0d1117)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 18,
                    padding: 28,
                    width: '100%',
                    maxWidth: 440,
                    boxShadow: '0 24px 48px rgba(0,0,0,0.6)',
                }}>
                    {/* Header */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <div style={{
                                width: 40,
                                height: 40,
                                borderRadius: '50%',
                                background: 'var(--basalt-800)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: 14,
                                fontWeight: 700,
                                overflow: 'hidden',
                                flexShrink: 0,
                            }}>
                                {editingUser.avatar_url
                                    ? <img src={editingUser.avatar_url} alt={editingUser.name || 'User'} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                    : (editingUser.name || editingUser.email || '?').substring(0, 2).toUpperCase()
                                }
                            </div>
                            <div>
                                <div style={{ fontWeight: 700, fontSize: 15 }}>{editingUser.name || editingUser.email || 'Sin nombre'}</div>
                                <div style={{ color: 'var(--basalt-400)', fontSize: 12 }}>{editingUser.email}</div>
                            </div>
                        </div>
                        <button
                            className={styles.btn}
                            style={{ padding: 6 }}
                            type="button"
                            onClick={closeEdit}
                            aria-label="Cerrar"
                        >
                            <X size={16} />
                        </button>
                    </div>

                    {/* Role selector */}
                    <div style={{ marginBottom: 24 }}>
                        <label style={{ display: 'block', fontSize: 12, color: 'var(--basalt-400)', marginBottom: 8, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            Rol base
                        </label>
                        <select
                            value={editingRole}
                            onChange={(e) => setEditingRole(e.target.value)}
                            style={{
                                width: '100%',
                                background: 'var(--basalt-900, #0a0d10)',
                                border: '1px solid rgba(255,255,255,0.12)',
                                borderRadius: 10,
                                color: '#fff',
                                padding: '10px 14px',
                                fontSize: 14,
                                cursor: 'pointer',
                                outline: 'none',
                            }}
                        >
                            {APP_ROLES.map((role) => (
                                <option key={role} value={role}>
                                    {ROLE_LABELS[role]}
                                </option>
                            ))}
                        </select>
                    </div>

                    {(editingRole === 'gestor_clubes' || editingRole === 'admin_club') && (
                        <div style={{ marginBottom: 24, display: 'grid', gap: 16 }}>
                            <div>
                                <label style={{ display: 'block', fontSize: 12, color: 'var(--basalt-400)', marginBottom: 8, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                    Tipo de gestión
                                </label>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                                    <button
                                        type="button"
                                        onClick={() => setClubManagementType('club')}
                                        style={{
                                            borderRadius: 10,
                                            border: clubManagementType === 'club' ? '1px solid var(--color-accent)' : '1px solid rgba(255,255,255,0.12)',
                                            background: clubManagementType === 'club' ? 'rgba(52,211,153,0.12)' : 'var(--basalt-900, #0a0d10)',
                                            color: '#fff',
                                            padding: '12px 14px',
                                            textAlign: 'left',
                                            cursor: 'pointer',
                                        }}
                                    >
                                        <strong style={{ display: 'block', marginBottom: 4 }}>Club</strong>
                                        <span style={{ fontSize: 12, color: 'var(--basalt-400)' }}>Acceso solamente al club elegido.</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setClubManagementType('club_family')}
                                        style={{
                                            borderRadius: 10,
                                            border: clubManagementType === 'club_family' ? '1px solid var(--color-accent)' : '1px solid rgba(255,255,255,0.12)',
                                            background: clubManagementType === 'club_family' ? 'rgba(52,211,153,0.12)' : 'var(--basalt-900, #0a0d10)',
                                            color: '#fff',
                                            padding: '12px 14px',
                                            textAlign: 'left',
                                            cursor: 'pointer',
                                        }}
                                    >
                                        <strong style={{ display: 'block', marginBottom: 4 }}>Familia de club</strong>
                                        <span style={{ fontSize: 12, color: 'var(--basalt-400)' }}>Expande el acceso a todos los clubes de la familia operativa.</span>
                                    </button>
                                </div>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: 12, color: 'var(--basalt-400)', marginBottom: 8, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                        Nivel interno
                                    </label>
                                    <select
                                        value={clubMembershipRole}
                                        onChange={(e) => setClubMembershipRole(e.target.value as MembershipRow['role'])}
                                        style={{
                                            width: '100%',
                                            background: 'var(--basalt-900, #0a0d10)',
                                            border: '1px solid rgba(255,255,255,0.12)',
                                            borderRadius: 10,
                                            color: '#fff',
                                            padding: '10px 14px',
                                            fontSize: 14,
                                        }}
                                    >
                                        <option value="admin">Admin</option>
                                        <option value="editor">Editor</option>
                                        <option value="operator">Operador</option>
                                        <option value="viewer">Lectura</option>
                                    </select>
                                </div>

                                <div>
                                    <label style={{ display: 'block', fontSize: 12, color: 'var(--basalt-400)', marginBottom: 8, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                        {clubManagementType === 'club_family' ? 'Familia base' : 'Club'}
                                    </label>
                                    <select
                                        value={clubScopeId}
                                        onChange={(e) => setClubScopeId(e.target.value)}
                                        style={{
                                            width: '100%',
                                            background: 'var(--basalt-900, #0a0d10)',
                                            border: '1px solid rgba(255,255,255,0.12)',
                                            borderRadius: 10,
                                            color: '#fff',
                                            padding: '10px 14px',
                                            fontSize: 14,
                                        }}
                                    >
                                        <option value="">Seleccionar...</option>
                                        {clubCatalog.map((club) => (
                                            <option key={club.id} value={club.id}>
                                                {club.label}
                                            </option>
                                        ))}
                                    </select>
                                    <div style={{ fontSize: 12, color: 'var(--basalt-400)', marginTop: 6 }}>
                                        {loadingClubCatalog
                                            ? 'Cargando clubes...'
                                            : clubManagementType === 'club_family'
                                                ? 'Usá el club base de la familia. Internamente el acceso se expande al resto.'
                                                : 'Este usuario queda limitado al club seleccionado.'}
                                    </div>
                                </div>
                            </div>

                            {editingClubAssignments.length > 0 && (
                                <div style={{ padding: '12px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                                    <div style={{ fontSize: 12, color: 'var(--basalt-400)', marginBottom: 8, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                        Acceso actual
                                    </div>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                                        {editingClubAssignments.map((membership) => (
                                            <span
                                                key={membership.id}
                                                style={{
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    gap: 6,
                                                    padding: '6px 10px',
                                                    borderRadius: 999,
                                                    background: 'rgba(52,211,153,0.12)',
                                                    border: '1px solid rgba(52,211,153,0.22)',
                                                    fontSize: 12,
                                                }}
                                            >
                                                {membership.scope_type === 'club_family' ? 'Familia' : 'Club'}:
                                                {' '}
                                                {entityNames[`${membership.scope_type}:${membership.scope_id}`] || membership.scope_id}
                                                {' '}
                                                ·
                                                {' '}
                                                {LOCAL_ROLE_LABELS[membership.role]}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {clubScopeId && (
                                <div style={{ fontSize: 12, color: 'var(--basalt-400)' }}>
                                    Se va a guardar como <strong style={{ color: '#fff' }}>{clubManagementType === 'club_family' ? 'familia de club' : 'club'}</strong>
                                    {' '}sobre{' '}
                                    <strong style={{ color: '#fff' }}>{selectedClubLabel}</strong>.
                                </div>
                            )}
                        </div>
                    )}

                    {/* Error */}
                    {saveError && (
                        <div style={{ color: '#f87171', fontSize: 13, marginBottom: 16, padding: '8px 12px', background: 'rgba(239,68,68,0.1)', borderRadius: 8 }}>
                            {saveError}
                        </div>
                    )}

                    {/* Actions */}
                    <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                        <button className={styles.btn} type="button" onClick={closeEdit} disabled={saving}>
                            Cancelar
                        </button>
                        <button
                            className={`${styles.btn} ${styles.btnPrimary}`}
                            type="button"
                            onClick={() => void handleSaveRole()}
                            disabled={
                                saving ||
                                (
                                    editingRole === editingUser.role &&
                                    (
                                        (editingRole !== 'gestor_clubes' && editingRole !== 'admin_club') ||
                                        (editingClubAssignments.length === 1 && editingClubAssignments.some(
                                            (membership) =>
                                                membership.scope_type === clubManagementType &&
                                                membership.scope_id === clubScopeId &&
                                                membership.role === clubMembershipRole
                                        ))
                                    )
                                )
                            }
                        >
                            {saving ? 'Guardando...' : 'Guardar cambios'}
                        </button>
                    </div>
                </div>
            </div>
        )}
        </>
    );
}
