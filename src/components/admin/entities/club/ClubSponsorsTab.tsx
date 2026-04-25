'use client';

import { useEffect, useState } from 'react';
import { Building2, Globe, Loader2, Megaphone, Star } from 'lucide-react';
import type { ClubSponsorItem } from '@/lib/club-admin/sponsors';

interface ClubSponsorsTabProps {
    clubId: string;
    initialSponsors?: ClubSponsorItem[];
    initialSponsorsLoaded?: boolean;
}

export function ClubSponsorsTab({
    clubId,
    initialSponsors,
    initialSponsorsLoaded = false,
}: ClubSponsorsTabProps) {
    const [sponsors, setSponsors] = useState<ClubSponsorItem[]>(initialSponsors ?? []);
    const [loading, setLoading] = useState(!initialSponsorsLoaded);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        setSponsors(initialSponsorsLoaded ? (initialSponsors ?? []) : []);
        setLoading(!initialSponsorsLoaded);
        setError(null);
    }, [clubId, initialSponsors, initialSponsorsLoaded]);

    useEffect(() => {
        if (initialSponsorsLoaded) {
            return;
        }

        let cancelled = false;

        const loadSponsors = async () => {
            try {
                setLoading(true);
                setError(null);

                const response = await fetch(`/api/club-admin/sponsors?club=${encodeURIComponent(clubId)}`, {
                    cache: 'no-store',
                    credentials: 'include',
                });
                const payload = await response.json() as { data?: ClubSponsorItem[]; error?: string };

                if (!response.ok) {
                    throw new Error(payload.error || 'No se pudieron cargar los sponsors.');
                }

                if (!cancelled) {
                    setSponsors(payload.data ?? []);
                }
            } catch (fetchError) {
                if (!cancelled) {
                    setError(fetchError instanceof Error ? fetchError.message : 'No se pudieron cargar los sponsors.');
                }
            } finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        };

        void loadSponsors();
        return () => {
            cancelled = true;
        };
    }, [clubId, initialSponsorsLoaded]);

    return (
        <div className="club-ops-grid">
            <section className="club-ops-panel">
                <div className="club-ops-panel-header">
                    <div>
                        <div className="card-title">Sponsors del club</div>
                        <p className="club-ops-subtext">Base comercial para exports, sitio del club y acuerdos visibles.</p>
                    </div>
                    <button type="button" className="btn btn-primary club-ops-primary">
                        <Star className="w-4 h-4" />
                        Nuevo sponsor
                    </button>
                </div>

                {loading ? (
                    <div className="club-tab-empty">
                        <Loader2 className="w-5 h-5 animate-spin" />
                        <span>Cargando sponsors...</span>
                    </div>
                ) : error ? (
                    <div className="club-tab-empty error">
                        <span>{error}</span>
                    </div>
                ) : sponsors.length === 0 ? (
                    <div className="club-tab-empty">
                        <Building2 className="w-6 h-6" />
                        <span>Este club todavia no tiene sponsors cargados.</span>
                    </div>
                ) : (
                    <div className="sponsor-grid-shell">
                        {sponsors.map((sponsor) => (
                            <article key={sponsor.id} className="sponsor-shell-card">
                                <div className="sponsor-shell-top">
                                    <div className="sponsor-shell-mark">
                                        {sponsor.logo_url ? (
                                            // eslint-disable-next-line @next/next/no-img-element
                                            <img src={sponsor.logo_url} alt={sponsor.name} />
                                        ) : (
                                            <Building2 className="w-5 h-5" />
                                        )}
                                    </div>
                                    <div>
                                        <h3>{sponsor.name}</h3>
                                        <p>{sponsor.tier || 'colaborador'}</p>
                                    </div>
                                </div>

                                <div className="sponsor-shell-meta">
                                    <span>{sponsor.status || 'active'}</span>
                                    <span>{sponsor.placement || 'web + export'}</span>
                                </div>

                                {sponsor.notes ? (
                                    <p className="sponsor-shell-notes">{sponsor.notes}</p>
                                ) : null}

                                {sponsor.website ? (
                                    <a href={sponsor.website} target="_blank" rel="noreferrer" className="sponsor-shell-link">
                                        <Globe className="w-4 h-4" />
                                        {sponsor.website.replace(/^https?:\/\//, '')}
                                    </a>
                                ) : null}
                            </article>
                        ))}
                    </div>
                )}
            </section>

            <section className="club-ops-panel">
                <div className="club-ops-panel-header">
                    <div>
                        <div className="card-title">Valor comercial</div>
                        <p className="club-ops-subtext">Lo que el club termina vendiendo dentro del ecosistema G22.</p>
                    </div>
                </div>

                <div className="content-ops-list">
                    <div className="content-ops-item">
                        <Megaphone className="w-4 h-4" />
                        <div>
                            <strong>Exports sociales</strong>
                            <span>Los sponsors viajan a piezas de partido, formacion y resultados.</span>
                        </div>
                    </div>
                    <div className="content-ops-item">
                        <Building2 className="w-4 h-4" />
                        <div>
                            <strong>Web del club</strong>
                            <span>Logo, categoria y prioridad listos para mostrarse en superficies publicas.</span>
                        </div>
                    </div>
                    <div className="content-ops-item">
                        <Star className="w-4 h-4" />
                        <div>
                            <strong>Prioridad comercial</strong>
                            <span>Distingui sponsor principal, secundarios y placements por modulo.</span>
                        </div>
                    </div>
                </div>

                <div className="content-kpis">
                    <div className="content-kpi">
                        <span className="content-kpi-label">Activos</span>
                        <strong>{sponsors.filter((item) => (item.status || '').toLowerCase() === 'active').length}</strong>
                    </div>
                    <div className="content-kpi">
                        <span className="content-kpi-label">Total</span>
                        <strong>{sponsors.length}</strong>
                    </div>
                    <div className="content-kpi">
                        <span className="content-kpi-label">Con logo</span>
                        <strong>{sponsors.filter((item) => Boolean(item.logo_url)).length}</strong>
                    </div>
                </div>
            </section>
        </div>
    );
}
