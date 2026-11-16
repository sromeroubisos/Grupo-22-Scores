'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import styles from './XvIdealAcceso.module.css';

interface OpenGroup {
    groupKey: string;
    title: string;
}

/**
 * El acceso a la votación del XV Ideal desde la home. Solo existe mientras hay
 * una votación abierta: pregunta a /api/xv-ideal/open y, si no hay nada (o la
 * consulta falla), no pinta nada. Mismas dos variantes que AwardsAcceso:
 *  - `feed`: una fila arriba del feed, solo abajo de 1500 px.
 *  - `sidebar`: la placa de la columna derecha.
 */
export default function XvIdealAcceso({ variant }: { variant: 'feed' | 'sidebar' }) {
    const [group, setGroup] = useState<OpenGroup | null>(null);

    useEffect(() => {
        const controller = new AbortController();
        fetch('/api/xv-ideal/open', { signal: controller.signal })
            .then((response) => (response.ok ? response.json() : null))
            .then((body: { groups?: OpenGroup[] } | null) => setGroup(body?.groups?.[0] ?? null))
            .catch(() => undefined);
        return () => controller.abort();
    }, []);

    if (!group) return null;

    return (
        <Link href={`/xv-ideal/${group.groupKey}`} className={`${styles.acceso} ${variant === 'feed' ? styles.feed : styles.sidebar}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className={styles.logo} src="/awards/oficiales/s22-awards-2026-blanco.png" alt="Salida de 22 Awards 2026" width={3891} height={2868} loading="lazy" />
            <span className={styles.texto}>
                <span className={styles.kicker}>Votación abierta</span>
                <span className={styles.titulo}>Votá a los mejores del Argentino Juvenil</span>
                <span className={styles.accion}>Armá tu XV ideal de la Zona Campeonato y la Zona Ascenso</span>
            </span>
            <svg className={styles.flecha} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polyline points="9 6 15 12 9 18" />
            </svg>
        </Link>
    );
}
