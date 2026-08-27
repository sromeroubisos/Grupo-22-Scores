'use client';

import { useState } from 'react';
import { findCountryRecord, getCountryFlagCode } from '@/lib/data/countries';
import styles from './CountryFlag.module.css';

interface Props {
    countryId?: string | null;
    countryName?: string | null;
    /** Ancho en px. El alto sale de la proporción 4:3 de flagcdn. */
    size?: number;
    className?: string;
}

/**
 * Bandera de país para listas y encabezados: SVG local de `public/flags`, sin
 * pedidos externos ni emojis. El emoji de bandera es el problema, no la solución:
 * en Windows 🇦🇷 se dibuja como las letras "AR" al lado del nombre.
 *
 * Es decorativa a propósito: siempre va junto a un texto que ya nombra al país,
 * así que al lector de pantalla no le repite nada. Si no hay bandera (una región
 * como "África", un circuito de tenis, "Internacional") dibuja un globo; si el
 * archivo falta, un recuadro con el código y no rompe el layout.
 */
export default function CountryFlag({ countryId, countryName, size = 20, className }: Props) {
    const [broken, setBroken] = useState(false);
    const country = findCountryRecord(countryId, countryName);
    const code = getCountryFlagCode(country);
    const height = Math.round(size * 0.75);
    const boxClass = `${styles.box} ${className ?? ''}`;

    if (!code) {
        return (
            <span className={`${boxClass} ${styles.globe}`} style={{ width: size, height }} aria-hidden="true">
                <svg width={Math.round(size * 0.7)} height={Math.round(size * 0.7)} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <circle cx="12" cy="12" r="9" />
                    <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
                </svg>
            </span>
        );
    }

    if (broken) {
        return (
            <span className={`${boxClass} ${styles.fallback}`} style={{ width: size, height }} aria-hidden="true">
                {code.slice(-2).toUpperCase()}
            </span>
        );
    }

    return (
        <span className={boxClass} style={{ width: size, height }} aria-hidden="true">
            {/* eslint-disable-next-line @next/next/no-img-element -- SVG local estático; next/image no aporta acá */}
            <img
                src={`/flags/${code}.svg`}
                alt=""
                width={size}
                height={height}
                loading="lazy"
                decoding="async"
                onError={() => setBroken(true)}
                className={styles.img}
            />
        </span>
    );
}
