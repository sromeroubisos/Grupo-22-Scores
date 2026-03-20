import type { SupabaseClient } from '@supabase/supabase-js';
import { EntityType } from '@/lib/types/user';

export type ResolvedFavorite = {
    id: string;
    entity_type: EntityType;
    name: string;
    logo_url?: string | null;
    color?: string | null;
    type_label: string;
    created_at: string;
};

type RpcFavoriteRow = {
    entity_id?: unknown;
    entity_type?: unknown;
    name?: unknown;
    logo_url?: unknown;
    color?: unknown;
    type_label?: unknown;
    created_at?: unknown;
};

type FavoriteBaseRow = {
    entity_type: EntityType;
    entity_id: string;
    created_at: string;
};

function isEntityType(value: unknown): value is EntityType {
    return typeof value === 'string' && ['club', 'league', 'tournament', 'match', 'player'].includes(value);
}

function mapRpcRow(row: RpcFavoriteRow): ResolvedFavorite {
    return {
        id: typeof row.entity_id === 'string' ? row.entity_id : '',
        entity_type: isEntityType(row.entity_type) ? row.entity_type : 'club',
        name: typeof row.name === 'string' && row.name.trim() ? row.name : 'Pendiente de sincronizar',
        logo_url: typeof row.logo_url === 'string' ? row.logo_url : null,
        color: typeof row.color === 'string' ? row.color : null,
        type_label: typeof row.type_label === 'string' && row.type_label.trim() ? row.type_label : 'Favorito',
        created_at: typeof row.created_at === 'string' ? row.created_at : new Date().toISOString(),
    };
}

function parseRpcPayload(data: unknown): ResolvedFavorite[] {
    if (typeof data === 'string') {
        try {
            const parsed = JSON.parse(data) as unknown;
            return parseRpcPayload(parsed);
        } catch {
            return [];
        }
    }

    if (!Array.isArray(data)) {
        return [];
    }

    return data
        .filter((row): row is RpcFavoriteRow => typeof row === 'object' && row !== null)
        .map(mapRpcRow)
        .filter((row) => row.id.length > 0);
}

async function tryFavoritesRpc(
    supabase: SupabaseClient,
    rpcName: 'get_my_favorites_enriched_v2' | 'get_my_favorites_enriched'
): Promise<ResolvedFavorite[] | null> {
    const response = rpcName === 'get_my_favorites_enriched_v2'
        ? await supabase.rpc(rpcName, { p_limit: 100, p_cursor: undefined })
        : await supabase.rpc(rpcName);

    if (response.error) {
        return null;
    }

    return parseRpcPayload(response.data);
}

async function fetchFavoritesFallback(
    supabase: SupabaseClient
): Promise<{ ok: boolean; items: ResolvedFavorite[] }> {
    const { data: favoritesData, error } = await supabase
        .from('favorites')
        .select('entity_type, entity_id, created_at')
        .order('created_at', { ascending: false })
        .limit(100);

    if (error || !favoritesData) {
        return { ok: false, items: [] };
    }

    const favorites = favoritesData.filter((row): row is FavoriteBaseRow => (
        typeof row?.entity_id === 'string' &&
        typeof row?.created_at === 'string' &&
        isEntityType(row?.entity_type)
    ));

    const clubIds = favorites
        .filter((row) => row.entity_type === 'club')
        .map((row) => row.entity_id);
    const tournamentIds = favorites
        .filter((row) => row.entity_type === 'league' || row.entity_type === 'tournament')
        .map((row) => row.entity_id);

    const [clubsRes, tournamentsRes] = await Promise.all([
        clubIds.length > 0
            ? supabase.from('clubs').select('id, name, logo_url, primary_color').in('id', clubIds)
            : Promise.resolve({ data: [], error: null }),
        tournamentIds.length > 0
            ? supabase.from('tournaments').select('id, name, display_name, logo_url').in('id', tournamentIds)
            : Promise.resolve({ data: [], error: null }),
    ]);

    const clubMap = new Map(
        (clubsRes.data || []).map((club) => [
            club.id,
            {
                name: club.name,
                logo_url: club.logo_url || null,
                color: club.primary_color || null,
                type_label: 'Club',
            },
        ])
    );

    const tournamentMap = new Map(
        (tournamentsRes.data || []).map((tournament) => [
            String(tournament.id),
            {
                name: tournament.display_name || tournament.name,
                logo_url: tournament.logo_url || null,
                color: null,
                type_label: 'Torneo',
            },
        ])
    );

    const items = favorites.map((favorite) => {
        const resolved = favorite.entity_type === 'club'
            ? clubMap.get(favorite.entity_id)
            : tournamentMap.get(favorite.entity_id);

        return {
            id: favorite.entity_id,
            entity_type: favorite.entity_type,
            name: resolved?.name || 'Pendiente de sincronizar',
            logo_url: resolved?.logo_url || null,
            color: resolved?.color || null,
            type_label: resolved?.type_label || 'Favorito',
            created_at: favorite.created_at,
        };
    });

    return { ok: true, items };
}

export async function fetchResolvedFavorites(supabase: SupabaseClient): Promise<ResolvedFavorite[]> {
    const fallback = await fetchFavoritesFallback(supabase);
    if (fallback.ok) {
        return fallback.items;
    }

    const v2 = await tryFavoritesRpc(supabase, 'get_my_favorites_enriched_v2');
    if (v2 && v2.length > 0) {
        return v2;
    }

    const v1 = await tryFavoritesRpc(supabase, 'get_my_favorites_enriched');
    if (v1 && v1.length > 0) {
        return v1;
    }

    return [];
}
