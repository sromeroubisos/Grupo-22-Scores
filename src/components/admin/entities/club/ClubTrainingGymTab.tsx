'use client';

import { useEffect, useMemo, useState } from 'react';
import {
    Loader2,
    Plus,
    RefreshCw,
    Save,
} from 'lucide-react';
import {
    type ClubPhysicalRecord,
    type ClubPhysicalRecordInput,
} from '@/lib/club-admin/physicalRecords';
import {
    type ClubPhysicalTestBetterValueDirection,
    type ClubPhysicalTestDefinition,
} from '@/lib/club-admin/physicalTestDefinitions';
import type { ClubGymPlan } from '@/lib/club-admin/gymPlans';
import type { RugbyPerformanceRecord } from '@/lib/performance/rugbyStaff';
import type { Division } from '@/lib/services/divisionService';
import type { PersonWithRole } from '@/lib/services/personService';

import styles from './ClubPerformanceTab.module.css';

type GymTab = 'metricas' | 'ejercicios';
type ExerciseDraftField = 'weight' | 'sets' | 'reps' | 'rpe' | 'notes';

type MetricDefinitionView = {
    id: string;
    metricKey: string;
    label: string;
    unit: string | null;
    divisionId: string | null;
    notes: string | null;
    betterValueDirection: ClubPhysicalTestBetterValueDirection;
};

type ExerciseDraft = {
    weight: string;
    sets: string;
    reps: string;
    rpe: string;
    notes: string;
};

type GymDay = {
    id: string;
    label: string;
    title: string;
    detail: string;
    exercises: string[];
    planId?: string;
};

interface ClubTrainingGymTabProps {
    clubId: string;
    clubName: string;
    divisions: Division[];
    players: PersonWithRole[];
}

const DEFAULT_GYM_DAYS: GymDay[] = [
    {
        id: 'dia-1',
        label: 'Dia 1',
        title: 'Fuerza tren inferior',
        detail: 'Base de fuerza y control de carga.',
        exercises: ['Sentadilla', 'Peso muerto', 'Hip thrust', 'Core antirotacion'],
    },
    {
        id: 'dia-2',
        label: 'Dia 2',
        title: 'Fuerza tren superior',
        detail: 'Empuje, traccion y estabilidad de hombro.',
        exercises: ['Press banca', 'Remo', 'Dominadas', 'Press militar'],
    },
    {
        id: 'dia-3',
        label: 'Dia 3',
        title: 'Potencia y velocidad',
        detail: 'Transferencia al campo y acciones explosivas.',
        exercises: ['Cargadas', 'Saltos', 'Sprint resistido', 'Aceleraciones'],
    },
    {
        id: 'dia-4',
        label: 'Dia 4',
        title: 'Prehab y regenerativo',
        detail: 'Prevencion, movilidad y vuelta a la carga.',
        exercises: ['Nordic curl', 'Copenhague', 'Movilidad cadera', 'Cuello'],
    },
];

function cn(...parts: Array<string | false | null | undefined>) {
    return parts.filter(Boolean).join(' ');
}

function createId(prefix: string) {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
        return `${prefix}-${crypto.randomUUID()}`;
    }

    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeText(value?: string | null) {
    return (value || '').trim().toLowerCase();
}

function getTodayDateString() {
    const today = new Date();
    return [
        today.getFullYear(),
        String(today.getMonth() + 1).padStart(2, '0'),
        String(today.getDate()).padStart(2, '0'),
    ].join('-');
}

function toRecordedAt(dateValue: string) {
    const date = new Date(`${dateValue}T12:00:00`);
    return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function formatShortDate(value?: string | null) {
    if (!value) return '--';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '--';

    return new Intl.DateTimeFormat('es-AR', {
        day: '2-digit',
        month: 'short',
    }).format(date);
}

function formatMetricValue(value?: number | null, unit?: string | null) {
    if (typeof value !== 'number' || !Number.isFinite(value)) return '--';
    return `${Math.round(value * 10) / 10}${unit ? ` ${unit}` : ''}`;
}

function formatCounterValue(value?: number | null, fallback = '00') {
    if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
    return String(value).padStart(2, '0');
}

function parseNumberInput(value: string) {
    if (!value.trim()) return null;
    const parsed = Number(value.replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : null;
}

function getPersonName(person: PersonWithRole) {
    return person.full_name?.trim()
        || `${person.first_name || ''} ${person.last_name || ''}`.trim()
        || 'Sin nombre';
}

function matchesPlayerDivision(player: PersonWithRole, division: Division | null) {
    if (!division) return true;
    if (player.division_id && (player.division_id === division.id || player.division_id === division.management_id)) {
        return true;
    }

    const divisionName = normalizeText(division.name || division.category);
    return Boolean(divisionName && normalizeText(player.division_name) === divisionName);
}

function getDivisionLabel(division: Division | null | undefined, fallback = 'Sin equipo') {
    return division?.name?.trim()
        || division?.category?.trim()
        || fallback;
}

function isPhysicalRecord(value: unknown): value is ClubPhysicalRecord {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const candidate = value as Record<string, unknown>;
    return typeof candidate.id === 'string'
        && typeof candidate.personId === 'string'
        && typeof candidate.metricKey === 'string'
        && typeof candidate.valueNumeric === 'number';
}

function isTestDefinition(value: unknown): value is ClubPhysicalTestDefinition {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const candidate = value as Record<string, unknown>;
    return typeof candidate.id === 'string'
        && typeof candidate.metricKey === 'string'
        && typeof candidate.label === 'string';
}

function isGymPlan(value: unknown): value is ClubGymPlan {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const candidate = value as Record<string, unknown>;
    return typeof candidate.id === 'string'
        && typeof candidate.title === 'string'
        && Array.isArray(candidate.blocks);
}

function isPerformanceRecord(value: unknown): value is RugbyPerformanceRecord {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const candidate = value as Record<string, unknown>;
    return typeof candidate.id === 'string'
        && typeof candidate.moduleKey === 'string'
        && typeof candidate.payload === 'object'
        && candidate.payload !== null
        && !Array.isArray(candidate.payload);
}

async function requestJson(url: string) {
    const response = await fetch(url, { cache: 'no-store', credentials: 'same-origin' });
    const payload = await response.json().catch(() => null) as { ok?: boolean; data?: unknown; error?: unknown } | null;

    if (!response.ok || !payload?.ok) {
        throw new Error(typeof payload?.error === 'string' ? payload.error : 'No se pudo cargar la informacion');
    }

    return payload.data;
}

function getErrorMessage(error: unknown, fallback: string) {
    return error instanceof Error ? error.message : fallback;
}

function buildMetricDefinitions(definitions: ClubPhysicalTestDefinition[]): MetricDefinitionView[] {
    return definitions
        .filter((definition) => definition.isActive !== false)
        .map((definition) => ({
            id: definition.id,
            metricKey: definition.metricKey,
            label: definition.label,
            unit: definition.unit,
            divisionId: definition.divisionId,
            notes: definition.notes,
            betterValueDirection: definition.betterValueDirection,
        }))
        .sort((left, right) => left.label.localeCompare(right.label));
}

function buildDayOptions(plans: ClubGymPlan[]) {
    const plannedDays = plans.slice(0, 4).map((plan, index) => ({
        id: `plan-${plan.id}`,
        label: `Dia ${index + 1}`,
        title: plan.title,
        detail: plan.objective || plan.notes || 'Plan cargado por el staff.',
        exercises: plan.blocks
            .map((block) => block.title.trim())
            .filter(Boolean),
        planId: plan.id,
    }));

    const fallbackDays = DEFAULT_GYM_DAYS.slice(plannedDays.length);
    return [...plannedDays, ...fallbackDays].slice(0, 4);
}

function getLatestByPerson(records: ClubPhysicalRecord[]) {
    const map = new Map<string, ClubPhysicalRecord>();
    records
        .slice()
        .sort((left, right) => new Date(right.recordedAt).getTime() - new Date(left.recordedAt).getTime())
        .forEach((record) => {
            if (!map.has(record.personId)) {
                map.set(record.personId, record);
            }
        });

    return map;
}

function getLatestGymByPlayer(records: RugbyPerformanceRecord[], exercise: string) {
    const target = normalizeText(exercise);
    const map = new Map<string, RugbyPerformanceRecord>();

    records
        .filter((record) => record.moduleKey === 'gym' && normalizeText(String(record.payload.exercise || '')) === target)
        .slice()
        .sort((left, right) => new Date(right.eventDate).getTime() - new Date(left.eventDate).getTime())
        .forEach((record) => {
            if (record.playerId && !map.has(record.playerId)) {
                map.set(record.playerId, record);
            }
        });

    return map;
}

function buildEmptyExerciseDraft(): ExerciseDraft {
    return {
        weight: '',
        sets: '',
        reps: '',
        rpe: '',
        notes: '',
    };
}

export function ClubTrainingGymTab({
    clubId,
    clubName,
    divisions,
    players,
}: ClubTrainingGymTabProps) {
    const [activeTab, setActiveTab] = useState<GymTab>('metricas');
    const [definitions, setDefinitions] = useState<ClubPhysicalTestDefinition[]>([]);
    const [physicalRecords, setPhysicalRecords] = useState<ClubPhysicalRecord[]>([]);
    const [gymPlans, setGymPlans] = useState<ClubGymPlan[]>([]);
    const [performanceRecords, setPerformanceRecords] = useState<RugbyPerformanceRecord[]>([]);
    const [selectedDivisionId, setSelectedDivisionId] = useState('all');
    const [selectedMetricKey, setSelectedMetricKey] = useState<string | null>(null);
    const [selectedDayId, setSelectedDayId] = useState('dia-1');
    const [selectedExercise, setSelectedExercise] = useState('');
    const [metricDate, setMetricDate] = useState(getTodayDateString());
    const [exerciseDate, setExerciseDate] = useState(getTodayDateString());
    const [metricSource, setMetricSource] = useState('PF');
    const [metricDrafts, setMetricDrafts] = useState<Record<string, string>>({});
    const [metricNotes, setMetricNotes] = useState<Record<string, string>>({});
    const [exerciseDrafts, setExerciseDrafts] = useState<Record<string, ExerciseDraft>>({});
    const [loading, setLoading] = useState(true);
    const [savingMetric, setSavingMetric] = useState(false);
    const [savingExercise, setSavingExercise] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [gymPlanDependencyWarning, setGymPlanDependencyWarning] = useState<string | null>(null);
    const [createMetricOpen, setCreateMetricOpen] = useState(false);
    const [metricDefinitionDraft, setMetricDefinitionDraft] = useState({
        label: '',
        metricKey: '',
        unit: '',
        betterValueDirection: 'higher' as ClubPhysicalTestBetterValueDirection,
        notes: '',
    });

    const selectedDivision = useMemo(
        () => selectedDivisionId === 'all'
            ? null
            : divisions.find((division) => division.id === selectedDivisionId || division.management_id === selectedDivisionId) ?? null,
        [divisions, selectedDivisionId],
    );

    const scopedPlayers = useMemo(
        () => players.filter((player) => matchesPlayerDivision(player, selectedDivision)),
        [players, selectedDivision],
    );

    const metricDefinitions = useMemo(
        () => buildMetricDefinitions(definitions)
            .filter((definition) => !definition.divisionId || selectedDivisionId === 'all' || definition.divisionId === selectedDivisionId),
        [definitions, selectedDivisionId],
    );

    const selectedMetric = useMemo(
        () => metricDefinitions.find((definition) => definition.metricKey === selectedMetricKey) ?? metricDefinitions[0] ?? null,
        [metricDefinitions, selectedMetricKey],
    );
    const activeRosterLabel = selectedDivision ? getDivisionLabel(selectedDivision, clubName) : 'Todo el plantel';
    const gymPerformanceRecordCount = useMemo(
        () => performanceRecords.filter((record) => record.moduleKey === 'gym').length,
        [performanceRecords],
    );
    const totalOperationalRecords = physicalRecords.length + gymPerformanceRecordCount;
    const generalSyncError = error && error !== gymPlanDependencyWarning ? error : null;

    const metricRecords = useMemo(
        () => selectedMetric
            ? physicalRecords.filter((record) => record.category === 'test' && record.metricKey === selectedMetric.metricKey)
            : [],
        [physicalRecords, selectedMetric],
    );

    const latestMetricByPlayer = useMemo(
        () => getLatestByPerson(metricRecords),
        [metricRecords],
    );

    const dayOptions = useMemo(
        () => buildDayOptions(gymPlans),
        [gymPlans],
    );

    const selectedDay = useMemo(
        () => dayOptions.find((day) => day.id === selectedDayId) ?? dayOptions[0],
        [dayOptions, selectedDayId],
    );

    const dayExercises = useMemo(() => {
        const exercises = selectedDay?.exercises.length ? selectedDay.exercises : DEFAULT_GYM_DAYS[0].exercises;
        return Array.from(new Set(exercises));
    }, [selectedDay]);

    const latestGymByPlayer = useMemo(
        () => getLatestGymByPlayer(performanceRecords, selectedExercise),
        [performanceRecords, selectedExercise],
    );

    async function refreshAll() {
        if (!clubId) return;

        setLoading(true);
        setError(null);
        setGymPlanDependencyWarning(null);

        try {
            const [recordsResult, definitionsResult, plansResult, performanceResult] = await Promise.allSettled([
                requestJson(`/api/club-admin/physical-records?club=${encodeURIComponent(clubId)}`),
                requestJson(`/api/club-admin/physical-tests/definitions?club=${encodeURIComponent(clubId)}`),
                requestJson(`/api/club-admin/gym-plans?club=${encodeURIComponent(clubId)}`),
                requestJson(`/api/club-admin/performance-records?club=${encodeURIComponent(clubId)}&scope=club_private`),
            ]);

            if (recordsResult.status === 'fulfilled' && Array.isArray(recordsResult.value)) {
                setPhysicalRecords(recordsResult.value.filter(isPhysicalRecord));
            }

            if (definitionsResult.status === 'fulfilled' && Array.isArray(definitionsResult.value)) {
                setDefinitions(definitionsResult.value.filter(isTestDefinition));
            }

            if (plansResult.status === 'fulfilled' && Array.isArray(plansResult.value)) {
                setGymPlans(plansResult.value.filter(isGymPlan));
            }

            if (performanceResult.status === 'fulfilled' && Array.isArray(performanceResult.value)) {
                setPerformanceRecords(performanceResult.value.filter(isPerformanceRecord));
            }

            const rejectedMessages = [recordsResult, definitionsResult, performanceResult]
                .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
                .map((result) => getErrorMessage(result.reason, 'Algunos datos no pudieron sincronizarse.'));

            if (plansResult.status === 'rejected') {
                const planMessage = getErrorMessage(plansResult.reason, 'No se pudieron cargar los planes de gimnasio.');
                if (planMessage.includes('club_gym_plans')) {
                    setGymPlanDependencyWarning(planMessage);
                } else {
                    rejectedMessages.unshift(planMessage);
                }
            }

            if (rejectedMessages.length > 0) {
                setError(rejectedMessages[0]);
            }
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        void refreshAll();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [clubId]);

    useEffect(() => {
        if (metricDefinitions.length === 0) {
            if (selectedMetricKey !== null) {
                setSelectedMetricKey(null);
            }
            return;
        }

        if (!selectedMetricKey || !metricDefinitions.some((definition) => definition.metricKey === selectedMetricKey)) {
            setSelectedMetricKey(metricDefinitions[0].metricKey);
        }
    }, [metricDefinitions, selectedMetricKey]);

    useEffect(() => {
        if (!dayOptions.some((day) => day.id === selectedDayId) && dayOptions[0]) {
            setSelectedDayId(dayOptions[0].id);
        }
    }, [dayOptions, selectedDayId]);

    useEffect(() => {
        if (!selectedExercise || !dayExercises.some((exercise) => exercise === selectedExercise)) {
            setSelectedExercise(dayExercises[0] || '');
        }
    }, [dayExercises, selectedExercise]);

    const metricCards = useMemo(() => (
        metricDefinitions.map((definition) => {
            const rows = physicalRecords.filter((record) => record.category === 'test' && record.metricKey === definition.metricKey);
            const playerCount = new Set(rows.map((record) => record.personId)).size;

            return {
                definition,
                rows,
                playerCount,
                latestDate: rows
                    .slice()
                    .sort((left, right) => new Date(right.recordedAt).getTime() - new Date(left.recordedAt).getTime())[0]?.recordedAt ?? null,
            };
        })
    ), [metricDefinitions, physicalRecords]);

    const exerciseCards = useMemo(() => (
        dayExercises.map((exercise) => {
            const rows = performanceRecords.filter((record) => (
                record.moduleKey === 'gym'
                && normalizeText(String(record.payload.exercise || '')) === normalizeText(exercise)
            ));
            const playerCount = new Set(rows.map((record) => record.playerId).filter(Boolean)).size;

            return {
                exercise,
                rows,
                playerCount,
                latestDate: rows
                    .slice()
                    .sort((left, right) => new Date(right.eventDate).getTime() - new Date(left.eventDate).getTime())[0]?.eventDate ?? null,
            };
        })
    ), [dayExercises, performanceRecords]);

    async function handleCreateMetricDefinition() {
        const label = metricDefinitionDraft.label.trim();
        const metricKey = (metricDefinitionDraft.metricKey.trim() || label)
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9]+/g, '_')
            .replace(/^_+|_+$/g, '');

        if (!label || !metricKey) {
            window.alert('Completa el nombre de la metrica.');
            return;
        }

        setSavingMetric(true);

        try {
            const response = await fetch('/api/club-admin/physical-tests/definitions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify({
                    clubId,
                    definition: {
                        label,
                        metricKey,
                        unit: metricDefinitionDraft.unit.trim() || null,
                        divisionId: selectedDivisionId === 'all' ? null : selectedDivisionId,
                        betterValueDirection: metricDefinitionDraft.betterValueDirection,
                        notes: metricDefinitionDraft.notes.trim() || null,
                        isActive: true,
                    },
                }),
            });
            const payload = await response.json().catch(() => null) as { ok?: boolean; data?: unknown; error?: unknown } | null;

            if (!response.ok || !payload?.ok || !isTestDefinition(payload.data)) {
                throw new Error(typeof payload?.error === 'string' ? payload.error : 'No se pudo crear la metrica.');
            }

            const savedDefinition = payload.data;
            setDefinitions((current) => [...current.filter((item) => item.id !== savedDefinition.id), savedDefinition]);
            setSelectedMetricKey(savedDefinition.metricKey);
            setMetricDefinitionDraft({
                label: '',
                metricKey: '',
                unit: '',
                betterValueDirection: 'higher',
                notes: '',
            });
            setCreateMetricOpen(false);
        } catch (error) {
            window.alert(error instanceof Error ? error.message : 'No se pudo crear la metrica.');
        } finally {
            setSavingMetric(false);
        }
    }

    async function handleSaveMetricRows() {
        if (!selectedMetric) {
            window.alert('Selecciona una metrica antes de guardar.');
            return;
        }

        const records: ClubPhysicalRecordInput[] = scopedPlayers.flatMap((player) => {
            const value = parseNumberInput(metricDrafts[player.id] || '');
            if (value === null) return [];

            return [{
                personId: player.id,
                divisionId: player.division_id || selectedDivision?.id || null,
                category: 'test',
                metricKey: selectedMetric.metricKey,
                metricLabel: selectedMetric.label,
                valueNumeric: value,
                unit: selectedMetric.unit,
                recordedAt: toRecordedAt(metricDate),
                source: metricSource.trim() || 'PF',
                notes: metricNotes[player.id]?.trim() || null,
                payload: {
                    sourceModule: 'entrenamiento:gimnasio:metricas',
                    betterValueDirection: selectedMetric.betterValueDirection,
                },
            }];
        });

        if (records.length === 0) {
            window.alert('Carga al menos un valor numerico para guardar.');
            return;
        }

        setSavingMetric(true);

        try {
            const response = await fetch('/api/club-admin/physical-records', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify({ clubId, records }),
            });
            const payload = await response.json().catch(() => null) as { ok?: boolean; data?: unknown; error?: unknown } | null;

            if (!response.ok || !payload?.ok || !Array.isArray(payload.data)) {
                throw new Error(typeof payload?.error === 'string' ? payload.error : 'No se pudieron guardar las metricas.');
            }

            const savedRecords = payload.data.filter(isPhysicalRecord);
            setPhysicalRecords((current) => [...savedRecords, ...current]);
            setMetricDrafts({});
            setMetricNotes({});
        } catch (error) {
            window.alert(error instanceof Error ? error.message : 'No se pudieron guardar las metricas.');
        } finally {
            setSavingMetric(false);
        }
    }

    function updateExerciseDraft(playerId: string, field: ExerciseDraftField, value: string) {
        setExerciseDrafts((current) => ({
            ...current,
            [playerId]: {
                ...(current[playerId] ?? buildEmptyExerciseDraft()),
                [field]: value,
            },
        }));
    }

    async function handleSaveExerciseRows() {
        if (!selectedExercise) {
            window.alert('Selecciona un ejercicio antes de guardar.');
            return;
        }

        const records = scopedPlayers.flatMap((player) => {
            const draft = exerciseDrafts[player.id] ?? buildEmptyExerciseDraft();
            const weight = parseNumberInput(draft.weight);
            const sets = parseNumberInput(draft.sets);
            const reps = parseNumberInput(draft.reps);
            const rpe = parseNumberInput(draft.rpe);
            const hasData = weight !== null || sets !== null || reps !== null || rpe !== null || draft.notes.trim().length > 0;

            if (!hasData) return [];

            return [{
                id: createId('gym'),
                clubId,
                moduleKey: 'gym',
                scope: 'club_private',
                context: 'gym',
                matchId: null,
                trainingId: null,
                playerId: player.id,
                playerName: getPersonName(player),
                eventDate: exerciseDate,
                payload: {
                    date: exerciseDate,
                    exercise: selectedExercise,
                    weight: weight ?? 0,
                    sets: sets ?? 0,
                    reps: reps ?? 0,
                    rpe: rpe ?? 0,
                    injury: '',
                    notes: draft.notes.trim(),
                    day: selectedDay?.label ?? '',
                    plan: selectedDay?.title ?? '',
                },
            } satisfies RugbyPerformanceRecord];
        });

        if (records.length === 0) {
            window.alert('Carga al menos un valor o nota para guardar.');
            return;
        }

        setSavingExercise(true);

        try {
            const response = await fetch('/api/club-admin/performance-records', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify({ clubId, records }),
            });
            const payload = await response.json().catch(() => null) as { ok?: boolean; data?: unknown; error?: unknown } | null;

            if (!response.ok || !payload?.ok || !Array.isArray(payload.data)) {
                throw new Error(typeof payload?.error === 'string' ? payload.error : 'No se pudieron guardar los ejercicios.');
            }

            const savedRecords = payload.data.filter(isPerformanceRecord);
            setPerformanceRecords((current) => [...savedRecords, ...current]);
            setExerciseDrafts({});
        } catch (error) {
            window.alert(error instanceof Error ? error.message : 'No se pudieron guardar los ejercicios.');
        } finally {
            setSavingExercise(false);
        }
    }

    return (
        <div className={cn(styles.shell, styles.gymFlashShell)}>
            {gymPlanDependencyWarning ? (
                <div className={styles.gymTechnicalWarning}>
                    <strong>CRITICAL_DEPENDENCY_MISSING</strong>
                    <span>{gymPlanDependencyWarning}</span>
                </div>
            ) : null}

            <header className={styles.gymFlashHeader}>
                <div className={styles.gymFlashBrand}>
                    <span className={styles.gymFlashEyebrow}>Physical Performance Architecture</span>
                    <div className={styles.gymFlashNav}>
                        <span className={styles.gymFlashTabActive}>Gimnasio</span>
                        <span className={styles.gymFlashSlash}>/</span>
                        <span className={styles.gymFlashTabGhost}>Entrenamientos</span>
                    </div>
                </div>

                <div className={styles.gymFlashHeaderMeta}>
                    <button
                        type="button"
                        className={styles.gymSyncButton}
                        onClick={() => { void refreshAll(); }}
                        disabled={loading}
                    >
                        <RefreshCw className={cn('w-4 h-4', loading && styles.spinning)} />
                        {loading ? 'Sincronizando' : 'Sincronizar'}
                    </button>
                    <span className={styles.gymConnectedState}>
                        {`Club conectado: ${clubName}${selectedDivision ? ` / ${activeRosterLabel}` : ''}`}
                    </span>
                </div>
            </header>

            <section className={styles.gymKpiContainer}>
                <label className={cn(styles.gymKpiCard, styles.gymKpiCardInteractive)}>
                    <span className={styles.gymKpiLabel}>Equipo</span>
                    <strong className={styles.gymKpiValue}>
                        Plantel <span>{activeRosterLabel}</span>
                    </strong>
                    <select className={styles.gymKpiSelect} value={selectedDivisionId} onChange={(event) => setSelectedDivisionId(event.target.value)}>
                        <option value="all">Todo el plantel</option>
                        {divisions.map((division) => (
                            <option key={division.id} value={division.id}>{getDivisionLabel(division, clubName)}</option>
                        ))}
                    </select>
                </label>

                <div className={styles.gymKpiCard}>
                    <span className={styles.gymKpiLabel}>Jugadores</span>
                    <strong className={styles.gymKpiValue}>{formatCounterValue(scopedPlayers.length)}</strong>
                    <span className={styles.gymKpiHint}>Disponibles para carga</span>
                </div>

                <div className={styles.gymKpiCard}>
                    <span className={styles.gymKpiLabel}>Metricas</span>
                    <strong className={styles.gymKpiValue}>{formatCounterValue(metricDefinitions.length)}</strong>
                    <span className={styles.gymKpiHint}>Definidas por el staff</span>
                </div>

                <div className={styles.gymKpiCard}>
                    <span className={styles.gymKpiLabel}>Planes Gym</span>
                    <strong className={styles.gymKpiValue}>
                        {gymPlanDependencyWarning ? '--' : formatCounterValue(gymPlans.length)}
                    </strong>
                    <span className={styles.gymKpiHint}>
                        {gymPlanDependencyWarning ? 'Dependencia pendiente' : 'Biblioteca operativa'}
                    </span>
                </div>

                <div className={styles.gymKpiCard}>
                    <span className={styles.gymKpiLabel}>Registros</span>
                    <strong className={styles.gymKpiValue}>
                        {totalOperationalRecords > 0 ? formatCounterValue(totalOperationalRecords) : '--'}
                    </strong>
                    <span className={styles.gymKpiHint}>Fisicos y de gimnasio</span>
                </div>
            </section>

            {generalSyncError ? (
                <div className={styles.gymSoftNotice}>
                    <span>{generalSyncError}</span>
                </div>
            ) : null}

            <nav className={styles.gymInternalNav} aria-label="Segmentacion interna de gimnasio">
                <button
                    type="button"
                    className={cn(styles.gymInternalTab, activeTab === 'metricas' && styles.gymInternalTabActive)}
                    onClick={() => setActiveTab('metricas')}
                >
                    Metricas y tests
                </button>
                <button
                    type="button"
                    className={cn(styles.gymInternalTab, activeTab === 'ejercicios' && styles.gymInternalTabActive)}
                    onClick={() => setActiveTab('ejercicios')}
                >
                    Biblioteca de ejercicios
                </button>
            </nav>

            {loading ? (
                <div className={styles.gymLoadingState}>Cargando gimnasio...</div>
            ) : null}

            {!loading && activeTab === 'metricas' ? (
                <div className={styles.gymDashboardGrid}>
                    <section className={styles.gymPanel}>
                        <div className={styles.gymPanelHeader}>
                            <div className={styles.gymPanelHeaderCopy}>
                                <span className={styles.gymPanelEyebrow}>Metricas fisicas</span>
                                <h3 className={styles.gymPanelTitle}>Metricas y tests</h3>
                            </div>
                            <div className={styles.gymPanelHeaderActions}>
                                <span className={styles.gymStatusBadge}>
                                    {selectedMetric ? 'Captura activa' : 'Configuracion inicial'}
                                </span>
                                <button type="button" className={styles.gymPrimaryButton} onClick={() => setCreateMetricOpen((current) => !current)}>
                                    <Plus className="w-4 h-4" />
                                    Definir metrica
                                </button>
                            </div>
                        </div>

                        {createMetricOpen ? (
                            <div className={styles.gymFieldGrid}>
                                <label className={styles.filterField}>
                                    <span>Nombre</span>
                                    <input
                                        value={metricDefinitionDraft.label}
                                        onChange={(event) => setMetricDefinitionDraft((current) => ({ ...current, label: event.target.value }))}
                                        placeholder="Indice de cuello"
                                    />
                                </label>
                                <label className={styles.filterField}>
                                    <span>Clave</span>
                                    <input
                                        value={metricDefinitionDraft.metricKey}
                                        onChange={(event) => setMetricDefinitionDraft((current) => ({ ...current, metricKey: event.target.value }))}
                                        placeholder="indice_cuello"
                                    />
                                </label>
                                <label className={styles.filterField}>
                                    <span>Unidad</span>
                                    <input
                                        value={metricDefinitionDraft.unit}
                                        onChange={(event) => setMetricDefinitionDraft((current) => ({ ...current, unit: event.target.value }))}
                                        placeholder="kg, cm, s"
                                    />
                                </label>
                                <label className={styles.filterField}>
                                    <span>Mejor valor</span>
                                    <select
                                        value={metricDefinitionDraft.betterValueDirection}
                                        onChange={(event) => setMetricDefinitionDraft((current) => ({
                                            ...current,
                                            betterValueDirection: event.target.value as ClubPhysicalTestBetterValueDirection,
                                        }))}
                                    >
                                        <option value="higher">Mas alto</option>
                                        <option value="lower">Mas bajo</option>
                                    </select>
                                </label>
                                <div className={styles.gymFieldAction}>
                                    <button type="button" className={styles.gymPrimaryButton} onClick={() => { void handleCreateMetricDefinition(); }} disabled={savingMetric}>
                                        {savingMetric ? <Loader2 className={cn('w-4 h-4', styles.spinning)} /> : <Save className="w-4 h-4" />}
                                        Guardar
                                    </button>
                                </div>
                            </div>
                        ) : null}

                        {metricCards.length > 0 ? (
                            <div className={styles.gymFacetGrid}>
                                {metricCards.map((card) => (
                                    <button
                                        key={card.definition.metricKey}
                                        type="button"
                                        className={cn(
                                            styles.gymFacetCard,
                                            selectedMetric?.metricKey === card.definition.metricKey && styles.gymFacetCardActive,
                                        )}
                                        onClick={() => setSelectedMetricKey(card.definition.metricKey)}
                                    >
                                        <span>{card.definition.label}</span>
                                        <strong>{card.playerCount}/{scopedPlayers.length || 0}</strong>
                                        <p>{card.definition.unit || 'sin unidad'} / ultima carga {formatShortDate(card.latestDate)}</p>
                                    </button>
                                ))}
                            </div>
                        ) : (
                            <div className={styles.gymEmptyLead}>
                                <p>
                                    Las metricas de rendimiento son definidas por el staff tecnico. Comienza creando los
                                    parametros de medicion para habilitar la carga fisica del plantel.
                                </p>
                            </div>
                        )}

                        {selectedMetric ? (
                            <div className={styles.gymFieldGrid}>
                                <label className={styles.filterField}>
                                    <span>Metrica activa</span>
                                    <input value={selectedMetric.label} readOnly />
                                </label>
                                <label className={styles.filterField}>
                                    <span>Fecha</span>
                                    <input type="date" value={metricDate} onChange={(event) => setMetricDate(event.target.value)} />
                                </label>
                                <label className={styles.filterField}>
                                    <span>Responsable</span>
                                    <input value={metricSource} onChange={(event) => setMetricSource(event.target.value)} />
                                </label>
                                <div className={styles.gymFieldAction}>
                                    <button type="button" className={styles.gymPrimaryButton} onClick={() => { void handleSaveMetricRows(); }} disabled={savingMetric}>
                                        {savingMetric ? <Loader2 className={cn('w-4 h-4', styles.spinning)} /> : <Save className="w-4 h-4" />}
                                        Guardar planilla
                                    </button>
                                </div>
                            </div>
                        ) : null}

                        <div className={styles.gymRosterSection}>
                            <div className={styles.gymRosterHeading}>
                                <div>
                                    <h4>Plantel disponible</h4>
                                    <p>
                                        {selectedMetric
                                            ? `Carga manual abierta para ${selectedMetric.label}.`
                                            : 'Define una metrica para habilitar la carga individual por jugador.'}
                                    </p>
                                </div>
                                <span className={styles.gymStatusBadge}>{formatCounterValue(scopedPlayers.length)} jugadores</span>
                            </div>

                            {scopedPlayers.length === 0 ? (
                                <>
                                    <table className={styles.dataTable}>
                                        <thead>
                                            <tr>
                                                <th>Jugador</th>
                                                <th>Plantel</th>
                                                <th>{selectedMetric ? 'Ultimo valor' : 'Puesto'}</th>
                                                <th>{selectedMetric ? 'Estado de carga' : 'Estado'}</th>
                                            </tr>
                                        </thead>
                                    </table>
                                    <div className={styles.gymTablePlaceholder}>No se han cargado jugadores para este club.</div>
                                </>
                            ) : (
                                <div className={styles.tableWrap}>
                                    <table className={styles.dataTable}>
                                        <thead>
                                            <tr>
                                                <th>Jugador</th>
                                                <th>Plantel</th>
                                                {selectedMetric ? (
                                                    <>
                                                        <th>Ultimo valor</th>
                                                        <th>Ultima fecha</th>
                                                        <th>Nuevo valor</th>
                                                        <th>Unidad</th>
                                                        <th>Nota</th>
                                                    </>
                                                ) : (
                                                    <>
                                                        <th>Puesto</th>
                                                        <th>Estado</th>
                                                        <th>Accion</th>
                                                    </>
                                                )}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {scopedPlayers.map((player) => {
                                                const latest = latestMetricByPlayer.get(player.id);
                                                return (
                                                    <tr key={player.id}>
                                                        <td>
                                                            <button type="button" className={styles.tablePlayerButton}>
                                                                <strong>{getPersonName(player)}</strong>
                                                                <small>{player.position || 'Disponible para carga'}</small>
                                                            </button>
                                                        </td>
                                                        <td>{player.division_name || activeRosterLabel}</td>
                                                        {selectedMetric ? (
                                                            <>
                                                                <td>{formatMetricValue(latest?.valueNumeric ?? null, latest?.unit || selectedMetric.unit)}</td>
                                                                <td>{formatShortDate(latest?.recordedAt)}</td>
                                                                <td>
                                                                    <input
                                                                        className={styles.sheetInput}
                                                                        value={metricDrafts[player.id] || ''}
                                                                        onChange={(event) => setMetricDrafts((current) => ({ ...current, [player.id]: event.target.value }))}
                                                                        placeholder={selectedMetric.unit || 'valor'}
                                                                    />
                                                                </td>
                                                                <td>{selectedMetric.unit || '--'}</td>
                                                                <td>
                                                                    <input
                                                                        className={styles.sheetInput}
                                                                        value={metricNotes[player.id] || ''}
                                                                        onChange={(event) => setMetricNotes((current) => ({ ...current, [player.id]: event.target.value }))}
                                                                        placeholder="Contexto, intento o protocolo"
                                                                    />
                                                                </td>
                                                            </>
                                                        ) : (
                                                            <>
                                                                <td>{player.position || 'Sin puesto'}</td>
                                                                <td>
                                                                    <span className={cn(styles.statusBadge, styles.statusNeutral)}>
                                                                        Esperando metrica
                                                                    </span>
                                                                </td>
                                                                <td className={styles.rosterHintCell}>Defini una metrica para habilitar la planilla.</td>
                                                            </>
                                                        )}
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    </section>

                    <aside className={styles.gymPanel}>
                        <div className={styles.gymPanelHeader}>
                            <div className={styles.gymPanelHeaderCopy}>
                                <span className={styles.gymPanelEyebrow}>Historial</span>
                                <h3 className={styles.gymPanelTitle}>Metrica en el tiempo</h3>
                            </div>
                            <span className={styles.gymStatusBadge}>
                                {selectedMetric ? selectedMetric.label : 'Sin seleccion'}
                            </span>
                        </div>

                        {metricRecords.length === 0 ? (
                            <div className={styles.gymHistoryCanvas}>
                                <div className={styles.gymHistoryCopy}>
                                    <p>SIN DATOS PARA VISUALIZAR</p>
                                    <span>
                                        {selectedMetric
                                            ? 'Carga registros para ver la evolucion historica de esta metrica.'
                                            : 'Selecciona una metrica y un jugador para ver su evolucion historica.'}
                                    </span>
                                </div>
                                <svg className={styles.gymHistoryWave} viewBox="0 0 400 100" preserveAspectRatio="none" aria-hidden="true">
                                    <path d="M0,50 Q50,20 100,50 T200,50 T300,50 T400,50" />
                                    <path d="M0,62 Q50,34 100,62 T200,62 T300,62 T400,62" />
                                </svg>
                            </div>
                        ) : (
                            <div className={styles.metricList}>
                                {metricRecords.slice(0, 8).map((record) => {
                                    const player = players.find((item) => item.id === record.personId);
                                    return (
                                        <div key={record.id} className={styles.metricListItem}>
                                            <div>
                                                <strong>{player ? getPersonName(player) : record.personId}</strong>
                                                <p>{record.source || 'PF'} / {formatShortDate(record.recordedAt)}</p>
                                            </div>
                                            <div className={styles.metricListValue}>
                                                <strong>{formatMetricValue(record.valueNumeric, record.unit)}</strong>
                                                <small>{record.notes || 'Sin nota'}</small>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        <div className={styles.gymNextSteps}>
                            <h4>Proximos pasos</h4>
                            <div className={styles.gymStepList}>
                                <div className={cn(styles.gymStepItem, metricDefinitions.length > 0 && styles.gymStepItemActive)}>
                                    <span>1</span>
                                    <p>Definir estructura de metricas.</p>
                                </div>
                                <div className={cn(styles.gymStepItem, metricRecords.length > 0 && styles.gymStepItemActive)}>
                                    <span>2</span>
                                    <p>Cargar registros fisicos por jugador.</p>
                                </div>
                                <div className={cn(styles.gymStepItem, selectedMetric !== null && styles.gymStepItemActive)}>
                                    <span>3</span>
                                    <p>Analizar tendencias y cargas.</p>
                                </div>
                            </div>
                        </div>
                    </aside>
                </div>
            ) : null}

            {!loading && activeTab === 'ejercicios' ? (
                <div className={styles.gymDashboardGrid}>
                    <section className={styles.gymPanel}>
                        <div className={styles.gymPanelHeader}>
                            <div className={styles.gymPanelHeaderCopy}>
                                <span className={styles.gymPanelEyebrow}>Biblioteca</span>
                                <h3 className={styles.gymPanelTitle}>Planilla por dia y ejercicio</h3>
                            </div>
                            <span className={styles.gymStatusBadge}>{selectedDay?.label || 'Dia'}</span>
                        </div>

                        <div className={styles.gymMiniTabs}>
                            {dayOptions.map((day) => (
                                <button
                                    key={day.id}
                                    type="button"
                                    className={cn(styles.gymMiniTab, selectedDayId === day.id && styles.gymMiniTabActive)}
                                    onClick={() => setSelectedDayId(day.id)}
                                >
                                    {day.label}
                                </button>
                            ))}
                        </div>

                        <div className={styles.gymExerciseSummary}>
                            <strong>{selectedDay?.title}</strong>
                            <p>{selectedDay?.detail}</p>
                            <span className={styles.gymStatusBadge}>
                                {selectedDay?.planId ? 'Plan guardado' : 'Estructura base'}
                            </span>
                        </div>

                        <div className={styles.gymFacetGrid}>
                            {exerciseCards.map((card) => (
                                <button
                                    key={card.exercise}
                                    type="button"
                                    className={cn(
                                        styles.gymFacetCard,
                                        selectedExercise === card.exercise && styles.gymFacetCardActive,
                                    )}
                                    onClick={() => setSelectedExercise(card.exercise)}
                                >
                                    <span>{card.exercise}</span>
                                    <strong>{card.playerCount}/{scopedPlayers.length || 0}</strong>
                                    <p>{card.rows.length} registros / ultima carga {formatShortDate(card.latestDate)}</p>
                                </button>
                            ))}
                        </div>
                    </section>

                    <section className={styles.gymPanel}>
                        <div className={styles.gymPanelHeader}>
                            <div className={styles.gymPanelHeaderCopy}>
                                <span className={styles.gymPanelEyebrow}>Carga operativa</span>
                                <h3 className={styles.gymPanelTitle}>{selectedExercise || 'Selecciona un ejercicio'}</h3>
                            </div>
                            <div className={styles.gymPanelHeaderActions}>
                                <span className={styles.gymStatusBadge}>
                                    {selectedExercise ? 'Carga abierta' : 'Esperando seleccion'}
                                </span>
                                <button type="button" className={styles.gymPrimaryButton} onClick={() => { void handleSaveExerciseRows(); }} disabled={savingExercise || !selectedExercise}>
                                    {savingExercise ? <Loader2 className={cn('w-4 h-4', styles.spinning)} /> : <Save className="w-4 h-4" />}
                                    Guardar cargas
                                </button>
                            </div>
                        </div>

                        {!selectedExercise ? (
                            <div className={styles.gymHistoryCanvas}>
                                <div className={styles.gymHistoryCopy}>
                                    <p>SIN EJERCICIO SELECCIONADO</p>
                                    <span>Elige una variante del dia para abrir la planilla de carga por jugador.</span>
                                </div>
                                <svg className={styles.gymHistoryWave} viewBox="0 0 400 100" preserveAspectRatio="none" aria-hidden="true">
                                    <path d="M0,48 Q50,32 100,48 T200,48 T300,48 T400,48" />
                                    <path d="M0,66 Q50,46 100,66 T200,66 T300,66 T400,66" />
                                </svg>
                            </div>
                        ) : (
                            <>
                                <div className={styles.gymFieldGridCompact}>
                                    <label className={styles.filterField}>
                                        <span>Fecha</span>
                                        <input type="date" value={exerciseDate} onChange={(event) => setExerciseDate(event.target.value)} />
                                    </label>
                                    <label className={styles.filterField}>
                                        <span>Dia</span>
                                        <input value={selectedDay?.label || ''} readOnly />
                                    </label>
                                    <label className={styles.filterField}>
                                        <span>Plan</span>
                                        <input value={selectedDay?.title || ''} readOnly />
                                    </label>
                                </div>

                                {scopedPlayers.length === 0 ? (
                                    <div className={styles.gymTablePlaceholder}>No hay jugadores disponibles para cargar este ejercicio.</div>
                                ) : (
                                    <div className={styles.tableWrap}>
                                        <table className={styles.dataTable}>
                                            <thead>
                                                <tr>
                                                    <th>Jugador</th>
                                                    <th>Plantel</th>
                                                    <th>Ultima carga</th>
                                                    <th>Kg</th>
                                                    <th>Series</th>
                                                    <th>Reps</th>
                                                    <th>RPE</th>
                                                    <th>Notas</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {scopedPlayers.map((player) => {
                                                    const latest = latestGymByPlayer.get(player.id);
                                                    const draft = exerciseDrafts[player.id] ?? buildEmptyExerciseDraft();
                                                    return (
                                                        <tr key={player.id}>
                                                            <td>
                                                                <button type="button" className={styles.tablePlayerButton}>
                                                                    <strong>{getPersonName(player)}</strong>
                                                                    <small>{player.position || 'Sin puesto'}</small>
                                                                </button>
                                                            </td>
                                                            <td>{player.division_name || activeRosterLabel}</td>
                                                            <td>
                                                                {latest
                                                                    ? `${latest.payload.weight || 0}kg / ${latest.payload.sets || 0}x${latest.payload.reps || 0}`
                                                                    : '--'}
                                                            </td>
                                                            <td>
                                                                <input className={styles.sheetInput} value={draft.weight} onChange={(event) => updateExerciseDraft(player.id, 'weight', event.target.value)} placeholder="kg" />
                                                            </td>
                                                            <td>
                                                                <input className={styles.sheetInput} value={draft.sets} onChange={(event) => updateExerciseDraft(player.id, 'sets', event.target.value)} placeholder="4" />
                                                            </td>
                                                            <td>
                                                                <input className={styles.sheetInput} value={draft.reps} onChange={(event) => updateExerciseDraft(player.id, 'reps', event.target.value)} placeholder="6" />
                                                            </td>
                                                            <td>
                                                                <input className={styles.sheetInput} value={draft.rpe} onChange={(event) => updateExerciseDraft(player.id, 'rpe', event.target.value)} placeholder="8" />
                                                            </td>
                                                            <td>
                                                                <input className={styles.sheetInput} value={draft.notes} onChange={(event) => updateExerciseDraft(player.id, 'notes', event.target.value)} placeholder="Variante, molestia o ajuste" />
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </>
                        )}
                    </section>
                </div>
            ) : null}
        </div>
    );
}
