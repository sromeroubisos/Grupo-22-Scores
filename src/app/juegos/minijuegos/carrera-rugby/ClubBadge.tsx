'use client';

import { useState } from 'react';
import { crestKeyOf, initialsOf, monogramColor } from './clubCrest';
import styles from './carrera.module.css';

interface Props {
    clubId: string;
    clubName: string;
    size?: number;
    /**
     * true (default) cuando el escudo va PEGADO al nombre del club: ahí es
     * decorativo y repetir el nombre en el `alt` solo agrega ruido al lector de
     * pantalla. false cuando va solo y es la única forma de saber de qué club se
     * trata.
     */
    decorative?: boolean;
}

/**
 * Escudo del club.
 *
 * Los 214 clubes AR/UY/CL del snapshot tienen escudo REAL: llevan `sourceId` y
 * el proxy de la app (`/api/assets/team-logo`) lo resuelve. Los clubes estáticos
 * internacionales NO tienen con qué pedirlo — no hay `sourceId` ni clave de logo
 * en el catálogo — así que ni siquiera se intenta la petición: con una clave
 * inexistente el endpoint devuelve 404 CON EL HTML DE LA PÁGINA DE ERROR (~102 KB),
 * que además dejaría la imagen rota. Para ellos se dibuja el monograma directo.
 */
export default function ClubBadge({ clubId, clubName, size = 22, decorative = true }: Props) {
    const [broken, setBroken] = useState(false);

    // Sin clave no hay escudo que pedir: se evita el 404 en vez de curarlo.
    const crestKey = crestKeyOf(clubId);
    const showMonogram = broken || crestKey === null;

    if (showMonogram) {
        return (
            <span
                className={styles.clubBadgeFallback}
                style={{ width: size, height: size, background: monogramColor(clubId), fontSize: Math.max(9, Math.round(size * 0.38)) }}
                role={decorative ? undefined : 'img'}
                aria-label={decorative ? undefined : clubName}
                aria-hidden={decorative ? true : undefined}
                title={clubName}
            >
                {initialsOf(clubName)}
            </span>
        );
    }

    const src = `/api/assets/team-logo?entity=team&sport=rugby&key=${encodeURIComponent(crestKey)}&name=${encodeURIComponent(clubName)}`;

    return (
        // eslint-disable-next-line @next/next/no-img-element -- proxy de imágenes de la app
        <img
            src={src}
            alt={decorative ? '' : clubName}
            aria-hidden={decorative ? true : undefined}
            width={size}
            height={size}
            className={styles.clubBadge}
            style={{ width: size, height: size, borderRadius: '50%' }}
            loading="lazy"
            onError={() => setBroken(true)}
        />
    );
}
