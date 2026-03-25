'use client';

import { useState, useEffect, useMemo } from 'react';
import { AlertCircle, CheckCircle, ChevronRight, Layers, Plus, Trash2 } from 'lucide-react';
import './basalt.css';
import './phase-wizard.css';
import './tournament-structure.css';

import { TiebreakerList, TiebreakerItem } from './TiebreakerList';
import { TableColumnSelector, ColumnCategory } from './TableColumnSelector';
import { LabelChip } from './standings/LabelChip';
import { PhaseSettings, GroupLabel } from '@/types/phase-settings';

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
    knockout: 'Eliminación Directa',
    playoff: 'Playoffs',
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

export function TournamentStructureTab({ data, id }: { data?: any; id?: string }) {
    const [phases, setPhases] = useState<Phase[]>([]);
    const [loading, setLoading] = useState(true);

    // Form state
    const [showPhaseForm, setShowPhaseForm] = useState(false);
    const [phaseName, setPhaseName] = useState('');
    const [phaseType, setPhaseType] = useState<'league' | 'knockout' | 'group_stage' | 'playoff'>('league');
    const [teamsCount, setTeamsCount] = useState<number | ''>('');
    const [advanceCount, setAdvanceCount] = useState<number | ''>('');
    const [legs, setLegs] = useState<1 | 2>(1);

    const isRugby = data?.sport?.toLowerCase() === 'rugby';

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
    const [currentStep, setCurrentStep] = useState(1);
    const [editingPhaseId, setEditingPhaseId] = useState<string | null>(null);
    const [creating, setCreating] = useState(false);

    // Group names (actual DB groups for group_stage)
    const [groupNames, setGroupNames] = useState<string[]>([]);

    // Classification zone labels
    const [groupLabels, setGroupLabels] = useState<GroupLabel[]>([]);
    const [newLabel, setNewLabel] = useState('');
    const [labelColor, setLabelColor] = useState(PRESET_COLORS[0]);
    const [labelColorMode, setLabelColorMode] = useState<'auto' | 'manual'>('auto');
    const [editingLabelId, setEditingLabelId] = useState<string | null>(null);
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

    // --- Label helpers ---
    const resetLabelForm = () => {
        setNewLabel('');
        setLabelColor(PRESET_COLORS[0]);
        setLabelColorMode('auto');
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

        resetLabelForm();
    };

    const startLabelEdit = (label: GroupLabel) => {
        setEditingLabelId(getLabelKey(label));
        setNewLabel(label.name);
        setLabelColor(label.color);
        setLabelColorMode(label.colorMode);
        setLabelError(null);
    };

    const removeLabel = (labelId: string) => {
        if (editingLabelId === labelId) {
            resetLabelForm();
        }
        setGroupLabels(prev => prev.filter(label => getLabelKey(label) !== labelId));
    };

    const updateLabelMode = (name: string, mode: 'auto' | 'manual') => {
        setGroupLabels(prev => prev.map(l => {
            if (l.name !== name) return l;
            return { ...l, colorMode: mode, color: mode === 'auto' ? getAutoLabelColor(l.autoColorIndex || 0) : l.color };
        }));
    };

    const updateLabelColor = (name: string, color: string) => {
        setGroupLabels(prev => prev.map(l => l.name === name ? { ...l, color } : l));
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
        const enabled = tiebreakers.filter(tb => tb.enabled);
        if (enabled.length === 0) errors.push('Debe haber al menos un criterio de desempate activo');
        if (useExtraTimePoints && !tableCols.extraWon && !tableCols.extraDrawn)
            errors.push('Prórroga activada pero sin columnas de prórroga visibles');
        if (enabled.some(tb => tb.metric === 'points') && enabled.some(tb => tb.metric === 'won'))
            errors.push('Advertencia: "Puntos" y "Victorias" pueden ser redundantes');
        return errors;
    }, [tiebreakers, useExtraTimePoints, tableCols]);

    const phaseFormErrors = useMemo(() => {
        const errors: string[] = [];
        const normalizedName = phaseName.trim();
        const normalizedTeams = teamsCount === '' ? null : Number(teamsCount);
        const normalizedAdvance = advanceCount === '' ? null : Number(advanceCount);
        const activeGroupNames = groupNames.filter(name => name.trim());

        if (!normalizedName) errors.push('Debes ingresar un nombre de fase.');
        if (normalizedTeams !== null && normalizedTeams < 2) errors.push('La fase debe tener al menos 2 equipos.');
        if (normalizedAdvance !== null && normalizedAdvance < 1) errors.push('Debe avanzar al menos 1 equipo.');
        if (normalizedTeams !== null && normalizedAdvance !== null && normalizedAdvance > normalizedTeams) {
            errors.push('Los equipos que avanzan no pueden superar la cantidad total.');
        }
        if (phaseType === 'group_stage' && activeGroupNames.length === 0) {
            errors.push('La fase de grupos necesita al menos un grupo.');
        }

        return errors;
    }, [advanceCount, groupNames, phaseName, phaseType, teamsCount]);

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

    const resetForm = () => {
        setCurrentStep(1);
        setPhaseName('');
        setPhaseType('league');
        setTeamsCount('');
        setAdvanceCount('');
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
        resetLabelForm();
        setShowPhaseForm(false);
        setEditingPhaseId(null);
    };

    const loadPhaseIntoForm = (phase: Phase) => {
        setEditingPhaseId(phase.id);
        setPhaseName(phase.name);
        setPhaseType(phase.phase_type as any);

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
                            ?? (t.metric === 'headToHead' ? { label: 'Enfrentamiento Directo' } : { label: t.metric });
                        return { ...config, metric: t.metric, order: t.order || 'desc' as const, enabled: t.enabled ?? true, priority: t.priority!, requiresRoundRobin: t.metric === 'headToHead' || undefined };
                    });
                setTiebreakers(active as TiebreakerItem[]);
            }

            setGroupLabels(normalizeGroupLabels(s.groupLabels || []));
            setGroupNames((s as any).group_names || []);
            setStatsAssignment(s.statsAssignment || (s.playerStats?.assignOnlyToStarters ? 'starters' : 'played'));
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

    const handleCreatePhase = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!id) return;
        if (phaseFormErrors.length > 0) {
            alert(phaseFormErrors[0]);
            return;
        }
        if (validationErrors.some(err => err.includes('Debe haber'))) {
            alert('Por favor corrija los errores de validación antes de guardar');
            return;
        }

        setCreating(true);
        const url = editingPhaseId
            ? `/api/tournaments/${id}/phases/${editingPhaseId}`
            : `/api/tournaments/${id}/phases`;
        const method = editingPhaseId ? 'PATCH' : 'POST';
        const sanitizedGroupNames = phaseType === 'group_stage'
            ? groupNames.map(name => name.trim()).filter(Boolean)
            : [];

        try {
            const response = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: phaseName,
                    phase_type: phaseType,
                    order_index: editingPhaseId ? undefined : phases.length + 1,
                    is_active: true,
                    settings: {
                        teamsCount: teamsCount === '' ? 0 : Number(teamsCount),
                        advanceCount: advanceCount === '' ? 0 : Number(advanceCount),
                        legs,
                        tableColumns: tableCols,
                        groupLabels,
                        statsAssignment,
                        group_names: sanitizedGroupNames,
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
                alert(`Error al guardar fase: ${errorMessage.length > 200 ? errorMessage.slice(0, 197) + '...' : errorMessage}`);
            }
        } catch (error: any) {
            console.error('Error creating phase:', error);
            alert(`Error al crear fase: ${error.message || 'Unknown error'}`);
        } finally {
            setCreating(false);
        }
    };

    const handleDeletePhase = async (phaseId: string) => {
        if (!confirm('¿Seguro quieres eliminar esta fase y todas sus dependencias?')) return;
        try {
            const response = await fetch(`/api/tournaments/${id}/phases/${phaseId}`, { method: 'DELETE' });
            if (response.ok) {
                await loadPhases();
            } else {
                alert('Error al eliminar fase');
            }
        } catch (error) {
            console.error('Error deleting phase:', error);
            alert('Error al eliminar fase');
        }
    };

    // Step navigation accounting for skipped steps
    const goNext = () => {
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
        { step: 5, title: 'Estadísticas', desc: 'Atribución a jugadores', show: true },
    ];

    // ─── RENDER ───────────────────────────────────────────────────────────────

    const visibleSteps = STEPS.filter(step => step.show);
    const currentStepIndex = Math.max(visibleSteps.findIndex(step => step.step === currentStep), 0);
    const lastVisibleStep = visibleSteps[visibleSteps.length - 1]?.step ?? 5;
    const currentPhaseOrdinal = editingPhaseId ? phases.findIndex(phase => phase.id === editingPhaseId) + 1 : phases.length + 1;
    const canSubmitPhase = phaseFormErrors.length === 0 && !validationErrors.some(error => error.includes('Debe haber'));
    const progressPercent = visibleSteps.length > 0
        ? ((currentStepIndex + 1) / visibleSteps.length) * 100
        : 0;

    const structureMetrics = useMemo(() => {
        const activePhase = phases.find(phase => phase.is_active) || phases[0] || null;
        const groupPhaseCount = phases.filter(phase => phase.phase_type === 'group_stage').length;
        const knockoutPhaseCount = phases.filter(phase => phase.phase_type === 'knockout' || phase.phase_type === 'playoff').length;
        const configuredGroups = phases.reduce((count, phase) => {
            const groupCount = Array.isArray((phase.settings as any)?.group_names)
                ? (phase.settings as any).group_names.length
                : 0;
            return count + groupCount;
        }, 0);

        return {
            activePhase,
            groupPhaseCount,
            knockoutPhaseCount,
            configuredGroups,
        };
    }, [phases]);

    useEffect(() => {
        if (visibleSteps.length === 0) return;
        if (!visibleSteps.some(step => step.step === currentStep)) {
            setCurrentStep(visibleSteps[0].step);
        }
    }, [currentStep, visibleSteps]);

    if (loading) {
        return (
            <div className="basalt-card flex items-center justify-center min-h-[300px]">
                <p className="text-dim text-sm">Cargando estructura del torneo...</p>
            </div>
        );
    }

    return (
        <div className="tournament-structure-shell flex flex-col gap-8 animate-in fade-in duration-500 pb-24">
            {!showPhaseForm && (
                <section className="basalt-card basalt-hero structure-hero-panel">
                    <div className="structure-hero-copy">
                        <p className="basalt-section-kicker">Competitive workspace</p>
                        <h2 className="structure-hero-title">Estructura y creacion de fases</h2>
                        <p className="structure-hero-text">
                            Ordena el recorrido competitivo del torneo y prepara la base visual para fixture,
                            clasificacion y configuracion avanzada.
                        </p>
                        <div className="structure-hero-meta">
                            <span>{phases.length > 0 ? 'Sistema estructural activo' : 'Pendiente de configuracion'}</span>
                            <span>{structureMetrics.activePhase?.name || 'Sin fase principal definida'}</span>
                        </div>
                    </div>

                    <div className="structure-summary-grid">
                        <article className="structure-summary-card">
                            <span className="structure-summary-label">Fases</span>
                            <strong className="structure-summary-value">{phases.length}</strong>
                            <small className="structure-summary-foot">Bloques competitivos configurados</small>
                        </article>
                        <article className="structure-summary-card">
                            <span className="structure-summary-label">Fase activa</span>
                            <strong className="structure-summary-value structure-summary-value--text">
                                {structureMetrics.activePhase?.name || 'Sin definir'}
                            </strong>
                            <small className="structure-summary-foot">
                                {structureMetrics.activePhase
                                    ? PHASE_TYPE_LABELS[structureMetrics.activePhase.phase_type] || structureMetrics.activePhase.phase_type
                                    : 'Todavia no hay etapa principal'}
                            </small>
                        </article>
                        <article className="structure-summary-card">
                            <span className="structure-summary-label">Grupos</span>
                            <strong className="structure-summary-value">{structureMetrics.configuredGroups}</strong>
                            <small className="structure-summary-foot">
                                {structureMetrics.groupPhaseCount} fase{structureMetrics.groupPhaseCount === 1 ? '' : 's'} con grupos
                            </small>
                        </article>
                        <article className="structure-summary-card">
                            <span className="structure-summary-label">Eliminacion</span>
                            <strong className="structure-summary-value">{structureMetrics.knockoutPhaseCount}</strong>
                            <small className="structure-summary-foot">Llaves y playoffs configurados</small>
                        </article>
                    </div>
                </section>
            )}

            {/* ── Phase list ── */}
            {phases.length > 0 && !showPhaseForm && (
                <div className="basalt-card structure-module p-6">
                    <div className="structure-module-header flex items-center justify-between gap-4 mb-6">
                        <div>
                            <p className="basalt-section-kicker mb-1">Competitive map</p>
                            <h2 className="basalt-h1 structure-module-title">Fases del torneo</h2>
                            <p className="structure-module-copy">
                                Cada modulo concentra una etapa del torneo con su formato y reglas base.
                            </p>
                        </div>
                        <span className="basalt-badge badge-ok">
                            {phases.length} FASE{phases.length !== 1 ? 'S' : ''}
                        </span>
                    </div>

                    <div className="structure-phase-list flex flex-col gap-4">
                        {phases.map((phase, index) => (
                            <div
                                key={phase.id}
                                onClick={() => loadPhaseIntoForm(phase)}
                                className="structure-phase-card group relative flex items-start sm:items-center justify-between gap-4 p-5 rounded-xl border border-[var(--border-basalt)] bg-[var(--surface-basalt)] hover:border-[var(--accent-primary)] hover:bg-[var(--surface-elevated)] transition-all duration-200 cursor-pointer"
                            >
                                <div className="structure-phase-main flex items-start sm:items-center gap-4 min-w-0">
                                    <div className="structure-phase-icon flex-shrink-0 w-10 h-10 rounded-lg bg-[var(--surface-elevated)] border border-[var(--border-basalt)] flex items-center justify-center">
                                        <Layers size={18} className="text-dim" />
                                    </div>
                                    <div className="structure-phase-copy min-w-0">
                                        <div className="structure-phase-badges flex items-center gap-2 flex-wrap mb-1">
                                            <span className="structure-phase-step text-[10px] font-bold text-dim uppercase tracking-widest">
                                                Fase {index + 1}
                                            </span>
                                            <span className={`basalt-badge ${PHASE_TYPE_BADGE[phase.phase_type] || 'badge-draft'}`}>
                                                {PHASE_TYPE_LABELS[phase.phase_type] || phase.phase_type}
                                            </span>
                                            {phase.is_active && (
                                                <span className="basalt-badge badge-ok">Activa</span>
                                            )}
                                        </div>
                                        <h3 className="structure-phase-title text-lg font-extrabold tracking-tight text-white">{phase.name}</h3>
                                        <div className="structure-phase-meta flex flex-wrap gap-3 mt-2 text-xs text-dim">
                                            {phase.settings?.teamsCount && phase.settings.teamsCount > 0 && (
                                                <span>{phase.settings.teamsCount} equipos</span>
                                            )}
                                            {phase.settings?.legs && (
                                                <span>{phase.settings.legs === 2 ? 'Ida y vuelta' : 'Partido único'}</span>
                                            )}
                                            {phase.settings?.advanceCount && phase.settings.advanceCount > 0 && (
                                                <span className="structure-phase-meta-accent text-[var(--status-active)] font-semibold">
                                                    {phase.settings.advanceCount} avanzan
                                                </span>
                                            )}
                                            {(phase.settings as any)?.group_names?.length > 0 && (
                                                <span className="structure-phase-meta-info text-[var(--status-published)] font-semibold">
                                                    {(phase.settings as any).group_names.length} grupos
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                <div className="structure-phase-actions flex items-center gap-2 flex-shrink-0">
                                    <ChevronRight size={16} className="structure-phase-chevron text-dim group-hover:text-white transition-colors" />
                                    <button
                                        onClick={e => { e.stopPropagation(); handleDeletePhase(phase.id); }}
                                        className="structure-phase-delete opacity-0 group-hover:opacity-100 p-2 rounded-lg hover:bg-red-500/10 text-dim hover:text-red-400 transition-all duration-200"
                                        title="Eliminar fase"
                                    >
                                        <Trash2 size={15} />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="structure-module-footer mt-6 pt-6 border-t border-[var(--border-basalt)] flex justify-center">
                        <button
                            className="basalt-btn basalt-btn-primary"
                            onClick={() => { resetForm(); setShowPhaseForm(true); }}
                        >
                            <Plus size={16} />
                            Agregar nueva fase
                        </button>
                    </div>
                </div>
            )}

            {/* ── Empty state ── */}
            {phases.length === 0 && !showPhaseForm && (
                <div className="basalt-card basalt-hero structure-empty-panel flex flex-col items-center justify-center text-center py-20 px-8 gap-6">
                    <div className="structure-empty-icon w-16 h-16 rounded-xl bg-[var(--surface-elevated)] border border-[var(--border-basalt)] flex items-center justify-center">
                        <Layers size={28} className="text-dim" />
                    </div>
                    <div className="structure-empty-copy">
                        <p className="basalt-section-kicker mb-3">Phase builder</p>
                        <h3 className="basalt-h1 structure-empty-title mb-3">Sin fases configuradas</h3>
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
                                    <p className="phase-wizard-kicker text-[10px] font-bold text-dim uppercase tracking-widest mb-1">
                                        {editingPhaseId ? 'Editando' : 'Nueva'}
                                    </p>
                                    <h2 className="phase-wizard-sidebar-title text-xl font-extrabold tracking-tight">
                                        {phaseName || `Fase ${currentPhaseOrdinal}`}
                                    </h2>
                                    <p className="structure-wizard-sidebar-copy">
                                        Consola modular para definir formato, reglas y criterios de esta etapa.
                                    </p>
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

                                {(phaseFormErrors.length > 0 || validationErrors.filter(e => e.includes('Debe haber')).length > 0) && (
                                    <div className="structure-inline-alert structure-inline-alert-error flex items-start gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-xs">
                                        <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
                                        <span>{phaseFormErrors[0] || validationErrors.find(e => e.includes('Debe haber'))}</span>
                                    </div>
                                )}

                                <nav className="phase-wizard-stepper structure-wizard-stepper flex flex-col gap-1">
                                    {visibleSteps.map(s => (
                                        <button
                                            key={s.step}
                                            type="button"
                                            onClick={() => setCurrentStep(s.step)}
                                            className={`phase-wizard-step structure-wizard-step flex items-start gap-3 px-3 py-2.5 rounded-lg text-left transition-all duration-150 ${currentStep === s.step
                                                ? 'bg-[var(--accent-primary)]/10 border border-[var(--accent-primary)]/30'
                                                : 'hover:bg-[var(--surface-elevated)]'
                                                }`}
                                        >
                                            <span className={`phase-wizard-step-index structure-wizard-step-index w-5 h-5 flex-shrink-0 rounded-full flex items-center justify-center text-[10px] font-bold mt-0.5 ${currentStep > s.step
                                                ? 'bg-[var(--status-active)] text-white'
                                                : currentStep === s.step
                                                    ? 'bg-[var(--accent-primary)] text-white'
                                                    : 'bg-[var(--surface-elevated)] border border-[var(--border-basalt)] text-dim'
                                                }`}>
                                                {currentStep > s.step ? <CheckCircle size={12} /> : s.step}
                                            </span>
                                            <span className="phase-wizard-step-copy flex flex-col min-w-0">
                                                <span className={`phase-wizard-step-title text-sm font-semibold ${currentStep === s.step ? 'text-white' : 'text-dim'}`}>
                                                    {s.title}
                                                </span>
                                                <span className="phase-wizard-step-desc text-[11px] text-dim">{s.desc}</span>
                                            </span>
                                        </button>
                                    ))}
                                </nav>

                                <div className="structure-sidebar-facts">
                                    <div className="structure-sidebar-fact">
                                        <span>Tipo</span>
                                        <strong>{PHASE_TYPE_LABELS[phaseType] || phaseType}</strong>
                                    </div>
                                    <div className="structure-sidebar-fact">
                                        <span>Equipos</span>
                                        <strong>{teamsCount === '' ? '--' : teamsCount}</strong>
                                    </div>
                                    <div className="structure-sidebar-fact">
                                        <span>Avanzan</span>
                                        <strong>{advanceCount === '' ? '--' : advanceCount}</strong>
                                    </div>
                                </div>
                            </aside>

                            {/* Content */}
                            <div className="phase-wizard-content structure-wizard-content flex-1 flex flex-col p-6 lg:p-8 gap-0 min-w-0">

                                {/* STEP 1: Básico */}
                                {currentStep === 1 && (
                                    <div className="phase-wizard-step-panel structure-step-panel structure-step-panel-basic flex flex-col gap-6">
                                        <div className="phase-wizard-step-head structure-step-head">
                                            <p className="phase-wizard-kicker text-[10px] font-bold text-dim uppercase tracking-widest mb-1">Paso 1</p>
                                            <h3 className="phase-wizard-step-heading text-2xl font-extrabold tracking-tight mb-1">Configuración Básica</h3>
                                            <p className="phase-wizard-step-subtitle text-dim text-sm">Define la estructura general de la fase</p>
                                        </div>

                                        <div className="phase-wizard-fields flex flex-col gap-5">
                                            {/* Name */}
                                            <div className="structure-field-panel structure-field-panel-wide">
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
                                                />
                                            </div>

                                            {/* Phase type */}
                                            <div className="structure-field-panel structure-field-panel-wide">
                                                <label className="structure-field-label block text-xs font-bold text-dim uppercase tracking-widest mb-3">
                                                    Tipo de fase
                                                </label>
                                                <div className="structure-option-grid grid grid-cols-2 gap-3">
                                                    {(['league', 'group_stage', 'knockout', 'playoff'] as const).map(type => (
                                                        <button
                                                            key={type}
                                                            type="button"
                                                            onClick={() => {
                                                                setPhaseType(type);
                                                                if (type === 'group_stage' && groupNames.length === 0) {
                                                                    setGroupNames(['Grupo A', 'Grupo B']);
                                                                }
                                                            }}
                                                            className={`structure-option-card flex flex-col items-start px-4 py-3 rounded-xl border transition-all duration-150 text-left ${phaseType === type
                                                                ? 'border-[var(--accent-primary)] bg-[var(--accent-primary)]/10 text-white'
                                                                : 'border-[var(--border-basalt)] bg-[var(--surface-basalt)] text-dim hover:border-[var(--text-dim)]'
                                                                }`}
                                                        >
                                                            <span className="text-sm font-bold">
                                                                {type === 'league' && 'Liga'}
                                                                {type === 'group_stage' && 'Grupos'}
                                                                {type === 'knockout' && 'Llaves'}
                                                                {type === 'playoff' && 'Playoff'}
                                                            </span>
                                                            <span className="text-[11px] mt-0.5 opacity-70">
                                                                {PHASE_TYPE_LABELS[type]}
                                                            </span>
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>

                                            {/* Groups definition — only for group_stage */}
                                            {phaseType === 'group_stage' && (
                                                <div className="structure-field-panel structure-field-panel-wide structure-field-panel-accent rounded-xl border border-[var(--accent-primary)]/30 bg-[var(--accent-primary)]/5 p-5">
                                                    <div className="flex items-center justify-between gap-3 mb-4">
                                                        <div>
                                                            <p className="text-xs font-bold text-dim uppercase tracking-widest mb-0.5">
                                                                Grupos de la fase
                                                            </p>
                                                            <p className="text-sm text-white font-semibold">
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
                                                        <button type="button" className="px-3 py-2 text-dim hover:text-white transition-colors" onClick={() => setTeamsCount(p => p === '' ? 2 : Math.max(2, Number(p) - 1))}>−</button>
                                                        <input type="number" className="flex-1 bg-transparent text-center text-white font-bold text-lg outline-none py-2 border-x border-[var(--border-basalt)]" value={teamsCount} onChange={e => setTeamsCount(e.target.value ? Number(e.target.value) : '')} placeholder="—" />
                                                        <button type="button" className="px-3 py-2 text-dim hover:text-white transition-colors" onClick={() => setTeamsCount(p => p === '' ? 3 : Number(p) + 1)}>+</button>
                                                    </div>
                                                </div>
                                                <div className="structure-field-panel">
                                                    <label className="structure-field-label block text-xs font-bold text-dim uppercase tracking-widest mb-2">
                                                        Equipos que avanzan
                                                    </label>
                                                    <div className="structure-counter-shell flex items-center border border-[var(--border-basalt)] rounded-lg bg-[var(--bg-basalt)] overflow-hidden">
                                                        <button type="button" className="px-3 py-2 text-dim hover:text-white transition-colors" onClick={() => setAdvanceCount(p => p === '' ? 1 : Math.max(1, Number(p) - 1))}>−</button>
                                                        <input type="number" className="flex-1 bg-transparent text-center text-white font-bold text-lg outline-none py-2 border-x border-[var(--border-basalt)]" value={advanceCount} onChange={e => setAdvanceCount(e.target.value ? Number(e.target.value) : '')} placeholder="—" />
                                                        <button type="button" className="px-3 py-2 text-dim hover:text-white transition-colors" onClick={() => setAdvanceCount(p => p === '' ? 2 : Number(p) + 1)}>+</button>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Match format */}
                                            <div className="structure-field-panel">
                                                <label className="structure-field-label block text-xs font-bold text-dim uppercase tracking-widest mb-3">
                                                    Formato de partido
                                                </label>
                                                <div className="structure-option-grid structure-option-grid-double flex gap-3">
                                                    {([{ value: 1, label: 'Partido único' }, { value: 2, label: 'Ida y vuelta' }] as const).map(opt => (
                                                        <button
                                                            key={opt.value}
                                                            type="button"
                                                            onClick={() => setLegs(opt.value)}
                                                            className={`structure-option-card flex-1 py-3 rounded-xl border text-sm font-semibold transition-all duration-150 ${legs === opt.value
                                                                ? 'border-[var(--accent-primary)] bg-[var(--accent-primary)]/10 text-white'
                                                                : 'border-[var(--border-basalt)] bg-[var(--surface-basalt)] text-dim hover:border-[var(--text-dim)]'
                                                                }`}
                                                        >
                                                            {opt.label}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* STEP 2: Puntos */}
                                {currentStep === 2 && (
                                    <div className="phase-wizard-step-panel structure-step-panel structure-step-panel-points flex flex-col gap-6">
                                        <div className="structure-step-head">
                                            <p className="text-[10px] font-bold text-dim uppercase tracking-widest mb-1">Paso 2</p>
                                            <h3 className="text-2xl font-extrabold tracking-tight mb-1">Sistema de Puntos</h3>
                                            <p className="text-dim text-sm">Configura los puntos otorgados por cada resultado</p>
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

                                        <div className="structure-field-panel rounded-xl border border-[var(--border-basalt)] bg-[var(--surface-basalt)] p-5">
                                            <label className="flex items-center gap-3 cursor-pointer mb-0">
                                                <input
                                                    type="checkbox"
                                                    className="w-4 h-4 accent-[var(--accent-primary)]"
                                                    checked={useExtraTimePoints}
                                                    onChange={e => setUseExtraTimePoints(e.target.checked)}
                                                />
                                                <div>
                                                    <span className="text-sm font-semibold text-white">Puntos diferentes por prórroga / penales</span>
                                                    <p className="text-xs text-dim mt-0.5">Si se va a tiempo extra se usan estos puntos alternativos</p>
                                                </div>
                                            </label>
                                            {useExtraTimePoints && (
                                                <div className="structure-score-grid grid grid-cols-3 gap-3 mt-5 pt-5 border-t border-[var(--border-basalt)]">
                                                    {[
                                                        { label: 'Victoria (extra)', value: pointsWinExtra, set: setPointsWinExtra },
                                                        { label: 'Empate (extra)', value: pointsDrawExtra, set: setPointsDrawExtra },
                                                        { label: 'Derrota (extra)', value: pointsLossExtra, set: setPointsLossExtra },
                                                    ].map(({ label, value, set }) => (
                                                        <div key={label} className="structure-field-panel structure-score-panel">
                                                            <label className="structure-field-label block text-xs font-bold text-dim uppercase tracking-widest mb-2">{label}</label>
                                                            <input type="number" className="basalt-input text-center" value={value} onChange={e => set(Number(e.target.value))} />
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>

                                        {isRugby && (
                                            <div className="structure-field-panel rounded-xl border border-[var(--border-basalt)] bg-[var(--surface-basalt)] p-5">
                                                <label className="flex items-center gap-3 cursor-pointer">
                                                    <input
                                                        type="checkbox"
                                                        className="w-4 h-4 accent-[var(--accent-primary)]"
                                                        checked={allowBonusPoints}
                                                        onChange={e => setAllowBonusPoints(e.target.checked)}
                                                    />
                                                    <div>
                                                        <span className="text-sm font-semibold text-white">Puntos bonus (Rugby)</span>
                                                        <p className="text-xs text-dim mt-0.5">Otorgar puntos de bonificación según las reglas del torneo</p>
                                                    </div>
                                                </label>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* STEP 3: Desempate */}
                                {currentStep === 3 && (
                                    <div className="phase-wizard-step-panel structure-step-panel structure-step-panel-rules flex flex-col gap-6">
                                        <div className="structure-step-head">
                                            <p className="text-[10px] font-bold text-dim uppercase tracking-widest mb-1">Paso 3</p>
                                            <h3 className="text-2xl font-extrabold tracking-tight mb-1">Criterios de Desempate</h3>
                                            <p className="text-dim text-sm">Define el orden de prioridad para resolver empates en la tabla</p>
                                        </div>

                                        {validationErrors.length > 0 && (
                                            <div className="structure-inline-alert flex flex-col gap-1.5 p-4 rounded-lg bg-[var(--status-warning)]/10 border border-[var(--status-warning)]/30 text-[var(--status-warning)] text-xs">
                                                {validationErrors.map((err, i) => (
                                                    <span key={i} className="flex items-center gap-2">
                                                        <AlertCircle size={12} /> {err}
                                                    </span>
                                                ))}
                                            </div>
                                        )}

                                        <div className="structure-field-panel">
                                            <label className="structure-field-label block text-xs font-bold text-dim uppercase tracking-widest mb-3">
                                                Reglas de desempate (arrastrar para priorizar)
                                            </label>
                                            <TiebreakerList
                                                items={tiebreakerListItems}
                                                onChange={(newItems) => setTiebreakers(newItems.filter(t => (t.priority ?? 0) > 0))}
                                                phaseType={phaseType}
                                            />
                                        </div>

                                        <div className="structure-field-panel pt-6 border-t border-[var(--border-basalt)]">
                                            <label className="structure-field-label block text-xs font-bold text-dim uppercase tracking-widest mb-3">
                                                Columnas de la tabla
                                            </label>
                                            <TableColumnSelector categories={columnCategories} selectedColumns={tableCols} onChange={handleTableColsChange} />
                                        </div>
                                    </div>
                                )}

                                {/* STEP 4: Etiquetas */}
                                {currentStep === 4 && (
                                    <div className="phase-wizard-step-panel structure-step-panel structure-step-panel-labels flex flex-col gap-6">
                                        <div className="structure-step-head">
                                            <p className="text-[10px] font-bold text-dim uppercase tracking-widest mb-1">Paso 4</p>
                                            <h3 className="text-2xl font-extrabold tracking-tight mb-1">Etiquetas de Clasificación</h3>
                                            <p className="text-dim text-sm">Zonas coloreadas para resaltar posiciones en la tabla (ej: &quot;Clasifica&quot;, &quot;Descenso&quot;)</p>
                                        </div>

                                        <div className="structure-labels-grid">
                                            <div className="structure-field-panel structure-labels-list-panel">
                                                <label className="structure-field-label block text-xs font-bold text-dim uppercase tracking-widest mb-3">
                                                    Etiquetas creadas
                                                </label>

                                                {groupLabels.length === 0 ? (
                                                    <div className="structure-label-empty">
                                                        Sin etiquetas configuradas. Agrega zonas para colorear la tabla de posiciones.
                                                    </div>
                                                ) : (
                                                    <div className="structure-label-list">
                                                        {groupLabels.map((label, index) => {
                                                            const labelId = getLabelKey(label);
                                                            const isEditing = editingLabelId === labelId;

                                                            return (
                                                                <div key={labelId} className={`structure-label-row${isEditing ? ' structure-label-row-active' : ''}`}>
                                                                    <div className="structure-label-row-head">
                                                                        <div className="structure-label-row-main">
                                                                            <LabelChip name={label.name} color={label.color} />
                                                                            <span className="structure-label-row-meta">
                                                                                {label.colorMode === 'auto'
                                                                                    ? `Color automatico por orden ${index + 1}`
                                                                                    : 'Color manual'}
                                                                            </span>
                                                                        </div>
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

                                                                    <div className="structure-label-row-config">
                                                                        <div className="structure-label-mode-toggle">
                                                                            {(['auto', 'manual'] as const).map(mode => (
                                                                                <button
                                                                                    key={mode}
                                                                                    type="button"
                                                                                    onClick={() => updateLabelMode(label.name, mode)}
                                                                                    className={`structure-label-mode-btn${label.colorMode === mode ? ' is-active' : ''}`}
                                                                                >
                                                                                    {mode === 'auto' ? 'Automatico' : 'Manual'}
                                                                                </button>
                                                                            ))}
                                                                        </div>

                                                                        {label.colorMode === 'manual' ? (
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
                                                                        ) : (
                                                                            <p className="structure-label-helper">
                                                                                La tabla le asigna el color automaticamente segun su orden visual.
                                                                            </p>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                )}
                                            </div>

                                            <div className="structure-field-panel structure-labels-form-panel">
                                                <label className="structure-field-label block text-xs font-bold text-dim uppercase tracking-widest mb-3">
                                                    {editingLabelId ? 'Editar etiqueta' : 'Nueva etiqueta'}
                                                </label>

                                                <div className="structure-label-form">
                                                    <div className="structure-label-input-row">
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
                                                        <button type="button" className="basalt-btn basalt-btn-primary structure-label-submit" onClick={addLabel}>
                                                            <Plus size={15} />
                                                            {editingLabelId ? 'Actualizar' : 'Agregar'}
                                                        </button>
                                                    </div>

                                                    <div className="structure-label-mode-toggle structure-label-mode-toggle-form">
                                                        {(['auto', 'manual'] as const).map(mode => (
                                                            <button
                                                                key={mode}
                                                                type="button"
                                                                onClick={() => setLabelColorMode(mode)}
                                                                className={`structure-label-mode-btn${labelColorMode === mode ? ' is-active' : ''}`}
                                                            >
                                                                {mode === 'auto' ? 'Automatico' : 'Manual'}
                                                            </button>
                                                        ))}
                                                    </div>

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
                                                            El color se asigna automaticamente en el orden en que agregas las zonas.
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
                                                            <button type="button" className="basalt-btn basalt-btn-secondary" onClick={resetLabelForm}>
                                                                Cancelar
                                                            </button>
                                                        )}
                                                        <button type="button" className="basalt-btn basalt-btn-primary" onClick={addLabel}>
                                                            {editingLabelId ? 'Guardar cambios' : 'Crear etiqueta'}
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="hidden">
                                            <div className="structure-labels-grid">
                                            <input
                                                type="text"
                                                className="basalt-input flex-1"
                                                value={newLabel}
                                                onChange={e => setNewLabel(e.target.value)}
                                                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addLabel(); } }}
                                                placeholder="Ej: Clasifica a 8vos, Descenso..."
                                            />
                                            <button type="button" className="basalt-btn basalt-btn-primary flex-shrink-0" onClick={addLabel}>
                                                <Plus size={15} />
                                                Añadir
                                            </button>
                                        </div>

                                        {groupLabels.length === 0 ? (
                                            <div className="structure-field-panel text-center py-10 px-6 rounded-xl border border-dashed border-[var(--border-basalt)] text-dim text-sm">
                                                Sin etiquetas configuradas. Agrega zonas para colorear la tabla de posiciones.
                                            </div>
                                        ) : (
                                            <div className="structure-label-stack flex flex-col gap-3">
                                                {groupLabels.map((label, i) => (
                                                    <div key={i} className="structure-field-panel p-4 rounded-xl border border-[var(--border-basalt)] bg-[var(--surface-basalt)]">
                                                        <div className="flex items-center justify-between mb-3">
                                                            <div className="flex items-center gap-2.5">
                                                                <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: label.color }} />
                                                                <span className="text-sm font-bold text-white">{label.name}</span>
                                                            </div>
                                                            <button type="button" onClick={() => removeLabel(label.name)} className="p-1.5 rounded-lg text-dim hover:text-red-400 hover:bg-red-500/10 transition-all">
                                                                <Trash2 size={13} />
                                                            </button>
                                                        </div>
                                                        <div className="flex items-center gap-3">
                                                            <div className="flex bg-[var(--bg-basalt)] p-0.5 rounded-lg border border-[var(--border-basalt)]">
                                                                {(['auto', 'manual'] as const).map(mode => (
                                                                    <button key={mode} type="button" onClick={() => updateLabelMode(label.name, mode)} className={`px-3 py-1 text-xs rounded-md font-semibold transition-all ${label.colorMode === mode ? 'bg-[var(--surface-elevated)] text-white' : 'text-dim hover:text-white'}`}>
                                                                        {mode === 'auto' ? 'Automático' : 'Manual'}
                                                                    </button>
                                                                ))}
                                                            </div>
                                                            {label.colorMode === 'manual' && (
                                                                <div className="flex items-center gap-2">
                                                                    <input type="color" value={label.color} onChange={e => updateLabelColor(label.name, e.target.value)} className="w-7 h-7 rounded cursor-pointer border-0 bg-transparent p-0" />
                                                                    <div className="flex gap-1">
                                                                        {PRESET_COLORS.map(c => (
                                                                            <button key={c} type="button" onClick={() => updateLabelColor(label.name, c)} className={`w-4 h-4 rounded-full cursor-pointer hover:scale-110 transition-transform ${label.color === c ? 'ring-2 ring-white ring-offset-1 ring-offset-[var(--surface-basalt)]' : ''}`} style={{ backgroundColor: c }} />
                                                                        ))}
                                                                    </div>
                                                                </div>
                                                            )}
                                                            {label.colorMode === 'auto' && (
                                                                <span className="text-xs text-dim">Color asignado automáticamente por orden</span>
                                                            )}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                        </div>
                                    </div>
                                )}

                                {/* STEP 5: Stats */}
                                {currentStep === 5 && (
                                    <div className="phase-wizard-step-panel structure-step-panel structure-step-panel-stats flex flex-col gap-6">
                                        <div className="structure-step-head">
                                            <p className="text-[10px] font-bold text-dim uppercase tracking-widest mb-1">Paso 5</p>
                                            <h3 className="text-2xl font-extrabold tracking-tight mb-1">Estadísticas</h3>
                                            <p className="text-dim text-sm">Configura cómo se atribuyen las estadísticas a los jugadores</p>
                                        </div>

                                        <div className="structure-field-panel rounded-xl border border-[var(--border-basalt)] bg-[var(--surface-basalt)] p-5">
                                            <label className="flex items-start gap-3 cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    className="w-4 h-4 mt-0.5 accent-[var(--accent-primary)]"
                                                    checked={statsAssignment === 'starters'}
                                                    onChange={e => setStatsAssignment(e.target.checked ? 'starters' : 'played')}
                                                />
                                                <div>
                                                    <span className="text-sm font-semibold text-white">Asignar estadísticas solo a titulares</span>
                                                    <p className="text-xs text-dim mt-1">Si está inactivo, se asignará a todos los jugadores que hayan jugado.</p>
                                                </div>
                                            </label>
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
