'use client';

import Image from 'next/image';
import { useState } from 'react';
import { useHasLocalClubLogo } from './localLogos';
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
 * Los clubes que existen en el catálogo real llevan `sourceId` y el proxy de la
 * app (`/api/assets/team-logo`) resuelve su escudo: Uruguay y Chile completos, y
 * los 180 argentinos que el canon cruzó contra una fila real.
 *
 * Sin `sourceId` no se intenta la petición: con una clave inexistente el endpoint
 * devuelve 404 CON EL HTML DE LA PÁGINA DE ERROR (~102 KB) y la imagen queda rota
 * igual. Es el caso de los clubes estáticos internacionales y de los 44 que el
 * canon argentino AGREGA y el catálogo real no tiene (URBA Segunda, Tercera y
 * Desarrollo, Villa María, los paraguayos del NEA). Para ellos va el monograma —
 * salvo que se cargue el archivo local del paso 1, que es la salida sin código.
 */
export default function ClubBadge({ clubId, clubName, size = 22, decorative = true }: Props) {
    const [broken, setBroken] = useState(false);
    // En producción sale del manifiesto compilado; en desarrollo, además, de lo
    // que haya en disco ahora mismo — un PNG recién soltado aparece con sólo
    // refrescar, sin correr ningún script.
    const hasLocal = useHasLocalClubLogo(clubId);

    // 1) EL ARCHIVO LOCAL MANDA. Si hay un logo cargado a mano para este club,
    //    ese gana: es el que eligió el autor del juego, por encima de lo que
    //    devuelva el proxy. Se consulta el manifiesto generado en vez de probar
    //    la petición, así un club sin archivo ni siquiera la intenta.
    //
    //    Va por `next/image` y no por `<img>` porque los originales son de
    //    1080×1080 y acá se dibujan entre 16 y 128 px: el optimizador los baja
    //    al tamaño real y los sirve en webp. Con `<img>` crudo, la espina se
    //    bajaría veinte archivos de un mega para pintar veinte escudos de 16 px.
    if (!broken && hasLocal) {
        return (
            <Image
                src={`/clubs/${clubId}.png`}
                alt={decorative ? '' : clubName}
                aria-hidden={decorative ? true : undefined}
                width={size}
                height={size}
                className={styles.clubBadge}
                style={{ width: size, height: size, objectFit: 'contain' }}
                // El del banner está sobre el pliegue; el resto no.
                loading={size >= 96 ? 'eager' : 'lazy'}
                onError={() => setBroken(true)}
                title={clubName}
            />
        );
    }

    // 2) Sin clave no hay escudo que pedir: se evita el 404 en vez de curarlo.
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
