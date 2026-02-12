'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';

type Club = {
    id: string;
    name: string;
    logo: string;
    country: string;
    city: string;
    founded: number;
    sports: string[];
    followers: number;
    viewsMonth: number;
    matchesMonth: number;
    folders: string[];
};

const clubs: Club[] = [
    { id: 'club-atletico', name: 'Club Atletico', logo: 'CA', country: 'Argentina', city: 'Buenos Aires', founded: 1908, sports: ['Rugby', 'Futbol'], followers: 18320, viewsMonth: 230100, matchesMonth: 8, folders: ['Top 5'] },
    { id: 'racing-club', name: 'Racing Club', logo: 'RC', country: 'Argentina', city: 'Avellaneda', founded: 1903, sports: ['Rugby', 'Hockey'], followers: 14210, viewsMonth: 180400, matchesMonth: 7, folders: ['Top 5'] },
    { id: 'san-lorenzo', name: 'San Lorenzo', logo: 'SL', country: 'Argentina', city: 'Buenos Aires', founded: 1908, sports: ['Rugby', 'Futbol'], followers: 15680, viewsMonth: 150200, matchesMonth: 6, folders: ['Monitorear'] },
    { id: 'casi', name: 'CASI', logo: 'CA', country: 'Argentina', city: 'San Isidro', founded: 1920, sports: ['Rugby'], followers: 9800, viewsMonth: 98200, matchesMonth: 5, folders: ['Rugby Internacional'] },
    { id: 'hindu-club', name: 'Hindu Club', logo: 'HC', country: 'Argentina', city: 'Don Torcuato', founded: 1919, sports: ['Rugby'], followers: 11200, viewsMonth: 110500, matchesMonth: 6, folders: ['Rugby Internacional'] },
    { id: 'newman', name: 'Newman', logo: 'NW', country: 'Argentina', city: 'Benavidez', founded: 1917, sports: ['Rugby'], followers: 8400, viewsMonth: 64000, matchesMonth: 4, folders: ['En revision API'] },
    { id: 'belgrano-ac', name: 'Belgrano AC', logo: 'BA', country: 'Argentina', city: 'Buenos Aires', founded: 1896, sports: ['Rugby'], followers: 10250, viewsMonth: 74000, matchesMonth: 5, folders: ['Rugby Internacional'] },
    { id: 'pucara', name: 'Pucara', logo: 'PC', country: 'Argentina', city: 'Burzaco', founded: 1955, sports: ['Rugby'], followers: 6200, viewsMonth: 42000, matchesMonth: 3, folders: ['Juveniles'] },
    { id: 'la-plata-rc', name: 'La Plata RC', logo: 'LP', country: 'Argentina', city: 'La Plata', founded: 1893, sports: ['Rugby'], followers: 7100, viewsMonth: 52000, matchesMonth: 4, folders: ['Juveniles'] },
    { id: 'toulouse', name: 'Stade Toulousain', logo: 'ST', country: 'Francia', city: 'Toulouse', founded: 1907, sports: ['Rugby'], followers: 23200, viewsMonth: 195300, matchesMonth: 6, folders: ['Internacionales'] },
];

const formatNumber = (value: number) => value.toLocaleString('es-AR');

export default function ClubesPage() {
    const [search, setSearch] = useState('');
    const [sport, setSport] = useState('all');
    const [country, setCountry] = useState('all');
    const [folder, setFolder] = useState('all');

    const sports = useMemo(() => Array.from(new Set(clubs.flatMap(c => c.sports))), []);
    const countries = useMemo(() => Array.from(new Set(clubs.map(c => c.country))), []);
    const folders = useMemo(() => {
        const all = new Set<string>();
        clubs.forEach(c => c.folders.forEach(f => all.add(f)));
        return Array.from(all);
    }, []);

    const filtered = useMemo(() => {
        const query = search.trim().toLowerCase();
        return clubs.filter((club) => {
            const matchesSearch = !query || club.name.toLowerCase().includes(query) || club.city.toLowerCase().includes(query);
            const matchesSport = sport === 'all' || club.sports.includes(sport);
            const matchesCountry = country === 'all' || club.country === country;
            const matchesFolder = folder === 'all' || club.folders.includes(folder);
            return matchesSearch && matchesSport && matchesCountry && matchesFolder;
        });
    }, [search, sport, country, folder]);

    const grouped = useMemo(() => {
        const map: Record<string, Record<string, Club[]>> = {};
        filtered.forEach((club) => {
            club.sports.forEach((s) => {
                if (!map[s]) map[s] = {};
                if (!map[s][club.country]) map[s][club.country] = [];
                map[s][club.country].push(club);
            });
        });
        return map;
    }, [filtered]);

    return (
        <div className="g22-page">
            <section className="g22-header">
                <div className="container">
                    <div className="g22-headerTitle">Clubes</div>
                    <div className="g22-headerSub">Cards unificadas · Agrupacion por deporte y pais</div>

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
                                <option value="all">Pais</option>
                                {countries.map((c) => (
                                    <option key={c} value={c}>{c}</option>
                                ))}
                            </select>
                            <select className="g22-select" value={folder} onChange={(e) => setFolder(e.target.value)}>
                                <option value="all">Carpeta</option>
                                {folders.map((f) => (
                                    <option key={f} value={f}>{f}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                </div>
            </section>

            <div className="container">
                {Object.entries(grouped).length === 0 && (
                    <div className="g22-card">No hay clubes con los filtros seleccionados.</div>
                )}

                {Object.entries(grouped).map(([sportName, byCountry]) => (
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
                                    <div className="g22-cardGrid">
                                        {list.map((club) => (
                                            <div key={`${sportName}-${club.id}`} className="g22-card">
                                                <div className="g22-cardTop">
                                                    <div>
                                                        <div className="g22-cardTitle">{club.name}</div>
                                                        <div className="g22-cardSub">
                                                            {club.country} · {club.city}
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="g22-chipRow">
                                                    {club.sports.map((s) => (
                                                        <span key={s} className="g22-chip">{s}</span>
                                                    ))}
                                                </div>

                                                <div className="g22-metrics">
                                                    <div className="g22-metric">
                                                        <strong>{formatNumber(club.followers)}</strong>
                                                        Seguidores
                                                    </div>
                                                    <div className="g22-metric">
                                                        <strong>{formatNumber(club.viewsMonth)}</strong>
                                                        Views mes
                                                    </div>
                                                    <div className="g22-metric">
                                                        <strong>{club.matchesMonth}</strong>
                                                        Partidos
                                                    </div>
                                                </div>

                                                <div className="g22-cardActions">
                                                    <button className="g22-actionBtn" type="button">Editar</button>
                                                    <Link href={`/clubes/${club.id}`} className="g22-actionBtn primary">
                                                        Ver
                                                    </Link>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </details>
                        ))}
                    </section>
                ))}
            </div>
        </div>
    );
}
