'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import {
    FAVORITES_ENABLED,
    FAVORITE_CLUBS_ENABLED,
    FAVORITE_LEAGUES_ENABLED,
} from '@/lib/favorites/config';
import {
    dispatchFavoriteUpdated,
    FAVORITES_UPDATED_EVENT,
    favoriteEventMatches,
    type FavoriteUpdatedDetail,
} from '@/lib/favorites/events';
import { createClient } from '@/lib/supabase/client';
import {
    getFollowingErrorMessage,
    getFollowedClubs,
    getFollowedLeagues,
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

function toLeagueFavoriteItem(row: LeagueFollowRow): FavoriteItem {
    return {
        id: row.league_id,
        entity_type: 'league',
        name: row.display_name,
        logo_url: row.logo_url,
        color: null,
        type_label: 'Torneo',
        created_at: row.created_at,
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
    };
}

function isClubEntityType(entityType: EntityType): boolean {
    return entityType === 'club' || entityType === 'team';
}

function isLeagueEntityType(entityType: EntityType): boolean {
    return entityType === 'league' || entityType === 'tournament';
}

async function settleFollowing<T>(promise: Promise<T>): Promise<{ data: T | null; error: unknown }> {
    try {
        return { data: await promise, error: null };
    } catch (error) {
        return { data: null, error };
    }
}

/**
 * Un error a la consola en forma PLANA.
 *
 * `console.error(err)` imprimía `{}` y no servía para nada: un `Error` tiene el
 * mensaje y el stack como propiedades NO enumerables, así que el overlay de
 * Next lo serializa vacío. Con la base caída (`PGRST002`, "could not query the
 * database for the schema cache") el aviso quedaba sin una sola pista de qué
 * había pasado.
 */
function describeFollowingError(error: unknown): Record<string, unknown> {
    if (error instanceof Error) {
        return { name: error.name, message: error.message, stack: error.stack };
    }

    if (error && typeof error === 'object') {
        const record = error as Record<string, unknown>;
        const described: Record<string, unknown> = {};
        for (const key of ['message', 'code', 'details', 'hint', 'status', 'name']) {
            if (record[key] !== undefined) described[key] = record[key];
        }
        // Un objeto sin ninguna de esas claves igual tiene que decir algo: se
        // manda su forma cruda antes que otro `{}`.
        return Object.keys(described).length > 0 ? described : { raw: String(error) };
    }

    return { raw: String(error) };
}

function buildLeagueRowFromDetail(detail: FavoriteUpdatedDetail): LeagueFollowRow {
    return {
        league_id: detail.entityId,
        canonical_league_id: null,
        sport_id: null,
        display_name: detail.name?.trim() || detail.entityId,
        logo_url: detail.logo_url || null,
        created_at: detail.created_at || new Date().toISOString(),
    };
}

function buildClubRowFromDetail(detail: FavoriteUpdatedDetail): ClubFollowRow {
    return {
        club_id: detail.entityId,
        canonical_club_id: null,
        sport_id: null,
        display_name: detail.name?.trim() || detail.entityId,
        logo_url: detail.logo_url || null,
        created_at: detail.created_at || new Date().toISOString(),
    };
}

function applyLeagueDetail(rows: LeagueFollowRow[], detail: FavoriteUpdatedDetail): LeagueFollowRow[] {
    const remaining = rows.filter((row) => !matchesLeagueFollow(row, detail.entityId));
    if (!detail.isFavorite) {
        return remaining;
    }

    return [buildLeagueRowFromDetail(detail), ...remaining];
}

function applyClubDetail(rows: ClubFollowRow[], detail: FavoriteUpdatedDetail): ClubFollowRow[] {
    const remaining = rows.filter((row) => !matchesClubFollow(row, detail.entityId));
    if (!detail.isFavorite) {
        return remaining;
    }

    return [buildClubRowFromDetail(detail), ...remaining];
}

export function useFavorites() {
    const pathname = usePathname();
    const { login, user, isLoading: authLoading, isSessionVerified } = useAuth();
    const supabase = useMemo(() => createClient(), []);

    const [leagueRows, setLeagueRows] = useState<LeagueFollowRow[]>([]);
    const [clubRows, setClubRows] = useState<ClubFollowRow[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const refresh = useCallback(async () => {
        if (!FAVORITES_ENABLED || authLoading || !isSessionVerified || !user?.id) {
            setLeagueRows([]);
            setClubRows([]);
            setError(null);
            setLoading(false);
            return;
        }

        setLoading(true);
        try {
            const { data: { session }, error: sessionError } = await supabase.auth.getSession();
            if (sessionError) {
                throw sessionError;
            }

            if (session?.user?.id !== user.id) {
                setLeagueRows([]);
                setClubRows([]);
                setError(null);
                return;
            }

            const [leaguesResult, clubsResult] = await Promise.all([
                FAVORITE_LEAGUES_ENABLED
                    ? settleFollowing(getFollowedLeagues(supabase, user.id))
                    : Promise.resolve({ data: [] as LeagueFollowRow[], error: null }),
                FAVORITE_CLUBS_ENABLED
                    ? settleFollowing(getFollowedClubs(supabase, user.id))
                    : Promise.resolve({ data: [] as ClubFollowRow[], error: null }),
            ]);

            const blockingError = [leaguesResult.error, clubsResult.error]
                .filter(Boolean)
                .find((err) => !isFollowingSchemaMissingError(err));

            if (blockingError) {
                throw blockingError;
            }

            setLeagueRows(leaguesResult.data ?? []);
            setClubRows(clubsResult.data ?? []);
            setError(null);
        } catch (err) {
            const message = isFollowingSchemaMissingError(err)
                ? 'Falta aplicar la migracion de seguidos en Supabase.'
                : getFollowingErrorMessage(err);

            if (isFollowingSchemaMissingError(err)) {
                console.warn('[useFavorites] following schema not available yet.');
            } else {
                console.error('[useFavorites] refresh error:', message, describeFollowingError(err));
            }

            setLeagueRows([]);
            setClubRows([]);
            setError(message);
        } finally {
            setLoading(false);
        }
    }, [authLoading, isSessionVerified, supabase, user?.id]);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    // On mobile the public auth bootstrap can time out and surface a cached
    // user (so the role/UI appears) before the real Supabase session is
    // established. `refresh`'s dependencies don't change when that background
    // session finally resolves, so favorites would stay empty forever.
    // Re-run the fetch whenever the session is (re)established or its token
    // is refreshed so the list recovers without a manual reload.
    useEffect(() => {
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
            if (
                event === 'SIGNED_IN' ||
                event === 'TOKEN_REFRESHED' ||
                event === 'USER_UPDATED'
            ) {
                void refresh();
            }
        });

        return () => {
            subscription.unsubscribe();
        };
    }, [refresh, supabase]);

    useEffect(() => {
        if (typeof window === 'undefined' || !user?.id) return;

        const handleFavoritesUpdated = (event: Event) => {
            const customEvent = event as CustomEvent<FavoriteUpdatedDetail>;
            const detail = customEvent.detail;
            if (!detail) return;
            if (detail.userId && detail.userId !== user.id) return;

            if (isLeagueEntityType(detail.entityType)) {
                setLeagueRows((current) => applyLeagueDetail(current, detail));
                return;
            }

            if (isClubEntityType(detail.entityType)) {
                setClubRows((current) => applyClubDetail(current, detail));
            }
        };

        window.addEventListener(FAVORITES_UPDATED_EVENT, handleFavoritesUpdated as EventListener);
        return () => {
            window.removeEventListener(FAVORITES_UPDATED_EVENT, handleFavoritesUpdated as EventListener);
        };
    }, [refresh, user?.id]);

    const favorites = useMemo(() => (
        [
            ...leagueRows.map(toLeagueFavoriteItem),
            ...clubRows.map(toClubFavoriteItem),
        ].sort((left, right) => right.created_at.localeCompare(left.created_at))
    ), [clubRows, leagueRows]);

    const ensureAuthenticated = useCallback(() => {
        if (user) return true;
        if (authLoading || !isSessionVerified) return false;

        const returnTo = typeof window !== 'undefined'
            ? `${window.location.pathname}${window.location.search}`
            : pathname || undefined;
        login('fan', returnTo);
        return false;
    }, [authLoading, isSessionVerified, login, pathname, user]);

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
        if (!ensureAuthenticated() || !user?.id) return;

        const options = typeof nameOrOptions === 'string'
            ? { name: nameOrOptions }
            : (nameOrOptions || {});
        const matchedRows = leagueRows.filter((row) => matchesLeagueFollow(row, entityId));
        const currentlyFavorite = matchedRows.length > 0;
        const nextIsFavorite = typeof options.forceIsFavorite === 'boolean'
            ? options.forceIsFavorite
            : !currentlyFavorite;
        const optimisticDetail: FavoriteUpdatedDetail = {
            userId: user.id,
            entityId,
            entityType: 'league',
            isFavorite: nextIsFavorite,
            name: options.name,
            logo_url: options.logo_url,
            type_label: options.type_label || 'Torneo',
            created_at: new Date().toISOString(),
        };
        const previousLeagueRows = leagueRows;

        setLeagueRows((current) => applyLeagueDetail(current, optimisticDetail));

        try {
            const result = await toggleLeagueFollow(supabase, user.id, {
                entityId,
                name: options.name,
                logoUrl: options.logo_url,
                sportId: options.sportId,
                canonicalLeagueId: options.followerTournamentId || null,
                forceIsFavorite: options.forceIsFavorite,
                existingRows: matchedRows,
            });

            dispatchFavoriteUpdated({
                userId: user.id,
                entityId,
                entityType: 'league',
                isFavorite: result.isFollowing,
                name: options.name,
                logo_url: options.logo_url,
                type_label: options.type_label || 'Torneo',
            });

            setError(null);
        } catch (err) {
            setLeagueRows(previousLeagueRows);
            const message = isFollowingSchemaMissingError(err)
                ? 'La tabla user_favorite_leagues todavia no esta disponible para la API. Recarga el schema de Supabase o verifica que la migracion se ejecuto en el proyecto correcto.'
                : getFollowingErrorMessage(err);
            console.error('[useFavorites] toggleLeagueFavorite error:', message, err);
            setError(message);
        }
    }, [ensureAuthenticated, leagueRows, supabase, user?.id]);

    const toggleFavorite = useCallback(async (item: ToggleFavoriteInput) => {
        if (!FAVORITES_ENABLED) return;
        if (!ensureAuthenticated() || !user?.id) return;

        if (isClubEntityType(item.entity_type) && FAVORITE_CLUBS_ENABLED) {
            const matchedRows = clubRows.filter((row) => matchesClubFollow(row, item.id));
            const currentlyFavorite = matchedRows.length > 0;
            const nextIsFavorite = typeof item.forceIsFavorite === 'boolean'
                ? item.forceIsFavorite
                : !currentlyFavorite;
            const optimisticDetail: FavoriteUpdatedDetail = {
                userId: user.id,
                entityId: item.id,
                entityType: 'club',
                isFavorite: nextIsFavorite,
                name: item.name,
                logo_url: item.logo_url,
                type_label: item.type_label || 'Club',
                created_at: new Date().toISOString(),
            };
            const previousClubRows = clubRows;

            setClubRows((current) => applyClubDetail(current, optimisticDetail));

            try {
                const result = await toggleClubFollow(supabase, user.id, {
                    entityId: item.id,
                    name: item.name,
                    logoUrl: item.logo_url,
                    sportId: item.sport_id,
                    canonicalClubId: item.canonical_id || null,
                    forceIsFavorite: item.forceIsFavorite,
                    existingRows: matchedRows,
                });

                dispatchFavoriteUpdated({
                    userId: user.id,
                    entityId: item.id,
                    entityType: 'club',
                    isFavorite: result.isFollowing,
                    name: item.name,
                    logo_url: item.logo_url,
                    type_label: item.type_label || 'Club',
                });

                setError(null);
            } catch (err) {
                setClubRows(previousClubRows);
                const message = isFollowingSchemaMissingError(err)
                    ? 'La tabla user_favorite_clubs todavia no esta disponible para la API. Recarga el schema de Supabase o verifica que la migracion se ejecuto en el proyecto correcto.'
                    : getFollowingErrorMessage(err);
                console.error('[useFavorites] toggleClubFavorite error:', message, err);
                setError(message);
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
    }, [clubRows, ensureAuthenticated, supabase, toggleLeagueFavorite, user?.id]);

    const loadMore = useCallback(() => {}, []);

    return {
        favorites,
        hasMore: false,
        loading,
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
    const { isFavorite, loading, toggleFavorite } = useFavorites();

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
