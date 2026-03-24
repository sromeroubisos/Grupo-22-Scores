'use client';

import { useEffect, useMemo, useState } from 'react';
import { Download, Filter, MoreVertical, Search, Shield, User as UserIcon } from 'lucide-react';
import styles from '../page.module.css';
import { createClient } from '@/lib/supabase/client';
import { getRoleLabel } from '@/lib/auth/roles';

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
    scope_type: 'union' | 'sport' | 'tournament' | 'match' | 'club';
    scope_id: string;
    role: 'admin' | 'editor' | 'operator' | 'viewer';
    created_at: string;
};

type RoleAssignment = {
    id: string;
    userId: string;
    userName: string;
    email: string;
    roleLabel: string;
    scopeLabel: string;
    assignedAt: string;
    accessLevel: string;
    status: 'active' | 'inactive';
};

const MANAGEMENT_PRESETS = [
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
};

const LOCAL_ROLE_LABELS: Record<MembershipRow['role'], string> = {
    admin: 'Admin',
    editor: 'Editor',
    operator: 'Operador',
    viewer: 'Lectura',
};

export default function PersonasRolesPage() {
    const supabase = createClient();

    const [searchQuery, setSearchQuery] = useState('');
    const [activeTab, setActiveTab] = useState<'all' | 'roles'>('all');
    const [users, setUsers] = useState<AppUserRow[]>([]);
    const [memberships, setMemberships] = useState<MembershipRow[]>([]);
    const [entityNames, setEntityNames] = useState<Record<string, string>>({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        fetchUsers();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const fetchUsers = async () => {
        setLoading(true);
        setError(null);

        const abortController = new AbortController();
        const timeoutId = setTimeout(() => abortController.abort(), 6000);

        try {
            const [
                usersResult,
                membershipsResult,
                sportsResult,
                unionsResult,
                tournamentsResult,
                clubsResult,
                matchesResult,
            ] = await Promise.all([
                supabase
                    .from('users')
                    .select('*')
                    .order('created_at', { ascending: false })
                    .abortSignal(abortController.signal),
                supabase
                    .from('memberships')
                    .select('id, user_id, scope_type, scope_id, role, created_at')
                    .order('created_at', { ascending: false })
                    .abortSignal(abortController.signal),
                supabase.from('sports').select('id, name').order('name').abortSignal(abortController.signal),
                supabase.from('unions').select('id, name').order('name').abortSignal(abortController.signal),
                supabase.from('tournaments').select('id, name').order('name').abortSignal(abortController.signal),
                supabase.from('clubs').select('id, name').order('name').abortSignal(abortController.signal),
                supabase
                    .from('matches')
                    .select('id, date_time, tournament_id')
                    .order('date_time', { ascending: false })
                    .limit(500)
                    .abortSignal(abortController.signal),
            ]);

            clearTimeout(timeoutId);

            if (usersResult.error) throw usersResult.error;
            if (membershipsResult.error) throw membershipsResult.error;
            if (sportsResult.error) throw sportsResult.error;
            if (unionsResult.error) throw unionsResult.error;
            if (tournamentsResult.error) throw tournamentsResult.error;
            if (clubsResult.error) throw clubsResult.error;
            if (matchesResult.error) throw matchesResult.error;

            const tournamentsById = new Map(
                (tournamentsResult.data || []).map((tournament) => [tournament.id, tournament.name])
            );

            const nextEntityNames: Record<string, string> = {};

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
            console.error('Error fetching personas/roles:', err);
            const message = err instanceof Error ? err.message : 'Error desconocido al cargar accesos';
            if (message.includes('abort')) {
                setError('La consulta tardó demasiado. Revisá RLS o la conectividad con Supabase.');
            } else {
                setError(message);
            }
        } finally {
            clearTimeout(timeoutId);
            setLoading(false);
        }
    };

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
            .filter((user) => ['super_admin', 'admin_general'].includes(user.role))
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

    return (
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
                <div style={{ display: 'flex', gap: 24 }}>
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
                <div className={styles.slabHeader} style={{ justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div className={styles.filterInput} style={{ display: 'flex', alignItems: 'center', padding: '8px 12px', width: 320 }}>
                            <Search size={16} style={{ color: '#666', marginRight: 8 }} />
                            <input
                                style={{ background: 'transparent', border: 'none', color: 'white', outline: 'none', width: '100%' }}
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
                                                            style={{ padding: 8, opacity: 0.65 }}
                                                            type="button"
                                                            disabled
                                                            title="Vista de lectura. La edición programática está disponible en /api/admin/users/:id/access"
                                                        >
                                                            <MoreVertical size={16} />
                                                        </button>
                                                    </td>
                                                </tr>
                                            );
                                        })
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </section>
                )}

                {!loading && !error && activeTab === 'roles' && (
                    <section className={styles.section}>
                        <div className={styles.sectionHeaderRow} style={{ marginBottom: 16 }}>
                            <h2 className={styles.sectionTitle}>Asignaciones por Alcance ({filteredAssignments.length})</h2>
                        </div>
                        <div className={styles.card}>
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
                                                <td>{new Date(assignment.assignedAt).toLocaleDateString()}</td>
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
                    </section>
                )}
            </div>
        </div>
    );
}
