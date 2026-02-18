'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { EntityType } from '@/lib/types/user';

// ─── Types ────────────────────────────────────────────────────────────────────

export type FavoriteItem = {
    id: string;           // entity_id
    entity_type: EntityType;
    name: string;
    logo_url?: string | null;
    color?: string | null;
    type_label: string;
    created_at: string;
};

// ─── Local storage ────────────────────────────────────────────────────────────

const LS_KEY = 'g22_favorites_v4_fix';

function readLS(): FavoriteItem[] {
    try {
        if (typeof window === 'undefined') return [];
        const raw = localStorage.getItem(LS_KEY);
        return raw ? (JSON.parse(raw) as FavoriteItem[]) : [];
    } catch { return []; }
}

function writeLS(items: FavoriteItem[]): void {
    try {
        if (typeof window === 'undefined') return;
        localStorage.setItem(LS_KEY, JSON.stringify(items));
    } catch { /* quota */ }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isAbortError(err: any): boolean {
    return (
        err instanceof DOMException ||
        err?.name === 'AbortError' ||
        Boolean(err?.message?.toLowerCase().includes('abort'))
    );
}

function mapRow(f: any): FavoriteItem {
    return {
        id: String(f.entity_id),
        entity_type: (f.entity_type as EntityType) || 'club',
        name: f.name || 'Sincronizando...',
        logo_url: f.logo_url || null,
        color: f.color || null,
        type_label: f.type_label || 'Favorito',
        created_at: f.created_at || new Date().toISOString(),
    };
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useFavorites() {
    // Initialize directly from localStorage — avoids blank frame before first fetch
    const [favorites, setFavorites] = useState<FavoriteItem[]>(() => readLS());
    const [hasMore, setHasMore]     = useState(false);
    const [loading, setLoading]     = useState(true);
    const [error, setError]         = useState<string | null>(null);

    const supabase    = useMemo(() => createClient(), []);
    // Incrementing requestId lets us discard responses from stale fetches.
    // This replaces the isFetching guard which could leave loading=true forever.
    const requestIdRef = useRef(0);

    const fetchFavorites = useCallback(async () => {
        const myId = ++requestIdRef.current;
        setLoading(true);
        setError(null);

        try {
            const { data: { session }, error: sessionErr } = await supabase.auth.getSession();
            if (myId !== requestIdRef.current) return; // stale, discard

            if (sessionErr || !session) {
                setFavorites([]);
                setHasMore(false);
                return; // finally → setLoading(false)
            }

            // Measure RPC time
            const t0 = performance.now();
            const { data, error: rpcError } = await supabase.rpc('get_my_favorites_enriched');
            const t1 = performance.now();

            if (myId !== requestIdRef.current) return; // stale, discard

            console.table({
                'favorites ms': (t1 - t0).toFixed(1),
                rows: Array.isArray(data) ? data.length : typeof data === 'string' ? JSON.parse(data).length : 0,
                err: rpcError?.message ?? '',
            });

            if (rpcError) {
                if (!isAbortError(rpcError)) setError(rpcError.message || 'Error al cargar');
                return; // finally → setLoading(false)
            }

            // get_my_favorites_enriched returns JSON; handle both string and parsed
            const rows: any[] = typeof data === 'string' ? JSON.parse(data) : (Array.isArray(data) ? data : []);
            const items = rows.map(mapRow);

            setFavorites(items);
            writeLS(items);
            setHasMore(false); // v1 loads all — no pagination needed
        } catch (err: any) {
            if (myId !== requestIdRef.current) return;
            if (!isAbortError(err)) {
                console.error('useFavorites error:', err);
                setError(err.message || 'Error inesperado');
            }
        } finally {
            // Always runs — loading can NEVER get stuck
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
                // Cancel any in-flight fetch immediately
                requestIdRef.current++;
                setFavorites([]);
                writeLS([]);
                setHasMore(false);
                setLoading(false);
                setError(null);
            }
        });

        return () => subscription.unsubscribe();
        // supabase is stable (useMemo []). fetchFavorites is stable (useCallback [supabase]).
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [fetchFavorites]);

    // ── Public API ────────────────────────────────────────────────────────────

    const isFavorite = useCallback(
        (entityId: string) => favorites.some(f => String(f.id) === String(entityId)),
        [favorites],
    );

    const toggleFavorite = useCallback(async (item: Omit<FavoriteItem, 'created_at'>) => {
        const { id, entity_type } = item;

        // Optimistic update
        setFavorites(prev => {
            const exists = prev.some(f => String(f.id) === String(id));
            const next = exists
                ? prev.filter(f => String(f.id) !== String(id))
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
        (entityId: string) => favorites.some(
            f => String(f.id) === String(entityId) &&
                ['league', 'tournament'].includes(f.entity_type),
        ),
        [favorites],
    );

    const toggleLeagueFavorite = useCallback((entityId: string, name?: string) => {
        toggleFavorite({
            id: entityId,
            entity_type: 'league',
            name: name ?? 'Liga',
            type_label: 'Torneo',
        });
    }, [toggleFavorite]);

    const loadMore = useCallback(() => {
        // No-op for now (v1 loads all). Here for API compatibility with FavoritesPage.
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

// ─── Single-entity helper ─────────────────────────────────────────────────────

export function useFavorite(entityType: EntityType, entityId: string) {
    const { favorites, loading, isFavorite, toggleFavorite } = useFavorites();

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
