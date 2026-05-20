'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CalendarDays, ListPlus, Users, UserPlus, X } from 'lucide-react';
import styles from '../tournament-admin.module.css';

type Person = {
    id: string;
    full_name: string | null;
    name: string | null;
    first_name: string | null;
    last_name: string | null;
    birth_date: string | null;
};
type Membership = {
    id: string;
    status: string | null;
    jersey_number: number | null;
    position: string | null;
    role: string | null;
    player?: Person | null;
};
type Roster = {
    id: string;
    name: string | null;
    status: string | null;
    club?: { id: string; name: string } | null;
    team?: { id: string; name: string; category: string | null } | null;
    memberships?: Membership[];
};

function personName(p?: Person | null): string {
    if (!p) return '—';
    return (
        p.full_name ||
        p.name ||
        `${p.first_name || ''} ${p.last_name || ''}`.trim() ||
        '—'
    );
}

type ParsedRow = {
    line: number;
    raw: string;
    jerseyNumber: number | null;
    firstName: string;
    lastName: string;
    birthDate: string | null;
    error: string | null;
};

/** Accepts YYYY-MM-DD or D/M/YYYY (also with - or . separators). */
function normalizeBirthDate(value: string): string | null {
    const v = value.trim();
    if (!v) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
    const m = v.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})$/);
    if (m) {
        const [, d, mo, y] = m;
        return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
    }
    return null;
}

/** Parses "1 - Juan Perez - 2000-05-12" (segments split by " - "). */
function parseBulkLine(raw: string, line: number): ParsedRow {
    const base: ParsedRow = {
        line,
        raw,
        jerseyNumber: null,
        firstName: '',
        lastName: '',
        birthDate: null,
        error: null,
    };
    const parts = raw.split(/\s+-\s+/).map((p) => p.trim()).filter(Boolean);
    if (parts.length === 0) return { ...base, error: 'Línea vacía' };

    let namePart = '';
    let dobPart = '';
    if (parts.length >= 3) {
        base.jerseyNumber = /^\d+$/.test(parts[0]) ? Number(parts[0]) : null;
        namePart = parts[1];
        dobPart = parts.slice(2).join(' ');
    } else if (parts.length === 2) {
        if (/^\d+$/.test(parts[0])) {
            base.jerseyNumber = Number(parts[0]);
            namePart = parts[1];
        } else {
            namePart = parts[0];
            dobPart = parts[1];
        }
    } else {
        namePart = parts[0];
    }

    const tokens = namePart.split(/\s+/).filter(Boolean);
    if (tokens.length < 2) {
        return { ...base, error: 'Falta nombre y/o apellido' };
    }
    base.firstName = tokens[0];
    base.lastName = tokens.slice(1).join(' ');
    if (dobPart) {
        const norm = normalizeBirthDate(dobPart);
        if (!norm) return { ...base, error: `Fecha inválida: "${dobPart}"` };
        base.birthDate = norm;
    }
    return base;
}

/**
 * Self-contained roster (plantel) editor for a single (tournament, club)
 * roster. Shared by the standalone roster route and the unified
 * Clubes → plantel flow.
 *
 * Desktop keeps the previous inline panels. On mobile the add / bulk forms
 * are not shown until the user taps a button, then they open as a
 * bottom-sheet (per the requested mobile design); the app's current colors
 * (Vitreous Basalt cyan) are preserved.
 */
export default function RosterPlantelEditor({
    rosterId,
    tournamentId,
    onRosterLoaded,
}: {
    rosterId: string;
    tournamentId: string;
    onRosterLoaded?: (roster: Roster | null) => void;
}) {
    const [roster, setRoster] = useState<Roster | null>(null);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [mode, setMode] = useState<'single' | 'bulk'>('single');
    const [sheetOpen, setSheetOpen] = useState(false);

    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
    const [newJersey, setNewJersey] = useState('');
    const [birthDate, setBirthDate] = useState('');

    const [bulkText, setBulkText] = useState('');
    const [bulkResult, setBulkResult] = useState<{ ok: number; errors: string[] } | null>(null);

    const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
    useEffect(() => {
        // Portal into the panel shell (not document.body): the shell owns the
        // theme CSS variables (--t-*, --accent-*) and is not a stacking
        // context, so the sheet inherits the theme AND still paints above the
        // fixed bottom nav.
        const shell = document.querySelector<HTMLElement>(`.${styles.shell}`);
        setPortalTarget(shell ?? document.body);
    }, []);

    const onLoadedRef = useRef(onRosterLoaded);
    useEffect(() => {
        onLoadedRef.current = onRosterLoaded;
    });

    const load = useCallback(async () => {
        if (!tournamentId) {
            setError('Falta el torneo del plantel.');
            setLoading(false);
            return;
        }
        try {
            const res = await fetch(
                `/api/admin/torneo/rosters?tournamentId=${encodeURIComponent(tournamentId)}`,
                { cache: 'no-store', credentials: 'include' },
            );
            const payload = await res.json();
            if (!res.ok) throw new Error(payload.error || 'No se pudo cargar el plantel');
            const found = (payload.data?.rosters ?? []).find((r: Roster) => r.id === rosterId) ?? null;
            setRoster(found);
            onLoadedRef.current?.(found);
            if (!found) setError('Plantel no encontrado en este torneo.');
            else setError(null);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Error inesperado');
        } finally {
            setLoading(false);
        }
    }, [tournamentId, rosterId]);

    useEffect(() => {
        setLoading(true);
        void load();
    }, [load]);

    const post = useCallback(
        async (body: Record<string, unknown>): Promise<boolean> => {
            setBusy(true);
            setError(null);
            try {
                const res = await fetch('/api/admin/torneo/rosters', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify(body),
                });
                const payload = await res.json();
                if (!res.ok) throw new Error(payload.error || 'No se pudo guardar el cambio');
                await load();
                return true;
            } catch (e) {
                setError(e instanceof Error ? e.message : 'Error inesperado');
                return false;
            } finally {
                setBusy(false);
            }
        },
        [load],
    );

    const memberships = useMemo(
        () => (roster?.memberships ?? []).filter((m) => m.status !== 'released'),
        [roster],
    );

    const openSheet = (m: 'single' | 'bulk') => {
        setMode(m);
        setError(null);
        setBulkResult(null);
        setSheetOpen(true);
    };

    const addPlayer = async () => {
        if (!firstName.trim() || !lastName.trim()) {
            setError('Ingresá nombre y apellido del jugador.');
            return;
        }
        const ok = await post({
            action: 'addPlayer',
            rosterId,
            firstName: firstName.trim(),
            lastName: lastName.trim(),
            birthDate: birthDate ? normalizeBirthDate(birthDate) : null,
            jerseyNumber: newJersey ? Number(newJersey) : null,
            status: 'active',
        });
        if (ok) {
            setFirstName('');
            setLastName('');
            setNewJersey('');
            setBirthDate('');
            setSheetOpen(false);
        }
    };

    const runBulk = async () => {
        const lines = bulkText.split('\n').map((l) => l.trim()).filter(Boolean);
        if (lines.length === 0) {
            setError('Pegá al menos una línea.');
            return;
        }
        const parsed = lines.map((raw, i) => parseBulkLine(raw, i + 1));
        setBusy(true);
        setError(null);
        setBulkResult(null);
        const errors: string[] = [];
        let ok = 0;
        for (const row of parsed) {
            if (row.error) {
                errors.push(`Línea ${row.line}: ${row.error}`);
                continue;
            }
            try {
                const res = await fetch('/api/admin/torneo/rosters', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({
                        action: 'addPlayer',
                        rosterId,
                        firstName: row.firstName,
                        lastName: row.lastName,
                        birthDate: row.birthDate,
                        jerseyNumber: row.jerseyNumber,
                        status: 'active',
                    }),
                });
                const payload = await res.json();
                if (!res.ok) throw new Error(payload.error || 'Error');
                ok += 1;
            } catch (e) {
                errors.push(`Línea ${row.line} (${row.raw}): ${e instanceof Error ? e.message : 'error'}`);
            }
        }
        setBulkResult({ ok, errors });
        if (ok > 0) setBulkText('');
        await load();
        setBusy(false);
    };

    if (loading) {
        return <div className={styles.card}>Cargando…</div>;
    }

    return (
        <>
            {error && !sheetOpen && (
                <div className={`${styles.alert} ${styles.alertError}`}>{error}</div>
            )}

            <div className={styles.rosterActions}>
                <button
                    type="button"
                    className={styles.btnPrimaryCompact}
                    onClick={() => openSheet('single')}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
                >
                    <UserPlus size={16} aria-hidden />
                    Agregar jugador
                </button>
                <button
                    type="button"
                    className={styles.btnGhost}
                    onClick={() => openSheet('bulk')}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
                >
                    <ListPlus size={16} aria-hidden />
                    Carga masiva
                </button>
            </div>

            {memberships.length > 0 && (
                <div className={styles.rosterListHeader}>
                    <h3 className={styles.rosterListTitle}>Jugadores</h3>
                    <span className={styles.rosterCount}>
                        {memberships.length} inscrito{memberships.length === 1 ? '' : 's'}
                    </span>
                </div>
            )}

            <div style={{ display: 'grid', gap: 8 }}>
                {memberships.length === 0 && (
                    <div className={`${styles.card} ${styles.rosterEmpty}`}>
                        <div className={styles.rosterEmptyIcon} aria-hidden>
                            <Users size={40} />
                        </div>
                        <p className={styles.rosterEmptyTitle}>Todavía no hay jugadores inscritos.</p>
                        <span className={styles.rosterEmptyHint}>
                            Agregá jugadores manualmente o usá carga masiva para poblar el plantel.
                        </span>
                    </div>
                )}
                {memberships.map((m) => (
                    <div
                        key={m.id}
                        className={styles.card}
                        style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}
                    >
                        <input
                            className={styles.input}
                            type="number"
                            defaultValue={m.jersey_number ?? ''}
                            style={{ width: 70 }}
                            title="Dorsal"
                            onBlur={(e) => {
                                const v = e.target.value ? Number(e.target.value) : null;
                                if (v !== (m.jersey_number ?? null)) {
                                    void post({ action: 'updateMembership', membershipId: m.id, jerseyNumber: v });
                                }
                            }}
                        />
                        <div style={{ minWidth: 180, display: 'flex', flexDirection: 'column' }}>
                            <strong>{personName(m.player)}</strong>
                            <span className={styles.helperText}>
                                {m.player?.birth_date
                                    ? `Nac. ${m.player.birth_date}`
                                    : 'Sin fecha de nacimiento'}
                            </span>
                        </div>
                        <input
                            className={styles.input}
                            placeholder="Posición"
                            defaultValue={m.position ?? ''}
                            style={{ width: 140 }}
                            onBlur={(e) => {
                                if ((e.target.value || '') !== (m.position || '')) {
                                    void post({ action: 'updateMembership', membershipId: m.id, position: e.target.value });
                                }
                            }}
                        />
                        <select
                            className={styles.select}
                            defaultValue={m.role || ''}
                            onChange={(e) =>
                                void post({ action: 'updateMembership', membershipId: m.id, role: e.target.value })
                            }
                        >
                            <option value="">Sin rol</option>
                            <option value="titular">Titular</option>
                            <option value="suplente">Suplente</option>
                        </select>
                        <button
                            type="button"
                            className={styles.btnGhost}
                            disabled={busy}
                            onClick={() => {
                                if (confirm(`¿Quitar a ${personName(m.player)} del plantel?`)) {
                                    void post({ action: 'removeMembership', membershipId: m.id });
                                }
                            }}
                        >
                            Quitar
                        </button>
                    </div>
                ))}
            </div>

            {/* Mobile bottom-sheet — portaled to body so it escapes the
                panel's stacking context (otherwise the fixed bottom nav,
                z-index 45, would sit above it). Hidden on desktop via CSS. */}
            {portalTarget && sheetOpen && createPortal(
                <div
                    className={styles.sheetOverlay}
                    onClick={(e) => {
                        if (e.target === e.currentTarget) setSheetOpen(false);
                    }}
                >
                    <div className={styles.sheet} role="dialog" aria-modal="true">
                        <div className={styles.sheetGrabber} aria-hidden />
                        <div className={styles.sheetHeader}>
                            <div>
                                <h2 className={styles.sheetTitle}>
                                    {mode === 'single' ? 'Agregar jugador al plantel' : 'Carga masiva de jugadores'}
                                </h2>
                                <p className={styles.sheetSubtitle}>
                                    {mode === 'single'
                                        ? 'Completá los datos del jugador tal como aparecerán en el plantel.'
                                        : 'Pegá un jugador por línea. La lista se actualiza al cargar.'}
                                </p>
                            </div>
                            <button
                                type="button"
                                className={styles.sheetClose}
                                aria-label="Cerrar"
                                onClick={() => setSheetOpen(false)}
                            >
                                <X size={20} aria-hidden />
                            </button>
                        </div>

                        <div className={styles.sheetBody}>
                            {error && (
                                <div className={`${styles.alert} ${styles.alertError}`} style={{ margin: 0 }}>
                                    {error}
                                </div>
                            )}

                            {mode === 'single' ? (
                                <>
                                    <div className={styles.sheetField}>
                                        <label className={styles.sheetLabel}>
                                            <span className={styles.sheetLabelTick} aria-hidden />
                                            Número de jugador
                                        </label>
                                        <input
                                            className={`${styles.input} ${styles.sheetMono}`}
                                            placeholder="Ej: 1"
                                            inputMode="numeric"
                                            value={newJersey}
                                            onChange={(e) => setNewJersey(e.target.value)}
                                        />
                                    </div>
                                    <div className={styles.sheetRow}>
                                        <div className={styles.sheetField}>
                                            <label className={styles.sheetLabel}>Nombre</label>
                                            <input
                                                className={styles.input}
                                                placeholder="Ej: Juan"
                                                value={firstName}
                                                onChange={(e) => setFirstName(e.target.value)}
                                            />
                                        </div>
                                        <div className={styles.sheetField}>
                                            <label className={styles.sheetLabel}>Apellido</label>
                                            <input
                                                className={styles.input}
                                                placeholder="Ej: Pérez"
                                                value={lastName}
                                                onChange={(e) => setLastName(e.target.value)}
                                            />
                                        </div>
                                    </div>
                                    <div className={styles.sheetField}>
                                        <label className={styles.sheetLabel}>Fecha de nacimiento</label>
                                        <div className={styles.sheetDateWrap}>
                                            <CalendarDays className={styles.sheetDateIcon} size={18} aria-hidden />
                                            <input
                                                className={`${styles.input} ${styles.sheetMono}`}
                                                placeholder="DD/MM/AAAA"
                                                inputMode="numeric"
                                                value={birthDate}
                                                onChange={(e) => setBirthDate(e.target.value)}
                                            />
                                        </div>
                                    </div>
                                </>
                            ) : (
                                <>
                                    <p className={styles.helperText} style={{ margin: 0 }}>
                                        Formato por línea:&nbsp;
                                        <strong>N° - Nombre Apellido - Fecha de nacimiento</strong>
                                        <br />
                                        Ej: <code>10 - Juan Pérez - 2000-05-12</code> · la fecha es
                                        opcional (2000-05-12 o 12/05/2000).
                                    </p>
                                    <textarea
                                        className={styles.textarea}
                                        rows={8}
                                        placeholder={'1 - Juan Pérez - 2000-05-12\n2 - María Gómez - 14/03/1999\n3 - Carlos Díaz'}
                                        value={bulkText}
                                        onChange={(e) => setBulkText(e.target.value)}
                                    />
                                    {bulkResult && (
                                        <span className={styles.helperText}>
                                            {bulkResult.ok} agregado{bulkResult.ok === 1 ? '' : 's'}
                                            {bulkResult.errors.length > 0 ? ` · ${bulkResult.errors.length} con error` : ''}
                                        </span>
                                    )}
                                    {bulkResult && bulkResult.errors.length > 0 && (
                                        <div className={`${styles.alert} ${styles.alertError}`} style={{ margin: 0 }}>
                                            {bulkResult.errors.map((er, i) => (
                                                <div key={i}>{er}</div>
                                            ))}
                                        </div>
                                    )}
                                </>
                            )}
                        </div>

                        <div className={styles.sheetFooter}>
                            <button
                                type="button"
                                className={styles.sheetSubmit}
                                disabled={busy}
                                onClick={mode === 'single' ? addPlayer : runBulk}
                            >
                                {mode === 'single' ? (
                                    <>
                                        <UserPlus size={18} aria-hidden />
                                        {busy ? 'Agregando…' : 'Agregar jugador'}
                                    </>
                                ) : (
                                    <>
                                        <ListPlus size={18} aria-hidden />
                                        {busy ? 'Cargando…' : 'Cargar jugadores'}
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>,
                portalTarget,
            )}
        </>
    );
}
