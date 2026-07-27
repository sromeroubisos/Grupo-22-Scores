'use client';

import { useState } from 'react';
import { getClub } from '@/features/career';
import styles from './carrera.module.css';

interface Props {
    clubId: string;
    clubName: string;
    size?: number;
}

function initials(name: string): string {
    const words = name.split(/[^A-Za-zÀ-ÿ0-9]+/).filter(Boolean);
    if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
    return name.slice(0, 2).toUpperCase();
}

/**
 * Escudo REAL del club. Reutiliza el proxy de logos de la app
 * (`/api/assets/team-logo`), que resuelve el escudo del club (los clubes AR/UY/CL
 * traen `logo_url` real vía su id de origen; el resto cae en un escudo genérico
 * con forma de crest, nunca una imagen rota). Si el proxy no responde (offline),
 * cae en iniciales sin romper el layout.
 */
export default function ClubBadge({ clubId, clubName, size = 22 }: Props) {
    const [broken, setBroken] = useState(false);
    const fallbackSize = Math.max(20, size);

    if (broken) {
        return (
            <span className={styles.clubBadgeFallback} style={{ width: fallbackSize, height: fallbackSize }} aria-hidden="true">
                {initials(clubName)}
            </span>
        );
    }

    // Clave para el proxy: los clubes del snapshot AR/UY/CL llevan su id real de
    // origen (`sourceId`) → escudo real; los estáticos usan su slug + nombre.
    const club = getClub(clubId);
    const key = club.sourceId ?? clubId;
    const src = `/api/assets/team-logo?entity=team&sport=rugby&key=${encodeURIComponent(key)}&name=${encodeURIComponent(clubName)}`;

    return (
        // eslint-disable-next-line @next/next/no-img-element -- proxy de imágenes de la app
        <img
            src={src}
            alt=""
            aria-hidden="true"
            width={size}
            height={size}
            className={styles.clubBadge}
            style={{ width: size, height: size, borderRadius: '50%' }}
            loading="lazy"
            onError={() => setBroken(true)}
        />
    );
}
