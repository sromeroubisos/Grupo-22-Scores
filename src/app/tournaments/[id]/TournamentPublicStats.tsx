'use client';

import React, { useMemo, useState } from 'react';
import styles from './page.module.css';
import {
    isGoalKickAttemptEvent,
    isGoalKickMade,
    parseKickMetersFromDetail,
    isContestWonDetail,
    isContestLostDetail,
} from '@/lib/matchEventStats';

type StatsSubTab = 'teams' | 'players';
type SortDirection = 'asc' | 'desc';

interface TournamentPublicStatsProps {
    matches: any[];
    topScorers?: any[];
}

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

export default function TournamentPublicStats({ matches, topScorers }: TournamentPublicStatsProps) {
    const [activeSubTab, setActiveSubTab] = useState<StatsSubTab>('teams');
    const [sortKey, setSortKey] = useState('points_for');
    const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

    const handleSubTabChange = (tab: StatsSubTab) => {
        setActiveSubTab(tab);
        setSortKey(tab === 'teams' ? 'points_for' : 'points');
        setSortDirection('desc');
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
                    conversions: 0,
                    conversion_attempts: 0,
                    penalty_goals: 0,
                    penalty_goal_attempts: 0,
                    drop_goals: 0,
                    kick_meters: 0,
                    tackles_made: 0,
                    yellow_cards: 0,
                    red_cards: 0,
                    penalties_conceded: 0,
                    turnovers_won: 0,
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
                if (event!.type === 'try') { current.tries_scored = n(current.tries_scored) + 1; opponent.tries_conceded = n(opponent.tries_conceded) + 1; }
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
                if (event!.type === 'turnover_won') current.turnovers_won = n(current.turnovers_won) + 1;
                if (event!.type === 'yellow_card') current.yellow_cards = n(current.yellow_cards) + 1;
                if (event!.type === 'red_card') current.red_cards = n(current.red_cards) + 1;
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

        return Array.from(byId.values()).map((row) => ({
            ...row,
            points_difference: n(row.points_for) - n(row.points_against),
        }));
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
                if (event!.type === 'yellow_card') byId.get(id)!.yellow_cards = n(byId.get(id)!.yellow_cards) + 1;
                if (event!.type === 'red_card') byId.get(id)!.red_cards = n(byId.get(id)!.red_cards) + 1;
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

    const teamColumns = [
        { id: 'entity', label: 'Equipo' },
        { id: 'matches_played', label: 'PJ' },
        { id: 'wins', label: 'PG' },
        { id: 'draws', label: 'PE' },
        { id: 'losses', label: 'PP' },
        { id: 'points_for', label: 'PF' },
        { id: 'points_against', label: 'PC' },
        { id: 'points_difference', label: 'Dif' },
        { id: 'tries_scored', label: 'Tries' },
        { id: 'conversions', label: 'Conv' },
        { id: 'penalty_goals', label: 'Pen' },
        { id: 'drop_goals', label: 'Drop' },
        { id: 'tackles_made', label: 'Tackles' },
        { id: 'yellow_cards', label: 'TA' },
        { id: 'red_cards', label: 'TR' },
    ];

    const playerColumns = [
        { id: 'entity', label: 'Jugador' },
        { id: 'secondary', label: 'Equipo' },
        { id: 'matches_played', label: 'PJ' },
        { id: 'points', label: 'Pts' },
        { id: 'tries', label: 'Tries' },
        { id: 'conversions', label: 'Conv' },
        { id: 'penalty_goals', label: 'Pen' },
        { id: 'tackles', label: 'Tackles' },
        { id: 'kick_meters', label: 'm pat' },
        { id: 'yellow_cards', label: 'TA' },
        { id: 'red_cards', label: 'TR' },
    ];

    const currentRows = activeSubTab === 'teams' ? teamRows : playerRows;
    const currentColumns = activeSubTab === 'teams' ? teamColumns : playerColumns;

    const sortedRows = useMemo(() => {
        return [...currentRows].sort((a, b) => {
            const left = sortKey === 'entity' ? a.entityName : a[sortKey];
            const right = sortKey === 'entity' ? b.entityName : b[sortKey];
            const modifier = sortDirection === 'asc' ? 1 : -1;
            if (typeof left === 'string' || typeof right === 'string') {
                return String(left ?? '').localeCompare(String(right ?? ''), 'es') * modifier;
            }
            return (n(left) - n(right)) * modifier;
        });
    }, [currentRows, sortKey, sortDirection]);

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

    return (
        <div className={styles.section}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
                <h2 className={styles.pageTitle}>Estadísticas</h2>
                {!showTopScorersFallback && (
                    <div style={{ display: 'flex', gap: 8 }}>
                        <button
                            type="button"
                            className={`${styles.tabButton} ${activeSubTab === 'teams' ? styles.activeTab : ''}`}
                            onClick={() => handleSubTabChange('teams')}
                            style={{ position: 'relative', padding: '8px 16px', fontSize: '0.85rem' }}
                        >
                            Equipos
                        </button>
                        <button
                            type="button"
                            className={`${styles.tabButton} ${activeSubTab === 'players' ? styles.activeTab : ''}`}
                            onClick={() => handleSubTabChange('players')}
                            style={{ position: 'relative', padding: '8px 16px', fontSize: '0.85rem' }}
                        >
                            Jugadores
                        </button>
                    </div>
                )}
            </div>

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
                <div className={styles.sectionCard}>
                    <div className={styles.tableCard} style={{ overflowX: 'auto' }}>
                        <div className={styles.tableHeader} style={{ display: 'grid', gridTemplateColumns: currentColumns.map((c) => c.id === 'entity' ? '2fr' : c.id === 'secondary' ? '1.5fr' : 'minmax(48px, 0.6fr)').join(' '), minWidth: currentColumns.length * 56 }}>
                            {currentColumns.map((col) => (
                                <div
                                    key={col.id}
                                    style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}
                                    onClick={() => handleSort(col.id)}
                                >
                                    {col.label}
                                </div>
                            ))}
                        </div>
                        {sortedRows.map((row, idx) => (
                            <div
                                key={row.entityId}
                                className={styles.tableRow}
                                style={{ display: 'grid', gridTemplateColumns: currentColumns.map((c) => c.id === 'entity' ? '2fr' : c.id === 'secondary' ? '1.5fr' : 'minmax(48px, 0.6fr)').join(' '), minWidth: currentColumns.length * 56 }}
                            >
                                {currentColumns.map((col) => (
                                    <div key={col.id} style={{ display: 'flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                        {col.id === 'entity' ? (
                                            <>
                                                <span style={{ color: 'var(--fl-text-dim)', minWidth: 24 }}>{idx + 1}</span>
                                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.entityName}</span>
                                            </>
                                        ) : col.id === 'secondary' ? (
                                            <span style={{ color: 'var(--fl-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.secondary}</span>
                                        ) : (
                                            <span>{fmt(row[col.id])}</span>
                                        )}
                                    </div>
                                ))}
                            </div>
                        ))}
                    </div>
                </div>
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
