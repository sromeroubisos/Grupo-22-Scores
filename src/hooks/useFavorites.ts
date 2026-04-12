'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
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
import { persistFavoriteState as persistFavoriteStateToSupabase } from '@/lib/favorites/persistence';
import { clearFavoritesCache, updateFavoriteSet } from '@/lib/favoritesCache';
import { dispatchFavoriteUpdated, FAVORITES_UPDATED_EVENT, type FavoriteUpdatedDetail } from '@/lib/favorites/events';
import { beginClientRequest, usePerfComponentLifecycle } from '@/lib/perf/react';
import { measureAsync, warnIfDuplicateWindow } from '@/lib/perf/measure';

export type FavoriteItem = ResolvedFavorite;

const LS_KEY = FAVORITES_LOCAL_CACHE_KEY;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FAVORITES_SESSION_TIMEOUT_MS = 8000;
const FAVORITES_FETCH_TIMEOUT_MS = 12000;
const FAVORITES_PENDING_QUEUE_KEY = 'g22_favorites_pending_queue_v1';
let staticTournamentModulePromise: Promise<typeof import('@/lib/data/tournaments')> | null = null;

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

type SerializedPersistenceQueue = {
    userId: string;
    favorites: FavoritePersistenceMutation[];
    leaguePreferences: LeaguePreferencePersistenceMutation[];
    tournamentFollows: TournamentFollowPersistenceMutation[];
};

const PENDING_FAVORITE_NAME = 'Pendiente de sincronizar';

function getDefaultFavoriteName(entityType: EntityType, entityId: string): string {
    if (entityType === 'club') return entityId;
    if (entityType === 'league' || entityType === 'tournament') return 'Liga';
    if (entityType === 'player') return 'Jugador';
    if (entityType === 'team') return 'Equipo';
    if (entityType === 'match') return 'Partido';
    return 'Favorito';
}

function getDefaultFavoriteTypeLabel(entityType: EntityType): string {
    if (entityType === 'club') return 'Club';
    if (entityType === 'league' || entityType === 'tournament') return 'Torneo';
    if (entityType === 'player') return 'Jugador';
    if (entityType === 'team') return 'Equipo';
    if (entityType === 'match') return 'Partido';
    return 'Favorito';
}

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

function isTimeoutError(err: unknown): boolean {
    return (
        err instanceof Error &&
        err.message.toLowerCase().includes('timeout')
    );
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const timeoutPromise = new Promise<T>((_, reject) => {
        timeoutId = setTimeout(() => {
            reject(new Error(`[${label}] timeout after ${timeoutMs}ms`));
        }, timeoutMs);
    });

    return Promise.race([promise, timeoutPromise]).finally(() => {
        if (timeoutId !== undefined) {
            clearTimeout(timeoutId);
        }
    });
}

async function getStaticTournamentById(id: string) {
    try {
        staticTournamentModulePromise ??= import('@/lib/data/tournaments');
        const tournamentsModule = await staticTournamentModulePromise;
        return tournamentsModule.getTournamentById(id);
    } catch {
        staticTournamentModulePromise = null;
        return undefined;
    }
}

function readPendingPersistenceQueue(userId?: string | null): SerializedPersistenceQueue | null {
    try {
        if (typeof window === 'undefined') return null;
        const expectedUserId = typeof userId === 'string' ? userId.trim() : '';
        if (!expectedUserId) return null;

        const raw = window.localStorage.getItem(FAVORITES_PENDING_QUEUE_KEY);
        if (!raw) return null;

        const parsed = JSON.parse(raw) as Partial<SerializedPersistenceQueue>;
        if (typeof parsed?.userId !== 'string' || parsed.userId.trim() !== expectedUserId) {
            return null;
        }

        return {
            userId: parsed.userId.trim(),
            favorites: Array.isArray(parsed.favorites) ? parsed.favorites : [],
            leaguePreferences: Array.isArray(parsed.leaguePreferences) ? parsed.leaguePreferences : [],
            tournamentFollows: Array.isArray(parsed.tournamentFollows) ? parsed.tournamentFollows : [],
        };
    } catch {
        return null;
    }
}

function writePendingPersistenceQueue(queue: SerializedPersistenceQueue | null): void {
    try {
        if (typeof window === 'undefined') return;

        if (!queue || !queue.userId.trim()) {
            window.localStorage.removeItem(FAVORITES_PENDING_QUEUE_KEY);
            return;
        }

        const hasItems =
            queue.favorites.length > 0 ||
            queue.leaguePreferences.length > 0 ||
            queue.tournamentFollows.length > 0;

        if (!hasItems) {
            window.localStorage.removeItem(FAVORITES_PENDING_QUEUE_KEY);
            return;
        }

        window.localStorage.setItem(FAVORITES_PENDING_QUEUE_KEY, JSON.stringify(queue));
    } catch {
        // Ignore localStorage quota errors.
    }
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

function normalizeOptionalString(value: string | null | undefined): string | null {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed || null;
}

function favoriteMutationKey(mutation: FavoritePersistenceMutation): string {
    return `${mutation.entityType}:${normalizeEntityId(mutation.entityId)}`;
}

function favoriteMutationsMatch(
    current: FavoritePersistenceMutation | undefined,
    persisted: FavoritePersistenceMutation,
): boolean {
    return Boolean(current)
        && current!.entityType === persisted.entityType
        && normalizeEntityId(current!.entityId) === normalizeEntityId(persisted.entityId)
        && current!.isFavorite === persisted.isFavorite;
}

function leaguePreferenceMutationsMatch(
    current: LeaguePreferencePersistenceMutation | undefined,
    persisted: LeaguePreferencePersistenceMutation,
): boolean {
    return Boolean(current)
        && normalizeEntityId(current!.leagueId) === normalizeEntityId(persisted.leagueId)
        && current!.isFavorite === persisted.isFavorite
        && normalizeOptionalString(current!.sportId) === normalizeOptionalString(persisted.sportId);
}

function tournamentFollowMutationsMatch(
    current: TournamentFollowPersistenceMutation | undefined,
    persisted: TournamentFollowPersistenceMutation,
): boolean {
    return Boolean(current)
        && normalizeEntityId(current!.tournamentId) === normalizeEntityId(persisted.tournamentId)
        && current!.isFavorite === persisted.isFavorite;
}

function isCompetitionEntityType(entityType: EntityType): boolean {
    return entityType === 'league' || entityType === 'tournament';
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
    const fallbackName = getDefaultFavoriteName(normalizedEntityType, normalizedId);

    return {
        id: normalizedId,
        entity_type: normalizedEntityType,
        name: metadata?.name?.trim() || fallbackName,
        logo_url: metadata?.logo_url ?? null,
        color: metadata?.color ?? null,
        type_label: metadata?.type_label || getDefaultFavoriteTypeLabel(normalizedEntityType),
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
        const tournament = await getStaticTournamentById(favorite.id);
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

    if (favorite.entity_type === 'player') {
        try {
            const request = beginClientRequest(`favorite:${favorite.entity_type}:${favorite.id}:player`, 'client_resolve', {
                hook: 'useFavorites',
            });
            const response = await fetch(`/api/players?player_id=${encodeURIComponent(favorite.id)}`, {
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
            const name =
                readString(details?.name) ||
                readString(details?.full_name) ||
                readString(details?.player_name);

            const logoUrl =
                readString(details?.image_path) ||
                readString(details?.photo_url) ||
                readString(details?.avatar_url) ||
                readString(details?.photo);

            if (!name) return null;

            return {
                name,
                logo_url: logoUrl,
                type_label: 'Jugador',
                color: null,
            };
        } catch {
            return null;
        }
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

    const persistPendingQueueSnapshot = useCallback((userId?: string | null) => {
        const normalizedUserId = typeof userId === 'string'
            ? userId.trim()
            : activeUserIdRef.current?.trim() || '';

        if (!normalizedUserId) {
            return;
        }

        writePendingPersistenceQueue({
            userId: normalizedUserId,
            favorites: Array.from(favoritePersistenceQueueRef.current.values()),
            leaguePreferences: Array.from(leaguePreferenceQueueRef.current.values()),
            tournamentFollows: Array.from(tournamentFollowQueueRef.current.values()),
        });
    }, []);

    const clearPendingQueueSnapshot = useCallback(() => {
        writePendingPersistenceQueue(null);
    }, []);

    const hydratePendingQueueSnapshot = useCallback((userId?: string | null) => {
        const normalizedUserId = typeof userId === 'string' ? userId.trim() : '';
        if (!normalizedUserId) {
            return;
        }

        const pendingQueue = readPendingPersistenceQueue(normalizedUserId);
        if (!pendingQueue) {
            return;
        }

        pendingQueue.favorites.forEach((mutation) => {
            const normalizedEntityId = normalizeEntityId(mutation.entityId);
            if (!normalizedEntityId) return;

            favoritePersistenceQueueRef.current.set(`${mutation.entityType}:${normalizedEntityId}`, {
                entityId: normalizedEntityId,
                entityType: mutation.entityType,
                isFavorite: Boolean(mutation.isFavorite),
            });
        });

        pendingQueue.leaguePreferences.forEach((mutation) => {
            const normalizedLeagueId = normalizeEntityId(mutation.leagueId);
            if (!normalizedLeagueId) return;

            leaguePreferenceQueueRef.current.set(normalizedLeagueId, {
                leagueId: normalizedLeagueId,
                isFavorite: Boolean(mutation.isFavorite),
                sportId: normalizeOptionalString(mutation.sportId),
            });
        });

        pendingQueue.tournamentFollows.forEach((mutation) => {
            const normalizedTournamentId = normalizeEntityId(mutation.tournamentId);
            if (!normalizedTournamentId) return;

            tournamentFollowQueueRef.current.set(normalizedTournamentId, {
                tournamentId: normalizedTournamentId,
                isFavorite: Boolean(mutation.isFavorite),
            });
        });

        persistPendingQueueSnapshot(normalizedUserId);
    }, [persistPendingQueueSnapshot]);

    const queueFavoritePersistenceMutation = useCallback((
        userId: string,
        entityId: string,
        entityType: EntityType,
        isFavorite: boolean,
    ) => {
        const normalizedUserId = userId.trim();
        const normalizedEntityId = normalizeEntityId(entityId);
        if (!normalizedUserId || !normalizedEntityId) {
            return;
        }

        activeUserIdRef.current = normalizedUserId;
        favoritePersistenceQueueRef.current.set(`${entityType}:${normalizedEntityId}`, {
            entityId: normalizedEntityId,
            entityType,
            isFavorite,
        });
        persistPendingQueueSnapshot(normalizedUserId);
    }, [persistPendingQueueSnapshot]);

    const queueLeaguePreferencePersistenceMutation = useCallback((
        userId: string,
        leagueId: string,
        isFavorite: boolean,
        sportId?: string | null,
    ) => {
        const normalizedUserId = userId.trim();
        const normalizedLeagueId = normalizeEntityId(leagueId);
        if (!normalizedUserId || !normalizedLeagueId) {
            return;
        }

        activeUserIdRef.current = normalizedUserId;
        leaguePreferenceQueueRef.current.set(normalizedLeagueId, {
            leagueId: normalizedLeagueId,
            isFavorite,
            sportId: normalizeOptionalString(sportId),
        });
        persistPendingQueueSnapshot(normalizedUserId);
    }, [persistPendingQueueSnapshot]);

    const queueTournamentFollowPersistenceMutation = useCallback((
        userId: string,
        entityId: string,
        isFavorite: boolean,
        followerTournamentId?: string | null,
    ) => {
        const normalizedUserId = userId.trim();
        const tournamentId = resolveTournamentFollowerId(entityId, followerTournamentId);
        if (!normalizedUserId || !tournamentId) {
            return;
        }

        activeUserIdRef.current = normalizedUserId;
        tournamentFollowQueueRef.current.set(tournamentId, {
            tournamentId,
            isFavorite,
        });
        persistPendingQueueSnapshot(normalizedUserId);
    }, [persistPendingQueueSnapshot]);

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

        isFlushingRef.current = true;

        const flushPromise = (async () => {
            let userId = activeUserIdRef.current?.trim() || '';

            try {
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

                favoriteMutations.forEach((mutation) => {
                    tasks.push(
                        persistFavoriteStateToSupabase(
                            supabase,
                            userId,
                            mutation.entityId,
                            mutation.entityType,
                            mutation.isFavorite,
                        ),
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

                favoriteMutations.forEach((mutation) => {
                    const key = favoriteMutationKey(mutation);
                    const current = favoritePersistenceQueueRef.current.get(key);
                    if (favoriteMutationsMatch(current, mutation)) {
                        favoritePersistenceQueueRef.current.delete(key);
                    }
                });

                leaguePreferenceMutations.forEach((mutation) => {
                    const current = leaguePreferenceQueueRef.current.get(mutation.leagueId);
                    if (leaguePreferenceMutationsMatch(current, mutation)) {
                        leaguePreferenceQueueRef.current.delete(mutation.leagueId);
                    }
                });

                tournamentFollowMutations.forEach((mutation) => {
                    const current = tournamentFollowQueueRef.current.get(mutation.tournamentId);
                    if (tournamentFollowMutationsMatch(current, mutation)) {
                        tournamentFollowQueueRef.current.delete(mutation.tournamentId);
                    }
                });
            } catch (error) {
                console.error('Error flushing favorites persistence queue:', error);
                persistPendingQueueSnapshot(userId);
                throw error;
            } finally {
                isFlushingRef.current = false;
                flushPromiseRef.current = null;
                persistPendingQueueSnapshot(userId);

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
    }, [persistPendingQueueSnapshot, supabase, supabaseUntyped]);

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
            const { data: { session }, error: sessionErr } = await withTimeout(
                measureAsync(
                    'favorites_get_session',
                    async () => supabase.auth.getSession(),
                    {
                        runtime: 'client',
                        tags: ['AUTH'],
                        metadata: {
                            step: 'favorites_get_session',
                        },
                    },
                ),
                FAVORITES_SESSION_TIMEOUT_MS,
                'favorites_get_session',
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
            hydratePendingQueueSnapshot(session.user.id);

            const cached = readLS(session.user.id);
            favoritesRef.current = cached;
            setFavorites(cached);

            await flushAllPersistenceQueues();

            const favoritesRequest = beginClientRequest('favorites:resolved', 'hook_refresh', {
                hook: 'useFavorites',
            });
            const t0 = performance.now();
            const items = await withTimeout(
                fetchResolvedFavorites(supabase, session.user.id),
                FAVORITES_FETCH_TIMEOUT_MS,
                'favorites_resolve',
            );
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
            favoritesRef.current = items;
            writeLS(session.user.id, items);
            setHasMore(false);
        } catch (err: unknown) {
            if (myId !== requestIdRef.current) return;
            if (!isAbortError(err)) {
                console.error('useFavorites error:', err);
                setError(
                    isTimeoutError(err)
                        ? 'La carga de tus seguidos tardó demasiado. Probá actualizar nuevamente.'
                        : err instanceof Error
                            ? err.message
                            : 'Error inesperado'
                );
            }
        } finally {
            if (myId === requestIdRef.current) {
                setLoading(false);
            }
        }
    }, [flushAllPersistenceQueues, hydratePendingQueueSnapshot, supabase]);

    useEffect(() => {
        fetchFavorites();

        const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
            if (event === 'SIGNED_IN' || event === 'USER_UPDATED') {
                fetchFavorites();
            } else if (event === 'SIGNED_OUT') {
                requestIdRef.current++;
                activeUserIdRef.current = null;
                favoritePersistenceQueueRef.current.clear();
                leaguePreferenceQueueRef.current.clear();
                tournamentFollowQueueRef.current.clear();
                if (flushTimerRef.current !== null) {
                    clearTimeout(flushTimerRef.current);
                    flushTimerRef.current = null;
                }
                clearPendingQueueSnapshot();
                setFavorites([]);
                clearFavoritesLocalCache();
                setHasMore(false);
                setLoading(false);
                setError(null);
            }
        });

        return () => subscription.unsubscribe();
    }, [clearPendingQueueSnapshot, fetchFavorites, supabase]);

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
                favoritesRef.current = next;
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
        queueFavoritePersistenceMutation(session.user.id, String(id), entity_type, willBeFavorite);

        void flushPersistenceQueues()
            .then(() => {
                clearFavoritesCache(`Favorite persisted: ${entity_type}:${id}`);
            })
            .catch((err) => {
                console.error('Error toggling favorite:', err);
                setError('Estamos reintentando sincronizar tus favoritos.');
            });
    }, [flushPersistenceQueues, queueFavoritePersistenceMutation, supabase, syncFavoriteMutation]);

    const isLeagueFavorite = useCallback(
        (entityId: string) => favorites.some((favorite) => (
            favoriteMatchesEntity(favorite, entityId, 'league')
        )),
        [favorites],
    );

    const toggleLeagueFavorite = useCallback(async (
        entityId: string,
        nameOrOptions?: string | ToggleLeagueFavoriteOptions,
    ) => {
        const options = typeof nameOrOptions === 'string'
            ? { name: nameOrOptions }
            : nameOrOptions;
        const normalizedEntityId = normalizeEntityId(entityId);
        if (!normalizedEntityId) {
            return;
        }

        const optimisticFavorite = createOptimisticFavorite(entityId, 'league', {
            name: options?.name ?? 'Liga',
            logo_url: options?.logo_url ?? null,
            color: options?.color ?? null,
            type_label: options?.type_label ?? 'Torneo',
        });

        try {
            const { data: { session }, error: sessionError } = await supabase.auth.getSession();

            if (sessionError) {
                console.error('Error checking session before toggling tournament follow:', sessionError);
            }

            if (!session) {
                redirectToLogin();
                return;
            }

            const userId = session.user.id;
            activeUserIdRef.current = userId;
            const existingFavoriteTypes = Array.from(new Set(
                favoritesRef.current
                    .filter((favorite) => (
                        favoriteMatchesEntity(favorite, normalizedEntityId) &&
                        ['league', 'tournament'].includes(favorite.entity_type)
                    ))
                    .map((favorite) => favorite.entity_type)
            )) as EntityType[];

            const shouldFollow = existingFavoriteTypes.length === 0;

            setFavorites((prev) => {
                const next = shouldFollow
                    ? applyFavoriteMutation(prev, optimisticFavorite, true)
                    : prev.filter((favorite) => !favoriteMatchesEntity(favorite, normalizedEntityId, 'league'));
                favoritesRef.current = next;
                writeLS(activeUserIdRef.current, next);
                return next;
            });

            syncFavoriteMutation(userId, normalizedEntityId, 'league', shouldFollow, optimisticFavorite);
            queueFavoritePersistenceMutation(userId, normalizedEntityId, 'league', shouldFollow);
            queueLeaguePreferencePersistenceMutation(userId, normalizedEntityId, shouldFollow, options?.sportId);
            queueTournamentFollowPersistenceMutation(userId, normalizedEntityId, shouldFollow, options?.followerTournamentId);
            notifyFavoriteLeaguePreferenceUpdated(normalizedEntityId, shouldFollow);

            void flushPersistenceQueues()
                .then(() => {
                    clearFavoritesCache(`League favorite persisted: ${normalizedEntityId}`);
                })
                .catch((err) => {
                    console.error('Error toggling league favorite:', err);
                    setError('Estamos reintentando sincronizar tu liga favorita.');
                });
        } catch (err) {
            console.error('Error toggling league favorite:', err);
            setError('No se pudo actualizar la liga favorita.');
        }
    }, [
        flushPersistenceQueues,
        queueFavoritePersistenceMutation,
        queueLeaguePreferencePersistenceMutation,
        queueTournamentFollowPersistenceMutation,
        supabase,
        syncFavoriteMutation,
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
