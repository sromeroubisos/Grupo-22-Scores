import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

export type ExternalTeamLogoOverrideRecord = {
    id: string;
    source?: string | null;
    name?: string | null;
    short_name?: string | null;
    logo_url?: string | null;
    sport?: string | null;
    country?: string | null;
    team_url?: string | null;
    updated_at?: string | null;
};

type ExternalTeamLogoOverrideStore = Record<string, ExternalTeamLogoOverrideRecord>;

const STORE_DIR = path.join(process.cwd(), 'storage');
const STORE_PATH = path.join(STORE_DIR, 'external-team-logo-overrides.json');

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

function parseUpdatedAt(value: unknown): number {
    const normalized = normalizeString(value);
    if (!normalized) return 0;

    const parsed = Date.parse(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
}

async function ensureStoreDir() {
    await mkdir(STORE_DIR, { recursive: true });
}

async function readStore(): Promise<ExternalTeamLogoOverrideStore> {
    try {
        const raw = await readFile(STORE_PATH, 'utf-8');
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' ? parsed as ExternalTeamLogoOverrideStore : {};
    } catch {
        return {};
    }
}

async function writeStore(store: ExternalTeamLogoOverrideStore) {
    await ensureStoreDir();
    await writeFile(STORE_PATH, JSON.stringify(store, null, 2), 'utf-8');
}

function normalizeLookupValue(value: unknown): string {
    if (value === null || value === undefined) return '';
    return String(value).trim().toLowerCase();
}

function extractIdFromTeamUrl(value: unknown): string | null {
    if (typeof value !== 'string') return null;

    const trimmed = value.trim();
    if (!trimmed) return null;

    let pathname = trimmed;
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
        try {
            pathname = new URL(trimmed).pathname;
        } catch {
            pathname = trimmed;
        }
    }

    const segments = pathname
        .split('/')
        .map((segment) => segment.trim())
        .filter(Boolean);

    if (segments.length < 2) return null;
    if (segments[0].toLowerCase() !== 'team') return null;

    const candidate = segments[segments.length - 1];
    if (!candidate || !/^[a-z0-9]+$/i.test(candidate)) return null;

    return candidate;
}

function addCandidate(candidates: Set<string>, value: unknown) {
    const normalized = normalizeLookupValue(value);
    if (!normalized) return;

    candidates.add(normalized);

    const extractedId = extractIdFromTeamUrl(value);
    if (extractedId) {
        candidates.add(normalizeLookupValue(extractedId));
    }
}

function buildCandidateSet(values: unknown[]): Set<string> {
    const candidates = new Set<string>();

    for (const value of values) {
        addCandidate(candidates, value);
    }

    return candidates;
}

export async function getExternalTeamLogoOverride(id: string): Promise<ExternalTeamLogoOverrideRecord | null> {
    const store = await readStore();
    return normalizeExternalTeamLogoOverrideRecord(store[id] || null);
}

export async function findExternalTeamLogoOverride(
    ...values: unknown[]
): Promise<ExternalTeamLogoOverrideRecord | null> {
    const store = await readStore();
    const candidates = buildCandidateSet(values);
    if (candidates.size === 0) return null;

    for (const [storeKey, record] of Object.entries(store)) {
        const recordCandidates = buildCandidateSet([
            storeKey,
            record.id,
            record.name,
            record.short_name,
            record.team_url,
        ]);

        for (const candidate of recordCandidates) {
            if (candidates.has(candidate)) {
                return normalizeExternalTeamLogoOverrideRecord(record);
            }
        }
    }

    return null;
}

export async function upsertExternalTeamLogoOverride(
    record: ExternalTeamLogoOverrideRecord
): Promise<ExternalTeamLogoOverrideRecord> {
    const normalized = normalizeExternalTeamLogoOverrideRecord({
        ...record,
        updated_at: new Date().toISOString(),
    });

    if (!normalized) {
        throw new Error('External team id is required');
    }

    const store = await readStore();
    store[normalized.id] = normalized;
    await writeStore(store);
    return normalized;
}

export function normalizeExternalTeamLogoOverrideRecord(
    record: ExternalTeamLogoOverrideRecord | null | undefined,
): ExternalTeamLogoOverrideRecord | null {
    if (!record) return null;

    const id = normalizeString(record.id);
    if (!id) return null;

    return {
        ...record,
        id,
        source: normalizeString(record.source) || 'flashscore',
        name: normalizeHumanText(record.name),
        short_name: normalizeHumanText(record.short_name),
        logo_url: normalizeString(record.logo_url),
        sport: normalizeString(record.sport) || 'rugby',
        country: normalizeHumanText(record.country),
        team_url: normalizeString(record.team_url),
        updated_at: normalizeString(record.updated_at),
    };
}

export function mergeExternalTeamLogoOverrideRecords(
    ...records: Array<ExternalTeamLogoOverrideRecord | null | undefined>
): ExternalTeamLogoOverrideRecord | null {
    const normalizedRecords = records
        .map((record) => normalizeExternalTeamLogoOverrideRecord(record))
        .filter((record): record is ExternalTeamLogoOverrideRecord => Boolean(record));

    if (normalizedRecords.length === 0) return null;

    const [primary, ...fallbacks] = [...normalizedRecords].sort((left, right) => (
        parseUpdatedAt(right.updated_at) - parseUpdatedAt(left.updated_at)
    ));

    return fallbacks.reduce((accumulator, record) => ({
        id: accumulator.id || record.id,
        source: accumulator.source || record.source,
        name: accumulator.name || record.name,
        short_name: accumulator.short_name || record.short_name,
        logo_url: accumulator.logo_url || record.logo_url,
        sport: accumulator.sport || record.sport,
        country: accumulator.country || record.country,
        team_url: accumulator.team_url || record.team_url,
        updated_at: accumulator.updated_at || record.updated_at,
    }), primary);
}
