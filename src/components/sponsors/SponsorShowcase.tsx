'use client';

/**
 * La sección de sponsors de la página pública de un club o de un torneo.
 *
 * Banners 16:9 arriba, logos 1:1 en grilla abajo, en el orden del gestor. Si
 * no hay ninguno activo no se dibuja NADA (ni el título ni un hueco): la
 * mayoría de los clubes no tiene sponsors cargados y la página no puede
 * reservarles lugar.
 *
 * `placement` queda para cuando haya más de una posición en la página: hoy
 * todas las filas son 'default' y esta vitrina las muestra a todas.
 */

import { useEffect, useState, type ReactNode } from 'react';

import type { PublicSponsor, SponsorOwnerType } from '@/lib/sponsors/formats';
import styles from './SponsorShowcase.module.css';

export interface SponsorShowcaseProps {
    ownerType: SponsorOwnerType;
    /** id o slug del dueño; la API resuelve el slug de un torneo. */
    ownerId: string | null | undefined;
    placement?: string;
    title?: string;
    className?: string;
}

export function SponsorShowcase({
    ownerType,
    ownerId,
    placement = 'default',
    title = 'Sponsors',
    className,
}: SponsorShowcaseProps) {
    const [sponsors, setSponsors] = useState<PublicSponsor[]>([]);

    useEffect(() => {
        if (!ownerId) {
            setSponsors([]);
            return;
        }
        const controller = new AbortController();
        const params = new URLSearchParams({ ownerType, ownerId });
        fetch(`/api/sponsors?${params.toString()}`, { signal: controller.signal })
            .then((response) => (response.ok ? response.json() : null))
            .then((payload: { data?: PublicSponsor[] } | null) => {
                setSponsors(Array.isArray(payload?.data) ? payload.data : []);
            })
            .catch(() => {
                // Una vitrina de sponsors que falla se calla: no es la página.
            });
        return () => controller.abort();
    }, [ownerType, ownerId]);

    const visible = sponsors.filter((sponsor) => sponsor.placement === placement);
    if (visible.length === 0) return null;

    const banners = visible.filter((sponsor) => sponsor.format === 'banner');
    const logos = visible.filter((sponsor) => sponsor.format === 'logo');

    return (
        <section className={`${styles.section}${className ? ` ${className}` : ''}`} aria-label={title}>
            <h2 className={styles.title}>{title}</h2>

            {banners.length > 0 && (
                <ul className={`${styles.banners}${banners.length === 1 ? ` ${styles.bannersSingle}` : ''}`}>
                    {banners.map((sponsor) => (
                        <li key={sponsor.id} className={styles.bannerItem}>
                            <SponsorLink sponsor={sponsor}>
                                {/* eslint-disable-next-line @next/next/no-img-element -- ya viene achicada y en WebP desde /api/sponsors/upload. */}
                                <img
                                    src={sponsor.imageUrl}
                                    alt={sponsor.name}
                                    width={sponsor.imageWidth ?? 1920}
                                    height={sponsor.imageHeight ?? 1080}
                                    loading="lazy"
                                    decoding="async"
                                />
                            </SponsorLink>
                        </li>
                    ))}
                </ul>
            )}

            {logos.length > 0 && (
                <ul className={styles.logos}>
                    {logos.map((sponsor) => (
                        <li key={sponsor.id} className={styles.logoItem}>
                            <SponsorLink sponsor={sponsor}>
                                {/* eslint-disable-next-line @next/next/no-img-element -- ya viene achicada y en WebP desde /api/sponsors/upload. */}
                                <img
                                    src={sponsor.imageUrl}
                                    alt={sponsor.name}
                                    width={sponsor.imageWidth ?? 1080}
                                    height={sponsor.imageHeight ?? 1080}
                                    loading="lazy"
                                    decoding="async"
                                />
                            </SponsorLink>
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
}

function SponsorLink({ sponsor, children }: { sponsor: PublicSponsor; children: ReactNode }) {
    if (!sponsor.linkUrl) return <div className={styles.frame}>{children}</div>;
    return (
        <a
            className={`${styles.frame} ${styles.link}`}
            href={sponsor.linkUrl}
            target="_blank"
            rel="sponsored noopener noreferrer"
            aria-label={`${sponsor.name} (se abre en otra pestaña)`}
        >
            {children}
        </a>
    );
}
