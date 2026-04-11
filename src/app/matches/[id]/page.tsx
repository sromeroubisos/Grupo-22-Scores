'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import ExportImage from '@/components/ExportImage';
import MatchWinnerVoteCard from '@/components/MatchWinnerVoteCard';
import styles from './page.module.css';
import {
    buildLocalPlayerStatsRows,
    buildLocalTeamStats,
    normalizeLocalEvents,
    normalizeLocalLineups,
    type LocalPlayerStatsRow,
} from '@/lib/localMatchData';
import { parseAnyMatches, withStats } from '@/lib/matchSchema';
import { SPORTS } from '@/lib/data/sports';
import { APP_TIMEZONE } from '@/lib/timezone';
import { calculateVirtualMatchTime } from '@/lib/virtualClock';
import { resolveTeamLogo } from '@/lib/utils/teamLogoOverrides';
import { resolveTournamentLogo as resolveTournamentLogoSource } from '@/lib/utils/tournamentLogo';
import { useAuth } from '@/context/AuthContext';

const USER_TZ = APP_TIMEZONE;

function formatClockLabel(
    clock: { minute?: number | null; seconds?: number | null; period?: string | null; running?: boolean | null } | null | undefined,
    syncedAt?: string | null,
) {
    if (!clock) return '';

    const minute = Number(clock.minute);
    const seconds = Number(clock.seconds);
    let totalSeconds =
        (Number.isFinite(minute) ? Math.max(0, Math.trunc(minute)) : 0) * 60
        + (Number.isFinite(seconds) ? Math.max(0, Math.trunc(seconds)) : 0);

    if (clock.running && syncedAt) {
        const syncedTime = new Date(syncedAt);
        if (!Number.isNaN(syncedTime.getTime())) {
            totalSeconds += Math.max(0, Math.floor((Date.now() - syncedTime.getTime()) / 1000));
        }
    }

    const safeMinute = Math.floor(totalSeconds / 60);
    const safeSeconds = totalSeconds % 60;
    const period = String(clock.period || '').trim();
    const time = `${String(safeMinute).padStart(2, '0')}:${String(safeSeconds).padStart(2, '0')}`;
    return period ? `${time} - ${period}` : time;
}

function resolvePublicMatchTime(
    dateTime: string | null | undefined,
    sportId: string | null | undefined,
    status: string | null | undefined,
    clock: { minute?: number | null; seconds?: number | null; period?: string | null; running?: boolean | null } | null | undefined,
    syncedAt?: string | null,
) {
    const normalizedStatus = String(status || '').toLowerCase();

    if (normalizedStatus === 'live') {
        const clockLabel = formatClockLabel(clock, syncedAt);
        if (clockLabel) return clockLabel;

        const sport = SPORTS[(sportId || 'football') as keyof typeof SPORTS] || SPORTS.football;
        return calculateVirtualMatchTime(dateTime, sport, 'live') || 'En Vivo';
    }

    if (!dateTime) return '--:--';
    return new Date(dateTime).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: USER_TZ });
}

function isExternalEntityId(value?: string) {
    return Boolean(value) && /^[A-Za-z0-9]+$/.test(value || '');
}

function isRugbyApiSportsMatchId(value: string) {
    return /^ras-game-\d+$/i.test(value);
}

function isEspnAmericanFootballMatchId(value: string) {
    return /^espn-game-\d+$/i.test(value);
}

function isEspnMotorsportMatchId(value: string) {
    return /^espn-race-[a-z0-9-]+--.+$/i.test(value);
}

function getMotorsportStatusLabel(status: string | null | undefined) {
    if (status === 'live') return 'En vivo';
    if (status === 'final') return 'Final';
    if (status === 'postponed') return 'Postergado';
    if (status === 'cancelled') return 'Cancelado';
    return 'Programado';
}

function getMotorsportCompetitorCode(name: unknown) {
    const parts = String(name || '')
        .trim()
        .split(/\s+/)
        .filter(Boolean);

    if (parts.length === 0) return '---';

    if (parts.length === 1) {
        return parts[0].slice(0, 3).toUpperCase();
    }

    return parts
        .slice(0, 2)
        .map((part) => part[0])
        .join('')
        .slice(0, 3)
        .toUpperCase();
}

function getMotorsportPointsGap(points: unknown, leaderPoints: number, index: number) {
    const numericPoints = Number(points ?? 0);
    if (!Number.isFinite(numericPoints)) return '-';
    if (index === 0) return 'Lider';
    const gap = Math.max(0, leaderPoints - numericPoints);
    return gap === 0 ? 'Lider' : `-${gap} pts`;
}

function buildTeamHref(
    team: { id?: string; name?: string; teamUrl?: string; league?: string | null },
    preferredSport?: string | number | null,
) {
    if (!team.id) return '/clubs';

    const params = new URLSearchParams();
    if (team.name) params.set('name', team.name);
    if (team.teamUrl) params.set('team_url', team.teamUrl);
    if (team.league) params.set('league', team.league);
    if (preferredSport) params.set('sport', String(preferredSport));
    const qs = params.toString();
    const id = team.id.startsWith('fs-team-') || team.id.startsWith('ras-team-') || team.id.startsWith('espn-team-')
        ? team.id
        : team.id.startsWith('fs-')
            ? `fs-team-${team.id.slice(3)}`
            : team.id;

    return `/clubs/${id}${qs ? `?${qs}` : ''}`;
}

function buildTournamentHref(tournamentId?: string, season?: string | number | null) {
    if (!tournamentId) return null;

    const id = tournamentId.startsWith('fs-') || tournamentId.startsWith('ras-league-') || tournamentId.startsWith('espn-league-') || tournamentId.startsWith('espn-racing-league-')
        ? tournamentId
        : isExternalEntityId(tournamentId)
            ? `fs-${tournamentId}`
            : tournamentId;

    const params = new URLSearchParams();
    if (tournamentId.startsWith('ras-league-')) {
        params.set('sport', 'rugby');
    } else if (tournamentId.startsWith('espn-league-')) {
        params.set('sport', 'american-football');
    } else if (tournamentId.startsWith('espn-racing-league-')) {
        params.set('sport', 'motorsport');
    }
    if ((tournamentId.startsWith('ras-league-') || tournamentId.startsWith('espn-league-') || tournamentId.startsWith('espn-racing-league-')) && season != null && season !== '') {
        params.set('season', String(season));
    }

    const qs = params.toString();
    return `/tournaments/${id}${qs ? `?${qs}` : ''}`;
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

function getTeamLogo(team: any) {
    return resolveTeamLogo(team);
}

function resolveMatchTeamLogo(primaryTeam: any, fallbackTeam?: any, fallbackLogo?: string | null) {
    return resolveTeamLogo(primaryTeam, fallbackTeam, { logo: fallbackLogo || '' });
}

function resolveTournamentLogo(tournament: any, fallbackLogo?: string | null) {
    return resolveTournamentLogoSource(tournament, fallbackLogo);
}

function normalizeComparableTeamValue(value: unknown) {
    return String(value || '')
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
}

function extractDisplayLineupPlayers(rawPlayers: unknown) {
    const players = Array.isArray(rawPlayers) ? rawPlayers : [];

    return players
        .map((player, index) => {
            const source = player && typeof player === 'object' ? player as Record<string, unknown> : {};
            const name = String(
                source.name ||
                source.playerName ||
                source.PLAYER_NAME ||
                source.player_name ||
                ''
            ).trim();

            if (!name) return null;

            const rawNumber = source.number ?? source.jerseyNumber ?? source.PLAYER_NUMBER ?? source.player_number ?? index + 1;
            const numericNumber = Number(rawNumber);
            const rawRating = source.rating ?? source.playerRating ?? source.PLAYER_RATING ?? source.player_rating ?? null;
            const numericRating =
                typeof rawRating === 'number' && Number.isFinite(rawRating)
                    ? rawRating
                    : typeof rawRating === 'string'
                        ? Number(rawRating.replace(',', '.'))
                        : Number.NaN;

            return {
                id: String(source.id || source.playerId || source.PLAYER_ID || source.player_id || '').trim() || null,
                name,
                number: Number.isFinite(numericNumber) ? numericNumber : index + 1,
                position: String(source.position || source.PLAYER_POSITION || source.player_position || '').trim() || null,
                role: String(source.role || source.PLAYER_ROLE || source.player_role || '').trim() || null,
                rating: Number.isFinite(numericRating) ? Math.round(Math.min(10, Math.max(0, numericRating)) * 10) / 10 : null,
                isCaptain: Boolean(source.isCaptain || source.IS_CAPTAIN || source.player_captain || source.captain),
            };
        })
        .filter((player): player is {
            id: string | null;
            name: string;
            number: number;
            position: string | null;
            role: string | null;
            rating: number | null;
            isCaptain: boolean;
        } => Boolean(player));
}

function splitDisplayLineupPlayers(
    players: Array<{
        id: string | null;
        name: string;
        number: number;
        position: string | null;
        role: string | null;
        rating: number | null;
        isCaptain: boolean;
    }>
) {
    const isStarter = (player: typeof players[number], index: number) => {
        const role = String(player.role || '').trim().toLowerCase();
        if (role === 'starter' || role === 'titular') return true;
        if (role === 'substitute' || role === 'suplente' || role === 'finisher') return false;
        return Number(player.number) <= 15 || index < 15;
    };

    return {
        starters: players.filter((player, index) => isStarter(player, index)),
        finishers: players.filter((player, index) => !isStarter(player, index)),
    };
}

function isGenericLineupRoleLabel(value: string | null | undefined) {
    const normalized = String(value || '').trim().toLowerCase();
    return normalized === 'starter'
        || normalized === 'titular'
        || normalized === 'substitute'
        || normalized === 'suplente'
        || normalized === 'finisher'
        || normalized === 'bench';
}

function getDisplayLineupBadges(
    player: {
        position: string | null;
        role: string | null;
        rating: number | null;
    },
) {
    const badges: Array<{ label: string; kind: 'position' | 'rating' }> = [];
    const position = String(player.position || '').trim();
    if (position && !isGenericLineupRoleLabel(position)) {
        badges.push({ label: position, kind: 'position' });
    }

    if (typeof player.rating === 'number') {
        badges.push({ label: player.rating.toFixed(1), kind: 'rating' });
    }

    const role = String(player.role || '').trim();
    if (badges.length === 0 && role && !isGenericLineupRoleLabel(role)) {
        badges.push({ label: role, kind: 'position' });
    }

    return badges;
}

function getComparableTeamId(value: unknown) {
    return String(value || '').trim().toLowerCase();
}

function getH2HSideId(match: any, side: 'home' | 'away') {
    return getComparableTeamId(
        match?.[`${side}_team`]?.id ||
        match?.[`${side}_team`]?.team_id ||
        match?.[`${side}_club_id`] ||
        '',
    );
}

function getH2HSideName(match: any, side: 'home' | 'away') {
    return normalizeComparableTeamValue(
        match?.[`${side}_team`]?.name ||
        match?.[`${side}_team`]?.short_name ||
        match?.[side] ||
        '',
    );
}

function doesH2HSideMatchTeam(
    match: any,
    side: 'home' | 'away',
    team: { id?: string | null; name?: string | null } | null | undefined,
) {
    if (!team) return false;

    const teamId = getComparableTeamId(team.id);
    const sideId = getH2HSideId(match, side);
    if (teamId && sideId && teamId === sideId) return true;

    const teamName = normalizeComparableTeamValue(team.name);
    const sideName = getH2HSideName(match, side);
    return Boolean(teamName) && Boolean(sideName) && teamName === sideName;
}

function doesH2HMatchTeam(match: any, team: { id?: string | null; name?: string | null } | null | undefined) {
    return doesH2HSideMatchTeam(match, 'home', team) || doesH2HSideMatchTeam(match, 'away', team);
}

function isDirectH2HMatch(
    match: any,
    homeTeam: { id?: string | null; name?: string | null } | null | undefined,
    awayTeam: { id?: string | null; name?: string | null } | null | undefined,
) {
    const sameOrder = doesH2HSideMatchTeam(match, 'home', homeTeam) && doesH2HSideMatchTeam(match, 'away', awayTeam);
    const swappedOrder = doesH2HSideMatchTeam(match, 'home', awayTeam) && doesH2HSideMatchTeam(match, 'away', homeTeam);
    return sameOrder || swappedOrder;
}

function H2HItem({
    m,
    styles,
    focusTeam,
    referenceTeams,
}: {
    m: any,
    styles: any,
    focusTeam?: { id?: string | null; name?: string | null },
    referenceTeams?: {
        home?: { id?: string | null; name?: string | null; logo?: string | null };
        away?: { id?: string | null; name?: string | null; logo?: string | null };
    }
}) {
    const date = m.timestamp ? new Date(m.timestamp * 1000).toLocaleDateString('es-AR', { timeZone: USER_TZ }) : (m.date || '');
    const fallbackHomeLogo = referenceTeams?.home && doesH2HSideMatchTeam(m, 'home', referenceTeams.home)
        ? referenceTeams.home.logo
        : null;
    const fallbackAwayLogo = referenceTeams?.away && doesH2HSideMatchTeam(m, 'away', referenceTeams.away)
        ? referenceTeams.away.logo
        : null;
    const homeLogo = resolveMatchTeamLogo(m.home_team, referenceTeams?.home, fallbackHomeLogo);
    const awayLogo = resolveMatchTeamLogo(m.away_team, referenceTeams?.away, fallbackAwayLogo);

    // Determine status relative to focusTeamName if provided
    let status = m.status;
    if (focusTeam && m.scores) {
        const hScore = parseInt(m.scores.home || '0');
        const aScore = parseInt(m.scores.away || '0');

        if (doesH2HSideMatchTeam(m, 'home', focusTeam)) {
            status = hScore > aScore ? 'W' : hScore < aScore ? 'L' : 'D';
        } else if (doesH2HSideMatchTeam(m, 'away', focusTeam)) {
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
                    {homeLogo ? (
                        <img src={homeLogo} alt="" style={{ width: '22px', height: '22px', objectFit: 'contain' }} />
                    ) : (
                        <div style={{ width: '22px', height: '22px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px' }} />
                    )}
                </div>
                <span className={styles.h2hScore}>{m.scores?.home} - {m.scores?.away}</span>
                <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-start' }}>
                    {awayLogo ? (
                        <img src={awayLogo} alt="" style={{ width: '22px', height: '22px', objectFit: 'contain' }} />
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
        localPlayerRows: LocalPlayerStatsRow[];
        commentaryData: any[];
        issues: any[];
        debug: Record<string, unknown>;
        message?: string;
    }>({
        kind: 'loading',
        eventsData: [],
        statsData: [],
        playerStats: null,
        localPlayerRows: [],
        commentaryData: [],
        issues: [],
        debug: {}
    });

    const [activeTab, setActiveTab] = useState('summary');
    const statusRef = useRef<string>('scheduled');
    const [showAllEvents, setShowAllEvents] = useState(false);
    const isFlashScore = /^[A-Za-z0-9]{8}$/.test(id);
    const isRugbyExternal = isRugbyApiSportsMatchId(id);
    const isEspnExternal = isEspnAmericanFootballMatchId(id);
    const isEspnMotorsportExternal = isEspnMotorsportMatchId(id);
    const isExternalMatch = isFlashScore || isRugbyExternal || isEspnExternal || isEspnMotorsportExternal;
    const isSuperAdminUser = user?.role === 'super_admin' || user?.role === 'admin_general';
    const isRugbyApiSportsSource = state.matchData?.externalProvider === 'rugby-api-sports';
    const isEspnSource = state.matchData?.externalProvider === 'espn';
    const isMotorsportSource =
        state.matchData?.sportId === 'motorsport' ||
        isEspnMotorsportExternal ||
        String(state.matchData?.tournamentId || '').startsWith('espn-racing-league-');
    const isLimitedExternalSource = isRugbyApiSportsSource || (isEspnSource && !isMotorsportSource);
    const visibleTabs = useMemo(() => (
        isMotorsportSource
            ? [
                { id: 'summary', label: 'Resumen' },
                { id: 'results', label: 'Resultados' },
                { id: 'sessions', label: 'Sesiones' },
                { id: 'championship', label: 'Campeonato' },
                { id: 'circuit', label: 'Circuito' },
            ]
            : isLimitedExternalSource
            ? [
                { id: 'summary', label: 'Resumen' },
                { id: 'h2h', label: 'H2H' },
                { id: 'standings', label: 'Clasificacion' },
            ]
            : [
                { id: 'summary', label: 'Resumen' },
                { id: 'timeline', label: 'Cronologia' },
                { id: 'lineups', label: 'Alineaciones' },
                { id: 'players', label: 'Jugadores' },
                { id: 'stats', label: 'Estadisticas' },
                { id: 'h2h', label: 'H2H' },
                { id: 'standings', label: 'Clasificacion' },
                { id: 'commentary', label: 'Comentarios' },
            ]
    ), [isLimitedExternalSource, isMotorsportSource]);

    useEffect(() => {
        const controller = new AbortController();

        async function fetchData() {
            setState(prev => prev.matchData ? prev : { ...prev, kind: 'loading' });

            try {
                if (isExternalMatch) {
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

                    if (payload?.source === 'rugby-api-sports' && payload?.match) {
                        statusRef.current = payload.match.status || 'scheduled';
                        const rugbyMatch = {
                            ...payload.match,
                            home: {
                                ...payload.match.home,
                                logo: resolveMatchTeamLogo(payload.match.home, null, payload.match.home?.logo),
                            },
                            away: {
                                ...payload.match.away,
                                logo: resolveMatchTeamLogo(payload.match.away, null, payload.match.away?.logo),
                            },
                        };
                        setState({
                            kind: 'ok',
                            matchData: rugbyMatch,
                            eventsData: [],
                            statsData: [],
                            playerStats: null,
                            localPlayerRows: [],
                            commentaryData: [],
                            issues: [],
                            debug: {},
                        });
                        return;
                    }

                    if (payload?.source === 'espn' && payload?.match) {
                        statusRef.current = payload.match.status || 'scheduled';
                        const espnMatch = {
                            ...payload.match,
                            home: {
                                ...payload.match.home,
                                logo: resolveMatchTeamLogo(payload.match.home, null, payload.match.home?.logo),
                            },
                            away: {
                                ...payload.match.away,
                                logo: resolveMatchTeamLogo(payload.match.away, null, payload.match.away?.logo),
                            },
                        };
                        setState({
                            kind: 'ok',
                            matchData: espnMatch,
                            eventsData: [],
                            statsData: [],
                            playerStats: null,
                            localPlayerRows: [],
                            commentaryData: [],
                            issues: [],
                            debug: {},
                        });
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
                    const resolvedHomeLogo = resolveMatchTeamLogo(evt.home_team, baseMatch.home, baseMatch.home?.logo);
                    const resolvedAwayLogo = resolveMatchTeamLogo(evt.away_team, baseMatch.away, baseMatch.away?.logo);
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
                            tournamentLogo: resolveTournamentLogo(evt, (baseMatch as any)?.tournamentLogo || null),
                            home: { ...baseMatch.home, logo: resolvedHomeLogo, score: initialHomeScore, teamUrl: evt.home_team?.team_url || '' },
                            away: { ...baseMatch.away, logo: resolvedAwayLogo, score: initialAwayScore, teamUrl: evt.away_team?.team_url || '' },
                            lineups: null,
                            standings: [],
                            h2h: [],
                            draw: [],
                        },
                        eventsData: [],
                        statsData: [],
                        playerStats: null,
                        localPlayerRows: [],
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
                                tournamentLogo: resolveTournamentLogo(evt, prev.matchData.tournamentLogo || null),
                                home: {
                                    ...prev.matchData.home,
                                    logo: resolveMatchTeamLogo(evt.home_team, prev.matchData.home, prev.matchData.home?.logo),
                                    score: hScoreFinal,
                                    teamUrl: evt.home_team?.team_url || '',
                                },
                                away: {
                                    ...prev.matchData.away,
                                    logo: resolveMatchTeamLogo(evt.away_team, prev.matchData.away, prev.matchData.away?.logo),
                                    score: aScoreFinal,
                                    teamUrl: evt.away_team?.team_url || '',
                                },
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
                            localPlayerRows: [],
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

                            const sportId =
                                matchData.sportId ||
                                matchData.sport_id ||
                                matchData.sport ||
                                matchData.tournament?.sportId ||
                                matchData.tournament?.sport_id ||
                                null;
                            const score = matchData.score || { home: 0, away: 0 };
                            const homeClubId = matchData.homeClub?.id || matchData.homeClubId || '';
                            const awayClubId = matchData.awayClub?.id || matchData.awayClubId || '';
                            const tournamentId = matchData.tournamentId || '';
                            const phaseId = matchData.phaseId || matchData.phase_id || '';
                            const groupId = matchData.groupId || matchData.group_id || '';
                            const localLineups = normalizeLocalLineups(matchData.lineups || null);
                            const localEvents = normalizeLocalEvents(matchData.events || []);
                            const localPlayerRows = buildLocalPlayerStatsRows({
                                lineups: localLineups,
                                events: localEvents,
                                homeName: matchData.homeClub?.name || 'Local',
                                awayName: matchData.awayClub?.name || 'Visitante',
                            });
                            const localStats = buildLocalTeamStats(localEvents);
                            const resolvedDbHomeLogo = resolveMatchTeamLogo(matchData.homeClub, null, matchData.homeClub?.logo || null);
                            const resolvedDbAwayLogo = resolveMatchTeamLogo(matchData.awayClub, null, matchData.awayClub?.logo || null);

                            const baseProcessedMatch = {
                                id: matchData.id,
                                status: matchData.status || 'scheduled',
                                sportId,
                                date: matchData.dateTime,
                                time: resolvePublicMatchTime(matchData.dateTime, sportId, matchData.status, matchData.clock, matchData.updatedAt || matchData.updated_at || null),
                                clock: matchData.clock || null,
                                updatedAt: matchData.updatedAt || matchData.updated_at || null,
                                phaseId: phaseId || null,
                                groupId: groupId || null,
                                tournament: matchData.tournament?.name || 'Partido Local',
                                tournamentLogo: resolveTournamentLogo(matchData.tournament),
                                tournamentId,
                                category: matchData.category || 'General',
                                round: matchData.roundLabel || matchData.roundId || '',
                                venue: matchData.venue || 'Por definir',
                                referee: matchData.referee || null,
                                home: {
                                    id: homeClubId || 'home',
                                    name: matchData.homeClub?.name || 'Local',
                                    logo: resolvedDbHomeLogo || null,
                                    score: matchData.status === 'scheduled' ? null : (score.home ?? 0)
                                },
                                away: {
                                    id: awayClubId || 'away',
                                    name: matchData.awayClub?.name || 'Visitante',
                                    logo: resolvedDbAwayLogo || null,
                                    score: matchData.status === 'scheduled' ? null : (score.away ?? 0)
                                },
                                events: localEvents,
                                lineups: localLineups,
                                standings: [],
                                h2h: [],
                                draw: []
                            };

                            statusRef.current = matchData.status || 'scheduled';
                            setState({
                                kind: 'ok',
                                matchData: baseProcessedMatch,
                                eventsData: localEvents,
                                statsData: localStats,
                                playerStats: null,
                                localPlayerRows,
                                commentaryData: [],
                                issues: [],
                                debug: {}
                            });

                            // Parallel-fetch standings + H2H
                            const [standingsRes, h2hRes] = await Promise.allSettled([
                                (() => {
                                    if (!tournamentId) return Promise.resolve(null);

                                    const params = new URLSearchParams({ tournament: tournamentId });
                                    if (phaseId) params.set('phase', phaseId);
                                    if (groupId) params.set('group', groupId);

                                    return fetch(`/api/db/standings?${params.toString()}`, { signal: controller.signal })
                                        .then(r => r.ok ? r.json() : null);
                                })(),
                                homeClubId && awayClubId
                                    ? fetch(
                                        `/api/db/h2h?home=${homeClubId}&away=${awayClubId}${sportId ? `&sport=${encodeURIComponent(String(sportId))}` : ''}`,
                                        { signal: controller.signal }
                                    ).then(r => r.ok ? r.json() : null)
                                    : Promise.resolve(null),
                            ]);

                            if (controller.signal.aborted) return;

                            // Map DB standings rows → format expected by the match detail standings renderer
                            const rawStandings = standingsRes.status === 'fulfilled' && standingsRes.value?.standings
                                ? standingsRes.value.standings
                                : [];
                            const standings = rawStandings.map((row: any) => ({
                                rank: row.position,
                                name: row.team?.name ?? row.team_name ?? '',
                                team_id: row.team?.id ?? row.team_id ?? null,
                                logo: resolveMatchTeamLogo(row.team, row, row.team_logo ?? row.logo ?? ''),
                                team: row.team ?? null,
                                matches_played: row.matches_total ?? 0,
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
                                time: resolvePublicMatchTime(matchData.dateTime, sportId, matchData.status, matchData.clock, matchData.updatedAt || matchData.updated_at || null),
                                clock: matchData.clock || null,
                                updatedAt: matchData.updatedAt || matchData.updated_at || null,
                                phaseId: phaseId || null,
                                groupId: groupId || null,
                                tournament: matchData.tournament?.name || 'Partido Local',
                                tournamentLogo: resolveTournamentLogo(matchData.tournament),
                                tournamentId,
                                category: matchData.category || 'General',
                                round: matchData.roundLabel || matchData.roundId || '',
                                venue: matchData.venue || 'Por definir',
                                referee: matchData.referee || null,
                                home: {
                                    id: homeClubId || 'home',
                                    name: matchData.homeClub?.name || 'Local',
                                    logo: resolvedDbHomeLogo || null,
                                    score: matchData.status === 'scheduled' ? null : (score.home ?? 0)
                                },
                                away: {
                                    id: awayClubId || 'away',
                                    name: matchData.awayClub?.name || 'Visitante',
                                    logo: resolvedDbAwayLogo || null,
                                    score: matchData.status === 'scheduled' ? null : (score.away ?? 0)
                                },
                                events: localEvents,
                                lineups: localLineups,
                                standings,
                                h2h,
                                draw: []
                            };

                            statusRef.current = matchData.status || 'scheduled';
                            setState({
                                kind: 'ok',
                                matchData: processedMatch,
                                eventsData: localEvents,
                                statsData: localStats,
                                playerStats: null,
                                localPlayerRows,
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

    useEffect(() => {
        if (visibleTabs.some((tab) => tab.id === activeTab)) return;
        setActiveTab('summary');
    }, [activeTab, visibleTabs]);

    const [liveClockTick, setLiveClockTick] = useState(0);

    useEffect(() => {
        if (state.kind !== 'ok' || state.matchData?.status !== 'live') return;

        const intervalId = window.setInterval(() => {
            setLiveClockTick((value) => value + 1);
        }, 1000);

        return () => window.clearInterval(intervalId);
    }, [state.kind, state.matchData?.date, state.matchData?.status]);

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
    const localLineups = normalizeLocalLineups(matchData.lineups || null);
    const localHomeLineup = localLineups.home.filter((player) => Boolean(player.name));
    const localAwayLineup = localLineups.away.filter((player) => Boolean(player.name));
    const hasLocalLineups = localHomeLineup.length > 0 || localAwayLineup.length > 0;
    const displayHomeLineup = extractDisplayLineupPlayers(
        hasLocalLineups
            ? localHomeLineup
            : (matchData.lineups?.HOME_STARTING_LINEUPS || matchData.lineups?.home_team?.starting_lineups || [])
    );
    const displayAwayLineup = extractDisplayLineupPlayers(
        hasLocalLineups
            ? localAwayLineup
            : (matchData.lineups?.AWAY_STARTING_LINEUPS || matchData.lineups?.away_team?.starting_lineups || [])
    );
    const homeLineupGroups = splitDisplayLineupPlayers(displayHomeLineup);
    const awayLineupGroups = splitDisplayLineupPlayers(displayAwayLineup);
    const hasAnyLineups = displayHomeLineup.length > 0 || displayAwayLineup.length > 0;
    const motorsportRows = (Array.isArray(matchData.standings) && matchData.standings.length > 0
        ? matchData.standings
        : [
            matchData.home?.name ? { rank: 1, name: matchData.home.name, points: matchData.home.score ?? 0, matches_played: 0 } : null,
            matchData.away?.name ? { rank: 2, name: matchData.away.name, points: matchData.away.score ?? 0, matches_played: 0 } : null,
        ].filter(Boolean)
    ) as any[];
    const motorsportTopRows = motorsportRows.slice(0, 3);
    const motorsportSidebarRows = motorsportRows.slice(0, 5);
    const motorsportTableRows = activeTab === 'summary' ? motorsportRows.slice(0, 10) : motorsportRows;
    const leaderPoints = Number(motorsportRows[0]?.points ?? 0);
    const matchDate = new Date(matchData.date);
    const matchDateText = Number.isNaN(matchDate.getTime())
        ? '-'
        : matchDate.toLocaleDateString('es-AR', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            timeZone: USER_TZ,
        });
    const matchTimeText = matchData.time || (
        Number.isNaN(matchDate.getTime())
            ? '-'
            : matchDate.toLocaleTimeString('es-AR', {
                hour: '2-digit',
                minute: '2-digit',
                hour12: false,
                timeZone: USER_TZ,
            })
    );
    const liveDisplayTime = resolvePublicMatchTime(
        matchData.date,
        matchData.sportId,
        matchData.status,
        matchData.clock,
        matchData.updatedAt || matchData.updated_at || null,
    );
    void liveClockTick;
    const matchTimerText = liveDisplayTime || matchTimeText;
    const motorsportTournamentHref = buildTournamentHref(matchData.tournamentId, matchData.tournamentSeason);
    const motorsportStatusLabel = getMotorsportStatusLabel(matchData.status);
    const motorsportTitle = matchData.round || matchData.tournament || 'Evento Motorsport';
    const motorsportVenue = matchData.venue || 'Circuito por confirmar';
    const motorsportSeries = matchData.tournament || 'Motorsport';
    const motorsportProviderLabel = String(matchData.externalProvider || 'externo').toUpperCase();
    const motorsportSectionMeta = {
        summary: motorsportStatusLabel,
        results: `${motorsportRows.length} competidores`,
        sessions: matchDateText,
        championship: motorsportSeries,
        circuit: motorsportVenue,
    };
    const motorsportQuickFacts = [
        { label: 'Estado', value: motorsportStatusLabel },
        { label: 'Serie', value: motorsportSeries },
        { label: 'Fecha', value: matchDateText },
        { label: 'Hora', value: matchTimeText },
    ];

    if (isMotorsportSource) {
        return (
            <div className={`${styles.page} ${styles.motorsportPage}`}>
                <div className={styles.motorsportSlipstreamBg}></div>
                <div className={styles.appContainer}>
                    <header className={styles.motorsportHeaderBar}>
                        <div className={styles.motorsportHeaderLeft}>
                            <button onClick={() => router.back()} className={`${styles.btn} ${styles.motorsportBackButton}`}>
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
                            </button>
                            <div className={styles.motorsportBreadcrumbs}>
                                <span>{matchData.category || 'Motorsport'}</span>
                                <span>/</span>
                                {motorsportTournamentHref ? (
                                    <Link href={motorsportTournamentHref} className={styles.motorsportBreadcrumbLink}>
                                        {motorsportSeries}
                                    </Link>
                                ) : (
                                    <span>{motorsportSeries}</span>
                                )}
                            </div>
                        </div>
                    </header>

                    <section className={styles.motorsportHero}>
                        <div className={styles.motorsportHeroCopy}>
                            <div className={styles.motorsportBadgeRow}>
                                <span className={styles.motorsportSeriesBadge}>{motorsportSeries}</span>
                                <div className={styles.motorsportStatusPill}>
                                    {matchData.status === 'live' && <span className={styles.motorsportStatusPulse}></span>}
                                    <span>{motorsportStatusLabel}</span>
                                </div>
                                <span className={styles.motorsportTrackPill}>{matchData.category || 'Motorsport'}</span>
                            </div>

                            <h1 className={styles.motorsportHeroTitle}>{motorsportTitle}</h1>

                            <div className={styles.motorsportHeroMeta}>
                                <span>{motorsportVenue}</span>
                                <span className={styles.motorsportMetaDivider}>/</span>
                                <span>{matchDateText} - {matchTimeText}</span>
                            </div>

                            <div className={styles.motorsportQuickGrid}>
                                {motorsportQuickFacts.map((fact) => (
                                    <div key={fact.label} className={styles.motorsportQuickCard}>
                                        <span className={styles.motorsportQuickLabel}>{fact.label}</span>
                                        <span className={styles.motorsportQuickValue}>{fact.value}</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <aside className={`${styles.motorsportGlassCard} ${styles.motorsportLeaderboardCard}`}>
                            <div className={styles.motorsportCardHeader}>
                                <span className={styles.motorsportCardEyebrow}>Clasificacion</span>
                                <span className={styles.motorsportCardMeta}>Top {motorsportTopRows.length}</span>
                            </div>
                            <div className={styles.motorsportLeaderboardList}>
                                {motorsportTopRows.map((row, index) => {
                                    const name = row.name || row.team_name || row.team?.name || 'Competidor';
                                    const points = Number(row.points ?? 0);

                                    return (
                                        <div key={`${name}-${index}`} className={styles.motorsportLeaderboardRow}>
                                            <div className={styles.motorsportLeaderboardIdentity}>
                                                <span className={`${styles.motorsportLeaderboardRank} ${index === 0 ? styles.rankGold : index === 1 ? styles.rankSilver : styles.rankBronze}`}>
                                                    {String(row.rank || index + 1).padStart(2, '0')}
                                                </span>
                                                <div>
                                                    <div className={styles.motorsportLeaderboardName}>{name}</div>
                                                    <div className={styles.motorsportLeaderboardSub}>{getMotorsportCompetitorCode(name)}</div>
                                                </div>
                                            </div>
                                            <span className={styles.motorsportLeaderboardValue}>
                                                {activeTab === 'summary' && index > 0
                                                    ? getMotorsportPointsGap(points, leaderPoints, index)
                                                    : `${points} pts`}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        </aside>
                    </section>

                    <nav className={styles.motorsportTabsNav}>
                        {visibleTabs.map((tab) => (
                            <button
                                key={tab.id}
                                type="button"
                                className={`${styles.motorsportTab} ${activeTab === tab.id ? styles.motorsportTabActive : ''}`}
                                onClick={() => setActiveTab(tab.id)}
                            >
                                {tab.label}
                            </button>
                        ))}
                    </nav>

                    <main className={styles.motorsportContentGrid}>
                        <section className={styles.motorsportMainColumn}>
                            {(activeTab === 'summary' || activeTab === 'results' || activeTab === 'championship') && (
                                <section className={styles.motorsportGlassCard}>
                                    <div className={styles.motorsportCardHeader}>
                                        <h2 className={styles.motorsportSectionTitle}>
                                            {activeTab === 'championship' ? `Clasificacion ${motorsportSeries}` : activeTab === 'results' ? `Resultados de ${motorsportTitle}` : `Resumen de ${motorsportTitle}`}
                                        </h2>
                                        <span className={styles.motorsportCardMeta}>
                                            {activeTab === 'summary' ? `${motorsportTableRows.length} mostrados` : `${motorsportRows.length} competidores`}
                                        </span>
                                    </div>

                                    <div className={styles.motorsportTableWrap}>
                                        <table className={styles.motorsportTable}>
                                            <thead>
                                                <tr>
                                                    <th>Pos</th>
                                                    <th>Competidor</th>
                                                    <th>Eventos</th>
                                                    <th>Gap</th>
                                                    <th className={styles.motorsportAlignRight}>Pts</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {motorsportTableRows.map((row, index) => {
                                                    const name = row.name || row.team_name || row.team?.name || 'Competidor';
                                                    const points = Number(row.points ?? 0);
                                                    const played = row.matches_played ?? row.played ?? 0;
                                                    const rank = Number(row.rank || index + 1);

                                                    return (
                                                        <tr key={`${name}-${rank}-${index}`} className={styles.motorsportTableRow}>
                                                            <td>
                                                                <div className={styles.motorsportPositionCell}>
                                                                    <span className={`${styles.motorsportPosition} ${rank === 1 ? styles.rankGold : rank === 2 ? styles.rankSilver : rank === 3 ? styles.rankBronze : ''}`}>
                                                                        {String(rank).padStart(2, '0')}
                                                                    </span>
                                                                </div>
                                                            </td>
                                                            <td>
                                                                <div className={styles.motorsportCompetitorCell}>
                                                                    <span className={styles.motorsportCompetitorName}>{name}</span>
                                                                    <span className={styles.motorsportCompetitorCode}>{getMotorsportCompetitorCode(name)}</span>
                                                                </div>
                                                            </td>
                                                            <td>{played}</td>
                                                            <td className={styles.motorsportGapCell}>{getMotorsportPointsGap(points, leaderPoints, index)}</td>
                                                            <td className={styles.motorsportAlignRight}>{points}</td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>

                                    {motorsportRows.length === 0 && (
                                        <div className={styles.motorsportEmptyState}>Todavia no hay clasificacion disponible para este evento.</div>
                                    )}
                                </section>
                            )}

                            {activeTab === 'sessions' && (
                                <section className={styles.motorsportGlassCard}>
                                    <div className={styles.motorsportCardHeader}>
                                        <h2 className={styles.motorsportSectionTitle}>Datos del evento</h2>
                                        <span className={styles.motorsportCardMeta}>{motorsportSectionMeta.sessions}</span>
                                    </div>
                                    <div className={styles.motorsportStageGrid}>
                                        {visibleTabs.map((tab) => (
                                            <button
                                                key={tab.id}
                                                type="button"
                                                className={`${styles.motorsportStageCard} ${activeTab === tab.id ? styles.motorsportStageCardActive : ''}`}
                                                onClick={() => setActiveTab(tab.id)}
                                            >
                                                <span className={styles.motorsportStageLabel}>{tab.label}</span>
                                                <span className={styles.motorsportStageValue}>
                                                    {motorsportSectionMeta[tab.id as keyof typeof motorsportSectionMeta] || '-'}
                                                </span>
                                            </button>
                                        ))}
                                    </div>
                                    <div className={styles.motorsportDetailsGrid}>
                                        <div className={styles.motorsportDetailCard}>
                                            <span className={styles.motorsportDetailLabel}>Evento</span>
                                            <strong>{motorsportTitle}</strong>
                                        </div>
                                        <div className={styles.motorsportDetailCard}>
                                            <span className={styles.motorsportDetailLabel}>Venue</span>
                                            <strong>{motorsportVenue}</strong>
                                        </div>
                                        <div className={styles.motorsportDetailCard}>
                                            <span className={styles.motorsportDetailLabel}>Serie</span>
                                            <strong>{motorsportSeries}</strong>
                                        </div>
                                        <div className={styles.motorsportDetailCard}>
                                            <span className={styles.motorsportDetailLabel}>Estado</span>
                                            <strong>{motorsportStatusLabel}</strong>
                                        </div>
                                    </div>
                                </section>
                            )}

                            {activeTab === 'circuit' && (
                                <section className={styles.motorsportGlassCard}>
                                    <div className={styles.motorsportCardHeader}>
                                        <h2 className={styles.motorsportSectionTitle}>Circuito y sede</h2>
                                        <span className={styles.motorsportCardMeta}>{motorsportVenue}</span>
                                    </div>
                                    <div className={styles.motorsportDetailsGrid}>
                                        <div className={styles.motorsportDetailCard}>
                                            <span className={styles.motorsportDetailLabel}>Circuito</span>
                                            <strong>{motorsportVenue}</strong>
                                        </div>
                                        <div className={styles.motorsportDetailCard}>
                                            <span className={styles.motorsportDetailLabel}>Pais / categoria</span>
                                            <strong>{matchData.category || '-'}</strong>
                                        </div>
                                        <div className={styles.motorsportDetailCard}>
                                            <span className={styles.motorsportDetailLabel}>Fecha</span>
                                            <strong>{matchDateText}</strong>
                                        </div>
                                        <div className={styles.motorsportDetailCard}>
                                            <span className={styles.motorsportDetailLabel}>Horario</span>
                                            <strong>{matchTimeText}</strong>
                                        </div>
                                    </div>
                                </section>
                            )}

                            {activeTab !== 'sessions' && (
                                <div className={styles.motorsportStageGrid}>
                                    {visibleTabs.map((tab) => (
                                        <button
                                            key={tab.id}
                                            type="button"
                                            className={`${styles.motorsportStageCard} ${activeTab === tab.id ? styles.motorsportStageCardActive : ''}`}
                                            onClick={() => setActiveTab(tab.id)}
                                        >
                                            <span className={styles.motorsportStageLabel}>{tab.label}</span>
                                            <span className={styles.motorsportStageValue}>
                                                {motorsportSectionMeta[tab.id as keyof typeof motorsportSectionMeta] || '-'}
                                            </span>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </section>

                        <aside className={styles.motorsportSidebarColumn}>
                            <section className={styles.motorsportGlassCard}>
                                <div className={styles.motorsportCardHeader}>
                                    <h2 className={styles.motorsportSectionTitle}>Clasificacion {motorsportSeries}</h2>
                                    <span className={styles.motorsportCardMeta}>{motorsportSidebarRows.length} competidores</span>
                                </div>
                                <div className={styles.motorsportChampionshipList}>
                                    {motorsportSidebarRows.map((row, index) => {
                                        const name = row.name || row.team_name || row.team?.name || 'Competidor';
                                        const points = Number(row.points ?? 0);
                                        return (
                                            <div key={`${name}-sidebar-${index}`} className={styles.motorsportChampionshipRow}>
                                                <div className={styles.motorsportChampionshipIdentity}>
                                                    <span className={styles.motorsportChampionshipRank}>{String(row.rank || index + 1).padStart(2, '0')}</span>
                                                    <div>
                                                        <div className={styles.motorsportChampionshipName}>{name}</div>
                                                        <div className={styles.motorsportLeaderboardSub}>{getMotorsportCompetitorCode(name)}</div>
                                                    </div>
                                                </div>
                                                <div className={styles.motorsportChampionshipPoints}>{points}</div>
                                            </div>
                                        );
                                    })}
                                </div>
                                <button type="button" className={styles.motorsportSidebarButton} onClick={() => setActiveTab('championship')}>
                                    Ver clasificacion completa
                                </button>
                            </section>

                            <section className={styles.motorsportGlassCard}>
                                <div className={styles.motorsportCardHeader}>
                                    <h2 className={styles.motorsportSectionTitle}>Detalles del evento</h2>
                                    <span className={styles.motorsportCardMeta}>{motorsportTitle}</span>
                                </div>
                                <div className={styles.motorsportDetailsGrid}>
                                    <div className={styles.motorsportDetailCard}>
                                        <span className={styles.motorsportDetailLabel}>Serie</span>
                                        <strong>{motorsportSeries}</strong>
                                    </div>
                                    <div className={styles.motorsportDetailCard}>
                                        <span className={styles.motorsportDetailLabel}>Ronda</span>
                                        <strong>{motorsportTitle}</strong>
                                    </div>
                                    <div className={styles.motorsportDetailCard}>
                                        <span className={styles.motorsportDetailLabel}>Venue</span>
                                        <strong>{motorsportVenue}</strong>
                                    </div>
                                    <div className={styles.motorsportDetailCard}>
                                        <span className={styles.motorsportDetailLabel}>Estado</span>
                                        <strong>{motorsportStatusLabel}</strong>
                                    </div>
                                </div>
                            </section>

                            <section className={styles.motorsportGlassCard}>
                                <div className={styles.motorsportCardHeader}>
                                    <h2 className={styles.motorsportSectionTitle}>Datos de la fuente</h2>
                                    <span className={styles.motorsportCardMeta}>{motorsportProviderLabel}</span>
                                </div>
                                <div className={styles.motorsportInsightsGrid}>
                                    <div className={styles.motorsportInsightItem}>
                                        <span className={styles.motorsportDetailLabel}>Fuente</span>
                                        <strong>{motorsportProviderLabel}</strong>
                                    </div>
                                    <div className={styles.motorsportInsightItem}>
                                        <span className={styles.motorsportDetailLabel}>Competidores</span>
                                        <strong>{motorsportRows.length}</strong>
                                    </div>
                                    <div className={styles.motorsportInsightItem}>
                                        <span className={styles.motorsportDetailLabel}>Estado</span>
                                        <strong>{motorsportStatusLabel}</strong>
                                    </div>
                                    <div className={styles.motorsportInsightItem}>
                                        <span className={styles.motorsportDetailLabel}>Hora oficial</span>
                                        <strong>{matchTimeText}</strong>
                                    </div>
                                </div>
                            </section>
                        </aside>
                    </main>
                </div>
                <div className={styles.motorsportGlowRed}></div>
                <div className={styles.motorsportGlowCyan}></div>
            </div>
        );
    }

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
                                <Link href={buildTournamentHref(matchData.tournamentId, matchData.tournamentSeason) || '#'} className={styles.breadcrumbItem} style={{ color: 'var(--color-accent, var(--accent))', textDecoration: 'none' }}>
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
                        {isSuperAdminUser && !isExternalMatch && (
                            <Link href={`/admin/matches/${id}/manage`} className={`${styles.btn} ${styles.btnPrimary}`}>
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
                                            time: matchTimerText,
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
                                <span>{matchTimerText}</span>
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
                            <span><strong>{new Date(matchData.date).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', timeZone: USER_TZ })}</strong> {matchTimerText}</span>
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
                {isLimitedExternalSource && (
                    <nav className={styles.tabsNav}>
                        {visibleTabs.map((tab) => (
                            <div
                                key={tab.id}
                                className={`${styles.tabItem} ${activeTab === tab.id ? styles.active : ''}`}
                                onClick={() => setActiveTab(tab.id)}
                            >
                                {tab.label}
                            </div>
                        ))}
                    </nav>
                )}
                {!isLimitedExternalSource && (
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
                )}

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
                                {hasAnyLineups ? (
                                    <div className={styles.lineupsGrid}>
                                        <div className={styles.lineupsToolbar}>
                                            <div className={styles.lineupsToolbarCopy}>
                                                <div className={styles.panelTitle} style={{ marginBottom: 8 }}>Alineaciones confirmadas</div>
                                                <p className={styles.lineupsToolbarHint}>
                                                    Exporta una pieza para post o historia con ambos equipos o una sola formacion, sin salir del lenguaje visual que ya usa la vista publica.
                                                </p>
                                            </div>
                                            <ExportImage
                                                className={styles.lineupsExportAction}
                                                template="lineups"
                                                filename={`alineaciones-${matchData.home.name}-${matchData.away.name}`}
                                                data={{
                                                    tournament: matchData.tournament,
                                                    tournamentLogo: matchData.tournamentLogo,
                                                    date: new Date(matchData.date).toLocaleDateString('es-AR', { timeZone: USER_TZ }),
                                                    time: matchTimerText,
                                                    venue: matchData.venue,
                                                    kickoffAt: matchData.date,
                                                    homeTeam: {
                                                        name: matchData.home.name,
                                                        logo: matchData.home.logo,
                                                        lineupLabel: 'Titulares',
                                                        starters: displayHomeLineup,
                                                    },
                                                    awayTeam: {
                                                        name: matchData.away.name,
                                                        logo: matchData.away.logo,
                                                        lineupLabel: 'Titulares',
                                                        starters: displayAwayLineup,
                                                    },
                                                }}
                                            />
                                        </div>

                                        <div className={styles.lineupTeam}>
                                            <div className={styles.panelTitle}>{matchData.home.name}</div>
                                            <div className={styles.lineupSection}>
                                                <div className={styles.lineupSectionTitle}>Titulares</div>
                                                <div className={styles.playerList}>
                                                    {homeLineupGroups.starters.map((p, i: number) => {
                                                        const pId = p.id;
                                                        const pName = p.name;
                                                        const pNumber = p.number;
                                                        const pBadges = getDisplayLineupBadges(p);
                                                        return (
                                                            <div key={`home-starter-${i}`} className={styles.playerItem}>
                                                                <span className={styles.playerMain}>
                                                                    <span className={styles.playerNumber}>{pNumber}</span>
                                                                    {pId ? <Link href={`/players/${pId}`} style={{ color: 'inherit', textDecoration: 'none' }}>{pName}</Link> : pName}
                                                                </span>
                                                                <span style={{ display: 'flex', gap: '6px', alignItems: 'center', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                                                                    {pBadges.map((badge) => (
                                                                        <span key={`${badge.kind}-${badge.label}`} className={badge.kind === 'rating' ? styles.playerRatingMeta : styles.playerMeta}>{badge.label}</span>
                                                                    ))}
                                                                </span>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                            {homeLineupGroups.finishers.length > 0 && (
                                                <div className={styles.lineupSection}>
                                                    <div className={styles.lineupSectionTitle}>Suplentes</div>
                                                    <div className={styles.playerList}>
                                                        {homeLineupGroups.finishers.map((p, i: number) => {
                                                            const pId = p.id;
                                                            const pName = p.name;
                                                            const pNumber = p.number;
                                                            const pBadges = getDisplayLineupBadges(p);
                                                            return (
                                                                <div key={`home-finisher-${i}`} className={styles.playerItem}>
                                                                    <span className={styles.playerMain}>
                                                                        <span className={styles.playerNumber}>{pNumber}</span>
                                                                        {pId ? <Link href={`/players/${pId}`} style={{ color: 'inherit', textDecoration: 'none' }}>{pName}</Link> : pName}
                                                                    </span>
                                                                    <span style={{ display: 'flex', gap: '6px', alignItems: 'center', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                                                                        {pBadges.map((badge) => (
                                                                            <span key={`${badge.kind}-${badge.label}`} className={badge.kind === 'rating' ? styles.playerRatingMeta : styles.playerMeta}>{badge.label}</span>
                                                                        ))}
                                                                    </span>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                        <div className={styles.lineupTeam}>
                                            <div className={styles.panelTitle}>{matchData.away.name}</div>
                                            <div className={styles.lineupSection}>
                                                <div className={styles.lineupSectionTitle}>Titulares</div>
                                                <div className={styles.playerList}>
                                                    {awayLineupGroups.starters.map((p, i: number) => {
                                                        const pId = p.id;
                                                        const pName = p.name;
                                                        const pNumber = p.number;
                                                        const pBadges = getDisplayLineupBadges(p);
                                                        return (
                                                            <div key={`away-starter-${i}`} className={styles.playerItem}>
                                                                <span className={styles.playerMain}>
                                                                    <span className={styles.playerNumber}>{pNumber}</span>
                                                                    {pId ? <Link href={`/players/${pId}`} style={{ color: 'inherit', textDecoration: 'none' }}>{pName}</Link> : pName}
                                                                </span>
                                                                <span style={{ display: 'flex', gap: '6px', alignItems: 'center', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                                                                    {pBadges.map((badge) => (
                                                                        <span key={`${badge.kind}-${badge.label}`} className={badge.kind === 'rating' ? styles.playerRatingMeta : styles.playerMeta}>{badge.label}</span>
                                                                    ))}
                                                                </span>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                            {awayLineupGroups.finishers.length > 0 && (
                                                <div className={styles.lineupSection}>
                                                    <div className={styles.lineupSectionTitle}>Suplentes</div>
                                                    <div className={styles.playerList}>
                                                        {awayLineupGroups.finishers.map((p, i: number) => {
                                                            const pId = p.id;
                                                            const pName = p.name;
                                                            const pNumber = p.number;
                                                            const pBadges = getDisplayLineupBadges(p);
                                                            return (
                                                                <div key={`away-finisher-${i}`} className={styles.playerItem}>
                                                                    <span className={styles.playerMain}>
                                                                        <span className={styles.playerNumber}>{pNumber}</span>
                                                                        {pId ? <Link href={`/players/${pId}`} style={{ color: 'inherit', textDecoration: 'none' }}>{pName}</Link> : pName}
                                                                    </span>
                                                                    <span style={{ display: 'flex', gap: '6px', alignItems: 'center', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                                                                        {pBadges.map((badge) => (
                                                                            <span key={`${badge.kind}-${badge.label}`} className={badge.kind === 'rating' ? styles.playerRatingMeta : styles.playerMeta}>{badge.label}</span>
                                                                        ))}
                                                                    </span>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            )}
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
                                                const isHomeMatch = doesH2HMatchTeam(m, matchData.home);
                                                const isDirectH2H = isDirectH2HMatch(m, matchData.home, matchData.away);
                                                return isHomeMatch && !isDirectH2H;
                                            }).slice(0, 5).map((m: any, i: number) => (
                                                <H2HItem
                                                    key={i}
                                                    m={m}
                                                    styles={styles}
                                                    focusTeam={matchData.home}
                                                    referenceTeams={{ home: matchData.home, away: matchData.away }}
                                                />
                                            ))}
                                        </div>
                                    </div>

                                    {/* Column 2: Direct H2H Last 5 */}
                                    <div className={styles.h2hColumn}>
                                        <div className={styles.h2hColTitle}>Frente a Frente</div>
                                        <div className={styles.h2hList}>
                                            {matchData.h2h?.filter((m: any) =>
                                                isDirectH2HMatch(m, matchData.home, matchData.away)
                                            ).slice(0, 5).map((m: any, i: number) => (
                                                <H2HItem
                                                    key={i}
                                                    m={m}
                                                    styles={styles}
                                                    referenceTeams={{ home: matchData.home, away: matchData.away }}
                                                />
                                            ))}
                                        </div>
                                    </div>

                                    {/* Column 3: Away Last 5 (Excluding direct H2H) */}
                                    <div className={styles.h2hColumn}>
                                        <div className={styles.h2hColTitle}>Forma: {matchData.away.name}</div>
                                        <div className={styles.h2hList}>
                                            {matchData.h2h?.filter((m: any) => {
                                                const isAwayMatch = doesH2HMatchTeam(m, matchData.away);
                                                const isDirectH2H = isDirectH2HMatch(m, matchData.home, matchData.away);
                                                return isAwayMatch && !isDirectH2H;
                                            }).slice(0, 5).map((m: any, i: number) => (
                                                <H2HItem
                                                    key={i}
                                                    m={m}
                                                    styles={styles}
                                                    focusTeam={matchData.away}
                                                    referenceTeams={{ home: matchData.home, away: matchData.away }}
                                                />
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
                                                                    const homeLogo = getTeamLogo(m.home_team);
                                                                    const awayLogo = getTeamLogo(m.away_team);
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
                                                    const rowName = row.name || row.team?.name || row.TEAM_NAME || row.team_name;
                                                    const rowId = row.team_id || row.team?.id || row.team?.team_id || null;
                                                    const rowLogo = row.logo || row.team?.logo || row.team_logo || '';
                                                    const teamHref = rowId
                                                        ? buildTeamHref({ id: rowId, name: rowName, league: row.team?.league || row.participant?.league || null }, matchData.sportId)
                                                        : null;
                                                    const isCurrent = rowName === matchData.home.name || rowName === matchData.away.name ||
                                                        rowId === matchData.home.id || rowId === matchData.away.id;

                                                    return (
                                                        <tr key={i} className={isCurrent ? styles.currentTeam : ''}>
                                                            <td><span className={styles.rankBadge}>{row.rank || i + 1}</span></td>
                                                            <td style={isCurrent ? { color: 'var(--accent)', fontWeight: '700' } : {}}>
                                                                <div className={styles.standingsTeamCell}>
                                                                    {rowLogo
                                                                        ? <img src={rowLogo} alt="" className={styles.standingsTeamLogo} />
                                                                        : <div className={styles.standingsTeamLogoPlaceholder} />}
                                                                    {teamHref
                                                                        ? <Link href={teamHref} className={styles.standingsTeamLink}>{rowName}</Link>
                                                                        : <span>{rowName}</span>}
                                                                </div>
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
                                {state.localPlayerRows.length > 0 ? (
                                    <div style={{ display: 'grid', gap: '12px' }}>
                                        {state.localPlayerRows.map((player) => (
                                            <div key={player.key} className={styles.playerStatRow} style={{ padding: '14px 16px', display: 'grid', gridTemplateColumns: '1fr auto', gap: '12px', alignItems: 'center' }}>
                                                <div style={{ display: 'grid', gap: '4px' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                                        <strong>
                                                            {player.playerId ? (
                                                                <Link href={`/players/${player.playerId}`} style={{ color: 'inherit', textDecoration: 'none' }}>
                                                                    {player.name}
                                                                </Link>
                                                            ) : player.name}
                                                        </strong>
                                                        {player.number != null && <span className={styles.playerNumber}>#{player.number}</span>}
                                                        {player.isCaptain && <span className={styles.positionBadge}>Cap.</span>}
                                                    </div>
                                                    <div style={{ fontSize: '12px', opacity: 0.72 }}>
                                                        {player.teamName}{player.position ? ` · ${player.position}` : ''}
                                                    </div>
                                                </div>
                                                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                                                    {typeof player.rating === 'number' && <span className={styles.playerRatingMeta}>Puntaje {player.rating.toFixed(1)}</span>}
                                                    <span className={styles.positionBadge}>Pts {player.points}</span>
                                                    <span className={styles.positionBadge}>Tries {player.tries}</span>
                                                    <span className={styles.positionBadge}>YC {player.yellowCards}</span>
                                                    <span className={styles.positionBadge}>RC {player.redCards}</span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : state.playerStats?.stat_groups && state.playerStats.stat_groups.length > 0 ? (
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

                        {!isLimitedExternalSource && matchData.topScorers && Array.isArray(matchData.topScorers) && matchData.topScorers.length > 0 && (
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
                                    time: matchTimerText,
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
