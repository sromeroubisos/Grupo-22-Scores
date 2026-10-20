// Store ÚNICO de lo que sigue el usuario logueado (ligas y clubes).
//
// Por qué existe: `useFavorites` guardaba el estado en cada instancia. Cada
// estrella, cada fila de liga y cada página pedía los seguidos por su cuenta y
// arrancaba con la lista vacía, así que:
//   - una pantalla con N estrellas hacía N pedidos (y N re-pedidos en cada
//     TOKEN_REFRESHED, porque cada instancia escuchaba el auth);
//   - hasta que llegaba la respuesta, la estrella decía "no seguís" y después
//     saltaba a "seguís": el parpadeo que se veía en la portada;
//   - un pedido lento podía pisar un toggle optimista con datos viejos.
//
// Acá hay una sola copia: un pedido en vuelo a la vez, datos del último
// resultado conocido en localStorage para pintar al instante, y las respuestas
// viejas se descartan si hubo un cambio mientras viajaban.

import type { SupabaseClient } from '@supabase/supabase-js';

import { FAVORITES_LOCAL_CACHE_KEY, FAVORITES_LOCAL_CACHE_OWNER_KEY } from '@/lib/favorites/fetchFavorites';
import {
    getFollowedClubs,
    getFollowedLeagues,
    getFollowingErrorMessage,
    isFollowingSchemaMissingError,
    matchesClubFollow,
    matchesLeagueFollow,
    toggleClubFollow,
    toggleLeagueFollow,
    type ClubFollowRow,
    type LeagueFollowRow,
} from '@/lib/services/followingService';
import { getFavoriteSports, saveFavoriteSports } from '@/lib/services/preferencesService';
import {
    FAVORITE_CLUBS_ENABLED,
    FAVORITE_LEAGUES_ENABLED,
} from '@/lib/favorites/config';
import { readLocalPreferences, writeLocalPreferences, type PrefItem } from '@/lib/localPreferences';

export interface FavoritesSnapshot {
    /** Usuario al que pertenecen las filas. null = nadie cargado. */
    userId: string | null;
    leagues: LeagueFollowRow[];
    clubs: ClubFollowRow[];
    /** Hay datos confiables: de la red o del último resultado conocido del mismo usuario. */
    ready: boolean;
    /** Hay una consulta en vuelo (no bloquea la interfaz: los datos viejos se siguen mostrando). */
    refreshing: boolean;
    error: string | null;
}

const EMPTY: FavoritesSnapshot = {
    userId: null,
    leagues: [],
    clubs: [],
    ready: false,
    refreshing: false,
    error: null,
};

// No se vuelve a pedir si se pidió hace menos que esto: montar diez pantallas
// seguidas no son diez consultas.
const FRESH_MS = 45_000;

let snapshot: FavoritesSnapshot = EMPTY;
let fetchedAt = 0;
let inFlight: { userId: string; promise: Promise<void> } | null = null;
// Sube con cada cambio hecho por el usuario. Una respuesta del servidor que
// salió ANTES del cambio no puede pisarlo.
let mutationVersion = 0;
let syncedUserId: string | null = null;
const listeners = new Set<() => void>();

function emit(next: FavoritesSnapshot) {
    snapshot = next;
    listeners.forEach((listener) => listener());
}

export function getFavoritesSnapshot(): FavoritesSnapshot {
    return snapshot;
}

export function getServerFavoritesSnapshot(): FavoritesSnapshot {
    return EMPTY;
}

export function subscribeFavorites(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

function readPersisted(userId: string): { leagues: LeagueFollowRow[]; clubs: ClubFollowRow[] } | null {
    if (typeof window === 'undefined') return null;
    try {
        if (window.localStorage.getItem(FAVORITES_LOCAL_CACHE_OWNER_KEY) !== userId) return null;
        const raw = window.localStorage.getItem(FAVORITES_LOCAL_CACHE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as { leagues?: unknown; clubs?: unknown };
        if (!Array.isArray(parsed.leagues) || !Array.isArray(parsed.clubs)) return null;
        return { leagues: parsed.leagues as LeagueFollowRow[], clubs: parsed.clubs as ClubFollowRow[] };
    } catch {
        return null;
    }
}

function persist(userId: string, leagues: LeagueFollowRow[], clubs: ClubFollowRow[]) {
    if (typeof window === 'undefined') return;
    try {
        window.localStorage.setItem(FAVORITES_LOCAL_CACHE_OWNER_KEY, userId);
        window.localStorage.setItem(FAVORITES_LOCAL_CACHE_KEY, JSON.stringify({ leagues, clubs }));
    } catch {
        // Sin espacio o sin acceso: la próxima entrada vuelve a pedirlo.
    }
}

/** Saca de memoria lo de otro usuario (o de nadie). No toca el disco: eso lo limpia el cierre de sesión. */
export function resetFavoritesStore() {
    if (snapshot === EMPTY) return;
    fetchedAt = 0;
    inFlight = null;
    syncedUserId = null;
    emit(EMPTY);
}

/** Pone en pantalla lo último que se supo de este usuario, antes de que conteste la red. */
function hydrate(userId: string) {
    if (snapshot.userId === userId) return;
    const persisted = readPersisted(userId);
    emit({
        userId,
        leagues: persisted?.leagues ?? [],
        clubs: persisted?.clubs ?? [],
        ready: persisted !== null,
        refreshing: false,
        error: null,
    });
}

/** Pinta lo último conocido de `userId` sin tocar la red (el usuario cacheado llega antes que la sesión). */
export function primeFavorites(userId: string) {
    if (snapshot.userId !== null && snapshot.userId !== userId) resetFavoritesStore();
    hydrate(userId);
}

async function fetchFromServer(supabase: SupabaseClient, userId: string): Promise<void> {
    const startedAtVersion = mutationVersion;
    emit({ ...snapshot, refreshing: true });

    try {
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;
        // Usuario "optimista" de cache sin sesión real todavía: RLS devolvería
        // vacío y borraría lo que se está mostrando. Se espera al SIGNED_IN.
        if (session?.user?.id !== userId) {
            emit({ ...snapshot, refreshing: false });
            return;
        }

        const settle = async <T,>(enabled: boolean, load: () => Promise<T[]>) => {
            if (!enabled) return { data: [] as T[], error: null as unknown };
            try {
                return { data: await load(), error: null as unknown };
            } catch (error) {
                return { data: null, error };
            }
        };
        const [leaguesResult, clubsResult] = await Promise.all([
            settle(FAVORITE_LEAGUES_ENABLED, () => getFollowedLeagues(supabase as never, userId)),
            settle(FAVORITE_CLUBS_ENABLED, () => getFollowedClubs(supabase as never, userId)),
        ]);

        const blocking = [leaguesResult.error, clubsResult.error]
            .filter(Boolean)
            .find((error) => !isFollowingSchemaMissingError(error));
        if (blocking) throw blocking;

        // Si el usuario siguió o dejó de seguir algo mientras viajaba la
        // respuesta, esta ya es vieja: se descarta y se vuelve a pedir.
        if (mutationVersion !== startedAtVersion || snapshot.userId !== userId) {
            emit({ ...snapshot, refreshing: false });
            if (snapshot.userId === userId) {
                fetchedAt = 0;
                void ensureFavoritesLoaded(supabase, userId);
            }
            return;
        }

        const leagues = (leaguesResult.data ?? []) as LeagueFollowRow[];
        const clubs = (clubsResult.data ?? []) as ClubFollowRow[];
        fetchedAt = Date.now();
        emit({ userId, leagues, clubs, ready: true, refreshing: false, error: null });
        persist(userId, leagues, clubs);
        void syncLocalPreferences(supabase, userId);
    } catch (error) {
        const message = isFollowingSchemaMissingError(error)
            ? 'Falta aplicar la migracion de seguidos en Supabase.'
            : getFollowingErrorMessage(error);
        if (!isFollowingSchemaMissingError(error)) {
            console.error('[favoritesStore] refresh error:', message);
        }
        // Se conservan los datos que ya había: un fallo de red no es "no seguís nada".
        emit({ ...snapshot, refreshing: false, error: message });
    }
}

/**
 * Garantiza que los seguidos de `userId` estén cargados. Idempotente: llamarla
 * desde veinte componentes a la vez es un solo pedido.
 */
export function ensureFavoritesLoaded(
    supabase: SupabaseClient,
    userId: string,
    options: { force?: boolean } = {},
): Promise<void> {
    if (snapshot.userId !== null && snapshot.userId !== userId) resetFavoritesStore();
    hydrate(userId);
    registerAuthListener(supabase);

    if (inFlight?.userId === userId) return inFlight.promise;
    if (!options.force && snapshot.ready && Date.now() - fetchedAt < FRESH_MS) return Promise.resolve();

    const promise = fetchFromServer(supabase, userId).finally(() => {
        if (inFlight?.promise === promise) inFlight = null;
    });
    inFlight = { userId, promise };
    return promise;
}

let authListenerRegistered = false;
function registerAuthListener(supabase: SupabaseClient) {
    if (authListenerRegistered) return;
    authListenerRegistered = true;
    // Una sola suscripción para todo el sitio. En el teléfono el bootstrap puede
    // mostrar un usuario cacheado antes de que exista la sesión real; cuando
    // por fin se establece, los seguidos se piden de nuevo sin recargar.
    supabase.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_OUT') {
            resetFavoritesStore();
            return;
        }
        const userId = session?.user?.id;
        if (!userId) return;
        if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
            // Un refresh de token no cambia los seguidos: si ya están cargados no se repite.
            if (event === 'TOKEN_REFRESHED' && snapshot.ready) return;
            void ensureFavoritesLoaded(supabase, userId, { force: event === 'SIGNED_IN' });
        }
    });
}

// ─── Cambios hechos por el usuario ───────────────────────────────────────────

export type FavoriteChange =
    | { kind: 'league'; row: LeagueFollowRow; isFavorite: boolean }
    | { kind: 'club'; row: ClubFollowRow; isFavorite: boolean };

/** Aplica el cambio en pantalla YA. Devuelve cómo deshacerlo si el servidor lo rechaza. */
export function applyOptimisticChange(userId: string, change: FavoriteChange): () => void {
    if (snapshot.userId !== userId) hydrate(userId);
    mutationVersion += 1;
    const previous = snapshot;

    if (change.kind === 'league') {
        const rest = snapshot.leagues.filter((row) => !matchesLeagueFollow(row, change.row.league_id));
        emit({ ...snapshot, leagues: change.isFavorite ? [change.row, ...rest] : rest });
    } else {
        const rest = snapshot.clubs.filter((row) => !matchesClubFollow(row, change.row.club_id));
        emit({ ...snapshot, clubs: change.isFavorite ? [change.row, ...rest] : rest });
    }
    persist(userId, snapshot.leagues, snapshot.clubs);

    return () => {
        mutationVersion += 1;
        emit({ ...snapshot, leagues: previous.leagues, clubs: previous.clubs });
        persist(userId, previous.leagues, previous.clubs);
    };
}

// ─── Del dispositivo a la cuenta ─────────────────────────────────────────────

function toLeagueRow(item: PrefItem): LeagueFollowRow {
    return {
        league_id: item.id,
        canonical_league_id: null,
        sport_id: item.sportId ?? null,
        display_name: item.name,
        logo_url: item.logo ?? null,
        created_at: new Date().toISOString(),
    };
}

function toClubRow(item: PrefItem): ClubFollowRow {
    return {
        club_id: item.id,
        canonical_club_id: null,
        sport_id: item.sportId ?? null,
        display_name: item.name,
        logo_url: item.logo ?? null,
        created_at: new Date().toISOString(),
    };
}

/**
 * Lo que el visitante eligió antes de registrarse (onboarding sin cuenta) pasa a
 * su cuenta la primera vez que se la ve logueada. Lo que no se pueda subir se
 * queda en el dispositivo para el próximo intento: nunca se pierde una elección.
 */
async function syncLocalPreferences(supabase: SupabaseClient, userId: string) {
    if (syncedUserId === userId) return;
    syncedUserId = userId;

    const local = readLocalPreferences();
    if (local.leagues.length === 0 && local.clubs.length === 0 && local.sportIds.length === 0) return;

    const remainingLeagues: PrefItem[] = [];
    for (const item of local.leagues) {
        try {
            await toggleLeagueFollow(supabase as never, userId, {
                entityId: item.id,
                name: item.name,
                logoUrl: item.logo,
                sportId: item.sportId,
                forceIsFavorite: true,
                existingRows: snapshot.leagues,
            });
            applyOptimisticChange(userId, { kind: 'league', isFavorite: true, row: toLeagueRow(item) });
        } catch {
            remainingLeagues.push(item);
        }
    }

    const remainingClubs: PrefItem[] = [];
    for (const item of local.clubs) {
        try {
            await toggleClubFollow(supabase as never, userId, {
                entityId: item.id,
                name: item.name,
                logoUrl: item.logo,
                sportId: item.sportId,
                forceIsFavorite: true,
                existingRows: snapshot.clubs,
            });
            applyOptimisticChange(userId, { kind: 'club', isFavorite: true, row: toClubRow(item) });
        } catch {
            remainingClubs.push(item);
        }
    }

    if (local.sportIds.length > 0) {
        try {
            // Los deportes de la cuenta mandan: solo se suben si no tiene ninguno.
            const remote = await getFavoriteSports(supabase, userId);
            if (remote.length === 0) await saveFavoriteSports(supabase, userId, local.sportIds);
        } catch {
            // Queda el deporte en el dispositivo; se reintenta en la próxima sesión.
        }
    }

    writeLocalPreferences({ leagues: remainingLeagues, clubs: remainingClubs });
}
