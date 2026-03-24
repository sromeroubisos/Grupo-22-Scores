'use client';

import Link from 'next/link';
import { useMemo, useState, useEffect } from 'react';

type Club = {
    id: string;
    name: string;
    logo_url?: string;
    country: string;
    city: string;
    sport: string;
    categories?: string[];
    is_visible: boolean;
};

const formatNumber = (value: number) => value.toLocaleString('es-AR');

export default function ClubesPage() {
    const [clubs, setClubs] = useState<Club[]>([]);
    const [search, setSearch] = useState('');
    const [sport, setSport] = useState('all');
    const [country, setCountry] = useState('all');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function fetchClubs() {
            setLoading(true);
            try {
                const res = await fetch('/api/clubs');
                const { data } = await res.json();
                if (data) {
                    setClubs(data);
                }
            } catch (err) {
                console.error('Error fetching clubs:', err);
            } finally {
                setLoading(false);
            }
        }
        fetchClubs();
    }, []);

    const sports = useMemo(() => Array.from(new Set(clubs.map(c => c.sport).filter(Boolean))), [clubs]);
    const countries = useMemo(() => Array.from(new Set(clubs.map(c => c.country).filter(Boolean))), [clubs]);

    const filtered = useMemo(() => {
        const query = search.trim().toLowerCase();
        return clubs.filter((club) => {
            const nameMatch = club.name.toLowerCase().includes(query);
            const cityMatch = club.city?.toLowerCase().includes(query);
            const matchesSearch = !query || nameMatch || cityMatch;
            const matchesSport = sport === 'all' || club.sport === sport;
            const matchesCountry = country === 'all' || club.country === country;
            return matchesSearch && matchesSport && matchesCountry;
        });
    }, [clubs, search, sport, country]);

    const grouped = useMemo(() => {
        const map: Record<string, Record<string, Club[]>> = {};
        filtered.forEach((club) => {
            const s = club.sport || 'Rugby';
            const c = club.country || 'Otros';
            if (!map[s]) map[s] = {};
            if (!map[s][c]) map[s][c] = [];
            map[s][c].push(club);
        });
        return map;
    }, [filtered]);

    return (
        <div className="g22-page">
            <section className="g22-header">
                <div className="container">
                    <div className="g22-headerTitle">Clubes</div>
                    <div className="g22-headerSub">Directorio oficial de clubes y uniones registradas.</div>

                    <div className="g22-filterBar">
                        <div className="g22-search">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <circle cx="11" cy="11" r="8" />
                                <path d="M21 21l-4.35-4.35" />
                            </svg>
                            <input
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="Buscar club o ciudad..."
                            />
                        </div>
                        <div className="g22-filterRow">
                            <select className="g22-select" value={sport} onChange={(e) => setSport(e.target.value)}>
                                <option value="all">Deporte</option>
                                {sports.map((s) => (
                                    <option key={s} value={s}>{s}</option>
                                ))}
                            </select>
                            <select className="g22-select" value={country} onChange={(e) => setCountry(e.target.value)}>
                                <option value="all">País</option>
                                {countries.map((c) => (
                                    <option key={c} value={c}>{c}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                </div>
            </section>

            <div className="container" style={{ minHeight: '400px' }}>
                {loading ? (
                    <div className="g22-card" style={{ textAlign: 'center', padding: '60px' }}>Cargando clubes...</div>
                ) : Object.entries(grouped).length === 0 ? (
                    <div className="g22-card" style={{ textAlign: 'center', padding: '60px' }}>No hay clubes con los filtros seleccionados.</div>
                ) : (
                    Object.entries(grouped).map(([sportName, byCountry]) => (
                        <section key={sportName} className="g22-section">
                            <div className="g22-sectionTitle">{sportName.toUpperCase()}</div>
                            {Object.entries(byCountry).map(([countryName, list]) => (
                                <details key={countryName} className="g22-collapsible" open>
                                    <summary>
                                        <span>{countryName}</span>
                                        <span className="g22-summaryMeta">{list.length} clubes</span>
                                        <svg className="g22-summaryChevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                            <path d="M6 9l6 6 6-6" />
                                        </svg>
                                    </summary>
                                    <div className="g22-collapsibleContent">
                                        <div className="g22-grid">
                                            {list.map((club) => (
                                                <div key={club.id} className="g22-card club-list-card">
                                                    <div className="g22-card-content">
                                                        <div className="flex items-center gap-4">
                                                            <div className="w-12 h-12 flex-shrink-0 bg-neutral-800 rounded-lg overflow-hidden flex items-center justify-center border border-neutral-700">
                                                                {club.logo_url ? (
                                                                    <img src={club.logo_url} alt={club.name} className="w-10 h-10 object-contain" />
                                                                ) : (
                                                                    <span className="text-xl font-bold text-neutral-600">{club.name[0]}</span>
                                                                )}
                                                            </div>
                                                            <div>
                                                                <div className="g22-cardTitle" style={{ textTransform: 'uppercase' }}>{club.name}</div>
                                                                <div className="g22-cardSub">
                                                                    {club.country} · {club.city || 'Ciudad no especificada'}
                                                                </div>
                                                            </div>
                                                        </div>
                                                        <div className="g22-cardActions mt-4 pt-4 border-t border-neutral-800 flex justify-end gap-2">
                                                            <Link href={`/clubs/${club.id}${club.sport ? `?sport=${encodeURIComponent(club.sport)}` : ''}`} className="g22-actionBtn primary">
                                                                Ver Ficha
                                                            </Link>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </details>
                            ))}
                        </section>
                    )
                    ))}
            </div>

            <style jsx>{`
                .g22-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
                    gap: 16px;
                }
                .club-list-card {
                    padding: 16px;
                    transition: transform 0.2s, border-color 0.2s;
                    border: 1px solid var(--color-border);
                }
                .club-list-card:hover {
                    transform: translateY(-2px);
                    border-color: var(--color-accent);
                }
                .flex { display: flex; }
                .items-center { align-items: center; }
                .gap-4 { gap: 1rem; }
                .gap-2 { gap: 0.5rem; }
                .w-12 { width: 3rem; }
                .h-12 { height: 3rem; }
                .w-10 { width: 2.5rem; }
                .h-10 { height: 2.5rem; }
                .flex-shrink-0 { flex-shrink: 0; }
                .rounded-lg { border-radius: 0.5rem; }
                .overflow-hidden { overflow: hidden; }
                .justify-center { justify-content: center; }
                .justify-end { justify-content: end; }
                .mt-4 { margin-top: 1rem; }
                .pt-4 { padding-top: 1rem; }
                .border-t { border-top-width: 1px; }
            `}</style>
        </div>
    );
}
