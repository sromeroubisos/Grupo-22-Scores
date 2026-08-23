'use client';

import Link from 'next/link';

import { trackEvent } from '@/lib/analytics';
import { hrefParaClubes, type PromoOrigen } from '@/content/para-clubes';
import styles from './ClubsPromoLink.module.css';

/**
 * La línea contextual: texto y flecha, nunca un banner.
 *
 * Va al pie de una página de torneo, de una ficha de club o de un partido sin
 * estadísticas — o sea, justo donde el dirigente ya está mirando el vacío que
 * G22 le llenaría. Se lee como una nota al pie del contenido, no como un aviso
 * pegado encima.
 *
 * El `origen` viaja en `?ref=` y termina guardado con el lead: sin eso, dentro
 * de tres meses no hay forma de saber si esta línea trajo a alguien.
 */

type Props = {
    origen: PromoOrigen;
    texto: string;
    className?: string;
};

export default function ClubsPromoLink({ origen, texto, className }: Props) {
    return (
        <Link
            href={hrefParaClubes(origen)}
            className={`${styles.linea} ${className ?? ''}`}
            onClick={() => trackEvent('clubs_promo_click', { location: 'contextual', origin: origen })}
        >
            <span>{texto}</span>
            <svg
                className={styles.flecha}
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
            >
                <path d="M5 12h14" />
                <path d="m12 5 7 7-7 7" />
            </svg>
        </Link>
    );
}
