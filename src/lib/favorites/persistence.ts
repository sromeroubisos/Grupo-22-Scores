import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { buildClubCandidateIds, buildTournamentCandidateIds } from '@/lib/favorites/fetchFavorites';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type BrowserSupabaseClient = SupabaseClient<Database>;

function normalizeEntityId(value: string): string {
    return String(value).trim();
}

function isUuid(value: string): boolean {
    return UUID_RE.test(value.trim());
}

function uniqueNormalizedIds(values: Array<string | null | undefined>): string[] {
    return Array.from(new Set(
        values
            .map((value) => (typeof value === 'string' ? value.trim() : ''))
            .filter(Boolean)
    ));
}

async function resolveClubLinkedIds(
    supabase: BrowserSupabaseClient,
    entityId: string,
): Promise<string[]> {
    const supabaseAny = supabase as any;
    const aliasIds = buildClubCandidateIds(entityId);

    if (aliasIds.length === 0) {
        return [entityId];
    }

    const uuidAliasIds = aliasIds.filter(isUuid);
    const [byIdRes, byExternalIdRes] = await Promise.all([
        uuidAliasIds.length > 0
            ? supabaseAny
                .from('clubs')
                .select('id, external_id')
                .in('id', uuidAliasIds)
            : Promise.resolve({ data: [], error: null }),
        supabaseAny
            .from('clubs')
            .select('id, external_id')
            .in('external_id', aliasIds),
    ]);

    if (byIdRes.error) {
        throw byIdRes.error;
    }

    if (byExternalIdRes.error) {
        throw byExternalIdRes.error;
    }

    const linkedIds = [
        ...aliasIds,
        ...((byIdRes.data ?? []) as Array<{ id: string; external_id: string | null }>).flatMap((row) => (
            uniqueNormalizedIds([
                row.id,
                row.external_id,
                ...buildClubCandidateIds(row.id),
                ...(row.external_id ? buildClubCandidateIds(row.external_id) : []),
            ])
        )),
        ...((byExternalIdRes.data ?? []) as Array<{ id: string; external_id: string | null }>).flatMap((row) => (
            uniqueNormalizedIds([
                row.id,
                row.external_id,
                ...buildClubCandidateIds(row.id),
                ...(row.external_id ? buildClubCandidateIds(row.external_id) : []),
            ])
        )),
    ];

    return uniqueNormalizedIds(linkedIds);
}

export async function resolveClubPreferenceIds(
    supabase: BrowserSupabaseClient,
    entityId: string,
): Promise<string[]> {
    const normalizedEntityId = normalizeEntityId(entityId);
    if (!normalizedEntityId) {
        return [];
    }

    return resolveClubLinkedIds(supabase, normalizedEntityId);
}

export async function resolveClubCanonicalPreferenceId(
    supabase: BrowserSupabaseClient,
    entityId: string,
): Promise<string | null> {
    const linkedIds = await resolveClubPreferenceIds(supabase, entityId);
    if (linkedIds.length === 0) {
        return null;
    }

    const supabaseAny = supabase as any;
    const uuidLinkedIds = linkedIds.filter(isUuid);
    const [byIdRes, byExternalIdRes] = await Promise.all([
        uuidLinkedIds.length > 0
            ? supabaseAny
                .from('clubs')
                .select('id, external_id')
                .in('id', uuidLinkedIds)
            : Promise.resolve({ data: [], error: null }),
        supabaseAny
            .from('clubs')
            .select('id, external_id')
            .in('external_id', linkedIds),
    ]);

    if (byIdRes.error) {
        throw byIdRes.error;
    }

    if (byExternalIdRes.error) {
        throw byExternalIdRes.error;
    }

    const canonicalRows = [
        ...((byIdRes.data ?? []) as Array<{ id: string; external_id: string | null }>),
        ...((byExternalIdRes.data ?? []) as Array<{ id: string; external_id: string | null }>),
    ];

    return canonicalRows.find((row) => typeof row.id === 'string' && row.id.trim())?.id ?? null;
}

async function resolveTournamentLinkedIds(
    supabase: BrowserSupabaseClient,
    entityId: string,
): Promise<string[]> {
    const aliasIds = buildTournamentCandidateIds(entityId);

    if (aliasIds.length === 0) {
        return [entityId];
    }

    const uuidIds = aliasIds.filter(isUuid);
    const [byIdRes, byExternalIdRes] = await Promise.all([
        uuidIds.length > 0
            ? supabase
                .from('tournaments')
                .select('id, external_id')
                .in('id', uuidIds)
            : Promise.resolve({ data: [], error: null }),
        supabase
            .from('tournaments')
            .select('id, external_id')
            .in('external_id', aliasIds),
    ]);

    if (byIdRes.error) {
        throw byIdRes.error;
    }

    if (byExternalIdRes.error) {
        throw byExternalIdRes.error;
    }

    const linkedIds = [
        ...aliasIds,
        ...((byIdRes.data ?? []) as Array<{ id: string; external_id: string | null }>).flatMap((row) => (
            uniqueNormalizedIds([
                row.id,
                row.external_id,
                ...buildTournamentCandidateIds(row.id),
                ...(row.external_id ? buildTournamentCandidateIds(row.external_id) : []),
            ])
        )),
        ...((byExternalIdRes.data ?? []) as Array<{ id: string; external_id: string | null }>).flatMap((row) => (
            uniqueNormalizedIds([
                row.id,
                row.external_id,
                ...buildTournamentCandidateIds(row.id),
                ...(row.external_id ? buildTournamentCandidateIds(row.external_id) : []),
            ])
        )),
    ];

    return uniqueNormalizedIds(linkedIds);
}

export async function resolveTournamentLeaguePreferenceIds(
    supabase: BrowserSupabaseClient,
    entityId: string,
): Promise<string[]> {
    const normalizedEntityId = normalizeEntityId(entityId);
    if (!normalizedEntityId) {
        return [];
    }

    return resolveTournamentLinkedIds(supabase, normalizedEntityId);
}

export async function resolveTournamentFollowerTournamentId(
    supabase: BrowserSupabaseClient,
    entityId: string,
    preferredTournamentId?: string | null,
): Promise<string | null> {
    const preferredId = normalizeEntityId(preferredTournamentId ?? '');
    if (preferredId && isUuid(preferredId)) {
        return preferredId;
    }

    const normalizedEntityId = normalizeEntityId(entityId);
    if (!normalizedEntityId) {
        return null;
    }

    if (isUuid(normalizedEntityId)) {
        return normalizedEntityId;
    }

    const linkedIds = await resolveTournamentLinkedIds(supabase, normalizedEntityId);
    return linkedIds.find(isUuid) ?? null;
}
