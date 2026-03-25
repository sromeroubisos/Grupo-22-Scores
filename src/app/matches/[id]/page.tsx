'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import ExportImage from '@/components/ExportImage';
import MatchWinnerVoteCard from '@/components/MatchWinnerVoteCard';
import styles from './page.module.css';
import { parseAnyMatches, withStats } from '@/lib/matchSchema';
import { APP_TIMEZONE } from '@/lib/timezone';
import { useAuth } from '@/context/AuthContext';

const USER_TZ = APP_TIMEZONE;

function isExternalEntityId(value?: string) {
    return Boolean(value) && /^[A-Za-z0-9]+$/.test(value || '');
}

function buildTeamHref(team: { id?: string; name?: string; teamUrl?: string }, preferredSport?: string | number | null) {
    if (!team.id) return '/clubs';

    const params = new URLSearchParams();
    if (team.name) params.set('name', team.name);
    if (team.teamUrl) params.set('team_url', team.teamUrl);
    if (preferredSport) params.set('sport', String(preferredSport));
    const qs = params.toString();
    const id = team.id.startsWith('fs-team-')
        ? team.id
        : team.id.startsWith('fs-')
            ? `fs-team-${team.id.slice(3)}`
            : team.id;

    return `/clubs/${id}${qs ? `?${qs}` : ''}`;
}

function buildTournamentHref(tournamentId?: string) {
    if (!tournamentId) return null;

    const id = tournamentId.startsWith('fs-')
        ? tournamentId
        : isExternalEntityId(tournamentId)
            ? `fs-${tournamentId}`
            : tournamentId;

    return `/tournaments/${id}`;
}

function mapMatchStatus(matchStatusObj: any, simpleStatus?: string) {
    if (matchStatusObj) {
        if (matchStatusObj.type === 'inprogress') return 'live';
        if (matchStatusObj.type === 'finished') return 'final';
        if (matchStatusObj.type === 'postponed') return 'postponed';
        if (matchStatusObj.type === 'canceled' || matchStatusObj.type === 'cancelled') return 'cancelled';

        if (matchStatusObj.is_finished) return 'final';
        if (matchStatusObj.is_in_progress || matchStatusObj.is_started) return 'live';
        if (matchStatusObj.is_postponed) return 'postponed';
        if (matchStatusObj.is_cancelled) return 'cancelled';

        if (matchStatusObj.code) {
            const code = String(matchStatusObj.code).toLowerCase();
            if (code === 'ht' || code.includes('half') || code.includes('period') || code.includes('quarter') || code.includes('live')) {
                return 'live';
            }
        }
    }

    const status = String(simpleStatus || '').toLowerCase();
    const liveIndicators = [
        'live', 'playing', 'current', 'inprogress',
        '1st half', '2nd half', '1st period', '2nd period', '3rd period',
        '1st quarter', '2nd quarter', '3rd quarter', '4th quarter',
        'set 1', 'set 2', 'set 3', 'set 4', 'set 5',
        'inning', 'batting', 'fielding',
        'timeout', 'break', 'halftime', 'ht', 'pause'
    ];

    if (status.includes('finished') || status.includes('final') || status.includes('ended') || status.includes('full time') || status === 'ft') {
        return 'final';
    }

    if (liveIndicators.some((indicator) => status.includes(indicator))) {
        return 'live';
    }

    if (status.includes('postponed') || status.includes('aplazado')) return 'postponed';
    if (status.includes('cancelled') || status.includes('cancelado') || status.includes('abandoned')) return 'cancelled';

    return 'scheduled';
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
    const { user } = useAuth();

    const [state, setState] = useState<{
        kind: 'loading' | 'error' | 'empty' | 'ok';
        matchData?: any;
        eventsData: any[];
        statsData: any[];
        playerStats: any;
        commentaryData: any[];
        issues: any[];
        debug: Record<string, unknown>;
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
    const [showAllEvents, setShowAllEvents] = useState(false);
    const isFlashScore = /^[A-Za-z0-9]{8}$/.test(id);
    const isSuperAdminUser = user?.role === 'super_admin' || user?.role === 'admin_general';

    useEffect(() => {
        const controller = new AbortController();

        async function fetchData() {
            setState(prev => prev.matchData ? prev : { ...prev, kind: 'loading' });

            try {
                if (isFlashScore) {
                    const apiRes = await fetch(`/api/matches/${id}`, { signal: controller.signal });
                    const payload = await apiRes.json().catch(() => null);

                    if (!apiRes.ok) {
                        setState(prev => ({
                            ...prev,
                            kind: apiRes.status === 404 ? 'empty' : 'error',
                            message: payload?.error || (apiRes.status === 404 ? 'No se encontró el partido' : 'Error cargando datos'),
                            debug: { ...prev.debug, details: payload }
                        }));
                        return;
                    }

                    const detailsRes = payload?.details;
                    const summaryRes = payload?.summary;
                    const statsRes = payload?.stats;
                    const h2hRes = payload?.h2h;
                    const formRes = payload?.form;
                    const lineupsRes = payload?.lineups;
                    const standingsRes = payload?.standings;
                    const dayMatchesRes = payload?.dayMatches;
                    const playerStatsRes = payload?.playerStats;
                    const commentaryRes = payload?.commentary;
                    const drawRes = payload?.draw;
                    const topScorersRes = payload?.topScorers;
                    const debugDetails = payload?.details ?? payload;

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
                    const fsStatus = mapMatchStatus(evt.match_status, evt.STAGE_TYPE || evt.status);

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

                    const initialHomeScore = evt.scores?.home ?? evt.HOME_SCORE_CURRENT ?? baseMatch.scoreHome;
                    const initialAwayScore = evt.scores?.away ?? evt.AWAY_SCORE_CURRENT ?? baseMatch.scoreAway;

                    statusRef.current = fsStatus;
                    setState(prev => ({
                        ...prev,
                        kind: 'ok',
                        matchData: {
                            ...baseMatch,
                            sportId,
                            status: fsStatus,
                            round: evt.tournament?.stage_id || evt.ROUND_NAME || 'General',
                            category: evt.country?.name || evt.COUNTRY_NAME || baseMatch.category || 'Internacional',
                            tournamentId: evt.tournament?.tournament_stage_id || evt.tournament?.tournament_id || evt.TOURNAMENT_STAGE_ID || '',
                            home: { ...baseMatch.home, score: initialHomeScore, teamUrl: evt.home_team?.team_url || '' },
                            away: { ...baseMatch.away, score: initialAwayScore, teamUrl: evt.away_team?.team_url || '' },
                            lineups: null,
                            standings: [],
                            h2h: [],
                            draw: [],
                        },
                        eventsData: [],
                        statsData: [],
                        playerStats: null,
                        commentaryData: [],
                        issues: zodIssues,
                        debug: { ...prev.debug, details: debugDetails }
                    }));

                    if (controller.signal.aborted) return;

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

                    const rawSummary = summaryRes?.DATA || summaryRes || [];
                    const summaryItemsRaw = Array.isArray(rawSummary) ? rawSummary : (rawSummary.INCIDENTS || rawSummary.incidents || []);

                    const { out: incidents } = withStats(
                        Array.isArray(summaryItemsRaw) ? summaryItemsRaw : [],
                        (incident: any) => {
                            if (!incident || typeof incident !== 'object') return null;

                            const type = incident.type || incident.INCIDENT_TYPE || incident.event_type;
                            if (!type) return null;

                            const time = incident.minutes || incident.INCIDENT_MINUTE || incident.time || incident.period || '?';
                            const player = incident.name || incident.INCIDENT_PARTICIPANT_NAME || incident.player_name || 'Jugador';

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
                    let hScoreFinal = baseMatch.scoreHome;
                    let aScoreFinal = baseMatch.scoreAway;

                    if (hScoreFinal === null || hScoreFinal === 0) {
                        const candidateH = evt.scores?.home ?? listMatchEvt?.scores?.home ?? evt.HOME_SCORE_CURRENT ?? rawSummaryData.SCORE_HOME ?? rawSummaryData.HOME_SCORE ?? null;
                        const candidateA = evt.scores?.away ?? listMatchEvt?.scores?.away ?? evt.AWAY_SCORE_CURRENT ?? rawSummaryData.SCORE_AWAY ?? rawSummaryData.AWAY_SCORE ?? null;

                        if (candidateH !== null) hScoreFinal = Number(candidateH);
                        if (candidateA !== null) aScoreFinal = Number(candidateA);
                    }

                    if ((fsStatus === 'live' || fsStatus === 'final') && hScoreFinal === null) {
                        hScoreFinal = 0;
                        aScoreFinal = 0;
                    }

                    const resolvedStandings = (() => {
                        if (Array.isArray(standingsRes)) return standingsRes;
                        if (standingsRes?.DATA?.[0]?.ROWS) return standingsRes.DATA[0].ROWS;
                        if (standingsRes?.DATA?.rows) return standingsRes.DATA.rows;
                        if (standingsRes?.DATA?.standings) return standingsRes.DATA.standings;
                        if (standingsRes?.rows) return standingsRes.rows;
                        if (standingsRes?.standings) return standingsRes.standings;
                        if (standingsRes?.DATA && Array.isArray(standingsRes.DATA)) return standingsRes.DATA;
                        return [];
                    })();

                    const resolvedDraw = (() => {
                        const raw = drawRes?.DATA || drawRes;
                        if (Array.isArray(raw) && raw.length > 0) return raw;
                        if (raw?.rounds && Array.isArray(raw.rounds)) return raw.rounds;
                        if (raw?.draw && Array.isArray(raw.draw)) return raw.draw;
                        return [];
                    })();

                    const rawStats = statsRes?.DATA || statsRes || {};
                    let statItems: any[] = [];

                    if (Array.isArray(rawStats)) {
                        statItems = rawStats;
                    } else if (rawStats.match && Array.isArray(rawStats.match)) {
                        statItems = rawStats.match;
                    } else if (rawStats.STATS && Array.isArray(rawStats.STATS)) {
                        statItems = rawStats.STATS;
                    } else if (rawStats.stats && Array.isArray(rawStats.stats)) {
                        statItems = rawStats.stats;
                    } else if (rawStats.statistics && Array.isArray(rawStats.statistics)) {
                        statItems = rawStats.statistics;
                    }

                    const stats = statItems
                        .filter((s: any) => s && typeof s === 'object')
                        .map((s: any) => ({
                            label: s.name || s.SECT_NAME || s.label || s.stat_name || 'General',
                            home: String(s.home_team ?? s.HOME_VALUE ?? s.home ?? s.home_value ?? '0'),
                            away: String(s.away_team ?? s.AWAY_VALUE ?? s.away ?? s.away_value ?? '0')
                        }));

                    const resolvedForm = (() => {
                        const raw = formRes?.DATA || formRes || [];
                        if (!Array.isArray(raw)) return [];

                        return raw
                            .map((group: any, index: number) => {
                                const items = group.items || group.FORM || group.form || group.rows || group.RESULTS || [];
                                return {
                                    title: group.title || group.name || group.team_name || group.TEAM_NAME || `Equipo ${index + 1}`,
                                    items: Array.isArray(items)
                                        ? items.map((item: any) => ({
                                            result: item.result || item.RESULT || item.form || item.code || '',
                                            score: item.score || item.SCORE || item.result_text || '',
                                        }))
                                        : [],
                                };
                            })
                            .filter((group: any) => Array.isArray(group.items) && group.items.length > 0);
                    })();

                    const resolvedTopScorers = (() => {
                        const raw = topScorersRes?.DATA || topScorersRes;
                        if (Array.isArray(raw)) return raw;
                        if (Array.isArray(raw?.ROWS)) return raw.ROWS;
                        if (Array.isArray(raw?.topScorers)) return raw.topScorers;
                        if (Array.isArray(raw?.top_scorers)) return raw.top_scorers;
                        return [];
                    })();

                    setState(prev => {
                        if (!prev.matchData) return prev;

                        return {
                            ...prev,
                            kind: 'ok',
                            matchData: {
                                ...prev.matchData,
                                status: listMatchEvt?.match_status ? mapMatchStatus(listMatchEvt.match_status) : fsStatus,
                                home: { ...prev.matchData.home, score: hScoreFinal, teamUrl: evt.home_team?.team_url || '' },
                                away: { ...prev.matchData.away, score: aScoreFinal, teamUrl: evt.away_team?.team_url || '' },
                                lineups: lineupsRes?.DATA || lineupsRes || null,
                                standings: resolvedStandings,
                                h2h: Array.isArray(h2hRes) ? h2hRes : (h2hRes?.DATA || h2hRes?.data || h2hRes?.matches || []),
                                draw: resolvedDraw,
                                form: resolvedForm,
                                topScorers: resolvedTopScorers,
                            },
                            eventsData: incidents,
                            statsData: stats,
                            playerStats: playerStatsRes?.DATA || playerStatsRes || null,
                            commentaryData: commentaryRes?.DATA || commentaryRes || [],
                            issues: zodIssues,
                            debug: { ...prev.debug, details: debugDetails }
                        };
                    });
                } else {
                    // DATABASE MATCH LOGIC - Fetch from Supabase via API
                    try {
                        const res = await fetch(`/api/matches/${id}`, { signal: controller.signal });
                        if (res.ok) {
                            const matchData = await res.json();

                            const sportId = matchData.sportId || 2;
                            const score = matchData.score || { home: 0, away: 0 };
                            const homeClubId = matchData.homeClub?.id || matchData.homeClubId || '';
                            const awayClubId = matchData.awayClub?.id || matchData.awayClubId || '';
                            const tournamentId = matchData.tournamentId || '';

                            const baseProcessedMatch = {
                                id: matchData.id,
                                status: matchData.status || 'scheduled',
                                sportId,
                                date: matchData.dateTime,
                                time: matchData.dateTime
                                    ? new Date(matchData.dateTime).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: USER_TZ })
                                    : '--:--',
                                tournament: matchData.tournament?.name || 'Partido Local',
                                tournamentLogo: matchData.tournament?.logo || null,
                                tournamentId,
                                category: 'General',
                                round: matchData.roundLabel || matchData.roundId || '',
                                venue: matchData.venue || 'Por definir',
                                referee: matchData.referee || null,
                                home: {
                                    id: homeClubId || 'home',
                                    name: matchData.homeClub?.name || 'Local',
                                    logo: matchData.homeClub?.logo || null,
                                    score: matchData.status === 'scheduled' ? null : (score.home ?? 0)
                                },
                                away: {
                                    id: awayClubId || 'away',
                                    name: matchData.awayClub?.name || 'Visitante',
                                    logo: matchData.awayClub?.logo || null,
                                    score: matchData.status === 'scheduled' ? null : (score.away ?? 0)
                                },
                                events: matchData.events || [],
                                lineups: matchData.lineups || null,
                                standings: [],
                                h2h: [],
                                draw: []
                            };

                            statusRef.current = matchData.status || 'scheduled';
                            setState({
                                kind: 'ok',
                                matchData: baseProcessedMatch,
                                eventsData: matchData.events || [],
                                statsData: [],
                                playerStats: null,
                                commentaryData: [],
                                issues: [],
                                debug: {}
                            });

                            // Parallel-fetch standings + H2H
                            const [standingsRes, h2hRes] = await Promise.allSettled([
                                tournamentId
                                    ? fetch(`/api/db/standings?tournament=${tournamentId}`, { signal: controller.signal }).then(r => r.ok ? r.json() : null)
                                    : Promise.resolve(null),
                                homeClubId && awayClubId
                                    ? fetch(`/api/db/h2h?home=${homeClubId}&away=${awayClubId}`, { signal: controller.signal }).then(r => r.ok ? r.json() : null)
                                    : Promise.resolve(null),
                            ]);

                            if (controller.signal.aborted) return;

                            // Map DB standings rows → format expected by the match detail standings renderer
                            const rawStandings = standingsRes.status === 'fulfilled' && standingsRes.value?.standings
                                ? standingsRes.value.standings
                                : [];
                            const standings = rawStandings.map((row: any) => ({
                                rank: row.position,
                                name: row.team?.name ?? '',
                                played: row.matches_total ?? 0,
                                goal_difference: row.goal_difference ?? 0,
                                points: row.points_total ?? 0,
                            }));
                            const h2h = h2hRes.status === 'fulfilled' && h2hRes.value?.matches
                                ? h2hRes.value.matches
                                : [];

                            const processedMatch = {
                                id: matchData.id,
                                status: matchData.status || 'scheduled',
                                sportId,
                                date: matchData.dateTime,
                                time: matchData.dateTime
                                    ? new Date(matchData.dateTime).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: USER_TZ })
                                    : '--:--',
                                tournament: matchData.tournament?.name || 'Partido Local',
                                tournamentLogo: matchData.tournament?.logo || null,
                                tournamentId,
                                category: 'General',
                                round: matchData.roundLabel || matchData.roundId || '',
                                venue: matchData.venue || 'Por definir',
                                referee: matchData.referee || null,
                                home: {
                                    id: homeClubId || 'home',
                                    name: matchData.homeClub?.name || 'Local',
                                    logo: matchData.homeClub?.logo || null,
                                    score: matchData.status === 'scheduled' ? null : (score.home ?? 0)
                                },
                                away: {
                                    id: awayClubId || 'away',
                                    name: matchData.awayClub?.name || 'Visitante',
                                    logo: matchData.awayClub?.logo || null,
                                    score: matchData.status === 'scheduled' ? null : (score.away ?? 0)
                                },
                                events: matchData.events || [],
                                lineups: matchData.lineups || null,
                                standings,
                                h2h,
                                draw: []
                            };

                            statusRef.current = matchData.status || 'scheduled';
                            setState({
                                kind: 'ok',
                                matchData: processedMatch,
                                eventsData: matchData.events || [],
                                statsData: [],
                                playerStats: null,
                                commentaryData: [],
                                issues: [],
                                debug: {}
                            });
                        } else {
                            setState(prev => ({
                                ...prev,
                                kind: 'empty',
                                message: 'No se encontró el partido en la base de datos'
                            }));
                        }
                    } catch (fetchErr: any) {
                        if (fetchErr?.name === 'AbortError') return;
                        console.error('Error fetching DB match:', fetchErr);
                        setState(prev => ({
                            ...prev,
                            kind: prev.matchData ? prev.kind : 'error',
                            message: prev.matchData
                                ? 'No se pudo actualizar el partido desde la base de datos.'
                                : 'Error al cargar el partido desde la base de datos'
                        }));
                    }
                }
            } catch (error: any) {
                if (error?.name === 'AbortError' || controller.signal.aborted) {
                    return;
                }
                console.error("Fetch Error:", error);
                setState(prev => ({
                    ...prev,
                    kind: prev.matchData ? prev.kind : 'error',
                    message: prev.matchData ? 'No se pudo actualizar la información del partido.' : 'Error cargando datos'
                }));
            }
        }

        fetchData();

        const interval = setInterval(() => {
            if (statusRef.current === 'live') {
                fetchData();
            }
        }, 60000);

        return () => {
            clearInterval(interval);

            if (!controller.signal.aborted) {
                controller.abort(new DOMException('Match detail effect cleanup', 'AbortError'));
            }
        };
    }, [id]);

    if (state.kind === 'loading') return (
        <div className={styles.page} style={{ minHeight: '100vh', background: 'var(--bg-primary, #0f1117)' }}>
            <div style={{ background: 'linear-gradient(135deg, #1a1f2e 0%, #16213e 100%)', padding: '16px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ width: 20, height: 20, borderRadius: '50%', background: 'rgba(255,255,255,0.08)', marginBottom: 20, animation: 'pulse 1.5s ease-in-out infinite' }} />
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                    {[0, 1].map(i => (
                        <div key={i} style={{ display: 'flex', flexDirection: 'column' as const, alignItems: 'center', gap: 8, flex: 1 }}>
                            <div style={{ width: 56, height: 56, borderRadius: 8, background: 'rgba(255,255,255,0.08)', animation: 'pulse 1.5s ease-in-out infinite' }} />
                            <div style={{ width: '60%', height: 14, borderRadius: 4, background: 'rgba(255,255,255,0.07)', animation: 'pulse 1.5s ease-in-out infinite' }} />
                        </div>
                    ))}
                    <div style={{ display: 'flex', flexDirection: 'column' as const, alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 80, height: 36, borderRadius: 8, background: 'rgba(255,255,255,0.10)', animation: 'pulse 1.5s ease-in-out infinite' }} />
                        <div style={{ width: 60, height: 20, borderRadius: 12, background: 'rgba(255,255,255,0.06)', animation: 'pulse 1.5s ease-in-out infinite' }} />
                    </div>
                </div>
            </div>
            <div style={{ display: 'flex', gap: 4, padding: '10px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                {[80, 64, 72, 96, 64].map((w, i) => (
                    <div key={i} style={{ width: w, height: 32, borderRadius: 6, flexShrink: 0, background: i === 0 ? 'rgba(99,102,241,0.25)' : 'rgba(255,255,255,0.06)', animation: 'pulse 1.5s ease-in-out infinite' }} />
                ))}
            </div>
            <div style={{ padding: '16px', maxWidth: 700, margin: '0 auto' }}>
                {[1, 2, 3, 4, 5].map(i => (
                    <div key={i} style={{ height: 52, borderRadius: 8, background: 'rgba(255,255,255,0.04)', marginBottom: 8, animation: 'pulse 1.5s ease-in-out infinite' }} />
                ))}
            </div>
            <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }`}</style>
        </div>
    );

    if (state.kind === 'error' || state.kind === 'empty') {
        return (
            <div className={styles.page}>
                <div className={styles.appContainer}>
                    <div style={{ padding: '40px', textAlign: 'center', background: state.kind === 'error' ? 'rgba(255,0,0,0.1)' : 'rgba(255,255,255,0.05)', borderRadius: '12px' }}>
                        <h2>{state.kind === 'error' ? 'Error cargando datos' : 'No hay datos disponibles todavía'}</h2>
                        <p style={{ margin: '16px 0', opacity: 0.8 }}>{state.message}</p>
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
                                <Link href={buildTournamentHref(matchData.tournamentId) || '#'} className={styles.breadcrumbItem} style={{ color: 'var(--color-accent, var(--accent))', textDecoration: 'none' }}>
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
                        {isSuperAdminUser && !isFlashScore && (
                            <Link href={`/admin/super/partidos/${id}`} className={`${styles.btn} ${styles.btnPrimary}`}>
                                Editar partido
                            </Link>
                        )}
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
                            <Link href={buildTeamHref(matchData.home, matchData.sportId)} style={{ textDecoration: 'none' }}>
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
                                <Link href={buildTeamHref(matchData.home, matchData.sportId)} style={{ textDecoration: 'none', color: 'inherit' }}>
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
                                            tournamentLogo: matchData.tournamentLogo,
                                            date: new Date(matchData.date).toLocaleDateString('es-AR', { timeZone: USER_TZ }),
                                            time: matchData.time,
                                            kickoffAt: matchData.date,
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
                            <Link href={buildTeamHref(matchData.away, matchData.sportId)} style={{ textDecoration: 'none' }}>
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
                                <Link href={buildTeamHref(matchData.away, matchData.sportId)} style={{ textDecoration: 'none', color: 'inherit' }}>
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
                                                            {evt.playerId ? <Link href={`/players/${evt.playerId}`} style={{ color: 'inherit', textDecoration: 'none' }}>{evt.player}</Link> : evt.player}
                                                        </div>
                                                        {evt.type?.toLowerCase().includes('subst') ? (
                                                            <div className={styles.eventSubInfo}>
                                                                <span className={styles.playerIn}>{evt.playerId ? <Link href={`/players/${evt.playerId}`} style={{ color: 'inherit', textDecoration: 'none' }}>{evt.player}</Link> : evt.player}</span><br />
                                                                <span className={styles.playerOut}>{evt.subPlayerId ? <Link href={`/players/${evt.subPlayerId}`} style={{ color: 'inherit', textDecoration: 'none' }}>{evt.subPlayer}</Link> : evt.subPlayer}</span>
                                                            </div>
                                                        ) : (
                                                            <div className={styles.eventSubInfo}>
                                                                {evt.subPlayer && <span className={styles.assistText}>asistencia de {evt.subPlayerId ? <Link href={`/players/${evt.subPlayerId}`} style={{ color: 'inherit', textDecoration: 'none' }}>{evt.subPlayer}</Link> : evt.subPlayer}</span>}
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
                                                                {pId ? <Link href={`/players/${pId}`} style={{ color: 'inherit', textDecoration: 'none' }}>{pName}</Link> : pName}
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
                                                                {pId ? <Link href={`/players/${pId}`} style={{ color: 'inherit', textDecoration: 'none' }}>{pName}</Link> : pName}
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
                                                                {row.team_id ? <Link href={`/clubs/fs-team-${row.team_id}${matchData.sportId ? `?sport=${encodeURIComponent(String(matchData.sportId))}` : ''}`} style={{ color: 'inherit', textDecoration: 'none' }}>{rowName}</Link> : rowName}
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
                                                                                {s.home_team.player_id ? <Link href={`/players/${s.home_team.player_id}`} style={{ color: 'inherit', textDecoration: 'none' }}>{homePlayerName}</Link> : homePlayerName}
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
                                                                                {s.away_team.player_id ? <Link href={`/players/${s.away_team.player_id}`} style={{ color: 'inherit', textDecoration: 'none' }}>{awayPlayerName}</Link> : awayPlayerName}
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
                        <section className={styles.panelBlock}>
                            <MatchWinnerVoteCard
                                matchId={matchData.id || id}
                                status={matchData.status}
                                homeTeam={{
                                    name: matchData.home.name,
                                    logo: matchData.home.logo,
                                }}
                                awayTeam={{
                                    name: matchData.away.name,
                                    logo: matchData.away.logo,
                                }}
                                homeScore={typeof matchData.home.score === 'number' ? matchData.home.score : null}
                                awayScore={typeof matchData.away.score === 'number' ? matchData.away.score : null}
                            />
                        </section>

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
                                    tournamentLogo: matchData.tournamentLogo,
                                    date: new Date(matchData.date).toLocaleDateString('es-AR', { timeZone: USER_TZ }),
                                    time: matchData.time,
                                    kickoffAt: matchData.date,
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
