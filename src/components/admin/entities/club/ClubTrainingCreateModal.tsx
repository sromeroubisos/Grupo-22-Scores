'use client';

import { useEffect, useMemo, useState } from 'react';
import {
    ArrowDown,
    ArrowUp,
    Calendar,
    ChevronRight,
    ClipboardList,
    Clock,
    MapPin,
    NotebookPen,
    Plus,
    Save,
    Shield,
    Target,
    Trash2,
    Video,
    X,
} from 'lucide-react';
import type { ClubDashboardMatch, ClubDashboardOverview } from '@/lib/club-admin/dashboard-types';
import type { SavedPreset } from '@/lib/club-pizarra/types';
import type {
    AttendanceState,
    PlanBlock,
    PlanBlockType,
    TrainingEntry,
    TrainingPlayer,
    TrainingType,
} from '@/lib/club-admin/trainings';
import type { Division } from '@/lib/services/divisionService';
import type { PersonWithRole } from '@/lib/services/personService';

type TrainingFocus = 'tecnico' | 'tactico' | 'fisico' | 'mixto' | 'recuperacion' | 'video';
type SeasonPhase = 'pretemporada' | 'competencia' | 'semana_partido' | 'post_partido';
type LoadProfile = 'aerobica' | 'anaerobica' | 'fuerza' | 'mixta';

type BlockDraft = {
    id: string;
    type: PlanBlockType;
    title: string;
    duration: number;
    intensity?: string;
    coachId: string;
    description: string;
    goal: string;
    equipment: string;
    scenario: string;
    exerciseNames: string[];
};

interface ExerciseLibraryItem {
    id: string;
    label: string;
    summary: string;
    blockType: PlanBlockType;
}

interface ClubVenue {
    id: string;
    name: string;
    address?: string | null;
    city?: string | null;
    is_primary?: boolean | null;
}

interface ClubTrainingCreateModalProps {
    open: boolean;
    clubId: string;
    clubName: string;
    sport?: string | null;
    initialFocus?: TrainingFocus;
    divisions: Division[];
    players: PersonWithRole[];
    staff: PersonWithRole[];
    dashboardData: ClubDashboardOverview;
    onClose: () => void;
    onCreate: (training: TrainingEntry) => Promise<boolean>;
}

const FOCUS_OPTIONS: Array<{ id: TrainingFocus; label: string; type: TrainingType }> = [
    { id: 'tecnico', label: 'Tecnico', type: 'campo' },
    { id: 'tactico', label: 'Tactico', type: 'campo' },
    { id: 'fisico', label: 'Fisico', type: 'gimnasio' },
    { id: 'mixto', label: 'Mixto', type: 'campo' },
    { id: 'recuperacion', label: 'Recuperacion', type: 'recuperacion' },
    { id: 'video', label: 'Video', type: 'video' },
];

const SEASON_PHASES: Array<{ id: SeasonPhase; label: string }> = [
    { id: 'pretemporada', label: 'Pretemporada' },
    { id: 'competencia', label: 'Competencia' },
    { id: 'semana_partido', label: 'Semana de partido' },
    { id: 'post_partido', label: 'Post partido' },
];

const LOAD_PROFILES: Array<{ id: LoadProfile; label: string }> = [
    { id: 'aerobica', label: 'Aerobica' },
    { id: 'anaerobica', label: 'Anaerobica' },
    { id: 'fuerza', label: 'Fuerza' },
    { id: 'mixta', label: 'Mixta' },
];

const SCENARIO_OPTIONS = [
    'Scrum medio',
    'Line ofensivo',
    'Salida de 22',
    'Recepcion de salida',
];

const BLOCK_TYPE_LABELS: Record<PlanBlockType, string> = {
    warmup: 'Entrada en calor',
    tecnico: 'Tecnica',
    tactico: 'Tactica',
    fisico: 'Fisico',
    cierre: 'Recuperacion',
};

let localDraftIdCounter = 0;

function createId(prefix: string) {
    localDraftIdCounter += 1;
    return `${prefix}-${Date.now()}-${localDraftIdCounter}`;
}

function getPersonName(person: PersonWithRole) {
    return person.full_name?.trim()
        || `${person.first_name || ''} ${person.last_name || ''}`.trim()
        || 'Sin nombre';
}

function formatDivisionLabel(division: Division | null | undefined, fallbackClub: string) {
    return division?.name?.trim()
        || division?.category?.trim()
        || fallbackClub;
}

function moveInArray<T>(items: T[], fromIndex: number, toIndex: number) {
    const next = [...items];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    return next;
}

function calculateMinutesBetween(startTime: string, endTime: string) {
    if (!startTime || !endTime) return null;
    const [startHour, startMinute] = startTime.split(':').map(Number);
    const [endHour, endMinute] = endTime.split(':').map(Number);
    if (
        !Number.isFinite(startHour) || !Number.isFinite(startMinute)
        || !Number.isFinite(endHour) || !Number.isFinite(endMinute)
    ) {
        return null;
    }

    const start = startHour * 60 + startMinute;
    const end = endHour * 60 + endMinute;
    return end > start ? end - start : null;
}

function buildTrainingDate(date: string, time: string) {
    if (!date || !time) return '';
    return `${date}T${time}:00`;
}

function getTodayDateString() {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

function buildInitialPlayerStatuses(players: PersonWithRole[]) {
    return Object.fromEntries(players.map((player) => [player.id, 'confirmado' as const]));
}

function normalizeText(value?: string | null) {
    return (value || '').trim().toLowerCase();
}

function matchesDivision(player: PersonWithRole, division: Division | undefined) {
    if (!division) return true;
    if (player.division_id && (player.division_id === division.id || player.division_id === division.management_id)) {
        return true;
    }

    const divisionName = division.name?.trim().toLowerCase();
    return Boolean(divisionName && player.division_name?.trim().toLowerCase() === divisionName);
}

function matchesMatchDivision(match: ClubDashboardMatch, division: Division | undefined) {
    if (!division) return true;

    if (
        division.id === match.homeDivisionId
        || division.id === match.awayDivisionId
        || (division.management_id && (division.management_id === match.homeDivisionId || division.management_id === match.awayDivisionId))
    ) {
        return true;
    }

    const normalizedDivisionName = normalizeText(division.name || division.category);
    if (!normalizedDivisionName) {
        return false;
    }

    return (
        normalizeText(match.homeDivisionName) === normalizedDivisionName
        || normalizeText(match.awayDivisionName) === normalizedDivisionName
    );
}

function findNextRelevantMatch(matches: ClubDashboardMatch[], division: Division | undefined) {
    const now = Date.now();

    const scopedMatches = matches
        .filter((match) => Boolean(match.dateTime))
        .filter((match) => matchesMatchDivision(match, division))
        .map((match) => ({
            match,
            timestamp: match.dateTime ? new Date(match.dateTime).getTime() : Number.NaN,
        }))
        .filter((entry) => Number.isFinite(entry.timestamp) && entry.timestamp >= now)
        .sort((left, right) => left.timestamp - right.timestamp);

    return scopedMatches[0]?.match ?? null;
}

function buildSuggestedSeasonPhase(match: ClubDashboardMatch | null): SeasonPhase {
    if (!match?.dateTime) {
        return 'competencia';
    }

    const diffMs = new Date(match.dateTime).getTime() - Date.now();
    const dayMs = 24 * 60 * 60 * 1000;

    if (diffMs < 0) return 'post_partido';
    if (diffMs <= 7 * dayMs) return 'semana_partido';
    return 'competencia';
}

function buildSuggestedTrainingTitle(
    focus: TrainingFocus,
    divisionLabel: string,
    match: ClubDashboardMatch | null,
) {
    const focusLabel = FOCUS_OPTIONS.find((option) => option.id === focus)?.label ?? 'Sesion';
    if (!match) {
        return `${focusLabel} ${divisionLabel}`.trim();
    }

    const opponentLabel = match.opponentShortName || match.opponentName || 'rival';

    if (focus === 'video') {
        return `Analisis ${divisionLabel} vs ${opponentLabel}`;
    }

    if (focus === 'recuperacion') {
        return `Recuperacion ${divisionLabel} post ${opponentLabel}`;
    }

    return `${focusLabel} ${divisionLabel} vs ${opponentLabel}`;
}

function buildSuggestedObjective(
    focus: TrainingFocus,
    divisionLabel: string,
    match: ClubDashboardMatch | null,
) {
    if (!match) {
        return `Definir el objetivo principal de ${divisionLabel} con foco operativo y medicion posterior.`;
    }

    const opponentLabel = match.opponentShortName || match.opponentName || 'el rival';

    if (focus === 'video') {
        return `Analizar patrones de ${opponentLabel} y preparar la toma de decision de ${divisionLabel}.`;
    }

    if (focus === 'recuperacion') {
        return `Bajar cargas, revisar el ultimo esfuerzo y dejar listo a ${divisionLabel} para la siguiente demanda competitiva.`;
    }

    return `Preparar a ${divisionLabel} para ${opponentLabel} con foco en ejecucion, ritmo e intencion tactica.`;
}

function formatMatchReference(match: ClubDashboardMatch | null) {
    if (!match?.dateTime) {
        return null;
    }

    const date = new Date(match.dateTime);
    if (Number.isNaN(date.getTime())) {
        return null;
    }

    return new Intl.DateTimeFormat('es-AR', {
        weekday: 'short',
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
    }).format(date);
}

function formatPresetSummary(preset: SavedPreset) {
    const frameCount = preset.boardState.timeline.length;
    const updatedLabel = new Intl.DateTimeFormat('es-AR', {
        day: '2-digit',
        month: 'short',
    }).format(new Date(preset.updatedAt));

    return [
        preset.category,
        frameCount > 0 ? `${frameCount} frames` : 'Tablero base',
        `Actualizada ${updatedLabel}`,
    ].join(' | ');
}

function buildPlanBlock(block: BlockDraft, coachName: string): PlanBlock {
    const notes = [
        block.description,
        block.goal ? `Objetivo: ${block.goal}` : null,
        block.exerciseNames.length > 0 ? `Ejercicios: ${block.exerciseNames.join(', ')}` : null,
        block.equipment ? `Material: ${block.equipment}` : null,
        block.scenario ? `Situacion: ${block.scenario}` : null,
        coachName ? `Responsable: ${coachName}` : null,
    ]
        .filter(Boolean)
        .join(' | ');

    return {
        id: block.id,
        type: block.type,
        title: block.title,
        duration: block.duration,
        intensity: block.intensity,
        notes,
    };
}

export function ClubTrainingCreateModal({
    open,
    clubId,
    clubName,
    sport,
    initialFocus,
    divisions,
    players,
    staff,
    dashboardData,
    onClose,
    onCreate,
}: ClubTrainingCreateModalProps) {
    const initialDivisionId = divisions[0]?.id ?? '';
    const initialDivision = divisions.find((division) => division.id === initialDivisionId);
    const initialMatch = findNextRelevantMatch(dashboardData.upcomingMatches, initialDivision);
    const [title, setTitle] = useState('');
    const [date, setDate] = useState(() => getTodayDateString());
    const [startTime, setStartTime] = useState('18:00');
    const [endTime, setEndTime] = useState('19:20');
    const [location, setLocation] = useState('');
    const [divisionId, setDivisionId] = useState<string>(initialDivisionId);
    const [focus, setFocus] = useState<TrainingFocus>(initialFocus ?? 'mixto');
    const [seasonPhase, setSeasonPhase] = useState<SeasonPhase>(() => buildSuggestedSeasonPhase(initialMatch));
    const [objective, setObjective] = useState('');
    const [goalInput, setGoalInput] = useState('');
    const [specificGoals, setSpecificGoals] = useState<string[]>([]);
    const [blocks, setBlocks] = useState<BlockDraft[]>([]);
    const [activeBlockId, setActiveBlockId] = useState<string>('');
    const [selectedScenario, setSelectedScenario] = useState(SCENARIO_OPTIONS[0]);
    const [expectedRpe, setExpectedRpe] = useState(8);
    const [loadProfile, setLoadProfile] = useState<LoadProfile>('mixta');
    const [selectedStaffIds, setSelectedStaffIds] = useState<string[]>(staff.slice(0, 3).map((person) => person.id));
    const [playerStatuses, setPlayerStatuses] = useState<Record<string, AttendanceState>>(() => buildInitialPlayerStatuses(players));
    const [venues, setVenues] = useState<ClubVenue[]>([]);
    const [pizarraPresets, setPizarraPresets] = useState<SavedPreset[]>([]);
    const [loadingVenues, setLoadingVenues] = useState(false);
    const [loadingPizarra, setLoadingPizarra] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    const selectedDivision = useMemo(
        () => divisions.find((division) => division.id === divisionId),
        [divisionId, divisions]
    );
    const selectedDivisionLabel = formatDivisionLabel(selectedDivision, clubName);

    const visiblePlayers = useMemo(() => {
        const scoped = players.filter((player) => matchesDivision(player, selectedDivision));
        return scoped.length > 0 ? scoped : players;
    }, [players, selectedDivision]);

    const visibleStaff = useMemo(() => {
        const scoped = staff.filter((person) => matchesDivision(person, selectedDivision));
        return scoped.length > 0 ? scoped : staff;
    }, [selectedDivision, staff]);
    const nextMatch = useMemo(
        () => findNextRelevantMatch(dashboardData.upcomingMatches, selectedDivision),
        [dashboardData.upcomingMatches, selectedDivision]
    );
    const nextMatchReference = useMemo(
        () => formatMatchReference(nextMatch),
        [nextMatch]
    );
    const primaryVenueName = useMemo(() => {
        const primaryVenue = venues.find((venue) => venue.is_primary);
        return primaryVenue?.name?.trim()
            || venues[0]?.name?.trim()
            || '';
    }, [venues]);
    const suggestedLocation = primaryVenueName || nextMatch?.venue?.trim() || '';
    const titleSuggestion = useMemo(
        () => buildSuggestedTrainingTitle(focus, selectedDivisionLabel, nextMatch),
        [focus, nextMatch, selectedDivisionLabel]
    );
    const objectiveSuggestion = useMemo(
        () => buildSuggestedObjective(focus, selectedDivisionLabel, nextMatch),
        [focus, nextMatch, selectedDivisionLabel]
    );

    const activeBlock = useMemo(
        () => blocks.find((block) => block.id === activeBlockId) ?? blocks[0] ?? null,
        [activeBlockId, blocks]
    );
    const totalBlockMinutes = useMemo(
        () => blocks.reduce((sum, block) => sum + block.duration, 0),
        [blocks]
    );
    const scheduledMinutes = useMemo(
        () => calculateMinutesBetween(startTime, endTime),
        [endTime, startTime]
    );
    const projectedLoad = expectedRpe * totalBlockMinutes;
    const selectedStaffNames = useMemo(
        () => visibleStaff
            .filter((person) => selectedStaffIds.includes(person.id))
            .map(getPersonName),
        [selectedStaffIds, visibleStaff]
    );
    const rosterPlayers = useMemo<TrainingPlayer[]>(
        () => visiblePlayers.map((player) => ({
            id: player.id,
            name: getPersonName(player),
            pos: player.position?.trim() || 'Sin puesto',
            divisionId: player.division_id || null,
            divisionName: player.division_name || null,
        })),
        [visiblePlayers]
    );
    const attendanceDraft = useMemo(() => {
        const next: Record<string, AttendanceState> = {};
        visiblePlayers.forEach((player) => {
            next[player.id] = playerStatuses[player.id] ?? 'confirmado';
        });
        return next;
    }, [playerStatuses, visiblePlayers]);
    const statusSummary = useMemo(() => {
        return visiblePlayers.reduce<Record<AttendanceState, number>>((acc, player) => {
            const status = playerStatuses[player.id] ?? 'confirmado';
            acc[status] += 1;
            return acc;
        }, {
            confirmado: 0,
            dudoso: 0,
            ausente: 0,
        });
    }, [playerStatuses, visiblePlayers]);
    const presetLibrary = useMemo<ExerciseLibraryItem[]>(
        () => pizarraPresets.map((preset) => ({
            id: preset.id,
            label: preset.name,
            summary: formatPresetSummary(preset),
            blockType: 'tactico',
        })),
        [pizarraPresets]
    );
    const activeBlockLibrary = useMemo(
        () => activeBlock
            ? presetLibrary.filter((item) => item.blockType === activeBlock.type || activeBlock.type === 'tactico')
            : presetLibrary,
        [activeBlock, presetLibrary]
    );

    useEffect(() => {
        if (!open || !clubId) {
            return;
        }

        let cancelled = false;

        const loadReferences = async () => {
            setLoadingVenues(true);
            setLoadingPizarra(true);

            try {
                const [venuesResponse, pizarraResponse] = await Promise.all([
                    fetch(`/api/clubs/${encodeURIComponent(clubId)}/venues`, {
                        cache: 'no-store',
                    }),
                    fetch(`/api/club-admin/pizarra?club=${encodeURIComponent(clubId)}&sport=${encodeURIComponent(sport?.trim() || 'rugby')}&view=presets`, {
                        cache: 'no-store',
                    }),
                ]);

                const venuePayload = await venuesResponse.json().catch(() => null) as {
                    data?: ClubVenue[];
                } | null;
                const pizarraPayload = await pizarraResponse.json().catch(() => null) as {
                    ok?: boolean;
                    data?: { savedPresets?: SavedPreset[] };
                } | null;

                if (!cancelled) {
                    setVenues(Array.isArray(venuePayload?.data) ? venuePayload.data : []);
                    setPizarraPresets(
                        Array.isArray(pizarraPayload?.data?.savedPresets)
                            ? pizarraPayload.data.savedPresets
                            : []
                    );
                }
            } catch {
                if (!cancelled) {
                    setVenues([]);
                    setPizarraPresets([]);
                }
            } finally {
                if (!cancelled) {
                    setLoadingVenues(false);
                    setLoadingPizarra(false);
                }
            }
        };

        void loadReferences();

        return () => {
            cancelled = true;
        };
    }, [clubId, open, sport]);

    useEffect(() => {
        if (!open) {
            return;
        }

        setFocus(initialFocus ?? 'mixto');
    }, [initialFocus, open]);

    if (!open) {
        return null;
    }

    const addGoal = () => {
        const nextGoal = goalInput.trim();
        if (!nextGoal) return;
        setSpecificGoals((prev) => [...prev, nextGoal]);
        setGoalInput('');
    };

    const addBlock = (type: PlanBlockType) => {
        const nextBlock: BlockDraft = {
            id: createId('block'),
            type,
            title: BLOCK_TYPE_LABELS[type],
            duration: type === 'warmup' ? 10 : 15,
            intensity: type === 'fisico' ? 'Alta' : type === 'warmup' ? 'Baja' : 'Media',
            coachId: selectedStaffIds[0] ?? visibleStaff[0]?.id ?? '',
            description: '',
            goal: '',
            equipment: '',
            scenario: type === 'tactico' ? selectedScenario : '',
            exerciseNames: [],
        };
        setBlocks((prev) => [...prev, nextBlock]);
        setActiveBlockId(nextBlock.id);
    };

    const updateBlock = (blockId: string, changes: Partial<BlockDraft>) => {
        setBlocks((prev) => prev.map((block) => (
            block.id === blockId
                ? { ...block, ...changes }
                : block
        )));
    };

    const moveBlock = (blockId: string, direction: 'up' | 'down') => {
        setBlocks((prev) => {
            const index = prev.findIndex((block) => block.id === blockId);
            if (index < 0) return prev;
            const target = direction === 'up' ? index - 1 : index + 1;
            if (target < 0 || target >= prev.length) return prev;
            return moveInArray(prev, index, target);
        });
    };

    const removeBlock = (blockId: string) => {
        setBlocks((prev) => prev.filter((block) => block.id !== blockId));
        if (activeBlockId === blockId) {
            setActiveBlockId((current) => {
                if (current !== blockId) return current;
                const nextBlock = blocks.find((block) => block.id !== blockId);
                return nextBlock?.id ?? '';
            });
        }
    };

    const toggleStaff = (staffId: string) => {
        setSelectedStaffIds((prev) => (
            prev.includes(staffId)
                ? prev.filter((id) => id !== staffId)
                : [...prev, staffId]
        ));
    };

    const addExerciseToActiveBlock = (exerciseLabel: string) => {
        if (!activeBlock) {
            const nextBlock: BlockDraft = {
                id: createId('block'),
                type: 'tactico',
                title: exerciseLabel,
                duration: 15,
                intensity: 'Media',
                coachId: selectedStaffIds[0] ?? visibleStaff[0]?.id ?? '',
                description: 'Recurso real vinculado desde la pizarra del club.',
                goal: `Trabajar ${exerciseLabel} dentro de la sesion.`,
                equipment: '',
                scenario: selectedScenario,
                exerciseNames: [exerciseLabel],
            };
            setBlocks((prev) => [...prev, nextBlock]);
            setActiveBlockId(nextBlock.id);
            return;
        }

        if (activeBlock.exerciseNames.includes(exerciseLabel)) return;
        updateBlock(activeBlock.id, {
            exerciseNames: [...activeBlock.exerciseNames, exerciseLabel],
        });
    };

    const removeExerciseFromBlock = (blockId: string, exerciseLabel: string) => {
        const block = blocks.find((entry) => entry.id === blockId);
        if (!block) return;
        updateBlock(blockId, {
            exerciseNames: block.exerciseNames.filter((entry) => entry !== exerciseLabel),
        });
    };

    const handleSubmit = async () => {
        const resolvedLocation = location.trim() || suggestedLocation;
        const resolvedTitle = title.trim();
        const resolvedObjective = objective.trim();

        if (!date || !startTime || !endTime || !resolvedLocation || !resolvedTitle || !resolvedObjective) {
            alert('Completa nombre, objetivo, fecha, horario y lugar reales antes de publicar.');
            return;
        }

        if (blocks.length === 0) {
            alert('Agrega al menos un bloque a la sesion.');
            return;
        }

        const focusMeta = FOCUS_OPTIONS.find((option) => option.id === focus);
        const phaseLabel = SEASON_PHASES.find((phase) => phase.id === seasonPhase)?.label ?? 'Planificada';
        const loadProfileLabel = LOAD_PROFILES.find((profile) => profile.id === loadProfile)?.label ?? loadProfile;
        const duration = (scheduledMinutes ?? totalBlockMinutes) || 60;
        const startDate = buildTrainingDate(date, startTime);
        const objectiveSummary = [
            resolvedObjective,
            specificGoals.length > 0 ? `Objetivos: ${specificGoals.join(', ')}` : null,
            selectedScenario ? `Situacion: ${selectedScenario}` : null,
        ]
            .filter(Boolean)
            .join(' • ');
        const normalizedSourceLabel = [
            phaseLabel,
            focusMeta?.label ?? 'Mixto',
            loadProfileLabel,
            nextMatch?.tournament?.name ?? null,
        ]
            .filter(Boolean)
            .join(' | ');
        const plan = blocks.map((block) => {
            const coachName = visibleStaff.find((person) => person.id === block.coachId);
            return buildPlanBlock(block, coachName ? getPersonName(coachName) : '');
        });

        const nextTraining: TrainingEntry = {
            id: `manual-${clubId}-${Date.now()}`,
            title: resolvedTitle,
            date: startDate,
            duration,
            type: focusMeta?.type ?? 'campo',
            sourceKind: 'manual',
            divisionId: divisionId || null,
            location: resolvedLocation,
            status: 'planificado',
            objective: objectiveSummary,
            staff: selectedStaffNames.length > 0 ? selectedStaffNames : visibleStaff.slice(0, 3).map(getPersonName),
            convocados: rosterPlayers.length,
            players: rosterPlayers,
            sourceLabel: `${phaseLabel} · ${focusMeta?.label ?? 'Mixto'} · ${loadProfile}`,
            plan: { blocks: plan },
            attendance: attendanceDraft,
        };
        nextTraining.sourceLabel = normalizedSourceLabel;
        nextTraining.sourceMatchId = nextMatch?.id ?? null;

        setSubmitting(true);
        const saved = await onCreate(nextTraining);
        setSubmitting(false);

        if (saved) {
            onClose();
        }
    };

    return (
        <div className="club-training-modal-overlay" onClick={onClose}>
            <div className="club-training-modal club-training-architect" onClick={(event) => event.stopPropagation()}>
                <div className="club-training-modal-header club-training-architect-header">
                    <div className="club-training-architect-copy">
                        <span className="club-training-architect-kicker">Performance training architect</span>
                        <div className="club-training-architect-title-row">
                            <div>
                                <h3>Nueva sesion de rendimiento</h3>
                                <p>Planifica objetivos, bloques, convocatoria y carga de {clubName} desde una sola superficie.</p>
                            </div>
                            <div className="club-training-architect-status">
                                <span>Planificado</span>
                                <strong>{scheduledMinutes ?? totalBlockMinutes} min</strong>
                            </div>
                        </div>
                    </div>
                    <button onClick={onClose} className="icon-btn" aria-label="Cerrar">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="club-training-modal-body club-training-architect-body">
                    <section className="club-training-architect-main">
                        <div className="club-training-architect-panel">
                            <div className="club-training-architect-panel-head">
                                <span className="club-training-form-label">01. Setup inicial</span>
                                <div className="club-training-architect-chip-row">
                                    {FOCUS_OPTIONS.map((option) => (
                                        <button
                                            key={option.id}
                                            type="button"
                                            className={`club-training-architect-chip${focus === option.id ? ' active' : ''}`}
                                            onClick={() => setFocus(option.id)}
                                        >
                                            {option.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div className="club-training-architect-grid">
                                <label className="club-training-architect-field">
                                    <span className="club-training-form-label"><Calendar className="w-3.5 h-3.5" /> Fecha</span>
                                    <input
                                        type="date"
                                        className="club-training-form-input"
                                        value={date}
                                        onChange={(event) => setDate(event.target.value)}
                                    />
                                </label>
                                <label className="club-training-architect-field">
                                    <span className="club-training-form-label"><Clock className="w-3.5 h-3.5" /> Hora inicio</span>
                                    <input
                                        type="time"
                                        className="club-training-form-input"
                                        value={startTime}
                                        onChange={(event) => setStartTime(event.target.value)}
                                    />
                                </label>
                                <label className="club-training-architect-field">
                                    <span className="club-training-form-label"><Clock className="w-3.5 h-3.5" /> Hora fin</span>
                                    <input
                                        type="time"
                                        className="club-training-form-input"
                                        value={endTime}
                                        onChange={(event) => setEndTime(event.target.value)}
                                    />
                                </label>
                                <label className="club-training-architect-field">
                                    <span className="club-training-form-label"><MapPin className="w-3.5 h-3.5" /> Lugar / cancha</span>
                                    <input
                                        list="club-training-venues"
                                        className="club-training-form-input"
                                        value={location}
                                        onChange={(event) => setLocation(event.target.value)}
                                        placeholder={suggestedLocation || 'Selecciona o escribe una sede real'}
                                    />
                                    <datalist id="club-training-venues">
                                        {venues.map((venue) => (
                                            <option key={venue.id} value={venue.name} />
                                        ))}
                                    </datalist>
                                    {suggestedLocation ? (
                                        <span className="club-training-architect-field-hint">
                                            {loadingVenues ? 'Buscando sedes del club...' : `Sugerida: ${suggestedLocation}`}
                                        </span>
                                    ) : null}
                                </label>
                                <label className="club-training-architect-field">
                                    <span className="club-training-form-label"><Shield className="w-3.5 h-3.5" /> Equipo / categoria</span>
                                    <select
                                        className="club-training-form-select"
                                        value={divisionId}
                                        onChange={(event) => setDivisionId(event.target.value)}
                                    >
                                        {divisions.length === 0 && <option value="">Plantel principal</option>}
                                        {divisions.map((division) => (
                                            <option key={division.id} value={division.id}>
                                                {formatDivisionLabel(division, clubName)}
                                            </option>
                                        ))}
                                    </select>
                                </label>
                                <label className="club-training-architect-field">
                                    <span className="club-training-form-label"><NotebookPen className="w-3.5 h-3.5" /> Nombre de la sesion</span>
                                    <input
                                        className="club-training-form-input"
                                        value={title}
                                        onChange={(event) => setTitle(event.target.value)}
                                        placeholder={titleSuggestion}
                                    />
                                </label>
                            </div>
                            {nextMatch ? (
                                <div className="club-training-architect-context-card">
                                    <strong>Contexto real de la division</strong>
                                    <span>{selectedDivisionLabel} vs {nextMatch.opponentShortName || nextMatch.opponentName || 'rival'}</span>
                                    <small>
                                        {[nextMatchReference, nextMatch.venue, nextMatch.tournament?.name].filter(Boolean).join(' | ')}
                                    </small>
                                </div>
                            ) : null}
                        </div>

                        <div className="club-training-architect-panel">
                            <div className="club-training-architect-panel-head">
                                <span className="club-training-form-label">02. Objetivo</span>
                                <div className="club-training-architect-chip-row">
                                    {SEASON_PHASES.map((phase) => (
                                        <button
                                            key={phase.id}
                                            type="button"
                                            className={`club-training-architect-chip${seasonPhase === phase.id ? ' active' : ''}`}
                                            onClick={() => setSeasonPhase(phase.id)}
                                        >
                                            {phase.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <label className="club-training-architect-field">
                                <span className="club-training-form-label"><Target className="w-3.5 h-3.5" /> Objetivo principal</span>
                                <textarea
                                    className="club-training-form-textarea"
                                    rows={3}
                                    value={objective}
                                    onChange={(event) => setObjective(event.target.value)}
                                    placeholder={objectiveSuggestion}
                                />
                            </label>
                            <div className="club-training-architect-subgrid">
                                <div className="club-training-architect-goals">
                                    <div className="club-training-architect-inline-head">
                                        <span className="club-training-form-label">Objetivos especificos</span>
                                        <span>{specificGoals.length} cargados</span>
                                    </div>
                                    <div className="club-training-architect-goal-input">
                                        <input
                                            className="club-training-form-input"
                                            value={goalInput}
                                            onChange={(event) => setGoalInput(event.target.value)}
                                            placeholder="Agregar foco puntual"
                                        />
                                        <button type="button" className="club-training-architect-add-btn" onClick={addGoal}>
                                            <Plus className="w-4 h-4" />
                                        </button>
                                    </div>
                                    <div className="club-training-architect-list">
                                        {specificGoals.length === 0 ? (
                                            <p className="club-training-architect-empty">Todavia no agregaste objetivos puntuales.</p>
                                        ) : specificGoals.map((goal) => (
                                            <button
                                                key={goal}
                                                type="button"
                                                className="club-training-architect-list-row"
                                                onClick={() => setSpecificGoals((prev) => prev.filter((item) => item !== goal))}
                                            >
                                                <span>{goal}</span>
                                                <Trash2 className="w-3.5 h-3.5" />
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div className="club-training-architect-scenarios">
                                    <div className="club-training-architect-inline-head">
                                        <span className="club-training-form-label">Situacion tactica</span>
                                        <span>Pizarra conectada</span>
                                    </div>
                                    <div className="club-training-architect-chip-grid">
                                        {SCENARIO_OPTIONS.map((scenario) => (
                                            <button
                                                key={scenario}
                                                type="button"
                                                className={`club-training-architect-chip${selectedScenario === scenario ? ' active' : ''}`}
                                                onClick={() => setSelectedScenario(scenario)}
                                            >
                                                {scenario}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="club-training-architect-panel club-training-architect-panel--timeline">
                            <div className="club-training-architect-panel-head">
                                <div>
                                    <span className="club-training-form-label">03. Secuencia de trabajo</span>
                                    <h4>Timeline de bloques y ejercicios</h4>
                                </div>
                                <div className="club-training-architect-summary">
                                    <span>Total bloques {blocks.length}</span>
                                    <strong>{totalBlockMinutes} min</strong>
                                </div>
                            </div>

                            <div className="club-training-architect-timeline">
                                {blocks.length === 0 ? (
                                    <div className="club-training-architect-empty">
                                        Agrega el primer bloque para construir la sesion con datos reales del staff y la pizarra del club.
                                    </div>
                                ) : null}
                                {blocks.map((block) => {
                                    const coachLabel = visibleStaff.find((person) => person.id === block.coachId);
                                    const isActive = activeBlock?.id === block.id;

                                    return (
                                        <article
                                            key={block.id}
                                            className={`club-training-architect-block${isActive ? ' active' : ''}`}
                                            onClick={() => setActiveBlockId(block.id)}
                                        >
                                            <div className="club-training-architect-block-time">
                                                <GripVerticalIcon />
                                                <strong>{block.duration} min</strong>
                                                <span>{BLOCK_TYPE_LABELS[block.type]}</span>
                                            </div>
                                            <div className="club-training-architect-block-body">
                                                <div className="club-training-architect-block-row">
                                                    <input
                                                        className="club-training-form-input"
                                                        value={block.title}
                                                        onChange={(event) => updateBlock(block.id, { title: event.target.value })}
                                                        placeholder="Nombre del bloque"
                                                    />
                                                    <div className="club-training-architect-block-actions">
                                                        <button type="button" className="club-training-architect-icon-btn" onClick={(event) => {
                                                            event.stopPropagation();
                                                            moveBlock(block.id, 'up');
                                                        }}>
                                                            <ArrowUp className="w-4 h-4" />
                                                        </button>
                                                        <button type="button" className="club-training-architect-icon-btn" onClick={(event) => {
                                                            event.stopPropagation();
                                                            moveBlock(block.id, 'down');
                                                        }}>
                                                            <ArrowDown className="w-4 h-4" />
                                                        </button>
                                                        <button type="button" className="club-training-architect-icon-btn danger" onClick={(event) => {
                                                            event.stopPropagation();
                                                            removeBlock(block.id);
                                                        }}>
                                                            <Trash2 className="w-4 h-4" />
                                                        </button>
                                                    </div>
                                                </div>
                                                <div className="club-training-architect-block-grid">
                                                    <label className="club-training-architect-field">
                                                        <span className="club-training-form-label">Tipo</span>
                                                        <select
                                                            className="club-training-form-select"
                                                            value={block.type}
                                                            onChange={(event) => updateBlock(block.id, { type: event.target.value as PlanBlockType })}
                                                        >
                                                            {Object.entries(BLOCK_TYPE_LABELS).map(([blockType, label]) => (
                                                                <option key={blockType} value={blockType}>{label}</option>
                                                            ))}
                                                        </select>
                                                    </label>
                                                    <label className="club-training-architect-field">
                                                        <span className="club-training-form-label">Duracion</span>
                                                        <input
                                                            type="number"
                                                            className="club-training-form-input"
                                                            value={block.duration}
                                                            onChange={(event) => updateBlock(block.id, { duration: Number(event.target.value) || 0 })}
                                                        />
                                                    </label>
                                                    <label className="club-training-architect-field">
                                                        <span className="club-training-form-label">Intensidad</span>
                                                        <select
                                                            className="club-training-form-select"
                                                            value={block.intensity || ''}
                                                            onChange={(event) => updateBlock(block.id, { intensity: event.target.value })}
                                                        >
                                                            <option value="">Seleccionar...</option>
                                                            <option value="Baja">Baja</option>
                                                            <option value="Media">Media</option>
                                                            <option value="Alta">Alta</option>
                                                        </select>
                                                    </label>
                                                    <label className="club-training-architect-field">
                                                        <span className="club-training-form-label">Responsable</span>
                                                        <select
                                                            className="club-training-form-select"
                                                            value={block.coachId}
                                                            onChange={(event) => updateBlock(block.id, { coachId: event.target.value })}
                                                        >
                                                            <option value="">Sin asignar</option>
                                                            {visibleStaff.map((person) => (
                                                                <option key={person.id} value={person.id}>{getPersonName(person)}</option>
                                                            ))}
                                                        </select>
                                                    </label>
                                                </div>
                                                <textarea
                                                    className="club-training-form-textarea"
                                                    rows={2}
                                                    value={block.description}
                                                    onChange={(event) => updateBlock(block.id, { description: event.target.value })}
                                                    placeholder="Descripcion corta del trabajo a realizar"
                                                />
                                                <div className="club-training-architect-block-grid">
                                                    <label className="club-training-architect-field">
                                                        <span className="club-training-form-label">Objetivo del bloque</span>
                                                        <input
                                                            className="club-training-form-input"
                                                            value={block.goal}
                                                            onChange={(event) => updateBlock(block.id, { goal: event.target.value })}
                                                            placeholder="Que tiene que salir de este tramo"
                                                        />
                                                    </label>
                                                    <label className="club-training-architect-field">
                                                        <span className="club-training-form-label">Material</span>
                                                        <input
                                                            className="club-training-form-input"
                                                            value={block.equipment}
                                                            onChange={(event) => updateBlock(block.id, { equipment: event.target.value })}
                                                            placeholder="Conos, escudos, bandas..."
                                                        />
                                                    </label>
                                                </div>
                                                <div className="club-training-architect-block-meta">
                                                    <span>{coachLabel ? getPersonName(coachLabel) : 'Sin coach asignado'}</span>
                                                    <span>{block.exerciseNames.length} ejercicios</span>
                                                    {block.scenario ? <span>{block.scenario}</span> : null}
                                                </div>
                                                {block.exerciseNames.length > 0 ? (
                                                    <div className="club-training-architect-pill-row">
                                                        {block.exerciseNames.map((exercise) => (
                                                            <button
                                                                key={exercise}
                                                                type="button"
                                                                className="club-training-architect-pill"
                                                                onClick={(event) => {
                                                                    event.stopPropagation();
                                                                    removeExerciseFromBlock(block.id, exercise);
                                                                }}
                                                            >
                                                                {exercise}
                                                                <X className="w-3 h-3" />
                                                            </button>
                                                        ))}
                                                    </div>
                                                ) : null}
                                            </div>
                                        </article>
                                    );
                                })}
                            </div>

                            <div className="club-training-architect-block-footer">
                                {(['warmup', 'tecnico', 'tactico', 'fisico', 'cierre'] as PlanBlockType[]).map((blockType) => (
                                    <button
                                        key={blockType}
                                        type="button"
                                        className="club-training-architect-add-block"
                                        onClick={() => addBlock(blockType)}
                                    >
                                        <Plus className="w-4 h-4" />
                                        {BLOCK_TYPE_LABELS[blockType]}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </section>

                    <aside className="club-training-architect-side">
                        <div className="club-training-architect-side-panel">
                            <span className="club-training-form-label">Carga proyectada</span>
                            <div className="club-training-architect-metric">
                                <div>
                                    <span>Intensidad global esperada</span>
                                    <strong>{expectedRpe}.0 / 10</strong>
                                </div>
                                <input
                                    type="range"
                                    min={1}
                                    max={10}
                                    value={expectedRpe}
                                    onChange={(event) => setExpectedRpe(Number(event.target.value))}
                                />
                            </div>
                            <div className="club-training-architect-side-grid">
                                {LOAD_PROFILES.map((profile) => (
                                    <button
                                        key={profile.id}
                                        type="button"
                                        className={`club-training-architect-chip${loadProfile === profile.id ? ' active' : ''}`}
                                        onClick={() => setLoadProfile(profile.id)}
                                    >
                                        {profile.label}
                                    </button>
                                ))}
                            </div>
                            <div className="club-training-architect-mini-stats">
                                <article>
                                    <span>Bloques</span>
                                    <strong>{blocks.length}</strong>
                                </article>
                                <article>
                                    <span>Minutos</span>
                                    <strong>{totalBlockMinutes}</strong>
                                </article>
                                <article>
                                    <span>Carga</span>
                                    <strong>{projectedLoad}</strong>
                                </article>
                            </div>
                            {scheduledMinutes && scheduledMinutes !== totalBlockMinutes ? (
                                <p className="club-training-architect-note">
                                    La agenda marca {scheduledMinutes} min y los bloques suman {totalBlockMinutes}. Ajusta horario o timeline.
                                </p>
                            ) : null}
                        </div>

                        <div className="club-training-architect-side-panel">
                            <div className="club-training-architect-inline-head">
                                <span className="club-training-form-label">Pizarra del club</span>
                                <span>{pizarraPresets.length} jugadas reales</span>
                            </div>
                            <div className="club-training-architect-pizarra">
                                <div className="club-training-architect-pizarra-preview">
                                    <Video className="w-5 h-5" />
                                    <strong>{selectedScenario}</strong>
                                    <span>
                                        {activeBlock
                                            ? `Bloque activo: ${BLOCK_TYPE_LABELS[activeBlock.type]}`
                                            : 'Si eliges una jugada sin bloque activo, creamos uno tactico automaticamente.'}
                                    </span>
                                </div>
                                <div className="club-training-architect-library">
                                    {loadingPizarra ? (
                                        <div className="club-training-architect-empty">Cargando jugadas guardadas del club...</div>
                                    ) : null}
                                    {!loadingPizarra && activeBlockLibrary.length === 0 ? (
                                        <div className="club-training-architect-empty">
                                            No hay jugadas guardadas en Pizarra para vincular todavia.
                                        </div>
                                    ) : null}
                                    {!loadingPizarra && activeBlockLibrary.map((exercise) => (
                                        <button
                                            key={exercise.id}
                                            type="button"
                                            className="club-training-architect-library-item"
                                            onClick={() => addExerciseToActiveBlock(exercise.label)}
                                        >
                                            <div>
                                                <strong>{exercise.label}</strong>
                                                <span>{exercise.summary}</span>
                                            </div>
                                            <ChevronRight className="w-4 h-4" />
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div className="club-training-architect-side-panel">
                            <div className="club-training-architect-inline-head">
                                <span className="club-training-form-label">Convocatoria</span>
                                <span>{visiblePlayers.length} jugadores</span>
                            </div>
                            <div className="club-training-architect-status-grid">
                                <article>
                                    <span>Disponibles</span>
                                    <strong>{statusSummary.confirmado}</strong>
                                </article>
                                <article>
                                    <span>Duda</span>
                                    <strong>{statusSummary.dudoso}</strong>
                                </article>
                                <article>
                                    <span>No disponibles</span>
                                    <strong>{statusSummary.ausente}</strong>
                                </article>
                            </div>
                            <div className="club-training-architect-player-list">
                                {visiblePlayers.map((player) => {
                                    const status = playerStatuses[player.id] ?? 'confirmado';
                                    return (
                                        <div key={player.id} className="club-training-architect-player-row">
                                            <div>
                                                <strong>{getPersonName(player)}</strong>
                                                <span>{player.position?.trim() || 'Sin puesto'}</span>
                                            </div>
                                            <div className="club-training-architect-player-actions">
                                                {(['confirmado', 'dudoso', 'ausente'] as AttendanceState[]).map((value) => (
                                                    <button
                                                        key={value}
                                                        type="button"
                                                        className={`club-training-architect-status-btn${status === value ? ' active' : ''}`}
                                                        onClick={() => setPlayerStatuses((prev) => ({ ...prev, [player.id]: value }))}
                                                    >
                                                        {value === 'confirmado' ? 'OK' : value === 'dudoso' ? 'Duda' : 'Out'}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            <div className="club-training-architect-inline-head">
                                <span className="club-training-form-label">Staff asignado</span>
                                <span>{selectedStaffNames.length} activos</span>
                            </div>
                            <div className="club-training-architect-pill-row">
                                {visibleStaff.map((person) => (
                                    <button
                                        key={person.id}
                                        type="button"
                                        className={`club-training-architect-pill${selectedStaffIds.includes(person.id) ? ' active' : ''}`}
                                        onClick={() => toggleStaff(person.id)}
                                    >
                                        {getPersonName(person)}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </aside>
                </div>

                <div className="club-training-modal-footer club-training-architect-footer">
                    <div className="club-training-architect-footer-copy">
                        <span>Input → proceso → output</span>
                        <strong>La sesion queda lista para plan, vivo y analisis post.</strong>
                    </div>
                    <div className="club-training-architect-footer-actions">
                        <button
                            type="button"
                            className="btn"
                            onClick={() => window.alert('TODO técnico: guardado de plantillas aún no implementado.')}
                        >
                            <ClipboardList className="w-4 h-4" />
                            Guardar plantilla
                        </button>
                        <button type="button" className="btn" onClick={onClose}>
                            Cancelar
                        </button>
                        <button
                            type="button"
                            className="btn btn-primary"
                            onClick={() => { void handleSubmit(); }}
                            disabled={submitting}
                        >
                            <Save className="w-4 h-4" />
                            {submitting ? 'Publicando...' : 'Confirmar y publicar'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

function GripVerticalIcon() {
    return <div className="club-training-architect-grip"><span /><span /><span /></div>;
}
