'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import styles from './BannerXvPuma.module.css';

/**
 * El aviso de la previa de Los Pumas, en la home y por un rato.
 *
 * Es una promo con fecha de vencimiento: el partido pasa y el banner deja de
 * tener sentido. En vez de depender de que alguien se acuerde de sacarlo, el
 * banner sabe cuándo apagarse.
 *
 * El corte se escribe con OFFSET EXPLÍCITO (`-03:00`) y no como hora local:
 * "las 18" son las 18 de Argentina, y desde Madrid o desde São Paulo el banner
 * se tiene que apagar en el mismo instante, no a las 18 de allá.
 *
 * El montaje va en un efecto, no en el render: el HTML del servidor y el del
 * navegador se dibujan con relojes distintos, y comparar la hora durante el
 * render deja al banner presente en uno y ausente en el otro (hydration
 * mismatch). Renderizar siempre `null` en el servidor no tiene costo visible
 * —es un aviso, no contenido— y saca el problema de raíz.
 */

/** 28/08/2026, 18:00 en Argentina. Pasada esa hora el banner no se dibuja más. */
const HASTA = '2026-08-28T18:00:00-03:00';

/** La previa a la que manda el banner. */
const DESTINO = '/matches/trgyZr5s?tab=lineups';

/** Tope de `setTimeout`: más que esto desborda y dispara al instante. */
const TOPE_TIMEOUT = 2_147_483_647;

export default function BannerXvPuma() {
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        const fin = new Date(HASTA).getTime();
        const faltan = fin - Date.now();

        // Ya venció: el banner no llega a montarse nunca.
        if (!Number.isFinite(faltan) || faltan <= 0) return;

        setVisible(true);

        // Y si la pestaña quedó abierta cruzando las 18, se apaga solo.
        if (faltan > TOPE_TIMEOUT) return;
        const id = setTimeout(() => setVisible(false), faltan);
        return () => clearTimeout(id);
    }, []);

    if (!visible) return null;

    return (
        <Link href={DESTINO} className={styles.banner}>
            <span className={styles.etiqueta}>Previa</span>
            <span className={styles.titulo}>Armá tu XV Puma</span>
            <span className={styles.bajada}>Elegí los 23 y llevate la placa</span>
            <svg className={styles.flecha} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="m9 18 6-6-6-6" />
            </svg>
        </Link>
    );
}
