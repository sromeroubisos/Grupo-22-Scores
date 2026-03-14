'use client';

import { useDeferredValue, useEffect, useMemo, useState } from 'react';
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
  Zap,
} from 'lucide-react';
import type { Database } from '@/lib/database.types';
import type { MatchStatus, MatchWithClubs, RoundWithMatches } from '@/lib/types/fixture';
import type { FixtureImportPreviewResult } from '@/lib/types/fixture-import';
import { FixtureImportWizard } from './FixtureImportWizard';
import { useFixture } from './FixtureContext';
import './fixture-management.css';

type TournamentRow = Database['public']['Tables']['tournaments']['Row'];
type MethodId = 'manual_match' | 'structure_only' | 'berger_algorithm' | 'import_fixture';
type WorkspaceSubtabId = 'add_matches' | 'manage_fixture';
type ManageViewMode = 'cards' | 'list';
type ManageGroupingMode = 'rounds' | 'groups' | 'orphans';
type ValidationResult = { isValid?: boolean; diagnostics?: Array<{ type?: string; message?: string; context?: string }> } | null;

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
  return new Date().toISOString().slice(0, 10);
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
  if (!value) return 'Sin fecha';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Sin fecha';
  return date.toLocaleDateString('es-AR', { day: '2-digit', month: 'short' });
}

function formatLongDateLabel(value: string | null | undefined) {
  if (!value) return 'Sin fecha definida';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Sin fecha definida';
  return date.toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatTimeLabel(value: string | null | undefined) {
  if (!value) return '--:--';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '--:--';
  return date.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
}

function toInputDate(value: string | null | undefined) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

function toInputTime(value: string | null | undefined) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(11, 16);
}

function buildDateTime(date: string, time: string) {
  return `${date}T${time || '00:00'}:00`;
}

function getStorageKey(tournamentId: string) {
  return `operation-fixture-subtab:${tournamentId}`;
}

function getStatusLabel(status: MatchStatus) {
  return STATUS_OPTIONS.find((option) => option.value === status)?.label || status;
}

function getMatchTone(status: MatchStatus) {
  if (status === 'live') return 'fixture-status-live';
  if (status === 'final') return 'fixture-status-finished';
  if (status === 'scheduled') return 'fixture-status-scheduled';
  return 'fixture-status-draft';
}

function getContainerTone(round: RoundWithMatches): ManageContainer['tone'] {
  if (round.matchCount === 0) return 'empty';
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
}: {
  tournament: TournamentRow;
  selectedPhaseId: string | null;
}) {
  const {
    fixture,
    selectPhase,
    refreshFixture,
    generateFixture,
    generateMatches,
    validateFixture,
    saveMatch,
    saveRound,
    deleteMatch,
  } = useFixture();
  const [activeSubtab, setActiveSubtab] = useState<WorkspaceSubtabId>('add_matches');
  const [selectedMethod, setSelectedMethod] = useState<MethodId>('manual_match');
  const [manualForm, setManualForm] = useState<ManualFormState>(() => defaultManualForm());
  const [manualErrors, setManualErrors] = useState<Record<string, string>>({});
  const [editingMatchId, setEditingMatchId] = useState<string | null>(null);
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
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const [collapsedContainerIds, setCollapsedContainerIds] = useState<Set<string>>(new Set());
  const [roundDraft, setRoundDraft] = useState<RoundDraftState | null>(null);
  const deferredManageSearch = useDeferredValue(manageSearch);

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

  const selectedPhase = useMemo(
    () => fixture?.phases.find((phase) => phase.id === selectedPhaseId) || null,
    [fixture, selectedPhaseId],
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
    phaseMatches.forEach((match) => {
      if (match.groupId && !groups.has(match.groupId)) {
        groups.set(match.groupId, `Grupo ${match.groupId.slice(0, 8)}`);
      }
    });
    return Array.from(groups, ([value, label]) => ({ value, label }));
  }, [phaseMatches]);

  const manageEntries = useMemo<ManageEntry[]>(
    () => selectedPhase?.rounds.flatMap((round) => round.matches.map((match) => ({ match, round }))) || [],
    [selectedPhase],
  );

  const summary = useMemo(() => ({
    matchesReady: phaseMatches.filter((match) => match.homeClubId && match.awayClubId && match.dateTime && match.status === 'scheduled').length,
    matchesPending: phaseMatches.filter((match) => match.status !== 'final').length,
    roundsCreated: realRounds.length,
    roundsEmpty: realRounds.filter((round) => round.matchCount === 0).length,
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
          ? groupOptions.find((option) => option.value === entry.match.groupId)?.label || `Grupo ${entry.match.groupId.slice(0, 8)}`
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
        subtitle: round.startDate ? `${formatLongDateLabel(round.startDate)} · ${round.matchCount} partidos` : `${round.matchCount} partidos · Sin fecha general`,
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

  const validateManualForm = () => {
    const nextErrors: Record<string, string> = {};
    if (!selectedPhaseId) nextErrors.phase = 'Debes seleccionar una fase.';
    if (!manualForm.homeClubId) nextErrors.homeClubId = 'Selecciona el equipo local.';
    if (!manualForm.awayClubId) nextErrors.awayClubId = 'Selecciona el equipo visitante.';
    if (manualForm.homeClubId && manualForm.awayClubId && manualForm.homeClubId === manualForm.awayClubId) {
      nextErrors.awayClubId = 'Local y visitante no pueden ser el mismo club.';
    }
    if (!manualForm.matchDate) nextErrors.matchDate = 'Debes seleccionar una fecha para el partido.';
    if (manualForm.roundMode === 'new' && !manualForm.roundLabel.trim()) nextErrors.roundLabel = 'Escribe el nombre de la jornada.';
    if (manualForm.roundMode === 'existing' && realRounds.length > 0 && !manualForm.roundId) nextErrors.roundId = 'Selecciona una jornada.';
    setManualErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const afterMutation = async (message: string, tone: 'ok' | 'warn' | 'error' = 'ok') => {
    await refreshFixture();
    setValidationData((await validateFixture()) as ValidationResult);
    setFeedback({ tone, message });
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
      await afterMutation('El partido fue eliminado.');
    } catch (error) {
      setFeedback({ tone: 'error', message: error instanceof Error ? error.message : 'No se pudo eliminar el partido.' });
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
    return (
      <section className="operation-fixture-loading">
        <Loader2 size={22} className="spin" />
        <span>Cargando workspace de fixture...</span>
      </section>
    );
  }

  const activeMeta = WORKSPACE_SUBTABS.find((item) => item.id === activeSubtab) || WORKSPACE_SUBTABS[0];

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

            {manageContainers.length > 0 ? (
              manageView === 'cards' ? (
                <div className="operation-manage-cards-stack">
                  {manageContainers.map((container) => {
                    const collapsed = collapsedContainerIds.has(container.id);
                    return (
                      <section key={container.id} className={`fixture-round-section ${collapsed ? 'is-collapsed' : 'is-expanded'}`}>
                        <button type="button" className="fixture-round-summary" onClick={() => toggleContainer(container.id)} aria-expanded={!collapsed}>
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
                        </button>

                        <div className={`fixture-round-details ${!collapsed ? 'is-expanded' : ''}`}>
                          <div className="fixture-matches-grid">
                            {container.matches.length > 0 ? (
                              container.matches.map((entry) => (
                                <MatchCard
                                  key={entry.match.id}
                                  entry={entry}
                                  busyAction={busyAction}
                                  onEdit={() => openEditMatch(entry.match, 'edit')}
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
                    <div key={entry.match.id} className="operation-manage-list-row">
                      <div className="operation-manage-list-main">
                        <strong>{entry.match.homeClub?.name || 'Local'} vs {entry.match.awayClub?.name || 'Visitante'}</strong>
                        <small>
                          {entry.round.name}
                          {entry.match.groupId ? ` · Grupo ${entry.match.groupId.slice(0, 8)}` : ''}
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
                <strong>No hay partidos para los filtros actuales</strong>
                <p>Prueba con otra combinacion de filtros o vuelve a Agregar para cargar nuevos encuentros.</p>
                <div className="operation-empty-actions">
                  <button type="button" className="basalt-btn basalt-btn-primary" onClick={() => openManualCreate()}>
                    <Plus size={15} />
                    Crear partido manual
                  </button>
                  <button type="button" className="basalt-btn" onClick={() => { setActiveSubtab('add_matches'); setSelectedMethod('import_fixture'); }}>
                    <Upload size={15} />
                    Importar fixture
                  </button>
                </div>
              </div>
            )}
          </section>
        )}
      </div>

      <aside className="operation-fixture-side">
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
      </aside>
    </div>
  );
}

function MatchCard({
  entry,
  busyAction,
  onEdit,
  onMove,
  onDuplicate,
  onDelete,
}: {
  entry: ManageEntry;
  busyAction: string | null;
  onEdit: () => void;
  onMove: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const { match, round } = entry;

  return (
    <article className={`fixture-match-card fixture-glass ${getMatchTone(match.status)}`}>
      <div className="fixture-match-top">
        <div>
          <span className="fixture-match-headline">{formatDateLabel(match.dateTime)} · {formatTimeLabel(match.dateTime)}</span>
          <span className="fixture-match-subline">
            {round.name}
            {match.groupId ? ` · Grupo ${match.groupId.slice(0, 8)}` : ''}
          </span>
        </div>
        <span className={`fixture-pill ${getMatchTone(match.status)}`}>{getStatusLabel(match.status)}</span>
      </div>

      <div className="fixture-match-teams">
        <TeamBlock side="Local" team={match.homeClub} fallback="Local" />
        <div className="fixture-match-center">
          <span className="fixture-match-center-label">Versus</span>
          <strong>VS</strong>
        </div>
        <TeamBlock side="Visitante" team={match.awayClub} fallback="Visitante" />
      </div>

      <div className="fixture-match-footer">
        <div className="fixture-match-meta">
          <span><Clock3 size={14} />{formatLongDateLabel(match.dateTime)} · {formatTimeLabel(match.dateTime)}</span>
          <span><Calendar size={14} />{match.venue || 'Sede por definir'}</span>
        </div>

        <div className="fixture-match-actions">
          <button className="fixture-mini-btn" onClick={onEdit}>
            <Pencil size={14} />
            <span>Editar</span>
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
