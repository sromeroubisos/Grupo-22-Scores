'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import styles from '../tournament-admin.module.css';

type Tournament = { id: string; name: string; display_name: string | null };

type RosterMembership = { id: string; status: string | null };
type Roster = {
    id: string;
    name: string | null;
    status: string | null;
    club?: { id: string; name: string } | null;
    team?: { id: string; name: string; category: string | null } | null;
    memberships?: RosterMembership[];
};

export default function TournamentAdminTeamsPage() {
    const [tournaments, setTournaments] = useState<Tournament[]>([]);
    const [selectedId, setSelectedId] = useState('');
    const [rosters, setRosters] = useState<Roster[]>([]);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        (async () => {
            try {
                const res = await fetch('/api/admin/torneo/tournaments?limit=300', {
                    cache: 'no-store',
                    credentials: 'include',
                });
                const payload = await res.json();
                if (!res.ok) throw new Error(payload.error || 'No se pudieron cargar los torneos');
                setTournaments(Array.isArray(payload.data) ? payload.data : []);
            } catch (e) {
                setError(e instanceof Error ? e.message : 'Error inesperado');
            } finally {
                setLoading(false);
            }
        })();
    }, []);

    const loadRosters = useCallback(async (tournamentId: string) => {
        if (!tournamentId) {
            setRosters([]);
            return;
        }
        setBusy(true);
        setError(null);
        try {
            const res = await fetch(
                `/api/admin/torneo/rosters?tournamentId=${encodeURIComponent(tournamentId)}`,
                { cache: 'no-store', credentials: 'include' },
            );
            const payload = await res.json();
            if (!res.ok) throw new Error(payload.error || 'No se pudieron cargar los planteles');
            setRosters(Array.isArray(payload.data?.rosters) ? payload.data.rosters : []);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Error inesperado');
            setRosters([]);
        } finally {
            setBusy(false);
        }
    }, []);

    useEffect(() => {
        void loadRosters(selectedId);
    }, [selectedId, loadRosters]);

    const ensureRosters = async () => {
        if (!selectedId) return;
        setBusy(true);
        setError(null);
        try {
            const res = await fetch('/api/admin/torneo/rosters', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ action: 'ensureFromEntries', tournamentId: selectedId }),
            });
            const payload = await res.json();
            if (!res.ok) throw new Error(payload.error || 'No se pudieron generar los planteles');
            await loadRosters(selectedId);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Error inesperado');
        } finally {
            setBusy(false);
        }
    };

    return (
        <div>
            <div className={styles.pageHeader}>
                <div>
                    <p className={styles.eyebrow}>Inscripción de equipos</p>
                    <h1 className={styles.pageTitle}>Equipos / Plantel del torneo</h1>
                    <p className={styles.pageSubtitle}>
                        Administrá el plantel inscrito de cada equipo dentro de tus torneos. Solo ves
                        torneos a los que tenés acceso.
                    </p>
                </div>
            </div>

            <div className={styles.card} style={{ marginBottom: 20 }}>
                <label className="text-[12px] font-semibold block mb-1">Torneo</label>
                <select
                    className={styles.select}
                    value={selectedId}
                    onChange={(e) => setSelectedId(e.target.value)}
                    disabled={loading}
                    style={{ minWidth: 280 }}
                >
                    <option value="">{loading ? 'Cargando…' : 'Seleccioná un torneo'}</option>
                    {tournaments.map((t) => (
                        <option key={t.id} value={t.id}>{t.display_name || t.name}</option>
                    ))}
                </select>
            </div>

            {error && (
                <div className={styles.card} style={{ borderColor: 'var(--status-error)', marginBottom: 16 }}>
                    {error}
                </div>
            )}

            {selectedId && !busy && rosters.length === 0 && !error && (
                <div className={styles.card}>
                    <p style={{ marginBottom: 12 }}>
                        Este torneo todavía no tiene planteles generados para sus equipos.
                    </p>
                    <button type="button" className={styles.btnPrimary} onClick={ensureRosters}>
                        Generar planteles desde los participantes
                    </button>
                </div>
            )}

            {busy && <div className={styles.card}>Cargando planteles…</div>}

            {!busy && rosters.length > 0 && (
                <div style={{ display: 'grid', gap: 12 }}>
                    {rosters.map((r) => {
                        const active = (r.memberships ?? []).filter((m) => m.status === 'active').length;
                        return (
                            <div
                                key={r.id}
                                className={styles.card}
                                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}
                            >
                                <div>
                                    <strong>{r.team?.name || r.club?.name || r.name || 'Equipo'}</strong>
                                    <div className="text-[12px] opacity-70">
                                        {r.club?.name}
                                        {r.team?.category ? ` · ${r.team.category}` : ''} · {active} jugadores
                                        {' · '}
                                        {r.status || 'draft'}
                                    </div>
                                </div>
                                <Link
                                    className={styles.btnPrimary}
                                    href={`/admin/torneo/equipos/${r.id}?tournamentId=${encodeURIComponent(selectedId)}`}
                                >
                                    Editar plantel
                                </Link>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
