'use client';
/* eslint-disable @next/next/no-img-element */

import { ArrowDownUp, Download, RefreshCw, Share2, Target } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MatchWithClubs, PhaseWithRounds } from '@/lib/types/fixture';
import { useFixture } from './FixtureContext';
import type { StandingsDataPayload, TournamentContextData } from './standings/types';
import styles from './TournamentStatsTab.module.css';
import './operation-console.css';
import {
  goalKickEffectivenessPercent,
  isGoalKickAttemptEvent,
  isGoalKickMade,
  parseKickMetersFromDetail,
  isContestWonDetail,
  isContestLostDetail,
} from '@/lib/matchEventStats';
import { isRugbySport } from '@/lib/externalProviderPolicy';
import { buildTeamLogoProxyUrl } from '@/lib/utils/logoUrl';
import { PanelSkeleton } from './PanelSkeleton';
import { pickAllowed, useStatsUrlState } from './useStatsUrlState';

type TournamentRow = {
  id?: string;
  name?: string | null;
  /**
   * El slug del deporte ('rugby', 'football'). Este tipo declaraba `sport`, una
   * columna que no existe en `tournaments`: como era opcional, TypeScript no
   * decía nada y la lectura devolvía `undefined` para siempre.
   */
  sport_id?: string | null;
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
  { id: 'overview', label: 'Resumen' },
  { id: 'team_stats', label: 'Equipos' },
  { id: 'player_stats', label: 'Jugadores' },
  { id: 'attack', label: 'Ataque' },
  { id: 'defense', label: 'Defensa' },
  { id: 'discipline', label: 'Disciplina' },
  { id: 'set_pieces', label: 'Formaciones fijas', rugbyOnly: true },
  { id: 'advanced', label: 'Avanzadas' },
];

const TAB_IDS = TABS.map((tab) => tab.id) as readonly StatsTabId[];
const SCOPE_MODES = ['totals', 'per_match'] as const;
const SORT_DIRECTIONS = ['asc', 'desc'] as const;

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

/**
 * El escudo de una fila, siempre por el proxy.
 *
 * Acá había un `logoFallback` que dibujaba las dos primeras letras del nombre
 * cuando faltaba el logo. Es la regla dura del proyecto: los equipos van con su
 * escudo real, nunca con iniciales. Si no hay id de club no hay nada honesto que
 * poner, así que queda el hueco —el nombre está al lado.
 *
 * En Jugadores el `entityId` es `club:jugador`, así que el escudo se resuelve
 * con la parte del club.
 */
function EntityCrest({ row }: { row: RowData }) {
  const clubId = String(row.entityId ?? '').split(':')[0] || null;
  const src = buildTeamLogoProxyUrl({
    key: clubId,
    name: row.entityName,
    fallback: row.entityLogo ? String(row.entityLogo) : null,
  });

  if (!src) return <span aria-hidden="true" />;
  return <img src={src} alt="" loading="lazy" />;
}

const isFinal = (match: MatchWithClubs) => match.status === 'final';
const phaseMatches = (phase: PhaseWithRounds | null | undefined) => (phase ? phase.rounds.flatMap((round) => round.matches || []) : []);

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
  /**
   * Los ocho filtros viven en la URL: la vista se comparte y se abre en una
   * pestaña nueva tal cual quedó. Cada uno se valida contra lo que la pantalla
   * sabe dibujar —una URL editada a mano no puede dejarla en un estado
   * imposible— y los que dependen de datos (equipo, jugador) se comprueban más
   * abajo, cuando ya se sabe qué equipos y jugadores hay.
   */
  const { values: urlStats, setStatsParams } = useStatsUrlState();

  const activeTab = pickAllowed<StatsTabId>(urlStats.statsTab, TAB_IDS, 'overview');
  const setActiveTab = useCallback(
    (next: StatsTabId) => setStatsParams({ statsTab: next === 'overview' ? null : next, statsSort: null, statsDir: null }),
    [setStatsParams],
  );

  const [selectedPhaseId, setSelectedPhaseId] = useState(phaseId || '');

  const selectedGroupId = urlStats.statsGroup || 'all';
  const setSelectedGroupId = useCallback(
    (next: string) => setStatsParams({ statsGroup: next === 'all' ? null : next }),
    [setStatsParams],
  );

  const selectedTeamId = urlStats.statsTeam || 'all';
  const setSelectedTeamId = useCallback(
    // Cambiar de equipo suelta al jugador: pertenece al equipo anterior.
    (next: string) => setStatsParams({ statsTeam: next === 'all' ? null : next, statsPlayer: null }),
    [setStatsParams],
  );

  const selectedPlayerId = urlStats.statsPlayer || 'all';
  const setSelectedPlayerId = useCallback(
    (next: string) => setStatsParams({ statsPlayer: next === 'all' ? null : next }),
    [setStatsParams],
  );

  const scope = pickAllowed<ScopeMode>(urlStats.statsScope, SCOPE_MODES, 'totals');
  const setScope = useCallback(
    (next: ScopeMode) => setStatsParams({ statsScope: next === 'totals' ? null : next }),
    [setStatsParams],
  );

  const sortKey = urlStats.statsSort || DEFAULT_SORT[activeTab].key;
  const sortDirection = pickAllowed<SortDirection>(
    urlStats.statsDir,
    SORT_DIRECTIONS,
    DEFAULT_SORT[activeTab].direction,
  );
  const [loading, setLoading] = useState(false);
  const [standingsContext, setStandingsContext] = useState<TournamentContextData | null>(null);
  const [standingsData, setStandingsData] = useState<StandingsDataPayload | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  /**
   * El deporte se lee de `sport_id`, que guarda el slug ('rugby', 'football').
   * Esto miraba `data.sport`, una columna que NO existe en el esquema: la
   * expresión daba `''` siempre, `isRugby` era siempre falso y la pestaña
   * "Formaciones fijas" —la única marcada `rugbyOnly`— era inalcanzable en
   * todos los torneos, incluidos los de rugby. El mismo error ya se había
   * arreglado en Estructura; acá seguía vivo.
   *
   * Se usa `isRugbySport` y no una comparación con 'rugby' porque el catálogo
   * tiene varias formas del mismo deporte (rugby-union, rugby-league, los ids
   * numéricos de los proveedores).
   */
  const isRugby = isRugbySport(data?.sport_id);
  const tabs = useMemo(() => TABS.filter((tab) => !tab.rugbyOnly || isRugby), [isRugby]);

  useEffect(() => {
    if (phaseId) setSelectedPhaseId(phaseId);
    else if (!selectedPhaseId && fixture?.currentPhaseId) setSelectedPhaseId(fixture.currentPhaseId);
  }, [fixture?.currentPhaseId, phaseId, selectedPhaseId]);

  /**
   * El orden por defecto de cada pestaña ya no necesita un efecto que escriba
   * estado: `sortKey` y `sortDirection` caen solos al default de la pestaña
   * cuando la URL no dice otra cosa, y `setActiveTab` limpia los dos al cambiar
   * de pestaña. Un efecto que pisa estado después del render es un parpadeo con
   * el orden viejo.
   */

  /**
   * Cambiar de fase suelta grupo, equipo y jugador: pertenecen a la fase
   * anterior. Pero SÓLO al cambiar — en el montaje no.
   *
   * La distinción no existía cuando los tres eran `useState` inicializados en
   * 'all': resetear a 'all' lo que ya valía 'all' no hacía nada. Ahora que viven
   * en la URL, el mismo efecto la REESCRIBE, y correrlo al montar borraba los
   * filtros de cualquier URL compartida apenas se abría — justo lo contrario de
   * para qué se llevaron a la URL.
   *
   * El ref arranca en `null` para distinguir "primer render" de "la fase pasó a
   * valer null", que no son lo mismo.
   */
  const fasePreviaRef = useRef<string | null>(null);
  useEffect(() => {
    const previa = fasePreviaRef.current;
    fasePreviaRef.current = selectedPhaseId;

    if (previa === null || previa === selectedPhaseId) return;

    setStatsParams({ statsGroup: null, statsTeam: null, statsPlayer: null });
  }, [selectedPhaseId, setStatsParams]);

  /**
   * Los dos fetch avisan cuando fallan. Antes el error iba a la consola y la
   * pantalla mostraba una tabla vacía: indistinguible de un torneo sin partidos
   * cargados, que es la lectura equivocada y la más tranquilizadora.
   */
  const loadContext = useCallback(async () => {
    if (!tournamentId) return;
    try {
      const response = await fetch(`/api/admin/tournaments/${tournamentId}/standings/context`, { cache: 'no-store' });
      const result = await response.json();
      if (response.ok && result.ok) {
        setStandingsContext(result);
        setLoadError(null);
      } else {
        setLoadError(result?.error || 'No se pudo cargar el contexto del torneo.');
      }
    } catch (error) {
      console.error('Stats context error:', error);
      setLoadError('Error de red al cargar el contexto del torneo.');
    }
  }, [tournamentId]);

  const loadStandings = useCallback(async () => {
    if (!tournamentId || !selectedPhaseId) return;
    try {
      const params = new URLSearchParams({ phaseId: selectedPhaseId });
      if (selectedGroupId !== 'all') params.set('groupId', selectedGroupId);
      const response = await fetch(`/api/admin/tournaments/${tournamentId}/standings?${params}`, { cache: 'no-store' });
      const result = await response.json();
      if (response.ok && result.ok) {
        setStandingsData(result);
        setLoadError(null);
      } else {
        setStandingsData(null);
        setLoadError(result?.error || 'No se pudo cargar la tabla de la fase.');
      }
    } catch (error) {
      console.error('Stats standings error:', error);
      setStandingsData(null);
      setLoadError('Error de red al cargar la tabla de la fase.');
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

  const teamRowsAll = useMemo<RowData[]>(() => {
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
      .map((row) => ({ ...row, points_difference: n(row.points_for) - n(row.points_against) }));
  }, [finalMatches, standingsData?.table]);

  /**
   * El filtro se aplica ACÁ y no adentro del memo de arriba, y esa es toda la
   * diferencia: las opciones del selector de equipo salen de `teamRowsAll`, sin
   * filtrar. Antes salían de la lista ya filtrada, así que elegir un equipo
   * dejaba UN solo equipo en el desplegable y no había forma de pasar a otro sin
   * volver a "Todos" primero. El filtro se comía su propio menú.
   */
  const teamRows = useMemo<RowData[]>(
    () => teamRowsAll.filter((row) => selectedTeamId === 'all' || row.entityId === selectedTeamId),
    [teamRowsAll, selectedTeamId],
  );

  const playerRowsForTeam = useMemo<RowData[]>(() => {
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
    /**
     * Acotado por EQUIPO pero no por jugador: de acá salen las opciones del
     * selector de jugador, y filtrarlo por el jugador ya elegido dejaba uno solo
     * en la lista. Que el equipo sí acote es lo correcto —se elige un club y
     * después alguien de ese club—; que el jugador acote su propio menú, no.
     */
    return Array.from(byId.values())
      .filter((row) => selectedTeamId === 'all' || String(row.entityId).startsWith(`${selectedTeamId}:`));
  }, [finalMatches, selectedTeamId]);

  const playerRows = useMemo<RowData[]>(
    () => playerRowsForTeam.filter((row) => selectedPlayerId === 'all' || row.entityId === selectedPlayerId),
    [playerRowsForTeam, selectedPlayerId],
  );

  const cards = useMemo(() => {
    const teamLeader = [...teamRows].sort((a, b) => n(b.competition_points) - n(a.competition_points))[0];
    const pointsLeader = [...playerRows].sort((a, b) => n(b.points) - n(a.points))[0];
    const triesLeader = [...playerRows].sort((a, b) => n(b.tries) - n(a.tries))[0];
    const tacklesLeader = [...playerRows].sort((a, b) => n(b.tackles) - n(a.tackles))[0];
    return [
      pointsLeader ? { label: 'Máximo anotador', value: fmt(avg(n(pointsLeader.points), n(pointsLeader.matches_played), scope), scope === 'per_match' ? 1 : 0), identity: pointsLeader.entityName, foot: pointsLeader.secondary } : { label: 'Máximo anotador', value: '—', identity: 'Sin datos', foot: 'Sin eventos de jugador cargados' },
      triesLeader ? { label: 'Máximo try-man', value: fmt(avg(n(triesLeader.tries), n(triesLeader.matches_played), scope), scope === 'per_match' ? 1 : 0), identity: triesLeader.entityName, foot: triesLeader.secondary } : { label: 'Máximo try-man', value: '—', identity: 'Sin datos', foot: 'Aún no hay tries asignados' },
      tacklesLeader && n(tacklesLeader.tackles) > 0 ? { label: 'Máximo tackleador', value: fmt(avg(n(tacklesLeader.tackles), n(tacklesLeader.matches_played), scope), scope === 'per_match' ? 1 : 0), identity: tacklesLeader.entityName, foot: tacklesLeader.secondary } : { label: 'Máximo tackleador', value: '—', identity: 'Sin datos', foot: 'No hay tackles registrados' },
      teamLeader ? { label: 'Puntero', value: fmt(avg(n(teamLeader.competition_points), n(teamLeader.matches_played), scope), scope === 'per_match' ? 1 : 0), identity: teamLeader.entityName, foot: scope === 'per_match' ? 'Puntos de competencia por partido' : 'Puntos de competencia' } : { label: 'Puntero', value: '—', identity: 'Sin datos', foot: 'Sin partidos finalizados' },
    ];
  }, [playerRows, scope, teamRows]);

  /**
   * Módulos cuyos números salen de los eventos del partido y no del marcador.
   * «Resumen», «Equipos» y «Avanzadas» se calculan con puntos y partidos, así
   * que funcionan sin eventos; el resto queda en cero hasta que se carguen.
   */
  const eventDependentTab = activeTab === 'attack'
    || activeTab === 'defense'
    || activeTab === 'discipline'
    || activeTab === 'set_pieces'
    || activeTab === 'player_stats';

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
      case 'overview': return { title: 'Resumen por equipo', subtitle: 'Resumen mixto del contexto actual.', chartKey: 'competition_points', empty: 'No hay datos para el filtro seleccionado.', rows: teamStats, columns: [{ id: 'entity', label: 'Equipo' }, { id: 'matches_played', label: 'PJ' }, { id: 'competition_points', label: scope === 'per_match' ? 'Pts/PJ' : 'Pts', accent: true }, { id: 'points_for', label: scope === 'per_match' ? 'PF/PJ' : 'PF' }, { id: 'points_difference', label: scope === 'per_match' ? 'Dif/PJ' : 'Dif' }, { id: 'status', label: 'Estado' }] as Column[] };
      case 'team_stats': return { title: 'Tabla por equipo', subtitle: 'Tabla principal por equipo.', chartKey: 'points_difference', empty: 'No hay suficientes partidos finalizados para armar la tabla principal.', rows: teamStats, columns: [{ id: 'entity', label: 'Equipo' }, { id: 'matches_played', label: 'PJ' }, { id: 'wins', label: 'PG' }, { id: 'draws', label: 'PE' }, { id: 'losses', label: 'PP' }, { id: 'points_for', label: scope === 'per_match' ? 'PF/PJ' : 'PF' }, { id: 'points_against', label: scope === 'per_match' ? 'PC/PJ' : 'PC' }, { id: 'points_difference', label: scope === 'per_match' ? 'Dif/PJ' : 'Dif' }, { id: 'tries_scored', label: scope === 'per_match' ? 'Tries/PJ' : 'Tries' }, { id: 'competition_points', label: scope === 'per_match' ? 'Pts/PJ' : 'Pts', accent: true }] as Column[] };
      case 'player_stats': return { title: 'Tabla por jugador', subtitle: 'Derivadas desde eventos y alineaciones.', chartKey: 'points', empty: 'No hay estadísticas de jugadores disponibles todavía.', rows: players, columns: [{ id: 'entity', label: 'Jugador' }, { id: 'secondary', label: 'Club' }, { id: 'position', label: 'Pos' }, { id: 'matches_played', label: 'PJ' }, { id: 'points', label: scope === 'per_match' ? 'Pts/PJ' : 'Pts', accent: true }, { id: 'tries', label: scope === 'per_match' ? 'Tries/PJ' : 'Tries' }, { id: 'conversions', label: 'Conv OK' }, { id: 'conversion_attempts', label: 'Conv int' }, { id: 'conversion_kick_effectiveness', label: 'Efect. conv' }, { id: 'penalty_goals', label: 'Pen palos' }, { id: 'penalty_goal_attempts', label: 'Pen int' }, { id: 'penalty_palos_effectiveness', label: 'Efect. pen.' }, { id: 'kick_meters', label: scope === 'per_match' ? 'm pat/PJ' : 'm pat' }, { id: 'contests_won', label: 'Fijos G', title: 'Scrum+line+ruck+maul ganados' }, { id: 'contests_lost', label: 'Fijos P', title: 'Scrum+line+ruck+maul perdidos' }, { id: 'contest_effectiveness', label: 'Fijos %', title: 'Efectividad en duelos con resultado' }, { id: 'tackles', label: scope === 'per_match' ? 'Tack/PJ' : 'Tack' }, { id: 'yellow_cards', label: 'Amar.' }, { id: 'red_cards', label: 'Rojas' }] as Column[] };
      case 'attack': return { title: 'Ataque', subtitle: 'Producción ofensiva real por equipo.', chartKey: 'points_scored', empty: 'No hay suficientes partidos finalizados para calcular estadísticas ofensivas.', rows: teamStats, columns: [{ id: 'entity', label: 'Equipo' }, { id: 'tries_scored', label: scope === 'per_match' ? 'Tries/PJ' : 'Tries' }, { id: 'points_scored', label: scope === 'per_match' ? 'Pts/PJ' : 'Pts', accent: true }, { id: 'conversions', label: 'Conv OK', title: 'Conversiones anotadas (no falladas)' }, { id: 'conversion_attempts', label: 'Conv int', title: 'Intentos de conversión' }, { id: 'conversion_kick_effectiveness', label: 'Efect. conv', title: 'Efectividad al palo en conversión' }, { id: 'penalty_goals', label: 'Pen palos OK', title: 'Penales a palos convertidos' }, { id: 'penalty_goal_attempts', label: 'Pen palos int', title: 'Intentos de penal a palos' }, { id: 'penalty_palos_effectiveness', label: 'Efect. pen. palos', title: 'Efectividad en penales a palos' }, { id: 'drop_goals', label: 'Drop' }, { id: 'kick_meters', label: scope === 'per_match' ? 'm patada/PJ' : 'm patada', title: 'Metros de patada en juego' }, { id: 'attack_efficiency', label: 'Efect. ataque' }] as Column[] };
      case 'defense': return { title: 'Defensa', subtitle: 'Contención y recuperación derivadas desde partidos finales.', chartKey: 'defense_index', empty: 'No hay suficientes partidos finalizados para calcular estadísticas defensivas.', rows: teamStats, columns: [{ id: 'entity', label: 'Equipo' }, { id: 'points_against', label: scope === 'per_match' ? 'PC/PJ' : 'PC' }, { id: 'tries_conceded', label: scope === 'per_match' ? 'Tries C/PJ' : 'Tries C' }, { id: 'tackles_made', label: scope === 'per_match' ? 'Tack/PJ' : 'Tack' }, { id: 'turnovers_won', label: 'Turnovers' }, { id: 'defense_index', label: 'Índice def.', accent: true, title: 'Tackles + turnovers - puntos concedidos' }] as Column[] };
      case 'discipline': return { title: 'Disciplina', subtitle: 'Tarjetas y penales registrados.', chartKey: 'discipline_index', empty: 'No hay datos disciplinarios para el filtro seleccionado.', rows: teamStats, columns: [{ id: 'entity', label: 'Equipo' }, { id: 'penalties_conceded', label: scope === 'per_match' ? 'Pen/PJ' : 'Pen' }, { id: 'yellow_cards', label: 'Amar.' }, { id: 'red_cards', label: 'Rojas' }, { id: 'discipline_index', label: 'Índice disc.', accent: true }] as Column[] };
      case 'set_pieces': return { title: 'Formaciones fijas y contacto', subtitle: 'Scrum, line, ruck y maul con opción ganado / perdido (mismo criterio que el Match Center).', chartKey: 'set_piece_success_rate', empty: 'No hay eventos de fijos o contacto con resultado todavía.', rows: teamStats, columns: [{ id: 'entity', label: 'Equipo' }, { id: 'scrums_won', label: 'Scrum G' }, { id: 'scrums_lost', label: 'Scrum P' }, { id: 'lineouts_won', label: 'Line G' }, { id: 'lineouts_lost', label: 'Line P' }, { id: 'rucks_won', label: 'Ruck G' }, { id: 'rucks_lost', label: 'Ruck P' }, { id: 'mauls_won', label: 'Maul G' }, { id: 'mauls_lost', label: 'Maul P' }, { id: 'set_piece_success_rate', label: 'Efect. %', accent: true, title: 'Ganados / (G+P) en las cuatro categorías' }] as Column[] };
      case 'advanced':
      default: return { title: 'Métricas avanzadas', subtitle: 'Índices derivados sobre la base real del torneo.', chartKey: 'net_performance_index', empty: 'No hay datos suficientes para las métricas avanzadas.', rows: teamStats, columns: [{ id: 'entity', label: 'Equipo' }, { id: 'attack_efficiency', label: 'Efect. ataque', title: 'Puntos anotados por partido' }, { id: 'defense_efficiency', label: 'Efect. defensa', title: 'Puntos concedidos por partido' }, { id: 'competition_points', label: scope === 'per_match' ? 'Pts/PJ' : 'Pts' }, { id: 'conversion_rate', label: 'Conv/Try %', title: 'Conversiones anotadas sobre tries' }, { id: 'conversion_kick_effectiveness', label: 'Efect. conv %', title: 'Aciertos en conversión / intentos' }, { id: 'penalty_palos_effectiveness', label: 'Efect. pen. %', title: 'Penales a palos anotados / intentos' }, { id: 'net_performance_index', label: 'Índice neto', accent: true, title: 'Diferencial + puntos de competencia por partido' }] as Column[] };
    }
  }, [activeTab, playerRows, scope, teamRows]);

  const rows = useMemo(() => [...table.rows].sort((a, b) => {
    const left = sortKey === 'entity' ? a.entityName : a[sortKey];
    const right = sortKey === 'entity' ? b.entityName : b[sortKey];
    const modifier = sortDirection === 'asc' ? 1 : -1;
    return typeof left === 'string' || typeof right === 'string' ? String(left ?? '').localeCompare(String(right ?? ''), 'es') * modifier : (n(left) - n(right)) * modifier;
  }), [sortDirection, sortKey, table.rows]);

  const chartRows = useMemo(() => rows.filter((row) => Number.isFinite(Number(row[table.chartKey]))).slice(0, 6), [rows, table.chartKey]);
  // Las opciones salen de las listas SIN el filtro que ellas mismas alimentan.
  const teamOptions = useMemo(() => teamRowsAll.map((row) => ({ id: row.entityId, name: row.entityName })).sort((a, b) => a.name.localeCompare(b.name, 'es')), [teamRowsAll]);
  const playerOptions = useMemo(() => playerRowsForTeam.map((row) => ({ id: row.entityId, name: `${row.entityName} · ${row.secondary}` })).sort((a, b) => a.name.localeCompare(b.name, 'es')), [playerRowsForTeam]);
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

  // El mismo esqueleto que usa el resto de la consola, en vez de una frase
  // suelta sobre una página en blanco: el armazón ya está, faltan los datos.
  if (!fixture) {
    return <div className={styles.page}><PanelSkeleton rows={6} /></div>;
  }

  return (
    <div className={styles.page} aria-busy={loading}>
      {/* Un fallo de carga se dice. Antes iba sólo a la consola del navegador y
          la pantalla quedaba con una tabla vacía, que se lee como "este torneo
          no tiene datos" en vez de "no se pudieron traer". */}
      {loadError && (
        <div className="basalt-toast is-error" role="alert" aria-live="assertive">
          {loadError}
        </div>
      )}
      {/* Cabecera de panel, no de página.
          Acá había un <h2>"Tournament Statistics"</h2> con el rótulo "Sports
          Statistics Hub" y un párrafo que describía la propia arquitectura del
          módulo — más el nombre del torneo, la temporada y la fase, que la
          barra de operación ya muestra. Los módulos suben a la cabecera y los
          botones vuelven al español. */}
      <section className="op-panel">
        <div className="op-panel-head">
          <span className="op-panel-title">Estadísticas</span>
          <div className="op-panel-actions">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={`basalt-btn ${activeTab === tab.id ? 'basalt-btn-accent' : ''}`}
                aria-pressed={activeTab === tab.id}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div className="op-panel-meta">
            <span>{finalMatches.length} partidos finalizados</span>
            <button type="button" className="basalt-btn" onClick={() => downloadCsv(`estadisticas-${activeTab}.csv`, table.columns, rows)}>
              <Download size={13} aria-hidden="true" /> Exportar CSV
            </button>
            <button type="button" className="basalt-btn" onClick={handleShare}>
              <Share2 size={13} aria-hidden="true" /> Compartir
            </button>
            <button type="button" className="basalt-btn" onClick={handleRefresh} disabled={loading}>
              <RefreshCw size={13} className={loading ? styles.spin : ''} aria-hidden="true" />
              {loading ? 'Actualizando…' : 'Actualizar'}
            </button>
          </div>
        </div>
      </section>

      {/* La fase se elige en la barra de operación y baja por prop: acá vivía
          el TERCER selector de fase de la pestaña. */}
      <section className={styles.filters}>
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
          <div className={styles.sectionMeta}><span>{selectedPhase?.name || 'Fase'}</span><span>{scope === 'per_match' ? 'Por partido' : 'Totales'}</span><span>{rows.length} filas</span></div>
        </div>

        {/* Una columna llena de ceros no es un dato: es un dato que falta.
            Las métricas de tries, tackles, conversiones y tarjetas salen de los
            EVENTOS del partido, y este torneo tiene los 56 resultados cargados
            pero ningún evento. Sin este aviso, la tabla de Ataque muestra ocho
            equipos con 0 tries y se lee como si de verdad no hubieran anotado
            ninguno. */}
        {eventDependentTab && playerRows.length === 0 && rows.length > 0 ? (
          <div className="op-note is-info" style={{ marginBottom: 12 }}>
            <span className="op-note-icon">i</span>
            <span className="op-note-copy">
              <strong>Las columnas en cero esperan los eventos del partido</strong>
              <span>
                Tries, tackles, conversiones y tarjetas se cuentan desde los eventos que se
                cargan en el control de cada partido. Este torneo todavía no tiene ninguno, así
                que sólo las columnas que salen del marcador —puntos, diferencia— traen datos.
              </span>
            </span>
          </div>
        ) : null}
        {rows.length === 0 || (activeTab === 'set_pieces' && !rows.some((row) => n(row.scrums_won) + n(row.lineouts_won) + n(row.scrums_lost) + n(row.lineouts_lost) + n(row.rucks_won) + n(row.rucks_lost) + n(row.mauls_won) + n(row.mauls_lost) > 0)) ? <div className={styles.emptyBlock}>{table.empty}</div> : <div className={styles.tableWrap}><table className={styles.table}><thead><tr>{table.columns.map((column) => <th key={column.id} className={column.accent ? styles.headAccent : ''} title={column.title}><button type="button" className={styles.sortButton} onClick={() => { if (sortKey === column.id) setStatsParams({ statsSort: column.id, statsDir: sortDirection === 'desc' ? 'asc' : 'desc' }); else setStatsParams({ statsSort: column.id, statsDir: column.id === DEFAULT_SORT[activeTab].key ? DEFAULT_SORT[activeTab].direction : 'desc' }); }}>{column.label}<ArrowDownUp size={12} /></button></th>)}</tr></thead><tbody>{rows.map((row) => <tr key={row.entityId}>{table.columns.map((column) => <td key={`${row.entityId}-${column.id}`}>{column.id === 'entity' ? <div className={styles.entityCell}><div className={styles.entityLogo}><EntityCrest row={row} /></div><div><strong>{row.entityName}</strong>{row.secondary ? <span>{row.secondary}</span> : null}</div></div> : column.id === 'set_piece_success_rate' || column.id === 'conversion_rate' || column.id === 'conversion_kick_effectiveness' || column.id === 'penalty_palos_effectiveness' || column.id === 'contest_effectiveness'
            ? (n(row[column.id]) < 0 ? '—' : `${fmt(row[column.id], 1)}%`)
            : typeof row[column.id] === 'number' ? fmt(row[column.id], Number.isInteger(n(row[column.id])) ? 0 : 1) : String(row[column.id] ?? '—')}</td>)}</tr>)}</tbody></table></div>}
      </section>

      <section className={styles.viz}>
        <article className={styles.vizCard}>
          <div className={styles.sectionHeader}><div><h3>Comparativa</h3><p>Los seis primeros del módulo activo, sobre las filas visibles.</p></div><div className={styles.sectionMeta}><span>Top 6</span></div></div>
          {chartRows.length === 0 ? <div className={styles.emptyBlock}>{table.empty}</div> : <div className={styles.chartRows}>{chartRows.map((row) => { const value = n(row[table.chartKey]); const max = Math.max(...chartRows.map((entry) => n(entry[table.chartKey])), 1); return <div key={`chart-${row.entityId}`} className={styles.chartRow}><div className={styles.chartLabel}>{row.entityName}</div><div className={styles.chartTrack}><div className={styles.chartFill} style={{ width: `${Math.max((value / max) * 100, value > 0 ? 8 : 0)}%` }} /></div><div className={styles.chartValue}>{fmt(value, Number.isInteger(value) ? 0 : 1)}</div></div>; })}</div>}
        </article>
        <article className={styles.vizCard}>
          <div className={styles.sectionHeader}><div><h3>Lectura</h3><p>Qué dicen los números del recorte actual.</p></div><div className={styles.sectionMeta}><span>{finalMatches.length} finalizados</span><span>{playerRows.length} jugadores</span></div></div>
          <ul className={styles.insights}>{insights.map((insight, index) => <li key={`${insight}-${index}`}><Target size={14} /><span>{insight}</span></li>)}</ul>
        </article>
      </section>
    </div>
  );
}
