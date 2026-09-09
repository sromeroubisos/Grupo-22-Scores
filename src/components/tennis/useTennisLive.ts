'use client';

import { useEffect, useRef } from 'react';

import type { TennisMatch } from '@/types/tennis';

/**
 * Actualización en vivo del feed de tenis, sin recargar la página.
 *
 * Sondea SOLO el endpoint de partidos en vivo y fusiona por id. Es a propósito:
 * pedir el día entero cuesta un pedido por torneo contra el proveedor —33 en un
 * día normal— y el de vivo cuesta uno. Los partidos programados y los
 * terminados no cambian, así que refrescarlos sería pagar 33 para enterarse de
 * nada.
 *
 * Cuando un partido termina desaparece del feed de vivo, y ahí no sabemos su
 * resultado final: para esos se pide la ficha individual, una sola vez y sólo
 * por el que se cerró.
 */

/** El JSON de la ruta trae `startsAt` como string, no como Date. */
type MatchLike = Omit<TennisMatch, 'startsAt'> & { startsAt: string | null };

const INTERVALO_MS = 15_000;

interface Params<T extends MatchLike> {
    /** Si el sondeo corresponde: una fecha pasada ya no cambia. */
    activo: boolean;
    /** Recibe sólo los partidos que llegaron con dato nuevo. */
    onMatches: (actualizados: Map<string, T>) => void;
    /** Ids que estaban en vivo en el último render. */
    idsEnVivo: string[];
}

export function useTennisLive<T extends MatchLike>({ activo, onMatches, idsEnVivo }: Params<T>) {
    // Por referencia para que cambiar de partidos no reinicie el intervalo: un
    // timer que se recrea en cada tick no llega a disparar nunca.
    const onMatchesRef = useRef(onMatches);
    const idsEnVivoRef = useRef(idsEnVivo);
    const cerradosPedidos = useRef<Set<string>>(new Set());

    onMatchesRef.current = onMatches;
    idsEnVivoRef.current = idsEnVivo;

    useEffect(() => {
        if (!activo) return;

        let cancelado = false;
        let timer: ReturnType<typeof setTimeout> | null = null;

        async function sondear() {
            // Una pestaña de fondo no se mira: seguir pidiendo es gastarle
            // pedidos al proveedor para dibujar algo que nadie ve.
            if (document.visibilityState !== 'visible') return;

            try {
                const res = await fetch('/api/tennis/matches?live=1', { cache: 'no-store' });
                if (!res.ok || cancelado) return;
                const payload = await res.json();

                const actualizados = new Map<string, T>();
                for (const torneo of payload?.tournaments ?? []) {
                    for (const match of torneo?.matches ?? []) {
                        actualizados.set(match.id, match as T);
                    }
                }

                // Los que estaban en vivo y ya no están: terminaron. Su
                // resultado final sólo sale de la ficha, y se pide una vez.
                const cerrados = idsEnVivoRef.current.filter(
                    (id) => !actualizados.has(id) && !cerradosPedidos.current.has(id),
                );
                await Promise.all(cerrados.map(async (id) => {
                    cerradosPedidos.current.add(id);
                    try {
                        const ficha = await fetch(`/api/tennis/matches/${encodeURIComponent(id)}`, {
                            cache: 'no-store',
                        });
                        if (!ficha.ok || cancelado) {
                            cerradosPedidos.current.delete(id);
                            return;
                        }
                        const detalle = await ficha.json();
                        if (detalle?.match) actualizados.set(id, detalle.match as T);
                    } catch {
                        // Si la ficha falla, el partido queda como estaba y se
                        // reintenta en el próximo tick: mejor un marcador viejo
                        // que uno inventado.
                        cerradosPedidos.current.delete(id);
                    }
                }));

                if (!cancelado && actualizados.size > 0) onMatchesRef.current(actualizados);
            } catch {
                // Un sondeo que falla no rompe nada: queda lo que ya está en
                // pantalla y se reintenta en el próximo tick.
            }
        }

        function programar() {
            timer = setTimeout(async () => {
                await sondear();
                if (!cancelado) programar();
            }, INTERVALO_MS);
        }

        // Al volver a la pestaña se sondea enseguida: el que vuelve espera ver
        // el marcador de ahora, no el de cuando se fue.
        function alVolver() {
            if (document.visibilityState === 'visible') void sondear();
        }

        document.addEventListener('visibilitychange', alVolver);
        programar();

        return () => {
            cancelado = true;
            if (timer) clearTimeout(timer);
            document.removeEventListener('visibilitychange', alVolver);
        };
    }, [activo]);
}
