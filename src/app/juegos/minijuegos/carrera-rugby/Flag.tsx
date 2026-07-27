'use client';

import { useState } from 'react';
import { findCountry, flagPathOf } from '@/features/career';
import styles from './carrera.module.css';

interface Props {
    /** Código de país del catálogo (ej. 'ar', 'gb-eng'). */
    code: string;
    /** Nombre para el texto alternativo. Si falta, se resuelve del catálogo. */
    name?: string;
    size?: number;
    /** true cuando el nombre ya está escrito al lado (evita repetirlo al lector). */
    decorative?: boolean;
    className?: string;
}

/**
 * Único renderer de banderas: SVG local de `public/flags`, sin peticiones
 * externas ni emojis (en Windows el emoji de bandera se ve como "AR"). Si el
 * asset falta, cae en un recuadro con el código y no rompe el layout.
 */
export default function Flag({ code, name, size = 24, decorative = false, className }: Props) {
    const [broken, setBroken] = useState(false);
    const label = name ?? findCountry(code)?.nameEs ?? code.toUpperCase();
    const height = Math.round(size * 0.72);

    if (broken) {
        return (
            <span
                className={`${styles.flagFallback} ${className ?? ''}`}
                style={{ width: size, height }}
                role={decorative ? undefined : 'img'}
                aria-label={decorative ? undefined : label}
                aria-hidden={decorative ? true : undefined}
                title={label}
            >
                {code.slice(0, 2).toUpperCase()}
            </span>
        );
    }

    return (
        // eslint-disable-next-line @next/next/no-img-element -- SVG local estático; next/image no aporta acá
        <img
            src={flagPathOf(code)}
            alt={decorative ? '' : label}
            aria-hidden={decorative ? true : undefined}
            width={size}
            height={height}
            className={`${styles.flagImg} ${className ?? ''}`}
            loading="lazy"
            onError={() => setBroken(true)}
        />
    );
}
