'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pencil, Search, User as UserIcon, X } from 'lucide-react';
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
        id: 'fan',
        title: 'Fan',
        desc: 'Experiencia publica, perfil y favoritos sin permisos administrativos.',
        accent: '#38bdf8',
    },
];

export default function PersonasRolesPage() {
    const [searchQuery, setSearchQuery] = useState('');
    const [users, setUsers] = useState<AppUserRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [editingUser, setEditingUser] = useState<AppUserRow | null>(null);
    const [editingRole, setEditingRole] = useState<string>('fan');
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);

    const fetchUsers = useCallback(async () => {
        try {
            setLoading(true);
            setError(null);

            const response = await fetch('/api/admin/super/personas-roles', {
                cache: 'no-store',
                credentials: 'include',
            });
            const payload = await response.json() as PersonasRolesResponse;

            if (!response.ok) {
                throw new Error(payload.error || 'No se pudieron cargar los usuarios.');
            }

            setUsers(
                (payload.data?.users ?? []).map((user) => ({
                    ...user,
                    role: normalizeRole(user.role),
                }))
            );
        } catch (fetchError) {
            setError(fetchError instanceof Error ? fetchError.message : 'No se pudieron cargar los usuarios.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void fetchUsers();
    }, [fetchUsers]);

    const filteredUsers = useMemo(() => {
        const query = searchQuery.trim().toLowerCase();

        return users.filter((user) => {
            if (!query) {
                return true;
            }

            return (
                (user.name || '').toLowerCase().includes(query) ||
                user.email.toLowerCase().includes(query) ||
                normalizeRole(user.role).includes(query)
            );
        });
    }, [searchQuery, users]);

    const roleOptions: AppUserRole[] = ['fan', 'admin_general', 'super_admin'];

    const openEdit = (user: AppUserRow) => {
        setEditingUser(user);
        setEditingRole(normalizeRole(user.role));
        setSaveError(null);
    };

    const closeEdit = () => {
        setEditingUser(null);
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

            const response = await fetch(`/api/admin/super/personas-roles/${editingUser.id}`, {
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
    }, [closeEdit, editingRole, editingUser]);

    return (
        <>
            <div style={{ paddingBottom: 40 }}>
                <header className={styles.tectonicHeader}>
                    <div className={styles.headerInfo}>
                        <p>Gestion de Accesos</p>
                        <h1>Personas y Roles</h1>
                    </div>
                    <div className={styles.statusSync}>
                        <button className={`${styles.btn} ${styles.btnPrimary}`} type="button" onClick={() => void fetchUsers()}>
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
                                    placeholder="Buscar usuario por nombre, email o rol..."
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
                        boxShadow: '0 24px 48px rgba(0,0,0,0.6)',
                    }}>
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

                        <div style={{ marginBottom: 24 }}>
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
                                            onClick={() => setEditingRole(role)}
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
                            {getReservedAdminRole(editingUser.email) && (
                                <div style={{ fontSize: 12, color: '#fbbf24', marginTop: 8 }}>
                                    Esta cuenta usa un email con rol reservado y debe conservarlo.
                                </div>
                            )}
                        </div>

                        {saveError && (
                            <div style={{ color: '#f87171', fontSize: 13, marginBottom: 16, padding: '8px 12px', background: 'rgba(239,68,68,0.1)', borderRadius: 8 }}>
                                {saveError}
                            </div>
                        )}

                        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                            <button className={styles.btn} type="button" onClick={closeEdit} disabled={saving}>
                                Cancelar
                            </button>
                            <button
                                className={`${styles.btn} ${styles.btnPrimary}`}
                                type="button"
                                onClick={() => void handleSaveRole()}
                                disabled={saving || normalizeRole(editingUser.role) === editingRole}
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
