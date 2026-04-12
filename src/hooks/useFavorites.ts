import { useCallback } from 'react';
import { FAVORITES_ENABLED } from '@/lib/favorites/config';
import type { EntityType } from '@/lib/types/user';

export type FavoriteItem = {
    id: string;
    entity_type: EntityType;
    name: string;
    logo_url?: string | null;
    color?: string | null;
    type_label: string;
    created_at: string;
};

type ToggleLeagueFavoriteOptions = {
    name?: string;
    logo_url?: string | null;
    color?: string | null;
    type_label?: string;
    followerTournamentId?: string | null;
    sportId?: string | null;
    forceIsFavorite?: boolean;
};

export function useFavorites() {
    const noopAsync = useCallback(async () => {}, []);
    const alwaysFalse = useCallback(() => false, []);
    const emptyRefresh = useCallback(async () => {}, []);

    return {
        favorites: [] as FavoriteItem[],
        hasMore: false,
        loading: false,
        error: FAVORITES_ENABLED ? null : null,
        isFavorite: alwaysFalse,
        toggleFavorite: noopAsync,
        isLeagueFavorite: alwaysFalse,
        toggleLeagueFavorite: async (_entityId: string, _nameOrOptions?: string | ToggleLeagueFavoriteOptions) => {},
        loadMore: () => {},
        refresh: emptyRefresh,
    };
}

export function useFavorite(_entityType: EntityType, _entityId: string) {
    const toggle = useCallback(async (_metadata?: {
        name?: string;
        logo_url?: string | null;
        color?: string | null;
        type_label?: string;
    }) => {}, []);

    return {
        isFavorited: false,
        loading: false,
        toggle,
    };
}
