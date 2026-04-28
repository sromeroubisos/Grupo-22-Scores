'use client';

import React, { useEffect, useMemo, useState } from 'react';
import styles from './page.module.css';
import {
    isGoalKickAttemptEvent,
    isGoalKickMade,
    parseKickMetersFromDetail,
    isContestWonDetail,
    isContestLostDetail,
} from '@/lib/matchEventStats';

type StatsSubTab = 'teams' | 'players';
type TeamStatsView = 'summary' | 'attack' | 'defense';
type SortDirection = 'asc' | 'desc';
type StatColumnTone = 'attack' | 'defense' | 'danger' | 'muted';
type StatColumnFormat = 'number' | 'decimal' | 'percent' | 'signed';

type StatColumn = {
    id: string;
    label: string;
    title?: string;
    accent?: boolean;
    tone?: StatColumnTone;
    format?: StatColumnFormat;
};

interface TournamentPublicStatsProps {
    matches: any[];
    topScorers?: any[];
}

const MOBILE_BREAKPOINT = 640;

const TEAM_STATS_VIEW_OPTIONS: Array<{ id: TeamStatsView; label: string; description: string }> = [
    { id: 'summary', label: 'Resumen', description: 'Forma, puntos y balance general' },
    { id: 'attack', label: 'Ataque', description: 'Producción ofensiva del equipo' },
    { id: 'defense', label: 'Defensa', description: 'Contención, recuperación y disciplina' },
];

const TEAM_DEFAULT_SORT: Record<TeamStatsView, { key: string; direction: SortDirection }> = {
    summary: { key: 'points_for', direction: 'desc' },
    attack: { key: 'points_for', direction: 'desc' },
    defense: { key: 'defense_index', direction: 'desc' },
};

const TEAM_COLUMNS: Record<TeamStatsView, StatColumn[]> = {
    summary: [
        { id: 'entity', label: 'Equipo' },
        { id: 'matches_played', label: 'PJ', title: 'Partidos jugados' },
        { id: 'wins', label: 'PG', title: 'Partidos ganados' },
        { id: 'draws', label: 'PE', title: 'Partidos empatados' },
        { id: 'losses', label: 'PP', title: 'Partidos perdidos' },
        { id: 'points_for', label: 'PTS', title: 'Puntos a favor', accent: true, tone: 'attack' },
        { id: 'points_against', label: 'PC', title: 'Puntos en contra', tone: 'defense' },
        { id: 'points_difference', label: 'DIF', title: 'Diferencia de puntos', accent: true, format: 'signed' },
        { id: 'tries_scored', label: 'TRIES+', title: 'Tries anotados', tone: 'attack' },
        { id: 'tries_conceded', label: 'TRIES-', title: 'Tries recibidos', tone: 'defense' },
        { id: 'tackles_made', label: 'TACK', title: 'Tackles realizados', tone: 'defense' },
    ],
    attack: [
        { id: 'entity', label: 'Equipo' },
        { id: 'matches_played', label: 'PJ', title: 'Partidos jugados' },
        { id: 'points_for', label: 'PTS', title: 'Puntos a favor', accent: true, tone: 'attack' },
        { id: 'points_for_per_match', label: 'PTS/PJ', title: 'Puntos a favor por partido', format: 'decimal', tone: 'attack' },
        { id: 'tries_scored', label: 'TRIES', title: 'Tries anotados', accent: true, tone: 'attack' },
        { id: 'tries_scored_per_match', label: 'TR/PJ', title: 'Tries anotados por partido', format: 'decimal', tone: 'attack' },
        { id: 'conversions', label: 'CONV', title: 'Conversiones convertidas', tone: 'attack' },
        { id: 'conversion_rate', label: 'CONV%', title: 'Conversiones convertidas sobre intentos', format: 'percent', tone: 'attack' },
        { id: 'penalty_goals', label: 'PEN', title: 'Penales a los palos convertidos', tone: 'attack' },
        { id: 'drop_goals', label: 'DROP', title: 'Drops convertidos', tone: 'attack' },
        { id: 'entries_22', label: '22M', title: 'Entradas en 22 metros', tone: 'attack' },
        { id: 'kick_meters', label: 'M PAT', title: 'Metros de patada en juego', tone: 'attack' },
    ],
    defense: [
        { id: 'entity', label: 'Equipo' },
        { id: 'matches_played', label: 'PJ', title: 'Partidos jugados' },
        { id: 'points_against', label: 'PC', title: 'Puntos en contra', accent: true, tone: 'defense' },
        { id: 'points_against_per_match', label: 'PC/PJ', title: 'Puntos en contra por partido', format: 'decimal', tone: 'defense' },
        { id: 'points_difference', label: 'DIF', title: 'Diferencia de puntos', format: 'signed' },
        { id: 'tries_conceded', label: 'TRIES C', title: 'Tries concedidos', tone: 'defense' },
        { id: 'tries_conceded_per_match', label: 'TC/PJ', title: 'Tries concedidos por partido', format: 'decimal', tone: 'defense' },
        { id: 'tackles_made', label: 'TACK', title: 'Tackles realizados', accent: true, tone: 'defense' },
        { id: 'defense_index', label: 'DEF IDX', title: 'Índice defensivo: tackles + recuperaciones - puntos y disciplina concedida', format: 'decimal', accent: true, tone: 'defense' },
        { id: 'turnovers_won', label: 'REC', title: 'Recuperaciones / turnovers ganados', tone: 'defense' },
        { id: 'penalties_conceded', label: 'PEN C', title: 'Penales cometidos', tone: 'danger' },
        { id: 'yellow_cards', label: 'TA', title: 'Tarjetas amarillas', tone: 'danger' },
        { id: 'red_cards', label: 'TR', title: 'Tarjetas rojas', tone: 'danger' },
    ],
};

const PLAYER_COLUMNS: StatColumn[] = [
    { id: 'entity', label: 'Jugador' },
    { id: 'secondary', label: 'Equipo' },
    { id: 'matches_played', label: 'PJ', title: 'Partidos jugados' },
    { id: 'points', label: 'PTS', title: 'Puntos', accent: true, tone: 'attack' },
    { id: 'tries', label: 'TRIES', title: 'Tries', accent: true, tone: 'attack' },
    { id: 'conversions', label: 'CONV', title: 'Conversiones', tone: 'attack' },
    { id: 'penalty_goals', label: 'PEN', title: 'Penales a los palos', tone: 'attack' },
    { id: 'tackles', label: 'TACK', title: 'Tackles', tone: 'defense' },
    { id: 'kick_meters', label: 'M PAT', title: 'Metros de patada en juego' },
    { id: 'yellow_cards', label: 'TA', title: 'Tarjetas amarillas', tone: 'danger' },
    { id: 'red_cards', label: 'TR', title: 'Tarjetas rojas', tone: 'danger' },
];

const n = (value: unknown) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
};

const t = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

const fmt = (value: unknown, digits = 0) => {
    const num = Number(value);
    if (!Number.isFinite(num)) return '—';
    return num.toLocaleString('es-AR', { minimumFractionDigits: digits, maximumFractionDigits: digits });
};

const perMatch = (value: unknown, played: unknown) => {
    const matchesPlayed = n(played);
    return matchesPlayed > 0 ? n(value) / matchesPlayed : 0;
};

const percentage = (value: unknown, total: unknown) => {
    const denominator = n(total);
    return denominator > 0 ? (n(value) / denominator) * 100 : 0;
};

const initials = (value: string) => {
    const parts = value.split(/\s+/).filter(Boolean);
    const letters = parts.length > 1 ? `${parts[0][0]}${parts[1][0]}` : value.slice(0, 2);
    return letters.toUpperCase();
};

const includesSearch = (value: unknown, query: string) => String(value ?? '').toLowerCase().includes(query);

function formatStatValue(row: any, column: StatColumn) {
    const value = row[column.id];
    const numeric = n(value);
    if (column.format === 'percent') return `${fmt(numeric, Number.isInteger(numeric) ? 0 : 1)}%`;
    if (column.format === 'signed') return `${numeric > 0 ? '+' : ''}${fmt(numeric, Number.isInteger(numeric) ? 0 : 1)}`;
    if (column.format === 'decimal') return fmt(numeric, 1);
    return fmt(numeric, Number.isInteger(numeric) ? 0 : 1);
}

function isDbFinalStatus(status: unknown) {
    const normalized = String(status ?? '').trim().toLowerCase();
    return normalized === 'final' || normalized === 'finished' || normalized === 'ft';
}

function normalizeEvent(raw: unknown) {
    if (!raw || typeof raw !== 'object') return null;
    const event = raw as Record<string, unknown>;
    const type = t(event.type || event.event_type).toLowerCase();
    const teamText = t(event.team || event.side || event.club_side).toLowerCase();
    const playerName = t(event.playerName || event.player_name || (event.player as Record<string, unknown> | undefined)?.name || event.name) || null;
    const detail = t(event.detail || (event as Record<string, unknown>).notes || '');
    if (!type) return null;
    return {
        type,
        team: ['home', 'local', 'h'].includes(teamText) ? 'home' : ['away', 'visitante', 'a'].includes(teamText) ? 'away' : null,
        playerName,
        detail,
    };
}

function useIsMobile() {
    const [isMobile, setIsMobile] = useState(false);
    useEffect(() => {
        const mq = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`);
        const update = () => setIsMobile(mq.matches);
        update();
        mq.addEventListener('change', update);
        return () => mq.removeEventListener('change', update);
    }, []);
    return isMobile;
}

export default function TournamentPublicStats({ matches, topScorers }: TournamentPublicStatsProps) {
    const isMobile = useIsMobile();
    const [activeSubTab, setActiveSubTab] = useState<StatsSubTab>('teams');
    const [teamStatsView, setTeamStatsView] = useState<TeamStatsView>('summary');
    const [sortKey, setSortKey] = useState('points_for');
    const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedTeamId, setSelectedTeamId] = useState('all');
    const [showTopOnly, setShowTopOnly] = useState(false);

    const handleSubTabChange = (tab: StatsSubTab) => {
        setActiveSubTab(tab);
        const teamDefault = TEAM_DEFAULT_SORT[teamStatsView];
        setSortKey(tab === 'teams' ? teamDefault.key : 'points');
        setSortDirection(tab === 'teams' ? teamDefault.direction : 'desc');
    };

    const handleTeamStatsViewChange = (view: TeamStatsView) => {
        const defaultSort = TEAM_DEFAULT_SORT[view];
        setTeamStatsView(view);
        setSortKey(defaultSort.key);
        setSortDirection(defaultSort.direction);
    };

    const finalMatches = useMemo(() => {
        return (matches || []).filter((m) => isDbFinalStatus(m.status));
    }, [matches]);

    const teamRows = useMemo(() => {
        const byId = new Map<string, any>();
        const ensure = (id: string, name: string, logo?: string | null) => {
            if (!byId.has(id)) {
                byId.set(id, {
                    entityId: id,
                    entityName: name || 'Equipo',
                    entityLogo: logo || null,
                    matches_played: 0,
                    wins: 0,
                    draws: 0,
                    losses: 0,
                    competition_points: 0,
                    points_for: 0,
                    points_against: 0,
                    points_difference: 0,
                    tries_scored: 0,
                    tries_conceded: 0,
                    penalty_tries: 0,
                    conversions: 0,
                    conversion_attempts: 0,
                    penalty_goals: 0,
                    penalty_goal_attempts: 0,
                    drop_goals: 0,
                    kick_meters: 0,
                    tackles_made: 0,
                    yellow_cards: 0,
                    red_cards: 0,
                    penalties_won: 0,
                    penalties_conceded: 0,
                    free_kicks: 0,
                    turnovers_won: 0,
                    turnovers_lost: 0,
                    passes: 0,
                    recoveries: 0,
                    knock_ons: 0,
                    forward_passes: 0,
                    handling_errors: 0,
                    entries_22: 0,
                    scrums_won: 0,
                    scrums_lost: 0,
                    lineouts_won: 0,
                    lineouts_lost: 0,
                    rucks_won: 0,
                    rucks_lost: 0,
                    mauls_won: 0,
                    mauls_lost: 0,
                });
            }
            return byId.get(id)!;
        };

        finalMatches.forEach((match) => {
            const homeId = match.home_club_id || match.home?.id || `home-${match.id}`;
            const awayId = match.away_club_id || match.away?.id || `away-${match.id}`;
            const homeName = match.home?.name || 'Local';
            const awayName = match.away?.name || 'Visitante';
            const homeLogo = match.home?.logo_url || null;
            const awayLogo = match.away?.logo_url || null;
            const home = ensure(String(homeId), homeName, homeLogo);
            const away = ensure(String(awayId), awayName, awayLogo);
            const score = match.score as Record<string, unknown> | undefined;
            const homeScore = n(score?.home);
            const awayScore = n(score?.away);

            home.matches_played = n(home.matches_played) + 1;
            away.matches_played = n(away.matches_played) + 1;
            if (homeScore > awayScore) { home.wins = n(home.wins) + 1; away.losses = n(away.losses) + 1; }
            else if (homeScore < awayScore) { away.wins = n(away.wins) + 1; home.losses = n(home.losses) + 1; }
            else { home.draws = n(home.draws) + 1; away.draws = n(away.draws) + 1; }
            home.points_for = n(home.points_for) + homeScore;
            home.points_against = n(home.points_against) + awayScore;
            away.points_for = n(away.points_for) + awayScore;
            away.points_against = n(away.points_against) + homeScore;

            (Array.isArray(match.events) ? match.events : []).map(normalizeEvent).filter(Boolean).forEach((event) => {
                const current = event!.team === 'home' ? home : event!.team === 'away' ? away : null;
                const opponent = event!.team === 'home' ? away : event!.team === 'away' ? home : null;
                if (!current || !opponent) return;
                if (event!.type === 'try' || event!.type === 'penalty_try') {
                    current.tries_scored = n(current.tries_scored) + 1;
                    opponent.tries_conceded = n(opponent.tries_conceded) + 1;
                    if (event!.type === 'penalty_try') current.penalty_tries = n(current.penalty_tries) + 1;
                }
                if (event!.type === 'conversion') {
                    current.conversion_attempts = n(current.conversion_attempts) + 1;
                    if (isGoalKickMade('conversion', event!.detail)) current.conversions = n(current.conversions) + 1;
                }
                if (event!.type === 'penalty_goal') {
                    current.penalty_goal_attempts = n(current.penalty_goal_attempts) + 1;
                    if (isGoalKickMade('penalty_goal', event!.detail)) current.penalty_goals = n(current.penalty_goals) + 1;
                }
                if (event!.type === 'penalty' && isGoalKickAttemptEvent({ type: 'penalty', detail: event!.detail })) {
                    current.penalty_goal_attempts = n(current.penalty_goal_attempts) + 1;
                    if (isGoalKickMade('penalty', event!.detail)) current.penalty_goals = n(current.penalty_goals) + 1;
                }
                if (event!.type === 'drop_goal' && isGoalKickMade('drop_goal', event!.detail)) current.drop_goals = n(current.drop_goals) + 1;
                if (event!.type === 'kick') current.kick_meters = n(current.kick_meters) + parseKickMetersFromDetail(event!.detail);
                if (event!.type === 'tackle') current.tackles_made = n(current.tackles_made) + 1;
                if (event!.type === 'pass') current.passes = n(current.passes) + 1;
                if (event!.type === 'recovery') current.recoveries = n(current.recoveries) + 1;
                if (event!.type === 'turnover_won') current.turnovers_won = n(current.turnovers_won) + 1;
                if (event!.type === 'turnover_lost') current.turnovers_lost = n(current.turnovers_lost) + 1;
                if (event!.type === 'penalty' || event!.type === 'penalty_goal') {
                    current.penalties_won = n(current.penalties_won) + 1;
                    opponent.penalties_conceded = n(opponent.penalties_conceded) + 1;
                }
                if (event!.type === 'penalty_committed') current.penalties_conceded = n(current.penalties_conceded) + 1;
                if (event!.type === 'free_kick') current.free_kicks = n(current.free_kicks) + 1;
                if (event!.type === 'knock_on') current.knock_ons = n(current.knock_ons) + 1;
                if (event!.type === 'forward_pass') current.forward_passes = n(current.forward_passes) + 1;
                if (event!.type === 'handling_error') current.handling_errors = n(current.handling_errors) + 1;
                if (event!.type === 'entradas_22') current.entries_22 = n(current.entries_22) + 1;
                if (event!.type === 'yellow_card' || event!.type === 'card_yellow') current.yellow_cards = n(current.yellow_cards) + 1;
                if (event!.type === 'red_card' || event!.type === 'card_red') current.red_cards = n(current.red_cards) + 1;
                if (event!.type === 'scrum') {
                    if (isContestLostDetail(event!.detail)) current.scrums_lost = n(current.scrums_lost) + 1;
                    else if (isContestWonDetail(event!.detail)) current.scrums_won = n(current.scrums_won) + 1;
                }
                if (event!.type === 'line' || event!.type === 'lineout') {
                    if (isContestLostDetail(event!.detail)) current.lineouts_lost = n(current.lineouts_lost) + 1;
                    else if (isContestWonDetail(event!.detail)) current.lineouts_won = n(current.lineouts_won) + 1;
                }
                if (event!.type === 'ruck') {
                    if (isContestLostDetail(event!.detail)) current.rucks_lost = n(current.rucks_lost) + 1;
                    else if (isContestWonDetail(event!.detail)) current.rucks_won = n(current.rucks_won) + 1;
                }
                if (event!.type === 'maul') {
                    if (isContestLostDetail(event!.detail)) current.mauls_lost = n(current.mauls_lost) + 1;
                    else if (isContestWonDetail(event!.detail)) current.mauls_won = n(current.mauls_won) + 1;
                }
                if (event!.type === 'scrum_won') current.scrums_won = n(current.scrums_won) + 1;
                if (event!.type === 'scrum_lost') current.scrums_lost = n(current.scrums_lost) + 1;
                if (event!.type === 'lineout_won') current.lineouts_won = n(current.lineouts_won) + 1;
                if (event!.type === 'lineout_lost') current.lineouts_lost = n(current.lineouts_lost) + 1;
            });
        });

        return Array.from(byId.values()).map((row) => {
            const matchesPlayed = n(row.matches_played);
            const contestsWon = n(row.scrums_won) + n(row.lineouts_won) + n(row.rucks_won) + n(row.mauls_won);
            const contestsLost = n(row.scrums_lost) + n(row.lineouts_lost) + n(row.rucks_lost) + n(row.mauls_lost);
            const defenseIndex = perMatch(row.tackles_made, matchesPlayed)
                + perMatch(n(row.turnovers_won) + n(row.recoveries), matchesPlayed)
                - perMatch(row.points_against, matchesPlayed)
                - perMatch(n(row.penalties_conceded) + n(row.yellow_cards) + (n(row.red_cards) * 3), matchesPlayed);

            return {
                ...row,
                contests_won: contestsWon,
                contests_lost: contestsLost,
                points_difference: n(row.points_for) - n(row.points_against),
                points_for_per_match: perMatch(row.points_for, matchesPlayed),
                points_against_per_match: perMatch(row.points_against, matchesPlayed),
                tries_scored_per_match: perMatch(row.tries_scored, matchesPlayed),
                tries_conceded_per_match: perMatch(row.tries_conceded, matchesPlayed),
                conversion_rate: percentage(row.conversions, row.conversion_attempts),
                penalty_goal_rate: percentage(row.penalty_goals, row.penalty_goal_attempts),
                set_piece_success_rate: percentage(contestsWon, contestsWon + contestsLost),
                attack_index: perMatch(row.points_for, matchesPlayed) + perMatch(row.tries_scored, matchesPlayed),
                defense_index: defenseIndex,
            };
        });
    }, [finalMatches]);

    const playerRows = useMemo(() => {
        const byId = new Map<string, any>();
        finalMatches.forEach((match) => {
            const counted = new Set<string>();
            const homeId = match.home_club_id || match.home?.id || `home-${match.id}`;
            const awayId = match.away_club_id || match.away?.id || `away-${match.id}`;
            const sides = [
                { teamId: String(homeId), teamName: match.home?.name || 'Local', teamLogo: match.home?.logo_url || null },
                { teamId: String(awayId), teamName: match.away?.name || 'Visitante', teamLogo: match.away?.logo_url || null },
            ];

            (Array.isArray(match.events) ? match.events : []).map(normalizeEvent).filter(Boolean).forEach((event) => {
                const side = event!.team === 'home' ? sides[0] : event!.team === 'away' ? sides[1] : null;
                if (!side || !event!.playerName) return;
                const id = `${side.teamId}:${event!.playerName.toLowerCase()}`;
                if (!byId.has(id)) {
                    byId.set(id, {
                        entityId: id,
                        entityName: event!.playerName,
                        entityLogo: side.teamLogo,
                        teamId: side.teamId,
                        secondary: side.teamName,
                        matches_played: 0,
                        points: 0,
                        tries: 0,
                        tackles: 0,
                        yellow_cards: 0,
                        red_cards: 0,
                        conversions: 0,
                        conversion_attempts: 0,
                        penalty_goals: 0,
                        penalty_goal_attempts: 0,
                        kick_meters: 0,
                        scrums_won: 0,
                        scrums_lost: 0,
                        lineouts_won: 0,
                        lineouts_lost: 0,
                        rucks_won: 0,
                        rucks_lost: 0,
                        mauls_won: 0,
                        mauls_lost: 0,
                    });
                }
                if (!counted.has(id)) {
                    byId.get(id)!.matches_played = n(byId.get(id)!.matches_played) + 1;
                    counted.add(id);
                }
                if (event!.type === 'try' || event!.type === 'penalty_try') byId.get(id)!.tries = n(byId.get(id)!.tries) + 1;
                if (event!.type === 'tackle') byId.get(id)!.tackles = n(byId.get(id)!.tackles) + 1;
                if (event!.type === 'yellow_card' || event!.type === 'card_yellow') byId.get(id)!.yellow_cards = n(byId.get(id)!.yellow_cards) + 1;
                if (event!.type === 'red_card' || event!.type === 'card_red') byId.get(id)!.red_cards = n(byId.get(id)!.red_cards) + 1;
                if (event!.type === 'conversion') {
                    byId.get(id)!.conversion_attempts = n(byId.get(id)!.conversion_attempts) + 1;
                    if (isGoalKickMade('conversion', event!.detail)) byId.get(id)!.conversions = n(byId.get(id)!.conversions) + 1;
                }
                if (event!.type === 'penalty_goal') {
                    byId.get(id)!.penalty_goal_attempts = n(byId.get(id)!.penalty_goal_attempts) + 1;
                    if (isGoalKickMade('penalty_goal', event!.detail)) byId.get(id)!.penalty_goals = n(byId.get(id)!.penalty_goals) + 1;
                }
                if (event!.type === 'penalty' && isGoalKickAttemptEvent({ type: 'penalty', detail: event!.detail })) {
                    byId.get(id)!.penalty_goal_attempts = n(byId.get(id)!.penalty_goal_attempts) + 1;
                    if (isGoalKickMade('penalty', event!.detail)) byId.get(id)!.penalty_goals = n(byId.get(id)!.penalty_goals) + 1;
                }
                if (event!.type === 'kick') byId.get(id)!.kick_meters = n(byId.get(id)!.kick_meters) + parseKickMetersFromDetail(event!.detail);
                {
                    const p = byId.get(id)!;
                    if (event!.type === 'scrum') {
                        if (isContestLostDetail(event!.detail)) p.scrums_lost = n(p.scrums_lost) + 1;
                        else if (isContestWonDetail(event!.detail)) p.scrums_won = n(p.scrums_won) + 1;
                    }
                    if (event!.type === 'line' || event!.type === 'lineout') {
                        if (isContestLostDetail(event!.detail)) p.lineouts_lost = n(p.lineouts_lost) + 1;
                        else if (isContestWonDetail(event!.detail)) p.lineouts_won = n(p.lineouts_won) + 1;
                    }
                    if (event!.type === 'ruck') {
                        if (isContestLostDetail(event!.detail)) p.rucks_lost = n(p.rucks_lost) + 1;
                        else if (isContestWonDetail(event!.detail)) p.rucks_won = n(p.rucks_won) + 1;
                    }
                    if (event!.type === 'maul') {
                        if (isContestLostDetail(event!.detail)) p.mauls_lost = n(p.mauls_lost) + 1;
                        else if (isContestWonDetail(event!.detail)) p.mauls_won = n(p.mauls_won) + 1;
                    }
                    if (event!.type === 'scrum_won') p.scrums_won = n(p.scrums_won) + 1;
                    if (event!.type === 'scrum_lost') p.scrums_lost = n(p.scrums_lost) + 1;
                    if (event!.type === 'lineout_won') p.lineouts_won = n(p.lineouts_won) + 1;
                    if (event!.type === 'lineout_lost') p.lineouts_lost = n(p.lineouts_lost) + 1;
                }
                {
                    let pts = 0;
                    if (event!.type === 'try') pts = 5;
                    else if (event!.type === 'penalty_try') pts = 7;
                    else if (event!.type === 'conversion' && isGoalKickMade('conversion', event!.detail)) pts = 2;
                    else if (event!.type === 'penalty_goal' && isGoalKickMade('penalty_goal', event!.detail)) pts = 3;
                    else if (event!.type === 'penalty' && isGoalKickAttemptEvent({ type: 'penalty', detail: event!.detail }) && isGoalKickMade('penalty', event!.detail)) pts = 3;
                    else if (event!.type === 'drop_goal' && isGoalKickMade('drop_goal', event!.detail)) pts = 3;
                    if (pts) byId.get(id)!.points = n(byId.get(id)!.points) + pts;
                }
            });
        });
        return Array.from(byId.values());
    }, [finalMatches]);

    const teamColumns = TEAM_COLUMNS[teamStatsView];
    const playerColumns = PLAYER_COLUMNS;

    const currentRows = activeSubTab === 'teams' ? teamRows : playerRows;
    const currentColumns = activeSubTab === 'teams' ? teamColumns : playerColumns;

    const teamOptions = useMemo(() => {
        return [...teamRows]
            .sort((a, b) => String(a.entityName ?? '').localeCompare(String(b.entityName ?? ''), 'es'))
            .map((row) => ({ id: String(row.entityId), name: String(row.entityName ?? 'Equipo') }));
    }, [teamRows]);

    const filteredRows = useMemo(() => {
        const query = searchQuery.trim().toLowerCase();
        return currentRows.filter((row) => {
            const matchesQuery = !query || includesSearch(row.entityName, query) || includesSearch(row.secondary, query);
            const matchesTeam = selectedTeamId === 'all'
                || (activeSubTab === 'teams' ? String(row.entityId) === selectedTeamId : String(row.teamId ?? '') === selectedTeamId);
            return matchesQuery && matchesTeam;
        });
    }, [activeSubTab, currentRows, searchQuery, selectedTeamId]);

    const sortedRows = useMemo(() => {
        return [...filteredRows].sort((a, b) => {
            const left = sortKey === 'entity' ? a.entityName : a[sortKey];
            const right = sortKey === 'entity' ? b.entityName : b[sortKey];
            const modifier = sortDirection === 'asc' ? 1 : -1;
            if (typeof left === 'string' || typeof right === 'string') {
                return String(left ?? '').localeCompare(String(right ?? ''), 'es') * modifier;
            }
            return (n(left) - n(right)) * modifier;
        });
    }, [filteredRows, sortKey, sortDirection]);

    const displayRows = showTopOnly ? sortedRows.slice(0, 10) : sortedRows;

    const handleSort = (key: string) => {
        if (sortKey === key) {
            setSortDirection((d) => (d === 'desc' ? 'asc' : 'desc'));
        } else {
            setSortKey(key);
            setSortDirection('desc');
        }
    };

    const hasStats = finalMatches.length > 0 && (activeSubTab === 'teams' ? teamRows.length > 0 : playerRows.length > 0);
    const hasEvents = finalMatches.some((m) => Array.isArray(m.events) && m.events.length > 0);
    const showTopScorersFallback = !hasEvents && (topScorers?.length || 0) > 0;
    const activeSortColumn = currentColumns.find((column) => column.id === sortKey);

    const gridTemplate = currentColumns.map((c) => {
        if (c.id === 'entity') return 'minmax(220px, 1.8fr)';
        if (c.id === 'secondary') return 'minmax(140px, 1fr)';
        return 'minmax(76px, 0.62fr)';
    }).join(' ');
    const tableMinWidth = Math.max(activeSubTab === 'teams' ? 900 : 940, currentColumns.length * 88 + 220);

    // ── Mobile card renderers ──────────────────────────────────────────────

    const renderMobileStatGroup = (
        title: string,
        stats: Array<{ label: string; value: string; accent?: boolean; danger?: boolean }>,
    ) => (
        <div className={styles.statsMobileGroup} key={title}>
            <div className={styles.statsMobileGroupTitle}>{title}</div>
            <div className={styles.statsMobileGrid}>
                {stats.map((stat) => (
                    <MobileStat key={`${title}-${stat.label}`} label={stat.label} value={stat.value} accent={stat.accent} danger={stat.danger} />
                ))}
            </div>
        </div>
    );

    const renderTeamCard = (row: any, idx: number) => {
        const summaryGroups = [
            renderMobileStatGroup('Resumen', [
                { label: 'PJ', value: fmt(row.matches_played) },
                { label: 'PG', value: fmt(row.wins) },
                { label: 'PE', value: fmt(row.draws) },
                { label: 'PP', value: fmt(row.losses) },
            ]),
            renderMobileStatGroup('Balance', [
                { label: 'PTS', value: fmt(row.points_for), accent: true },
                { label: 'PC', value: fmt(row.points_against) },
                { label: 'DIF', value: formatStatValue(row, { id: 'points_difference', label: 'DIF', format: 'signed' }), accent: n(row.points_difference) > 0, danger: n(row.points_difference) < 0 },
                { label: 'TACK', value: fmt(row.tackles_made) },
            ]),
        ];

        const attackGroups = [
            renderMobileStatGroup('Ataque', [
                { label: 'PTS', value: fmt(row.points_for), accent: true },
                { label: 'PTS/PJ', value: fmt(row.points_for_per_match, 1) },
                { label: 'TRIES', value: fmt(row.tries_scored), accent: true },
                { label: 'TR/PJ', value: fmt(row.tries_scored_per_match, 1) },
            ]),
            renderMobileStatGroup('Patadas', [
                { label: 'CONV', value: fmt(row.conversions), accent: true },
                { label: 'CONV%', value: `${fmt(row.conversion_rate, 1)}%` },
                { label: 'PEN', value: fmt(row.penalty_goals) },
                { label: 'M PAT', value: fmt(row.kick_meters) },
            ]),
        ];

        const defenseGroups = [
            renderMobileStatGroup('Defensa', [
                { label: 'PC', value: fmt(row.points_against), accent: true },
                { label: 'PC/PJ', value: fmt(row.points_against_per_match, 1) },
                { label: 'TRIES C', value: fmt(row.tries_conceded) },
                { label: 'TC/PJ', value: fmt(row.tries_conceded_per_match, 1) },
            ]),
            renderMobileStatGroup('Contacto', [
                { label: 'TACK', value: fmt(row.tackles_made), accent: true },
                { label: 'DEF IDX', value: fmt(row.defense_index, 1), accent: true },
                { label: 'REC', value: fmt(row.turnovers_won) },
                { label: 'PEN C', value: fmt(row.penalties_conceded), danger: n(row.penalties_conceded) > 0 },
            ]),
            renderMobileStatGroup('Disciplina', [
                { label: 'TA', value: fmt(row.yellow_cards), danger: n(row.yellow_cards) > 0 },
                { label: 'TR', value: fmt(row.red_cards), danger: n(row.red_cards) > 0 },
                { label: 'TO-', value: fmt(row.turnovers_lost) },
                { label: 'ERR', value: fmt(n(row.knock_ons) + n(row.forward_passes) + n(row.handling_errors)) },
            ]),
        ];

        return (
            <div key={row.entityId} className={styles.statsMobileCard}>
                <div className={styles.statsMobileIdentity}>
                    <span className={styles.statsRank}>{idx + 1}</span>
                    <span className={styles.statsAvatar}>{initials(String(row.entityName ?? 'EQ'))}</span>
                    <span className={styles.statsEntityName}>{row.entityName}</span>
                </div>
                {teamStatsView === 'attack' ? attackGroups : teamStatsView === 'defense' ? defenseGroups : summaryGroups}
            </div>
        );
    };

    const renderPlayerCard = (row: any, idx: number) => (
        <div key={row.entityId} className={styles.statsMobileCard}>
            <div className={styles.statsMobileIdentity}>
                <span className={styles.statsRank}>{idx + 1}</span>
                <span className={styles.statsAvatar}>{initials(String(row.entityName ?? 'JG'))}</span>
                <span className={styles.statsMobileIdentityText}>
                    <span className={styles.statsEntityName}>{row.entityName}</span>
                    <span className={styles.statsEntitySecondary}>{row.secondary}</span>
                </span>
            </div>
            {renderMobileStatGroup('Producción', [
                { label: 'PJ', value: fmt(row.matches_played) },
                { label: 'PTS', value: fmt(row.points), accent: true },
                { label: 'TRIES', value: fmt(row.tries), accent: true },
            ])}
            {renderMobileStatGroup('Juego', [
                { label: 'CONV', value: fmt(row.conversions), accent: true },
                { label: 'PEN', value: fmt(row.penalty_goals) },
                { label: 'TACK', value: fmt(row.tackles) },
            ])}
            {renderMobileStatGroup('Otros', [
                { label: 'M PAT', value: fmt(row.kick_meters) },
                { label: 'TA', value: fmt(row.yellow_cards), danger: n(row.yellow_cards) > 0 },
                { label: 'TR', value: fmt(row.red_cards), danger: n(row.red_cards) > 0 },
            ])}
        </div>
    );

    return (
        <div className={styles.section}>
            <div className={styles.statsHeaderBar}>
                <div className={styles.statsTitleBlock}>
                    <h2 className={styles.pageTitle}>Estadísticas</h2>
                    {!showTopScorersFallback && (
                        <p className={styles.statsSubtitle}>
                            {activeSubTab === 'teams'
                                ? TEAM_STATS_VIEW_OPTIONS.find((view) => view.id === teamStatsView)?.description
                                : 'Ranking individual con puntos, tries, patadas y defensa.'}
                        </p>
                    )}
                </div>
                {!showTopScorersFallback && (
                    <div className={styles.statsSubTabs}>
                        <button
                            type="button"
                            className={`${styles.statsSubTab} ${activeSubTab === 'teams' ? styles.statsSubTabActive : ''}`}
                            onClick={() => handleSubTabChange('teams')}
                        >
                            Equipos
                        </button>
                        <button
                            type="button"
                            className={`${styles.statsSubTab} ${activeSubTab === 'players' ? styles.statsSubTabActive : ''}`}
                            onClick={() => handleSubTabChange('players')}
                        >
                            Jugadores
                        </button>
                    </div>
                )}
            </div>

            {!showTopScorersFallback && activeSubTab === 'teams' && (
                <div className={styles.statsModeBar} aria-label="Vista de estadísticas por equipo">
                    {TEAM_STATS_VIEW_OPTIONS.map((view) => (
                        <button
                            key={view.id}
                            type="button"
                            className={`${styles.statsModeButton} ${teamStatsView === view.id ? styles.statsModeButtonActive : ''}`}
                            onClick={() => handleTeamStatsViewChange(view.id)}
                            aria-pressed={teamStatsView === view.id}
                        >
                            {view.label}
                        </button>
                    ))}
                </div>
            )}

            {!showTopScorersFallback && hasStats && (
                <div className={styles.statsFilterBar}>
                    <input
                        className={styles.statsInput}
                        type="search"
                        value={searchQuery}
                        onChange={(event) => setSearchQuery(event.target.value)}
                        placeholder={activeSubTab === 'teams' ? 'Buscar equipo' : 'Buscar jugador o equipo'}
                        aria-label={activeSubTab === 'teams' ? 'Buscar equipo' : 'Buscar jugador o equipo'}
                    />
                    <select
                        className={styles.statsSelect}
                        value={selectedTeamId}
                        onChange={(event) => setSelectedTeamId(event.target.value)}
                        aria-label="Filtrar por equipo"
                    >
                        <option value="all">Todos los equipos</option>
                        {teamOptions.map((team) => (
                            <option key={team.id} value={team.id}>{team.name}</option>
                        ))}
                    </select>
                    <div className={styles.statsLimitGroup} aria-label="Cantidad de filas">
                        <button
                            type="button"
                            className={`${styles.statsLimitButton} ${showTopOnly ? styles.statsLimitButtonActive : ''}`}
                            onClick={() => setShowTopOnly(true)}
                            aria-pressed={showTopOnly}
                        >
                            Top 10
                        </button>
                        <button
                            type="button"
                            className={`${styles.statsLimitButton} ${!showTopOnly ? styles.statsLimitButtonActive : ''}`}
                            onClick={() => setShowTopOnly(false)}
                            aria-pressed={!showTopOnly}
                        >
                            Todos
                        </button>
                    </div>
                    <div className={styles.statsSortHint}>
                        Orden: <strong>{activeSortColumn?.label || sortKey} {sortDirection === 'desc' ? '↓' : '↑'}</strong>
                    </div>
                </div>
            )}

            {isMobile && !showTopScorersFallback && hasStats && (
                <div className={styles.statsMobileSort}>
                    <select
                        className={styles.statsSelect}
                        value={`${sortKey}:${sortDirection}`}
                        onChange={(e) => {
                            const [key, dir] = e.target.value.split(':');
                            setSortKey(key);
                            setSortDirection(dir as SortDirection);
                        }}
                        aria-label="Ordenar estadísticas"
                    >
                        {currentColumns.filter((col) => col.id !== 'entity' && col.id !== 'secondary').map((col) => (
                            <React.Fragment key={col.id}>
                                <option value={`${col.id}:desc`}>{col.label} ↓</option>
                                <option value={`${col.id}:asc`}>{col.label} ↑</option>
                            </React.Fragment>
                        ))}
                    </select>
                </div>
            )}

            {showTopScorersFallback ? (
                <div className={styles.sectionCard}>
                    <div className={styles.tableCard}>
                        <div className={styles.tableHeader} style={{ display: 'grid', gridTemplateColumns: '40px 1fr 1fr 60px 60px' }}>
                            <div>#</div>
                            <div>Jugador</div>
                            <div>Equipo</div>
                            <div style={{ textAlign: 'center' }}>G</div>
                            <div style={{ textAlign: 'center' }}>A</div>
                        </div>
                        {topScorers!.slice(0, 20).map((player: any, idx: number) => (
                            <div key={idx} className={styles.tableRow} style={{ display: 'grid', gridTemplateColumns: '40px 1fr 1fr 60px 60px' }}>
                                <div style={{ color: 'var(--fl-text-dim)', width: 24 }}>{idx + 1}</div>
                                <div><span>{player.player_name || player.name}</span></div>
                                <div style={{ color: 'var(--fl-text-muted)' }}><span>{player.team_name || player.team?.name}</span></div>
                                <div style={{ textAlign: 'center', fontWeight: 700 }}>{player.goals}</div>
                                <div style={{ textAlign: 'center' }}>{player.assists || '-'}</div>
                            </div>
                        ))}
                    </div>
                </div>
            ) : hasStats ? (
                isMobile ? (
                    <div>
                        {displayRows.length === 0 ? (
                            <p className={styles.emptyState}>No hay resultados con los filtros actuales.</p>
                        ) : activeSubTab === 'teams'
                            ? displayRows.map((row, idx) => renderTeamCard(row, idx))
                            : displayRows.map((row, idx) => renderPlayerCard(row, idx))}
                    </div>
                ) : (
                    <div className={styles.sectionCard}>
                        <div className={`${styles.tableCard} ${styles.statsTableWrap}`}>
                            <div className={`${styles.tableHeader} ${styles.statsTableHeaderRow}`} style={{ gridTemplateColumns: gridTemplate, minWidth: tableMinWidth }}>
                                {currentColumns.map((col, colIndex) => (
                                    <div
                                        key={col.id}
                                        className={`${styles.statsHeaderCell} ${colIndex === 0 ? styles.statsStickyHeaderCell : ''}`}
                                        title={col.title || col.label}
                                    >
                                        <button
                                            type="button"
                                            className={`${styles.statsHeaderButton} ${sortKey === col.id ? styles.statsHeaderButtonActive : ''}`}
                                            onClick={() => handleSort(col.id)}
                                        >
                                            <span>{col.label}</span>
                                            <span className={styles.statsSortArrow}>{sortKey === col.id ? (sortDirection === 'desc' ? '↓' : '↑') : '↕'}</span>
                                        </button>
                                    </div>
                                ))}
                            </div>
                            {displayRows.length === 0 ? (
                                <p className={styles.emptyState}>No hay resultados con los filtros actuales.</p>
                            ) : displayRows.map((row, idx) => (
                                <div
                                    key={row.entityId}
                                    className={`${styles.tableRow} ${styles.statsTableDataRow}`}
                                    style={{ gridTemplateColumns: gridTemplate, minWidth: tableMinWidth }}
                                >
                                    {currentColumns.map((col, colIndex) => {
                                        const metricClassName = [
                                            styles.statsMetricValue,
                                            col.accent ? styles.statsMetricAccent : '',
                                            col.tone === 'attack' ? styles.statsMetricAttack : '',
                                            col.tone === 'defense' ? styles.statsMetricDefense : '',
                                            col.tone === 'danger' ? styles.statsMetricDanger : '',
                                            col.tone === 'muted' ? styles.statsMetricMuted : '',
                                        ].filter(Boolean).join(' ');

                                        return (
                                            <div
                                                key={`${row.entityId}-${col.id}`}
                                                className={`${styles.statsBodyCell} ${colIndex === 0 ? styles.statsStickyCell : ''}`}
                                                title={col.title || col.label}
                                            >
                                                {col.id === 'entity' ? (
                                                    <div className={styles.statsEntityCell}>
                                                        <span className={styles.statsRank}>{idx + 1}</span>
                                                        <span className={styles.statsAvatar}>{initials(String(row.entityName ?? ''))}</span>
                                                        <span className={styles.statsEntityText}>
                                                            <span className={styles.statsEntityName}>{row.entityName}</span>
                                                            <span className={styles.statsEntitySecondary}>
                                                                {activeSubTab === 'players' ? row.secondary : `${fmt(row.matches_played)} PJ`}
                                                            </span>
                                                        </span>
                                                    </div>
                                                ) : col.id === 'secondary' ? (
                                                    <span className={styles.statsTeamChip}>{row.secondary}</span>
                                                ) : (
                                                    <span className={metricClassName}>{formatStatValue(row, col)}</span>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            ))}
                        </div>
                    </div>
                )
            ) : (
                <p className={styles.emptyState}>
                    {finalMatches.length === 0
                        ? 'No hay partidos finalizados para mostrar estadísticas.'
                        : 'No hay estadísticas disponibles para esta sección.'}
                </p>
            )}
        </div>
    );
}

function MobileStat({ label, value, accent, danger }: { label: string; value: string; accent?: boolean; danger?: boolean }) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
            <span style={{ fontSize: '0.65rem', color: 'var(--fl-text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</span>
            <span style={{
                fontSize: '0.95rem',
                fontWeight: 700,
                color: accent ? 'var(--fl-primary)' : danger ? 'var(--fl-danger)' : 'var(--fl-text)',
            }}>
                {value}
            </span>
        </div>
    );
}
