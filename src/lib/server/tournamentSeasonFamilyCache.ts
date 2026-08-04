// Single-flight + TTL para la resolución de la "familia de temporadas" de un
// torneo (el barrido caro de buildTournamentSeasonNavigation en la página del
// gestor). Guarda la PROMESA (no el valor) → dos misses concurrentes comparten
// UN solo barrido (evita el dogpile / thundering-herd).
//
// TTL corto a propósito: la invalidación explícita (invalidateSeasonFamilyCache)
// solo alcanza ESTA instancia serverless; otras instancias caen por TTL.

type Entry<T> = { promise: Promise<T>; at: number };

const TTL_MS = 60_000; // 60s
const store = new Map<string, Entry<unknown>>();

export function getCachedSeasonFamily<T>(key: string, load: () => Promise<T>): Promise<T> {
    const now = Date.now();
    const hit = store.get(key) as Entry<T> | undefined;
    if (hit && now - hit.at < TTL_MS) return hit.promise; // fresco o EN VUELO → single-flight

    const promise = load();
    store.set(key, { promise, at: now });

    // Nunca cachear un fallo: si la carga rechaza, soltar la entrada para que el
    // próximo request reintente (no servir una familia rota durante 60s).
    promise.catch(() => {
        const current = store.get(key) as Entry<T> | undefined;
        if (current && current.promise === promise) store.delete(key);
    });

    return promise;
}

// Las mutaciones de temporada/relaciones son raras y la familia se comparte
// entre varias tournamentId (ediciones), así que un clear total es lo
// simple-correcto: no hay que calcular qué miembros desalojar.
export function invalidateSeasonFamilyCache(): void {
    store.clear();
}
