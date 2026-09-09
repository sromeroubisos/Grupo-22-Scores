'use client';

import { useState } from 'react';

import type { TennisSide } from '@/types/tennis';

import styles from './page.module.css';

/**
 * La cara del jugador en la ficha.
 *
 * Es un componente de cliente por una sola razón: la foto puede no existir. El
 * banco de retratos del proveedor no tiene a todo el mundo y el que falta
 * contesta 404; sin `onError`, la ficha del que perdió en primera ronda abriría
 * con el ícono de imagen rota arriba de su nombre. Al fallar cae a la silueta,
 * igual que un dobles, que nunca tiene retrato de la pareja.
 */
export default function Retrato({ side, esDobles }: { side: TennisSide; esDobles: boolean }) {
    const [rota, setRota] = useState(false);

    if (!esDobles && side.photo && !rota) {
        return (
            <img
                src={side.photo}
                alt=""
                loading="lazy"
                className={styles.portrait}
                onError={() => setRota(true)}
            />
        );
    }

    return (
        <span className={`${styles.portrait} ${styles.portraitEmpty}`} aria-hidden="true">
            <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                {esDobles ? (
                    <>
                        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                        <circle cx="9" cy="7" r="4" />
                        <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                    </>
                ) : (
                    <>
                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                        <circle cx="12" cy="7" r="4" />
                    </>
                )}
            </svg>
        </span>
    );
}
