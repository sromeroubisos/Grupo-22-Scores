'use client';

import { useEffect, useMemo, useState } from 'react';
import {
    BarChart3,
    Loader2,
    Plus,
    RefreshCw,
    Save,
} from 'lucide-react';
import {
    TEST_METRIC_OPTIONS,
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

function buildMetricDefinitions(definitions: ClubPhysicalTestDefinition[]): MetricDefinitionView[] {
    const map = new Map<string, MetricDefinitionView>();

    TEST_METRIC_OPTIONS.forEach((option) => {
        map.set(option.key, {
            id: `default-${option.key}`,
            metricKey: option.key,
            label: option.label,
            unit: option.unit,
            divisionId: null,
            notes: null,
            betterValueDirection: option.unit === 's' ? 'lower' : 'higher',
        });
    });

    definitions
        .filter((definition) => definition.isActive !== false)
        .forEach((definition) => {
            map.set(definition.metricKey, {
                id: definition.id,
                metricKey: definition.metricKey,
                label: definition.label,
                unit: definition.unit,
                divisionId: definition.divisionId,
                notes: definition.notes,
                betterValueDirection: definition.betterValueDirection,
            });
        });

    return Array.from(map.values()).sort((left, right) => left.label.localeCompare(right.label));
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

            const rejected = [recordsResult, definitionsResult, plansResult, performanceResult]
                .find((result) => result.status === 'rejected') as PromiseRejectedResult | undefined;
            if (rejected) {
                setError(rejected.reason instanceof Error ? rejected.reason.message : 'Algunos datos no pudieron sincronizarse.');
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
        if (!selectedMetricKey && metricDefinitions[0]) {
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
        <div className={styles.sectionStack}>
            <section className={styles.connectionStrip}>
                <div className={styles.connectionLead}>
                    <strong>Gimnasio conectado a {clubName}</strong>
                    <span>Metricas fisicas, cargas por ejercicio y planes por dia quedan como datos operativos para Rendimiento.</span>
                </div>
                <div className={styles.connectionLinks}>
                    <button
                        type="button"
                        className={styles.inlineLink}
                        onClick={() => { void refreshAll(); }}
                        disabled={loading}
                    >
                        <RefreshCw className={cn('w-4 h-4', loading && styles.spinning)} />
                        Sincronizar
                    </button>
                </div>
            </section>

            {error ? (
                <div className={styles.inlineNotice}>
                    <span>{error}</span>
                </div>
            ) : null}

            <section className={styles.filterBar}>
                <label className={styles.filterField}>
                    <span>Equipo</span>
                    <select value={selectedDivisionId} onChange={(event) => setSelectedDivisionId(event.target.value)}>
                        <option value="all">Todo el plantel</option>
                        {divisions.map((division) => (
                            <option key={division.id} value={division.id}>{getDivisionLabel(division, clubName)}</option>
                        ))}
                    </select>
                </label>
                <label className={styles.filterField}>
                    <span>Jugadores</span>
                    <input value={`${scopedPlayers.length} disponibles`} readOnly />
                </label>
                <label className={styles.filterField}>
                    <span>Metricas</span>
                    <input value={`${metricDefinitions.length} definidas`} readOnly />
                </label>
                <label className={styles.filterField}>
                    <span>Planes gym</span>
                    <input value={`${gymPlans.length} guardados`} readOnly />
                </label>
                <label className={styles.filterField}>
                    <span>Registros</span>
                    <input value={`${physicalRecords.length + performanceRecords.filter((record) => record.moduleKey === 'gym').length} filas`} readOnly />
                </label>
            </section>

            <div className={styles.sectionTabs}>
                <button
                    type="button"
                    className={cn(styles.sectionTab, activeTab === 'metricas' && styles.sectionTabActive)}
                    onClick={() => setActiveTab('metricas')}
                >
                    Metricas
                </button>
                <button
                    type="button"
                    className={cn(styles.sectionTab, activeTab === 'ejercicios' && styles.sectionTabActive)}
                    onClick={() => setActiveTab('ejercicios')}
                >
                    Ejercicios
                </button>
            </div>

            {loading ? (
                <div className={styles.emptyState}>Cargando gimnasio...</div>
            ) : null}

            {!loading && activeTab === 'metricas' ? (
                <div className={styles.workspaceGrid}>
                    <section className={styles.panel}>
                        <div className={styles.panelHead}>
                            <div>
                                <span className={styles.panelKicker}>Metricas</span>
                                <h3>Cards de testeos y metricas fisicas</h3>
                            </div>
                            <div className={styles.sheetActions}>
                                <button type="button" className="btn btn-primary" onClick={() => setCreateMetricOpen((current) => !current)}>
                                    <Plus className="w-4 h-4" />
                                    Definir metrica
                                </button>
                            </div>
                        </div>

                        {createMetricOpen ? (
                            <div className={styles.sheetToolbar}>
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
                                <div className={styles.sheetActions}>
                                    <button type="button" className="btn btn-primary" onClick={() => { void handleCreateMetricDefinition(); }} disabled={savingMetric}>
                                        {savingMetric ? <Loader2 className={cn('w-4 h-4', styles.spinning)} /> : <Save className="w-4 h-4" />}
                                        Guardar
                                    </button>
                                </div>
                            </div>
                        ) : null}

                        <div className={styles.cardGrid}>
                            {metricCards.map((card) => (
                                <button
                                    key={card.definition.metricKey}
                                    type="button"
                                    className={cn(
                                        styles.infoCard,
                                        styles.testCardButton,
                                        selectedMetric?.metricKey === card.definition.metricKey && styles.infoCardActive,
                                    )}
                                    onClick={() => setSelectedMetricKey(card.definition.metricKey)}
                                >
                                    <span>{card.definition.label}</span>
                                    <strong>{card.playerCount}/{scopedPlayers.length || 0}</strong>
                                    <p>{card.definition.unit || 'sin unidad'} / ultima carga {formatShortDate(card.latestDate)}</p>
                                </button>
                            ))}
                        </div>

                        {selectedMetric ? (
                            <>
                                <div className={styles.sheetToolbar}>
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
                                    <div className={styles.sheetActions}>
                                        <button type="button" className="btn btn-primary" onClick={() => { void handleSaveMetricRows(); }} disabled={savingMetric}>
                                            {savingMetric ? <Loader2 className={cn('w-4 h-4', styles.spinning)} /> : <Save className="w-4 h-4" />}
                                            Guardar planilla
                                        </button>
                                    </div>
                                </div>

                                <div className={styles.tableWrap}>
                                    <table className={styles.dataTable}>
                                        <thead>
                                            <tr>
                                                <th>Jugador</th>
                                                <th>Plantel</th>
                                                <th>Ultimo valor</th>
                                                <th>Ultima fecha</th>
                                                <th>Nuevo valor</th>
                                                <th>Unidad</th>
                                                <th>Nota</th>
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
                                                                <small>{player.position || 'Sin puesto'}</small>
                                                            </button>
                                                        </td>
                                                        <td>{player.division_name || 'Sin plantel'}</td>
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
                                                                placeholder="Contexto, intento, protocolo"
                                                            />
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </>
                        ) : (
                            <div className={styles.emptyState}>Selecciona una card para abrir la planilla.</div>
                        )}
                    </section>

                    <aside className={styles.panel}>
                        <div className={styles.panelHead}>
                            <div>
                                <span className={styles.panelKicker}>Historial</span>
                                <h3>{selectedMetric?.label || 'Metrica'} en el tiempo</h3>
                            </div>
                            <BarChart3 className="w-5 h-5" />
                        </div>
                        {metricRecords.length === 0 ? (
                            <div className={styles.emptyState}>Todavia no hay historial para esta metrica.</div>
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
                    </aside>
                </div>
            ) : null}

            {!loading && activeTab === 'ejercicios' ? (
                <div className={styles.sectionStack}>
                    <section className={styles.panel}>
                        <div className={styles.panelHead}>
                            <div>
                                <span className={styles.panelKicker}>Ejercicios</span>
                                <h3>Planilla por dia y ejercicio</h3>
                            </div>
                            <div className={styles.panelMeta}>
                                <span>Dia activo</span>
                                <strong>{selectedDay?.label || 'Dia'}</strong>
                            </div>
                        </div>

                        <div className={styles.sectionTabs}>
                            {dayOptions.map((day) => (
                                <button
                                    key={day.id}
                                    type="button"
                                    className={cn(styles.sectionTab, selectedDayId === day.id && styles.sectionTabActive)}
                                    onClick={() => setSelectedDayId(day.id)}
                                >
                                    {day.label}
                                </button>
                            ))}
                        </div>

                        <div className={styles.detailCard}>
                            <strong>{selectedDay?.title}</strong>
                            <p>{selectedDay?.detail}</p>
                            {selectedDay?.planId ? <span className={styles.tag}>Plan guardado</span> : <span className={styles.tag}>Estructura base</span>}
                        </div>

                        <div className={styles.cardGrid}>
                            {exerciseCards.map((card) => (
                                <button
                                    key={card.exercise}
                                    type="button"
                                    className={cn(
                                        styles.infoCard,
                                        styles.testCardButton,
                                        selectedExercise === card.exercise && styles.infoCardActive,
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

                    <section className={styles.panel}>
                        <div className={styles.panelHead}>
                            <div>
                                <span className={styles.panelKicker}>Spreadsheet</span>
                                <h3>{selectedExercise || 'Selecciona un ejercicio'}</h3>
                            </div>
                            <div className={styles.sheetActions}>
                                <button type="button" className="btn btn-primary" onClick={() => { void handleSaveExerciseRows(); }} disabled={savingExercise || !selectedExercise}>
                                    {savingExercise ? <Loader2 className={cn('w-4 h-4', styles.spinning)} /> : <Save className="w-4 h-4" />}
                                    Guardar cargas
                                </button>
                            </div>
                        </div>

                        <div className={styles.sheetToolbar}>
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

                        {!selectedExercise ? (
                            <div className={styles.emptyState}>Selecciona una card de ejercicio para abrir la planilla.</div>
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
                                                    <td>{player.division_name || 'Sin plantel'}</td>
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
                    </section>
                </div>
            ) : null}
        </div>
    );
}
