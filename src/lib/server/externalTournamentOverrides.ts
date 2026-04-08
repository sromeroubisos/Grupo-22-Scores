import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { getReadClient } from '@/lib/supabase/read';
import { isMissingColumnError } from '@/lib/utils/supabaseSchema';

export type ExternalTournamentOverrideRecord = {
    id: string;
    source?: string | null;
    name?: string | null;
    display_name?: string | null;
    logo_url?: string | null;
    sport?: string | null;
    country?: string | null;
    country_id?: string | null;
    url?: string | null;
    priority?: number | null;
    updated_at?: string | null;
};

type ExternalTournamentOverrideStore = Record<string, ExternalTournamentOverrideRecord>;
type MinimalReadClient = {
    from: (table: string) => {
        select: (columns: string) => {
            in: (
                column: string,
                values: string[],
            ) => Promise<{ data: Record<string, unknown>[] | null; error: { message?: string | null } | null }>;
        };
    };
};

const STORE_DIR = path.join(process.cwd(), 'storage');
const STORE_PATH = path.join(STORE_DIR, 'external-tournament-overrides.json');
const EXTERNAL_TOURNAMENT_SELECT = 'id, source, name, display_name, logo_url, sport, country, country_id, url, priority, updated_at';
const EXTERNAL_TOURNAMENT_SELECT_WITHOUT_PRIORITY = 'id, source, name, display_name, logo_url, sport, country, country_id, url, updated_at';
const LEGACY_TOURNAMENT_SELECT = 'id, external_id, name, display_name, logo_url, sport_id, sport, country, country_id, url, priority';
const LEGACY_TOURNAMENT_SELECT_WITHOUT_PRIORITY = 'id, external_id, name, display_name, logo_url, sport_id, sport, country, country_id, url';

function normalizeString(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed || null;
}

function normalizeInteger(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value);
    if (typeof value === 'string' && value.trim()) {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) return Math.trunc(parsed);
    }
    return null;
}

function uniqueValues(values: Array<string | null | undefined>): string[] {
    const seen = new Set<string>();
    const result: string[] = [];

    for (const value of values) {
        const trimmed = normalizeString(value);
        if (!trimmed) continue;
        if (seen.has(trimmed)) continue;
        seen.add(trimmed);
        result.push(trimmed);
    }

    return result;
}

export function buildExternalTournamentOverrideCandidates(id: string | null | undefined): string[] {
    const raw = normalizeString(id);
    if (!raw) return [];

    const lower = raw.toLowerCase();
    const withoutFsPrefix = lower.startsWith('fs-') ? raw.slice(3) : raw;
    const withoutFsPrefixLower = withoutFsPrefix.toLowerCase();
    const rugbyMatch = /^ras-league-(\d+)$/i.exec(raw);
    const numericLeagueId = rugbyMatch?.[1] ?? (/^\d+$/i.test(raw) ? raw : null);

    return uniqueValues([
        raw,
        lower,
        withoutFsPrefix,
        withoutFsPrefixLower,
        `fs-${withoutFsPrefix}`,
        `fs-${withoutFsPrefixLower}`,
        numericLeagueId,
        numericLeagueId ? `ras-league-${numericLeagueId}` : null,
    ]);
}

async function ensureStoreDir() {
    await mkdir(STORE_DIR, { recursive: true });
}

async function readStore(): Promise<ExternalTournamentOverrideStore> {
    try {
        const raw = await readFile(STORE_PATH, 'utf-8');
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' ? parsed as ExternalTournamentOverrideStore : {};
    } catch {
        return {};
    }
}

async function writeStore(store: ExternalTournamentOverrideStore) {
    await ensureStoreDir();
    await writeFile(STORE_PATH, JSON.stringify(store, null, 2), 'utf-8');
}

export function normalizeExternalTournamentOverrideRecord(
    record: ExternalTournamentOverrideRecord,
): ExternalTournamentOverrideRecord {
    const normalizedId = normalizeString(record.id);
    if (!normalizedId) {
        throw new Error('Tournament id is required');
    }

    return {
        ...record,
        id: normalizedId,
        name: normalizeString(record.display_name) || normalizeString(record.name),
        display_name: normalizeString(record.display_name) || normalizeString(record.name),
        logo_url: normalizeString(record.logo_url),
        source: normalizeString(record.source) || 'flashscore',
        sport: normalizeString(record.sport) || 'rugby',
        country: normalizeString(record.country),
        country_id: normalizeString(record.country_id),
        url: normalizeString(record.url),
        priority: normalizeInteger(record.priority),
        updated_at: new Date().toISOString(),
    };
}

function mapExternalTournamentOverrideRow(row: Record<string, unknown> | null | undefined): ExternalTournamentOverrideRecord | null {
    if (!row) return null;

    const id = normalizeString(row.id);
    if (!id) return null;

    return {
        id,
        source: normalizeString(row.source) || 'database',
        name: normalizeString(row.display_name) || normalizeString(row.name),
        display_name: normalizeString(row.display_name) || normalizeString(row.name),
        logo_url: normalizeString(row.logo_url),
        sport: normalizeString(row.sport),
        country: normalizeString(row.country),
        country_id: normalizeString(row.country_id),
        url: normalizeString(row.url),
        priority: normalizeInteger(row.priority),
        updated_at: normalizeString(row.updated_at),
    };
}

function mapLegacyTournamentOverrideRow(row: Record<string, unknown> | null | undefined): ExternalTournamentOverrideRecord | null {
    if (!row) return null;

    const externalId = normalizeString(row.external_id) || normalizeString(row.id);
    if (!externalId) return null;

    return {
        id: externalId,
        source: 'database',
        name: normalizeString(row.display_name) || normalizeString(row.name),
        display_name: normalizeString(row.display_name) || normalizeString(row.name),
        logo_url: normalizeString(row.logo_url),
        sport: normalizeString(row.sport_id) || normalizeString(row.sport),
        country: normalizeString(row.country),
        country_id: normalizeString(row.country_id),
        url: normalizeString(row.url),
        priority: normalizeInteger(row.priority),
    };
}

function findStoredOverrideByCandidates(
    store: ExternalTournamentOverrideStore,
    candidates: string[],
): ExternalTournamentOverrideRecord | null {
    for (const candidate of candidates) {
        const direct = store[candidate];
        if (direct) return direct;
    }

    const normalizedStoreEntries = Object.entries(store);
    for (const candidate of candidates) {
        const lowered = candidate.toLowerCase();
        const found = normalizedStoreEntries.find(([key]) => key.toLowerCase() === lowered);
        if (found) return found[1];
    }

    return null;
}

function buildRecordCandidateMap(records: ExternalTournamentOverrideRecord[]): Map<string, ExternalTournamentOverrideRecord> {
    const lookup = new Map<string, ExternalTournamentOverrideRecord>();

    records.forEach((record) => {
        buildExternalTournamentOverrideCandidates(record.id).forEach((candidate) => {
            const key = candidate.toLowerCase();
            if (!lookup.has(key)) {
                lookup.set(key, record);
            }
        });
    });

    return lookup;
}

function findRecordByCandidates(
    lookup: Map<string, ExternalTournamentOverrideRecord>,
    candidates: string[],
): ExternalTournamentOverrideRecord | null {
    for (const candidate of candidates) {
        const record = lookup.get(candidate.toLowerCase());
        if (record) return record;
    }

    return null;
}

async function getExternalTournamentOverridesFromTable(candidateIds: string[]): Promise<ExternalTournamentOverrideRecord[]> {
    if (candidateIds.length === 0) return [];

    try {
        const readClient = await getReadClient();
        const client = readClient as unknown as MinimalReadClient;
        let { data, error } = await client
            .from('external_tournaments')
            .select(EXTERNAL_TOURNAMENT_SELECT)
            .in('id', candidateIds);

        if (error && isMissingColumnError(error, 'priority')) {
            const fallback = await client
                .from('external_tournaments')
                .select(EXTERNAL_TOURNAMENT_SELECT_WITHOUT_PRIORITY)
                .in('id', candidateIds);
            data = fallback.data;
            error = fallback.error;
        }

        if (error || !Array.isArray(data)) return [];

        return data
            .map((row: Record<string, unknown>) => mapExternalTournamentOverrideRow(row))
            .filter((record: ExternalTournamentOverrideRecord | null): record is ExternalTournamentOverrideRecord => record !== null);
    } catch {
        return [];
    }
}

async function getLegacyTournamentOverridesFromTable(candidateIds: string[]): Promise<ExternalTournamentOverrideRecord[]> {
    if (candidateIds.length === 0) return [];

    try {
        const readClient = await getReadClient();
        const client = readClient as unknown as MinimalReadClient;
        let { data, error } = await client
            .from('tournaments')
            .select(LEGACY_TOURNAMENT_SELECT)
            .in('external_id', candidateIds);

        if (error && isMissingColumnError(error, 'priority')) {
            const fallback = await client
                .from('tournaments')
                .select(LEGACY_TOURNAMENT_SELECT_WITHOUT_PRIORITY)
                .in('external_id', candidateIds);
            data = fallback.data;
            error = fallback.error;
        }

        if (error || !Array.isArray(data)) return [];

        return data
            .map((row: Record<string, unknown>) => mapLegacyTournamentOverrideRow(row))
            .filter((record: ExternalTournamentOverrideRecord | null): record is ExternalTournamentOverrideRecord => record !== null);
    } catch {
        return [];
    }
}

export async function getStoredExternalTournamentOverride(id: string): Promise<ExternalTournamentOverrideRecord | null> {
    const store = await readStore();
    const candidates = buildExternalTournamentOverrideCandidates(id);

    return findStoredOverrideByCandidates(store, candidates);
}

export async function getStoredExternalTournamentOverrides(ids: string[]): Promise<Map<string, ExternalTournamentOverrideRecord>> {
    const normalizedIds = ids
        .map((id) => normalizeString(id))
        .filter((id): id is string => Boolean(id));

    if (normalizedIds.length === 0) {
        return new Map();
    }

    const allCandidates = uniqueValues(
        normalizedIds.flatMap((id) => buildExternalTournamentOverrideCandidates(id)),
    );

    const [store, externalRows, legacyRows] = await Promise.all([
        readStore(),
        getExternalTournamentOverridesFromTable(allCandidates),
        getLegacyTournamentOverridesFromTable(allCandidates),
    ]);

    const externalLookup = buildRecordCandidateMap(externalRows);
    const legacyLookup = buildRecordCandidateMap(legacyRows);
    const result = new Map<string, ExternalTournamentOverrideRecord>();

    for (const rawId of normalizedIds) {
        const candidates = buildExternalTournamentOverrideCandidates(rawId);
        const override =
            findRecordByCandidates(externalLookup, candidates) ||
            findStoredOverrideByCandidates(store, candidates) ||
            findRecordByCandidates(legacyLookup, candidates);

        if (override) {
            result.set(rawId, override);
            result.set(rawId.toLowerCase(), override);
        }
    }

    return result;
}

export async function getDatabaseExternalTournamentOverride(id: string): Promise<ExternalTournamentOverrideRecord | null> {
    const candidates = buildExternalTournamentOverrideCandidates(id);
    if (candidates.length === 0) return null;

    const [externalRows, legacyRows] = await Promise.all([
        getExternalTournamentOverridesFromTable(candidates),
        getLegacyTournamentOverridesFromTable(candidates),
    ]);

    const externalLookup = buildRecordCandidateMap(externalRows);
    const legacyLookup = buildRecordCandidateMap(legacyRows);

    return (
        findRecordByCandidates(externalLookup, candidates) ||
        findRecordByCandidates(legacyLookup, candidates)
    );
}

export async function getExternalTournamentOverride(id: string): Promise<ExternalTournamentOverrideRecord | null> {
    const candidates = buildExternalTournamentOverrideCandidates(id);
    if (candidates.length === 0) return null;

    const [store, externalRows, legacyRows] = await Promise.all([
        readStore(),
        getExternalTournamentOverridesFromTable(candidates),
        getLegacyTournamentOverridesFromTable(candidates),
    ]);

    const externalLookup = buildRecordCandidateMap(externalRows);
    const legacyLookup = buildRecordCandidateMap(legacyRows);

    return (
        findRecordByCandidates(externalLookup, candidates) ||
        findStoredOverrideByCandidates(store, candidates) ||
        findRecordByCandidates(legacyLookup, candidates)
    );
}

export async function upsertExternalTournamentOverride(
    record: ExternalTournamentOverrideRecord,
): Promise<ExternalTournamentOverrideRecord> {
    const normalized = normalizeExternalTournamentOverrideRecord(record);
    const store = await readStore();

    for (const candidate of buildExternalTournamentOverrideCandidates(normalized.id)) {
        if (store[candidate]) {
            delete store[candidate];
        }
    }

    store[normalized.id] = normalized;
    await writeStore(store);

    return normalized;
}

export function applyExternalTournamentOverride<T extends Record<string, unknown>>(
    tournament: T,
    override: ExternalTournamentOverrideRecord | null | undefined,
): T {
    if (!override) return tournament;

    const resolvedName = normalizeString(override.display_name) || normalizeString(override.name);
    const resolvedLogo = normalizeString(override.logo_url);

    return {
        ...tournament,
        ...(resolvedName ? {
            name: resolvedName,
            display_name: resolvedName,
        } : {}),
        ...(resolvedLogo ? {
            logo_url: resolvedLogo,
            image: resolvedLogo,
            logo: resolvedLogo,
            image_path: resolvedLogo,
            tournament_logo: resolvedLogo,
            tournament_image_path: resolvedLogo,
        } : {}),
        ...(override.country ? { country: override.country } : {}),
        ...(override.country_id ? { country_id: override.country_id } : {}),
        ...(override.url ? { url: override.url } : {}),
        ...(typeof override.priority === 'number' && Number.isFinite(override.priority) ? {
            priority: Math.trunc(override.priority),
        } : {}),
    };
}
