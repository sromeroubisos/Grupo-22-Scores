'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { EntityType } from '@/lib/types/user';
import { fetchResolvedFavorites, type ResolvedFavorite } from '@/lib/favorites/fetchFavorites';

export type FavoriteItem = ResolvedFavorite;

const LS_KEY = 'g22_favorites_v4_fix';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type ToggleLeagueFavoriteOptions = {
    name?: string;
    followerTournamentId?: string | null;
};

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

function redirectToLogin(): void {
    if (typeof window === 'undefined') return;
    const returnTo = `${window.location.pathname}${window.location.search}`;
    window.location.href = `/login?returnTo=${encodeURIComponent(returnTo)}`;
}

export function useFavorites() {
    const [favorites, setFavorites] = useState<FavoriteItem[]>(() => readLS());
    const [hasMore, setHasMore] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const supabase = useMemo(() => createClient(), []);
    const requestIdRef = useRef(0);

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
                type_label: 'Torneo',
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
