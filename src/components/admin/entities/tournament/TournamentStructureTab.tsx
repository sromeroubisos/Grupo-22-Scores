'use client';

import { useState, useEffect, useMemo } from 'react';
import './basalt.css';
import '../club/vitreous-club.css';
import './phase-wizard.css';

import { TiebreakerList, TiebreakerItem } from './TiebreakerList';
import { TableColumnSelector, ColumnCategory } from './TableColumnSelector';
import { PhaseSettings, tiebreakersToLegacy, GroupLabel } from '@/types/phase-settings';
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

export function TournamentStructureTab({ data, id }: { data?: any; id?: string }) {
    const [phases, setPhases] = useState<Phase[]>([]);
    const [loading, setLoading] = useState(true);

    // Form state for creating phase
    const [showPhaseForm, setShowPhaseForm] = useState(false);
    const [phaseName, setPhaseName] = useState('');
    const [phaseType, setPhaseType] = useState<'league' | 'knockout' | 'group_stage' | 'playoff'>('league');
    const [teamsCount, setTeamsCount] = useState<number | ''>('');
    const [advanceCount, setAdvanceCount] = useState<number | ''>('');
    const [legs, setLegs] = useState<1 | 2>(1);

    const isRugby = data?.sport?.toLowerCase() === 'rugby';

    // Points system defaults
    const [pointsWin, setPointsWin] = useState(isRugby ? 4 : 3);
    const [pointsDraw, setPointsDraw] = useState(isRugby ? 2 : 1);
    const [pointsLoss, setPointsLoss] = useState(0);
    const [allowBonusPoints, setAllowBonusPoints] = useState(isRugby);

    // Extra time
    const [useExtraTimePoints, setUseExtraTimePoints] = useState(false);
    const [pointsWinExtra, setPointsWinExtra] = useState(2);
    const [pointsDrawExtra, setPointsDrawExtra] = useState(1);
    const [pointsLossExtra, setPointsLossExtra] = useState(0);

    // Columns & features
    const [tableCols, setTableCols] = useState<Record<string, boolean>>({
        posVariation: true,
        points: true,
        won: true,
        drawn: true,
        lost: true,
        played: true,
        percentage: false,
        classification: false,
        pointsFor: true,
        pointsAgainst: true,
        pointsDiff: true,
        extraPlayed: false,
        extraWon: false,
        extraDrawn: false,
        extraLost: false,
        tries: isRugby,
        conversions: isRugby,
        penalties: isRugby,
        dropGoals: isRugby,
        tackles: isRugby,
        runs: isRugby
    });

    // Tiebreakers - NEW STRUCTURE
    const defaultTiebreakers: TiebreakerItem[] = [
        { metric: 'points', label: 'Puntos', enabled: true, order: 'desc' as const, priority: 1 },
        { metric: 'headToHead', label: 'Enfrentamiento Directo', enabled: true, order: 'desc' as const, priority: 2, requiresRoundRobin: true },
        { metric: 'pointsDiff', label: 'Diferencia de Puntos', enabled: true, order: 'desc' as const, priority: 3 },
        { metric: 'pointsFor', label: 'Puntos a Favor', enabled: true, order: 'desc' as const, priority: 4 },
        { metric: 'won', label: 'Victorias', enabled: false, order: 'desc' as const, priority: 5 },
        { metric: 'drawn', label: 'Empates', enabled: false, order: 'desc' as const, priority: 6 },
        { metric: 'percentage', label: 'Porcentaje', enabled: false, order: 'desc' as const, priority: 7 },
        ...(isRugby ? [
            { metric: 'tries', label: 'Tries', enabled: false, order: 'desc' as const, priority: 8 },
            { metric: 'conversions', label: 'Conversiones', enabled: false, order: 'desc' as const, priority: 9 },
        ] : [])
    ];

    const [tiebreakers, setTiebreakers] = useState<TiebreakerItem[]>(defaultTiebreakers);

    // Player Stats assignment
    const [statsAssignment, setStatsAssignment] = useState<'played' | 'starters'>('played');
    const [currentStep, setCurrentStep] = useState(1);
    const [editingPhaseId, setEditingPhaseId] = useState<string | null>(null);

    // Group labels
    const PRESET_COLORS = [
        "#00a365", "#22c55e", "#eab308", "#ef4444", "#3b82f6", "#a855f7", "#f97316", "#14b8a6"
    ];
    const [groupLabels, setGroupLabels] = useState<GroupLabel[]>([]);
    const [newLabel, setNewLabel] = useState('');

    const addLabel = () => {
        if (newLabel.trim() && !groupLabels.find(l => l.name === newLabel.trim())) {
            const autoColorIndex = groupLabels.length;
            const autoColor = PRESET_COLORS[autoColorIndex % PRESET_COLORS.length];
            setGroupLabels([...groupLabels, {
                id: `tag_${Date.now()}`,
                name: newLabel.trim(),
                colorMode: 'auto',
                color: autoColor,
                autoColorIndex
            }]);
            setNewLabel('');
        }
    };

    const removeLabel = (labelName: string) => {
        setGroupLabels(groupLabels.filter(l => l.name !== labelName));
    };

    const updateLabelMode = (name: string, mode: 'auto' | 'manual') => {
        setGroupLabels(groupLabels.map(l => {
            if (l.name === name) {
                const newColor = mode === 'auto' ? PRESET_COLORS[(l.autoColorIndex || 0) % PRESET_COLORS.length] : l.color;
                return { ...l, colorMode: mode, color: newColor };
            }
            return l;
        }));
    };

    const updateLabelColor = (name: string, color: string) => {
        setGroupLabels(groupLabels.map(l => l.name === name ? { ...l, color } : l));
    };

    const [creating, setCreating] = useState(false);

    // Column categories for better organization
    const columnCategories: ColumnCategory[] = useMemo(() => [
        {
            id: 'basic',
            label: 'Básicas',
            columns: [
                { id: 'posVariation', label: 'Variación' },
                { id: 'points', label: 'Puntos' },
                { id: 'played', label: 'Jugados' },
                { id: 'classification', label: 'Clasificación' },
            ]
        },
        {
            id: 'results',
            label: 'Resultados',
            columns: [
                { id: 'won', label: 'Victorias' },
                { id: 'drawn', label: 'Empates' },
                { id: 'lost', label: 'Derrotas' },
                { id: 'percentage', label: 'Porcentaje' },
            ]
        },
        {
            id: 'extraTime',
            label: 'Prórroga',
            columns: [
                { id: 'extraPlayed', label: 'Jugados (Prórroga)' },
                { id: 'extraWon', label: 'Victorias (Prórroga)' },
                { id: 'extraDrawn', label: 'Empates (Prórroga)' },
                { id: 'extraLost', label: 'Derrotas (Prórroga)' },
            ]
        },
        {
            id: 'scoring',
            label: 'Anotación',
            columns: [
                { id: 'pointsFor', label: 'A Favor' },
                { id: 'pointsAgainst', label: 'En Contra' },
                { id: 'pointsDiff', label: 'Diferencia' },
            ]
        },
        ...(isRugby ? [{
            id: 'rugby',
            label: 'Rugby',
            columns: [
                { id: 'tries', label: 'Try' },
                { id: 'conversions', label: 'Conversión' },
                { id: 'penalties', label: 'Penal' },
                { id: 'dropGoals', label: 'Drop Goal' },
                { id: 'tackles', label: 'Tackle' },
                { id: 'runs', label: 'Carrera' }
            ]
        }] : [])
    ], [isRugby]);

    // Validations
    const validationErrors = useMemo(() => {
        const errors: string[] = [];

        const enabledTiebreakers = tiebreakers.filter(tb => tb.enabled);

        if (enabledTiebreakers.length === 0) {
            errors.push('Debe haber al menos un criterio de desempate activo');
        }

        if (useExtraTimePoints && !tableCols.extraWon && !tableCols.extraDrawn) {
            errors.push('Prórroga activada pero sin columnas de prórroga visibles');
        }

        const hasPointsAndWins = enabledTiebreakers.some(tb => tb.metric === 'points') &&
            enabledTiebreakers.some(tb => tb.metric === 'won');
        if (hasPointsAndWins) {
            errors.push('Advertencia: "Puntos" y "Victorias" pueden ser redundantes según el sistema de puntos');
        }

        return errors;
    }, [tiebreakers, useExtraTimePoints, tableCols]);

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
        setTiebreakers(defaultTiebreakers);
        setTableCols({
            posVariation: true,
            points: true,
            won: true,
            drawn: true,
            lost: true,
            played: true,
            percentage: false,
            classification: false,
            pointsFor: true,
            pointsAgainst: true,
            pointsDiff: true,
            extraPlayed: false,
            extraWon: false,
            extraDrawn: false,
            extraLost: false,
            tries: isRugby,
            conversions: isRugby,
            penalties: isRugby,
            dropGoals: isRugby,
            tackles: isRugby,
            runs: isRugby
        });
        setGroupLabels([]);
        setNewLabel('');
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

            // Points
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
                // Legacy points if pointsSystem is missing
                setPointsWin(isRugby ? 4 : 3);
                setPointsDraw(isRugby ? 2 : 1);
                setPointsLoss(0);
                setAllowBonusPoints(isRugby);
            }

            // Columns
            if (s.tableColumns) {
                setTableCols({ ...tableCols, ...s.tableColumns });
            }

            // Tiebreakers
            if (s.tiebreakers) {
                // Map saved tiebreakers and merge with defaults to ensure all fields are present
                const saved = s.tiebreakers.map(t => {
                    const d = defaultTiebreakers.find(dt => dt.metric === t.metric);
                    return { ...d, ...t };
                });
                setTiebreakers(saved as TiebreakerItem[]);
            }

            // Group Labels
            setGroupLabels(s.groupLabels || []);

            // Stats
            setStatsAssignment(s.statsAssignment || (s.playerStats?.assignOnlyToStarters ? 'starters' : 'played'));
        }

        setShowPhaseForm(true);
        setCurrentStep(1);
    };

    const handleEditClick = (phase: Phase) => {
        loadPhaseIntoForm(phase);
    };

    useEffect(() => {
        if (id) {
            loadPhases();
        }
    }, [id]);

    const loadPhases = async () => {
        setLoading(true);
        try {
            const res = await fetch(`/api/tournaments/${id}/phases`);
            if (res.ok) {
                const data = await res.json();
                setPhases(data.data || []);
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

        // Validate before submitting
        if (validationErrors.some(err => err.includes('Debe haber'))) {
            alert('Por favor corrija los errores de validación antes de guardar');
            return;
        }

        setCreating(true);

        const url = editingPhaseId
            ? `/api/tournaments/${id}/phases/${editingPhaseId}`
            : `/api/tournaments/${id}/phases`;

        const method = editingPhaseId ? 'PATCH' : 'POST';

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
                        // Legacy/Core Fields
                        teamsCount: teamsCount === '' ? 0 : Number(teamsCount),
                        advanceCount: advanceCount === '' ? 0 : Number(advanceCount),
                        legs,
                        tableColumns: tableCols,
                        groupLabels: groupLabels,
                        statsAssignment,

                        // New Structured Fields
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
                                        {
                                            if: { assignOnlyToStarters: true },
                                            then: { eligiblePlayers: 'starters_only' }
                                        },
                                        {
                                            if: { assignOnlyToStarters: false },
                                            then: { eligiblePlayers: 'played_true' }
                                        }
                                    ]
                                },
                                attribution: {
                                    teamStatsToPlayers: ['points_for', 'points_against', 'wins', 'draws', 'losses', 'bonus_points'],
                                    howToApply: 'for_each_eligible_player_add_same_team_stat_delta_as_in_team_totals'
                                }
                            }
                        },
                        matchFormat: {
                            type: legs === 2 ? 'series' : 'single_match',
                            label: legs === 2 ? 'Ida y Vuelta' : 'Partido Único',
                            behavior: {
                                single_match: {
                                    seriesLength: 1,
                                    winnerDetermination: 'most_points_in_match'
                                },
                                series: {
                                    seriesLength: 2,
                                    aggregateMethod: 'points_sum',
                                    tieResolution: 'extra_time_then_penalty_shootout'
                                }
                            }
                        },
                        pointsSystem: {
                            win: pointsWin,
                            draw: pointsDraw,
                            loss: pointsLoss,
                            extraTimeAlternativeSystem: useExtraTimePoints,
                            allowBonusPoints,
                            behavior: {
                                whenToCalculate: 'on_match_finalized',
                                input: {
                                    requires: ['score'],
                                    statusRequired: 'finalized'
                                },
                                output: {
                                    writesTo: ['standings']
                                },
                                basePointsLogic: [
                                    { if: { win: true }, then: { add: pointsWin } },
                                    { if: { draw: true }, then: { add: pointsDraw } },
                                    { if: { loss: true }, then: { add: pointsLoss } }
                                ],
                                extraTimeLogic: useExtraTimePoints ? {
                                    enabledWhen: { extraTimeAlternativeSystem: true },
                                    requires: ['extra_time_score'],
                                    howToApply: 'override_base_points_with_extra_time_logic',
                                    win: pointsWinExtra,
                                    draw: pointsDrawExtra,
                                    loss: pointsLossExtra
                                } : undefined,
                                idempotency: {
                                    key: 'match_id',
                                    rule: 'ignore_if_already_processed'
                                }
                            }
                        },
                        tiebreakers: tiebreakers.map(({ metric, enabled, order, priority }) => ({
                            metric, enabled, order, priority
                        })),
                        tiebreakerBehavior: {
                            appliesTo: 'standings_sorting_only',
                            evaluationTime: 'after_all_matches_in_scope_processed',
                            scope: {
                                tableScope: 'phase_group_or_pool',
                                headToHeadScope: 'only_between_tied_teams_in_that_tableScope'
                            },
                            algorithm: {
                                stepByStep: tiebreakers.filter(t => t.enabled).map(t => t.metric),
                                finalFallback: {
                                    mode: 'stable',
                                    rule: 'keep_previous_order_or_use_team_id_ascending',
                                    reason: 'ensure deterministic sorting'
                                }
                            }
                        }
                    }
                }),
            });

            if (response.ok) {
                resetForm();
                await loadPhases();
            } else {
                // Robust Error Parsing
                const contentType = response.headers.get('content-type');
                let errorMessage = `Error ${response.status}`;
                let errorDetail = '';

                try {
                    if (contentType && contentType.includes('application/json')) {
                        const errorData = await response.json();
                        errorDetail = JSON.stringify(errorData, null, 2);
                        errorMessage = errorData.message || errorData.error || errorMessage;
                    } else {
                        errorDetail = await response.text();
                        errorMessage = errorDetail || errorMessage;
                    }
                } catch (parseError) {
                    console.error('Failed to parse error response:', parseError);
                }

                console.group('❌ Phase Creation Failed');
                console.error(`Status: ${response.status} (${response.statusText})`);
                console.error(`URL: ${response.url}`);
                console.error(`Response Body:`, errorDetail);
                console.groupEnd();

                // Normalize for user alert (limit length if it's an HTML blob)
                const displayMessage = errorMessage.length > 200
                    ? errorMessage.substring(0, 197) + '...'
                    : errorMessage;

                alert(`Error al crear fase: ${displayMessage}\n\nRevisa la consola para más detalles técnicos.`);
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
            const response = await fetch(`/api/tournaments/${id}/phases/${phaseId}`, {
                method: 'DELETE',
            });

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

    const getPhaseTypeLabel = (type: string) => {
        switch (type) {
            case 'league': return 'Liga (Round-robin)';
            case 'group_stage': return 'Fase de Grupos';
            case 'knockout': return 'Eliminación Directa';
            case 'playoff': return 'Playoffs';
            default: return type.toUpperCase();
        }
    };

    return (
        <div className="flash-ui-container dark bg-transparent" style={{ '--accent': '#00a365', minHeight: 'auto' } as React.CSSProperties}>
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-500 pb-32">
                {loading ? (
                    <div className="manager-card">
                        <div className="p-12 text-center text-[#888]">Cargando la estructura del torneo...</div>
                    </div>
                ) : (
                    <>
                        {/* List of existing phases */}
                        {phases.length > 0 && !showPhaseForm && (
                            <div className="manager-card">
                                <header className="manager-header">
                                    <div className="manager-header-titles">
                                        <h1>Fases del Torneo</h1>
                                        <p>Estructura y configuración de cada fase competitiva</p>
                                    </div>
                                    <div className="manager-metadata-box">
                                        {phases.length} FASE{phases.length !== 1 ? 'S' : ''}
                                    </div>
                                </header>
                                <div className="flex flex-col md:flex-row flex-wrap gap-8">
                                    {phases.map((phase, index) => (
                                        <div
                                            key={phase.id}
                                            onClick={() => handleEditClick(phase)}
                                            className="relative group border border-[rgba(255,255,255,0.08)] bg-[rgba(10,10,11,0.72)] backdrop-blur-[10px] hover:border-[rgba(255,255,255,0.15)] transition-all duration-300 rounded-[10px] w-full min-w-[320px] md:min-w-[520px] max-w-[720px] overflow-hidden cursor-pointer hover:bg-[rgba(20,20,22,0.85)]"
                                            style={{ padding: '18px 20px' }}
                                        >
                                            {/* Texture Overlay */}
                                            <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, rgba(255,255,255,0.15) 1px, transparent 0)', backgroundSize: '16px 16px' }}></div>

                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleDeletePhase(phase.id);
                                                }}
                                                className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 p-2 rounded-md hover:bg-red-500/10 text-[#888] hover:text-red-400 transition-all duration-200 z-10"
                                                title="Eliminar fase"
                                            >
                                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
                                            </button>

                                            <div className="uppercase tracking-[0.22em] text-[12px] text-[rgba(255,255,255,0.45)] mb-2.5 font-medium relative z-10">Fase {index + 1}</div>
                                            <h3 className="font-[800] text-white pr-8 leading-tight relative z-10" style={{ fontSize: 'clamp(28px, 3vw, 40px)', marginBottom: '10px' }}>
                                                {phase.name}
                                            </h3>

                                            <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6 text-[14px] text-[rgba(255,255,255,0.65)] relative z-10">
                                                <div className="flex items-center gap-2.5">
                                                    <div className="w-2 h-2 rounded-full bg-[#00a365]"></div>
                                                    <span className="text-white/90 font-medium">{getPhaseTypeLabel(phase.phase_type)}</span>
                                                </div>

                                                {phase.settings?.teamsCount && phase.settings.teamsCount > 0 ? (
                                                    <div className="flex items-center gap-2.5">
                                                        <div className="w-2 h-2 rounded-full bg-[rgba(255,255,255,0.15)]"></div>
                                                        <span>{phase.settings.teamsCount} Equipos</span>
                                                    </div>
                                                ) : null}

                                                {phase.settings?.legs ? (
                                                    <div className="flex items-center gap-2.5">
                                                        <div className="w-2 h-2 rounded-full bg-[rgba(255,255,255,0.15)]"></div>
                                                        <span>{phase.settings.legs === 2 ? 'Ida y Vuelta' : 'Partido Único'}</span>
                                                    </div>
                                                ) : null}

                                                {phase.settings?.advanceCount && phase.settings.advanceCount > 0 ? (
                                                    <div className="flex items-center gap-2.5 text-[#00a365] font-medium">
                                                        <div className="w-2 h-2 rounded-full shadow-[0_0_8px_rgba(0,163,101,0.4)] bg-[#00a365]"></div>
                                                        <span>{phase.settings.advanceCount} Avanzan</span>
                                                    </div>
                                                ) : null}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                                <div className="flex justify-center mt-12">
                                    <button className="manager-btn-inline" onClick={() => { resetForm(); setShowPhaseForm(true); }}>+ Agregar Nueva Fase</button>
                                </div>
                            </div>
                        )}

                        {phases.length === 0 && !showPhaseForm && (
                            <div className="manager-card border-dashed border-2 border-[var(--border)] bg-transparent hover:border-[var(--accent)]/10 transition-all duration-700 empty-state-container">
                                <div className="flex flex-col items-center justify-center py-40 px-6 relative overflow-hidden">
                                    <div className="text-9xl mb-12 opacity-30 filter grayscale hover:grayscale-0 transition-all duration-700 icon-float icon-pulse cursor-default">📋</div>
                                    <h3 className="text-4xl font-black text-white mb-6">Sin Fases Configuradas</h3>
                                    <p className="text-[15px] text-[#888] mb-16 max-w-xl text-center">Diseña el alma de tu torneo. Define cómo se competirá y qué criterios decidirán al campeón.</p>
                                    <button className="manager-btn-inline" onClick={() => { resetForm(); setShowPhaseForm(true); }}>Configurar Primera Fase</button>
                                </div>
                            </div>
                        )}

                        {/* PHASE WIZARD UI */}
                        {showPhaseForm && (
                            <div className="phase-wizard-wrapper mt-8">
                                <form onSubmit={handleCreatePhase} className="monolith-container">
                                    {/* Sidebar */}
                                    <aside className="sidebar">
                                        <div className="sidebar-header">
                                            <h2>Fase {editingPhaseId ? phases.findIndex(p => p.id === editingPhaseId) + 1 : phases.length + 1}</h2>
                                            <p>{editingPhaseId ? 'Editando Fase' : 'Nueva Fase'}</p>
                                        </div>

                                        {validationErrors.length > 0 && (
                                            <div className="mb-6 p-4 rounded bg-red-500/10 border border-red-500/30 text-red-400 text-xs">
                                                {validationErrors.length} advertencia(s).
                                            </div>
                                        )}

                                        <ul className="stepper-list">
                                            {[
                                                { step: 1, title: 'Básico', desc: 'Formato general', show: true },
                                                { step: 2, title: 'Puntos', desc: 'Sistema de puntuación', show: phaseType === 'league' || phaseType === 'group_stage' },
                                                { step: 3, title: 'Desempate', desc: 'Criterios', show: phaseType === 'league' || phaseType === 'group_stage' },
                                                { step: 4, title: 'Etiquetas', desc: 'Zonas y clasificación', show: true },
                                                { step: 5, title: 'Estadísticas', desc: 'Atribución a jugadores', show: true }
                                            ].map(s => s.show && (
                                                <li key={s.step}
                                                    className={`step-item ${currentStep === s.step ? 'active' : ''} ${currentStep > s.step ? 'completed' : ''}`}
                                                    onClick={() => setCurrentStep(s.step)}>
                                                    <span className="step-item-title">{s.step}. {s.title}</span>
                                                    <span className="step-item-desc">{s.desc}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    </aside>

                                    {/* Content Area */}
                                    <div className="wizard-content">
                                        <div className="carbon-overlay"></div>

                                        {/* STEP 1: Basic Config */}
                                        <div className={`step-pane ${currentStep === 1 ? 'active' : ''}`}>
                                            <div className="section-header">
                                                <h1>Configuración Básica</h1>
                                                <p>Define la estructura general de la fase</p>
                                            </div>

                                            <div className="grid-layout mb-8">
                                                <div className="field-group full-width">
                                                    <label className="wizard-label">Nombre de la fase</label>
                                                    <input type="text" className="wizard-input" value={phaseName} onChange={e => setPhaseName(e.target.value)} placeholder="Ej: Fase Regular" required autoFocus />
                                                </div>

                                                <div className="field-group full-width">
                                                    <label className="wizard-label">Tipo de fase</label>
                                                    <div className="radio-group">
                                                        <div className="radio-option">
                                                            <input type="radio" id="pt-league" name="phaseType" value="league" checked={phaseType === 'league'} onChange={() => setPhaseType('league')} />
                                                            <label htmlFor="pt-league" className="radio-label">Liga</label>
                                                        </div>
                                                        <div className="radio-option">
                                                            <input type="radio" id="pt-knockout" name="phaseType" value="knockout" checked={phaseType === 'knockout'} onChange={() => setPhaseType('knockout')} />
                                                            <label htmlFor="pt-knockout" className="radio-label">Llaves</label>
                                                        </div>
                                                        <div className="radio-option">
                                                            <input type="radio" id="pt-group" name="phaseType" value="group_stage" checked={phaseType === 'group_stage'} onChange={() => setPhaseType('group_stage')} />
                                                            <label htmlFor="pt-group" className="radio-label">Grupos</label>
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="field-group">
                                                    <label className="wizard-label">Cantidad de Equipos</label>
                                                    <div className="stepper-number">
                                                        <button type="button" className="stepper-btn" onClick={() => setTeamsCount(prev => prev === '' ? 2 : Math.max(2, Number(prev) - 1))}>-</button>
                                                        <input type="number" className="stepper-val bg-transparent border-none w-full text-center outline-none" value={teamsCount} onChange={e => setTeamsCount(e.target.value ? Number(e.target.value) : '')} placeholder="Ej: 12" />
                                                        <button type="button" className="stepper-btn" onClick={() => setTeamsCount(prev => prev === '' ? 3 : Number(prev) + 1)}>+</button>
                                                    </div>
                                                </div>

                                                <div className="field-group">
                                                    <label className="wizard-label">Equipos que avanzan</label>
                                                    <div className="stepper-number">
                                                        <button type="button" className="stepper-btn" onClick={() => setAdvanceCount(prev => prev === '' ? 1 : Math.max(1, Number(prev) - 1))}>-</button>
                                                        <input type="number" className="stepper-val bg-transparent border-none w-full text-center outline-none" value={advanceCount} onChange={e => setAdvanceCount(e.target.value ? Number(e.target.value) : '')} placeholder="Ej: 4" />
                                                        <button type="button" className="stepper-btn" onClick={() => setAdvanceCount(prev => prev === '' ? 2 : Number(prev) + 1)}>+</button>
                                                    </div>
                                                </div>

                                                <div className="field-group full-width mt-4">
                                                    <label className="wizard-label">Formato de Partido</label>
                                                    <div className="radio-group">
                                                        <div className="radio-option">
                                                            <input type="radio" id="mf-single" name="matchFormat" value={1} checked={legs === 1} onChange={() => setLegs(1)} />
                                                            <label htmlFor="mf-single" className="radio-label">Partido Único</label>
                                                        </div>
                                                        <div className="radio-option">
                                                            <input type="radio" id="mf-series" name="matchFormat" value={2} checked={legs === 2} onChange={() => setLegs(2)} />
                                                            <label htmlFor="mf-series" className="radio-label">Ida y Vuelta</label>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* STEP 2: Sistema de Puntos */}
                                        <div className={`step-pane ${currentStep === 2 ? 'active' : ''}`}>
                                            <div className="section-header">
                                                <h1>Sistema de Puntos</h1>
                                                <p>Configura los puntos otorgados por cada resultado</p>
                                            </div>

                                            <div className="grid-layout mb-8">
                                                <div className="field-group">
                                                    <label className="wizard-label text-green-500">Victoria</label>
                                                    <input type="number" className="wizard-input text-center text-3xl font-black py-4" value={pointsWin} onChange={e => setPointsWin(Number(e.target.value))} />
                                                </div>
                                                <div className="field-group">
                                                    <label className="wizard-label">Empate</label>
                                                    <input type="number" className="wizard-input text-center text-3xl font-black py-4 text-[#aaa]" value={pointsDraw} onChange={e => setPointsDraw(Number(e.target.value))} />
                                                </div>
                                                <div className="field-group full-width md:full-width-none md:col-span-2 md:w-1/2 md:mx-auto mt-4">
                                                    <label className="wizard-label text-[#d32f2f]">Pérdida</label>
                                                    <input type="number" className="wizard-input text-center text-3xl font-black py-4" value={pointsLoss} onChange={e => setPointsLoss(Number(e.target.value))} />
                                                </div>
                                            </div>

                                            <div className="border border-[var(--carbon-border)] bg-[var(--carbon-surface)] p-6 rounded mb-8">
                                                <label className="checkbox-container !border-none !p-0 !bg-transparent mb-6">
                                                    <input type="checkbox" checked={useExtraTimePoints} onChange={e => setUseExtraTimePoints(e.target.checked)} />
                                                    <div className="checkmark"></div>
                                                    <span className="text-white font-semibold">Habilitar Puntos Diferentes por Prórroga / Penales</span>
                                                </label>

                                                {useExtraTimePoints && (
                                                    <div className="grid-layout pt-4 border-t border-[var(--carbon-border)] mt-4">
                                                        <div className="field-group">
                                                            <label className="wizard-label text-green-500">Victoria (Extra)</label>
                                                            <input type="number" className="wizard-input" value={pointsWinExtra} onChange={e => setPointsWinExtra(Number(e.target.value))} />
                                                        </div>
                                                        <div className="field-group">
                                                            <label className="wizard-label">Empate (Extra)</label>
                                                            <input type="number" className="wizard-input" value={pointsDrawExtra} onChange={e => setPointsDrawExtra(Number(e.target.value))} />
                                                        </div>
                                                    </div>
                                                )}
                                            </div>

                                            {isRugby && (
                                                <div className="border border-[var(--carbon-border)] bg-[var(--carbon-surface)] p-6 rounded">
                                                    <h4 className="wizard-label mb-6">Bonificaciones (Rugby)</h4>
                                                    <div className="flex flex-col gap-4">
                                                        <label className="checkbox-container !border-none !p-0 !bg-transparent">
                                                            <input type="checkbox" checked={allowBonusPoints} onChange={e => setAllowBonusPoints(e.target.checked)} />
                                                            <div className="checkmark"></div>
                                                            <span className="text-white font-semibold">Otorgar Puntos Bonus (según reglas del torneo)</span>
                                                        </label>
                                                    </div>
                                                </div>
                                            )}
                                        </div>

                                        {/* STEP 3: Tiebreakers & Columns */}
                                        <div className={`step-pane ${currentStep === 3 ? 'active' : ''}`}>
                                            <div className="section-header">
                                                <h1>Criterios de Desempate</h1>
                                                <p>Define cómo decidir empates y visualización de la tabla</p>
                                            </div>

                                            <div className="mb-12 wizard-sortable-container">
                                                <h4 className="wizard-label mb-4">Reglas de Desempate (Arrastrar para priorizar)</h4>
                                                <TiebreakerList items={tiebreakers} onChange={setTiebreakers} phaseType={phaseType} />
                                            </div>

                                            <div className="border-t border-[var(--carbon-border)] pt-8">
                                                <h4 className="wizard-label mb-4">Glosario de Columnas de Tabla</h4>
                                                <TableColumnSelector categories={columnCategories} selectedColumns={tableCols} onChange={setTableCols} />
                                            </div>
                                        </div>

                                        {/* STEP 4: Etiquetas */}
                                        <div className={`step-pane ${currentStep === 4 ? 'active' : ''}`}>
                                            <div className="section-header">
                                                <h1>Etiquetas de Grupo</h1>
                                                <p>Define clasificaciones especiales para resaltar posiciones</p>
                                            </div>

                                            <div className="flex gap-4 mb-8">
                                                <input type="text" className="wizard-input flex-1" value={newLabel} onChange={e => setNewLabel(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addLabel(); } }} placeholder="Ej: Clasifica a 8vos" />
                                                <button type="button" className="wizard-btn wizard-btn-primary" style={{ padding: '0 2rem' }} onClick={addLabel}>Añadir</button>
                                            </div>

                                            <div className="flex flex-col gap-3">
                                                {groupLabels.length === 0 ? (
                                                    <div className="text-center p-8 border border-dashed border-[var(--carbon-border)] text-[var(--text-dim)]">No hay etiquetas creadas</div>
                                                ) : (
                                                    groupLabels.map((label, i) => (
                                                        <div key={i} className="flex flex-col gap-3 p-4 border border-[var(--carbon-border)] rounded bg-[var(--carbon-surface)] relative">
                                                            <div className="flex justify-between items-center">
                                                                <div className="font-bold text-white uppercase text-sm flex items-center gap-2">
                                                                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: label.color }}></div>
                                                                    {label.name}
                                                                </div>
                                                                <button type="button" onClick={() => removeLabel(label.name)} className="text-[var(--text-dim)] hover:text-red-400 font-bold ml-auto p-1">✕</button>
                                                            </div>

                                                            <div className="flex items-center gap-4 mt-2">
                                                                <div className="flex bg-[var(--carbon-bg)] p-1 rounded-md">
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => updateLabelMode(label.name, 'auto')}
                                                                        className={`px-3 py-1 text-xs rounded transition-colors ${label.colorMode === 'auto' ? 'bg-[#333] text-white shadow' : 'text-[var(--text-dim)] hover:text-white'}`}
                                                                    >
                                                                        Color automático
                                                                    </button>
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => updateLabelMode(label.name, 'manual')}
                                                                        className={`px-3 py-1 text-xs rounded transition-colors ${label.colorMode === 'manual' ? 'bg-[#333] text-white shadow' : 'text-[var(--text-dim)] hover:text-white'}`}
                                                                    >
                                                                        Color manual
                                                                    </button>
                                                                </div>

                                                                {label.colorMode === 'manual' && (
                                                                    <div className="flex items-center gap-2">
                                                                        <input type="color" value={label.color} onChange={e => updateLabelColor(label.name, e.target.value)} className="w-8 h-8 rounded cursor-pointer border-0 bg-transparent p-0" />
                                                                        <input type="text" value={label.color} onChange={e => updateLabelColor(label.name, e.target.value)} className="w-20 bg-[var(--carbon-bg)] text-xs text-white border border-[var(--carbon-border)] rounded px-2 py-1 uppercase" maxLength={7} />
                                                                        <div className="flex gap-1 xl:gap-2 ml-4">
                                                                            {PRESET_COLORS.map(c => (
                                                                                <button key={c} type="button" onClick={() => updateLabelColor(label.name, c)} className={`w-5 h-5 rounded-full cursor-pointer hover:scale-110 transition-transform ${label.color === c ? 'ring-2 ring-white ring-offset-2 ring-offset-[var(--carbon-surface)]' : ''}`} style={{ backgroundColor: c }} title={c}></button>
                                                                            ))}
                                                                        </div>
                                                                    </div>
                                                                )}

                                                                {label.colorMode === 'auto' && (
                                                                    <div className="text-xs text-[var(--text-dim)] flex items-center gap-2">
                                                                        Color generado automáticamente por orden
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    ))
                                                )}
                                            </div>
                                        </div>

                                        {/* STEP 5: Stats */}
                                        <div className={`step-pane ${currentStep === 5 ? 'active' : ''}`}>
                                            <div className="section-header">
                                                <h1>Estadísticas</h1>
                                                <p>Configuración de estadísticas de jugadores</p>
                                            </div>

                                            <label className="checkbox-container">
                                                <input type="checkbox" checked={statsAssignment === 'starters'} onChange={e => setStatsAssignment(e.target.checked ? 'starters' : 'played')} />
                                                <div className="checkmark"></div>
                                                <div className="flex flex-col">
                                                    <span className="text-white font-semibold">Asignar estadísticas solo a titulares</span>
                                                    <span className="text-xs text-[var(--text-dim)] mt-1">Si está inactivo, se asignará a "Cualquiera que haya jugado".</span>
                                                </div>
                                            </label>
                                        </div>

                                        {/* Footer Actions */}
                                        <div className="wizard-footer-actions">
                                            <button type="button" className="wizard-btn wizard-btn-secondary" onClick={resetForm}>
                                                Cancelar
                                            </button>

                                            {currentStep > 1 && (
                                                <button type="button" className="wizard-btn wizard-btn-secondary ml-auto" onClick={() => setCurrentStep(c => c - 1)}>
                                                    ← Atrás
                                                </button>
                                            )}

                                            {currentStep < 5 && (
                                                <button type="button" className={`wizard-btn wizard-btn-primary ${currentStep === 1 ? 'ml-auto' : ''}`} onClick={() => {
                                                    // skip step 2 and 3 if knockout or playoff
                                                    if (currentStep === 1 && (phaseType === 'knockout' || phaseType === 'playoff')) {
                                                        setCurrentStep(4);
                                                    } else {
                                                        setCurrentStep(c => c + 1);
                                                    }
                                                }}>
                                                    Siguiente →
                                                </button>
                                            )}

                                            {currentStep === 5 && (
                                                <button type="submit" className="wizard-btn wizard-btn-primary" disabled={creating || validationErrors.some(err => err.includes('Debe haber'))}>
                                                    {creating ? 'Guardando...' : 'Guardar Fase'}
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </form>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}
