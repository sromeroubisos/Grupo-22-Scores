'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Pencil, Search, User as UserIcon, UserPlus, X } from 'lucide-react';
import styles from '../page.module.css';
import { getRoleLabel, normalizeRole, ROLE_LABELS, type AppUserRole } from '@/lib/auth/roles';
import { getReservedAdminRole } from '@/lib/types/user';

type AppUserRow = {
    id: string;
    name: string | null;
    email: string;
    role: string;
    created_at?: string | null;
    last_login_at?: string | null;
    avatar_url?: string | null;
};

type PersonasRolesResponse = {
    data?: {
        users?: AppUserRow[];
        total?: number;
        page?: number;
        pageSize?: number;
    };
    error?: string;
    details?: unknown;
};

type ClubAssignmentClub = {
    id: string;
    name: string;
    short_name?: string | null;
    region?: string | null;
    country?: string | null;
    sport?: string | null;
    sport_id?: string | null;
};

type ClubFamilyRelationRow = {
    base_club_id: string;
    derived_club_id: string;
    derivative_type?: string | null;
};

type ClubAssignmentOption = {
    id: string;
    label: string;
    meta: string;
};

type TournamentRow = {
    id: string;
    name: string;
    display_name?: string | null;
    season_id?: string | null;
    sport_id?: string | null;
    status?: string | null;
};

type AccessMembershipRow = {
    scope_type: string;
    scope_id: string | null;
    role: string;
};

type UserAccessResponse = {
    data?: {
        memberships?: AccessMembershipRow[];
    };
    error?: string;
    details?: unknown;
};

function formatShortDate(value?: string | null) {
    return value ? new Date(value).toLocaleDateString() : '-';
}

function getDisplayInitials(value?: string | null) {
    return (value || '?').substring(0, 2).toUpperCase();
}

function getClubOptionMeta(club: ClubAssignmentClub) {
    return [
        club.short_name,
        club.sport || club.sport_id,
        club.region || club.country,
    ]
        .filter(Boolean)
        .join(' - ');
}

const ROLE_PRESETS = [
    {
        id: 'super_admin',
        title: 'Super Admin',
        desc: 'Acceso total al panel y a la configuracion global.',
        accent: 'var(--color-accent)',
    },
    {
        id: 'admin_general',
        title: 'Admin General',
        desc: 'Acceso global al panel operativo sin depender de memberships puntuales.',
        accent: '#60a5fa',
    },
    {
        id: 'admin_torneo',
        title: 'Administrador de Torneos',
        desc: 'Panel limitado para crear/vincular clubes y crear/gestionar torneos.',
        accent: '#a855f7',
    },
    {
        id: 'admin_club',
        title: 'Administrador de Club',
        desc: 'Gestiona un club y puede operar el panel de club con alcance asignado.',
        accent: '#22c55e',
    },
    {
        id: 'familia_club',
        title: 'Familia de Club',
        desc: 'Opera una familia de clubes y comparte gestion sobre estructuras vinculadas.',
        accent: '#f59e0b',
    },
    {
        id: 'fan',
        title: 'Fan',
        desc: 'Experiencia publica, perfil y favoritos sin permisos administrativos.',
        accent: '#38bdf8',
    },
] satisfies Array<{
    id: AppUserRole;
    title: string;
    desc: string;
    accent: string;
}>;

/** Usuarios por página. La búsqueda y el corte los hace el servidor. */
const USERS_PAGE_SIZE = 50;
const SEARCH_DEBOUNCE_MS = 300;

export default function PersonasRolesPage() {
    const [searchQuery, setSearchQuery] = useState('');
    /** Lo que se manda al servidor: la búsqueda, con un respiro tras la última tecla. */
    const [debouncedQuery, setDebouncedQuery] = useState('');
    const [page, setPage] = useState(1);
    const [total, setTotal] = useState(0);
    const [users, setUsers] = useState<AppUserRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [editingUser, setEditingUser] = useState<AppUserRow | null>(null);
    const [editingRole, setEditingRole] = useState<string>('fan');
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);
    const [clubsForAssignment, setClubsForAssignment] = useState<ClubAssignmentClub[]>([]);
    const [clubFamilyRelations, setClubFamilyRelations] = useState<ClubFamilyRelationRow[]>([]);
    const [assignmentLoading, setAssignmentLoading] = useState(true);
    const [assignmentError, setAssignmentError] = useState<string | null>(null);
    const [scopeLoading, setScopeLoading] = useState(false);
    const [scopeLoadError, setScopeLoadError] = useState<string | null>(null);
    const [selectedScopeId, setSelectedScopeId] = useState('');
    const [initialScopeId, setInitialScopeId] = useState('');

    // Tournament-admin scope state (multi-select).
    const [tournamentsForAssignment, setTournamentsForAssignment] = useState<TournamentRow[]>([]);
    const [tournamentSearch, setTournamentSearch] = useState('');
    const [clubSearchTorneo, setClubSearchTorneo] = useState('');
    const [selectedTournamentIds, setSelectedTournamentIds] = useState<string[]>([]);
    const [selectedClubIdsTorneo, setSelectedClubIdsTorneo] = useState<string[]>([]);
    const [initialTournamentIds, setInitialTournamentIds] = useState<string[]>([]);
    const [initialClubIdsTorneo, setInitialClubIdsTorneo] = useState<string[]>([]);

    // La búsqueda viaja al servidor con un respiro, y vuelve a la página 1.
    useEffect(() => {
        const handle = window.setTimeout(() => {
            setDebouncedQuery(searchQuery.trim());
            setPage(1);
        }, SEARCH_DEBOUNCE_MS);
        return () => window.clearTimeout(handle);
    }, [searchQuery]);

    const fetchUsers = useCallback(async () => {
        try {
            setLoading(true);
            setError(null);

            const params = new URLSearchParams({ page: String(page), pageSize: String(USERS_PAGE_SIZE) });
            if (debouncedQuery) params.set('q', debouncedQuery);

            const response = await fetch(`/api/admin/super/personas-roles?${params.toString()}`, {
                cache: 'no-store',
                credentials: 'include',
            });
            const payload = await response.json() as PersonasRolesResponse;

            if (!response.ok) {
                throw new Error(payload.error || 'No se pudieron cargar los usuarios.');
            }

            const rows = (payload.data?.users ?? []).map((user) => ({
                ...user,
                role: normalizeRole(user.role),
            }));
            setUsers(rows);
            setTotal(typeof payload.data?.total === 'number' ? payload.data.total : rows.length);
        } catch (fetchError) {
            setError(fetchError instanceof Error ? fetchError.message : 'No se pudieron cargar los usuarios.');
        } finally {
            setLoading(false);
        }
    }, [debouncedQuery, page]);

    useEffect(() => {
        void fetchUsers();
    }, [fetchUsers]);

    const fetchAssignmentOptions = useCallback(async () => {
        setAssignmentLoading(true);
        setAssignmentError(null);

        try {
            const [clubsResponse, familiesResponse, tournamentsResponse] = await Promise.all([
                fetch('/api/admin/clubs?limit=1000', {
                    cache: 'no-store',
                    credentials: 'include',
                }),
                fetch('/api/admin/super/club-families', {
                    cache: 'no-store',
                    credentials: 'include',
                }),
                fetch('/api/admin/torneo/tournaments?limit=all&fields=basic', {
                    cache: 'no-store',
                    credentials: 'include',
                }),
            ]);

            const clubsPayload = await clubsResponse.json().catch(() => null) as ClubAssignmentClub[] | { error?: string } | null;
            const familiesPayload = await familiesResponse.json().catch(() => ({})) as {
                data?: ClubFamilyRelationRow[];
                error?: string;
                details?: string | null;
            };
            const tournamentsPayload = await tournamentsResponse.json().catch(() => ({})) as {
                data?: TournamentRow[];
                error?: string;
            };

            if (!clubsResponse.ok || !Array.isArray(clubsPayload)) {
                throw new Error(!Array.isArray(clubsPayload) ? clubsPayload?.error || 'No se pudieron cargar los clubes.' : 'No se pudieron cargar los clubes.');
            }

            if (!familiesResponse.ok) {
                throw new Error(familiesPayload.error || familiesPayload.details || 'No se pudieron cargar las familias de clubes.');
            }

            setClubsForAssignment(clubsPayload.filter((club) => club.id && club.name));
            setClubFamilyRelations(Array.isArray(familiesPayload.data) ? familiesPayload.data : []);
            setTournamentsForAssignment(
                tournamentsResponse.ok && Array.isArray(tournamentsPayload.data)
                    ? tournamentsPayload.data.filter((t) => t.id && t.name)
                    : []
            );
        } catch (optionsError) {
            setAssignmentError(optionsError instanceof Error ? optionsError.message : 'No se pudieron cargar las opciones de vinculacion.');
            setClubsForAssignment([]);
            setClubFamilyRelations([]);
            setTournamentsForAssignment([]);
        } finally {
            setAssignmentLoading(false);
        }
    }, []);

    useEffect(() => {
        void fetchAssignmentOptions();
    }, [fetchAssignmentOptions]);

    // El servidor ya filtró y cortó: la página muestra lo que llegó.
    const filteredUsers = users;
    const pageCount = Math.max(1, Math.ceil(total / USERS_PAGE_SIZE));
    const rangeStart = total === 0 ? 0 : (page - 1) * USERS_PAGE_SIZE + 1;
    const rangeEnd = Math.min(page * USERS_PAGE_SIZE, total);

    // Si una búsqueda achica el total y la página quedó fuera de rango, vuelve a la última.
    useEffect(() => {
        if (!loading && page > pageCount) setPage(pageCount);
    }, [loading, page, pageCount]);

    useEffect(() => {
        if (!editingUser) {
            return;
        }

        let isActive = true;

        const loadCurrentAccess = async () => {
            setScopeLoading(true);
            setScopeLoadError(null);
            setSelectedScopeId('');
            setInitialScopeId('');

            try {
                const response = await fetch(`/api/admin/users/${editingUser.id}/access`, {
                    cache: 'no-store',
                    credentials: 'include',
                });
                const payload = await response.json().catch(() => ({})) as UserAccessResponse;

                if (!response.ok) {
                    throw new Error(payload.error || 'No se pudo cargar el alcance actual del usuario.');
                }

                const normalizedRole = normalizeRole(editingUser.role);
                const expectedScopeType = normalizedRole === 'familia_club'
                    ? 'club_family'
                    : normalizedRole === 'admin_club'
                        ? 'club'
                        : null;
                const selectedMembership = expectedScopeType
                    ? (payload.data?.memberships ?? []).find((membership) =>
                        membership.scope_type === expectedScopeType && Boolean(membership.scope_id)
                    )
                    : null;
                const scopeId = selectedMembership?.scope_id || '';

                const tournamentMembershipIds = (payload.data?.memberships ?? [])
                    .filter((m) => m.scope_type === 'tournament' && Boolean(m.scope_id))
                    .map((m) => String(m.scope_id));
                const clubTorneoMembershipIds = (payload.data?.memberships ?? [])
                    .filter((m) => m.scope_type === 'club' && Boolean(m.scope_id))
                    .map((m) => String(m.scope_id));

                if (isActive) {
                    setSelectedScopeId(scopeId);
                    setInitialScopeId(scopeId);
                    setSelectedTournamentIds(tournamentMembershipIds);
                    setInitialTournamentIds(tournamentMembershipIds);
                    setSelectedClubIdsTorneo(clubTorneoMembershipIds);
                    setInitialClubIdsTorneo(clubTorneoMembershipIds);
                }
            } catch (accessError) {
                if (isActive) {
                    setScopeLoadError(accessError instanceof Error ? accessError.message : 'No se pudo cargar el alcance actual del usuario.');
                }
            } finally {
                if (isActive) {
                    setScopeLoading(false);
                }
            }
        };

        void loadCurrentAccess();

        return () => {
            isActive = false;
        };
    }, [editingUser]);

    const roleOptions: AppUserRole[] = ['fan', 'familia_club', 'admin_club', 'admin_torneo', 'admin_general', 'super_admin'];

    const clubScopeOptions = useMemo<ClubAssignmentOption[]>(() => {
        return clubsForAssignment
            .map((club) => ({
                id: club.id,
                label: club.name,
                meta: getClubOptionMeta(club),
            }))
            .sort((left, right) => left.label.localeCompare(right.label));
    }, [clubsForAssignment]);

    const clubById = useMemo(
        () => new Map(clubsForAssignment.map((club) => [club.id, club])),
        [clubsForAssignment],
    );

    const familyScopeOptions = useMemo<ClubAssignmentOption[]>(() => {
        const familyMembersByRoot = new Map<string, Set<string>>();

        for (const relation of clubFamilyRelations) {
            if (!relation.base_club_id || !relation.derived_club_id) continue;
            if (relation.derivative_type && relation.derivative_type !== 'family') continue;

            const members = familyMembersByRoot.get(relation.base_club_id) ?? new Set<string>([relation.base_club_id]);
            members.add(relation.derived_club_id);
            familyMembersByRoot.set(relation.base_club_id, members);
        }

        return Array.from(familyMembersByRoot.entries())
            .map(([rootId, members]) => {
                const rootClub = clubById.get(rootId);
                const rootMeta = rootClub ? getClubOptionMeta(rootClub) : '';
                const clubCountLabel = `${members.size} clubes`;

                return {
                    id: rootId,
                    label: rootClub?.name || rootId,
                    meta: [clubCountLabel, rootMeta].filter(Boolean).join(' - '),
                };
            })
            .sort((left, right) => left.label.localeCompare(right.label));
    }, [clubById, clubFamilyRelations]);

    const currentScopeType = editingRole === 'familia_club'
        ? 'club_family'
        : editingRole === 'admin_club'
            ? 'club'
            : null;
    const requiresScopeSelection = currentScopeType !== null;
    const isTournamentAdminRole = editingRole === 'admin_torneo';

    const filteredTournaments = useMemo(() => {
        const q = tournamentSearch.trim().toLowerCase();
        if (!q) return tournamentsForAssignment;
        return tournamentsForAssignment.filter((t) =>
            (t.display_name || t.name).toLowerCase().includes(q) ||
            (t.season_id || '').toLowerCase().includes(q),
        );
    }, [tournamentSearch, tournamentsForAssignment]);

    const filteredClubsTorneo = useMemo(() => {
        const q = clubSearchTorneo.trim().toLowerCase();
        if (!q) return clubsForAssignment;
        return clubsForAssignment.filter((c) =>
            c.name.toLowerCase().includes(q) ||
            (c.short_name || '').toLowerCase().includes(q) ||
            (c.region || c.country || '').toLowerCase().includes(q),
        );
    }, [clubSearchTorneo, clubsForAssignment]);

    const tournamentScopeChanged = (() => {
        if (selectedTournamentIds.length !== initialTournamentIds.length) return true;
        const set = new Set(initialTournamentIds);
        return selectedTournamentIds.some((id) => !set.has(id));
    })();
    const clubTorneoScopeChanged = (() => {
        if (selectedClubIdsTorneo.length !== initialClubIdsTorneo.length) return true;
        const set = new Set(initialClubIdsTorneo);
        return selectedClubIdsTorneo.some((id) => !set.has(id));
    })();
    const currentScopeOptions = useMemo(
        () => editingRole === 'familia_club'
            ? familyScopeOptions
            : editingRole === 'admin_club'
                ? clubScopeOptions
                : [],
        [clubScopeOptions, editingRole, familyScopeOptions],
    );
    const selectedScopeIsValid = !requiresScopeSelection || currentScopeOptions.some((option) => option.id === selectedScopeId);
    const selectedScopeChanged = selectedScopeId !== initialScopeId;
    const selectedScopeLabel = editingRole === 'familia_club' ? 'familia de club' : 'club';
    const roleChanged = editingUser ? normalizeRole(editingUser.role) !== editingRole : false;
    const saveDisabled = (() => {
        if (saving) return true;
        if (isTournamentAdminRole) {
            if (scopeLoading || assignmentLoading) return true;
            return !roleChanged && !tournamentScopeChanged && !clubTorneoScopeChanged;
        }
        if (requiresScopeSelection) {
            if (scopeLoading || assignmentLoading || !selectedScopeId || !selectedScopeIsValid) return true;
        }
        return !roleChanged && (!requiresScopeSelection || !selectedScopeChanged);
    })();

    const openEdit = (user: AppUserRow) => {
        setEditingUser(user);
        setEditingRole(normalizeRole(user.role));
        setSelectedScopeId('');
        setInitialScopeId('');
        setScopeLoadError(null);
        setSaveError(null);
    };

    const closeEdit = useCallback(() => {
        setEditingUser(null);
        setSaveError(null);
        setScopeLoadError(null);
        setSelectedScopeId('');
        setInitialScopeId('');
        setSelectedTournamentIds([]);
        setInitialTournamentIds([]);
        setSelectedClubIdsTorneo([]);
        setInitialClubIdsTorneo([]);
        setTournamentSearch('');
        setClubSearchTorneo('');
    }, []);

    const handleRoleSelect = (role: AppUserRole) => {
        setEditingRole((currentRole) => {
            if (currentRole !== role) {
                setSelectedScopeId('');
                setSaveError(null);
            }

            return role;
        });
    };

    const toggleTournamentScope = (id: string) => {
        setSelectedTournamentIds((curr) =>
            curr.includes(id) ? curr.filter((x) => x !== id) : [...curr, id]
        );
        setSaveError(null);
    };

    const toggleClubScopeTorneo = (id: string) => {
        setSelectedClubIdsTorneo((curr) =>
            curr.includes(id) ? curr.filter((x) => x !== id) : [...curr, id]
        );
        setSaveError(null);
    };

    const handleSaveRole = useCallback(async () => {
        if (!editingUser) {
            return;
        }

        setSaving(true);
        setSaveError(null);

        try {
            const reservedRole = getReservedAdminRole(editingUser.email);
            if (reservedRole && editingRole !== reservedRole) {
                setSaveError(`Esta cuenta esta reservada como ${getRoleLabel(reservedRole)} y no puede recibir otro rol.`);
                return;
            }

            if (requiresScopeSelection) {
                if (!selectedScopeId) {
                    setSaveError(`Selecciona ${selectedScopeLabel === 'club' ? 'un club' : 'una familia de club'} para completar la vinculacion.`);
                    return;
                }

                if (!selectedScopeIsValid || !currentScopeType) {
                    setSaveError('Selecciona una opcion valida de la lista.');
                    return;
                }
            }

            if (isTournamentAdminRole) {
                // 1) Update role
                const roleResp = await fetch(`/api/admin/super/personas-roles/${editingUser.id}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({ role: editingRole }),
                });
                const rolePayload = await roleResp.json() as { error?: string };
                if (!roleResp.ok) throw new Error(rolePayload.error || 'No se pudo guardar el rol.');

                // 2) Replace tournament memberships (PUT replaces all of that scope_type for the user)
                const tResp = await fetch(`/api/admin/users/${editingUser.id}/access`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({
                        role: editingRole,
                        scopeType: 'tournament',
                        membershipRole: 'admin',
                        scopeIds: selectedTournamentIds,
                    }),
                });
                if (!tResp.ok) {
                    const p = await tResp.json().catch(() => ({})) as { error?: string };
                    throw new Error(p.error || 'No se pudieron guardar los torneos asignados.');
                }

                // 3) Replace club memberships
                const cResp = await fetch(`/api/admin/users/${editingUser.id}/access`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({
                        role: editingRole,
                        scopeType: 'club',
                        membershipRole: 'admin',
                        scopeIds: selectedClubIdsTorneo,
                    }),
                });
                if (!cResp.ok) {
                    const p = await cResp.json().catch(() => ({})) as { error?: string };
                    throw new Error(p.error || 'No se pudieron guardar los clubes asignados.');
                }

                setUsers((current) =>
                    current.map((user) =>
                        user.id === editingUser.id ? { ...user, role: editingRole } : user
                    )
                );
                closeEdit();
                return;
            }

            const response = requiresScopeSelection
                ? await fetch(`/api/admin/users/${editingUser.id}/access`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({
                        role: editingRole,
                        scopeType: currentScopeType,
                        membershipRole: 'admin',
                        scopeIds: [selectedScopeId],
                    }),
                })
                : await fetch(`/api/admin/super/personas-roles/${editingUser.id}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({ role: editingRole }),
                });
            const payload = await response.json() as { error?: string };

            if (!response.ok) {
                throw new Error(payload.error || 'No se pudo guardar el rol.');
            }

            setUsers((current) =>
                current.map((user) =>
                    user.id === editingUser.id ? { ...user, role: editingRole } : user
                )
            );
            closeEdit();
        } catch (saveRoleError) {
            setSaveError(saveRoleError instanceof Error ? saveRoleError.message : 'No se pudo guardar el rol.');
        } finally {
            setSaving(false);
        }
    }, [
        closeEdit,
        currentScopeType,
        editingRole,
        editingUser,
        isTournamentAdminRole,
        requiresScopeSelection,
        selectedClubIdsTorneo,
        selectedScopeId,
        selectedScopeIsValid,
        selectedScopeLabel,
        selectedTournamentIds,
    ]);

    return (
        <>
            <div style={{ paddingBottom: 40 }}>
                <header className={styles.tectonicHeader}>
                    <div className={styles.headerInfo}>
                        <p>Gestion de Accesos</p>
                        <h1>Personas y Roles</h1>
                    </div>
                    <div className={styles.statusSync} style={{ display: 'flex', gap: 10 }}>
                        <Link className={`${styles.btn} ${styles.btnPrimary}`} href="/admin/super/personas-roles/crear">
                            <UserPlus size={16} /> Crear trabajador
                        </Link>
                        <button className={styles.btn} type="button" onClick={() => void fetchUsers()}>
                            <UserIcon size={16} /> Recargar
                        </button>
                    </div>
                </header>

                <section
                    className={styles.slab}
                    style={{
                        marginBottom: 24,
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                        gap: 16,
                    }}
                >
                    {ROLE_PRESETS.map((preset) => (
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

                <div className={styles.slab} style={{ marginBottom: 24 }}>
                    <div className={`${styles.slabHeader} ${styles.personasToolbar}`}>
                        <div className={styles.personasToolbarLead}>
                            <div className={`${styles.filterInput} ${styles.personasSearch}`}>
                                <Search size={16} className={styles.personasSearchIcon} />
                                <input
                                    className={styles.personasSearchInput}
                                    placeholder="Buscar por nombre, email o rol (en toda la base)"
                                    value={searchQuery}
                                    onChange={(event) => setSearchQuery(event.target.value)}
                                />
                            </div>
                        </div>
                    </div>
                </div>

                <div className={styles.content}>
                    {loading && <div style={{ padding: 20, textAlign: 'center', color: '#888' }}>Cargando usuarios...</div>}

                    {error && (
                        <div style={{ padding: 20, color: '#f87171', background: 'rgba(239, 68, 68, 0.1)', borderRadius: 8, marginBottom: 20 }}>
                            Error al cargar usuarios: {error}
                        </div>
                    )}

                    {!loading && !error && (
                        <section className={styles.section}>
                            <div className={styles.sectionHeaderRow} style={{ marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
                                <h2 className={styles.sectionTitle}>Directorio de Usuarios ({total.toLocaleString('es-AR')})</h2>
                                <nav aria-label="Páginas del directorio" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--basalt-400)' }}>
                                        {total === 0 ? 'Sin resultados' : `${rangeStart}–${rangeEnd} de ${total.toLocaleString('es-AR')}`}
                                    </span>
                                    <button
                                        type="button"
                                        className={styles.btn}
                                        onClick={() => setPage((current) => Math.max(1, current - 1))}
                                        disabled={page <= 1 || loading}
                                        style={page <= 1 || loading ? { opacity: 0.45, cursor: 'not-allowed' } : undefined}
                                    >
                                        ‹ Anterior
                                    </button>
                                    <span style={{ fontSize: 13, color: 'var(--basalt-400)', whiteSpace: 'nowrap' }} aria-live="polite">
                                        Página {page} de {pageCount}
                                    </span>
                                    <button
                                        type="button"
                                        className={styles.btn}
                                        onClick={() => setPage((current) => Math.min(pageCount, current + 1))}
                                        disabled={page >= pageCount || loading}
                                        style={page >= pageCount || loading ? { opacity: 0.45, cursor: 'not-allowed' } : undefined}
                                    >
                                        Siguiente ›
                                    </button>
                                </nav>
                            </div>
                            <div className={styles.card}>
                                <div className={styles.personasDesktopTable}>
                                    <table className={styles.table}>
                                        <thead>
                                            <tr>
                                                <th>Usuario</th>
                                                <th>Email</th>
                                                <th>Rol</th>
                                                <th>Fecha Registro</th>
                                                <th>Ultimo Acceso</th>
                                                <th style={{ textAlign: 'right' }}>Acciones</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {filteredUsers.length === 0 ? (
                                                <tr>
                                                    <td colSpan={6} style={{ textAlign: 'center', padding: 40, color: '#666' }}>
                                                        No se encontraron usuarios
                                                    </td>
                                                </tr>
                                            ) : (
                                                filteredUsers.map((user) => {
                                                    const normalizedRole = normalizeRole(user.role);
                                                    const isSuperAdmin = normalizedRole === 'super_admin';

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
                                                                        getDisplayInitials(user.name || user.email)
                                                                    )}
                                                                </div>
                                                                <span style={{ fontWeight: 600 }}>{user.name || user.email || 'Sin nombre'}</span>
                                                            </td>
                                                            <td style={{ color: 'var(--basalt-400)' }}>{user.email}</td>
                                                            <td>
                                                                <span
                                                                    className={styles.badge}
                                                                    style={{
                                                                        background: isSuperAdmin ? 'var(--color-accent)' : 'var(--basalt-800)',
                                                                        color: isSuperAdmin ? '#000' : '#fff',
                                                                    }}
                                                                >
                                                                    {getRoleLabel(normalizedRole)}
                                                                </span>
                                                            </td>
                                                            <td>{formatShortDate(user.created_at)}</td>
                                                            <td>{formatShortDate(user.last_login_at)}</td>
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
                                            const normalizedRole = normalizeRole(user.role);
                                            const isSuperAdmin = normalizedRole === 'super_admin';

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
                                                                background: isSuperAdmin ? 'var(--color-accent)' : 'var(--basalt-800)',
                                                                color: isSuperAdmin ? '#000' : '#fff',
                                                            }}
                                                        >
                                                            {getRoleLabel(normalizedRole)}
                                                        </span>
                                                    </div>

                                                    <div className={styles.personasMetaGrid}>
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
                                                            <Pencil size={14} /> Editar rol
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
                </div>
            </div>

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
                        overflowY: 'auto',
                    }}
                    onClick={(event) => { if (event.target === event.currentTarget) closeEdit(); }}
                >
                    <div style={{
                        background: 'var(--color-bg-secondary, #0d1117)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: 18,
                        padding: 28,
                        width: '100%',
                        maxWidth: 440,
                        maxHeight: 'calc(100dvh - 32px)',
                        display: 'flex',
                        flexDirection: 'column',
                        margin: 'auto',
                        boxShadow: '0 24px 48px rgba(0,0,0,0.6)',
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, flexShrink: 0 }}>
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
                                        : getDisplayInitials(editingUser.name || editingUser.email)
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

                        <div style={{ marginBottom: 24, flex: 1, minHeight: 0, overflowY: 'auto' }}>
                            <label style={{ display: 'block', fontSize: 12, color: 'var(--basalt-400)', marginBottom: 8, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                Rol base
                            </label>
                            <div style={{ display: 'grid', gap: 10 }}>
                                {roleOptions.map((role) => {
                                    const selected = editingRole === role;
                                    const reservedRole = getReservedAdminRole(editingUser.email);
                                    const disabled = reservedRole ? role !== reservedRole : false;

                                    return (
                                        <button
                                            key={role}
                                            type="button"
                                            disabled={disabled}
                                            onClick={() => handleRoleSelect(role)}
                                            style={{
                                                width: '100%',
                                                textAlign: 'left',
                                                background: selected ? 'rgba(16, 185, 129, 0.16)' : 'var(--basalt-900, #0a0d10)',
                                                border: selected ? '1px solid rgba(16, 185, 129, 0.8)' : '1px solid rgba(255,255,255,0.12)',
                                                borderRadius: 10,
                                                color: disabled ? 'rgba(255,255,255,0.45)' : '#fff',
                                                padding: '12px 14px',
                                                fontSize: 14,
                                                cursor: disabled ? 'not-allowed' : 'pointer',
                                                outline: 'none',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'space-between',
                                                gap: 12,
                                            }}
                                        >
                                            <span>{ROLE_LABELS[role]}</span>
                                            <span
                                                style={{
                                                    width: 18,
                                                    height: 18,
                                                    borderRadius: '50%',
                                                    border: selected ? '5px solid #10b981' : '1px solid rgba(255,255,255,0.24)',
                                                    background: selected ? '#0b0f13' : 'transparent',
                                                    flexShrink: 0,
                                                }}
                                            />
                                        </button>
                                    );
                                })}
                            </div>
                            {requiresScopeSelection && (
                                <div style={{ display: 'grid', gap: 8, marginTop: 16 }}>
                                    <label
                                        htmlFor="personas-roles-scope"
                                        style={{ display: 'block', fontSize: 12, color: 'var(--basalt-400)', fontWeight: 600 }}
                                    >
                                        {editingRole === 'familia_club' ? 'Familia asignada' : 'Club asignado'}
                                    </label>
                                    <select
                                        id="personas-roles-scope"
                                        value={selectedScopeId}
                                        onChange={(event) => {
                                            setSelectedScopeId(event.target.value);
                                            setSaveError(null);
                                        }}
                                        disabled={assignmentLoading || currentScopeOptions.length === 0}
                                        style={{
                                            width: '100%',
                                            minHeight: 42,
                                            background: 'var(--basalt-900, #0a0d10)',
                                            border: `1px solid ${selectedScopeId ? 'rgba(16, 185, 129, 0.65)' : 'rgba(255,255,255,0.12)'}`,
                                            borderRadius: 10,
                                            color: '#fff',
                                            padding: '0 12px',
                                            fontSize: 14,
                                            outline: 'none',
                                        }}
                                    >
                                        <option value="">
                                            {assignmentLoading
                                                ? 'Cargando opciones...'
                                                : currentScopeOptions.length === 0
                                                    ? `No hay ${editingRole === 'familia_club' ? 'familias configuradas' : 'clubes disponibles'}`
                                                    : `Seleccionar ${selectedScopeLabel}`}
                                        </option>
                                        {currentScopeOptions.map((option) => (
                                            <option key={option.id} value={option.id}>
                                                {option.meta ? `${option.label} - ${option.meta}` : option.label}
                                            </option>
                                        ))}
                                    </select>
                                    {scopeLoading && (
                                        <div style={{ fontSize: 12, color: 'var(--basalt-400)' }}>
                                            Cargando vinculacion actual...
                                        </div>
                                    )}
                                    {assignmentError && (
                                        <div style={{ fontSize: 12, color: '#fca5a5' }}>
                                            {assignmentError}
                                        </div>
                                    )}
                                    {scopeLoadError && (
                                        <div style={{ fontSize: 12, color: '#fbbf24' }}>
                                            {scopeLoadError}
                                        </div>
                                    )}
                                </div>
                            )}
                            {isTournamentAdminRole && (
                                <div style={{ display: 'grid', gap: 16, marginTop: 18 }}>
                                    <div style={{ fontSize: 12, color: 'var(--basalt-400)', lineHeight: 1.5 }}>
                                        Elegí los torneos y clubes a los que este administrador podrá acceder.
                                        Los torneos y clubes que cree desde su panel se le agregan automáticamente.
                                    </div>

                                    {/* Tournaments multi-select */}
                                    <div style={{ display: 'grid', gap: 8 }}>
                                        <label style={{ fontSize: 12, color: 'var(--basalt-400)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                            Torneos asignados ({selectedTournamentIds.length})
                                        </label>
                                        <input
                                            type="text"
                                            placeholder="Buscar torneos…"
                                            value={tournamentSearch}
                                            onChange={(e) => setTournamentSearch(e.target.value)}
                                            style={{
                                                width: '100%', padding: '8px 12px', borderRadius: 8,
                                                background: 'var(--basalt-900, #0a0d10)',
                                                border: '1px solid rgba(255,255,255,0.12)', color: '#fff', fontSize: 13,
                                            }}
                                        />
                                        <div style={{
                                            maxHeight: 180, overflowY: 'auto', display: 'grid', gap: 4,
                                            border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: 8,
                                            background: 'rgba(255,255,255,0.02)',
                                        }}>
                                            {assignmentLoading ? (
                                                <div style={{ padding: 12, color: 'var(--basalt-400)', fontSize: 12 }}>Cargando…</div>
                                            ) : filteredTournaments.length === 0 ? (
                                                <div style={{ padding: 12, color: 'var(--basalt-400)', fontSize: 12 }}>Sin torneos.</div>
                                            ) : filteredTournaments.map((t) => {
                                                const checked = selectedTournamentIds.includes(t.id);
                                                return (
                                                    <label key={t.id} style={{
                                                        display: 'flex', alignItems: 'center', gap: 10, padding: '6px 8px',
                                                        cursor: 'pointer', borderRadius: 6,
                                                        background: checked ? 'rgba(168, 85, 247, 0.12)' : 'transparent',
                                                    }}>
                                                        <input
                                                            type="checkbox"
                                                            checked={checked}
                                                            onChange={() => toggleTournamentScope(t.id)}
                                                            style={{ accentColor: '#a855f7' }}
                                                        />
                                                        <span style={{ fontSize: 13, color: '#fff' }}>
                                                            {t.display_name || t.name}
                                                        </span>
                                                        <span style={{ fontSize: 11, color: 'var(--basalt-400)', marginLeft: 'auto' }}>
                                                            {t.season_id || ''} · {t.sport_id || '—'}
                                                        </span>
                                                    </label>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    {/* Clubs multi-select */}
                                    <div style={{ display: 'grid', gap: 8 }}>
                                        <label style={{ fontSize: 12, color: 'var(--basalt-400)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                            Clubes asignados ({selectedClubIdsTorneo.length})
                                        </label>
                                        <input
                                            type="text"
                                            placeholder="Buscar clubes…"
                                            value={clubSearchTorneo}
                                            onChange={(e) => setClubSearchTorneo(e.target.value)}
                                            style={{
                                                width: '100%', padding: '8px 12px', borderRadius: 8,
                                                background: 'var(--basalt-900, #0a0d10)',
                                                border: '1px solid rgba(255,255,255,0.12)', color: '#fff', fontSize: 13,
                                            }}
                                        />
                                        <div style={{
                                            maxHeight: 180, overflowY: 'auto', display: 'grid', gap: 4,
                                            border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: 8,
                                            background: 'rgba(255,255,255,0.02)',
                                        }}>
                                            {assignmentLoading ? (
                                                <div style={{ padding: 12, color: 'var(--basalt-400)', fontSize: 12 }}>Cargando…</div>
                                            ) : filteredClubsTorneo.length === 0 ? (
                                                <div style={{ padding: 12, color: 'var(--basalt-400)', fontSize: 12 }}>Sin clubes.</div>
                                            ) : filteredClubsTorneo.slice(0, 100).map((c) => {
                                                const checked = selectedClubIdsTorneo.includes(c.id);
                                                return (
                                                    <label key={c.id} style={{
                                                        display: 'flex', alignItems: 'center', gap: 10, padding: '6px 8px',
                                                        cursor: 'pointer', borderRadius: 6,
                                                        background: checked ? 'rgba(168, 85, 247, 0.12)' : 'transparent',
                                                    }}>
                                                        <input
                                                            type="checkbox"
                                                            checked={checked}
                                                            onChange={() => toggleClubScopeTorneo(c.id)}
                                                            style={{ accentColor: '#a855f7' }}
                                                        />
                                                        <span style={{ fontSize: 13, color: '#fff' }}>{c.name}</span>
                                                        <span style={{ fontSize: 11, color: 'var(--basalt-400)', marginLeft: 'auto' }}>
                                                            {c.region || c.country || ''}
                                                        </span>
                                                    </label>
                                                );
                                            })}
                                        </div>
                                        {/* El aviso va tambien con el buscador escrito: un termino corto
                                            sobre 2038 clubes sigue pasando de 100 y el corte quedaba mudo. */}
                                        {filteredClubsTorneo.length > 100 && (
                                            <div style={{ fontSize: 11, color: 'var(--basalt-500)' }}>
                                                Mostrando 100 de {filteredClubsTorneo.length} clubes. Afiná el buscador para ver el resto.
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {getReservedAdminRole(editingUser.email) && (
                                <div style={{ fontSize: 12, color: '#fbbf24', marginTop: 8 }}>
                                    Esta cuenta usa un email con rol reservado y debe conservarlo.
                                </div>
                            )}
                        </div>

                        {saveError && (
                            <div style={{ color: '#f87171', fontSize: 13, marginBottom: 16, padding: '8px 12px', background: 'rgba(239,68,68,0.1)', borderRadius: 8, flexShrink: 0 }}>
                                {saveError}
                            </div>
                        )}

                        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexShrink: 0, paddingTop: 4 }}>
                            <button className={styles.btn} type="button" onClick={closeEdit} disabled={saving}>
                                Cancelar
                            </button>
                            <button
                                className={`${styles.btn} ${styles.btnPrimary}`}
                                type="button"
                                onClick={() => void handleSaveRole()}
                                disabled={saveDisabled}
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
