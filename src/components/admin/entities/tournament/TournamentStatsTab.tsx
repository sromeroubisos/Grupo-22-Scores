'use client';
/* eslint-disable @next/next/no-img-element */

import { ArrowDownUp, Download, RefreshCw, Share2, Sparkles, Target } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { MatchWithClubs, PhaseWithRounds } from '@/lib/types/fixture';
import { useFixture } from './FixtureContext';
import type { StandingsDataPayload, TournamentContextData } from './standings/types';
import styles from './TournamentStatsTab.module.css';
import {
  goalKickEffectivenessPercent,
  isGoalKickAttemptEvent,
  isGoalKickMade,
  parseKickMetersFromDetail,
  isContestWonDetail,
  isContestLostDetail,
} from '@/lib/matchEventStats';

type TournamentRow = {
  id?: string;
  name?: string | null;
  sport?: string | null;
  season_id?: string | null;
  category?: string | null;
  status?: string | null;
};
type StatsTabId = 'overview' | 'team_stats' | 'player_stats' | 'attack' | 'defense' | 'discipline' | 'set_pieces' | 'advanced';
type ScopeMode = 'totals' | 'per_match';
type SortDirection = 'asc' | 'desc';
type RowData = Record<string, unknown> & { entityId: string; entityName: string; entityLogo?: string | null; secondary?: string };
type Column = { id: string; label: string; accent?: boolean; title?: string };
type TableModel = { title: string; subtitle: string; chartKey: string; empty: string; rows: RowData[]; columns: Column[] };

const TABS: Array<{ id: StatsTabId; label: string; rugbyOnly?: boolean }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'team_stats', label: 'Team Stats' },
  { id: 'player_stats', label: 'Player Stats' },
  { id: 'attack', label: 'Attack' },
  { id: 'defense', label: 'Defense' },
  { id: 'discipline', label: 'Discipline' },
  { id: 'set_pieces', label: 'Set Pieces', rugbyOnly: true },
  { id: 'advanced', label: 'Advanced' },
];

const DEFAULT_SORT: Record<StatsTabId, { key: string; direction: SortDirection }> = {
  overview: { key: 'competition_points', direction: 'desc' },
  team_stats: { key: 'competition_points', direction: 'desc' },
  player_stats: { key: 'points', direction: 'desc' },
  attack: { key: 'points_scored', direction: 'desc' },
  defense: { key: 'defense_index', direction: 'desc' },
  discipline: { key: 'discipline_index', direction: 'asc' },
  set_pieces: { key: 'set_piece_success_rate', direction: 'desc' },
  advanced: { key: 'net_performance_index', direction: 'desc' },
};

const n = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const t = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

const avg = (value: number, played: number, scope: ScopeMode) => (scope === 'per_match' && played > 0 ? value / played : value);

const fmt = (value: unknown, digits = 0) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return '—';
  return num.toLocaleString('es-AR', { minimumFractionDigits: digits, maximumFractionDigits: digits });
};

const logoFallback = (name: string) => name.slice(0, 2).toUpperCase();
const isFinal = (match: MatchWithClubs) => match.status === 'final';
const phaseMatches = (phase: PhaseWithRounds | null | undefined) => (phase ? phase.rounds.flatMap((round) => round.matches || []) : []);
const sportLabel = (value?: string | null) => (value ? value.replace(/-/g, ' ') : 'Sin deporte');

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

function csvEscape(value: unknown) {
  const content = String(value ?? '');
  return /[",\n]/.test(content) ? `"${content.replace(/"/g, '""')}"` : content;
}

function downloadCsv(filename: string, columns: Column[], rows: RowData[]) {
  const header = columns.map((column) => csvEscape(column.label)).join(',');
  const content = rows.map((row) => columns.map((column) => csvEscape(column.id === 'entity' ? row.entityName : row[column.id])).join(',')).join('\n');
  const blob = new Blob([`${header}\n${content}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function TournamentStatsTab({ data, id, phaseId }: { data?: TournamentRow; id?: string; phaseId?: string }) {
  const tournamentId = id || data?.id || '';
  const { fixture, refreshFixture } = useFixture();
  const [activeTab, setActiveTab] = useState<StatsTabId>('overview');
  const [selectedPhaseId, setSelectedPhaseId] = useState(phaseId || '');
  const [selectedGroupId, setSelectedGroupId] = useState('all');
  const [selectedTeamId, setSelectedTeamId] = useState('all');
  const [selectedPlayerId, setSelectedPlayerId] = useState('all');
  const [scope, setScope] = useState<ScopeMode>('totals');
  const [sortKey, setSortKey] = useState(DEFAULT_SORT.overview.key);
  const [sortDirection, setSortDirection] = useState<SortDirection>(DEFAULT_SORT.overview.direction);
  const [loading, setLoading] = useState(false);
  const [standingsContext, setStandingsContext] = useState<TournamentContextData | null>(null);
  const [standingsData, setStandingsData] = useState<StandingsDataPayload | null>(null);

  const isRugby = (data?.sport || '').toLowerCase().includes('rugby');
  const tabs = useMemo(() => TABS.filter((tab) => !tab.rugbyOnly || isRugby), [isRugby]);

  useEffect(() => {
    if (phaseId) setSelectedPhaseId(phaseId);
    else if (!selectedPhaseId && fixture?.currentPhaseId) setSelectedPhaseId(fixture.currentPhaseId);
  }, [fixture?.currentPhaseId, phaseId, selectedPhaseId]);

  useEffect(() => {
    const defaults = DEFAULT_SORT[activeTab];
    setSortKey(defaults.key);
    setSortDirection(defaults.direction);
  }, [activeTab]);

  useEffect(() => {
    setSelectedGroupId('all');
    setSelectedTeamId('all');
    setSelectedPlayerId('all');
  }, [selectedPhaseId]);

  const loadContext = useCallback(async () => {
    if (!tournamentId) return;
    try {
      const response = await fetch(`/api/admin/tournaments/${tournamentId}/standings/context`, { cache: 'no-store' });
      const result = await response.json();
      if (response.ok && result.ok) setStandingsContext(result);
    } catch (error) {
      console.error('Stats context error:', error);
    }
  }, [tournamentId]);

  const loadStandings = useCallback(async () => {
    if (!tournamentId || !selectedPhaseId) return;
    try {
      const params = new URLSearchParams({ phaseId: selectedPhaseId });
      if (selectedGroupId !== 'all') params.set('groupId', selectedGroupId);
      const response = await fetch(`/api/admin/tournaments/${tournamentId}/standings?${params}`, { cache: 'no-store' });
      const result = await response.json();
      if (response.ok && result.ok) setStandingsData(result);
      else setStandingsData(null);
    } catch (error) {
      console.error('Stats standings error:', error);
      setStandingsData(null);
    }
  }, [selectedGroupId, selectedPhaseId, tournamentId]);

  useEffect(() => { loadContext(); }, [loadContext]);
  useEffect(() => { loadStandings(); }, [loadStandings]);

  const fixturePhases = useMemo(() => fixture?.phases || [], [fixture?.phases]);
  const selectedPhase = useMemo(() => fixturePhases.find((phase) => phase.id === selectedPhaseId) || fixturePhases[0] || null, [fixturePhases, selectedPhaseId]);
  const selectedContextPhase = useMemo(() => standingsContext?.phases.find((phase) => phase.id === (selectedPhase?.id || selectedPhaseId)) || null, [selectedPhase?.id, selectedPhaseId, standingsContext?.phases]);
  const groups = useMemo(() => (selectedContextPhase?.groups || []).map((group) => ({ id: group.id, name: group.name })), [selectedContextPhase?.groups]);
  const matches = useMemo(() => phaseMatches(selectedPhase), [selectedPhase]);
  const filteredMatches = useMemo(() => selectedGroupId === 'all' ? matches : matches.filter((match) => match.groupId === selectedGroupId), [matches, selectedGroupId]);
  const finalMatches = useMemo(() => filteredMatches.filter(isFinal), [filteredMatches]);

  const teamRows = useMemo<RowData[]>(() => {
    const byId = new Map<string, RowData>();
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
          status: 'Sin estado',
        });
      }
      return byId.get(id)!;
    };

    (standingsData?.table || []).forEach((row) => {
      const id = row.teamId || row.team?.id || row.teamName || `team-${row.position}`;
      const item = ensure(id, row.team?.name || row.teamName || 'Equipo', row.team?.logo || null);
      item.matches_played = row.played ?? 0;
      item.wins = row.won ?? 0;
      item.draws = row.drawn ?? 0;
      item.losses = row.lost ?? 0;
      item.competition_points = row.total_points ?? 0;
      item.points_for = row.points_for ?? 0;
      item.points_against = row.points_against ?? 0;
      item.points_difference = row.difference ?? 0;
      item.status = row.status || 'Sin estado';
    });

    finalMatches.forEach((match) => {
      const homeId = match.homeClubId || match.homeClub?.id || `home-${match.id}`;
      const awayId = match.awayClubId || match.awayClub?.id || `away-${match.id}`;
      const home = ensure(homeId, match.homeClub?.name || 'Local', match.homeClub?.logo || null);
      const away = ensure(awayId, match.awayClub?.name || 'Visitante', match.awayClub?.logo || null);
      const score = match.score as unknown as Record<string, unknown> | undefined;
      const homeScore = n(score?.home);
      const awayScore = n(score?.away);

      if (!standingsData?.table) {
        home.matches_played = n(home.matches_played) + 1;
        away.matches_played = n(away.matches_played) + 1;
        if (homeScore > awayScore) { home.wins = n(home.wins) + 1; away.losses = n(away.losses) + 1; }
        else if (homeScore < awayScore) { away.wins = n(away.wins) + 1; home.losses = n(home.losses) + 1; }
        else { home.draws = n(home.draws) + 1; away.draws = n(away.draws) + 1; }
        home.points_for = n(home.points_for) + homeScore;
        home.points_against = n(home.points_against) + awayScore;
        away.points_for = n(away.points_for) + awayScore;
        away.points_against = n(away.points_against) + homeScore;
      }

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

    return Array.from(byId.values())
      .map((row) => ({ ...row, points_difference: n(row.points_for) - n(row.points_against) }))
      .filter((row) => selectedTeamId === 'all' || row.entityId === selectedTeamId);
  }, [finalMatches, selectedTeamId, standingsData?.table]);

  const playerRows = useMemo<RowData[]>(() => {
    const byId = new Map<string, RowData>();
    finalMatches.forEach((match) => {
      const counted = new Set<string>();
      const sides = [
        { teamId: match.homeClubId || match.homeClub?.id || `home-${match.id}`, teamName: match.homeClub?.name || 'Local', teamLogo: match.homeClub?.logo || null, lineup: Array.isArray((match.lineups as Record<string, unknown> | null)?.home) ? ((match.lineups as Record<string, unknown>).home as unknown[]) : [] },
        { teamId: match.awayClubId || match.awayClub?.id || `away-${match.id}`, teamName: match.awayClub?.name || 'Visitante', teamLogo: match.awayClub?.logo || null, lineup: Array.isArray((match.lineups as Record<string, unknown> | null)?.away) ? ((match.lineups as Record<string, unknown>).away as unknown[]) : [] },
      ];

      sides.forEach((side) => {
        side.lineup.forEach((entry) => {
          const player = entry as Record<string, unknown>;
          const name = t(player.name);
          if (!name) return;
          const id = `${side.teamId}:${name.toLowerCase()}`;
          if (!byId.has(id)) byId.set(id, {
            entityId: id, entityName: name, entityLogo: side.teamLogo, secondary: side.teamName,
            position: t(player.position) || t(player.role) || '—',
            matches_played: 0, points: 0, tries: 0, tackles: 0, yellow_cards: 0, red_cards: 0,
            conversions: 0, conversion_attempts: 0, penalty_goals: 0, penalty_goal_attempts: 0, kick_meters: 0,
            scrums_won: 0, scrums_lost: 0, lineouts_won: 0, lineouts_lost: 0, rucks_won: 0, rucks_lost: 0, mauls_won: 0, mauls_lost: 0,
          });
          if (!counted.has(id)) { byId.get(id)!.matches_played = n(byId.get(id)!.matches_played) + 1; counted.add(id); }
        });
      });

      (Array.isArray(match.events) ? match.events : []).map(normalizeEvent).filter(Boolean).forEach((event) => {
        const side = event!.team === 'home' ? sides[0] : event!.team === 'away' ? sides[1] : null;
        if (!side || !event!.playerName) return;
        const id = `${side.teamId}:${event!.playerName.toLowerCase()}`;
        if (!byId.has(id)) byId.set(id, {
          entityId: id, entityName: event!.playerName, entityLogo: side.teamLogo, secondary: side.teamName, position: '—',
          matches_played: 0, points: 0, tries: 0, tackles: 0, yellow_cards: 0, red_cards: 0,
          conversions: 0, conversion_attempts: 0, penalty_goals: 0, penalty_goal_attempts: 0, kick_meters: 0,
          scrums_won: 0, scrums_lost: 0, lineouts_won: 0, lineouts_lost: 0, rucks_won: 0, rucks_lost: 0, mauls_won: 0, mauls_lost: 0,
        });
        if (!counted.has(id)) { byId.get(id)!.matches_played = n(byId.get(id)!.matches_played) + 1; counted.add(id); }
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
    return Array.from(byId.values())
      .filter((row) => selectedTeamId === 'all' || String(row.entityId).startsWith(`${selectedTeamId}:`))
      .filter((row) => selectedPlayerId === 'all' || row.entityId === selectedPlayerId);
  }, [finalMatches, selectedPlayerId, selectedTeamId]);

  const cards = useMemo(() => {
    const teamLeader = [...teamRows].sort((a, b) => n(b.competition_points) - n(a.competition_points))[0];
    const pointsLeader = [...playerRows].sort((a, b) => n(b.points) - n(a.points))[0];
    const triesLeader = [...playerRows].sort((a, b) => n(b.tries) - n(a.tries))[0];
    const tacklesLeader = [...playerRows].sort((a, b) => n(b.tackles) - n(a.tackles))[0];
    return [
      pointsLeader ? { label: 'Top Points Scorer', value: fmt(avg(n(pointsLeader.points), n(pointsLeader.matches_played), scope), scope === 'per_match' ? 1 : 0), identity: pointsLeader.entityName, foot: pointsLeader.secondary } : { label: 'Top Points Scorer', value: '—', identity: 'Sin datos', foot: 'Sin eventos de jugador cargados' },
      triesLeader ? { label: 'Top Try Scorer', value: fmt(avg(n(triesLeader.tries), n(triesLeader.matches_played), scope), scope === 'per_match' ? 1 : 0), identity: triesLeader.entityName, foot: triesLeader.secondary } : { label: 'Top Try Scorer', value: '—', identity: 'Sin datos', foot: 'Aún no hay tries asignados' },
      tacklesLeader && n(tacklesLeader.tackles) > 0 ? { label: 'Top Tackler', value: fmt(avg(n(tacklesLeader.tackles), n(tacklesLeader.matches_played), scope), scope === 'per_match' ? 1 : 0), identity: tacklesLeader.entityName, foot: tacklesLeader.secondary } : { label: 'Top Tackler', value: '—', identity: 'Sin datos', foot: 'No hay tackles registrados' },
      teamLeader ? { label: 'Leader Team', value: fmt(avg(n(teamLeader.competition_points), n(teamLeader.matches_played), scope), scope === 'per_match' ? 1 : 0), identity: teamLeader.entityName, foot: scope === 'per_match' ? 'Puntos de competencia por partido' : 'Puntos de competencia' } : { label: 'Leader Team', value: '—', identity: 'Sin datos', foot: 'Sin partidos finalizados' },
    ];
  }, [playerRows, scope, teamRows]);

  const table = useMemo<TableModel>(() => {
    const teamStats = teamRows.map((row) => ({
      ...row,
      competition_points: avg(n(row.competition_points), n(row.matches_played), scope),
      points_for: avg(n(row.points_for), n(row.matches_played), scope),
      points_against: avg(n(row.points_against), n(row.matches_played), scope),
      points_difference: avg(n(row.points_difference), n(row.matches_played), scope),
      tries_scored: avg(n(row.tries_scored), n(row.matches_played), scope),
      tackles_made: avg(n(row.tackles_made), n(row.matches_played), scope),
      penalties_conceded: avg(n(row.penalties_conceded), n(row.matches_played), scope),
      set_piece_success_rate: (() => {
        const won = n(row.scrums_won) + n(row.lineouts_won) + n(row.rucks_won) + n(row.mauls_won);
        const att = n(row.scrums_won) + n(row.scrums_lost) + n(row.lineouts_won) + n(row.lineouts_lost)
          + n(row.rucks_won) + n(row.rucks_lost) + n(row.mauls_won) + n(row.mauls_lost);
        return att > 0 ? (won / att) * 100 : 0;
      })(),
      attack_efficiency: avg(n(row.points_for), n(row.matches_played), 'per_match'),
      defense_efficiency: avg(n(row.points_against), n(row.matches_played), 'per_match'),
      conversion_rate: n(row.tries_scored) > 0 ? (n(row.conversions) / n(row.tries_scored)) * 100 : 0,
      conversion_kick_effectiveness: goalKickEffectivenessPercent(n(row.conversions), n(row.conversion_attempts)),
      penalty_palos_effectiveness: goalKickEffectivenessPercent(n(row.penalty_goals), n(row.penalty_goal_attempts)),
      net_performance_index: avg(n(row.points_difference), n(row.matches_played), 'per_match') + avg(n(row.competition_points), n(row.matches_played), 'per_match'),
      defense_index: avg(n(row.tackles_made), n(row.matches_played), scope) + avg(n(row.turnovers_won), n(row.matches_played), scope) - avg(n(row.points_against), n(row.matches_played), scope),
      discipline_index: avg(n(row.penalties_conceded), n(row.matches_played), scope) + avg(n(row.yellow_cards), n(row.matches_played), scope) + avg(n(row.red_cards), n(row.matches_played), scope) * 3,
      points_scored: avg(n(row.points_for), n(row.matches_played), scope),
      kick_meters: avg(n(row.kick_meters), n(row.matches_played), scope),
    }));
    const players = playerRows.map((row) => ({
      ...row,
      points: avg(n(row.points), n(row.matches_played), scope),
      tries: avg(n(row.tries), n(row.matches_played), scope),
      tackles: avg(n(row.tackles), n(row.matches_played), scope),
      yellow_cards: avg(n(row.yellow_cards), n(row.matches_played), scope),
      red_cards: avg(n(row.red_cards), n(row.matches_played), scope),
      conversions: avg(n(row.conversions), n(row.matches_played), scope),
      conversion_attempts: avg(n(row.conversion_attempts), n(row.matches_played), scope),
      penalty_goals: avg(n(row.penalty_goals), n(row.matches_played), scope),
      penalty_goal_attempts: avg(n(row.penalty_goal_attempts), n(row.matches_played), scope),
      kick_meters: avg(n(row.kick_meters), n(row.matches_played), scope),
      conversion_kick_effectiveness: goalKickEffectivenessPercent(n(row.conversions), n(row.conversion_attempts)),
      penalty_palos_effectiveness: goalKickEffectivenessPercent(n(row.penalty_goals), n(row.penalty_goal_attempts)),
      contests_won: avg(
        n(row.scrums_won) + n(row.lineouts_won) + n(row.rucks_won) + n(row.mauls_won),
        n(row.matches_played),
        scope,
      ),
      contests_lost: avg(
        n(row.scrums_lost) + n(row.lineouts_lost) + n(row.rucks_lost) + n(row.mauls_lost),
        n(row.matches_played),
        scope,
      ),
      contest_effectiveness: goalKickEffectivenessPercent(
        n(row.scrums_won) + n(row.lineouts_won) + n(row.rucks_won) + n(row.mauls_won),
        n(row.scrums_won) + n(row.scrums_lost) + n(row.lineouts_won) + n(row.lineouts_lost)
          + n(row.rucks_won) + n(row.rucks_lost) + n(row.mauls_won) + n(row.mauls_lost),
      ),
    }));
    switch (activeTab) {
      case 'overview': return { title: 'Team Aggregated Stats', subtitle: 'Resumen mixto del contexto actual.', chartKey: 'competition_points', empty: 'No hay datos para el filtro seleccionado.', rows: teamStats, columns: [{ id: 'entity', label: 'Team' }, { id: 'matches_played', label: 'PJ' }, { id: 'competition_points', label: scope === 'per_match' ? 'Pts/PJ' : 'Pts', accent: true }, { id: 'points_for', label: scope === 'per_match' ? 'PF/PJ' : 'PF' }, { id: 'points_difference', label: scope === 'per_match' ? 'Dif/PJ' : 'Dif' }, { id: 'status', label: 'Estado' }] as Column[] };
      case 'team_stats': return { title: 'Team Statistics', subtitle: 'Tabla principal por equipo.', chartKey: 'points_difference', empty: 'No hay suficientes partidos finalizados para armar la tabla principal.', rows: teamStats, columns: [{ id: 'entity', label: 'Team' }, { id: 'matches_played', label: 'PJ' }, { id: 'wins', label: 'PG' }, { id: 'draws', label: 'PE' }, { id: 'losses', label: 'PP' }, { id: 'points_for', label: scope === 'per_match' ? 'PF/PJ' : 'PF' }, { id: 'points_against', label: scope === 'per_match' ? 'PC/PJ' : 'PC' }, { id: 'points_difference', label: scope === 'per_match' ? 'Dif/PJ' : 'Dif' }, { id: 'tries_scored', label: scope === 'per_match' ? 'Tries/PJ' : 'Tries' }, { id: 'competition_points', label: scope === 'per_match' ? 'Pts/PJ' : 'Pts', accent: true }] as Column[] };
      case 'player_stats': return { title: 'Player Statistics', subtitle: 'Derivadas desde eventos y alineaciones.', chartKey: 'points', empty: 'No hay estadísticas de jugadores disponibles todavía.', rows: players, columns: [{ id: 'entity', label: 'Player' }, { id: 'secondary', label: 'Team' }, { id: 'position', label: 'Pos' }, { id: 'matches_played', label: 'PJ' }, { id: 'points', label: scope === 'per_match' ? 'Pts/PJ' : 'Pts', accent: true }, { id: 'tries', label: scope === 'per_match' ? 'Tries/PJ' : 'Tries' }, { id: 'conversions', label: 'Conv OK' }, { id: 'conversion_attempts', label: 'Conv int' }, { id: 'conversion_kick_effectiveness', label: 'Efect. conv' }, { id: 'penalty_goals', label: 'Pen palos' }, { id: 'penalty_goal_attempts', label: 'Pen int' }, { id: 'penalty_palos_effectiveness', label: 'Efect. pen.' }, { id: 'kick_meters', label: scope === 'per_match' ? 'm pat/PJ' : 'm pat' }, { id: 'contests_won', label: 'Fijos G', title: 'Scrum+line+ruck+maul ganados' }, { id: 'contests_lost', label: 'Fijos P', title: 'Scrum+line+ruck+maul perdidos' }, { id: 'contest_effectiveness', label: 'Fijos %', title: 'Efectividad en duelos con resultado' }, { id: 'tackles', label: scope === 'per_match' ? 'Tack/PJ' : 'Tack' }, { id: 'yellow_cards', label: 'YC' }, { id: 'red_cards', label: 'RC' }] as Column[] };
      case 'attack': return { title: 'Attack Metrics', subtitle: 'Producción ofensiva real por equipo.', chartKey: 'points_scored', empty: 'No hay suficientes partidos finalizados para calcular estadísticas ofensivas.', rows: teamStats, columns: [{ id: 'entity', label: 'Team' }, { id: 'tries_scored', label: scope === 'per_match' ? 'Tries/PJ' : 'Tries' }, { id: 'points_scored', label: scope === 'per_match' ? 'Pts/PJ' : 'Pts', accent: true }, { id: 'conversions', label: 'Conv OK', title: 'Conversiones anotadas (no falladas)' }, { id: 'conversion_attempts', label: 'Conv int', title: 'Intentos de conversión' }, { id: 'conversion_kick_effectiveness', label: 'Efect. conv', title: 'Efectividad al palo en conversión' }, { id: 'penalty_goals', label: 'Pen palos OK', title: 'Penales a palos convertidos' }, { id: 'penalty_goal_attempts', label: 'Pen palos int', title: 'Intentos de penal a palos' }, { id: 'penalty_palos_effectiveness', label: 'Efect. pen. palos', title: 'Efectividad en penales a palos' }, { id: 'drop_goals', label: 'Drop' }, { id: 'kick_meters', label: scope === 'per_match' ? 'm patada/PJ' : 'm patada', title: 'Metros de patada en juego' }, { id: 'attack_efficiency', label: 'Attack Eff' }] as Column[] };
      case 'defense': return { title: 'Defense Metrics', subtitle: 'Contención y recuperación derivadas desde partidos finales.', chartKey: 'defense_index', empty: 'No hay suficientes partidos finalizados para calcular estadísticas defensivas.', rows: teamStats, columns: [{ id: 'entity', label: 'Team' }, { id: 'points_against', label: scope === 'per_match' ? 'PC/PJ' : 'PC' }, { id: 'tries_conceded', label: scope === 'per_match' ? 'Tries C/PJ' : 'Tries C' }, { id: 'tackles_made', label: scope === 'per_match' ? 'Tack/PJ' : 'Tack' }, { id: 'turnovers_won', label: 'Turnovers' }, { id: 'defense_index', label: 'Def Index', accent: true, title: 'Tackles + turnovers - puntos concedidos' }] as Column[] };
      case 'discipline': return { title: 'Discipline Metrics', subtitle: 'Tarjetas y penales registrados.', chartKey: 'discipline_index', empty: 'No hay datos disciplinarios para el filtro seleccionado.', rows: teamStats, columns: [{ id: 'entity', label: 'Team' }, { id: 'penalties_conceded', label: scope === 'per_match' ? 'Pen/PJ' : 'Pen' }, { id: 'yellow_cards', label: 'YC' }, { id: 'red_cards', label: 'RC' }, { id: 'discipline_index', label: 'Disc Index', accent: true }] as Column[] };
      case 'set_pieces': return { title: 'Set Piece & contacto', subtitle: 'Scrum, line, ruck y maul con opción ganado / perdido (mismo criterio que el Match Center).', chartKey: 'set_piece_success_rate', empty: 'No hay eventos de fijos o contacto con resultado todavía.', rows: teamStats, columns: [{ id: 'entity', label: 'Team' }, { id: 'scrums_won', label: 'Scrums W' }, { id: 'scrums_lost', label: 'Scrums L' }, { id: 'lineouts_won', label: 'Line W' }, { id: 'lineouts_lost', label: 'Line L' }, { id: 'rucks_won', label: 'Rucks W' }, { id: 'rucks_lost', label: 'Rucks L' }, { id: 'mauls_won', label: 'Mauls W' }, { id: 'mauls_lost', label: 'Mauls L' }, { id: 'set_piece_success_rate', label: 'Efect. %', accent: true, title: 'Ganados / (G+P) en las cuatro categorías' }] as Column[] };
      case 'advanced':
      default: return { title: 'Advanced Performance', subtitle: 'Índices derivados sobre la base real del torneo.', chartKey: 'net_performance_index', empty: 'No hay datos suficientes para las métricas avanzadas.', rows: teamStats, columns: [{ id: 'entity', label: 'Team' }, { id: 'attack_efficiency', label: 'Attack Eff', title: 'Puntos anotados por partido' }, { id: 'defense_efficiency', label: 'Defense Eff', title: 'Puntos concedidos por partido' }, { id: 'competition_points', label: scope === 'per_match' ? 'Pts/PJ' : 'Pts' }, { id: 'conversion_rate', label: 'Conv/Try %', title: 'Conversiones anotadas sobre tries' }, { id: 'conversion_kick_effectiveness', label: 'Efect. conv %', title: 'Aciertos en conversión / intentos' }, { id: 'penalty_palos_effectiveness', label: 'Efect. pen. %', title: 'Penales a palos anotados / intentos' }, { id: 'net_performance_index', label: 'Net Index', accent: true, title: 'Diferencial + puntos de competencia por partido' }] as Column[] };
    }
  }, [activeTab, playerRows, scope, teamRows]);

  const rows = useMemo(() => [...table.rows].sort((a, b) => {
    const left = sortKey === 'entity' ? a.entityName : a[sortKey];
    const right = sortKey === 'entity' ? b.entityName : b[sortKey];
    const modifier = sortDirection === 'asc' ? 1 : -1;
    return typeof left === 'string' || typeof right === 'string' ? String(left ?? '').localeCompare(String(right ?? ''), 'es') * modifier : (n(left) - n(right)) * modifier;
  }), [sortDirection, sortKey, table.rows]);

  const chartRows = useMemo(() => rows.filter((row) => Number.isFinite(Number(row[table.chartKey]))).slice(0, 6), [rows, table.chartKey]);
  const teamOptions = useMemo(() => teamRows.map((row) => ({ id: row.entityId, name: row.entityName })).sort((a, b) => a.name.localeCompare(b.name, 'es')), [teamRows]);
  const playerOptions = useMemo(() => playerRows.map((row) => ({ id: row.entityId, name: `${row.entityName} · ${row.secondary}` })).sort((a, b) => a.name.localeCompare(b.name, 'es')), [playerRows]);
  const insights = useMemo(() => {
    const leader = rows[0];
    return [
      leader ? `${leader.entityName} lidera ${table.title.toLowerCase()} con ${fmt(leader[table.chartKey], Number.isInteger(n(leader[table.chartKey])) ? 0 : 1)}.` : 'No hay líder estadístico para el recorte actual.',
      `${finalMatches.length} de ${filteredMatches.length} partidos de la fase actual ya están finalizados.`,
      playerRows.length > 0 ? `${playerRows.length} jugadores tienen producción individual trazable desde eventos o alineaciones.` : 'Todavía no hay eventos de jugadores suficientes para poblar el módulo individual.',
    ];
  }, [filteredMatches.length, finalMatches.length, playerRows.length, rows, table.chartKey, table.title]);

  const handleRefresh = useCallback(async () => {
    setLoading(true);
    try {
      await refreshFixture();
      await Promise.all([loadContext(), loadStandings()]);
    } finally {
      setLoading(false);
    }
  }, [loadContext, loadStandings, refreshFixture]);

  const handleShare = useCallback(async () => {
    const text = `${data?.name || 'Torneo'} · ${selectedPhase?.name || 'Fase'}\n${insights.join('\n')}`;
    try {
      if (navigator.share) await navigator.share({ title: table.title, text });
      else if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text);
    } catch (error) {
      console.error('Share error:', error);
    }
  }, [data?.name, insights, selectedPhase?.name, table.title]);

  if (!fixture) {
    return <div className={styles.page}><div className={styles.emptyBlock}>Cargando estadísticas del torneo...</div></div>;
  }

  return (
    <div className={styles.page}>
      <section className={styles.header}>
        <div className={styles.headerText}>
          <span className={styles.eyebrow}><Sparkles size={14} /> Sports Statistics Hub</span>
          <h2 className={styles.title}>Tournament Statistics</h2>
          <p className={styles.subtitle}>Módulo real integrado a Operación de Torneo. Lee torneo, fase actual, standings y partidos finalizados para construir cards, tabla, visualizaciones e insights dentro del mismo tab.</p>
          <div className={styles.meta}>
            <span>{sportLabel(data?.sport)}</span>
            <span>{data?.name || 'Torneo sin nombre'}</span>
            <span>{data?.season_id || 'Temporada pendiente'}</span>
            <span>{selectedPhase?.name || 'Fase sin nombre'}</span>
            <span>{data?.category || 'Categoría abierta'}</span>
            <span className={styles.metaAccent}>{data?.status || standingsContext?.tournament?.status || 'draft'}</span>
          </div>
        </div>
        <div className={styles.actions}>
          <button type="button" className={styles.actionButton} onClick={() => downloadCsv(`stats-${activeTab}.csv`, table.columns, rows)}><Download size={14} /> Export CSV</button>
          <button type="button" className={styles.actionButton} onClick={handleShare}><Share2 size={14} /> Share Data</button>
          <button type="button" className={`${styles.actionButton} ${styles.actionPrimary}`} onClick={handleRefresh} disabled={loading}><RefreshCw size={14} className={loading ? styles.spin : ''} /> {loading ? 'Refreshing...' : 'Refresh'}</button>
        </div>
      </section>

      <nav className={styles.tabs}>
        {tabs.map((tab) => <button key={tab.id} type="button" className={`${styles.tab} ${activeTab === tab.id ? styles.tabActive : ''}`} onClick={() => setActiveTab(tab.id)}>{tab.label}</button>)}
      </nav>

      <section className={styles.filters}>
        <label className={styles.field}><span>Fase</span><select className={styles.select} value={selectedPhase?.id || selectedPhaseId} onChange={(event) => setSelectedPhaseId(event.target.value)}>{fixturePhases.map((phase) => <option key={phase.id} value={phase.id}>{phase.name}</option>)}</select></label>
        <label className={styles.field}><span>Grupo / Zona</span><select className={styles.select} value={selectedGroupId} onChange={(event) => setSelectedGroupId(event.target.value)}><option value="all">Todos</option>{groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label>
        <label className={styles.field}><span>Equipo</span><select className={styles.select} value={selectedTeamId} onChange={(event) => setSelectedTeamId(event.target.value)}><option value="all">Todos</option>{teamOptions.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</select></label>
        <label className={styles.field}><span>Jugador</span><select className={styles.select} value={selectedPlayerId} onChange={(event) => setSelectedPlayerId(event.target.value)} disabled={playerOptions.length === 0}><option value="all">Todos</option>{playerOptions.map((player) => <option key={player.id} value={player.id}>{player.name}</option>)}</select></label>
        <label className={styles.field}><span>Scope estadístico</span><select className={styles.select} value={scope} onChange={(event) => setScope(event.target.value as ScopeMode)}><option value="totals">Totales</option><option value="per_match">Por partido</option></select></label>
      </section>

      <section className={styles.cards}>
        {cards.map((card, index) => <article key={`${card.label}-${index}`} className={`${styles.card} ${index === 0 ? styles.cardHighlight : ''}`}><span className={styles.cardLabel}>{card.label}</span><strong className={styles.cardValue}>{card.value}</strong><span className={styles.cardIdentity}>{card.identity}</span><span className={styles.cardFoot}>{card.foot}</span></article>)}
      </section>

      <section className={styles.tableSection}>
        <div className={styles.sectionHeader}>
          <div><h3>{table.title}</h3><p>{table.subtitle}</p></div>
          <div className={styles.sectionMeta}><span>{selectedPhase?.name || 'Fase'}</span><span>{scope === 'per_match' ? 'Per match' : 'Totals'}</span><span>{rows.length} filas</span></div>
        </div>
        {rows.length === 0 || (activeTab === 'set_pieces' && !rows.some((row) => n(row.scrums_won) + n(row.lineouts_won) + n(row.scrums_lost) + n(row.lineouts_lost) + n(row.rucks_won) + n(row.rucks_lost) + n(row.mauls_won) + n(row.mauls_lost) > 0)) ? <div className={styles.emptyBlock}>{table.empty}</div> : <div className={styles.tableWrap}><table className={styles.table}><thead><tr>{table.columns.map((column) => <th key={column.id} className={column.accent ? styles.headAccent : ''} title={column.title}><button type="button" className={styles.sortButton} onClick={() => { if (sortKey === column.id) setSortDirection((current) => current === 'desc' ? 'asc' : 'desc'); else { setSortKey(column.id); setSortDirection(column.id === DEFAULT_SORT[activeTab].key ? DEFAULT_SORT[activeTab].direction : 'desc'); } }}>{column.label}<ArrowDownUp size={12} /></button></th>)}</tr></thead><tbody>{rows.map((row) => <tr key={row.entityId}>{table.columns.map((column) => <td key={`${row.entityId}-${column.id}`}>{column.id === 'entity' ? <div className={styles.entityCell}><div className={styles.entityLogo}>{row.entityLogo ? <img src={String(row.entityLogo)} alt={row.entityName} /> : <span>{logoFallback(row.entityName)}</span>}</div><div><strong>{row.entityName}</strong>{row.secondary ? <span>{row.secondary}</span> : null}</div></div> : column.id === 'set_piece_success_rate' || column.id === 'conversion_rate' || column.id === 'conversion_kick_effectiveness' || column.id === 'penalty_palos_effectiveness' || column.id === 'contest_effectiveness'
            ? (n(row[column.id]) < 0 ? '—' : `${fmt(row[column.id], 1)}%`)
            : typeof row[column.id] === 'number' ? fmt(row[column.id], Number.isInteger(n(row[column.id])) ? 0 : 1) : String(row[column.id] ?? '—')}</td>)}</tr>)}</tbody></table></div>}
      </section>

      <section className={styles.viz}>
        <article className={styles.vizCard}>
          <div className={styles.sectionHeader}><div><h3>Chart principal</h3><p>Comparativa del módulo activo con las filas visibles.</p></div><div className={styles.sectionMeta}><span>Top 6</span><span>{table.chartKey}</span></div></div>
          {chartRows.length === 0 ? <div className={styles.emptyBlock}>{table.empty}</div> : <div className={styles.chartRows}>{chartRows.map((row) => { const value = n(row[table.chartKey]); const max = Math.max(...chartRows.map((entry) => n(entry[table.chartKey])), 1); return <div key={`chart-${row.entityId}`} className={styles.chartRow}><div className={styles.chartLabel}>{row.entityName}</div><div className={styles.chartTrack}><div className={styles.chartFill} style={{ width: `${Math.max((value / max) * 100, value > 0 ? 8 : 0)}%` }} /></div><div className={styles.chartValue}>{fmt(value, Number.isInteger(value) ? 0 : 1)}</div></div>; })}</div>}
        </article>
        <article className={styles.vizCard}>
          <div className={styles.sectionHeader}><div><h3>Insights</h3><p>Lectura editorial del dataset actual.</p></div><div className={styles.sectionMeta}><span>{finalMatches.length} finales</span><span>{playerRows.length} jugadores</span></div></div>
          <ul className={styles.insights}>{insights.map((insight, index) => <li key={`${insight}-${index}`}><Target size={14} /><span>{insight}</span></li>)}</ul>
        </article>
      </section>
    </div>
  );
}
