'use client';

import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';

/**
 * Los filtros de Estadísticas viven en la URL, igual que los de Posiciones.
 *
 * Mismo motivo y mismas dos decisiones: se escribe con la API nativa de
 * `history` —integrada con el App Router desde Next 14.1— para no volver a
 * renderizar los componentes de servidor de `page.tsx` en cada cambio de
 * filtro, y siempre con `replaceState`, porque elegir un equipo y después otro
 * no debería dejar dos entradas en el historial.
 *
 * Estos filtros son de UI pura (pestaña, equipo, jugador, alcance, orden), así
 * que no se validan contra la base: se comprueban contra la lista de valores
 * posibles en el componente, que es quien la conoce.
 */

export type StatsUrlPatch = Record<string, string | null | undefined>;

const KEYS = [
    'statsTab',
    'statsGroup',
    'statsTeam',
    'statsPlayer',
    'statsScope',
    'statsSort',
    'statsDir',
] as const;

export type StatsUrlKey = (typeof KEYS)[number];

function writeParams(patch: StatsUrlPatch) {
    if (typeof window === 'undefined') return;

    const params = new URLSearchParams(window.location.search);
    for (const [key, value] of Object.entries(patch)) {
        if (value === undefined) continue;
        if (value === null || value === '') params.delete(key);
        else params.set(key, value);
    }

    const query = params.toString();
    const next = `${window.location.pathname}${query ? `?${query}` : ''}`;
    if (next === `${window.location.pathname}${window.location.search}`) return;

    window.history.replaceState(null, '', next);
}

export function useStatsUrlState() {
    const searchParams = useSearchParams();

    const values = useMemo(() => {
        const out = {} as Record<StatsUrlKey, string | null>;
        for (const key of KEYS) out[key] = searchParams.get(key);
        return out;
    }, [searchParams]);

    const setStatsParams = useCallback((patch: StatsUrlPatch) => {
        writeParams(patch);
    }, []);

    return { values, setStatsParams };
}

/**
 * Devuelve el valor de la URL sólo si está entre los permitidos; si no, el
 * default. Una URL editada a mano no debería poder poner la pantalla en un
 * estado que la UI no sabe dibujar.
 */
export function pickAllowed<T extends string>(
    raw: string | null,
    allowed: readonly T[],
    fallback: T,
): T {
    return raw && (allowed as readonly string[]).includes(raw) ? (raw as T) : fallback;
}
