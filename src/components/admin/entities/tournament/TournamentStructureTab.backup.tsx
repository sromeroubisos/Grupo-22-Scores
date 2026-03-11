'use client';

import { useState, useEffect } from 'react';
import './basalt.css';
import '../club/vitreous-club.css';

interface Phase {
    id: string;
    tournament_id: string;
    name: string;
    phase_type: string;
    order_index: number;
    is_active: boolean;
    created_at: string;
    settings?: any;
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
    const [bonusOffensive, setBonusOffensive] = useState(isRugby);
    const [bonusDefensive, setBonusDefensive] = useState(isRugby);

    const [showAdvanced, setShowAdvanced] = useState(false);

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

    const [tiebreakers, setTiebreakers] = useState<Record<string, boolean>>({
        points: true,
        won: true,
        drawn: true,
        percentage: false,
        headToHead: true,
        pointsDiff: true,
        pointsFor: true,
        tries: isRugby,
    });

    // Player Stats assignment
    const [statsAssignment, setStatsAssignment] = useState<'played' | 'starters'>('played');

    // Group labels
    const [groupLabels, setGroupLabels] = useState<{ name: string, color: string }[]>([]);
    const [newLabel, setNewLabel] = useState('');

    const addLabel = () => {
        if (newLabel.trim() && !groupLabels.find(l => l.name === newLabel.trim())) {
            setGroupLabels([...groupLabels, { name: newLabel.trim(), color: '#60a5fa' }]);
            setNewLabel('');
        }
    };

    const removeLabel = (labelName: string) => {
        setGroupLabels(groupLabels.filter(l => l.name !== labelName));
    };

    const [creating, setCreating] = useState(false);

    const toggleCol = (col: string) => setTableCols(prev => ({ ...prev, [col]: !prev[col] }));
    const toggleTie = (col: string) => setTiebreakers(prev => ({ ...prev, [col]: !prev[col] }));

    const resetForm = () => {
        setPhaseName('');
        setPhaseType('league');
        setTeamsCount('');
        setAdvanceCount('');
        setLegs(1);
        setPointsWin(isRugby ? 4 : 3);
        setPointsDraw(isRugby ? 2 : 1);
        setPointsLoss(0);
        setBonusOffensive(isRugby);
        setBonusDefensive(isRugby);
        setShowAdvanced(false);
        setUseExtraTimePoints(false);
        setPointsWinExtra(2);
        setPointsDrawExtra(1);
        setPointsLossExtra(0);
        setStatsAssignment('played');
        setShowPhaseForm(false);
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
        setCreating(true);

        try {
            const response = await fetch(`/api/tournaments/${id}/phases`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: phaseName,
                    phase_type: phaseType,
                    order_index: phases.length + 1,
                    is_active: true,
                    settings: {
                        teamsCount: teamsCount === '' ? 0 : Number(teamsCount),
                        advanceCount: advanceCount === '' ? 0 : Number(advanceCount),
                        legs,
                        pointsSystem: (phaseType === 'league' || phaseType === 'group_stage') ? {
                            win: pointsWin,
                            draw: pointsDraw,
                            loss: pointsLoss,
                            useExtraTimePoints,
                            winExtra: pointsWinExtra,
                            drawExtra: pointsDrawExtra,
                            lossExtra: pointsLossExtra,
                            bonusOffensive,
                            bonusDefensive
                        } : null,
                        tableColumns: tableCols,
                        tiebreakers,
                        statsAssignment,
                        groupLabels
                    }
                }),
            });

            if (response.ok) {
                resetForm();
                await loadPhases();
            } else {
                alert('Error al crear fase');
            }
        } catch (error) {
            console.error('Error creating phase:', error);
            alert('Error al crear fase');
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
        <div className="flash-ui-container dark bg-transparent" style={{ '--accent': '#3b82f6', minHeight: 'auto' } as React.CSSProperties}>
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-500 pb-20">
                {loading ? (
                    <div className="manager-card">
                        <div className="p-12 text-center text-[#888]">Cargando la estructura del torneo...</div>
                    </div>
                ) : (
                    <>
                        {/* Render phases as cards */}
                        {phases.length > 0 ? (
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

                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                    {phases.map((phase, index) => (
                                        <div key={phase.id} className="relative group p-6 border border-[var(--border)] bg-[rgba(255,255,255,0.02)] hover:bg-[rgba(255,255,255,0.04)] transition-all duration-300 rounded">
                                            <button
                                                onClick={() => handleDeletePhase(phase.id)}
                                                className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 p-2 rounded hover:bg-red-500/10 text-[#888] hover:text-red-400 transition-all duration-200"
                                                title="Eliminar fase"
                                            >
                                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
                                            </button>

                                            <div className="font-mono text-[10px] text-[#888] uppercase tracking-widest mb-2">
                                                Fase {index + 1}
                                            </div>
                                            <h3 className="text-lg font-bold text-white mb-3 pr-8">
                                                {phase.name}
                                            </h3>

                                            <div className="space-y-2 text-sm text-[#888]">
                                                <div className="flex items-center gap-2">
                                                    <div className="w-1.5 h-1.5 rounded-full bg-[var(--accent)]"></div>
                                                    <span>{getPhaseTypeLabel(phase.phase_type)}</span>
                                                </div>
                                                {phase.settings?.teamsCount > 0 && (
                                                    <div className="flex items-center gap-2">
                                                        <div className="w-1.5 h-1.5 rounded-full bg-[#888]"></div>
                                                        <span>{phase.settings.teamsCount} Equipos</span>
                                                    </div>
                                                )}
                                                {phase.settings?.legs && (
                                                    <div className="flex items-center gap-2">
                                                        <div className="w-1.5 h-1.5 rounded-full bg-[#888]"></div>
                                                        <span>{phase.settings.legs === 2 ? 'Ida y Vuelta' : 'Partido Único'}</span>
                                                    </div>
                                                )}
                                                {phase.settings?.advanceCount > 0 && (
                                                    <div className="flex items-center gap-2 text-green-500">
                                                        <div className="w-1.5 h-1.5 rounded-full bg-green-500"></div>
                                                        <span>{phase.settings.advanceCount} Avanzan</span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ) : !showPhaseForm ? (
                            <div className="manager-card">
                                <div className="flex flex-col items-center justify-center py-24 px-6">
                                    <div className="text-7xl mb-8 opacity-20">📋</div>
                                    <h3 className="text-2xl font-bold text-white mb-4">No hay fases configuradas</h3>
                                    <p className="text-sm text-[#888] mb-10 max-w-lg text-center leading-relaxed">
                                        Este torneo aún no tiene fases. Comienza agregando la primera fase para organizar el modo de competencia.
                                    </p>
                                    <button
                                        className="manager-btn-inline"
                                        style={{ padding: '14px 32px', fontSize: '14px', fontWeight: '600' }}
                                        onClick={() => setShowPhaseForm(true)}
                                    >
                                        + Agregar Primera Fase
                                    </button>
                                </div>
                            </div>
                        ) : null}

                        {/* Agregar Fase Form */}
                        {showPhaseForm && (
                            <form onSubmit={handleCreatePhase} className="manager-card">
                                <header className="manager-header">
                                    <div className="manager-header-titles">
                                        <h1>Nueva Fase</h1>
                                        <p>Configura los parámetros básicos de la fase competitiva</p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={resetForm}
                                        className="manager-btn-inline secondary"
                                        style={{ padding: '8px 16px', fontSize: '12px' }}
                                    >
                                        Cancelar
                                    </button>
                                </header>

                                {/* Basic Configuration */}
                                <div className="mb-8">
                                    <h3 className="text-xs uppercase tracking-widest text-[#888] font-bold mb-4">Configuración Básica</h3>
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                        <div className="manager-input-group">
                                            <label className="manager-field-label">Nombre de la Fase *</label>
                                            <input
                                                type="text"
                                                className="manager-url-input text-sm"
                                                value={phaseName}
                                                onChange={(e) => setPhaseName(e.target.value)}
                                                placeholder="Ej: Fase Regular"
                                                required
                                                autoFocus
                                            />
                                        </div>
                                        <div className="manager-input-group">
                                            <label className="manager-field-label">Tipo de Fase</label>
                                            <select
                                                className="manager-url-select text-sm"
                                                value={phaseType}
                                                onChange={(e) => setPhaseType(e.target.value as any)}
                                            >
                                                <option value="league">Liga (Round-Robin)</option>
                                                <option value="group_stage">Fase de Grupos</option>
                                                <option value="knockout">Eliminación Directa</option>
                                                <option value="playoff">Playoffs</option>
                                            </select>
                                        </div>
                                        <div className="manager-input-group">
                                            <label className="manager-field-label">Formato de Partidos</label>
                                            <select
                                                className="manager-url-select text-sm"
                                                value={legs}
                                                onChange={(e) => setLegs(Number(e.target.value) as 1 | 2)}
                                            >
                                                <option value={1}>Partido Único</option>
                                                <option value={2}>Ida y Vuelta</option>
                                            </select>
                                        </div>
                                    </div>
                                </div>

                                {/* Teams Configuration */}
                                <div className="mb-8">
                                    <h3 className="text-xs uppercase tracking-widest text-[#888] font-bold mb-4">Equipos</h3>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div className="manager-input-group">
                                            <label className="manager-field-label">Cantidad de Equipos</label>
                                            <input
                                                type="number"
                                                className="manager-url-input text-sm"
                                                value={teamsCount}
                                                onChange={(e) => setTeamsCount(e.target.value ? Number(e.target.value) : '')}
                                                placeholder="Ej: 12"
                                                min="2"
                                            />
                                        </div>
                                        <div className="manager-input-group">
                                            <label className="manager-field-label">
                                                Equipos que Avanzan <span className="text-[10px] text-[#666]">(Opcional)</span>
                                            </label>
                                            <input
                                                type="number"
                                                className="manager-url-input text-sm"
                                                value={advanceCount}
                                                onChange={(e) => setAdvanceCount(e.target.value ? Number(e.target.value) : '')}
                                                placeholder="Ej: 4"
                                                min="1"
                                            />
                                        </div>
                                    </div>
                                </div>

                                {(phaseType === 'league' || phaseType === 'group_stage') && (
                                    <>
                                        <div className="mb-8 p-6 border border-[var(--border)] bg-[rgba(255,255,255,0.02)] rounded">
                                            <h3 className="text-xs uppercase tracking-widest text-[#888] font-bold mb-6">Puntos por Resultado</h3>

                                            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                                                <div className="flex flex-col gap-2">
                                                    <label className="text-[10px] text-green-500 font-bold tracking-widest uppercase">Victoria</label>
                                                    <input
                                                        type="number"
                                                        className="bg-transparent border-none text-4xl leading-none p-0 focus:ring-0 font-black text-white w-full outline-none"
                                                        value={pointsWin}
                                                        onChange={e => setPointsWin(Number(e.target.value))}
                                                    />
                                                </div>
                                                <div className="flex flex-col gap-2">
                                                    <label className="text-[10px] text-white font-bold tracking-widest uppercase">Empate</label>
                                                    <input
                                                        type="number"
                                                        className="bg-transparent border-none text-4xl leading-none p-0 focus:ring-0 font-black text-white w-full outline-none"
                                                        value={pointsDraw}
                                                        onChange={e => setPointsDraw(Number(e.target.value))}
                                                    />
                                                </div>
                                                <div className="flex flex-col gap-2">
                                                    <label className="text-[10px] text-red-500 font-bold tracking-widest uppercase">Pérdida</label>
                                                    <input
                                                        type="number"
                                                        className="bg-transparent border-none text-4xl leading-none p-0 focus:ring-0 font-black text-white w-full outline-none"
                                                        value={pointsLoss}
                                                        onChange={e => setPointsLoss(Number(e.target.value))}
                                                    />
                                                </div>
                                            </div>

                                            {isRugby && (
                                                <div className="mt-6 pt-6 border-t border-[var(--border)]">
                                                    <div className="text-[10px] text-[#888] font-bold tracking-widest uppercase mb-3">Bonificaciones Rugby</div>
                                                    <div className="flex flex-wrap gap-4">
                                                        <label className="cursor-pointer flex items-center gap-2 select-none text-sm text-white">
                                                            <input
                                                                type="checkbox"
                                                                className="w-4 h-4 rounded border-[var(--border)] bg-transparent checked:bg-[var(--accent)] focus:ring-0 focus:ring-offset-0"
                                                                checked={bonusOffensive}
                                                                onChange={e => setBonusOffensive(e.target.checked)}
                                                            />
                                                            Bonus Ofensivo (Tries)
                                                        </label>
                                                        <label className="cursor-pointer flex items-center gap-2 select-none text-sm text-white">
                                                            <input
                                                                type="checkbox"
                                                                className="w-4 h-4 rounded border-[var(--border)] bg-transparent checked:bg-[var(--accent)] focus:ring-0 focus:ring-offset-0"
                                                                checked={bonusDefensive}
                                                                onChange={e => setBonusDefensive(e.target.checked)}
                                                            />
                                                            Bonus Defensivo
                                                        </label>
                                                    </div>
                                                </div>
                                            )}
                                        </div>

                                        <div className="mb-8 w-full">
                                            <button
                                                type="button"
                                                onClick={() => setShowAdvanced(!showAdvanced)}
                                                className="text-xs text-[#888] hover:text-white uppercase tracking-widest font-bold flex items-center gap-2 transition-colors"
                                            >
                                                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className={`transition-transform duration-200 ${showAdvanced ? 'rotate-180' : ''}`}>
                                                    <polyline points="6 9 12 15 18 9"></polyline>
                                                </svg>
                                                Opciones Avanzadas
                                            </button>

                                            {showAdvanced && (
                                                <div className="mt-8 space-y-6">

                                                    {/* Prorroga */}
                                                    <div className="p-6 border border-[var(--border)] bg-[rgba(255,255,255,0.02)] rounded">
                                                        <label className="cursor-pointer flex items-start gap-3 select-none text-sm text-white mb-4">
                                                            <input
                                                                type="checkbox"
                                                                className="w-4 h-4 mt-0.5 rounded border-[var(--border)] bg-transparent checked:bg-[var(--accent)] focus:ring-0 focus:ring-offset-0"
                                                                checked={useExtraTimePoints}
                                                                onChange={e => setUseExtraTimePoints(e.target.checked)}
                                                            />
                                                            <div>
                                                                <div className="font-bold mb-1">Puntos por Prórroga</div>
                                                                <div className="text-xs text-[#888]">Puntaje diferenciado para resultados en tiempo extra</div>
                                                            </div>
                                                        </label>

                                                        {useExtraTimePoints && (
                                                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4 mt-4 border-t border-[var(--border)]">
                                                                <div className="flex flex-col gap-2">
                                                                    <label className="text-[10px] text-green-500 font-bold tracking-widest uppercase">Victoria (Extra)</label>
                                                                    <input
                                                                        type="number"
                                                                        className="bg-transparent border-none text-3xl leading-none p-0 focus:ring-0 font-black text-white w-full outline-none"
                                                                        value={pointsWinExtra}
                                                                        onChange={e => setPointsWinExtra(Number(e.target.value))}
                                                                    />
                                                                </div>
                                                                <div className="flex flex-col gap-2">
                                                                    <label className="text-[10px] text-white font-bold tracking-widest uppercase">Empate (Extra)</label>
                                                                    <input
                                                                        type="number"
                                                                        className="bg-transparent border-none text-3xl leading-none p-0 focus:ring-0 font-black text-white w-full outline-none"
                                                                        value={pointsDrawExtra}
                                                                        onChange={e => setPointsDrawExtra(Number(e.target.value))}
                                                                    />
                                                                </div>
                                                                <div className="flex flex-col gap-2">
                                                                    <label className="text-[10px] text-red-500 font-bold tracking-widest uppercase">Pérdida (Extra)</label>
                                                                    <input
                                                                        type="number"
                                                                        className="bg-transparent border-none text-3xl leading-none p-0 focus:ring-0 font-black text-white w-full outline-none"
                                                                        value={pointsLossExtra}
                                                                        onChange={e => setPointsLossExtra(Number(e.target.value))}
                                                                    />
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>

                                                    {/* Estadísticas asignación */}
                                                    <div className="p-6 border border-[var(--border)] bg-[rgba(255,255,255,0.02)] rounded">
                                                        <h4 className="text-xs uppercase tracking-widest text-[#888] font-bold mb-4">Estadísticas de Jugadores</h4>
                                                        <p className="text-xs text-[#888] mb-4">Asignar stats del equipo a jugadores por:</p>

                                                        <div className="flex flex-col gap-2">
                                                            <label className="cursor-pointer flex items-center gap-3 select-none text-sm text-white p-2 rounded hover:bg-[rgba(255,255,255,0.03)] transition-colors">
                                                                <input
                                                                    type="radio"
                                                                    name="statsAssignment"
                                                                    className="w-4 h-4 border-[var(--border)] bg-transparent checked:bg-[var(--accent)] focus:ring-0 focus:ring-offset-0"
                                                                    checked={statsAssignment === 'played'}
                                                                    onChange={() => setStatsAssignment('played')}
                                                                />
                                                                Todos los que jugaron
                                                            </label>
                                                            <label className="cursor-pointer flex items-center gap-3 select-none text-sm text-white p-2 rounded hover:bg-[rgba(255,255,255,0.03)] transition-colors">
                                                                <input
                                                                    type="radio"
                                                                    name="statsAssignment"
                                                                    className="w-4 h-4 border-[var(--border)] bg-transparent checked:bg-[var(--accent)] focus:ring-0 focus:ring-offset-0"
                                                                    checked={statsAssignment === 'starters'}
                                                                    onChange={() => setStatsAssignment('starters')}
                                                                />
                                                                Solo titulares
                                                            </label>
                                                        </div>
                                                    </div>

                                                    {/* Columnas de la tabla */}
                                                    <div className="p-6 border border-[var(--border)] bg-[rgba(255,255,255,0.02)] rounded">
                                                        <h4 className="text-xs uppercase tracking-widest text-[#888] font-bold mb-4">Columnas de la Tabla</h4>
                                                        <p className="text-xs text-[#888] mb-4">Selecciona las columnas visibles en la tabla de posiciones</p>

                                                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                                                            {[
                                                                { id: 'posVariation', label: 'Variación' },
                                                                { id: 'points', label: 'Puntos' },
                                                                { id: 'won', label: 'Victorias' },
                                                                { id: 'drawn', label: 'Empates' },
                                                                { id: 'lost', label: 'Derrotas' },
                                                                { id: 'played', label: 'Jugados' },
                                                                { id: 'extraWon', label: 'Victorias (Prórroga)' },
                                                                { id: 'extraDrawn', label: 'Empates (Prórroga)' },
                                                                { id: 'extraLost', label: 'Derrotas (Prórroga)' },
                                                                { id: 'extraPlayed', label: 'Jugados (Prórroga)' },
                                                                { id: 'percentage', label: 'Porcentaje' },
                                                                { id: 'classification', label: 'Clasificación' },
                                                                { id: 'pointsFor', label: 'A Favor' },
                                                                { id: 'pointsAgainst', label: 'En Contra' },
                                                                { id: 'pointsDiff', label: 'Diferencia' },
                                                                ...(isRugby ? [
                                                                    { id: 'tries', label: 'Try' },
                                                                    { id: 'conversions', label: 'Conversión' },
                                                                    { id: 'penalties', label: 'Penal' },
                                                                    { id: 'dropGoals', label: 'Drop Goal' },
                                                                    { id: 'tackles', label: 'Tackle' },
                                                                    { id: 'runs', label: 'Carrera' }
                                                                ] : [])
                                                            ].map(col => (
                                                                <label key={col.id} className="cursor-pointer flex items-center gap-2 select-none text-xs text-white p-2 rounded hover:bg-[rgba(255,255,255,0.03)] transition-colors">
                                                                    <input
                                                                        type="checkbox"
                                                                        className="w-4 h-4 rounded border-[var(--border)] bg-transparent checked:bg-[var(--accent)] focus:ring-0 focus:ring-offset-0"
                                                                        checked={tableCols[col.id] || false}
                                                                        onChange={() => toggleCol(col.id)}
                                                                    />
                                                                    <span className="truncate">{col.label}</span>
                                                                </label>
                                                            ))}
                                                        </div>
                                                    </div>

                                                    {/* Tiebreakers */}
                                                    <div className="p-6 border border-[var(--border)] bg-[rgba(255,255,255,0.02)] rounded">
                                                        <h4 className="text-xs uppercase tracking-widest text-[#888] font-bold mb-4">Criterios de Desempate</h4>
                                                        <p className="text-xs text-[#888] mb-4">Criterios para desempatar equipos con igual puntaje</p>

                                                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                                                            {[
                                                                { id: 'points', label: 'Puntos' },
                                                                { id: 'won', label: 'Victorias' },
                                                                { id: 'drawn', label: 'Empates' },
                                                                { id: 'percentage', label: 'Porcentaje' },
                                                                { id: 'headToHead', label: 'Enfrentamiento' },
                                                                { id: 'pointsDiff', label: 'Dif. Puntos' },
                                                                { id: 'pointsFor', label: 'A Favor' },
                                                                ...(isRugby ? [
                                                                    { id: 'tries', label: 'Try' },
                                                                    { id: 'conversions', label: 'Conversión' },
                                                                ] : [])
                                                            ].map(tb => (
                                                                <label key={tb.id} className="cursor-pointer flex items-center gap-2 select-none text-xs text-white p-2 rounded hover:bg-[rgba(255,255,255,0.03)] transition-colors">
                                                                    <input
                                                                        type="checkbox"
                                                                        className="w-4 h-4 rounded border-[var(--border)] bg-transparent checked:bg-[var(--accent)] focus:ring-0 focus:ring-offset-0"
                                                                        checked={(tiebreakers as any)[tb.id] || false}
                                                                        onChange={() => toggleTie(tb.id)}
                                                                    />
                                                                    <span className="truncate">{tb.label}</span>
                                                                </label>
                                                            ))}
                                                        </div>
                                                    </div>

                                                    {/* Etiquetas de grupo */}
                                                    <div className="p-6 border border-[var(--border)] bg-[rgba(255,255,255,0.02)] rounded">
                                                        <h4 className="text-xs uppercase tracking-widest text-[#888] font-bold mb-2">Etiquetas de Grupo</h4>
                                                        <p className="text-xs text-[#888] mb-4">Resalta zonas en la tabla (clasificación, descenso, etc.)</p>

                                                        <div className="flex gap-2 mb-4">
                                                            <input
                                                                type="text"
                                                                value={newLabel}
                                                                onChange={(e) => setNewLabel(e.target.value)}
                                                                onKeyDown={(e) => {
                                                                    if (e.key === 'Enter') {
                                                                        e.preventDefault();
                                                                        addLabel();
                                                                    }
                                                                }}
                                                                placeholder="Ej: Clasifica a Playoffs"
                                                                className="manager-url-input text-xs flex-1"
                                                            />
                                                            <button
                                                                type="button"
                                                                onClick={addLabel}
                                                                className="manager-btn-inline secondary"
                                                                style={{ padding: '8px 16px', fontSize: '11px' }}
                                                            >
                                                                Agregar
                                                            </button>
                                                        </div>

                                                        {groupLabels.length === 0 ? (
                                                            <div className="py-6 border border-dashed border-[var(--border)] rounded text-center">
                                                                <span className="text-xs text-[#666] uppercase tracking-widest">No hay etiquetas</span>
                                                            </div>
                                                        ) : (
                                                            <div className="flex flex-col gap-2">
                                                                {groupLabels.map((label, index) => (
                                                                    <div key={index} className="flex justify-between items-center border border-[var(--border)] rounded px-3 py-2 hover:bg-[rgba(255,255,255,0.02)] transition-colors">
                                                                        <div className="flex items-center gap-2">
                                                                            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: label.color }}></div>
                                                                            <span className="text-xs text-white">{label.name}</span>
                                                                        </div>
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => removeLabel(label.name)}
                                                                            className="text-[#666] hover:text-red-400 transition-colors"
                                                                            title="Eliminar"
                                                                        >
                                                                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
                                                                        </button>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </>
                                )}

                                <div className="flex justify-end gap-4 mt-8 pt-6 border-t border-[var(--border)]">
                                    <button
                                        type="submit"
                                        className="manager-btn-inline"
                                        style={{ padding: '12px 24px', fontSize: '14px' }}
                                        disabled={creating}
                                    >
                                        {creating ? 'Guardando...' : 'Guardar Fase'}
                                    </button>
                                </div>
                            </form>
                        )}

                        {/* Add Phase Button */}
                        {phases.length > 0 && !showPhaseForm && (
                            <div className="flex justify-center mt-8">
                                <button
                                    className="manager-btn-inline secondary"
                                    style={{ padding: '12px 24px', fontSize: '14px' }}
                                    onClick={() => setShowPhaseForm(true)}
                                >
                                    + Agregar Siguiente Fase
                                </button>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}
