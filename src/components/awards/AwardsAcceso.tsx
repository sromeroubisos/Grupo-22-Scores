import Link from 'next/link';

import styles from './AwardsAcceso.module.css';

/**
 * El acceso a los Awards (Salida 22 y Corner Corto) desde el home.
 *
 * Vive FUERA de la lista de partidos a propósito: un día sin fixture no puede
 * ser el día en que el acceso no existe. Dos variantes del mismo componente:
 *  - `feed`: una fila arriba del feed. Solo abajo de 1500 px, donde la columna
 *    derecha se apaga y el teléfono o la tablet no tendrían otra puerta.
 *  - `sidebar`: la placa de la columna derecha, arriba de la de clubes.
 */
export default function AwardsAcceso({ variant }: { variant: 'feed' | 'sidebar' }) {
    return (
        <Link href="/awards" className={`${styles.acceso} ${variant === 'feed' ? styles.feed : styles.sidebar}`}>
            {/* El logo oficial en su versión amarilla (el acceso pinta fondo oscuro propio).
                `<img>` pelado, como la placa de Ganá con tu club: el archivo es chico. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className={styles.logo} src="/awards/oficiales/s22-awards-2026-dorado-oscuro.png" alt="Salida de 22 Awards 2026" width={3891} height={2868} loading="lazy" />
            <span className={styles.texto}>
                <span className={styles.titulo}>Premios de la comunidad</span>
                <span className={styles.accion}>Postulá y votá a los mejores de la temporada en rugby y hockey</span>
            </span>
            <svg className={styles.flecha} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polyline points="9 6 15 12 9 18" />
            </svg>
        </Link>
    );
}
