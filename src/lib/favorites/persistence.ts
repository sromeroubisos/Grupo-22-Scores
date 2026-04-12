import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import type { EntityType } from '@/lib/types/user';
import { buildClubCandidateIds, buildTournamentCandidateIds } from '@/lib/favorites/fetchFavorites';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type BrowserSupabaseClient = SupabaseClient<Database>;
type PersistedFavoriteEntityType = 'club' | 'team' | 'league' | 'tournament' | 'player';

function normalizeEntityId(value: string): string {
    return String(value).trim();
}

function isUuid(value: string): boolean {
    return UUID_RE.test(value.trim());
}

function isCompetitionEntityType(entityType: EntityType): boolean {
    return entityType === 'league' || entityType === 'tournament';
}

function isClubEntityType(entityType: EntityType): boolean {
    return entityType === 'club' || entityType === 'team';
}

function uniqueNormalizedIds(values: Array<string | null | undefined>): string[] {
    return Array.from(new Set(
        values
            .map((value) => (typeof value === 'string' ? value.trim() : ''))
            .filter(Boolean)
    ));
}

function getPersistedEntityTypes(entityType: EntityType): PersistedFavoriteEntityType[] {
    if (isCompetitionEntityType(entityType)) {
        return ['league', 'tournament'];
    }

    if (isClubEntityType(entityType)) {
        return ['club', 'team'];
    }

    return [entityType];
}

async function resolveClubLinkedIds(
    supabase: BrowserSupabaseClient,
    entityId: string,
): Promise<string[]> {
    const aliasIds = buildClubCandidateIds(entityId);

    if (aliasIds.length === 0) {
        return [entityId];
    }

    const [byIdRes, byExternalIdRes] = await Promise.all([
        supabase
            .from('clubs')
            .select('id, external_id')
            .in('id', aliasIds),
        supabase
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

async function resolveLinkedFavoriteIds(
    supabase: BrowserSupabaseClient,
    entityId: string,
    entityType: EntityType,
): Promise<string[]> {
    if (isClubEntityType(entityType)) {
        return resolveClubLinkedIds(supabase, entityId);
    }

    if (isCompetitionEntityType(entityType)) {
        return resolveTournamentLinkedIds(supabase, entityId);
    }

    return [entityId];
}

export async function persistFavoriteState(
    supabase: BrowserSupabaseClient,
    userId: string,
    entityId: string,
    entityType: EntityType,
    isFavorite: boolean,
): Promise<void> {
    const normalizedEntityId = normalizeEntityId(entityId);
    if (!normalizedEntityId) {
        return;
    }

    const normalizedEntityType: EntityType = isCompetitionEntityType(entityType)
        ? 'league'
        : isClubEntityType(entityType)
            ? 'club'
            : entityType;

    const persistedEntityTypes = getPersistedEntityTypes(entityType);
    const relatedEntityIds = uniqueNormalizedIds([
        normalizedEntityId,
        ...(await resolveLinkedFavoriteIds(supabase, normalizedEntityId, entityType)),
    ]);

    const deleteResults = await Promise.all(
        persistedEntityTypes.map((persistedType) => (
            supabase
                .from('favorites')
                .delete()
                .eq('user_id', userId)
                .eq('entity_type', persistedType)
                .in('entity_id', relatedEntityIds)
        ))
    );

    const deletionFailure = deleteResults.find((result) => result.error);
    if (deletionFailure?.error) {
        throw deletionFailure.error;
    }

    if (!isFavorite) {
        return;
    }

    const { error: upsertError } = await supabase
        .from('favorites')
        .upsert({
            user_id: userId,
            entity_type: normalizedEntityType,
            entity_id: normalizedEntityId,
        }, { onConflict: 'user_id,entity_type,entity_id' });

    if (upsertError) {
        throw upsertError;
    }
}
