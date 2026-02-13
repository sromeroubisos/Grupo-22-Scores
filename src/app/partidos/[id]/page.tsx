'use client';

import React, { useMemo, useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import ExportImage from '@/components/ExportImage';
import styles from './page.module.css';
import {
    getFlashScoreMatchSummary,
    getFlashScoreMatchStats,
    getFlashScoreMatchH2H,
    getFlashScoreStandingsForm,
    getFlashScoreMatchLineups,
    getFlashScoreMatchStandings,
    getFlashScoreStandingsHtFt,
    getFlashScoreMatchesRaw,
    getFlashScorePlayerStats,
    getFlashScoreMatchCommentary,
    getFlashScoreMatchDraw,
    mapStatus
} from '@/lib/services/flashscore';
import { parseAnyMatches, UIMatch, withStats } from '@/lib/matchSchema';
import { apiFetch, ApiDebug } from '@/lib/apiFetch';
import { db } from '@/lib/mock-db';

const USER_TZ = typeof window !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : 'UTC';

function buildTeamHref(team: { id?: string; name?: string; teamUrl?: string }) {
    const params = new URLSearchParams();
    if (team.name) params.set('name', team.name);
    if (team.teamUrl) params.set('team_url', team.teamUrl);
    const qs = params.toString();
    return `/clubes/fs-team-${team.id}${qs ? `?${qs}` : ''}`;
}

function H2HItem({ m, styles, focusTeamName }: { m: any, styles: any, focusTeamName?: string }) {
    const date = m.timestamp ? new Date(m.timestamp * 1000).toLocaleDateString('es-AR', { timeZone: USER_TZ }) : (m.date || '');

    // Determine status relative to focusTeamName if provided
    let status = m.status;
    if (focusTeamName && m.scores) {
        const hScore = parseInt(m.scores.home || '0');
        const aScore = parseInt(m.scores.away || '0');
        const homeName = m.home_team?.name || m.home;
        const awayName = m.away_team?.name || m.away;

        if (homeName === focusTeamName) {
            status = hScore > aScore ? 'W' : hScore < aScore ? 'L' : 'D';
        } else if (awayName === focusTeamName) {
            status = aScore > hScore ? 'W' : aScore < hScore ? 'L' : 'D';
        }
    }

    return (
        <div className={styles.h2hItem}>
            <div className={styles.h2hDate}>
                <div>{date}</div>
                <div style={{ fontSize: '9px', opacity: 0.5, marginTop: '2px' }}>{m.tournament_name_short || m.tournament_name}</div>
            </div>
            <div className={styles.h2hTeams}>
                <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-end' }}>
                    {m.home_team?.image_path ? (
                        <img src={m.home_team.image_path} alt="" style={{ width: '22px', height: '22px' }} />
                    ) : (
                        <div style={{ width: '22px', height: '22px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px' }} />
                    )}
                </div>
                <span className={styles.h2hScore}>{m.scores?.home} - {m.scores?.away}</span>
                <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-start' }}>
                    {m.away_team?.image_path ? (
                        <img src={m.away_team.image_path} alt="" style={{ width: '22px', height: '22px' }} />
                    ) : (
                        <div style={{ width: '22px', height: '22px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px' }} />
                    )}
                </div>
            </div>
            {status && (
                <div className={`${styles.resultCircle} ${status === 'W' ? styles.win : status === 'D' ? styles.draw : styles.loss}`} style={{ width: '20px', height: '20px', minWidth: '20px', fontSize: '10px' }}>
                    {status}
                </div>
            )}
        </div>
    );
}

export default function PartidoDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = React.use(params);
    const router = useRouter();

    const [state, setState] = useState<{
        kind: 'loading' | 'error' | 'empty' | 'ok';
        matchData?: any;
        eventsData: any[];
        statsData: any[];
        playerStats: any;
        commentaryData: any[];
        issues: any[];
        debug: Record<string, ApiDebug>;
        message?: string;
    }>({
        kind: 'loading',
        eventsData: [],
        statsData: [],
        playerStats: null,
        commentaryData: [],
        issues: [],
        debug: {}
    });

    const [activeTab, setActiveTab] = useState('summary');
    const statusRef = useRef<string>('scheduled');
    const [showDebug, setShowDebug] = useState(false);
    const [showAllEvents, setShowAllEvents] = useState(false);

    const isFlashScore = useMemo(() => /^[A-Za-z0-9]{8}$/.test(id) || id.length === 8, [id]);

    useEffect(() => {
        async function fetchData() {
            // Only set loading on first fetch
            if (state.kind === 'loading') {
                setState(prev => ({ ...prev, kind: 'loading' }));
            }

            try {
                if (isFlashScore) {
                    // Using our service but we want the individual debug for the main call 
                    // (Actually the service now uses apiFetch, so we can't easily get the debug data unless we refactor the service to return it)
                    // For now, let's call apiFetch directly for details to get debug info
                    const urlDetails = `https://flashscore4.p.rapidapi.com/api/flashscore/v2/matches/details?match_id=${id}`;
                    const { data: detailsRes, debug: debugDetails } = await apiFetch<any>(urlDetails, {
                        headers: {
                            'x-rapidapi-host': 'flashscore4.p.rapidapi.com',
                            'x-rapidapi-key': '32e9f1aee1msha3c5470d1ea7367p10fac7jsnf9a1bfc88131'
                        },
                        debugTag: 'MatchPageInit'
                    });

                    const evt = detailsRes?.DATA?.EVENT || detailsRes;

                    if (!evt || !(evt.match_id || evt.EVENT_ID)) {
                        setState(prev => ({
                            ...prev,
                            kind: 'error',
                            message: 'No se encontró el evento en la API',
                            debug: { ...prev.debug, details: debugDetails }
                        }));
                        return;
                    }

                    const sportId = evt.sport?.sport_id || evt.SPORT_ID || 1;
                    const tsTotal = evt.timestamp || evt.start_time || evt.START_TIME || evt.time || evt.event_timestamp || 0;
                    const startTime = new Date(Number(tsTotal) * 1000);
                    const fsStatus = mapStatus(evt.match_status, evt.STAGE_TYPE || evt.status);

                    // Calculate day offset from today to the match's start time
                    const nowDays = Math.floor(Date.now() / 86400000);
                    const matchDays = Math.floor(startTime.getTime() / 86400000);
                    const matchDayOffset = Math.max(-7, Math.min(7, matchDays - nowDays));

                    const promises: any[] = [
                        getFlashScoreMatchSummary(id),
                        getFlashScoreMatchStats(id),
                        getFlashScoreMatchH2H(id),
                        getFlashScoreStandingsForm(id),
                        getFlashScoreMatchLineups(id),
                        getFlashScoreMatchStandings(id),
                        getFlashScoreMatchesRaw(matchDayOffset, sportId),
                        getFlashScorePlayerStats(id),
                        getFlashScoreMatchCommentary(id),
                        getFlashScoreMatchDraw(id)
                    ];

                    const results = await Promise.allSettled(promises);
                    const [summaryRes, statsRes, h2hRes, formRes, lineupsRes, standingsRes, dayMatchesRes, playerStatsRes, commentaryRes, drawRes] = results.map((r: any) => r.status === 'fulfilled' ? r.value : null);

                    // Cross-reference with daily list to find better scores/status
                    let listMatchEvt: any = null;
                    if (dayMatchesRes) {
                        const tournaments = Array.isArray(dayMatchesRes) ? dayMatchesRes : (dayMatchesRes.DATA || dayMatchesRes.data || []);
                        for (const tour of tournaments) {
                            if (tour.matches && Array.isArray(tour.matches)) {
                                const found = tour.matches.find((m: any) => m.match_id === id || m.EVENT_ID === id);
                                if (found) {
                                    listMatchEvt = found;
                                    break;
                                }
                            }
                        }
                    }

                    // Use the NEW router parser on the ORIGINAL payload
                    const { matches, issues: zodIssues } = parseAnyMatches(detailsRes);
                    const baseMatch = matches[0];

                    if (!baseMatch) {
                        setState(prev => ({
                            ...prev,
                            kind: 'error',
                            message: 'No se pudo parsear el partido (Formato desconocido)',
                            debug: { ...prev.debug, details: debugDetails },
                            issues: zodIssues
                        }));
                        return;
                    }

                    const rawSummary = summaryRes?.DATA || summaryRes || [];
                    const summaryItemsRaw = Array.isArray(rawSummary) ? rawSummary : (rawSummary.INCIDENTS || rawSummary.incidents || []);

                    // Handle empty or invalid summary data gracefully
                    const { out: incidents } = withStats(
                        Array.isArray(summaryItemsRaw) ? summaryItemsRaw : [],
                        (incident: any) => {
                            // Skip invalid incidents
                            if (!incident || typeof incident !== 'object') return null;

                            // Accept both old format (INCIDENT_TYPE) and new format (type)
                            const type = incident.type || incident.INCIDENT_TYPE || incident.event_type;
                            if (!type) return null;

                            // Accept minutes (new) or INCIDENT_MINUTE (old) or period for basketball
                            const time = incident.minutes || incident.INCIDENT_MINUTE || incident.time || incident.period || '?';

                            // Accept name (new) or INCIDENT_PARTICIPANT_NAME (old)
                            const player = incident.name || incident.INCIDENT_PARTICIPANT_NAME || incident.player_name || 'Jugador';

                            // Accept team (new 'home'/'away' strings) or INCIDENT_TEAM (old 1/2 ints)
                            let teamSide: 'home' | 'away' = 'home';
                            if (incident.team) {
                                teamSide = incident.team === 'home' ? 'home' : 'away';
                            } else {
                                teamSide = (incident.INCIDENT_TEAM === 1 || incident.team_id === (evt.home_team?.team_id || evt.HOME_ID)) ? 'home' : 'away';
                            }

                            return {
                                time,
                                type,
                                team: teamSide,
                                player,
                                playerId: incident.player_id || incident.INCIDENT_PARTICIPANT_ID || incident.id || '',
                                subPlayer: incident.INCIDENT_ASSISTANT_NAME || incident.INCIDENT_PARTICIPANT_NAME_OUT || incident.assist_player_name || incident.assistant,
                                subPlayerId: incident.INCIDENT_ASSISTANT_ID || incident.INCIDENT_PARTICIPANT_ID_OUT || incident.assist_player_id || '',
                                description: incident.description || incident.INCIDENT_SUBTYPE || incident.INCIDENT_REMARK || incident.remark || ''
                            };
                        },
                        'IncidentsNormalization'
                    );

                    const rawSummaryData = summaryRes?.DATA || {};
                    // Priority: 
                    // 1. Explicit scores from individual details (if any)
                    // 2. Scores from the daily matches list (often more reliable for current score)
                    // 3. Fallbacks from various detail fields (HOME_SCORE_CURRENT, etc)
                    // 4. Default to 0 if finished
                    let hScoreFinal = baseMatch.scoreHome;
                    let aScoreFinal = baseMatch.scoreAway;

                    if (hScoreFinal === null || hScoreFinal === 0) {
                        const candidateH = evt.scores?.home ?? listMatchEvt?.scores?.home ?? evt.HOME_SCORE_CURRENT ?? rawSummaryData.SCORE_HOME ?? rawSummaryData.HOME_SCORE ?? null;
                        const candidateA = evt.scores?.away ?? listMatchEvt?.scores?.away ?? evt.AWAY_SCORE_CURRENT ?? rawSummaryData.SCORE_AWAY ?? rawSummaryData.AWAY_SCORE ?? null;

                        // Only override if we found something non-null
                        if (candidateH !== null) hScoreFinal = Number(candidateH);
                        if (candidateA !== null) aScoreFinal = Number(candidateA);
                    }

                    // Final safety: if finished and still null, then it's 0-0
                    if ((fsStatus === 'live' || fsStatus === 'final') && hScoreFinal === null) {
                        hScoreFinal = 0;
                        aScoreFinal = 0;
                    }

                    const processedMatch = {
                        ...baseMatch,
                        sportId,
                        status: listMatchEvt?.match_status ? mapStatus(listMatchEvt.match_status) : fsStatus,
                        round: evt.tournament?.stage_id || evt.ROUND_NAME || 'General',
                        category: evt.country?.name || evt.COUNTRY_NAME || baseMatch.category || 'Internacional',
                        tournamentId: evt.tournament?.tournament_stage_id || evt.tournament?.tournament_id || evt.TOURNAMENT_STAGE_ID || '',
                        home: { ...baseMatch.home, score: hScoreFinal, teamUrl: evt.home_team?.team_url || '' },
                        away: { ...baseMatch.away, score: aScoreFinal, teamUrl: evt.away_team?.team_url || '' },
                        lineups: lineupsRes?.DATA || lineupsRes || null,
                        standings: (() => {
                            // Try multiple paths for standings data
                            if (Array.isArray(standingsRes)) return standingsRes;
                            if (standingsRes?.DATA?.[0]?.ROWS) return standingsRes.DATA[0].ROWS;
                            if (standingsRes?.DATA?.rows) return standingsRes.DATA.rows;
                            if (standingsRes?.DATA?.standings) return standingsRes.DATA.standings;
                            if (standingsRes?.rows) return standingsRes.rows;
                            if (standingsRes?.standings) return standingsRes.standings;
                            if (standingsRes?.DATA && Array.isArray(standingsRes.DATA)) return standingsRes.DATA;

                            // Log the actual structure for debugging
                            if (standingsRes && Object.keys(standingsRes).length > 0) {
                                console.log('Standings structure:', JSON.stringify(standingsRes, null, 2));
                            }
                            return [];
                        })(),
                        h2h: Array.isArray(h2hRes)
                            ? h2hRes
                            : (h2hRes?.DATA || h2hRes?.data || h2hRes?.matches || []),
                        draw: (() => {
                            const raw = drawRes?.DATA || drawRes;
                            if (Array.isArray(raw) && raw.length > 0) return raw;
                            if (raw?.rounds && Array.isArray(raw.rounds)) return raw.rounds;
                            if (raw?.draw && Array.isArray(raw.draw)) return raw.draw;
                            return [];
                        })(),
                    };

                    const rawStats = statsRes?.DATA || statsRes || {};
                    let statItems: any[] = [];

                    if (Array.isArray(rawStats)) {
                        statItems = rawStats;
                    } else if (rawStats.match && Array.isArray(rawStats.match)) {
                        // Rugby format: prioritize the full "match" stats
                        statItems = rawStats.match;
                    } else if (rawStats.STATS && Array.isArray(rawStats.STATS)) {
                        statItems = rawStats.STATS;
                    } else if (rawStats.stats && Array.isArray(rawStats.stats)) {
                        // Alternative stats format
                        statItems = rawStats.stats;
                    } else if (rawStats.statistics && Array.isArray(rawStats.statistics)) {
                        // Basketball/other sports format
                        statItems = rawStats.statistics;
                    }

                    const stats = statItems
                        .filter((s: any) => s && typeof s === 'object') // Filter out invalid items
                        .map((s: any) => ({
                            label: s.name || s.SECT_NAME || s.label || s.stat_name || 'General',
                            home: String(s.home_team ?? s.HOME_VALUE ?? s.home ?? s.home_value ?? '0'),
                            away: String(s.away_team ?? s.AWAY_VALUE ?? s.away ?? s.away_value ?? '0')
                        }));

                    statusRef.current = fsStatus;
                    setState({
                        kind: 'ok',
                        matchData: processedMatch,
                        eventsData: incidents,
                        statsData: stats,
                        playerStats: playerStatsRes?.DATA || playerStatsRes || null,
                        commentaryData: commentaryRes?.DATA || commentaryRes || [],
                        issues: zodIssues,
                        debug: { ...state.debug, details: debugDetails }
                    });
                } else {
                    // LOCAL MATCH LOGIC
                    const localMatch = db.matches.find(m => m.id === id);
                    if (localMatch) {
                        const tournament = db.tournaments.find(t => t.id === localMatch.tournamentId);
                        const homeClub = db.clubs.find(c => c.id === localMatch.homeClubId);
                        const awayClub = db.clubs.find(c => c.id === localMatch.awayClubId);

                        const sportId = tournament?.sport === 'football' ? 1 : 2; // Default to 2 (rugby) if not football

                        const processedMatch = {
                            id: localMatch.id,
                            status: localMatch.status,
                            sportId,
                            date: localMatch.dateTime,
                            time: new Date(localMatch.dateTime).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: USER_TZ }),
                            tournament: tournament?.name || 'Torneo Local',
                            category: tournament?.category || 'General',
                            venue: localMatch.venue,
                            home: {
                                id: homeClub?.id || 'home',
                                name: homeClub?.name || 'Local',
                                logo: homeClub?.logoUrl || null,
                                score: localMatch.score.home
                            },
                            away: {
                                id: awayClub?.id || 'away',
                                name: awayClub?.name || 'Visitante',
                                logo: awayClub?.logoUrl || null,
                                score: localMatch.score.away
                            },
                            events: [],
                            stats: [],
                            lineups: null,
                            standings: [],
                            h2h: [],
                            draw: []
                        };

                        statusRef.current = localMatch.status;
                        setState({
                            kind: 'ok',
                            matchData: processedMatch,
                            eventsData: [],
                            statsData: [],
                            playerStats: null,
                            commentaryData: [],
                            issues: [],
                            debug: {}
                        });
                    } else {
                        setState(prev => ({
                            ...prev,
                            kind: 'error',
                            message: 'No se encontró el partido (ID no reconocido como API ni Local)'
                        }));
                    }
                }
            } catch (error) {
                console.error("Fetch Error:", error);
                setState(prev => ({ ...prev, kind: 'error', message: String(error) }));
            }
        }

        fetchData();

        const interval = setInterval(() => {
            if (statusRef.current === 'live') {
                fetchData();
            }
        }, 60000);

        return () => clearInterval(interval);
    }, [id, isFlashScore]);

    if (state.kind === 'loading') return <div className={styles.page}><div className={styles.appContainer}>Cargando datos...</div></div>;

    if (state.kind === 'error' || state.kind === 'empty') {
        return (
            <div className={styles.page}>
                <div className={styles.appContainer}>
                    <div style={{ padding: '40px', textAlign: 'center', background: 'rgba(255,0,0,0.1)', borderRadius: '12px' }}>
                        <h2>{state.kind === 'error' ? 'Error al cargar' : 'No se encontró información parseable'}</h2>
                        <p>{state.message}</p>
                        <button className={styles.tab} onClick={() => window.location.reload()} style={{ marginTop: '20px' }}>Reintentar</button>

                        <div style={{ marginTop: '40px', textAlign: 'left' }}>
                            <h3>Debug Info:</h3>
                            <pre style={{ fontSize: '12px', background: '#000', padding: '10px', overflow: 'auto' }}>
                                {JSON.stringify(state.debug, null, 2)}
                            </pre>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    const { matchData, eventsData, statsData, issues } = state;

    return (
        <div className={styles.page}>
            <div className={styles.appContainer}>
                {/* Layer 1: Header Context */}
                <header className={styles.matchHeader}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                        <button onClick={() => router.back()} className={styles.btn} style={{ padding: '8px', borderRadius: '50%' }}>
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
                        </button>
                        <div className={styles.breadcrumbs}>
                            <span className={styles.breadcrumbItem}>{matchData.category}</span>
                            {matchData.tournamentId ? (
                                <Link href={`/tournaments/fs-${matchData.tournamentId}`} className={styles.breadcrumbItem} style={{ color: 'var(--color-accent, var(--accent))', textDecoration: 'none' }}>
                                    {matchData.tournament}
                                </Link>
                            ) : (
                                <span className={styles.breadcrumbItem}>{matchData.tournament}</span>
                            )}
                            <span className={styles.breadcrumbItem}>{matchData.round}</span>
                            <span className={styles.breadcrumbItem} style={{ color: 'var(--text)', fontWeight: 800 }}>{matchData.home.name} vs {matchData.away.name}</span>
                        </div>
                    </div>
                    <div className={styles.matchActions}>
                        <button className={styles.btn}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
                            Exportar
                        </button>
                    </div>
                </header>

                {/* Layer 2: Scoreboard */}
                <section className={styles.scoreboardCard}>
                    <div className={styles.scoreboardGrid}>
                        {/* Local */}
                        <div className={styles.teamCol}>
                            <Link href={buildTeamHref(matchData.home)} style={{ textDecoration: 'none' }}>
                                <div className={styles.crestWrapper}>
                                    {matchData.home.logo ? (
                                        <img
                                            src={matchData.home.logo}
                                            className={styles.crestImage}
                                            alt=""
                                            onError={(e) => {
                                                e.currentTarget.style.display = 'none';
                                            }}
                                        />
                                    ) : (
                                        <div style={{ width: '40px', height: '40px', background: 'rgba(255,255,255,0.1)', borderRadius: '50%' }} />
                                    )}
                                </div>
                            </Link>
                            <div className={styles.teamInfo}>
                                <div className={styles.teamLabel}>Anfitrion</div>
                                <Link href={buildTeamHref(matchData.home)} style={{ textDecoration: 'none', color: 'inherit' }}>
                                    <div className={styles.teamName} title={matchData.home.name}>{matchData.home.name}</div>
                                </Link>
                            </div>
                        </div>

                        {/* Center */}
                        <div className={styles.centerCol}>
                            <div className={`${styles.statusBadge} ${matchData.status === 'live' ? styles.live : ''}`}>
                                {matchData.status === 'live' && <div className={styles.pulse}></div>}
                                {matchData.status === 'live' ? 'En Vivo' : matchData.status === 'final' ? 'Finalizado' : 'Programado'}
                            </div>
                            {matchData.status !== 'scheduled' && (
                                <div style={{ marginBottom: '12px' }}>
                                    <ExportImage
                                        template="matchStats"
                                        filename={`reporte-${matchData.home.name}-${matchData.away.name}`}
                                        data={{
                                            status: matchData.status as 'scheduled' | 'live' | 'final',
                                            homeTeam: matchData.home.name,
                                            awayTeam: matchData.away.name,
                                            homeScore: matchData.home.score,
                                            awayScore: matchData.away.score,
                                            homeLogo: matchData.home.logo,
                                            awayLogo: matchData.away.logo,
                                            tournament: matchData.tournament,
                                            date: new Date(matchData.date).toLocaleDateString('es-AR', { timeZone: USER_TZ }),
                                            time: matchData.time,
                                            venue: matchData.venue,
                                            stats: statsData || []
                                        }}
                                        className={styles.compactExport}
                                    />
                                </div>
                            )}
                            <div className={styles.scoreDisplay}>
                                <div className={styles.scoreNum}>{matchData.home.score ?? '-'}</div>
                                <div className={styles.scoreSep}>:</div>
                                <div className={styles.scoreNum}>{matchData.away.score ?? '-'}</div>
                            </div>
                            {(matchData.home.score === null && matchData.status !== 'scheduled') && (
                                <div style={{ fontSize: '10px', opacity: 0.6, marginTop: '4px' }}>
                                    Sin marcador provisto por API
                                </div>
                            )}
                            <div className={styles.matchTimer}>
                                <span>{matchData.time}</span>
                                <span style={{ opacity: 0.3 }}>|</span>
                                <span>{matchData.status === 'live' ? 'En Juego' : matchData.status === 'final' ? 'FT' : 'Pendiente'}</span>
                            </div>
                        </div>

                        {/* Visitor */}
                        <div className={`${styles.teamCol} ${styles.visitor}`}>
                            <Link href={buildTeamHref(matchData.away)} style={{ textDecoration: 'none' }}>
                                <div className={styles.crestWrapper}>
                                    {matchData.away.logo ? (
                                        <img
                                            src={matchData.away.logo}
                                            className={styles.crestImage}
                                            alt=""
                                            onError={(e) => {
                                                e.currentTarget.style.display = 'none';
                                            }}
                                        />
                                    ) : (
                                        <div style={{ width: '40px', height: '40px', background: 'rgba(255,255,255,0.1)', borderRadius: '50%' }} />
                                    )}
                                </div>
                            </Link>
                            <div className={styles.teamInfo}>
                                <div className={styles.teamLabel}>Visitante</div>
                                <Link href={buildTeamHref(matchData.away)} style={{ textDecoration: 'none', color: 'inherit' }}>
                                    <div className={styles.teamName} title={matchData.away.name}>{matchData.away.name}</div>
                                </Link>
                            </div>
                        </div>
                    </div>

                    {/* Metadata Chips */}
                    <div className={styles.infoBar}>
                        <div className={styles.infoChip}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
                            <span><strong>{new Date(matchData.date).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', timeZone: USER_TZ })}</strong> {matchData.time}</span>
                        </div>
                        <div className={styles.infoChip}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>
                            <span><strong>{matchData.venue}</strong></span>
                        </div>
                        {matchData.referee && (
                            <div className={styles.infoChip}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
                                <span>Árbitro: <strong>{matchData.referee}</strong></span>
                            </div>
                        )}
                    </div>
                </section>

                {/* Layer 4: Tabs */}
                <nav className={styles.tabsNav}>
                    <div className={`${styles.tabItem} ${activeTab === 'summary' ? styles.active : ''}`} onClick={() => setActiveTab('summary')}>Resumen</div>
                    <div className={`${styles.tabItem} ${activeTab === 'timeline' ? styles.active : ''}`} onClick={() => setActiveTab('timeline')}>Cronología</div>
                    <div className={`${styles.tabItem} ${activeTab === 'lineups' ? styles.active : ''}`} onClick={() => setActiveTab('lineups')}>Alineaciones</div>
                    <div className={`${styles.tabItem} ${activeTab === 'players' ? styles.active : ''}`} onClick={() => setActiveTab('players')}>Jugadores</div>
                    <div className={`${styles.tabItem} ${activeTab === 'stats' ? styles.active : ''}`} onClick={() => setActiveTab('stats')}>Estadísticas</div>
                    <div className={`${styles.tabItem} ${activeTab === 'h2h' ? styles.active : ''}`} onClick={() => setActiveTab('h2h')}>H2H</div>
                    <div className={`${styles.tabItem} ${activeTab === 'standings' ? styles.active : ''}`} onClick={() => setActiveTab('standings')}>Clasificación</div>
                    <div className={`${styles.tabItem} ${activeTab === 'commentary' ? styles.active : ''}`} onClick={() => setActiveTab('commentary')}>Comentarios</div>
                </nav>

                <main className={styles.tabContent}>
                    <section className={styles.panelBlock}>
                        {activeTab === 'summary' && (
                            <div className={styles.summaryView}>
                                <div className={styles.panelTitle}>Visión General</div>
                                {statsData.length > 0 ? (
                                    statsData.slice(0, 8).map((stat, i) => {
                                        const hVal = parseFloat(String(stat.home).replace(/[^0-9.]/g, '')) || 0;
                                        const aVal = parseFloat(String(stat.away).replace(/[^0-9.]/g, '')) || 0;
                                        const total = hVal + aVal;
                                        const hPct = total > 0 ? (hVal / total) * 100 : 50;
                                        const aPct = total > 0 ? (aVal / total) * 100 : 50;

                                        return (
                                            <div key={i} className={styles.statItem}>
                                                <div className={styles.statRow}>
                                                    <span className={styles.statVal}>{stat.home}</span>
                                                    <span className={styles.statLabel}>{stat.label}</span>
                                                    <span className={styles.statVal}>{stat.away}</span>
                                                </div>
                                                <div className={styles.statProgress}>
                                                    <div className={styles.progressHome} style={{ width: `${hPct}%` }}></div>
                                                    <div className={styles.progressAway} style={{ width: `${aPct}%` }}></div>
                                                </div>
                                            </div>
                                        );
                                    })
                                ) : (
                                    <p className={styles.placeholderText}>No hay estadísticas clave disponibles para este partido.</p>
                                )}

                                {eventsData.length > 0 && (
                                    <div className={styles.summaryEvents}>
                                        <div className={styles.panelTitle}>Sucesos Recientes</div>
                                        <div className={styles.timelineContainer}>
                                            {eventsData.slice(-3).reverse().map((evt, i) => (
                                                <div key={i} className={styles.timelineItem}>
                                                    <div className={styles.eventMinuteBadge}>{evt.time}'</div>
                                                    <div className={`${styles.eventSide} ${evt.team === 'home' ? styles.eventLeft : styles.eventRight}`}>
                                                        <div className={styles.eventIcon}>•</div>
                                                        <div className={styles.eventDetail}>
                                                            <div className={styles.eventPlayer} style={{ fontSize: '12px' }}>{evt.player}</div>
                                                            <div className={styles.eventSubInfo}>{evt.type}</div>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {activeTab === 'timeline' && (
                            <div className={styles.timelineContainer}>
                                <div className={styles.panelTitle} style={{ textAlign: 'center', display: 'block' }}>Eventos</div>

                                {/* Mobile: Show limited events by default */}
                                <div className={`${styles.timelineWrapper} ${showAllEvents ? styles.expanded : ''}`}>
                                    {eventsData.map((evt, i) => {
                                        const isHome = evt.team === 'home';

                                        // Event Icon Logic - Sport Aware
                                        let icon = '•';
                                        const typeLower = evt.type?.toLowerCase() || '';

                                        if (typeLower.includes('goal') || typeLower.includes('try') || typeLower.includes('point')) {
                                            icon = matchData.sportId === 1 ? '⚽' : '🏉';
                                        } else if (typeLower.includes('card')) {
                                            icon = typeLower.includes('yellow') ? '🟨' : '🟥';
                                        } else if (typeLower.includes('subst')) {
                                            icon = '🔄';
                                        } else if (typeLower.includes('var')) {
                                            icon = '🖥️';
                                        } else if (typeLower.includes('penalty')) {
                                            icon = '🎯';
                                        }

                                        return (
                                            <div key={i} className={styles.timelineItem}>
                                                <div className={styles.eventMinuteBadge}>{evt.time}'</div>

                                                <div className={`${styles.eventSide} ${isHome ? styles.eventLeft : styles.eventRight}`}>
                                                    <div className={styles.eventIcon}>{icon}</div>
                                                    <div className={styles.eventDetail}>
                                                        <div className={styles.eventPlayer}>
                                                            {evt.playerId ? <Link href={`/jugadores/${evt.playerId}`} style={{ color: 'inherit', textDecoration: 'none' }}>{evt.player}</Link> : evt.player}
                                                        </div>
                                                        {evt.type?.toLowerCase().includes('subst') ? (
                                                            <div className={styles.eventSubInfo}>
                                                                <span className={styles.playerIn}>{evt.playerId ? <Link href={`/jugadores/${evt.playerId}`} style={{ color: 'inherit', textDecoration: 'none' }}>{evt.player}</Link> : evt.player}</span><br />
                                                                <span className={styles.playerOut}>{evt.subPlayerId ? <Link href={`/jugadores/${evt.subPlayerId}`} style={{ color: 'inherit', textDecoration: 'none' }}>{evt.subPlayer}</Link> : evt.subPlayer}</span>
                                                            </div>
                                                        ) : (
                                                            <div className={styles.eventSubInfo}>
                                                                {evt.subPlayer && <span className={styles.assistText}>asistencia de {evt.subPlayerId ? <Link href={`/jugadores/${evt.subPlayerId}`} style={{ color: 'inherit', textDecoration: 'none' }}>{evt.subPlayer}</Link> : evt.subPlayer}</span>}
                                                                {evt.description && <span> ({evt.description})</span>}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>

                                {eventsData.length === 0 && <p className={styles.placeholderText}>Aún no han ocurrido eventos significativos.</p>}

                                {/* Mobile: Show expand/collapse button only if there are more than 10 events */}
                                {eventsData.length > 10 && (
                                    <div className={styles.timelineToggleWrapper}>
                                        <button
                                            className={styles.timelineToggleBtn}
                                            onClick={() => setShowAllEvents(!showAllEvents)}
                                        >
                                            {showAllEvents ? (
                                                <>
                                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                        <path d="M18 15l-6-6-6 6" />
                                                    </svg>
                                                    Mostrar menos
                                                </>
                                            ) : (
                                                <>
                                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                        <path d="M6 9l6 6 6-6" />
                                                    </svg>
                                                    Mostrar todos ({eventsData.length} eventos)
                                                </>
                                            )}
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}

                        {activeTab === 'commentary' && (
                            <div className={styles.commentaryList}>
                                <div className={styles.panelTitle}>Narración del Encuentro</div>
                                {state.commentaryData && state.commentaryData.length > 0 ? (
                                    state.commentaryData.map((comm: any, i: number) => (
                                        <div key={i} className={styles.commentaryItem}>
                                            <div className={styles.commentaryTime}>{comm.time || comm.MINUTE || ''}'</div>
                                            <div className={styles.commentaryText}>{comm.text || comm.COMMENT || ''}</div>
                                        </div>
                                    ))
                                ) : (
                                    <div className={styles.emptyState}>
                                        <div style={{ fontSize: '40px', marginBottom: '16px', opacity: 0.3 }}>🎙️</div>
                                        <p className={styles.placeholderText} style={{ fontSize: '16px', fontWeight: '600' }}>Aún no hay comentarios</p>
                                        <p style={{ fontSize: '13px', opacity: 0.5 }}>La narración en vivo comenzará en breve.</p>
                                    </div>
                                )}
                            </div>
                        )}

                        {activeTab === 'lineups' && (
                            <div className={styles.lineupsContainer}>
                                {((matchData.lineups?.HOME_STARTING_LINEUPS || matchData.lineups?.home_team?.starting_lineups || []).length > 0 ||
                                    (matchData.lineups?.AWAY_STARTING_LINEUPS || matchData.lineups?.away_team?.starting_lineups || []).length > 0) ? (
                                    <div className={styles.lineupsGrid}>
                                        <div className={styles.lineupTeam}>
                                            <div className={styles.panelTitle}>{matchData.home.name}</div>
                                            <div className={styles.playerList}>
                                                {(matchData.lineups?.HOME_STARTING_LINEUPS || matchData.lineups?.home_team?.starting_lineups || []).map((p: any, i: number) => {
                                                    const pId = p.PLAYER_ID || p.player_id || p.id;
                                                    const pName = p.PLAYER_NAME || p.player_name;
                                                    return (
                                                        <div key={i} className={styles.playerItem}>
                                                            <span>
                                                                <span className={styles.playerNumber}>{p.PLAYER_NUMBER || p.player_number}</span>{' '}
                                                                {pId ? <Link href={`/jugadores/${pId}`} style={{ color: 'inherit', textDecoration: 'none' }}>{pName}</Link> : pName}
                                                            </span>
                                                            <span style={{ opacity: 0.5, fontSize: '11px' }}>{p.PLAYER_POSITION || p.player_position}</span>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                        <div className={styles.lineupTeam}>
                                            <div className={styles.panelTitle}>{matchData.away.name}</div>
                                            <div className={styles.playerList}>
                                                {(matchData.lineups?.AWAY_STARTING_LINEUPS || matchData.lineups?.away_team?.starting_lineups || []).map((p: any, i: number) => {
                                                    const pId = p.PLAYER_ID || p.player_id || p.id;
                                                    const pName = p.PLAYER_NAME || p.player_name;
                                                    return (
                                                        <div key={i} className={styles.playerItem}>
                                                            <span>
                                                                <span className={styles.playerNumber}>{p.PLAYER_NUMBER || p.player_number}</span>{' '}
                                                                {pId ? <Link href={`/jugadores/${pId}`} style={{ color: 'inherit', textDecoration: 'none' }}>{pName}</Link> : pName}
                                                            </span>
                                                            <span style={{ opacity: 0.5, fontSize: '11px' }}>{p.PLAYER_POSITION || p.player_position}</span>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <div className={styles.emptyState}>
                                        <div style={{ fontSize: '40px', marginBottom: '16px', opacity: 0.3 }}>📋</div>
                                        <p className={styles.placeholderText} style={{ fontSize: '16px', fontWeight: '600' }}>Alineación no registrada</p>
                                        <p style={{ fontSize: '13px', opacity: 0.5 }}>Los equipos aún no han confirmado sus jugadores para este encuentro.</p>
                                    </div>
                                )}
                            </div>
                        )}

                        {activeTab === 'stats' && (
                            <div className={styles.statsList}>
                                <div className={styles.panelTitle}>Estadísticas Completas</div>
                                {statsData.map((stat, i) => {
                                    const hVal = parseFloat(String(stat.home).replace(/[^0-9.]/g, '')) || 0;
                                    const aVal = parseFloat(String(stat.away).replace(/[^0-9.]/g, '')) || 0;
                                    const total = hVal + aVal;
                                    const hPct = total > 0 ? (hVal / total) * 100 : 50;
                                    const aPct = total > 0 ? (aVal / total) * 100 : 50;

                                    return (
                                        <div key={i} className={styles.statItem}>
                                            <div className={styles.statRow}>
                                                <span className={styles.statVal}>{stat.home}</span>
                                                <span className={styles.statLabel}>{stat.label}</span>
                                                <span className={styles.statVal}>{stat.away}</span>
                                            </div>
                                            <div className={styles.statProgress}>
                                                <div className={styles.progressHome} style={{ width: `${hPct}%` }}></div>
                                                <div className={styles.progressAway} style={{ width: `${aPct}%` }}></div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        {activeTab === 'h2h' && (
                            <div className={styles.h2hView}>
                                <div className={styles.panelTitle}>Historial y Forma (H2H)</div>
                                <div className={styles.h2hGrid}>
                                    {/* Column 1: Home Last 5 (Excluding direct H2H) */}
                                    <div className={styles.h2hColumn}>
                                        <div className={styles.h2hColTitle}>Forma: {matchData.home.name}</div>
                                        <div className={styles.h2hList}>
                                            {matchData.h2h?.filter((m: any) => {
                                                const isHomeMatch = m.home_team?.name === matchData.home.name || m.away_team?.name === matchData.home.name;
                                                const isDirectH2H = (m.home_team?.name === matchData.home.name && m.away_team?.name === matchData.away.name) ||
                                                    (m.home_team?.name === matchData.away.name && m.away_team?.name === matchData.home.name);
                                                return isHomeMatch && !isDirectH2H;
                                            }).slice(0, 5).map((m: any, i: number) => (
                                                <H2HItem key={i} m={m} styles={styles} focusTeamName={matchData.home.name} />
                                            ))}
                                        </div>
                                    </div>

                                    {/* Column 2: Direct H2H Last 5 */}
                                    <div className={styles.h2hColumn}>
                                        <div className={styles.h2hColTitle}>Frente a Frente</div>
                                        <div className={styles.h2hList}>
                                            {matchData.h2h?.filter((m: any) =>
                                                (m.home_team?.name === matchData.home.name && m.away_team?.name === matchData.away.name) ||
                                                (m.home_team?.name === matchData.away.name && m.away_team?.name === matchData.home.name)
                                            ).slice(0, 5).map((m: any, i: number) => (
                                                <H2HItem key={i} m={m} styles={styles} />
                                            ))}
                                        </div>
                                    </div>

                                    {/* Column 3: Away Last 5 (Excluding direct H2H) */}
                                    <div className={styles.h2hColumn}>
                                        <div className={styles.h2hColTitle}>Forma: {matchData.away.name}</div>
                                        <div className={styles.h2hList}>
                                            {matchData.h2h?.filter((m: any) => {
                                                const isAwayMatch = m.home_team?.name === matchData.away.name || m.away_team?.name === matchData.away.name;
                                                const isDirectH2H = (m.home_team?.name === matchData.home.name && m.away_team?.name === matchData.away.name) ||
                                                    (m.home_team?.name === matchData.away.name && m.away_team?.name === matchData.home.name);
                                                return isAwayMatch && !isDirectH2H;
                                            }).slice(0, 5).map((m: any, i: number) => (
                                                <H2HItem key={i} m={m} styles={styles} focusTeamName={matchData.away.name} />
                                            ))}
                                        </div>
                                    </div>
                                </div>
                                {(!matchData.h2h || matchData.h2h.length === 0) && <p className={styles.placeholderText}>Historial no disponible.</p>}
                            </div>
                        )}

                        {activeTab === 'standings' && (
                            <div className={styles.standingsList}>
                                {/* Playoff Bracket */}
                                {matchData.draw && matchData.draw.length > 0 && (
                                    <div className={styles.bracketSection}>
                                        <div className={styles.panelTitle}>
                                            Cuadro de Playoffs
                                            <span className={styles.bracketBadge}>BRACKET</span>
                                        </div>
                                        <div className={styles.bracketScrollWrapper}>
                                            <div className={styles.bracketContainer}>
                                                {matchData.draw.map((round: any, ri: number) => {
                                                    const roundName = round.name || round.round_name || round.ROUND_NAME || `Ronda ${ri + 1}`;
                                                    const matches = round.matches || round.MATCHES || round.events || [];

                                                    return (
                                                        <div key={ri} className={styles.bracketRound}>
                                                            <div className={styles.bracketRoundTitle}>{roundName}</div>
                                                            <div className={styles.bracketMatchesCol}>
                                                                {matches.map((m: any, mi: number) => {
                                                                    const homeName = m.home_team?.name || m.HOME_NAME || m.home_name || m.home?.name || 'TBD';
                                                                    const awayName = m.away_team?.name || m.AWAY_NAME || m.away_name || m.away?.name || 'TBD';
                                                                    const homeScore = m.scores?.home ?? m.HOME_SCORE ?? m.home_score ?? m.home_team?.score ?? null;
                                                                    const awayScore = m.scores?.away ?? m.AWAY_SCORE ?? m.away_score ?? m.away_team?.score ?? null;
                                                                    const homeLogo = m.home_team?.image_path || m.home_team?.small_image_path || m.home_team?.logo || '';
                                                                    const awayLogo = m.away_team?.image_path || m.away_team?.small_image_path || m.away_team?.logo || '';
                                                                    const isFinished = m.match_status?.is_finished || m.is_finished || m.status === 'finished';
                                                                    const isCurrentMatch = m.match_id === id;
                                                                    const homeWon = isFinished && homeScore !== null && awayScore !== null && Number(homeScore) > Number(awayScore);
                                                                    const awayWon = isFinished && homeScore !== null && awayScore !== null && Number(awayScore) > Number(homeScore);
                                                                    const isThisMatch =
                                                                        (homeName === matchData.home.name && awayName === matchData.away.name) ||
                                                                        (homeName === matchData.away.name && awayName === matchData.home.name) ||
                                                                        isCurrentMatch;

                                                                    return (
                                                                        <div key={mi} className={`${styles.bracketMatch} ${isThisMatch ? styles.bracketMatchCurrent : ''}`}>
                                                                            <div className={`${styles.bracketTeamRow} ${homeWon ? styles.bracketWinner : ''}`}>
                                                                                <div className={styles.bracketTeamInfo}>
                                                                                    {homeLogo ? (
                                                                                        <img src={homeLogo} alt="" className={styles.bracketLogo} />
                                                                                    ) : (
                                                                                        <div className={styles.bracketLogoPlaceholder} />
                                                                                    )}
                                                                                    <span className={styles.bracketTeamName}>{homeName}</span>
                                                                                </div>
                                                                                <span className={styles.bracketScore}>{homeScore ?? '-'}</span>
                                                                            </div>
                                                                            <div className={styles.bracketDivider} />
                                                                            <div className={`${styles.bracketTeamRow} ${awayWon ? styles.bracketWinner : ''}`}>
                                                                                <div className={styles.bracketTeamInfo}>
                                                                                    {awayLogo ? (
                                                                                        <img src={awayLogo} alt="" className={styles.bracketLogo} />
                                                                                    ) : (
                                                                                        <div className={styles.bracketLogoPlaceholder} />
                                                                                    )}
                                                                                    <span className={styles.bracketTeamName}>{awayName}</span>
                                                                                </div>
                                                                                <span className={styles.bracketScore}>{awayScore ?? '-'}</span>
                                                                            </div>
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* Standings Table */}
                                {matchData.standings && matchData.standings.length > 0 && (
                                    <>
                                        <div className={styles.panelTitle} style={matchData.draw?.length > 0 ? { marginTop: '32px' } : {}}>Tabla de Posiciones</div>
                                        <table className={styles.standingsTable}>
                                            <thead>
                                                <tr>
                                                    <th>#</th>
                                                    <th>Equipo</th>
                                                    <th>PJ</th>
                                                    <th>DG</th>
                                                    <th>PTS</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {matchData.standings.slice(0, 20).map((row: any, i: number) => {
                                                    const rowName = row.name || row.TEAM_NAME || row.team_name;
                                                    const isCurrent = rowName === matchData.home.name || rowName === matchData.away.name ||
                                                        row.team_id === matchData.home.id || row.team_id === matchData.away.id;

                                                    return (
                                                        <tr key={i} className={isCurrent ? styles.currentTeam : ''}>
                                                            <td><span className={styles.rankBadge}>{row.rank || i + 1}</span></td>
                                                            <td style={isCurrent ? { color: 'var(--accent)', fontWeight: '700' } : {}}>
                                                                {row.team_id ? <Link href={`/clubes/fs-team-${row.team_id}`} style={{ color: 'inherit', textDecoration: 'none' }}>{rowName}</Link> : rowName}
                                                            </td>
                                                            <td>{row.matches_played || row.PLAYED || row.played || 0}</td>
                                                            <td>{row.goal_difference || row.GOAL_DIFF || row.goal_diff || 0}</td>
                                                            <td><strong>{row.points || row.POINTS || 0}</strong></td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </>
                                )}

                                {(!matchData.standings || matchData.standings.length === 0) && (!matchData.draw || matchData.draw.length === 0) && (
                                    <p className={styles.placeholderText}>Clasificación no disponible.</p>
                                )}
                            </div>
                        )}

                        {activeTab === 'players' && (
                            <div className={styles.playersStatsView}>
                                <div className={styles.panelTitle}>Estadísticas de Jugadores</div>
                                {state.playerStats?.stat_groups && state.playerStats.stat_groups.length > 0 ? (
                                    state.playerStats.stat_groups.map((group: any, i: number) => (
                                        group && group.stats && Array.isArray(group.stats) && (
                                            <div key={i} style={{ marginBottom: '24px' }}>
                                                <div style={{ fontSize: '12px', color: 'var(--accent)', textTransform: 'uppercase', marginBottom: '12px', fontWeight: '800' }}>{group.group_name}</div>
                                                <div className={styles.playerStatsGrid}>
                                                    {group.stats.map((s: any, j: number) => (
                                                        <div key={j} className={styles.playerStatRow}>
                                                            <div className={styles.playerStatHome}>
                                                                {s.home_team && (() => {
                                                                    const homePlayerName = state.playerStats.players?.find((p: any) => p.player_id === s.home_team.player_id)?.player_name || 'Jugador';
                                                                    return (
                                                                        <>
                                                                            <span className={styles.playerStatName}>
                                                                                {s.home_team.player_id ? <Link href={`/jugadores/${s.home_team.player_id}`} style={{ color: 'inherit', textDecoration: 'none' }}>{homePlayerName}</Link> : homePlayerName}
                                                                            </span>
                                                                            <span className={styles.playerStatVal}>{s.home_team.value}</span>
                                                                        </>
                                                                    );
                                                                })()}
                                                            </div>
                                                            <div className={styles.playerStatLabel}>{s.name}</div>
                                                            <div className={styles.playerStatAway}>
                                                                {s.away_team && (() => {
                                                                    const awayPlayerName = state.playerStats.players?.find((p: any) => p.player_id === s.away_team.player_id)?.player_name || 'Jugador';
                                                                    return (
                                                                        <>
                                                                            <span className={styles.playerStatVal}>{s.away_team.value}</span>
                                                                            <span className={styles.playerStatName}>
                                                                                {s.away_team.player_id ? <Link href={`/jugadores/${s.away_team.player_id}`} style={{ color: 'inherit', textDecoration: 'none' }}>{awayPlayerName}</Link> : awayPlayerName}
                                                                            </span>
                                                                        </>
                                                                    );
                                                                })()}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )
                                    ))
                                ) : (
                                    <div className={styles.emptyState}>
                                        <div style={{ fontSize: '40px', marginBottom: '16px', opacity: 0.3 }}>🏃‍♂️</div>
                                        <p className={styles.placeholderText} style={{ fontSize: '16px', fontWeight: '600' }}>Estadísticas de jugadores no registradas</p>
                                        <p style={{ fontSize: '13px', opacity: 0.5 }}>No se dispone de datos individuales para este encuentro.</p>
                                    </div>
                                )}
                            </div>
                        )}
                    </section>

                    <aside className={styles.sidebarColumn}>
                        {matchData.form && Array.isArray(matchData.form) && matchData.form.length > 0 && (
                            <section className={styles.panelBlock}>
                                <div className={styles.panelTitle}>Racha Reciente</div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                                    {matchData.form.map((group: any, idx: number) => (
                                        group && group.items && Array.isArray(group.items) && (
                                            <div key={idx}>
                                                <div style={{ fontSize: '11px', color: 'var(--muted)', marginBottom: '8px', textTransform: 'uppercase' }}>{group.title}</div>
                                                <div className={styles.formRow}>
                                                    {group.items.slice(0, 5).map((item: any, i: number) => (
                                                        <div key={i} className={`${styles.resultCircle} ${item.result === 'W' ? styles.win : item.result === 'D' ? styles.draw : styles.loss}`} title={item.score}>
                                                            {item.result}
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )
                                    ))}
                                </div>
                            </section>
                        )}

                        {matchData.topScorers && Array.isArray(matchData.topScorers) && matchData.topScorers.length > 0 && (
                            <section className={styles.panelBlock}>
                                <div className={styles.panelTitle}>Goleadores</div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                    {matchData.topScorers.slice(0, 5).map((s: any, i: number) => (
                                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '13px' }}>
                                            <div>
                                                <div style={{ fontWeight: '600' }}>{s.PLAYER_NAME || s.player_name}</div>
                                                <div style={{ fontSize: '11px', color: 'var(--muted)' }}>{s.TEAM_NAME || s.team_name}</div>
                                            </div>
                                            <div style={{ color: 'var(--accent)', fontWeight: '800', fontFamily: 'var(--font-mono)' }}>{s.GOALS || s.goals_count}</div>
                                        </div>
                                    ))}
                                </div>
                            </section>
                        )}

                        <section className={styles.panelBlock}>
                            <div className={styles.panelTitle}>Reporte Analítico</div>
                            <ExportImage
                                template="matchStats"
                                data={{
                                    status: matchData.status as 'scheduled' | 'live' | 'final',
                                    homeTeam: matchData.home.name,
                                    awayTeam: matchData.away.name,
                                    homeScore: matchData.home.score,
                                    awayScore: matchData.away.score,
                                    homeLogo: matchData.home.logo,
                                    awayLogo: matchData.away.logo,
                                    tournament: matchData.tournament,
                                    date: new Date(matchData.date).toLocaleDateString('es-AR', { timeZone: USER_TZ }),
                                    time: matchData.time,
                                    stats: statsData
                                }}
                                filename={`reporte-${matchData.home.name}-${matchData.away.name}`}
                            />
                        </section>
                    </aside>
                </main>
            </div>
        </div>
    );
}
