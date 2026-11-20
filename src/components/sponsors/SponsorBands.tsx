'use client';

/**
 * Bandas de sponsors del torneo por nivel.
 *
 *  - SponsorBand:      una fila de logos (main: 4 grandes; medios: 3 chicos).
 *  - SponsorsTabPanel: la pestaña Sponsors, los tres niveles en orden.
 *
 * Un nivel vacío no dibuja nada. Los logos son 1:1; un banner 16:9 se
 * encaja entero (contain) sin recortarse.
 */

import type { ReactNode } from 'react';

import type { PublicSponsor } from '@/lib/sponsors/formats';
import type { TournamentSponsorTiers } from './useTournamentSponsors';
import styles from './SponsorBands.module.css';

type BandSize = 'main' | 'medio' | 'relleno';

function SponsorFrame({ sponsor, children }: { sponsor: PublicSponsor; children: ReactNode }) {
    if (!sponsor.linkUrl) return <span className={styles.frame}>{children}</span>;
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

export function SponsorBand({
    sponsors,
    size,
    label,
    className,
    compact,
}: {
    sponsors: PublicSponsor[];
    size: BandSize;
    label?: string;
    className?: string;
    /** En el celular, una fila baja: para listas largas (Resultados, Fixture). */
    compact?: boolean;
}) {
    if (sponsors.length === 0) return null;
    return (
        <div
            className={`${styles.band} ${styles[size]}${compact ? ` ${styles.compact}` : ''}${className ? ` ${className}` : ''}`}
            role="group"
            aria-label={label ?? 'Sponsors'}
        >
            {label && <span className={styles.label}>{label}</span>}
            <ul className={styles.row}>
                {sponsors.map((sponsor) => (
                    <li key={sponsor.id} className={styles.item}>
                        <SponsorFrame sponsor={sponsor}>
                            {/* eslint-disable-next-line @next/next/no-img-element -- ya viene achicada y en WebP desde /api/sponsors/upload. */}
                            <img
                                src={sponsor.imageUrl}
                                alt={sponsor.name}
                                width={sponsor.imageWidth ?? 400}
                                height={sponsor.imageHeight ?? 400}
                                loading="lazy"
                                decoding="async"
                            />
                        </SponsorFrame>
                    </li>
                ))}
            </ul>
        </div>
    );
}

export function SponsorsTabPanel({ tiers }: { tiers: TournamentSponsorTiers }) {
    return (
        <div className={styles.panel}>
            <h2 className={styles.panelTitle}>Sponsors</h2>
            <SponsorBand sponsors={tiers.main} size="main" label="Main sponsors" />
            <SponsorBand sponsors={tiers.medios} size="medio" label="Sponsors" />
            <SponsorBand sponsors={tiers.relleno} size="relleno" label="Acompañan" />
        </div>
    );
}
