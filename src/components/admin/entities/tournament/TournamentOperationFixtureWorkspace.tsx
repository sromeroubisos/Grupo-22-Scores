'use client';

import { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  Calendar,
  CalendarPlus2,
  CheckCircle2,
  ClipboardList,
  Clock3,
  Copy,
  Grip,
  LayoutGrid,
  List,
  Loader2,
  Pencil,
  Plus,
  PlusCircle,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
  Upload,
  WandSparkles,
  X,
  Zap,
} from 'lucide-react';
import type { Database } from '@/lib/database.types';
import type { MatchStatus, MatchWithClubs, RoundWithMatches } from '@/lib/types/fixture';
import type { FixtureImportPreviewResult } from '@/lib/types/fixture-import';
import { StandingsEngine } from '@/lib/services/standingsEngine';
import {
  APP_TIMEZONE,
  combineLocalDateTimeToUtcIso,
  formatDateInTimeZone,
  toInputDateInTimeZone,
  toInputTimeInTimeZone,
} from '@/lib/timezone';
import { FixtureImportWizard } from './FixtureImportWizard';
import { useFixture } from './FixtureContext';
import { useAnimatedDisclosure } from './useAnimatedDisclosure';
import './fixture-management.css';

type TournamentRow = Database['public']['Tables']['tournaments']['Row'];
type MethodId = 'manual_match' | 'structure_only' | 'berger_algorithm' | 'import_fixture';
type WorkspaceSubtabId = 'add_matches' | 'manage_fixture';
type ManageViewMode = 'cards' | 'list';
type ManageGroupingMode = 'rounds' | 'groups' | 'orphans';
type ValidationResult = { isValid?: boolean; diagnostics?: Array<{ type?: string; message?: string; context?: string }> } | null;
type PointsRules = { win: number; draw: number; loss: number };
type RulesConfig = {
  points?: {
    win?: number;
    draw?: number;
    loss?: number;
  };
} & Record<string, unknown>;

type ManualFormState = {
  roundMode: 'existing' | 'new';
  roundId: string;
  roundLabel: string;
  groupId: string;
  homeClubId: string;
  awayClubId: string;
  matchDate: string;
  matchTime: string;
  venue: string;
  status: MatchStatus;
};

type RoundDraftState = {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  notes: string;
};

type ManageEntry = {
  match: MatchWithClubs;
  round: RoundWithMatches;
};

type QuickResultFormState = {
  status: MatchStatus;
  homeScore: string;
  awayScore: string;
  homePenalties: string;
  awayPenalties: string;
  homeBasePoints: string;
  awayBasePoints: string;
  homeBonusPoints: string;
  awayBonusPoints: string;
  pointsAutocalculated: boolean;
  pointsOverrideReason: string;
  scheduledDate: string;
  scheduledTime: string;
};

type ManageContainer = {
  id: string;
  title: string;
  subtitle: string;
  matches: ManageEntry[];
  roundId: string | null;
  editable: boolean;
  tone: 'empty' | 'complete' | 'active';
};

const STATUS_OPTIONS: Array<{ value: MatchStatus; label: string }> = [
  { value: 'scheduled', label: 'Programado' },
  { value: 'live', label: 'En vivo' },
  { value: 'final', label: 'Finalizado' },
  { value: 'postponed', label: 'Reprogramado' },
  { value: 'suspended', label: 'Suspendido' },
  { value: 'cancelled', label: 'Cancelado' },
];

const METHOD_OPTIONS: Array<{
  id: MethodId;
  icon: typeof PlusCircle;
  title: string;
  description: string;
  tone: 'accent-primary' | 'accent-neutral' | 'accent-accent';
}> = [
  { id: 'manual_match', icon: PlusCircle, title: 'Crear partido manual', description: 'Agregar un partido individual con fecha, hora, jornada, sede y equipos.', tone: 'accent-primary' },
  { id: 'import_fixture', icon: Upload, title: 'Importar fixture', description: 'Cargar partidos desde Excel, CSV, PDF o texto pegado.', tone: 'accent-accent' },
  { id: 'structure_only', icon: LayoutGrid, title: 'Generar estructura', description: 'Crear jornadas vacias para completar despues.', tone: 'accent-neutral' },
  { id: 'berger_algorithm', icon: Zap, title: 'Generacion Berger', description: 'Crear automaticamente cruces Round Robin.', tone: 'accent-neutral' },
];

const WORKSPACE_SUBTABS = [
  { id: 'add_matches' as const, label: 'Agregar', title: 'Agregar partidos', description: 'Alta manual, importacion y generacion en un solo lugar.' },
  { id: 'manage_fixture' as const, label: 'Gestionar fixture', title: 'Gestionar fixture', description: 'Cards, filtros y acciones rapidas sobre lo ya cargado.' },
];

const GROUPING_OPTIONS: Array<{ id: ManageGroupingMode; label: string }> = [
  { id: 'rounds', label: 'Por jornada' },
  { id: 'groups', label: 'Por grupo' },
  { id: 'orphans', label: 'Sin jornada' },
];

const IMPORT_STEPS = [
  { id: 'source', label: 'Fuente' },
  { id: 'analysis', label: 'Analisis' },
  { id: 'preview', label: 'Preview' },
  { id: 'confirmation', label: 'Confirmacion' },
];

function todayInputValue() {
  return toInputDateInTimeZone(new Date(), APP_TIMEZONE);
}

function defaultManualForm(): ManualFormState {
  return {
    roundMode: 'existing',
    roundId: '',
    roundLabel: '',
    groupId: '',
    homeClubId: '',
    awayClubId: '',
    matchDate: '',
    matchTime: '',
    venue: '',
    status: 'scheduled',
  };
}

function formatDateLabel(value: string | null | undefined) {
  return formatDateInTimeZone(value, 'es-AR', { day: '2-digit', month: 'short' }, APP_TIMEZONE) || 'Sin fecha';
}

function formatLongDateLabel(value: string | null | undefined) {
  return formatDateInTimeZone(value, 'es-AR', { day: '2-digit', month: 'short', year: 'numeric' }, APP_TIMEZONE) || 'Sin fecha definida';
}

function formatTimeLabel(value: string | null | undefined) {
  return formatDateInTimeZone(value, 'es-AR', { hour: '2-digit', minute: '2-digit', hour12: false }, APP_TIMEZONE) || '--:--';
}

function toInputDate(value: string | null | undefined) {
  return toInputDateInTimeZone(value, APP_TIMEZONE);
}

function toInputTime(value: string | null | undefined) {
  return toInputTimeInTimeZone(value, APP_TIMEZONE);
}

function buildDateTime(date: string, time: string) {
  return combineLocalDateTimeToUtcIso(date, time || '00:00', APP_TIMEZONE);
}

function getStorageKey(tournamentId: string) {
  return `operation-fixture-subtab:${tournamentId}`;
}

function getStatusLabel(status: MatchStatus) {
  return STATUS_OPTIONS.find((option) => option.value === status)?.label || status;
}

function formatGroupLabel(groupId: string | null | undefined, groupLabelById?: Map<string, string>) {
  if (!groupId) return 'Sin grupo';
  return groupLabelById?.get(groupId) || `Grupo ${groupId.slice(0, 8)}`;
}

function resolvePointsRules(phaseSettings: RulesConfig | null | undefined, tournamentRuleset: RulesConfig | null | undefined): PointsRules {
  const resolved = StandingsEngine.resolveRules(phaseSettings, tournamentRuleset);
  return {
    win: Number(resolved.points_for_win ?? 4),
    draw: Number(resolved.points_for_draw ?? 2),
    loss: Number(resolved.points_for_loss ?? 0),
  };
}

function parseQuickNumber(value: string, fallback = 0) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseOptionalQuickNumber(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number.parseInt(trimmed, 10);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : null;
}

function parseQuickPointNumber(value: string, fallback = 0) {
  const parsed = Number.parseFloat(value.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function formatQuickNumber(value: number | null | undefined, fallback = 0) {
  const normalized = Number(value);
  return Number.isFinite(normalized) ? String(normalized) : String(fallback);
}

function formatOptionalQuickNumber(value: number | null | undefined) {
  const normalized = Number(value);
  return Number.isFinite(normalized) ? String(normalized) : '';
}

function shouldShowPenaltyFields(form: Pick<QuickResultFormState, 'status' | 'homeScore' | 'awayScore'>) {
  if (form.status !== 'final') return false;
  const homeScore = Number.parseInt(form.homeScore, 10);
  const awayScore = Number.parseInt(form.awayScore, 10);
  return Number.isFinite(homeScore) && Number.isFinite(awayScore) && homeScore === awayScore;
}

function calculateBasePoints(score: { home: number; away: number }, rules: PointsRules) {
  if (score.home > score.away) return { home: rules.win, away: rules.loss };
  if (score.home < score.away) return { home: rules.loss, away: rules.win };
  return { home: rules.draw, away: rules.draw };
}

function applyQuickPointsAutofill(form: QuickResultFormState, rules: PointsRules): QuickResultFormState {
  if (form.status !== 'final') {
    return {
      ...form,
      homeBasePoints: '0',
      awayBasePoints: '0',
      homeBonusPoints: '0',
      awayBonusPoints: '0',
      pointsAutocalculated: true,
      pointsOverrideReason: '',
    };
  }

  const basePoints = calculateBasePoints(
    {
      home: Math.max(0, parseQuickNumber(form.homeScore)),
      away: Math.max(0, parseQuickNumber(form.awayScore)),
    },
    rules,
  );

  return {
    ...form,
    homeBasePoints: String(basePoints.home),
    awayBasePoints: String(basePoints.away),
    pointsAutocalculated: true,
    pointsOverrideReason: '',
  };
}

function buildQuickResultForm(match: MatchWithClubs, rules: PointsRules): QuickResultFormState {
  const initialForm: QuickResultFormState = {
    status: match.status,
    homeScore: formatQuickNumber(match.score?.home, 0),
    awayScore: formatQuickNumber(match.score?.away, 0),
    homePenalties: formatOptionalQuickNumber(match.score?.penalties?.home),
    awayPenalties: formatOptionalQuickNumber(match.score?.penalties?.away),
    homeBasePoints: formatQuickNumber(match.homeBasePoints, 0),
    awayBasePoints: formatQuickNumber(match.awayBasePoints, 0),
    homeBonusPoints: formatQuickNumber(match.homeBonusPoints, 0),
    awayBonusPoints: formatQuickNumber(match.awayBonusPoints, 0),
    pointsAutocalculated: match.pointsAutocalculated ?? true,
    pointsOverrideReason: match.pointsOverrideReason ?? '',
    scheduledDate: toInputDateInTimeZone(match.dateTime, APP_TIMEZONE),
    scheduledTime: toInputTimeInTimeZone(match.dateTime, APP_TIMEZONE),
  };

  return initialForm.pointsAutocalculated
    ? applyQuickPointsAutofill(initialForm, rules)
    : initialForm;
}

function getMatchTone(status: MatchStatus) {
  if (status === 'live') return 'fixture-status-live';
  if (status === 'final') return 'fixture-status-finished';
  if (status === 'scheduled') return 'fixture-status-scheduled';
  return 'fixture-status-draft';
}

function getContainerTone(round: RoundWithMatches): ManageContainer['tone'] {
  if (round.matches.length === 0) return 'empty';
  if (round.isCompleted) return 'complete';
  return 'active';
}

function buildSearchBlob(entry: ManageEntry) {
  const { match, round } = entry;
  return [
    round.name,
    match.homeClub?.name || '',
    match.homeClub?.shortName || '',
    match.awayClub?.name || '',
    match.awayClub?.shortName || '',
    match.venue || '',
    match.groupId || '',
    getStatusLabel(match.status),
  ].join(' ').toLowerCase();
}

export function TournamentOperationFixtureWorkspace({
  tournament,
  selectedPhaseId,
  onSelectPhase,
}: {
  tournament: TournamentRow;
  selectedPhaseId: string | null;
  onSelectPhase?: (phaseId: string) => void;
}) {
  const {
    fixture,
    isLoadingFixture,
    fixtureError,
    selectPhase,
    refreshFixture,
    generateFixture,
    generateMatches,
    validateFixture,
    saveMatch,
    saveRound,
    deleteMatch,
    deleteMatches,
  } = useFixture();
  const [activeSubtab, setActiveSubtab] = useState<WorkspaceSubtabId>('add_matches');
  const [selectedMethod, setSelectedMethod] = useState<MethodId>('manual_match');
  const [manualForm, setManualForm] = useState<ManualFormState>(() => defaultManualForm());
  const [manualErrors, setManualErrors] = useState<Record<string, string>>({});
  const [editingMatchId, setEditingMatchId] = useState<string | null>(null);
  const [quickResultMatchId, setQuickResultMatchId] = useState<string | null>(null);
  const [quickResultForm, setQuickResultForm] = useState<QuickResultFormState | null>(null);
  const [quickResultErrors, setQuickResultErrors] = useState<Record<string, string>>({});
  const [structureForm, setStructureForm] = useState({ numRounds: 9, namePattern: 'Fecha {n}' });
  const [bergerForm, setBergerForm] = useState({ clubIds: [] as string[], startDate: todayInputValue(), matchTime: '16:00', venue: '', homeAndAway: false });
  const [importPreview, setImportPreview] = useState<FixtureImportPreviewResult | null>(null);
  const [validationData, setValidationData] = useState<ValidationResult>(null);
  const [feedback, setFeedback] = useState<{ tone: 'ok' | 'warn' | 'error'; message: string } | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [manageSearch, setManageSearch] = useState('');
  const [manageRoundFilter, setManageRoundFilter] = useState('all');
  const [manageGroupFilter, setManageGroupFilter] = useState('all');
  const [manageStatusFilter, setManageStatusFilter] = useState<MatchStatus | 'all'>('all');
  const [manageView, setManageView] = useState<ManageViewMode>('cards');
  const [manageGrouping, setManageGrouping] = useState<ManageGroupingMode>('rounds');
  const [selectedManageMatchIds, setSelectedManageMatchIds] = useState<Set<string>>(new Set());
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const [mobileInsightsOpen, setMobileInsightsOpen] = useState(false);
  const [collapsedContainerIds, setCollapsedContainerIds] = useState<Set<string>>(new Set());
  const [roundDraft, setRoundDraft] = useState<RoundDraftState | null>(null);
  const [availableGroups, setAvailableGroups] = useState<Array<{ id: string; name: string; phaseId: string | null; orderIndex: number | null }>>([]);
  const deferredManageSearch = useDeferredValue(manageSearch);
  const mobileInsightsSheet = useAnimatedDisclosure(mobileInsightsOpen, 180);

  useEffect(() => {
    if (selectedPhaseId) selectPhase(selectedPhaseId);
  }, [selectedPhaseId, selectPhase]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = window.localStorage.getItem(getStorageKey(tournament.id));
    if (stored === 'add_matches' || stored === 'manage_fixture') {
      setActiveSubtab(stored);
    }
  }, [tournament.id]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(getStorageKey(tournament.id), activeSubtab);
  }, [activeSubtab, tournament.id]);

  useEffect(() => {
    let cancelled = false;

    const loadGroups = async () => {
      if (!selectedPhaseId) {
        setAvailableGroups([]);
        return;
      }

      try {
        const response = await fetch(`/api/tournaments/${tournament.id}/groups?phaseId=${selectedPhaseId}`, {
          cache: 'no-store',
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const payload = await response.json();
        const nextGroups = Array.isArray(payload)
          ? payload.map((group: { id?: unknown; name?: unknown; phase_id?: unknown; order_index?: unknown }) => ({
              id: String(group.id),
              name: String(group.name || 'Grupo'),
              phaseId: typeof group.phase_id === 'string' ? group.phase_id : null,
              orderIndex: typeof group.order_index === 'number' ? group.order_index : null,
            }))
          : [];

        if (!cancelled) {
          setAvailableGroups(nextGroups);
        }
      } catch (error) {
        console.error('Error loading phase groups for fixture workspace:', error);
        if (!cancelled) {
          setAvailableGroups([]);
        }
      }
    };

    void loadGroups();

    return () => {
      cancelled = true;
    };
  }, [selectedPhaseId, tournament.id]);

  const selectedPhase = useMemo(
    () => fixture?.phases.find((phase) => phase.id === selectedPhaseId) || null,
    [fixture, selectedPhaseId],
  );
  const pointsRules = useMemo(
    () => resolvePointsRules((selectedPhase?.settings as RulesConfig | null | undefined), tournament.ruleset as RulesConfig | null | undefined),
    [selectedPhase?.settings, tournament.ruleset],
  );

  const realRounds = useMemo(
    () => (selectedPhase?.rounds || []).filter((round) => !round.id.startsWith('orphaned-')),
    [selectedPhase],
  );

  const roundDateById = useMemo(
    () => new Map(realRounds.map((round) => [round.id, round.startDate ? toInputDate(round.startDate) : ''])),
    [realRounds],
  );

  const clubOptions = useMemo(() => {
    const seen = new Set<string>();
    return (fixture?.participants || [])
      .filter((participant) => participant.clubId && !seen.has(participant.clubId))
      .map((participant) => {
        seen.add(participant.clubId as string);
        return { value: participant.clubId as string, label: participant.name };
      });
  }, [fixture?.participants]);

  const phaseMatches = useMemo(
    () => selectedPhase?.rounds.flatMap((round) => round.matches) || [],
    [selectedPhase],
  );

  const groupOptions = useMemo(() => {
    const groups = new Map<string, string>();
    availableGroups.forEach((group) => {
      groups.set(group.id, group.name);
    });
    phaseMatches.forEach((match) => {
      if (match.groupId && !groups.has(match.groupId)) {
        groups.set(match.groupId, `Grupo ${match.groupId.slice(0, 8)}`);
      }
    });
    return Array.from(groups, ([value, label]) => ({ value, label }));
  }, [availableGroups, phaseMatches]);

  const groupLabelById = useMemo(
    () => new Map(groupOptions.map((group) => [group.value, group.label])),
    [groupOptions],
  );

  const getGroupLabel = useCallback(
    (groupId: string | null | undefined) => formatGroupLabel(groupId, groupLabelById),
    [groupLabelById],
  );

  const manageEntries = useMemo<ManageEntry[]>(
    () => selectedPhase?.rounds.flatMap((round) => round.matches.map((match) => ({ match, round }))) || [],
    [selectedPhase],
  );

  const summary = useMemo(() => ({
    matchesReady: phaseMatches.filter((match) => match.homeClubId && match.awayClubId && match.dateTime && match.status === 'scheduled').length,
    matchesPending: phaseMatches.filter((match) => match.status !== 'final').length,
    roundsCreated: realRounds.length,
    roundsEmpty: realRounds.filter((round) => round.matches.length === 0).length,
  }), [phaseMatches, realRounds]);

  const structuralChecks = useMemo(() => {
    const phaseConfigured = Boolean(selectedPhaseId && selectedPhase);
    const teamsReady = clubOptions.length >= 2;
    const groupsReady = selectedPhase?.phaseType !== 'group_stage' || groupOptions.length > 0 || phaseMatches.length === 0;
    const calendarReady = validationData?.isValid ?? (phaseMatches.length === 0 || phaseMatches.every((match) => Boolean(match.dateTime)));

    return [
      { label: 'Fase configurada', ok: phaseConfigured, description: phaseConfigured ? `Trabajando sobre ${selectedPhase?.name || 'la fase actual'}.` : 'Selecciona una fase para operar.' },
      { label: 'Equipos disponibles', ok: teamsReady, description: teamsReady ? `${clubOptions.length} clubes listos para programar.` : 'Necesitas al menos dos equipos activos.' },
      { label: 'Grupos validos', ok: groupsReady, description: groupsReady ? 'La estructura de grupos no bloquea la carga.' : 'La fase por grupos no tiene referencias detectadas.' },
      { label: 'Calendario valido', ok: calendarReady, description: calendarReady ? 'No hay conflictos duros detectados.' : 'Revisa cruces o jornadas antes de publicar.' },
    ];
  }, [clubOptions.length, groupOptions.length, phaseMatches, selectedPhase, selectedPhaseId, validationData]);

  useEffect(() => {
    if (clubOptions.length > 0 && bergerForm.clubIds.length === 0) {
      setBergerForm((current) => ({ ...current, clubIds: clubOptions.map((club) => club.value) }));
    }
  }, [bergerForm.clubIds.length, clubOptions]);

  useEffect(() => {
    let cancelled = false;
    const runValidation = async () => {
      const result = (await validateFixture()) as ValidationResult;
      if (!cancelled) setValidationData(result);
    };
    void runValidation();
    return () => {
      cancelled = true;
    };
  }, [fixture, selectedPhaseId, validateFixture]);

  useEffect(() => {
    setManualForm((current) => {
      if (realRounds.length === 0) {
        return { ...current, roundMode: 'new', roundId: '', roundLabel: current.roundLabel || 'Fecha 1' };
      }
      if (current.roundMode === 'existing' && !realRounds.some((round) => round.id === current.roundId)) {
        const firstRoundId = realRounds[0]?.id || '';
        return { ...current, roundId: firstRoundId, matchDate: roundDateById.get(firstRoundId) || '' };
      }
      return current;
    });
  }, [realRounds, roundDateById]);

  useEffect(() => {
    setManualForm((current) => {
      if (!current.groupId) return current;
      return groupOptions.some((group) => group.value === current.groupId)
        ? current
        : { ...current, groupId: '' };
    });
  }, [groupOptions]);

  const filteredManageEntries = useMemo(() => {
    const normalizedQuery = deferredManageSearch.trim().toLowerCase();
    return manageEntries.filter((entry) => {
      if (manageGrouping === 'orphans' && !entry.round.id.startsWith('orphaned-')) return false;
      if (manageGrouping !== 'orphans' && manageRoundFilter !== 'all' && entry.round.id !== manageRoundFilter) return false;
      if (manageGroupFilter !== 'all') {
        if (manageGroupFilter === 'none' && entry.match.groupId) return false;
        if (manageGroupFilter !== 'none' && entry.match.groupId !== manageGroupFilter) return false;
      }
      if (manageStatusFilter !== 'all' && entry.match.status !== manageStatusFilter) return false;
      if (normalizedQuery && !buildSearchBlob(entry).includes(normalizedQuery)) return false;
      return true;
    });
  }, [deferredManageSearch, manageEntries, manageGroupFilter, manageGrouping, manageRoundFilter, manageStatusFilter]);

  const manageContainers = useMemo<ManageContainer[]>(() => {
    if (!selectedPhase) return [];

    if (manageGrouping === 'groups') {
      const map = new Map<string, ManageContainer>();
      filteredManageEntries.forEach((entry) => {
        const key = entry.match.groupId || 'none';
        const title = entry.match.groupId
          ? getGroupLabel(entry.match.groupId)
          : 'Sin grupo';
        const current = map.get(key);
        if (current) {
          current.matches.push(entry);
          return;
        }
        map.set(key, {
          id: `group-${key}`,
          title,
          subtitle: 'Partidos agrupados por grupo',
          matches: [entry],
          roundId: null,
          editable: false,
          tone: 'active',
        });
      });
      return Array.from(map.values()).sort((left, right) => left.title.localeCompare(right.title, 'es'));
    }

    const sourceRounds = manageGrouping === 'orphans'
      ? selectedPhase.rounds.filter((round) => round.id.startsWith('orphaned-'))
      : selectedPhase.rounds;

    const hasFilters = deferredManageSearch.trim() || manageRoundFilter !== 'all' || manageGroupFilter !== 'all' || manageStatusFilter !== 'all' || manageGrouping !== 'rounds';

    return sourceRounds
      .filter((round) => manageGrouping === 'orphans' || manageRoundFilter === 'all' || round.id === manageRoundFilter)
      .map((round) => ({
        id: round.id,
        title: round.name,
        subtitle: round.startDate ? `${formatLongDateLabel(round.startDate)} · ${round.matches.length} partidos` : `${round.matches.length} partidos · Sin fecha general`,
        matches: filteredManageEntries.filter((entry) => entry.round.id === round.id),
        roundId: round.id.startsWith('orphaned-') ? null : round.id,
        editable: !round.id.startsWith('orphaned-'),
        tone: getContainerTone(round),
      }))
      .filter((container) => !hasFilters || manageRoundFilter !== 'all' || container.matches.length > 0 || container.roundId !== null);
  }, [deferredManageSearch, filteredManageEntries, groupOptions, manageGroupFilter, manageGrouping, manageRoundFilter, manageStatusFilter, selectedPhase]);

  const activeFilterCount = useMemo(
    () => [
      manageSearch.trim() ? 1 : 0,
      manageRoundFilter !== 'all' ? 1 : 0,
      manageGroupFilter !== 'all' ? 1 : 0,
      manageStatusFilter !== 'all' ? 1 : 0,
      manageGrouping !== 'rounds' ? 1 : 0,
    ].reduce((sum, value) => sum + value, 0),
    [manageGroupFilter, manageGrouping, manageRoundFilter, manageSearch, manageStatusFilter],
  );

  const selectedPhaseMatchCount = useMemo(
    () => selectedPhase?.rounds.reduce((sum, round) => sum + round.matches.length, 0) || 0,
    [selectedPhase],
  );
  const visibleManageMatchIds = useMemo(
    () => filteredManageEntries.map((entry) => entry.match.id),
    [filteredManageEntries],
  );
  const visibleSelectedManageMatchIds = useMemo(
    () => visibleManageMatchIds.filter((matchId) => selectedManageMatchIds.has(matchId)),
    [selectedManageMatchIds, visibleManageMatchIds],
  );
  const allVisibleManageMatchesSelected = visibleManageMatchIds.length > 0 && visibleSelectedManageMatchIds.length === visibleManageMatchIds.length;

  const orphanMatchCount = useMemo(
    () => selectedPhase?.rounds
      .filter((round) => round.id.startsWith('orphaned-'))
      .reduce((sum, round) => sum + round.matches.length, 0) || 0,
    [selectedPhase],
  );

  useEffect(() => {
    setMobileInsightsOpen(false);
  }, [activeSubtab, selectedMethod, selectedPhaseId]);

  useEffect(() => {
    if (activeSubtab !== 'manage_fixture') {
      setQuickResultMatchId(null);
      setQuickResultForm(null);
      setQuickResultErrors({});
    }
  }, [activeSubtab, selectedPhaseId]);

  useEffect(() => {
    const currentPhaseMatchIds = new Set(phaseMatches.map((match) => match.id));
    setSelectedManageMatchIds((current) => {
      const next = new Set(Array.from(current).filter((matchId) => currentPhaseMatchIds.has(matchId)));
      return next.size === current.size ? current : next;
    });
  }, [phaseMatches]);

  const setManualField = <K extends keyof ManualFormState>(field: K, value: ManualFormState[K]) => {
    setManualForm((current) => {
      if (field === 'roundMode') {
        const nextMode = value as ManualFormState['roundMode'];
        return { ...current, roundMode: nextMode, matchDate: nextMode === 'existing' ? roundDateById.get(current.roundId) || '' : current.matchDate };
      }
      if (field === 'roundId') {
        const nextRoundId = value as string;
        return { ...current, roundId: nextRoundId, matchDate: roundDateById.get(nextRoundId) || '' };
      }
      return { ...current, [field]: value };
    });
    setManualErrors((current) => {
      if (!current[field as string]) return current;
      const next = { ...current };
      delete next[field as string];
      return next;
    });
  };

  const resetManualForm = (overrides?: Partial<ManualFormState>) => {
    const firstRoundId = realRounds[0]?.id || '';
    const nextRoundMode = overrides?.roundMode ?? (realRounds.length > 0 ? 'existing' : 'new');
    const nextRoundId = overrides?.roundId ?? firstRoundId;
    setManualForm({
      ...defaultManualForm(),
      roundMode: nextRoundMode,
      roundId: nextRoundId,
      roundLabel: realRounds.length > 0 ? '' : 'Fecha 1',
      matchDate: overrides?.matchDate ?? (nextRoundMode === 'existing' ? roundDateById.get(nextRoundId) || '' : ''),
      ...overrides,
    });
    setManualErrors({});
    setEditingMatchId(null);
  };

  const openManualCreate = (overrides?: Partial<ManualFormState>) => {
    setActiveSubtab('add_matches');
    setSelectedMethod('manual_match');
    resetManualForm(overrides);
    setFeedback(null);
  };

  const openEditMatch = (match: MatchWithClubs, mode: 'edit' | 'move') => {
    setActiveSubtab('add_matches');
    setSelectedMethod('manual_match');
    setEditingMatchId(match.id);
    setManualErrors({});
    setFeedback(mode === 'move' ? { tone: 'warn', message: 'Cambia la jornada y guarda para mover el partido.' } : null);
    setManualForm({
      roundMode: match.roundId ? 'existing' : 'new',
      roundId: match.roundId || '',
      roundLabel: match.roundId ? '' : match.roundLabel || '',
      groupId: match.groupId || '',
      homeClubId: match.homeClubId || '',
      awayClubId: match.awayClubId || '',
      matchDate: toInputDate(match.dateTime),
      matchTime: toInputTime(match.dateTime),
      venue: match.venue || '',
      status: match.status,
    });
  };

  const openDuplicateMatch = (match: MatchWithClubs) => {
    setActiveSubtab('add_matches');
    setSelectedMethod('manual_match');
    setEditingMatchId(null);
    setManualErrors({});
    setFeedback({ tone: 'ok', message: 'Revisa los datos y guarda para confirmar la copia.' });
    setManualForm({
      roundMode: match.roundId ? 'existing' : 'new',
      roundId: match.roundId || '',
      roundLabel: match.roundId ? '' : match.roundLabel || '',
      groupId: match.groupId || '',
      homeClubId: match.homeClubId || '',
      awayClubId: match.awayClubId || '',
      matchDate: toInputDate(match.dateTime),
      matchTime: toInputTime(match.dateTime),
      venue: match.venue || '',
      status: match.status,
    });
  };

  const openRoundEditor = (round: RoundWithMatches) => {
    if (round.id.startsWith('orphaned-')) return;
    setRoundDraft({
      id: round.id,
      name: round.name,
      startDate: toInputDate(round.startDate),
      endDate: toInputDate(round.endDate),
      notes: round.notes || '',
    });
  };

  const openQuickResultEditor = (match: MatchWithClubs) => {
    setQuickResultErrors({});
    setFeedback(null);
    if (quickResultMatchId === match.id) {
      setQuickResultMatchId(null);
      setQuickResultForm(null);
      return;
    }
    setQuickResultMatchId(match.id);
    setQuickResultForm(buildQuickResultForm(match, pointsRules));
  };

  const setQuickResultField = <K extends keyof QuickResultFormState>(field: K, value: QuickResultFormState[K]) => {
    setQuickResultForm((current) => {
      if (!current) return current;
      const next = { ...current, [field]: value };
      if ((field === 'status' || field === 'homeScore' || field === 'awayScore') && !shouldShowPenaltyFields(next)) {
        next.homePenalties = '';
        next.awayPenalties = '';
      }
      if ((field === 'status' || field === 'homeScore' || field === 'awayScore') && next.pointsAutocalculated) {
        return applyQuickPointsAutofill(next, pointsRules);
      }
      return next;
    });
    setQuickResultErrors((current) => {
      if (!current[field as string]) return current;
      const next = { ...current };
      delete next[field as string];
      return next;
    });
  };

  const setQuickPointsField = (
    field: 'homeBasePoints' | 'awayBasePoints' | 'homeBonusPoints' | 'awayBonusPoints' | 'pointsOverrideReason',
    value: string,
  ) => {
    setQuickResultForm((current) => {
      if (!current) return current;
      return {
        ...current,
        [field]: value,
        pointsAutocalculated: false,
      };
    });
    setQuickResultErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  };

  const autofillQuickPoints = () => {
    setQuickResultForm((current) => {
      if (!current) return current;
      return applyQuickPointsAutofill({ ...current, pointsAutocalculated: true }, pointsRules);
    });
    setQuickResultErrors((current) => {
      const next = { ...current };
      delete next.homeBasePoints;
      delete next.awayBasePoints;
      delete next.homeBonusPoints;
      delete next.awayBonusPoints;
      return next;
    });
  };

  const validateQuickResultForm = () => {
    if (!quickResultForm) return false;
    const nextErrors: Record<string, string> = {};
    const homeScore = Number.parseInt(quickResultForm.homeScore, 10);
    const awayScore = Number.parseInt(quickResultForm.awayScore, 10);

    if (!Number.isFinite(homeScore) || homeScore < 0) nextErrors.homeScore = 'Ingresa un marcador local valido.';
    if (!Number.isFinite(awayScore) || awayScore < 0) nextErrors.awayScore = 'Ingresa un marcador visitante valido.';

    if (shouldShowPenaltyFields(quickResultForm)) {
      const homePenalties = parseOptionalQuickNumber(quickResultForm.homePenalties);
      const awayPenalties = parseOptionalQuickNumber(quickResultForm.awayPenalties);
      const hasOnePenalty = homePenalties !== null || awayPenalties !== null;

      if (hasOnePenalty && homePenalties === null) nextErrors.homePenalties = 'Completa los penales del local o deja ambos vacios.';
      if (hasOnePenalty && awayPenalties === null) nextErrors.awayPenalties = 'Completa los penales del visitante o deja ambos vacios.';
    }

    if (quickResultForm.status === 'final') {
      const homeBasePoints = parseQuickPointNumber(quickResultForm.homeBasePoints, Number.NaN);
      const awayBasePoints = parseQuickPointNumber(quickResultForm.awayBasePoints, Number.NaN);

      if (!Number.isFinite(homeBasePoints) || homeBasePoints < 0) nextErrors.homeBasePoints = 'Los puntos base del local deben ser 0 o mas.';
      if (!Number.isFinite(awayBasePoints) || awayBasePoints < 0) nextErrors.awayBasePoints = 'Los puntos base del visitante deben ser 0 o mas.';
      if (!Number.isFinite(parseQuickPointNumber(quickResultForm.homeBonusPoints, Number.NaN))) nextErrors.homeBonusPoints = 'Ingresa un bonus local valido.';
      if (!Number.isFinite(parseQuickPointNumber(quickResultForm.awayBonusPoints, Number.NaN))) nextErrors.awayBonusPoints = 'Ingresa un bonus visitante valido.';
    }

    setQuickResultErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const validateManualForm = () => {
    const nextErrors: Record<string, string> = {};
    if (!selectedPhaseId) nextErrors.phase = 'Debes seleccionar una fase.';
    if (!manualForm.homeClubId) nextErrors.homeClubId = 'Selecciona el equipo local.';
    if (!manualForm.awayClubId) nextErrors.awayClubId = 'Selecciona el equipo visitante.';
    if (manualForm.homeClubId && manualForm.awayClubId && manualForm.homeClubId === manualForm.awayClubId) {
      nextErrors.awayClubId = 'Local y visitante no pueden ser el mismo club.';
    }
    if (!manualForm.matchDate) nextErrors.matchDate = 'Debes seleccionar una fecha para el partido.';
    if (manualForm.roundMode === 'existing' && realRounds.length > 0 && !manualForm.roundId) nextErrors.roundId = 'Selecciona una jornada.';
    setManualErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const afterMutation = async (message: string, tone: 'ok' | 'warn' | 'error' = 'ok') => {
    await refreshFixture();
    setValidationData((await validateFixture()) as ValidationResult);
    setFeedback({ tone, message });
  };

  const handleQuickResultSave = async (match: MatchWithClubs) => {
    if (!quickResultForm || !validateQuickResultForm()) return;
    setBusyAction(`quick-save-${match.id}`);
    setFeedback(null);
    try {
      const homeScore = Math.max(0, parseQuickNumber(quickResultForm.homeScore));
      const awayScore = Math.max(0, parseQuickNumber(quickResultForm.awayScore));
      const isFinal = quickResultForm.status === 'final';
      const penaltiesVisible = shouldShowPenaltyFields(quickResultForm);
      const homePenalties = penaltiesVisible ? parseOptionalQuickNumber(quickResultForm.homePenalties) : null;
      const awayPenalties = penaltiesVisible ? parseOptionalQuickNumber(quickResultForm.awayPenalties) : null;

      const newDateTime = quickResultForm.scheduledDate && quickResultForm.scheduledTime
        ? combineLocalDateTimeToUtcIso(quickResultForm.scheduledDate, quickResultForm.scheduledTime, APP_TIMEZONE)
        : undefined;

      await saveMatch({
        id: match.id,
        status: quickResultForm.status,
        score: {
          home: homeScore,
          away: awayScore,
          ...(homePenalties !== null && awayPenalties !== null
            ? { penalties: { home: homePenalties, away: awayPenalties } }
            : {}),
        },
        homeBasePoints: isFinal ? Math.max(0, parseQuickPointNumber(quickResultForm.homeBasePoints)) : 0,
        awayBasePoints: isFinal ? Math.max(0, parseQuickPointNumber(quickResultForm.awayBasePoints)) : 0,
        homeBonusPoints: isFinal ? parseQuickPointNumber(quickResultForm.homeBonusPoints) : 0,
        awayBonusPoints: isFinal ? parseQuickPointNumber(quickResultForm.awayBonusPoints) : 0,
        pointsAutocalculated: isFinal ? quickResultForm.pointsAutocalculated : true,
        pointsOverrideReason: isFinal && !quickResultForm.pointsAutocalculated
          ? quickResultForm.pointsOverrideReason.trim() || null
          : null,
        ...(newDateTime ? { dateTime: newDateTime } : {}),
      });
      setQuickResultMatchId(null);
      setQuickResultForm(null);
      setQuickResultErrors({});
      setFeedback({ tone: 'ok', message: 'Resultado y puntos guardados.' });
      void validateFixture()
        .then((result) => setValidationData(result as ValidationResult))
        .catch((error) => {
          console.error('Error validating fixture after quick save:', error);
        });
    } catch (error) {
      setFeedback({ tone: 'error', message: error instanceof Error ? error.message : 'No se pudo guardar el resultado rapido.' });
    } finally {
      setBusyAction(null);
    }
  };

  const handleManualSave = async (keepWorking: boolean) => {
    if (!validateManualForm() || !selectedPhaseId) return;
    setBusyAction(keepWorking ? 'manual-continue' : 'manual-save');
    setFeedback(null);
    try {
      await saveMatch({
        id: editingMatchId || undefined,
        phaseId: selectedPhaseId,
        roundId: manualForm.roundMode === 'existing' ? manualForm.roundId || null : null,
        roundLabel: manualForm.roundMode === 'new' ? manualForm.roundLabel.trim() : undefined,
        groupId: manualForm.groupId || null,
        homeClubId: manualForm.homeClubId,
        awayClubId: manualForm.awayClubId,
        dateTime: buildDateTime(manualForm.matchDate, manualForm.matchTime),
        venue: manualForm.venue,
        status: manualForm.status,
      });
      await afterMutation(editingMatchId ? 'Partido actualizado.' : 'Partido creado.');
      if (editingMatchId) {
        setEditingMatchId(null);
      } else if (keepWorking) {
        setManualForm((current) => ({ ...current, homeClubId: '', awayClubId: '', venue: '', matchTime: '', status: 'scheduled' }));
      } else {
        resetManualForm({ roundMode: manualForm.roundMode, roundId: manualForm.roundId, roundLabel: manualForm.roundLabel, groupId: manualForm.groupId });
      }
    } catch (error) {
      setFeedback({ tone: 'error', message: error instanceof Error ? error.message : 'No se pudo guardar el partido.' });
    } finally {
      setBusyAction(null);
    }
  };

  const handleGenerateStructure = async () => {
    if (!selectedPhaseId) return;
    setBusyAction('structure');
    setFeedback(null);
    const ok = await generateFixture(structureForm);
    if (ok) {
      await afterMutation('Se genero la estructura base.');
      openManualCreate({ roundMode: 'existing', roundId: '' });
    } else {
      setFeedback({ tone: 'error', message: 'No se pudieron generar las jornadas.' });
    }
    setBusyAction(null);
  };

  const handleGenerateBerger = async () => {
    if (!selectedPhaseId || bergerForm.clubIds.length < 2) {
      setFeedback({ tone: 'warn', message: 'Selecciona al menos dos clubes para generar cruces.' });
      return;
    }
    setBusyAction('berger');
    setFeedback(null);
    try {
      const ok = await generateMatches({ phaseId: selectedPhaseId, ...bergerForm });
      if (ok) {
        await afterMutation('Los cruces Berger quedaron cargados.');
        setActiveSubtab('manage_fixture');
      } else {
        setFeedback({ tone: 'error', message: 'No se pudieron generar los cruces.' });
      }
    } catch (error) {
      setFeedback({ tone: 'error', message: error instanceof Error ? error.message : 'No se pudo ejecutar Berger.' });
    } finally {
      setBusyAction(null);
    }
  };

  const handleDeleteMatch = async (match: MatchWithClubs) => {
    if (!window.confirm(`Eliminar ${match.homeClub?.name || 'Local'} vs ${match.awayClub?.name || 'Visitante'}?`)) return;
    setBusyAction(`delete-${match.id}`);
    setFeedback(null);
    try {
      await deleteMatch(match.id);
      setSelectedManageMatchIds((current) => {
        const next = new Set(current);
        next.delete(match.id);
        return next;
      });
      await afterMutation('El partido fue eliminado.');
      if (quickResultMatchId === match.id) {
        setQuickResultMatchId(null);
        setQuickResultForm(null);
        setQuickResultErrors({});
      }
    } catch (error) {
      setFeedback({ tone: 'error', message: error instanceof Error ? error.message : 'No se pudo eliminar el partido.' });
    } finally {
      setBusyAction(null);
    }
  };

  const toggleManageMatchSelection = (matchId: string) => {
    setSelectedManageMatchIds((current) => {
      const next = new Set(current);
      if (next.has(matchId)) next.delete(matchId);
      else next.add(matchId);
      return next;
    });
  };

  const toggleSelectAllVisibleManageMatches = () => {
    setSelectedManageMatchIds((current) => {
      const next = new Set(current);
      if (allVisibleManageMatchesSelected) {
        visibleManageMatchIds.forEach((matchId) => next.delete(matchId));
      } else {
        visibleManageMatchIds.forEach((matchId) => next.add(matchId));
      }
      return next;
    });
  };

  const handleBulkDeleteMatches = async () => {
    if (selectedManageMatchIds.size === 0) return;
    if (!window.confirm(`Eliminar ${selectedManageMatchIds.size} partidos seleccionados? Esta accion no se puede deshacer.`)) return;

    const selectedIds = Array.from(selectedManageMatchIds);
    const totalSelected = selectedIds.length;
    setBusyAction('delete-selected');
    setFeedback(null);
    try {
      await deleteMatches(selectedIds);
      setSelectedManageMatchIds(new Set());
      if (quickResultMatchId && selectedIds.includes(quickResultMatchId)) {
        setQuickResultMatchId(null);
        setQuickResultForm(null);
        setQuickResultErrors({});
      }
      setValidationData((await validateFixture()) as ValidationResult);
      setFeedback({ tone: 'warn', message: `${totalSelected} partidos eliminados.` });
    } catch (error) {
      setFeedback({ tone: 'error', message: error instanceof Error ? error.message : 'No se pudieron eliminar los partidos seleccionados.' });
    } finally {
      setBusyAction(null);
    }
  };

  const handleRoundSave = async () => {
    if (!roundDraft) return;
    setBusyAction(`round-${roundDraft.id}`);
    setFeedback(null);
    try {
      await saveRound(roundDraft.id, {
        name: roundDraft.name,
        startDate: roundDraft.startDate || null,
        endDate: roundDraft.endDate || null,
        notes: roundDraft.notes || null,
      });
      await afterMutation('La jornada fue actualizada.');
      setRoundDraft(null);
    } catch (error) {
      setFeedback({ tone: 'error', message: error instanceof Error ? error.message : 'No se pudo guardar la jornada.' });
    } finally {
      setBusyAction(null);
    }
  };

  const toggleContainer = (containerId: string) => {
    setCollapsedContainerIds((current) => {
      const next = new Set(current);
      if (next.has(containerId)) next.delete(containerId);
      else next.add(containerId);
      return next;
    });
  };

  if (!fixture) {
    if (fixtureError && !isLoadingFixture) {
      return (
        <section className="operation-fixture-loading">
          <AlertTriangle size={22} />
          <div className="flex flex-col items-center gap-3 text-center">
            <strong>No se pudo cargar el workspace de fixture.</strong>
            <p className="text-sm text-dim max-w-xl">{fixtureError}</p>
            <button type="button" className="basalt-btn basalt-btn-primary" onClick={() => void refreshFixture()}>
              <RefreshCw size={15} />
              Reintentar
            </button>
          </div>
        </section>
      );
    }

    return (
      <section className="operation-fixture-loading">
        <Loader2 size={22} className="spin" />
        <span>Cargando workspace de fixture...</span>
      </section>
    );
  }

  const activeMeta = WORKSPACE_SUBTABS.find((item) => item.id === activeSubtab) || WORKSPACE_SUBTABS[0];
  const mobileInsightsSummary = activeSubtab === 'manage_fixture'
    ? `${filteredManageEntries.length} partidos visibles${activeFilterCount > 0 ? ` · ${activeFilterCount} filtros` : ''}`
    : `${summary.roundsCreated} jornadas · ${summary.matchesPending} pendientes`;

  const renderSidebarContent = () => (
    <>
      <section className="operation-side-panel basalt-card">
        <div className="operation-fixture-panel-head">
          <div>
            <span className="operation-fixture-kicker">Resumen</span>
            <h4>Estado de la fase</h4>
          </div>
        </div>
        <div className="operation-summary-grid">
          <div className="operation-summary-card"><span>Partidos listos</span><strong>{summary.matchesReady}</strong></div>
          <div className="operation-summary-card"><span>Partidos pendientes</span><strong>{summary.matchesPending}</strong></div>
          <div className="operation-summary-card"><span>Jornadas creadas</span><strong>{summary.roundsCreated}</strong></div>
          <div className="operation-summary-card"><span>Jornadas vacias</span><strong>{summary.roundsEmpty}</strong></div>
        </div>
      </section>

      {activeSubtab === 'manage_fixture' ? (
        <section className="operation-side-panel basalt-card">
          <div className="operation-fixture-panel-head">
            <div>
              <span className="operation-fixture-kicker">Vista actual</span>
              <h4>Gestion sobre el fixture</h4>
            </div>
          </div>
          <div className="operation-summary-grid">
            <div className="operation-summary-card"><span>Partidos visibles</span><strong>{filteredManageEntries.length}</strong></div>
            <div className="operation-summary-card"><span>Bloques visibles</span><strong>{manageContainers.length}</strong></div>
            <div className="operation-summary-card"><span>Filtros activos</span><strong>{activeFilterCount}</strong></div>
            <div className="operation-summary-card"><span>Vista</span><strong>{manageView === 'cards' ? 'Cards' : 'Lista'}</strong></div>
          </div>
        </section>
      ) : null}

      <section className="operation-side-panel basalt-card">
        <div className="operation-fixture-panel-head">
          <div>
            <span className="operation-fixture-kicker">Chequeo estructural</span>
            <h4>Validacion de la operacion</h4>
          </div>
          <button type="button" className="basalt-btn basalt-btn-ghost" onClick={() => void afterMutation('Chequeo estructural actualizado.', 'ok')}>
            <RefreshCw size={15} />
          </button>
        </div>
        <div className="operation-validation-list">
          {structuralChecks.map((item) => (
            <div key={item.label} className={`operation-validation-item ${item.ok ? 'tone-ok' : 'tone-warn'}`}>
              <span className="operation-validation-icon">{item.ok ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}</span>
              <div>
                <strong>{item.label}</strong>
                <p>{item.description}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {activeSubtab === 'add_matches' && selectedMethod === 'import_fixture' ? (
        <section className="operation-side-panel basalt-card">
          <div className="operation-fixture-panel-head">
            <div>
              <span className="operation-fixture-kicker">Preview actual</span>
              <h4>Estado de la importacion</h4>
            </div>
          </div>
          <div className="operation-summary-grid">
            <div className="operation-summary-card"><span>Clubes vinculados</span><strong>{Math.max((importPreview?.summary.totalRows || 0) - (importPreview?.summary.unmatchedEntities || 0), 0)}</strong></div>
            <div className="operation-summary-card"><span>Clubes sin match</span><strong>{importPreview?.summary.unmatchedEntities || 0}</strong></div>
            <div className="operation-summary-card"><span>Duplicados</span><strong>{importPreview?.summary.duplicateRows || 0}</strong></div>
            <div className="operation-summary-card"><span>Filas invalidas</span><strong>{importPreview?.summary.errorRows || 0}</strong></div>
          </div>
        </section>
      ) : null}

      {activeSubtab === 'manage_fixture' && roundDraft ? (
        <section className="operation-side-panel basalt-card">
          <div className="operation-fixture-panel-head">
            <div>
              <span className="operation-fixture-kicker">Editar jornada</span>
              <h4>Ajustes rapidos</h4>
            </div>
          </div>
          <div className="operation-form-grid">
            <label className="operation-form-field operation-form-field-span-2">
              <span>Nombre</span>
              <input className="basalt-input" type="text" value={roundDraft.name} onChange={(event) => setRoundDraft((current) => current ? { ...current, name: event.target.value } : current)} />
            </label>
            <label className="operation-form-field">
              <span>Fecha inicial</span>
              <input className="basalt-input" type="date" value={roundDraft.startDate} onChange={(event) => setRoundDraft((current) => current ? { ...current, startDate: event.target.value } : current)} />
            </label>
            <label className="operation-form-field">
              <span>Fecha final</span>
              <input className="basalt-input" type="date" value={roundDraft.endDate} onChange={(event) => setRoundDraft((current) => current ? { ...current, endDate: event.target.value } : current)} />
            </label>
          </div>
          <div className="operation-inline-actions">
            <button type="button" className="basalt-btn" onClick={() => setRoundDraft(null)}>Cancelar</button>
            <button type="button" className="basalt-btn basalt-btn-primary" disabled={busyAction === `round-${roundDraft.id}`} onClick={() => void handleRoundSave()}>
              {busyAction === `round-${roundDraft.id}` ? <RefreshCw size={15} className="spin" /> : <Pencil size={15} />}
              Guardar jornada
            </button>
          </div>
        </section>
      ) : null}

      {validationData?.diagnostics?.length ? (
        <section className="operation-side-panel basalt-card">
          <div className="operation-fixture-panel-head">
            <div>
              <span className="operation-fixture-kicker">Alertas</span>
              <h4>Diagnostico actual</h4>
            </div>
          </div>
          <div className="operation-context-list">
            {validationData.diagnostics.slice(0, 5).map((item, index) => (
              <div key={`${item.message}-${index}`} className="operation-context-row">
                <AlertTriangle size={15} />
                <span>{item.message || item.context || 'Advertencia estructural'}</span>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </>
  );

  return (
    <div className="operation-fixture-workspace">
      <div className="operation-fixture-main">
        <section className="operation-fixture-hero basalt-card">
          <div className="operation-fixture-hero-copy">
            <span className="operation-fixture-kicker">Operacion de fixture</span>
            <h3>{activeMeta.title}</h3>
            <p>{activeMeta.description}</p>
          </div>
          <div className="operation-fixture-hero-meta">
            <span className="operation-fixture-meta-label">Fase activa</span>
            <strong>{selectedPhase?.name || 'Sin fase'}</strong>
            <small>{tournament.name || 'Torneo'} · {summary.roundsCreated} jornadas detectadas</small>
          </div>
        </section>

        <section className="operation-mobile-side-trigger basalt-card" aria-label="Panel compacto de fase">
          <div className="operation-mobile-side-trigger-copy">
            <span className="operation-fixture-kicker">Panel de fase</span>
            <strong>{mobileInsightsSummary}</strong>
            <small>Resumen, chequeos y alertas sin sacar foco del flujo principal.</small>
          </div>
          <button type="button" className="basalt-btn basalt-btn-primary" onClick={() => setMobileInsightsOpen(true)}>
            <ClipboardList size={15} />
            Ver panel
          </button>
        </section>

        {feedback ? (
          <div className={`operation-feedback operation-feedback-${feedback.tone}`}>
            {feedback.tone === 'error' ? <AlertTriangle size={16} /> : <CheckCircle2 size={16} />}
            <span>{feedback.message}</span>
          </div>
        ) : null}

        <div className="operation-fixture-subtabs" role="tablist" aria-label="Subtabs de fixture">
          {WORKSPACE_SUBTABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={`operation-fixture-subtab ${activeSubtab === tab.id ? 'active' : ''}`}
              onClick={() => setActiveSubtab(tab.id)}
            >
              <span>{tab.label}</span>
              <small>{tab.description}</small>
            </button>
          ))}
        </div>

        {activeSubtab === 'add_matches' ? (
          <>
            <section className="operation-fixture-panel basalt-card">
              <div className="operation-fixture-panel-head">
                <div>
                  <span className="operation-fixture-kicker">Metodos</span>
                  <h4>Como quieres agregar partidos</h4>
                  <p>Selecciona una card y el panel activo se abre debajo sin salir de la sub-tab.</p>
                </div>
              </div>
              <div className="operation-method-grid">
                {METHOD_OPTIONS.map((option) => {
                  const Icon = option.icon;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      className={`operation-method-card ${option.tone} ${selectedMethod === option.id ? 'is-active' : ''}`}
                      onClick={() => setSelectedMethod(option.id)}
                    >
                      <span className="operation-method-icon"><Icon size={20} /></span>
                      <div className="operation-method-copy">
                        <strong>{option.title}</strong>
                        <p>{option.description}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>

            {selectedMethod === 'manual_match' ? (
              <section className="operation-fixture-panel basalt-card">
                <div className="operation-fixture-panel-head">
                  <div>
                    <span className="operation-fixture-kicker">Carga manual</span>
                    <h4>{editingMatchId ? 'Editar partido' : 'Crear partido manualmente'}</h4>
                    <p>El campo fecha del partido es obligatorio y queda visible junto a la hora.</p>
                  </div>
                  {editingMatchId ? (
                    <button type="button" className="basalt-btn" onClick={() => openManualCreate()}>
                      <Plus size={15} />
                      Nuevo
                    </button>
                  ) : null}
                </div>

                <div className="operation-manual-round-mode">
                  <button type="button" className={`operation-mode-chip ${manualForm.roundMode === 'existing' ? 'is-active' : ''}`} onClick={() => setManualField('roundMode', 'existing')} disabled={realRounds.length === 0}>
                    <ClipboardList size={15} />
                    <span>Usar jornada existente</span>
                  </button>
                  <button type="button" className={`operation-mode-chip ${manualForm.roundMode === 'new' ? 'is-active' : ''}`} onClick={() => setManualField('roundMode', 'new')}>
                    <CalendarPlus2 size={15} />
                    <span>Crear jornada rapida</span>
                  </button>
                </div>

                <div className="operation-manual-grid">
                  {manualForm.roundMode === 'existing' ? (
                    <label className="operation-form-field">
                      <span>Jornada</span>
                      <select className="basalt-input" value={manualForm.roundId} onChange={(event) => setManualField('roundId', event.target.value)}>
                        <option value="">{realRounds.length ? 'Selecciona una jornada' : 'No hay jornadas todavia'}</option>
                        {realRounds.map((round) => <option key={round.id} value={round.id}>{round.name}</option>)}
                      </select>
                      {manualErrors.roundId ? <small className="operation-field-error">{manualErrors.roundId}</small> : null}
                    </label>
                  ) : (
                    <label className="operation-form-field">
                      <span>Nueva jornada</span>
                      <input className="basalt-input" type="text" value={manualForm.roundLabel} onChange={(event) => setManualField('roundLabel', event.target.value)} placeholder="Fecha 1" />
                      {manualErrors.roundLabel ? <small className="operation-field-error">{manualErrors.roundLabel}</small> : null}
                    </label>
                  )}

                  <label className="operation-form-field">
                    <span>Grupo o zona</span>
                    <select className="basalt-input" value={manualForm.groupId} onChange={(event) => setManualField('groupId', event.target.value)}>
                      <option value="">Sin grupo</option>
                      {groupOptions.map((group) => <option key={group.value} value={group.value}>{group.label}</option>)}
                    </select>
                  </label>

                  <label className="operation-form-field">
                    <span>Equipo local</span>
                    <select className="basalt-input" value={manualForm.homeClubId} onChange={(event) => setManualField('homeClubId', event.target.value)}>
                      <option value="">Selecciona el local</option>
                      {clubOptions.map((club) => <option key={club.value} value={club.value}>{club.label}</option>)}
                    </select>
                    {manualErrors.homeClubId ? <small className="operation-field-error">{manualErrors.homeClubId}</small> : null}
                  </label>

                  <label className="operation-form-field">
                    <span>Equipo visitante</span>
                    <select className="basalt-input" value={manualForm.awayClubId} onChange={(event) => setManualField('awayClubId', event.target.value)}>
                      <option value="">Selecciona el visitante</option>
                      {clubOptions.map((club) => <option key={club.value} value={club.value}>{club.label}</option>)}
                    </select>
                    {manualErrors.awayClubId ? <small className="operation-field-error">{manualErrors.awayClubId}</small> : null}
                  </label>

                  <label className="operation-form-field">
                    <span>Fecha del partido</span>
                    <input className="basalt-input" type="date" value={manualForm.matchDate} onChange={(event) => setManualField('matchDate', event.target.value)} />
                    <small className="operation-field-hint">Selecciona la fecha en la que se jugara el partido.</small>
                    {manualErrors.matchDate ? <small className="operation-field-error">{manualErrors.matchDate}</small> : null}
                  </label>

                  <label className="operation-form-field">
                    <span>Hora del partido</span>
                    <input className="basalt-input" type="time" value={manualForm.matchTime} onChange={(event) => setManualField('matchTime', event.target.value)} />
                    <small className="operation-field-hint">Hora de inicio del partido (opcional).</small>
                  </label>

                  <label className="operation-form-field">
                    <span>Sede o cancha</span>
                    <input className="basalt-input" type="text" value={manualForm.venue} onChange={(event) => setManualField('venue', event.target.value)} placeholder="Cancha 1" />
                  </label>

                  <label className="operation-form-field">
                    <span>Estado</span>
                    <select className="basalt-input" value={manualForm.status} onChange={(event) => setManualField('status', event.target.value as MatchStatus)}>
                      {STATUS_OPTIONS.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}
                    </select>
                  </label>
                </div>

                {manualErrors.phase ? <small className="operation-field-error">{manualErrors.phase}</small> : null}

                <div className="operation-inline-note">
                  <ShieldCheck size={16} />
                  <span>El partido quedara vinculado a la fase actual y se refrescara dentro de Gestionar fixture.</span>
                </div>

                <div className="operation-inline-actions">
                  {editingMatchId ? (
                    <>
                      <button type="button" className="basalt-btn" onClick={() => openManualCreate()}>Cancelar edicion</button>
                      <button type="button" className="basalt-btn basalt-btn-primary" disabled={busyAction === 'manual-save'} onClick={() => void handleManualSave(false)}>
                        {busyAction === 'manual-save' ? <RefreshCw size={15} className="spin" /> : <Pencil size={15} />}
                        Guardar cambios
                      </button>
                    </>
                  ) : (
                    <>
                      <button type="button" className="basalt-btn basalt-btn-primary" disabled={busyAction === 'manual-save'} onClick={() => void handleManualSave(false)}>
                        {busyAction === 'manual-save' ? <RefreshCw size={15} className="spin" /> : <Plus size={15} />}
                        Crear partido
                      </button>
                      <button type="button" className="basalt-btn" disabled={busyAction === 'manual-continue'} onClick={() => void handleManualSave(true)}>
                        {busyAction === 'manual-continue' ? <RefreshCw size={15} className="spin" /> : <PlusCircle size={15} />}
                        Crear y agregar otro
                      </button>
                    </>
                  )}
                </div>
              </section>
            ) : null}

            {selectedMethod === 'structure_only' ? (
              <section className="operation-fixture-panel basalt-card">
                <div className="operation-fixture-panel-head">
                  <div>
                    <span className="operation-fixture-kicker">Estructura base</span>
                    <h4>Generar jornadas vacias</h4>
                    <p>Crea bloques de jornadas para completar despues desde la sub-tab de gestion.</p>
                  </div>
                </div>
                <div className="operation-form-grid">
                  <label className="operation-form-field">
                    <span>Cantidad de jornadas</span>
                    <input className="basalt-input" type="number" min={1} value={structureForm.numRounds} onChange={(event) => setStructureForm((current) => ({ ...current, numRounds: Number(event.target.value) || 1 }))} />
                  </label>
                  <label className="operation-form-field">
                    <span>Patron de nombre</span>
                    <input className="basalt-input" type="text" value={structureForm.namePattern} onChange={(event) => setStructureForm((current) => ({ ...current, namePattern: event.target.value }))} placeholder="Fecha {n}" />
                  </label>
                </div>
                <div className="operation-inline-actions">
                  <button type="button" className="basalt-btn basalt-btn-primary" disabled={busyAction === 'structure'} onClick={() => void handleGenerateStructure()}>
                    {busyAction === 'structure' ? <RefreshCw size={15} className="spin" /> : <LayoutGrid size={15} />}
                    Generar jornadas
                  </button>
                </div>
              </section>
            ) : null}

            {selectedMethod === 'berger_algorithm' ? (
              <section className="operation-fixture-panel basalt-card">
                <div className="operation-fixture-panel-head">
                  <div>
                    <span className="operation-fixture-kicker">Generacion automatica</span>
                    <h4>Cruces Berger</h4>
                    <p>Selecciona clubes, fecha base y sede por defecto antes de crear el calendario.</p>
                  </div>
                </div>
                <div className="operation-team-picker">
                  {clubOptions.map((club) => {
                    const selected = bergerForm.clubIds.includes(club.value);
                    return (
                      <label key={club.value} className={`operation-team-chip ${selected ? 'is-selected' : ''}`}>
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={() => setBergerForm((current) => ({
                            ...current,
                            clubIds: selected ? current.clubIds.filter((id) => id !== club.value) : [...current.clubIds, club.value],
                          }))}
                        />
                        <span>{club.label}</span>
                      </label>
                    );
                  })}
                </div>
                <div className="operation-form-grid">
                  <label className="operation-form-field">
                    <span>Fecha de inicio</span>
                    <input className="basalt-input" type="date" value={bergerForm.startDate} onChange={(event) => setBergerForm((current) => ({ ...current, startDate: event.target.value }))} />
                  </label>
                  <label className="operation-form-field">
                    <span>Hora base</span>
                    <input className="basalt-input" type="time" value={bergerForm.matchTime} onChange={(event) => setBergerForm((current) => ({ ...current, matchTime: event.target.value }))} />
                  </label>
                  <label className="operation-form-field operation-form-field-span-2">
                    <span>Sede por defecto</span>
                    <input className="basalt-input" type="text" value={bergerForm.venue} onChange={(event) => setBergerForm((current) => ({ ...current, venue: event.target.value }))} placeholder="Sede principal" />
                  </label>
                </div>
                <label className="operation-toggle">
                  <input type="checkbox" checked={bergerForm.homeAndAway} onChange={(event) => setBergerForm((current) => ({ ...current, homeAndAway: event.target.checked }))} />
                  <span>Crear ida y vuelta</span>
                </label>
                <div className="operation-inline-actions">
                  <button type="button" className="basalt-btn basalt-btn-primary" disabled={busyAction === 'berger'} onClick={() => void handleGenerateBerger()}>
                    {busyAction === 'berger' ? <RefreshCw size={15} className="spin" /> : <WandSparkles size={15} />}
                    Generar cruces
                  </button>
                </div>
              </section>
            ) : null}

            {selectedMethod === 'import_fixture' ? (
              <section className="operation-fixture-panel basalt-card">
                <div className="operation-fixture-panel-head">
                  <div>
                    <span className="operation-fixture-kicker">Importacion guiada</span>
                    <h4>Importar fixture con preview</h4>
                    <p>La fuente se analiza primero, luego se corrige fila por fila y solo despues se confirma.</p>
                  </div>
                </div>
                <div className="operation-import-steps">
                  {IMPORT_STEPS.map((step, index) => (
                    <div key={step.id} className={`operation-import-step ${importPreview || index === 0 ? 'is-active' : ''}`}>
                      <span>{index + 1}</span>
                      <strong>{step.label}</strong>
                    </div>
                  ))}
                </div>
                <div className="operation-form-grid" style={{ marginBottom: 16 }}>
                  <label className="operation-form-field operation-form-field-span-2">
                    <span>Fase destino de la importacion</span>
                    <select
                      className="basalt-input"
                      value={selectedPhaseId || ''}
                      onChange={(event) => {
                        const nextPhaseId = event.target.value;
                        setImportPreview(null);
                        selectPhase(nextPhaseId);
                        onSelectPhase?.(nextPhaseId);
                      }}
                    >
                      {(fixture?.phases || []).map((phase) => (
                        <option key={phase.id} value={phase.id}>
                          {phase.name}
                        </option>
                      ))}
                    </select>
                    <small className="operation-field-hint">
                      El preview y la confirmacion usaran esta fase como destino para los partidos importados.
                    </small>
                  </label>
                </div>
                <FixtureImportWizard
                  phaseId={selectedPhaseId || ''}
                  onBack={() => setSelectedMethod('manual_match')}
                  onPreviewChange={setImportPreview}
                  onComplete={() => {
                    void afterMutation('La importacion quedo confirmada.');
                    setActiveSubtab('manage_fixture');
                  }}
                />
              </section>
            ) : null}

          </>
        ) : (
          <section className="operation-fixture-panel basalt-card operation-manage-panel">
            <div className="operation-fixture-panel-head">
              <div>
                <span className="operation-fixture-kicker">Herramientas de gestion</span>
                <h4>Vista operativa del fixture</h4>
                <p>Recupera el sistema visual por cards y evita bajar por toda la pantalla para administrar partidos.</p>
              </div>
            </div>

            <div className="operation-manage-toolbar">
              <label className="operation-manage-search">
                <Search size={16} />
                <input type="search" value={manageSearch} onChange={(event) => setManageSearch(event.target.value)} placeholder="Buscar por equipo, sede o estado..." />
              </label>

              <button type="button" className="operation-manage-mobile-toggle" onClick={() => setShowMobileFilters((current) => !current)} aria-expanded={showMobileFilters}>
                <span>Filtros</span>
                <small>{activeFilterCount > 0 ? `${activeFilterCount} activos` : 'Compactos'}</small>
              </button>

              <div className={`operation-manage-toolbar-grid ${showMobileFilters ? 'is-open' : ''}`}>
                <label className="operation-form-field">
                  <span>Jornada</span>
                  <select className="basalt-input" value={manageRoundFilter} onChange={(event) => setManageRoundFilter(event.target.value)}>
                    <option value="all">Todas las jornadas</option>
                    {selectedPhase?.rounds.map((round) => <option key={round.id} value={round.id}>{round.name}</option>)}
                  </select>
                </label>

                <label className="operation-form-field">
                  <span>Grupo</span>
                  <select className="basalt-input" value={manageGroupFilter} onChange={(event) => setManageGroupFilter(event.target.value)}>
                    <option value="all">Todos los grupos</option>
                    <option value="none">Sin grupo</option>
                    {groupOptions.map((group) => <option key={group.value} value={group.value}>{group.label}</option>)}
                  </select>
                </label>

                <label className="operation-form-field">
                  <span>Estado</span>
                  <select className="basalt-input" value={manageStatusFilter} onChange={(event) => setManageStatusFilter(event.target.value as MatchStatus | 'all')}>
                    <option value="all">Todos los estados</option>
                    {STATUS_OPTIONS.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}
                  </select>
                </label>

                <div className="operation-manage-inline-groups">
                  <span className="operation-manage-inline-label">Agrupar por</span>
                  <div className="operation-manage-toggle">
                    {GROUPING_OPTIONS.map((option) => (
                      <button key={option.id} type="button" className={manageGrouping === option.id ? 'active' : ''} onClick={() => setManageGrouping(option.id)}>
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="operation-manage-inline-groups">
                  <span className="operation-manage-inline-label">Vista</span>
                  <div className="operation-manage-toggle">
                    <button type="button" className={manageView === 'cards' ? 'active' : ''} onClick={() => setManageView('cards')}>
                      <LayoutGrid size={15} />
                      <span>Cards</span>
                    </button>
                    <button type="button" className={manageView === 'list' ? 'active' : ''} onClick={() => setManageView('list')}>
                      <List size={15} />
                      <span>Lista</span>
                    </button>
                  </div>
                </div>

                <button type="button" className="basalt-btn basalt-btn-primary operation-manage-create" onClick={() => openManualCreate()}>
                  <Plus size={15} />
                  Crear partido
                </button>
              </div>
            </div>

            {manageView === 'list' && filteredManageEntries.length > 0 ? (
              <div className="operation-manage-bulkbar fixture-glass">
                <label className="operation-manage-bulkselect">
                  <input
                    type="checkbox"
                    checked={allVisibleManageMatchesSelected}
                    onChange={toggleSelectAllVisibleManageMatches}
                  />
                  <span>Seleccionar visibles ({visibleSelectedManageMatchIds.length}/{visibleManageMatchIds.length})</span>
                </label>

                <div className="operation-manage-bulkactions">
                  <span className="operation-manage-badge">
                    {selectedManageMatchIds.size} seleccionados
                  </span>
                  <button type="button" className="btn-secondary" onClick={() => setSelectedManageMatchIds(new Set())} disabled={selectedManageMatchIds.size === 0 || busyAction === 'delete-selected'}>
                    Limpiar
                  </button>
                  <button type="button" className="btn-danger-outline" onClick={() => void handleBulkDeleteMatches()} disabled={selectedManageMatchIds.size === 0 || busyAction === 'delete-selected'}>
                    {busyAction === 'delete-selected' ? <RefreshCw size={14} className="spin" /> : <Trash2 size={14} />}
                    <span>Eliminar seleccionados</span>
                  </button>
                </div>
              </div>
            ) : null}

            {manageContainers.length > 0 ? (
              manageView === 'cards' ? (
                <div className="operation-manage-cards-stack">
                  {manageContainers.map((container) => {
                    const collapsed = collapsedContainerIds.has(container.id);
                    return (
                      <section key={container.id} className={`fixture-round-section ${collapsed ? 'is-collapsed' : 'is-expanded'}`}>
                        <div
                          className="fixture-round-summary"
                          onClick={() => toggleContainer(container.id)}
                          role="button"
                          tabIndex={0}
                          aria-expanded={!collapsed}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              toggleContainer(container.id);
                            }
                          }}
                        >
                          <header className="fixture-round-header">
                            <div className="fixture-round-title">
                              <span className="fixture-round-index">{String(container.matches.length).padStart(2, '0')}</span>
                              <div>
                                <h3>{container.title}</h3>
                                <p>{container.subtitle}</p>
                              </div>
                            </div>

                            <div className="fixture-round-meta">
                              <span className="fixture-round-count">{container.matches.length} visibles</span>
                              <span className={`fixture-pill ${container.tone === 'empty' ? 'fixture-pill-draft' : container.tone === 'complete' ? 'fixture-pill-success' : 'fixture-pill-info'}`}>
                                {container.tone === 'empty' ? 'Vacia' : container.tone === 'complete' ? 'Completa' : 'Activa'}
                              </span>
                              <div className="operation-manage-round-actions">
                                {container.roundId ? (
                                  <button type="button" className="fixture-icon-btn" title="Agregar partido a esta jornada" onClick={(event) => { event.stopPropagation(); openManualCreate({ roundMode: 'existing', roundId: container.roundId as string, roundLabel: '' }); }}>
                                    <Plus size={15} />
                                  </button>
                                ) : null}
                                {container.editable ? (
                                  <button
                                    type="button"
                                    className="fixture-icon-btn"
                                    title="Editar jornada"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      const round = selectedPhase?.rounds.find((item) => item.id === container.id);
                                      if (round) openRoundEditor(round);
                                    }}
                                  >
                                    <Pencil size={15} />
                                  </button>
                                ) : null}
                              </div>
                            </div>
                          </header>
                        </div>

                        <div className={`fixture-round-details ${!collapsed ? 'is-expanded' : ''}`}>
                          <div className="fixture-matches-grid">
                            {container.matches.length > 0 ? (
                              container.matches.map((entry) => (
                                <MatchCard
                                  key={entry.match.id}
                                  entry={entry}
                                  groupLabel={entry.match.groupId ? getGroupLabel(entry.match.groupId) : null}
                                  busyAction={busyAction}
                                  quickResultForm={quickResultMatchId === entry.match.id ? quickResultForm : null}
                                  quickResultErrors={quickResultMatchId === entry.match.id ? quickResultErrors : {}}
                                  quickResultOpen={quickResultMatchId === entry.match.id}
                                  onEdit={() => openEditMatch(entry.match, 'edit')}
                                  onQuickResult={() => openQuickResultEditor(entry.match)}
                                  onQuickResultFieldChange={setQuickResultField}
                                  onQuickPointsFieldChange={setQuickPointsField}
                                  onQuickPointsAutofill={autofillQuickPoints}
                                  onQuickResultSave={() => void handleQuickResultSave(entry.match)}
                                  onMove={() => openEditMatch(entry.match, 'move')}
                                  onDuplicate={() => openDuplicateMatch(entry.match)}
                                  onDelete={() => void handleDeleteMatch(entry.match)}
                                />
                              ))
                            ) : (
                              <div className="fixture-round-empty-card">
                                <Calendar size={28} />
                                <h4>Sin partidos visibles</h4>
                                <p>Prueba con otros filtros o agrega un partido a este bloque.</p>
                              </div>
                            )}
                          </div>
                        </div>
                      </section>
                    );
                  })}
                </div>
              ) : (
                <div className="operation-manage-list">
                  {filteredManageEntries.map((entry) => (
                    <div key={entry.match.id} className={`operation-manage-list-row ${selectedManageMatchIds.has(entry.match.id) ? 'is-selected' : ''}`}>
                      <label
                        className="operation-manage-check"
                        aria-label={`Seleccionar ${entry.match.homeClub?.name || 'Local'} vs ${entry.match.awayClub?.name || 'Visitante'}`}
                      >
                        <input
                          type="checkbox"
                          checked={selectedManageMatchIds.has(entry.match.id)}
                          onChange={() => toggleManageMatchSelection(entry.match.id)}
                        />
                      </label>
                      <div className="operation-manage-list-main">
                        <strong>{entry.match.homeClub?.name || 'Local'} vs {entry.match.awayClub?.name || 'Visitante'}</strong>
                        <small>
                          {entry.round.name}
                          {entry.match.groupId ? ` · ${getGroupLabel(entry.match.groupId)}` : ''}
                          {entry.match.venue ? ` · ${entry.match.venue}` : ''}
                        </small>
                      </div>
                      <div className="operation-manage-list-meta">
                        <span>{formatDateLabel(entry.match.dateTime)} · {formatTimeLabel(entry.match.dateTime)}</span>
                        <span className={`fixture-pill ${getMatchTone(entry.match.status)}`}>{getStatusLabel(entry.match.status)}</span>
                      </div>
                      <div className="operation-match-actions">
                        <button type="button" className="operation-match-action" onClick={() => openEditMatch(entry.match, 'edit')}><Pencil size={14} /></button>
                        <button type="button" className="operation-match-action" onClick={() => openEditMatch(entry.match, 'move')}><Grip size={14} /></button>
                        <button type="button" className="operation-match-action" onClick={() => openDuplicateMatch(entry.match)}><Copy size={14} /></button>
                        <button type="button" className="operation-match-action danger" disabled={busyAction === `delete-${entry.match.id}`} onClick={() => void handleDeleteMatch(entry.match)}>
                          {busyAction === `delete-${entry.match.id}` ? <RefreshCw size={14} className="spin" /> : <Trash2 size={14} />}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )
            ) : (
              <div className="operation-empty-state">
                <span className="operation-empty-icon"><Calendar size={24} /></span>
                <strong>
                  {manageGrouping === 'orphans' && selectedPhaseMatchCount > 0 && orphanMatchCount === 0
                    ? 'Todos los partidos ya estan asignados a jornadas'
                    : 'No hay partidos para los filtros actuales'}
                </strong>
                <p>
                  {manageGrouping === 'orphans' && selectedPhaseMatchCount > 0 && orphanMatchCount === 0
                    ? 'Esta vista solo muestra partidos sin jornada. Cambia a Por jornada para ver los encuentros ya importados.'
                    : 'Prueba con otra combinacion de filtros o vuelve a Agregar para cargar nuevos encuentros.'}
                </p>
                <div className="operation-empty-actions">
                  {manageGrouping === 'orphans' && selectedPhaseMatchCount > 0 && orphanMatchCount === 0 ? (
                    <button type="button" className="basalt-btn basalt-btn-primary" onClick={() => setManageGrouping('rounds')}>
                      <Calendar size={15} />
                      Ver por jornada
                    </button>
                  ) : (
                    <>
                      <button type="button" className="basalt-btn basalt-btn-primary" onClick={() => openManualCreate()}>
                        <Plus size={15} />
                        Crear partido manual
                      </button>
                      <button type="button" className="basalt-btn" onClick={() => { setActiveSubtab('add_matches'); setSelectedMethod('import_fixture'); }}>
                        <Upload size={15} />
                        Importar fixture
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}
          </section>
        )}
      </div>

      <aside className="operation-fixture-side operation-fixture-side-desktop">
        {renderSidebarContent()}
      </aside>

      {mobileInsightsSheet.shouldRender ? (
        <>
          <button
            type="button"
            className={`basalt-sheet-backdrop operation-side-sheet-backdrop ${mobileInsightsSheet.isVisible ? 'is-open' : ''}`}
            aria-label="Cerrar panel de fase"
            onClick={() => setMobileInsightsOpen(false)}
          />
          <aside
            className={`operation-fixture-side-sheet ${mobileInsightsSheet.isVisible ? 'is-open' : ''}`}
            role="dialog"
            aria-modal="true"
            aria-label="Panel de fase"
          >
            <div className="operation-fixture-side-sheet-head">
              <div>
                <span className="operation-fixture-kicker">Panel de fase</span>
                <strong>Resumen operativo</strong>
              </div>
              <button
                type="button"
                className="basalt-btn basalt-btn-ghost operation-fixture-side-sheet-close"
                onClick={() => setMobileInsightsOpen(false)}
                aria-label="Cerrar panel"
              >
                <X size={18} />
              </button>
            </div>
            <div className="operation-fixture-side-sheet-body">
              {renderSidebarContent()}
            </div>
          </aside>
        </>
      ) : null}
    </div>
  );
}

function MatchCard({
  entry,
  groupLabel,
  busyAction,
  quickResultForm,
  quickResultErrors,
  quickResultOpen,
  onEdit,
  onQuickResult,
  onQuickResultFieldChange,
  onQuickPointsFieldChange,
  onQuickPointsAutofill,
  onQuickResultSave,
  onMove,
  onDuplicate,
  onDelete,
}: {
  entry: ManageEntry;
  groupLabel: string | null;
  busyAction: string | null;
  quickResultForm: QuickResultFormState | null;
  quickResultErrors: Record<string, string>;
  quickResultOpen: boolean;
  onEdit: () => void;
  onQuickResult: () => void;
  onQuickResultFieldChange: <K extends keyof QuickResultFormState>(field: K, value: QuickResultFormState[K]) => void;
  onQuickPointsFieldChange: (
    field: 'homeBasePoints' | 'awayBasePoints' | 'homeBonusPoints' | 'awayBonusPoints' | 'pointsOverrideReason',
    value: string,
  ) => void;
  onQuickPointsAutofill: () => void;
  onQuickResultSave: () => void;
  onMove: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const { match, round } = entry;
  const [showScheduleEdit, setShowScheduleEdit] = useState(false);
  const handleQuickResultToggle = () => {
    if (quickResultOpen) setShowScheduleEdit(false);
    onQuickResult();
  };
  const handleQuickResultSave = () => {
    setShowScheduleEdit(false);
    onQuickResultSave();
  };
  const quickBusy = busyAction === `quick-save-${match.id}`;
  const scoreVisible = match.status === 'live' || match.status === 'final';
  const totalHomePoints = quickResultForm ? parseQuickPointNumber(quickResultForm.homeBasePoints) + parseQuickPointNumber(quickResultForm.homeBonusPoints) : 0;
  const totalAwayPoints = quickResultForm ? parseQuickPointNumber(quickResultForm.awayBasePoints) + parseQuickPointNumber(quickResultForm.awayBonusPoints) : 0;
  const getGroupLabel = (groupId: string | null | undefined) => groupLabel ?? formatGroupLabel(groupId);
  const manageHref = `/admin/super/partidos/${match.id}`;
  const matchLabel = `${match.homeClub?.name || 'Local'} vs ${match.awayClub?.name || 'Visitante'}`;

  return (
    <article
      className={`fixture-match-card fixture-glass ${getMatchTone(match.status)}`}
      style={{ cursor: 'pointer' }}
    >
      <Link
        href={manageHref}
        className="fixture-match-link"
        aria-label={`Abrir control de partido de ${matchLabel}`}
        title="Abrir control de partido. También puedes hacer click derecho para abrirlo en otro panel."
      />
      <div className="fixture-match-top">
        <div>
          <span className="fixture-match-headline">{formatDateLabel(match.dateTime)} · {formatTimeLabel(match.dateTime)}</span>
          <span className="fixture-match-subline">
            {round.name}
            {match.groupId ? ` · ${getGroupLabel(match.groupId)}` : ''}
          </span>
        </div>
        <span className={`fixture-pill ${getMatchTone(match.status)}`}>{getStatusLabel(match.status)}</span>
      </div>

      <div className="fixture-match-teams">
        <TeamBlock side="Local" team={match.homeClub} fallback="Local" />
        <div className="fixture-match-center">
          <span className="fixture-match-center-label">{scoreVisible ? 'Resultado' : 'Versus'}</span>
          <strong>{scoreVisible ? `${match.score?.home ?? 0}-${match.score?.away ?? 0}` : 'VS'}</strong>
        </div>
        <TeamBlock side="Visitante" team={match.awayClub} fallback="Visitante" />
      </div>

      <div className="fixture-match-footer">
        <div className="fixture-match-meta">
          <span><Clock3 size={14} />{formatLongDateLabel(match.dateTime)} · {formatTimeLabel(match.dateTime)}</span>
          <span><Calendar size={14} />{match.venue || 'Sede por definir'}</span>
        </div>

        <div className="fixture-match-actions" onClick={(e) => e.stopPropagation()}>
          <button className="fixture-mini-btn" onClick={onEdit}>
            <Pencil size={14} />
            <span>Editar</span>
          </button>
          <button className={`fixture-mini-btn ${quickResultOpen ? 'is-active' : ''}`} onClick={handleQuickResultToggle}>
            <Zap size={14} />
            <span>Resultado rapido</span>
          </button>
          <button className="fixture-icon-btn" title="Mover de jornada" onClick={onMove}>
            <Grip size={14} />
          </button>
          <button className="fixture-icon-btn" title="Duplicar partido" onClick={onDuplicate}>
            <Copy size={14} />
          </button>
          <button className="fixture-icon-btn" title="Eliminar partido" onClick={onDelete} disabled={busyAction === `delete-${match.id}`}>
            {busyAction === `delete-${match.id}` ? <RefreshCw size={14} className="spin" /> : <Trash2 size={14} />}
          </button>
        </div>
      </div>

      {quickResultOpen && quickResultForm ? (
        <div className="fixture-quick-editor" onClick={(event) => event.stopPropagation()}>
          <div className="fixture-quick-editor-head">
            <div>
              <span className="fixture-quick-kicker">Carga express</span>
              <strong>Resultado y puntos para la tabla</strong>
            </div>
            <button type="button" className="fixture-icon-btn" title="Cerrar carga rapida" onClick={handleQuickResultToggle}>
              <X size={14} />
            </button>
          </div>

          <div className="fixture-quick-grid fixture-quick-grid-score">
            <label className="fixture-quick-field">
              <span>Estado</span>
              <select value={quickResultForm.status} onChange={(event) => onQuickResultFieldChange('status', event.target.value as MatchStatus)}>
                {STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
            <label className="fixture-quick-field">
              <span>Local</span>
              <input type="number" min={0} value={quickResultForm.homeScore} onChange={(event) => onQuickResultFieldChange('homeScore', event.target.value)} />
              {quickResultErrors.homeScore ? <small className="operation-field-error">{quickResultErrors.homeScore}</small> : null}
            </label>
            <label className="fixture-quick-field">
              <span>Visitante</span>
              <input type="number" min={0} value={quickResultForm.awayScore} onChange={(event) => onQuickResultFieldChange('awayScore', event.target.value)} />
              {quickResultErrors.awayScore ? <small className="operation-field-error">{quickResultErrors.awayScore}</small> : null}
            </label>
          </div>

          {shouldShowPenaltyFields(quickResultForm) ? (
            <>
              <div className="fixture-quick-points-head">
                <div>
                  <span className="fixture-quick-kicker">Desempate</span>
                  <strong>Penales opcionales</strong>
                </div>
              </div>
              <div className="fixture-quick-grid fixture-quick-grid-score">
                <label className="fixture-quick-field">
                  <span>Penales local</span>
                  <input type="number" min={0} value={quickResultForm.homePenalties} onChange={(event) => onQuickResultFieldChange('homePenalties', event.target.value)} placeholder="Opcional" />
                  {quickResultErrors.homePenalties ? <small className="operation-field-error">{quickResultErrors.homePenalties}</small> : null}
                </label>
                <label className="fixture-quick-field">
                  <span>Penales visitante</span>
                  <input type="number" min={0} value={quickResultForm.awayPenalties} onChange={(event) => onQuickResultFieldChange('awayPenalties', event.target.value)} placeholder="Opcional" />
                  {quickResultErrors.awayPenalties ? <small className="operation-field-error">{quickResultErrors.awayPenalties}</small> : null}
                </label>
              </div>
            </>
          ) : null}

          <div className="fixture-quick-points-head">
            <div>
              <span className="fixture-quick-kicker">Tabla</span>
              <strong>{quickResultForm.status === 'final' ? 'Puntos del partido' : 'Se limpiaran hasta finalizar el partido'}</strong>
            </div>
            <button type="button" className="basalt-btn basalt-btn-ghost fixture-quick-autofill" onClick={onQuickPointsAutofill}>
              <RefreshCw size={14} />
              Autocompletar
            </button>
          </div>

          <div className="fixture-quick-grid">
            <label className="fixture-quick-field">
              <span>Base local</span>
              <input type="number" min={0} step="any" value={quickResultForm.homeBasePoints} onChange={(event) => onQuickPointsFieldChange('homeBasePoints', event.target.value)} />
              {quickResultErrors.homeBasePoints ? <small className="operation-field-error">{quickResultErrors.homeBasePoints}</small> : null}
            </label>
            <label className="fixture-quick-field">
              <span>Base visitante</span>
              <input type="number" min={0} step="any" value={quickResultForm.awayBasePoints} onChange={(event) => onQuickPointsFieldChange('awayBasePoints', event.target.value)} />
              {quickResultErrors.awayBasePoints ? <small className="operation-field-error">{quickResultErrors.awayBasePoints}</small> : null}
            </label>
            <label className="fixture-quick-field">
              <span>Bonus / ajuste local</span>
              <input type="number" step="any" value={quickResultForm.homeBonusPoints} onChange={(event) => onQuickPointsFieldChange('homeBonusPoints', event.target.value)} />
              {quickResultErrors.homeBonusPoints ? <small className="operation-field-error">{quickResultErrors.homeBonusPoints}</small> : null}
            </label>
            <label className="fixture-quick-field">
              <span>Bonus / ajuste visitante</span>
              <input type="number" step="any" value={quickResultForm.awayBonusPoints} onChange={(event) => onQuickPointsFieldChange('awayBonusPoints', event.target.value)} />
              {quickResultErrors.awayBonusPoints ? <small className="operation-field-error">{quickResultErrors.awayBonusPoints}</small> : null}
            </label>
          </div>

          <div className="fixture-quick-totals">
            <div className="fixture-quick-total-card">
              <span>Total local</span>
              <strong>{quickResultForm.status === 'final' ? totalHomePoints : 0}</strong>
            </div>
            <div className="fixture-quick-total-card">
              <span>Total visitante</span>
              <strong>{quickResultForm.status === 'final' ? totalAwayPoints : 0}</strong>
            </div>
          </div>

          {!quickResultForm.pointsAutocalculated && quickResultForm.status === 'final' ? (
            <label className="fixture-quick-field">
              <span>Motivo del ajuste</span>
              <textarea rows={2} value={quickResultForm.pointsOverrideReason} onChange={(event) => onQuickPointsFieldChange('pointsOverrideReason', event.target.value)} placeholder="Ej: sancion, correccion o bonus manual" />
            </label>
          ) : null}

          <button type="button" className="fixture-quick-schedule-toggle" onClick={() => setShowScheduleEdit((v) => !v)}>
            <Clock3 size={13} />
            <span>Editar horario</span>
            <svg className={`fixture-quick-chevron ${showScheduleEdit ? 'is-open' : ''}`} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
          </button>

          {showScheduleEdit ? (
            <div className="fixture-quick-grid fixture-quick-grid-schedule">
              <label className="fixture-quick-field">
                <span>Fecha</span>
                <input type="date" value={quickResultForm.scheduledDate} onChange={(event) => onQuickResultFieldChange('scheduledDate', event.target.value)} />
              </label>
              <label className="fixture-quick-field">
                <span>Hora</span>
                <input type="time" value={quickResultForm.scheduledTime} onChange={(event) => onQuickResultFieldChange('scheduledTime', event.target.value)} />
              </label>
            </div>
          ) : null}

          <div className="fixture-quick-actions">
            <span className={`fixture-quick-badge ${quickResultForm.pointsAutocalculated ? 'is-auto' : 'is-manual'}`}>
              {quickResultForm.pointsAutocalculated ? 'Puntos autocompletados' : 'Puntos editados manualmente'}
            </span>
            <div className="fixture-quick-action-btns">
              <button type="button" className="basalt-btn basalt-btn-ghost" onClick={() => setShowScheduleEdit((v) => !v)}>
                <Clock3 size={14} />
                Editar horario
              </button>
              <button type="button" className="basalt-btn basalt-btn-primary" disabled={quickBusy} onClick={handleQuickResultSave}>
                {quickBusy ? <RefreshCw size={14} className="spin" /> : <CheckCircle2 size={14} />}
                Guardar rapido
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </article>
  );
}

function TeamBlock({
  side,
  team,
  fallback,
}: {
  side: string;
  team: MatchWithClubs['homeClub'];
  fallback: string;
}) {
  return (
    <div className="fixture-team-block">
      <span className="fixture-team-side">{side}</span>
      <div className="fixture-team-logo">
        {team?.logo ? <img src={team.logo} alt={team.name} className="fixture-team-logo-image" /> : <ShieldCheck size={24} />}
      </div>
      <span className="fixture-team-name">{team?.shortName || team?.name || fallback}</span>
    </div>
  );
}
