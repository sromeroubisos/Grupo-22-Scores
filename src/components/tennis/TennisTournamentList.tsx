'use client';

import { useEffect, useMemo, useState } from 'react';

import type { TennisDay } from '@/types/tennis';

import styles from './TennisTournamentList.module.css';

/**
 * La lista de torneos de tenis de la barra lateral.
 *
 * Sale del bridge de SofaScore, igual que el feed, y no del catálogo viejo:
 * ese listaba "ATP Singles (203)" como si fuera una liga con temporada, que es
 * el modelo del rugby. En tenis lo que hay un día son torneos —un Grand Slam,
 * tres Challengers— agrupados por circuito.
 *
 * Comparte fetch con el panel a través del cache de la ruta, así que verla no
 * cuesta un segundo abanico de pedidos contra el proveedor.
 */

interface Props {
    /** Fecha en formato YYYY-MM-DD, en el huso del visitante. */
    dateKey: string;
    liveOnly?: boolean;
    /** Lo tipeado en el buscador de la barra lateral. */
    filtro?: string;
}

interface Circuito {
    tour: string;
    torneos: Array<{ id: string; name: string; partidos: number }>;
}

/** ATP y WTA primero: es lo que la gente busca. El resto, alfabético. */
const ORDEN: Record<string, number> = { ATP: 0, WTA: 1, Challenger: 2, 'WTA 125': 3 };

function agrupar(day: TennisDay | null, filtro: string): Circuito[] {
    if (!day) return [];
    const termino = filtro.trim().toLowerCase();
    const porTour = new Map<string, Circuito>();

    for (const torneo of day.tournaments) {
        if (termino && !torneo.name.toLowerCase().includes(termino)) continue;
        const tour = torneo.tour || 'Otros';
        let grupo = porTour.get(tour);
        if (!grupo) {
            grupo = { tour, torneos: [] };
            porTour.set(tour, grupo);
        }
        grupo.torneos.push({ id: torneo.id, name: torneo.name, partidos: torneo.matches.length });
    }

    return [...porTour.values()]
        .map((grupo) => ({
            ...grupo,
            torneos: grupo.torneos.sort((a, b) => a.name.localeCompare(b.name, 'es')),
        }))
        .sort((a, b) => {
            const pesoA = ORDEN[a.tour] ?? 90;
            const pesoB = ORDEN[b.tour] ?? 90;
            return pesoA !== pesoB ? pesoA - pesoB : a.tour.localeCompare(b.tour, 'es');
        });
}

export default function TennisTournamentList({ dateKey, liveOnly = false, filtro = '' }: Props) {
    const [day, setDay] = useState<TennisDay | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [cerrados, setCerrados] = useState<Set<string>>(() => new Set());

    const timeZone = useMemo(
        () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
        [],
    );

    useEffect(() => {
        const controller = new AbortController();
        setLoading(true);
        setError(null);

        const query = liveOnly
            ? 'live=1'
            : `date=${encodeURIComponent(dateKey)}&tz=${encodeURIComponent(timeZone)}`;

        fetch(`/api/tennis/matches?${query}`, { signal: controller.signal, cache: 'no-store' })
            .then(async (res) => {
                const payload = await res.json();
                if (controller.signal.aborted) return;
                if (!res.ok) {
                    setError(payload?.message || 'No se pudo cargar la lista.');
                    setDay(null);
                    return;
                }
                setDay(payload as TennisDay);
            })
            .catch((err) => {
                if (controller.signal.aborted || (err as Error).name === 'AbortError') return;
                setError('No se pudo cargar la lista.');
                setDay(null);
            })
            .finally(() => {
                if (!controller.signal.aborted) setLoading(false);
            });

        return () => controller.abort();
    }, [dateKey, liveOnly, timeZone]);

    const circuitos = useMemo(() => agrupar(day, filtro), [day, filtro]);

    if (loading) return <div className={styles.state}>Cargando torneos...</div>;
    if (error) return <div className={styles.state}>{error}</div>;

    if (circuitos.length === 0) {
        return (
            <div className={styles.state}>
                {filtro.trim()
                    ? 'Ningún torneo coincide con la búsqueda.'
                    : 'No hay torneos de tenis para esta fecha.'}
            </div>
        );
    }

    return (
        <div className={styles.list}>
            {circuitos.map((circuito) => {
                const abierto = !cerrados.has(circuito.tour);
                const panelId = `tenis-circuito-${circuito.tour.replace(/\s+/g, '-')}`;
                return (
                    <div key={circuito.tour} className={styles.group}>
                        <button
                            type="button"
                            className={styles.groupHeader}
                            aria-expanded={abierto}
                            aria-controls={panelId}
                            onClick={() => setCerrados((previo) => {
                                const siguiente = new Set(previo);
                                if (siguiente.has(circuito.tour)) siguiente.delete(circuito.tour);
                                else siguiente.add(circuito.tour);
                                return siguiente;
                            })}
                        >
                            <span className={styles.tour}>{circuito.tour}</span>
                            <span className={styles.count}>{circuito.torneos.length}</span>
                            <svg
                                className={`${styles.chevron} ${abierto ? styles.chevronOpen : ''}`}
                                width="16"
                                height="16"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                aria-hidden="true"
                            >
                                <path d="M6 9l6 6 6-6" />
                            </svg>
                        </button>
                        <div id={panelId} hidden={!abierto}>
                            {circuito.torneos.map((torneo) => (
                                <a
                                    key={torneo.id}
                                    href={`#tenis-t-${torneo.id}`}
                                    className={styles.item}
                                    title={torneo.name}
                                >
                                    <span className={styles.itemName}>{torneo.name}</span>
                                    <span className={styles.itemCount}>{torneo.partidos}</span>
                                </a>
                            ))}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
