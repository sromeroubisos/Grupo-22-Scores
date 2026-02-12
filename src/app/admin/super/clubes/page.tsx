'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { db } from '@/lib/mock-db';
import styles from '../page.module.css';
import { useSuperConsole } from '../SuperConsoleContext';

const countryFlags: Record<string, string> = {
    Argentina: '🇦🇷',
    Uruguay: '🇺🇾',
    Chile: '🇨🇱'
};

const clubSports: Record<string, string[]> = {
    sic: ['rugby', 'hockey'],
    casi: ['rugby'],
    hindu: ['rugby'],
    belgrano: ['rugby', 'football'],
    alumni: ['rugby'],
    newman: ['rugby', 'hockey']
};

const sportLabels: Record<string, string> = {
    rugby: 'Rugby',
    football: 'Futbol',
    hockey: 'Hockey'
};

export default function SuperadminClubesPage() {
    const { filters } = useSuperConsole();

    const clubs = useMemo(() => {
        return db.clubs.map((c, index) => {
            const tournaments = new Set<string>();
            db.matches.filter((m) => m.homeClubId === c.id || m.awayClubId === c.id).forEach((m) => {
                tournaments.add(m.tournamentId);
            });

            const sports = clubSports[c.id] || ['rugby'];
            const country = c.unionId === 'uar' ? 'Argentina' : 'Uruguay';
            const verified = index % 2 === 0;
            const apiLinked = index % 3 !== 0;
            const statusKey = verified ? 'activo' : 'pendiente';
            const source = apiLinked ? 'API' : 'Manual';

            return {
                id: c.id,
                unionId: c.unionId,
                name: c.name,
                shortName: c.shortName,
                city: c.city,
                logo: c.logoUrl || '⚽',
                sports,
                country,
                verified,
                apiLinked,
                statusKey,
                source,
                followers: 980 + index * 140,
                views: 14600 + index * 530,
                matchesThisMonth: tournaments.size * 2 + 3
            };
        });
    }, []);

    const filtered = clubs.filter((club) => {
        if (filters.sport !== 'all' && !club.sports.includes(filters.sport)) return false;
        if (filters.country !== 'all' && club.country !== filters.country) return false;
        if (filters.status !== 'all' && club.statusKey !== filters.status) return false;
        if (filters.source !== 'all' && club.source !== filters.source) return false;
        if (filters.search && !club.name.toLowerCase().includes(filters.search.toLowerCase())) return false;
        return true;
    });

    const grouped = filtered.reduce<Record<string, Record<string, typeof filtered>>>((acc, club) => {
        club.sports.forEach((sport) => {
            if (filters.sport !== 'all' && sport !== filters.sport) return;
            if (!acc[sport]) acc[sport] = {};
            if (!acc[sport][club.country]) acc[sport][club.country] = [];
            acc[sport][club.country].push(club);
        });
        return acc;
    }, {});

    const createUnionId = db.unions[0]?.id;

    return (
        <div style={{ paddingBottom: '40px' }}>
            <div className={styles.consoleHeader}>
                <div>
                    <div className={styles.consoleTitle}>Clubes</div>
                    <div className={styles.consoleSubtitle}>Multiples deportes + metricas</div>
                </div>
                <div className={styles.consoleActions}>
                    {createUnionId ? (
                        <Link href={`/admin/union/${createUnionId}/clubes/crear?from=super`} className={`${styles.cardAction} ${styles.cardActionPrimary}`}>
                            + Crear
                        </Link>
                    ) : (
                        <button className={`${styles.cardAction} ${styles.cardActionPrimary}`} disabled>
                            + Crear
                        </button>
                    )}
                </div>
            </div>

            {Object.keys(grouped).length === 0 && (
                <div className={styles.cardItem}>No se encontraron clubes con los filtros actuales.</div>
            )}

            {Object.entries(grouped).map(([sport, countries]) => (
                <section key={sport} className={styles.groupSection}>
                    <div className={styles.groupHeader}>
                        <span className={styles.groupTitle}>{sportLabels[sport] || sport}</span>
                        <span className={styles.groupMeta}>clubes por pais</span>
                    </div>
                    {Object.entries(countries).map(([country, items]) => (
                        <div key={country} className={styles.subGroup}>
                            <div className={styles.subGroupHeader}>
                                <span className={styles.groupFlag}>{countryFlags[country] || '🌐'}</span>
                                <span className={styles.groupTitle}>{country}</span>
                                <span className={styles.groupMeta}>{items.length} clubes</span>
                            </div>
                            <div className={styles.cardGrid}>
                                {items.map((club) => (
                                    <div key={`${sport}-${club.id}`} className={styles.cardItem}>
                                        <div className={styles.cardHeader}>
                                            <div className={styles.cardLogo}>{club.logo}</div>
                                            <div>
                                                <div className={styles.cardTitle}>{club.name}</div>
                                                <div className={styles.cardMeta}>{club.city}</div>
                                                <div className={styles.sportTags}>
                                                    {club.sports.map((sportName) => (
                                                        <span key={sportName} className={styles.sportTag}>{sportLabels[sportName]}</span>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                        <div className={styles.badgeRow}>
                                            <span className={`${styles.badgePill} ${club.verified ? styles.badgeActive : styles.badgeArchived}`}>
                                                {club.verified ? 'Verificado' : 'En revision'}
                                            </span>
                                            <span className={`${styles.badgePill} ${club.apiLinked ? styles.badgeApiAlt : styles.badgeManualAlt}`}>
                                                {club.apiLinked ? 'API' : 'Manual'}
                                            </span>
                                        </div>
                                        <div className={styles.metricsGrid}>
                                            <div className={styles.metricItem}>
                                                <span className={styles.metricLabel}>Seguidores</span>
                                                <span className={styles.metricValue}>{club.followers}</span>
                                            </div>
                                            <div className={styles.metricItem}>
                                                <span className={styles.metricLabel}>Views mes</span>
                                                <span className={styles.metricValue}>{club.views}</span>
                                            </div>
                                            <div className={styles.metricItem}>
                                                <span className={styles.metricLabel}>Partidos</span>
                                                <span className={styles.metricValue}>{club.matchesThisMonth}</span>
                                            </div>
                                        </div>
                                        <div className={styles.cardActions}>
                                            <Link href={`/admin/super/clubes/${club.id}`} className={styles.cardAction}>
                                                Ver
                                            </Link>
                                            <Link href={`/admin/union/${club.unionId}/clubes/crear?clubId=${club.id}&from=super`} className={styles.cardAction}>
                                                Editar
                                            </Link>
                                            <button className={styles.cardAction}>Deportes</button>
                                            <button className={`${styles.cardAction} ${styles.cardActionPrimary}`}>Sync</button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </section>
            ))}
        </div>
    );
}
