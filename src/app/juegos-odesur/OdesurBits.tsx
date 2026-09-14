import type { ReactNode } from 'react';
import { AlertCircle } from 'lucide-react';
import styles from './page.module.css';

/** Piezas chicas que comparten las pestañas del apartado de los Juegos. */

export type Metal = 'gold' | 'silver' | 'bronze';

export const METALS: Array<{ id: Metal; label: string }> = [
    { id: 'gold', label: 'Oro' },
    { id: 'silver', label: 'Plata' },
    { id: 'bronze', label: 'Bronce' },
];

/**
 * El metal se lee por el punto de color, no por un emoji: Windows no dibuja
 * algunos y el color funciona igual en claro y en oscuro.
 */
export function MedalDot({ metal, label }: { metal: Metal; label?: string }) {
    return (
        <span
            className={`${styles.medalDot} ${styles[`medal_${metal}`]}`}
            role={label ? 'img' : undefined}
            aria-label={label}
            aria-hidden={label ? undefined : true}
        />
    );
}

/** Filas grises mientras llega la primera carga: la forma de lo que viene, no un spinner. */
export function SkeletonRows({ count = 6, label }: { count?: number; label: string }) {
    return (
        <div className={styles.skeleton} role="status" aria-live="polite">
            <span className={styles.srOnly}>{label}</span>
            {Array.from({ length: count }, (_, index) => (
                <div key={index} className={styles.skeletonRow} aria-hidden="true">
                    <span className={styles.skeletonTime} />
                    <span className={styles.skeletonText} style={{ width: `${48 + ((index * 17) % 40)}%` }} />
                </div>
            ))}
        </div>
    );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
    return (
        <div className={styles.empty}>
            <p className={styles.emptyTitle}>{title}</p>
            {children ? <div className={styles.emptyBody}>{children}</div> : null}
        </div>
    );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
    return (
        <div className={styles.errorState} role="alert">
            <AlertCircle size={16} aria-hidden="true" />
            <span>{message}</span>
            <button type="button" className={styles.linkBtn} onClick={onRetry}>
                Reintentar
            </button>
        </div>
    );
}
