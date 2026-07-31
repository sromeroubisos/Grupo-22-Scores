'use client';

import Image from 'next/image';
import { useHasLocalAwardLogo } from './localLogos';
import styles from './carrera.module.css';

/**
 * EL ÍCONO DE UN PREMIO INDIVIDUAL, para el festejo.
 *
 * Es el hermano grande de `AwardChip`: la ficha de la vitrina muestra el ícono
 * de 20 px al lado del texto, y esto lo muestra solo, al tamaño del momento.
 *
 * Comparte la regla que importa: NO se intenta la imagen por las dudas. Pedir un
 * PNG que no está devuelve el HTML de la página de error y deja el ícono roto,
 * que se ve peor que no tenerlo. El manifiesto dice si el archivo existe (y en
 * desarrollo alcanza con soltarlo en `public/premios/` y refrescar).
 *
 * Mientras no haya archivo va un trofeo dibujado. No es un placeholder de
 * relleno: un festejo sin ninguna imagen es una tarjeta con dos líneas de texto,
 * y ahí el momento se pierde. El trofeo hereda `--accent`, así que se lee como
 * parte de la tarjeta y no como un ícono prestado.
 */
export default function AwardIcon({ id, size = 96 }: { id: string; size?: number }) {
    const tieneIcono = useHasLocalAwardLogo(id);

    if (tieneIcono) {
        return (
            <Image
                src={`/premios/${id}.png`}
                alt=""
                aria-hidden="true"
                width={size}
                height={size}
                style={{ width: size, height: size, objectFit: 'contain' }}
                // El del festejo está sobre el pliegue: es la pantalla entera.
                loading={size >= 96 ? 'eager' : 'lazy'}
            />
        );
    }

    return (
        <svg
            className={styles.awardFallback}
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
        >
            <path d="M8 3h8v5a4 4 0 0 1-8 0V3z" />
            <path d="M8 4H5v2a3 3 0 0 0 3 3" />
            <path d="M16 4h3v2a3 3 0 0 1-3 3" />
            <path d="M12 12v4" />
            <path d="M9 20h6" />
            <path d="M10 16h4l1 4H9l1-4z" />
        </svg>
    );
}
