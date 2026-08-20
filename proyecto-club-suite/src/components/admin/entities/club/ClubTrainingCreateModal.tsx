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
    TrainingConditions,
    TrainingCustomField,
    TrainingEntry,
    TrainingExerciseDrill,
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
    targetRpe?: number;
    workRest?: string;
    color?: string;
    exercises: TrainingExerciseDrill[];
};

const INTENSITY_PRESETS = ['Muy baja', 'Baja', 'Media-baja', 'Media', 'Media-alta', 'Alta', 'Maxima'];

const TRAINING_COLORS: Array<{ id: string; label: string; value: string }> = [
    { id: 'cyan', label: 'Cyan', value: '#06b6d4' },
    { id: 'blue', label: 'Azul', value: '#3b82f6' },
    { id: 'green', label: 'Verde', value: '#22c55e' },
    { id: 'amber', label: 'Ambar', value: '#f59e0b' },
    { id: 'rose', label: 'Rosa', value: '#f43f5e' },
    { id: 'violet', label: 'Violeta', value: '#a855f7' },
    { id: 'slate', label: 'Neutro', value: '#94a3b8' },
];

const TRAINING_TEMPLATES_STORAGE_KEY = 'club-admin:training-templates:v1';

interface TrainingTemplate {
    id: string;
    name: string;
    updatedAt: string;
    snapshot: TrainingTemplateSnapshot;
}

interface TrainingTemplateSnapshot {
    title: string;
    focus: TrainingFocus;
    customFocus: string;
    objective: string;
    specificGoals: string[];
    selectedScenario: string;
    customScenarios: string[];
    expectedRpe: number;
    loadProfile: LoadProfile;
    seasonPhase: SeasonPhase;
    location: string;
    startTime: string;
    endTime: string;
    blocks: BlockDraft[];
    tags: string[];
    notes: string;
    color: string;
    conditions: TrainingConditions;
    customFields: TrainingCustomField[];
}

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

const ATTENDANCE_OPTIONS: Array<{ id: AttendanceState; label: string; shortLabel: string }> = [
    { id: 'presente', label: 'Presente', shortLabel: 'Pres' },
    { id: 'ausente', label: 'Ausente', shortLabel: 'Out' },
    { id: 'tarde', label: 'Tarde', shortLabel: 'Tarde' },
    { id: 'lesionado', label: 'Lesionado', shortLabel: 'Les' },
    { id: 'justificado', label: 'Justificado', shortLabel: 'Just' },
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

function RequiredMark() {
    return (
        <span
            aria-hidden="true"
            style={{ color: 'var(--ca-danger)', marginLeft: 2, fontWeight: 700 }}
        >
            *
        </span>
    );
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
    return Object.fromEntries(players.map((player) => [player.id, 'presente' as const]));
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

function describeExerciseDrill(drill: TrainingExerciseDrill) {
    const parts: string[] = [drill.name];
    if (drill.sets && drill.reps) parts.push(`${drill.sets}x${drill.reps}`);
    else if (drill.sets) parts.push(`${drill.sets} series`);
    else if (drill.reps) parts.push(`${drill.reps} reps`);
    if (drill.duration) parts.push(`${drill.duration} min`);
    if (drill.distance) parts.push(`${drill.distance} m`);
    if (drill.equipment) parts.push(drill.equipment);
    if (drill.notes) parts.push(`(${drill.notes})`);
    return parts.join(' / ');
}

function buildPlanBlock(block: BlockDraft, coachName: string): PlanBlock {
    const drillSummary = block.exercises.length > 0
        ? block.exercises.map(describeExerciseDrill).join(' | ')
        : null;
    const notes = [
        block.description,
        block.goal ? `Objetivo: ${block.goal}` : null,
        drillSummary ? `Drills: ${drillSummary}` : null,
        block.exerciseNames.length > 0 ? `Ejercicios: ${block.exerciseNames.join(', ')}` : null,
        block.equipment ? `Material: ${block.equipment}` : null,
        block.scenario ? `Situacion: ${block.scenario}` : null,
        block.workRest ? `Trabajo/Pausa: ${block.workRest}` : null,
        typeof block.targetRpe === 'number' ? `RPE objetivo: ${block.targetRpe}/10` : null,
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
        targetRpe: block.targetRpe,
        workRest: block.workRest?.trim() || undefined,
        color: block.color,
        exercises: block.exercises.length > 0 ? block.exercises : undefined,
    };
}

function loadTemplatesFromStorage(): TrainingTemplate[] {
    if (typeof window === 'undefined') return [];
    try {
        const raw = window.localStorage.getItem(TRAINING_TEMPLATES_STORAGE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed.filter((entry): entry is TrainingTemplate => (
            entry && typeof entry === 'object'
            && typeof entry.id === 'string'
            && typeof entry.name === 'string'
            && entry.snapshot && typeof entry.snapshot === 'object'
        ));
    } catch {
        return [];
    }
}

function saveTemplatesToStorage(templates: TrainingTemplate[]) {
    if (typeof window === 'undefined') return;
    try {
        window.localStorage.setItem(TRAINING_TEMPLATES_STORAGE_KEY, JSON.stringify(templates));
    } catch {
        // ignore quota errors
    }
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
    const [customFocus, setCustomFocus] = useState('');
    const [customScenarios, setCustomScenarios] = useState<string[]>([]);
    const [scenarioInput, setScenarioInput] = useState('');
    const [tags, setTags] = useState<string[]>([]);
    const [tagInput, setTagInput] = useState('');
    const [notes, setNotes] = useState('');
    const [color, setColor] = useState<string>(TRAINING_COLORS[0].value);
    const [conditions, setConditions] = useState<TrainingConditions>({ weather: '', temperature: '', field: '' });
    const [customFields, setCustomFields] = useState<TrainingCustomField[]>([]);
    const [customFieldKey, setCustomFieldKey] = useState('');
    const [customFieldValue, setCustomFieldValue] = useState('');
    const [templates, setTemplates] = useState<TrainingTemplate[]>([]);
    const [templateNameDraft, setTemplateNameDraft] = useState('');
    const [pickedTemplateId, setPickedTemplateId] = useState('');
    const [submitError, setSubmitError] = useState<string | null>(null);

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
            next[player.id] = playerStatuses[player.id] ?? 'presente';
        });
        return next;
    }, [playerStatuses, visiblePlayers]);
    const statusSummary = useMemo(() => {
        return visiblePlayers.reduce<Record<'presente' | 'ausente' | 'tarde' | 'lesionado' | 'justificado', number>>((acc, player) => {
            const status = playerStatuses[player.id] ?? 'presente';
            if (status === 'confirmado') {
                acc.presente += 1;
                return acc;
            }
            if (status === 'dudoso') {
                acc.justificado += 1;
                return acc;
            }
            acc[status] += 1;
            return acc;
        }, {
            presente: 0,
            ausente: 0,
            tarde: 0,
            lesionado: 0,
            justificado: 0,
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

    const requirements = useMemo(() => {
        const resolvedLocation = (location.trim() || suggestedLocation || '').trim();
        return [
            { id: 'title', label: 'Nombre de la sesión', met: title.trim().length > 0 },
            { id: 'objective', label: 'Objetivo principal', met: objective.trim().length > 0 },
            { id: 'date', label: 'Fecha', met: Boolean(date) },
            { id: 'startTime', label: 'Hora inicio', met: Boolean(startTime) },
            { id: 'endTime', label: 'Hora fin', met: Boolean(endTime) },
            { id: 'location', label: 'Lugar / cancha', met: resolvedLocation.length > 0 },
            { id: 'blocks', label: 'Al menos 1 bloque', met: blocks.length > 0 },
        ];
    }, [title, objective, date, startTime, endTime, location, suggestedLocation, blocks.length]);
    const missingRequirements = useMemo(
        () => requirements.filter((req) => !req.met),
        [requirements]
    );
    const isPublishable = missingRequirements.length === 0;

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

    useEffect(() => {
        if (!open) return;
        setTemplates(loadTemplatesFromStorage());
    }, [open]);

    if (!open) {
        return null;
    }

    const addGoal = () => {
        const nextGoal = goalInput.trim();
        if (!nextGoal) return;
        setSpecificGoals((prev) => [...prev, nextGoal]);
        setGoalInput('');
    };

    const addTag = () => {
        const next = tagInput.trim();
        if (!next) return;
        setTags((prev) => prev.includes(next) ? prev : [...prev, next]);
        setTagInput('');
    };

    const removeTag = (value: string) => {
        setTags((prev) => prev.filter((entry) => entry !== value));
    };

    const addScenario = () => {
        const next = scenarioInput.trim();
        if (!next) return;
        setCustomScenarios((prev) => prev.includes(next) ? prev : [...prev, next]);
        setSelectedScenario(next);
        setScenarioInput('');
    };

    const addCustomField = () => {
        const key = customFieldKey.trim();
        if (!key) return;
        const value = customFieldValue.trim();
        setCustomFields((prev) => [
            ...prev.filter((entry) => entry.key !== key),
            { key, value },
        ]);
        setCustomFieldKey('');
        setCustomFieldValue('');
    };

    const removeCustomField = (key: string) => {
        setCustomFields((prev) => prev.filter((entry) => entry.key !== key));
    };

    const addExerciseDrill = (blockId: string) => {
        const drill: TrainingExerciseDrill = {
            id: createId('drill'),
            name: 'Nuevo ejercicio',
        };
        setBlocks((prev) => prev.map((block) => (
            block.id === blockId
                ? { ...block, exercises: [...block.exercises, drill] }
                : block
        )));
    };

    const updateExerciseDrill = (blockId: string, drillId: string, changes: Partial<TrainingExerciseDrill>) => {
        setBlocks((prev) => prev.map((block) => (
            block.id === blockId
                ? {
                    ...block,
                    exercises: block.exercises.map((drill) => (
                        drill.id === drillId ? { ...drill, ...changes } : drill
                    )),
                }
                : block
        )));
    };

    const removeExerciseDrill = (blockId: string, drillId: string) => {
        setBlocks((prev) => prev.map((block) => (
            block.id === blockId
                ? { ...block, exercises: block.exercises.filter((drill) => drill.id !== drillId) }
                : block
        )));
    };

    const buildCurrentSnapshot = (): TrainingTemplateSnapshot => ({
        title,
        focus,
        customFocus,
        objective,
        specificGoals,
        selectedScenario,
        customScenarios,
        expectedRpe,
        loadProfile,
        seasonPhase,
        location,
        startTime,
        endTime,
        blocks,
        tags,
        notes,
        color,
        conditions,
        customFields,
    });

    const applySnapshot = (snapshot: TrainingTemplateSnapshot) => {
        setTitle(snapshot.title || '');
        setFocus(snapshot.focus || 'mixto');
        setCustomFocus(snapshot.customFocus || '');
        setObjective(snapshot.objective || '');
        setSpecificGoals(snapshot.specificGoals || []);
        setSelectedScenario(snapshot.selectedScenario || SCENARIO_OPTIONS[0]);
        setCustomScenarios(snapshot.customScenarios || []);
        setExpectedRpe(snapshot.expectedRpe ?? 8);
        setLoadProfile(snapshot.loadProfile || 'mixta');
        setSeasonPhase(snapshot.seasonPhase || 'competencia');
        setLocation(snapshot.location || '');
        setStartTime(snapshot.startTime || '18:00');
        setEndTime(snapshot.endTime || '19:20');
        setBlocks(
            (snapshot.blocks || []).map((block) => ({
                ...block,
                id: createId('block'),
                exercises: (block.exercises || []).map((drill) => ({
                    ...drill,
                    id: createId('drill'),
                })),
            }))
        );
        setTags(snapshot.tags || []);
        setNotes(snapshot.notes || '');
        setColor(snapshot.color || TRAINING_COLORS[0].value);
        setConditions(snapshot.conditions || { weather: '', temperature: '', field: '' });
        setCustomFields(snapshot.customFields || []);
    };

    const handleSaveTemplate = () => {
        const name = templateNameDraft.trim();
        if (!name) {
            window.alert('Asigna un nombre a la plantilla antes de guardar.');
            return;
        }
        const next: TrainingTemplate = {
            id: createId('tpl'),
            name,
            updatedAt: new Date().toISOString(),
            snapshot: buildCurrentSnapshot(),
        };
        const merged = [
            ...templates.filter((entry) => entry.name.toLowerCase() !== name.toLowerCase()),
            next,
        ];
        setTemplates(merged);
        saveTemplatesToStorage(merged);
        setTemplateNameDraft('');
    };

    const handleLoadTemplate = (templateId: string) => {
        setPickedTemplateId(templateId);
        if (!templateId) return;
        const template = templates.find((entry) => entry.id === templateId);
        if (!template) return;
        applySnapshot(template.snapshot);
    };

    const handleDeleteTemplate = (templateId: string) => {
        const filtered = templates.filter((entry) => entry.id !== templateId);
        setTemplates(filtered);
        saveTemplatesToStorage(filtered);
        if (pickedTemplateId === templateId) {
            setPickedTemplateId('');
        }
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
            targetRpe: type === 'fisico' ? 8 : type === 'warmup' ? 4 : 6,
            workRest: '',
            color: undefined,
            exercises: [],
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
                targetRpe: 6,
                workRest: '',
                color: undefined,
                exercises: [],
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
        setSubmitError(null);
        const resolvedLocation = location.trim() || suggestedLocation;
        const resolvedTitle = title.trim();
        const resolvedObjective = objective.trim();

        const missing: string[] = [];
        if (!resolvedTitle) missing.push('Nombre de la sesion');
        if (!resolvedObjective) missing.push('Objetivo principal');
        if (!date) missing.push('Fecha');
        if (!startTime) missing.push('Hora inicio');
        if (!endTime) missing.push('Hora fin');
        if (!resolvedLocation) missing.push('Lugar / cancha');

        if (missing.length > 0) {
            setSubmitError(`Faltan datos: ${missing.join(', ')}.`);
            return;
        }

        if (blocks.length === 0) {
            setSubmitError('Agrega al menos un bloque a la sesion antes de publicar.');
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

        const trimmedNotes = notes.trim();
        const trimmedCustomFocus = customFocus.trim();
        const cleanCustomFields = customFields.filter((entry) => entry.key.trim().length > 0);
        const cleanedConditions = (() => {
            const next: TrainingConditions = {};
            if (conditions.weather?.trim()) next.weather = conditions.weather.trim();
            if (conditions.temperature?.trim()) next.temperature = conditions.temperature.trim();
            if (conditions.field?.trim()) next.field = conditions.field.trim();
            return Object.keys(next).length > 0 ? next : undefined;
        })();

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
            tags: tags.length > 0 ? tags : undefined,
            notes: trimmedNotes || undefined,
            color,
            customFocus: trimmedCustomFocus || undefined,
            conditions: cleanedConditions,
            customFields: cleanCustomFields.length > 0 ? cleanCustomFields : undefined,
        };
        nextTraining.sourceLabel = normalizedSourceLabel;
        nextTraining.sourceMatchId = nextMatch?.id ?? null;

        setSubmitting(true);
        try {
            const saved = await onCreate(nextTraining);
            if (saved) {
                onClose();
            } else {
                setSubmitError('No se pudo publicar el entrenamiento. Reintenta o revisa la conexion con el servidor.');
            }
        } catch (error) {
            setSubmitError(error instanceof Error ? error.message : 'Error inesperado al publicar el entrenamiento.');
        } finally {
            setSubmitting(false);
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
                                    <input
                                        className="club-training-form-input"
                                        style={{ width: 160, padding: '4px 10px', fontSize: '0.78rem' }}
                                        placeholder="Foco personalizado..."
                                        value={customFocus}
                                        onChange={(event) => setCustomFocus(event.target.value)}
                                    />
                                </div>
                            </div>
                            <div className="club-training-architect-grid">
                                <label className="club-training-architect-field">
                                    <span className="club-training-form-label"><Calendar className="w-3.5 h-3.5" /> Fecha<RequiredMark /></span>
                                    <input
                                        type="date"
                                        className="club-training-form-input"
                                        value={date}
                                        onChange={(event) => setDate(event.target.value)}
                                        required
                                        aria-required="true"
                                    />
                                </label>
                                <label className="club-training-architect-field">
                                    <span className="club-training-form-label"><Clock className="w-3.5 h-3.5" /> Hora inicio<RequiredMark /></span>
                                    <input
                                        type="time"
                                        className="club-training-form-input"
                                        value={startTime}
                                        onChange={(event) => setStartTime(event.target.value)}
                                        required
                                        aria-required="true"
                                    />
                                </label>
                                <label className="club-training-architect-field">
                                    <span className="club-training-form-label"><Clock className="w-3.5 h-3.5" /> Hora fin<RequiredMark /></span>
                                    <input
                                        type="time"
                                        className="club-training-form-input"
                                        value={endTime}
                                        onChange={(event) => setEndTime(event.target.value)}
                                        required
                                        aria-required="true"
                                    />
                                </label>
                                <label className="club-training-architect-field">
                                    <span className="club-training-form-label"><MapPin className="w-3.5 h-3.5" /> Lugar / cancha<RequiredMark /></span>
                                    <input
                                        list="club-training-venues"
                                        className="club-training-form-input"
                                        value={location}
                                        onChange={(event) => setLocation(event.target.value)}
                                        placeholder={suggestedLocation || 'Selecciona o escribe una sede real'}
                                        aria-required="true"
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
                                    <span className="club-training-form-label"><NotebookPen className="w-3.5 h-3.5" /> Nombre de la sesion<RequiredMark /></span>
                                    <input
                                        className="club-training-form-input"
                                        value={title}
                                        onChange={(event) => setTitle(event.target.value)}
                                        placeholder={titleSuggestion}
                                        required
                                        aria-required="true"
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
                                <span className="club-training-form-label"><Target className="w-3.5 h-3.5" /> Objetivo principal<RequiredMark /></span>
                                <textarea
                                    className="club-training-form-textarea"
                                    rows={3}
                                    value={objective}
                                    onChange={(event) => setObjective(event.target.value)}
                                    placeholder={objectiveSuggestion}
                                    required
                                    aria-required="true"
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
                                        {[...SCENARIO_OPTIONS, ...customScenarios].map((scenario) => (
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
                                    <div className="club-training-architect-goal-input" style={{ marginTop: 8 }}>
                                        <input
                                            className="club-training-form-input"
                                            value={scenarioInput}
                                            onChange={(event) => setScenarioInput(event.target.value)}
                                            onKeyDown={(event) => {
                                                if (event.key === 'Enter') {
                                                    event.preventDefault();
                                                    addScenario();
                                                }
                                            }}
                                            placeholder="Crear nueva situacion..."
                                        />
                                        <button type="button" className="club-training-architect-add-btn" onClick={addScenario}>
                                            <Plus className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="club-training-architect-panel">
                            <div className="club-training-architect-panel-head">
                                <span className="club-training-form-label">03. Personalizacion</span>
                                <div className="club-training-architect-chip-row">
                                    {TRAINING_COLORS.map((option) => (
                                        <button
                                            key={option.id}
                                            type="button"
                                            className={`club-training-architect-chip${color === option.value ? ' active' : ''}`}
                                            onClick={() => setColor(option.value)}
                                            style={{
                                                borderColor: color === option.value ? option.value : undefined,
                                                color: color === option.value ? option.value : undefined,
                                            }}
                                            title={option.label}
                                        >
                                            <span style={{
                                                display: 'inline-block',
                                                width: 10,
                                                height: 10,
                                                background: option.value,
                                                borderRadius: '50%',
                                                marginRight: 6,
                                                verticalAlign: '-1px',
                                            }} />
                                            {option.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="club-training-architect-subgrid">
                                <div className="club-training-architect-goals">
                                    <div className="club-training-architect-inline-head">
                                        <span className="club-training-form-label">Tags</span>
                                        <span>{tags.length} cargados</span>
                                    </div>
                                    <div className="club-training-architect-goal-input">
                                        <input
                                            className="club-training-form-input"
                                            value={tagInput}
                                            onChange={(event) => setTagInput(event.target.value)}
                                            onKeyDown={(event) => {
                                                if (event.key === 'Enter') {
                                                    event.preventDefault();
                                                    addTag();
                                                }
                                            }}
                                            placeholder="Etiqueta libre (clima, intensidad, fase...)"
                                        />
                                        <button type="button" className="club-training-architect-add-btn" onClick={addTag}>
                                            <Plus className="w-4 h-4" />
                                        </button>
                                    </div>
                                    <div className="club-training-architect-pill-row">
                                        {tags.length === 0 ? (
                                            <p className="club-training-architect-empty">Suma tags para clasificar y filtrar despues.</p>
                                        ) : tags.map((tag) => (
                                            <button
                                                key={tag}
                                                type="button"
                                                className="club-training-architect-pill"
                                                onClick={() => removeTag(tag)}
                                            >
                                                {tag}
                                                <X className="w-3 h-3" />
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <label className="club-training-architect-field">
                                    <span className="club-training-form-label"><NotebookPen className="w-3.5 h-3.5" /> Notas / observaciones</span>
                                    <textarea
                                        className="club-training-form-textarea"
                                        rows={4}
                                        value={notes}
                                        onChange={(event) => setNotes(event.target.value)}
                                        placeholder="Comentarios libres del cuerpo tecnico, recordatorios, alertas medicas..."
                                    />
                                </label>
                            </div>

                            <div className="club-training-architect-conditions">
                                <span className="club-training-form-label">Condiciones</span>
                                <div className="club-training-architect-conditions-grid">
                                    <label className="club-training-architect-field">
                                        <span className="club-training-form-label">Clima</span>
                                        <input
                                            className="club-training-form-input"
                                            value={conditions.weather || ''}
                                            onChange={(event) => setConditions((prev) => ({ ...prev, weather: event.target.value }))}
                                            placeholder="Soleado, lluvia, viento..."
                                        />
                                    </label>
                                    <label className="club-training-architect-field">
                                        <span className="club-training-form-label">Temperatura</span>
                                        <input
                                            className="club-training-form-input"
                                            value={conditions.temperature || ''}
                                            onChange={(event) => setConditions((prev) => ({ ...prev, temperature: event.target.value }))}
                                            placeholder="22 C"
                                        />
                                    </label>
                                    <label className="club-training-architect-field">
                                        <span className="club-training-form-label">Estado de la cancha</span>
                                        <input
                                            className="club-training-form-input"
                                            value={conditions.field || ''}
                                            onChange={(event) => setConditions((prev) => ({ ...prev, field: event.target.value }))}
                                            placeholder="Optima, mojada, dura..."
                                        />
                                    </label>
                                </div>
                            </div>

                            <details
                                className="club-training-architect-details"
                                open={customFields.length > 0}
                            >
                                <summary>
                                    <span className="club-training-form-label">Campos personalizados</span>
                                    <span className="club-training-architect-details-count">{customFields.length} cargados</span>
                                </summary>
                                <div className="club-training-architect-details-body">
                                    <div className="club-training-architect-block-grid" style={{ gridTemplateColumns: '1fr 1fr 36px' }}>
                                        <input
                                            className="club-training-form-input"
                                            value={customFieldKey}
                                            onChange={(event) => setCustomFieldKey(event.target.value)}
                                            placeholder="Etiqueta (ej: Periodizacion)"
                                        />
                                        <input
                                            className="club-training-form-input"
                                            value={customFieldValue}
                                            onChange={(event) => setCustomFieldValue(event.target.value)}
                                            placeholder="Valor (ej: Bloque 2 / Microciclo 4)"
                                        />
                                        <button type="button" className="club-training-architect-add-btn" onClick={addCustomField} title="Agregar campo">
                                            <Plus className="w-4 h-4" />
                                        </button>
                                    </div>
                                    {customFields.length > 0 ? (
                                        <div className="club-training-architect-list">
                                            {customFields.map((entry) => (
                                                <div
                                                    key={entry.key}
                                                    className="club-training-architect-list-row"
                                                    style={{ cursor: 'default' }}
                                                >
                                                    <span><strong>{entry.key}:</strong> {entry.value || '—'}</span>
                                                    <button
                                                        type="button"
                                                        className="club-training-architect-icon-btn danger"
                                                        onClick={() => removeCustomField(entry.key)}
                                                        title="Quitar"
                                                    >
                                                        <Trash2 className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    ) : null}
                                </div>
                            </details>
                        </div>

                        <div className="club-training-architect-panel club-training-architect-panel--timeline">
                            <div className="club-training-architect-panel-head">
                                <div>
                                    <span className="club-training-form-label">04. Secuencia de trabajo</span>
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
                                    const totalDrills = block.exercises.length + block.exerciseNames.length;

                                    if (!isActive) {
                                        return (
                                            <article
                                                key={block.id}
                                                className="club-training-architect-block club-training-architect-block--collapsed"
                                                onClick={() => setActiveBlockId(block.id)}
                                            >
                                                <div className="club-training-architect-block-time">
                                                    <GripVerticalIcon />
                                                    <strong>{block.duration} min</strong>
                                                    <span>{BLOCK_TYPE_LABELS[block.type]}</span>
                                                </div>
                                                <div className="club-training-architect-block-collapsed-body">
                                                    <div className="club-training-architect-block-collapsed-head">
                                                        <strong>{block.title || BLOCK_TYPE_LABELS[block.type]}</strong>
                                                        <div
                                                            className="club-training-architect-block-actions"
                                                            onClick={(event) => event.stopPropagation()}
                                                        >
                                                            <button type="button" className="club-training-architect-icon-btn" onClick={() => moveBlock(block.id, 'up')}>
                                                                <ArrowUp className="w-4 h-4" />
                                                            </button>
                                                            <button type="button" className="club-training-architect-icon-btn" onClick={() => moveBlock(block.id, 'down')}>
                                                                <ArrowDown className="w-4 h-4" />
                                                            </button>
                                                            <button type="button" className="club-training-architect-icon-btn danger" onClick={() => removeBlock(block.id)}>
                                                                <Trash2 className="w-4 h-4" />
                                                            </button>
                                                        </div>
                                                    </div>
                                                    <div className="club-training-architect-block-meta">
                                                        {block.intensity ? <span>{block.intensity}</span> : null}
                                                        <span>{coachLabel ? getPersonName(coachLabel) : 'Sin coach'}</span>
                                                        <span>{totalDrills} ejercicios</span>
                                                        {typeof block.targetRpe === 'number' ? <span>RPE {block.targetRpe}/10</span> : null}
                                                        {block.workRest ? <span>{block.workRest}</span> : null}
                                                    </div>
                                                </div>
                                            </article>
                                        );
                                    }

                                    return (
                                        <article
                                            key={block.id}
                                            className="club-training-architect-block active"
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
                                                        <input
                                                            list={`intensity-presets-${block.id}`}
                                                            className="club-training-form-input"
                                                            value={block.intensity || ''}
                                                            onChange={(event) => updateBlock(block.id, { intensity: event.target.value })}
                                                            placeholder="Personalizada o preset..."
                                                        />
                                                        <datalist id={`intensity-presets-${block.id}`}>
                                                            {INTENSITY_PRESETS.map((preset) => (
                                                                <option key={preset} value={preset} />
                                                            ))}
                                                        </datalist>
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
                                                <div className="club-training-architect-block-grid">
                                                    <label className="club-training-architect-field">
                                                        <span className="club-training-form-label">RPE objetivo (1-10)</span>
                                                        <input
                                                            type="number"
                                                            min={1}
                                                            max={10}
                                                            className="club-training-form-input"
                                                            value={block.targetRpe ?? ''}
                                                            onChange={(event) => {
                                                                const next = Number(event.target.value);
                                                                updateBlock(block.id, {
                                                                    targetRpe: Number.isFinite(next) && next > 0 ? Math.min(10, Math.max(1, next)) : undefined,
                                                                });
                                                            }}
                                                            placeholder="Esfuerzo esperado"
                                                        />
                                                    </label>
                                                    <label className="club-training-architect-field">
                                                        <span className="club-training-form-label">Trabajo / Pausa</span>
                                                        <input
                                                            className="club-training-form-input"
                                                            value={block.workRest || ''}
                                                            onChange={(event) => updateBlock(block.id, { workRest: event.target.value })}
                                                            placeholder="Ej: 30s/15s o 4x4'/2'"
                                                        />
                                                    </label>
                                                </div>

                                                <div className="club-training-architect-inline-head" style={{ marginTop: 4 }}>
                                                    <span className="club-training-form-label">Ejercicios detallados</span>
                                                    <button
                                                        type="button"
                                                        className="club-training-architect-add-btn"
                                                        onClick={(event) => {
                                                            event.stopPropagation();
                                                            addExerciseDrill(block.id);
                                                        }}
                                                    >
                                                        <Plus className="w-4 h-4" />
                                                    </button>
                                                </div>
                                                {block.exercises.length === 0 ? (
                                                    <p className="club-training-architect-empty">Sin drills cargados. Suma series, reps o distancia para detallarlo.</p>
                                                ) : (
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                                        {block.exercises.map((drill) => (
                                                            <div
                                                                key={drill.id}
                                                                style={{
                                                                    display: 'grid',
                                                                    gridTemplateColumns: '2fr 60px 60px 70px 70px 1fr 28px',
                                                                    gap: 4,
                                                                    alignItems: 'center',
                                                                    background: 'var(--ca-surface-hover)',
                                                                    border: '1px solid var(--ca-border)',
                                                                    padding: 4,
                                                                    borderRadius: 6,
                                                                }}
                                                                onClick={(event) => event.stopPropagation()}
                                                            >
                                                                <input
                                                                    className="club-training-form-input"
                                                                    value={drill.name}
                                                                    onChange={(event) => updateExerciseDrill(block.id, drill.id, { name: event.target.value })}
                                                                    placeholder="Nombre del drill"
                                                                />
                                                                <input
                                                                    type="number"
                                                                    className="club-training-form-input"
                                                                    value={drill.sets ?? ''}
                                                                    onChange={(event) => updateExerciseDrill(block.id, drill.id, { sets: Number(event.target.value) || undefined })}
                                                                    placeholder="Sets"
                                                                />
                                                                <input
                                                                    type="number"
                                                                    className="club-training-form-input"
                                                                    value={drill.reps ?? ''}
                                                                    onChange={(event) => updateExerciseDrill(block.id, drill.id, { reps: Number(event.target.value) || undefined })}
                                                                    placeholder="Reps"
                                                                />
                                                                <input
                                                                    type="number"
                                                                    className="club-training-form-input"
                                                                    value={drill.duration ?? ''}
                                                                    onChange={(event) => updateExerciseDrill(block.id, drill.id, { duration: Number(event.target.value) || undefined })}
                                                                    placeholder="Min"
                                                                />
                                                                <input
                                                                    type="number"
                                                                    className="club-training-form-input"
                                                                    value={drill.distance ?? ''}
                                                                    onChange={(event) => updateExerciseDrill(block.id, drill.id, { distance: Number(event.target.value) || undefined })}
                                                                    placeholder="Mts"
                                                                />
                                                                <input
                                                                    className="club-training-form-input"
                                                                    value={drill.notes || ''}
                                                                    onChange={(event) => updateExerciseDrill(block.id, drill.id, { notes: event.target.value })}
                                                                    placeholder="Notas / material"
                                                                />
                                                                <button
                                                                    type="button"
                                                                    className="club-training-architect-icon-btn danger"
                                                                    onClick={() => removeExerciseDrill(block.id, drill.id)}
                                                                    title="Quitar"
                                                                >
                                                                    <Trash2 className="w-3.5 h-3.5" />
                                                                </button>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}

                                                <div className="club-training-architect-block-meta">
                                                    <span>{coachLabel ? getPersonName(coachLabel) : 'Sin coach asignado'}</span>
                                                    <span>{block.exerciseNames.length + block.exercises.length} ejercicios</span>
                                                    {block.scenario ? <span>{block.scenario}</span> : null}
                                                    {typeof block.targetRpe === 'number' ? <span>RPE {block.targetRpe}/10</span> : null}
                                                    {block.workRest ? <span>{block.workRest}</span> : null}
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
                        <div className="club-training-architect-side-panel club-training-architect-checklist-panel">
                            <div className="club-training-architect-inline-head">
                                <span className="club-training-form-label">Listo para publicar</span>
                                <span>{requirements.length - missingRequirements.length}/{requirements.length}</span>
                            </div>
                            <ul className="club-training-architect-checklist">
                                {requirements.map((req) => (
                                    <li
                                        key={req.id}
                                        className={`club-training-architect-check-item${req.met ? ' done' : ''}`}
                                    >
                                        <span className="club-training-architect-check-mark" aria-hidden="true">
                                            {req.met ? '✓' : '○'}
                                        </span>
                                        <span>{req.label}</span>
                                    </li>
                                ))}
                            </ul>
                            <p className="club-training-architect-note">
                                {isPublishable
                                    ? 'Todos los obligatorios completos. Podés publicar la sesión.'
                                    : `Faltan ${missingRequirements.length} campo${missingRequirements.length === 1 ? '' : 's'} para publicar.`}
                            </p>
                        </div>

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
                                    <strong>{statusSummary.presente + statusSummary.tarde}</strong>
                                </article>
                                <article>
                                    <span>Lesionados</span>
                                    <strong>{statusSummary.lesionado}</strong>
                                </article>
                                <article>
                                    <span>No disponibles</span>
                                    <strong>{statusSummary.ausente}</strong>
                                </article>
                            </div>
                            <div className="club-training-architect-player-list">
                                {visiblePlayers.map((player) => {
                                    const status = playerStatuses[player.id] ?? 'presente';
                                    return (
                                        <div key={player.id} className="club-training-architect-player-row">
                                            <div>
                                                <strong>{getPersonName(player)}</strong>
                                                <span>{player.position?.trim() || 'Sin puesto'}</span>
                                            </div>
                                            <div className="club-training-architect-player-actions">
                                                {ATTENDANCE_OPTIONS.map(({ id, shortLabel }) => (
                                                    <button
                                                        key={id}
                                                        type="button"
                                                        className={`club-training-architect-status-btn${status === id ? ' active' : ''}`}
                                                        onClick={() => setPlayerStatuses((prev) => ({ ...prev, [player.id]: id }))}
                                                    >
                                                        {shortLabel}
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

                <div
                    className="club-training-modal-footer club-training-architect-footer"
                    style={{ flexDirection: 'column', alignItems: 'stretch', gap: 12 }}
                >
                    <div
                        style={{
                            display: 'flex',
                            gap: 8,
                            alignItems: 'center',
                            flexWrap: 'wrap',
                            paddingBottom: 8,
                            borderBottom: '1px solid var(--ca-border)',
                        }}
                    >
                        <span
                            style={{
                                fontSize: '0.72rem',
                                color: 'var(--ca-text-secondary)',
                                fontWeight: 500,
                                textTransform: 'uppercase',
                                letterSpacing: '0.16em',
                                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
                            }}
                        >
                            Plantillas ({templates.length})
                        </span>
                        <select
                            className="club-training-form-select"
                            style={{ minWidth: 180, padding: '6px 10px', fontSize: '0.8rem', flex: '0 1 220px' }}
                            value={pickedTemplateId}
                            onChange={(event) => handleLoadTemplate(event.target.value)}
                        >
                            <option value="">Cargar plantilla...</option>
                            {templates.map((tpl) => (
                                <option key={tpl.id} value={tpl.id}>{tpl.name}</option>
                            ))}
                        </select>
                        {pickedTemplateId ? (
                            <button
                                type="button"
                                className="club-training-architect-icon-btn danger"
                                onClick={(event) => {
                                    event.preventDefault();
                                    handleDeleteTemplate(pickedTemplateId);
                                }}
                                title="Borrar plantilla seleccionada"
                            >
                                <Trash2 className="w-3.5 h-3.5" />
                            </button>
                        ) : null}
                        <input
                            className="club-training-form-input"
                            style={{ width: 200, padding: '6px 10px', fontSize: '0.8rem' }}
                            value={templateNameDraft}
                            onChange={(event) => setTemplateNameDraft(event.target.value)}
                            placeholder="Nombre de plantilla..."
                        />
                        <button
                            type="button"
                            className="btn"
                            onClick={(event) => {
                                event.preventDefault();
                                handleSaveTemplate();
                            }}
                        >
                            <ClipboardList className="w-4 h-4" />
                            Guardar plantilla
                        </button>
                    </div>
                    {submitError ? (
                        <div
                            role="alert"
                            style={{
                                background: 'color-mix(in srgb, var(--ca-danger) 12%, transparent)',
                                border: '1px solid color-mix(in srgb, var(--ca-danger) 40%, transparent)',
                                color: 'var(--ca-danger)',
                                borderRadius: 10,
                                padding: '8px 12px',
                                fontSize: '0.78rem',
                                fontWeight: 500,
                            }}
                        >
                            {submitError}
                        </div>
                    ) : null}
                    <div
                        style={{
                            display: 'flex',
                            gap: 12,
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            flexWrap: 'wrap',
                        }}
                    >
                        <span
                            style={{
                                fontSize: '0.72rem',
                                color: isPublishable ? 'var(--ca-text-secondary)' : 'var(--ca-danger)',
                                fontWeight: isPublishable ? 400 : 500,
                            }}
                        >
                            {isPublishable
                                ? `${blocks.length} bloque${blocks.length === 1 ? '' : 's'} · ${totalBlockMinutes} min · ${tags.length} tags · ${customFields.length} campos custom`
                                : `Faltan ${missingRequirements.length} campo${missingRequirements.length === 1 ? '' : 's'}: ${missingRequirements.map((req) => req.label).join(', ')}.`}
                        </span>
                        <div style={{ display: 'flex', gap: 8 }}>
                            <button
                                type="button"
                                className="btn"
                                onClick={(event) => {
                                    event.preventDefault();
                                    onClose();
                                }}
                            >
                                Cancelar
                            </button>
                            <button
                                type="button"
                                className="btn btn-primary"
                                onClick={(event) => {
                                    event.preventDefault();
                                    void handleSubmit();
                                }}
                                disabled={submitting || !isPublishable}
                                title={!isPublishable
                                    ? `Faltan: ${missingRequirements.map((req) => req.label).join(', ')}`
                                    : undefined}
                                aria-disabled={submitting || !isPublishable}
                            >
                                <Save className="w-4 h-4" />
                                {submitting ? 'Publicando...' : 'Confirmar y publicar'}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

function GripVerticalIcon() {
    return <div className="club-training-architect-grip"><span /><span /><span /></div>;
}
