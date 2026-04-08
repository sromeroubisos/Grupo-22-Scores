'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { getTournamentById } from '@/lib/data/tournaments';
import { EntityType } from '@/lib/types/user';
import {
    FAVORITES_LOCAL_CACHE_KEY,
    fetchResolvedFavorites,
    type ResolvedFavorite,
} from '@/lib/favorites/fetchFavorites';

export type FavoriteItem = ResolvedFavorite;

const LS_KEY = FAVORITES_LOCAL_CACHE_KEY;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type ToggleLeagueFavoriteOptions = {
    name?: string;
    logo_url?: string | null;
    color?: string | null;
    type_label?: string;
    followerTournamentId?: string | null;
};

const PENDING_FAVORITE_NAME = 'Pendiente de sincronizar';

function readLS(): FavoriteItem[] {
    try {
        if (typeof window === 'undefined') return [];
        const raw = localStorage.getItem(LS_KEY);
        return raw ? (JSON.parse(raw) as FavoriteItem[]) : [];
    } catch {
        return [];
    }
}

function writeLS(items: FavoriteItem[]): void {
    try {
        if (typeof window === 'undefined') return;
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
            const response = await fetch(`/api/teams?team_id=${encodeURIComponent(favorite.id)}&skip_squad=true`, {
                cache: 'no-store',
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
                const response = await fetch(
                    `/api/tournaments?id=${encodeURIComponent(favorite.id)}&sport=${encodeURIComponent(sport)}`,
                    { cache: 'no-store' }
                );

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

export function useFavorites() {
    const [favorites, setFavorites] = useState<FavoriteItem[]>([]);
    const [hasMore, setHasMore] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const supabase = useMemo(() => createClient(), []);
    const requestIdRef = useRef(0);
    const attemptedClientResolutionsRef = useRef<Set<string>>(new Set());

    useEffect(() => {
        const cached = readLS();
        if (cached.length > 0) {
            setFavorites(cached);
        }
    }, []);

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
                writeLS(next);
                return next;
            });
        })();

        return () => {
            cancelled = true;
        };
    }, [favorites]);

    const fetchFavorites = useCallback(async () => {
        const myId = ++requestIdRef.current;
        setLoading(true);
        setError(null);

        try {
            const { data: { session }, error: sessionErr } = await supabase.auth.getSession();
            if (myId !== requestIdRef.current) return;

            if (sessionErr || !session) {
                setFavorites([]);
                setHasMore(false);
                return;
            }

            const t0 = performance.now();
            const items = await fetchResolvedFavorites(supabase);
            const t1 = performance.now();

            if (myId !== requestIdRef.current) return;

            console.table({
                'favorites ms': (t1 - t0).toFixed(1),
                rows: items.length,
                err: '',
            });

            setFavorites(items);
            writeLS(items);
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
    }, [supabase]);

    useEffect(() => {
        fetchFavorites();

        const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
            if (event === 'SIGNED_IN' || event === 'USER_UPDATED') {
                fetchFavorites();
            } else if (event === 'SIGNED_OUT') {
                requestIdRef.current++;
                setFavorites([]);
                writeLS([]);
                setHasMore(false);
                setLoading(false);
                setError(null);
            }
        });

        return () => subscription.unsubscribe();
    }, [fetchFavorites, supabase]);

    const isFavorite = useCallback(
        (entityId: string) => favorites.some((favorite) => String(favorite.id) === String(entityId)),
        [favorites],
    );

    const toggleFavorite = useCallback(async (item: Omit<FavoriteItem, 'created_at'>) => {
        const { id, entity_type } = item;

        setFavorites((prev) => {
            const exists = prev.some((favorite) => String(favorite.id) === String(id));
            const next = exists
                ? prev.filter((favorite) => String(favorite.id) !== String(id))
                : [{ ...item, created_at: new Date().toISOString() } as FavoriteItem, ...prev];
            writeLS(next);
            return next;
        });

        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) return;

            await supabase.rpc('toggle_favorite', {
                p_entity_type: entity_type,
                p_entity_id: String(id),
            });
        } catch (err) {
            console.error('Error toggling favorite:', err);
        }
    }, [supabase]);

    const isLeagueFavorite = useCallback(
        (entityId: string) => favorites.some((favorite) => (
            String(favorite.id) === String(entityId) &&
            ['league', 'tournament'].includes(favorite.entity_type)
        )),
        [favorites],
    );

    const ensureTournamentFollowState = useCallback(async (
        userId: string,
        entityId: string,
        shouldFollow: boolean,
        followerTournamentId?: string | null,
    ) => {
        const tournamentId = resolveTournamentFollowerId(entityId, followerTournamentId);
        if (!tournamentId) return;

        try {
            const { data, error } = await supabase
                .from('tournament_followers')
                .select('tournament_id')
                .eq('user_id', userId)
                .eq('tournament_id', tournamentId)
                .maybeSingle();

            if (error) {
                console.error('Error checking tournament follow state:', error);
                return;
            }

            const isFollowing = Boolean(data?.tournament_id);
            if (isFollowing === shouldFollow) return;

            const { error: toggleError } = await supabase.rpc('toggle_tournament_follow', {
                p_tournament_id: tournamentId,
            });

            if (toggleError) {
                console.error('Error syncing tournament follow state:', toggleError);
            }
        } catch (err) {
            console.error('Unexpected error syncing tournament follow state:', err);
        }
    }, [supabase]);

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

            const shouldFollow = !favorites.some((favorite) => (
                String(favorite.id) === String(entityId) &&
                ['league', 'tournament'].includes(favorite.entity_type)
            ));

            await toggleFavorite({
                id: entityId,
                entity_type: 'league',
                name: options?.name ?? 'Liga',
                logo_url: options?.logo_url ?? null,
                color: options?.color ?? null,
                type_label: options?.type_label ?? 'Torneo',
            });

            await ensureTournamentFollowState(
                session.user.id,
                entityId,
                shouldFollow,
                options?.followerTournamentId,
            );
        } catch (err) {
            console.error('Error toggling league favorite:', err);
        }
    }, [ensureTournamentFollowState, favorites, supabase, toggleFavorite]);

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

    return { isFavorited: isFavorite(entityId), loading, toggle };
}
