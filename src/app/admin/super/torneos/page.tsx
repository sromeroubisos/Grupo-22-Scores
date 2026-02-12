'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { db } from '@/lib/mock-db';
import styles from '../page.module.css';
import { useSuperConsole } from '../SuperConsoleContext';

const countryFlags: Record<string, string> = {
    Argentina: '🇦🇷',
    Uruguay: '🇺🇾',
    Chile: '🇨🇱'
};

const sportLabels: Record<string, string> = {
    rugby: 'Rugby',
    football: 'Futbol',
    hockey: 'Hockey'
};

const folderOptions = ['Sudamerica', 'Juveniles', 'Top 5', 'En desarrollo'];

export default function SuperadminTorneosPage() {
    const { filters } = useSuperConsole();
    const [seasonFilter, setSeasonFilter] = useState('all');
    const [folderFilter, setFolderFilter] = useState('all');

    const tournaments = useMemo(() => {
        return db.tournaments.map((t, index) => {
            const matchesCount = db.matches.filter((m) => m.tournamentId === t.id).length;
            const country = t.unionId === 'uar' ? 'Argentina' : 'Uruguay';
            const status = index === 0 ? 'Activo' : index === 1 ? 'Finalizado' : 'Archivado';
            const statusKey = status === 'Activo' ? 'activo' : status === 'Finalizado' ? 'finalizado' : 'archivado';
            const source = index % 2 === 0 ? 'API' : 'Manual';

            return {
                id: t.id,
                unionId: t.unionId,
                name: t.name,
                season: t.seasonId,
                sport: t.sport,
                sportLabel: sportLabels[t.sport] || 'Deporte',
                country,
                status,
                statusKey,
                source,
                updated: index === 0 ? 'Hace 2 h' : 'Hace 1 d',
                followers: 1280 + index * 210,
                views: 32400 + index * 890,
                matches: matchesCount,
                folders: index === 0 ? ['Sudamerica', 'Top 5'] : ['En desarrollo'],
                logo: '🏆'
            };
        });
    }, []);

    const filtered = tournaments.filter((t) => {
        if (filters.sport !== 'all' && t.sport !== filters.sport) return false;
        if (filters.country !== 'all' && t.country !== filters.country) return false;
        if (filters.status !== 'all' && t.statusKey !== filters.status) return false;
        if (filters.source !== 'all' && t.source !== filters.source) return false;
        if (filters.search && !t.name.toLowerCase().includes(filters.search.toLowerCase())) return false;
        if (seasonFilter !== 'all' && t.season !== seasonFilter) return false;
        if (folderFilter !== 'all' && !t.folders.includes(folderFilter)) return false;
        return true;
    });

    const grouped = filtered.reduce<Record<string, typeof filtered>>((acc, tournament) => {
        if (!acc[tournament.country]) acc[tournament.country] = [];
        acc[tournament.country].push(tournament);
        return acc;
    }, {});

    const createUnionId = db.unions[0]?.id;

    return (
        <div style={{ paddingBottom: '40px' }}>
            <div className={styles.consoleHeader}>
                <div>
                    <div className={styles.consoleTitle}>Torneos</div>
                    <div className={styles.consoleSubtitle}>Cartas + metricas mensuales</div>
                </div>
                <div className={styles.consoleActions}>
                    {createUnionId ? (
                        <Link href={`/admin/union/${createUnionId}/torneos/crear?from=super`} className={`${styles.cardAction} ${styles.cardActionPrimary}`}>
                            + Crear
                        </Link>
                    ) : (
                        <button className={`${styles.cardAction} ${styles.cardActionPrimary}`} disabled>
                            + Crear
                        </button>
                    )}
                </div>
            </div>

            <div className={styles.filterBar}>
                <span className={styles.filterLabel}>Filtros locales</span>
                <select className={styles.filterControl} value={seasonFilter} onChange={(event) => setSeasonFilter(event.target.value)}>
                    <option value="all">Temporada</option>
                    <option value="2026">2026</option>
                    <option value="2025">2025</option>
                </select>
                <select className={styles.filterControl} value={folderFilter} onChange={(event) => setFolderFilter(event.target.value)}>
                    <option value="all">Carpeta</option>
                    {folderOptions.map((folder) => (
                        <option key={folder} value={folder}>{folder}</option>
                    ))}
                </select>
            </div>

            {Object.keys(grouped).length === 0 && (
                <div className={styles.cardItem}>No se encontraron torneos con los filtros actuales.</div>
            )}

            {Object.entries(grouped).map(([country, items]) => (
                <section key={country} className={styles.groupSection}>
                    <div className={styles.groupHeader}>
                        <span className={styles.groupFlag}>{countryFlags[country] || '🌐'}</span>
                        <span className={styles.groupTitle}>{country}</span>
                        <span className={styles.groupMeta}>{items.length} torneos</span>
                    </div>
                    <div className={styles.cardGrid}>
                        {items.map((tournament) => (
                            <div key={tournament.id} className={styles.cardItem}>
                                <div className={styles.cardHeader}>
                                    <div className={styles.cardLogo}>{tournament.logo}</div>
                                    <div>
                                        <div className={styles.cardTitle}>{tournament.name}</div>
                                        <div className={styles.cardMeta}>{tournament.season} · {tournament.sportLabel}</div>
                                    </div>
                                </div>
                                <div className={styles.badgeRow}>
                                    <span className={`${styles.badgePill} ${tournament.status === 'Activo' ? styles.badgeActive : tournament.status === 'Finalizado' ? styles.badgeFinal : styles.badgeArchived}`}>
                                        {tournament.status}
                                    </span>
                                    <span className={`${styles.badgePill} ${tournament.source === 'API' ? styles.badgeApiAlt : styles.badgeManualAlt}`}>
                                        {tournament.source}
                                    </span>
                                </div>
                                <div className={styles.metricsGrid}>
                                    <div className={styles.metricItem}>
                                        <span className={styles.metricLabel}>Seguidores</span>
                                        <span className={styles.metricValue}>{tournament.followers}</span>
                                    </div>
                                    <div className={styles.metricItem}>
                                        <span className={styles.metricLabel}>Views mes</span>
                                        <span className={styles.metricValue}>{tournament.views}</span>
                                    </div>
                                    <div className={styles.metricItem}>
                                        <span className={styles.metricLabel}>Partidos</span>
                                        <span className={styles.metricValue}>{tournament.matches}</span>
                                    </div>
                                </div>
                                <div className={styles.badgeRow}>
                                    {tournament.folders.map((folder) => (
                                        <span key={folder} className={styles.badgePill}>{folder}</span>
                                    ))}
                                    <span className={styles.cardMeta}>Actualizado {tournament.updated}</span>
                                </div>
                                <div className={styles.cardActions}>
                                    <Link href={`/admin/super/torneos/${tournament.id}`} className={styles.cardAction}>Ver</Link>
                                    <Link href={`/admin/union/${tournament.unionId}/torneos/crear?tournamentId=${tournament.id}&from=super`} className={styles.cardAction}>
                                        Editar
                                    </Link>
                                    <button className={styles.cardAction}>Vincular</button>
                                    <button className={`${styles.cardAction} ${styles.cardActionPrimary}`}>Sync</button>
                                </div>
                            </div>
                        ))}
                    </div>
                </section>
            ))}
        </div>
    );
}
