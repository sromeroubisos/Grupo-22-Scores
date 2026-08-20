'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, Trash2, UserPlus } from 'lucide-react';

interface UsersTabProps {
    clubId: string;
    notify: (text: string, kind?: 'ok' | 'error') => void;
}

type Membership = {
    id: string;
    scopeType: string;
    scopeId: string;
    scopeLabel: string;
    membershipRole: string;
};

type ClubUser = {
    id: string;
    email: string;
    name: string | null;
    lastLoginAt: string | null;
    memberships: Membership[];
};

type Scope = { scopeType: 'club' | 'club_family'; scopeId: string; scopeLabel: string };

const ROLE_LABEL: Record<string, string> = {
    admin: 'Administra',
    editor: 'Edita',
    operator: 'Carga partidos',
    viewer: 'Solo mira',
};

function lastSeen(value: string | null) {
    if (!value) return 'Nunca entró';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Nunca entró';
    return `Última entrada ${date.toLocaleDateString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' })}`;
}

export function UsersTab({ clubId, notify }: UsersTabProps) {
    const [users, setUsers] = useState<ClubUser[]>([]);
    const [scopes, setScopes] = useState<Scope[]>([]);
    const [roles, setRoles] = useState<string[]>(['admin', 'editor', 'operator', 'viewer']);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [email, setEmail] = useState('');
    const [role, setRole] = useState('editor');
    const [scopeKey, setScopeKey] = useState('');
    const [inviting, setInviting] = useState(false);
    const [busyId, setBusyId] = useState<string | null>(null);

    const apply = useCallback((payload: { data?: ClubUser[]; meta?: { scopes?: Scope[]; membershipRoles?: string[] } }) => {
        setUsers(Array.isArray(payload.data) ? payload.data : []);
        const nextScopes = payload.meta?.scopes ?? [];
        setScopes(nextScopes);
        if (payload.meta?.membershipRoles?.length) setRoles(payload.meta.membershipRoles);
        setScopeKey((prev) => (prev && nextScopes.some((scope) => scope.scopeId === prev) ? prev : nextScopes[0]?.scopeId ?? ''));
    }, []);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const response = await fetch(`/api/club-admin/users?club=${encodeURIComponent(clubId)}`, { cache: 'no-store' });
            const payload = await response.json().catch(() => null);
            if (!response.ok) throw new Error(payload?.error || 'No se pudieron cargar los accesos.');
            apply(payload);
        } catch (caught) {
            setError(caught instanceof Error ? caught.message : 'No se pudieron cargar los accesos.');
        } finally {
            setLoading(false);
        }
    }, [clubId, apply]);

    useEffect(() => { void load(); }, [load]);

    const invite = async () => {
        const scope = scopes.find((item) => item.scopeId === scopeKey) ?? scopes[0];
        if (!scope || !email.trim()) return;

        setInviting(true);
        try {
            const response = await fetch('/api/club-admin/users', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    clubId,
                    email: email.trim(),
                    scopeType: scope.scopeType,
                    scopeId: scope.scopeId,
                    membershipRole: role,
                }),
            });
            const payload = await response.json().catch(() => null);
            if (!response.ok) throw new Error(payload?.error || 'No se pudo dar el acceso.');
            apply(payload);
            setEmail('');
            notify('Acceso otorgado');
        } catch (caught) {
            notify(caught instanceof Error ? caught.message : 'No se pudo dar el acceso.', 'error');
        } finally {
            setInviting(false);
        }
    };

    const changeRole = async (membership: Membership, nextRole: string) => {
        setBusyId(membership.id);
        try {
            const response = await fetch('/api/club-admin/users', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ clubId, membershipId: membership.id, membershipRole: nextRole }),
            });
            const payload = await response.json().catch(() => null);
            if (!response.ok) throw new Error(payload?.error || 'No se pudo cambiar el rol.');
            apply(payload);
            notify('Rol actualizado');
        } catch (caught) {
            notify(caught instanceof Error ? caught.message : 'No se pudo cambiar el rol.', 'error');
        } finally {
            setBusyId(null);
        }
    };

    const revoke = async (user: ClubUser, membership: Membership) => {
        if (!window.confirm(`¿Sacarle el acceso a ${user.email}?`)) return;

        setBusyId(membership.id);
        try {
            const params = new URLSearchParams({ clubId, membershipId: membership.id });
            const response = await fetch(`/api/club-admin/users?${params.toString()}`, { method: 'DELETE' });
            const payload = await response.json().catch(() => null);
            if (!response.ok) throw new Error(payload?.error || 'No se pudo revocar el acceso.');
            apply(payload);
            notify('Acceso revocado');
        } catch (caught) {
            notify(caught instanceof Error ? caught.message : 'No se pudo revocar el acceso.', 'error');
        } finally {
            setBusyId(null);
        }
    };

    if (loading) {
        return <div className="cm-loading">Cargando accesos...</div>;
    }

    return (
        <>
            <section className="cm-card">
                <div className="cm-card-head">
                    <div>
                        <h2>Dar acceso</h2>
                        <p>La persona tiene que haberse registrado en G22 Scores antes de poder recibir un acceso.</p>
                    </div>
                </div>

                <div className="cm-search">
                    <input
                        className="cm-input"
                        type="email"
                        placeholder="mail@club.com"
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                        aria-label="Email de la persona"
                    />
                    <select
                        className="cm-select"
                        style={{ flex: '0 1 170px' }}
                        value={role}
                        onChange={(event) => setRole(event.target.value)}
                        aria-label="Rol"
                    >
                        {roles.map((item) => (
                            <option key={item} value={item}>{ROLE_LABEL[item] || item}</option>
                        ))}
                    </select>
                    {scopes.length > 1 && (
                        <select
                            className="cm-select"
                            style={{ flex: '0 1 200px' }}
                            value={scopeKey}
                            onChange={(event) => setScopeKey(event.target.value)}
                            aria-label="Alcance del acceso"
                        >
                            {scopes.map((scope) => (
                                <option key={scope.scopeId} value={scope.scopeId}>{scope.scopeLabel}</option>
                            ))}
                        </select>
                    )}
                    <button
                        type="button"
                        className="cm-btn cm-btn-primary"
                        onClick={invite}
                        disabled={inviting || !email.trim() || scopes.length === 0}
                        title={!email.trim() ? 'Escribí el email de la persona para darle acceso.' : undefined}
                    >
                        {inviting
                            ? <Loader2 size={14} className="animate-spin" aria-hidden="true" />
                            : <UserPlus size={14} aria-hidden="true" />}
                        Dar acceso
                    </button>
                </div>
            </section>

            <section className="cm-card">
                <div className="cm-card-head">
                    <div>
                        <h2>Con acceso</h2>
                        <p>Quiénes pueden administrar este club hoy.</p>
                    </div>
                </div>

                {error && <div className="cm-alert">{error}</div>}

                {!error && users.length === 0 ? (
                    <div className="cm-empty">
                        <strong>Nadie tiene acceso todavía</strong>
                        Solo los administradores globales pueden entrar a este club.
                    </div>
                ) : (
                    <div className="cm-list">
                        {users.flatMap((user) => user.memberships.map((membership) => (
                            <div key={membership.id} className="cm-row">
                                <div className="cm-row-main">
                                    <div className="cm-row-title">{user.name || user.email}</div>
                                    <div className="cm-row-sub">
                                        {user.name ? `${user.email} · ` : ''}{lastSeen(user.lastLoginAt)}
                                        {membership.scopeType === 'club_family' ? ` · ${membership.scopeLabel}` : ''}
                                    </div>
                                </div>
                                <div className="cm-row-actions">
                                    <select
                                        className="cm-select"
                                        style={{ width: 160, minHeight: 34 }}
                                        value={membership.membershipRole}
                                        onChange={(event) => changeRole(membership, event.target.value)}
                                        disabled={busyId === membership.id}
                                        aria-label={`Rol de ${user.email}`}
                                    >
                                        {roles.map((item) => (
                                            <option key={item} value={item}>{ROLE_LABEL[item] || item}</option>
                                        ))}
                                    </select>
                                    <button
                                        type="button"
                                        className="cm-btn cm-btn-danger cm-btn-icon"
                                        onClick={() => revoke(user, membership)}
                                        disabled={busyId === membership.id}
                                        aria-label={`Revocar el acceso de ${user.email}`}
                                    >
                                        {busyId === membership.id
                                            ? <Loader2 size={14} className="animate-spin" aria-hidden="true" />
                                            : <Trash2 size={14} aria-hidden="true" />}
                                    </button>
                                </div>
                            </div>
                        )))}
                    </div>
                )}
            </section>
        </>
    );
}
