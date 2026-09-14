'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Lo que comparten las piezas del apartado de los Juegos: la hora de Santa
 * Fe, los rótulos de los días, el pedido a `/api/odesur` y la URL.
 */

export const TIME_ZONE = 'America/Argentina/Buenos_Aires';

/** Cada cuánto se refresca lo que está a la vista. */
export const REFRESH_MS = 45_000;

// El huso es fijo (el de las sedes) para que el servidor y el cliente pinten la
// misma hora: con el del navegador, la hidratación no coincidiría fuera del país.
const timeFormat = new Intl.DateTimeFormat('es-AR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: TIME_ZONE,
});
const dayKeyFormat = new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE });
const weekdayFormat = new Intl.DateTimeFormat('es-AR', { weekday: 'short', timeZone: 'UTC' });
const longDayFormat = new Intl.DateTimeFormat('es-AR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });

export function formatTime(iso: string | null): string {
    if (!iso) return '--:--';
    const date = new Date(iso);
    return Number.isNaN(date.getTime()) ? '--:--' : timeFormat.format(date);
}

export function dayKeyOf(iso: string | null): string {
    if (!iso) return '';
    const date = new Date(iso);
    return Number.isNaN(date.getTime()) ? '' : dayKeyFormat.format(date);
}

/** "2026-09-15" -> { weekday: "mar", number: 15, long: "martes, 15 de septiembre" }. */
export function dayLabels(day: string) {
    const date = new Date(`${day}T12:00:00Z`);
    return {
        weekday: weekdayFormat.format(date).replace('.', ''),
        number: Number(day.slice(8, 10)),
        long: longDayFormat.format(date),
    };
}

export function daysBetween(first: string, last: string): string[] {
    const days: string[] = [];
    const cursor = new Date(`${first}T12:00:00Z`);
    const end = new Date(`${last}T12:00:00Z`);
    while (cursor <= end) {
        days.push(cursor.toISOString().slice(0, 10));
        cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    return days;
}

/**
 * "200 m combinado" no se corta entre el número y la unidad ("200 / m"), ni
 * "Ronda 1" entre la palabra y su número ("Ronda / 1").
 */
export function keepUnits(text: string): string {
    return text
        .replace(/(\d) (m|km|kg)(?=$|[\s·,)])/g, '$1 $2')
        .replace(/\b(Ronda|Serie|Partido|Combate|Grupo|Regatas?|Día|Subdivisión|Pasada) (\d+|[A-Z]\b)/g, '$1 $2');
}

/**
 * Centra un elemento dentro de una fila que se desliza de costado (la tira de
 * días, el calendario), sin mover la página de arriba abajo: `scrollIntoView`
 * también corre el scroll vertical.
 */
export function centerInScroller(scroller: HTMLElement | null, target: Element | null, offsetStart = 0) {
    if (!scroller || !(target instanceof HTMLElement)) return;
    const left = target.offsetLeft - offsetStart - (scroller.clientWidth - offsetStart - target.offsetWidth) / 2;
    scroller.scrollLeft = Math.max(0, left);
}

export function plural(count: number, one: string, many: string): string {
    return `${count} ${count === 1 ? one : many}`;
}

async function fetchView<T>(query: string, signal?: AbortSignal): Promise<T> {
    const response = await fetch(`/api/odesur?${query}`, { signal, cache: 'no-store' });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
        throw new Error(body && typeof body.error === 'string' ? body.error : 'No se pudo cargar.');
    }
    return body as T;
}

export function replaceUrl(params: Record<string, string>) {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
        if (value) search.set(key, value);
    }
    const query = search.toString();
    // replaceState nativo: `router.push` re-renderiza el árbol entero y pierde
    // el scroll, y acá solo cambia lo que se está mirando.
    window.history.replaceState(window.history.state, '', query ? `?${query}` : window.location.pathname);
}

type ApiState<T> = {
    data: T | null;
    /** Primera carga de esta consulta: todavía no hay nada que mostrar. */
    loading: boolean;
    error: string | null;
    reload: () => void;
};

/**
 * Un pedido a `/api/odesur` con memoria por consulta: volver a un día ya
 * visto no lo vuelve a esperar, y lo que está a la vista se refresca solo
 * cada `REFRESH_MS` mientras la pestaña está visible (un teléfono en el
 * bolsillo no tiene por qué pedirle nada a nadie).
 *
 * `seed` es lo que ya pintó el servidor. `shouldRefetch` vuelve a pedir en
 * el acto algo que llegó incompleto (una agenda sin competidores).
 */
export function useOdesurApi<T>(
    query: string | null,
    seed?: { query: string; data: T | null } | null,
    shouldRefetch?: (data: T) => boolean,
): ApiState<T> {
    const [store, setStore] = useState<Record<string, T>>(() => (
        seed?.data ? { [seed.query]: seed.data } : {}
    ));
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [pending, setPending] = useState<string | null>(null);
    const storeRef = useRef(store);
    const controllerRef = useRef<AbortController | null>(null);
    const refetchRef = useRef(shouldRefetch);

    useEffect(() => {
        storeRef.current = store;
    }, [store]);
    useEffect(() => {
        refetchRef.current = shouldRefetch;
    }, [shouldRefetch]);

    const load = useCallback(async (target: string, background: boolean) => {
        controllerRef.current?.abort();
        const controller = new AbortController();
        controllerRef.current = controller;
        if (!background) setPending(target);
        try {
            const data = await fetchView<T>(target, controller.signal);
            setStore((current) => ({ ...current, [target]: data }));
            setErrors((current) => {
                if (!current[target]) return current;
                const next = { ...current };
                delete next[target];
                return next;
            });
        } catch (error) {
            if ((error as Error).name === 'AbortError') return;
            // Un refresco que falla no borra lo que ya se ve: solo avisa si no
            // había nada.
            if (!background || !storeRef.current[target]) {
                setErrors((current) => ({ ...current, [target]: (error as Error).message || 'No se pudo cargar.' }));
            }
        } finally {
            if (controllerRef.current === controller) {
                controllerRef.current = null;
                setPending((current) => (current === target ? null : current));
            }
        }
    }, []);

    useEffect(() => {
        if (!query) return;
        const cached = storeRef.current[query];
        if (!cached) {
            void load(query, false);
        } else if (refetchRef.current?.(cached)) {
            void load(query, true);
        }
    }, [query, load]);

    useEffect(() => {
        if (!query) return undefined;
        const timer = window.setInterval(() => {
            if (document.visibilityState === 'visible') void load(query, true);
        }, REFRESH_MS);
        return () => window.clearInterval(timer);
    }, [query, load]);

    useEffect(() => () => controllerRef.current?.abort(), []);

    const reload = useCallback(() => {
        if (query) void load(query, false);
    }, [query, load]);

    const data = query ? store[query] ?? null : null;
    return {
        data,
        loading: Boolean(query) && pending === query && !data,
        error: query ? errors[query] ?? null : null,
        reload,
    };
}
