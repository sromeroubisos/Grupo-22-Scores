'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import {
    BarChart3,
    ChevronRight,
    Download,
    Loader2,
    Plus,
    RefreshCw,
    Save,
} from 'lucide-react';
import { ClubTrainingCreateModal } from './ClubTrainingCreateModal';
import { ClubStaffPerformanceSuite } from './ClubStaffPerformanceSuite';
import type { ClubDashboardMatch, ClubDashboardOverview } from '@/lib/club-admin/dashboard-types';
import type { ClubManageTabId } from '@/lib/club-admin/manageTabs';
import {
    BODY_WEIGHT_METRIC_KEY,
    BODY_WEIGHT_METRIC_LABEL,
    BODY_WEIGHT_UNIT,
    TEST_METRIC_OPTIONS,
    type ClubPhysicalRecord,
    type ClubPhysicalRecordInput,
} from '@/lib/club-admin/physicalRecords';
import {
    TEST_DIRECTION_OPTIONS,
    type ClubPhysicalTestBetterValueDirection,
    type ClubPhysicalTestDefinition,
} from '@/lib/club-admin/physicalTestDefinitions';
import type { ClubGymPlan } from '@/lib/club-admin/gymPlans';
import type { PlanBlock, PlanBlockType, TrainingEntry, TrainingTechnicalEvent, TrainingTechnicalEventType } from '@/lib/club-admin/trainings';
import {
    calculateRugbyPerformanceInsights,
    type RugbyPerformanceRecord,
} from '@/lib/performance/rugbyStaff';
import type { Division } from '@/lib/services/divisionService';
import type { PersonWithRole } from '@/lib/services/personService';
import { buildClubManageHref, type ClubConsoleMode } from '@/lib/clubAdminRoutes';
import { resolveActiveSeason, persistActiveSeason } from '@/lib/club-admin/activeSeasonSelection';

import styles from './ClubPerformanceTab.module.css';
import '@/components/admin/ui/crystalline.css';

type PerformanceSection = 'resumen' | 'tiempo' | 'jugador' | 'equipo' | 'trabajo' | 'rugby' | 'fisico' | 'gimnasio' | 'testeos' | 'pesos' | 'planillas';

type RosterOption = {
    id: string;
    label: string;
    divisionId: string | null;
    divisionName: string | null;
};

type GymPlanRow = {
    id: string;
    blockType: PlanBlockType;
    exercise: string;
    sets: string;
    reps: string;
    load: string;
    duration: string;
    intensity: string;
    rest: string;
    notes: string;
};

type TestDefinitionDraft = {
    suggestionKey: string;
    label: string;
    metricKey: string;
    unit: string;
    betterValueDirection: ClubPhysicalTestBetterValueDirection;
    notes: string;
    divisionId: string;
};

type TestCardMetric = {
    definition: ClubPhysicalTestDefinition;
    playersWithResult: number;
    totalResults: number;
    latestRecordedAt: string | null;
};

type GymPlanDraft = {
    title: string;
    objective: string;
    notes: string;
    divisionId: string;
};

type SessionFromPlanDraft = {
    title: string;
    divisionId: string;
    date: string;
    startTime: string;
    duration: string;
    location: string;
    objective: string;
};

interface ClubPerformanceTabProps {
    clubId: string;
    clubName: string;
    sport?: string | null;
    divisions: Division[];
    players: PersonWithRole[];
    staff: PersonWithRole[];
    dashboardData: ClubDashboardOverview;
    loading?: boolean;
    onTabChange?: (tabId: ClubManageTabId) => void;
}

const SECTION_TABS: Array<{ id: PerformanceSection; label: string; group: 'core' | 'advanced' }> = [
    { id: 'resumen', label: 'Carga', group: 'core' },
    { id: 'tiempo', label: 'Asistencia', group: 'core' },
    { id: 'jugador', label: 'Técnica', group: 'core' },
    { id: 'equipo', label: 'Alertas', group: 'core' },
    { id: 'trabajo', label: 'Próxima acción', group: 'core' },
    { id: 'rugby', label: 'Técnico avanzado', group: 'core' },
];

const ADVANCED_TABS: Array<{ id: PerformanceSection; label: string }> = [
    { id: 'fisico', label: 'Físico' },
    { id: 'gimnasio', label: 'Gimnasio' },
    { id: 'testeos', label: 'Testeos' },
    { id: 'pesos', label: 'Pesos' },
    { id: 'planillas', label: 'Planillas' },
];

const PLAN_BLOCK_OPTIONS: Array<{ id: PlanBlockType; label: string }> = [
    { id: 'warmup', label: 'Activacion' },
    { id: 'tecnico', label: 'Movilidad / tecnica' },
    { id: 'tactico', label: 'Circuito / transferencia' },
    { id: 'fisico', label: 'Fuerza principal' },
    { id: 'cierre', label: 'Regenerativo' },
];

function cn(...parts: Array<string | false | null | undefined>) {
    return parts.filter(Boolean).join(' ');
}

function createId(prefix: string) {
    return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeText(value?: string | null) {
    return (value || '').trim().toLowerCase();
}

function getTodayDateString() {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

function toRecordedAt(dateValue: string) {
    const candidate = new Date(`${dateValue}T12:00:00`);
    return Number.isNaN(candidate.getTime()) ? new Date().toISOString() : candidate.toISOString();
}

function toSessionDateTime(dateValue: string, timeValue: string) {
    const candidate = new Date(`${dateValue}T${timeValue}:00`);
    return Number.isNaN(candidate.getTime()) ? new Date().toISOString() : candidate.toISOString();
}

function getPersonName(person: PersonWithRole) {
    return person.full_name?.trim()
        || `${person.first_name || ''} ${person.last_name || ''}`.trim()
        || 'Sin nombre';
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

function formatDateTime(value?: string | null) {
    if (!value) return '--';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '--';
    return new Intl.DateTimeFormat('es-AR', {
        weekday: 'short',
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
    }).format(date);
}

function normalizeNumberInput(value: string) {
    if (!value.trim()) return null;
    const numeric = Number(value.replace(',', '.'));
    return Number.isFinite(numeric) ? numeric : null;
}

function formatMetricValue(value?: number | null, unit?: string | null) {
    if (typeof value !== 'number' || !Number.isFinite(value)) return '--';
    return `${value}${unit ? ` ${unit}` : ''}`;
}

function average(values: number[]) {
    const validValues = values.filter((value) => Number.isFinite(value));
    if (validValues.length === 0) return null;
    return validValues.reduce((sum, value) => sum + value, 0) / validValues.length;
}

function formatAverage(value: number | null, suffix = '') {
    if (typeof value !== 'number' || !Number.isFinite(value)) return '--';
    const rounded = Math.round(value * 10) / 10;
    return `${rounded}${suffix}`;
}

function formatPercent(value: number | null) {
    return typeof value === 'number' && Number.isFinite(value) ? `${value}%` : '--';
}

function percentFromParts(part: number, total: number) {
    if (!total) return null;
    return Math.round((part / total) * 100);
}

function isPresentAttendanceState(value: unknown) {
    return value === 'presente' || value === 'confirmado' || value === 'tarde';
}

function getTechnicalEventTypeLabel(type: TrainingTechnicalEventType) {
    const labels: Record<TrainingTechnicalEventType, string> = {
        patadas: 'Patadas',
        jugadas: 'Jugadas',
        scrums: 'Scrums',
        lines: 'Lines',
        secuencias: 'Secuencias',
    };

    return labels[type];
}

function getTechnicalEventTotal(event: TrainingTechnicalEvent) {
    return event.total || event.successful + event.failed;
}

function getTechnicalEventEffectiveness(event: TrainingTechnicalEvent) {
    return percentFromParts(event.successful, getTechnicalEventTotal(event));
}

function getDivisionLabel(division: Division | null | undefined, fallback = 'Sin equipo') {
    return division?.name?.trim()
        || division?.category?.trim()
        || fallback;
}

function findDivisionById(divisions: Division[], divisionId?: string | null) {
    if (!divisionId) return null;
    return divisions.find((division) => division.id === divisionId || division.management_id === divisionId) ?? null;
}

function matchesPlayerDivision(player: PersonWithRole, division: Division | null) {
    if (!division) return true;

    if (player.division_id && (player.division_id === division.id || player.division_id === division.management_id)) {
        return true;
    }

    const normalizedDivisionName = normalizeText(division.name || division.category);
    return Boolean(normalizedDivisionName && normalizeText(player.division_name) === normalizedDivisionName);
}

function buildRosterOptions(players: PersonWithRole[], divisions: Division[]) {
    const map = new Map<string, RosterOption>();

    divisions.forEach((division) => {
        const label = getDivisionLabel(division, 'Equipo');
        map.set(`division:${division.id}`, {
            id: `division:${division.id}`,
            label,
            divisionId: division.id,
            divisionName: label,
        });
    });

    players.forEach((player) => {
        const divisionId = player.division_id || null;
        const divisionName = player.division_name?.trim() || null;
        if (!divisionId && !divisionName) return;

        const key = divisionId ? `division:${divisionId}` : `name:${normalizeText(divisionName)}`;
        if (!map.has(key)) {
            map.set(key, {
                id: key,
                label: divisionName || 'Sin plantel',
                divisionId,
                divisionName,
            });
        }
    });

    return Array.from(map.values()).sort((left, right) => left.label.localeCompare(right.label));
}

function matchesPlayerRoster(player: PersonWithRole, roster: RosterOption | null) {
    if (!roster) return true;

    if (roster.divisionId && player.division_id === roster.divisionId) {
        return true;
    }

    if (roster.divisionName && normalizeText(player.division_name) === normalizeText(roster.divisionName)) {
        return true;
    }

    return false;
}

function matchesTrainingDivision(training: TrainingEntry, division: Division | null, divisions: Division[], clubName: string) {
    if (!division) return true;

    if (training.divisionId && (training.divisionId === division.id || training.divisionId === division.management_id)) {
        return true;
    }

    if (training.players?.some((player) => (
        (player.divisionId && (player.divisionId === division.id || player.divisionId === division.management_id))
        || (player.divisionName && normalizeText(player.divisionName) === normalizeText(division.name || division.category))
    ))) {
        return true;
    }

    return normalizeText(getTrainingDivisionLabel(training, divisions, clubName)) === normalizeText(division.name || division.category);
}

function matchesTrainingRoster(training: TrainingEntry, roster: RosterOption | null) {
    if (!roster) return true;

    if (roster.divisionId && training.divisionId === roster.divisionId) {
        return true;
    }

    if (training.players?.some((player) => (
        (roster.divisionId && player.divisionId === roster.divisionId)
        || (roster.divisionName && normalizeText(player.divisionName) === normalizeText(roster.divisionName))
    ))) {
        return true;
    }

    return false;
}

function matchesMatchDivision(match: ClubDashboardMatch, division: Division | null) {
    if (!division) return true;

    if (
        match.homeDivisionId === division.id
        || match.awayDivisionId === division.id
        || (division.management_id && (match.homeDivisionId === division.management_id || match.awayDivisionId === division.management_id))
    ) {
        return true;
    }

    const normalizedDivisionName = normalizeText(division.name || division.category);
    if (!normalizedDivisionName) return false;

    return (
        normalizeText(match.homeDivisionName) === normalizedDivisionName
        || normalizeText(match.awayDivisionName) === normalizedDivisionName
    );
}

function matchesMatchRoster(match: ClubDashboardMatch, roster: RosterOption | null) {
    if (!roster) return true;

    if (roster.divisionId && (match.homeDivisionId === roster.divisionId || match.awayDivisionId === roster.divisionId)) {
        return true;
    }

    if (!roster.divisionName) return false;

    return (
        normalizeText(match.homeDivisionName) === normalizeText(roster.divisionName)
        || normalizeText(match.awayDivisionName) === normalizeText(roster.divisionName)
    );
}

function getSeasonOptions(trainings: TrainingEntry[], matches: ClubDashboardMatch[]) {
    const seasons = new Set<string>([String(new Date().getFullYear())]);

    trainings.forEach((training) => {
        const date = new Date(training.date);
        if (!Number.isNaN(date.getTime())) {
            seasons.add(String(date.getFullYear()));
        }
    });

    matches.forEach((match) => {
        if (!match.dateTime) return;
        const date = new Date(match.dateTime);
        if (!Number.isNaN(date.getTime())) {
            seasons.add(String(date.getFullYear()));
        }
    });

    return Array.from(seasons).sort((left, right) => Number(right) - Number(left));
}

function isTrainingEntryPayload(value: unknown): value is TrainingEntry {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return false;
    }

    const candidate = value as Record<string, unknown>;
    return (
        typeof candidate.id === 'string'
        && typeof candidate.title === 'string'
        && typeof candidate.date === 'string'
    );
}

function isPhysicalRecordPayload(value: unknown): value is ClubPhysicalRecord {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return false;
    }

    const candidate = value as Record<string, unknown>;
    return (
        typeof candidate.id === 'string'
        && typeof candidate.personId === 'string'
        && typeof candidate.metricKey === 'string'
        && typeof candidate.recordedAt === 'string'
    );
}

function isPhysicalTestDefinitionPayload(value: unknown): value is ClubPhysicalTestDefinition {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return false;
    }

    const candidate = value as Record<string, unknown>;
    return (
        typeof candidate.id === 'string'
        && typeof candidate.metricKey === 'string'
        && typeof candidate.label === 'string'
    );
}

function isGymPlanPayload(value: unknown): value is ClubGymPlan {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return false;
    }

    const candidate = value as Record<string, unknown>;
    return (
        typeof candidate.id === 'string'
        && typeof candidate.title === 'string'
        && Array.isArray(candidate.blocks)
    );
}

function isRugbyPerformanceRecordPayload(value: unknown): value is RugbyPerformanceRecord {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return false;
    }

    const candidate = value as Record<string, unknown>;
    return typeof candidate.id === 'string' && typeof candidate.moduleKey === 'string';
}

async function requestPersistedTrainings(clubId: string) {
    const response = await fetch(`/api/club-admin/trainings?club=${encodeURIComponent(clubId)}`, {
        cache: 'no-store',
        credentials: 'same-origin',
    });
    const payload = await response.json().catch(() => null) as {
        ok?: boolean;
        data?: unknown;
        error?: unknown;
    } | null;

    if (!response.ok || !payload?.ok) {
        throw new Error(
            typeof payload?.error === 'string'
                ? payload.error
                : 'No se pudieron cargar las sesiones de gimnasio',
        );
    }

    return Array.isArray(payload.data)
        ? payload.data.filter(isTrainingEntryPayload)
        : [];
}

async function requestPhysicalRecords(clubId: string) {
    const response = await fetch(`/api/club-admin/physical-records?club=${encodeURIComponent(clubId)}`, {
        cache: 'no-store',
        credentials: 'same-origin',
    });
    const payload = await response.json().catch(() => null) as {
        ok?: boolean;
        data?: unknown;
        error?: unknown;
    } | null;

    if (!response.ok || !payload?.ok) {
        throw new Error(
            typeof payload?.error === 'string'
                ? payload.error
                : 'No se pudieron cargar pesos y testeos',
        );
    }

    return Array.isArray(payload.data)
        ? payload.data.filter(isPhysicalRecordPayload)
        : [];
}

async function requestPhysicalTestDefinitions(clubId: string) {
    const response = await fetch(`/api/club-admin/physical-tests/definitions?club=${encodeURIComponent(clubId)}`, {
        cache: 'no-store',
        credentials: 'same-origin',
    });
    const payload = await response.json().catch(() => null) as {
        ok?: boolean;
        data?: unknown;
        error?: unknown;
    } | null;

    if (!response.ok || !payload?.ok) {
        throw new Error(
            typeof payload?.error === 'string'
                ? payload.error
                : 'No se pudieron cargar los testeos definidos',
        );
    }

    return Array.isArray(payload.data)
        ? payload.data.filter(isPhysicalTestDefinitionPayload)
        : [];
}

async function requestGymPlans(clubId: string) {
    const response = await fetch(`/api/club-admin/gym-plans?club=${encodeURIComponent(clubId)}`, {
        cache: 'no-store',
        credentials: 'same-origin',
    });
    const payload = await response.json().catch(() => null) as {
        ok?: boolean;
        data?: unknown;
        error?: unknown;
    } | null;

    if (!response.ok || !payload?.ok) {
        throw new Error(
            typeof payload?.error === 'string'
                ? payload.error
                : 'No se pudieron cargar los planes de gimnasio',
        );
    }

    return Array.isArray(payload.data)
        ? payload.data.filter(isGymPlanPayload)
        : [];
}

async function requestPerformanceRecords(clubId: string) {
    const response = await fetch(`/api/club-admin/performance-records?club=${encodeURIComponent(clubId)}`, {
        cache: 'no-store',
        credentials: 'same-origin',
    });
    const payload = await response.json().catch(() => null) as {
        ok?: boolean;
        data?: unknown;
        error?: unknown;
    } | null;

    if (!response.ok || !payload?.ok) {
        throw new Error(
            typeof payload?.error === 'string'
                ? payload.error
                : 'No se pudieron cargar las metricas de rugby',
        );
    }

    return Array.isArray(payload.data)
        ? payload.data.filter(isRugbyPerformanceRecordPayload)
        : [];
}

function sortTrainings(entries: TrainingEntry[]) {
    return [...entries].sort((left, right) => new Date(right.date).getTime() - new Date(left.date).getTime());
}

function sortRecords(records: ClubPhysicalRecord[]) {
    return [...records].sort((left, right) => new Date(right.recordedAt).getTime() - new Date(left.recordedAt).getTime());
}

function matchesTrainingIdentity(
    left: Pick<TrainingEntry, 'id' | 'persistedId' | 'sourceKey'>,
    right: Pick<TrainingEntry, 'id' | 'persistedId' | 'sourceKey'>,
) {
    return (
        Boolean(left.persistedId && right.persistedId && left.persistedId === right.persistedId)
        || Boolean(left.sourceKey && right.sourceKey && left.sourceKey === right.sourceKey)
        || left.id === right.id
    );
}

function upsertTrainingEntry(entries: TrainingEntry[], nextEntry: TrainingEntry) {
    const next = [...entries];
    const existingIndex = next.findIndex((entry) => matchesTrainingIdentity(entry, nextEntry));

    if (existingIndex >= 0) {
        next.splice(existingIndex, 1, nextEntry);
        return sortTrainings(next);
    }

    next.push(nextEntry);
    return sortTrainings(next);
}

function mergePhysicalRecords(current: ClubPhysicalRecord[], incoming: ClubPhysicalRecord[]) {
    return sortRecords([...incoming, ...current]);
}

function getTrainingDivisionLabel(training: TrainingEntry, divisions: Division[], clubName: string) {
    const division = findDivisionById(divisions, training.divisionId);
    if (division) {
        return getDivisionLabel(division, clubName);
    }

    const playerDivisionName = training.players?.find((player) => player.divisionName?.trim())?.divisionName?.trim();
    return playerDivisionName || clubName;
}

function decodePlanNotes(notes?: string | null) {
    const parsed = {
        sets: '',
        reps: '',
        load: '',
        rest: '',
        notes: '',
    };

    if (!notes?.trim()) {
        return parsed;
    }

    const freeText: string[] = [];
    notes.split('|').forEach((chunk) => {
        const [rawKey, ...rest] = chunk.split('=');
        const key = rawKey?.trim().toLowerCase();
        const value = rest.join('=').trim();

        if (!key || !value) {
            if (chunk.trim()) freeText.push(chunk.trim());
            return;
        }

        if (key === 'series') parsed.sets = value;
        else if (key === 'reps') parsed.reps = value;
        else if (key === 'carga') parsed.load = value;
        else if (key === 'descanso') parsed.rest = value;
        else if (key === 'notas') parsed.notes = value;
        else freeText.push(chunk.trim());
    });

    if (!parsed.notes && freeText.length > 0) {
        parsed.notes = freeText.join(' | ');
    }

    return parsed;
}

function encodePlanNotes(row: GymPlanRow) {
    const parts = [
        row.sets.trim() ? `series=${row.sets.trim()}` : null,
        row.reps.trim() ? `reps=${row.reps.trim()}` : null,
        row.load.trim() ? `carga=${row.load.trim()}` : null,
        row.rest.trim() ? `descanso=${row.rest.trim()}` : null,
        row.notes.trim() ? `notas=${row.notes.trim()}` : null,
    ].filter(Boolean);

    return parts.join(' | ');
}

function buildEmptyPlanRow(): GymPlanRow {
    return {
        id: createId('plan'),
        blockType: 'fisico',
        exercise: '',
        sets: '',
        reps: '',
        load: '',
        duration: '10',
        intensity: '',
        rest: '',
        notes: '',
    };
}

function parsePlanRowsFromBlocks(blocks: PlanBlock[]) {
    if (blocks.length === 0) {
        return [buildEmptyPlanRow()];
    }

    return blocks.map((block) => {
        const decoded = decodePlanNotes(block.notes);
        return {
            id: block.id,
            blockType: block.type,
            exercise: block.title,
            sets: decoded.sets,
            reps: decoded.reps,
            load: decoded.load,
            duration: String(block.duration || 10),
            intensity: block.intensity || '',
            rest: decoded.rest,
            notes: decoded.notes,
        };
    });
}

function parsePlanRows(training: TrainingEntry | null) {
    return parsePlanRowsFromBlocks(training?.plan?.blocks ?? []);
}

function buildPlanBlocks(rows: GymPlanRow[]): PlanBlock[] {
    return rows
        .filter((row) => (
            row.exercise.trim()
            || row.sets.trim()
            || row.reps.trim()
            || row.load.trim()
            || row.notes.trim()
        ))
        .map((row) => ({
            id: row.id || createId('block'),
            type: row.blockType,
            title: row.exercise.trim() || 'Ejercicio',
            duration: Math.max(Number(row.duration) || 0, 1),
            intensity: row.intensity.trim() || undefined,
            notes: encodePlanNotes(row),
        }));
}

function getLatestRecordByPerson(records: ClubPhysicalRecord[]) {
    const map = new Map<string, ClubPhysicalRecord>();

    records.forEach((record) => {
        if (!map.has(record.personId)) {
            map.set(record.personId, record);
        }
    });

    return map;
}

function getPreviousRecordByPerson(records: ClubPhysicalRecord[]) {
    const latestSeen = new Set<string>();
    const map = new Map<string, ClubPhysicalRecord>();

    records.forEach((record) => {
        if (!latestSeen.has(record.personId)) {
            latestSeen.add(record.personId);
            return;
        }

        if (!map.has(record.personId)) {
            map.set(record.personId, record);
        }
    });

    return map;
}

function getStatusMeta(training: TrainingEntry) {
    if (training.status === 'finalizado') {
        return { label: 'Finalizada', className: styles.statusGreen };
    }

    if (training.status === 'sin_evaluar') {
        return { label: 'Sin cierre', className: styles.statusYellow };
    }

    if (training.status === 'en_curso') {
        return { label: 'En curso', className: styles.statusRed };
    }

    return { label: 'Planificada', className: styles.statusNeutral };
}

function sortTestDefinitions(definitions: ClubPhysicalTestDefinition[]) {
    return [...definitions].sort((left, right) => left.label.localeCompare(right.label));
}

function sortGymPlans(plans: ClubGymPlan[]) {
    return [...plans].sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
}

function slugifyMetricKey(value: string) {
    return value
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');
}

function buildTestDefinitionDraft(defaultDivisionId?: string | null): TestDefinitionDraft {
    return {
        suggestionKey: '',
        label: '',
        metricKey: '',
        unit: '',
        betterValueDirection: 'higher',
        notes: '',
        divisionId: defaultDivisionId || 'all',
    };
}

function matchesTestDefinitionScope(
    definition: ClubPhysicalTestDefinition,
    division: Division | null,
    roster: RosterOption | null,
) {
    if (!definition.isActive) {
        return false;
    }

    if (!definition.divisionId) {
        return true;
    }

    if (division && (definition.divisionId === division.id || definition.divisionId === division.management_id)) {
        return true;
    }

    if (roster?.divisionId && definition.divisionId === roster.divisionId) {
        return true;
    }

    return !division && !roster;
}

function getTestDefinitionDivisionLabel(definition: ClubPhysicalTestDefinition, divisions: Division[]) {
    if (!definition.divisionId) {
        return 'Todo el club';
    }

    const division = findDivisionById(divisions, definition.divisionId);
    return getDivisionLabel(division, 'Equipo especifico');
}

function getBetterValueDirectionLabel(direction: ClubPhysicalTestBetterValueDirection) {
    return direction === 'lower' ? 'Menor es mejor' : 'Mayor es mejor';
}

function buildGymPlanDraft(defaultDivisionId?: string | null): GymPlanDraft {
    return {
        title: '',
        objective: '',
        notes: '',
        divisionId: defaultDivisionId || 'all',
    };
}

function buildSessionFromPlanDraft(defaultDivisionId?: string | null): SessionFromPlanDraft {
    return {
        title: '',
        divisionId: defaultDivisionId || 'all',
        date: getTodayDateString(),
        startTime: '18:00',
        duration: '60',
        location: 'Gimnasio principal',
        objective: '',
    };
}

function matchesGymPlanScope(plan: ClubGymPlan, division: Division | null, roster: RosterOption | null) {
    if (!plan.divisionId) {
        return true;
    }

    if (division && (plan.divisionId === division.id || plan.divisionId === division.management_id)) {
        return true;
    }

    if (roster?.divisionId && plan.divisionId === roster.divisionId) {
        return true;
    }

    return !division && !roster;
}

function getGymPlanDivisionLabel(plan: ClubGymPlan, divisions: Division[]) {
    if (!plan.divisionId) {
        return 'Todo el club';
    }

    const division = findDivisionById(divisions, plan.divisionId);
    return getDivisionLabel(division, 'Equipo especifico');
}

function toTrainingPlayerSnapshot(person: PersonWithRole) {
    return {
        id: person.id,
        name: getPersonName(person),
        pos: person.position?.trim() || 'Sin puesto',
        divisionId: person.division_id || null,
        divisionName: person.division_name || null,
    };
}

export function ClubPerformanceTab({
    clubId,
    clubName,
    sport,
    divisions,
    players,
    staff,
    dashboardData,
    loading = false,
    onTabChange,
}: ClubPerformanceTabProps) {
    const pathname = usePathname();
    const consoleMode: ClubConsoleMode = pathname?.startsWith('/club-admin') ? 'club-admin' : 'admin';

    const [roster, setRoster] = useState<PersonWithRole[]>(players);
    const [trainings, setTrainings] = useState<TrainingEntry[]>([]);
    const [gymPlans, setGymPlans] = useState<ClubGymPlan[]>([]);
    const [physicalRecords, setPhysicalRecords] = useState<ClubPhysicalRecord[]>([]);
    const [testDefinitions, setTestDefinitions] = useState<ClubPhysicalTestDefinition[]>([]);
    const [performanceRecords, setPerformanceRecords] = useState<RugbyPerformanceRecord[]>([]);
    const [loadingTrainings, setLoadingTrainings] = useState(true);
    const [loadingGymPlans, setLoadingGymPlans] = useState(true);
    const [loadingRecords, setLoadingRecords] = useState(true);
    const [loadingTestDefinitions, setLoadingTestDefinitions] = useState(true);
    const [loadingPerformanceRecords, setLoadingPerformanceRecords] = useState(true);
    const [trainingError, setTrainingError] = useState<string | null>(null);
    const [gymPlanError, setGymPlanError] = useState<string | null>(null);
    const [recordsError, setRecordsError] = useState<string | null>(null);
    const [testDefinitionError, setTestDefinitionError] = useState<string | null>(null);
    const [performanceRecordsError, setPerformanceRecordsError] = useState<string | null>(null);
    const [activeSection, setActiveSection] = useState<PerformanceSection>('resumen');
    const [createOpen, setCreateOpen] = useState(false);
    const [createTestOpen, setCreateTestOpen] = useState(false);
    const [createGymPlanOpen, setCreateGymPlanOpen] = useState(false);
    const [createSessionFromPlanOpen, setCreateSessionFromPlanOpen] = useState(false);
    const [selectedDivisionId, setSelectedDivisionId] = useState('all');
    const [selectedRosterId, setSelectedRosterId] = useState('all');
    const [selectedSeason, setSelectedSeason] = useState(() => resolveActiveSeason(clubId));
    const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
    const [selectedGymPlanId, setSelectedGymPlanId] = useState<string | null>(null);
    const [planRows, setPlanRows] = useState<GymPlanRow[]>([buildEmptyPlanRow()]);
    const [planDirty, setPlanDirty] = useState(false);
    const [savingPlan, setSavingPlan] = useState(false);
    const [savingGymPlan, setSavingGymPlan] = useState(false);
    const [savingSessionFromPlan, setSavingSessionFromPlan] = useState(false);
    const [weightDate, setWeightDate] = useState(getTodayDateString());
    const [weightSource, setWeightSource] = useState('PF');
    const [weightDrafts, setWeightDrafts] = useState<Record<string, string>>({});
    const [weightNotes, setWeightNotes] = useState<Record<string, string>>({});
    const [savingWeights, setSavingWeights] = useState(false);
    const [selectedTestDefinitionId, setSelectedTestDefinitionId] = useState<string | null>(null);
    const [testDate, setTestDate] = useState(getTodayDateString());
    const [testSource, setTestSource] = useState('PF');
    const [testDrafts, setTestDrafts] = useState<Record<string, string>>({});
    const [testNotes, setTestNotes] = useState<Record<string, string>>({});
    const [savingTests, setSavingTests] = useState(false);
    const [savingTestDefinition, setSavingTestDefinition] = useState(false);
    const [testDefinitionDraft, setTestDefinitionDraft] = useState<TestDefinitionDraft>(() => buildTestDefinitionDraft());
    const [gymPlanDraft, setGymPlanDraft] = useState<GymPlanDraft>(() => buildGymPlanDraft());
    const [sessionFromPlanDraft, setSessionFromPlanDraft] = useState<SessionFromPlanDraft>(() => buildSessionFromPlanDraft());

    useEffect(() => {
        setRoster(players);
    }, [clubId, players]);

    useEffect(() => {
        persistActiveSeason(clubId, selectedSeason);
    }, [clubId, selectedSeason]);

    useEffect(() => {
        let cancelled = false;

        const loadTrainings = async () => {
            setLoadingTrainings(true);
            setTrainingError(null);

            try {
                const data = await requestPersistedTrainings(clubId);
                if (!cancelled) {
                    setTrainings(sortTrainings(data));
                }
            } catch (error) {
                if (!cancelled) {
                    setTrainings([]);
                    setTrainingError(error instanceof Error ? error.message : 'No se pudieron cargar las sesiones');
                }
            } finally {
                if (!cancelled) {
                    setLoadingTrainings(false);
                }
            }
        };

        const loadRecords = async () => {
            setLoadingRecords(true);
            setRecordsError(null);

            try {
                const data = await requestPhysicalRecords(clubId);
                if (!cancelled) {
                    setPhysicalRecords(sortRecords(data));
                }
            } catch (error) {
                if (!cancelled) {
                    setPhysicalRecords([]);
                    setRecordsError(error instanceof Error ? error.message : 'No se pudieron cargar pesos y testeos');
                }
            } finally {
                if (!cancelled) {
                    setLoadingRecords(false);
                }
            }
        };

        const loadGymPlans = async () => {
            setLoadingGymPlans(true);
            setGymPlanError(null);

            try {
                const data = await requestGymPlans(clubId);
                if (!cancelled) {
                    setGymPlans(sortGymPlans(data));
                }
            } catch (error) {
                if (!cancelled) {
                    setGymPlans([]);
                    setGymPlanError(error instanceof Error ? error.message : 'No se pudieron cargar los planes de gimnasio');
                }
            } finally {
                if (!cancelled) {
                    setLoadingGymPlans(false);
                }
            }
        };

        const loadDefinitions = async () => {
            setLoadingTestDefinitions(true);
            setTestDefinitionError(null);

            try {
                const data = await requestPhysicalTestDefinitions(clubId);
                if (!cancelled) {
                    setTestDefinitions(sortTestDefinitions(data));
                }
            } catch (error) {
                if (!cancelled) {
                    setTestDefinitions([]);
                    setTestDefinitionError(error instanceof Error ? error.message : 'No se pudieron cargar los testeos definidos');
                }
            } finally {
                if (!cancelled) {
                    setLoadingTestDefinitions(false);
                }
            }
        };

        const loadPerformanceRecords = async () => {
            setLoadingPerformanceRecords(true);
            setPerformanceRecordsError(null);

            try {
                const data = await requestPerformanceRecords(clubId);
                if (!cancelled) {
                    setPerformanceRecords(data);
                }
            } catch (error) {
                if (!cancelled) {
                    setPerformanceRecords([]);
                    setPerformanceRecordsError(error instanceof Error ? error.message : 'No se pudieron cargar las metricas de rugby');
                }
            } finally {
                if (!cancelled) {
                    setLoadingPerformanceRecords(false);
                }
            }
        };

        void Promise.all([loadTrainings(), loadGymPlans(), loadRecords(), loadDefinitions(), loadPerformanceRecords()]);
        return () => {
            cancelled = true;
        };
    }, [clubId]);

    const allMatches = useMemo(
        () => [...dashboardData.upcomingMatches, ...dashboardData.recentMatches, ...dashboardData.pastMatches],
        [dashboardData.pastMatches, dashboardData.recentMatches, dashboardData.upcomingMatches],
    );

    const rosterOptions = useMemo(
        () => buildRosterOptions(roster, divisions),
        [divisions, roster],
    );

    const seasonOptions = useMemo(
        () => getSeasonOptions(trainings, allMatches),
        [allMatches, trainings],
    );

    useEffect(() => {
        if (seasonOptions.includes(selectedSeason)) {
            return;
        }

        setSelectedSeason(seasonOptions[0] ?? String(new Date().getFullYear()));
    }, [seasonOptions, selectedSeason]);

    const selectedDivision = useMemo(
        () => (selectedDivisionId === 'all' ? null : findDivisionById(divisions, selectedDivisionId)),
        [divisions, selectedDivisionId],
    );

    const selectedRoster = useMemo(
        () => rosterOptions.find((option) => option.id === selectedRosterId) ?? null,
        [rosterOptions, selectedRosterId],
    );

    const scopedPlayers = useMemo(
        () => roster.filter((player) => matchesPlayerDivision(player, selectedDivision) && matchesPlayerRoster(player, selectedRoster)),
        [roster, selectedDivision, selectedRoster],
    );

    const scopedStaff = useMemo(
        () => staff.filter((person) => matchesPlayerDivision(person, selectedDivision) && matchesPlayerRoster(person, selectedRoster)),
        [selectedDivision, selectedRoster, staff],
    );

    const scopedTrainings = useMemo(
        () => trainings
            .filter((training) => {
                const date = new Date(training.date);
                return !Number.isNaN(date.getTime()) && String(date.getFullYear()) === selectedSeason;
            })
            .filter((training) => matchesTrainingDivision(training, selectedDivision, divisions, clubName))
            .filter((training) => matchesTrainingRoster(training, selectedRoster)),
        [clubName, divisions, selectedDivision, selectedRoster, selectedSeason, trainings],
    );

    const gymSessions = useMemo(
        () => scopedTrainings.filter((training) => training.type === 'gimnasio'),
        [scopedTrainings],
    );

    const upcomingMatch = useMemo(
        () => dashboardData.upcomingMatches
            .filter((match) => match.dateTime && String(new Date(match.dateTime).getFullYear()) === selectedSeason)
            .filter((match) => matchesMatchDivision(match, selectedDivision))
            .filter((match) => matchesMatchRoster(match, selectedRoster))
            .sort((left, right) => new Date(left.dateTime || 0).getTime() - new Date(right.dateTime || 0).getTime())[0] ?? null,
        [dashboardData.upcomingMatches, selectedDivision, selectedRoster, selectedSeason],
    );

    useEffect(() => {
        if (gymSessions.length === 0) {
            setSelectedSessionId(null);
            return;
        }

        if (selectedSessionId && gymSessions.some((session) => session.id === selectedSessionId)) {
            return;
        }

        setSelectedSessionId(gymSessions[0]?.id ?? null);
    }, [gymSessions, selectedSessionId]);

    const selectedSession = useMemo(
        () => gymSessions.find((session) => session.id === selectedSessionId) ?? null,
        [gymSessions, selectedSessionId],
    );

    useEffect(() => {
        setPlanRows(parsePlanRows(selectedSession));
        setPlanDirty(false);
    }, [selectedSessionId, selectedSession]);

    const visibleGymPlans = useMemo(
        () => sortGymPlans(gymPlans.filter((plan) => matchesGymPlanScope(plan, selectedDivision, selectedRoster))),
        [gymPlans, selectedDivision, selectedRoster],
    );

    useEffect(() => {
        if (visibleGymPlans.length === 0) {
            setSelectedGymPlanId(null);
            return;
        }

        if (selectedGymPlanId && visibleGymPlans.some((plan) => plan.id === selectedGymPlanId)) {
            return;
        }

        setSelectedGymPlanId(visibleGymPlans[0]?.id ?? null);
    }, [selectedGymPlanId, visibleGymPlans]);

    const selectedGymPlan = useMemo(
        () => visibleGymPlans.find((plan) => plan.id === selectedGymPlanId) ?? null,
        [selectedGymPlanId, visibleGymPlans],
    );

    const weightRecords = useMemo(
        () => sortRecords(
            physicalRecords.filter((record) => (
                record.category === 'weight'
                && record.metricKey === BODY_WEIGHT_METRIC_KEY
                && scopedPlayers.some((player) => player.id === record.personId)
            )),
        ),
        [physicalRecords, scopedPlayers],
    );

    const latestWeightByPerson = useMemo(() => getLatestRecordByPerson(weightRecords), [weightRecords]);
    const previousWeightByPerson = useMemo(() => getPreviousRecordByPerson(weightRecords), [weightRecords]);

    const scopedPlayerIdSet = useMemo(
        () => new Set(scopedPlayers.map((player) => player.id)),
        [scopedPlayers],
    );

    const visibleTestDefinitions = useMemo(
        () => sortTestDefinitions(testDefinitions.filter((definition) => matchesTestDefinitionScope(definition, selectedDivision, selectedRoster))),
        [selectedDivision, selectedRoster, testDefinitions],
    );

    useEffect(() => {
        if (visibleTestDefinitions.length === 0) {
            setSelectedTestDefinitionId(null);
            return;
        }

        if (selectedTestDefinitionId && visibleTestDefinitions.some((definition) => definition.id === selectedTestDefinitionId)) {
            return;
        }

        setSelectedTestDefinitionId(visibleTestDefinitions[0]?.id ?? null);
    }, [selectedTestDefinitionId, visibleTestDefinitions]);

    const scopedTestRecords = useMemo(
        () => sortRecords(
            physicalRecords.filter((record) => record.category === 'test' && scopedPlayerIdSet.has(record.personId)),
        ),
        [physicalRecords, scopedPlayerIdSet],
    );

    const testRecordsByMetricKey = useMemo(() => {
        const map = new Map<string, ClubPhysicalRecord[]>();

        scopedTestRecords.forEach((record) => {
            const current = map.get(record.metricKey);
            if (current) {
                current.push(record);
            } else {
                map.set(record.metricKey, [record]);
            }
        });

        return map;
    }, [scopedTestRecords]);

    const selectedTestDefinition = useMemo(
        () => visibleTestDefinitions.find((definition) => definition.id === selectedTestDefinitionId) ?? null,
        [selectedTestDefinitionId, visibleTestDefinitions],
    );

    useEffect(() => {
        setTestDrafts({});
        setTestNotes({});
    }, [selectedTestDefinitionId]);

    const selectedMetricRecords = useMemo(
        () => (selectedTestDefinition ? (testRecordsByMetricKey.get(selectedTestDefinition.metricKey) ?? []) : []),
        [selectedTestDefinition, testRecordsByMetricKey],
    );

    const latestTestByPerson = useMemo(() => getLatestRecordByPerson(selectedMetricRecords), [selectedMetricRecords]);

    const testCards = useMemo<TestCardMetric[]>(
        () => visibleTestDefinitions.map((definition) => {
            const records = testRecordsByMetricKey.get(definition.metricKey) ?? [];
            const latestByPerson = getLatestRecordByPerson(records);

            return {
                definition,
                playersWithResult: latestByPerson.size,
                totalResults: records.length,
                latestRecordedAt: records[0]?.recordedAt ?? null,
            };
        }),
        [testRecordsByMetricKey, visibleTestDefinitions],
    );

    const selectedTestCard = useMemo(
        () => testCards.find((card) => card.definition.id === selectedTestDefinition?.id) ?? null,
        [selectedTestDefinition?.id, testCards],
    );

    const sessionsWithPlan = useMemo(
        () => gymSessions.filter((session) => (session.plan?.blocks.length || 0) > 0).length,
        [gymSessions],
    );

    const planRowsPersisted = useMemo(
        () => gymSessions.reduce((sum, session) => sum + (session.plan?.blocks.length || 0), 0),
        [gymSessions],
    );

    const playersWithWeightLoaded = useMemo(
        () => scopedPlayers.filter((player) => latestWeightByPerson.has(player.id) || typeof player.weight === 'number').length,
        [latestWeightByPerson, scopedPlayers],
    );

    const playersWithAnyTest = useMemo(
        () => new Set(scopedTestRecords.map((record) => record.personId)).size,
        [scopedTestRecords],
    );

    const currentPlanSummary = useMemo(
        () => ({
            rows: planRows.filter((row) => row.exercise.trim()).length,
            duration: planRows.reduce((sum, row) => sum + (Number(row.duration) || 0), 0),
        }),
        [planRows],
    );

    const recentWeightRows = useMemo(() => weightRecords.slice(0, 10), [weightRecords]);
    const recentTestRows = useMemo(() => selectedMetricRecords.slice(0, 10), [selectedMetricRecords]);

    const entrenamientosHref = buildClubManageHref(clubId, 'entrenamientos', consoleMode);
    const handleEntrenamientosLinkClick = (event: React.MouseEvent<HTMLAnchorElement>) => {
        if (!onTabChange) {
            return;
        }

        if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
            return;
        }

        event.preventDefault();
        onTabChange('entrenamientos');
    };

    const isBusy = loading || loadingTrainings || loadingGymPlans || loadingRecords || loadingTestDefinitions || loadingPerformanceRecords;

    async function handleRefreshAll() {
        setLoadingTrainings(true);
        setLoadingGymPlans(true);
        setLoadingRecords(true);
        setLoadingTestDefinitions(true);
        setLoadingPerformanceRecords(true);
        setTrainingError(null);
        setGymPlanError(null);
        setRecordsError(null);
        setTestDefinitionError(null);
        setPerformanceRecordsError(null);

        try {
            const [nextTrainings, nextGymPlans, nextRecords, nextDefinitions, nextPerformanceRecords] = await Promise.all([
                requestPersistedTrainings(clubId),
                requestGymPlans(clubId),
                requestPhysicalRecords(clubId),
                requestPhysicalTestDefinitions(clubId),
                requestPerformanceRecords(clubId),
            ]);
            setTrainings(sortTrainings(nextTrainings));
            setGymPlans(sortGymPlans(nextGymPlans));
            setPhysicalRecords(sortRecords(nextRecords));
            setTestDefinitions(sortTestDefinitions(nextDefinitions));
            setPerformanceRecords(nextPerformanceRecords);
        } catch (error) {
            const message = error instanceof Error ? error.message : 'No se pudo sincronizar el panel';
            setTrainingError(message);
            setGymPlanError(message);
            setRecordsError(message);
            setTestDefinitionError(message);
            setPerformanceRecordsError(message);
        } finally {
            setLoadingTrainings(false);
            setLoadingGymPlans(false);
            setLoadingRecords(false);
            setLoadingTestDefinitions(false);
            setLoadingPerformanceRecords(false);
        }
    }

    async function handleCreateTraining(training: TrainingEntry) {
        try {
            const response = await fetch('/api/club-admin/trainings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify({
                    clubId,
                    training,
                }),
            });
            const payload = await response.json().catch(() => null) as {
                ok?: boolean;
                data?: unknown;
                error?: unknown;
            } | null;

            if (!response.ok || !payload?.ok || !isTrainingEntryPayload(payload.data)) {
                throw new Error(
                    typeof payload?.error === 'string'
                        ? payload.error
                        : 'No se pudo guardar la sesion de gimnasio',
                );
            }

            const nextTraining = payload.data as TrainingEntry;
            setTrainings((current) => upsertTrainingEntry(current, nextTraining));
            setSelectedSessionId(nextTraining.id);
            setActiveSection('gimnasio');
            setCreateOpen(false);
            return true;
        } catch (error) {
            window.alert(error instanceof Error ? error.message : 'No se pudo guardar la sesion');
            return false;
        }
    }

    async function handleSavePlan() {
        if (!selectedSession) {
            window.alert('Selecciona una sesion de gimnasio para guardar el plan.');
            return;
        }

        setSavingPlan(true);

        try {
            const nextBlocks = buildPlanBlocks(planRows);
            const nextTraining: TrainingEntry = {
                ...selectedSession,
                plan: nextBlocks.length > 0 ? { blocks: nextBlocks } : undefined,
            };

            const response = await fetch('/api/club-admin/trainings', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify({
                    clubId,
                    training: nextTraining,
                }),
            });
            const payload = await response.json().catch(() => null) as {
                ok?: boolean;
                data?: unknown;
                error?: unknown;
            } | null;

            if (!response.ok || !payload?.ok || !isTrainingEntryPayload(payload.data)) {
                throw new Error(
                    typeof payload?.error === 'string'
                        ? payload.error
                        : 'No se pudo guardar la planilla del gimnasio',
                );
            }

            const savedTraining = payload.data as TrainingEntry;
            setTrainings((current) => upsertTrainingEntry(current, savedTraining));
            setSelectedSessionId(savedTraining.id);
            setPlanDirty(false);
        } catch (error) {
            window.alert(error instanceof Error ? error.message : 'No se pudo guardar el plan');
        } finally {
            setSavingPlan(false);
        }
    }

    function openSaveGymPlanModal() {
        if (!selectedSession) {
            window.alert('Selecciona una sesion de gimnasio antes de guardar un plan reusable.');
            return;
        }

        setGymPlanDraft({
            title: selectedSession.title ? `Plan ${selectedSession.title}` : '',
            objective: selectedSession.objective || '',
            notes: '',
            divisionId: selectedSession.divisionId || selectedDivision?.id || selectedRoster?.divisionId || 'all',
        });
        setCreateGymPlanOpen(true);
    }

    async function handleSaveGymPlan() {
        const blocks = buildPlanBlocks(planRows);
        if (blocks.length === 0) {
            window.alert('Carga al menos un bloque antes de guardar un plan.');
            return;
        }

        const title = gymPlanDraft.title.trim();
        if (!title) {
            window.alert('Escribe el nombre del plan.');
            return;
        }

        setSavingGymPlan(true);

        try {
            const response = await fetch('/api/club-admin/gym-plans', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify({
                    clubId,
                    plan: {
                        divisionId: gymPlanDraft.divisionId === 'all' ? null : gymPlanDraft.divisionId,
                        title,
                        objective: gymPlanDraft.objective.trim() || null,
                        notes: gymPlanDraft.notes.trim() || null,
                        durationMinutes: blocks.reduce((sum, block) => sum + block.duration, 0),
                        blocks,
                    },
                }),
            });
            const payload = await response.json().catch(() => null) as {
                ok?: boolean;
                data?: unknown;
                error?: unknown;
            } | null;

            if (!response.ok || !payload?.ok || !isGymPlanPayload(payload.data)) {
                throw new Error(
                    typeof payload?.error === 'string'
                        ? payload.error
                        : 'No se pudo guardar el plan de gimnasio',
                );
            }

            const savedPlan = payload.data as ClubGymPlan;
            setGymPlans((current) => sortGymPlans([savedPlan, ...current]));
            setSelectedGymPlanId(savedPlan.id);
            setCreateGymPlanOpen(false);
            setGymPlanDraft(buildGymPlanDraft(selectedDivision?.id || selectedRoster?.divisionId || null));
        } catch (error) {
            window.alert(error instanceof Error ? error.message : 'No se pudo guardar el plan');
        } finally {
            setSavingGymPlan(false);
        }
    }

    function handleLoadGymPlan(plan: ClubGymPlan) {
        setSelectedGymPlanId(plan.id);
        setPlanRows(parsePlanRowsFromBlocks(plan.blocks));
        setPlanDirty(true);
        setActiveSection('gimnasio');
    }

    async function handleApplyGymPlanToSession(plan: ClubGymPlan) {
        if (!selectedSession) {
            window.alert('Selecciona una sesion de gimnasio para aplicar el plan.');
            return;
        }

        setSavingPlan(true);

        try {
            const nextTraining: TrainingEntry = {
                ...selectedSession,
                objective: selectedSession.objective || plan.objective || '',
                duration: selectedSession.duration || plan.durationMinutes || 60,
                plan: { blocks: plan.blocks },
            };

            const response = await fetch('/api/club-admin/trainings', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify({
                    clubId,
                    training: nextTraining,
                }),
            });
            const payload = await response.json().catch(() => null) as {
                ok?: boolean;
                data?: unknown;
                error?: unknown;
            } | null;

            if (!response.ok || !payload?.ok || !isTrainingEntryPayload(payload.data)) {
                throw new Error(
                    typeof payload?.error === 'string'
                        ? payload.error
                        : 'No se pudo aplicar el plan a la sesion',
                );
            }

            const savedTraining = payload.data as TrainingEntry;
            setTrainings((current) => upsertTrainingEntry(current, savedTraining));
            setSelectedSessionId(savedTraining.id);
            setPlanRows(parsePlanRowsFromBlocks(plan.blocks));
            setPlanDirty(false);
        } catch (error) {
            window.alert(error instanceof Error ? error.message : 'No se pudo aplicar el plan');
        } finally {
            setSavingPlan(false);
        }
    }

    function openCreateSessionFromPlan(plan: ClubGymPlan) {
        setSelectedGymPlanId(plan.id);
        setSessionFromPlanDraft({
            title: plan.title,
            divisionId: plan.divisionId || selectedDivision?.id || selectedRoster?.divisionId || 'all',
            date: getTodayDateString(),
            startTime: '18:00',
            duration: String(plan.durationMinutes || 60),
            location: 'Gimnasio principal',
            objective: plan.objective || '',
        });
        setCreateSessionFromPlanOpen(true);
    }

    async function handleCreateSessionFromPlan() {
        const plan = visibleGymPlans.find((item) => item.id === selectedGymPlanId) ?? null;
        if (!plan) {
            window.alert('Selecciona un plan para crear la sesion.');
            return;
        }

        const division = sessionFromPlanDraft.divisionId !== 'all'
            ? findDivisionById(divisions, sessionFromPlanDraft.divisionId)
            : null;
        const playersForSession = roster.filter((player) => (
            matchesPlayerDivision(player, division)
            && (division ? true : matchesPlayerRoster(player, selectedRoster))
        ));
        const sessionPlayers = playersForSession.length > 0
            ? playersForSession
            : (scopedPlayers.length > 0 ? scopedPlayers : roster);
        const sessionStaff = scopedStaff.length > 0 ? scopedStaff : staff;
        const duration = Math.max(Number(sessionFromPlanDraft.duration) || plan.durationMinutes || 60, 1);
        const nextTraining: TrainingEntry = {
            id: `manual-gym-plan-${clubId}-${Date.now()}`,
            title: sessionFromPlanDraft.title.trim() || plan.title,
            date: toSessionDateTime(sessionFromPlanDraft.date, sessionFromPlanDraft.startTime),
            duration,
            type: 'gimnasio',
            location: sessionFromPlanDraft.location.trim() || 'Gimnasio principal',
            status: 'planificado',
            objective: sessionFromPlanDraft.objective.trim() || plan.objective || '',
            staff: sessionStaff.slice(0, 3).map(getPersonName),
            convocados: sessionPlayers.length,
            players: sessionPlayers.map(toTrainingPlayerSnapshot),
            sourceKind: 'manual',
            sourceLabel: `Plan guardado | ${plan.title}`,
            divisionId: division?.id || plan.divisionId || null,
            plan: { blocks: plan.blocks },
            attendance: {},
        };

        setSavingSessionFromPlan(true);
        const saved = await handleCreateTraining(nextTraining);
        setSavingSessionFromPlan(false);

        if (saved) {
            setCreateSessionFromPlanOpen(false);
        }
    }

    async function handleSaveWeights() {
        const recordsToSave: ClubPhysicalRecordInput[] = scopedPlayers.flatMap((player) => {
            const nextWeight = normalizeNumberInput(weightDrafts[player.id] || '');
            if (nextWeight === null) return [];

            return [{
                personId: player.id,
                divisionId: player.division_id || null,
                category: 'weight',
                metricKey: BODY_WEIGHT_METRIC_KEY,
                metricLabel: BODY_WEIGHT_METRIC_LABEL,
                valueNumeric: nextWeight,
                unit: BODY_WEIGHT_UNIT,
                recordedAt: toRecordedAt(weightDate),
                source: weightSource.trim() || null,
                notes: weightNotes[player.id]?.trim() || null,
                payload: {},
            }];
        });

        if (recordsToSave.length === 0) {
            window.alert('Carga al menos un peso antes de guardar.');
            return;
        }

        setSavingWeights(true);

        try {
            const response = await fetch('/api/club-admin/physical-records', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify({
                    clubId,
                    records: recordsToSave,
                }),
            });
            const payload = await response.json().catch(() => null) as {
                ok?: boolean;
                data?: unknown;
                error?: unknown;
            } | null;

            if (!response.ok || !payload?.ok || !Array.isArray(payload.data)) {
                throw new Error(
                    typeof payload?.error === 'string'
                        ? payload.error
                        : 'No se pudieron guardar los pesos',
                );
            }

            const savedRecords = payload.data.filter(isPhysicalRecordPayload);
            setPhysicalRecords((current) => mergePhysicalRecords(current, savedRecords));

            const changedWeights = new Map(
                recordsToSave.map((record) => [record.personId, record.valueNumeric]),
            );

            const patchResults = await Promise.all(
                scopedPlayers
                    .filter((player) => changedWeights.has(player.id))
                    .map(async (player) => {
                        const nextWeight = changedWeights.get(player.id);
                        const patchResponse = await fetch('/api/club-admin/roster', {
                            method: 'PATCH',
                            headers: { 'Content-Type': 'application/json' },
                            credentials: 'same-origin',
                            body: JSON.stringify({
                                clubId,
                                personId: player.id,
                                first_name: player.first_name,
                                last_name: player.last_name,
                                role: player.role,
                                division_id: player.division_id,
                                status: player.status,
                                position: player.position,
                                birth_date: player.birth_date,
                                weight: nextWeight,
                                height: player.height,
                            }),
                        });

                        const patchPayload = await patchResponse.json().catch(() => null) as {
                            ok?: boolean;
                            error?: unknown;
                        } | null;

                        if (!patchResponse.ok || !patchPayload?.ok) {
                            throw new Error(
                                typeof patchPayload?.error === 'string'
                                    ? patchPayload.error
                                    : `No se pudo actualizar el peso actual de ${getPersonName(player)}`,
                            );
                        }
                    }),
            );

            void patchResults;

            setRoster((current) => current.map((player) => (
                changedWeights.has(player.id)
                    ? { ...player, weight: changedWeights.get(player.id) }
                    : player
            )));
            setWeightDrafts({});
            setWeightNotes({});
        } catch (error) {
            window.alert(error instanceof Error ? error.message : 'No se pudieron guardar los pesos');
        } finally {
            setSavingWeights(false);
        }
    }

    async function handleSaveTests() {
        if (!selectedTestDefinition) {
            window.alert('Define o selecciona un test antes de cargar resultados.');
            return;
        }

        const recordsToSave: ClubPhysicalRecordInput[] = scopedPlayers.flatMap((player) => {
            const nextValue = normalizeNumberInput(testDrafts[player.id] || '');
            if (nextValue === null) return [];

            return [{
                personId: player.id,
                divisionId: player.division_id || null,
                category: 'test',
                metricKey: selectedTestDefinition.metricKey,
                metricLabel: selectedTestDefinition.label,
                valueNumeric: nextValue,
                unit: selectedTestDefinition.unit,
                recordedAt: toRecordedAt(testDate),
                source: testSource.trim() || null,
                notes: testNotes[player.id]?.trim() || null,
                payload: {
                    definitionId: selectedTestDefinition.id,
                    betterValueDirection: selectedTestDefinition.betterValueDirection,
                },
            }];
        });

        if (recordsToSave.length === 0) {
            window.alert('Carga al menos un valor de test antes de guardar.');
            return;
        }

        setSavingTests(true);

        try {
            const response = await fetch('/api/club-admin/physical-records', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify({
                    clubId,
                    records: recordsToSave,
                }),
            });
            const payload = await response.json().catch(() => null) as {
                ok?: boolean;
                data?: unknown;
                error?: unknown;
            } | null;

            if (!response.ok || !payload?.ok || !Array.isArray(payload.data)) {
                throw new Error(
                    typeof payload?.error === 'string'
                        ? payload.error
                        : 'No se pudieron guardar los testeos',
                );
            }

            const savedRecords = payload.data.filter(isPhysicalRecordPayload);
            setPhysicalRecords((current) => mergePhysicalRecords(current, savedRecords));
            setTestDrafts({});
            setTestNotes({});
        } catch (error) {
            window.alert(error instanceof Error ? error.message : 'No se pudieron guardar los testeos');
        } finally {
            setSavingTests(false);
        }
    }

    function openCreateTestModal() {
        setTestDefinitionDraft(buildTestDefinitionDraft(selectedDivision?.id || selectedRoster?.divisionId || null));
        setCreateTestOpen(true);
    }

    async function handleCreateTestDefinition() {
        const label = testDefinitionDraft.label.trim();
        const metricKey = slugifyMetricKey(testDefinitionDraft.metricKey || label);

        if (!label) {
            window.alert('Escribe el nombre del test.');
            return;
        }

        if (!metricKey) {
            window.alert('No se pudo generar una clave tecnica valida para el test.');
            return;
        }

        setSavingTestDefinition(true);

        try {
            const response = await fetch('/api/club-admin/physical-tests/definitions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify({
                    clubId,
                    definition: {
                        divisionId: testDefinitionDraft.divisionId === 'all' ? null : testDefinitionDraft.divisionId,
                        metricKey,
                        label,
                        unit: testDefinitionDraft.unit.trim() || null,
                        betterValueDirection: testDefinitionDraft.betterValueDirection,
                        notes: testDefinitionDraft.notes.trim() || null,
                    },
                }),
            });
            const payload = await response.json().catch(() => null) as {
                ok?: boolean;
                data?: unknown;
                error?: unknown;
            } | null;

            if (!response.ok || !payload?.ok || !isPhysicalTestDefinitionPayload(payload.data)) {
                throw new Error(
                    typeof payload?.error === 'string'
                        ? payload.error
                        : 'No se pudo guardar el test',
                );
            }

            const savedDefinition = payload.data as ClubPhysicalTestDefinition;
            setTestDefinitions((current) => sortTestDefinitions([...current, savedDefinition]));
            setSelectedTestDefinitionId(savedDefinition.id);
            setCreateTestOpen(false);
            setTestDefinitionDraft(buildTestDefinitionDraft(selectedDivision?.id || selectedRoster?.divisionId || null));
        } catch (error) {
            window.alert(error instanceof Error ? error.message : 'No se pudo guardar el test');
        } finally {
            setSavingTestDefinition(false);
        }
    }

    const selectedSessionPlanRows = useMemo(
        () => parsePlanRows(selectedSession),
        [selectedSession],
    );

    const evaluatedTrainings = useMemo(
        () => scopedTrainings.filter((training) => Boolean(training.evaluation)),
        [scopedTrainings],
    );

    const averageLoad = useMemo(
        () => average(evaluatedTrainings.map((training) => training.evaluation?.loadTotal ?? Number.NaN)),
        [evaluatedTrainings],
    );

    const averageRpe = useMemo(
        () => average(evaluatedTrainings.map((training) => training.evaluation?.rpe ?? Number.NaN)),
        [evaluatedTrainings],
    );

    const averageFatigue = useMemo(
        () => average(evaluatedTrainings.map((training) => training.evaluation?.fatigue ?? Number.NaN)),
        [evaluatedTrainings],
    );

    const attendanceAverage = useMemo(() => {
        const percentages = scopedTrainings
            .map((training) => {
                const attendance = training.attendance ? Object.values(training.attendance) : [];
                const denominator = Math.max(training.players?.length || training.convocados || scopedPlayers.length || 0, 0);
                if (!denominator || attendance.length === 0) return Number.NaN;
                const confirmed = attendance.filter(isPresentAttendanceState).length;
                return Math.round((confirmed / denominator) * 100);
            });

        return average(percentages);
    }, [scopedPlayers.length, scopedTrainings]);

    const injuryReports = useMemo(
        () => evaluatedTrainings.filter((training) => training.evaluation?.injuries?.trim()).length,
        [evaluatedTrainings],
    );

    const rugbyInsights = useMemo(
        () => calculateRugbyPerformanceInsights(performanceRecords),
        [performanceRecords],
    );

    const trainingTechnicalEvents = useMemo(
        () => scopedTrainings.flatMap((training) => (
            (training.evaluation?.technicalEvents ?? []).map((event) => ({
                ...event,
                trainingId: training.id,
                trainingTitle: training.title,
                trainingDate: training.date,
            }))
        )),
        [scopedTrainings],
    );

    const exerciseScoreRows = useMemo(
        () => scopedTrainings.flatMap((training) => (
            (training.evaluation?.exerciseScores ?? []).map((score) => ({
                ...score,
                trainingId: training.id,
                trainingTitle: training.title,
                trainingDate: training.date,
                blockTitle: training.plan?.blocks.find((block) => block.id === score.blockId)?.title || 'Ejercicio',
            }))
        )),
        [scopedTrainings],
    );

    const technicalEventSummary = useMemo(() => {
        const grouped = new Map<TrainingTechnicalEventType, {
            type: TrainingTechnicalEventType;
            total: number;
            successful: number;
            failed: number;
            lostBalls: number;
            errors: number;
            rows: number;
        }>();

        trainingTechnicalEvents.forEach((event) => {
            const current = grouped.get(event.type) ?? {
                type: event.type,
                total: 0,
                successful: 0,
                failed: 0,
                lostBalls: 0,
                errors: 0,
                rows: 0,
            };
            current.total += getTechnicalEventTotal(event);
            current.successful += event.successful;
            current.failed += event.failed;
            current.lostBalls += event.lostBalls;
            current.errors += event.errors;
            current.rows += 1;
            grouped.set(event.type, current);
        });

        return Array.from(grouped.values()).sort((left, right) => right.total - left.total);
    }, [trainingTechnicalEvents]);

    const globalTechnicalEffectiveness = useMemo(
        () => percentFromParts(
            technicalEventSummary.reduce((sum, item) => sum + item.successful, 0),
            technicalEventSummary.reduce((sum, item) => sum + item.total, 0),
        ),
        [technicalEventSummary],
    );

    const playerAnalysisRows = useMemo(
        () => scopedPlayers.map((player) => {
            const playerTrainings = scopedTrainings.filter((training) => (
                training.players?.some((snapshot) => snapshot.id === player.id)
            ));
            const attendanceRows = playerTrainings
                .map((training) => training.attendance?.[player.id])
                .filter(Boolean);
            const presentRows = attendanceRows.filter(isPresentAttendanceState).length;
            const playerTests = scopedTestRecords.filter((record) => record.personId === player.id);
            const playerGymRows = performanceRecords.filter((record) => record.moduleKey === 'gym' && record.playerId === player.id);

            return {
                player,
                attendance: percentFromParts(presentRows, playerTrainings.length || attendanceRows.length),
                trainings: playerTrainings.length,
                tests: playerTests.length,
                gymRows: playerGymRows.length,
                latestTest: playerTests[0] ?? null,
                latestGym: playerGymRows
                    .slice()
                    .sort((left, right) => new Date(right.eventDate).getTime() - new Date(left.eventDate).getTime())[0] ?? null,
            };
        }).sort((left, right) => (right.attendance ?? -1) - (left.attendance ?? -1)),
        [performanceRecords, scopedPlayers, scopedTestRecords, scopedTrainings],
    );

    const activeAlertCount = useMemo(
        () => rugbyInsights.alerts.filter((alert) => alert.level !== 'ok').length + injuryReports,
        [injuryReports, rugbyInsights.alerts],
    );

    const loadTrend = useMemo(() => {
        const rows = evaluatedTrainings
            .filter((training) => typeof training.evaluation?.loadTotal === 'number')
            .sort((left, right) => new Date(left.date).getTime() - new Date(right.date).getTime())
            .slice(-6);
        const maxLoad = Math.max(...rows.map((training) => training.evaluation?.loadTotal ?? 0), 1);

        return rows.map((training) => ({
            id: training.id,
            label: formatShortDate(training.date),
            load: training.evaluation?.loadTotal ?? 0,
            height: Math.max(((training.evaluation?.loadTotal ?? 0) / maxLoad) * 100, 8),
            readiness: Math.max(10, Math.min(88, ((training.evaluation?.energy ?? 5) / 10) * 100)),
        }));
    }, [evaluatedTrainings]);

    const performanceKpis = [
        {
            label: 'Carga promedio',
            value: formatAverage(averageLoad),
            detail: `${evaluatedTrainings.length} sesiones evaluadas`,
        },
        {
            label: 'Asistencia promedio',
            value: formatAverage(attendanceAverage, '%'),
            detail: `${scopedTrainings.length} entrenamientos filtrados`,
        },
        {
            label: 'RPE promedio',
            value: formatAverage(averageRpe),
            detail: `Fatiga ${formatAverage(averageFatigue)}`,
        },
        {
            label: 'Scrum',
            value: formatPercent(rugbyInsights.scrumEffectiveness),
            detail: `${rugbyInsights.matchRows} filas tecnicas`,
        },
        {
            label: 'Line',
            value: formatPercent(rugbyInsights.lineEffectiveness),
            detail: `${rugbyInsights.matchRows} filas tecnicas`,
        },
        {
            label: 'Patadas',
            value: formatPercent(rugbyInsights.kickEffectiveness),
            detail: rugbyInsights.topKicker ? `Top ${rugbyInsights.topKicker}` : 'sin top definido',
        },
        {
            label: 'Trabajo tecnico',
            value: formatPercent(globalTechnicalEffectiveness),
            detail: `${trainingTechnicalEvents.length} eventos de entrenamiento`,
        },
        {
            label: 'Penales',
            value: String(rugbyInsights.penalties),
            detail: `${rugbyInsights.triesFor}/${rugbyInsights.triesAgainst} tries`,
        },
        {
            label: 'Alertas',
            value: String(activeAlertCount),
            detail: activeAlertCount > 0 ? 'requieren lectura del staff' : 'sin riesgos criticos',
        },
    ];

    const weightCoverageDetail = `${playersWithWeightLoaded}/${scopedPlayers.length || 0} jugadores con peso real`;
    const testCoverageDetail = selectedTestDefinition
        ? `${selectedTestCard?.playersWithResult || 0}/${scopedPlayers.length || 0} jugadores con ${selectedTestDefinition.label}`
        : `${playersWithAnyTest}/${scopedPlayers.length || 0} jugadores con al menos un test`;

    return (
        <div className={styles.shell}>
            <section className={styles.hero}>
                <div className={styles.heroCopy}>
                    <span className={styles.kicker}>Dashboard de rendimiento</span>
                    <h2>Rendimiento</h2>
                    <p>
                        Interpretá y decidí a partir de carga, asistencia, técnica y alertas.
                        El modo avanzado consolidá datos de gimnasio, testeos y planillas del staff.
                    </p>
                    <p>
                        {clubName}
                        {selectedDivision ? ` / ${getDivisionLabel(selectedDivision, clubName)}` : ''}
                        {selectedRoster ? ` / ${selectedRoster.label}` : ''}
                        {` / Temporada ${selectedSeason}`}
                    </p>
                </div>

                <div className={styles.heroActions}>
                    <button
                        type="button"
                        className={cn('btn btn-primary', styles.actionButton)}
                        onClick={() => onTabChange?.('entrenamientos')}
                    >
                        <ChevronRight className="w-4 h-4" />
                        Abrir Entrenamiento
                    </button>
                    <button
                        type="button"
                        className={cn('btn', styles.actionButton)}
                        onClick={() => setActiveSection('trabajo')}
                    >
                        <BarChart3 className="w-4 h-4" />
                        Ver técnica
                    </button>
                    <button
                        type="button"
                        className={cn('btn', styles.actionButton)}
                        onClick={() => { void handleRefreshAll(); }}
                    >
                        <RefreshCw className={cn('w-4 h-4', isBusy && styles.spinning)} />
                        Sincronizar
                    </button>
                </div>
            </section>

            <section className={styles.filterBar}>
                <label className={styles.filterField}>
                    <span>Club</span>
                    <input value={clubName} readOnly />
                </label>
                <label className={styles.filterField}>
                    <span>Equipo</span>
                    <select value={selectedDivisionId} onChange={(event) => setSelectedDivisionId(event.target.value)}>
                        <option value="all">Todos</option>
                        {divisions.map((division) => (
                            <option key={division.id} value={division.id}>
                                {getDivisionLabel(division, clubName)}
                            </option>
                        ))}
                    </select>
                </label>
                <label className={styles.filterField}>
                    <span>Plantel</span>
                    <select value={selectedRosterId} onChange={(event) => setSelectedRosterId(event.target.value)}>
                        <option value="all">Todo el plantel</option>
                        {rosterOptions.map((option) => (
                            <option key={option.id} value={option.id}>
                                {option.label}
                            </option>
                        ))}
                    </select>
                </label>
                <label className={styles.filterField}>
                    <span>Temporada</span>
                    <select value={selectedSeason} onChange={(event) => setSelectedSeason(event.target.value)}>
                        {seasonOptions.map((season) => (
                            <option key={season} value={season}>{season}</option>
                        ))}
                    </select>
                </label>
                <label className={styles.filterField}>
                    <span>Partido</span>
                    <input
                        value={upcomingMatch ? `${formatDateTime(upcomingMatch.dateTime)} vs ${upcomingMatch.opponentShortName || upcomingMatch.opponentName}` : 'Sin partido cargado'}
                        readOnly
                    />
                </label>
            </section>

            {(trainingError || gymPlanError || recordsError || testDefinitionError || performanceRecordsError) ? (
                <div className={styles.inlineNotice}>
                    <span>{trainingError || gymPlanError || recordsError || testDefinitionError || performanceRecordsError}</span>
                </div>
            ) : null}

            <section className={styles.kpiGrid}>
                {performanceKpis
                    .filter((kpi) => kpi.value !== '--' && kpi.value !== '--%')
                    .map((kpi) => (
                        <button
                            key={kpi.label}
                            type="button"
                            className={styles.kpiCard}
                            onClick={() => {
                                if (['Scrum', 'Line', 'Patadas', 'Penales'].includes(kpi.label)) setActiveSection('rugby');
                                else if (kpi.label === 'Trabajo tecnico') setActiveSection('trabajo');
                                else if (kpi.label === 'Asistencia promedio') setActiveSection('equipo');
                                else if (kpi.label === 'Alertas') setActiveSection('resumen');
                                else setActiveSection('tiempo');
                            }}
                        >
                            <span className={styles.kpiLabel}>{kpi.label}</span>
                            <strong className={styles.kpiValue}>{kpi.value}</strong>
                            <span className={styles.kpiDetail}>{kpi.detail}</span>
                        </button>
                    ))}
            </section>

            <div className={styles.sectionTabs}>
                {SECTION_TABS.filter((s) => s.group === 'core').map((section) => (
                    <button
                        key={section.id}
                        type="button"
                        className={cn(styles.sectionTab, activeSection === section.id && styles.sectionTabActive)}
                        aria-pressed={activeSection === section.id}
                        onClick={() => setActiveSection(section.id)}
                    >
                        {section.label}
                    </button>
                ))}
                <span style={{ width: 1, background: 'rgba(255,255,255,0.08)', margin: '4px 8px' }} />
                {ADVANCED_TABS.map((section) => (
                    <button
                        key={section.id}
                        type="button"
                        className={cn(styles.sectionTab, activeSection === section.id && styles.sectionTabActive)}
                        aria-pressed={activeSection === section.id}
                        onClick={() => setActiveSection(section.id)}
                    >
                        {section.label}
                    </button>
                ))}
            </div>

            {isBusy ? (
                <div className={styles.emptyState}>Cargando rendimiento...</div>
            ) : null}

            {!isBusy && activeSection === 'resumen' ? (
                <div className={styles.sectionStack}>
                    <div className={styles.summaryGrid}>
                        <section className={styles.panel}>
                            <div className={styles.panelHead}>
                                <div>
                                    <span className={styles.panelKicker}>Resumen ejecutivo</span>
                                    <h3>Tendencia de carga y respuesta del plantel</h3>
                                </div>
                                <div className={styles.panelMeta}>
                                    <span>Filtro activo</span>
                                    <strong>{selectedSeason}</strong>
                                </div>
                            </div>

                            {loadTrend.length === 0 ? (
                                <div className={styles.emptyState}>
                                    Todavia no hay cierres de entrenamiento con carga para mostrar tendencia.
                                </div>
                            ) : (
                                <>
                                    <div className={styles.trendGrid}>
                                        {loadTrend.map((item) => (
                                            <div key={item.id} className={styles.trendColumn}>
                                                <div className={styles.trendTrack}>
                                                    <div className={styles.trendBar} style={{ height: `${item.height}%` }} />
                                                    <span className={styles.trendReadiness} style={{ bottom: `${item.readiness}%` }} />
                                                </div>
                                                <strong>{item.load}</strong>
                                                <span>{item.label}</span>
                                            </div>
                                        ))}
                                    </div>
                                    <div className={styles.metricRibbon}>
                                        <article>
                                            <span>Carga</span>
                                            <strong>{formatAverage(averageLoad)}</strong>
                                            <small>promedio del filtro</small>
                                        </article>
                                        <article>
                                            <span>RPE</span>
                                            <strong>{formatAverage(averageRpe)}</strong>
                                            <small>percepcion media</small>
                                        </article>
                                        <article>
                                            <span>Fatiga</span>
                                            <strong>{formatAverage(averageFatigue)}</strong>
                                            <small>post sesion</small>
                                        </article>
                                        <article>
                                            <span>Asistencia</span>
                                            <strong>{formatAverage(attendanceAverage, '%')}</strong>
                                            <small>confirmados</small>
                                        </article>
                                    </div>
                                </>
                            )}
                        </section>

                        <aside className={styles.panel}>
                            <div className={styles.panelHead}>
                                <div>
                                    <span className={styles.panelKicker}>Alertas</span>
                                    <h3>Lecturas principales</h3>
                                </div>
                            </div>
                            <div className={styles.alertList}>
                                {rugbyInsights.alerts.map((alert) => (
                                    <button
                                        key={alert.id}
                                        type="button"
                                        className={styles.alertItem}
                                        onClick={() => setActiveSection('rugby')}
                                    >
                                        <span className={cn(
                                            styles.alertStripe,
                                            alert.level === 'ok' && styles.levelGreen,
                                            alert.level === 'warning' && styles.levelYellow,
                                            alert.level === 'danger' && styles.levelRed,
                                        )} />
                                        <div>
                                            <strong>{alert.title}</strong>
                                            <p>{alert.detail}</p>
                                        </div>
                                    </button>
                                ))}
                                {injuryReports > 0 ? (
                                    <button type="button" className={styles.alertItem} onClick={() => setActiveSection('fisico')}>
                                        <span className={cn(styles.alertStripe, styles.levelYellow)} />
                                        <div>
                                            <strong>Incidencias fisicas</strong>
                                            <p>{injuryReports} sesiones tienen molestias o lesiones reportadas.</p>
                                        </div>
                                    </button>
                                ) : null}
                            </div>
                        </aside>
                    </div>

                    <div className={styles.summarySecondary}>
                        <section className={styles.panel}>
                            <div className={styles.panelHead}>
                                <div>
                                    <span className={styles.panelKicker}>Top mejoras</span>
                                    <h3>Metricas destacadas</h3>
                                </div>
                            </div>
                            <div className={styles.cardGrid}>
                                <button type="button" className={styles.infoCard} onClick={() => setActiveSection('rugby')}>
                                    <span>Rugby</span>
                                    <strong>{formatPercent(rugbyInsights.kickEffectiveness)}</strong>
                                    <p>efectividad de patadas cargadas</p>
                                </button>
                                <button type="button" className={styles.infoCard} onClick={() => setActiveSection('jugador')}>
                                    <span>Testeos</span>
                                    <strong>{playersWithAnyTest}</strong>
                                    <p>jugadores con al menos un resultado</p>
                                </button>
                                <button type="button" className={styles.infoCard} onClick={() => setActiveSection('tiempo')}>
                                    <span>Pesos</span>
                                    <strong>{playersWithWeightLoaded}</strong>
                                    <p>{weightCoverageDetail}</p>
                                </button>
                            </div>
                        </section>

                        <section className={styles.panel}>
                            <div className={styles.panelHead}>
                                <div>
                                    <span className={styles.panelKicker}>Proximas acciones</span>
                                    <h3>Donde seguir</h3>
                                </div>
                            </div>
                            <div className={styles.detailStack}>
                                <button type="button" className={styles.sessionStateItem} onClick={() => setActiveSection('rugby')}>
                                    <strong>Revisar metricas tecnicas</strong>
                                    <span>Scrum, line, patadas, penales y tries</span>
                                </button>
                                <button type="button" className={styles.sessionStateItem} onClick={() => setActiveSection('tiempo')}>
                                    <strong>Mirar carga fisica</strong>
                                    <span>RPE, fatiga, lesiones y GPS manual</span>
                                </button>
                                <button type="button" className={styles.sessionStateItem} onClick={() => setActiveSection('trabajo')}>
                                    <strong>Auditar gimnasio</strong>
                                    <span>Historial, planes y cumplimiento por sesion</span>
                                </button>
                            </div>
                        </section>
                    </div>
                </div>
            ) : null}

            {!isBusy && activeSection === 'tiempo' ? (
                <div className={styles.sectionStack}>
                    <section className={styles.panel}>
                        <div className={styles.panelHead}>
                            <div>
                                <span className={styles.panelKicker}>Evolucion</span>
                                <h3>Carga, asistencia y respuesta en el tiempo</h3>
                            </div>
                            <div className={styles.panelMeta}>
                                <span>Periodo</span>
                                <strong>{selectedSeason}</strong>
                            </div>
                        </div>

                        {loadTrend.length === 0 ? (
                            <div className={styles.emptyState}>Todavia no hay suficientes cierres para graficar evolucion.</div>
                        ) : (
                            <div className={styles.trendGrid}>
                                {loadTrend.map((item) => (
                                    <div key={item.id} className={styles.trendColumn}>
                                        <div className={styles.trendTrack}>
                                            <div className={styles.trendBar} style={{ height: `${item.height}%` }} />
                                            <span className={styles.trendReadiness} style={{ bottom: `${item.readiness}%` }} />
                                        </div>
                                        <strong>{item.load}</strong>
                                        <span>{item.label}</span>
                                    </div>
                                ))}
                            </div>
                        )}

                        <div className={styles.metricRibbon}>
                            <article>
                                <span>Carga promedio</span>
                                <strong>{formatAverage(averageLoad)}</strong>
                                <small>sesiones evaluadas</small>
                            </article>
                            <article>
                                <span>Asistencia</span>
                                <strong>{formatAverage(attendanceAverage, '%')}</strong>
                                <small>presentes + tarde</small>
                            </article>
                            <article>
                                <span>Gimnasio</span>
                                <strong>{performanceRecords.filter((record) => record.moduleKey === 'gym').length}</strong>
                                <small>filas de carga</small>
                            </article>
                            <article>
                                <span>Testeos</span>
                                <strong>{scopedTestRecords.length}</strong>
                                <small>registros fisicos</small>
                            </article>
                        </div>
                    </section>

                    <section className={styles.panel}>
                        <div className={styles.panelHead}>
                            <div>
                                <span className={styles.panelKicker}>Ultimos cierres</span>
                                <h3>Entrenamientos que alimentan el grafico</h3>
                            </div>
                        </div>
                        <div className={styles.sessionList}>
                            {evaluatedTrainings.slice(0, 8).map((training) => (
                                <article key={training.id} className={styles.sessionCard}>
                                    <div className={styles.sessionCardTop}>
                                        <div>
                                            <strong>{training.title}</strong>
                                            <p>{formatDateTime(training.date)}</p>
                                        </div>
                                        <span className={styles.statusBadge}>{training.type}</span>
                                    </div>
                                    <div className={styles.sessionProgressRow}>
                                        <span>Carga {training.evaluation?.loadTotal ?? '--'}</span>
                                        <span>RPE {training.evaluation?.rpe ?? '--'}</span>
                                        <span>Fatiga {training.evaluation?.fatigue ?? '--'}</span>
                                    </div>
                                </article>
                            ))}
                            {evaluatedTrainings.length === 0 ? (
                                <div className={styles.emptyState}>Sin entrenamientos cerrados en el filtro.</div>
                            ) : null}
                        </div>
                    </section>
                </div>
            ) : null}

            {!isBusy && activeSection === 'jugador' ? (
                <div className={styles.workspaceGrid}>
                    <section className={styles.panel}>
                        <div className={styles.panelHead}>
                            <div>
                                <span className={styles.panelKicker}>Jugador</span>
                                <h3>Lectura individual del plantel</h3>
                            </div>
                            <div className={styles.panelMeta}>
                                <span>Plantel</span>
                                <strong>{scopedPlayers.length}</strong>
                            </div>
                        </div>

                        <div className={styles.tableWrap}>
                            <table className={styles.dataTable}>
                                <thead>
                                    <tr>
                                        <th>Jugador</th>
                                        <th>Asistencia</th>
                                        <th>Entrenamientos</th>
                                        <th>Testeos</th>
                                        <th>Gym</th>
                                        <th>Ultimo fisico</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {playerAnalysisRows.map((row) => (
                                        <tr key={row.player.id}>
                                            <td>
                                                <button type="button" className={styles.tablePlayerButton}>
                                                    <strong>{getPersonName(row.player)}</strong>
                                                    <small>{row.player.position || row.player.division_name || 'Sin puesto'}</small>
                                                </button>
                                            </td>
                                            <td>{formatPercent(row.attendance)}</td>
                                            <td>{row.trainings}</td>
                                            <td>{row.tests}</td>
                                            <td>{row.gymRows}</td>
                                            <td>{row.latestTest ? `${row.latestTest.metricLabel}: ${formatMetricValue(row.latestTest.valueNumeric, row.latestTest.unit)}` : '--'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </section>

                    <aside className={styles.panel}>
                        <div className={styles.panelHead}>
                            <div>
                                <span className={styles.panelKicker}>Comparativa</span>
                                <h3>Contra promedio del equipo</h3>
                            </div>
                        </div>
                        <div className={styles.metricList}>
                            {playerAnalysisRows.slice(0, 8).map((row) => (
                                <div key={row.player.id} className={styles.metricListItem}>
                                    <div>
                                        <strong>{getPersonName(row.player)}</strong>
                                        <p>{row.trainings} entrenamientos / {row.gymRows} cargas gym</p>
                                    </div>
                                    <div className={styles.metricListValue}>
                                        <strong>{formatPercent(row.attendance)}</strong>
                                        <small>{row.latestGym ? `Gym ${formatShortDate(row.latestGym.eventDate)}` : 'Sin gym reciente'}</small>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </aside>
                </div>
            ) : null}

            {!isBusy && activeSection === 'equipo' ? (
                <div className={styles.sectionStack}>
                    <section className={styles.panel}>
                        <div className={styles.panelHead}>
                            <div>
                                <span className={styles.panelKicker}>Equipo</span>
                                <h3>Indicadores colectivos</h3>
                            </div>
                        </div>
                        <div className={styles.metricRibbon}>
                            <article>
                                <span>Asistencia</span>
                                <strong>{formatAverage(attendanceAverage, '%')}</strong>
                                <small>promedio del filtro</small>
                            </article>
                            <article>
                                <span>Efectividad tecnica</span>
                                <strong>{formatPercent(globalTechnicalEffectiveness)}</strong>
                                <small>eventos de entrenamiento</small>
                            </article>
                            <article>
                                <span>Jugadas / secuencias</span>
                                <strong>{trainingTechnicalEvents.filter((event) => event.type === 'jugadas' || event.type === 'secuencias').length}</strong>
                                <small>filas trabajadas</small>
                            </article>
                            <article>
                                <span>Errores</span>
                                <strong>{trainingTechnicalEvents.reduce((sum, event) => sum + event.errors + event.lostBalls, 0)}</strong>
                                <small>perdidas y errores</small>
                            </article>
                        </div>
                    </section>

                    <section className={styles.panel}>
                        <div className={styles.panelHead}>
                            <div>
                                <span className={styles.panelKicker}>Tendencias</span>
                                <h3>Aspectos con mayor volumen</h3>
                            </div>
                        </div>
                        <div className={styles.cardGrid}>
                            {technicalEventSummary.map((item) => (
                                <button key={item.type} type="button" className={styles.infoCard} onClick={() => setActiveSection('trabajo')}>
                                    <span>{getTechnicalEventTypeLabel(item.type)}</span>
                                    <strong>{formatPercent(percentFromParts(item.successful, item.total))}</strong>
                                    <p>{item.total} repeticiones / {item.errors + item.lostBalls} errores o perdidas</p>
                                </button>
                            ))}
                            {technicalEventSummary.length === 0 ? (
                                <div className={styles.emptyState}>Carga eventos especificos desde Entrenamiento para ver tendencias tecnicas.</div>
                            ) : null}
                        </div>
                    </section>
                </div>
            ) : null}

            {!isBusy && activeSection === 'trabajo' ? (
                <div className={styles.workspaceGrid}>
                    <section className={styles.panel}>
                        <div className={styles.panelHead}>
                            <div>
                                <span className={styles.panelKicker}>Lo trabajado</span>
                                <h3>Volumen y resultado de entrenamientos</h3>
                            </div>
                            <div className={styles.panelMeta}>
                                <span>Eventos</span>
                                <strong>{trainingTechnicalEvents.length}</strong>
                            </div>
                        </div>

                        {technicalEventSummary.length === 0 ? (
                            <div className={styles.emptyState}>Todavia no hay eventos de patadas, jugadas, scrums, lines o secuencias cargados.</div>
                        ) : (
                            <div className={styles.metricList}>
                                {technicalEventSummary.map((item) => (
                                    <div key={item.type} className={styles.metricListItem}>
                                        <div>
                                            <strong>{getTechnicalEventTypeLabel(item.type)}</strong>
                                            <p>{item.rows} cargas / {item.total} repeticiones</p>
                                        </div>
                                        <div className={styles.metricListValue}>
                                            <strong>{formatPercent(percentFromParts(item.successful, item.total))}</strong>
                                            <small>{item.failed} fallidas / {item.lostBalls} perdidas</small>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </section>

                    <aside className={styles.panel}>
                        <div className={styles.panelHead}>
                            <div>
                                <span className={styles.panelKicker}>Ultimas filas</span>
                                <h3>Detalle de eventos y ejercicios</h3>
                            </div>
                        </div>
                        <div className={styles.detailStack}>
                            {trainingTechnicalEvents.slice(0, 8).map((event) => (
                                <article key={`${event.trainingId}-${event.id}`} className={styles.detailCard}>
                                    <strong>{event.name || getTechnicalEventTypeLabel(event.type)}</strong>
                                    <p>{event.trainingTitle} / {formatShortDate(event.trainingDate)} / {event.zone || 'sin zona'}</p>
                                    <div className={styles.tagCloud}>
                                        <span className={styles.tag}>{getTechnicalEventTypeLabel(event.type)}</span>
                                        <span className={styles.tag}>{formatPercent(getTechnicalEventEffectiveness(event))}</span>
                                        <span className={styles.tag}>{getTechnicalEventTotal(event)} reps</span>
                                    </div>
                                </article>
                            ))}
                            {exerciseScoreRows.slice(0, 4).map((score) => (
                                <article key={`${score.trainingId}-${score.blockId}`} className={styles.detailCard}>
                                    <strong>{score.blockTitle}</strong>
                                    <p>{score.trainingTitle} / puntaje {score.score}/10 / {score.result}</p>
                                </article>
                            ))}
                        </div>
                    </aside>
                </div>
            ) : null}

            {!isBusy && (activeSection === 'rugby' || activeSection === 'planillas') ? (
                <ClubStaffPerformanceSuite
                    clubId={clubId}
                    clubName={clubName}
                    divisions={divisions}
                    players={players}
                    staff={staff}
                    dashboardData={dashboardData}
                    focus={activeSection === 'planillas' ? 'sheets' : 'rugby'}
                />
            ) : null}

            {!isBusy && activeSection === 'fisico' ? (
                <div className={styles.sectionStack}>
                    <section className={styles.panel}>
                        <div className={styles.panelHead}>
                            <div>
                                <span className={styles.panelKicker}>Fisico</span>
                                <h3>Carga, fatiga y estado del plantel</h3>
                            </div>
                            <div className={styles.panelMeta}>
                                <span>Sesiones evaluadas</span>
                                <strong>{evaluatedTrainings.length}</strong>
                            </div>
                        </div>
                        <div className={styles.metricRibbon}>
                            <article>
                                <span>Carga promedio</span>
                                <strong>{formatAverage(averageLoad)}</strong>
                                <small>entrenamientos cerrados</small>
                            </article>
                            <article>
                                <span>RPE promedio</span>
                                <strong>{formatAverage(averageRpe)}</strong>
                                <small>percepcion del esfuerzo</small>
                            </article>
                            <article>
                                <span>Fatiga</span>
                                <strong>{formatAverage(averageFatigue)}</strong>
                                <small>estado post sesion</small>
                            </article>
                            <article>
                                <span>Incidencias</span>
                                <strong>{injuryReports}</strong>
                                <small>lesiones o molestias</small>
                            </article>
                        </div>
                    </section>

                    <div className={styles.workspaceGrid}>
                        <section className={styles.panel}>
                            <div className={styles.panelHead}>
                                <div>
                                    <span className={styles.panelKicker}>Carga semanal</span>
                                    <h3>Entrenamientos con cierre</h3>
                                </div>
                            </div>
                            {evaluatedTrainings.length === 0 ? (
                                <div className={styles.emptyState}>Cuando cierres sesiones, aca vas a ver carga, RPE y fatiga.</div>
                            ) : (
                                <div className={styles.sessionList}>
                                    {evaluatedTrainings.slice(0, 8).map((training) => (
                                        <article key={training.id} className={styles.sessionCard}>
                                            <div className={styles.sessionCardTop}>
                                                <div>
                                                    <strong>{training.title}</strong>
                                                    <p>{formatDateTime(training.date)}</p>
                                                </div>
                                                <span className={styles.statusBadge}>{training.type}</span>
                                            </div>
                                            <div className={styles.sessionProgressRow}>
                                                <span>Carga {training.evaluation?.loadTotal ?? '--'}</span>
                                                <span>RPE {training.evaluation?.rpe ?? '--'}</span>
                                                <span>Fatiga {training.evaluation?.fatigue ?? '--'}</span>
                                            </div>
                                        </article>
                                    ))}
                                </div>
                            )}
                        </section>

                        <aside className={styles.panel}>
                            <div className={styles.panelHead}>
                                <div>
                                    <span className={styles.panelKicker}>Alertas PF</span>
                                    <h3>Riesgos fisicos</h3>
                                </div>
                            </div>
                            <div className={styles.detailStack}>
                                <article className={styles.detailCard}>
                                    <strong>GPS manual</strong>
                                    <p>Los registros externos y privados de metros, velocidad y sprints se administran desde Planillas.</p>
                                    <button type="button" className={styles.inlineGhost} onClick={() => setActiveSection('planillas')}>
                                        Abrir planillas
                                    </button>
                                </article>
                                <article className={styles.detailCard}>
                                    <strong>Molestias reportadas</strong>
                                    <p>{injuryReports > 0 ? `${injuryReports} sesiones requieren seguimiento.` : 'Sin incidencias en el filtro actual.'}</p>
                                </article>
                            </div>
                        </aside>
                    </div>
                </div>
            ) : null}

            {!isBusy && activeSection === 'gimnasio' ? (
                <div className={styles.workspaceGrid}>
                    <section className={styles.panel}>
                        <div className={styles.panelHead}>
                            <div>
                                <span className={styles.panelKicker}>Gimnasio</span>
                                <h3>Historial de sesiones fisicas</h3>
                            </div>
                            <div className={styles.panelMeta}>
                                <span>Seguimiento</span>
                                <strong>{sessionsWithPlan}/{gymSessions.length || 0} con plan</strong>
                            </div>
                        </div>

                        {gymSessions.length === 0 ? (
                            <div className={styles.emptyState}>
                                No hay sesiones de gimnasio en este filtro. Podes crear un registro fisico o abrir una sesion completa desde Entrenamientos.
                            </div>
                        ) : (
                            <div className={styles.sessionList}>
                                {gymSessions.map((session) => {
                                    const statusMeta = getStatusMeta(session);
                                    return (
                                        <button
                                            key={session.id}
                                            type="button"
                                            className={cn(styles.sessionCard, selectedSession?.id === session.id && styles.sessionCardActive)}
                                            onClick={() => setSelectedSessionId(session.id)}
                                        >
                                            <div className={styles.sessionCardTop}>
                                                <div>
                                                    <strong>{session.title}</strong>
                                                    <p>{formatDateTime(session.date)}</p>
                                                </div>
                                                <span className={cn(styles.statusBadge, statusMeta.className)}>{statusMeta.label}</span>
                                            </div>
                                            <div className={styles.sessionMetaRow}>
                                                <span>{getTrainingDivisionLabel(session, divisions, clubName)}</span>
                                                <span>{session.duration} min</span>
                                                <span>{session.location || 'Lugar a confirmar'}</span>
                                            </div>
                                            <div className={styles.sessionProgressRow}>
                                                <span>{session.plan?.blocks.length || 0} ejercicios</span>
                                                <span>{session.evaluation?.loadTotal ?? '--'} carga</span>
                                                <span>{session.staff.length} staff</span>
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </section>

                    <aside className={styles.panel}>
                        <div className={styles.panelHead}>
                            <div>
                                <span className={styles.panelKicker}>Detalle</span>
                                <h3>{selectedSession?.title || 'Selecciona una sesion'}</h3>
                            </div>
                        </div>

                        {!selectedSession ? (
                            <div className={styles.emptyState}>
                                Elige una sesion para revisar objetivo, plan y carga.
                            </div>
                        ) : (
                            <div className={styles.detailStack}>
                                <div className={styles.detailCard}>
                                    <strong>Resumen</strong>
                                    <p>{selectedSession.objective || 'Sin objetivo cargado.'}</p>
                                    <div className={styles.detailInfoRow}>
                                        <span>{getTrainingDivisionLabel(selectedSession, divisions, clubName)}</span>
                                        <span>{selectedSession.duration} min</span>
                                        <span>{selectedSession.location || 'Lugar a confirmar'}</span>
                                    </div>
                                </div>

                                <div className={styles.metricRibbon}>
                                    <article>
                                        <span>Filas de plan</span>
                                        <strong>{selectedSessionPlanRows.filter((row) => row.exercise.trim()).length}</strong>
                                        <small>en la sesion</small>
                                    </article>
                                    <article>
                                        <span>Convocados</span>
                                        <strong>{selectedSession.convocados}</strong>
                                        <small>snapshot guardado</small>
                                    </article>
                                    <article>
                                        <span>Asistencia</span>
                                        <strong>{selectedSession.attendance ? Object.keys(selectedSession.attendance).length : 0}</strong>
                                        <small>jugadores con estado</small>
                                    </article>
                                    <article>
                                        <span>Carga cerrada</span>
                                        <strong>{selectedSession.evaluation?.loadTotal ?? '--'}</strong>
                                        <small>si hubo cierre</small>
                                    </article>
                                </div>

                                <div className={styles.detailCard}>
                                    <strong>Staff asignado</strong>
                                    {selectedSession.staff.length > 0 ? (
                                        <div className={styles.tagCloud}>
                                            {selectedSession.staff.map((member) => (
                                                <span key={member} className={styles.tag}>{member}</span>
                                            ))}
                                        </div>
                                    ) : (
                                        <p>Sin staff asignado.</p>
                                    )}
                                </div>

                                <div className={styles.inlineActions}>
                                    <Link
                                        href={entrenamientosHref}
                                        className={styles.inlineLink}
                                        prefetch={false}
                                        onClick={handleEntrenamientosLinkClick}
                                    >
                                        Abrir workspace completo
                                        <ChevronRight className="w-4 h-4" />
                                    </Link>
                                    <button type="button" className={styles.inlineGhost} onClick={() => setActiveSection('gimnasio')}>
                                        Ir a la planilla de plan
                                    </button>
                                </div>
                            </div>
                        )}
                    </aside>
                </div>
            ) : null}

            {!isBusy && activeSection === 'gimnasio' ? (
                <div className={styles.sectionStack}>
                    <section className={styles.panel}>
                        <div className={styles.panelHead}>
                            <div>
                                <span className={styles.panelKicker}>Planes reutilizables</span>
                                <h3>Plan de gimnasio y seguimiento</h3>
                            </div>
                            <div className={styles.panelMeta}>
                                <span>Sesion activa</span>
                                <strong>{selectedSession?.title || 'Sin sesion'}</strong>
                            </div>
                        </div>

                        {selectedSession ? (
                            <>
                                <div className={styles.sheetToolbar}>
                                    <label className={styles.filterField}>
                                        <span>Sesion</span>
                                        <select value={selectedSessionId || ''} onChange={(event) => setSelectedSessionId(event.target.value)}>
                                            {gymSessions.map((session) => (
                                                <option key={session.id} value={session.id}>{session.title}</option>
                                            ))}
                                        </select>
                                    </label>
                                    <div className={styles.sheetActions}>
                                        <button
                                            type="button"
                                            className="btn"
                                            onClick={() => {
                                                setPlanRows((current) => [...current, buildEmptyPlanRow()]);
                                                setPlanDirty(true);
                                            }}
                                        >
                                            <Plus className="w-4 h-4" />
                                            Agregar fila
                                        </button>
                                        <button
                                            type="button"
                                            className="btn btn-primary"
                                            onClick={() => { void handleSavePlan(); }}
                                            disabled={savingPlan}
                                        >
                                            {savingPlan ? <Loader2 className={cn('w-4 h-4', styles.spinning)} /> : <Save className="w-4 h-4" />}
                                            Guardar plan
                                        </button>
                                        <button
                                            type="button"
                                            className="btn"
                                            onClick={openSaveGymPlanModal}
                                            disabled={!selectedSession}
                                        >
                                            <Plus className="w-4 h-4" />
                                            Guardar como plan
                                        </button>
                                    </div>
                                </div>

                                <div className={styles.tableWrap}>
                                    <table className={styles.dataTable}>
                                        <thead>
                                            <tr>
                                                <th>Bloque</th>
                                                <th>Ejercicio</th>
                                                <th>Series</th>
                                                <th>Reps</th>
                                                <th>Kg</th>
                                                <th>Min</th>
                                                <th>Intensidad / RPE</th>
                                                <th>Descanso</th>
                                                <th>Notas</th>
                                                <th />
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {planRows.map((row) => (
                                                <tr key={row.id}>
                                                    <td>
                                                        <select
                                                            className={styles.sheetSelect}
                                                            value={row.blockType}
                                                            onChange={(event) => {
                                                                setPlanRows((current) => current.map((item) => item.id === row.id ? { ...item, blockType: event.target.value as PlanBlockType } : item));
                                                                setPlanDirty(true);
                                                            }}
                                                        >
                                                            {PLAN_BLOCK_OPTIONS.map((option) => (
                                                                <option key={option.id} value={option.id}>{option.label}</option>
                                                            ))}
                                                        </select>
                                                    </td>
                                                    <td>
                                                        <input
                                                            className={styles.sheetInput}
                                                            value={row.exercise}
                                                            onChange={(event) => {
                                                                setPlanRows((current) => current.map((item) => item.id === row.id ? { ...item, exercise: event.target.value } : item));
                                                                setPlanDirty(true);
                                                            }}
                                                            placeholder="Sentadilla trasera"
                                                        />
                                                    </td>
                                                    <td>
                                                        <input
                                                            className={styles.sheetInput}
                                                            value={row.sets}
                                                            onChange={(event) => {
                                                                setPlanRows((current) => current.map((item) => item.id === row.id ? { ...item, sets: event.target.value } : item));
                                                                setPlanDirty(true);
                                                            }}
                                                            placeholder="4"
                                                        />
                                                    </td>
                                                    <td>
                                                        <input
                                                            className={styles.sheetInput}
                                                            value={row.reps}
                                                            onChange={(event) => {
                                                                setPlanRows((current) => current.map((item) => item.id === row.id ? { ...item, reps: event.target.value } : item));
                                                                setPlanDirty(true);
                                                            }}
                                                            placeholder="6"
                                                        />
                                                    </td>
                                                    <td>
                                                        <input
                                                            className={styles.sheetInput}
                                                            value={row.load}
                                                            onChange={(event) => {
                                                                setPlanRows((current) => current.map((item) => item.id === row.id ? { ...item, load: event.target.value } : item));
                                                                setPlanDirty(true);
                                                            }}
                                                            placeholder="85"
                                                        />
                                                    </td>
                                                    <td>
                                                        <input
                                                            className={styles.sheetInput}
                                                            value={row.duration}
                                                            onChange={(event) => {
                                                                setPlanRows((current) => current.map((item) => item.id === row.id ? { ...item, duration: event.target.value } : item));
                                                                setPlanDirty(true);
                                                            }}
                                                            placeholder="10"
                                                        />
                                                    </td>
                                                    <td>
                                                        <input
                                                            className={styles.sheetInput}
                                                            value={row.intensity}
                                                            onChange={(event) => {
                                                                setPlanRows((current) => current.map((item) => item.id === row.id ? { ...item, intensity: event.target.value } : item));
                                                                setPlanDirty(true);
                                                            }}
                                                            placeholder="RPE 8"
                                                        />
                                                    </td>
                                                    <td>
                                                        <input
                                                            className={styles.sheetInput}
                                                            value={row.rest}
                                                            onChange={(event) => {
                                                                setPlanRows((current) => current.map((item) => item.id === row.id ? { ...item, rest: event.target.value } : item));
                                                                setPlanDirty(true);
                                                            }}
                                                            placeholder="90s"
                                                        />
                                                    </td>
                                                    <td>
                                                        <input
                                                            className={styles.sheetInput}
                                                            value={row.notes}
                                                            onChange={(event) => {
                                                                setPlanRows((current) => current.map((item) => item.id === row.id ? { ...item, notes: event.target.value } : item));
                                                                setPlanDirty(true);
                                                            }}
                                                            placeholder="Tecnica o variantes"
                                                        />
                                                    </td>
                                                    <td>
                                                        <button
                                                            type="button"
                                                            className={styles.inlineGhost}
                                                            onClick={() => {
                                                                setPlanRows((current) => current.length > 1 ? current.filter((item) => item.id !== row.id) : [buildEmptyPlanRow()]);
                                                                setPlanDirty(true);
                                                            }}
                                                        >
                                                            Quitar
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </>
                        ) : (
                            <div className={styles.emptyState}>
                                Crea o selecciona una sesion de gimnasio para armar el plan.
                            </div>
                        )}
                    </section>

                    <div className={styles.workspaceGrid}>
                        <section className={styles.panel}>
                            <div className={styles.panelHead}>
                                <div>
                                    <span className={styles.panelKicker}>Biblioteca de planes</span>
                                    <h3>Planes reutilizables del gimnasio</h3>
                                </div>
                                <div className={styles.panelMeta}>
                                    <span>Fuente real</span>
                                    <strong>{visibleGymPlans.length} planes / {planRowsPersisted} filas</strong>
                                </div>
                            </div>

                            {visibleGymPlans.length === 0 ? (
                                <div className={styles.emptyState}>
                                    Todavia no hay planes guardados. Arma una sesion, guarda su plan y desde aca vas a poder reutilizarlo.
                                </div>
                            ) : (
                                <div className={styles.templateList}>
                                    {visibleGymPlans.map((plan) => (
                                        <div
                                            key={plan.id}
                                            className={cn(styles.templateItem, selectedGymPlan?.id === plan.id && styles.templateItemActive)}
                                        >
                                            <div>
                                                <strong>{plan.title}</strong>
                                                <p>{plan.objective || 'Sin objetivo resumido.'}</p>
                                                <span>{getGymPlanDivisionLabel(plan, divisions)} · {plan.blocks.length} bloques · {plan.durationMinutes} min</span>
                                            </div>
                                            <div className={styles.inlineActions}>
                                                <button
                                                    type="button"
                                                    className={styles.inlineGhost}
                                                    onClick={() => handleLoadGymPlan(plan)}
                                                >
                                                    Cargar en planilla
                                                </button>
                                                <button
                                                    type="button"
                                                    className={styles.inlineGhost}
                                                    onClick={() => { void handleApplyGymPlanToSession(plan); }}
                                                    disabled={!selectedSession}
                                                >
                                                    Aplicar a sesion
                                                </button>
                                                <button
                                                    type="button"
                                                    className={styles.inlineGhost}
                                                    onClick={() => openCreateSessionFromPlan(plan)}
                                                >
                                                    Crear sesion
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </section>

                        <aside className={styles.panel}>
                            <div className={styles.panelHead}>
                                <div>
                                    <span className={styles.panelKicker}>Resumen del plan</span>
                                    <h3>Lectura rapida de la planilla</h3>
                                </div>
                                <div className={styles.panelMeta}>
                                    <span>Estado</span>
                                    <strong>{planDirty ? 'Con cambios' : 'Guardado'}</strong>
                                </div>
                            </div>

                            <div className={styles.metricRibbon}>
                                <article>
                                    <span>Filas activas</span>
                                    <strong>{currentPlanSummary.rows}</strong>
                                    <small>ejercicios cargados</small>
                                </article>
                                <article>
                                    <span>Minutos</span>
                                    <strong>{currentPlanSummary.duration}</strong>
                                    <small>sumatoria de la planilla</small>
                                </article>
                                <article>
                                    <span>Sesion</span>
                                    <strong>{selectedSession ? selectedSession.duration : '--'}</strong>
                                    <small>min planificados</small>
                                </article>
                                <article>
                                    <span>Plantel</span>
                                    <strong>{selectedSession?.convocados ?? scopedPlayers.length}</strong>
                                    <small>jugadores asociados</small>
                                </article>
                            </div>

                            {selectedGymPlan ? (
                                <article className={styles.detailCard}>
                                    <strong>{selectedGymPlan.title}</strong>
                                    <p>{selectedGymPlan.objective || 'Sin objetivo resumido.'}</p>
                                    <div className={styles.tagCloud}>
                                        <span className={styles.tag}>{getGymPlanDivisionLabel(selectedGymPlan, divisions)}</span>
                                        <span className={styles.tag}>{selectedGymPlan.blocks.length} bloques</span>
                                        <span className={styles.tag}>{selectedGymPlan.durationMinutes} min</span>
                                    </div>
                                    <p>{selectedGymPlan.notes || 'Sin notas operativas.'}</p>
                                </article>
                            ) : (
                                <div className={styles.emptyState}>
                                    Selecciona un plan de la biblioteca para ver su resumen o crear una sesion desde ahi.
                                </div>
                            )}
                        </aside>
                    </div>
                </div>
            ) : null}

            {!isBusy && activeSection === 'pesos' ? (
                <div className={styles.workspaceGrid}>
                    <section className={styles.panel}>
                        <div className={styles.panelHead}>
                            <div>
                                <span className={styles.panelKicker}>Planilla de pesos</span>
                                <h3>Seguimiento del peso de los jugadores</h3>
                            </div>
                            <div className={styles.panelMeta}>
                                <span>Cobertura</span>
                                <strong>{weightCoverageDetail}</strong>
                            </div>
                        </div>

                        <div className={styles.sheetToolbar}>
                            <label className={styles.filterField}>
                                <span>Fecha</span>
                                <input type="date" value={weightDate} onChange={(event) => setWeightDate(event.target.value)} />
                            </label>
                            <label className={styles.filterField}>
                                <span>Responsable</span>
                                <input value={weightSource} onChange={(event) => setWeightSource(event.target.value)} placeholder="PF responsable" />
                            </label>
                            <div className={styles.sheetActions}>
                                <button
                                    type="button"
                                    className="btn btn-primary"
                                    onClick={() => { void handleSaveWeights(); }}
                                    disabled={savingWeights}
                                >
                                    {savingWeights ? <Loader2 className={cn('w-4 h-4', styles.spinning)} /> : <Save className="w-4 h-4" />}
                                    Guardar pesos cargados
                                </button>
                            </div>
                        </div>

                        <div className={styles.tableWrap}>
                            <table className={styles.dataTable}>
                                <thead>
                                    <tr>
                                        <th>Jugador</th>
                                        <th>Plantel</th>
                                        <th>Peso actual</th>
                                        <th>Anterior</th>
                                        <th>Ultimo registro</th>
                                        <th>Nuevo peso</th>
                                        <th>Nota</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {scopedPlayers.map((player) => {
                                        const latestRecord = latestWeightByPerson.get(player.id);
                                        const previousRecord = previousWeightByPerson.get(player.id);
                                        const currentWeight = latestRecord?.valueNumeric ?? player.weight ?? null;

                                        return (
                                            <tr key={player.id}>
                                                <td>
                                                    <button type="button" className={styles.tablePlayerButton}>
                                                        <strong>{getPersonName(player)}</strong>
                                                        <small>{player.position || 'Sin puesto'}</small>
                                                    </button>
                                                </td>
                                                <td>{player.division_name || 'Sin plantel'}</td>
                                                <td>{formatMetricValue(currentWeight, BODY_WEIGHT_UNIT)}</td>
                                                <td>{formatMetricValue(previousRecord?.valueNumeric ?? null, BODY_WEIGHT_UNIT)}</td>
                                                <td>{formatShortDate(latestRecord?.recordedAt)}</td>
                                                <td>
                                                    <input
                                                        className={styles.sheetInput}
                                                        value={weightDrafts[player.id] || ''}
                                                        onChange={(event) => setWeightDrafts((current) => ({ ...current, [player.id]: event.target.value }))}
                                                        placeholder={typeof currentWeight === 'number' ? String(currentWeight) : 'kg'}
                                                    />
                                                </td>
                                                <td>
                                                    <input
                                                        className={styles.sheetInput}
                                                        value={weightNotes[player.id] || ''}
                                                        onChange={(event) => setWeightNotes((current) => ({ ...current, [player.id]: event.target.value }))}
                                                        placeholder="Ayuno, post entrenamiento..."
                                                    />
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </section>

                    <aside className={styles.panel}>
                        <div className={styles.panelHead}>
                            <div>
                                <span className={styles.panelKicker}>Historial reciente</span>
                                <h3>Ultimas cargas de peso</h3>
                            </div>
                        </div>

                        {recentWeightRows.length === 0 ? (
                            <div className={styles.emptyState}>
                                Todavia no hay historial de peso en este filtro.
                            </div>
                        ) : (
                            <div className={styles.metricList}>
                                {recentWeightRows.map((record) => {
                                    const player = scopedPlayers.find((item) => item.id === record.personId) || roster.find((item) => item.id === record.personId);
                                    return (
                                        <div key={record.id} className={styles.metricListItem}>
                                            <div>
                                                <strong>{player ? getPersonName(player) : record.personId}</strong>
                                                <p>{record.source || 'PF'} · {formatShortDate(record.recordedAt)}</p>
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

            {!isBusy && activeSection === 'testeos' ? (
                <div className={styles.workspaceGrid}>
                    <section className={styles.panel}>
                        <div className={styles.panelHead}>
                            <div>
                                <span className={styles.panelKicker}>Protocolos de testeo</span>
                                <h3>Cards de testeos definidos por el PF</h3>
                            </div>
                            <div className={styles.sheetActions}>
                                <button
                                    type="button"
                                    className="btn btn-primary"
                                    onClick={openCreateTestModal}
                                >
                                    <Plus className="w-4 h-4" />
                                    Definir test
                                </button>
                            </div>
                        </div>

                        {testCards.length === 0 ? (
                            <div className={styles.emptyState}>
                                No hay testeos definidos en este filtro. Crea el primero y el panel va a mostrarlo como card para cargar resultados.
                            </div>
                        ) : (
                            <div className={styles.cardGrid}>
                                {testCards.map((card) => (
                                    <button
                                        key={card.definition.id}
                                        type="button"
                                        className={cn(
                                            styles.infoCard,
                                            styles.testCardButton,
                                            selectedTestDefinition?.id === card.definition.id && styles.infoCardActive,
                                        )}
                                        onClick={() => setSelectedTestDefinitionId(card.definition.id)}
                                    >
                                        <span>{card.definition.label}</span>
                                        <strong>{card.playersWithResult}/{scopedPlayers.length || 0}</strong>
                                        <p>
                                            {getTestDefinitionDivisionLabel(card.definition, divisions)} · {card.definition.unit || 'Sin unidad'} · {getBetterValueDirectionLabel(card.definition.betterValueDirection)}
                                        </p>
                                        <div className={styles.testCardMetaRow}>
                                            <small>{card.totalResults} registros</small>
                                            <small>Ultima carga {formatShortDate(card.latestRecordedAt)}</small>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        )}

                        {selectedTestDefinition ? (
                            <>
                                <div className={styles.sheetToolbar}>
                                    <label className={styles.filterField}>
                                        <span>Test activo</span>
                                        <input value={selectedTestDefinition.label} readOnly />
                                    </label>
                                    <label className={styles.filterField}>
                                        <span>Fecha</span>
                                        <input type="date" value={testDate} onChange={(event) => setTestDate(event.target.value)} />
                                    </label>
                                    <label className={styles.filterField}>
                                        <span>Evaluador</span>
                                        <input value={testSource} onChange={(event) => setTestSource(event.target.value)} placeholder="PF / evaluador" />
                                    </label>
                                    <label className={styles.filterField}>
                                        <span>Clave tecnica</span>
                                        <input value={selectedTestDefinition.metricKey} readOnly />
                                    </label>
                                    <div className={styles.sheetActions}>
                                        <button
                                            type="button"
                                            className="btn btn-primary"
                                            onClick={() => { void handleSaveTests(); }}
                                            disabled={savingTests}
                                        >
                                            {savingTests ? <Loader2 className={cn('w-4 h-4', styles.spinning)} /> : <Save className="w-4 h-4" />}
                                            Guardar testeos
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
                                                const latestRecord = latestTestByPerson.get(player.id);
                                                return (
                                                    <tr key={player.id}>
                                                        <td>
                                                            <button type="button" className={styles.tablePlayerButton}>
                                                                <strong>{getPersonName(player)}</strong>
                                                                <small>{player.position || 'Sin puesto'}</small>
                                                            </button>
                                                        </td>
                                                        <td>{player.division_name || 'Sin plantel'}</td>
                                                        <td>{formatMetricValue(latestRecord?.valueNumeric ?? null, latestRecord?.unit || selectedTestDefinition.unit)}</td>
                                                        <td>{formatShortDate(latestRecord?.recordedAt)}</td>
                                                        <td>
                                                            <input
                                                                className={styles.sheetInput}
                                                                value={testDrafts[player.id] || ''}
                                                                onChange={(event) => setTestDrafts((current) => ({ ...current, [player.id]: event.target.value }))}
                                                                placeholder={selectedTestDefinition.unit || '--'}
                                                            />
                                                        </td>
                                                        <td>{selectedTestDefinition.unit || '--'}</td>
                                                        <td>
                                                            <input
                                                                className={styles.sheetInput}
                                                                value={testNotes[player.id] || ''}
                                                                onChange={(event) => setTestNotes((current) => ({ ...current, [player.id]: event.target.value }))}
                                                                placeholder="Intentos, dolor, contexto..."
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
                            <div className={styles.emptyState}>
                                Selecciona una card para abrir la planilla de carga de ese test.
                            </div>
                        )}
                    </section>

                    <aside className={styles.panel}>
                        <div className={styles.panelHead}>
                            <div>
                                <span className={styles.panelKicker}>Historial reciente</span>
                                <h3>{selectedTestDefinition?.label || 'Test'} cargado</h3>
                            </div>
                            <div className={styles.panelMeta}>
                                <span>Export</span>
                                <button
                                    type="button"
                                    className={styles.inlineGhost}
                                    disabled={!selectedTestDefinition}
                                    onClick={() => {
                                        if (!selectedTestDefinition) {
                                            return;
                                        }

                                        const csv = [
                                            ['jugador', 'plantel', 'test', 'valor', 'unidad', 'fecha', 'evaluador', 'nota'].join(','),
                                            ...selectedMetricRecords.map((record) => {
                                                const player = roster.find((item) => item.id === record.personId);
                                                return [
                                                    `"${player ? getPersonName(player) : record.personId}"`,
                                                    `"${player?.division_name || ''}"`,
                                                    `"${record.metricLabel}"`,
                                                    `"${record.valueNumeric}"`,
                                                    `"${record.unit || ''}"`,
                                                    `"${record.recordedAt}"`,
                                                    `"${record.source || ''}"`,
                                                    `"${record.notes || ''}"`,
                                                ].join(',');
                                            }),
                                        ].join('\n');

                                        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
                                        const url = URL.createObjectURL(blob);
                                        const link = document.createElement('a');
                                        link.href = url;
                                        link.download = `${clubId}-${selectedTestDefinition.metricKey}-testeos.csv`;
                                        link.click();
                                        URL.revokeObjectURL(url);
                                    }}
                                >
                                    <Download className="w-4 h-4" />
                                    CSV
                                </button>
                            </div>
                        </div>

                        {selectedTestDefinition ? (
                            <article className={styles.detailCard}>
                                <strong>Resumen del test activo</strong>
                                <p>{selectedTestDefinition.notes || 'Sin observaciones de protocolo.'}</p>
                                <p>{testCoverageDetail}</p>
                                <div className={styles.metricRibbon}>
                                    <article>
                                        <span>Cobertura</span>
                                        <strong>{selectedTestCard?.playersWithResult || 0}</strong>
                                        <small>jugadores con registro</small>
                                    </article>
                                    <article>
                                        <span>Registros</span>
                                        <strong>{selectedTestCard?.totalResults || 0}</strong>
                                        <small>cargas historicas</small>
                                    </article>
                                </div>
                            </article>
                        ) : null}

                        {recentTestRows.length === 0 ? (
                            <div className={styles.emptyState}>
                                Todavia no hay resultados guardados para {selectedTestDefinition?.label || 'este test'}.
                            </div>
                        ) : (
                            <div className={styles.metricList}>
                                {recentTestRows.map((record) => {
                                    const player = scopedPlayers.find((item) => item.id === record.personId) || roster.find((item) => item.id === record.personId);
                                    return (
                                        <div key={record.id} className={styles.metricListItem}>
                                            <div>
                                                <strong>{player ? getPersonName(player) : record.personId}</strong>
                                                <p>{record.source || 'PF'} · {formatShortDate(record.recordedAt)}</p>
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

            {createTestOpen ? (
                <div className={styles.modalOverlay}>
                    <div className={styles.modalCard}>
                        <div className={styles.panelHead}>
                            <div>
                                <span className={styles.panelKicker}>Nuevo test</span>
                                <h3>Definir testeo fisico</h3>
                            </div>
                            <div className={styles.panelMeta}>
                                <span>Responsable</span>
                                <strong>PF</strong>
                            </div>
                        </div>

                        <div className={styles.modalGrid}>
                            <label className={styles.filterField}>
                                <span>Sugerencia base</span>
                                <select
                                    value={testDefinitionDraft.suggestionKey}
                                    onChange={(event) => {
                                        const suggestionKey = event.target.value;
                                        const suggestion = TEST_METRIC_OPTIONS.find((option) => option.key === suggestionKey);
                                        setTestDefinitionDraft((current) => ({
                                            ...current,
                                            suggestionKey,
                                            label: suggestion?.label || current.label,
                                            metricKey: suggestion?.key || current.metricKey,
                                            unit: suggestion?.unit || current.unit,
                                        }));
                                    }}
                                >
                                    <option value="">Personalizado</option>
                                    {TEST_METRIC_OPTIONS.map((option) => (
                                        <option key={option.key} value={option.key}>{option.label}</option>
                                    ))}
                                </select>
                            </label>
                            <label className={styles.filterField}>
                                <span>Aplica a</span>
                                <select
                                    value={testDefinitionDraft.divisionId}
                                    onChange={(event) => setTestDefinitionDraft((current) => ({ ...current, divisionId: event.target.value }))}
                                >
                                    <option value="all">Todo el club</option>
                                    {divisions.map((division) => (
                                        <option key={division.id} value={division.id}>{getDivisionLabel(division, clubName)}</option>
                                    ))}
                                </select>
                            </label>
                            <label className={styles.filterField}>
                                <span>Nombre del test</span>
                                <input
                                    value={testDefinitionDraft.label}
                                    onChange={(event) => setTestDefinitionDraft((current) => ({ ...current, label: event.target.value }))}
                                    placeholder="CMJ, Sprint 10 m, Bronco..."
                                />
                            </label>
                            <label className={styles.filterField}>
                                <span>Clave tecnica</span>
                                <input
                                    value={testDefinitionDraft.metricKey}
                                    onChange={(event) => setTestDefinitionDraft((current) => ({ ...current, metricKey: event.target.value }))}
                                    placeholder="Se genera desde el nombre si la dejas vacia"
                                />
                            </label>
                            <label className={styles.filterField}>
                                <span>Unidad</span>
                                <input
                                    value={testDefinitionDraft.unit}
                                    onChange={(event) => setTestDefinitionDraft((current) => ({ ...current, unit: event.target.value }))}
                                    placeholder="kg, s, cm, m..."
                                />
                            </label>
                            <label className={styles.filterField}>
                                <span>Mejor resultado</span>
                                <select
                                    value={testDefinitionDraft.betterValueDirection}
                                    onChange={(event) => setTestDefinitionDraft((current) => ({
                                        ...current,
                                        betterValueDirection: event.target.value as ClubPhysicalTestBetterValueDirection,
                                    }))}
                                >
                                    {TEST_DIRECTION_OPTIONS.map((option) => (
                                        <option key={option.value} value={option.value}>{option.label}</option>
                                    ))}
                                </select>
                            </label>
                        </div>

                        <label className={styles.filterField}>
                            <span>Observaciones del protocolo</span>
                            <textarea
                                value={testDefinitionDraft.notes}
                                onChange={(event) => setTestDefinitionDraft((current) => ({ ...current, notes: event.target.value }))}
                                placeholder="Indicaciones del test, cantidad de intentos, contexto..."
                            />
                        </label>

                        <div className={styles.modalActions}>
                            <button type="button" className="btn btn-outline" onClick={() => setCreateTestOpen(false)}>
                                Cancelar
                            </button>
                            <button
                                type="button"
                                className="btn btn-primary"
                                onClick={() => { void handleCreateTestDefinition(); }}
                                disabled={savingTestDefinition}
                            >
                                {savingTestDefinition ? <Loader2 className={cn('w-4 h-4', styles.spinning)} /> : <Save className="w-4 h-4" />}
                                Guardar test
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}

            {createGymPlanOpen ? (
                <div className={styles.modalOverlay}>
                    <div className={styles.modalCard}>
                        <div className={styles.panelHead}>
                            <div>
                                <span className={styles.panelKicker}>Guardar plan</span>
                                <h3>Nuevo plan reusable de gimnasio</h3>
                            </div>
                            <div className={styles.panelMeta}>
                                <span>Bloques</span>
                                <strong>{currentPlanSummary.rows}</strong>
                            </div>
                        </div>

                        <div className={styles.modalGrid}>
                            <label className={styles.filterField}>
                                <span>Nombre del plan</span>
                                <input
                                    value={gymPlanDraft.title}
                                    onChange={(event) => setGymPlanDraft((current) => ({ ...current, title: event.target.value }))}
                                    placeholder="Fuerza tren inferior"
                                />
                            </label>
                            <label className={styles.filterField}>
                                <span>Aplica a</span>
                                <select
                                    value={gymPlanDraft.divisionId}
                                    onChange={(event) => setGymPlanDraft((current) => ({ ...current, divisionId: event.target.value }))}
                                >
                                    <option value="all">Todo el club</option>
                                    {divisions.map((division) => (
                                        <option key={division.id} value={division.id}>{getDivisionLabel(division, clubName)}</option>
                                    ))}
                                </select>
                            </label>
                            <label className={styles.filterField}>
                                <span>Objetivo</span>
                                <input
                                    value={gymPlanDraft.objective}
                                    onChange={(event) => setGymPlanDraft((current) => ({ ...current, objective: event.target.value }))}
                                    placeholder="Fuerza maxima de tren inferior"
                                />
                            </label>
                            <label className={styles.filterField}>
                                <span>Duracion estimada</span>
                                <input value={`${currentPlanSummary.duration} min`} readOnly />
                            </label>
                        </div>

                        <label className={styles.filterField}>
                            <span>Notas del plan</span>
                            <textarea
                                value={gymPlanDraft.notes}
                                onChange={(event) => setGymPlanDraft((current) => ({ ...current, notes: event.target.value }))}
                                placeholder="Uso recomendado, fase de la semana, variantes..."
                            />
                        </label>

                        <div className={styles.modalActions}>
                            <button type="button" className="btn btn-outline" onClick={() => setCreateGymPlanOpen(false)}>
                                Cancelar
                            </button>
                            <button
                                type="button"
                                className="btn btn-primary"
                                onClick={() => { void handleSaveGymPlan(); }}
                                disabled={savingGymPlan}
                            >
                                {savingGymPlan ? <Loader2 className={cn('w-4 h-4', styles.spinning)} /> : <Save className="w-4 h-4" />}
                                Guardar plan
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}

            {createSessionFromPlanOpen ? (
                <div className={styles.modalOverlay}>
                    <div className={styles.modalCard}>
                        <div className={styles.panelHead}>
                            <div>
                                <span className={styles.panelKicker}>Sesion desde plan</span>
                                <h3>Cargar sesion de gimnasio</h3>
                            </div>
                            <div className={styles.panelMeta}>
                                <span>Plan base</span>
                                <strong>{selectedGymPlan?.title || 'Plan'}</strong>
                            </div>
                        </div>

                        <div className={styles.modalGrid}>
                            <label className={styles.filterField}>
                                <span>Nombre de la sesion</span>
                                <input
                                    value={sessionFromPlanDraft.title}
                                    onChange={(event) => setSessionFromPlanDraft((current) => ({ ...current, title: event.target.value }))}
                                    placeholder="Sesion gym bloque fuerza"
                                />
                            </label>
                            <label className={styles.filterField}>
                                <span>Equipo</span>
                                <select
                                    value={sessionFromPlanDraft.divisionId}
                                    onChange={(event) => setSessionFromPlanDraft((current) => ({ ...current, divisionId: event.target.value }))}
                                >
                                    <option value="all">Todo el club</option>
                                    {divisions.map((division) => (
                                        <option key={division.id} value={division.id}>{getDivisionLabel(division, clubName)}</option>
                                    ))}
                                </select>
                            </label>
                            <label className={styles.filterField}>
                                <span>Fecha</span>
                                <input
                                    type="date"
                                    value={sessionFromPlanDraft.date}
                                    onChange={(event) => setSessionFromPlanDraft((current) => ({ ...current, date: event.target.value }))}
                                />
                            </label>
                            <label className={styles.filterField}>
                                <span>Hora</span>
                                <input
                                    type="time"
                                    value={sessionFromPlanDraft.startTime}
                                    onChange={(event) => setSessionFromPlanDraft((current) => ({ ...current, startTime: event.target.value }))}
                                />
                            </label>
                            <label className={styles.filterField}>
                                <span>Duracion</span>
                                <input
                                    value={sessionFromPlanDraft.duration}
                                    onChange={(event) => setSessionFromPlanDraft((current) => ({ ...current, duration: event.target.value }))}
                                    placeholder="60"
                                />
                            </label>
                            <label className={styles.filterField}>
                                <span>Lugar</span>
                                <input
                                    value={sessionFromPlanDraft.location}
                                    onChange={(event) => setSessionFromPlanDraft((current) => ({ ...current, location: event.target.value }))}
                                    placeholder="Gimnasio principal"
                                />
                            </label>
                        </div>

                        <label className={styles.filterField}>
                            <span>Objetivo de la sesion</span>
                            <textarea
                                value={sessionFromPlanDraft.objective}
                                onChange={(event) => setSessionFromPlanDraft((current) => ({ ...current, objective: event.target.value }))}
                                placeholder="Objetivo operativo de la sesion"
                            />
                        </label>

                        <div className={styles.modalActions}>
                            <button type="button" className="btn btn-outline" onClick={() => setCreateSessionFromPlanOpen(false)}>
                                Cancelar
                            </button>
                            <button
                                type="button"
                                className="btn btn-primary"
                                onClick={() => { void handleCreateSessionFromPlan(); }}
                                disabled={savingSessionFromPlan}
                            >
                                {savingSessionFromPlan ? <Loader2 className={cn('w-4 h-4', styles.spinning)} /> : <Plus className="w-4 h-4" />}
                                Crear sesion
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}

            <ClubTrainingCreateModal
                open={createOpen}
                clubId={clubId}
                clubName={clubName}
                sport={sport}
                initialFocus="fisico"
                divisions={divisions}
                players={scopedPlayers.length > 0 ? scopedPlayers : roster}
                staff={scopedStaff.length > 0 ? scopedStaff : staff}
                dashboardData={dashboardData}
                onClose={() => setCreateOpen(false)}
                onCreate={handleCreateTraining}
            />
        </div>
    );
}
