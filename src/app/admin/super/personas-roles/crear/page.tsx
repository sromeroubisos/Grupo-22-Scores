'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Check, Copy, UserPlus } from 'lucide-react';
import styles from '../../page.module.css';
import { ROLE_LABELS, type AppUserRole } from '@/lib/auth/roles';

// Roles an admin can hand to a worker from here. super_admin is excluded on
// purpose (reserved email only); it can still be set from "Editar rol".
const CREATABLE_ROLES: AppUserRole[] = [
    'admin_club',
    'familia_club',
    'admin_torneo',
    'redactor',
    'operador',
    'admin_general',
    'fan',
];

type ClubRow = { id: string; name: string; short_name?: string | null; region?: string | null; country?: string | null };
type FamilyRelationRow = { base_club_id: string; derived_club_id: string; derivative_type?: string | null };
type TournamentRow = { id: string; name: string; display_name?: string | null; season_id?: string | null };

type CreateResult = {
    userId: string;
    email: string;
    role: string;
    password: string;
    created: boolean;
    updated: boolean;
};

const inputStyle: React.CSSProperties = {
    width: '100%',
    minHeight: 42,
    background: 'var(--basalt-900, #0a0d10)',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 10,
    color: '#fff',
    padding: '0 12px',
    fontSize: 14,
    outline: 'none',
};

export default function CrearTrabajadorPage() {
    const [email, setEmail] = useState('');
    const [name, setName] = useState('');
    const [role, setRole] = useState<AppUserRole>('admin_club');
    const [customPassword, setCustomPassword] = useState('');
    const [useCustomPassword, setUseCustomPassword] = useState(false);

    const [clubs, setClubs] = useState<ClubRow[]>([]);
    const [familyRelations, setFamilyRelations] = useState<FamilyRelationRow[]>([]);
    const [tournaments, setTournaments] = useState<TournamentRow[]>([]);
    const [optionsLoading, setOptionsLoading] = useState(true);

    const [selectedClubId, setSelectedClubId] = useState('');
    const [selectedFamilyId, setSelectedFamilyId] = useState('');
    const [selectedTournamentIds, setSelectedTournamentIds] = useState<string[]>([]);
    const [selectedClubIdsTorneo, setSelectedClubIdsTorneo] = useState<string[]>([]);
    const [scopeSearch, setScopeSearch] = useState('');

    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [result, setResult] = useState<CreateResult | null>(null);
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        let active = true;
        (async () => {
            setOptionsLoading(true);
            try {
                const [clubsRes, familiesRes, tournamentsRes] = await Promise.all([
                    fetch('/api/admin/clubs?limit=1000', { cache: 'no-store', credentials: 'include' }),
                    fetch('/api/admin/super/club-families', { cache: 'no-store', credentials: 'include' }),
                    fetch('/api/admin/torneo/tournaments?limit=all&fields=basic', { cache: 'no-store', credentials: 'include' }),
                ]);
                const clubsPayload = (await clubsRes.json().catch(() => [])) as ClubRow[] | { error?: string };
                const familiesPayload = (await familiesRes.json().catch(() => ({}))) as { data?: FamilyRelationRow[] };
                const tournamentsPayload = (await tournamentsRes.json().catch(() => ({}))) as { data?: TournamentRow[] };
                if (!active) return;
                setClubs(Array.isArray(clubsPayload) ? clubsPayload.filter((c) => c.id && c.name) : []);
                setFamilyRelations(Array.isArray(familiesPayload.data) ? familiesPayload.data : []);
                setTournaments(Array.isArray(tournamentsPayload.data) ? tournamentsPayload.data.filter((t) => t.id && t.name) : []);
            } catch {
                if (active) {
                    setClubs([]);
                    setFamilyRelations([]);
                    setTournaments([]);
                }
            } finally {
                if (active) setOptionsLoading(false);
            }
        })();
        return () => {
            active = false;
        };
    }, []);

    const clubById = useMemo(() => new Map(clubs.map((c) => [c.id, c])), [clubs]);

    const familyOptions = useMemo(() => {
        const roots = new Set<string>();
        for (const rel of familyRelations) {
            if (!rel.base_club_id || !rel.derived_club_id) continue;
            if (rel.derivative_type && rel.derivative_type !== 'family') continue;
            roots.add(rel.base_club_id);
        }
        return Array.from(roots)
            .map((id) => ({ id, label: clubById.get(id)?.name || id }))
            .sort((a, b) => a.label.localeCompare(b.label));
    }, [familyRelations, clubById]);

    const sortedClubs = useMemo(
        () => [...clubs].sort((a, b) => a.name.localeCompare(b.name)),
        [clubs],
    );

    const filteredScopeClubs = useMemo(() => {
        const q = scopeSearch.trim().toLowerCase();
        if (!q) return sortedClubs;
        return sortedClubs.filter(
            (c) => c.name.toLowerCase().includes(q) || (c.short_name || '').toLowerCase().includes(q),
        );
    }, [scopeSearch, sortedClubs]);

    const filteredScopeTournaments = useMemo(() => {
        const q = scopeSearch.trim().toLowerCase();
        if (!q) return tournaments;
        return tournaments.filter((t) => (t.display_name || t.name).toLowerCase().includes(q));
    }, [scopeSearch, tournaments]);

    const needsClub = role === 'admin_club';
    const needsFamily = role === 'familia_club';
    const needsTournamentScope = role === 'admin_torneo';

    const scopeReady =
        (!needsClub || Boolean(selectedClubId)) &&
        (!needsFamily || Boolean(selectedFamilyId)) &&
        (!needsTournamentScope || selectedTournamentIds.length > 0 || selectedClubIdsTorneo.length > 0);

    const canSubmit =
        !submitting &&
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) &&
        scopeReady &&
        (!useCustomPassword || customPassword.trim().length >= 8);

    const toggle = (list: string[], id: string) =>
        list.includes(id) ? list.filter((x) => x !== id) : [...list, id];

    const handleSubmit = useCallback(async () => {
        setSubmitting(true);
        setError(null);
        setResult(null);
        try {
            const body: Record<string, unknown> = {
                email: email.trim().toLowerCase(),
                name: name.trim() || undefined,
                role,
            };
            if (useCustomPassword && customPassword.trim()) {
                body.password = customPassword.trim();
            }
            if (needsClub) {
                body.scopeType = 'club';
                body.scopeIds = [selectedClubId];
                body.membershipRole = 'admin';
            } else if (needsFamily) {
                body.scopeType = 'club_family';
                body.scopeIds = [selectedFamilyId];
                body.membershipRole = 'admin';
            }

            const res = await fetch('/api/admin/super/personas-roles/create', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(body),
            });
            const payload = (await res.json()) as { data?: CreateResult; error?: string };
            if (!res.ok || !payload.data) {
                throw new Error(payload.error || 'No se pudo crear el trabajador.');
            }

            // admin_torneo carries two scope buckets (tournaments + clubs).
            // Reuse the proven access endpoint to set them after creation.
            if (needsTournamentScope) {
                const userId = payload.data.userId;
                if (selectedTournamentIds.length > 0) {
                    await fetch(`/api/admin/users/${userId}/access`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        credentials: 'include',
                        body: JSON.stringify({
                            role,
                            scopeType: 'tournament',
                            membershipRole: 'admin',
                            scopeIds: selectedTournamentIds,
                        }),
                    });
                }
                if (selectedClubIdsTorneo.length > 0) {
                    await fetch(`/api/admin/users/${userId}/access`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        credentials: 'include',
                        body: JSON.stringify({
                            role,
                            scopeType: 'club',
                            membershipRole: 'admin',
                            scopeIds: selectedClubIdsTorneo,
                        }),
                    });
                }
            }

            setResult(payload.data);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'No se pudo crear el trabajador.');
        } finally {
            setSubmitting(false);
        }
    }, [
        email,
        name,
        role,
        useCustomPassword,
        customPassword,
        needsClub,
        needsFamily,
        needsTournamentScope,
        selectedClubId,
        selectedFamilyId,
        selectedTournamentIds,
        selectedClubIdsTorneo,
    ]);

    const resetForm = () => {
        setResult(null);
        setEmail('');
        setName('');
        setRole('admin_club');
        setSelectedClubId('');
        setSelectedFamilyId('');
        setSelectedTournamentIds([]);
        setSelectedClubIdsTorneo([]);
        setCustomPassword('');
        setUseCustomPassword(false);
        setError(null);
    };

    const copyCredentials = async () => {
        if (!result) return;
        try {
            await navigator.clipboard.writeText(
                `Acceso Grupo 22 Scores\nSitio: https://g22scores.com/login\nUsuario: ${result.email}\nContraseña: ${result.password}`,
            );
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            /* clipboard not available */
        }
    };

    return (
        <div style={{ paddingBottom: 40 }}>
            <header className={styles.tectonicHeader}>
                <div className={styles.headerInfo}>
                    <p>Gestión de Accesos</p>
                    <h1>Crear Trabajador</h1>
                </div>
                <div className={styles.statusSync}>
                    <Link className={styles.btn} href="/admin/super/personas-roles">
                        <ArrowLeft size={16} /> Volver a Personas y Roles
                    </Link>
                </div>
            </header>

            <div className={styles.slab} style={{ maxWidth: 640, padding: 24 }}>
                {result ? (
                    <div style={{ display: 'grid', gap: 16 }}>
                        <div
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 10,
                                color: '#34d399',
                                fontWeight: 700,
                                fontSize: 16,
                            }}
                        >
                            <Check size={20} />
                            {result.created ? 'Cuenta creada y lista para usar' : 'Cuenta actualizada y lista para usar'}
                        </div>
                        <p style={{ margin: 0, color: 'var(--basalt-400)', fontSize: 13, lineHeight: 1.6 }}>
                            La cuenta ya está <strong>confirmada</strong>, con contraseña y el rol{' '}
                            <strong>{ROLE_LABELS[result.role as AppUserRole] || result.role}</strong> asignado. El
                            trabajador puede entrar <strong>ahora mismo</strong> con estas credenciales, sin
                            confirmar ningún email.
                        </p>
                        <div
                            style={{
                                background: 'var(--basalt-900, #0a0d10)',
                                border: '1px solid rgba(52, 211, 153, 0.4)',
                                borderRadius: 12,
                                padding: 16,
                                display: 'grid',
                                gap: 8,
                                fontSize: 14,
                            }}
                        >
                            <div>
                                <span style={{ color: 'var(--basalt-400)' }}>Usuario: </span>
                                <strong>{result.email}</strong>
                            </div>
                            <div>
                                <span style={{ color: 'var(--basalt-400)' }}>Contraseña: </span>
                                <strong style={{ fontFamily: 'monospace', fontSize: 16, letterSpacing: 1 }}>
                                    {result.password}
                                </strong>
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                            <button
                                className={`${styles.btn} ${styles.btnPrimary}`}
                                type="button"
                                onClick={() => void copyCredentials()}
                            >
                                {copied ? <Check size={16} /> : <Copy size={16} />}
                                {copied ? 'Copiado' : 'Copiar credenciales'}
                            </button>
                            <button className={styles.btn} type="button" onClick={resetForm}>
                                <UserPlus size={16} /> Crear otro
                            </button>
                        </div>
                        <p style={{ margin: 0, color: 'var(--basalt-500)', fontSize: 12 }}>
                            Pasale estas credenciales por un canal privado. El trabajador puede cambiar la
                            contraseña luego desde “¿Olvidaste tu contraseña?”.
                        </p>
                    </div>
                ) : (
                    <div style={{ display: 'grid', gap: 18 }}>
                        <p style={{ margin: 0, color: 'var(--basalt-400)', fontSize: 13, lineHeight: 1.6 }}>
                            Esto crea la cuenta del trabajador <strong>ya confirmada</strong>, con contraseña y su
                            rol asignado en un solo paso. No depende del email de confirmación ni de Google. Si el
                            email ya existía, se le restablece la contraseña y se confirma.
                        </p>

                        <label style={{ display: 'grid', gap: 6 }}>
                            <span style={{ fontSize: 12, color: 'var(--basalt-400)', fontWeight: 600 }}>
                                Email del trabajador
                            </span>
                            <input
                                style={inputStyle}
                                type="email"
                                inputMode="email"
                                autoComplete="off"
                                placeholder="trabajador@ejemplo.com"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                            />
                        </label>

                        <label style={{ display: 'grid', gap: 6 }}>
                            <span style={{ fontSize: 12, color: 'var(--basalt-400)', fontWeight: 600 }}>
                                Nombre (opcional)
                            </span>
                            <input
                                style={inputStyle}
                                type="text"
                                placeholder="Nombre y apellido"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                            />
                        </label>

                        <label style={{ display: 'grid', gap: 6 }}>
                            <span style={{ fontSize: 12, color: 'var(--basalt-400)', fontWeight: 600 }}>Rol</span>
                            <select
                                style={inputStyle}
                                value={role}
                                onChange={(e) => {
                                    setRole(e.target.value as AppUserRole);
                                    setSelectedClubId('');
                                    setSelectedFamilyId('');
                                    setSelectedTournamentIds([]);
                                    setSelectedClubIdsTorneo([]);
                                    setScopeSearch('');
                                }}
                            >
                                {CREATABLE_ROLES.map((r) => (
                                    <option key={r} value={r}>
                                        {ROLE_LABELS[r]}
                                    </option>
                                ))}
                            </select>
                        </label>

                        {needsClub && (
                            <label style={{ display: 'grid', gap: 6 }}>
                                <span style={{ fontSize: 12, color: 'var(--basalt-400)', fontWeight: 600 }}>
                                    Club asignado
                                </span>
                                <select
                                    style={inputStyle}
                                    value={selectedClubId}
                                    onChange={(e) => setSelectedClubId(e.target.value)}
                                    disabled={optionsLoading}
                                >
                                    <option value="">
                                        {optionsLoading ? 'Cargando clubes…' : 'Seleccionar club'}
                                    </option>
                                    {sortedClubs.map((c) => (
                                        <option key={c.id} value={c.id}>
                                            {c.name}
                                            {c.region || c.country ? ` — ${c.region || c.country}` : ''}
                                        </option>
                                    ))}
                                </select>
                            </label>
                        )}

                        {needsFamily && (
                            <label style={{ display: 'grid', gap: 6 }}>
                                <span style={{ fontSize: 12, color: 'var(--basalt-400)', fontWeight: 600 }}>
                                    Familia de club asignada
                                </span>
                                <select
                                    style={inputStyle}
                                    value={selectedFamilyId}
                                    onChange={(e) => setSelectedFamilyId(e.target.value)}
                                    disabled={optionsLoading}
                                >
                                    <option value="">
                                        {optionsLoading
                                            ? 'Cargando familias…'
                                            : familyOptions.length === 0
                                              ? 'No hay familias configuradas'
                                              : 'Seleccionar familia'}
                                    </option>
                                    {familyOptions.map((f) => (
                                        <option key={f.id} value={f.id}>
                                            {f.label}
                                        </option>
                                    ))}
                                </select>
                            </label>
                        )}

                        {needsTournamentScope && (
                            <div style={{ display: 'grid', gap: 12 }}>
                                <input
                                    style={inputStyle}
                                    type="text"
                                    placeholder="Buscar torneos / clubes…"
                                    value={scopeSearch}
                                    onChange={(e) => setScopeSearch(e.target.value)}
                                />
                                <div style={{ display: 'grid', gap: 6 }}>
                                    <span style={{ fontSize: 12, color: 'var(--basalt-400)', fontWeight: 600 }}>
                                        Torneos asignados ({selectedTournamentIds.length})
                                    </span>
                                    <div
                                        style={{
                                            maxHeight: 160,
                                            overflowY: 'auto',
                                            border: '1px solid rgba(255,255,255,0.08)',
                                            borderRadius: 8,
                                            padding: 8,
                                            display: 'grid',
                                            gap: 4,
                                        }}
                                    >
                                        {optionsLoading ? (
                                            <span style={{ fontSize: 12, color: 'var(--basalt-400)' }}>Cargando…</span>
                                        ) : filteredScopeTournaments.length === 0 ? (
                                            <span style={{ fontSize: 12, color: 'var(--basalt-400)' }}>Sin torneos.</span>
                                        ) : (
                                            filteredScopeTournaments.slice(0, 100).map((t) => (
                                                <label
                                                    key={t.id}
                                                    style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}
                                                >
                                                    <input
                                                        type="checkbox"
                                                        checked={selectedTournamentIds.includes(t.id)}
                                                        onChange={() =>
                                                            setSelectedTournamentIds((c) => toggle(c, t.id))
                                                        }
                                                    />
                                                    {t.display_name || t.name}
                                                </label>
                                            ))
                                        )}
                                    </div>
                                </div>
                                <div style={{ display: 'grid', gap: 6 }}>
                                    <span style={{ fontSize: 12, color: 'var(--basalt-400)', fontWeight: 600 }}>
                                        Clubes asignados ({selectedClubIdsTorneo.length})
                                    </span>
                                    <div
                                        style={{
                                            maxHeight: 160,
                                            overflowY: 'auto',
                                            border: '1px solid rgba(255,255,255,0.08)',
                                            borderRadius: 8,
                                            padding: 8,
                                            display: 'grid',
                                            gap: 4,
                                        }}
                                    >
                                        {optionsLoading ? (
                                            <span style={{ fontSize: 12, color: 'var(--basalt-400)' }}>Cargando…</span>
                                        ) : filteredScopeClubs.length === 0 ? (
                                            <span style={{ fontSize: 12, color: 'var(--basalt-400)' }}>Sin clubes.</span>
                                        ) : (
                                            filteredScopeClubs.slice(0, 100).map((c) => (
                                                <label
                                                    key={c.id}
                                                    style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}
                                                >
                                                    <input
                                                        type="checkbox"
                                                        checked={selectedClubIdsTorneo.includes(c.id)}
                                                        onChange={() =>
                                                            setSelectedClubIdsTorneo((cur) => toggle(cur, c.id))
                                                        }
                                                    />
                                                    {c.name}
                                                </label>
                                            ))
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}

                        <div style={{ display: 'grid', gap: 8 }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                                <input
                                    type="checkbox"
                                    checked={useCustomPassword}
                                    onChange={(e) => setUseCustomPassword(e.target.checked)}
                                />
                                Definir contraseña manualmente
                            </label>
                            {useCustomPassword ? (
                                <input
                                    style={inputStyle}
                                    type="text"
                                    placeholder="Mínimo 8 caracteres"
                                    value={customPassword}
                                    onChange={(e) => setCustomPassword(e.target.value)}
                                />
                            ) : (
                                <span style={{ fontSize: 12, color: 'var(--basalt-500)' }}>
                                    Se generará una contraseña temporal segura y se mostrará al crear.
                                </span>
                            )}
                        </div>

                        {error && (
                            <div
                                style={{
                                    color: '#f87171',
                                    fontSize: 13,
                                    padding: '10px 12px',
                                    background: 'rgba(239,68,68,0.1)',
                                    borderRadius: 8,
                                }}
                            >
                                {error}
                            </div>
                        )}

                        <button
                            className={`${styles.btn} ${styles.btnPrimary}`}
                            type="button"
                            onClick={() => void handleSubmit()}
                            disabled={!canSubmit}
                            style={{ justifyContent: 'center' }}
                        >
                            <UserPlus size={16} />
                            {submitting ? 'Creando…' : 'Crear trabajador'}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
