'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { getTournamentById } from '@/lib/data/tournaments';
import { EntityType } from '@/lib/types/user';
import {
    buildClubCandidateIds,
    buildTournamentCandidateIds,
    clearFavoritesLocalCache,
    FAVORITES_LOCAL_CACHE_KEY,
    FAVORITES_LOCAL_CACHE_OWNER_KEY,
    fetchResolvedFavorites,
    sanitizeResolvedFavorites,
    type ResolvedFavorite,
} from '@/lib/favorites/fetchFavorites';
import { clearFavoritesCache, updateFavoriteSet } from '@/lib/favoritesCache';
import { dispatchFavoriteUpdated, FAVORITES_UPDATED_EVENT, type FavoriteUpdatedDetail } from '@/lib/favorites/events';
import { beginClientRequest, usePerfComponentLifecycle } from '@/lib/perf/react';
import { measureAsync, warnIfDuplicateWindow } from '@/lib/perf/measure';

export type FavoriteItem = ResolvedFavorite;

const LS_KEY = FAVORITES_LOCAL_CACHE_KEY;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type ToggleLeagueFavoriteOptions = {
    name?: string;
    logo_url?: string | null;
    color?: string | null;
    type_label?: string;
    followerTournamentId?: string | null;
    sportId?: string | null;
};

type MutationResult = PromiseLike<{ error?: unknown; data?: Array<{ sort_order?: number }> | null }>;
type DeleteChain = {
    eq: (column: string, value: unknown) => DeleteChain;
    in: (column: string, values: string[]) => MutationResult;
};
type SelectChain = {
    eq: (column: string, value: unknown) => SelectChain;
    order: (column: string, options: { ascending: boolean }) => SelectChain;
    limit: (count: number) => MutationResult;
};
type MutationTableClient = {
    upsert: (values: unknown, options?: unknown) => MutationResult;
    delete: () => DeleteChain;
    select: (columns: string) => SelectChain;
};
type MutationFromClient = {
    from: (table: string) => MutationTableClient;
};

type FavoritePersistenceMutation = {
    entityId: string;
    entityType: EntityType;
    isFavorite: boolean;
};
type LeaguePreferencePersistenceMutation = {
    leagueId: string;
    isFavorite: boolean;
    sportId?: string | null;
};
type TournamentFollowPersistenceMutation = {
    tournamentId: string;
    isFavorite: boolean;
};

const PENDING_FAVORITE_NAME = 'Pendiente de sincronizar';

function readLS(userId?: string | null): FavoriteItem[] {
    try {
        if (typeof window === 'undefined') return [];
        const expectedOwner = typeof userId === 'string' ? userId.trim() : '';
        const cachedOwner = localStorage.getItem(FAVORITES_LOCAL_CACHE_OWNER_KEY)?.trim() || '';

        if (!expectedOwner || !cachedOwner || cachedOwner !== expectedOwner) {
            return [];
        }

        const raw = localStorage.getItem(LS_KEY);
        return raw ? sanitizeResolvedFavorites(JSON.parse(raw) as FavoriteItem[]) : [];
    } catch {
        return [];
    }
}

function writeLS(userId: string | null | undefined, items: FavoriteItem[]): void {
    try {
        if (typeof window === 'undefined') return;
        const normalizedUserId = typeof userId === 'string' ? userId.trim() : '';
        if (!normalizedUserId) return;
        localStorage.setItem(FAVORITES_LOCAL_CACHE_OWNER_KEY, normalizedUserId);
        localStorage.setItem(LS_KEY, JSON.stringify(items));
    } catch {
        // Ignore localStorage quota errors.
    }
}

function isAbortError(err: unknown): boolean {
    return (
        err instanceof DOMException ||
        (typeof err === 'object' && err !== null && 'name' in err && err.name === 'AbortError') ||
        (typeof err === 'object' &&
            err !== null &&
            'message' in err &&
            typeof err.message === 'string' &&
            err.message.toLowerCase().includes('abort'))
    );
}

function resolveTournamentFollowerId(entityId: string, followerTournamentId?: string | null): string | null {
    const preferredId = String(followerTournamentId ?? '').trim();
    if (preferredId && UUID_RE.test(preferredId)) {
        return preferredId;
    }

    const normalizedEntityId = String(entityId).trim();
    return UUID_RE.test(normalizedEntityId) ? normalizedEntityId : null;
}

function isPendingFavorite(favorite: FavoriteItem): boolean {
    return !favorite.name.trim() || favorite.name === PENDING_FAVORITE_NAME;
}

function normalizeEntityId(value: string): string {
    return String(value).trim();
}

function isCompetitionEntityType(entityType: EntityType): boolean {
    return entityType === 'league' || entityType === 'tournament';
}

function getCompetitionPersistenceTypes(entityType: EntityType): EntityType[] {
    return isCompetitionEntityType(entityType)
        ? ['league', 'tournament']
        : [entityType];
}

function favoriteMatchesEntity(
    favorite: FavoriteItem,
    entityId: string,
    entityType?: EntityType,
): boolean {
    const favoriteFamily = isCompetitionEntityType(favorite.entity_type) ? 'competition' : favorite.entity_type;
    const targetFamily = entityType
        ? (isCompetitionEntityType(entityType) ? 'competition' : entityType)
        : favoriteFamily;

    if (favoriteFamily !== targetFamily) {
        return false;
    }

    const favoriteAliases = favoriteFamily === 'club'
        ? buildClubCandidateIds(favorite.id)
        : favoriteFamily === 'competition'
            ? buildTournamentCandidateIds(favorite.id)
            : [normalizeEntityId(favorite.id)];

    const targetAliases = targetFamily === 'club'
        ? buildClubCandidateIds(entityId)
        : targetFamily === 'competition'
            ? buildTournamentCandidateIds(entityId)
            : [normalizeEntityId(entityId)];

    const favoriteAliasSet = new Set(favoriteAliases.map(normalizeEntityId));
    return targetAliases.some((alias) => favoriteAliasSet.has(normalizeEntityId(alias)));
}

function createOptimisticFavorite(
    entityId: string,
    entityType: EntityType,
    metadata?: Partial<FavoriteItem>,
): FavoriteItem {
    const normalizedEntityType = isCompetitionEntityType(entityType) ? 'league' : entityType;
    const normalizedId = normalizeEntityId(entityId);
    const fallbackName = normalizedEntityType === 'club' ? normalizedId : 'Liga';

    return {
        id: normalizedId,
        entity_type: normalizedEntityType,
        name: metadata?.name?.trim() || fallbackName,
        logo_url: metadata?.logo_url ?? null,
        color: metadata?.color ?? null,
        type_label: metadata?.type_label || (normalizedEntityType === 'club' ? 'Club' : 'Torneo'),
        created_at: metadata?.created_at || new Date().toISOString(),
    };
}

function applyFavoriteMutation(
    prev: FavoriteItem[],
    favorite: FavoriteItem,
    isFavorite: boolean,
): FavoriteItem[] {
    const next = prev.filter((entry) => !favoriteMatchesEntity(entry, favorite.id, favorite.entity_type));

    if (!isFavorite) {
        return next;
    }

    return [favorite, ...next];
}

function readString(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed || null;
}

function readRecord(value: unknown): Record<string, unknown> | null {
    return typeof value === 'object' && value !== null ? value as Record<string, unknown> : null;
}

function getTournamentSportCandidates(entityId: string): string[] {
    const normalized = entityId.trim().toLowerCase();

    if (normalized.startsWith('ras-league-')) {
        return ['rugby'];
    }

    if (normalized.startsWith('espn-league-')) {
        return ['american-football'];
    }

    return ['rugby', 'football', 'basketball', 'hockey', 'american-football', 'volleyball', 'tennis'];
}

async function resolveFavoriteClientSide(favorite: FavoriteItem): Promise<Partial<FavoriteItem> | null> {
    if (favorite.entity_type === 'club') {
        try {
            const request = beginClientRequest(`favorite:${favorite.entity_type}:${favorite.id}:team`, 'client_resolve', {
                hook: 'useFavorites',
            });
            const response = await fetch(`/api/teams?team_id=${encodeURIComponent(favorite.id)}&skip_squad=true`, {
                cache: 'no-store',
            });
            request.end({
                status: response.status,
                error: !response.ok,
            });

            if (!response.ok) return null;

            const payload = await response.json().catch(() => null) as unknown;
            const payloadRecord = readRecord(payload);
            const details = readRecord(payloadRecord?.details);
            const nestedTeam = readRecord(details?.team);

            const name = readString(details?.name) || readString(nestedTeam?.name) || readString(details?.team_name);
            const logoUrl =
                readString(details?.logo_url) ||
                readString(details?.logo) ||
                readString(details?.image_path) ||
                readString(nestedTeam?.logo_url) ||
                readString(nestedTeam?.logo) ||
                readString(nestedTeam?.image_path);

            if (!name) return null;

            return {
                name,
                logo_url: logoUrl,
                type_label: 'Club',
            };
        } catch {
            return null;
        }
    }

    if (favorite.entity_type === 'league' || favorite.entity_type === 'tournament') {
        const tournament = getTournamentById(favorite.id);
        if (tournament) {
            return {
                name: tournament.displayName || tournament.name,
                logo_url: tournament.logoUrl || null,
                type_label: 'Torneo',
            };
        }

        const sportCandidates = getTournamentSportCandidates(favorite.id);

        for (const sport of sportCandidates) {
            try {
                const request = beginClientRequest(`favorite:${favorite.entity_type}:${favorite.id}:tournament:${sport}`, 'client_resolve', {
                    hook: 'useFavorites',
                });
                const response = await fetch(
                    `/api/tournaments?id=${encodeURIComponent(favorite.id)}&sport=${encodeURIComponent(sport)}`,
                    { cache: 'no-store' }
                );
                request.end({
                    status: response.status,
                    error: !response.ok,
                });

                if (!response.ok) {
                    continue;
                }

                const payload = await response.json().catch(() => null) as unknown;
                const payloadRecord = readRecord(payload);
                const details = readRecord(payloadRecord?.details);
                const nestedTournament = readRecord(details?.tournament);

                const name =
                    readString(details?.name) ||
                    readString(nestedTournament?.name) ||
                    readString(payloadRecord?.name);

                const logoUrl =
                    readString(details?.logo_url) ||
                    readString(details?.logo) ||
                    readString(details?.image_path) ||
                    readString(details?.tournament_logo) ||
                    readString(nestedTournament?.logo_url) ||
                    readString(nestedTournament?.logo);

                if (!name) {
                    continue;
                }

                return {
                    name,
                    logo_url: logoUrl,
                    type_label: 'Torneo',
                };
            } catch {
                continue;
            }
        }

        return null;
    }

    return null;
}

function redirectToLogin(): void {
    if (typeof window === 'undefined') return;
    const returnTo = `${window.location.pathname}${window.location.search}`;
    window.location.href = `/login?returnTo=${encodeURIComponent(returnTo)}`;
}

function notifyFavoriteLeaguePreferenceUpdated(leagueId: string, isFavorite: boolean): void {
    if (typeof window === 'undefined') return;

    window.dispatchEvent(new CustomEvent('preferences:favorite-leagues-updated', {
        detail: {
            leagueId,
            isFavorite,
        },
    }));
}

export function useFavorites() {
    usePerfComponentLifecycle('useFavorites', {});
    const [favorites, setFavorites] = useState<FavoriteItem[]>([]);
    const [hasMore, setHasMore] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const supabase = useMemo(() => createClient(), []);
    const supabaseUntyped = supabase as unknown as MutationFromClient;
    const requestIdRef = useRef(0);
    const activeUserIdRef = useRef<string | null>(null);
    const attemptedClientResolutionsRef = useRef<Set<string>>(new Set());
    const favoritesRef = useRef<FavoriteItem[]>([]);
    const favoritePersistenceQueueRef = useRef<Map<string, FavoritePersistenceMutation>>(new Map());
    const leaguePreferenceQueueRef = useRef<Map<string, LeaguePreferencePersistenceMutation>>(new Map());
    const tournamentFollowQueueRef = useRef<Map<string, TournamentFollowPersistenceMutation>>(new Map());
    const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const isFlushingRef = useRef(false);
    const flushPromiseRef = useRef<Promise<void> | null>(null);

    const syncFavoriteMutation = useCallback((
        userId: string,
        entityId: string,
        entityType: EntityType,
        isFavorite: boolean,
        metadata?: Partial<FavoriteItem>,
    ) => {
        clearFavoritesCache(`Favorite updated: ${entityType}:${entityId}`);
        updateFavoriteSet(userId, entityType, entityId, isFavorite);

        if (isCompetitionEntityType(entityType)) {
            updateFavoriteSet(userId, 'league', entityId, isFavorite);
            updateFavoriteSet(userId, 'tournament', entityId, isFavorite);
        }

        dispatchFavoriteUpdated({
            userId,
            entityId,
            entityType,
            isFavorite,
            name: metadata?.name,
            logo_url: metadata?.logo_url,
            color: metadata?.color,
            type_label: metadata?.type_label,
            created_at: metadata?.created_at,
        });
    }, []);

    useEffect(() => {
        favoritesRef.current = favorites;
    }, [favorites]);

    const flushPersistenceQueues = useCallback(() => {
        if (flushPromiseRef.current) {
            return flushPromiseRef.current;
        }

        if (flushTimerRef.current !== null) {
            clearTimeout(flushTimerRef.current);
            flushTimerRef.current = null;
        }

        const favoriteMutations = Array.from(favoritePersistenceQueueRef.current.values());
        const leaguePreferenceMutations = Array.from(leaguePreferenceQueueRef.current.values());
        const tournamentFollowMutations = Array.from(tournamentFollowQueueRef.current.values());

        if (
            favoriteMutations.length === 0 &&
            leaguePreferenceMutations.length === 0 &&
            tournamentFollowMutations.length === 0
        ) {
            return Promise.resolve();
        }

        favoritePersistenceQueueRef.current.clear();
        leaguePreferenceQueueRef.current.clear();
        tournamentFollowQueueRef.current.clear();
        isFlushingRef.current = true;

        const flushPromise = (async () => {
            try {
                let userId = activeUserIdRef.current?.trim() || '';
                if (!userId) {
                    const { data: { session } } = await supabase.auth.getSession();
                    userId = session?.user?.id?.trim() || '';
                    if (userId) {
                        activeUserIdRef.current = userId;
                    }
                }

                if (!userId) {
                    return;
                }

                const tasks: Array<PromiseLike<unknown>> = [];

                const favoriteAdds = favoriteMutations.filter((mutation) => mutation.isFavorite);
                const favoriteRemovals = favoriteMutations.filter((mutation) => !mutation.isFavorite);

                if (favoriteAdds.length > 0) {
                    tasks.push(
                        supabaseUntyped
                            .from('favorites')
                            .upsert(
                                favoriteAdds.map((mutation) => ({
                                    user_id: userId,
                                    entity_type: mutation.entityType,
                                    entity_id: mutation.entityId,
                                })),
                                { onConflict: 'user_id,entity_type,entity_id' },
                            ),
                    );
                }

                const favoriteRemovalGroups = new Map<EntityType, Set<string>>();

                favoriteRemovals.forEach((mutation) => {
                    getCompetitionPersistenceTypes(mutation.entityType).forEach((persistedType) => {
                        const currentIds = favoriteRemovalGroups.get(persistedType) ?? new Set<string>();
                        currentIds.add(mutation.entityId);
                        favoriteRemovalGroups.set(persistedType, currentIds);
                    });
                });

                favoriteRemovalGroups.forEach((entityIds, entityType) => {
                    if (entityIds.size === 0) return;

                    tasks.push(
                        supabaseUntyped
                            .from('favorites')
                            .delete()
                            .eq('user_id', userId)
                            .eq('entity_type', entityType)
                            .in('entity_id', Array.from(entityIds)),
                    );
                });

                const leaguePreferenceAdds = leaguePreferenceMutations.filter((mutation) => mutation.isFavorite && mutation.sportId?.trim());
                const leaguePreferenceRemovals = leaguePreferenceMutations.filter((mutation) => !mutation.isFavorite);

                if (leaguePreferenceRemovals.length > 0) {
                    tasks.push(
                        supabaseUntyped
                            .from('user_favorite_leagues')
                            .delete()
                            .eq('user_id', userId)
                            .in('league_id', leaguePreferenceRemovals.map((mutation) => mutation.leagueId)),
                    );
                }

                if (leaguePreferenceAdds.length > 0) {
                    const { data: existingRows, error: existingError } = await supabaseUntyped
                        .from('user_favorite_leagues')
                        .select('sort_order')
                        .eq('user_id', userId)
                        .order('sort_order', { ascending: false })
                        .limit(1);

                    if (existingError) {
                        throw existingError;
                    }

                    const highestSortOrder = existingRows?.[0]?.sort_order;
                    const baseSortOrder = typeof highestSortOrder === 'number' ? highestSortOrder + 1 : 0;

                    tasks.push(
                        supabaseUntyped
                            .from('user_favorite_leagues')
                            .upsert(
                                leaguePreferenceAdds.map((mutation, index) => ({
                                    user_id: userId,
                                    league_id: mutation.leagueId,
                                    sport_id: mutation.sportId!.trim(),
                                    sort_order: baseSortOrder + index,
                                })),
                                { onConflict: 'user_id,league_id' },
                            ),
                    );
                }

                const tournamentFollowAdds = tournamentFollowMutations.filter((mutation) => mutation.isFavorite);
                const tournamentFollowRemovals = tournamentFollowMutations.filter((mutation) => !mutation.isFavorite);

                if (tournamentFollowAdds.length > 0) {
                    tasks.push(
                        supabaseUntyped
                            .from('tournament_followers')
                            .upsert(
                                tournamentFollowAdds.map((mutation) => ({
                                    user_id: userId,
                                    tournament_id: mutation.tournamentId,
                                })),
                                { onConflict: 'user_id,tournament_id' },
                            ),
                    );
                }

                if (tournamentFollowRemovals.length > 0) {
                    tasks.push(
                        supabaseUntyped
                            .from('tournament_followers')
                            .delete()
                            .eq('user_id', userId)
                            .in('tournament_id', tournamentFollowRemovals.map((mutation) => mutation.tournamentId)),
                    );
                }

                const results = await Promise.all(tasks);
                const failed = results.find((result) => {
                    if (typeof result !== 'object' || result === null) return false;
                    return 'error' in result && Boolean((result as { error?: unknown }).error);
                });

                if (failed && typeof failed === 'object' && failed !== null && 'error' in failed) {
                    throw (failed as { error?: unknown }).error;
                }
            } catch (error) {
                console.error('Error flushing favorites persistence queue:', error);

                favoriteMutations.forEach((mutation) => {
                    favoritePersistenceQueueRef.current.set(`${mutation.entityType}:${mutation.entityId}`, mutation);
                });
                leaguePreferenceMutations.forEach((mutation) => {
                    leaguePreferenceQueueRef.current.set(mutation.leagueId, mutation);
                });
                tournamentFollowMutations.forEach((mutation) => {
                    tournamentFollowQueueRef.current.set(mutation.tournamentId, mutation);
                });

                throw error;
            } finally {
                isFlushingRef.current = false;
                flushPromiseRef.current = null;

                if (
                    favoritePersistenceQueueRef.current.size > 0 ||
                    leaguePreferenceQueueRef.current.size > 0 ||
                    tournamentFollowQueueRef.current.size > 0
                ) {
                    flushTimerRef.current = setTimeout(() => {
                        flushTimerRef.current = null;
                        void flushPersistenceQueues().catch(() => {
                            // The queue is preserved on failure and can retry later.
                        });
                    }, 400);
                }
            }
        })();

        flushPromiseRef.current = flushPromise;
        return flushPromise;
    }, [supabase, supabaseUntyped]);

    const flushAllPersistenceQueues = useCallback(async () => {
        while (
            flushPromiseRef.current !== null ||
            favoritePersistenceQueueRef.current.size > 0 ||
            leaguePreferenceQueueRef.current.size > 0 ||
            tournamentFollowQueueRef.current.size > 0
        ) {
            await flushPersistenceQueues();
        }
    }, [flushPersistenceQueues]);

    const persistFavoriteState = useCallback(async (
        userId: string,
        entityId: string,
        entityType: EntityType,
        isFavorite: boolean,
    ) => {
        const normalizedEntityId = normalizeEntityId(entityId);
        const normalizedEntityType = isCompetitionEntityType(entityType) ? 'league' : entityType;
        const aliasIds = normalizedEntityType === 'club'
            ? buildClubCandidateIds(normalizedEntityId)
            : isCompetitionEntityType(entityType)
                ? buildTournamentCandidateIds(normalizedEntityId)
                : [normalizedEntityId];

        if (isFavorite) {
            const { error: upsertError } = await supabaseUntyped
                .from('favorites')
                .upsert({
                    user_id: userId,
                    entity_type: normalizedEntityType,
                    entity_id: normalizedEntityId,
                }, { onConflict: 'user_id,entity_type,entity_id' });

            if (upsertError) {
                throw upsertError;
            }

            if (isCompetitionEntityType(entityType)) {
                const { error: cleanupError } = await supabaseUntyped
                    .from('favorites')
                    .delete()
                    .eq('user_id', userId)
                    .eq('entity_type', 'tournament')
                    .in('entity_id', [normalizedEntityId]);

                if (cleanupError) {
                    throw cleanupError;
                }
            }

            return;
        }

        const persistedTypes = isCompetitionEntityType(entityType)
            ? ['league', 'tournament']
            : [normalizedEntityType];

        const deletionTasks = persistedTypes.map((persistedType) => (
            supabaseUntyped
                .from('favorites')
                .delete()
                .eq('user_id', userId)
                .eq('entity_type', persistedType)
                .in('entity_id', aliasIds)
        ));

        const deletionResults = await Promise.all(deletionTasks);
        const deletionFailure = deletionResults.find((result) => result?.error);
        if (deletionFailure?.error) {
            throw deletionFailure.error;
        }
    }, [supabaseUntyped]);

    const persistLeaguePreferenceState = useCallback(async (
        userId: string,
        entityId: string,
        shouldFollow: boolean,
        sportId?: string | null,
    ) => {
        const leagueId = normalizeEntityId(entityId);
        if (!leagueId) return;

        if (!shouldFollow) {
            const { error } = await supabaseUntyped
                .from('user_favorite_leagues')
                .delete()
                .eq('user_id', userId)
                .in('league_id', [leagueId]);

            if (error) {
                throw error;
            }

            return;
        }

        const normalizedSportId = typeof sportId === 'string' ? sportId.trim() : '';
        if (!normalizedSportId) return;

        const { data: existingRows, error: existingError } = await supabaseUntyped
            .from('user_favorite_leagues')
            .select('sort_order')
            .eq('user_id', userId)
            .order('sort_order', { ascending: false })
            .limit(1);

        if (existingError) {
            throw existingError;
        }

        const highestSortOrder = existingRows?.[0]?.sort_order;
        const nextSortOrder = typeof highestSortOrder === 'number' ? highestSortOrder + 1 : 0;

        const { error: upsertError } = await supabaseUntyped
            .from('user_favorite_leagues')
            .upsert({
                user_id: userId,
                league_id: leagueId,
                sport_id: normalizedSportId,
                sort_order: nextSortOrder,
            }, { onConflict: 'user_id,league_id' });

        if (upsertError) {
            throw upsertError;
        }
    }, [supabaseUntyped]);

    const persistTournamentFollowState = useCallback(async (
        userId: string,
        entityId: string,
        shouldFollow: boolean,
        followerTournamentId?: string | null,
    ) => {
        const tournamentId = resolveTournamentFollowerId(entityId, followerTournamentId);
        if (!tournamentId) return;

        if (shouldFollow) {
            const { error } = await supabaseUntyped
                .from('tournament_followers')
                .upsert({
                    user_id: userId,
                    tournament_id: tournamentId,
                }, { onConflict: 'user_id,tournament_id' });

            if (error) {
                throw error;
            }

            return;
        }

        const { error } = await supabaseUntyped
            .from('tournament_followers')
            .delete()
            .eq('user_id', userId)
            .in('tournament_id', [tournamentId]);

        if (error) {
            throw error;
        }
    }, [supabaseUntyped]);

    useEffect(() => {
        const pendingFavorites = favorites.filter((favorite) => (
            isPendingFavorite(favorite) &&
            !attemptedClientResolutionsRef.current.has(`${favorite.entity_type}:${favorite.id}`)
        ));

        if (pendingFavorites.length === 0) return;

        pendingFavorites.forEach((favorite) => {
            attemptedClientResolutionsRef.current.add(`${favorite.entity_type}:${favorite.id}`);
        });

        let cancelled = false;

        void (async () => {
            const resolvedEntries = await Promise.all(pendingFavorites.map(async (favorite) => ({
                favorite,
                patch: await resolveFavoriteClientSide(favorite),
            })));

            if (cancelled) return;

            const resolvedMap = new Map(
                resolvedEntries
                    .filter((entry): entry is { favorite: FavoriteItem; patch: Partial<FavoriteItem> } => Boolean(entry.patch?.name))
                    .map((entry) => [`${entry.favorite.entity_type}:${entry.favorite.id}`, entry.patch])
            );

            if (resolvedMap.size === 0) return;

            setFavorites((prev) => {
                const next = prev.map((favorite) => {
                    const patch = resolvedMap.get(`${favorite.entity_type}:${favorite.id}`);
                    return patch ? { ...favorite, ...patch } : favorite;
                });
                writeLS(activeUserIdRef.current, next);
                return next;
            });
        })();

        return () => {
            cancelled = true;
        };
    }, [favorites]);

    const fetchFavorites = useCallback(async () => {
        const myId = ++requestIdRef.current;
        warnIfDuplicateWindow(
            'useFavorites:fetchFavorites',
            ['FETCH'],
            {
                key: 'favorites:resolved',
                trigger: 'hook_refresh',
            },
            'client',
            {
                windowMs: 2000,
                warnAfterCount: 2,
            },
        );
        setLoading(true);
        setError(null);

        try {
            await flushAllPersistenceQueues();

            const { data: { session }, error: sessionErr } = await measureAsync(
                'favorites_get_session',
                async () => supabase.auth.getSession(),
                {
                    runtime: 'client',
                    tags: ['AUTH'],
                    metadata: {
                        step: 'favorites_get_session',
                    },
                },
            );
            if (myId !== requestIdRef.current) return;

            if (sessionErr || !session) {
                activeUserIdRef.current = null;
                clearFavoritesLocalCache();
                setFavorites([]);
                setHasMore(false);
                return;
            }

            activeUserIdRef.current = session.user.id;

            const cached = readLS(session.user.id);
            if (cached.length > 0) {
                setFavorites(cached);
            }

            const favoritesRequest = beginClientRequest('favorites:resolved', 'hook_refresh', {
                hook: 'useFavorites',
            });
            const t0 = performance.now();
            const items = await fetchResolvedFavorites(supabase, session.user.id);
            const t1 = performance.now();
            favoritesRequest.end({
                rows: items.length,
                error: false,
            });

            if (myId !== requestIdRef.current) return;

            console.table({
                'favorites ms': (t1 - t0).toFixed(1),
                rows: items.length,
                err: '',
            });

            setFavorites(items);
            writeLS(session.user.id, items);
            setHasMore(false);
        } catch (err: unknown) {
            if (myId !== requestIdRef.current) return;
            if (!isAbortError(err)) {
                console.error('useFavorites error:', err);
                setError(err instanceof Error ? err.message : 'Error inesperado');
            }
        } finally {
            if (myId === requestIdRef.current) {
                setLoading(false);
            }
        }
    }, [flushAllPersistenceQueues, supabase]);

    useEffect(() => {
        fetchFavorites();

        const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
            if (event === 'SIGNED_IN' || event === 'USER_UPDATED') {
                fetchFavorites();
            } else if (event === 'SIGNED_OUT') {
                requestIdRef.current++;
                activeUserIdRef.current = null;
                setFavorites([]);
                clearFavoritesLocalCache();
                setHasMore(false);
                setLoading(false);
                setError(null);
            }
        });

        return () => subscription.unsubscribe();
    }, [fetchFavorites, supabase]);

    useEffect(() => {
        if (typeof window === 'undefined') return undefined;

        const handleFavoriteUpdated = (event: Event) => {
            const detail = (event as CustomEvent<FavoriteUpdatedDetail>).detail;
            const eventUserId = typeof detail?.userId === 'string' ? detail.userId.trim() : '';
            const activeUserId = activeUserIdRef.current?.trim() || '';

            if (eventUserId && activeUserId && eventUserId !== activeUserId) {
                return;
            }

            const optimisticFavorite = createOptimisticFavorite(detail.entityId, detail.entityType, {
                name: detail.name,
                logo_url: detail.logo_url,
                color: detail.color,
                type_label: detail.type_label,
                created_at: detail.created_at,
            });

            setFavorites((prev) => {
                const next = applyFavoriteMutation(prev, optimisticFavorite, detail.isFavorite);
                writeLS(activeUserIdRef.current, next);
                return next;
            });
        };

        window.addEventListener(FAVORITES_UPDATED_EVENT, handleFavoriteUpdated);
        return () => window.removeEventListener(FAVORITES_UPDATED_EVENT, handleFavoriteUpdated);
    }, []);

    const isFavorite = useCallback(
        (entityId: string, entityType?: EntityType) => favorites.some((favorite) => (
            favoriteMatchesEntity(favorite, entityId, entityType)
        )),
        [favorites],
    );

    const toggleFavorite = useCallback(async (item: Omit<FavoriteItem, 'created_at'>) => {
        const { id, entity_type } = item;
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();

        if (sessionError) {
            console.error('Error checking session before toggling favorite:', sessionError);
        }

        if (!session) {
            redirectToLogin();
            return;
        }

        activeUserIdRef.current = session.user.id;
        const willBeFavorite = !favoritesRef.current.some((favorite) => favoriteMatchesEntity(favorite, String(id), entity_type));
        const optimisticFavorite = createOptimisticFavorite(String(id), entity_type, item);

        setFavorites((prev) => {
            const next = applyFavoriteMutation(prev, optimisticFavorite, willBeFavorite);
            favoritesRef.current = next;
            writeLS(activeUserIdRef.current, next);
            return next;
        });

        syncFavoriteMutation(session.user.id, String(id), entity_type, willBeFavorite, optimisticFavorite);

        try {
            await persistFavoriteState(session.user.id, String(id), entity_type, willBeFavorite);
            clearFavoritesCache(`Favorite persisted: ${entity_type}:${id}`);
        } catch (err) {
            console.error('Error toggling favorite:', err);
            setError('No se pudo actualizar el favorito.');
            setFavorites((prev) => {
                const next = applyFavoriteMutation(prev, optimisticFavorite, !willBeFavorite);
                favoritesRef.current = next;
                writeLS(activeUserIdRef.current, next);
                return next;
            });
            syncFavoriteMutation(session.user.id, String(id), entity_type, !willBeFavorite, optimisticFavorite);
        }
    }, [persistFavoriteState, supabase, syncFavoriteMutation]);

    const isLeagueFavorite = useCallback(
        (entityId: string) => favorites.some((favorite) => (
            favoriteMatchesEntity(favorite, entityId, 'league')
        )),
        [favorites],
    );

    const removeLeagueFavoriteEntries = useCallback(async (
        userId: string,
        entityId: string,
        entityTypes: EntityType[],
    ) => {
        if (entityTypes.length === 0) return;

        const optimisticFavorites = entityTypes.map((entityType) => createOptimisticFavorite(entityId, entityType));

        setFavorites((prev) => {
            const next = prev.filter((favorite) => !(favoriteMatchesEntity(favorite, entityId) && entityTypes.includes(favorite.entity_type)));
            favoritesRef.current = next;
            writeLS(activeUserIdRef.current, next);
            return next;
        });

        optimisticFavorites.forEach((favorite) => {
            syncFavoriteMutation(userId, favorite.id, favorite.entity_type, false, favorite);
        });

        try {
            await persistFavoriteState(userId, entityId, 'league', false);
            clearFavoritesCache(`League favorite removed: ${entityId}`);
        } catch (err) {
            console.error('Error removing league favorite entries:', err);
            setError('No se pudo quitar la liga de favoritos.');
            setFavorites((prev) => {
                const next = optimisticFavorites.reduce<FavoriteItem[]>((acc, favorite) => (
                    applyFavoriteMutation(acc, favorite, true)
                ), prev);
                favoritesRef.current = next;
                writeLS(activeUserIdRef.current, next);
                return next;
            });
            optimisticFavorites.forEach((favorite) => {
                syncFavoriteMutation(userId, favorite.id, favorite.entity_type, true, favorite);
            });
        }
    }, [persistFavoriteState, syncFavoriteMutation]);

    const ensureTournamentFollowState = useCallback(async (
        userId: string,
        entityId: string,
        shouldFollow: boolean,
        followerTournamentId?: string | null,
    ) => {
        await persistTournamentFollowState(userId, entityId, shouldFollow, followerTournamentId);
    }, [persistTournamentFollowState]);

    const syncFavoriteLeaguePreference = useCallback(async (
        userId: string,
        entityId: string,
        shouldFollow: boolean,
        sportId?: string | null,
    ) => {
        const leagueId = String(entityId).trim();
        if (!leagueId) return;
        notifyFavoriteLeaguePreferenceUpdated(leagueId, shouldFollow);
        await persistLeaguePreferenceState(userId, leagueId, shouldFollow, sportId);
    }, [persistLeaguePreferenceState]);

    const toggleLeagueFavorite = useCallback(async (
        entityId: string,
        nameOrOptions?: string | ToggleLeagueFavoriteOptions,
    ) => {
        const options = typeof nameOrOptions === 'string'
            ? { name: nameOrOptions }
            : nameOrOptions;

        try {
            const { data: { session }, error: sessionError } = await supabase.auth.getSession();

            if (sessionError) {
                console.error('Error checking session before toggling tournament follow:', sessionError);
            }

            if (!session) {
                redirectToLogin();
                return;
            }

            const existingFavoriteTypes = Array.from(new Set(
                favoritesRef.current
                    .filter((favorite) => (
                        favoriteMatchesEntity(favorite, entityId) &&
                        ['league', 'tournament'].includes(favorite.entity_type)
                    ))
                    .map((favorite) => favorite.entity_type)
            )) as EntityType[];

            const shouldFollow = existingFavoriteTypes.length === 0;

            if (shouldFollow) {
                await toggleFavorite({
                    id: entityId,
                    entity_type: 'league',
                    name: options?.name ?? 'Liga',
                    logo_url: options?.logo_url ?? null,
                    color: options?.color ?? null,
                    type_label: options?.type_label ?? 'Torneo',
                });
            } else {
                await removeLeagueFavoriteEntries(session.user.id, entityId, existingFavoriteTypes);
            }

            if (shouldFollow) {
                await Promise.all([
                    syncFavoriteLeaguePreference(
                        session.user.id,
                        entityId,
                        shouldFollow,
                        options?.sportId,
                    ),
                    ensureTournamentFollowState(
                        session.user.id,
                        entityId,
                        shouldFollow,
                        options?.followerTournamentId,
                    ),
                ]);
            } else {
                await Promise.all([
                    syncFavoriteLeaguePreference(
                        session.user.id,
                        entityId,
                        shouldFollow,
                        options?.sportId,
                    ),
                    ensureTournamentFollowState(
                        session.user.id,
                        entityId,
                        shouldFollow,
                        options?.followerTournamentId,
                    ),
                ]);
            }
        } catch (err) {
            console.error('Error toggling league favorite:', err);
            setError('No se pudo actualizar la liga favorita.');
        }
    }, [
        ensureTournamentFollowState,
        removeLeagueFavoriteEntries,
        supabase,
        syncFavoriteLeaguePreference,
        toggleFavorite,
    ]);

    const loadMore = useCallback(() => {
        // No-op for now. The API remains for compatibility with the page component.
    }, []);

    return {
        favorites,
        hasMore,
        loading,
        error,
        isFavorite,
        toggleFavorite,
        isLeagueFavorite,
        toggleLeagueFavorite,
        loadMore,
        refresh: fetchFavorites,
    };
}

export function useFavorite(entityType: EntityType, entityId: string) {
    const { loading, isFavorite, toggleFavorite } = useFavorites();

    const toggle = useCallback((metadata?: {
        name?: string;
        logo_url?: string | null;
        color?: string | null;
        type_label?: string;
    }) => {
        toggleFavorite({
            id: entityId,
            entity_type: entityType,
            name: metadata?.name ?? entityId,
            logo_url: metadata?.logo_url,
            color: metadata?.color,
            type_label: metadata?.type_label ?? entityType,
        });
    }, [entityId, entityType, toggleFavorite]);

    return { isFavorited: isFavorite(entityId, entityType), loading, toggle };
}
