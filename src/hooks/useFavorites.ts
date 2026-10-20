'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useState, useSyncExternalStore } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import {
    FAVORITES_ENABLED,
    FAVORITE_CLUBS_ENABLED,
    FAVORITE_LEAGUES_ENABLED,
} from '@/lib/favorites/config';
import { favoriteEventMatches, type FavoriteUpdatedDetail } from '@/lib/favorites/events';
import {
    GUEST_OWNER,
    createFavoritesStore,
    getEmptyFavoritesSnapshot,
    type FavoritesLoadResult,
} from '@/lib/favorites/favoritesStore';
import { createClient } from '@/lib/supabase/client';
import {
    followClubsBulk,
    followLeaguesBulk,
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

// Una consulta a Supabase que no contesta no puede dejar la interfaz esperando
// para siempre: pasado este tiempo se informa el error y se conserva la copia local.
const LOAD_TIMEOUT_MS = 12_000;

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

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('La conexión tardó demasiado. Reintentá en un momento.')), ms);
        promise.then(
            (value) => { clearTimeout(timer); resolve(value); },
            (error) => { clearTimeout(timer); reject(error); },
        );
    });
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

// ─── Store compartido ────────────────────────────────────────────────────────
//
// Una sola copia de los favoritos por pestaña (ver lib/favorites/favoritesStore).
// Los hooks de abajo son vistas de ella: montar cincuenta botones de estrella
// cuesta un pedido, no cincuenta.

const lazyStorage = {
    getItem: (key: string) => window.localStorage.getItem(key),
    setItem: (key: string, value: string) => window.localStorage.setItem(key, value),
    removeItem: (key: string) => window.localStorage.removeItem(key),
};

const favoritesStore = createFavoritesStore({
    matchLeague: matchesLeagueFollow,
    matchClub: matchesClubFollow,
    storage: lazyStorage,
});

const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

/**
 * Pasa a la cuenta lo que el visitante siguió sin sesión y recién entonces
 * borra la copia local: si el alta falla, los favoritos siguen en el
 * dispositivo para el próximo intento.
 */
async function syncGuestFavoritesToAccount(supabase: SupabaseClient, userId: string): Promise<void> {
    const guest = favoritesStore.readStoredRows(GUEST_OWNER);
    if (guest.leagues.length === 0 && guest.clubs.length === 0) return;

    await Promise.all([
        followLeaguesBulk(supabase as never, userId, guest.leagues.map((row) => ({
            entityId: row.league_id,
            name: row.display_name,
            logoUrl: row.logo_url,
            sportId: row.sport_id,
        }))),
        followClubsBulk(supabase as never, userId, guest.clubs.map((row) => ({
            entityId: row.club_id,
            name: row.display_name,
            logoUrl: row.logo_url,
            sportId: row.sport_id,
        }))),
    ]);
    favoritesStore.clearStored(GUEST_OWNER);
}

async function loadFavoritesFromServer(supabase: SupabaseClient, userId: string): Promise<FavoritesLoadResult> {
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) throw sessionError;
    // La sesión real todavía no es la del usuario que muestra la interfaz: sin
    // ella las políticas de la base devuelven vacío, y vacío NO es "no sigue nada".
    if (session?.user?.id !== userId) return null;

    await syncGuestFavoritesToAccount(supabase, userId);

    const [leaguesResult, clubsResult] = await Promise.all([
        FAVORITE_LEAGUES_ENABLED
            ? settleFollowing(getFollowedLeagues(supabase as never, userId))
            : Promise.resolve({ data: [] as LeagueFollowRow[], error: null }),
        FAVORITE_CLUBS_ENABLED
            ? settleFollowing(getFollowedClubs(supabase as never, userId))
            : Promise.resolve({ data: [] as ClubFollowRow[], error: null }),
    ]);

    const blockingError = [leaguesResult.error, clubsResult.error]
        .filter(Boolean)
        .find((err) => !isFollowingSchemaMissingError(err));
    if (blockingError) throw blockingError;

    return { leagues: leaguesResult.data ?? [], clubs: clubsResult.data ?? [] };
}

function reportLoadError(error: unknown): string {
    if (isFollowingSchemaMissingError(error)) {
        console.warn('[useFavorites] following schema not available yet.');
        return 'Falta aplicar la migracion de seguidos en Supabase.';
    }
    const message = getFollowingErrorMessage(error);
    console.warn('[useFavorites] refresh error:', message, describeFollowingError(error));
    return message;
}

let authListenerBound = false;

function bindFavorites(owner: string | null, supabase: SupabaseClient) {
    favoritesStore.setOwner(owner);

    if (!FAVORITES_ENABLED || !owner || owner === GUEST_OWNER) return;

    const userId = owner;
    void favoritesStore.revalidate(() => withTimeout(loadFavoritesFromServer(supabase, userId), LOAD_TIMEOUT_MS));

    // En el celular el arranque de auth puede mostrar un usuario cacheado antes de
    // que exista la sesión real. Cuando se establece, la primera lectura devolvió
    // null y los favoritos quedarían sin traer: se reintenta al confirmarse la
    // sesión. Un único oyente para todas las instancias del hook.
    if (authListenerBound) return;
    authListenerBound = true;
    supabase.auth.onAuthStateChange((event) => {
        if (event !== 'SIGNED_IN' && event !== 'USER_UPDATED' && event !== 'TOKEN_REFRESHED') return;
        const current = favoritesStore.getSnapshot();
        if (!current.owner || current.owner === GUEST_OWNER) return;
        const currentOwner = current.owner;
        // Con copia reciente el store descarta el pedido solo; sin ella o tras un error, lo hace.
        void favoritesStore.revalidate(
            () => withTimeout(loadFavoritesFromServer(supabase, currentOwner), LOAD_TIMEOUT_MS),
            { force: current.status === 'error' || !current.hydrated },
        );
    });
}

export function useFavorites() {
    const pathname = usePathname();
    const { login, user, isLoading: authLoading, isSessionVerified } = useAuth();
    const supabase = useMemo(() => createClient(), []);
    const [actionError, setActionError] = useState<string | null>(null);

    // `null` mientras la sesión se verifica: el store conserva lo que tiene en vez de vaciarse.
    const owner = authLoading || !isSessionVerified ? null : (user?.id ?? GUEST_OWNER);

    const snapshot = useSyncExternalStore(
        favoritesStore.subscribe,
        favoritesStore.getSnapshot,
        getEmptyFavoritesSnapshot,
    );

    // Antes de pintar: la copia local ya está en el primer cuadro visible.
    useIsomorphicLayoutEffect(() => {
        favoritesStore.setOwner(owner);
    }, [owner]);

    useEffect(() => {
        bindFavorites(owner, supabase);
    }, [owner, supabase]);

    const { leagueRows, clubRows } = snapshot;
    const ready = FAVORITES_ENABLED ? snapshot.hydrated && snapshot.owner !== null : true;
    const loading = FAVORITES_ENABLED && !snapshot.hydrated && snapshot.status !== 'error';
    const error = actionError ?? snapshot.error;

    const refresh = useCallback(async () => {
        if (!FAVORITES_ENABLED || !owner || owner === GUEST_OWNER) return;
        await favoritesStore.revalidate(
            () => withTimeout(loadFavoritesFromServer(supabase, owner), LOAD_TIMEOUT_MS),
            { force: true },
        );
    }, [owner, supabase]);

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
        // La sesión se está verificando: no se sabe si es visitante o cuenta.
        if (!owner) return;

        const options = typeof nameOrOptions === 'string'
            ? { name: nameOrOptions }
            : (nameOrOptions || {});
        const current = favoritesStore.getSnapshot().leagueRows;
        const matchedRows = current.filter((row) => matchesLeagueFollow(row, entityId));
        const nextIsFavorite = typeof options.forceIsFavorite === 'boolean'
            ? options.forceIsFavorite
            : matchedRows.length === 0;

        const undo = favoritesStore.applyChange({
            kind: 'league',
            entityId,
            isFavorite: nextIsFavorite,
            row: {
                league_id: entityId,
                canonical_league_id: options.followerTournamentId || null,
                sport_id: options.sportId || null,
                display_name: options.name?.trim() || entityId,
                logo_url: options.logo_url || null,
                created_at: new Date().toISOString(),
            },
        });

        try {
            // El visitante sin cuenta sigue en el dispositivo; la cuenta, en el servidor.
            if (owner !== GUEST_OWNER) {
                const result = await toggleLeagueFollow(supabase as never, owner, {
                    entityId,
                    name: options.name,
                    logoUrl: options.logo_url,
                    sportId: options.sportId,
                    canonicalLeagueId: options.followerTournamentId || null,
                    forceIsFavorite: options.forceIsFavorite,
                    existingRows: matchedRows,
                });
                if (result.isFollowing !== nextIsFavorite) {
                    // El servidor decidió otra cosa (carrera con otra pestaña): manda el servidor.
                    favoritesStore.applyChange({
                        kind: 'league',
                        entityId,
                        isFavorite: result.isFollowing,
                        row: {
                            league_id: entityId,
                            canonical_league_id: options.followerTournamentId || null,
                            sport_id: options.sportId || null,
                            display_name: options.name?.trim() || entityId,
                            logo_url: options.logo_url || null,
                            created_at: new Date().toISOString(),
                        },
                    });
                    void favoritesStore.settle();
                }
            }
            setActionError(null);
        } catch (err) {
            undo();
            const message = isFollowingSchemaMissingError(err)
                ? 'La tabla user_favorite_leagues todavia no esta disponible para la API. Recarga el schema de Supabase o verifica que la migracion se ejecuto en el proyecto correcto.'
                : getFollowingErrorMessage(err);
            console.error('[useFavorites] toggleLeagueFavorite error:', message, describeFollowingError(err));
            setActionError(message);
        } finally {
            void favoritesStore.settle();
        }
    }, [owner, supabase]);

    const toggleFavorite = useCallback(async (item: ToggleFavoriteInput) => {
        if (!FAVORITES_ENABLED) return;
        if (!owner) return;

        if (isClubEntityType(item.entity_type) && FAVORITE_CLUBS_ENABLED) {
            const current = favoritesStore.getSnapshot().clubRows;
            const matchedRows = current.filter((row) => matchesClubFollow(row, item.id));
            const nextIsFavorite = typeof item.forceIsFavorite === 'boolean'
                ? item.forceIsFavorite
                : matchedRows.length === 0;

            const row = {
                club_id: item.id,
                canonical_club_id: item.canonical_id || null,
                sport_id: item.sport_id || null,
                display_name: item.name?.trim() || item.id,
                logo_url: item.logo_url || null,
                created_at: new Date().toISOString(),
            };
            const undo = favoritesStore.applyChange({ kind: 'club', entityId: item.id, isFavorite: nextIsFavorite, row });

            try {
                if (owner !== GUEST_OWNER) {
                    const result = await toggleClubFollow(supabase as never, owner, {
                        entityId: item.id,
                        name: item.name,
                        logoUrl: item.logo_url,
                        sportId: item.sport_id,
                        canonicalClubId: item.canonical_id || null,
                        forceIsFavorite: item.forceIsFavorite,
                        existingRows: matchedRows,
                    });
                    if (result.isFollowing !== nextIsFavorite) {
                        favoritesStore.applyChange({ kind: 'club', entityId: item.id, isFavorite: result.isFollowing, row });
                        void favoritesStore.settle();
                    }
                }
                setActionError(null);
            } catch (err) {
                undo();
                const message = isFollowingSchemaMissingError(err)
                    ? 'La tabla user_favorite_clubs todavia no esta disponible para la API. Recarga el schema de Supabase o verifica que la migracion se ejecuto en el proyecto correcto.'
                    : getFollowingErrorMessage(err);
                console.error('[useFavorites] toggleClubFavorite error:', message, describeFollowingError(err));
                setActionError(message);
            } finally {
                void favoritesStore.settle();
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
    }, [owner, supabase, toggleLeagueFavorite]);

    /**
     * Alta masiva (onboarding): un upsert por tabla y el store actualizado de una
     * vez, así la pantalla siguiente ya muestra lo elegido sin esperar una lectura.
     */
    const followMany = useCallback(async (input: {
        leagues: Array<{ id: string; name: string; logo_url?: string | null; sport_id?: string | null }>;
        clubs: Array<{ id: string; name: string; logo_url?: string | null; sport_id?: string | null }>;
    }) => {
        if (!FAVORITES_ENABLED) return;
        if (!owner) throw new Error('Todavía estamos verificando tu sesión. Probá de nuevo en un momento.');

        const createdAt = new Date().toISOString();
        const leagueRowsNew: LeagueFollowRow[] = input.leagues.map((league) => ({
            league_id: league.id,
            canonical_league_id: null,
            sport_id: league.sport_id || null,
            display_name: league.name,
            logo_url: league.logo_url || null,
            created_at: createdAt,
        }));
        const clubRowsNew: ClubFollowRow[] = input.clubs.map((club) => ({
            club_id: club.id,
            canonical_club_id: null,
            sport_id: club.sport_id || null,
            display_name: club.name,
            logo_url: club.logo_url || null,
            created_at: createdAt,
        }));

        if (owner !== GUEST_OWNER) {
            const [leaguesSaved, clubsSaved] = await Promise.all([
                followLeaguesBulk(supabase as never, owner, input.leagues.map((l) => ({
                    entityId: l.id, name: l.name, logoUrl: l.logo_url, sportId: l.sport_id,
                }))),
                followClubsBulk(supabase as never, owner, input.clubs.map((c) => ({
                    entityId: c.id, name: c.name, logoUrl: c.logo_url, sportId: c.sport_id,
                }))),
            ]);
            // Lo guardado manda; lo que ya seguía y no se tocó se conserva.
            const current = favoritesStore.getSnapshot();
            const keepLeagues = current.leagueRows.filter((row) => !leaguesSaved.some((saved) => matchesLeagueFollow(saved, row.league_id)));
            const keepClubs = current.clubRows.filter((row) => !clubsSaved.some((saved) => matchesClubFollow(saved, row.club_id)));
            favoritesStore.replaceAll([...leaguesSaved, ...keepLeagues], [...clubsSaved, ...keepClubs]);
            return;
        }

        const current = favoritesStore.getSnapshot();
        const keepLeagues = current.leagueRows.filter((row) => !leagueRowsNew.some((added) => matchesLeagueFollow(added, row.league_id)));
        const keepClubs = current.clubRows.filter((row) => !clubRowsNew.some((added) => matchesClubFollow(added, row.club_id)));
        favoritesStore.replaceAll([...leagueRowsNew, ...keepLeagues], [...clubRowsNew, ...keepClubs]);
    }, [owner, supabase]);

    /**
     * Para el "iniciar sesión para seguir" que usaban los botones. Ya no hace falta
     * para seguir (el visitante sigue en su dispositivo), pero la invitación a
     * crear cuenta se conserva como acción explícita.
     */
    const promptLogin = useCallback(() => {
        const returnTo = typeof window !== 'undefined'
            ? `${window.location.pathname}${window.location.search}`
            : pathname || undefined;
        login('fan', returnTo);
    }, [login, pathname]);

    const loadMore = useCallback(() => {}, []);

    return {
        favorites,
        hasMore: false,
        loading,
        ready,
        isGuest: owner === GUEST_OWNER,
        error,
        isFavorite,
        toggleFavorite,
        isLeagueFavorite,
        toggleLeagueFavorite,
        followMany,
        promptLogin,
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
