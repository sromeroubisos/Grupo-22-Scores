'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import styles from '../../../tournament-admin.module.css';
import RosterPlantelEditor from '../../../equipos/RosterPlantelEditor';

type ClubRoster = {
    id: string;
    tournament_id: string | null;
    status: string | null;
    club?: { id: string; name: string } | null;
    team?: { id: string; name: string; category: string | null } | null;
    memberships?: { status: string | null }[];
    tournament?: { id: string; name: string; display_name: string | null } | null;
};

function tournamentLabel(roster: ClubRoster): string {
    return (
        roster.tournament?.display_name ||
        roster.tournament?.name ||
        'Torneo'
    );
}

export default function ClubPlantelPage() {
    const params = useParams<{ clubId: string }>();
    const clubId = params?.clubId ?? '';

    const [rosters, setRosters] = useState<ClubRoster[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedId, setSelectedId] = useState<string>('');

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(
                `/api/admin/torneo/rosters?clubId=${encodeURIComponent(clubId)}`,
                { cache: 'no-store', credentials: 'include' },
            );
            const payload = await res.json();
            if (!res.ok) throw new Error(payload.error || 'No se pudieron cargar los planteles del club');
            const list: ClubRoster[] = Array.isArray(payload.data?.rosters) ? payload.data.rosters : [];
            setRosters(list);
            setSelectedId((current) => (current && list.some((r) => r.id === current) ? current : list[0]?.id ?? ''));
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Error inesperado');
        } finally {
            setLoading(false);
        }
    }, [clubId]);

    useEffect(() => {
        void load();
    }, [load]);

    const clubName = useMemo(
        () => rosters.find((r) => r.club?.name)?.club?.name || 'Club',
        [rosters],
    );
    const selected = useMemo(
        () => rosters.find((r) => r.id === selectedId) ?? null,
        [rosters, selectedId],
    );

    return (
        <div>
            <div className={styles.pageHeader}>
                <div>
                    <nav className={styles.breadcrumb} aria-label="Ruta">
                        <Link href="/admin/torneo/clubes" className={styles.breadcrumbLink}>Clubes</Link>
                        <span className={styles.breadcrumbSep}>›</span>
                        <span>{clubName}</span>
                        <span className={styles.breadcrumbSep}>›</span>
                        <span className={styles.breadcrumbCurrent}>Plantel</span>
                    </nav>
                    <h1 className={styles.pageTitle} style={{ textTransform: 'uppercase' }}>{clubName}</h1>
                    <p className={styles.pageSubtitle}>Plantel del club</p>
                </div>
                <Link className={styles.btnGhost} href="/admin/torneo/clubes">← Volver a clubes</Link>
            </div>

            {error && (
                <div className={`${styles.alert} ${styles.alertError}`}>{error}</div>
            )}

            {loading ? (
                <div className={styles.card}>Cargando…</div>
            ) : rosters.length === 0 ? (
                <div className={`${styles.cardStatic} ${styles.empty}`}>
                    Este club todavía no tiene plantel en ninguno de tus torneos. Vinculá el club
                    a un torneo desde la lista de clubes para empezar a cargar jugadores.
                </div>
            ) : (
                <>
                    {rosters.length > 1 && (
                        <div
                            className={`${styles.cardStatic}`}
                            style={{ padding: 16, marginBottom: 16 }}
                        >
                            <p className={styles.fieldLabel} style={{ marginBottom: 10 }}>
                                Torneo
                            </p>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                                {rosters.map((r) => (
                                    <button
                                        key={r.id}
                                        type="button"
                                        className={r.id === selectedId ? styles.btnPrimaryCompact : styles.btnGhost}
                                        onClick={() => setSelectedId(r.id)}
                                    >
                                        {tournamentLabel(r)}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {selected && selected.tournament_id ? (
                        <>
                            {rosters.length === 1 && (
                                <div className={styles.tournamentLine}>
                                    <span className={styles.tournamentLineLabel}>Torneo:</span>
                                    <strong>{tournamentLabel(selected)}</strong>
                                </div>
                            )}
                            <RosterPlantelEditor
                                key={selected.id}
                                rosterId={selected.id}
                                tournamentId={selected.tournament_id}
                            />
                        </>
                    ) : (
                        <div className={`${styles.cardStatic} ${styles.empty}`}>
                            No se pudo resolver el torneo de este plantel.
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
