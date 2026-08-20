/* eslint-disable @typescript-eslint/no-explicit-any */
import { createAdminClient } from '@/lib/supabase/admin';
import type { ClubPhysicalRecord, ClubPhysicalRecordInput, ClubPhysicalRecordCategory } from './physicalRecords';

type ClubPhysicalRecordRow = {
    id: string;
    club_id: string;
    person_id: string;
    division_id: string | null;
    category: string | null;
    metric_key: string | null;
    metric_label: string | null;
    value_numeric: number | string | null;
    unit: string | null;
    recorded_at: string | null;
    source: string | null;
    notes: string | null;
    payload: unknown;
};

const MISSING_TABLE_CODES = new Set(['42P01', 'PGRST204', 'PGRST205']);
const CATEGORIES = new Set<ClubPhysicalRecordCategory>(['weight', 'test']);
const SELECT_COLUMNS = [
    'id',
    'club_id',
    'person_id',
    'division_id',
    'category',
    'metric_key',
    'metric_label',
    'value_numeric',
    'unit',
    'recorded_at',
    'source',
    'notes',
    'payload',
].join(', ');

function getErrorCode(error: unknown) {
    if (!error || typeof error !== 'object' || !('code' in error)) {
        return null;
    }

    const code = (error as { code?: unknown }).code;
    return typeof code === 'string' ? code : null;
}

export function isMissingClubPhysicalRecordsTableError(error: unknown) {
    const code = getErrorCode(error);
    return Boolean(code && MISSING_TABLE_CODES.has(code));
}

function normalizeText(value: unknown, fallback = '') {
    return typeof value === 'string' ? value.trim() : fallback;
}

function normalizeNullableText(value: unknown) {
    const normalized = normalizeText(value);
    return normalized.length > 0 ? normalized : null;
}

function normalizeNumber(value: unknown, fallback = 0) {
    const numeric = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(numeric) ? numeric : fallback;
}

function normalizeCategory(value: unknown): ClubPhysicalRecordCategory {
    const normalized = normalizeText(value);
    return CATEGORIES.has(normalized as ClubPhysicalRecordCategory)
        ? normalized as ClubPhysicalRecordCategory
        : 'test';
}

function normalizePayload(value: unknown) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return {} as Record<string, unknown>;
    }

    return value as Record<string, unknown>;
}

function mapRowToRecord(row: ClubPhysicalRecordRow): ClubPhysicalRecord {
    return {
        id: row.id,
        clubId: row.club_id,
        personId: row.person_id,
        divisionId: normalizeNullableText(row.division_id),
        category: normalizeCategory(row.category),
        metricKey: normalizeText(row.metric_key),
        metricLabel: normalizeText(row.metric_label),
        valueNumeric: normalizeNumber(row.value_numeric),
        unit: normalizeNullableText(row.unit),
        recordedAt: normalizeText(row.recorded_at),
        source: normalizeNullableText(row.source),
        notes: normalizeNullableText(row.notes),
        payload: normalizePayload(row.payload),
    };
}

function mapInputToRow(clubId: string, record: ClubPhysicalRecordInput) {
    return {
        club_id: clubId,
        person_id: record.personId,
        division_id: normalizeNullableText(record.divisionId),
        category: normalizeCategory(record.category),
        metric_key: normalizeText(record.metricKey),
        metric_label: normalizeText(record.metricLabel, record.metricKey),
        value_numeric: normalizeNumber(record.valueNumeric),
        unit: normalizeNullableText(record.unit),
        recorded_at: normalizeText(record.recordedAt),
        source: normalizeNullableText(record.source),
        notes: normalizeNullableText(record.notes),
        payload: normalizePayload(record.payload),
    };
}

export async function getClubPhysicalRecords(
    clubId: string,
    filters?: {
        category?: ClubPhysicalRecordCategory;
        metricKey?: string;
        personId?: string;
    },
): Promise<ClubPhysicalRecord[]> {
    if (!clubId) {
        return [];
    }

    const admin = createAdminClient() as any;
    let query = admin
        .from('club_physical_records')
        .select(SELECT_COLUMNS)
        .eq('club_id', clubId)
        .order('recorded_at', { ascending: false });

    if (filters?.category) {
        query = query.eq('category', filters.category);
    }

    if (filters?.metricKey) {
        query = query.eq('metric_key', filters.metricKey);
    }

    if (filters?.personId) {
        query = query.eq('person_id', filters.personId);
    }

    const { data, error } = await query;
    if (error) {
        throw error;
    }

    return ((data ?? []) as ClubPhysicalRecordRow[]).map(mapRowToRecord);
}

export async function saveClubPhysicalRecords(
    clubId: string,
    records: ClubPhysicalRecordInput[],
): Promise<ClubPhysicalRecord[]> {
    if (!clubId) {
        throw new Error('clubId required');
    }

    if (records.length === 0) {
        return [];
    }

    const admin = createAdminClient() as any;
    const payload = records.map((record) => mapInputToRow(clubId, record));

    const { data, error } = await admin
        .from('club_physical_records')
        .insert(payload)
        .select(SELECT_COLUMNS);

    if (error) {
        throw error;
    }

    return ((data ?? []) as ClubPhysicalRecordRow[]).map(mapRowToRecord);
}
