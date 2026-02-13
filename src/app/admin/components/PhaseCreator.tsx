'use client';

import React, { useState, useRef } from 'react';
import {
    ChevronRight,
    PlayCircle,
    LayoutGrid,
    ListOrdered,
    GitMerge,
    Calendar,
    MapPin,
    UploadCloud,
    Check,
    AlertTriangle,
    Info,
    ArrowLeft,
    GripVertical,
    X,
    Plus,
    FileSpreadsheet,
    Loader2,
    Users,
    Tag,
    Eye,
    Search
} from 'lucide-react';
import styles from './PhaseCreator.module.css';



interface Criterion {
    id: string;
    text: string;
    value: string;
}

interface StandingsTag {
    id: string;
    fromPosition: number;
    toPosition: number;
    label: string;
    color: string;
}

interface FixtureMatch {
    id: number;
    round: number;
    home: string;
    away: string;
    date: string;
    time: string;
    venue: string;
}

export interface Team {
    id: string;
    name: string;
    short: string;
    color: string;
}

export interface PhaseConfiguration {
    phaseType: string;
    config: any;
    selectedTeamIds: string[];
    fixtureData: FixtureMatch[];
    isFixtureGenerated: boolean;
    activeCriteria: Criterion[];
    tags: StandingsTag[];
    groupAssignments: Record<string, number>;
}

interface PhaseCreatorProps {
    phaseIndex?: number;
    totalPhases?: number;
    teams?: Team[];
    initialConfig?: PhaseConfiguration | null;
    onNext?: (config: PhaseConfiguration) => void;
    onPrev?: () => void;
    onSaveDraft?: (config: PhaseConfiguration) => void;
}

const AVAILABLE_CRITERIA: Criterion[] = [
    { id: 'points', text: 'Puntos obtenidos', value: 'points_table' },
    { id: 'h2h', text: 'Resultados entre sí (Head-to-head)', value: 'head_to_head' },
    { id: 'diff_points', text: 'Diferencia de Tantos', value: 'points_diff' },
    { id: 'diff_tries', text: 'Diferencia de Tries', value: 'tries_diff' },
    { id: 'points_for', text: 'Tantos a Favor', value: 'points_for' },
    { id: 'tries_for', text: 'Tries a Favor', value: 'tries_for' },
    { id: 'red_cards', text: 'Menos tarjetas rojas', value: 'red_cards' },
    { id: 'toss', text: 'Sorteo', value: 'coin_toss' },
];

const MOCK_FIXTURE: FixtureMatch[] = [
    { id: 1, round: 1, home: 'Team A', away: 'Team B', date: '2024-03-02', time: '16:00', venue: 'Stadium' },
    { id: 2, round: 1, home: 'Team C', away: 'Team D', date: '2024-03-02', time: '18:30', venue: 'Stadium' },
];

export default function PhaseCreator({
    phaseIndex = 1,
    totalPhases = 3,
    teams = [],
    initialConfig,
    onNext,
    onPrev,
    onSaveDraft
}: PhaseCreatorProps) {
    const [activeTab, setActiveTab] = useState('config');
    const [phaseType, setPhaseType] = useState(initialConfig?.phaseType || 'groups');

    // File Upload State
    const [fixtureFile, setFixtureFile] = useState<File | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isGenerating, setIsGenerating] = useState(false);
    const [isFixtureGenerated, setIsFixtureGenerated] = useState(initialConfig?.isFixtureGenerated || false);
    const [fixtureData, setFixtureData] = useState<FixtureMatch[]>(initialConfig?.fixtureData || []);

    // Criteria State
    const [activeCriteria, setActiveCriteria] = useState<Criterion[]>(initialConfig?.activeCriteria || [
        { id: 'points', text: 'Puntos obtenidos', value: 'points_table' },
        { id: 'diff_points', text: 'Diferencia de Tantos', value: 'points_diff' }
    ]);
    const [draggedItem, setDraggedItem] = useState<number | null>(null);

    // Custom Criterion State
    const [customCriterionName, setCustomCriterionName] = useState('');
    const [showCustomInput, setShowCustomInput] = useState(false);

    // Teams Selection State
    const [showTeamSelector, setShowTeamSelector] = useState(false);
    const [selectedTeamIds, setSelectedTeamIds] = useState<string[]>(initialConfig?.selectedTeamIds || []);
    const [teamSearch, setTeamSearch] = useState('');

    // Create Team State
    const [showCreateTeam, setShowCreateTeam] = useState(false);
    const [newTeamData, setNewTeamData] = useState({
        name: '',
        short: '',
        color: '#1a73e8',
        city: ''
    });

    // Group Manual Assignments: Record<string teamId, number groupIndexs>
    const [groupAssignments, setGroupAssignments] = useState<Record<string, number>>(initialConfig?.groupAssignments || {});


    // Match Editing State
    const [editingMatch, setEditingMatch] = useState<FixtureMatch | null>(null);

    const handleSaveMatch = () => {
        if (!editingMatch) return;
        setFixtureData(prev => prev.map(m => m.id === editingMatch.id ? editingMatch : m));
        setEditingMatch(null);
    };

    // Config Configuration State
    const [config, setConfig] = useState<{
        groupsCount: number;
        teamsPerGroup: number;
        qualifiersPerGroup: number;
        pointsWin: string;
        pointsDraw: string;
        pointsBonusTry: string;
        pointsBonusLoss: string;
        leagueRounds?: number;
        playoffThirdPlace?: boolean;
    }>(initialConfig?.config || {
        groupsCount: 4,
        teamsPerGroup: 5,
        qualifiersPerGroup: 2,
        pointsWin: '4',
        pointsDraw: '2',
        pointsBonusTry: '+1',
        pointsBonusLoss: '+1',
        leagueRounds: 1,
        playoffThirdPlace: false
    });

    const handleConfigChange = (field: string, value: string | number | boolean) => {
        setConfig(prev => ({ ...prev, [field]: value }));
    };

    // Standings Tags State
    const [tags, setTags] = useState<StandingsTag[]>(initialConfig?.tags || [
        { id: '1', fromPosition: 1, toPosition: 2, label: 'Clasifica a Cuartos', color: '#00a365' }
    ]);

    // Fixture Generation Config
    const [fixtureSettings, setFixtureSettings] = useState({
        frequencyCode: 'weekly', // weekly, biweekly, daily
        venueMode: 'classic'     // classic (alternated), neutral
    });

    // --- Actions ---

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setFixtureFile(e.target.files[0]);
            setIsFixtureGenerated(true);
            setFixtureData(MOCK_FIXTURE);
        }
    };

    const handleGenerateFixture = () => {
        setIsGenerating(true);

        // 1. Get Selected Teams
        const selectedTeams = teams.filter(t => selectedTeamIds.includes(t.id));

        // 2. Distribute into Groups (Using Assignments or Auto)
        const isLeague = phaseType === 'league';
        const safeGroupsCount = isLeague ? 1 : (config.groupsCount || 1);
        const groups: Team[][] = Array.from({ length: safeGroupsCount }, () => []);

        // Initial distribution only if assignments are empty or mismatch
        let currentAssignments = { ...groupAssignments };
        const hasAssignments = Object.keys(currentAssignments).length > 0;

        if (!hasAssignments) {
            selectedTeams.forEach((team, index) => {
                const groupIndex = index % safeGroupsCount;
                currentAssignments[team.id] = groupIndex;
            });
            // Update state silently if we were just clicking generate, 
            // but ideally we should have set this earlier. 
            // We'll proceed with these assignments for generation.
            setGroupAssignments(currentAssignments);
        }

        // Fill groups array based on assignments
        selectedTeams.forEach(team => {
            const gIdx = currentAssignments[team.id] ?? (selectedTeams.indexOf(team) % safeGroupsCount); // Fallback
            if (groups[gIdx]) {
                groups[gIdx].push(team);
            } else {
                // If assigned group is out of bounds (e.g. reduced group count), put in 0
                groups[0]?.push(team);
            }
        });

        // 3. Generate Matches
        const generatedMatches: FixtureMatch[] = [];
        let matchIdCounter = 1;
        const startDate = new Date('2024-03-02'); // Mock start date

        // Determine days increment
        let daysIncrement = 7;
        if (fixtureSettings.frequencyCode === 'daily') daysIncrement = 1;
        if (fixtureSettings.frequencyCode === 'biweekly') daysIncrement = 14;

        groups.forEach((groupTeams) => {
            const teamsList = [...groupTeams];
            if (teamsList.length < 2) return;

            // Add dummy if odd number of teams
            if (teamsList.length % 2 !== 0) {
                teamsList.push({ id: '-1', name: 'BYE', short: '-', color: '#000' });
            }

            const totalTeams = teamsList.length;
            const roundsPerLeg = totalTeams - 1;
            const matchesPerRound = totalTeams / 2;
            const numLegs = (isLeague && config.leagueRounds === 2) ? 2 : 1;

            // Temporary storage for this group's matches
            const groupLeg1Matches: FixtureMatch[] = [];

            // --- Generate First Leg ---
            let currentTeamsOrder = [...teamsList];

            for (let round = 0; round < roundsPerLeg; round++) {
                const roundNum = round + 1;

                for (let match = 0; match < matchesPerRound; match++) {
                    let home = currentTeamsOrder[match];
                    let away = currentTeamsOrder[totalTeams - 1 - match];

                    // Classic Alternation Logic for Leg 1
                    if (fixtureSettings.venueMode === 'classic' && round % 2 === 1) {
                        const temp = home;
                        home = away;
                        away = temp;
                    }

                    if (home.id !== '-1' && away.id !== '-1') {
                        groupLeg1Matches.push({
                            id: 0, // temp
                            round: roundNum,
                            home: home.name,
                            away: away.name,
                            date: '', // assigned later
                            time: '16:00',
                            venue: fixtureSettings.venueMode === 'neutral' ? 'Sede Neutral' : 'TBD'
                        });
                    }
                }
                // Rotate teams
                currentTeamsOrder.splice(1, 0, currentTeamsOrder.pop()!);
            }

            // --- Generate Final List (Leg 1 + Leg 2) ---
            const allGroupMatches = [...groupLeg1Matches];

            if (numLegs === 2) {
                // Generate Second Leg: Same matchups, inverted H/A, later rounds
                groupLeg1Matches.forEach(m => {
                    allGroupMatches.push({
                        ...m,
                        round: m.round + roundsPerLeg,
                        home: m.away,
                        away: m.home
                    });
                });
            }

            // --- Assign Dates and Global IDs ---
            allGroupMatches.sort((a, b) => a.round - b.round).forEach(m => {
                m.id = matchIdCounter++;

                // Calculate date
                const roundIndex = m.round - 1;
                const d = new Date(startDate);
                d.setDate(startDate.getDate() + (roundIndex * daysIncrement));
                m.date = d.toISOString().split('T')[0];

                generatedMatches.push(m);
            });
        });

        setTimeout(() => {
            setIsGenerating(false);
            setIsFixtureGenerated(true);
            setFixtureData(generatedMatches);
        }, 800);
    };

    const handleManualFixture = () => {
        setIsGenerating(true);
        setTimeout(() => {
            setIsGenerating(false);
            setIsFixtureGenerated(true);
            setFixtureData([]); // Initialize empty for manual entry
        }, 600);
    };

    // Helper to get teams for preview (All Groups)
    const getPreviewGroups = () => {
        // Guard against division by zero or invalid config
        const safeGroupCount = Math.max(1, Number(config.groupsCount) || 1);

        const groups: { index: number, teams: Team[] }[] = [];
        const selectedTeams = teams.filter(t => selectedTeamIds.includes(t.id));

        for (let i = 0; i < safeGroupCount; i++) {
            groups.push({ index: i, teams: [] });
        }

        // If assignment map is active, use it. Else auto-assign initially.
        selectedTeams.forEach((team, autoIndex) => {
            const assignedGroup = groupAssignments[team.id] ?? (autoIndex % safeGroupCount);
            // Ensure group exists
            const targetGroup = groups[assignedGroup] ? assignedGroup : 0;
            groups[targetGroup].teams.push(team);
        });

        return groups;
    };

    const handleMoveTeam = (teamId: string, newGroupIndex: number) => {
        if (newGroupIndex < 0 || newGroupIndex >= config.groupsCount) return;
        setGroupAssignments(prev => ({
            ...prev,
            [teamId]: newGroupIndex
        }));
    };

    const getTagColor = (rank: number) => {
        const tag = tags.find(t => rank >= t.fromPosition && rank <= t.toPosition);
        return tag ? tag.color : undefined;
    };

    const getCurrentConfig = (): PhaseConfiguration => ({
        phaseType,
        config,
        selectedTeamIds,
        fixtureData,
        isFixtureGenerated,
        activeCriteria,
        tags,
        groupAssignments
    });

    const removeCriterion = (indexToRemove: number) => {
        setActiveCriteria(prev => prev.filter((_, idx) => idx !== indexToRemove));
    };

    const addCriterion = (criterion: Criterion) => {
        if (!activeCriteria.find(c => c.id === criterion.id)) {
            setActiveCriteria(prev => [...prev, criterion]);
        }
    };

    const handleAddCustomCriterion = () => {
        if (!customCriterionName.trim()) return;
        const newCriterion: Criterion = {
            id: `custom_${Date.now()}`,
            text: customCriterionName,
            value: 'custom'
        };
        setActiveCriteria(prev => [...prev, newCriterion]);
        setCustomCriterionName('');
        setShowCustomInput(false);
    };

    const handleAddTag = () => {
        const newTag: StandingsTag = {
            id: Date.now().toString(),
            fromPosition: 0,
            toPosition: 0,
            label: 'Nueva Etiqueta',
            color: '#ffffff'
        };
        setTags([...tags, newTag]);
    };

    const updateTag = (id: string, field: keyof StandingsTag, value: any) => {
        setTags(tags.map(t => {
            if (t.id !== id) return t;

            // Handle number fields specially to avoid NaN
            if (field === 'fromPosition' || field === 'toPosition') {
                const numValue = parseInt(value);
                return { ...t, [field]: isNaN(numValue) ? 1 : numValue };
            }

            return { ...t, [field]: value };
        }));
    };

    const removeTag = (id: string) => {
        setTags(tags.filter(t => t.id !== id));
    };

    // Drag and Drop Logic
    const handleDragStart = (index: number) => {
        setDraggedItem(index);
    };

    const handleDragOver = (e: React.DragEvent, index: number) => {
        e.preventDefault();
        if (draggedItem === null) return;
        if (draggedItem !== index) {
            const newCriteria = [...activeCriteria];
            const item = newCriteria[draggedItem];
            newCriteria.splice(draggedItem, 1);
            newCriteria.splice(index, 0, item);
            setActiveCriteria(newCriteria);
            setDraggedItem(index);
        }
    };

    const handleDragEnd = () => {
        setDraggedItem(null);
    };

    // Team Selection Logic
    const toggleTeam = (teamId: string) => {
        setSelectedTeamIds(prev =>
            prev.includes(teamId) ? prev.filter(id => id !== teamId) : [...prev, teamId]
        );
    };

    const filteredTeams = teams.filter(t =>
        t.name.toLowerCase().includes(teamSearch.toLowerCase()) ||
        t.short.toLowerCase().includes(teamSearch.toLowerCase())
    );

    const handleCreateTeam = () => {
        if (!newTeamData.name.trim() || !newTeamData.short.trim()) {
            alert('Por favor completa el nombre y nombre corto del equipo');
            return;
        }

        // Create new team object
        const newTeam: Team = {
            id: `team-${Date.now()}`,
            name: newTeamData.name.trim(),
            short: newTeamData.short.trim(),
            color: newTeamData.color
        };

        // Add to teams list (this would normally be done via API)
        teams.push(newTeam);

        // Auto-select the newly created team
        setSelectedTeamIds(prev => [...prev, newTeam.id]);

        // Reset form and close modal
        setNewTeamData({ name: '', short: '', color: '#1a73e8', city: '' });
        setShowCreateTeam(false);
    };

    return (
        <div className="phaseCreatorRoot">

            {/* Team Selector Modal */}
            {/* Team Selector Modal */}
            {showTeamSelector && (
                <div className={styles.modalOverlay}>
                    <div className={styles.modalContainerLarge}>
                        <div className={styles.modalHeader}>
                            <h3 className={styles.modalTitle}>Seleccionar Equipos</h3>
                            <button onClick={() => setShowTeamSelector(false)} className={styles.closeButton}>
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="p-4 border-b border-[var(--border)]">
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--muted)]" />
                                <input
                                    type="text"
                                    placeholder="Buscar equipo..."
                                    value={teamSearch}
                                    onChange={(e) => setTeamSearch(e.target.value)}
                                    className={styles.input}
                                    style={{ paddingLeft: '40px' }}
                                />
                            </div>
                        </div>

                        <div className={styles.modalBodyScrollable}>
                            <div className={styles.teamList}>
                                {filteredTeams.map(team => {
                                    const isSelected = selectedTeamIds.includes(team.id);
                                    return (
                                        <div
                                            key={team.id}
                                            onClick={() => toggleTeam(team.id)}
                                            className={`${styles.teamItem} ${isSelected ? styles.teamItemSelected : ''}`}
                                        >
                                            <div className={`${styles.teamCheck} ${isSelected ? styles.teamCheckSelected : ''}`}>
                                                {isSelected && <Check className="w-3 h-3" />}
                                            </div>
                                            <div className={styles.teamBadge} style={{ backgroundColor: team.color }}>
                                                {team.short}
                                            </div>
                                            <span className={`text-sm font-medium ${isSelected ? 'text-white' : 'text-[var(--muted)]'}`}>
                                                {team.name}
                                            </span>
                                        </div>
                                    )
                                })}
                            </div>
                        </div>


                        <div className={styles.modalFooter}>
                            <button
                                onClick={() => setShowCreateTeam(true)}
                                className={styles.btnSecondary}
                            >
                                <Plus className="w-4 h-4" />
                                Crear Equipo
                            </button>
                            <div className={styles.footerActions}>
                                <span className={styles.footerInfo}>
                                    {selectedTeamIds.length} seleccionados
                                </span>
                                <button onClick={() => setShowTeamSelector(false)} className={styles.btnCreate}>
                                    Confirmar
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* CREATE TEAM MODAL */}
            {showCreateTeam && (
                <div className={styles.modalOverlay}>
                    <div className={styles.modalContainer}>
                        {/* Header */}
                        <div className={styles.modalHeader}>
                            <div>
                                <h3 className={styles.modalTitle}>Crear Nuevo Equipo</h3>
                                <p className={styles.modalSubtitle}>Configuración básica del equipo</p>
                            </div>
                            <button
                                onClick={() => setShowCreateTeam(false)}
                                className={styles.closeButton}
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Form Content */}
                        <div className={styles.modalBody}>
                            {/* Team Name */}
                            <div className={styles.formGroup}>
                                <label className={styles.label}>
                                    Nombre del Equipo
                                </label>
                                <div className={styles.inputWrapper}>
                                    <input
                                        type="text"
                                        value={newTeamData.name}
                                        onChange={(e) => setNewTeamData({ ...newTeamData, name: e.target.value })}
                                        placeholder="Ej: Club Atlético San Isidro"
                                        className={styles.input}
                                        autoFocus
                                    />
                                </div>
                            </div>

                            {/* Short Name */}
                            <div className={styles.formGroup}>
                                <label className={styles.label}>
                                    Nombre Corto / Sigla
                                </label>
                                <div className={styles.inputWrapper}>
                                    <input
                                        type="text"
                                        value={newTeamData.short}
                                        onChange={(e) => setNewTeamData({ ...newTeamData, short: e.target.value.toUpperCase() })}
                                        placeholder="Ej: CASI"
                                        maxLength={5}
                                        className={styles.input}
                                        style={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}
                                    />
                                </div>
                                <p className={styles.helperText}>
                                    Máximo 5 caracteres · Se visualizará en los badges
                                </p>
                            </div>

                            {/* Team Color */}
                            <div className={styles.formGroup}>
                                <label className={styles.label}>
                                    Color del Equipo
                                </label>
                                <div className={styles.colorPickerRow}>
                                    {/* Color Picker Box */}
                                    <div
                                        className={styles.colorPreview}
                                        style={{ backgroundColor: newTeamData.color }}
                                    >
                                        <input
                                            type="color"
                                            value={newTeamData.color}
                                            onChange={(e) => setNewTeamData({ ...newTeamData, color: e.target.value })}
                                            className={styles.colorInputHidden}
                                        />
                                    </div>

                                    {/* Hex Input */}
                                    <input
                                        type="text"
                                        value={newTeamData.color}
                                        onChange={(e) => setNewTeamData({ ...newTeamData, color: e.target.value })}
                                        placeholder="#1a73e8"
                                        className={`${styles.input} ${styles.hexInput}`}
                                    />
                                </div>
                            </div>

                            {/* Preview */}
                            <div className={styles.previewArea}>
                                <span className={styles.previewLabel}>Vista previa:</span>
                                <div
                                    className={styles.previewBadge}
                                    style={{
                                        backgroundColor: newTeamData.color,
                                        color: 'white',
                                        textShadow: '0 1px 2px rgba(0,0,0,0.5)'
                                    }}
                                >
                                    {newTeamData.short || 'XXX'}
                                </div>
                            </div>
                        </div>

                        {/* Footer */}
                        <div className={styles.modalFooter}>
                            <button
                                onClick={() => setShowCreateTeam(false)}
                                className={styles.btnCancel}
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleCreateTeam}
                                className={styles.btnCreate}
                            >
                                <Plus className="w-4 h-4" />
                                Crear Equipo
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* EDIT MATCH MODAL */}
            {editingMatch && (
                <div className="fixed inset-0 z-[5000] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
                    <div className="modal w-full max-w-sm flex flex-col overflow-hidden bg-[#1a1a1a] border border-[var(--border)] rounded-xl shadow-2xl">
                        <div className="p-4 border-b border-[var(--border)] flex justify-between items-center bg-white/5">
                            <h3 className="h3 text-white">Editar Partido</h3>
                            <button onClick={() => setEditingMatch(null)} className="p-1 text-[var(--muted)] hover:text-white transition-colors">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="p-6 flex flex-col gap-4">
                            <div className="text-center mb-2">
                                <div className="text-lg font-bold text-white">{editingMatch.home} vs {editingMatch.away}</div>
                                <div className="text-sm text-[var(--accent)] font-medium">Fecha {editingMatch.round}</div>
                            </div>

                            <div className="space-y-3">
                                <div>
                                    <label className="block text-xs font-semibold text-[var(--muted)] uppercase mb-1.5">Fecha</label>
                                    <input
                                        type="date"
                                        value={editingMatch.date}
                                        onChange={(e) => setEditingMatch({ ...editingMatch, date: e.target.value })}
                                        className="w-full bg-black/20 border border-[var(--border)] rounded-lg px-3 py-2 text-white text-sm focus:border-[var(--accent)] outline-none"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-[var(--muted)] uppercase mb-1.5">Hora</label>
                                    <input
                                        type="time"
                                        value={editingMatch.time}
                                        onChange={(e) => setEditingMatch({ ...editingMatch, time: e.target.value })}
                                        className="w-full bg-black/20 border border-[var(--border)] rounded-lg px-3 py-2 text-white text-sm focus:border-[var(--accent)] outline-none"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-[var(--muted)] uppercase mb-1.5">Sede</label>
                                    <input
                                        type="text"
                                        value={editingMatch.venue}
                                        onChange={(e) => setEditingMatch({ ...editingMatch, venue: e.target.value })}
                                        placeholder="Ej: Cancha 1"
                                        className="w-full bg-black/20 border border-[var(--border)] rounded-lg px-3 py-2 text-white text-sm focus:border-[var(--accent)] outline-none"
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="p-4 border-t border-[var(--border)] bg-white/5 flex justify-end gap-3">
                            <button onClick={() => setEditingMatch(null)} className="px-4 py-2 rounded-lg text-sm font-medium text-[var(--muted)] hover:text-white transition-colors">
                                Cancelar
                            </button>
                            <button onClick={handleSaveMatch} className="px-4 py-2 rounded-lg text-sm font-bold bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] transition-colors shadow-lg shadow-[var(--accent)]/20">
                                Guardar Cambios
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* REMOVED container, shifting scope to phasePage for content */}

            {/* PHASE HEADER (Sticky) */}
            <header className="phaseHeader">
                <div className="phaseHeaderInner">
                    <div className="phaseTitleBlock">
                        <h1 className="phaseTitle">Crear fase</h1>
                    </div>

                    <div className="phaseActions">
                        <button onClick={() => onSaveDraft && onSaveDraft(getCurrentConfig())} className="btn btn--ghost">
                            Guardar Borrador
                        </button>
                        <button
                            className="btn btn--primary"
                            onClick={() => onNext && onNext(getCurrentConfig())}
                            disabled={!isFixtureGenerated}
                            title={!isFixtureGenerated ? "Debes generar o cargar un fixture primero" : ""}
                        >
                            <span className="btn__icon">
                                <PlayCircle size={14} fill="currentColor" />
                            </span>
                            Publicar Fase
                        </button>
                    </div>
                </div>
            </header>

            {/* TABS BAR (Sticky below header) */}
            <div className="phaseTabsBar">
                <div className="phaseTabsInner">
                    <div className={`tab ${activeTab === 'config' ? 'active' : ''}`} onClick={() => setActiveTab('config')}>Configuración</div>
                    <div className={`tab ${activeTab === 'rules' ? 'active' : ''}`} onClick={() => setActiveTab('rules')}>Reglas y Bonus</div>
                    <div className={`tab ${activeTab === 'fixture' ? 'active' : ''}`} onClick={() => setActiveTab('fixture')}>Fixture</div>
                </div>
            </div>

            <div className="phasePage">
                <p className="description max-w-2xl mb-8">
                    Definí el formato competitivo y generá el fixture.
                </p>

                {/* MAIN GRID */}
                <div className="gridMain">

                    {/* LEFT CONTENT */}
                    <div className="flex flex-col gap-6">

                        {/* --- TAB: CONFIGURACIÓN --- */}
                        {(activeTab === 'config') && (
                            <>
                                {/* PHASE TYPE */}
                                <div className="block">
                                    <div className="blockHeader">
                                        <div>
                                            <div className="label">Paso 01</div>
                                            <h2 className="blockTitle">Elegir tipo de fase</h2>
                                        </div>
                                    </div>

                                    <div className="blockInner">
                                        <div className="phaseTypes">
                                            <div
                                                className={`phaseCard ${phaseType === 'groups' ? 'phaseCardSelected' : ''}`}
                                                onClick={() => setPhaseType('groups')}
                                            >
                                                <LayoutGrid className={`w-8 h-8 mb-2 ${phaseType === 'groups' ? 'text-[var(--accent)]' : 'text-[var(--muted)]'}`} />
                                                <h3 className="phaseTitle">Grupos</h3>
                                                <p className="phaseDesc">Zonas round-robin.</p>
                                            </div>
                                            <div
                                                className={`phaseCard ${phaseType === 'league' ? 'phaseCardSelected' : ''}`}
                                                onClick={() => setPhaseType('league')}
                                            >
                                                <ListOrdered className={`w-8 h-8 mb-2 ${phaseType === 'league' ? 'text-white' : 'text-[var(--muted)]'}`} />
                                                <h3 className="phaseTitle">Liga</h3>
                                                <p className="phaseDesc">Todos contra todos.</p>
                                            </div>
                                            <div
                                                className={`phaseCard ${phaseType === 'playoff' ? 'phaseCardSelected' : ''}`}
                                                onClick={() => setPhaseType('playoff')}
                                            >
                                                <GitMerge className={`w-8 h-8 mb-2 ${phaseType === 'playoff' ? 'text-white' : 'text-[var(--muted)]'}`} />
                                                <h3 className="phaseTitle">Playoff</h3>
                                                <p className="phaseDesc">Eliminación directa.</p>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* STRUCTURE & PARTICIPANTS */}
                                <div className="block">
                                    <div className="blockHeader">
                                        <h2 className="blockTitle">Estructura y Participantes</h2>
                                    </div>

                                    <div className="blockInner flex flex-col gap-6">

                                        {/* TEAM SELECTION */}
                                        <div>
                                            <div className="participantsBar">
                                                <div className="participantsLeft">
                                                    <div className="participantsIcon" aria-hidden="true">
                                                        <Users className="w-5 h-5" />
                                                    </div>
                                                    <div className="participantsText">
                                                        <div className="participantsCount">{selectedTeamIds.length} Equipos</div>
                                                        <div className="participantsSub">Seleccionados manualmente</div>
                                                    </div>
                                                </div>
                                                <button
                                                    onClick={() => setShowTeamSelector(true)}
                                                    className="btnSecondary"
                                                >
                                                    Gestionar Equipos
                                                </button>
                                            </div>

                                            {selectedTeamIds.length > 0 && (
                                                <div className="chipsWrap">
                                                    {teams.filter(t => selectedTeamIds.includes(t.id)).slice(0, 12).map(t => (
                                                        <span key={t.id} className="chip">
                                                            {t.name}
                                                        </span>
                                                    ))}
                                                    {selectedTeamIds.length > 12 && (
                                                        <button className="chipMore" onClick={() => setShowTeamSelector(true)}>
                                                            +{selectedTeamIds.length - 12} más
                                                        </button>
                                                    )}
                                                </div>
                                            )}
                                        </div>

                                        {/* CONFIG INPUTS (Dynamic) */}
                                        <div className="rounded-xl border border-[var(--border)] bg-[rgba(255,255,255,0.03)] p-4">
                                            {phaseType === 'groups' && (
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                                                    <div>
                                                        <label className="label">¿Cuántos grupos?</label>
                                                        <input
                                                            type="number"
                                                            value={config.groupsCount}
                                                            onChange={(e) => handleConfigChange('groupsCount', parseInt(e.target.value) || 0)}
                                                            className="input mono"
                                                            min="2"
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="label">Equipos por grupo</label>
                                                        <div className="input mono flex items-center text-[var(--muted)] cursor-not-allowed">
                                                            {Math.ceil(selectedTeamIds.length / (config.groupsCount || 1))} (aprox)
                                                        </div>
                                                        <p className="p text-xs mt-1">Calculado automáticamente.</p>
                                                    </div>
                                                    <div className="md:col-span-2">
                                                        <label className="label">¿Cuántos clasifican por grupo?</label>
                                                        <div className="flex items-center gap-3">
                                                            <input
                                                                type="number"
                                                                value={config.qualifiersPerGroup}
                                                                onChange={(e) => handleConfigChange('qualifiersPerGroup', parseInt(e.target.value) || 0)}
                                                                className="input mono w-24 text-center"
                                                            />
                                                            <span className="text-sm text-[var(--muted)]">equipos pasan a la siguiente fase</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}

                                            {phaseType === 'league' && (
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                                                    <div>
                                                        <label className="label">Formato de Vueltas</label>
                                                        <select
                                                            className="input"
                                                            value={config.leagueRounds || 1}
                                                            onChange={(e) => handleConfigChange('leagueRounds', parseInt(e.target.value))}
                                                        >
                                                            <option value={1}>Una sola ronda (Ida)</option>
                                                            <option value={2}>Ida y Vuelta</option>
                                                        </select>
                                                    </div>
                                                    <div>
                                                        <label className="label">Total de Fechas</label>
                                                        <div className="input mono flex items-center text-[var(--muted)] cursor-not-allowed">
                                                            {((selectedTeamIds.length - 1) * (config.leagueRounds || 1)) || 0} fechas
                                                        </div>
                                                    </div>
                                                </div>
                                            )}

                                            {phaseType === 'playoff' && (
                                                <div className="grid grid-cols-1 gap-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                                                    <div>
                                                        <label className="label">Estructura del Cuadro</label>
                                                        <div className="input mono flex items-center justify-between text-[var(--muted)]">
                                                            <span>Inicia desde:</span>
                                                            <strong className="text-white">
                                                                {selectedTeamIds.length > 16 ? '32avos' :
                                                                    selectedTeamIds.length > 8 ? 'Octavos de Final' :
                                                                        selectedTeamIds.length > 4 ? 'Cuartos de Final' :
                                                                            selectedTeamIds.length > 2 ? 'Semifinales' : 'Final'}
                                                            </strong>
                                                        </div>
                                                        <p className="p text-xs mt-1">Basado en {selectedTeamIds.length} equipos seleccionados.</p>
                                                    </div>
                                                    <div className="flex items-center gap-3 p-3 rounded-lg border border-[var(--border)] bg-[rgba(255,255,255,0.02)]">
                                                        <input
                                                            type="checkbox"
                                                            id="thirdPlace"
                                                            className="w-4 h-4 rounded border-[var(--border)] bg-transparent text-[var(--accent)] focus:ring-0"
                                                            checked={!!config.playoffThirdPlace}
                                                            onChange={(e) => handleConfigChange('playoffThirdPlace', e.target.checked)}
                                                        />
                                                        <label htmlFor="thirdPlace" className="text-sm font-medium cursor-pointer select-none">
                                                            Incluir partido por el 3er puesto
                                                        </label>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* TABLE TAGS (New Editor) */}
                                <div className="block">
                                    <div className="blockInner">
                                        <div className="labelsHeader">
                                            <div>
                                                <h3 className="blockTitle">Etiquetas de Tabla</h3>
                                                <p className="blockHelp">Definí zonas de clasificación (ej. Copa de Oro, Descenso).</p>
                                            </div>
                                            <button onClick={handleAddTag} className="btnSecondary">
                                                + Agregar
                                            </button>
                                        </div>

                                        <div className="labelsList">
                                            {tags.map((tag) => (
                                                <div key={tag.id} className="labelRow">
                                                    <div className="rangeCell">
                                                        <span className="miniLabel">Del</span>
                                                        <input
                                                            type="number"
                                                            value={tag.fromPosition}
                                                            onChange={(e) => updateTag(tag.id, 'fromPosition', parseInt(e.target.value))}
                                                            className="miniInput"
                                                        />
                                                        <span className="miniLabel">al</span>
                                                        <input
                                                            type="number"
                                                            value={tag.toPosition}
                                                            onChange={(e) => updateTag(tag.id, 'toPosition', parseInt(e.target.value))}
                                                            className="miniInput"
                                                        />
                                                    </div>

                                                    <input
                                                        type="text"
                                                        value={tag.label}
                                                        onChange={(e) => updateTag(tag.id, 'label', e.target.value)}
                                                        className="labelName"
                                                        placeholder="Nombre etiqueta..."
                                                    />

                                                    <div className="colorCell">
                                                        <input
                                                            type="color"
                                                            value={tag.color}
                                                            onChange={(e) => updateTag(tag.id, 'color', e.target.value)}
                                                            className="colorInput"
                                                        />
                                                        <span className="colorDot" style={{ '--c': tag.color } as React.CSSProperties}></span>
                                                    </div>

                                                    <button onClick={() => removeTag(tag.id)} className="iconBtn" aria-label="Eliminar">
                                                        <X className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </>
                        )}


                        {/* --- TAB: REGLAS Y BONUS --- */}
                        {(activeTab === 'rules') && (
                            <>
                                {/* POINTS */}
                                <section className="g22Block">
                                    <header className="g22BlockHeader">
                                        <h2 className="g22Title">Sistema de Puntuación</h2>
                                    </header>

                                    <div className="scoreTable">
                                        <div className="scoreHead">
                                            <span>Condición</span>
                                            <span className="scoreHeadRight">Puntos</span>
                                        </div>

                                        <div className="scoreRow">
                                            <span className="scoreLabel">Victoria</span>
                                            <div className="scorePill">
                                                <input
                                                    type="text"
                                                    value={config.pointsWin}
                                                    onChange={(e) => handleConfigChange('pointsWin', e.target.value)}
                                                    className="bg-transparent border-none text-center w-full focus:outline-none"
                                                    style={{ color: 'inherit', fontWeight: 'inherit', fontFamily: 'inherit' }}
                                                />
                                            </div>
                                        </div>

                                        <div className="scoreRow">
                                            <span className="scoreLabel">Empate</span>
                                            <div className="scorePill">
                                                <input
                                                    type="text"
                                                    value={config.pointsDraw}
                                                    onChange={(e) => handleConfigChange('pointsDraw', e.target.value)}
                                                    className="bg-transparent border-none text-center w-full focus:outline-none"
                                                    style={{ color: 'inherit', fontWeight: 'inherit', fontFamily: 'inherit' }}
                                                />
                                            </div>
                                        </div>

                                        <div className="scoreRow">
                                            <span className="scoreLabel">Bonus Try (4+)</span>
                                            <div className="scorePill scorePillAccent">
                                                <input
                                                    type="text"
                                                    value={config.pointsBonusTry}
                                                    onChange={(e) => handleConfigChange('pointsBonusTry', e.target.value)}
                                                    className="bg-transparent border-none text-center w-full focus:outline-none"
                                                    style={{ color: 'inherit', fontWeight: 'inherit', fontFamily: 'inherit' }}
                                                />
                                            </div>
                                        </div>

                                        <div className="scoreRow">
                                            <span className="scoreLabel">Bonus Derrota (≤7)</span>
                                            <div className="scorePill scorePillAccent">
                                                <input
                                                    type="text"
                                                    value={config.pointsBonusLoss}
                                                    onChange={(e) => handleConfigChange('pointsBonusLoss', e.target.value)}
                                                    className="bg-transparent border-none text-center w-full focus:outline-none"
                                                    style={{ color: 'inherit', fontWeight: 'inherit', fontFamily: 'inherit' }}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </section>

                                {/* CRITERIA */}
                                <section className="g22Block">
                                    <header className="g22BlockHeader">
                                        <h2 className="g22Title">Criterios de Desempate</h2>
                                        <div className="reorderHint">Drag to reorder</div>
                                    </header>

                                    <div className="tieBody">
                                        <div className="tieList">
                                            {activeCriteria.map((item, index) => (
                                                <div
                                                    key={item.id}
                                                    className="tieItem"
                                                    draggable
                                                    onDragStart={() => handleDragStart(index)}
                                                    onDragOver={(e) => handleDragOver(e, index)}
                                                    onDragEnd={handleDragEnd}
                                                >
                                                    <div className="tieIdx">{(index + 1).toString().padStart(2, '0')}</div>
                                                    <div className="tieName">{item.text}</div>
                                                    <div className="tieActions">
                                                        <button className="iconBtn" aria-label="drag">
                                                            <GripVertical className="w-4 h-4" />
                                                        </button>
                                                        <button
                                                            className="iconBtn"
                                                            aria-label="remove"
                                                            onClick={() => removeCriterion(index)}
                                                        >
                                                            <X className="w-4 h-4" />
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>

                                        <div className="tieDivider"></div>

                                        <div className="tieAdd">
                                            <div className="tieSubTitle">Agregar criterio disponible</div>

                                            <div className="chipWrap">
                                                {AVAILABLE_CRITERIA.filter(ac => !activeCriteria.find(c => c.id === ac.id)).map(criterion => (
                                                    <button
                                                        key={criterion.id}
                                                        className="chip"
                                                        onClick={() => addCriterion(criterion)}
                                                    >
                                                        {criterion.text}
                                                    </button>
                                                ))}
                                            </div>

                                            {!showCustomInput ? (
                                                <button
                                                    className="linkAccent"
                                                    onClick={() => setShowCustomInput(true)}
                                                >
                                                    <Plus className="w-4 h-4" />
                                                    Crear criterio personalizado
                                                </button>
                                            ) : (
                                                <div className="flex items-center gap-2 mt-4 bg-[rgba(255,255,255,0.03)] p-2 rounded-lg border border-[var(--border)] animate-in fade-in slide-in-from-top-2">
                                                    <input
                                                        type="text"
                                                        value={customCriterionName}
                                                        onChange={(e) => setCustomCriterionName(e.target.value)}
                                                        placeholder="Nombre del criterio..."
                                                        className="bg-transparent text-sm text-white focus:outline-none w-full placeholder:text-[var(--muted)] px-2"
                                                        autoFocus
                                                        onKeyDown={(e) => e.key === 'Enter' && handleAddCustomCriterion()}
                                                    />
                                                    <button onClick={handleAddCustomCriterion} className="btn btnPrimary" style={{ height: '28px', fontSize: '12px', padding: '0 12px' }}>
                                                        <Check className="w-3 h-3" />
                                                    </button>
                                                    <button onClick={() => setShowCustomInput(false)} className="p-1 hover:text-white text-[var(--muted)]">
                                                        <X className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </section>
                            </>
                        )}

                        {/* --- TAB: FIXTURE --- */}
                        {(activeTab === 'fixture') && (
                            <>
                                <div className="block">
                                    <div className="blockHeader">
                                        <h2 className="blockTitle">Generación de Fixture</h2>
                                    </div>

                                    <div className="blockInner fixtureSection">
                                        {/* Left Side: Controls */}
                                        <div>
                                            <div className="controlList">
                                                <div className="controlRow">
                                                    <div className="controlLeft">
                                                        <div className="controlIcon">
                                                            <Calendar className="w-5 h-5 text-[var(--accent)]" />
                                                        </div>
                                                        <div className="controlLabel">Frecuencia</div>
                                                    </div>
                                                    <div className="controlValue">
                                                        <select
                                                            className="bg-transparent text-right font-bold text-white outline-none cursor-pointer"
                                                            value={fixtureSettings.frequencyCode}
                                                            onChange={(e) => setFixtureSettings({ ...fixtureSettings, frequencyCode: e.target.value })}
                                                            style={{ textAlignLast: 'right' }}
                                                        >
                                                            <option value="weekly" className="bg-[#222]">Semanal</option>
                                                            <option value="biweekly" className="bg-[#222]">Quincenal</option>
                                                            <option value="daily" className="bg-[#222]">Diaria</option>
                                                        </select>
                                                    </div>
                                                </div>

                                                <div className="controlRow">
                                                    <div className="controlLeft">
                                                        <div className="controlIcon">
                                                            <MapPin className="w-5 h-5 text-[var(--accent)]" />
                                                        </div>
                                                        <div className="controlLabel">Localía</div>
                                                    </div>
                                                    <div className="controlValue">
                                                        <select
                                                            className="bg-transparent text-right font-bold text-white outline-none cursor-pointer"
                                                            value={fixtureSettings.venueMode}
                                                            onChange={(e) => setFixtureSettings({ ...fixtureSettings, venueMode: e.target.value })}
                                                            style={{ textAlignLast: 'right' }}
                                                        >
                                                            <option value="classic" className="bg-[#222]">Alternada</option>
                                                            <option value="neutral" className="bg-[#222]">Sede Neutral</option>
                                                        </select>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Right Side: Actions */}
                                        {/* Right Side: Actions */}
                                        <div className="fixtureActions">
                                            <button
                                                className="btnPrimary w-full flex justify-center items-center gap-2"
                                                onClick={handleGenerateFixture}
                                                disabled={isGenerating}
                                            >
                                                {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <GitMerge className="w-4 h-4" />}
                                                {isGenerating ? 'Generando...' : 'Generar Automático'}
                                            </button>

                                            <div className="grid grid-cols-2 gap-3">
                                                <div
                                                    className="dropBox"
                                                    onClick={() => fileInputRef.current?.click()}
                                                    style={{ minHeight: '80px', padding: '12px' }}
                                                >
                                                    <input type="file" accept=".csv, .xlsx, .xls" className="hidden" ref={fileInputRef} onChange={handleFileUpload} />
                                                    <div className="dropBoxContent">
                                                        <UploadCloud className="w-6 h-6 text-[var(--muted)]" />
                                                        <div className="dropBoxTitle" style={{ fontSize: '10px' }}>Importar Excel</div>
                                                    </div>
                                                </div>

                                                <div
                                                    className="dropBox"
                                                    onClick={handleManualFixture}
                                                    style={{ minHeight: '80px', padding: '12px' }}
                                                >
                                                    <div className="dropBoxContent">
                                                        <ListOrdered className="w-6 h-6 text-[var(--muted)]" />
                                                        <div className="dropBoxTitle" style={{ fontSize: '10px' }}>Carga Manual</div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>


                                {isFixtureGenerated && (
                                    <div className="block" style={{ marginTop: '16px' }}>
                                        <div className="blockHeader previewHeader">
                                            <h2 className="blockTitle">Vista Previa</h2>
                                            <span className="badge">{fixtureData.length} Partidos</span>
                                        </div>

                                        <div className="blockInner">
                                            {fixtureData.length === 0 ? (
                                                <div className="text-center py-8 text-[var(--muted)] border border-dashed border-[var(--border)] rounded-xl">
                                                    <p className="mb-2">Fixture configurado manualmente.</p>
                                                    <p className="text-xs">Podrás agregar los partidos en la siguiente pantalla.</p>
                                                </div>
                                            ) : (
                                                /* Group by Rounds for display clarity */
                                                Array.from(new Set(fixtureData.map(m => m.round))).sort((a, b) => a - b).map(roundNum => {
                                                    const roundMatches = fixtureData.filter(m => m.round === roundNum);
                                                    const roundDate = roundMatches[0]?.date || 'TBD';

                                                    return (
                                                        <div key={roundNum} className="previewCardTable">
                                                            <div className="previewTopRow">
                                                                <div className="previewRound">FECHA {roundNum}</div>
                                                                <div className="previewDate">{new Date(roundDate).toLocaleDateString()}</div>
                                                            </div>

                                                            <div className="previewTable">
                                                                {roundMatches.map(match => (
                                                                    <div
                                                                        key={match.id}
                                                                        className="previewMatch cursor-pointer hover:bg-white/5 transition-colors"
                                                                        onClick={() => setEditingMatch(match)}
                                                                        title="Click para editar"
                                                                    >
                                                                        <div className="teamL">{match.home}</div>
                                                                        <div className="time">{match.time}</div>
                                                                        <div className="teamR">{match.away}</div>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    );
                                                })
                                            )}
                                        </div>
                                    </div>
                                )}
                            </>
                        )}
                    </div>

                    {/* SIDEBAR */}
                    <aside className="sidebar flex flex-col gap-6">

                        {/* VALIDATION CARD */}
                        <div className="card">
                            <h2 className="sidebarTitle">Validación de Fase</h2>
                            <div className="checklist">
                                <div className="checkItem">
                                    <div className={`w-5 h-5 rounded-full flex items-center justify-center ${selectedTeamIds.length >= 4 ? 'bg-[rgba(0,163,101,0.15)] text-[var(--accent)]' : 'bg-amber-500/10 text-amber-500'}`}>
                                        {selectedTeamIds.length >= 4 ? <Check className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
                                    </div>
                                    <div>
                                        <strong>Equipos asignados</strong>
                                        <p>{selectedTeamIds.length} equipos seleccionados</p>
                                    </div>
                                </div>
                                <div className="checkItem">
                                    <div className="w-5 h-5 rounded-full bg-[rgba(0,163,101,0.15)] flex items-center justify-center text-[var(--accent)]">
                                        <Check className="w-3 h-3" />
                                    </div>
                                    <div>
                                        <strong>Puntuación definida</strong>
                                        <p>Sistema estándar aplicado</p>
                                    </div>
                                </div>
                                <div className="checkItem">
                                    <div className={`w-5 h-5 rounded-full flex items-center justify-center ${isFixtureGenerated ? 'bg-[rgba(0,163,101,0.15)] text-[var(--accent)]' : 'bg-amber-500/10 text-amber-500'}`}>
                                        {isFixtureGenerated ? <Check className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
                                    </div>
                                    <div>
                                        <strong>{isFixtureGenerated ? 'Fixture generado' : 'Fixture pendiente'}</strong>
                                        <p className={isFixtureGenerated ? 'text-[var(--accent)]' : 'text-amber-500'}>
                                            {isFixtureGenerated
                                                ? (fixtureData.length > 0 ? 'Listo para publicar' : 'Configuración manual')
                                                : 'Debes generar o cargar el fixture'}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* PREVIEW CARD */}
                        <div className="card">
                            <h2 className="sidebarTitle">Vista Previa</h2>

                            <div className="previewGrid">
                                {/* --- GROUPS PREVIEW --- */}
                                {phaseType === 'groups' && getPreviewGroups().map((group, gIdx) => (
                                    <div key={gIdx} className="previewCard">
                                        <div className="previewHeader">
                                            <h3 className="previewTitle">Grupo {String.fromCharCode(65 + group.index)}</h3>
                                            <span className="previewChip">MANUAL</span>
                                        </div>

                                        <div className="previewList">
                                            {group.teams.map((team, idx) => {
                                                const rank = idx + 1;
                                                const teamColor = getTagColor(rank);
                                                const badgeStyle = teamColor
                                                    ? {
                                                        borderColor: teamColor,
                                                        color: '#fff',
                                                        background: `${teamColor}33`
                                                    }
                                                    : {};

                                                return (
                                                    <div key={team.id} className="previewRow group">
                                                        <div className="teamCell flex-1">
                                                            <div className="teamBadgeMini" style={{ backgroundColor: team.color }}>
                                                                {team.short}
                                                            </div>
                                                            <span className="teamNameMini">{team.name}</span>
                                                        </div>

                                                        {/* Manual Group Mover */}
                                                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                            <button
                                                                onClick={() => handleMoveTeam(team.id, group.index - 1)}
                                                                disabled={group.index === 0}
                                                                className="p-1 rounded hover:bg-white/10 text-[var(--muted)] hover:text-white disabled:opacity-30"
                                                                title="Mover al grupo anterior"
                                                            >
                                                                <ArrowLeft className="w-3 h-3" />
                                                            </button>
                                                            <button
                                                                onClick={() => handleMoveTeam(team.id, group.index + 1)}
                                                                disabled={group.index === config.groupsCount - 1}
                                                                className="p-1 rounded hover:bg-white/10 text-[var(--muted)] hover:text-white disabled:opacity-30"
                                                                title="Mover al grupo siguiente"
                                                            >
                                                                <ArrowLeft className="w-3 h-3 rotate-180" />
                                                            </button>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                            {group.teams.length === 0 && (
                                                <p className="text-xs text-[var(--muted)] text-center py-4">Arrastra equipos aquí</p>
                                            )}
                                        </div>
                                    </div>
                                ))}

                                {/* --- LEAGUE PREVIEW --- */}
                                {phaseType === 'league' && (
                                    <div className="previewCard col-span-1 md:col-span-2">
                                        <div className="previewHeader">
                                            <h3 className="previewTitle">Tabla General</h3>
                                            <span className="previewChip">TODOS VS TODOS</span>
                                        </div>

                                        <div className="previewList">
                                            {teams.filter(t => selectedTeamIds.includes(t.id)).map((team, idx) => {
                                                const rank = idx + 1;
                                                const teamColor = getTagColor(rank);
                                                const badgeStyle = teamColor
                                                    ? {
                                                        borderColor: teamColor,
                                                        color: '#fff',
                                                        background: `${teamColor}33`
                                                    }
                                                    : {};

                                                return (
                                                    <div key={team.id} className="previewRow">
                                                        <div className="rankBadge" style={badgeStyle}>
                                                            {rank}
                                                        </div>

                                                        <div className="teamCell">
                                                            <div className="teamBadgeMini" style={{ backgroundColor: team.color }}>
                                                                {team.short}
                                                            </div>
                                                            <span className="teamNameMini">{team.name}</span>
                                                        </div>

                                                        <span className="pts">0</span>
                                                    </div>
                                                );
                                            })}
                                            {selectedTeamIds.length === 0 && (
                                                <p className="text-xs text-[var(--muted)] text-center py-4">Selecciona equipos para ver la tabla.</p>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {/* --- PLAYOFF PREVIEW --- */}
                                {phaseType === 'playoff' && (
                                    <section className="g22Block playoffBlock col-span-1 md:col-span-2">
                                        <header className="g22BlockHeader">
                                            <h2 className="g22Title">
                                                {selectedTeamIds.length > 16 ? '32avos de Final' :
                                                    selectedTeamIds.length > 8 ? 'Octavos de Final' :
                                                        selectedTeamIds.length > 4 ? 'Cuartos de Final' :
                                                            selectedTeamIds.length > 2 ? 'Semifinales' : 'Final'}
                                            </h2>
                                            <span className="pillSmall">Llaves</span>
                                        </header>

                                        <div className="playoffGrid">
                                            {(() => {
                                                const activeTeams = teams.filter(t => selectedTeamIds.includes(t.id));
                                                const pairs = [];
                                                // Simple top-bottom pairing simulation (1 vs N, 2 vs N-1)
                                                for (let i = 0; i < activeTeams.length / 2; i++) {
                                                    pairs.push({
                                                        home: activeTeams[i],
                                                        away: activeTeams[activeTeams.length - 1 - i],
                                                        seedHome: i + 1,
                                                        seedAway: activeTeams.length - i
                                                    });
                                                }
                                                // Handle odd team count (bye)
                                                if (activeTeams.length % 2 !== 0) {
                                                    pairs.push({
                                                        home: activeTeams[Math.floor(activeTeams.length / 2)],
                                                        away: null,
                                                        seedHome: Math.ceil(activeTeams.length / 2),
                                                        seedAway: null
                                                    });
                                                }

                                                return pairs.map((pair, idx) => (
                                                    <article key={idx} className="matchupCard">
                                                        <div className="matchupHeader">
                                                            <span className="matchupTitle">Llave {idx + 1}</span>
                                                            <span className="matchupMeta">
                                                                #{pair.seedHome} vs #{pair.seedAway || '-'}
                                                            </span>
                                                        </div>

                                                        <div className="teamRow">
                                                            <div className="teamBadge" style={{ backgroundColor: pair.home?.color || '#333' }}>
                                                                {pair.home?.short || '-'}
                                                            </div>
                                                            <div className="teamName">{pair.home?.name || 'TBD'}</div>
                                                            <div className="seedTag seedHome">L</div>
                                                        </div>

                                                        <div className="teamRow teamRowAlt">
                                                            <div className="teamBadge" style={{ backgroundColor: pair.away?.color || '#333' }}>
                                                                {pair.away?.short || '-'}
                                                            </div>
                                                            <div className="teamName">{pair.away?.name || 'BYE'}</div>
                                                            <div className="seedTag seedAway">V</div>
                                                        </div>
                                                    </article>
                                                ));
                                            })()}
                                        </div>

                                        <footer className="playoffFooter">
                                            <span className="mutedNote text-white/60 text-xs pl-2">Cruces por seeding (1 vs {selectedTeamIds.length}).</span>
                                        </footer>
                                    </section>
                                )}
                            </div>

                            {/* Info Footer */}
                            <div className="mt-4 pt-4 border-t border-[var(--border)]">
                                <div className="flex items-center gap-2 text-xs text-[var(--muted)]">
                                    <Info className="w-3 h-3" />
                                    <span>
                                        {phaseType === 'groups' && `Simulación en ${config.groupsCount} zonas.`}
                                        {phaseType === 'league' && `Liga de ${selectedTeamIds.length} equipos.`}
                                        {phaseType === 'playoff' && `Cruces por seeding (1 vs ${selectedTeamIds.length}).`}
                                    </span>
                                </div>
                            </div>
                        </div>

                    </aside>
                </div>
            </div>
        </div >
    );
}
