'use client';

import { useCallback, useState, useEffect, useMemo } from 'react';
import { AlertCircle, ArrowDownUp, Award, CheckCircle, ChevronRight, Edit3, Eye, Globe, Grid3x3, Info, Layers, MoreVertical, Plus, Trash2, TrendingUp, Trophy, Users, X } from 'lucide-react';
import './basalt.css';
import './phase-wizard.css';
import './tournament-structure.css';

import { TiebreakerList, TiebreakerItem } from './TiebreakerList';
import { TableColumnSelector, ColumnCategory } from './TableColumnSelector';
import { LabelChip } from './standings/LabelChip';
import { PhaseSettings, GroupLabel } from '@/types/phase-settings';
import { updateEntity } from '@/app/admin/entities/actions';
import { buildTournamentCompetitionConfig } from '@/lib/utils/tournamentFormat';
import {
    DEFAULT_PLAYOFF_STAGE_NAMES,
    getDefaultPlayoffStageNames,
    getExpectedPlayoffStageCount,
    getPlayoffMatchCounts,
    getPlayoffTeamsCount,
    normalizePlayoffStageNames,
    resolvePlayoffStagesForTeams,
} from '@/lib/utils/playoffStages';
import { useTournamentDirty } from './TournamentContext';
import PlayoffBuilderPanel from './PlayoffBuilderPanel';

interface Phase {
    id: string;
    tournament_id: string;
    name: string;
    phase_type: string;
    order_index: number;
    is_active: boolean;
    created_at: string;
    settings?: PhaseSettings;
}

const PHASE_TYPE_LABELS: Record<string, string> = {
    league: 'Liga · Round-robin',
    group_stage: 'Fase de Grupos',
    knockout: 'Playoff · Eliminación directa',
    playoff: 'Eliminación directa · Llaves',
};

const PHASE_TYPE_BADGE: Record<string, string> = {
    league: 'badge-ok',
    group_stage: 'badge-published',
    knockout: 'badge-warning',
    playoff: 'badge-draft',
};

const PRESET_COLORS = [
    '#00a365', '#22c55e', '#eab308', '#ef4444', '#3b82f6', '#a855f7', '#f97316', '#14b8a6',
];

const DEFAULT_PLACEMENT_PTS = [25, 18, 15, 12, 10, 8, 6, 4];
const DEFAULT_PLACEMENT_POINTS = DEFAULT_PLACEMENT_PTS.map((pts, i) => ({ position: i + 1, points: pts }));
const DEFAULT_PLAYOFF_STAGE_MATCH_COUNTS = getPlayoffMatchCounts(16, DEFAULT_PLAYOFF_STAGE_NAMES.length);

function toPositiveStageMatchCount(value: unknown, fallback = 1) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(1, Math.floor(parsed));
}

function normalizePlayoffStageMatchCounts(stageNames: string[], counts: number[], teamsCount: number) {
    const defaults = getPlayoffMatchCounts(teamsCount, stageNames.length);

    return stageNames.map((_, index) => (
        toPositiveStageMatchCount(counts[index], toPositiveStageMatchCount(defaults[index], 1))
    ));
}

const COLUMN_TIEBREAKER_CONFIG: Record<string, { label: string; description?: string }> = {
    points:        { label: 'Puntos' },
    won:           { label: 'Victorias' },
    drawn:         { label: 'Empates' },
    lost:          { label: 'Derrotas' },
    percentage:    { label: 'Porcentaje' },
    pointsFor:     { label: 'Puntos a Favor' },
    pointsAgainst: { label: 'Puntos en Contra' },
    pointsDiff:    { label: 'Diferencia de Puntos' },
    tries:         { label: 'Tries' },
    conversions:   { label: 'Conversiones' },
    penalties:     { label: 'Penales' },
    dropGoals:     { label: 'Drop Goals' },
    tackles:       { label: 'Tackles' },
    runs:          { label: 'Carreras' },
};

// Aliases for legacy persisted phases that stored snake_case or alternate
// metric ids. Maps unknown ids to the canonical label so the UI never falls
// back to raw "fair_play" / "points_difference" text.
const TIEBREAKER_LABEL_ALIASES: Record<string, string> = {
    points_difference: 'Diferencia de Puntos',
    diff:              'Diferencia de Puntos',
    head_to_head:      'Enfrentamiento Directo',
    headtohead:        'Enfrentamiento Directo',
    fair_play:         'Fair Play',
    fairplay:          'Fair Play',
    points_for:        'Puntos a Favor',
    points_against:    'Puntos en Contra',
    drop_goals:        'Drop Goals',
};

const titleCaseFromKey = (key: string) =>
    key.replace(/[_\-]+/g, ' ')
       .replace(/([a-z])([A-Z])/g, '$1 $2')
       .toLowerCase()
       .replace(/(^|\s)(\w)/g, (_, sp, ch) => sp + ch.toUpperCase());

const resolveTiebreakerLabel = (metric: string): string => {
    if (COLUMN_TIEBREAKER_CONFIG[metric]) return COLUMN_TIEBREAKER_CONFIG[metric].label;
    const alias = TIEBREAKER_LABEL_ALIASES[metric.toLowerCase()];
    if (alias) return alias;
    return titleCaseFromKey(metric);
};

export function TournamentStructureTab({ data, id }: { data?: any; id?: string }) {
    const { markSectionDirty, setSectionDraft, clearSectionDraft, triggerSectionSavedFlash } = useTournamentDirty();
    const isApiManaged = Boolean((data as any)?.is_api_managed);
    const markStructureDirty = useCallback(() => {
        setSectionDraft('structure', { touched: true });
        markSectionDirty('structure', true);
    }, [markSectionDirty, setSectionDraft]);
    const markStructureClean = useCallback(() => {
        clearSectionDraft('structure');
        markSectionDirty('structure', false);
    }, [clearSectionDraft, markSectionDirty]);

    const [phases, setPhases] = useState<Phase[]>([]);
    const [loading, setLoading] = useState(true);
    const [activatingPhaseId, setActivatingPhaseId] = useState<string | null>(null);
    const [openMenuPhaseId, setOpenMenuPhaseId] = useState<string | null>(null);
    // Inline confirmation for "Eliminar fase": instead of native confirm()
    // we ask the user with a banner inside the same phase card.
    const [pendingDeletePhaseId, setPendingDeletePhaseId] = useState<string | null>(null);
    const [deletingPhaseId, setDeletingPhaseId] = useState<string | null>(null);
    // Inline feedback (success / error) shown in-context. Replaces alert() so
    // screen readers and keyboard users get the message without losing focus.
    const [feedback, setFeedback] = useState<{ tone: 'ok' | 'error'; message: string } | null>(null);
    // Whether the user has manually edited the "equipos que avanzan" field.
    // While untouched we suggest a smart default proportional to teamsCount.
    const [advanceTouched, setAdvanceTouched] = useState(false);
    // Auto-clear inline feedback after 5 seconds.
    useEffect(() => {
        if (!feedback) return;
        const id = window.setTimeout(() => setFeedback(null), 5000);
        return () => window.clearTimeout(id);
    }, [feedback]);

    // Form state
    const [showPhaseForm, setShowPhaseForm] = useState(false);
    const [phaseName, setPhaseName] = useState('');
    const [phaseType, setPhaseType] = useState<'league' | 'knockout' | 'group_stage' | 'playoff'>('league');
    const [teamsCount, setTeamsCount] = useState<number | ''>('');
    const [advanceCount, setAdvanceCount] = useState<number | ''>('');
    const [legs, setLegs] = useState<1 | 2>(1);

    // sport_id stores the sport slug (e.g. 'rugby', 'football'); the legacy
    // `sport` column does not exist in the schema, so the previous lookup
    // always returned undefined and rugby defaults never applied.
    const isRugby = (data?.sport_id ?? '').toString().toLowerCase() === 'rugby';

    // Tournament model (circuit vs normal)
    const initialTournamentFormat = useMemo<'circuit' | 'league'>(() => {
        const f = (data as any)?.format;
        const r = (data as any)?.ruleset?.competition?.season_model;
        return f === 'circuit' || r === 'circuit' ? 'circuit' : 'league';
    }, [data]);
    const initialChampionMode = useMemo<'accumulation' | 'final'>(() => {
        return (data as any)?.ruleset?.competition?.parameters?.champion_mode === 'final' ? 'final' : 'accumulation';
    }, [data]);
    // Local mirror of tournaments.ruleset. The format selector and the fixed
    // roster panel both merge into the SAME ruleset JSONB via updateEntity,
    // which replaces the whole column. The `data` prop is a server snapshot
    // that never refreshes mid-session, so reading it as the write base in each
    // handler meant saving one panel clobbered the other's changes. This draft
    // is the single source of truth for writes and is updated after each save.
    const [rulesetDraft, setRulesetDraft] = useState<Record<string, any>>(() => (data as any)?.ruleset ?? {});
    const [tournamentFormat, setTournamentFormat] = useState<'circuit' | 'league'>(initialTournamentFormat);
    const [circuitChampionMode, setCircuitChampionMode] = useState<'accumulation' | 'final'>(initialChampionMode);
    const [savedFormat, setSavedFormat] = useState<'circuit' | 'league'>(initialTournamentFormat);
    const [savedChampionMode, setSavedChampionMode] = useState<'accumulation' | 'final'>(initialChampionMode);
    const [savingFormat, setSavingFormat] = useState(false);
    const [formatSaved, setFormatSaved] = useState(false);
    const [formatError, setFormatError] = useState<string | null>(null);

    // Plantel fijo por equipo (fixed roster per tournament). Stored in
    // tournaments.ruleset.fixedRoster; getFixedRosterConfig() reads it.
    const initialFixedRoster = (data as any)?.ruleset?.fixedRoster ?? {};
    const [fixedRosterEnabled, setFixedRosterEnabled] = useState<boolean>(Boolean(initialFixedRoster.enabled));
    const [fixedRosterSize, setFixedRosterSize] = useState<number>(
        typeof initialFixedRoster.rosterSize === 'number' ? initialFixedRoster.rosterSize : 23,
    );
    const [fixedRosterLockPhaseId, setFixedRosterLockPhaseId] = useState<string>(
        typeof initialFixedRoster.lockPhaseId === 'string' ? initialFixedRoster.lockPhaseId : '',
    );
    const [savingFixedRoster, setSavingFixedRoster] = useState(false);
    const [fixedRosterSaved, setFixedRosterSaved] = useState(false);
    const [fixedRosterError, setFixedRosterError] = useState<string | null>(null);
    // Last persisted roster config, so we can flag unsaved edits to the shell.
    const [savedFixedRoster, setSavedFixedRoster] = useState(() => ({
        enabled: Boolean(initialFixedRoster.enabled),
        rosterSize: typeof initialFixedRoster.rosterSize === 'number' ? initialFixedRoster.rosterSize : 23,
        lockPhaseId: typeof initialFixedRoster.lockPhaseId === 'string' ? initialFixedRoster.lockPhaseId : '',
    }));

    // Mobile-only: 'Modelo competitivo' and 'Plantel fijo' collapse into a
    // 'Configuración del torneo' panel with two drilldown rows; tapping a row
    // opens the original section as a bottom sheet. Desktop is untouched
    // (CSS hides the trigger panel and ignores the open state at >= 768px).
    const [mobileConfigSheet, setMobileConfigSheet] = useState<'model' | 'roster' | null>(null);

    useEffect(() => {
        if (!mobileConfigSheet) return;
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => { document.body.style.overflow = previousOverflow; };
    }, [mobileConfigSheet]);

    useEffect(() => {
        if (!mobileConfigSheet) return;
        const handleKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setMobileConfigSheet(null);
        };
        document.addEventListener('keydown', handleKey);
        return () => document.removeEventListener('keydown', handleKey);
    }, [mobileConfigSheet]);

    const isCircuit = tournamentFormat === 'circuit';

    // Circuit placement points (used when isCircuit)
    const [placementPoints, setPlacementPoints] = useState<{ position: number; points: number }[]>(DEFAULT_PLACEMENT_POINTS);

    // Points system
    const [pointsWin, setPointsWin] = useState(isRugby ? 4 : 3);
    const [pointsDraw, setPointsDraw] = useState(isRugby ? 2 : 1);
    const [pointsLoss, setPointsLoss] = useState(0);
    const [allowBonusPoints, setAllowBonusPoints] = useState(isRugby);
    const [useExtraTimePoints, setUseExtraTimePoints] = useState(false);
    const [pointsWinExtra, setPointsWinExtra] = useState(2);
    const [pointsDrawExtra, setPointsDrawExtra] = useState(1);
    const [pointsLossExtra, setPointsLossExtra] = useState(0);

    // Table columns
    const [tableCols, setTableCols] = useState<Record<string, boolean>>({
        posVariation: true, points: true, won: true, drawn: true, lost: true,
        played: true, percentage: false, classification: false,
        pointsFor: true, pointsAgainst: true, pointsDiff: true,
        extraPlayed: false, extraWon: false, extraDrawn: false, extraLost: false,
        tries: isRugby, conversions: isRugby, penalties: isRugby,
        dropGoals: isRugby, tackles: isRugby, runs: isRugby,
    });

    // Tiebreakers — only active ones (priority > 0) stored in state
    const [tiebreakers, setTiebreakers] = useState<TiebreakerItem[]>([
        { metric: 'points',     label: 'Puntos',                 enabled: true, order: 'desc', priority: 1 },
        { metric: 'headToHead', label: 'Enfrentamiento Directo', enabled: true, order: 'desc', priority: 2, requiresRoundRobin: true },
        { metric: 'pointsDiff', label: 'Diferencia de Puntos',   enabled: true, order: 'desc', priority: 3 },
        { metric: 'pointsFor',  label: 'Puntos a Favor',         enabled: true, order: 'desc', priority: 4 },
    ]);
    const [statsAssignment, setStatsAssignment] = useState<'played' | 'starters'>('played');
    const [carryOverPreviousPhase, setCarryOverPreviousPhase] = useState(false);
    const [currentStep, setCurrentStep] = useState(1);
    const [editingPhaseId, setEditingPhaseId] = useState<string | null>(null);
    const [creating, setCreating] = useState(false);

    // Group names (actual DB groups for group_stage)
    const [groupNames, setGroupNames] = useState<string[]>([]);
    const [playoffStageNames, setPlayoffStageNames] = useState<string[]>(DEFAULT_PLAYOFF_STAGE_NAMES);
    const [playoffStageMatchCounts, setPlayoffStageMatchCounts] = useState<number[]>(DEFAULT_PLAYOFF_STAGE_MATCH_COUNTS);
    const [playoffStagesCustomized, setPlayoffStagesCustomized] = useState(false);

    // Classification zone labels
    const [groupLabels, setGroupLabels] = useState<GroupLabel[]>([]);
    const [newLabel, setNewLabel] = useState('');
    const [labelColor, setLabelColor] = useState(PRESET_COLORS[0]);
    const [labelColorMode, setLabelColorMode] = useState<'auto' | 'manual'>('auto');
    const [editingLabelId, setEditingLabelId] = useState<string | null>(null);
    const [expandedLabelId, setExpandedLabelId] = useState<string | null>(null);
    const [savedManualColors, setSavedManualColors] = useState<Record<string, string>>({});
    const [labelError, setLabelError] = useState<string | null>(null);

    const getAutoLabelColor = (index: number) => PRESET_COLORS[index % PRESET_COLORS.length];
    const getLabelKey = (label: GroupLabel) => label.id ?? label.name;
    const normalizeGroupLabels = (labels: GroupLabel[] = []) => labels.map((label, index) => {
        const autoColorIndex = label.autoColorIndex ?? index;
        const colorMode = label.colorMode ?? 'auto';
        return {
            ...label,
            id: label.id ?? `tag_${index}_${label.name}`,
            colorMode,
            autoColorIndex,
            color: label.color || getAutoLabelColor(autoColorIndex),
        };
    });

    // --- Group name helpers ---
    const addGroupName = () => {
        const next = String.fromCharCode(65 + groupNames.length);
        setGroupNames(prev => [...prev, `Grupo ${next}`]);
    };

    const updateGroupName = (index: number, value: string) => {
        setGroupNames(prev => prev.map((n, i) => (i === index ? value : n)));
    };

    const removeGroupName = (index: number) => {
        setGroupNames(prev => prev.filter((_, i) => i !== index));
    };

    const addPlayoffStageName = () => {
        // Pick a name that isn't already present. The stage list is deduped
        // case-insensitively before persisting, so suggesting a name that
        // already exists (e.g. a second "Final") would silently collapse the
        // row on save — the user sees a stage that vanishes.
        const used = new Set(playoffStageNames.map(n => n.trim().toLowerCase()).filter(Boolean));
        const candidates = [
            DEFAULT_PLAYOFF_STAGE_NAMES[playoffStageNames.length],
            ...DEFAULT_PLAYOFF_STAGE_NAMES,
        ].filter((c): c is string => Boolean(c));
        let suggested = candidates.find(c => !used.has(c.trim().toLowerCase()));
        if (!suggested) {
            let n = playoffStageNames.length + 1;
            suggested = `Etapa ${n}`;
            while (used.has(suggested.toLowerCase())) {
                n += 1;
                suggested = `Etapa ${n}`;
            }
        }
        const nextNames = [...playoffStageNames, suggested];
        setPlayoffStageNames(nextNames);
        setPlayoffStageMatchCounts(prev => normalizePlayoffStageMatchCounts(nextNames, prev, formPlayoffTeamsCount));
        setPlayoffStagesCustomized(true);
    };

    const updatePlayoffStageName = (index: number, value: string) => {
        setPlayoffStageNames(prev => prev.map((name, i) => (i === index ? value : name)));
        setPlayoffStagesCustomized(true);
    };

    const updatePlayoffStageMatchCount = (index: number, value: number | '') => {
        setPlayoffStageMatchCounts(prev => {
            const next = [...prev];
            next[index] = toPositiveStageMatchCount(value, 1);
            return normalizePlayoffStageMatchCounts(playoffStageNames, next, formPlayoffTeamsCount);
        });
        setPlayoffStagesCustomized(true);
    };

    const removePlayoffStageName = (index: number) => {
        const nextNames = playoffStageNames.filter((_, i) => i !== index);
        setPlayoffStageNames(nextNames);
        setPlayoffStageMatchCounts(prev => normalizePlayoffStageMatchCounts(
            nextNames,
            prev.filter((_, i) => i !== index),
            formPlayoffTeamsCount,
        ));
        setPlayoffStagesCustomized(true);
    };

    const formPlayoffTeamsCount = useMemo(
        () => getPlayoffTeamsCount({ teamsCount: teamsCount === '' ? 0 : Number(teamsCount) }),
        [teamsCount],
    );

    // The linear bracket is sized by the team count: on save the stage list is
    // clamped to ceil(log2(equipos)), keeping the LAST N stages. Surface that
    // so the user isn't surprised when early stages they configured disappear.
    const playoffStageAdjustment = useMemo(() => {
        if (phaseType !== 'playoff' && phaseType !== 'knockout') return null;
        if (formPlayoffTeamsCount < 2) return null;
        const expected = getExpectedPlayoffStageCount(formPlayoffTeamsCount);
        const configured = normalizePlayoffStageNames(playoffStageNames).length;
        if (expected <= 0 || configured === expected) return null;
        return { expected, configured, excess: configured > expected };
    }, [phaseType, formPlayoffTeamsCount, playoffStageNames]);

    useEffect(() => {
        if (phaseType !== 'playoff' && phaseType !== 'knockout') return;
        if (playoffStagesCustomized) return;
        const defaultNames = getDefaultPlayoffStageNames(formPlayoffTeamsCount);
        setPlayoffStageNames(defaultNames);
        setPlayoffStageMatchCounts(normalizePlayoffStageMatchCounts(defaultNames, [], formPlayoffTeamsCount));
    }, [formPlayoffTeamsCount, phaseType, playoffStagesCustomized]);

    // Smart default for "equipos que avanzan": as long as the user hasn't
    // edited it manually, follow teamsCount proportionally. Heuristic: half
    // the teams (rounded down to the closest power of 2 when ≥4, otherwise
    // half rounded up). Skipped on playoff/knockout where the concept is
    // implicit in the bracket size.
    useEffect(() => {
        if (advanceTouched) return;
        if (phaseType === 'playoff' || phaseType === 'knockout') return;
        if (teamsCount === '' || Number(teamsCount) < 2) return;
        const teams = Number(teamsCount);
        let suggested = Math.max(1, Math.floor(teams / 2));
        if (teams >= 4) {
            // Snap to closest power of 2 ≤ teams/2 for cleaner brackets.
            const log2 = Math.floor(Math.log2(suggested));
            suggested = Math.max(2, Math.pow(2, log2));
        }
        if (suggested !== advanceCount) {
            setAdvanceCount(suggested);
        }
    }, [teamsCount, phaseType, advanceTouched, advanceCount]);

    // When opening the wizard for a NEW phase that already has a previous
    // one configured, suggest "carry over" enabled by default — that's the
    // typical use-case of multi-phase tournaments. The user can opt out.
    useEffect(() => {
        if (!showPhaseForm || editingPhaseId) return;
        if (phases.length > 0 && !carryOverPreviousPhase) {
            setCarryOverPreviousPhase(true);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [showPhaseForm, editingPhaseId]);

    // --- Label helpers ---
    const resetLabelForm = () => {
        setNewLabel('');
        setLabelColor(PRESET_COLORS[0]);
        // labelColorMode is now a global setting — don't reset it on form reset.
        setEditingLabelId(null);
        setLabelError(null);
    };

    const addLabel = () => {
        const trimmed = newLabel.trim();
        if (!trimmed) {
            setLabelError('El nombre de la etiqueta es obligatorio.');
            return;
        }

        const normalized = trimmed.toLowerCase();
        const hasDuplicate = groupLabels.some(label =>
            label.name.trim().toLowerCase() === normalized && getLabelKey(label) !== editingLabelId
        );

        if (hasDuplicate) {
            setLabelError('Ya existe una etiqueta con ese nombre.');
            return;
        }

        if (editingLabelId) {
            setGroupLabels(prev => prev.map((label, index) => {
                if (getLabelKey(label) !== editingLabelId) return label;
                const autoColorIndex = label.autoColorIndex ?? index;
                return {
                    ...label,
                    name: trimmed,
                    colorMode: labelColorMode,
                    color: labelColorMode === 'auto' ? getAutoLabelColor(autoColorIndex) : labelColor,
                    autoColorIndex,
                };
            }));
        } else {
            const autoColorIndex = groupLabels.length;
            setGroupLabels(prev => [...prev, {
                id: `tag_${Date.now()}`,
                name: trimmed,
                colorMode: labelColorMode,
                color: labelColorMode === 'auto' ? getAutoLabelColor(autoColorIndex) : labelColor,
                autoColorIndex,
            }]);
        }

        if (labelColorMode === 'manual') {
            setSavedManualColors(prev => ({ ...prev, [trimmed]: labelColor }));
        }

        resetLabelForm();
    };

    const startLabelEdit = (label: GroupLabel) => {
        setEditingLabelId(getLabelKey(label));
        setExpandedLabelId(null);
        setNewLabel(label.name);
        setLabelColor(label.color);
        // labelColorMode is global — don't override it from the row.
        setLabelError(null);
    };

    const removeLabel = (labelId: string) => {
        if (editingLabelId === labelId) {
            resetLabelForm();
        }
        setGroupLabels(prev => prev.filter(label => getLabelKey(label) !== labelId));
    };

    const updateLabelColor = (name: string, color: string) => {
        setGroupLabels(prev => prev.map(l => l.name === name ? { ...l, color } : l));
        setSavedManualColors(prev => ({ ...prev, [name]: color }));
    };

    // Global color mode toggle. When switching to auto we snapshot current
    // (manual) colors so we can restore them when the user toggles back.
    const setGlobalColorMode = (mode: 'auto' | 'manual') => {
        if (mode === labelColorMode) return;
        setLabelColorMode(mode);
        if (mode === 'auto') {
            setSavedManualColors(prev => {
                const next = { ...prev };
                groupLabels.forEach(l => { next[l.name] = l.color; });
                return next;
            });
            setGroupLabels(prev => prev.map((l, i) => ({
                ...l,
                colorMode: 'auto' as const,
                color: getAutoLabelColor(l.autoColorIndex ?? i),
            })));
        } else {
            setGroupLabels(prev => prev.map((l, i) => ({
                ...l,
                colorMode: 'manual' as const,
                color: savedManualColors[l.name] ?? l.color ?? getAutoLabelColor(l.autoColorIndex ?? i),
            })));
        }
    };

    // Column categories
    const columnCategories: ColumnCategory[] = useMemo(() => [
        {
            id: 'basic', label: 'Básicas',
            columns: [
                { id: 'posVariation', label: 'Variación' },
                { id: 'points', label: 'Puntos' },
                { id: 'played', label: 'Jugados' },
                { id: 'classification', label: 'Clasificación' },
            ],
        },
        {
            id: 'results', label: 'Resultados',
            columns: [
                { id: 'won', label: 'Victorias' },
                { id: 'drawn', label: 'Empates' },
                { id: 'lost', label: 'Derrotas' },
                { id: 'percentage', label: 'Porcentaje' },
            ],
        },
        {
            id: 'extraTime', label: 'Prórroga',
            columns: [
                { id: 'extraPlayed', label: 'Jugados (Prórroga)' },
                { id: 'extraWon', label: 'Victorias (Prórroga)' },
                { id: 'extraDrawn', label: 'Empates (Prórroga)' },
                { id: 'extraLost', label: 'Derrotas (Prórroga)' },
            ],
        },
        {
            id: 'scoring', label: 'Anotación',
            columns: [
                { id: 'pointsFor', label: 'A Favor' },
                { id: 'pointsAgainst', label: 'En Contra' },
                { id: 'pointsDiff', label: 'Diferencia' },
            ],
        },
        ...(isRugby ? [{
            id: 'rugby', label: 'Rugby',
            columns: [
                { id: 'tries', label: 'Try' },
                { id: 'conversions', label: 'Conversión' },
                { id: 'penalties', label: 'Penal' },
                { id: 'dropGoals', label: 'Drop Goal' },
                { id: 'tackles', label: 'Tackle' },
                { id: 'runs', label: 'Carrera' },
            ],
        }] : []),
    ], [isRugby]);

    // Validation
    const validationErrors = useMemo(() => {
        const errors: string[] = [];
        // Tiebreakers only apply to standings-based phases. Playoff/knockout
        // brackets skip the Puntos/Desempate steps entirely, so requiring an
        // active tiebreaker there would disable "Crear fase" with no visible
        // step to fix it — an unrecoverable dead end.
        const usesStandings = phaseType === 'league' || phaseType === 'group_stage';
        const enabled = tiebreakers.filter(tb => tb.enabled);
        if (usesStandings && enabled.length === 0) errors.push('Debe haber al menos un criterio de desempate activo');
        if (usesStandings && useExtraTimePoints && !tableCols.extraWon && !tableCols.extraDrawn)
            errors.push('Prórroga activada pero sin columnas de prórroga visibles');
        if (usesStandings && enabled.some(tb => tb.metric === 'points') && enabled.some(tb => tb.metric === 'won'))
            errors.push('Posible redundancia: «Puntos» normalmente ya considera victorias. Mantené «Victorias» solo si querés priorizar partidos ganados como criterio adicional.');
        return errors;
    }, [phaseType, tiebreakers, useExtraTimePoints, tableCols]);

    const phaseFormErrors = useMemo(() => {
        const errors: string[] = [];
        const normalizedName = phaseName.trim();
        const normalizedTeams = teamsCount === '' ? null : Number(teamsCount);
        const normalizedAdvance = advanceCount === '' ? null : Number(advanceCount);
        const activeGroupNames = groupNames.filter(name => name.trim());
        const activePlayoffStages = normalizePlayoffStageNames(playoffStageNames);

        if (!normalizedName) errors.push('Debes ingresar un nombre de fase.');
        if (normalizedTeams !== null && normalizedTeams < 2) errors.push('La fase debe tener al menos 2 equipos.');
        if (normalizedAdvance !== null && normalizedAdvance < 1) errors.push('Debe avanzar al menos 1 equipo.');
        if (normalizedTeams !== null && normalizedAdvance !== null && normalizedAdvance > normalizedTeams) {
            errors.push('Los equipos que avanzan no pueden superar la cantidad total.');
        }
        if (phaseType === 'group_stage' && activeGroupNames.length === 0) {
            errors.push('La fase de grupos necesita al menos un grupo.');
        }
        if ((phaseType === 'playoff' || phaseType === 'knockout') && normalizedTeams === null) {
            errors.push('La fase playoff necesita definir cuantos equipos juegan.');
        }
        if ((phaseType === 'playoff' || phaseType === 'knockout') && activePlayoffStages.length === 0) {
            errors.push('La fase playoff necesita al menos una etapa de eliminacion.');
        }
        if ((phaseType === 'playoff' || phaseType === 'knockout') && activePlayoffStages.some((_, index) => toPositiveStageMatchCount(playoffStageMatchCounts[index], 0) < 1)) {
            errors.push('Cada etapa playoff necesita al menos 1 partido configurado.');
        }

        return errors;
    }, [advanceCount, groupNames, phaseName, phaseType, playoffStageMatchCounts, playoffStageNames, teamsCount]);

    const tiebreakerListItems = useMemo((): TiebreakerItem[] => {
        const activeMetrics = new Set(tiebreakers.map(t => t.metric));
        const fromColumns: TiebreakerItem[] = Object.entries(tableCols)
            .filter(([col, enabled]) => enabled && COLUMN_TIEBREAKER_CONFIG[col] && !activeMetrics.has(col))
            .map(([col]) => ({
                metric: col,
                label: COLUMN_TIEBREAKER_CONFIG[col].label,
                description: COLUMN_TIEBREAKER_CONFIG[col].description,
                enabled: true,
                order: 'desc' as const,
                priority: 0,
            }));
        const headToHead: TiebreakerItem[] = activeMetrics.has('headToHead') ? [] : [{
            metric: 'headToHead',
            label: 'Enfrentamiento Directo',
            description: 'Resultado en el enfrentamiento directo entre equipos empatados',
            enabled: true,
            order: 'desc' as const,
            priority: 0,
            requiresRoundRobin: true,
        }];
        return [...tiebreakers, ...fromColumns, ...headToHead];
    }, [tableCols, tiebreakers]);

    const handleTableColsChange = (newCols: Record<string, boolean>) => {
        const disabledCols = new Set(
            Object.entries(newCols)
                .filter(([col, on]) => !on && tableCols[col] && COLUMN_TIEBREAKER_CONFIG[col])
                .map(([col]) => col)
        );
        if (disabledCols.size > 0) {
            setTiebreakers(prev => prev.filter(t => !disabledCols.has(t.metric)));
        }
        setTableCols(newCols);
    };

    const handleSaveTournamentFormat = async () => {
        if (!id || isApiManaged) return;
        setSavingFormat(true);
        setFormatSaved(false);
        setFormatError(null);
        try {
            const competition = buildTournamentCompetitionConfig(
                tournamentFormat,
                tournamentFormat === 'circuit' ? { champion_mode: circuitChampionMode } : undefined,
            );
            const nextRuleset = { ...rulesetDraft, competition };
            await updateEntity('tournament', id, {
                format: tournamentFormat,
                ruleset: nextRuleset,
            });
            setRulesetDraft(nextRuleset);
            setSavedFormat(tournamentFormat);
            setSavedChampionMode(circuitChampionMode);
            setFormatSaved(true);
            triggerSectionSavedFlash('structure');
            setTimeout(() => setFormatSaved(false), 3000);
        } catch (error: unknown) {
            setFormatError(error instanceof Error ? error.message : 'No se pudo guardar el modelo competitivo.');
        } finally {
            setSavingFormat(false);
        }
    };

    const handleSaveFixedRoster = async () => {
        if (!id || isApiManaged) return;
        setSavingFixedRoster(true);
        setFixedRosterSaved(false);
        setFixedRosterError(null);
        try {
            const lockPhase = fixedRosterLockPhaseId
                ? phases.find((p) => p.id === fixedRosterLockPhaseId) ?? null
                : null;
            const persistedRosterSize = Math.min(40, Math.max(1, Math.trunc(fixedRosterSize) || 23));
            const nextRuleset = {
                ...rulesetDraft,
                fixedRoster: {
                    enabled: fixedRosterEnabled,
                    rosterSize: persistedRosterSize,
                    enforceExactSize: false,
                    lockPhaseId: lockPhase ? lockPhase.id : null,
                    lockOrderIndex: lockPhase ? lockPhase.order_index : null,
                },
            };
            await updateEntity('tournament', id, { ruleset: nextRuleset });
            setRulesetDraft(nextRuleset);
            setSavedFixedRoster({
                enabled: fixedRosterEnabled,
                rosterSize: persistedRosterSize,
                lockPhaseId: lockPhase ? lockPhase.id : '',
            });
            setFixedRosterSaved(true);
            triggerSectionSavedFlash('structure');
            setTimeout(() => setFixedRosterSaved(false), 3000);
        } catch (error: unknown) {
            setFixedRosterError(error instanceof Error ? error.message : 'No se pudo guardar el plantel fijo.');
        } finally {
            setSavingFixedRoster(false);
        }
    };

    // Mirror local wizard / model edits into the shared dirty tracker so the
    // shell can warn before navigation, paint the tab dot, and block accidental
    // tab swaps. We deliberately do NOT instrument every input — instead we
    // derive dirtiness from two clear signals: the wizard being open and the
    // tournament model differing from its last saved value.
    const formatModelDirty = tournamentFormat !== savedFormat
        || (tournamentFormat === 'circuit' && circuitChampionMode !== savedChampionMode);
    const fixedRosterDirty = fixedRosterEnabled !== savedFixedRoster.enabled
        || fixedRosterSize !== savedFixedRoster.rosterSize
        || fixedRosterLockPhaseId !== savedFixedRoster.lockPhaseId;
    const isStructureDirty = showPhaseForm || formatModelDirty || fixedRosterDirty;
    useEffect(() => {
        if (isStructureDirty) {
            markStructureDirty();
        } else {
            markStructureClean();
        }
    }, [isStructureDirty, markStructureDirty, markStructureClean]);

    const resetForm = () => {
        setCurrentStep(1);
        setPhaseName('');
        setPhaseType('league');
        setTeamsCount('');
        setAdvanceCount('');
        setAdvanceTouched(false);
        setLegs(1);
        setPointsWin(isRugby ? 4 : 3);
        setPointsDraw(isRugby ? 2 : 1);
        setPointsLoss(0);
        setAllowBonusPoints(isRugby);
        setUseExtraTimePoints(false);
        setPointsWinExtra(2);
        setPointsDrawExtra(1);
        setPointsLossExtra(0);
        setStatsAssignment('played');
        setCarryOverPreviousPhase(false);
        setTiebreakers([
            { metric: 'points',     label: 'Puntos',                 enabled: true, order: 'desc', priority: 1 },
            { metric: 'headToHead', label: 'Enfrentamiento Directo', enabled: true, order: 'desc', priority: 2, requiresRoundRobin: true },
            { metric: 'pointsDiff', label: 'Diferencia de Puntos',   enabled: true, order: 'desc', priority: 3 },
            { metric: 'pointsFor',  label: 'Puntos a Favor',         enabled: true, order: 'desc', priority: 4 },
        ]);
        setTableCols({
            posVariation: true, points: true, won: true, drawn: true, lost: true,
            played: true, percentage: false, classification: false,
            pointsFor: true, pointsAgainst: true, pointsDiff: true,
            extraPlayed: false, extraWon: false, extraDrawn: false, extraLost: false,
            tries: isRugby, conversions: isRugby, penalties: isRugby,
            dropGoals: isRugby, tackles: isRugby, runs: isRugby,
        });
        setGroupLabels([]);
        setGroupNames([]);
        setPlayoffStageNames(DEFAULT_PLAYOFF_STAGE_NAMES);
        setPlayoffStageMatchCounts(DEFAULT_PLAYOFF_STAGE_MATCH_COUNTS);
        setPlayoffStagesCustomized(false);
        setPlacementPoints(DEFAULT_PLACEMENT_POINTS);
        resetLabelForm();
        setShowPhaseForm(false);
        setEditingPhaseId(null);
    };

    const loadPhaseIntoForm = (phase: Phase) => {
        if (isApiManaged) return;
        setEditingPhaseId(phase.id);
        // Editar una fase existente: respetar el advanceCount guardado. Sin
        // esto, la heurística de "equipos que avanzan" (efecto) lo pisaría
        // al abrir la fase porque advanceTouched seguiría en false.
        setAdvanceTouched(true);
        setPhaseName(phase.name);
        // Legacy 'knockout' phases predate the selector, which now only offers
        // 'playoff'. They're identical server-side (isPlayoffPhaseType covers
        // both), so surface them as 'playoff' — otherwise no type card lights
        // up when editing an older knockout phase.
        setPhaseType(phase.phase_type === 'knockout' ? 'playoff' : (phase.phase_type as any));
        setPlayoffStageNames(DEFAULT_PLAYOFF_STAGE_NAMES);
        setPlayoffStageMatchCounts(DEFAULT_PLAYOFF_STAGE_MATCH_COUNTS);
        setPlayoffStagesCustomized(false);

        if (phase.settings) {
            const s = phase.settings;
            setTeamsCount(s.teamsCount || '');
            setAdvanceCount(s.advanceCount || '');
            setLegs(s.legs || 1);

            if (s.pointsSystem) {
                setPointsWin(s.pointsSystem.win);
                setPointsDraw(s.pointsSystem.draw);
                setPointsLoss(s.pointsSystem.loss);
                setAllowBonusPoints(!!s.pointsSystem.allowBonusPoints);
                setUseExtraTimePoints(!!s.pointsSystem.extraTimeAlternativeSystem);
                if (s.pointsSystem.behavior?.extraTimeLogic) {
                    setPointsWinExtra(s.pointsSystem.behavior.extraTimeLogic.win || 2);
                    setPointsDrawExtra(s.pointsSystem.behavior.extraTimeLogic.draw || 1);
                    setPointsLossExtra(s.pointsSystem.behavior.extraTimeLogic.loss || 0);
                }
            } else {
                setPointsWin(isRugby ? 4 : 3);
                setPointsDraw(isRugby ? 2 : 1);
                setPointsLoss(0);
                setAllowBonusPoints(isRugby);
            }

            if (s.tableColumns) setTableCols(prev => ({ ...prev, ...s.tableColumns }));
            if (s.tiebreakers) {
                const active = s.tiebreakers
                    .filter(t => (t.priority ?? 0) > 0)
                    .map(t => {
                        const config = COLUMN_TIEBREAKER_CONFIG[t.metric]
                            ?? { label: resolveTiebreakerLabel(t.metric) };
                        const isHeadToHead = t.metric === 'headToHead' || t.metric === 'head_to_head';
                        return { ...config, metric: t.metric, order: t.order || 'desc' as const, enabled: t.enabled ?? true, priority: t.priority!, requiresRoundRobin: isHeadToHead || undefined };
                    });
                setTiebreakers(active as TiebreakerItem[]);
            }

            const restoredLabels = normalizeGroupLabels(s.groupLabels || []);
            setGroupLabels(restoredLabels);
            // Restore the global color mode from the saved labels; otherwise the
            // toggle always reads "Automático" even for manually-colored zones,
            // and the first edit would silently repaint them with auto colors.
            setLabelColorMode(restoredLabels.some(l => l.colorMode === 'manual') ? 'manual' : 'auto');
            setGroupNames((s as any).group_names || []);
            const stageConfigs = resolvePlayoffStagesForTeams(s, getPlayoffTeamsCount(s));
            const stageNames = stageConfigs.map(stage => stage.name);
            setPlayoffStageNames(stageNames.length > 0 ? stageNames : DEFAULT_PLAYOFF_STAGE_NAMES);
            setPlayoffStageMatchCounts(stageNames.length > 0
                ? normalizePlayoffStageMatchCounts(stageNames, stageConfigs.map(stage => stage.matchCount), getPlayoffTeamsCount(s))
                : DEFAULT_PLAYOFF_STAGE_MATCH_COUNTS);
            setPlayoffStagesCustomized(stageConfigs.length > 0);
            setStatsAssignment(s.statsAssignment || (s.playerStats?.assignOnlyToStarters ? 'starters' : 'played'));
            setCarryOverPreviousPhase(Boolean(s.carryOver?.enabled || s.carryOverPreviousPhase));

            const pts = (s as any).circuit?.pointsByPlacement;
            setPlacementPoints(Array.isArray(pts) && pts.length > 0 ? pts : DEFAULT_PLACEMENT_POINTS);
        }

        resetLabelForm();
        setShowPhaseForm(true);
        setCurrentStep(1);
    };

    useEffect(() => {
        if (id) loadPhases();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id]);

    const loadPhases = async () => {
        setLoading(true);
        try {
            const res = await fetch(`/api/tournaments/${id}/phases`);
            if (res.ok) {
                const json = await res.json();
                setPhases(json.data || []);
            }
        } catch (error) {
            console.error('Error loading phases:', error);
        } finally {
            setLoading(false);
        }
    };

    const getPreviousPhaseForForm = () => {
        const targetIndex = editingPhaseId
            ? phases.findIndex(phase => phase.id === editingPhaseId)
            : phases.length;

        if (targetIndex <= 0) return null;
        return phases[targetIndex - 1] ?? null;
    };

    const handleCreatePhase = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!id) return;
        if (isApiManaged) return;
        if (phaseFormErrors.length > 0) {
            setFeedback({ tone: 'error', message: phaseFormErrors[0] });
            // Send focus to the wizard so the error banner is visible.
            if (typeof window !== 'undefined') {
                document.querySelector<HTMLElement>('.structure-wizard-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
            return;
        }
        if (validationErrors.some(err => err.includes('Debe haber'))) {
            setFeedback({ tone: 'error', message: 'Corrige los errores de validación antes de guardar.' });
            return;
        }

        setCreating(true);
        const url = editingPhaseId
            ? `/api/tournaments/${id}/phases/${editingPhaseId}`
            : `/api/tournaments/${id}/phases`;
        const method = editingPhaseId ? 'PATCH' : 'POST';
        const editingPhase = editingPhaseId
            ? phases.find(phase => phase.id === editingPhaseId) ?? null
            : null;
        const sanitizedGroupNames = phaseType === 'group_stage'
            ? groupNames.map(name => name.trim()).filter(Boolean)
            : [];
        const sanitizedPlayoffStages = (phaseType === 'playoff' || phaseType === 'knockout')
            ? resolvePlayoffStagesForTeams(
                {
                    teamsCount: formPlayoffTeamsCount,
                    playoffStages: playoffStageNames.map((name, index) => ({
                        name,
                        matchCount: playoffStageMatchCounts[index],
                    })),
                },
                formPlayoffTeamsCount,
            )
            : [];
        const sanitizedPlayoffStageNames = sanitizedPlayoffStages.map(stage => stage.name);
        const sanitizedPlayoffStageMatchCounts = sanitizedPlayoffStages.map(stage => stage.matchCount);
        const previousPhaseForCarryOver = getPreviousPhaseForForm();
        const canCarryOverPreviousPhase = Boolean(previousPhaseForCarryOver);
        const carryOverEnabled = carryOverPreviousPhase && canCarryOverPreviousPhase;

        try {
            const response = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: phaseName,
                    phase_type: phaseType,
                    order_index: editingPhaseId ? undefined : phases.length + 1,
                    is_active: editingPhase ? editingPhase.is_active : phases.length === 0,
                    settings: {
                        ...(isCircuit ? { circuit: { pointsByPlacement: placementPoints } } : {}),
                        teamsCount: teamsCount === '' ? 0 : Number(teamsCount),
                        advanceCount: advanceCount === '' ? 0 : Number(advanceCount),
                        legs,
                        tableColumns: tableCols,
                        groupLabels,
                        statsAssignment,
                        carryOverPreviousPhase: carryOverEnabled,
                        carryOver: {
                            enabled: carryOverEnabled,
                            source: 'previous_phase',
                            sourcePhaseId: null,
                            mode: 'table_totals',
                            include: {
                                standings: true,
                                points: true,
                                scores: true,
                                form: true,
                            },
                        },
                        group_names: sanitizedGroupNames,
                        playoffStages: sanitizedPlayoffStages.map((stage, index) => ({
                            id: `playoff_stage_${index + 1}`,
                            name: stage.name,
                            orderIndex: index + 1,
                            matchCount: stage.matchCount,
                        })),
                        playoff_stage_names: sanitizedPlayoffStageNames,
                        playoffStageMatchCounts: sanitizedPlayoffStageMatchCounts,
                        playoff_match_counts: sanitizedPlayoffStageMatchCounts,
                        groupTags: groupLabels.map(l => l.name),
                        playerStats: {
                            assignTeamStatsToPlayersWhoPlayed: statsAssignment === 'played',
                            assignOnlyToStarters: statsAssignment === 'starters',
                            behavior: {
                                whenToAttribute: 'on_match_finalized',
                                eligibility: {
                                    mode: 'played_or_starter',
                                    playedFlagField: 'lineup.played',
                                    starterFlagField: 'lineup.is_starter',
                                    rules: [
                                        { if: { assignOnlyToStarters: true }, then: { eligiblePlayers: 'starters_only' } },
                                        { if: { assignOnlyToStarters: false }, then: { eligiblePlayers: 'played_true' } },
                                    ],
                                },
                                attribution: {
                                    teamStatsToPlayers: ['points_for', 'points_against', 'wins', 'draws', 'losses', 'bonus_points'],
                                    howToApply: 'for_each_eligible_player_add_same_team_stat_delta_as_in_team_totals',
                                },
                            },
                        },
                        matchFormat: {
                            type: legs === 2 ? 'series' : 'single_match',
                            label: legs === 2 ? 'Ida y Vuelta' : 'Partido Único',
                            behavior: {
                                single_match: { seriesLength: 1, winnerDetermination: 'most_points_in_match' },
                                series: { seriesLength: 2, aggregateMethod: 'points_sum', tieResolution: 'extra_time_then_penalty_shootout' },
                            },
                        },
                        pointsSystem: {
                            win: pointsWin,
                            draw: pointsDraw,
                            loss: pointsLoss,
                            extraTimeAlternativeSystem: useExtraTimePoints,
                            allowBonusPoints,
                            behavior: {
                                whenToCalculate: 'on_match_finalized',
                                input: { requires: ['score'], statusRequired: 'finalized' },
                                output: { writesTo: ['standings'] },
                                basePointsLogic: [
                                    { if: { win: true }, then: { add: pointsWin } },
                                    { if: { draw: true }, then: { add: pointsDraw } },
                                    { if: { loss: true }, then: { add: pointsLoss } },
                                ],
                                extraTimeLogic: useExtraTimePoints ? {
                                    enabledWhen: { extraTimeAlternativeSystem: true },
                                    requires: ['extra_time_score'],
                                    howToApply: 'override_base_points_with_extra_time_logic',
                                    win: pointsWinExtra,
                                    draw: pointsDrawExtra,
                                    loss: pointsLossExtra,
                                } : undefined,
                                idempotency: { key: 'match_id', rule: 'ignore_if_already_processed' },
                            },
                        },
                        tiebreakers: tiebreakers.map(({ metric, enabled, order, priority }) => ({ metric, enabled, order, priority })),
                        tiebreakerBehavior: {
                            appliesTo: 'standings_sorting_only',
                            evaluationTime: 'after_all_matches_in_scope_processed',
                            scope: {
                                tableScope: 'phase_group_or_pool',
                                headToHeadScope: 'only_between_tied_teams_in_that_tableScope',
                            },
                            algorithm: {
                                stepByStep: tiebreakers.filter(t => t.enabled).map(t => t.metric),
                                finalFallback: { mode: 'stable', rule: 'keep_previous_order_or_use_team_id_ascending' },
                            },
                        },
                    },
                }),
            });

            if (response.ok) {
                triggerSectionSavedFlash('structure');
                setFeedback({ tone: 'ok', message: editingPhaseId ? 'Cambios guardados.' : 'Fase creada correctamente.' });
                resetForm();
                await loadPhases();
            } else {
                const contentType = response.headers.get('content-type');
                let errorMessage = `Error ${response.status}`;
                try {
                    if (contentType?.includes('application/json')) {
                        const errorData = await response.json();
                        errorMessage = errorData.message || errorData.error || errorMessage;
                    } else {
                        errorMessage = (await response.text()) || errorMessage;
                    }
                } catch { /* ignore parse error */ }
                setFeedback({ tone: 'error', message: `No se pudo guardar la fase: ${errorMessage.length > 140 ? errorMessage.slice(0, 137) + '…' : errorMessage}` });
            }
        } catch (error: any) {
            console.error('Error creating phase:', error);
            setFeedback({ tone: 'error', message: `No se pudo guardar la fase: ${error.message || 'error desconocido'}` });
        } finally {
            setCreating(false);
        }
    };

    const handleSetActivePhase = async (phaseId: string) => {
        if (!id || isApiManaged) return;
        const targetPhase = phases.find(phase => phase.id === phaseId);
        if (!targetPhase || targetPhase.is_active) return;

        setActivatingPhaseId(phaseId);
        try {
            const response = await fetch(`/api/tournaments/${id}/phases/${phaseId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ is_active: true }),
            });

            if (response.ok) {
                await loadPhases();
            } else {
                const contentType = response.headers.get('content-type');
                let errorMessage = `Error ${response.status}`;
                try {
                    if (contentType?.includes('application/json')) {
                        const errorData = await response.json();
                        errorMessage = errorData.message || errorData.error || errorMessage;
                    } else {
                        errorMessage = (await response.text()) || errorMessage;
                    }
                } catch {
                    // ignore parse errors
                }
                setFeedback({ tone: 'error', message: `No se pudo activar la fase: ${errorMessage.length > 140 ? errorMessage.slice(0, 137) + '…' : errorMessage}` });
            }
        } catch (error: any) {
            console.error('Error activating phase:', error);
            setFeedback({ tone: 'error', message: `No se pudo activar la fase: ${error.message || 'error desconocido'}` });
        } finally {
            setActivatingPhaseId(null);
        }
    };

    const handleDeletePhase = async (phaseId: string) => {
        if (isApiManaged) return;
        // First click → arm inline confirmation banner. Second click on the
        // explicit "Eliminar definitivamente" button (or pressing Enter)
        // performs the actual deletion. Replaces the native confirm() dialog.
        if (pendingDeletePhaseId !== phaseId) {
            setPendingDeletePhaseId(phaseId);
            return;
        }
        setDeletingPhaseId(phaseId);
        try {
            const response = await fetch(`/api/tournaments/${id}/phases/${phaseId}`, { method: 'DELETE' });
            if (response.ok) {
                setPendingDeletePhaseId(null);
                setFeedback({ tone: 'ok', message: 'Fase eliminada correctamente.' });
                await loadPhases();
            } else {
                setFeedback({ tone: 'error', message: 'No se pudo eliminar la fase. Reintentá en unos segundos.' });
            }
        } catch (error) {
            console.error('Error deleting phase:', error);
            setFeedback({ tone: 'error', message: 'No se pudo eliminar la fase. Revisá tu conexión.' });
        } finally {
            setDeletingPhaseId(null);
        }
    };

    // Returns the field-level errors that apply to the current wizard step.
    // Used to gate forward navigation and to highlight the offending field.
    const getStepErrors = useCallback((step: number): string[] => {
        if (step === 1) {
            // Note the singular "equipo": "Debe avanzar al menos 1 equipo."
            // would slip past an "equipos"-only pattern, letting the user
            // advance past a blocking error and then hit a disabled submit
            // with no explanation.
            return phaseFormErrors.filter(err =>
                /nombre|equipo|avanzan|grupos?|playoff|etapa/i.test(err)
            );
        }
        if (step === 3) {
            return validationErrors.filter(err => err.includes('Debe haber'));
        }
        return [];
    }, [phaseFormErrors, validationErrors]);

    // Step navigation accounting for skipped steps + field-level gating.
    const goNext = () => {
        const stepErrors = getStepErrors(currentStep);
        if (stepErrors.length > 0) {
            setFeedback({ tone: 'error', message: stepErrors[0] });
            return;
        }
        setFeedback(null);
        if (currentStep === 1 && (phaseType === 'knockout' || phaseType === 'playoff')) {
            setCurrentStep(4);
        } else {
            setCurrentStep(c => c + 1);
        }
    };

    const goPrev = () => {
        if (currentStep === 4 && (phaseType === 'knockout' || phaseType === 'playoff')) {
            setCurrentStep(1);
        } else {
            setCurrentStep(c => c - 1);
        }
    };

    const STEPS = [
        { step: 1, title: 'Básico', desc: 'Formato general', show: true },
        { step: 2, title: 'Puntos', desc: 'Sistema de puntuación', show: phaseType === 'league' || phaseType === 'group_stage' },
        { step: 3, title: 'Desempate', desc: 'Criterios y tabla', show: phaseType === 'league' || phaseType === 'group_stage' },
        { step: 4, title: 'Etiquetas', desc: 'Zonas de clasificación', show: true },
        // El paso 5 tenía dos casillas: una sin motor —se guardaba y nadie la
        // leía— y el arrastre de la fase previa, que sí mueve la tabla. Sacada
        // la primera, en la fase 1 el paso quedaba con un solo control apagado
        // y un cartel diciendo que no se puede usar todavía: una parada del
        // recorrido para no decidir nada. Aparece cuando hay fase previa.
        { step: 5, title: 'Estadísticas', desc: 'Arrastre de la fase previa', show: Boolean(getPreviousPhaseForForm()) },
        { step: 6, title: 'Circuito', desc: 'Puntos por posición', show: isCircuit },
    ];

    // ─── RENDER ───────────────────────────────────────────────────────────────

    const visibleSteps = STEPS.filter(step => step.show);
    const currentStepIndex = Math.max(visibleSteps.findIndex(step => step.step === currentStep), 0);
    const lastVisibleStep = visibleSteps[visibleSteps.length - 1]?.step ?? 5;
    const currentPhaseOrdinal = editingPhaseId ? phases.findIndex(phase => phase.id === editingPhaseId) + 1 : phases.length + 1;
    const previousPhaseForForm = getPreviousPhaseForForm();
    const canSubmitPhase = phaseFormErrors.length === 0 && !validationErrors.some(error => error.includes('Debe haber'));

    // El aviso del sidebar y el del paso 3 mostraban el MISMO texto al mismo
    // tiempo: parado en Desempate se leía dos veces "Debe haber al menos un
    // criterio". Y parado en cualquier otro paso el aviso no decía adónde ir,
    // que es lo único que hacía falta desde ahí. Ahora la barra sólo habla
    // cuando el problema está en otra parte, y dice en cuál.
    const tiebreakerStep = visibleSteps.find(step => step.title === 'Desempate')?.step ?? null;
    const tiebreakerError = validationErrors.find(error => error.includes('Debe haber')) ?? null;
    const sidebarAlert = phaseFormErrors[0]
        ?? (tiebreakerError && currentStep !== tiebreakerStep
            ? `Falta resolver el paso Desempate: ${tiebreakerError.charAt(0).toLowerCase()}${tiebreakerError.slice(1)}`
            : null);
    const progressPercent = visibleSteps.length > 0
        ? ((currentStepIndex + 1) / visibleSteps.length) * 100
        : 0;

    // Aca vivia `structureMetrics`: fase activa, cantidad de fases, grupos
    // configurados y llaves, que alimentaban una grilla de cuatro placas arriba
    // del listado. Las cuatro decian algo que la lista de abajo ya dice —y lo
    // dice mejor, porque ahi cada dato esta pegado a la fase que lo produce—.
    // La placa "Grupos 0" era el caso limite: una metrica cuyo unico contenido
    // era la ausencia de la cosa. Se fue la grilla y se fue el calculo.

    useEffect(() => {
        if (visibleSteps.length === 0) return;
        if (!visibleSteps.some(step => step.step === currentStep)) {
            setCurrentStep(visibleSteps[0].step);
        }
    }, [currentStep, visibleSteps]);

    useEffect(() => {
        if (!openMenuPhaseId) return;
        const handleDocClick = (e: MouseEvent) => {
            const target = e.target as HTMLElement | null;
            if (!target?.closest('.structure-phase-menu')) setOpenMenuPhaseId(null);
        };
        const handleKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setOpenMenuPhaseId(null);
        };
        document.addEventListener('mousedown', handleDocClick);
        document.addEventListener('keydown', handleKey);
        return () => {
            document.removeEventListener('mousedown', handleDocClick);
            document.removeEventListener('keydown', handleKey);
        };
    }, [openMenuPhaseId]);

    if (loading) {
        return (
            <div className="basalt-card flex items-center justify-center min-h-[300px]">
                <p className="text-dim text-sm">Cargando estructura del torneo...</p>
            </div>
        );
    }

    return (
        <div className="tournament-structure-shell flex flex-col gap-8 animate-in fade-in duration-500 pb-24">
            {mobileConfigSheet && (
                <div
                    className="structure-mobile-sheet-backdrop"
                    onClick={() => setMobileConfigSheet(null)}
                    aria-hidden="true"
                />
            )}
            {feedback && (
                <div
                    role={feedback.tone === 'error' ? 'alert' : 'status'}
                    className={`structure-feedback structure-feedback--${feedback.tone}`}
                >
                    <span className="structure-feedback-icon" aria-hidden="true">
                        {feedback.tone === 'ok' ? <CheckCircle size={18} /> : <AlertCircle size={18} />}
                    </span>
                    <p className="structure-feedback-message">{feedback.message}</p>
                    <button
                        type="button"
                        className="structure-feedback-dismiss"
                        onClick={() => setFeedback(null)}
                        aria-label="Cerrar mensaje"
                    >
                        ×
                    </button>
                </div>
            )}

            {isApiManaged && (
                <div
                    role="status"
                    className="structure-api-notice flex items-start gap-4 rounded-xl border border-blue-500/30 bg-blue-500/10 px-5 py-4 text-blue-100"
                >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-500/20 text-blue-300">
                        <Globe size={20} />
                    </span>
                    <div className="flex-1">
                        <h3 className="mb-1 text-sm font-bold uppercase tracking-wider text-blue-300">
                            Torneo gestionado por API
                        </h3>
                        <p className="text-xs leading-relaxed text-blue-100/80">
                            Las fases y el modelo competitivo se sincronizan automáticamente desde la fuente externa.
                            La edición manual está deshabilitada para evitar que la próxima sincronización sobrescriba tus cambios.
                        </p>
                    </div>
                </div>
            )}

            {/* ── Configuración del torneo (2 columnas en escritorio) ──
                 Cada uno de estos dos paneles ocupaba una banda propia de ancho
                 completo para un puñado de controles: el modelo son dos tarjetas
                 y el plantel fijo es una casilla. La mitad derecha quedaba vacía
                 en los dos. Debajo de 768px el wrapper es `display: contents`,
                 así que las secciones siguen siendo hijas directas del shell y
                 el drilldown a bottom sheet funciona igual que antes. */}
            <div className="structure-config-row">

            {/* ── Tournament model selector ── */}
            {!showPhaseForm && (
                <section
                    className={`basalt-card structure-module structure-module-modelo p-6 ${mobileConfigSheet === 'model' ? 'is-mobile-sheet-open' : ''}`}
                    data-disabled={isApiManaged || undefined}
                >
                    <button
                        type="button"
                        className="structure-mobile-sheet-close"
                        onClick={() => setMobileConfigSheet(null)}
                        aria-label="Cerrar"
                    >
                        <X size={20} />
                    </button>
                    {/* El kicker decía "Modelo competitivo" y el título "Rol del
                        torneo": dos nombres para la misma cosa, uno encima del
                        otro. Queda el que nombra el dato que se edita. */}
                    <div className="structure-module-header mb-5">
                        <h2 className="structure-module-title">Modelo competitivo</h2>
                        <p className="structure-module-copy text-dim text-sm mt-1">
                            Define si este torneo es una competencia estándar o un circuito por eventos acumulados.
                        </p>
                    </div>

                    <div className={`structure-option-grid grid grid-cols-2 gap-3 mb-5 ${isApiManaged ? 'opacity-60 pointer-events-none' : ''}`}>
                        {([
                            { value: 'league' as const, label: 'Torneo estándar', desc: 'Liga, grupos, playoffs o eliminación directa' },
                            { value: 'circuit' as const, label: 'Circuito por eventos', desc: 'Múltiples etapas con ranking acumulado por puntos' },
                        ]).map(opt => (
                            <button
                                key={opt.value}
                                type="button"
                                onClick={() => setTournamentFormat(opt.value)}
                                disabled={isApiManaged}
                                className={`structure-option-card ${tournamentFormat === opt.value ? 'is-active' : ''} flex flex-col items-start px-4 py-3 rounded-xl border transition-all duration-150 text-left ${tournamentFormat === opt.value
                                    ? 'border-[var(--accent-primary)] bg-[var(--accent-primary)]/10 text-[var(--text-main)]'
                                    : 'border-[var(--border-basalt)] bg-[var(--surface-basalt)] text-dim hover:border-[var(--text-dim)]'
                                }`}
                            >
                                <span className="text-sm font-bold">{opt.label}</span>
                                <span className="text-[11px] mt-0.5 opacity-70">{opt.desc}</span>
                            </button>
                        ))}
                    </div>

                    {isCircuit && (
                        <div className={`mb-5 ${isApiManaged ? 'opacity-60 pointer-events-none' : ''}`}>
                            <label className="block text-xs font-bold text-dim uppercase tracking-widest mb-2">
                                Definición del campeón
                            </label>
                            <div className="structure-option-grid grid grid-cols-2 gap-3">
                                {([
                                    { value: 'accumulation' as const, label: 'Por acumulación de puntos', desc: 'Gana quien más puntos acumule en todas las etapas' },
                                    { value: 'final' as const, label: 'Con final / playoff decisivo', desc: 'Las etapas clasifican a una instancia final' },
                                ]).map(opt => (
                                    <button
                                        key={opt.value}
                                        type="button"
                                        onClick={() => setCircuitChampionMode(opt.value)}
                                        disabled={isApiManaged}
                                        className={`structure-option-card ${circuitChampionMode === opt.value ? 'is-active' : ''} flex flex-col items-start px-4 py-3 rounded-xl border transition-all duration-150 text-left ${circuitChampionMode === opt.value
                                            ? 'border-[var(--accent-primary)] bg-[var(--accent-primary)]/10 text-[var(--text-main)]'
                                            : 'border-[var(--border-basalt)] bg-[var(--surface-basalt)] text-dim hover:border-[var(--text-dim)]'
                                        }`}
                                    >
                                        <span className="text-sm font-bold">{opt.label}</span>
                                        <span className="text-[11px] mt-0.5 opacity-70">{opt.desc}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* `formatModelDirty` ya existia para avisarle al shell que hay
                        cambios sin guardar; el boton lo ignoraba y quedaba verde y
                        activo tambien cuando no habia nada que guardar. Un verde que
                        no hace nada es la accion mas cara de la pantalla. */}
                    <div className="flex items-center gap-3 flex-wrap">
                        <button
                            type="button"
                            className="basalt-btn basalt-btn-primary"
                            onClick={handleSaveTournamentFormat}
                            disabled={savingFormat || isApiManaged || !formatModelDirty}
                        >
                            {savingFormat ? 'Guardando...' : 'Guardar modelo'}
                        </button>
                        {!formatModelDirty && !savingFormat && !isApiManaged && !formatSaved && (
                            <span className="structure-save-hint">
                                Elegí otro modelo para habilitar el guardado.
                            </span>
                        )}
                        {formatError && (
                            <span className="flex items-center gap-1.5 text-sm text-[var(--status-error)] font-semibold">
                                <AlertCircle size={15} />
                                {formatError}
                            </span>
                        )}
                        {formatSaved && (
                            <span className="flex items-center gap-1.5 text-sm text-[var(--status-active)] font-semibold">
                                <CheckCircle size={15} />
                                Guardado
                            </span>
                        )}
                    </div>
                </section>
            )}

            {!showPhaseForm && (
                <section
                    className={`basalt-card structure-module structure-module-plantel p-6 ${mobileConfigSheet === 'roster' ? 'is-mobile-sheet-open' : ''}`}
                    data-disabled={isApiManaged || undefined}
                >
                    <button
                        type="button"
                        className="structure-mobile-sheet-close"
                        onClick={() => setMobileConfigSheet(null)}
                        aria-label="Cerrar"
                    >
                        <X size={20} />
                    </button>
                    {/* Este panel era el único que titulaba con `structure-hero-*`
                        —la escala de la placa grande— mientras los otros dos usan
                        `structure-module-*`. Mismo rol, misma tipografía. */}
                    <div className="structure-module-header mb-5">
                        <h2 className="structure-module-title">Plantel fijo por equipo</h2>
                        <p className="structure-module-copy text-dim text-sm mt-1">
                            Cada equipo inscribe una sola vez su plantel/delegación en el torneo y esos jugadores
                            se cargan automáticamente en todos sus partidos. Otros torneos siguen con la carga
                            manual de titulares/suplentes por partido.
                        </p>
                    </div>

                    <label className="flex items-center gap-2 mb-4" style={{ cursor: isApiManaged ? 'default' : 'pointer' }}>
                        <input
                            type="checkbox"
                            checked={fixedRosterEnabled}
                            disabled={isApiManaged}
                            onChange={(e) => setFixedRosterEnabled(e.target.checked)}
                        />
                        <span className="text-sm font-semibold">Usar plantel fijo en este torneo</span>
                    </label>

                    {fixedRosterEnabled && (
                        <div className="grid grid-cols-2 gap-4 mb-4" style={{ maxWidth: 560 }}>
                            <div>
                                <label className="text-[12px] font-semibold block mb-1">Jugadores por equipo</label>
                                <input
                                    type="number"
                                    min={1}
                                    max={40}
                                    value={fixedRosterSize}
                                    disabled={isApiManaged}
                                    onChange={(e) => setFixedRosterSize(Number(e.target.value))}
                                    className="basalt-input"
                                    style={{ width: '100%' }}
                                />
                            </div>
                            <div>
                                <label className="text-[12px] font-semibold block mb-1">Congelar plantel desde la fase</label>
                                <select
                                    value={fixedRosterLockPhaseId}
                                    disabled={isApiManaged}
                                    onChange={(e) => setFixedRosterLockPhaseId(e.target.value)}
                                    className="basalt-input"
                                    style={{ width: '100%' }}
                                >
                                    <option value="">No congelar (siempre propaga a futuros)</option>
                                    {phases.map((p) => (
                                        <option key={p.id} value={p.id}>{p.name}</option>
                                    ))}
                                </select>
                                <span className="text-[11px] opacity-70 block mt-1">
                                    Desde esa fase en adelante, los cambios de plantel dejan de impactar partidos.
                                </span>
                            </div>
                        </div>
                    )}

                    <div className="flex items-center gap-3 flex-wrap">
                        <button
                            type="button"
                            className="basalt-btn basalt-btn-primary"
                            onClick={handleSaveFixedRoster}
                            disabled={savingFixedRoster || isApiManaged || !fixedRosterDirty}
                        >
                            {savingFixedRoster ? 'Guardando...' : 'Guardar plantel fijo'}
                        </button>
                        {!fixedRosterDirty && !savingFixedRoster && !isApiManaged && !fixedRosterSaved && (
                            <span className="structure-save-hint">
                                Cambiá la configuración de plantel para habilitar el guardado.
                            </span>
                        )}
                        {fixedRosterError && (
                            <span className="flex items-center gap-1.5 text-sm text-[var(--status-error)] font-semibold">
                                <AlertCircle size={15} />
                                {fixedRosterError}
                            </span>
                        )}
                        {fixedRosterSaved && (
                            <span className="flex items-center gap-1.5 text-sm text-[var(--status-active)] font-semibold">
                                <CheckCircle size={15} />
                                Guardado
                            </span>
                        )}
                    </div>
                </section>
            )}

            </div>{/* /.structure-config-row */}

            {/* La placa "Consola competitiva" que iba aca era titulo, bajada y
                cuatro metricas — ningun control. Sus dos chips ("Sistema
                estructural activo", "N fases configuradas") repetian el badge de
                la placa de abajo, y los pies de las cuatro tarjetas estaban
                apagados por CSS: markup que calculaba texto para no mostrarlo.
                Ya venia oculta en mobile. Ahora la seccion arranca por el
                listado, que es donde estan los datos y las acciones. */}

            {/* ── Phase list ── */}
            {phases.length > 0 && !showPhaseForm && (
                <div className="basalt-card structure-module structure-phase-list-module p-6">
                    {/* El badge "N FASES" y su gemelo de mobile contaban en la
                        cabecera las fases que estan listadas justo abajo, con
                        numero y todo. Con dos o tres filas a la vista, contarlas
                        aparte no informa: ocupa. El kicker "Mapa competitivo"
                        tampoco nombraba nada que exista en el producto. */}
                    <div className="structure-module-header mb-6">
                        <h2 className="structure-module-title">Fases del torneo</h2>
                        <p className="structure-module-copy">
                            El orden de esta lista es el orden en que se juega. Toca una fase para editar su
                            formato, sus grupos y sus criterios de desempate.
                        </p>
                    </div>

                    <div className="structure-phase-list flex flex-col gap-4">
                        {phases.map((phase, index) => (
                            <div key={phase.id} className="structure-phase-entry flex flex-col gap-3">
                            <div
                                role="button"
                                tabIndex={isApiManaged ? -1 : 0}
                                aria-disabled={isApiManaged || undefined}
                                aria-current={phase.is_active ? 'true' : undefined}
                                onClick={() => { if (!isApiManaged) loadPhaseIntoForm(phase); }}
                                onKeyDown={(e) => {
                                    if (isApiManaged) return;
                                    if (e.key === 'Enter' || e.key === ' ') {
                                        e.preventDefault();
                                        loadPhaseIntoForm(phase);
                                    }
                                }}
                                className={`structure-phase-card group relative flex items-start sm:items-center justify-between gap-4 p-5 rounded-xl border border-[var(--border-basalt)] bg-[var(--surface-basalt)] transition-all duration-200 ${phase.is_active ? 'structure-phase-card--active' : ''} ${pendingDeletePhaseId === phase.id ? 'structure-phase-card--pending-delete' : ''} ${isApiManaged ? 'cursor-not-allowed opacity-80' : 'cursor-pointer hover:border-[var(--accent-primary)] hover:bg-[var(--surface-elevated)]'}`}
                            >
                                <div className="structure-phase-main flex items-start sm:items-center gap-4 min-w-0">
                                    <div className="structure-phase-icon flex-shrink-0 w-10 h-10 rounded-lg bg-[var(--surface-elevated)] border border-[var(--border-basalt)] flex items-center justify-center">
                                        <Layers size={18} className="text-dim" />
                                    </div>
                                    <div className="structure-phase-copy min-w-0">
                                        <div className="structure-phase-badges flex items-center gap-2 flex-wrap mb-1">
                                            <span className="structure-phase-step text-[11px] font-bold text-dim uppercase tracking-widest">
                                                Fase {index + 1}
                                            </span>
                                            <span className={`basalt-badge ${PHASE_TYPE_BADGE[phase.phase_type] || 'badge-draft'}`}>
                                                {PHASE_TYPE_LABELS[phase.phase_type] || phase.phase_type}
                                            </span>
                                            {phase.is_active && (
                                                <span className="basalt-badge badge-ok">Activa</span>
                                            )}
                                        </div>
                                        <h3 className="structure-phase-title text-[var(--text-main)]">{phase.name}</h3>
                                        <div className="structure-phase-meta flex flex-wrap gap-3 mt-2 text-xs text-dim">
                                            {(phase.settings?.teamsCount ?? 0) > 0 && (
                                                <span>{phase.settings!.teamsCount} equipos</span>
                                            )}
                                            {phase.settings?.legs ? (
                                                <span>{phase.settings.legs === 2 ? 'Ida y vuelta' : 'Partido único'}</span>
                                            ) : null}
                                            {(phase.settings?.advanceCount ?? 0) > 0 && (
                                                <span className="structure-phase-meta-accent text-[var(--status-active)] font-semibold">
                                                    <span className="ts-meta-mobile">Avanzan {phase.settings!.advanceCount} equipos</span>
                                                    <span className="ts-meta-desktop">{phase.settings!.advanceCount} avanzan</span>
                                                </span>
                                            )}
                                            {phase.phase_type !== 'group_stage' && !((phase.settings as any)?.group_names?.length > 0) && (
                                                <span className="structure-phase-meta-single text-[var(--text-main)]/70 font-semibold">
                                                    <span className="ts-meta-mobile">Una sola tabla</span>
                                                    <span className="ts-meta-desktop">Tabla única</span>
                                                </span>
                                            )}
                                            {(phase.settings as any)?.group_names?.length > 0 && (
                                                <span className="structure-phase-meta-info text-[var(--status-published)] font-semibold">
                                                    {(phase.settings as any).group_names.length} grupos
                                                </span>
                                            )}
                                            {(phase.phase_type === 'playoff' || phase.phase_type === 'knockout') && normalizePlayoffStageNames(phase.settings).length > 0 && (
                                                <span className="structure-phase-meta-info text-[var(--status-published)] font-semibold">
                                                    {normalizePlayoffStageNames(phase.settings).length} etapas
                                                </span>
                                            )}
                                            {(phase.phase_type === 'playoff' || phase.phase_type === 'knockout') && resolvePlayoffStagesForTeams(phase.settings, getPlayoffTeamsCount(phase.settings)).length > 0 && (
                                                <span className="structure-phase-meta-info text-[var(--status-published)] font-semibold">
                                                    {(() => {
                                                        const count = resolvePlayoffStagesForTeams(phase.settings, getPlayoffTeamsCount(phase.settings)).reduce((total, stage) => total + stage.matchCount, 0);
                                                        return (
                                                            <>
                                                                <span className="ts-meta-mobile">{count} partidos en el cuadro</span>
                                                                <span className="ts-meta-desktop">{count} partidos de cuadro</span>
                                                            </>
                                                        );
                                                    })()}
                                                </span>
                                            )}
                                            {(phase.settings?.carryOver?.enabled || phase.settings?.carryOverPreviousPhase) && (
                                                <span className="structure-phase-meta-info text-[var(--accent-primary)] font-semibold">
                                                    Arrastra fase previa
                                                </span>
                                            )}
                                            {isCircuit && (() => {
                                                const pts: { position: number; points: number }[] = (phase.settings as any)?.circuit?.pointsByPlacement || DEFAULT_PLACEMENT_POINTS;
                                                const shown = pts.slice(0, 4);
                                                return (
                                                    <span className="structure-phase-meta-info text-[var(--accent-primary)] font-semibold">
                                                        {shown.map(p => `${p.position}°→${p.points}`).join(' · ')}{pts.length > 4 ? ' …' : ''}
                                                    </span>
                                                );
                                            })()}
                                        </div>
                                        <div className="structure-phase-mobile-meta" aria-hidden="true">
                                            {((phase.settings?.teamsCount ?? 0) > 0 || phase.settings?.legs) && (
                                                <div className="structure-phase-mobile-meta-row">
                                                    <Users size={18} />
                                                    <span>
                                                        {(phase.settings?.teamsCount ?? 0) > 0 && (
                                                            <strong>{phase.settings!.teamsCount} equipos</strong>
                                                        )}
                                                        {(phase.settings?.teamsCount ?? 0) > 0 && phase.settings?.legs ? ' · ' : ''}
                                                        {phase.settings?.legs
                                                            ? (phase.settings.legs === 2 ? 'Ida y vuelta' : 'Partido único')
                                                            : null}
                                                    </span>
                                                </div>
                                            )}
                                            {((phase.settings?.advanceCount ?? 0) > 0 || (phase.settings as any)?.group_names?.length > 0 || phase.phase_type !== 'group_stage') && (
                                                <div className="structure-phase-mobile-meta-row">
                                                    <TrendingUp size={18} />
                                                    <span>
                                                        {(phase.settings?.advanceCount ?? 0) > 0 && (
                                                            <strong>Avanzan {phase.settings!.advanceCount} equipos</strong>
                                                        )}
                                                        {(phase.settings?.advanceCount ?? 0) > 0 && ((phase.settings as any)?.group_names?.length > 0 || phase.phase_type !== 'group_stage') ? ' · ' : ''}
                                                        {(phase.settings as any)?.group_names?.length > 0
                                                            ? `${(phase.settings as any).group_names.length} grupos`
                                                            : phase.phase_type !== 'group_stage'
                                                                ? 'Una sola tabla'
                                                                : null}
                                                    </span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                <div className="structure-phase-actions flex items-center gap-2 flex-shrink-0">
                                    {!isApiManaged && (
                                        <button
                                            type="button"
                                            onClick={e => { e.stopPropagation(); loadPhaseIntoForm(phase); }}
                                            className="structure-phase-mobile-edit"
                                        >
                                            <Edit3 size={16} aria-hidden="true" />
                                            <span>Editar</span>
                                        </button>
                                    )}
                                    {!phase.is_active && !isApiManaged && (
                                        <button
                                            type="button"
                                            onClick={e => {
                                                e.stopPropagation();
                                                handleSetActivePhase(phase.id);
                                            }}
                                            disabled={activatingPhaseId === phase.id}
                                            className="px-3 py-1.5 rounded-full border border-[var(--status-active)]/40 bg-[var(--status-active)]/8 text-[11px] font-bold uppercase tracking-widest text-[var(--status-active)] hover:bg-[var(--status-active)]/14 transition-colors disabled:opacity-60 disabled:cursor-wait"
                                            title="Marcar como fase activa"
                                        >
                                            {activatingPhaseId === phase.id ? 'Activando...' : 'Activar'}
                                        </button>
                                    )}
                                    <ChevronRight size={16} className="structure-phase-chevron text-dim group-hover:text-[var(--text-main)] transition-colors" />
                                    {!isApiManaged && pendingDeletePhaseId === phase.id ? (
                                        <div
                                            className="structure-phase-delete-confirm"
                                            role="group"
                                            aria-label={`Confirmar eliminación de ${phase.name}`}
                                            onClick={e => e.stopPropagation()}
                                        >
                                            <span className="structure-phase-delete-confirm-text">
                                                ¿Eliminar fase? Se quitan sus grupos, tablas y cuadro; los partidos quedan sin fase.
                                            </span>
                                            <button
                                                type="button"
                                                onClick={e => { e.stopPropagation(); setPendingDeletePhaseId(null); }}
                                                className="structure-phase-delete-confirm-cancel"
                                            >
                                                Cancelar
                                            </button>
                                            <button
                                                type="button"
                                                onClick={e => { e.stopPropagation(); handleDeletePhase(phase.id); }}
                                                disabled={deletingPhaseId === phase.id}
                                                className="structure-phase-delete-confirm-go"
                                                autoFocus
                                            >
                                                {deletingPhaseId === phase.id ? 'Eliminando…' : 'Eliminar'}
                                            </button>
                                        </div>
                                    ) : !isApiManaged ? (
                                        <button
                                            type="button"
                                            onClick={e => { e.stopPropagation(); handleDeletePhase(phase.id); }}
                                            className="structure-phase-delete p-2 rounded-lg hover:bg-red-500/10 text-dim hover:text-red-400 transition-all duration-200"
                                            title="Eliminar fase"
                                            aria-label={`Eliminar fase ${phase.name}`}
                                        >
                                            <Trash2 size={15} />
                                        </button>
                                    ) : null}
                                    {!isApiManaged && (
                                        <div className="structure-phase-menu relative">
                                            <button
                                                type="button"
                                                onClick={e => {
                                                    e.stopPropagation();
                                                    setOpenMenuPhaseId(openMenuPhaseId === phase.id ? null : phase.id);
                                                }}
                                                className="structure-phase-menu-trigger p-2 rounded-lg text-dim hover:text-[var(--text-main)] hover:bg-[var(--surface-elevated)] transition-colors"
                                                aria-haspopup="menu"
                                                aria-expanded={openMenuPhaseId === phase.id}
                                                title="Más acciones"
                                            >
                                                <MoreVertical size={16} />
                                            </button>
                                            {openMenuPhaseId === phase.id && (
                                                <div className="structure-phase-menu-panel" role="menu">
                                                    {!phase.is_active && (
                                                        <button
                                                            type="button"
                                                            role="menuitem"
                                                            onClick={e => {
                                                                e.stopPropagation();
                                                                setOpenMenuPhaseId(null);
                                                                handleSetActivePhase(phase.id);
                                                            }}
                                                            disabled={activatingPhaseId === phase.id}
                                                            className="structure-phase-menu-item"
                                                        >
                                                            <CheckCircle size={14} />
                                                            {activatingPhaseId === phase.id ? 'Activando…' : 'Activar fase'}
                                                        </button>
                                                    )}
                                                    <button
                                                        type="button"
                                                        role="menuitem"
                                                        onClick={e => {
                                                            e.stopPropagation();
                                                            setOpenMenuPhaseId(null);
                                                            handleDeletePhase(phase.id);
                                                        }}
                                                        className="structure-phase-menu-item structure-phase-menu-item--danger"
                                                    >
                                                        <Trash2 size={14} />
                                                        Eliminar fase
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                            {!!id && (phase.phase_type === 'playoff' || phase.phase_type === 'knockout') && (
                                <PlayoffBuilderPanel
                                    tournamentId={id}
                                    phaseId={phase.id}
                                    phaseName={phase.name}
                                    settings={phase.settings}
                                    onChanged={() => { loadPhases(); }}
                                />
                            )}
                            </div>
                        ))}
                    </div>

                    <div className="structure-module-footer mt-6 pt-6 border-t border-[var(--border-basalt)] flex justify-center">
                        <button
                            className="basalt-btn basalt-btn-primary"
                            onClick={() => { resetForm(); setShowPhaseForm(true); }}
                            disabled={isApiManaged}
                        >
                            <Plus size={16} />
                            Agregar nueva fase
                        </button>
                    </div>
                </div>
            )}

            {/* ── Mobile-only: 'Configuración del torneo' drilldown ──
                 Collapses the Modelo competitivo + Plantel fijo modules into two
                 compact rows. Tapping a row opens the original section as a
                 bottom sheet (see is-mobile-sheet-open). Hidden on desktop via CSS. */}
            {!showPhaseForm && (
                <section className="structure-mobile-config" aria-label="Configuración del torneo">
                    <div className="structure-mobile-config-header">
                        <h3>Configuración del torneo</h3>
                    </div>
                    <div className="structure-mobile-config-list">
                        <button
                            type="button"
                            className="structure-mobile-config-row"
                            onClick={() => setMobileConfigSheet('model')}
                            disabled={isApiManaged}
                        >
                            <span className="structure-mobile-config-row-icon">
                                <Trophy size={18} aria-hidden="true" />
                            </span>
                            <span className="structure-mobile-config-row-text">
                                <span className="structure-mobile-config-row-kicker">Modelo competitivo</span>
                                <span className="structure-mobile-config-row-value">
                                    {savedFormat === 'circuit' ? 'Circuito por eventos' : 'Torneo estándar'}
                                </span>
                            </span>
                            <ChevronRight size={18} className="structure-mobile-config-row-chev" aria-hidden="true" />
                        </button>
                        <button
                            type="button"
                            className="structure-mobile-config-row"
                            onClick={() => setMobileConfigSheet('roster')}
                            disabled={isApiManaged}
                        >
                            <span className="structure-mobile-config-row-icon">
                                <Users size={18} aria-hidden="true" />
                            </span>
                            <span className="structure-mobile-config-row-text">
                                <span className="structure-mobile-config-row-kicker">Plantel fijo</span>
                                <span className={`structure-mobile-config-row-value${fixedRosterEnabled ? '' : ' is-muted'}`}>
                                    {fixedRosterEnabled ? `${fixedRosterSize} jugadores por equipo` : 'No habilitado'}
                                </span>
                            </span>
                            <ChevronRight size={18} className="structure-mobile-config-row-chev" aria-hidden="true" />
                        </button>
                    </div>
                </section>
            )}

            {/* ── Empty state ── */}
            {phases.length === 0 && !showPhaseForm && (
                <div className="basalt-card basalt-hero structure-empty-panel flex flex-col items-center justify-center text-center py-20 px-8 gap-6">
                    <div className="structure-empty-icon w-16 h-16 rounded-xl bg-[var(--surface-elevated)] border border-[var(--border-basalt)] flex items-center justify-center">
                        <Layers size={28} className="text-dim" />
                    </div>
                    <div className="structure-empty-copy">
                        <h3 className="structure-empty-title mb-3">Sin fases configuradas</h3>
                        <p className="structure-empty-text text-dim text-sm max-w-md mx-auto">
                            Diseña la estructura competitiva del torneo. Define cómo se competirá y qué criterios decidirán al campeón.
                        </p>
                    </div>
                    <button
                        className="basalt-btn basalt-btn-primary"
                        onClick={() => { resetForm(); setShowPhaseForm(true); }}
                    >
                        <Plus size={16} />
                        Configurar primera fase
                    </button>
                </div>
            )}

            {/* ── Phase wizard ── */}
            {showPhaseForm && (
                <div className="basalt-card phase-wizard-card structure-wizard-card p-0 overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-300">
                    <form onSubmit={handleCreatePhase}>
                        <div className="phase-wizard-layout structure-wizard-layout flex flex-col lg:flex-row min-h-[600px]">

                            {/* Sidebar */}
                            <aside className="phase-wizard-sidebar structure-wizard-sidebar w-full lg:w-64 xl:w-72 flex-shrink-0 bg-[var(--surface-basalt)] border-b lg:border-b-0 lg:border-r border-[var(--border-basalt)] p-6 flex flex-col gap-4">
                                <div className="phase-wizard-sidebar-head structure-wizard-sidebar-head mb-2">
                                    <p className="phase-wizard-kicker text-[11px] font-bold text-dim uppercase tracking-widest mb-1">
                                        {editingPhaseId ? 'Editando' : 'Nueva'}
                                    </p>
                                    <h2 className="phase-wizard-sidebar-title">
                                        {phaseName || `Fase ${currentPhaseOrdinal}`}
                                    </h2>
                                    {/* Acá iba "Consola modular para definir formato, reglas y
                                        criterios de esta etapa". Es la lista de los cinco pasos
                                        que están doce píxeles más abajo, dicha en prosa. */}
                                </div>

                                <div className="structure-wizard-progress-card">
                                    <div className="structure-wizard-progress-head">
                                        <span>Progreso</span>
                                        <strong>{currentStepIndex + 1}/{visibleSteps.length}</strong>
                                    </div>
                                    <div className="structure-wizard-progress-bar">
                                        <span style={{ width: `${progressPercent}%` }} />
                                    </div>
                                </div>

                                {sidebarAlert && (
                                    <button
                                        type="button"
                                        className="structure-wizard-sidebar-alert"
                                        onClick={() => { if (tiebreakerStep) setCurrentStep(tiebreakerStep); }}
                                    >
                                        <AlertCircle size={14} aria-hidden="true" />
                                        <span>{sidebarAlert}</span>
                                    </button>
                                )}

                                <nav className="phase-wizard-stepper structure-wizard-stepper flex flex-col gap-1">
                                    {visibleSteps.map(s => (
                                        <button
                                            key={s.step}
                                            type="button"
                                            onClick={() => setCurrentStep(s.step)}
                                            className={`phase-wizard-step structure-wizard-step ${currentStep === s.step ? 'is-active' : ''} ${currentStep > s.step ? 'is-complete' : ''} flex items-start gap-3 px-3 py-2.5 rounded-lg text-left transition-all duration-150 ${currentStep === s.step
                                                ? 'bg-[var(--accent-primary)]/10 border border-[var(--accent-primary)]/30'
                                                : 'hover:bg-[var(--surface-elevated)]'
                                                }`}
                                        >
                                            <span className={`phase-wizard-step-index structure-wizard-step-index ${currentStep === s.step ? 'is-active' : ''} ${currentStep > s.step ? 'is-complete' : ''} w-5 h-5 flex-shrink-0 rounded-full flex items-center justify-center text-[11px] font-bold mt-0.5 ${currentStep > s.step
                                                ? 'bg-[var(--status-active)] text-[var(--text-main)]'
                                                : currentStep === s.step
                                                    ? 'bg-[var(--accent-primary)] text-[var(--text-main)]'
                                                    : 'bg-[var(--surface-elevated)] border border-[var(--border-basalt)] text-dim'
                                                }`}>
                                                {currentStep > s.step ? <CheckCircle size={12} /> : s.step}
                                            </span>
                                            <span className="phase-wizard-step-copy flex flex-col min-w-0">
                                                <span className={`phase-wizard-step-title text-sm font-semibold ${currentStep === s.step ? 'text-[var(--text-main)]' : 'text-dim'}`}>
                                                    {s.title}
                                                </span>
                                                <span className="phase-wizard-step-desc text-[11px] text-dim">{s.desc}</span>
                                            </span>
                                        </button>
                                    ))}
                                </nav>

                                {/* Inline meta strip — single-line summary in
                                    place of the 3-card stack. Reads like a
                                    breadcrumb: "Liga · 16 equipos · Avanzan 8".
                                    The legacy 3-card grid wasted ~140px of
                                    vertical space for data that doesn't change
                                    in this paso. */}
                                <div className="structure-sidebar-facts structure-sidebar-facts-inline">
                                    <span className="structure-sidebar-fact-inline">
                                        {PHASE_TYPE_LABELS[phaseType] || phaseType}
                                    </span>
                                    <span className="structure-sidebar-fact-inline">
                                        {teamsCount === '' ? '— equipos' : `${teamsCount} equipos`}
                                    </span>
                                    <span className="structure-sidebar-fact-inline">
                                        Avanzan {advanceCount === '' ? '—' : advanceCount}
                                    </span>
                                </div>
                            </aside>

                            {/* Content */}
                            <div className="phase-wizard-content structure-wizard-content flex-1 flex flex-col p-6 lg:p-8 gap-0 min-w-0">

                                {/* STEP 1: Básico */}
                                {currentStep === 1 && (
                                    <div className="phase-wizard-step-panel structure-step-panel structure-step-panel-basic flex flex-col gap-6">
                                        <div className="phase-wizard-step-head structure-step-head">
                                            {/* El "Paso N" estaba en tres de los cinco pasos y en
                                                ninguno de los otros dos. Además la barra lateral ya
                                                dice el número (1/5), marca cuál está activo y lo
                                                nombra. Tres veces el mismo dato, y encima
                                                inconsistente. Se numera en un solo lugar. */}
                                            <h3 className="phase-wizard-step-heading structure-step-heading-main mb-1">Configuración Básica</h3>
                                            <p className="phase-wizard-step-subtitle text-dim text-sm">Define la estructura general de la fase</p>
                                        </div>

                                        <div className="phase-wizard-fields flex flex-col gap-5">
                                            {/* Name */}
                                            <div className="structure-field-panel structure-field-panel-wide structure-basic-name-panel">
                                                <label className="structure-field-label block text-xs font-bold text-dim uppercase tracking-widest mb-2">
                                                    Nombre de la fase
                                                </label>
                                                <input
                                                    type="text"
                                                    className="basalt-input"
                                                    value={phaseName}
                                                    onChange={e => setPhaseName(e.target.value)}
                                                    placeholder="Ej: Fase Regular, Octavos de Final"
                                                    required
                                                    autoFocus
                                                    aria-invalid={phaseFormErrors.some(err => /nombre/i.test(err)) || undefined}
                                                />
                                                {phaseFormErrors.some(err => /nombre/i.test(err)) && (
                                                    <p className="structure-field-error" role="alert">
                                                        <AlertCircle size={12} />
                                                        Necesitas un nombre para esta fase.
                                                    </p>
                                                )}
                                            </div>

                                            {/* Phase type */}
                                            <div className="structure-field-panel structure-field-panel-wide structure-basic-type-panel">
                                                <label className="structure-field-label block text-xs font-bold text-dim uppercase tracking-widest mb-3">
                                                    Tipo de fase
                                                </label>
                                                <div className="structure-option-grid grid grid-cols-2 gap-3">
                                                    {(['league', 'group_stage', 'playoff'] as const).map(type => (
                                                        <button
                                                            key={type}
                                                            type="button"
                                                            onClick={() => {
                                                                setPhaseType(type);
                                                                if (type === 'group_stage' && groupNames.length === 0) {
                                                                    setGroupNames(['Grupo A', 'Grupo B']);
                                                                } else if (type !== 'group_stage') {
                                                                    setGroupNames([]);
                                                                }
                                                    if (type === 'playoff') {
                                                        const defaultNames = getDefaultPlayoffStageNames(formPlayoffTeamsCount);
                                                        setPlayoffStageNames(defaultNames);
                                                        setPlayoffStageMatchCounts(normalizePlayoffStageMatchCounts(defaultNames, [], formPlayoffTeamsCount));
                                                        setPlayoffStagesCustomized(false);
                                                    } else {
                                                        setPlayoffStageNames(DEFAULT_PLAYOFF_STAGE_NAMES);
                                                        setPlayoffStageMatchCounts(DEFAULT_PLAYOFF_STAGE_MATCH_COUNTS);
                                                        setPlayoffStagesCustomized(false);
                                                    }
                                                            }}
                                                            className={`structure-option-card structure-phase-type-card ${phaseType === type ? 'is-active' : ''} flex flex-col items-start px-4 py-3 rounded-xl border transition-all duration-150 text-left ${phaseType === type
                                                                ? 'border-[var(--accent-primary)] bg-[var(--accent-primary)]/10 text-[var(--text-main)]'
                                                                : 'border-[var(--border-basalt)] bg-[var(--surface-basalt)] text-dim hover:border-[var(--text-dim)]'
                                                                }`}
                                                        >
                                                            <span className="structure-phase-type-icon" aria-hidden="true">
                                                                {type === 'league' && <Layers size={18} />}
                                                                {type === 'group_stage' && <Grid3x3 size={18} />}
                                                                {type === 'playoff' && <Trophy size={18} />}
                                                            </span>
                                                            <span className="text-sm font-bold">
                                                                {type === 'league' && 'Liga'}
                                                                {type === 'group_stage' && 'Grupos'}
                                                                {type === 'playoff' && 'Playoff / Llaves'}
                                                            </span>
                                                            <span className="text-[11px] mt-0.5 opacity-70">
                                                                {PHASE_TYPE_LABELS[type]}
                                                            </span>
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>

                                            {/* Groups definition — only for group_stage */}
                                            {(phaseType === 'playoff' || phaseType === 'knockout') && (
                                                <div className="structure-field-panel structure-field-panel-wide structure-field-panel-accent structure-basic-groups-panel rounded-xl border border-[var(--accent-primary)]/30 bg-[var(--accent-primary)]/5 p-5">
                                                    <div className="flex items-center justify-between gap-3 mb-4">
                                                        <div>
                                                            <p className="text-xs font-bold text-dim uppercase tracking-widest mb-0.5">
                                                                Etapas de eliminacion
                                                            </p>
                                                            <p className="text-sm text-[var(--text-main)] font-semibold">
                                                                Define las etapas que guiaran el cuadro playoff
                                                            </p>
                                                        </div>
                                                        <span className="basalt-badge badge-published">
                                                            {normalizePlayoffStageNames(playoffStageNames).length} etapa{normalizePlayoffStageNames(playoffStageNames).length !== 1 ? 's' : ''}
                                                            {' · '}
                                                            {normalizePlayoffStageMatchCounts(playoffStageNames, playoffStageMatchCounts, formPlayoffTeamsCount).reduce((total, count) => total + count, 0)} partido{normalizePlayoffStageMatchCounts(playoffStageNames, playoffStageMatchCounts, formPlayoffTeamsCount).reduce((total, count) => total + count, 0) !== 1 ? 's' : ''}
                                                        </span>
                                                    </div>

                                                    <div className="mb-4 rounded-lg border border-[var(--accent-primary)]/40 bg-[var(--accent-primary)]/10 px-3 py-2.5 text-xs text-[var(--text-main)]/85">
                                                        <strong>¿Querés copas derivadas (Oro / Plata / Bronce / Estímulo), cruces aleatorios u horarios automáticos?</strong>{' '}
                                                        Esto define solo un cuadro lineal simple. Para subcopas y avance automático: poné un nombre a la fase y guardala; después, en la lista de fases, abrí el panel <strong>“Constructor de Playoff”</strong> de esta fase.
                                                    </div>

                                                    {playoffStageAdjustment && (
                                                        <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2.5 text-xs text-amber-100" role="status">
                                                            <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
                                                            <span>
                                                                Con <strong>{formPlayoffTeamsCount} equipos</strong> el cuadro lineal tiene <strong>{playoffStageAdjustment.expected} etapa{playoffStageAdjustment.expected !== 1 ? 's' : ''}</strong>.
                                                                {playoffStageAdjustment.excess
                                                                    ? ` Configuraste ${playoffStageAdjustment.configured}: al guardar se conservarán solo las últimas ${playoffStageAdjustment.expected} (las primeras se descartan).`
                                                                    : ` Configuraste ${playoffStageAdjustment.configured}: al guardar se completarán las etapas faltantes al frente.`}
                                                            </span>
                                                        </div>
                                                    )}

                                                    <div className="flex flex-col gap-2 mb-4">
                                                        {playoffStageNames.map((name, i) => (
                                                            <div key={i} className="structure-group-row flex flex-col sm:flex-row gap-2">
                                                                <div className="flex-1 min-w-0">
                                                                    <input
                                                                        type="text"
                                                                        className="basalt-input w-full"
                                                                        value={name}
                                                                        onChange={e => updatePlayoffStageName(i, e.target.value)}
                                                                        placeholder={DEFAULT_PLAYOFF_STAGE_NAMES[i] || `Etapa ${i + 1}`}
                                                                    />
                                                                </div>
                                                                <label className="flex items-center gap-2 rounded-xl border border-[var(--border-basalt)] bg-black/20 px-3 py-2 min-w-[150px]">
                                                                    <span className="text-[11px] font-black uppercase tracking-widest text-dim">
                                                                        Partidos
                                                                    </span>
                                                                    <input
                                                                        type="number"
                                                                        min={1}
                                                                        max={64}
                                                                        className="w-16 bg-transparent text-center text-[var(--text-main)] font-black outline-none"
                                                                        value={playoffStageMatchCounts[i] ?? 1}
                                                                        onChange={e => updatePlayoffStageMatchCount(i, e.target.value ? Number(e.target.value) : '')}
                                                                        aria-label={`Partidos en ${name || `etapa ${i + 1}`}`}
                                                                    />
                                                                </label>
                                                                <button
                                                                    type="button"
                                                                    className="basalt-btn flex-shrink-0 px-3"
                                                                    onClick={() => removePlayoffStageName(i)}
                                                                    title="Eliminar etapa"
                                                                >
                                                                    <Trash2 size={14} />
                                                                </button>
                                                            </div>
                                                        ))}
                                                    </div>

                                                    <button
                                                        type="button"
                                                        className="basalt-btn w-full"
                                                        onClick={addPlayoffStageName}
                                                    >
                                                        <Plus size={14} />
                                                        Agregar etapa
                                                    </button>
                                                </div>
                                            )}

                                            {phaseType !== 'group_stage' && phaseType !== 'playoff' && phaseType !== 'knockout' && (
                                                <div className="structure-field-panel structure-field-panel-wide structure-single-table-note">
                                                    <label className="structure-field-label block text-xs font-bold text-dim uppercase tracking-widest mb-2">
                                                        Tabla competitiva
                                                    </label>
                                                    <p className="structure-single-table-copy">
                                                        Esta fase no usa grupos. Todos los equipos se ordenan en una sola tabla general.
                                                    </p>
                                                </div>
                                            )}

                                            {phaseType === 'group_stage' && (
                                                <div className="structure-field-panel structure-field-panel-wide structure-field-panel-accent structure-basic-groups-panel rounded-xl border border-[var(--accent-primary)]/30 bg-[var(--accent-primary)]/5 p-5">
                                                    <div className="flex items-center justify-between gap-3 mb-4">
                                                        <div>
                                                            <p className="text-xs font-bold text-dim uppercase tracking-widest mb-0.5">
                                                                Grupos de la fase
                                                            </p>
                                                            <p className="text-sm text-[var(--text-main)] font-semibold">
                                                                Define los grupos que componen esta fase
                                                            </p>
                                                        </div>
                                                        <span className="basalt-badge badge-published">
                                                            {groupNames.length} grupo{groupNames.length !== 1 ? 's' : ''}
                                                        </span>
                                                    </div>

                                                    <div className="flex flex-col gap-2 mb-4">
                                                        {groupNames.map((name, i) => (
                                                            <div key={i} className="structure-group-row flex gap-2">
                                                                <input
                                                                    type="text"
                                                                    className="basalt-input flex-1"
                                                                    value={name}
                                                                    onChange={e => updateGroupName(i, e.target.value)}
                                                                    placeholder={`Grupo ${String.fromCharCode(65 + i)}`}
                                                                />
                                                                <button
                                                                    type="button"
                                                                    className="basalt-btn flex-shrink-0 px-3"
                                                                    onClick={() => removeGroupName(i)}
                                                                    title="Eliminar grupo"
                                                                >
                                                                    <Trash2 size={14} />
                                                                </button>
                                                            </div>
                                                        ))}
                                                    </div>

                                                    <button
                                                        type="button"
                                                        className="basalt-btn w-full"
                                                        onClick={addGroupName}
                                                    >
                                                        <Plus size={14} />
                                                        Agregar grupo
                                                    </button>
                                                </div>
                                            )}

                                            {/* Teams & advance counts */}
                                            <div className="structure-split-grid grid grid-cols-2 gap-4">
                                                <div className="structure-field-panel">
                                                    <label className="structure-field-label block text-xs font-bold text-dim uppercase tracking-widest mb-2">
                                                        Cantidad de equipos
                                                    </label>
                                                    <div className="structure-counter-shell flex items-center border border-[var(--border-basalt)] rounded-lg bg-[var(--bg-basalt)] overflow-hidden">
                                                        <button type="button" aria-label="Disminuir cantidad de equipos" className="structure-counter-button px-3 py-2 text-dim hover:text-[var(--text-main)] transition-colors" onClick={() => setTeamsCount(p => p === '' ? 2 : Math.max(2, Number(p) - 1))}>−</button>
                                                        <input type="number" aria-label="Cantidad de equipos" className="structure-counter-input flex-1 bg-transparent text-center text-[var(--text-main)] font-bold text-lg outline-none py-2 border-x border-[var(--border-basalt)]" value={teamsCount} onChange={e => setTeamsCount(e.target.value ? Number(e.target.value) : '')} placeholder="—" />
                                                        <button type="button" aria-label="Aumentar cantidad de equipos" className="structure-counter-button px-3 py-2 text-dim hover:text-[var(--text-main)] transition-colors" onClick={() => setTeamsCount(p => p === '' ? 3 : Number(p) + 1)}>+</button>
                                                    </div>
                                                </div>
                                                <div className="structure-field-panel">
                                                    <label className="structure-field-label block text-xs font-bold text-dim uppercase tracking-widest mb-2">
                                                        Equipos que avanzan
                                                    </label>
                                                    <div className="structure-counter-shell flex items-center border border-[var(--border-basalt)] rounded-lg bg-[var(--bg-basalt)] overflow-hidden">
                                                        <button type="button" aria-label="Disminuir equipos que avanzan" className="structure-counter-button px-3 py-2 text-dim hover:text-[var(--text-main)] transition-colors" onClick={() => { setAdvanceTouched(true); setAdvanceCount(p => p === '' ? 1 : Math.max(1, Number(p) - 1)); }}>−</button>
                                                        <input type="number" aria-label="Equipos que avanzan" className="structure-counter-input flex-1 bg-transparent text-center text-[var(--text-main)] font-bold text-lg outline-none py-2 border-x border-[var(--border-basalt)]" value={advanceCount} onChange={e => { setAdvanceTouched(true); setAdvanceCount(e.target.value ? Number(e.target.value) : ''); }} placeholder="—" />
                                                        <button type="button" aria-label="Aumentar equipos que avanzan" className="structure-counter-button px-3 py-2 text-dim hover:text-[var(--text-main)] transition-colors" onClick={() => { setAdvanceTouched(true); setAdvanceCount(p => p === '' ? 2 : Number(p) + 1); }}>+</button>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Match format */}
                                            <div className="structure-field-panel structure-basic-format-panel">
                                                <label className="structure-field-label block text-xs font-bold text-dim uppercase tracking-widest mb-3">
                                                    Formato de partido
                                                </label>
                                                <div className="structure-option-grid structure-option-grid-double flex gap-3">
                                                    {([{ value: 1, label: 'Partido único' }, { value: 2, label: 'Ida y vuelta' }] as const).map(opt => (
                                                        <button
                                                            key={opt.value}
                                                            type="button"
                                                            onClick={() => setLegs(opt.value)}
                                                            className={`structure-option-card ${legs === opt.value ? 'is-active' : ''} flex-1 py-3 rounded-xl border text-sm font-semibold transition-all duration-150 ${legs === opt.value
                                                                ? 'border-[var(--accent-primary)] bg-[var(--accent-primary)]/10 text-[var(--text-main)]'
                                                                : 'border-[var(--border-basalt)] bg-[var(--surface-basalt)] text-dim hover:border-[var(--text-dim)]'
                                                                }`}
                                                        >
                                                            {opt.label}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>

                                            {/* Acá iba "Resumen de la fase": nombre · tipo · equipos ·
                                                avanzan · formato. Los cinco datos son los cinco
                                                controles de ESTE paso, repetidos como frase debajo
                                                de los controles que los producen. Un resumen sirve
                                                cuando resume algo que no está a la vista; el
                                                contexto que sí hace falta en los pasos 2 a 5 lo
                                                lleva la barra lateral, que no se va de pantalla. */}
                                        </div>
                                    </div>
                                )}

                                {/* STEP 2: Puntos */}
                                {currentStep === 2 && (
                                    <div className="phase-wizard-step-panel structure-step-panel structure-step-panel-points flex flex-col gap-6">
                                        <div className="structure-step-head">
                                            <h3 className=" mb-1">Sistema de Puntos</h3>
                                            <p className="text-dim text-sm">Configura los puntos otorgados por cada resultado</p>
                                        </div>

                                        {/* Live example */}
                                        <div className="structure-points-example" aria-live="polite">
                                            <span className="structure-points-example-eyebrow">Ejemplo</span>
                                            <div className="structure-points-example-row">
                                                <span className="structure-points-example-team">Local <strong>{pointsWin}</strong></span>
                                                <span className="structure-points-example-vs">vs</span>
                                                <span className="structure-points-example-team">Visitante <strong>{pointsLoss}</strong></span>
                                            </div>
                                            <p className="structure-points-example-foot">
                                                Una victoria local suma <strong>{pointsWin} pts</strong>, una derrota visitante <strong>{pointsLoss} pts</strong>, empate <strong>{pointsDraw} pts</strong> a cada uno.
                                            </p>
                                        </div>

                                        <div className="structure-score-grid grid grid-cols-3 gap-4">
                                            {[
                                                { label: 'Victoria', value: pointsWin, set: setPointsWin, color: 'text-[var(--status-active)]' },
                                                { label: 'Empate', value: pointsDraw, set: setPointsDraw, color: 'text-dim' },
                                                { label: 'Derrota', value: pointsLoss, set: setPointsLoss, color: 'text-[var(--status-error)]' },
                                            ].map(({ label, value, set, color }) => (
                                                <div key={label} className="structure-field-panel structure-score-panel">
                                                    <label className={`structure-field-label block text-xs font-bold uppercase tracking-widest mb-2 ${color}`}>{label}</label>
                                                    <input
                                                        type="number"
                                                        className="basalt-input text-center text-2xl font-black py-4"
                                                        value={value}
                                                        onChange={e => set(Number(e.target.value))}
                                                    />
                                                </div>
                                            ))}
                                        </div>

                                        <div className={`structure-toggle-card ${useExtraTimePoints ? 'is-on' : ''}`}>
                                            <label className="structure-toggle-card-label">
                                                <input
                                                    type="checkbox"
                                                    className="structure-toggle-card-input"
                                                    checked={useExtraTimePoints}
                                                    onChange={e => setUseExtraTimePoints(e.target.checked)}
                                                />
                                                <span className="structure-toggle-card-copy">
                                                    <span className="structure-toggle-card-title">Puntos diferentes por prórroga / penales</span>
                                                    <span className="structure-toggle-card-help">Si se va a tiempo extra se usan estos puntos alternativos.</span>
                                                </span>
                                            </label>
                                            {useExtraTimePoints && (
                                                <div className="structure-toggle-card-body structure-score-grid">
                                                    {[
                                                        { label: 'Victoria (extra)', value: pointsWinExtra, set: setPointsWinExtra },
                                                        { label: 'Empate (extra)', value: pointsDrawExtra, set: setPointsDrawExtra },
                                                        { label: 'Derrota (extra)', value: pointsLossExtra, set: setPointsLossExtra },
                                                    ].map(({ label, value, set }) => (
                                                        <div key={label} className="structure-score-panel">
                                                            <label className="structure-field-label">{label}</label>
                                                            <input type="number" className="basalt-input text-center" value={value} onChange={e => set(Number(e.target.value))} />
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>

                                        {isRugby && (
                                            <div className={`structure-toggle-card ${allowBonusPoints ? 'is-on' : ''}`}>
                                                <label className="structure-toggle-card-label">
                                                    <input
                                                        type="checkbox"
                                                        className="structure-toggle-card-input"
                                                        checked={allowBonusPoints}
                                                        onChange={e => setAllowBonusPoints(e.target.checked)}
                                                    />
                                                    <span className="structure-toggle-card-copy">
                                                        <span className="structure-toggle-card-title">Puntos bonus (Rugby)</span>
                                                        <span className="structure-toggle-card-help">Otorgar puntos de bonificación según las reglas del torneo (4 tries = +1, perder por menos de 7 = +1).</span>
                                                    </span>
                                                </label>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* STEP 3: Desempate */}
                                {currentStep === 3 && (() => {
                                    const blockingErrors = validationErrors.filter(err => err.includes('Debe haber'));
                                    const advisoryErrors = validationErrors.filter(err => !err.includes('Debe haber'));
                                    const visibleColumnsCount = Object.values(tableCols).filter(Boolean).length;
                                    const totalColumnsCount = Object.keys(tableCols).length;
                                    return (
                                    <div className="phase-wizard-step-panel structure-step-panel structure-step-panel-rules flex flex-col gap-5">
                                        {/* Acá iba una barra de progreso "sólo para mobile", con la
                                            premisa de que en mobile la del sidebar no se ve. Sí se
                                            ve: el sidebar no se oculta, se aplana en una tira
                                            horizontal que conserva "PROGRESO 3/4", su barra y los
                                            pasos. Quedaban dos barras y dos textos del mismo dato,
                                            una arriba de la otra. */}
                                        <div className="structure-step-head structure-step-head-tiebreakers">
                                            <div className="structure-step-head-main">
                                                <div className="structure-step-head-icon" aria-hidden="true">
                                                    <ArrowDownUp size={18} />
                                                </div>
                                                <div className="structure-step-head-text">
                                                    <h3 className="structure-step-head-title">Criterios de Desempate</h3>
                                                    <p className="structure-step-head-subtitle">
                                                        Si dos equipos terminan con los mismos puntos, estos criterios se aplican en orden hasta resolver el empate.
                                                    </p>
                                                </div>
                                            </div>
                                            {/* Acá iba el número grande de criterios activos. La
                                                misma cuenta ya está en el chip "N activos" del
                                                encabezado de la lista, a 60px de distancia, y con
                                                cero la dice una tercera vez el estado vacío. */}
                                        </div>

                                        {blockingErrors.length > 0 && (
                                            <div className="structure-inline-alert structure-inline-alert-error" role="alert">
                                                {blockingErrors.map((err, i) => (
                                                    <span key={i} className="structure-inline-alert-row">
                                                        <AlertCircle size={14} className="structure-inline-alert-icon" aria-hidden="true" />
                                                        <span className="structure-inline-alert-text">{err}</span>
                                                    </span>
                                                ))}
                                            </div>
                                        )}

                                        {advisoryErrors.length > 0 && (
                                            <div className="structure-inline-alert structure-inline-alert-warning" role="status">
                                                {advisoryErrors.map((err, i) => (
                                                    <span key={i} className="structure-inline-alert-row">
                                                        <Info size={14} className="structure-inline-alert-icon" aria-hidden="true" />
                                                        <span className="structure-inline-alert-text">{err}</span>
                                                    </span>
                                                ))}
                                            </div>
                                        )}

                                        <div className="structure-field-panel structure-field-panel-flush">
                                            <TiebreakerList
                                                items={tiebreakerListItems}
                                                onChange={(newItems) => setTiebreakers(newItems.filter(t => (t.priority ?? 0) > 0))}
                                                phaseType={phaseType}
                                            />
                                        </div>

                                        {/* Columns are a related but separate decision; collapsed by default
                                            so the page leads with tiebreakers. */}
                                        <details className="structure-disclosure structure-disclosure-columns">
                                            <summary className="structure-disclosure-summary">
                                                <span className="structure-disclosure-icon" aria-hidden="true">
                                                    <Eye size={14} />
                                                </span>
                                                <span className="structure-disclosure-title-group">
                                                    <span className="structure-disclosure-title">Columnas visibles en la tabla pública</span>
                                                    <span className="structure-disclosure-subtitle">Sólo cambia qué se muestra. No afecta cómo se rompen los empates.</span>
                                                </span>
                                                <span className="structure-disclosure-meta">
                                                    {visibleColumnsCount}/{totalColumnsCount}
                                                </span>
                                                <span className="structure-disclosure-chevron" aria-hidden="true">
                                                    <ChevronRight size={16} />
                                                </span>
                                            </summary>
                                            <div className="structure-disclosure-body">
                                                <TableColumnSelector categories={columnCategories} selectedColumns={tableCols} onChange={handleTableColsChange} hideHeader />
                                            </div>
                                        </details>
                                    </div>
                                    );
                                })()}

                                {/* STEP 4: Etiquetas */}
                                {currentStep === 4 && (
                                    <div className="phase-wizard-step-panel structure-step-panel structure-step-panel-labels flex flex-col gap-5">
                                        {/* Mobile-only progress indicator (desktop already shows it in the sidebar) */}
                                        <div className="structure-mobile-progress" aria-hidden="true">
                                            <div className="structure-mobile-progress-bar">
                                                <span style={{ width: `${progressPercent}%` }} />
                                            </div>
                                            <p className="structure-mobile-progress-label">
                                                Paso {currentStepIndex + 1} de {visibleSteps.length}
                                            </p>
                                        </div>

                                        <div className="structure-step-head">
                                            <h3 className=" mb-1">Etiquetas de Clasificación</h3>
                                            <p className="text-dim text-sm">Zonas coloreadas para resaltar posiciones en la tabla (ej: &quot;Clasifica&quot;, &quot;Descenso&quot;).</p>
                                        </div>

                                        {/* Single global color-mode toggle */}
                                        <div className="structure-label-global-mode" role="group" aria-label="Modo de color de etiquetas">
                                            <span className="structure-label-global-mode-title">Modo de color</span>
                                            <div className="structure-label-global-mode-toggle">
                                                {(['auto', 'manual'] as const).map(mode => (
                                                    <button
                                                        key={mode}
                                                        type="button"
                                                        onClick={() => setGlobalColorMode(mode)}
                                                        className={`structure-label-global-mode-btn${labelColorMode === mode ? ' is-active' : ''}`}
                                                        aria-pressed={labelColorMode === mode}
                                                    >
                                                        {mode === 'auto' ? 'Automático' : 'Manual'}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>

                                        {groupLabels.length > 0 && (
                                            <div className="structure-field-panel structure-labels-list-panel">
                                                <label className="structure-field-label block text-xs font-bold text-dim uppercase tracking-widest mb-3">
                                                    Etiquetas creadas
                                                </label>
                                                <div className="structure-label-list">
                                                    {groupLabels.map((label, index) => {
                                                        const labelId = getLabelKey(label);
                                                        const isExpanded = expandedLabelId === labelId;
                                                        const isEditing = editingLabelId === labelId;
                                                        return (
                                                            <div
                                                                key={labelId}
                                                                className={`structure-label-row structure-label-row-compact${isExpanded ? ' is-expanded' : ''}${isEditing ? ' structure-label-row-active' : ''}`}
                                                            >
                                                                <button
                                                                    type="button"
                                                                    className="structure-label-row-toggle"
                                                                    onClick={() => setExpandedLabelId(prev => prev === labelId ? null : labelId)}
                                                                    aria-expanded={isExpanded}
                                                                    aria-label={`${isExpanded ? 'Colapsar' : 'Expandir'} ${label.name}`}
                                                                >
                                                                    <span
                                                                        className="structure-label-swatch-dot"
                                                                        style={{ backgroundColor: label.color }}
                                                                        aria-hidden="true"
                                                                    />
                                                                    <span className="structure-label-row-name">{label.name}</span>
                                                                    <span className="structure-label-row-menu" aria-hidden="true">
                                                                        <MoreVertical size={16} />
                                                                    </span>
                                                                </button>

                                                                {isExpanded && (
                                                                    <div className="structure-label-row-expanded">
                                                                        {labelColorMode === 'manual' && (
                                                                            <div className="structure-label-palette">
                                                                                <input
                                                                                    type="color"
                                                                                    value={label.color}
                                                                                    onChange={e => updateLabelColor(label.name, e.target.value)}
                                                                                    className="structure-label-color-input"
                                                                                    aria-label={`Color para ${label.name}`}
                                                                                />
                                                                                <div className="structure-label-presets">
                                                                                    {PRESET_COLORS.map(color => (
                                                                                        <button
                                                                                            key={color}
                                                                                            type="button"
                                                                                            onClick={() => updateLabelColor(label.name, color)}
                                                                                            className={`structure-label-swatch${label.color === color ? ' is-active' : ''}`}
                                                                                            style={{ backgroundColor: color }}
                                                                                            aria-label={`Usar color ${color}`}
                                                                                        />
                                                                                    ))}
                                                                                </div>
                                                                            </div>
                                                                        )}
                                                                        <div className="structure-label-row-actions">
                                                                            <button type="button" className="structure-label-action-btn" onClick={() => startLabelEdit(label)}>
                                                                                Editar
                                                                            </button>
                                                                            <button type="button" className="structure-label-action-btn structure-label-action-btn-danger" onClick={() => removeLabel(labelId)}>
                                                                                <Trash2 size={13} />
                                                                                Eliminar
                                                                            </button>
                                                                        </div>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        )}

                                        <div className="structure-field-panel structure-labels-form-panel">
                                            <label className="structure-field-label block text-xs font-bold text-dim uppercase tracking-widest mb-3">
                                                {editingLabelId ? 'Editar etiqueta' : 'Nueva etiqueta'}
                                            </label>

                                            {groupLabels.length === 0 && !editingLabelId && (
                                                <>
                                                    <p className="structure-label-empty-hint">
                                                        Aún no creaste zonas. Empezá con un ejemplo o escribí el tuyo abajo.
                                                    </p>
                                                    <div className="structure-label-examples" role="group" aria-label="Ejemplos de etiquetas">
                                                        {['Clasifica a 8vos', 'Repechaje', 'Descenso', 'Permanencia'].map(example => (
                                                            <button
                                                                key={example}
                                                                type="button"
                                                                className="structure-label-example-chip"
                                                                onClick={() => { setNewLabel(example); if (labelError) setLabelError(null); }}
                                                            >
                                                                {example}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </>
                                            )}

                                            <div className="structure-label-form">
                                                <input
                                                    type="text"
                                                    className="basalt-input structure-label-name-input"
                                                    value={newLabel}
                                                    onChange={e => {
                                                        setNewLabel(e.target.value);
                                                        if (labelError) setLabelError(null);
                                                    }}
                                                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addLabel(); } }}
                                                    placeholder="Ej: Clasifica a 8vos, Descenso..."
                                                />

                                                {labelColorMode === 'manual' ? (
                                                    <div className="structure-label-palette structure-label-palette-form">
                                                        <input
                                                            type="color"
                                                            value={labelColor}
                                                            onChange={e => setLabelColor(e.target.value)}
                                                            className="structure-label-color-input"
                                                            aria-label="Seleccionar color de la etiqueta"
                                                        />
                                                        <div className="structure-label-presets">
                                                            {PRESET_COLORS.map(color => (
                                                                <button
                                                                    key={color}
                                                                    type="button"
                                                                    onClick={() => setLabelColor(color)}
                                                                    className={`structure-label-swatch${labelColor === color ? ' is-active' : ''}`}
                                                                    style={{ backgroundColor: color }}
                                                                    aria-label={`Usar color ${color}`}
                                                                />
                                                            ))}
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <p className="structure-label-helper">
                                                        El color se asigna automáticamente en el orden en que agregás las zonas.
                                                    </p>
                                                )}

                                                {newLabel.trim() && (
                                                    <div className="structure-label-preview">
                                                        <span className="structure-label-preview-label">Vista previa</span>
                                                        <LabelChip
                                                            name={newLabel.trim()}
                                                            color={labelColorMode === 'manual'
                                                                ? labelColor
                                                                : getAutoLabelColor(Math.max(
                                                                    editingLabelId
                                                                        ? groupLabels.findIndex(label => getLabelKey(label) === editingLabelId)
                                                                        : groupLabels.length,
                                                                    0,
                                                                ))}
                                                        />
                                                    </div>
                                                )}

                                                {labelError && (
                                                    <div className="structure-inline-alert structure-inline-alert-danger">
                                                        <AlertCircle size={13} />
                                                        <span>{labelError}</span>
                                                    </div>
                                                )}

                                                <div className="structure-label-form-actions">
                                                    {editingLabelId && (
                                                        <button type="button" className="basalt-btn basalt-btn-ghost structure-label-form-cancel" onClick={resetLabelForm}>
                                                            Descartar
                                                        </button>
                                                    )}
                                                    <button type="button" className="basalt-btn structure-label-submit-cta" onClick={addLabel}>
                                                        <Plus size={15} />
                                                        {editingLabelId ? 'Guardar cambios' : 'Crear etiqueta'}
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* STEP 5: Stats */}
                                {currentStep === 5 && (
                                    <div className="phase-wizard-step-panel structure-step-panel structure-step-panel-stats flex flex-col gap-6">
                                        <div className="structure-step-head">
                                            <h3 className=" mb-1">Estadísticas</h3>
                                            <p className="text-dim text-sm">
                                                Qué trae esta fase de la anterior cuando se arma su tabla
                                            </p>
                                        </div>

                                        {/* Acá había una segunda casilla, "Asignar estadísticas solo a
                                            titulares", con un cartel propio que decía "Sin efecto
                                            todavía". Era cierto: `statsAssignment` se guardaba en los
                                            settings de la fase y se releía para repoblar el formulario,
                                            pero `assignOnlyToStarters` no aparecía en ningún consumidor
                                            —sólo en este formulario y en el tipo—. La atribución por
                                            jugador se resuelve al cargar el partido, no acá.
                                            Declararla era mejor que mentir; sacarla es mejor que
                                            declararla. El estado sigue leyéndose y escribiéndose para
                                            no cambiarle el valor guardado a las fases que ya lo tienen:
                                            se fue el control, no el dato. */}
                                        <label className="structure-field-panel structure-stats-card cursor-pointer">
                                            <input
                                                type="checkbox"
                                                className="w-4 h-4 mt-0.5 accent-[var(--accent-primary)]"
                                                checked={carryOverPreviousPhase}
                                                onChange={e => setCarryOverPreviousPhase(e.target.checked)}
                                            />
                                            <div>
                                                <span className="text-sm font-semibold text-[var(--text-main)]">Arrastrar estadísticas de la fase previa</span>
                                                <p className="text-xs text-dim mt-1">
                                                    {previousPhaseForForm
                                                        ? `La tabla de esta fase empieza con los totales acumulados en ${previousPhaseForForm.name}.`
                                                        : 'La tabla de esta fase empieza con los totales acumulados en la fase anterior.'}
                                                </p>
                                            </div>
                                        </label>
                                    </div>
                                )}

                                {/* STEP 6: Circuito */}
                                {currentStep === 6 && (
                                    <div className="phase-wizard-step-panel structure-step-panel flex flex-col gap-6">
                                        <div className="structure-step-head">
                                            <h3 className=" mb-1">Puntos de circuito</h3>
                                            <p className="text-dim text-sm">Asigna cuántos puntos acumula cada posición al terminar esta etapa</p>
                                        </div>

                                        <div className="structure-circuit-presets" role="group" aria-label="Presets de puntuación">
                                            <span className="structure-circuit-presets-label">Cargar preset</span>
                                            {([
                                                { id: 'f1', label: 'F1', points: [25, 18, 15, 12, 10, 8, 6, 4, 2, 1] },
                                                { id: 'motogp', label: 'MotoGP', points: [25, 20, 16, 13, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1] },
                                                { id: 'atp', label: 'ATP', points: [2000, 1200, 720, 360, 180, 90, 45] },
                                                { id: 'rugby', label: 'Rugby (4-2-0)', points: [4, 2, 0] },
                                            ] as const).map(preset => (
                                                <button
                                                    key={preset.id}
                                                    type="button"
                                                    className="structure-circuit-preset-btn"
                                                    onClick={() => setPlacementPoints(preset.points.map((points, i) => ({ position: i + 1, points })))}
                                                >
                                                    {preset.label}
                                                </button>
                                            ))}
                                        </div>

                                        <div className="structure-field-panel">
                                            <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--border-basalt)]">
                                                <span className="text-xs font-bold text-dim uppercase tracking-widest">Tabla de puntos por posición</span>
                                                <button
                                                    type="button"
                                                    className="basalt-btn text-xs py-1 px-3"
                                                    onClick={() => setPlacementPoints(DEFAULT_PLACEMENT_POINTS)}
                                                >
                                                    Restablecer
                                                </button>
                                            </div>
                                            <div className="flex flex-col divide-y divide-[var(--border-basalt)]">
                                                {placementPoints.map((row, i) => (
                                                    <div key={i} className="flex items-center gap-4 px-5 py-2.5">
                                                        <span className="w-8 text-center text-sm font-bold text-dim">{row.position}°</span>
                                                        <input
                                                            type="number"
                                                            min={0}
                                                            className="basalt-input flex-1 text-center py-1.5"
                                                            value={row.points}
                                                            onChange={e => setPlacementPoints(prev =>
                                                                prev.map((r, idx) => idx === i ? { ...r, points: Number(e.target.value) } : r)
                                                            )}
                                                        />
                                                        <span className="text-xs text-dim w-8">pts</span>
                                                        <button
                                                            type="button"
                                                            className="p-1.5 rounded-lg text-dim hover:text-red-400 hover:bg-red-500/10 transition-all"
                                                            onClick={() => setPlacementPoints(prev => prev.filter((_, idx) => idx !== i).map((r, idx) => ({ ...r, position: idx + 1 })))}
                                                            title="Eliminar posición"
                                                        >
                                                            <Trash2 size={13} />
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                            <div className="px-5 py-3 border-t border-[var(--border-basalt)]">
                                                <button
                                                    type="button"
                                                    className="basalt-btn w-full"
                                                    onClick={() => setPlacementPoints(prev => [...prev, { position: prev.length + 1, points: 0 }])}
                                                >
                                                    <Plus size={14} />
                                                    Agregar posición
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* Footer actions */}
                                <div className="phase-wizard-footer structure-wizard-footer mt-auto pt-8 border-t border-[var(--border-basalt)] flex items-center gap-3 flex-wrap">
                                    <button type="button" className="basalt-btn" onClick={resetForm}>
                                        Cancelar
                                    </button>
                                    <div className="structure-wizard-footer-actions flex items-center gap-3 ml-auto">
                                        {currentStep > 1 && (
                                            <button type="button" className="basalt-btn" onClick={goPrev}>
                                                ← Atrás
                                            </button>
                                        )}
                                        {currentStep < lastVisibleStep && (
                                            <button type="button" className="basalt-btn basalt-btn-primary" onClick={goNext}>
                                                Siguiente →
                                            </button>
                                        )}
                                        {/* El submit se apaga cuando hay un error que bloquea, pero
                                            el motivo vivía sólo en la barra lateral, al otro lado
                                            de la pantalla. Un botón apagado dice qué le falta. */}
                                        {currentStep === lastVisibleStep && !canSubmitPhase && !creating && (
                                            <span className="structure-save-hint">
                                                {phaseFormErrors[0] ?? tiebreakerError ?? 'Faltan datos de la fase.'}
                                            </span>
                                        )}
                                        {currentStep === lastVisibleStep && (
                                            <button
                                                type="submit"
                                                className="basalt-btn basalt-btn-primary"
                                                disabled={creating || !canSubmitPhase}
                                            >
                                                {creating ? 'Guardando...' : editingPhaseId ? 'Guardar cambios' : 'Crear fase'}
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </form>
                </div>
            )}
        </div>
    );
}
