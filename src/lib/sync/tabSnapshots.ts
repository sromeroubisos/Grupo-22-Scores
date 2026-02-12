import crypto from 'crypto';
import { db, TabSnapshot } from '@/lib/mock-db';

type SnapshotKey = {
    entityType: TabSnapshot['entityType'];
    entityId: string;
    tab: string;
};

function stableStringify(value: any): string {
    if (value === null || value === undefined) return 'null';
    if (typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) {
        return `[${value.map(stableStringify).join(',')}]`;
    }
    const keys = Object.keys(value).sort();
    const entries = keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`);
    return `{${entries.join(',')}}`;
}

export function computeContentHash(payload: any): string {
    const json = stableStringify(payload);
    return crypto.createHash('sha256').update(json).digest('hex');
}

export function hasMeaningfulPayload(payload: any): boolean {
    if (payload === null || payload === undefined) return false;
    if (Array.isArray(payload)) return payload.length > 0;
    if (typeof payload === 'object') return Object.keys(payload).length > 0;
    return true;
}

export function getTabSnapshot({ entityType, entityId, tab }: SnapshotKey): TabSnapshot | undefined {
    return db.tabSnapshots.find(
        (snap) => snap.entityType === entityType && snap.entityId === entityId && snap.tab === tab
    );
}

export function upsertTabSnapshot(params: SnapshotKey & {
    payload: any;
    sourceVersion?: string;
    fetchStatus?: TabSnapshot['fetchStatus'];
}): { snapshot: TabSnapshot; changed: boolean } {
    const now = new Date().toISOString();
    const contentHash = computeContentHash(params.payload);
    const fetchStatus = params.fetchStatus || 'ok';

    const existingIndex = db.tabSnapshots.findIndex(
        (snap) => snap.entityType === params.entityType && snap.entityId === params.entityId && snap.tab === params.tab
    );

    if (existingIndex === -1) {
        const snapshot: TabSnapshot = {
            entityType: params.entityType,
            entityId: params.entityId,
            tab: params.tab,
            payload: params.payload,
            contentHash,
            sourceVersion: params.sourceVersion,
            lastFetchedAt: now,
            lastChangedAt: now,
            fetchStatus
        };
        db.tabSnapshots.push(snapshot);
        return { snapshot, changed: true };
    }

    const existing = db.tabSnapshots[existingIndex];
    const versionChanged = params.sourceVersion && params.sourceVersion !== existing.sourceVersion;
    const hashChanged = contentHash !== existing.contentHash;
    const changed = Boolean(versionChanged || hashChanged);

    if (changed) {
        db.tabSnapshots[existingIndex] = {
            ...existing,
            payload: params.payload,
            contentHash,
            sourceVersion: params.sourceVersion ?? existing.sourceVersion,
            lastFetchedAt: now,
            lastChangedAt: now,
            fetchStatus
        };
    } else {
        db.tabSnapshots[existingIndex] = {
            ...existing,
            lastFetchedAt: now,
            fetchStatus
        };
    }

    return { snapshot: db.tabSnapshots[existingIndex], changed };
}
