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
    return store[id] || null;
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
                return record;
            }
        }
    }

    return null;
}

export async function upsertExternalTeamLogoOverride(
    record: ExternalTeamLogoOverrideRecord
): Promise<ExternalTeamLogoOverrideRecord> {
    const normalized: ExternalTeamLogoOverrideRecord = {
        ...record,
        id: record.id,
        updated_at: new Date().toISOString(),
    };

    const store = await readStore();
    store[record.id] = normalized;
    await writeStore(store);
    return normalized;
}
