// Store único de favoritos (ligas y clubes seguidos).
//
// Por qué existe: `useFavorites` guardaba las filas en un `useState` por
// instancia. Cada botón de estrella, cada tarjeta y cada página que llamaba al
// hook arrancaba con "nada seguido, sin cargar" y pedía los favoritos por su
// cuenta (2 consultas a Supabase + `getSession()` por instancia). Resultado:
// una competición seguida se pintaba un instante como NO seguida y después
// saltaba a seguida, y la lista de ligas del día se reordenaba cuando llegaban
// los favoritos.
//
// Acá hay UNA copia de las filas por pestaña, y tiene tres propiedades:
//
//  1. Se hidrata sincrónicamente desde localStorage al fijar el dueño, así que
//     el primer pintado ya sabe qué sigue la persona (caché + revalidación en
//     segundo plano).
//  2. Una sola revalidación en vuelo por vez, con intervalo mínimo entre
//     pedidos. N componentes que montan juntos son 1 pedido, no N.
//  3. Una revalidación que vuelve DESPUÉS de una escritura optimista no pisa
//     el cambio: se descarta y se repite cuando las escrituras terminan.
//
// Sin dueño resuelto (`owner === null`, la sesión se está verificando) el store
// conserva lo que tiene en vez de vaciarse: vaciar y volver a llenar es
// exactamente el parpadeo que se quiere evitar.
//
// El dueño `GUEST_OWNER` es el visitante sin cuenta: sus favoritos viven solo
// en el dispositivo y, al iniciar sesión, se pasan a la cuenta.
//
// Es un módulo puro (sin React ni Supabase): las dependencias entran por
// `createFavoritesStore` para poder probarlo con `node --test`.

export const GUEST_OWNER = 'guest';

export const FAVORITES_STORAGE_PREFIX = 'g22:favorites:v1:';

/** Cuánto vale una copia local antes de pedirla de nuevo en segundo plano. */
export const FAVORITES_REVALIDATE_MIN_MS = 20_000;

export type FavoriteLeagueRow = {
    league_id: string;
    canonical_league_id: string | null;
    sport_id: string | null;
    display_name: string;
    logo_url: string | null;
    created_at: string;
};

export type FavoriteClubRow = {
    club_id: string;
    canonical_club_id: string | null;
    sport_id: string | null;
    display_name: string;
    logo_url: string | null;
    created_at: string;
};

export type FavoritesStatus = 'idle' | 'loading' | 'ready' | 'error';

export type FavoritesSnapshot = {
    /** Id de usuario, `GUEST_OWNER`, o null mientras la sesión se verifica. */
    owner: string | null;
    leagueRows: FavoriteLeagueRow[];
    clubRows: FavoriteClubRow[];
    status: FavoritesStatus;
    /**
     * Hay filas confiables para pintar: vienen de la copia local o del servidor.
     * Mientras sea false, "no sigue nada" no es una respuesta, es ignorancia.
     */
    hydrated: boolean;
    /** Último error de revalidación. Con `hydrated` se muestra sin vaciar la lista. */
    error: string | null;
};

export type FavoriteChange =
    | { kind: 'league'; entityId: string; isFavorite: boolean; row: FavoriteLeagueRow }
    | { kind: 'club'; entityId: string; isFavorite: boolean; row: FavoriteClubRow };

export type FavoritesLoadResult = {
    leagues: FavoriteLeagueRow[];
    clubs: FavoriteClubRow[];
} | null;

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export type FavoritesStoreDeps = {
    matchLeague: (row: FavoriteLeagueRow, entityId: string) => boolean;
    matchClub: (row: FavoriteClubRow, entityId: string) => boolean;
    storage?: StorageLike | null;
    now?: () => number;
};

type StoredFavorites = {
    savedAt: number;
    leagues: FavoriteLeagueRow[];
    clubs: FavoriteClubRow[];
};

const EMPTY_SNAPSHOT: FavoritesSnapshot = {
    owner: null,
    leagueRows: [],
    clubRows: [],
    status: 'idle',
    hydrated: false,
    error: null,
};

export function getEmptyFavoritesSnapshot(): FavoritesSnapshot {
    return EMPTY_SNAPSHOT;
}

export function createFavoritesStore(deps: FavoritesStoreDeps) {
    const now = deps.now ?? (() => Date.now());
    const storage = deps.storage ?? null;

    let snapshot: FavoritesSnapshot = EMPTY_SNAPSHOT;
    const listeners = new Set<() => void>();

    // Estado de la revalidación. `version` sube con cada escritura optimista:
    // si cambió entre que salió el pedido y volvió, la respuesta es vieja.
    let version = 0;
    let pendingMutations = 0;
    let inFlight: { owner: string; promise: Promise<void> } | null = null;
    let lastLoader: (() => Promise<FavoritesLoadResult>) | null = null;
    let refetchAfterSettle = false;
    const lastFetchedAt = new Map<string, number>();

    function emit() {
        listeners.forEach((listener) => listener());
    }

    function setSnapshot(next: Partial<FavoritesSnapshot>) {
        const merged = { ...snapshot, ...next };
        const changed = (Object.keys(merged) as Array<keyof FavoritesSnapshot>)
            .some((key) => merged[key] !== snapshot[key]);
        if (!changed) return;
        snapshot = merged;
        emit();
    }

    function storageKey(owner: string) {
        return `${FAVORITES_STORAGE_PREFIX}${owner}`;
    }

    function readStored(owner: string): StoredFavorites | null {
        if (!storage) return null;
        try {
            const raw = storage.getItem(storageKey(owner));
            if (!raw) return null;
            const parsed = JSON.parse(raw) as Partial<StoredFavorites> | null;
            if (!parsed || !Array.isArray(parsed.leagues) || !Array.isArray(parsed.clubs)) return null;
            return {
                savedAt: typeof parsed.savedAt === 'number' ? parsed.savedAt : 0,
                leagues: parsed.leagues,
                clubs: parsed.clubs,
            };
        } catch {
            return null;
        }
    }

    function persist(owner: string | null, leagues: FavoriteLeagueRow[], clubs: FavoriteClubRow[]) {
        if (!storage || !owner) return;
        try {
            const payload: StoredFavorites = { savedAt: now(), leagues, clubs };
            storage.setItem(storageKey(owner), JSON.stringify(payload));
        } catch {
            // Sin acceso a localStorage (modo privado, cuota): los favoritos siguen en memoria.
        }
    }

    function subscribe(listener: () => void) {
        listeners.add(listener);
        return () => {
            listeners.delete(listener);
        };
    }

    function getSnapshot() {
        return snapshot;
    }

    /**
     * Fija de quién son los favoritos. Mismo dueño: no hace nada. Dueño nuevo:
     * arranca desde SU copia local (o vacío y sin hidratar), nunca desde las
     * filas del dueño anterior. `null` conserva el estado actual.
     */
    function setOwner(owner: string | null) {
        if (owner === null || owner === snapshot.owner) return;

        const stored = readStored(owner);
        if (owner === GUEST_OWNER) {
            // El visitante no tiene servidor: lo local es la fuente de verdad.
            setSnapshot({
                owner,
                leagueRows: stored?.leagues ?? [],
                clubRows: stored?.clubs ?? [],
                status: 'ready',
                hydrated: true,
                error: null,
            });
            return;
        }

        setSnapshot({
            owner,
            leagueRows: stored?.leagues ?? [],
            clubRows: stored?.clubs ?? [],
            status: stored ? 'ready' : 'idle',
            hydrated: Boolean(stored),
            error: null,
        });
    }

    /**
     * Trae los favoritos del servidor. Devuelve la promesa en vuelo si ya hay
     * una para este dueño. `loader` devuelve null cuando la sesión todavía no
     * está lista: no es un error ni vacía la lista, simplemente no hay nada
     * que revalidar todavía.
     */
    function revalidate(
        loader: () => Promise<FavoritesLoadResult>,
        options: { force?: boolean } = {},
    ): Promise<void> {
        const owner = snapshot.owner;
        if (!owner || owner === GUEST_OWNER) return Promise.resolve();

        lastLoader = loader;

        if (inFlight && inFlight.owner === owner) return inFlight.promise;

        const fetchedAt = lastFetchedAt.get(owner);
        if (
            !options.force
            && snapshot.hydrated
            && fetchedAt !== undefined
            && now() - fetchedAt < FAVORITES_REVALIDATE_MIN_MS
        ) {
            return Promise.resolve();
        }

        if (!snapshot.hydrated) setSnapshot({ status: 'loading', error: null });

        const startedVersion = version;
        const promise = (async () => {
            try {
                // Siempre asíncrono: si `loader` tirara en forma sincrónica, el `finally`
                // correría antes de que `promise` exista.
                const result = await Promise.resolve().then(loader);
                if (snapshot.owner !== owner) return;

                if (result === null) {
                    // Sesión sin verificar: no se sabe nada nuevo. Si no había copia, vuelve a "sin datos".
                    if (!snapshot.hydrated) setSnapshot({ status: 'idle' });
                    return;
                }

                lastFetchedAt.set(owner, now());

                if (version !== startedVersion || pendingMutations > 0) {
                    // Hubo una escritura mientras viajaba el pedido: esta respuesta no la vio.
                    refetchAfterSettle = true;
                    if (!snapshot.hydrated) {
                        setSnapshot({ leagueRows: result.leagues, clubRows: result.clubs, status: 'ready', hydrated: true, error: null });
                    }
                    return;
                }

                persist(owner, result.leagues, result.clubs);
                setSnapshot({
                    leagueRows: result.leagues,
                    clubRows: result.clubs,
                    status: 'ready',
                    hydrated: true,
                    error: null,
                });
            } catch (error) {
                if (snapshot.owner !== owner) return;
                const message = error instanceof Error ? error.message : String(error);
                // Con copia local la lista se queda y el error se informa aparte.
                setSnapshot({
                    status: snapshot.hydrated ? 'ready' : 'error',
                    error: message,
                });
            } finally {
                if (inFlight?.promise === promise) inFlight = null;
            }
        })();

        inFlight = { owner, promise };
        return promise;
    }

    /**
     * Aplica un cambio en memoria y en la copia local ANTES de hablar con el
     * servidor. Devuelve cómo deshacerlo si el servidor lo rechaza. Todo cambio
     * se cierra con `settle()`.
     */
    function applyChange(change: FavoriteChange): () => void {
        version += 1;
        pendingMutations += 1;

        const previousLeagues = snapshot.leagueRows;
        const previousClubs = snapshot.clubRows;

        let leagueRows = previousLeagues;
        let clubRows = previousClubs;

        if (change.kind === 'league') {
            const remaining = previousLeagues.filter((row) => !deps.matchLeague(row, change.entityId));
            leagueRows = change.isFavorite ? [change.row, ...remaining] : remaining;
        } else {
            const remaining = previousClubs.filter((row) => !deps.matchClub(row, change.entityId));
            clubRows = change.isFavorite ? [change.row, ...remaining] : remaining;
        }

        persist(snapshot.owner, leagueRows, clubRows);
        setSnapshot({ leagueRows, clubRows, hydrated: true, status: 'ready' });

        return () => {
            version += 1;
            // Deshace solo lo de ESTA entidad: otras escrituras en vuelo no se tocan.
            if (change.kind === 'league') {
                const previousMatches = previousLeagues.filter((row) => deps.matchLeague(row, change.entityId));
                const current = snapshot.leagueRows.filter((row) => !deps.matchLeague(row, change.entityId));
                const restored = [...previousMatches, ...current];
                persist(snapshot.owner, restored, snapshot.clubRows);
                setSnapshot({ leagueRows: restored });
            } else {
                const previousMatches = previousClubs.filter((row) => deps.matchClub(row, change.entityId));
                const current = snapshot.clubRows.filter((row) => !deps.matchClub(row, change.entityId));
                const restored = [...previousMatches, ...current];
                persist(snapshot.owner, snapshot.leagueRows, restored);
                setSnapshot({ clubRows: restored });
            }
        };
    }

    /** Cierra una escritura. Si una revalidación quedó descartada, la repite. */
    function settle(): Promise<void> {
        pendingMutations = Math.max(0, pendingMutations - 1);
        if (pendingMutations === 0 && refetchAfterSettle && lastLoader) {
            refetchAfterSettle = false;
            return revalidate(lastLoader, { force: true });
        }
        return Promise.resolve();
    }

    /** Reemplaza todo de una vez (alta masiva del onboarding, sincronización). */
    function replaceAll(leagues: FavoriteLeagueRow[], clubs: FavoriteClubRow[]) {
        version += 1;
        persist(snapshot.owner, leagues, clubs);
        setSnapshot({ leagueRows: leagues, clubRows: clubs, hydrated: true, status: 'ready', error: null });
    }

    /** Borra la copia local de un dueño (después de pasar los favoritos de visitante a la cuenta). */
    function clearStored(owner: string) {
        if (!storage) return;
        try {
            storage.removeItem(storageKey(owner));
        } catch {
            // Sin acceso: no hay nada que borrar.
        }
    }

    function readStoredRows(owner: string) {
        const stored = readStored(owner);
        return stored ? { leagues: stored.leagues, clubs: stored.clubs } : { leagues: [], clubs: [] };
    }

    /** Descarta todo el estado (cierre de sesión explícito o tests). */
    function reset() {
        version += 1;
        pendingMutations = 0;
        inFlight = null;
        lastLoader = null;
        refetchAfterSettle = false;
        lastFetchedAt.clear();
        snapshot = EMPTY_SNAPSHOT;
        emit();
    }

    return {
        subscribe,
        getSnapshot,
        setOwner,
        revalidate,
        applyChange,
        settle,
        replaceAll,
        clearStored,
        readStoredRows,
        reset,
    };
}

export type FavoritesStore = ReturnType<typeof createFavoritesStore>;
