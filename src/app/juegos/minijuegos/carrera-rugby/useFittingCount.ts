'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';

/**
 * Cuántos elementos de una grilla ENTRAN en el alto disponible.
 *
 * Es el reemplazo del scroll interno: en vez de meter 24 países en una caja de
 * 300 px y dejar que el resto se busque con la rueda, se mide la caja y se
 * renderizan exactamente las filas que caben. Lo que no entra no se recorta con
 * una barra, no se muestra — y el buscador es el camino al resto.
 *
 * `useLayoutEffect` y no `useEffect` para medir antes de pintar: con `useEffect`
 * el primer frame dibuja la lista entera y se ve un salto.
 */
export function useFittingCount(
    ref: React.RefObject<HTMLElement | null>,
    { rowHeight, gap, columns, min, max }: {
        rowHeight: number;
        gap: number;
        columns: number;
        min: number;
        max: number;
    },
): number {
    const [count, setCount] = useState(max);
    // El alto medido se guarda aparte para no recalcular en cada render.
    const lastHeight = useRef(-1);

    const measure = () => {
        const el = ref.current;
        if (el === null) return;
        const height = el.clientHeight;
        if (height === lastHeight.current) return;
        lastHeight.current = height;

        // `+ gap` porque la última fila no lleva separación debajo.
        const rows = Math.floor((height + gap) / (rowHeight + gap));
        const fits = Math.max(min, Math.min(max, rows * columns));
        setCount(fits);
    };

    useLayoutEffect(measure);

    useEffect(() => {
        const el = ref.current;
        if (el === null || typeof ResizeObserver === 'undefined') return;
        const observer = new ResizeObserver(measure);
        observer.observe(el);
        return () => observer.disconnect();
        // `measure` se redefine en cada render pero lee de refs, así que no hace
        // falta que entre en las dependencias.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ref, rowHeight, gap, columns, min, max]);

    return count;
}
