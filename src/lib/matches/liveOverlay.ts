/**
 * Cómo la portada concilia el sondeo de "en vivo" con la lista del día.
 *
 * ── Por qué existe este archivo ────────────────────────────────────────────
 * Esta lógica vivía adentro de `useMatchesStore.ts` con una regla de tres
 * líneas: lo que está en el sondeo pasa a en vivo, lo que estaba en vivo y no
 * vino pasa a terminado. La regla es correcta cuando el sondeo dice la verdad,
 * y catastrófica cuando no la dice: un sondeo vacío por cualquier motivo que no
 * sea "terminaron todos" —la base que no contestó, un 5xx, un timeout de red,
 * una copia vieja del servidor de antes de que el partido arrancara— daba por
 * terminado TODO lo que estaba en juego. Y como después de eso no quedaba nada
 * en vivo, el sondeo se apagaba solo y la pantalla se quedaba en «FT» hasta
 * recargar. Así apareció Chile XV 52 - 12 Paraguay como finalizado con el
 * partido en el segundo tiempo (2026-09-02).
 *
 * La diferencia entre «no vino» y «no sé» es todo el archivo. Un partido se da
 * por terminado sólo cuando falta de un sondeo en el que SU fuente contestó.
 */

export interface LiveSnapshotSources {
    flashscore?: { ok?: boolean } | null;
    supabase?: { ok?: boolean } | null;
}

export interface LiveSnapshot<T> {
    matches: T[];
    /** Lo que el servidor dijo de cada fuente. Sin este dato, el sondeo se
     *  toma por bueno entero: es el contrato viejo del endpoint. */
    sources?: LiveSnapshotSources | null;
}

interface LiveMatchLike {
    id: string;
    status?: string | null;
    live_time?: number | null;
    source?: string | null;
}

/**
 * ¿Se puede confiar en que este partido, ausente del sondeo, terminó?
 *
 * Sólo si la fuente de la que sale ese partido contestó bien. Un partido de la
 * base no se cierra porque FlashScore se cayó, ni al revés.
 */
export function puedeDarPorTerminado(match: LiveMatchLike, sources: LiveSnapshotSources | null | undefined): boolean {
    if (!sources) return true;
    const fuente = match.source === 'db' ? sources.supabase : sources.flashscore;
    return fuente?.ok !== false;
}

/**
 * Mezcla el sondeo de en vivo en la lista del día.
 *
 *  - Lo que está en el sondeo pasa a `live` con sus campos frescos.
 *  - Lo que estaba en `live` y falta pasa a `final`, PERO sólo si su fuente
 *    contestó. Si el sondeo es `null` —no hubo respuesta— no se toca nada.
 *  - El resto queda igual.
 */
export function reconcileLiveOverlay<T extends LiveMatchLike>(
    current: T[],
    snapshot: LiveSnapshot<T> | null,
): T[] {
    if (!snapshot) return current;

    const nextLiveMap = new Map(snapshot.matches.map((m) => [m.id, m]));

    return current.map((m) => {
        const live = nextLiveMap.get(m.id);
        if (live) {
            return { ...m, ...live, status: 'live' as const };
        }
        if (m.status === 'live' && puedeDarPorTerminado(m, snapshot.sources)) {
            return { ...m, status: 'final' as const, live_time: null };
        }
        return m;
    });
}
