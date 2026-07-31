'use client';

import { useEffect, useRef, useState } from 'react';

/** ¿El sistema pidió que no haya movimiento? */
export function prefersReducedMotion(): boolean {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Arranca rápido y frena. Es la curva que hace que un número "aterrice". */
function easeOut(t: number): number {
    return 1 - (1 - t) ** 3;
}

/**
 * Número que CUENTA hasta su valor en vez de saltar.
 *
 * Es la animación más importante del juego: el OVR es lo que resume la carrera,
 * y verlo subir de 46 a 51 es la diferencia entre enterarse de que progresaste y
 * VER que progresaste.
 *
 * Devuelve además la dirección, porque bajar tiene que verse distinto de subir:
 * un OVR que cae no es una buena noticia y no puede celebrarse igual.
 *
 * Con `prefers-reduced-motion` el valor aparece directo. No es que la animación
 * se degrade: es que la información llega igual sin movimiento, que es de lo que
 * se trata.
 */
export function useCountUp(target: number, durationMs = 600): { value: number; running: boolean; direction: 'up' | 'down' | 'none' } {
    const [value, setValue] = useState(target);
    const [running, setRunning] = useState(false);
    const from = useRef(target);
    const frame = useRef(0);

    useEffect(() => {
        const start = from.current;
        if (start === target) return;

        if (prefersReducedMotion()) {
            from.current = target;
            setValue(target);
            return;
        }

        setRunning(true);
        // `performance.now` acá SÍ: esto es presentación, no el motor. La regla
        // del CLAUDE.md §1 prohíbe leer el reloj dentro de `engine/`, y este
        // archivo vive en `app/` justamente por eso.
        const t0 = performance.now();

        const tick = (now: number) => {
            const t = Math.min(1, (now - t0) / durationMs);
            setValue(Math.round(start + (target - start) * easeOut(t)));
            if (t < 1) {
                frame.current = requestAnimationFrame(tick);
            } else {
                from.current = target;
                setRunning(false);
            }
        };

        frame.current = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(frame.current);
    }, [target, durationMs]);

    const direction = from.current === value ? 'none' : value < target ? 'up' : 'down';
    return { value, running, direction };
}
