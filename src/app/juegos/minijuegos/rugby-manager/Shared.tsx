'use client';

import Image from 'next/image';
import { useState } from 'react';
import type { Club, ID, Player, World } from '../../../../features/manager/types/index.ts';
import styles from './manager.module.css';

/** Blanco o casi negro, el que mejor se lee sobre el color del club. */
export function readableOn(hex: string): string {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
    if (!m) return '#ffffff';
    const n = parseInt(m[1], 16);
    const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
        const c = v / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    return luminance > 0.4 ? '#111827' : '#ffffff';
}

/**
 * Escudo del club. Si hay un archivo real en `public/clubs/` va ese; si no (o si
 * falla), va el escudo de colores del club con sus siglas. Decorativo siempre: al
 * lado hay un texto que nombra al club. Va por `next/image` porque los originales
 * son de 1080 px y acá se dibujan entre 28 y 76.
 */
export function ClubShield({ club, large = false }: { club: Club; large?: boolean }) {
    const [broken, setBroken] = useState(false);
    if (club.crest && !broken) {
        return (
            <Image
                src={club.crest}
                alt=""
                aria-hidden="true"
                width={large ? 76 : 40}
                height={large ? 76 : 40}
                className={large ? `${styles.crestImg} ${styles.crestXl}` : styles.crestImg}
                loading={large ? 'eager' : 'lazy'}
                onError={() => setBroken(true)}
            />
        );
    }
    return (
        <span
            className={large ? `${styles.shield} ${styles.shieldXl}` : styles.shield}
            style={{ background: club.primaryColor, color: readableOn(club.primaryColor), borderColor: club.secondaryColor }}
            aria-hidden="true"
        >
            {club.shortName.slice(0, 3)}
        </span>
    );
}

export const seasonLabel = (year: number): string => `${year}/${String(year + 1).slice(-2)}`;

export const shortPlayerName = (p: Player): string => `${p.firstName.charAt(0)}. ${p.lastName}`;

export function clubName(world: World, id: ID): string {
    return world.clubs.find((c) => c.id === id)?.name ?? 'Club desconocido';
}
