'use client';

import React, { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import ProtectedLink from '@/components/ProtectedLink';
import ExportImage from '@/components/ExportImage';
import FavoriteButton from '@/components/FavoriteButton';
import MatchWinnerVoteCard from '@/components/MatchWinnerVoteCard';
import MatchTimeline from '@/components/match/MatchTimeline';
import PeopleRatingsPanel, { type RateablePlayer } from '@/components/match/PeopleRatingsPanel';
import styles from './page.module.css';
import { FAVORITES_ENABLED } from '@/lib/favorites/config';
import {
    buildLocalPlayerStatsRows,
    buildLocalTeamStats,
    normalizeLocalEvents,
    normalizeLocalLineups,
    publicEventTypeDisplay,
    type LocalPlayerStatsRow,
} from '@/lib/localMatchData';
import { isGoalKickAttemptEvent } from '@/lib/matchEventStats';
import {
    buildMatchEventDefinitionMap,
    getDefaultMatchEventDefinitions,
} from '@/lib/matchEventCatalog';
import {
    buildCompleteMatchStats,
    buildCompleteStatTabs,
    type AggregatableMatchEvent,
} from '@/lib/matchStatsFromEvents';
import { getMatchPenaltyScore, hasMatchPenaltyShootout } from '@/lib/matchUtils';
import { parseAnyMatches, withStats } from '@/lib/matchSchema';
import { SPORTS } from '@/lib/data/sports';
import { findCountryRecord } from '@/lib/data/countries';
import { canUseRestrictedContentActions } from '@/lib/auth/roles';
import { APP_TIMEZONE } from '@/lib/timezone';
import { calculateVirtualMatchTime } from '@/lib/virtualClock';
import {
    buildPlayerStatsTableData,
} from '@/lib/playerStats';
import {
    resolveMatchTabs,
    toMatchStatusKind,
    type MatchProvider,
} from '@/lib/matches/matchTabs';
import PlayerStatsPanel from './PlayerStatsPanel';
import LineupRatingEditorModal from './LineupRatingEditorModal';
import { resolveTeamLogo } from '@/lib/utils/teamLogoOverrides';
import { resolveTournamentLogo as resolveTournamentLogoSource } from '@/lib/utils/tournamentLogo';
import { useAuth } from '@/context/AuthContext';

const USER_TZ = APP_TIMEZONE;

function formatClockLabel(
    clock: { minute?: number | null; seconds?: number | null; period?: string | null; running?: boolean | null; syncedAt?: string | null } | null | undefined,
    syncedAt?: string | null,
) {
    if (!clock) return '';

    const minute = Number(clock.minute);
    const seconds = Number(clock.seconds);
    let totalSeconds =
        (Number.isFinite(minute) ? Math.max(0, Math.trunc(minute)) : 0) * 60
        + (Number.isFinite(seconds) ? Math.max(0, Math.trunc(seconds)) : 0);

    const effectiveSyncedAt = clock?.syncedAt || syncedAt;

    if (clock.running && effectiveSyncedAt) {
        const syncedTime = new Date(effectiveSyncedAt);
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
    clock: { minute?: number | null; seconds?: number | null; period?: string | null; running?: boolean | null; syncedAt?: string | null } | null | undefined,
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

function isEspnSoccerMatchId(value: string) {
    return /^espn-soccer-game-[a-z0-9._-]+$/i.test(value);
}

function isEspnMotorsportMatchId(value: string) {
    return /^espn-race-[a-z0-9-]+--.+$/i.test(value);
}

// Mundial de Hockey: `fih-match-m-22334`. La `m`/`w` es la competencia y el
// numero es el id del partido en Altius. Mismo formato que `toFihMatchId`.
function isFihMatchId(value: string) {
    return /^fih-match-[mw]-\d+$/i.test(value);
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

/**
 * Marca por que borde de una barra scrolleable queda contenido sin ver.
 *
 * De aca salen los `data-overflow-start` / `data-overflow-end` que el CSS
 * traduce en el degrade del borde. Sin esto la barra de pestanas se corta al
 * ras contra el margen y no hay forma de saber que hay mas: en un iPhone
 * entran hasta "Estadisticas" y las ultimas quedan invisibles.
 *
 * `revision` re-sincroniza cuando cambia el CONTENIDO sin cambiar el ancho de
 * la barra (el proveedor resuelve y la lista de pestanas se acorta); el
 * ResizeObserver solo ve los cambios de tamano del propio nodo.
 */
function useHorizontalOverflow<T extends HTMLElement>(revision?: unknown) {
    const ref = useRef<T | null>(null);

    useEffect(() => {
        const node = ref.current;
        if (!node) return;

        const sync = () => {
            const maxScroll = node.scrollWidth - node.clientWidth;
            node.dataset.overflowStart = String(node.scrollLeft > 1);
            node.dataset.overflowEnd = String(node.scrollLeft < maxScroll - 1);
        };

        sync();
        node.addEventListener('scroll', sync, { passive: true });
        window.addEventListener('resize', sync);

        const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(sync) : null;
        observer?.observe(node);

        return () => {
            node.removeEventListener('scroll', sync);
            window.removeEventListener('resize', sync);
            observer?.disconnect();
        };
    }, [revision]);

    return ref;
}

/**
 * Si el riel de pestanas entra entero o hay que mandar el sobrante a "Mas".
 *
 * Arranca en `false` a proposito: en el servidor no hay viewport, y suponer
 * telefono haria que el escritorio parpadee de cuatro pestanas a siete en la
 * hidratacion. Suponer escritorio solo cuesta un reflow en el telefono.
 */
function useIsNarrow(query = '(max-width: 640px)') {
    const [narrow, setNarrow] = useState(false);

    useEffect(() => {
        if (typeof window.matchMedia !== 'function') return;
        const mql = window.matchMedia(query);
        const sync = () => setNarrow(mql.matches);
        sync();
        mql.addEventListener('change', sync);
        return () => mql.removeEventListener('change', sync);
    }, [query]);

    return narrow;
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

function buildTournamentHref(tournamentId?: string, season?: string | number | null, name?: string | null) {
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
    // Carry the known name so external (FlashScore/ESPN) tournaments show their
    // title immediately on the destination page instead of "Cargando…". Harmless
    // for local tournaments (the DB name takes precedence on the public page).
    const trimmedName = String(name || '').trim();
    if (trimmedName) {
        params.set('name', trimmedName);
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

function getCountryFlagEmoji(countryName: unknown) {
    if (typeof countryName !== 'string' || !countryName.trim()) return '';
    return findCountryRecord(undefined, countryName)?.flagEmoji || '';
}

function getDrawParticipantCountryName(draw: any, matchId: string, side: 'home' | 'away') {
    const rounds = Array.isArray(draw) ? draw : [];
    for (const round of rounds) {
        const matches = Array.isArray(round?.matches) ? round.matches : [];
        const currentMatch = matches.find((item: any) => String(item?.match_id || '') === matchId);
        if (!currentMatch) continue;
        return side === 'home'
            ? (currentMatch?.home_team?.country?.name || '')
            : (currentMatch?.away_team?.country?.name || '');
    }
    return '';
}

function getScoreboardParticipantVisual(team: any, sportId: unknown) {
    if (sportId === 'tennis') {
        return {
            image: team?.imagePath || team?.smallImagePath || team?.logo || '',
            flagEmoji: team?.countryFlagEmoji || getCountryFlagEmoji(team?.countryName),
        };
    }

    return {
        image: team?.logo || '',
        flagEmoji: '',
    };
}

function ScoreboardParticipantAvatar({ imageSrc, flagEmoji }: { imageSrc: string; flagEmoji: string }) {
    const [imageFailed, setImageFailed] = useState(false);

    if (imageSrc && !imageFailed) {
        return (
            <img
                src={imageSrc}
                className={styles.crestImage}
                alt=""
                onError={() => {
                    setImageFailed(true);
                }}
            />
        );
    }

    if (flagEmoji) {
        return <div className={styles.crestFlag} aria-hidden>{flagEmoji}</div>;
    }

    return <div className={styles.crestPlaceholder} aria-hidden />;
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
    options?: { isTopRated?: boolean },
) {
    const badges: Array<{ label: string; kind: 'position' | 'rating'; isTopRated?: boolean }> = [];
    const position = String(player.position || '').trim();
    if (position && !isGenericLineupRoleLabel(position)) {
        badges.push({ label: position, kind: 'position' });
    }

    if (typeof player.rating === 'number') {
        badges.push({
            label: player.rating.toFixed(1),
            kind: 'rating',
            isTopRated: options?.isTopRated === true,
        });
    }

    const role = String(player.role || '').trim();
    if (badges.length === 0 && role && !isGenericLineupRoleLabel(role)) {
        badges.push({ label: role, kind: 'position' });
    }

    return badges;
}

function getTopLineupRating(
    players: Array<{ rating: number | null }>,
) {
    let top = Number.NEGATIVE_INFINITY;
    for (const p of players) {
        if (typeof p.rating === 'number' && p.rating > top) {
            top = p.rating;
        }
    }
    return Number.isFinite(top) ? top : null;
}


/** Promedio por partido, con un decimal. Sin partidos jugados no hay promedio. */
function perGame(total: number | null | undefined, played: number | null | undefined) {
    if (typeof total !== 'number' || typeof played !== 'number' || played <= 0) return null;
    return Math.round((total / played) * 10) / 10;
}

function formatSigned(value: number | null | undefined) {
    if (typeof value !== 'number' || !Number.isFinite(value)) return '-';
    return value > 0 ? `+${value}` : String(value);
}

/**
 * La racha, como cinco puntitos de color. Se acepta tanto la notación inglesa
 * (W/D/L) como la castellana (G/E/P) porque conviven según de dónde salga la
 * tabla; se dibujan de la más vieja a la más reciente.
 */
function renderForm(form: string | undefined, styles: Record<string, string>) {
    if (!form) return null;
    return (
        <span className={styles.previaForm}>
            {form.split('').map((char, i) => {
                const win = char === 'W' || char === 'G';
                const draw = char === 'D' || char === 'E';
                const label = win ? 'Ganó' : draw ? 'Empató' : 'Perdió';
                return (
                    <span
                        key={i}
                        className={`${styles.previaFormDot} ${win ? styles.previaFormWin : draw ? styles.previaFormDraw : styles.previaFormLoss}`}
                        title={label}
                    >
                        <span className={styles.srOnly}>{label}</span>
                    </span>
                );
            })}
        </span>
    );
}

function canFavoriteTeam(team: { id?: string | null }) {
    const teamId = String(team.id || '').trim();
    return Boolean(teamId && teamId !== 'home' && teamId !== 'away');
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

    // El resultado se lee en el COLOR de la tarjeta, no en una letra al costado:
    // verde ganó, ámbar empató, rojo perdió, siempre desde el club de la columna.
    // En la columna del medio no hay club de referencia —el partido es entre los
    // dos— así que la tarjeta queda neutra.
    let outcome: 'win' | 'draw' | 'loss' | null = null;
    if (focusTeam && m.scores) {
        const hScore = parseInt(m.scores.home ?? '0', 10);
        const aScore = parseInt(m.scores.away ?? '0', 10);
        if (Number.isFinite(hScore) && Number.isFinite(aScore)) {
            if (doesH2HSideMatchTeam(m, 'home', focusTeam)) {
                outcome = hScore > aScore ? 'win' : hScore < aScore ? 'loss' : 'draw';
            } else if (doesH2HSideMatchTeam(m, 'away', focusTeam)) {
                outcome = aScore > hScore ? 'win' : aScore < hScore ? 'loss' : 'draw';
            }
        }
    }

    const outcomeLabel = outcome === 'win' ? 'Victoria' : outcome === 'loss' ? 'Derrota' : outcome === 'draw' ? 'Empate' : '';
    const outcomeClass = outcome === 'win' ? styles.h2hWin
        : outcome === 'loss' ? styles.h2hLoss
        : outcome === 'draw' ? styles.h2hDraw
        : styles.h2hNeutral;

    const crest = (src: string | null, name: string) => (
        src
            ? <img src={src} alt={name} title={name} loading="lazy" className={styles.h2hCrest} />
            : <div className={styles.h2hCrestFallback} aria-hidden="true" />
    );

    return (
        <div className={`${styles.h2hItem} ${outcomeClass}`}>
            {outcomeLabel && <span className={styles.srOnly}>{outcomeLabel}. </span>}
            <div className={styles.h2hDate}>
                <div>{date}</div>
                <div className={styles.h2hComp}>{m.tournament_name_short || m.tournament_name}</div>
            </div>
            <div className={styles.h2hTeams}>
                <div className={styles.h2hCrestSlot} style={{ justifyContent: 'flex-end' }}>
                    {crest(homeLogo, m.home_team?.name || '')}
                </div>
                <span className={styles.h2hScore}>{m.scores?.home} - {m.scores?.away}</span>
                <div className={styles.h2hCrestSlot} style={{ justifyContent: 'flex-start' }}>
                    {crest(awayLogo, m.away_team?.name || '')}
                </div>
            </div>
        </div>
    );
}

export default function MatchDetailClientPage({ id }: { id: string }) {
    const router = useRouter();
    const { user, isLoading: authLoading } = useAuth();

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
        /**
         * La tabla y el historial llegan en una SEGUNDA consulta, despues del
         * partido. Hasta que lleguen, la barra de pestanas no sabe cuantas
         * secciones va a tener: dibujarla igual mostraba "Plantel" sola y
         * despues sumaba tres mas de golpe. Mientras esto es false se dibuja el
         * hueco de la barra en vez de una barra que va a cambiar.
         */
        secondaryReady: boolean;
    }>({
        kind: 'loading',
        secondaryReady: false,
        eventsData: [],
        statsData: [],
        playerStats: null,
        localPlayerRows: [],
        commentaryData: [],
        issues: [],
        debug: {}
    });

    const [activeTab, setActiveTab] = useState('summary');
    const [publicStatsTab, setPublicStatsTab] = useState('marcador');
    const [lineupModalOpen, setLineupModalOpen] = useState(false);
    const [lineupReloadKey, setLineupReloadKey] = useState(0);
    // Whether the current user can edit THIS match (super/global/federation
    // admin OR an admin of this match's tournament). Resolved server-side via
    // the same gate the editor page enforces, so it never leaks other
    // tournaments and stays in sync with the backend.
    const [canManageMatch, setCanManageMatch] = useState(false);
    const statusRef = useRef<string>('scheduled');
    const isFlashScore = /^[A-Za-z0-9]{8}$/.test(id);
    const isRugbyExternal = isRugbyApiSportsMatchId(id);
    const isEspnExternal = isEspnAmericanFootballMatchId(id);
    const isEspnSoccerExternal = isEspnSoccerMatchId(id);
    const isEspnMotorsportExternal = isEspnMotorsportMatchId(id);
    const isFihExternal = isFihMatchId(id);
    const isExternalMatch = isFlashScore || isRugbyExternal || isEspnExternal || isEspnSoccerExternal || isEspnMotorsportExternal || isFihExternal;

    const resolvedMatchId =
        typeof state.matchData?.id === 'string' && state.matchData.id.trim()
            ? state.matchData.id.trim()
            : '';
    const currentUserId = user?.id ?? null;
    useEffect(() => {
        if (isExternalMatch || state.kind !== 'ok' || !resolvedMatchId || !currentUserId) {
            setCanManageMatch(false);
            return;
        }
        let cancelled = false;
        fetch(`/api/matches/${encodeURIComponent(resolvedMatchId)}/can-edit`, {
            credentials: 'include',
            cache: 'no-store',
        })
            .then((r) => (r.ok ? r.json() : { canEdit: false }))
            .then((j) => { if (!cancelled) setCanManageMatch(Boolean(j?.canEdit)); })
            .catch(() => { if (!cancelled) setCanManageMatch(false); });
        return () => { cancelled = true; };
    }, [state.kind, resolvedMatchId, isExternalMatch, currentUserId]);

    const publicCompleteStatTabs = useMemo(() => {
        if (state.kind !== 'ok' || !state.matchData) return [];
        const sportId = state.matchData.sportId ?? null;
        const defMap = buildMatchEventDefinitionMap(getDefaultMatchEventDefinitions(sportId));
        const homeName = state.matchData.home?.name || 'Local';
        const awayName = state.matchData.away?.name || 'Visitante';
        const evs: AggregatableMatchEvent[] = (state.eventsData || []).map((evt: Record<string, unknown>) => {
            const rawType = typeof evt.type === 'string' ? evt.type.trim().toLowerCase() : '';
            const team = evt.team === 'home' || evt.team === 'away' ? evt.team : null;
            const detail =
                typeof evt.description === 'string'
                    ? evt.description
                    : (typeof evt.detail === 'string' ? evt.detail : '');
            return { type: rawType, team, detail };
        });
        const stats = buildCompleteMatchStats(evs, defMap);
        return buildCompleteStatTabs(stats, homeName, awayName, { sportId });
    }, [state.kind, state.matchData, state.eventsData]);
    const isSuperAdminUser = !authLoading && canUseRestrictedContentActions(user?.role);
    const isRugbyApiSportsSource = state.matchData?.externalProvider === 'rugby-api-sports';
    const isEspnSource = state.matchData?.externalProvider === 'espn';
    const isMotorsportSource =
        state.matchData?.sportId === 'motorsport' ||
        isEspnMotorsportExternal ||
        String(state.matchData?.tournamentId || '').startsWith('espn-racing-league-');
    const isEspnSoccerSource = isEspnSource && (
        state.matchData?.sportId === 'football' ||
        isEspnSoccerExternal ||
        String(state.matchData?.tournamentId || '').startsWith('espn-soccer-league-')
    );
    const isLimitedExternalSource = isRugbyApiSportsSource || (isEspnSource && !isMotorsportSource && !isEspnSoccerSource);
    const isFihSource = state.matchData?.externalProvider === 'fih';
    // Quien trae su propia lista de pestanas en vez de la barra completa. El
    // Mundial no tiene comentarios narrados ni sorteo: mostrar la pestana vacia
    // es prometer algo que la fuente no publica.
    // El automovilismo conserva su propia barra porque no es un partido: no
    // tiene local, visitante ni marcador, sino una grilla de competidores.
    const motorsportTabs = useMemo(() => ([
        { id: 'summary', label: 'Resumen' },
        { id: 'results', label: 'Resultados' },
        { id: 'sessions', label: 'Sesiones' },
        { id: 'championship', label: 'Campeonato' },
        { id: 'circuit', label: 'Circuito' },
    ]), []);

    // Qué fuente atiende este partido. Es el único lugar donde se traduce del
    // formato del id al vocabulario del motor de capacidades.
    const tabProvider: MatchProvider = isMotorsportSource
        ? 'local' // no se usa: el automovilismo no pasa por resolveMatchTabs
        : isFihSource ? 'fih'
        : isEspnSoccerSource ? 'espn-soccer'
        : isRugbyApiSportsSource ? 'rugby-api-sports'
        : isEspnSource ? 'espn-american-football'
        : isFlashScore ? 'flashscore'
        : 'local';

    useEffect(() => {
        const controller = new AbortController();

        async function fetchData() {
            setState(prev => prev.matchData ? prev : { ...prev, kind: 'loading' });

            try {
                if (isExternalMatch) {
                    const apiRes = await fetch(`/api/matches/${id}`, {
                        signal: controller.signal,
                        cache: 'no-store',
                    });
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
                            secondaryReady: true,
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

                    // Mundial de Hockey: el bundle ya viene en el vocabulario de
                    // la pantalla (eventos canonicos, planilla, alineaciones),
                    // asi que no hay nada que normalizar aca.
                    if (payload?.source === 'fih' && payload?.match) {
                        statusRef.current = payload.match.status || 'scheduled';
                        setState({
                            kind: 'ok',
                            secondaryReady: true,
                            matchData: payload.match,
                            eventsData: Array.isArray(payload.events) ? payload.events : [],
                            statsData: Array.isArray(payload.stats) ? payload.stats : [],
                            playerStats: payload.playerStats || null,
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
                            secondaryReady: true,
                            matchData: espnMatch,
                            eventsData: Array.isArray(payload.events) ? payload.events : (Array.isArray(payload.match.events) ? payload.match.events : []),
                            statsData: Array.isArray(payload.stats) ? payload.stats : (Array.isArray(payload.match.stats) ? payload.match.stats : []),
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
                    // FlashScore details put the shootout result inside `scores` as
                    // home_penalties / away_penalties. Surface it so the public score
                    // can render "1 (3) : 1 (4)" for matches decided on penalties.
                    const detailsPenalties = (() => {
                        const sc = evt.scores as Record<string, unknown> | undefined;
                        const ph = sc?.home_penalties;
                        const pa = sc?.away_penalties;
                        return typeof ph === 'number' && typeof pa === 'number'
                            ? { home: ph, away: pa }
                            : null;
                    })();
                    const initialHomeCountryName = getDrawParticipantCountryName(drawRes, String(evt.match_id || evt.EVENT_ID || id), 'home');
                    const initialAwayCountryName = getDrawParticipantCountryName(drawRes, String(evt.match_id || evt.EVENT_ID || id), 'away');

                    statusRef.current = fsStatus;
                    const resolvedHomeLogo = resolveMatchTeamLogo(evt.home_team, baseMatch.home, baseMatch.home?.logo);
                    const resolvedAwayLogo = resolveMatchTeamLogo(evt.away_team, baseMatch.away, baseMatch.away?.logo);
                    setState(prev => ({
                        ...prev,
                        kind: 'ok',
                        secondaryReady: true,
                        matchData: {
                            ...baseMatch,
                            sportId,
                            status: fsStatus,
                            round: evt.tournament?.stage_id || evt.ROUND_NAME || 'General',
                            category: evt.country?.name || evt.COUNTRY_NAME || baseMatch.category || 'Internacional',
                            tournamentId: evt.tournament?.tournament_stage_id || evt.tournament?.tournament_id || evt.TOURNAMENT_STAGE_ID || '',
                            tournamentUrl: evt.tournament?.tournament_url || evt.tournament?.url || evt.TOURNAMENT_URL || '',
                            tournamentLogo: resolveTournamentLogo(evt, (baseMatch as any)?.tournamentLogo || null),
                            penalties: detailsPenalties,
                            home: {
                                ...baseMatch.home,
                                logo: resolvedHomeLogo,
                                score: initialHomeScore,
                                teamUrl: evt.home_team?.team_url || '',
                                imagePath: evt.home_team?.image_path || evt.home_team?.small_image_path || '',
                                smallImagePath: evt.home_team?.small_image_path || evt.home_team?.image_path || '',
                                countryName: initialHomeCountryName || '',
                                countryFlagEmoji: getCountryFlagEmoji(initialHomeCountryName),
                            },
                            away: {
                                ...baseMatch.away,
                                logo: resolvedAwayLogo,
                                score: initialAwayScore,
                                teamUrl: evt.away_team?.team_url || '',
                                imagePath: evt.away_team?.image_path || evt.away_team?.small_image_path || '',
                                smallImagePath: evt.away_team?.small_image_path || evt.away_team?.image_path || '',
                                countryName: initialAwayCountryName || '',
                                countryFlagEmoji: getCountryFlagEmoji(initialAwayCountryName),
                            },
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
                        const resolvedHomeCountryName = getDrawParticipantCountryName(resolvedDraw, String(evt.match_id || evt.EVENT_ID || id), 'home') || prev.matchData.home?.countryName || '';
                        const resolvedAwayCountryName = getDrawParticipantCountryName(resolvedDraw, String(evt.match_id || evt.EVENT_ID || id), 'away') || prev.matchData.away?.countryName || '';

                        return {
                            ...prev,
                            kind: 'ok',
                            secondaryReady: true,
                            matchData: {
                                ...prev.matchData,
                                status: listMatchEvt?.match_status ? mapMatchStatus(listMatchEvt.match_status) : fsStatus,
                                penalties: detailsPenalties ?? prev.matchData.penalties ?? null,
                                tournamentUrl: evt.tournament?.tournament_url || evt.tournament?.url || evt.TOURNAMENT_URL || prev.matchData.tournamentUrl || '',
                                tournamentLogo: resolveTournamentLogo(evt, prev.matchData.tournamentLogo || null),
                                home: {
                                    ...prev.matchData.home,
                                    logo: resolveMatchTeamLogo(evt.home_team, prev.matchData.home, prev.matchData.home?.logo),
                                    score: hScoreFinal,
                                    teamUrl: evt.home_team?.team_url || '',
                                    imagePath: evt.home_team?.image_path || evt.home_team?.small_image_path || prev.matchData.home?.imagePath || '',
                                    smallImagePath: evt.home_team?.small_image_path || evt.home_team?.image_path || prev.matchData.home?.smallImagePath || '',
                                    countryName: resolvedHomeCountryName,
                                    countryFlagEmoji: getCountryFlagEmoji(resolvedHomeCountryName),
                                },
                                away: {
                                    ...prev.matchData.away,
                                    logo: resolveMatchTeamLogo(evt.away_team, prev.matchData.away, prev.matchData.away?.logo),
                                    score: aScoreFinal,
                                    teamUrl: evt.away_team?.team_url || '',
                                    imagePath: evt.away_team?.image_path || evt.away_team?.small_image_path || prev.matchData.away?.imagePath || '',
                                    smallImagePath: evt.away_team?.small_image_path || evt.away_team?.image_path || prev.matchData.away?.smallImagePath || '',
                                    countryName: resolvedAwayCountryName,
                                    countryFlagEmoji: getCountryFlagEmoji(resolvedAwayCountryName),
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
                        const res = await fetch(`/api/matches/${id}`, {
                            signal: controller.signal,
                            cache: 'no-store',
                        });
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
                            const localEvents = normalizeLocalEvents(matchData.events || [], sportId);
                            const localPlayerRows = buildLocalPlayerStatsRows({
                                lineups: localLineups,
                                events: localEvents,
                                homeName: matchData.homeClub?.name || 'Local',
                                awayName: matchData.awayClub?.name || 'Visitante',
                                sportId,
                            });
                            const localStats = buildLocalTeamStats(localEvents, sportId);
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
                                tournamentUrl: matchData.tournament?.url || null,
                                category: matchData.category || 'General',
                                round: matchData.roundLabel || matchData.roundId || '',
                                venue: matchData.venue || 'Por definir',
                                referee: matchData.referee || null,
                                penalties: score.penalties || null,
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
                                secondaryReady: false,
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
                                // La tabla ya trae el detalle de la temporada; lo
                                // descartabamos y despues no habia con que armar
                                // la Previa. Ahora viaja hasta el componente.
                                wins: row.wins_total ?? 0,
                                draws: row.draws_total ?? 0,
                                losses: row.losses_total ?? 0,
                                points_for: row.goals_for ?? 0,
                                points_against: row.goals_against ?? 0,
                                form: typeof row.form === 'string' ? row.form : (Array.isArray(row.form) ? row.form.join('') : ''),
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
                                tournamentUrl: matchData.tournament?.url || null,
                                category: matchData.category || 'General',
                                round: matchData.roundLabel || matchData.roundId || '',
                                venue: matchData.venue || 'Por definir',
                                referee: matchData.referee || null,
                                penalties: score.penalties || null,
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
                                secondaryReady: true,
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

        // Poll con conciencia de visibilidad (mismo criterio que useMatchesStore):
        // no consultamos la red mientras la pestaña está en background y, al volver
        // a foco, refrescamos de inmediato lo que no se pidió.
        let interval: ReturnType<typeof setInterval> | null = null;

        const startPolling = () => {
            if (interval != null) return;
            interval = setInterval(() => {
                if (statusRef.current === 'live') {
                    fetchData();
                }
            }, 60000);
        };

        const stopPolling = () => {
            if (interval == null) return;
            clearInterval(interval);
            interval = null;
        };

        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                if (statusRef.current === 'live') {
                    fetchData(); // catch-up al reanudar
                }
                startPolling();
            } else {
                stopPolling(); // pausa real en background
            }
        };

        if (document.visibilityState === 'visible') {
            startPolling();
        }
        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            stopPolling();
            document.removeEventListener('visibilitychange', handleVisibilityChange);

            if (!controller.signal.aborted) {
                controller.abort(new DOMException('Match detail effect cleanup', 'AbortError'));
            }
        };
    }, [id, lineupReloadKey]);

    const [liveClockTick, setLiveClockTick] = useState(0);

    useEffect(() => {
        if (state.kind !== 'ok' || state.matchData?.status !== 'live') return;

        const intervalId = window.setInterval(() => {
            setLiveClockTick((value) => value + 1);
        }, 1000);

        return () => window.clearInterval(intervalId);
    }, [state.kind, state.matchData?.date, state.matchData?.status]);

    const playerStatsTable = useMemo(() => buildPlayerStatsTableData({
        localPlayerRows: state.localPlayerRows,
        playerStats: state.playerStats,
        homeName: state.matchData?.home?.name || 'Local',
        awayName: state.matchData?.away?.name || 'Visitante',
    }), [state.localPlayerRows, state.matchData?.away?.name, state.matchData?.home?.name, state.playerStats]);

    // Props estables para MatchTimeline: construidas inline en el JSX cambiaban
    // de identidad en cada tick del reloj y anulaban su React.memo.
    const timelineHomeTeam = useMemo(() => ({
        name: state.matchData?.home?.name || 'Local',
        logo: state.matchData?.home?.logo || '',
    }), [state.matchData?.home?.name, state.matchData?.home?.logo]);
    const timelineAwayTeam = useMemo(() => ({
        name: state.matchData?.away?.name || 'Visitante',
        logo: state.matchData?.away?.logo || '',
    }), [state.matchData?.away?.name, state.matchData?.away?.logo]);

    // ── La barra de pestañas ────────────────────────────────────────────────
    // Cuántas filas tiene cada sección. El motor no mira el proveedor para
    // decidir si algo está lleno: mira esto.
    const tabCounts = useMemo(() => {
        const md = state.matchData;
        if (!md) return { events: 0, lineups: 0, players: 0, stats: 0, h2h: 0, standings: 0, commentary: 0 };

        const local = normalizeLocalLineups(md.lineups || null);
        const localLineupCount =
            local.home.filter((p) => Boolean(p.name)).length +
            local.away.filter((p) => Boolean(p.name)).length;
        const externalLineupCount = localLineupCount > 0 ? 0 : (
            (Array.isArray(md.lineups?.HOME_STARTING_LINEUPS) ? md.lineups.HOME_STARTING_LINEUPS.length : 0) +
            (Array.isArray(md.lineups?.AWAY_STARTING_LINEUPS) ? md.lineups.AWAY_STARTING_LINEUPS.length : 0) +
            (Array.isArray(md.lineups?.home_team?.starting_lineups) ? md.lineups.home_team.starting_lineups.length : 0) +
            (Array.isArray(md.lineups?.away_team?.starting_lineups) ? md.lineups.away_team.starting_lineups.length : 0)
        );

        // Una fila de estadística existe siempre, aunque el partido no se haya
        // jugado: `buildLocalTeamStats` devuelve las ocho del deporte en cero.
        // Contar filas diría "hay datos" en un partido programado, que era
        // justo el defecto. Se cuentan las que tienen algo distinto de cero.
        const statsWithData = (state.statsData ?? []).filter((s: any) => {
            const h = parseFloat(String(s?.home ?? '').replace(/[^0-9.]/g, '')) || 0;
            const a = parseFloat(String(s?.away ?? '').replace(/[^0-9.]/g, '')) || 0;
            return h > 0 || a > 0;
        }).length;

        return {
            events: state.eventsData?.length ?? 0,
            lineups: localLineupCount + externalLineupCount,
            players: playerStatsTable?.rows?.length ?? state.localPlayerRows?.length ?? 0,
            stats: statsWithData,
            h2h: Array.isArray(md.h2h) ? md.h2h.length : 0,
            standings: Array.isArray(md.standings) ? md.standings.length : 0,
            commentary: state.commentaryData?.length ?? 0,
        };
    }, [state.matchData, state.eventsData, state.statsData, state.localPlayerRows, state.commentaryData, playerStatsTable]);

    const resolvedTabs = useMemo(
        () => resolveMatchTabs({
            provider: tabProvider,
            status: toMatchStatusKind(state.matchData?.status),
            counts: tabCounts,
            canManage: canManageMatch || isSuperAdminUser,
        }),
        [tabProvider, state.matchData?.status, tabCounts, canManageMatch, isSuperAdminUser]
    );

    // Forma común: el automovilismo trae `{id,label}` y el motor trae además
    // `shortLabel`/`state`. La barra dibuja las dos con el mismo código.
    type RailTab = { id: string; label: string; shortLabel?: string; state?: 'ready' | 'pending'; hint?: string };
    const visibleTabs: RailTab[] = isMotorsportSource ? motorsportTabs : resolvedTabs.tabs;

    // El riel se desliza con el dedo. No hay tope ni menu "Mas": en un telefono
    // arrastrar es mas barato que abrir una hoja, y la activa se centra sola
    // (efecto de abajo) para que nunca quede fuera de cuadro, que era el
    // defecto de la barra original.
    const isNarrow = useIsNarrow();
    const railTabs = visibleTabs;

    // La pestaña viaja en la URL: el link se comparte, F5 vuelve al mismo lado
    // y el botón atrás recorre las pestañas antes de salir del partido. Mismo
    // criterio de pushState nativo que ya usa el gestor de torneos.
    // Mientras el usuario no haya elegido, la pestaña abierta sigue a la de
    // entrada. Hace falta porque el historial y la tabla llegan en una segunda
    // consulta: si se congelara la decisión con lo que hay en el primer
    // render, un partido programado abriría en Alineaciones —lo único
    // resuelto en ese instante— y nunca en la Previa.
    const tabsReadyRef = useRef(false);
    const userPickedTabRef = useRef(false);
    const pendingUrlTabRef = useRef<string | null>(null);

    const selectTab = (id: string) => {
        userPickedTabRef.current = true;
        setActiveTab(id);
    };

    useEffect(() => {
        if (state.kind !== 'ok' || visibleTabs.length === 0) return;

        const valid = (candidate: string | null) =>
            Boolean(candidate) && visibleTabs.some((t) => t.id === candidate);
        const fallback = isMotorsportSource ? 'summary' : resolvedTabs.defaultTab;

        if (!tabsReadyRef.current) {
            tabsReadyRef.current = true;
            // Un `?tab=` en la URL es una elección explícita. Se guarda aparte
            // porque en el primer render la barra todavía no tiene todas las
            // pestañas —el historial y la tabla llegan después—, y descartarlo
            // por "todavía no existe" rompe el link compartido.
            pendingUrlTabRef.current = new URLSearchParams(window.location.search).get('tab');
        }

        if (pendingUrlTabRef.current) {
            if (valid(pendingUrlTabRef.current)) {
                const wanted = String(pendingUrlTabRef.current);
                pendingUrlTabRef.current = null;
                userPickedTabRef.current = true;
                if (activeTab !== wanted) setActiveTab(wanted);
                return;
            }
            // Todavía puede aparecer: se sigue mostrando el default mientras
            // tanto, sin congelar la decisión.
            if (activeTab !== fallback) setActiveTab(fallback);
            return;
        }

        if (!userPickedTabRef.current) {
            if (activeTab !== fallback) setActiveTab(fallback);
            return;
        }
        // La pestaña elegida dejó de existir (cambió el estado del partido):
        // se cae a la de entrada en vez de quedar en la nada.
        if (!valid(activeTab)) setActiveTab(fallback);
    }, [state.kind, visibleTabs, activeTab, resolvedTabs.defaultTab, isMotorsportSource]);

    useEffect(() => {
        if (!tabsReadyRef.current || state.kind !== 'ok') return;
        const url = new URL(window.location.href);
        if (url.searchParams.get('tab') === activeTab) return;
        url.searchParams.set('tab', activeTab);
        // Antes de que el usuario elija, la barra todavía se está acomodando
        // con los datos que llegan: eso se reemplaza, no se apila en el
        // historial. Si no, el botón atrás recorre pestañas que nadie abrió.
        if (userPickedTabRef.current) window.history.pushState(null, '', url);
        else window.history.replaceState(null, '', url);
    }, [activeTab, state.kind]);

    // El botón atrás del navegador devuelve la pestaña anterior.
    useEffect(() => {
        const onPop = () => {
            const fromUrl = new URLSearchParams(window.location.search).get('tab');
            if (fromUrl) { userPickedTabRef.current = true; setActiveTab(fromUrl); }
        };
        window.addEventListener('popstate', onPop);
        return () => window.removeEventListener('popstate', onPop);
    }, []);

    const tabsNavRef = useHorizontalOverflow<HTMLDivElement>(visibleTabs);
    const [h2hExpanded, setH2hExpanded] = useState(false);

    // La pestana elegida se centra sola. Es la contracara del degrade del
    // borde: sin esto, en un telefono la activa puede quedar tapada por el
    // fundido y no se ve donde estas parado.
    useEffect(() => {
        const active = tabsNavRef.current?.querySelector<HTMLElement>('[aria-selected="true"]');
        if (!active) return;
        const reduced = typeof window.matchMedia === 'function'
            && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        active.scrollIntoView({ inline: 'center', block: 'nearest', behavior: reduced ? 'auto' : 'smooth' });
    }, [activeTab, tabsNavRef, visibleTabs]);

    // Flechas ← → mueven entre pestañas, Inicio/Fin van a los extremos: es lo
    // que un lector de pantalla anuncia y lo que espera quien no usa mouse.
    const onTabKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
        const keys = ['ArrowRight', 'ArrowLeft', 'Home', 'End'];
        if (!keys.includes(event.key)) return;
        event.preventDefault();
        const ids = visibleTabs.map((t) => t.id);
        const current = ids.indexOf(activeTab);
        const next =
            event.key === 'ArrowRight' ? (current + 1) % ids.length
            : event.key === 'ArrowLeft' ? (current - 1 + ids.length) % ids.length
            : event.key === 'Home' ? 0
            : ids.length - 1;
        selectTab(ids[next]);
        window.requestAnimationFrame(() => {
            tabsNavRef.current?.querySelector<HTMLElement>(`[data-tab-id="${ids[next]}"]`)?.focus();
        });
    };

    if (state.kind === 'loading') return (
        <div className={styles.page}>
            <div className={`${styles.appContainer} ${styles.skLoadingWrap}`}>
                <div className={`${styles.skeleton} ${styles.skBreadcrumb}`} />
                <div className={styles.skScoreboard}>
                    <div className={styles.skTeamCol}>
                        <div className={`${styles.skeleton} ${styles.skCrest}`} />
                        <div className={`${styles.skeleton} ${styles.skTeamName}`} />
                    </div>
                    <div className={styles.skCenterCol}>
                        <div className={`${styles.skeleton} ${styles.skStatus}`} />
                        <div className={`${styles.skeleton} ${styles.skScore}`} />
                    </div>
                    <div className={styles.skTeamCol}>
                        <div className={`${styles.skeleton} ${styles.skCrest}`} />
                        <div className={`${styles.skeleton} ${styles.skTeamName}`} />
                    </div>
                </div>
                <div className={styles.skTabs}>
                    {[0, 1, 2, 3, 4, 5].map(i => (
                        <div key={i} className={`${styles.skeleton} ${styles.skTab}`} />
                    ))}
                </div>
                <div className={styles.skContent}>
                    <div className={styles.skPanel}>
                        {[0, 1, 2, 3, 4].map(i => (
                            <div key={i} className={`${styles.skeleton} ${styles.skRow}`} />
                        ))}
                    </div>
                    <div className={styles.skPanel}>
                        {[0, 1, 2].map(i => (
                            <div key={i} className={`${styles.skeleton} ${styles.skRow}`} />
                        ))}
                    </div>
                </div>
            </div>
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
    // El deporte que viaja al export (de ahi sale la marca de la placa: Salida de
    // 22, Corner Corto o Grupo 22 TV). `sportId` viene de fuentes distintas — slug
    // propio, numero de FlashScore o nada —, asi que cuando falta lo deducimos del
    // proveedor del partido en vez de mandar undefined y caer en Grupo 22 TV.
    // Sin useMemo a proposito: arriba hay un return temprano para el estado de
    // error, y un hook debajo de el se ejecutaria salteado.
    const exportSportId = ((): string | number | undefined => {
        const raw = matchData?.sportId;
        if (raw != null && raw !== '') return raw as string | number;
        if (isRugbyExternal || isRugbyApiSportsSource) return 'rugby';
        if (isFihExternal || isFihSource) return 'field-hockey';
        return undefined;
    })();
    const adminMatchId = typeof matchData.id === 'string' && matchData.id.trim()
        ? matchData.id.trim()
        : id;
    // Global admins get the super console; tournament admins (canManageMatch
    // but not global) must use the /admin/torneo mirror — the /admin/super
    // layout is gated by requireGlobalAdminContext and would bounce them out
    // before the match control panel ever renders. Both routes mount the same
    // MatchCenterClient, and per-match tournament scope is enforced server-side.
    const adminMatchHref = isSuperAdminUser
        ? `/admin/super/partidos/${encodeURIComponent(adminMatchId)}`
        : `/admin/torneo/partidos/${encodeURIComponent(adminMatchId)}`;
    const firstPublicStatTabId = publicCompleteStatTabs[0]?.id ?? 'marcador';
    const effectivePublicStatTab = publicCompleteStatTabs.some((t) => t.id === publicStatsTab)
        ? publicStatsTab
        : firstPublicStatTabId;
    const activePublicStatTabContent = publicCompleteStatTabs.find((t) => t.id === effectivePublicStatTab);
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
    const topMatchLineupRating = getTopLineupRating([...displayHomeLineup, ...displayAwayLineup]);
    const hasAnyLineups = displayHomeLineup.length > 0 || displayAwayLineup.length > 0;

    // A quien se puede puntuar. Sale de la misma planilla que ya arma la
    // pestana de Jugadores, asi que la clave del voto y la de la tabla son la
    // misma: si manana cambia el origen de los jugadores, esto lo sigue solo.
    const rateablePlayers: RateablePlayer[] = (playerStatsTable?.rows ?? [])
        .filter((row) => row.team === 'home' || row.team === 'away')
        .map((row) => ({
            key: row.key,
            name: row.name,
            team: row.team as 'home' | 'away',
            number: row.number,
            position: row.position,
        }));

    // Antesala: el balance directo y dónde está cada uno en la tabla. Es lo
    // único que se sabe de verdad antes del pitazo.
    // Directos y forma, resueltos una sola vez. `is_direct` lo marca el servidor,
    // que es quien sabe de que consulta salio cada fila; el filtro por nombre
    // queda de respaldo para los proveedores externos que no lo mandan.
    const directH2HMatches = (Array.isArray(matchData.h2h) ? matchData.h2h : [])
        .filter((m: any) => m?.is_direct === true || isDirectH2HMatch(m, matchData.home, matchData.away));
    const homeFormMatches = (Array.isArray(matchData.h2h) ? matchData.h2h : [])
        .filter((m: any) => doesH2HMatchTeam(m, matchData.home)
            && !(m?.is_direct === true || isDirectH2HMatch(m, matchData.home, matchData.away)));
    const awayFormMatches = (Array.isArray(matchData.h2h) ? matchData.h2h : [])
        .filter((m: any) => doesH2HMatchTeam(m, matchData.away)
            && !(m?.is_direct === true || isDirectH2HMatch(m, matchData.home, matchData.away)));

    const previaH2H = (() => {
        const direct = directH2HMatches;
        let home = 0, away = 0, draw = 0;
        for (const m of direct) {
            const hs = Number(m.scores?.home ?? m.home_score ?? NaN);
            const as = Number(m.scores?.away ?? m.away_score ?? NaN);
            if (!Number.isFinite(hs) || !Number.isFinite(as)) continue;
            // El local del historial no es necesariamente el local de hoy.
            const winnerIsMatchHome = doesH2HSideMatchTeam(m, hs > as ? 'home' : 'away', matchData.home);
            if (hs === as) draw += 1;
            else if (winnerIsMatchHome) home += 1;
            else away += 1;
        }
        return { home, away, draw, total: home + away + draw };
    })();

    // La fila de tabla de cada club, en el orden local → visitante. La Previa
    // compara los dos lado a lado, así que el orden es el del marcador, no el
    // de la clasificación.
    const previaRowFor = (team: { name?: string; id?: string }) => {
        const rows = Array.isArray(matchData.standings) ? matchData.standings : [];
        const wanted = String(team?.name || '').trim().toLowerCase();
        const row = rows.find((r: any) =>
            String(r.name || r.team_name || r.TEAM_NAME || '').trim().toLowerCase() === wanted);
        if (!row) return null;
        const num = (v: unknown) => Number(v ?? 0) || 0;
        return {
            name: String(row.name || row.team_name || ''),
            rank: Number(row.rank ?? row.position ?? 0) || null,
            played: num(row.matches_played),
            wins: num(row.wins),
            draws: num(row.draws),
            losses: num(row.losses),
            pointsFor: num(row.points_for),
            pointsAgainst: num(row.points_against),
            diff: num(row.goal_difference),
            points: num(row.points),
            form: String(row.form || '').toUpperCase().replace(/[^WDLGEP]/g, '').slice(-5),
        };
    };
    const previaHome = previaRowFor(matchData.home);
    const previaAway = previaRowFor(matchData.away);
    const hasPreviaSeason = Boolean(previaHome || previaAway);
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
    // Penalties may sit at the top level (DB/FlashScore branches) or inside
    // `score` (ESPN bundle) — accept either so every provider renders the shootout.
    const penaltyScoreInput = {
        score: {
            home: typeof matchData.home?.score === 'number' ? matchData.home.score : null,
            away: typeof matchData.away?.score === 'number' ? matchData.away.score : null,
            penalties: matchData.penalties || matchData.score?.penalties || null,
        },
    };
    const publicPenaltyScore = hasMatchPenaltyShootout(penaltyScoreInput)
        ? getMatchPenaltyScore(penaltyScoreInput)
        : null;
    const motorsportTournamentHref = buildTournamentHref(matchData.tournamentId, matchData.tournamentSeason, matchData.tournament);
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
                        {motorsportTabs.map((tab) => (
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
                                        {motorsportTabs.map((tab) => (
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
                                    {motorsportTabs.map((tab) => (
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
                                <Link href={buildTournamentHref(matchData.tournamentId, matchData.tournamentSeason, matchData.tournament) || '#'} className={styles.breadcrumbItem} style={{ color: 'var(--color-accent, var(--accent))', textDecoration: 'none' }}>
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
                        {(isSuperAdminUser || canManageMatch) && !isExternalMatch && (
                            <ProtectedLink href={adminMatchHref} className={`${styles.btn} ${styles.btnPrimary}`}>
                                Editar partido
                            </ProtectedLink>
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
                        {(() => {
                            const homeVisual = getScoreboardParticipantVisual(matchData.home, matchData.sportId);
                            const awayVisual = getScoreboardParticipantVisual(matchData.away, matchData.sportId);
                            return (
                                <>
                        {/* Local */}
                        <div className={styles.teamCol}>
                            <Link href={buildTeamHref(matchData.home, matchData.sportId)} style={{ textDecoration: 'none' }}>
                                <div className={styles.crestWrapper}>
                                    <ScoreboardParticipantAvatar
                                        key={`home-${matchData.home.id || matchData.home.name}-${homeVisual.image}-${homeVisual.flagEmoji}`}
                                        imageSrc={homeVisual.image}
                                        flagEmoji={homeVisual.flagEmoji}
                                    />
                                </div>
                            </Link>
                            <div className={styles.teamInfo}>
                                <div className={styles.teamLabel}>Anfitrion</div>
                                <div className={styles.teamNameRow}>
                                    <Link href={buildTeamHref(matchData.home, matchData.sportId)} className={styles.teamNameLink}>
                                        <div className={styles.teamName} title={matchData.home.name}>{matchData.home.name}</div>
                                    </Link>
                                    {canFavoriteTeam(matchData.home) && (
                                        <FavoriteButton
                                            entityType="club"
                                            entityId={String(matchData.home.id)}
                                            size={18}
                                            className={styles.teamFavoriteButton}
                                            name={matchData.home.name}
                                            logoUrl={matchData.home.logo || null}
                                            typeLabel="Club"
                                        />
                                    )}
                                </div>
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
                                            homePenalties: publicPenaltyScore?.home ?? null,
                                            awayPenalties: publicPenaltyScore?.away ?? null,
                                            homeLogo: matchData.home.logo,
                                            awayLogo: matchData.away.logo,
                                            tournament: matchData.tournament,
                                            tournamentId: matchData.tournamentId,
                                            tournamentUrl: matchData.tournamentUrl,
                                            tournamentLogo: matchData.tournamentLogo,
                                            date: new Date(matchData.date).toLocaleDateString('es-AR', { timeZone: USER_TZ }),
                                            time: matchTimerText,
                                            kickoffAt: matchData.date,
                                            venue: matchData.venue,
                                            // De aca sale la marca de la placa: Salida de 22, Corner Corto o Grupo 22 TV.
                                            sport: exportSportId,
                                            stats: statsData || []
                                        }}
                                        className={styles.compactExport}
                                    />
                                </div>
                            )}
                              <div className={styles.scoreDisplay}>
                                 <div className={styles.scoreValue}>
                                     <div className={styles.scoreNum}>{matchData.home.score ?? '-'}</div>
                                     {publicPenaltyScore ? <div className={styles.scorePenalty}>({publicPenaltyScore.home})</div> : null}
                                 </div>
                                 <div className={styles.scoreSep}>:</div>
                                 <div className={styles.scoreValue}>
                                     <div className={styles.scoreNum}>{matchData.away.score ?? '-'}</div>
                                     {publicPenaltyScore ? <div className={styles.scorePenalty}>({publicPenaltyScore.away})</div> : null}
                                 </div>
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
                                    <ScoreboardParticipantAvatar
                                        key={`away-${matchData.away.id || matchData.away.name}-${awayVisual.image}-${awayVisual.flagEmoji}`}
                                        imageSrc={awayVisual.image}
                                        flagEmoji={awayVisual.flagEmoji}
                                    />
                                </div>
                            </Link>
                            <div className={styles.teamInfo}>
                                <div className={styles.teamLabel}>Visitante</div>
                                <div className={styles.teamNameRow}>
                                    <Link href={buildTeamHref(matchData.away, matchData.sportId)} className={styles.teamNameLink}>
                                        <div className={styles.teamName} title={matchData.away.name}>{matchData.away.name}</div>
                                    </Link>
                                    {canFavoriteTeam(matchData.away) && (
                                        <FavoriteButton
                                            entityType="club"
                                            entityId={String(matchData.away.id)}
                                            size={18}
                                            className={styles.teamFavoriteButton}
                                            name={matchData.away.name}
                                            logoUrl={matchData.away.logo || null}
                                            typeLabel="Club"
                                        />
                                    )}
                                </div>
                            </div>
                        </div>
                                </>
                            );
                        })()}
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

                {/* Layer 4: Tabs — se dibujan las que este partido puede llenar */}
                <nav className={styles.tabsNavWrap} aria-label="Secciones del partido">
                    {!state.secondaryReady && (
                        <div className={styles.tabsSkeleton} aria-hidden="true">
                            <span /><span /><span /><span />
                        </div>
                    )}
                    {state.secondaryReady && (
                    <div
                        className={styles.tabsNav}
                        role="tablist"
                        ref={tabsNavRef}
                        onKeyDown={onTabKeyDown}
                    >
                        {railTabs.map((tab) => {
                            const selected = activeTab === tab.id;
                            const pending = 'state' in tab && tab.state === 'pending';
                            return (
                                <button
                                    key={tab.id}
                                    type="button"
                                    role="tab"
                                    id={`match-tab-${tab.id}`}
                                    data-tab-id={tab.id}
                                    aria-selected={selected}
                                    aria-controls={`match-panel-${tab.id}`}
                                    tabIndex={selected ? 0 : -1}
                                    className={`${styles.tabItem} ${selected ? styles.active : ''}`}
                                    onClick={() => selectTab(tab.id)}
                                >
                                    {isNarrow && 'shortLabel' in tab ? tab.shortLabel : tab.label}
                                    {pending && <span className={styles.tabPending} aria-hidden="true" />}
                                </button>
                            );
                        })}

                    </div>
                    )}

                </nav>

                {/* El aside vive FUERA de la key: es del partido, no de la
                    pestaña. Con la key acá arriba se remontaba entero en cada
                    cambio y la votación volvía a pedir datos siempre. */}
                <main className={styles.tabContent}>
                    {!state.secondaryReady ? (
                        <section className={styles.panelBlock} aria-busy="true">
                            <div className={styles.skPanel}>
                                {[0, 1, 2, 3, 4].map((i) => (
                                    <div key={i} className={`${styles.skeleton} ${styles.skRow}`} />
                                ))}
                            </div>
                        </section>
                    ) : (
                    <section
                        key={activeTab}
                        id={`match-panel-${activeTab}`}
                        role="tabpanel"
                        aria-labelledby={`match-tab-${activeTab}`}
                        tabIndex={0}
                        className={styles.panelBlock}
                    >
                        {activeTab === 'previa' && (
                            <div className={styles.summaryView}>
                                {/* El voto abre la antesala: es lo único que el
                                    hincha puede hacer antes del pitazo. */}
                                {FAVORITES_ENABLED && (
                                    <div className={styles.previaVote}>
                                        <MatchWinnerVoteCard
                                            matchId={matchData.id || id}
                                            status={matchData.status}
                                            homeTeam={{ name: matchData.home.name, logo: matchData.home.logo }}
                                            awayTeam={{ name: matchData.away.name, logo: matchData.away.logo }}
                                        />
                                    </div>
                                )}

                                {previaH2H.total > 0 && (
                                    <div className={styles.previaBlock}>
                                        <div className={styles.previaHead}>Frente a frente</div>
                                        <div className={styles.previaBalance}>
                                            <div className={styles.previaSide}>
                                                <span className={`${styles.previaPill} ${styles.previaPillHome}`}>{previaH2H.home}</span>
                                                <span className={styles.previaSideName}>{matchData.home.name}</span>
                                            </div>
                                            <div className={styles.previaSide}>
                                                <span className={`${styles.previaPill} ${styles.previaPillDraw}`}>{previaH2H.draw}</span>
                                                <span className={styles.previaSideName}>Empates</span>
                                            </div>
                                            <div className={styles.previaSide}>
                                                <span className={`${styles.previaPill} ${styles.previaPillAway}`}>{previaH2H.away}</span>
                                                <span className={styles.previaSideName}>{matchData.away.name}</span>
                                            </div>
                                        </div>
                                        {/* La barra reparte el historial de un vistazo. */}
                                        <div className={styles.previaBar} role="img"
                                             aria-label={`${previaH2H.home} victorias de ${matchData.home.name}, ${previaH2H.draw} empates, ${previaH2H.away} victorias de ${matchData.away.name}`}>
                                            <span className={styles.previaBarHome} style={{ width: `${(previaH2H.home / previaH2H.total) * 100}%` }} />
                                            <span className={styles.previaBarDraw} style={{ width: `${(previaH2H.draw / previaH2H.total) * 100}%` }} />
                                            <span className={styles.previaBarAway} style={{ width: `${(previaH2H.away / previaH2H.total) * 100}%` }} />
                                        </div>
                                        <p className={styles.previaFoot}>
                                            {previaH2H.total === 1
                                                ? 'Se enfrentaron una vez.'
                                                : `Se enfrentaron ${previaH2H.total} veces.`}
                                        </p>
                                    </div>
                                )}

                                {hasPreviaSeason && (
                                    <div className={styles.previaBlock}>
                                        {/* No es "la temporada": estos numeros salen de la
                                            tabla de ESTE torneo. Un club puede jugar
                                            varios y el rotulo mentiria. */}
                                        <div className={styles.previaHead}>
                                            {matchData.tournament ? `Como llegan en ${matchData.tournament}` : 'Como llegan al torneo'}
                                        </div>

                                        <div className={styles.previaSeasonHead}>
                                            <span className={styles.previaSeasonClub}>{matchData.home.name}</span>
                                            <span />
                                            <span className={`${styles.previaSeasonClub} ${styles.previaSeasonClubRight}`}>{matchData.away.name}</span>
                                        </div>

                                        {/* `better` dice qué lado sale favorecido en cada
                                            renglón: 'hi' significa que gana el número más
                                            alto, 'lo' el más bajo (posición, perdidos, en
                                            contra). El ganador se resalta; si empatan, no
                                            se resalta ninguno. */}
                                        {([
                                            ['Posición', previaHome?.rank, previaAway?.rank, 'lo', (v: number) => `${v}.º`],
                                            ['Puntos', previaHome?.points, previaAway?.points, 'hi'],
                                            ['Jugados', previaHome?.played, previaAway?.played, null],
                                            ['Ganados', previaHome?.wins, previaAway?.wins, 'hi'],
                                            ['Empatados', previaHome?.draws, previaAway?.draws, null],
                                            ['Perdidos', previaHome?.losses, previaAway?.losses, 'lo'],
                                            ['Puntos por partido', perGame(previaHome?.pointsFor, previaHome?.played), perGame(previaAway?.pointsFor, previaAway?.played), 'hi'],
                                            ['Recibidos por partido', perGame(previaHome?.pointsAgainst, previaHome?.played), perGame(previaAway?.pointsAgainst, previaAway?.played), 'lo'],
                                            ['Diferencia', previaHome?.diff, previaAway?.diff, 'hi', formatSigned],
                                        ] as Array<[string, number | null | undefined, number | null | undefined, 'hi' | 'lo' | null, ((v: number) => string)?]>)
                                            .map(([label, h, a, better, fmt]) => {
                                                const show = (v: number | null | undefined) =>
                                                    typeof v === 'number' && Number.isFinite(v) ? (fmt ? fmt(v) : String(v)) : '-';
                                                const comparable = typeof h === 'number' && typeof a === 'number' && h !== a && better;
                                                const homeWins = comparable && (better === 'hi' ? h > a : h < a);
                                                const awayWins = comparable && (better === 'hi' ? a > h : a < h);
                                                return (
                                                    <div key={label} className={styles.previaStatRow}>
                                                        <span className={`${styles.previaStatVal} ${homeWins ? styles.previaStatBest : ''}`}>{show(h)}</span>
                                                        <span className={styles.previaStatLabel}>{label}</span>
                                                        <span className={`${styles.previaStatVal} ${awayWins ? styles.previaStatBest : ''}`}>{show(a)}</span>
                                                    </div>
                                                );
                                            })}

                                        {(previaHome?.form || previaAway?.form) && (
                                            <div className={styles.previaStatRow}>
                                                <span className={styles.previaFormCell}>{renderForm(previaHome?.form, styles)}</span>
                                                <span className={styles.previaStatLabel}>Racha</span>
                                                <span className={styles.previaFormCell}>{renderForm(previaAway?.form, styles)}</span>
                                            </div>
                                        )}
                                    </div>
                                )}

                                <p className={styles.previaHint}>
                                    Cuando arranque el partido esta pestaña deja lugar a la cronología.
                                </p>
                            </div>
                        )}

                        {activeTab === 'summary' && (
                            <div className={styles.summaryView}>
                                <div className={styles.panelTitle}>Visión General</div>
                                {statsData.length > 0 ? (
                                    statsData.slice(0, 8).map((stat, i) => {
                                        const hVal = parseFloat(String(stat.home).replace(/[^0-9.]/g, '')) || 0;
                                        const aVal = parseFloat(String(stat.away).replace(/[^0-9.]/g, '')) || 0;
                                        const total = hVal + aVal;
                                        // Sin datos no hay reparto: una barra al 50/50 dibuja un
                                        // empate que nadie jugó. Se deja la pista vacía.
                                        const hPct = total > 0 ? (hVal / total) * 100 : 0;
                                        const aPct = total > 0 ? (aVal / total) * 100 : 0;

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
                                                    <div className={styles.eventMinuteBadge}>{`${evt.time}'`}</div>
                                                    <div className={`${styles.eventSide} ${evt.team === 'home' ? styles.eventLeft : styles.eventRight}`}>
                                                        <div className={styles.eventIcon}>•</div>
                                                        <div className={styles.eventDetail}>
                                                            <div className={styles.eventPlayer} style={{ fontSize: '12px' }}>{evt.player}</div>
                                                            <div className={styles.eventSubInfo}>{publicEventTypeDisplay(evt)}</div>
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
                            <MatchTimeline
                                events={eventsData}
                                homeTeam={timelineHomeTeam}
                                awayTeam={timelineAwayTeam}
                                sportId={matchData.sportId}
                            />
                        )}

                        {activeTab === 'commentary' && (
                            <div className={styles.commentaryList}>
                                <div className={styles.panelTitle}>Narración del Encuentro</div>
                                {state.commentaryData && state.commentaryData.length > 0 ? (
                                    state.commentaryData.map((comm: any, i: number) => (
                                        <div key={i} className={styles.commentaryItem}>
                                            <div className={styles.commentaryTime}>{`${comm.time || comm.MINUTE || ''}'`}</div>
                                            <div className={styles.commentaryText}>{comm.text || comm.COMMENT || ''}</div>
                                        </div>
                                    ))
                                ) : (
                                    <div className={styles.emptyState}>
                                        <svg className={styles.emptyIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                            <rect x="9" y="2" width="6" height="11" rx="3" />
                                            <path d="M5 10a7 7 0 0 0 14 0M12 17v5M8 22h8" />
                                        </svg>
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
                                            {isSuperAdminUser && (
                                                <button
                                                    type="button"
                                                    onClick={() => setLineupModalOpen(true)}
                                                    className={styles.lineupsExportAction}
                                                    style={{
                                                        padding: '8px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                                                        background: 'transparent',
                                                        border: '1px solid var(--accent)',
                                                        color: 'var(--accent)', cursor: 'pointer',
                                                        textTransform: 'uppercase', letterSpacing: '0.06em',
                                                    }}
                                                    aria-label="Editar puntajes de la alineación"
                                                >
                                                    Editar puntajes
                                                </button>
                                            )}
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
                                                        const pBadges = getDisplayLineupBadges(p, {
                                                            isTopRated: topMatchLineupRating !== null && p.rating === topMatchLineupRating,
                                                        });
                                                        return (
                                                            <div key={`home-starter-${i}`} className={styles.playerItem}>
                                                                <span className={styles.playerMain}>
                                                                    <span className={styles.playerNumber}>{pNumber}</span>
                                                                    {pId ? <Link href={`/players/${pId}`} style={{ color: 'inherit', textDecoration: 'none' }}>{pName}</Link> : pName}
                                                                </span>
                                                                <span style={{ display: 'flex', gap: '6px', alignItems: 'center', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                                                                    {pBadges.map((badge) => (
                                                                        <span key={`${badge.kind}-${badge.label}`} className={badge.kind === 'rating' ? styles.playerRatingMeta : styles.playerMeta}>
                                                                            {badge.label}
                                                                            {badge.kind === 'rating' && badge.isTopRated ? <span aria-label="Mejor puntuación" title="Mejor puntuación del partido" style={{ marginLeft: '4px' }}>⭐</span> : null}
                                                                        </span>
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
                                                            const pBadges = getDisplayLineupBadges(p, {
                                                                isTopRated: topMatchLineupRating !== null && p.rating === topMatchLineupRating,
                                                            });
                                                            return (
                                                                <div key={`home-finisher-${i}`} className={styles.playerItem}>
                                                                    <span className={styles.playerMain}>
                                                                        <span className={styles.playerNumber}>{pNumber}</span>
                                                                        {pId ? <Link href={`/players/${pId}`} style={{ color: 'inherit', textDecoration: 'none' }}>{pName}</Link> : pName}
                                                                    </span>
                                                                    <span style={{ display: 'flex', gap: '6px', alignItems: 'center', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                                                                        {pBadges.map((badge) => (
                                                                            <span key={`${badge.kind}-${badge.label}`} className={badge.kind === 'rating' ? styles.playerRatingMeta : styles.playerMeta}>
                                                                                {badge.label}
                                                                                {badge.kind === 'rating' && badge.isTopRated ? <span aria-label="Mejor puntuación" title="Mejor puntuación del partido" style={{ marginLeft: '4px' }}>⭐</span> : null}
                                                                            </span>
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
                                                        const pBadges = getDisplayLineupBadges(p, {
                                                            isTopRated: topMatchLineupRating !== null && p.rating === topMatchLineupRating,
                                                        });
                                                        return (
                                                            <div key={`away-starter-${i}`} className={styles.playerItem}>
                                                                <span className={styles.playerMain}>
                                                                    <span className={styles.playerNumber}>{pNumber}</span>
                                                                    {pId ? <Link href={`/players/${pId}`} style={{ color: 'inherit', textDecoration: 'none' }}>{pName}</Link> : pName}
                                                                </span>
                                                                <span style={{ display: 'flex', gap: '6px', alignItems: 'center', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                                                                    {pBadges.map((badge) => (
                                                                        <span key={`${badge.kind}-${badge.label}`} className={badge.kind === 'rating' ? styles.playerRatingMeta : styles.playerMeta}>
                                                                            {badge.label}
                                                                            {badge.kind === 'rating' && badge.isTopRated ? <span aria-label="Mejor puntuación" title="Mejor puntuación del partido" style={{ marginLeft: '4px' }}>⭐</span> : null}
                                                                        </span>
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
                                                            const pBadges = getDisplayLineupBadges(p, {
                                                                isTopRated: topMatchLineupRating !== null && p.rating === topMatchLineupRating,
                                                            });
                                                            return (
                                                                <div key={`away-finisher-${i}`} className={styles.playerItem}>
                                                                    <span className={styles.playerMain}>
                                                                        <span className={styles.playerNumber}>{pNumber}</span>
                                                                        {pId ? <Link href={`/players/${pId}`} style={{ color: 'inherit', textDecoration: 'none' }}>{pName}</Link> : pName}
                                                                    </span>
                                                                    <span style={{ display: 'flex', gap: '6px', alignItems: 'center', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                                                                        {pBadges.map((badge) => (
                                                                            <span key={`${badge.kind}-${badge.label}`} className={badge.kind === 'rating' ? styles.playerRatingMeta : styles.playerMeta}>
                                                                                {badge.label}
                                                                                {badge.kind === 'rating' && badge.isTopRated ? <span aria-label="Mejor puntuación" title="Mejor puntuación del partido" style={{ marginLeft: '4px' }}>⭐</span> : null}
                                                                            </span>
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
                                        <svg className={styles.emptyIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                            <rect x="4" y="3" width="16" height="18" rx="2" />
                                            <path d="M8 8h8M8 12h8M8 16h4" />
                                        </svg>
                                        <p className={styles.placeholderText} style={{ fontSize: '16px', fontWeight: '600' }}>Todavía no están los planteles</p>
                                        <p style={{ fontSize: '13px', opacity: 0.6 }}>
                                            {toMatchStatusKind(matchData.status) === 'final'
                                                ? 'Los clubes no cargaron la formación de este partido.'
                                                : 'Los clubes las confirman cerca del inicio. Volvé más cerca del horario.'}
                                        </p>
                                        {isSuperAdminUser && (
                                            <button
                                                type="button"
                                                onClick={() => setLineupModalOpen(true)}
                                                style={{
                                                    marginTop: 16,
                                                    padding: '10px 18px', borderRadius: 8,
                                                    fontSize: 12, fontWeight: 700,
                                                    background: 'transparent',
                                                    border: '1px solid var(--accent)',
                                                    color: 'var(--accent)', cursor: 'pointer',
                                                    textTransform: 'uppercase', letterSpacing: '0.06em',
                                                }}
                                                aria-label="Crear alineación y puntajes"
                                            >
                                                Cargar alineación
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* La planilla del proveedor manda sobre la derivada de
                            los eventos: en hockey trae la efectividad de corner
                            corto, que no se puede reconstruir contando goles. */}
                        {activeTab === 'stats' && (isEspnSoccerSource || isFihSource) && (
                            <div className={styles.publicStatsPanel}>
                                <div className={styles.panelTitle}>Estadísticas del partido</div>
                                {statsData.length === 0 ? (
                                    <p className={styles.placeholderText}>No hay estadísticas disponibles para este partido.</p>
                                ) : (
                                    <div className={styles.publicStatsSectionGrid}>
                                        <section className={styles.publicStatsSection}>
                                            <div className={styles.publicStatsSectionHeader}>
                                                <h5>{matchData.home?.name || 'Local'} vs {matchData.away?.name || 'Visitante'}</h5>
                                                <span>{statsData.length}</span>
                                            </div>
                                            <div className={styles.publicStatsRows}>
                                                {statsData.map((stat: any, i: number) => {
                                                    const hStr = String(stat.home ?? '');
                                                    const aStr = String(stat.away ?? '');
                                                    const hVal = parseFloat(hStr.replace(/[^0-9.]/g, '')) || 0;
                                                    const aVal = parseFloat(aStr.replace(/[^0-9.]/g, '')) || 0;
                                                    const isPercent = hStr.includes('%') || aStr.includes('%');
                                                    let hPct: number;
                                                    let aPct: number;
                                                    if (isPercent) {
                                                        hPct = Math.min(100, hVal);
                                                        aPct = Math.min(100, aVal);
                                                    } else {
                                                        const total = hVal + aVal;
                                                        hPct = total > 0 ? (hVal / total) * 100 : 0;
                                                        aPct = total > 0 ? (aVal / total) * 100 : 0;
                                                    }
                                                    return (
                                                        <div className={styles.publicStatsRow} key={`${stat.label || stat.type}-${i}`}>
                                                            <strong className={`${styles.publicStatsRowValue} ${styles.publicStatsRowValueHome}`}>{hStr || '—'}</strong>
                                                            <div className={`${styles.publicStatsRowBar} ${styles.publicStatsRowBarHome}`} aria-hidden="true">
                                                                <span style={{ width: `${hPct}%` }} />
                                                            </div>
                                                            <span className={styles.publicStatsRowLabel}>{stat.label || stat.type}</span>
                                                            <div className={`${styles.publicStatsRowBar} ${styles.publicStatsRowBarAway}`} aria-hidden="true">
                                                                <span style={{ width: `${aPct}%` }} />
                                                            </div>
                                                            <strong className={`${styles.publicStatsRowValue} ${styles.publicStatsRowValueAway}`}>{aStr || '—'}</strong>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </section>
                                    </div>
                                )}
                            </div>
                        )}

                        {activeTab === 'stats' && !isEspnSoccerSource && !isFihSource && (
                            <div className={styles.publicStatsPanel}>
                                <div className={styles.panelTitle}>Estadísticas completas</div>
                                {publicCompleteStatTabs.length === 0 ? (
                                    <p className={styles.placeholderText}>No hay métricas para mostrar con los eventos actuales.</p>
                                ) : (
                                    <>
                                        <div className={styles.publicStatsTabs} role="tablist" aria-label="Tipos de estadísticas">
                                            {publicCompleteStatTabs.map((tab) => (
                                                <button
                                                    key={tab.id}
                                                    type="button"
                                                    role="tab"
                                                    aria-selected={effectivePublicStatTab === tab.id}
                                                    className={`${styles.publicStatsTab}${effectivePublicStatTab === tab.id ? ` ${styles.publicStatsTabActive}` : ''}`}
                                                    onClick={() => setPublicStatsTab(tab.id)}
                                                >
                                                    {tab.label}
                                                </button>
                                            ))}
                                        </div>
                                        <div className={styles.publicStatsSectionGrid}>
                                            {(activePublicStatTabContent?.sections ?? []).map((section) => (
                                                <section className={styles.publicStatsSection} key={`${effectivePublicStatTab}-${section.title}`}>
                                                    <div className={styles.publicStatsSectionHeader}>
                                                        <h5>{section.title}</h5>
                                                        <span>{section.rows.length}</span>
                                                    </div>
                                                    <div className={styles.publicStatsRows}>
                                                        {section.rows.map((row) => {
                                                            if (row.valueKind === 'percent') {
                                                                const h = row.home;
                                                                const a = row.away;
                                                                const hLabel = h < 0 ? '—' : `${h.toFixed(1)}%`;
                                                                const aLabel = a < 0 ? '—' : `${a.toFixed(1)}%`;
                                                                return (
                                                                    <div
                                                                        className={`${styles.publicStatsRow}${row.accent ? ` ${styles.publicStatsRowAccent}` : ''}`}
                                                                        key={row.key}
                                                                    >
                                                                        <strong className={`${styles.publicStatsRowValue} ${styles.publicStatsRowValueHome}`}>{hLabel}</strong>
                                                                        <div className={`${styles.publicStatsRowBar} ${styles.publicStatsRowBarHome}`} aria-hidden="true">
                                                                            <span style={{ width: `${h < 0 ? 0 : Math.min(100, h)}%` }} />
                                                                        </div>
                                                                        <span className={styles.publicStatsRowLabel} title={row.tooltip}>{row.label}</span>
                                                                        <div className={`${styles.publicStatsRowBar} ${styles.publicStatsRowBarAway}`} aria-hidden="true">
                                                                            <span style={{ width: `${a < 0 ? 0 : Math.min(100, a)}%` }} />
                                                                        </div>
                                                                        <strong className={`${styles.publicStatsRowValue} ${styles.publicStatsRowValueAway}`}>{aLabel}</strong>
                                                                    </div>
                                                                );
                                                            }
                                                            const total = row.home + row.away;
                                                            const homePct = total > 0 ? (row.home / total) * 100 : 0;
                                                            const awayPct = total > 0 ? (row.away / total) * 100 : 0;
                                                            return (
                                                                <div
                                                                    className={`${styles.publicStatsRow}${row.accent ? ` ${styles.publicStatsRowAccent}` : ''}`}
                                                                    key={row.key}
                                                                >
                                                                    <strong className={`${styles.publicStatsRowValue} ${styles.publicStatsRowValueHome}`}>{row.home}</strong>
                                                                    <div className={`${styles.publicStatsRowBar} ${styles.publicStatsRowBarHome}`} aria-hidden="true">
                                                                        <span style={{ width: `${homePct}%` }} />
                                                                    </div>
                                                                    <span className={styles.publicStatsRowLabel} title={row.tooltip}>{row.label}</span>
                                                                    <div className={`${styles.publicStatsRowBar} ${styles.publicStatsRowBarAway}`} aria-hidden="true">
                                                                        <span style={{ width: `${awayPct}%` }} />
                                                                    </div>
                                                                    <strong className={`${styles.publicStatsRowValue} ${styles.publicStatsRowValueAway}`}>{row.away}</strong>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </section>
                                            ))}
                                        </div>
                                    </>
                                )}
                            </div>
                        )}

                        {activeTab === 'h2h' && (
                            <div className={styles.h2hView}>
                                <div className={styles.panelTitle}>Cara a cara</div>

                                {previaH2H.total > 0 && (
                                    <>
                                        <div className={styles.previaBalance}>
                                            <div className={styles.previaSide}>
                                                <span className={`${styles.previaPill} ${styles.previaPillHome}`}>{previaH2H.home}</span>
                                                <span className={styles.previaSideName}>{matchData.home.name}</span>
                                            </div>
                                            <div className={styles.previaSide}>
                                                <span className={`${styles.previaPill} ${styles.previaPillDraw}`}>{previaH2H.draw}</span>
                                                <span className={styles.previaSideName}>Empates</span>
                                            </div>
                                            <div className={styles.previaSide}>
                                                <span className={`${styles.previaPill} ${styles.previaPillAway}`}>{previaH2H.away}</span>
                                                <span className={styles.previaSideName}>{matchData.away.name}</span>
                                            </div>
                                        </div>
                                        <div
                                            className={styles.previaBar}
                                            role="img"
                                            aria-label={`${previaH2H.home} victorias de ${matchData.home.name}, ${previaH2H.draw} empates, ${previaH2H.away} victorias de ${matchData.away.name}`}
                                        >
                                            <span className={styles.previaBarHome} style={{ width: `${(previaH2H.home / previaH2H.total) * 100}%` }} />
                                            <span className={styles.previaBarDraw} style={{ width: `${(previaH2H.draw / previaH2H.total) * 100}%` }} />
                                            <span className={styles.previaBarAway} style={{ width: `${(previaH2H.away / previaH2H.total) * 100}%` }} />
                                        </div>
                                        <p className={styles.h2hCount}>
                                            {previaH2H.total} {previaH2H.total === 1 ? 'enfrentamiento' : 'enfrentamientos'} en el historial
                                        </p>
                                    </>
                                )}

                                {/* La lista va a todo el ancho, una fila por partido:
                                    club, escudo, marcador, escudo, club. En tres
                                    columnas angostas habia que reconocer al rival por
                                    el escudo porque el nombre no entraba. */}
                                {directH2HMatches.length > 0 && (
                                    <ol className={styles.h2hFeed}>
                                        {(h2hExpanded ? directH2HMatches : directH2HMatches.slice(0, 10)).map((m: any, i: number) => {
                                            const hs = Number(m.scores?.home);
                                            const as = Number(m.scores?.away);
                                            const homeWon = Number.isFinite(hs) && Number.isFinite(as) && hs > as;
                                            const awayWon = Number.isFinite(hs) && Number.isFinite(as) && as > hs;
                                            const date = m.timestamp
                                                ? new Date(m.timestamp * 1000).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric', timeZone: USER_TZ })
                                                : (m.date || '');
                                            return (
                                                <li key={m.match_id || i} className={styles.h2hFeedItem}>
                                                    <div className={styles.h2hFeedMeta}>
                                                        <span>{date}</span>
                                                        {m.tournament_name && <span className={styles.h2hFeedComp}>{m.tournament_name}</span>}
                                                    </div>
                                                    <div className={styles.h2hFeedRow}>
                                                        <span className={`${styles.h2hFeedTeam} ${homeWon ? styles.h2hFeedWinner : ''}`}>
                                                            {m.home_team?.name}
                                                        </span>
                                                        {m.home_team?.logo
                                                            ? <img src={m.home_team.logo} alt="" className={styles.h2hFeedCrest} loading="lazy" />
                                                            : <span className={styles.h2hFeedCrestFallback} />}
                                                        <span className={styles.h2hFeedScore}>{m.scores?.home} - {m.scores?.away}</span>
                                                        {m.away_team?.logo
                                                            ? <img src={m.away_team.logo} alt="" className={styles.h2hFeedCrest} loading="lazy" />
                                                            : <span className={styles.h2hFeedCrestFallback} />}
                                                        <span className={`${styles.h2hFeedTeam} ${styles.h2hFeedTeamRight} ${awayWon ? styles.h2hFeedWinner : ''}`}>
                                                            {m.away_team?.name}
                                                        </span>
                                                    </div>
                                                </li>
                                            );
                                        })}
                                    </ol>
                                )}

                                {directH2HMatches.length > 10 && (
                                    <button
                                        type="button"
                                        className={styles.h2hMore}
                                        onClick={() => setH2hExpanded((open) => !open)}
                                    >
                                        {h2hExpanded ? 'Ver menos' : `Ver los ${directH2HMatches.length} partidos`}
                                    </button>
                                )}

                                {/* La forma de cada uno queda debajo: es contexto, no el
                                    tema de esta pestana. */}
                                {(homeFormMatches.length > 0 || awayFormMatches.length > 0) && (
                                    <div className={styles.h2hFormSection}>
                                        <div className={styles.h2hGrid2}>
                                            <div className={styles.h2hColumn}>
                                                <div className={styles.h2hColTitle}>Ultimos de {matchData.home.name}</div>
                                                <div className={styles.h2hList}>
                                                    {homeFormMatches.slice(0, 5).map((m: any, i: number) => (
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
                                            <div className={styles.h2hColumn}>
                                                <div className={styles.h2hColTitle}>Ultimos de {matchData.away.name}</div>
                                                <div className={styles.h2hList}>
                                                    {awayFormMatches.slice(0, 5).map((m: any, i: number) => (
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
                                    </div>
                                )}

                                {(!matchData.h2h || matchData.h2h.length === 0) && (
                                    <p className={styles.placeholderText}>Historial no disponible.</p>
                                )}
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

                                {/* Standings Table — agrupa por group_name si el torneo es por grupos */}
                                {matchData.standings && matchData.standings.length > 0 && (() => {
                                    const groupNames = Array.from(new Set(
                                        matchData.standings.map((r: any) => r.group_name || r.GROUP_NAME || r.group?.name || null).filter(Boolean)
                                    )) as string[];
                                    const groups = groupNames.length > 0
                                        ? groupNames.map((name) => ({
                                            name,
                                            rows: matchData.standings.filter((r: any) => (r.group_name || r.GROUP_NAME || r.group?.name) === name),
                                        }))
                                        : [{ name: null as string | null, rows: matchData.standings.slice(0, 20) }];

                                    return (
                                        <>
                                            <div className={styles.panelTitle} style={matchData.draw?.length > 0 ? { marginTop: '32px' } : {}}>Tabla de Posiciones</div>
                                            {groups.map((group, gi) => (
                                                <div key={`${group.name || 'all'}-${gi}`} style={gi > 0 ? { marginTop: 24 } : {}}>
                                                    {group.name && (
                                                        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
                                                            {group.name}
                                                        </div>
                                                    )}
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
                                                            {group.rows.map((row: any, i: number) => {
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
                                                </div>
                                            ))}
                                        </>
                                    );
                                })()}

                                {(!matchData.standings || matchData.standings.length === 0) && (!matchData.draw || matchData.draw.length === 0) && (
                                    <p className={styles.placeholderText}>Clasificación no disponible.</p>
                                )}
                            </div>
                        )}

                        {activeTab === 'players' && (
                            <>
                                <PlayerStatsPanel
                                    tableData={playerStatsTable}
                                    localPlayerRows={state.localPlayerRows}
                                    playerStats={state.playerStats}
                                    homeName={matchData.home?.name || 'Local'}
                                    awayName={matchData.away?.name || 'Visitante'}
                                />
                                {rateablePlayers.length > 0 && (
                                    <div className={styles.peopleRatingsWrap}>
                                        <PeopleRatingsPanel
                                            matchId={matchData.id || id}
                                            players={rateablePlayers}
                                            homeName={matchData.home?.name || 'Local'}
                                            awayName={matchData.away?.name || 'Visitante'}
                                            canVote={Boolean(user?.id)}
                                        />
                                    </div>
                                )}
                            </>
                        )}
                    </section>
                    )}

                    <aside className={styles.sidebarColumn}>
                        {/* En la Previa el voto ya abre el panel, arriba de todo:
                            repetirlo acá seria pedir lo mismo dos veces en la
                            misma pantalla. */}
                        {FAVORITES_ENABLED && activeTab !== 'previa' && (
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
                        )}

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
                                    homePenalties: publicPenaltyScore?.home ?? null,
                                    awayPenalties: publicPenaltyScore?.away ?? null,
                                    homeLogo: matchData.home.logo,
                                    awayLogo: matchData.away.logo,
                                    tournament: matchData.tournament,
                                    tournamentId: matchData.tournamentId,
                                    tournamentUrl: matchData.tournamentUrl,
                                    tournamentLogo: matchData.tournamentLogo,
                                    date: new Date(matchData.date).toLocaleDateString('es-AR', { timeZone: USER_TZ }),
                                    time: matchTimerText,
                                    kickoffAt: matchData.date,
                                    sport: exportSportId,
                                    stats: statsData
                                }}
                                filename={`reporte-${matchData.home.name}-${matchData.away.name}`}
                            />
                        </section>
                    </aside>
                </main>
            </div>

            {isSuperAdminUser && (
                <LineupRatingEditorModal
                    open={lineupModalOpen}
                    matchId={adminMatchId}
                    homeTeamName={matchData.home.name}
                    awayTeamName={matchData.away.name}
                    homePlayers={displayHomeLineup}
                    awayPlayers={displayAwayLineup}
                    onClose={() => setLineupModalOpen(false)}
                    onSaved={() => setLineupReloadKey((k) => k + 1)}
                />
            )}
        </div>
    );
}
