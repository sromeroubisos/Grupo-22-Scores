'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { db } from '@/lib/mock-db';
import styles from '../page.module.css';
import { useSuperConsole } from '../SuperConsoleContext';
import { useRouter } from 'next/navigation';

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
    const router = useRouter();
    const [seasonFilter, setSeasonFilter] = useState('all');
    const [folderFilter, setFolderFilter] = useState('all');

    // Force re-render trick for mock updates
    const [tick, setTick] = useState(0);

    const tournaments = useMemo(() => {
        return db.tournaments.map((t, index) => {
            const matchesCount = db.matches.filter((m) => m.tournamentId === t.id).length;
            // Handle null unionId for country logic (or fallback)
            const union = db.unions.find(u => u.id === t.unionId);
            const country = union ? (union.id === 'uar' ? 'Argentina' : 'Uruguay') : 'Global (No Union)';

            const status = t.status === 'published' ? 'Activo' : 'Borrador'; // Simplified mapping
            const statusKey = status === 'Activo' ? 'activo' : 'borrador';
            const source = t.slug.includes('api') ? 'API' : 'Manual';

            return {
                id: t.id,
                unionId: t.unionId,
                unionName: union ? union.name : 'Sin Vínculo', // Display text
                name: t.name,
                season: t.seasonId,
                sport: t.sport,
                sportLabel: sportLabels[t.sport] || t.sport,
                country,
                status,
                statusKey,
                source,
                updated: 'Hace 1 d',
                followers: 1280 + index * 210,
                views: 32400 + index * 890,
                matches: matchesCount,
                folders: ['En desarrollo'],
                logo: t.unionId ? '🏆' : '❓'
            };
        });
    }, [tick]); // Re-compute when tick changes

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

    const [linkingTournamentId, setLinkingTournamentId] = useState<string | null>(null);
    const [selectedUnionId, setSelectedUnionId] = useState<string>('');

    const openLinkModal = (id: string) => {
        setLinkingTournamentId(id);
        setSelectedUnionId('');
    };

    const confirmLink = () => {
        if (linkingTournamentId && selectedUnionId) {
            const tournamentIndex = db.tournaments.findIndex(t => t.id === linkingTournamentId);
            if (tournamentIndex !== -1) {
                const union = db.unions.find(u => u.id === selectedUnionId);
                db.tournaments[tournamentIndex].unionId = selectedUnionId;
                alert(`Torneo vinculado a ${union?.name}`);
                setTick(t => t + 1);
                setLinkingTournamentId(null);
            }
        }
    };

    return (
        <div style={{ paddingBottom: '40px', position: 'relative' }}>
            <div className={styles.consoleHeader}>
                <div>
                    <div className={styles.consoleTitle}>Torneos</div>
                    <div className={styles.consoleSubtitle}>Gestión global de competiciones</div>
                </div>
                <div className={styles.consoleActions}>
                    <Link href="/admin/super/torneos/crear" className={`${styles.cardAction} ${styles.cardActionPrimary}`}>
                        + Nuevo Torneo
                    </Link>
                </div>
            </div>

            <div className={styles.filterBar}>
                <span className={styles.filterLabel}>Filtros locales</span>
                <select className={styles.filterControl} value={seasonFilter} onChange={(event) => setSeasonFilter(event.target.value)}>
                    <option value="all">Temporada</option>
                    <option value="2026">2026</option>
                    <option value="2025">2025</option>
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
                                        <div className={styles.cardMeta}>
                                            {tournament.season} · {tournament.sportLabel} ·
                                            <span style={{ color: tournament.unionId ? '#22c55e' : '#eab308', marginLeft: 6 }}>
                                                {tournament.unionName}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                                <div className={styles.badgeRow}>
                                    <span className={`${styles.badgePill} ${tournament.status === 'Activo' ? styles.badgeActive : styles.badgeArchived}`}>
                                        {tournament.status}
                                    </span>
                                    <span className={`${styles.badgePill} ${tournament.source === 'API' ? styles.badgeApiAlt : styles.badgeManualAlt}`}>
                                        {tournament.source}
                                    </span>
                                </div>
                                <div className={styles.metricsGrid}>
                                    <div className={styles.metricItem}>
                                        <span className={styles.metricLabel}>Matches</span>
                                        <span className={styles.metricValue}>{tournament.matches}</span>
                                    </div>
                                </div>
                                <div className={styles.cardActions}>
                                    <Link href={`/admin/super/torneos/${tournament.id}`} className={styles.cardAction}>Ver</Link>
                                    <Link href={`/admin/super/torneos/crear?tournamentId=${tournament.id}`} className={styles.cardAction}>
                                        Editar
                                    </Link>
                                    {!tournament.unionId && (
                                        <button
                                            className={styles.cardAction}
                                            style={{ color: '#eab308' }}
                                            onClick={() => openLinkModal(tournament.id)}
                                        >
                                            Vincular
                                        </button>
                                    )}
                                    <button className={`${styles.cardAction} ${styles.cardActionPrimary}`}>Sync</button>
                                </div>
                            </div>
                        ))}
                    </div>
                </section>
            ))}

            {linkingTournamentId && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(4px)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100
                }}>
                    <div style={{
                        background: '#0b1016', border: '1px solid rgba(255,255,255,0.1)',
                        padding: 24, borderRadius: 12, minWidth: 320, maxWidth: 400
                    }}>
                        <h3 style={{ margin: '0 0 16px', color: 'white' }}>Vincular Unión</h3>
                        <p style={{ color: '#aaa', fontSize: 13, marginBottom: 16 }}>
                            Selecciona una unión existente para vincular este torneo.
                        </p>
                        <select
                            value={selectedUnionId}
                            onChange={(e) => setSelectedUnionId(e.target.value)}
                            style={{ width: '100%', padding: 12, borderRadius: 6, background: '#1a1d24', border: '1px solid #333', color: 'white', marginBottom: 20 }}
                        >
                            <option value="">Seleccionar Unión...</option>
                            {db.unions.map(u => (
                                <option key={u.id} value={u.id}>{u.name}</option>
                            ))}
                        </select>
                        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                            <button
                                onClick={() => setLinkingTournamentId(null)}
                                style={{ background: 'transparent', border: '1px solid #333', color: '#ccc', padding: '8px 16px', borderRadius: 6, cursor: 'pointer' }}
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={confirmLink}
                                disabled={!selectedUnionId}
                                style={{ background: selectedUnionId ? '#22c55e' : '#333', border: 'none', color: selectedUnionId ? 'black' : '#666', padding: '8px 16px', borderRadius: 6, cursor: selectedUnionId ? 'pointer' : 'not-allowed', fontWeight: 600 }}
                            >
                                Vincular
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
