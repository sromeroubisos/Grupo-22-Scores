import type { CSSProperties } from 'react';
import { getNationalTeamFlag } from '@/lib/utils/teamLogoOverrides';
import { odesurOrgIso2, odesurOrgName } from '@/lib/services/odesur2026Parser';
import styles from './page.module.css';

/**
 * La bandera de una delegación, en la forma de hoja del cajón curado
 * (`public/logos/selecciones`): esquinas redondeadas arriba a la derecha y
 * abajo a la izquierda, con filete negro. Las 15 delegaciones de los Juegos
 * están en el cajón.
 *
 * Los PNG del cajón son de 256×256 con la bandera en el centro (219×150 desde
 * x=18, y=53): la caja recorta ese margen para que la bandera ocupe su ancho
 * y no un cuadrado casi vacío. Un país que no esté en el cajón cae a la SVG
 * por su código ISO y se recorta en la misma hoja por CSS.
 */
export function odesurFlagSrc(code: string | null, name?: string): { src: string; curated: boolean } {
    const curated = (name ? getNationalTeamFlag(name) : null) ?? getNationalTeamFlag(odesurOrgName(code));
    if (curated) return { src: curated, curated: true };
    const iso2 = odesurOrgIso2(code);
    return { src: iso2 ? `/flags/${iso2}.svg` : '', curated: false };
}

export default function OdesurFlag({
    code,
    name,
    size = 22,
    label,
}: {
    code: string | null;
    name?: string;
    /** Ancho en px; el alto sale de la proporción de la hoja. */
    size?: number;
    /**
     * Texto alternativo cuando la bandera va SOLA (una fila de banderas). Al
     * lado del nombre del país es decorativa y va vacía.
     */
    label?: string;
}) {
    const { src, curated } = odesurFlagSrc(code, name);
    const style = { '--flag-w': `${size}px` } as CSSProperties;

    if (!src) {
        return (
            <span
                className={`${styles.flag} ${styles.flagEmpty}`}
                style={style}
                role={label ? 'img' : undefined}
                aria-label={label}
                aria-hidden={label ? undefined : true}
            />
        );
    }

    return (
        <span className={`${styles.flag} ${curated ? styles.flagCurated : styles.flagFallback}`} style={style} title={label}>
            {/* `<img>` pelado: son archivos locales chicos que no ganan nada
                pasando por next/image, y una fila de banderas no puede tumbar
                la pantalla esperando un optimizador. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt={label ?? ''} loading="lazy" decoding="async" width={256} height={256} />
        </span>
    );
}
