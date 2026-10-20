'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
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
import { clearGuestFollows, readGuestFollows, writeGuestFollows } from '@/lib/favorites/guestFollows';
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
    const { user, isLoading: authLoading, isSessionVerified } = useAuth();
    const supabase = useMemo(() => createClient(), []);

    const [leagueRows, setLeagueRows] = useState<LeagueFollowRow[]>([]);
    const [clubRows, setClubRows] = useState<ClubFollowRow[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const refresh = useCallback(async () => {
        if (!FAVORITES_ENABLED) {
            setLeagueRows([]);
            setClubRows([]);
            setError(null);
            setLoading(false);
            return;
        }

        // Sin sesión (o mientras se resuelve): lo que el visitante siguió en
        // este dispositivo. Seguir ya no exige cuenta.
        if (authLoading || !isSessionVerified || !user?.id) {
            const guest = readGuestFollows();
            setLeagueRows(FAVORITE_LEAGUES_ENABLED ? guest.leagues : []);
            setClubRows(FAVORITE_CLUBS_ENABLED ? guest.clubs : []);
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

            let nextLeagueRows = leaguesResult.data ?? [];
            let nextClubRows = clubsResult.data ?? [];

            // Lo que siguió como invitado se sube a la cuenta la primera vez
            // que hay sesión, y la copia local se vacía.
            const guest = readGuestFollows();
            if (guest.leagues.length > 0 || guest.clubs.length > 0) {
                const pendingLeagues = FAVORITE_LEAGUES_ENABLED
                    ? guest.leagues.filter((row) => !nextLeagueRows.some((existing) => matchesLeagueFollow(existing, row.league_id)))
                    : [];
                const pendingClubs = FAVORITE_CLUBS_ENABLED
                    ? guest.clubs.filter((row) => !nextClubRows.some((existing) => matchesClubFollow(existing, row.club_id)))
                    : [];
                const results = await Promise.all([
                    ...pendingLeagues.map((row) => settleFollowing(toggleLeagueFollow(supabase, user.id, {
                        entityId: row.league_id,
                        name: row.display_name,
                        logoUrl: row.logo_url,
                        sportId: row.sport_id,
                        canonicalLeagueId: row.canonical_league_id,
                        forceIsFavorite: true,
                        existingRows: [],
                    }))),
                    ...pendingClubs.map((row) => settleFollowing(toggleClubFollow(supabase, user.id, {
                        entityId: row.club_id,
                        name: row.display_name,
                        logoUrl: row.logo_url,
                        sportId: row.sport_id,
                        canonicalClubId: row.canonical_club_id,
                        forceIsFavorite: true,
                        existingRows: [],
                    }))),
                ]);
                if (results.every((result) => !result.error)) {
                    clearGuestFollows();
                }
                nextLeagueRows = [...pendingLeagues, ...nextLeagueRows];
                nextClubRows = [...pendingClubs, ...nextClubRows];
            }

            setLeagueRows(nextLeagueRows);
            setClubRows(nextClubRows);
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
        if (typeof window === 'undefined') return;
        const currentUserId = user?.id ?? null;

        const handleFavoritesUpdated = (event: Event) => {
            const customEvent = event as CustomEvent<FavoriteUpdatedDetail>;
            const detail = customEvent.detail;
            if (!detail) return;
            // Un evento de invitado no toca la lista de una sesión, ni al revés.
            if ((detail.userId ?? null) !== currentUserId) return;

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

    /**
     * Seguir sin cuenta: el cambio va a localStorage y se avisa por el mismo
     * evento que usan las sesiones, con `userId: null`, para que las demás
     * instancias del hook (cabecera, inicio, torneo) se actualicen juntas.
     * Devuelve `true` si lo resolvió acá (no hay sesión).
     */
    const toggleGuestFollow = useCallback((detail: Omit<FavoriteUpdatedDetail, 'userId' | 'isFavorite' | 'created_at'> & {
        forceIsFavorite?: boolean;
        sportId?: string | null;
    }): boolean => {
        if (user?.id) return false;
        // Mientras se confirma la sesión no se escribe nada: podría ser un
        // usuario logueado cuyo perfil todavía no llegó.
        if (authLoading || !isSessionVerified) return true;

        const guest = readGuestFollows();
        const isLeague = isLeagueEntityType(detail.entityType);
        const currentlyFavorite = isLeague
            ? guest.leagues.some((row) => matchesLeagueFollow(row, detail.entityId))
            : guest.clubs.some((row) => matchesClubFollow(row, detail.entityId));
        const nextIsFavorite = typeof detail.forceIsFavorite === 'boolean'
            ? detail.forceIsFavorite
            : !currentlyFavorite;
        const fullDetail: FavoriteUpdatedDetail = {
            userId: null,
            entityId: detail.entityId,
            entityType: isLeague ? 'league' : 'club',
            isFavorite: nextIsFavorite,
            name: detail.name,
            logo_url: detail.logo_url,
            type_label: detail.type_label,
            created_at: new Date().toISOString(),
        };

        if (isLeague) {
            const leagues = applyLeagueDetail(guest.leagues, fullDetail).map((row) => (
                row.league_id === detail.entityId ? { ...row, sport_id: detail.sportId ?? row.sport_id } : row
            ));
            writeGuestFollows({ ...guest, leagues });
        } else {
            const clubs = applyClubDetail(guest.clubs, fullDetail).map((row) => (
                row.club_id === detail.entityId ? { ...row, sport_id: detail.sportId ?? row.sport_id } : row
            ));
            writeGuestFollows({ ...guest, clubs });
        }

        dispatchFavoriteUpdated(fullDetail);
        setError(null);
        return true;
    }, [authLoading, isSessionVerified, user?.id]);

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

        const options = typeof nameOrOptions === 'string'
            ? { name: nameOrOptions }
            : (nameOrOptions || {});
        if (toggleGuestFollow({
            entityId,
            entityType: 'league',
            name: options.name,
            logo_url: options.logo_url,
            type_label: options.type_label || 'Torneo',
            forceIsFavorite: options.forceIsFavorite,
            sportId: options.sportId,
        })) return;
        if (!user?.id) return;
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
    }, [leagueRows, supabase, toggleGuestFollow, user?.id]);

    const toggleFavorite = useCallback(async (item: ToggleFavoriteInput) => {
        if (!FAVORITES_ENABLED) return;

        if (isClubEntityType(item.entity_type) && FAVORITE_CLUBS_ENABLED) {
            if (toggleGuestFollow({
                entityId: item.id,
                entityType: 'club',
                name: item.name,
                logo_url: item.logo_url,
                type_label: item.type_label || 'Club',
                forceIsFavorite: item.forceIsFavorite,
                sportId: item.sport_id,
            })) return;
            if (!user?.id) return;

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
    }, [clubRows, supabase, toggleGuestFollow, toggleLeagueFavorite, user?.id]);

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
