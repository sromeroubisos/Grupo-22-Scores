/* eslint-disable @typescript-eslint/no-explicit-any */
import { createAdminClient } from '@/lib/supabase/admin';
import type {
    ClubPhysicalTestBetterValueDirection,
    ClubPhysicalTestDefinition,
    ClubPhysicalTestDefinitionInput,
} from './physicalTestDefinitions';

type ClubPhysicalTestDefinitionRow = {
    id: string;
    club_id: string;
    division_id: string | null;
    metric_key: string | null;
    label: string | null;
    unit: string | null;
    better_value_direction: string | null;
    notes: string | null;
    is_active: boolean | null;
    created_at: string | null;
    updated_at: string | null;
};

const MISSING_TABLE_CODES = new Set(['42P01', 'PGRST204', 'PGRST205']);
const DIRECTION_OPTIONS = new Set<ClubPhysicalTestBetterValueDirection>(['higher', 'lower']);
const SELECT_COLUMNS = [
    'id',
    'club_id',
    'division_id',
    'metric_key',
    'label',
    'unit',
    'better_value_direction',
    'notes',
    'is_active',
    'created_at',
    'updated_at',
].join(', ');

function getErrorCode(error: unknown) {
    if (!error || typeof error !== 'object' || !('code' in error)) {
        return null;
    }

    const code = (error as { code?: unknown }).code;
    return typeof code === 'string' ? code : null;
}

export function isMissingClubPhysicalTestDefinitionsTableError(error: unknown) {
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

function normalizeDirection(value: unknown): ClubPhysicalTestBetterValueDirection {
    const normalized = normalizeText(value);
    return DIRECTION_OPTIONS.has(normalized as ClubPhysicalTestBetterValueDirection)
        ? normalized as ClubPhysicalTestBetterValueDirection
        : 'higher';
}

function mapRowToDefinition(row: ClubPhysicalTestDefinitionRow): ClubPhysicalTestDefinition {
    return {
        id: row.id,
        clubId: row.club_id,
        divisionId: normalizeNullableText(row.division_id),
        metricKey: normalizeText(row.metric_key),
        label: normalizeText(row.label),
        unit: normalizeNullableText(row.unit),
        betterValueDirection: normalizeDirection(row.better_value_direction),
        notes: normalizeNullableText(row.notes),
        isActive: row.is_active !== false,
        createdAt: normalizeText(row.created_at),
        updatedAt: normalizeText(row.updated_at),
    };
}

function mapInputToRow(clubId: string, definition: ClubPhysicalTestDefinitionInput) {
    return {
        club_id: clubId,
        division_id: normalizeNullableText(definition.divisionId),
        metric_key: normalizeText(definition.metricKey),
        label: normalizeText(definition.label, definition.metricKey),
        unit: normalizeNullableText(definition.unit),
        better_value_direction: normalizeDirection(definition.betterValueDirection),
        notes: normalizeNullableText(definition.notes),
        is_active: definition.isActive !== false,
    };
}

export async function getClubPhysicalTestDefinitions(clubId: string): Promise<ClubPhysicalTestDefinition[]> {
    if (!clubId) {
        return [];
    }

    const admin = createAdminClient() as any;
    const { data, error } = await admin
        .from('club_physical_test_definitions')
        .select(SELECT_COLUMNS)
        .eq('club_id', clubId)
        .eq('is_active', true)
        .order('label', { ascending: true });

    if (error) {
        throw error;
    }

    return ((data ?? []) as ClubPhysicalTestDefinitionRow[]).map(mapRowToDefinition);
}

export async function saveClubPhysicalTestDefinition(
    clubId: string,
    definition: ClubPhysicalTestDefinitionInput,
): Promise<ClubPhysicalTestDefinition> {
    if (!clubId) {
        throw new Error('clubId required');
    }

    const admin = createAdminClient() as any;
    const { data, error } = await admin
        .from('club_physical_test_definitions')
        .insert(mapInputToRow(clubId, definition))
        .select(SELECT_COLUMNS)
        .single();

    if (error) {
        throw error;
    }

    return mapRowToDefinition(data as ClubPhysicalTestDefinitionRow);
}
