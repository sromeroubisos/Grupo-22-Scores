'use client';

import { useEffect, useState } from 'react';
import type { PublicTournamentSponsor } from '@/lib/tournament/sponsors';
import styles from './TournamentSponsorsSection.module.css';

interface TournamentSponsorsSectionProps {
    /** Id o slug con el que se pidió la página; la API pública resuelve ambos. */
    tournamentId: string;
    /**
     * Lista resuelta en el servidor. `undefined` = el servidor no la trajo
     * (snapshot fallido, torneo externo), y la sección la pide sola.
     */
    initialSponsors?: PublicTournamentSponsor[] | null;
    /** Torneos de proveedores externos (fs-, espn-) no tienen sponsors propios. */
    enabled?: boolean;
}

function initialFor(name: string): string {
    const trimmed = name.trim();
    return trimmed ? trimmed.charAt(0).toUpperCase() : '?';
}

/**
 * SPONSORS de la página pública: logos de los sponsors ACTIVOS del torneo.
 * Solo información comercial (logo, nombre, link). El monto no llega acá:
 * la vista de la base y `toPublicSponsor` lo dejan afuera antes.
 * Si no hay sponsors, no se renderiza nada: ni título ni espacio vacío.
 */
export default function TournamentSponsorsSection({
    tournamentId,
    initialSponsors,
    enabled = true,
}: TournamentSponsorsSectionProps) {
    const [sponsors, setSponsors] = useState<PublicTournamentSponsor[]>(initialSponsors ?? []);
    const shouldFetch = enabled && initialSponsors === undefined;

    useEffect(() => {
        if (!shouldFetch || !tournamentId) return;
        let cancelled = false;
        (async () => {
            try {
                const res = await fetch(`/api/tournaments/${encodeURIComponent(tournamentId)}/sponsors`);
                if (!res.ok) return;
                const payload = await res.json().catch(() => null);
                if (!cancelled && Array.isArray(payload?.data)) {
                    setSponsors(payload.data);
                }
            } catch {
                // Sin sponsors no hay sección; un fallo de red no rompe la página.
            }
        })();
        return () => { cancelled = true; };
    }, [shouldFetch, tournamentId]);

    if (!enabled || sponsors.length === 0) return null;

    return (
        <section className={styles.section} aria-labelledby="tournament-sponsors-title">
            <div className={styles.card}>
                <div className={styles.header}>
                    <h2 id="tournament-sponsors-title" className={styles.title}>Sponsors</h2>
                    <span className={styles.count}>
                        {sponsors.length === 1 ? '1 marca' : `${sponsors.length} marcas`}
                    </span>
                </div>
                <ul className={styles.grid} role="list">
                    {sponsors.map((sponsor) => {
                        const content = (
                            <>
                                <span className={`${styles.logoWrap} ${sponsor.logo_url ? styles.withLogo : ''}`}>
                                    {sponsor.logo_url ? (
                                        // eslint-disable-next-line @next/next/no-img-element -- logo en Storage o URL externa del sponsor
                                        <img
                                            src={sponsor.logo_url}
                                            alt={`Logo de ${sponsor.name}`}
                                            className={styles.logo}
                                            loading="lazy"
                                            decoding="async"
                                        />
                                    ) : (
                                        <span className={styles.placeholder} aria-hidden="true">{initialFor(sponsor.name)}</span>
                                    )}
                                </span>
                                <span className={styles.name}>{sponsor.name}</span>
                            </>
                        );
                        return (
                            <li key={sponsor.id} style={{ listStyle: 'none', minWidth: 0 }}>
                                {sponsor.website_url ? (
                                    <a
                                        href={sponsor.website_url}
                                        className={styles.item}
                                        target="_blank"
                                        rel="noopener noreferrer sponsored"
                                        aria-label={`${sponsor.name} (se abre en una pestaña nueva)`}
                                    >
                                        {content}
                                    </a>
                                ) : (
                                    <div className={styles.item}>{content}</div>
                                )}
                            </li>
                        );
                    })}
                </ul>
            </div>
        </section>
    );
}
