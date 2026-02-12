'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { db } from '@/lib/mock-db';
import styles from '../page.module.css';
import { useSuperConsole } from '../SuperConsoleContext';

function formatDateTime(value: string) {
    try {
        return new Date(value).toLocaleString('es-AR', {
            dateStyle: 'short',
            timeStyle: 'short'
        });
    } catch {
        return value;
    }
}

const sportLabels: Record<string, string> = {
    rugby: 'Rugby',
    football: 'Futbol',
    hockey: 'Hockey'
};

export default function SuperadminPartidosPage() {
    const { filters } = useSuperConsole();
    const [viewMode, setViewMode] = useState<'cards' | 'calendar'>('cards');

    const matches = useMemo(() => {
        return db.matches.map((m, index) => {
            const tournament = db.tournaments.find((t) => t.id === m.tournamentId);
            const home = db.clubs.find((c) => c.id === m.homeClubId);
            const away = db.clubs.find((c) => c.id === m.awayClubId);
            const sport = tournament?.sport || 'rugby';
            const country = tournament?.unionId === 'uar' ? 'Argentina' : 'Uruguay';
            const source = index % 2 === 0 ? 'API' : 'Manual';
            const syncStatus = index % 3 === 0 ? 'Error' : 'OK';

            return {
                id: m.id,
                tournamentName: tournament?.name || 'Torneo',
                homeName: home?.name || 'Local',
                awayName: away?.name || 'Visitante',
                dateTime: m.dateTime,
                status: m.status,
                sport,
                country,
                source,
                views: 1200 + index * 340,
                syncStatus
            };
        });
    }, []);

    const filtered = matches.filter((match) => {
        if (filters.sport !== 'all' && match.sport !== filters.sport) return false;
        if (filters.country !== 'all' && match.country !== filters.country) return false;
        if (filters.source !== 'all' && match.source !== filters.source) return false;
        if (filters.search) {
            const term = filters.search.toLowerCase();
            const matchText = `${match.homeName} ${match.awayName} ${match.tournamentName}`.toLowerCase();
            if (!matchText.includes(term)) return false;
        }
        return true;
    });

    const grouped = filtered.reduce<Record<string, typeof filtered>>((acc, match) => {
        if (!acc[match.sport]) acc[match.sport] = [];
        acc[match.sport].push(match);
        return acc;
    }, {});

    return (
        <div style={{ paddingBottom: '40px' }}>
            <div className={styles.consoleHeader}>
                <div>
                    <div className={styles.consoleTitle}>Partidos</div>
                    <div className={styles.consoleSubtitle}>Vista calendario + cards</div>
                </div>
                <div className={styles.consoleActions}>
                    <button
                        className={styles.cardAction}
                        onClick={() => setViewMode('calendar')}
                    >
                        Calendario
                    </button>
                    <button
                        className={`${styles.cardAction} ${styles.cardActionPrimary}`}
                        onClick={() => setViewMode('cards')}
                    >
                        Cards
                    </button>
                    <Link href="/admin/matches/m1" className={styles.cardAction}>
                        Consola
                    </Link>
                </div>
            </div>

            {viewMode === 'calendar' && (
                <div className={styles.cardItem}>
                    Vista calendario en construccion. La vista cards esta activa.
                </div>
            )}

            {viewMode === 'cards' && Object.keys(grouped).length === 0 && (
                <div className={styles.cardItem}>No se encontraron partidos con los filtros actuales.</div>
            )}

            {viewMode === 'cards' && Object.entries(grouped).map(([sport, list]) => (
                <section key={sport} className={styles.groupSection}>
                    <div className={styles.groupHeader}>
                        <span className={styles.groupTitle}>{sportLabels[sport] || sport}</span>
                        <span className={styles.groupMeta}>{list.length} partidos</span>
                    </div>
                    <div className={styles.cardGrid}>
                        {list.map((match) => (
                            <div key={match.id} className={styles.cardItem}>
                                <div className={styles.cardHeader}>
                                    <div>
                                        <div className={styles.cardTitle}>{match.homeName} vs {match.awayName}</div>
                                        <div className={styles.cardMeta}>{match.tournamentName}</div>
                                    </div>
                                </div>
                                <div className={styles.badgeRow}>
                                    <span className={`${styles.badgePill} ${match.status === 'live' ? styles.badgeLive : match.status === 'final' ? styles.badgeActive : styles.badgeArchived}`}>
                                        {match.status === 'live' ? 'En vivo' : match.status === 'final' ? 'Finalizado' : 'Programado'}
                                    </span>
                                    <span className={`${styles.badgePill} ${match.source === 'API' ? styles.badgeApiAlt : styles.badgeManualAlt}`}>
                                        {match.source}
                                    </span>
                                </div>
                                <div className={styles.metricsGrid}>
                                    <div className={styles.metricItem}>
                                        <span className={styles.metricLabel}>Fecha</span>
                                        <span className={styles.metricValue}>{formatDateTime(match.dateTime)}</span>
                                    </div>
                                    <div className={styles.metricItem}>
                                        <span className={styles.metricLabel}>Views</span>
                                        <span className={styles.metricValue}>{match.views}</span>
                                    </div>
                                    <div className={styles.metricItem}>
                                        <span className={styles.metricLabel}>Sync</span>
                                        <span className={`${styles.metricValue} ${match.syncStatus === 'OK' ? styles.statusOk : styles.statusError}`}>
                                            {match.syncStatus}
                                        </span>
                                    </div>
                                </div>
                                <div className={styles.cardActions}>
                                    <Link href={`/admin/super/partidos/${match.id}`} className={styles.cardAction}>Ver</Link>
                                    <button className={styles.cardAction}>Sync</button>
                                    <button className={`${styles.cardAction} ${styles.cardActionPrimary}`}>Abrir</button>
                                </div>
                            </div>
                        ))}
                    </div>
                </section>
            ))}
        </div>
    );
}
