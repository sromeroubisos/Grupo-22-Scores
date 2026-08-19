'use client';

import Image from 'next/image';
import { useState } from 'react';
import { crestSourceOf, initialsOf, monogramColor } from './clubCrest';
import styles from './capitan.module.css';

interface Props {
    clubId: string;
    clubName: string;
    size?: number;
    /**
     * true (default) cuando el escudo va PEGADO al nombre del club: ahí es
     * decorativo y repetir el nombre en el `alt` solo agrega ruido al lector de
     * pantalla. false cuando va solo y es la única forma de saber de qué club se
     * trata (CLAUDE.md §6).
     */
    decorative?: boolean;
}

/**
 * El escudo del club.
 *
 * Tres fuentes, en este orden y por este motivo:
 *
 *   1 · EL ARCHIVO LOCAL MANDA. Si alguien cargó un PNG a mano para este club,
 *       ese gana sobre lo que devuelva el proxy: es el que eligió el autor.
 *   2 · El proxy de la app, para los clubes que existen en el catálogo real y
 *       por lo tanto tienen `sourceId`.
 *   3 · El monograma, con el color derivado del id. No es un placeholder gris:
 *       es un escudo estable que permite reconocer al club de un vistazo, y es
 *       la única salida para los ~600 que no tienen escudo real.
 *
 * Se lee el manifiesto COMPILADO y no se consulta el disco. Carrera de Rugby sí
 * lo hace —para que un PNG recién soltado aparezca refrescando, sin correr
 * ningún script— con un store y un `useSyncExternalStore`. Acá no se copia esa
 * maquinaria porque este juego pinta un escudo por pantalla y no veinte: el
 * costo de la comodidad no se paga solo.
 *
 * CUÁL de las tres fuentes le toca a un club lo decide `crestSourceOf`, que es
 * la misma respuesta que usa el póster del retiro. Acá se elige cómo dibujarla.
 */
export default function ClubBadge({ clubId, clubName, size = 22, decorative = true }: Props) {
    const [broken, setBroken] = useState(false);
    const fuente = crestSourceOf(clubId, clubName);

    // Va por `next/image` y no por `<img>` crudo porque los originales son de
    // 1080×1080 y acá se dibujan entre 20 y 44 px: el optimizador los baja al
    // tamaño real y los sirve en webp.
    if (!broken && fuente.kind === 'local') {
        return (
            <Image
                src={fuente.src}
                alt={decorative ? '' : clubName}
                aria-hidden={decorative ? true : undefined}
                width={size}
                height={size}
                className={styles.clubBadge}
                style={{ width: size, height: size, objectFit: 'contain' }}
                loading="lazy"
                onError={() => setBroken(true)}
                title={clubName}
            />
        );
    }

    if (broken || fuente.src === null) {
        return (
            <span
                className={styles.clubBadgeFallback}
                style={{
                    width: size,
                    height: size,
                    background: monogramColor(clubId),
                    fontSize: Math.max(9, Math.round(size * 0.38)),
                }}
                role={decorative ? undefined : 'img'}
                aria-label={decorative ? undefined : clubName}
                aria-hidden={decorative ? true : undefined}
                title={clubName}
            >
                {initialsOf(clubName)}
            </span>
        );
    }

    return (
        // eslint-disable-next-line @next/next/no-img-element -- proxy de imágenes de la app
        <img
            src={fuente.src}
            alt={decorative ? '' : clubName}
            aria-hidden={decorative ? true : undefined}
            width={size}
            height={size}
            className={styles.clubBadge}
            style={{ width: size, height: size }}
            loading="lazy"
            onError={() => setBroken(true)}
        />
    );
}
