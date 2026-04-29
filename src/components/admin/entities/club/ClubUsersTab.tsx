'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, Loader2, Mail, ShieldCheck, Trash2, UserCog, UserPlus } from 'lucide-react';

const MEMBERSHIP_ROLE_LABELS: Record<string, string> = {
    admin: 'Administrador',
    editor: 'Editor',
    operator: 'Operador',
    viewer: 'Solo lectura',
};

const MEMBERSHIP_ROLE_DESCRIPTIONS: Record<string, string> = {
    admin: 'Identidad, equipos, sponsors y publicacion.',
    editor: 'Planteles, contenido y ajustes de partido.',
    operator: 'Resultado, live y validaciones de campo.',
    viewer: 'Lectura del tablero, sin escritura.',
};

type MembershipRole = 'admin' | 'editor' | 'operator' | 'viewer';
type ScopeType = 'club' | 'club_family';

interface UserMembership {
    id: string;
    scopeType: ScopeType;
    scopeId: string;
    scopeLabel: string;
    membershipRole: MembershipRole;
    createdAt: string;
}

interface ClubUserItem {
    id: string;
    email: string;
    name: string | null;
    avatarUrl: string | null;
    lastLoginAt: string | null;
    role: string;
    memberships: UserMembership[];
}

interface AvailableScope {
    scopeType: ScopeType;
    scopeId: string;
    scopeLabel: string;
}

interface UsersMeta {
    scopes: AvailableScope[];
    membershipRoles: MembershipRole[];
}

interface UsersResponse {
    ok?: boolean;
    data?: ClubUserItem[];
    meta?: UsersMeta;
    error?: string;
}

interface ClubUsersTabProps {
    clubId: string;
}

function formatLastLogin(value: string | null) {
    if (!value) return 'Sin ingresos recientes';
    try {
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return 'Sin ingresos recientes';
        return date.toLocaleString('es-AR', { dateStyle: 'medium', timeStyle: 'short' });
    } catch {
        return 'Sin ingresos recientes';
    }
}

function scopeKey(scope: { scopeType: ScopeType; scopeId: string }) {
    return `${scope.scopeType}:${scope.scopeId}`;
}

function membershipRoleLabel(role: string) {
    return MEMBERSHIP_ROLE_LABELS[role] || role;
}

export function ClubUsersTab({ clubId }: ClubUsersTabProps) {
    const [users, setUsers] = useState<ClubUserItem[]>([]);
    const [meta, setMeta] = useState<UsersMeta | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [pendingMembershipId, setPendingMembershipId] = useState<string | null>(null);
    const [pendingRoleByMembership, setPendingRoleByMembership] = useState<Record<string, MembershipRole>>({});

    const [inviteEmail, setInviteEmail] = useState('');
    const [inviteScope, setInviteScope] = useState<string>('');
    const [inviteRole, setInviteRole] = useState<MembershipRole>('editor');
    const [inviteSubmitting, setInviteSubmitting] = useState(false);
    const [inviteError, setInviteError] = useState<string | null>(null);
    const [inviteNotice, setInviteNotice] = useState<string | null>(null);

    const applyResponse = useCallback((payload: UsersResponse) => {
        setUsers(payload.data ?? []);
        if (payload.meta) {
            setMeta(payload.meta);
            setInviteScope((current) => {
                if (current && payload.meta!.scopes.some((scope) => scopeKey(scope) === current)) {
                    return current;
                }
                const fallback = payload.meta!.scopes[0];
                return fallback ? scopeKey(fallback) : '';
            });
        }
    }, []);

    const loadUsers = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const response = await fetch(`/api/club-admin/users?club=${encodeURIComponent(clubId)}`, {
                cache: 'no-store',
                credentials: 'include',
            });
            const payload = await response.json() as UsersResponse;
            if (!response.ok || payload.ok === false) {
                throw new Error(payload.error || 'No se pudieron cargar los usuarios del club.');
            }
            applyResponse(payload);
        } catch (fetchError) {
            setError(fetchError instanceof Error ? fetchError.message : 'No se pudieron cargar los usuarios del club.');
            setUsers([]);
        } finally {
            setLoading(false);
        }
    }, [applyResponse, clubId]);

    useEffect(() => {
        void loadUsers();
    }, [loadUsers]);

    const availableScopes = meta?.scopes ?? [];
    const availableRoles = useMemo<MembershipRole[]>(
        () => meta?.membershipRoles ?? ['admin', 'editor', 'operator', 'viewer'],
        [meta?.membershipRoles]
    );

    async function handleRoleChange(membership: UserMembership, nextRole: MembershipRole) {
        if (nextRole === membership.membershipRole) return;
        setPendingRoleByMembership((current) => ({ ...current, [membership.id]: nextRole }));
        setPendingMembershipId(membership.id);
        setError(null);
        try {
            const response = await fetch('/api/club-admin/users', {
                method: 'PATCH',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    clubId,
                    membershipId: membership.id,
                    membershipRole: nextRole,
                }),
            });
            const payload = await response.json() as UsersResponse;
            if (!response.ok || payload.ok === false) {
                throw new Error(payload.error || 'No se pudo actualizar el rol.');
            }
            applyResponse(payload);
            setPendingRoleByMembership((current) => {
                const next = { ...current };
                delete next[membership.id];
                return next;
            });
        } catch (patchError) {
            setError(patchError instanceof Error ? patchError.message : 'No se pudo actualizar el rol.');
        } finally {
            setPendingMembershipId(null);
        }
    }

    async function handleRemoveMembership(membership: UserMembership) {
        const confirmed = typeof window !== 'undefined'
            ? window.confirm(`Revocar acceso ${membershipRoleLabel(membership.membershipRole)} en ${membership.scopeLabel}?`)
            : true;
        if (!confirmed) return;

        setPendingMembershipId(membership.id);
        setError(null);
        try {
            const params = new URLSearchParams({ clubId, membershipId: membership.id });
            const response = await fetch(`/api/club-admin/users?${params.toString()}`, {
                method: 'DELETE',
                credentials: 'include',
            });
            const payload = await response.json() as UsersResponse;
            if (!response.ok || payload.ok === false) {
                throw new Error(payload.error || 'No se pudo revocar el acceso.');
            }
            applyResponse(payload);
        } catch (deleteError) {
            setError(deleteError instanceof Error ? deleteError.message : 'No se pudo revocar el acceso.');
        } finally {
            setPendingMembershipId(null);
        }
    }

    async function handleInviteSubmit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setInviteError(null);
        setInviteNotice(null);

        const email = inviteEmail.trim();
        if (!email) {
            setInviteError('Ingresa un email valido.');
            return;
        }

        const selectedScope = availableScopes.find((scope) => scopeKey(scope) === inviteScope);
        if (!selectedScope) {
            setInviteError('Selecciona un alcance para el acceso.');
            return;
        }

        setInviteSubmitting(true);
        try {
            const response = await fetch('/api/club-admin/users', {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    clubId,
                    email,
                    scopeType: selectedScope.scopeType,
                    scopeId: selectedScope.scopeId,
                    membershipRole: inviteRole,
                }),
            });
            const payload = await response.json() as UsersResponse;
            if (!response.ok || payload.ok === false) {
                throw new Error(payload.error || 'No se pudo crear el acceso.');
            }
            applyResponse(payload);
            setInviteEmail('');
            setInviteNotice(`Acceso ${membershipRoleLabel(inviteRole)} otorgado a ${email}.`);
        } catch (postError) {
            setInviteError(postError instanceof Error ? postError.message : 'No se pudo crear el acceso.');
        } finally {
            setInviteSubmitting(false);
        }
    }

    return (
        <div className="club-users-grid">
            <section className="club-ops-panel club-users-list-panel">
                <div className="club-ops-panel-header">
                    <div>
                        <div className="card-title">Usuarios con acceso</div>
                        <p className="club-ops-subtext">
                            Administra quien puede operar este club y sus subclubes. Los cambios se aplican en el acto.
                        </p>
                    </div>
                    <button
                        type="button"
                        className="btn btn-secondary club-users-refresh"
                        onClick={() => { void loadUsers(); }}
                        disabled={loading}
                    >
                        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserCog className="w-4 h-4" />}
                        Refrescar
                    </button>
                </div>

                {error ? (
                    <div className="club-users-alert" role="alert">
                        <AlertCircle className="w-4 h-4" />
                        <span>{error}</span>
                    </div>
                ) : null}

                {loading ? (
                    <div className="club-users-empty">
                        <Loader2 className="w-5 h-5 animate-spin" />
                        <span>Cargando usuarios...</span>
                    </div>
                ) : users.length === 0 ? (
                    <div className="club-users-empty">
                        <UserCog className="w-5 h-5" />
                        <span>Todavia no hay usuarios con acceso a este club. Usa el formulario para agregar el primero.</span>
                    </div>
                ) : (
                    <ul className="club-users-list">
                        {users.map((user) => {
                            const initials = (user.name || user.email || '?').trim().slice(0, 1).toUpperCase();
                            return (
                                <li key={user.id} className="club-users-row">
                                    <div className="club-users-identity">
                                        {user.avatarUrl ? (
                                            <img src={user.avatarUrl} alt="" className="club-users-avatar" />
                                        ) : (
                                            <div className="club-users-avatar club-users-avatar-fallback">{initials}</div>
                                        )}
                                        <div className="club-users-identity-copy">
                                            <strong>{user.name || user.email}</strong>
                                            <span className="club-users-email">
                                                <Mail className="w-3.5 h-3.5" />
                                                {user.email}
                                            </span>
                                            <span className="club-users-meta-line">
                                                Ultimo ingreso: {formatLastLogin(user.lastLoginAt)}
                                            </span>
                                        </div>
                                    </div>

                                    <div className="club-users-memberships">
                                        {user.memberships.map((membership) => {
                                            const isPending = pendingMembershipId === membership.id;
                                            const draftRole = pendingRoleByMembership[membership.id] ?? membership.membershipRole;
                                            return (
                                                <div key={membership.id} className="club-users-membership">
                                                    <div className="club-users-membership-scope">
                                                        <ShieldCheck className="w-3.5 h-3.5" />
                                                        <span>{membership.scopeLabel}</span>
                                                    </div>
                                                    <div className="club-users-membership-actions">
                                                        <select
                                                            className="club-users-role-select"
                                                            value={draftRole}
                                                            onChange={(event) => {
                                                                void handleRoleChange(membership, event.target.value as MembershipRole);
                                                            }}
                                                            disabled={isPending}
                                                        >
                                                            {availableRoles.map((role) => (
                                                                <option key={role} value={role}>
                                                                    {membershipRoleLabel(role)}
                                                                </option>
                                                            ))}
                                                        </select>
                                                        <button
                                                            type="button"
                                                            className="club-users-remove"
                                                            onClick={() => { void handleRemoveMembership(membership); }}
                                                            disabled={isPending}
                                                            aria-label="Revocar acceso"
                                                        >
                                                            {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                                                        </button>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </section>

            <aside className="club-ops-panel club-users-invite-panel">
                <div className="club-ops-panel-header">
                    <div>
                        <div className="card-title">Otorgar nuevo acceso</div>
                        <p className="club-ops-subtext">
                            El usuario debe haber iniciado sesion al menos una vez para poder asignarle un rol.
                        </p>
                    </div>
                </div>

                <form className="club-users-form" onSubmit={handleInviteSubmit}>
                    <label className="club-users-field">
                        <span>Email del colaborador</span>
                        <input
                            type="email"
                            className="club-users-input"
                            value={inviteEmail}
                            onChange={(event) => setInviteEmail(event.target.value)}
                            placeholder="persona@club.com"
                            autoComplete="email"
                            required
                        />
                    </label>

                    <label className="club-users-field">
                        <span>Alcance</span>
                        <select
                            className="club-users-input"
                            value={inviteScope}
                            onChange={(event) => setInviteScope(event.target.value)}
                            disabled={availableScopes.length === 0}
                        >
                            {availableScopes.length === 0 ? (
                                <option value="">Sin alcances disponibles</option>
                            ) : (
                                availableScopes.map((scope) => (
                                    <option key={scopeKey(scope)} value={scopeKey(scope)}>
                                        {scope.scopeLabel}
                                    </option>
                                ))
                            )}
                        </select>
                    </label>

                    <label className="club-users-field">
                        <span>Rol</span>
                        <select
                            className="club-users-input"
                            value={inviteRole}
                            onChange={(event) => setInviteRole(event.target.value as MembershipRole)}
                        >
                            {availableRoles.map((role) => (
                                <option key={role} value={role}>
                                    {membershipRoleLabel(role)}
                                </option>
                            ))}
                        </select>
                    </label>

                    <p className="club-users-role-hint">
                        {MEMBERSHIP_ROLE_DESCRIPTIONS[inviteRole] || ''}
                    </p>

                    {inviteError ? (
                        <div className="club-users-alert" role="alert">
                            <AlertCircle className="w-4 h-4" />
                            <span>{inviteError}</span>
                        </div>
                    ) : null}

                    {inviteNotice ? (
                        <div className="club-users-notice" role="status">
                            <ShieldCheck className="w-4 h-4" />
                            <span>{inviteNotice}</span>
                        </div>
                    ) : null}

                    <button
                        type="submit"
                        className="btn btn-primary club-users-submit"
                        disabled={inviteSubmitting || availableScopes.length === 0}
                    >
                        {inviteSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
                        Otorgar acceso
                    </button>
                </form>
            </aside>
        </div>
    );
}
