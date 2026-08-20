import { createAdminClient } from '@/lib/supabase/admin';
import {
    DEFAULT_RUGBY_TAXONOMY,
    getPerformanceModule,
    type RugbyPerformanceContext,
    type RugbyPerformanceRecord,
    type RugbyPerformanceScope,
    type RugbyTaxonomyItem,
} from './rugbyStaff';

type PerformanceRecordRow = {
    id: string;
    club_id: string;
    module_key: string;
    scope: string;
    context: string;
    match_id: string | null;
    training_id: string | null;
    player_id: string | null;
    player_name: string | null;
    event_date: string | null;
    payload: unknown;
    created_at: string | null;
    updated_at: string | null;
};

type TaxonomyRow = {
    id: string;
    module_key: string;
    event_key: string;
    label: string;
    description: string | null;
    enabled: boolean | null;
    config: unknown;
};

const MISSING_TABLE_CODES = new Set(['42P01', 'PGRST204', 'PGRST205']);
const RECORD_SELECT = [
    'id',
    'club_id',
    'module_key',
    'scope',
    'context',
    'match_id',
    'training_id',
    'player_id',
    'player_name',
    'event_date',
    'payload',
    'created_at',
    'updated_at',
].join(', ');

const TAXONOMY_SELECT = [
    'id',
    'module_key',
    'event_key',
    'label',
    'description',
    'enabled',
    'config',
].join(', ');

function getErrorCode(error: unknown) {
    if (!error || typeof error !== 'object' || !('code' in error)) {
        return null;
    }

    const code = (error as { code?: unknown }).code;
    return typeof code === 'string' ? code : null;
}

export function isMissingRugbyPerformanceTableError(error: unknown) {
    const code = getErrorCode(error);
    return Boolean(code && MISSING_TABLE_CODES.has(code));
}

function normalizeScope(value: unknown, moduleKey: string): RugbyPerformanceScope {
    const performanceModule = getPerformanceModule(moduleKey);
    return value === 'match_global' || value === 'club_private'
        ? value
        : performanceModule.scope;
}

function normalizeContext(value: unknown, moduleKey: string): RugbyPerformanceContext {
    const performanceModule = getPerformanceModule(moduleKey);
    return value === 'match' || value === 'training' || value === 'gym' || value === 'review'
        ? value
        : performanceModule.contextOptions[0];
}

function normalizePayload(value: unknown): Record<string, string | number | boolean | null> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return {};
    }

    return value as Record<string, string | number | boolean | null>;
}

function mapRecordRow(row: PerformanceRecordRow): RugbyPerformanceRecord {
    const moduleKey = row.module_key || 'kicks';
    const today = new Date().toISOString().slice(0, 10);

    return {
        id: row.id,
        clubId: row.club_id,
        moduleKey,
        scope: normalizeScope(row.scope, moduleKey),
        context: normalizeContext(row.context, moduleKey),
        matchId: row.match_id,
        trainingId: row.training_id,
        playerId: row.player_id,
        playerName: row.player_name ?? '',
        eventDate: row.event_date ?? today,
        payload: normalizePayload(row.payload),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

function mapRecordToRow(
    clubId: string,
    record: RugbyPerformanceRecord,
    userId: string | null,
) {
    const performanceModule = getPerformanceModule(record.moduleKey);
    const eventDate = record.eventDate || String(record.payload.date || '').slice(0, 10) || new Date().toISOString().slice(0, 10);

    return {
        id: record.id,
        club_id: clubId,
        module_key: performanceModule.key,
        scope: record.scope || performanceModule.scope,
        context: record.context || performanceModule.contextOptions[0],
        match_id: record.matchId || null,
        training_id: record.trainingId || null,
        player_id: record.playerId || null,
        player_name: record.playerName?.trim() || null,
        event_date: eventDate,
        payload: record.payload && typeof record.payload === 'object' ? record.payload : {},
        updated_by_user_id: userId,
        created_by_user_id: userId,
    };
}

function mapTaxonomyRow(row: TaxonomyRow): RugbyTaxonomyItem {
    return {
        id: row.id,
        moduleKey: row.module_key,
        eventKey: row.event_key,
        label: row.label,
        description: row.description ?? '',
        enabled: row.enabled !== false,
        config: row.config && typeof row.config === 'object' && !Array.isArray(row.config)
            ? row.config as Record<string, unknown>
            : {},
    };
}

function mapTaxonomyToRow(item: RugbyTaxonomyItem, userId: string | null) {
    return {
        id: item.id.startsWith('default-') ? undefined : item.id,
        module_key: item.moduleKey,
        event_key: item.eventKey,
        label: item.label.trim(),
        description: item.description.trim() || null,
        enabled: item.enabled,
        scope: 'match_global',
        config: item.config && typeof item.config === 'object' ? item.config : {},
        updated_by_user_id: userId,
    };
}

export async function getClubRugbyPerformanceRecords(
    clubId: string,
    options?: { scopes?: RugbyPerformanceScope[] }
): Promise<RugbyPerformanceRecord[]> {
    if (!clubId) {
        return [];
    }

    const admin = createAdminClient() as any;
    let query = admin
        .from('club_rugby_performance_records')
        .select(RECORD_SELECT)
        .eq('club_id', clubId)
        .order('event_date', { ascending: false })
        .order('created_at', { ascending: false });

    if (options?.scopes?.length) {
        query = query.in('scope', options.scopes);
    }

    const { data, error } = await query;
    if (error) {
        throw error;
    }

    return ((data ?? []) as PerformanceRecordRow[]).map(mapRecordRow);
}

export async function saveClubRugbyPerformanceRecords(
    clubId: string,
    records: RugbyPerformanceRecord[],
    userId: string | null,
): Promise<RugbyPerformanceRecord[]> {
    if (!clubId) {
        throw new Error('clubId required');
    }

    if (records.length === 0) {
        return [];
    }

    const admin = createAdminClient() as any;
    const payload = records.map((record) => mapRecordToRow(clubId, record, userId));
    const { data, error } = await admin
        .from('club_rugby_performance_records')
        .upsert(payload, { onConflict: 'id' })
        .select(RECORD_SELECT);

    if (error) {
        throw error;
    }

    return ((data ?? []) as PerformanceRecordRow[]).map(mapRecordRow);
}

export async function deleteClubRugbyPerformanceRecord(clubId: string, recordId: string): Promise<void> {
    const admin = createAdminClient() as any;
    const { error } = await admin
        .from('club_rugby_performance_records')
        .delete()
        .eq('club_id', clubId)
        .eq('id', recordId);

    if (error) {
        throw error;
    }
}

export async function getRugbyMatchEventTaxonomy(): Promise<RugbyTaxonomyItem[]> {
    const admin = createAdminClient() as any;
    const { data, error } = await admin
        .from('rugby_match_event_taxonomy')
        .select(TAXONOMY_SELECT)
        .order('module_key', { ascending: true });

    if (error) {
        throw error;
    }

    const rows = ((data ?? []) as TaxonomyRow[]).map(mapTaxonomyRow);
    return rows.length > 0 ? rows : DEFAULT_RUGBY_TAXONOMY;
}

export async function saveRugbyMatchEventTaxonomy(
    items: RugbyTaxonomyItem[],
    userId: string | null,
): Promise<RugbyTaxonomyItem[]> {
    const normalized = items
        .filter((item) => item.moduleKey && item.eventKey && item.label)
        .map((item) => mapTaxonomyToRow(item, userId));

    if (normalized.length === 0) {
        return getRugbyMatchEventTaxonomy();
    }

    const admin = createAdminClient() as any;
    const { data, error } = await admin
        .from('rugby_match_event_taxonomy')
        .upsert(normalized, { onConflict: 'module_key,event_key' })
        .select(TAXONOMY_SELECT);

    if (error) {
        throw error;
    }

    return ((data ?? []) as TaxonomyRow[]).map(mapTaxonomyRow);
}
