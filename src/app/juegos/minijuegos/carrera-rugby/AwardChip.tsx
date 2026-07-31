'use client';

import Image from 'next/image';
import { premioIdOf } from './premios';
import { useHasLocalAwardLogo } from './localLogos';
import styles from './carrera.module.css';

/**
 * UN LOGRO, con su ícono si lo hay.
 *
 * El ícono es OPCIONAL a propósito: hoy no hay ninguno cargado y la ficha se ve
 * exactamente como antes. Cuando aparece un `public/premios/<id>.png`, esta
 * misma ficha lo muestra sin tocar una línea de código — el manifiesto avisa que
 * el archivo existe (y en desarrollo alcanza con soltarlo y refrescar).
 *
 * No se intenta la imagen "por las dudas": pedir un PNG que no está devuelve el
 * HTML de la página de error y deja el ícono roto, que es peor que no tenerlo.
 */
/**
 * `award` es la etiqueta EN ESPAÑOL que emite el motor y es la CLAVE del ícono;
 * `label` es lo que se muestra, que en inglés es otra cosa. Separarlas es lo que
 * permite traducir la ficha sin dejar los premios sin escudo — la tabla de
 * `premios.ts` se indexa por el texto del motor, no por el de la pantalla.
 */
export default function AwardChip({ award, label }: { award: string; label: string }) {
    const id = premioIdOf(award);
    const tieneIcono = useHasLocalAwardLogo(id);

    return (
        <span className={styles.badge}>
            {tieneIcono && id !== null && (
                <Image
                    src={`/premios/${id}.png`}
                    alt=""
                    width={20}
                    height={20}
                    className={styles.awardIcon}
                    loading="lazy"
                />
            )}
            {label}
        </span>
    );
}
