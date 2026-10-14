'use client';

import Image from 'next/image';
import { useState } from 'react';
import { CLUB_CRESTS, type ClubDef } from '../../../../features/coach/index.ts';
import styles from './entrenador.module.css';

/**
 * El escudo del club.
 *
 * Si el club cruza contra un PNG de `public/clubs/` (ver `crests.generated.ts`),
 * va el escudo real. Si no —o si el archivo falla—, va el escudo de color y
 * sigla, que NO es un placeholder gris: los colores y las tres letras son los
 * del club de verdad, así que dos clubes nunca se ven igual y el de tu ciudad se
 * reconoce de un vistazo aunque todavía no tenga su imagen.
 *
 * El escudo va por `next/image` y no por `<img>` porque los originales son de
 * 1080×1080 y acá se dibujan a 26 o 44 px: el optimizador los baja al tamaño
 * real y los sirve en webp.
 *
 * Decorativo siempre: al lado hay un texto que nombra al club.
 */
export default function ClubCrest({
    club,
    small = false,
    /** Solo para el que está sobre el pliegue (la cabecera). El resto carga perezoso. */
    eager = false,
}: {
    club: ClubDef;
    small?: boolean;
    eager?: boolean;
}) {
    const [broken, setBroken] = useState(false);
    const src = CLUB_CRESTS[club.id];
    const size = small ? 26 : 44;

    if (src && !broken) {
        return (
            <Image
                src={src}
                alt=""
                aria-hidden="true"
                width={size}
                height={size}
                className={`${styles.crest} ${styles.crestImg} ${small ? styles.crestSm : ''}`}
                priority={eager}
                loading={eager ? undefined : 'lazy'}
                onError={() => setBroken(true)}
            />
        );
    }

    return (
        <span
            className={`${styles.crest} ${small ? styles.crestSm : ''}`}
            style={{ background: club.c1, color: club.c2 }}
            aria-hidden="true"
        >
            {club.code}
        </span>
    );
}
