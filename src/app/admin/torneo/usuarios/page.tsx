'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Search, UserPlus, X } from 'lucide-react';
import styles from '../tournament-admin.module.css';

type Assignment = {
    tournamentId: string;
    tournamentName: string;
    role: string;
};

type ManagedUser = {
    userId: string;
    email: string;
    name: string | null;
    role: string | null;
    assignments: Assignment[];
};

type TournamentOption = {
    id: string;
    name: string;
};

export default function TournamentAdminUsersPage() {
    const [users, setUsers] = useState<ManagedUser[]>([]);
    const [tournaments, setTournaments] = useState<TournamentOption[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [okMsg, setOkMsg] = useState<string | null>(null);
    const [createdPassword, setCreatedPassword] = useState<string | null>(null);

    const [formOpen, setFormOpen] = useState(false);
    const [email, setEmail] = useState('');
    const [name, setName] = useState('');
    const [password, setPassword] = useState('');
    const [membershipRole, setMembershipRole] = useState<'admin' | 'editor'>('admin');
    const [selectedTournamentIds, setSelectedTournamentIds] = useState<string[]>([]);
    const [submitting, setSubmitting] = useState(false);

    const refresh = useCallback(async () => {
        setLoading(true);
        setErrorMsg(null);
        try {
            const res = await fetch('/api/admin/torneo/usuarios', { cache: 'no-store', credentials: 'include' });
            const payload = await res.json();
            if (!res.ok) throw new Error(payload.error || 'No se pudieron cargar los usuarios');
            setUsers(Array.isArray(payload.data) ? payload.data : []);
            setTournaments(Array.isArray(payload.tournaments) ? payload.tournaments : []);
        } catch (e) {
            setErrorMsg(e instanceof Error ? e.message : 'Error inesperado');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return users;
        return users.filter((u) =>
            u.email.toLowerCase().includes(q) ||
            (u.name || '').toLowerCase().includes(q) ||
            u.assignments.some((a) => a.tournamentName.toLowerCase().includes(q)),
        );
    }, [users, search]);

    const openForm = (prefillEmail?: string) => {
        setEmail(prefillEmail || '');
        setName('');
        setPassword('');
        setMembershipRole('admin');
        setSelectedTournamentIds([]);
        setCreatedPassword(null);
        setErrorMsg(null);
        setOkMsg(null);
        setFormOpen(true);
    };

    const closeForm = () => {
        setFormOpen(false);
        setSelectedTournamentIds([]);
    };

    const toggleTournament = (id: string) => {
        setSelectedTournamentIds((current) => (
            current.includes(id) ? current.filter((x) => x !== id) : [...current, id]
        ));
    };

    const handleSubmit = async () => {
        if (!email.trim() || selectedTournamentIds.length === 0) return;
        setSubmitting(true);
        setErrorMsg(null);
        setOkMsg(null);
        setCreatedPassword(null);
        try {
            const res = await fetch('/api/admin/torneo/usuarios', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    email: email.trim(),
                    name: name.trim() || undefined,
                    password: password.trim() || undefined,
                    membershipRole,
                    tournamentIds: selectedTournamentIds,
                }),
            });
            const payload = await res.json();
            if (!res.ok) throw new Error(payload.error || 'No se pudo agregar el usuario');

            const data = payload.data || {};
            if (data.created && data.password) {
                setCreatedPassword(data.password);
                setOkMsg(`Cuenta creada para ${data.email}. Guardá la contraseña: solo se muestra ahora.`);
            } else if (data.alreadyExisted) {
                setOkMsg(`La cuenta ${data.email} ya existía. Le asignamos ${data.assignedCount} torneo(s).`);
            } else {
                setOkMsg(`Usuario ${data.email} actualizado con ${data.assignedCount} torneo(s).`);
            }
            setFormOpen(false);
            await refresh();
        } catch (e) {
            setErrorMsg(e instanceof Error ? e.message : 'Error inesperado');
        } finally {
            setSubmitting(false);
        }
    };

    const handleUnassign = async (userId: string, tournamentId: string, tournamentName: string) => {
        if (!confirm(`Quitar el acceso a "${tournamentName}"?`)) return;
        setErrorMsg(null);
        setOkMsg(null);
        try {
            const res = await fetch(
                `/api/admin/torneo/usuarios?userId=${encodeURIComponent(userId)}&tournamentId=${encodeURIComponent(tournamentId)}`,
                { method: 'DELETE', credentials: 'include' },
            );
            const payload = await res.json();
            if (!res.ok) throw new Error(payload.error || 'No se pudo quitar el acceso');
            setOkMsg('Acceso quitado.');
            await refresh();
        } catch (e) {
            setErrorMsg(e instanceof Error ? e.message : 'Error inesperado');
        }
    };

    return (
        <div>
            <header className={styles.pageHeader}>
                <div className={styles.eyebrow}>
                    <div className={styles.eyebrowDash} />
                    <span className={styles.eyebrowLabel}>Admin View</span>
                </div>
                <h1 className={styles.pageTitle}>Usuarios</h1>
                <p className={styles.pageSubtitle}>
                    Agregá usuarios y asignales torneos tuyos para que los administren. Solo
                    podés asignar torneos sobre los que tenés acceso.
                </p>
            </header>

            {errorMsg && <div className={`${styles.alert} ${styles.alertError}`}>{errorMsg}</div>}
            {okMsg && <div className={`${styles.alert} ${styles.alertSuccess}`}>{okMsg}</div>}

            {createdPassword && (
                <div className={`${styles.alert} ${styles.alertSuccess}`} style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                    <span>Contraseña temporal: <strong style={{ fontFamily: 'monospace', fontSize: 15 }}>{createdPassword}</strong></span>
                    <button
                        type="button"
                        className={styles.btnGhost}
                        onClick={() => { void navigator.clipboard?.writeText(createdPassword); }}
                    >
                        Copiar
                    </button>
                </div>
            )}

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 24 }}>
                <button
                    type="button"
                    className={styles.btnPrimaryCompact}
                    onClick={() => openForm()}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
                >
                    <UserPlus size={16} aria-hidden />
                    Agregar usuario
                </button>
            </div>

            <div className={`${styles.cardStatic} ${styles.searchBar}`}>
                <div className={styles.searchWrap}>
                    <Search className={styles.searchIcon} aria-hidden />
                    <input
                        type="text"
                        className={styles.searchInput}
                        placeholder="Buscar por email, nombre o torneo..."
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                    />
                </div>
            </div>

            <div className={styles.listStack}>
                {loading ? (
                    <div className={`${styles.cardStatic} ${styles.empty}`}>Cargando...</div>
                ) : tournaments.length === 0 ? (
                    <div className={`${styles.cardStatic} ${styles.empty}`}>
                        Todavía no tenés torneos. Creá uno en Torneos para poder asignar usuarios.
                    </div>
                ) : filtered.length === 0 ? (
                    <div className={`${styles.cardStatic} ${styles.empty}`}>
                        No asignaste usuarios todavía. Usá &quot;Agregar usuario&quot; para sumar uno.
                    </div>
                ) : (
                    filtered.map((u) => (
                        <article key={u.userId} className={`${styles.card} ${styles.listItem}`}>
                            <div className={styles.listItemRow}>
                                <div className={styles.listAvatar}>
                                    {(u.name || u.email).trim().charAt(0).toUpperCase()}
                                </div>
                                <div className={styles.listItemBody}>
                                    <div className={styles.listItemMetaRow}>
                                        <span className={`${styles.badge} ${styles.badgePublicado}`}>
                                            {u.role || 'sin rol'}
                                        </span>
                                        <span className={styles.idTag}>{u.email}</span>
                                    </div>
                                    <h4 className={styles.listItemTitle}>{u.name || u.email}</h4>
                                    <div className={styles.chipList}>
                                        {u.assignments.length === 0 ? (
                                            <span className={styles.metaRow}>Sin torneos asignados</span>
                                        ) : (
                                            u.assignments.map((a) => (
                                                <span key={a.tournamentId} className={styles.softChip}>
                                                    {a.tournamentName} · {a.role}
                                                    <button
                                                        type="button"
                                                        onClick={() => handleUnassign(u.userId, a.tournamentId, a.tournamentName)}
                                                        aria-label={`Quitar ${a.tournamentName}`}
                                                    >
                                                        <X size={12} aria-hidden />
                                                    </button>
                                                </span>
                                            ))
                                        )}
                                    </div>
                                </div>
                                <div className={styles.actions}>
                                    <button
                                        type="button"
                                        className={styles.btnGhost}
                                        onClick={() => openForm(u.email)}
                                    >
                                        Asignar torneos
                                    </button>
                                </div>
                            </div>
                        </article>
                    ))
                )}
            </div>

            {formOpen && (
                <div
                    className={styles.modalBackdrop}
                    role="dialog"
                    aria-modal="true"
                    onClick={(event) => { if (event.target === event.currentTarget) closeForm(); }}
                >
                    <div className={styles.modal}>
                        <h3 className={styles.modalTitle}>Agregar / asignar usuario</h3>
                        <p className={styles.modalDesc}>
                            Si el email no existe, se crea una cuenta confirmada con contraseña. Si
                            ya existe, solo se le suman los torneos seleccionados (no se cambia su
                            contraseña ni se baja su rol).
                        </p>

                        <div className={styles.field}>
                            <label className={styles.fieldLabel} htmlFor="u-email">Email</label>
                            <input
                                id="u-email"
                                className={styles.input}
                                type="email"
                                placeholder="persona@club.com"
                                value={email}
                                onChange={(event) => setEmail(event.target.value)}
                            />
                        </div>

                        <div className={styles.field}>
                            <label className={styles.fieldLabel} htmlFor="u-name">Nombre (opcional)</label>
                            <input
                                id="u-name"
                                className={styles.input}
                                placeholder="Nombre y apellido"
                                value={name}
                                onChange={(event) => setName(event.target.value)}
                            />
                        </div>

                        <div className={styles.field}>
                            <label className={styles.fieldLabel} htmlFor="u-password">
                                Contraseña (opcional · solo para cuentas nuevas)
                            </label>
                            <input
                                id="u-password"
                                className={styles.input}
                                placeholder="Se genera una si la dejás vacía"
                                value={password}
                                onChange={(event) => setPassword(event.target.value)}
                            />
                        </div>

                        <div className={styles.field}>
                            <label className={styles.fieldLabel} htmlFor="u-role">Rol sobre los torneos</label>
                            <select
                                id="u-role"
                                className={styles.select}
                                value={membershipRole}
                                onChange={(event) => setMembershipRole(event.target.value === 'editor' ? 'editor' : 'admin')}
                            >
                                <option value="admin">Admin (gestión completa)</option>
                                <option value="editor">Editor (carga y edición)</option>
                            </select>
                        </div>

                        <div className={styles.field}>
                            <span className={styles.fieldLabel}>
                                Torneos a asignar ({selectedTournamentIds.length})
                            </span>
                            <div className={styles.clubPickGrid}>
                                {tournaments.length === 0 ? (
                                    <div className={styles.emptyInline}>No tenés torneos para asignar.</div>
                                ) : (
                                    tournaments.map((t) => {
                                        const selected = selectedTournamentIds.includes(t.id);
                                        return (
                                            <button
                                                key={t.id}
                                                type="button"
                                                className={`${styles.clubPick} ${selected ? styles.clubPickSelected : ''}`}
                                                onClick={() => toggleTournament(t.id)}
                                            >
                                                <span className={styles.clubPickBody}>
                                                    <strong>{t.name}</strong>
                                                </span>
                                                <span className={styles.clubPickCheck}>{selected ? 'ON' : 'ADD'}</span>
                                            </button>
                                        );
                                    })
                                )}
                            </div>
                        </div>

                        <div className={styles.modalActions}>
                            <button type="button" className={styles.btnGhost} onClick={closeForm} disabled={submitting}>
                                Cancelar
                            </button>
                            <button
                                type="button"
                                className={styles.btnPrimaryCompact}
                                onClick={handleSubmit}
                                disabled={!email.trim() || selectedTournamentIds.length === 0 || submitting}
                            >
                                {submitting ? 'Guardando...' : 'Agregar / asignar'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
