'use client';

import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { isUuid } from '@/lib/utils/postgrest';
import { DEFAULT_TABLE_TYPE, normalizeTableType, type TableType } from '@/lib/standings/tableType';
import { CIRCUIT_GLOBAL_SENTINEL } from './types';

/**
 * Fase, grupo y perspectiva viven en la URL, no en tres `useState`.
 *
 * Lo que se gana: la vista se puede compartir y se puede abrir en una pestaña
 * nueva. Lo que se evita: que el estado esté en dos lugares a la vez —la barra
 * de operación tenía su propia fase y Posiciones la suya, sincronizadas por un
 * efecto que podía discrepar.
 *
 * Se escribe con la API nativa de `history`, no con `router.replace`, y no es un
 * detalle: en el App Router `router.replace` sobre la misma ruta vuelve a
 * renderizar los componentes de servidor de `page.tsx`, y en esta pantalla eso
 * ya fue causa de caídas por saturación del pool. `window.history.replaceState`
 * está integrado con el App Router desde Next 14.1 —`useSearchParams()` se
 * entera— y no toca el servidor.
 *
 * Los filtros usan `replaceState` a propósito: cambiar de perspectiva seis veces
 * no debería obligar a apretar Atrás seis veces para salir. El subtab, que sí es
 * una navegación, usa `pushState`.
 */

export const STANDINGS_PHASE_PARAM = 'phaseId';
export const STANDINGS_GROUP_PARAM = 'groupId';
export const STANDINGS_TABLE_TYPE_PARAM = 'tableType';

export type StandingsUrlPatch = {
    phaseId?: string | null;
    groupId?: string | null;
    tableType?: TableType | null;
};

/**
 * Una fase válida es un UUID o el centinela del circuito. Cualquier otra cosa
 * —una URL editada a mano, un id de otro torneo— se trata como ausente en vez de
 * viajar a la base: `isUuid` es la misma guarda con la que el proyecto frena los
 * ids externos en columnas `uuid`.
 */
function readPhaseParam(value: string | null): string | null {
    if (!value) return null;
    if (value === CIRCUIT_GLOBAL_SENTINEL) return value;
    return isUuid(value) ? value : null;
}

function readGroupParam(value: string | null): string | null {
    return value && isUuid(value) ? value : null;
}

/** Escribe en la URL sin pasar por el servidor. Devuelve si hubo cambio. */
function writeParams(patch: StandingsUrlPatch, mode: 'replace' | 'push'): boolean {
    if (typeof window === 'undefined') return false;

    const params = new URLSearchParams(window.location.search);
    const entries: Array<[string, string | null | undefined]> = [
        [STANDINGS_PHASE_PARAM, patch.phaseId],
        [STANDINGS_GROUP_PARAM, patch.groupId],
        [STANDINGS_TABLE_TYPE_PARAM, patch.tableType],
    ];

    for (const [key, value] of entries) {
        if (value === undefined) continue;
        if (value === null || value === '') params.delete(key);
        else params.set(key, value);
    }

    const query = params.toString();
    const next = `${window.location.pathname}${query ? `?${query}` : ''}`;
    const current = `${window.location.pathname}${window.location.search}`;
    if (next === current) return false;

    if (mode === 'push') window.history.pushState(null, '', next);
    else window.history.replaceState(null, '', next);
    return true;
}

export function useStandingsUrlState() {
    const searchParams = useSearchParams();

    const phaseId = useMemo(
        () => readPhaseParam(searchParams.get(STANDINGS_PHASE_PARAM)),
        [searchParams],
    );
    const groupId = useMemo(
        () => readGroupParam(searchParams.get(STANDINGS_GROUP_PARAM)),
        [searchParams],
    );
    const tableType = useMemo<TableType>(
        () => normalizeTableType(searchParams.get(STANDINGS_TABLE_TYPE_PARAM)) ?? DEFAULT_TABLE_TYPE,
        [searchParams],
    );

    const setStandingsParams = useCallback((patch: StandingsUrlPatch) => {
        writeParams(patch, 'replace');
    }, []);

    /**
     * Cambiar de fase limpia el grupo: los grupos pertenecen a una fase, y
     * arrastrar el de la anterior deja la tabla pidiendo un scope que no existe.
     */
    const setPhase = useCallback((nextPhaseId: string | null) => {
        writeParams({ phaseId: nextPhaseId, groupId: null }, 'replace');
    }, []);

    const setGroup = useCallback((nextGroupId: string | null) => {
        writeParams({ groupId: nextGroupId }, 'replace');
    }, []);

    const setTableType = useCallback((nextTableType: TableType) => {
        writeParams({ tableType: nextTableType }, 'replace');
    }, []);

    return { phaseId, groupId, tableType, setStandingsParams, setPhase, setGroup, setTableType };
}
