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

export async function getExternalTeamLogoOverride(id: string): Promise<ExternalTeamLogoOverrideRecord | null> {
    const store = await readStore();
    return store[id] || null;
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
