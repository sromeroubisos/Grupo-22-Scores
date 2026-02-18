'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { EntityType } from '@/lib/types/user';

// ─── Enriched type (what we store locally + what the UI needs) ────────────────

export type FavoriteItem = {
    id: string;            // entity_id
    entity_type: EntityType;
    name: string;
    logo_url?: string | null;
    color?: string | null;
    type_label: string;
    created_at: string;
};

// ─── localStorage helpers ─────────────────────────────────────────────────────

const LS_KEY = 'g22_favorites_v1';

function readLS(): FavoriteItem[] {
    try {
        const raw = localStorage.getItem(LS_KEY);
        return raw ? (JSON.parse(raw) as FavoriteItem[]) : [];
    } catch { return []; }
}

function writeLS(items: FavoriteItem[]): void {
    try { localStorage.setItem(LS_KEY, JSON.stringify(items)); } catch { /* quota */ }
}

// ─── Supabase helpers (best-effort, never throw to caller) ────────────────────

async function supabaseFetchFavorites(): Promise<FavoriteItem[] | null> {
    try {
        const supabase = createClient();
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return null;

        const { data, error } = await supabase.rpc('get_my_favorites_enriched');
        if (error || data == null) return null;

        const rows: any[] = typeof data === 'string' ? JSON.parse(data) : data;
        return rows.map(f => ({
            id: f.entity_id,
            entity_type: f.entity_type as EntityType,
            name: f.name ?? f.entity_id,
            logo_url: f.logo_url ?? null,
            color: f.color ?? null,
            type_label: f.type_label ?? f.entity_type,
            created_at: f.created_at ?? new Date().toISOString(),
        }));
    } catch { return null; }
}

async function supabaseToggle(entityType: string, entityId: string): Promise<void> {
    try {
        const supabase = createClient();
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;
        await supabase.rpc('toggle_favorite', {
            p_entity_type: entityType,
            p_entity_id: entityId,
        });
    } catch { /* silent */ }
}

// ─── useFavorites — localStorage-first, Supabase syncs in background ──────────

export function useFavorites() {
    const [favorites, setFavorites] = useState<FavoriteItem[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Instant: paint local data right away
        setFavorites(readLS());

        // Background: if Supabase responds, it becomes the source of truth
        supabaseFetchFavorites().then(remote => {
            if (remote !== null) {
                setFavorites(remote);
                writeLS(remote);
            }
        }).finally(() => setLoading(false));
    }, []);

    const isFavorite = useCallback(
        (entityId: string) => favorites.some(f => f.id === entityId),
        [favorites]
    );

    const toggleFavorite = useCallback((item: Omit<FavoriteItem, 'created_at'>) => {
        // Update state + localStorage immediately (no waiting)
        setFavorites(prev => {
            const exists = prev.some(f => f.id === item.id);
            const next = exists
                ? prev.filter(f => f.id !== item.id)
                : [{ ...item, created_at: new Date().toISOString() }, ...prev];
            writeLS(next);
            return next;
        });

        // Sync to Supabase silently in background
        supabaseToggle(item.entity_type, item.id);
    }, []);

    /** True if the entity_id is a favorited league/tournament */
    const isLeagueFavorite = useCallback(
        (entityId: string) => favorites.some(
            f => f.id === entityId && (f.entity_type === 'league' || f.entity_type === 'tournament')
        ),
        [favorites]
    );

    /** Toggle a league/tournament by id only (name will be populated by Supabase sync) */
    const toggleLeagueFavorite = useCallback((entityId: string, name?: string) => {
        toggleFavorite({
            id: entityId,
            entity_type: 'league',
            name: name ?? entityId,
            type_label: 'Liga',
        });
    }, [toggleFavorite]);

    return { favorites, loading, isFavorite, toggleFavorite, isLeagueFavorite, toggleLeagueFavorite };
}

// ─── useFavorite — single-entity toggle (used from detail pages) ──────────────

export function useFavorite(entityType: EntityType, entityId: string) {
    const { favorites, loading, isFavorite, toggleFavorite } = useFavorites();

    const favorited = isFavorite(entityId);

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

    return { isFavorited: favorited, loading, toggle };
}
