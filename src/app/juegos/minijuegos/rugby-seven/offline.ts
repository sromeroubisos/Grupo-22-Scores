/*
 * Rugby Seven sin conexión: la parte de la página.
 *
 * El service worker (public/sw.js) tiene una caché propia del juego. Acá, cada vez
 * que el juego abre CON conexión, se le pasa la lista exacta de lo que usó (la
 * página, los chunks de Next, la música, el dedo del tutorial) más las banderas
 * de todos los equipos, que se ven a medida que se navegan los menús y no
 * estarían si se esperara a verlas. El SW guarda eso y suelta lo viejo.
 *
 * Sin service worker (navegador viejo, modo privado de algunos) no pasa nada:
 * el juego anda igual con conexión, como siempre.
 */

import { useEffect, useState } from 'react';

export type OfflineState = 'off' | 'preparing' | 'ready' | 'partial' | 'offline';

/** Cuánto se espera después de cargar para juntar la lista: que bajen las imágenes del menú. */
const SETTLE_MS = 2500;
/** Si el SW no contesta en este tiempo, se da por no disponible. */
const ANSWER_TIMEOUT_MS = 60_000;

function sameOriginAssets(): string[] {
    const urls = performance
        .getEntriesByType('resource')
        .map((entry) => entry.name)
        .filter((name) => {
            try {
                const url = new URL(name);
                return url.origin === location.origin
                    && (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/juegos/rugby-seven/') || url.pathname.startsWith('/flags/'));
            } catch {
                return false;
            }
        });
    return [...new Set(urls)];
}

/**
 * Prepara el juego para jugarse sin conexión y dice en qué está.
 * `flags`: códigos de bandera de todos los equipos del juego (sin los `kit:`).
 */
export function useOfflineReady(flags: string[], media: string[] = []): OfflineState {
    const [state, setState] = useState<OfflineState>('off');

    useEffect(() => {
        if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
        let alive = true;
        let timer: ReturnType<typeof setTimeout> | null = null;

        const onMessage = (event: MessageEvent) => {
            const data = event.data as { type?: string; failed?: number } | null;
            if (!alive || data?.type !== 'g22-game-cache-done') return;
            setState(data.failed === 0 ? 'ready' : 'partial');
        };
        const onOffline = () => alive && setState('offline');
        const onOnline = () => alive && setState((current) => (current === 'offline' ? 'ready' : current));
        navigator.serviceWorker.addEventListener('message', onMessage);
        window.addEventListener('offline', onOffline);
        window.addEventListener('online', onOnline);

        if (!navigator.onLine) {
            setState('offline');
        } else {
            setState('preparing');
            // El SW es el mismo del sitio (avisos, escudos): registrarlo de nuevo no hace nada si ya está.
            navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => undefined);
            void navigator.serviceWorker.ready.then((registration) => {
                timer = setTimeout(() => {
                    if (!alive) return;
                    const worker = registration.active;
                    if (!worker) {
                        setState('off');
                        return;
                    }
                    const urls = [
                        location.pathname,
                        ...sameOriginAssets(),
                        // La música y el dedo del tutorial se piden recién al tocar o al entrar a un
                        // ejercicio: sin esto no estarían si el primer partido es sin señal.
                        ...media,
                        ...flags.map((code) => `/flags/${code}.svg`),
                    ];
                    worker.postMessage({ type: 'g22-game-cache', urls });
                    timer = setTimeout(() => alive && setState((current) => (current === 'preparing' ? 'off' : current)), ANSWER_TIMEOUT_MS);
                }, SETTLE_MS);
            });
        }

        return () => {
            alive = false;
            if (timer) clearTimeout(timer);
            navigator.serviceWorker.removeEventListener('message', onMessage);
            window.removeEventListener('offline', onOffline);
            window.removeEventListener('online', onOnline);
        };
        // La lista de banderas sale del catálogo y no cambia mientras la página está abierta.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return state;
}
