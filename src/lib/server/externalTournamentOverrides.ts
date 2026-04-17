import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { getReadClient } from '@/lib/supabase/read';
import { resolveTournamentCountryId, resolveTournamentCountryLabel } from '@/lib/data/countries';
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

function repairMojibake(value: string): string {
    if (!/[ÃÂ]/.test(value)) return value;

    try {
        const repaired = Buffer.from(value, 'latin1').toString('utf8').trim();
        if (repaired && !repaired.includes('\uFFFD')) {
            return repaired;
        }
    } catch {
        // Fall back to the original value.
    }

    return value;
}

function normalizeHumanText(value: unknown): string | null {
    const normalized = normalizeString(value);
    return normalized ? repairMojibake(normalized) : null;
}

function normalizeTournamentPath(value: unknown): string | null {
    const normalized = normalizeString(value);
    if (!normalized) return null;

    let pathname = normalized;
    if (normalized.startsWith('http://') || normalized.startsWith('https://')) {
        try {
            pathname = new URL(normalized).pathname;
        } catch {
            pathname = normalized;
        }
    }

    const collapsed = pathname.replace(/\/+/g, '/');
    const withLeadingSlash = collapsed.startsWith('/') ? collapsed : `/${collapsed}`;
    const trimmed = withLeadingSlash === '/' ? '/' : withLeadingSlash.replace(/\/+$/, '');

    if (!trimmed || trimmed === '/') {
        return null;
    }

    return `${trimmed}/`;
}

function buildUrlDerivedTournamentId(value: unknown): string | null {
    const pathname = normalizeTournamentPath(value);
    if (!pathname) return null;

    const slug = pathname
        .split('/')
        .filter(Boolean)
        .join('-')
        .toLowerCase();

    return slug ? `fs-${slug}` : null;
}

function buildTournamentPathFromSlugId(value: unknown): string | null {
    const normalized = normalizeString(value);
    if (!normalized) return null;

    const withoutFsPrefix = normalized.toLowerCase().startsWith('fs-') ? normalized.slice(3) : normalized;
    const lowered = withoutFsPrefix.toLowerCase();

    let sport: string | null = null;
    let remainder = '';

    if (lowered.startsWith('rugby-league-')) {
        sport = 'rugby-league';
        remainder = withoutFsPrefix.slice('rugby-league-'.length);
    } else if (lowered.startsWith('rugby-union-')) {
        sport = 'rugby-union';
        remainder = withoutFsPrefix.slice('rugby-union-'.length);
    } else {
        return null;
    }

    const segments = remainder
        .split('-')
        .map((segment) => segment.trim())
        .filter(Boolean);

    if (segments.length < 2) return null;

    const [country, ...tournamentParts] = segments;
    const tournamentSlug = tournamentParts.join('-');
    if (!country || !tournamentSlug) return null;

    return normalizeTournamentPath(`/${sport}/${country}/${tournamentSlug}/`);
}

function buildExternalTournamentUrlCandidates(value: unknown): string[] {
    const normalized = normalizeString(value);
    if (!normalized) return [];

    const directPath = normalizeTournamentPath(normalized);
    const slugPath = buildTournamentPathFromSlugId(normalized);
    const directId = buildUrlDerivedTournamentId(normalized);
    const slugId = slugPath ? buildUrlDerivedTournamentId(slugPath) : null;

    return uniqueValues([
        directPath,
        directPath ? directPath.replace(/\/$/, '') : null,
        slugPath,
        slugPath ? slugPath.replace(/\/$/, '') : null,
        directId,
        slugId,
    ]);
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

function normalizeExternalTournamentCountryFields(country: unknown, countryId: unknown) {
    const rawCountry = normalizeHumanText(country);
    const rawCountryId = normalizeString(countryId);

    const countryBasedId = resolveTournamentCountryId(rawCountry);
    const idBasedId = resolveTournamentCountryId(rawCountryId);
    const resolvedCountryId =
        countryBasedId && (countryBasedId !== 'international' || !idBasedId)
            ? countryBasedId
            : idBasedId || countryBasedId || null;

    const resolvedCountry =
        resolveTournamentCountryLabel(resolvedCountryId) ||
        resolveTournamentCountryLabel(rawCountry) ||
        rawCountry;

    return {
        country: resolvedCountry,
        country_id: resolvedCountryId,
    };
}

function coerceExternalTournamentOverrideRecord(
    record: ExternalTournamentOverrideRecord,
): ExternalTournamentOverrideRecord {
    const normalizedId = normalizeString(record.id);
    if (!normalizedId) {
        throw new Error('Tournament id is required');
    }

    const normalizedCountry = normalizeExternalTournamentCountryFields(record.country, record.country_id);

    return {
        ...record,
        id: normalizedId,
        name: normalizeHumanText(record.display_name) || normalizeHumanText(record.name),
        display_name: normalizeHumanText(record.display_name) || normalizeHumanText(record.name),
        logo_url: normalizeString(record.logo_url),
        source: normalizeString(record.source) || 'flashscore',
        sport: normalizeString(record.sport) || 'rugby',
        country: normalizedCountry.country,
        country_id: normalizedCountry.country_id,
        url: normalizeString(record.url),
        priority: normalizeInteger(record.priority),
        updated_at: normalizeString(record.updated_at),
    };
}

function parseUpdatedAt(value: unknown): number {
    const normalized = normalizeString(value);
    if (!normalized) return 0;

    const parsed = Date.parse(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
}

function mergeExternalTournamentOverrideRecords(
    ...records: Array<ExternalTournamentOverrideRecord | null | undefined>
): ExternalTournamentOverrideRecord | null {
    const normalizedRecords = records
        .filter((record): record is ExternalTournamentOverrideRecord => Boolean(record))
        .map((record) => coerceExternalTournamentOverrideRecord(record));

    if (normalizedRecords.length === 0) return null;

    const [primary, ...fallbacks] = [...normalizedRecords].sort((left, right) => (
        parseUpdatedAt(right.updated_at) - parseUpdatedAt(left.updated_at)
    ));

    const merged = fallbacks.reduce((accumulator, record) => ({
        id: accumulator.id || record.id,
        source: accumulator.source || record.source,
        name: accumulator.name || record.name,
        display_name: accumulator.display_name || record.display_name,
        logo_url: accumulator.logo_url || record.logo_url,
        sport: accumulator.sport || record.sport,
        country: accumulator.country || record.country,
        country_id: accumulator.country_id || record.country_id,
        url: accumulator.url || record.url,
        priority: accumulator.priority ?? record.priority ?? null,
        updated_at: accumulator.updated_at || record.updated_at,
    }), primary);

    return coerceExternalTournamentOverrideRecord(merged);
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
        ...buildExternalTournamentUrlCandidates(raw),
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
    return {
        ...coerceExternalTournamentOverrideRecord(record),
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
        name: normalizeHumanText(row.display_name) || normalizeHumanText(row.name),
        display_name: normalizeHumanText(row.display_name) || normalizeHumanText(row.name),
        logo_url: normalizeString(row.logo_url),
        sport: normalizeString(row.sport),
        country: normalizeHumanText(row.country),
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
        name: normalizeHumanText(row.display_name) || normalizeHumanText(row.name),
        display_name: normalizeHumanText(row.display_name) || normalizeHumanText(row.name),
        logo_url: normalizeString(row.logo_url),
        sport: normalizeString(row.sport_id) || normalizeString(row.sport),
        country: normalizeHumanText(row.country),
        country_id: normalizeString(row.country_id),
        url: normalizeString(row.url),
        priority: normalizeInteger(row.priority),
    };
}

function findStoredOverrideByCandidates(
    store: ExternalTournamentOverrideStore,
    candidates: string[],
): ExternalTournamentOverrideRecord | null {
    const lookup = buildStoreCandidateMap(store);
    return findRecordByCandidates(lookup, candidates);
}

function buildExternalTournamentRecordCandidates(
    record: ExternalTournamentOverrideRecord,
    storeKey?: string,
): string[] {
    return uniqueValues([
        storeKey,
        ...buildExternalTournamentOverrideCandidates(record.id),
        ...buildExternalTournamentUrlCandidates(record.url),
    ]);
}

function buildStoreCandidateMap(store: ExternalTournamentOverrideStore): Map<string, ExternalTournamentOverrideRecord> {
    const lookup = new Map<string, ExternalTournamentOverrideRecord>();

    Object.entries(store).forEach(([key, record]) => {
        try {
            const normalizedRecord = coerceExternalTournamentOverrideRecord(record);
            buildExternalTournamentRecordCandidates(normalizedRecord, key).forEach((candidate) => {
                const lowered = candidate.toLowerCase();
                if (!lookup.has(lowered)) {
                    lookup.set(lowered, normalizedRecord);
                }
            });
        } catch {
            // Skip malformed local records.
        }
    });

    return lookup;
}

function buildRecordCandidateMap(records: ExternalTournamentOverrideRecord[]): Map<string, ExternalTournamentOverrideRecord> {
    const lookup = new Map<string, ExternalTournamentOverrideRecord>();

    records.forEach((record) => {
        buildExternalTournamentRecordCandidates(record).forEach((candidate) => {
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

async function getExternalTournamentOverridesFromTableByUrl(candidateUrls: string[]): Promise<ExternalTournamentOverrideRecord[]> {
    if (candidateUrls.length === 0) return [];

    try {
        const readClient = await getReadClient();
        const client = readClient as unknown as MinimalReadClient;
        let { data, error } = await client
            .from('external_tournaments')
            .select(EXTERNAL_TOURNAMENT_SELECT)
            .in('url', candidateUrls);

        if (error && isMissingColumnError(error, 'priority')) {
            const fallback = await client
                .from('external_tournaments')
                .select(EXTERNAL_TOURNAMENT_SELECT_WITHOUT_PRIORITY)
                .in('url', candidateUrls);
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

async function getLegacyTournamentOverridesFromTableByUrl(candidateUrls: string[]): Promise<ExternalTournamentOverrideRecord[]> {
    if (candidateUrls.length === 0) return [];

    try {
        const readClient = await getReadClient();
        const client = readClient as unknown as MinimalReadClient;
        let { data, error } = await client
            .from('tournaments')
            .select(LEGACY_TOURNAMENT_SELECT)
            .in('url', candidateUrls);

        if (error && isMissingColumnError(error, 'priority')) {
            const fallback = await client
                .from('tournaments')
                .select(LEGACY_TOURNAMENT_SELECT_WITHOUT_PRIORITY)
                .in('url', candidateUrls);
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

    const override = findStoredOverrideByCandidates(store, candidates);
    return override ? coerceExternalTournamentOverrideRecord(override) : null;
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
    const allUrlCandidates = uniqueValues(
        normalizedIds.flatMap((id) => buildExternalTournamentUrlCandidates(id)),
    );

    const [store, externalRowsById, externalRowsByUrl, legacyRowsById, legacyRowsByUrl] = await Promise.all([
        readStore(),
        getExternalTournamentOverridesFromTable(allCandidates),
        getExternalTournamentOverridesFromTableByUrl(allUrlCandidates),
        getLegacyTournamentOverridesFromTable(allCandidates),
        getLegacyTournamentOverridesFromTableByUrl(allUrlCandidates),
    ]);

    const externalLookup = buildRecordCandidateMap([...externalRowsById, ...externalRowsByUrl]);
    const legacyLookup = buildRecordCandidateMap([...legacyRowsById, ...legacyRowsByUrl]);
    const preliminaryOverrides = new Map<string, ExternalTournamentOverrideRecord>();

    for (const rawId of normalizedIds) {
        const candidates = buildExternalTournamentOverrideCandidates(rawId);
        const preliminaryOverride = mergeExternalTournamentOverrideRecords(
            findRecordByCandidates(externalLookup, candidates),
            findStoredOverrideByCandidates(store, candidates),
            findRecordByCandidates(legacyLookup, candidates),
        );

        if (preliminaryOverride) {
            preliminaryOverrides.set(rawId, preliminaryOverride);
        }
    }

    const canonicalIds = uniqueValues(
        [...preliminaryOverrides.values()].map((override) => override.id),
    );
    const [canonicalExternalRows, canonicalLegacyRows] = await Promise.all([
        getExternalTournamentOverridesFromTable(canonicalIds),
        getLegacyTournamentOverridesFromTable(canonicalIds),
    ]);
    const canonicalExternalLookup = buildRecordCandidateMap(canonicalExternalRows);
    const canonicalLegacyLookup = buildRecordCandidateMap(canonicalLegacyRows);
    const result = new Map<string, ExternalTournamentOverrideRecord>();

    for (const rawId of normalizedIds) {
        const preliminaryOverride = preliminaryOverrides.get(rawId);
        if (!preliminaryOverride) continue;

        const canonicalCandidates = buildExternalTournamentOverrideCandidates(preliminaryOverride.id);
        const override = mergeExternalTournamentOverrideRecords(
            findRecordByCandidates(canonicalExternalLookup, canonicalCandidates),
            preliminaryOverride,
            findRecordByCandidates(canonicalLegacyLookup, canonicalCandidates),
        );

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
    const urlCandidates = buildExternalTournamentUrlCandidates(id);

    const [externalRowsById, externalRowsByUrl, legacyRowsById, legacyRowsByUrl] = await Promise.all([
        getExternalTournamentOverridesFromTable(candidates),
        getExternalTournamentOverridesFromTableByUrl(urlCandidates),
        getLegacyTournamentOverridesFromTable(candidates),
        getLegacyTournamentOverridesFromTableByUrl(urlCandidates),
    ]);

    const externalLookup = buildRecordCandidateMap([...externalRowsById, ...externalRowsByUrl]);
    const legacyLookup = buildRecordCandidateMap([...legacyRowsById, ...legacyRowsByUrl]);

    return mergeExternalTournamentOverrideRecords(
        findRecordByCandidates(externalLookup, candidates),
        findRecordByCandidates(legacyLookup, candidates),
    );
}

export async function getExternalTournamentOverride(id: string): Promise<ExternalTournamentOverrideRecord | null> {
    const candidates = buildExternalTournamentOverrideCandidates(id);
    if (candidates.length === 0) return null;
    const urlCandidates = buildExternalTournamentUrlCandidates(id);

    const [store, externalRowsById, externalRowsByUrl, legacyRowsById, legacyRowsByUrl] = await Promise.all([
        readStore(),
        getExternalTournamentOverridesFromTable(candidates),
        getExternalTournamentOverridesFromTableByUrl(urlCandidates),
        getLegacyTournamentOverridesFromTable(candidates),
        getLegacyTournamentOverridesFromTableByUrl(urlCandidates),
    ]);

    const externalLookup = buildRecordCandidateMap([...externalRowsById, ...externalRowsByUrl]);
    const legacyLookup = buildRecordCandidateMap([...legacyRowsById, ...legacyRowsByUrl]);

    const preliminaryOverride = mergeExternalTournamentOverrideRecords(
        findRecordByCandidates(externalLookup, candidates),
        findStoredOverrideByCandidates(store, candidates),
        findRecordByCandidates(legacyLookup, candidates),
    );

    if (!preliminaryOverride) {
        return null;
    }

    const canonicalCandidates = buildExternalTournamentOverrideCandidates(preliminaryOverride.id);
    const [canonicalExternalRows, canonicalLegacyRows] = await Promise.all([
        getExternalTournamentOverridesFromTable(canonicalCandidates),
        getLegacyTournamentOverridesFromTable(canonicalCandidates),
    ]);
    const canonicalExternalLookup = buildRecordCandidateMap(canonicalExternalRows);
    const canonicalLegacyLookup = buildRecordCandidateMap(canonicalLegacyRows);

    return mergeExternalTournamentOverrideRecords(
        findRecordByCandidates(canonicalExternalLookup, canonicalCandidates),
        preliminaryOverride,
        findRecordByCandidates(canonicalLegacyLookup, canonicalCandidates),
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

    const normalizedOverride = coerceExternalTournamentOverrideRecord(override);
    const resolvedName = normalizeString(normalizedOverride.display_name) || normalizeString(normalizedOverride.name);
    const resolvedLogo = normalizeString(normalizedOverride.logo_url);

    return {
        ...tournament,
        ...(resolvedName ? {
            name: resolvedName,
            display_name: resolvedName,
        } : {}),
        ...(normalizedOverride.sport ? {
            sport: normalizedOverride.sport,
            sport_id: normalizedOverride.sport,
            sportId: normalizedOverride.sport,
        } : {}),
        ...(resolvedLogo ? {
            logo_url: resolvedLogo,
            image: resolvedLogo,
            logo: resolvedLogo,
            image_path: resolvedLogo,
            tournament_logo: resolvedLogo,
            tournament_image_path: resolvedLogo,
        } : {}),
        ...(normalizedOverride.country ? {
            country: normalizedOverride.country,
            country_name: normalizedOverride.country,
            countryName: normalizedOverride.country,
        } : {}),
        ...(normalizedOverride.country_id ? { country_id: normalizedOverride.country_id } : {}),
        ...(normalizedOverride.url ? { url: normalizedOverride.url } : {}),
        ...(typeof normalizedOverride.priority === 'number' && Number.isFinite(normalizedOverride.priority) ? {
            priority: Math.trunc(normalizedOverride.priority),
        } : {}),
    };
}
