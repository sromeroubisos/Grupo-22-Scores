'use client';

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { useAuth } from '@/context/AuthContext';
import {
    FAVORITES_ENABLED,
    FAVORITE_CLUBS_ENABLED,
    FAVORITE_LEAGUES_ENABLED,
} from '@/lib/favorites/config';
import { favoriteEventMatches, type FavoriteUpdatedDetail } from '@/lib/favorites/events';
import {
    applyOptimisticChange,
    ensureFavoritesLoaded,
    getFavoritesSnapshot,
    getServerFavoritesSnapshot,
    primeFavorites,
    resetFavoritesStore,
    subscribeFavorites,
} from '@/lib/favorites/favoritesStore';
import {
    EMPTY_LOCAL_PREFERENCES,
    readLocalPreferences,
    subscribeLocalPreferences,
    toggleLocalItem,
    type PrefItem,
} from '@/lib/localPreferences';
import { createClient } from '@/lib/supabase/client';
import {
    getFollowingErrorMessage,
    isFollowingSchemaMissingError,
    matchesClubFollow,
    matchesLeagueFollow,
    toggleClubFollow,
    toggleLeagueFollow,
    type ClubFollowRow,
    type LeagueFollowRow,
} from '@/lib/services/followingService';
import type { EntityType } from '@/lib/types/user';

export type FavoriteItem = {
    id: string;
    entity_type: EntityType;
    name: string;
    logo_url?: string | null;
    color?: string | null;
    type_label: string;
    created_at: string;
    sport_id?: string | null;
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

type ToggleFavoriteInput = {
    id: string;
    entity_type: EntityType;
    name?: string;
    logo_url?: string | null;
    color?: string | null;
    type_label?: string;
    sport_id?: string | null;
    canonical_id?: string | null;
    forceIsFavorite?: boolean;
};

const NO_LEAGUES: LeagueFollowRow[] = [];
const noopSubscribe = () => () => {};
const NO_CLUBS: ClubFollowRow[] = [];

function toLeagueFavoriteItem(row: LeagueFollowRow): FavoriteItem {
    return {
        id: row.league_id,
        entity_type: 'league',
        name: row.display_name,
        logo_url: row.logo_url,
        color: null,
        type_label: 'Torneo',
        created_at: row.created_at,
        sport_id: row.sport_id,
    };
}

function toClubFavoriteItem(row: ClubFollowRow): FavoriteItem {
    return {
        id: row.club_id,
        entity_type: 'club',
        name: row.display_name,
        logo_url: row.logo_url,
        color: null,
        type_label: 'Club',
        created_at: row.created_at,
        sport_id: row.sport_id,
    };
}

function isClubEntityType(entityType: EntityType): boolean {
    return entityType === 'club' || entityType === 'team';
}

function isLeagueEntityType(entityType: EntityType): boolean {
    return entityType === 'league' || entityType === 'tournament';
}

function buildLeagueRow(entityId: string, options: { name?: string; logo_url?: string | null; sportId?: string | null }): LeagueFollowRow {
    return {
        league_id: entityId,
        canonical_league_id: null,
        sport_id: options.sportId ?? null,
        display_name: options.name?.trim() || entityId,
        logo_url: options.logo_url || null,
        created_at: new Date().toISOString(),
    };
}

function buildClubRow(entityId: string, options: { name?: string; logo_url?: string | null; sportId?: string | null }): ClubFollowRow {
    return {
        club_id: entityId,
        canonical_club_id: null,
        sport_id: options.sportId ?? null,
        display_name: options.name?.trim() || entityId,
        logo_url: options.logo_url || null,
        created_at: new Date().toISOString(),
    };
}

// El visitante sin cuenta también sigue cosas: viven en el dispositivo
// (lib/localPreferences) y pasan a su cuenta cuando inicia sesión.
function localToLeagueRow(item: PrefItem): LeagueFollowRow {
    return { ...buildLeagueRow(item.id, { name: item.name, logo_url: item.logo, sportId: item.sportId }), created_at: '' };
}

function localToClubRow(item: PrefItem): ClubFollowRow {
    return { ...buildClubRow(item.id, { name: item.name, logo_url: item.logo, sportId: item.sportId }), created_at: '' };
}

/**
 * Lo que sigue el usuario. TODAS las instancias comparten un solo store
 * (lib/favorites/favoritesStore): montar cincuenta estrellas es un único
 * pedido, y ninguna arranca diciendo "no seguís" mientras llega la respuesta.
 *
 * `ready` dice si la respuesta es confiable (red o último resultado conocido);
 * mientras sea false, la interfaz tiene que mostrar un estado neutro, no
 * "no seguido". `loading` es su negación y se conserva por compatibilidad.
 */
export function useFavorites() {
    const { user, isLoading: authLoading, isSessionVerified } = useAuth();
    const supabase = useMemo(() => createClient(), []);
    const userId = user?.id ?? null;

    const store = useSyncExternalStore(subscribeFavorites, getFavoritesSnapshot, getServerFavoritesSnapshot);
    const local = useSyncExternalStore(subscribeLocalPreferences, readLocalPreferences, () => EMPTY_LOCAL_PREFERENCES);
    const [actionError, setActionError] = useState<string | null>(null);

    useEffect(() => {
        if (!FAVORITES_ENABLED) return;
        if (!userId) {
            if (!authLoading) resetFavoritesStore();
            return;
        }
        // El usuario cacheado aparece antes que la sesión real: con él ya se
        // pinta lo último que se supo; la red espera a que la sesión exista.
        primeFavorites(userId);
        if (!authLoading && isSessionVerified) void ensureFavoritesLoaded(supabase, userId);
    }, [authLoading, isSessionVerified, supabase, userId]);

    const accountRows = Boolean(userId) && store.userId === userId;
    const leagueRows = useMemo(
        () => (userId ? (accountRows ? store.leagues : NO_LEAGUES) : local.leagues.map(localToLeagueRow)),
        [accountRows, local.leagues, store.leagues, userId],
    );
    const clubRows = useMemo(
        () => (userId ? (accountRows ? store.clubs : NO_CLUBS) : local.clubs.map(localToClubRow)),
        [accountRows, local.clubs, store.clubs, userId],
    );
    // El servidor y el primer render del cliente no saben qué sigue el visitante (vive en
    // el dispositivo): hasta que React hidrata, `ready` es false para que el HTML coincida.
    const hydrated = useSyncExternalStore(noopSubscribe, () => true, () => false);
    const ready = hydrated && (userId ? accountRows && store.ready : !authLoading);
    const error = actionError ?? (userId && accountRows ? store.error : null);

    const refresh = useCallback(async () => {
        if (!userId || authLoading || !isSessionVerified) return;
        await ensureFavoritesLoaded(supabase, userId, { force: true });
    }, [authLoading, isSessionVerified, supabase, userId]);

    const favorites = useMemo(() => (
        [
            ...leagueRows.map(toLeagueFavoriteItem),
            ...clubRows.map(toClubFavoriteItem),
        ].sort((left, right) => right.created_at.localeCompare(left.created_at))
    ), [clubRows, leagueRows]);

    const isLeagueFavorite = useCallback((entityId: string) => {
        if (!FAVORITES_ENABLED || !FAVORITE_LEAGUES_ENABLED) return false;
        return leagueRows.some((row) => matchesLeagueFollow(row, entityId));
    }, [leagueRows]);

    const isFavorite = useCallback((entityId: string, entityType: EntityType) => {
        if (!FAVORITES_ENABLED) return false;

        if (isClubEntityType(entityType)) {
            return FAVORITE_CLUBS_ENABLED && clubRows.some((row) => matchesClubFollow(row, entityId));
        }

        if (isLeagueEntityType(entityType)) {
            return FAVORITE_LEAGUES_ENABLED && leagueRows.some((row) => matchesLeagueFollow(row, entityId));
        }

        return false;
    }, [clubRows, leagueRows]);

    const toggleLeagueFavorite = useCallback(async (
        entityId: string,
        nameOrOptions?: string | ToggleLeagueFavoriteOptions,
    ) => {
        if (!FAVORITES_ENABLED || !FAVORITE_LEAGUES_ENABLED) return;
        if (!userId && authLoading) return;

        const options = typeof nameOrOptions === 'string'
            ? { name: nameOrOptions }
            : (nameOrOptions || {});
        const matchedRows = leagueRows.filter((row) => matchesLeagueFollow(row, entityId));
        const nextIsFavorite = typeof options.forceIsFavorite === 'boolean'
            ? options.forceIsFavorite
            : matchedRows.length === 0;

        if (!userId) {
            // Sin cuenta: queda en el dispositivo. Los alias de un mismo torneo se
            // sacan juntos para que "dejar de seguir" no deje uno colgado.
            if (!nextIsFavorite) matchedRows.forEach((row) => toggleLocalItem('leagues', { id: row.league_id, name: row.display_name }, false));
            else toggleLocalItem('leagues', { id: entityId, name: options.name || entityId, logo: options.logo_url, sportId: options.sportId }, true);
            return;
        }

        const rollback = applyOptimisticChange(userId, {
            kind: 'league',
            isFavorite: nextIsFavorite,
            row: buildLeagueRow(entityId, options),
        });

        try {
            await toggleLeagueFollow(supabase, userId, {
                entityId,
                name: options.name,
                logoUrl: options.logo_url,
                sportId: options.sportId,
                canonicalLeagueId: options.followerTournamentId || null,
                forceIsFavorite: options.forceIsFavorite,
                existingRows: matchedRows,
            });
            setActionError(null);
        } catch (err) {
            rollback();
            const message = isFollowingSchemaMissingError(err)
                ? 'La tabla user_favorite_leagues todavia no esta disponible para la API. Recarga el schema de Supabase o verifica que la migracion se ejecuto en el proyecto correcto.'
                : getFollowingErrorMessage(err);
            console.error('[useFavorites] toggleLeagueFavorite error:', message, err);
            setActionError(message);
        }
    }, [authLoading, leagueRows, supabase, userId]);

    const toggleFavorite = useCallback(async (item: ToggleFavoriteInput) => {
        if (!FAVORITES_ENABLED) return;

        if (isClubEntityType(item.entity_type) && FAVORITE_CLUBS_ENABLED) {
            if (!userId && authLoading) return;

            const matchedRows = clubRows.filter((row) => matchesClubFollow(row, item.id));
            const nextIsFavorite = typeof item.forceIsFavorite === 'boolean'
                ? item.forceIsFavorite
                : matchedRows.length === 0;

            if (!userId) {
                if (!nextIsFavorite) matchedRows.forEach((row) => toggleLocalItem('clubs', { id: row.club_id, name: row.display_name }, false));
                else toggleLocalItem('clubs', { id: item.id, name: item.name || item.id, logo: item.logo_url, sportId: item.sport_id }, true);
                return;
            }

            const rollback = applyOptimisticChange(userId, {
                kind: 'club',
                isFavorite: nextIsFavorite,
                row: buildClubRow(item.id, { name: item.name, logo_url: item.logo_url, sportId: item.sport_id }),
            });

            try {
                await toggleClubFollow(supabase, userId, {
                    entityId: item.id,
                    name: item.name,
                    logoUrl: item.logo_url,
                    sportId: item.sport_id,
                    canonicalClubId: item.canonical_id || null,
                    forceIsFavorite: item.forceIsFavorite,
                    existingRows: matchedRows,
                });
                setActionError(null);
            } catch (err) {
                rollback();
                const message = isFollowingSchemaMissingError(err)
                    ? 'La tabla user_favorite_clubs todavia no esta disponible para la API. Recarga el schema de Supabase o verifica que la migracion se ejecuto en el proyecto correcto.'
                    : getFollowingErrorMessage(err);
                console.error('[useFavorites] toggleClubFavorite error:', message, err);
                setActionError(message);
            }
            return;
        }

        if (isLeagueEntityType(item.entity_type) && FAVORITE_LEAGUES_ENABLED) {
            await toggleLeagueFavorite(item.id, {
                name: item.name,
                logo_url: item.logo_url,
                sportId: item.sport_id,
                followerTournamentId: item.canonical_id || null,
                forceIsFavorite: item.forceIsFavorite,
                type_label: item.type_label,
            });
        }
    }, [authLoading, clubRows, supabase, toggleLeagueFavorite, userId]);

    const loadMore = useCallback(() => {}, []);

    return {
        favorites,
        hasMore: false,
        loading: !ready,
        ready,
        error,
        isFavorite,
        toggleFavorite,
        isLeagueFavorite,
        toggleLeagueFavorite,
        loadMore,
        refresh,
    };
}

export function useFavorite(entityType: EntityType, entityId: string) {
    const { isFavorite, loading, ready, toggleFavorite } = useFavorites();

    const isFavorited = useMemo(() => {
        if (isClubEntityType(entityType) || isLeagueEntityType(entityType)) {
            return isFavorite(entityId, entityType);
        }

        return false;
    }, [entityId, entityType, isFavorite]);

    const toggle = useCallback(async (metadata?: {
        name?: string;
        logo_url?: string | null;
        color?: string | null;
        type_label?: string;
        sport_id?: string | null;
        canonical_id?: string | null;
        forceIsFavorite?: boolean;
    }) => {
        if (!isClubEntityType(entityType) && !isLeagueEntityType(entityType)) {
            return;
        }

        await toggleFavorite({
            id: entityId,
            entity_type: entityType,
            ...metadata,
        });
    }, [entityId, entityType, toggleFavorite]);

    return {
        isFavorited,
        loading,
        ready,
        toggle,
    };
}

export function favoriteMatchesEntity(
    item: Pick<FavoriteUpdatedDetail, 'entityId' | 'entityType'>,
    entityId: string,
    entityType: EntityType,
) {
    return favoriteEventMatches(item, entityId, entityType);
}
