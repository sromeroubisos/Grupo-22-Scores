'use client';

import { useMemo, useState, useEffect } from 'react';
import Link from 'next/link';
import { db } from '@/lib/mock-db';
import styles from '../page.module.css';
import { useSuperConsole } from '../SuperConsoleContext';
import { createClient } from '@/lib/supabase/client';

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
    const [matches, setMatches] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const supabase = createClient();

    useEffect(() => {
        const fetchMatches = async () => {
            setLoading(true);
            try {
                // Fetch matches with related data
                // Note: relational queries depend on foreign key names being correct in Supabase
                const { data, error } = await supabase
                    .from('matches')
                    .select(`
                        *,
                        tournament:tournaments(id, name, season_id, union_id, sport),
                        home_team:clubs!home_club_id(id, name, logo_url),
                        away_team:clubs!away_club_id(id, name, logo_url)
                    `)
                    .order('date_time', { ascending: true });

                if (error) {
                    console.error('Error fetching matches:', error);
                    // Fallback to empty array or handle error visually
                } else {
                    console.log('Matches data:', data);
                    // Start transforming data
                    // We also need unions for logos if tournament doesn't have one
                    // For now, let's fetch unions to map logos
                    const { data: unions } = await supabase.from('unions').select('id, branding');
                    const unionMap = new Map<string, any>(unions?.map((u: any) => [u.id, u]) || []);

                    const formattedMatches = (data || []).map((m: any, index: number) => {
                        const tournament = m.tournament; // joined data
                        const home = m.home_team;
                        const away = m.away_team;

                        const union = tournament?.union_id ? unionMap.get(tournament.union_id) : null;
                        // Use union logo as fallback tournament logo
                        const tournamentLogo = union?.branding?.logoUrl || union?.branding?.logo_url;

                        const country = 'Argentina'; // default for now, can be improved with proper relations

                        return {
                            id: m.id,
                            tournamentId: tournament?.id || 'unknown',
                            tournamentName: tournament?.name || 'Torneo Desconocido',
                            tournamentLogo: tournamentLogo,
                            season: tournament?.season_id || m.season_id || '2026',
                            round: m.round_id || m.round || 'Fase Regular',
                            homeName: home?.name || 'Local',
                            awayName: away?.name || 'Visitante',
                            homeLogo: home?.logo_url || '🏠',
                            awayLogo: away?.logo_url || '🚌',
                            dateTime: m.date || m.datetime || new Date().toISOString(), // Fallback
                            status: m.status || 'scheduled',
                            sport: tournament?.sport || 'rugby',
                            country,
                            source: m.source || 'Manual',
                            views: 1200 + index * 340, // Mock metric
                            syncStatus: 'OK'
                        };
                    });
                    setMatches(formattedMatches);
                }
            } catch (err) {
                console.error('Unexpected error fetching matches:', err);
            } finally {
                setLoading(false);
            }
        };

        fetchMatches();
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

    // Grouping: Tournament -> Season -> Round
    const grouped = filtered.reduce<Record<string, Record<string, Record<string, typeof filtered>>>>((acc, match) => {
        if (!acc[match.tournamentName]) acc[match.tournamentName] = {};
        if (!acc[match.tournamentName][match.season]) acc[match.tournamentName][match.season] = {};
        if (!acc[match.tournamentName][match.season][match.round]) acc[match.tournamentName][match.season][match.round] = [];

        acc[match.tournamentName][match.season][match.round].push(match);
        return acc;
    }, {});

    return (
        <div style={{ paddingBottom: '40px' }}>
            <div className={styles.consoleHeader}>
                <div>
                    <div className={styles.consoleTitle}>Partidos (DB)</div>
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
                <div className={styles.slab}>
                    <div style={{ textAlign: 'center', padding: '40px', color: 'var(--basalt-400)' }}>
                        Vista calendario en construcción. Por favor use la vista Cards.
                    </div>
                </div>
            )}

            {loading && <div className={styles.slab}><div style={{ textAlign: 'center', padding: 40 }}>Cargando partidos...</div></div>}

            {!loading && viewMode === 'cards' && Object.keys(grouped).length === 0 && (
                <div className={styles.slab}>
                    <div style={{ textAlign: 'center', padding: '40px', color: 'var(--basalt-400)' }}>
                        No se encontraron partidos con los filtros actuales.
                    </div>
                </div>
            )}

            {!loading && viewMode === 'cards' && Object.entries(grouped).map(([tournamentName, seasons]) => (
                <div key={tournamentName} className={styles.slab} style={{ marginBottom: '24px' }}>
                    <div className={styles.slabHeader}>
                        <div>
                            <span className={styles.slabLabel}>Torneo</span>
                            <h2 className={styles.slabTitle}>{tournamentName}</h2>
                        </div>
                    </div>

                    {Object.entries(seasons).map(([season, rounds]) => (
                        <div key={season} style={{ marginBottom: '32px' }}>
                            <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '12px',
                                marginBottom: '16px',
                                borderBottom: '1px solid var(--surface-edge)',
                                paddingBottom: '8px'
                            }}>
                                <span className={styles.badge} style={{ fontSize: '11px' }}>Temporada {season}</span>
                            </div>

                            {Object.entries(rounds).map(([round, matchList]) => (
                                <div key={round} style={{ marginBottom: '24px' }}>
                                    <h4 style={{
                                        fontSize: '12px',
                                        fontFamily: 'var(--font-mono)',
                                        color: 'var(--basalt-400)',
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.05em',
                                        marginBottom: '12px',
                                        paddingLeft: '4px'
                                    }}>
                                        {round.replace('F', 'Fecha ')}
                                    </h4>

                                    <div className={styles.cardGrid}>
                                        {matchList.map((match) => (
                                            <div key={match.id} className={styles.cardItem} style={{ paddingTop: '40px' }}>
                                                {/* Tournament Logo Top Right */}
                                                <div style={{
                                                    position: 'absolute',
                                                    top: '12px',
                                                    right: '12px',
                                                    width: '28px',
                                                    height: '28px',
                                                    borderRadius: '6px',
                                                    overflow: 'hidden',
                                                    background: 'var(--basalt-800)',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    border: '1px solid var(--surface-edge)'
                                                }}>
                                                    {match.tournamentLogo && (match.tournamentLogo.startsWith('/') || match.tournamentLogo.startsWith('http')) ? (
                                                        <img
                                                            src={match.tournamentLogo}
                                                            alt="T"
                                                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                                            onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                                                        />
                                                    ) : (
                                                        <span style={{ fontSize: '14px' }}>🏆</span>
                                                    )}
                                                </div>

                                                {/* Matchup with Logos */}
                                                <div style={{
                                                    display: 'flex',
                                                    alignItems: 'start',
                                                    justifyContent: 'space-between',
                                                    marginBottom: '20px',
                                                    padding: '0 8px'
                                                }}>
                                                    {/* Home Team */}
                                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', flex: 1, overflow: 'hidden' }}>
                                                        <div style={{ fontSize: '32px', lineHeight: 1, height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                            {match.homeLogo && (match.homeLogo.startsWith('http') || match.homeLogo.startsWith('/')) ? (
                                                                <img src={match.homeLogo} alt={match.homeName} style={{ height: '100%', objectFit: 'contain' }} />
                                                            ) : (
                                                                <span>{match.homeLogo}</span>
                                                            )}
                                                        </div>
                                                        <span style={{
                                                            fontSize: '12px',
                                                            fontWeight: '600',
                                                            textAlign: 'center',
                                                            lineHeight: 1.3,
                                                            color: '#ececec',
                                                            display: '-webkit-box',
                                                            WebkitLineClamp: 2,
                                                            WebkitBoxOrient: 'vertical',
                                                            overflow: 'hidden',
                                                            width: '100%'
                                                        }}>
                                                            {match.homeName}
                                                        </span>
                                                    </div>

                                                    {/* VS */}
                                                    <div style={{
                                                        display: 'flex',
                                                        flexDirection: 'column',
                                                        alignItems: 'center',
                                                        paddingTop: '12px',
                                                        color: 'var(--basalt-600)',
                                                        fontWeight: '700',
                                                        fontSize: '10px'
                                                    }}>
                                                        VS
                                                    </div>

                                                    {/* Away Team */}
                                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', flex: 1, overflow: 'hidden' }}>
                                                        <div style={{ fontSize: '32px', lineHeight: 1, height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                            {match.awayLogo && (match.awayLogo.startsWith('http') || match.awayLogo.startsWith('/')) ? (
                                                                <img src={match.awayLogo} alt={match.awayName} style={{ height: '100%', objectFit: 'contain' }} />
                                                            ) : (
                                                                <span>{match.awayLogo}</span>
                                                            )}
                                                        </div>
                                                        <span style={{
                                                            fontSize: '12px',
                                                            fontWeight: '600',
                                                            textAlign: 'center',
                                                            lineHeight: 1.3,
                                                            color: '#ececec',
                                                            display: '-webkit-box',
                                                            WebkitLineClamp: 2,
                                                            WebkitBoxOrient: 'vertical',
                                                            overflow: 'hidden',
                                                            width: '100%'
                                                        }}>
                                                            {match.awayName}
                                                        </span>
                                                    </div>
                                                </div>

                                                <div className={styles.badgeRow} style={{ justifyContent: 'center', marginBottom: '16px' }}>
                                                    <span className={`${styles.badgePill} ${match.status === 'live' ? styles.badgeLive : match.status === 'final' ? styles.badgeActive : styles.badgeArchived}`}>
                                                        {match.status === 'live' ? 'En vivo' : match.status === 'final' ? 'Finalizado' : 'Programado'}
                                                    </span>
                                                    <span className={`${styles.badgePill} ${match.source === 'API' ? styles.badgeApiAlt : styles.badgeManualAlt}`}>
                                                        {match.source}
                                                    </span>
                                                </div>

                                                <div className={styles.metricsGrid}>
                                                    <div className={styles.metricItem}>
                                                        <span className={styles.metricLabel}>Horario</span>
                                                        <span className={styles.metricValue}>{formatDateTime(match.dateTime)}</span>
                                                    </div>
                                                    <div className={styles.metricItem}>
                                                        <span className={styles.metricLabel}>Sincronización</span>
                                                        <span className={`${styles.metricValue} ${match.syncStatus === 'OK' ? styles.statusOk : styles.statusError}`}>
                                                            {match.syncStatus}
                                                        </span>
                                                    </div>
                                                </div>

                                                <div className={styles.cardActions}>
                                                    <Link href={`/admin/super/partidos/${match.id}`} className={styles.actionBtn}>
                                                        Gestionar
                                                    </Link>
                                                    <button className={styles.actionBtn} title="Sincronizar ahora">
                                                        ↻ Sync
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    ))}
                </div>
            ))}
        </div>
    );
}
