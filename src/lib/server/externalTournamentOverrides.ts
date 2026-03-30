import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { getReadClient } from '@/lib/supabase/read';

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
    updated_at?: string | null;
};

type ExternalTournamentOverrideStore = Record<string, ExternalTournamentOverrideRecord>;

const STORE_DIR = path.join(process.cwd(), 'storage');
const STORE_PATH = path.join(STORE_DIR, 'external-tournament-overrides.json');

function normalizeString(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed || null;
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
    const withoutPrefix = lower.startsWith('fs-') ? raw.slice(3) : raw;
    const withoutPrefixLower = withoutPrefix.toLowerCase();

    return uniqueValues([
        raw,
        lower,
        withoutPrefix,
        withoutPrefixLower,
        `fs-${withoutPrefix}`,
        `fs-${withoutPrefixLower}`,
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

function mapDbTournamentOverride(row: Record<string, unknown> | null | undefined): ExternalTournamentOverrideRecord | null {
    if (!row) return null;

    const externalId = normalizeString(row.external_id) || normalizeString(row.id);
    if (!externalId) return null;

    return {
        id: externalId,
        source: 'database',
        name: normalizeString(row.display_name) || normalizeString(row.name),
        display_name: normalizeString(row.display_name) || normalizeString(row.name),
        logo_url: normalizeString(row.logo_url) || null,
        sport: normalizeString(row.sport_id) || normalizeString(row.sport),
        country: normalizeString(row.country),
        country_id: normalizeString(row.country_id),
        url: normalizeString(row.url),
    };
}

export async function getStoredExternalTournamentOverride(id: string): Promise<ExternalTournamentOverrideRecord | null> {
    const store = await readStore();
    const candidates = buildExternalTournamentOverrideCandidates(id);

    return findStoredOverrideByCandidates(store, candidates);
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

export async function getStoredExternalTournamentOverrides(ids: string[]): Promise<Map<string, ExternalTournamentOverrideRecord>> {
    const store = await readStore();
    const result = new Map<string, ExternalTournamentOverrideRecord>();

    for (const id of ids) {
        const rawId = normalizeString(id);
        if (!rawId) continue;

        const override = findStoredOverrideByCandidates(store, buildExternalTournamentOverrideCandidates(rawId));
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

    try {
        const readClient = await getReadClient();
        const { data, error } = await (readClient as any)
            .from('tournaments')
            .select('id, external_id, name, display_name, logo_url, sport_id, sport, country, country_id, url')
            .in('external_id', candidates)
            .limit(1);

        if (error) return null;

        const row = Array.isArray(data) ? data[0] : null;
        return mapDbTournamentOverride(row);
    } catch {
        return null;
    }
}

export async function getExternalTournamentOverride(id: string): Promise<ExternalTournamentOverrideRecord | null> {
    const stored = await getStoredExternalTournamentOverride(id);
    if (stored) return stored;

    return getDatabaseExternalTournamentOverride(id);
}

export async function upsertExternalTournamentOverride(
    record: ExternalTournamentOverrideRecord,
): Promise<ExternalTournamentOverrideRecord> {
    const normalizedId = normalizeString(record.id);
    if (!normalizedId) {
        throw new Error('Tournament id is required');
    }

    const normalized: ExternalTournamentOverrideRecord = {
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
        updated_at: new Date().toISOString(),
    };

    const store = await readStore();
    for (const candidate of buildExternalTournamentOverrideCandidates(normalizedId)) {
        if (store[candidate]) {
            delete store[candidate];
        }
    }
    store[normalizedId] = normalized;
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
    };
}
