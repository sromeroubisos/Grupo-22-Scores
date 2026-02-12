'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';

type Player = {
    id: string;
    name: string;
    position: string;
    team: string;
    country: string;
    sport: string;
    age: number;
    followers: number;
    viewsMonth: number;
};

const players: Player[] = [
    { id: 'martin-garcia', name: 'Martin Garcia', position: 'Wing', team: 'Club Atletico', country: 'Argentina', sport: 'Rugby', age: 24, followers: 1240, viewsMonth: 9400 },
    { id: 'lucas-rodriguez', name: 'Lucas Rodriguez', position: 'Fullback', team: 'Racing Club', country: 'Argentina', sport: 'Rugby', age: 26, followers: 980, viewsMonth: 8200 },
    { id: 'pablo-fernandez', name: 'Pablo Fernandez', position: 'Centre', team: 'San Lorenzo', country: 'Argentina', sport: 'Rugby', age: 25, followers: 880, viewsMonth: 7600 },
    { id: 'nicolas-sanchez', name: 'Nicolas Sanchez', position: 'Fly-half', team: 'Club Atletico', country: 'Argentina', sport: 'Rugby', age: 28, followers: 2100, viewsMonth: 11400 },
    { id: 'tomas-albornoz', name: 'Tomas Albornoz', position: 'Fly-half', team: 'Racing Club', country: 'Argentina', sport: 'Rugby', age: 23, followers: 960, viewsMonth: 7200 },
    { id: 'juan-perez', name: 'Juan Perez', position: 'Wing', team: 'CASI', country: 'Argentina', sport: 'Rugby', age: 22, followers: 740, viewsMonth: 6100 },
    { id: 'diego-lopez', name: 'Diego Lopez', position: 'Centre', team: 'Deportivo FC', country: 'Argentina', sport: 'Rugby', age: 27, followers: 690, viewsMonth: 5800 },
    { id: 'andres-martinez', name: 'Andres Martinez', position: 'Number 8', team: 'Hindu Club', country: 'Argentina', sport: 'Rugby', age: 29, followers: 910, viewsMonth: 6900 },
    { id: 'carlos-sanchez', name: 'Carlos Sanchez', position: 'Scrum-half', team: 'Newman', country: 'Argentina', sport: 'Rugby', age: 24, followers: 640, viewsMonth: 5400 },
    { id: 'roberto-diaz', name: 'Roberto Diaz', position: 'Hooker', team: 'Belgrano AC', country: 'Argentina', sport: 'Rugby', age: 30, followers: 830, viewsMonth: 6100 },
    { id: 'federico-torres', name: 'Federico Torres', position: 'Lock', team: 'Pucara', country: 'Argentina', sport: 'Rugby', age: 21, followers: 520, viewsMonth: 4200 },
    { id: 'gonzalo-ruiz', name: 'Gonzalo Ruiz', position: 'Flanker', team: 'La Plata RC', country: 'Argentina', sport: 'Rugby', age: 25, followers: 560, viewsMonth: 4600 },
];

const formatNumber = (value: number) => value.toLocaleString('es-AR');

export default function JugadoresPage() {
    const [search, setSearch] = useState('');
    const [sport, setSport] = useState('all');
    const [country, setCountry] = useState('all');
    const [position, setPosition] = useState('all');

    const sports = useMemo(() => Array.from(new Set(players.map(p => p.sport))), []);
    const countries = useMemo(() => Array.from(new Set(players.map(p => p.country))), []);
    const positions = useMemo(() => Array.from(new Set(players.map(p => p.position))), []);

    const filtered = useMemo(() => {
        const query = search.trim().toLowerCase();
        return players.filter((player) => {
            const matchesSearch = !query || player.name.toLowerCase().includes(query) || player.team.toLowerCase().includes(query);
            const matchesSport = sport === 'all' || player.sport === sport;
            const matchesCountry = country === 'all' || player.country === country;
            const matchesPosition = position === 'all' || player.position === position;
            return matchesSearch && matchesSport && matchesCountry && matchesPosition;
        });
    }, [search, sport, country, position]);

    const grouped = useMemo(() => {
        const map: Record<string, Record<string, Player[]>> = {};
        filtered.forEach((player) => {
            if (!map[player.sport]) map[player.sport] = {};
            if (!map[player.sport][player.country]) map[player.sport][player.country] = [];
            map[player.sport][player.country].push(player);
        });
        return map;
    }, [filtered]);

    return (
        <div className="g22-page">
            <section className="g22-header">
                <div className="container">
                    <div className="g22-headerTitle">Jugadores</div>
                    <div className="g22-headerSub">Profile cards · métricas · filtros inteligentes</div>

                    <div className="g22-filterBar">
                        <div className="g22-search">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <circle cx="11" cy="11" r="8" />
                                <path d="M21 21l-4.35-4.35" />
                            </svg>
                            <input
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="Buscar jugador o club..."
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
                            <select className="g22-select" value={position} onChange={(e) => setPosition(e.target.value)}>
                                <option value="all">Posicion</option>
                                {positions.map((p) => (
                                    <option key={p} value={p}>{p}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                </div>
            </section>

            <div className="container">
                {Object.entries(grouped).length === 0 && (
                    <div className="g22-card">No hay jugadores con los filtros seleccionados.</div>
                )}

                {Object.entries(grouped).map(([sportName, byCountry]) => (
                    <section key={sportName} className="g22-section">
                        <div className="g22-sectionTitle">{sportName.toUpperCase()}</div>
                        {Object.entries(byCountry).map(([countryName, list]) => (
                            <details key={countryName} className="g22-collapsible" open>
                                <summary>
                                    <span>{countryName}</span>
                                    <span className="g22-summaryMeta">{list.length} jugadores</span>
                                    <svg className="g22-summaryChevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <path d="M6 9l6 6 6-6" />
                                    </svg>
                                </summary>
                                <div className="g22-collapsibleContent">
                                    <div className="g22-cardGrid">
                                        {list.map((player) => (
                                            <div key={player.id} className="g22-card">
                                                <div className="g22-cardTop">
                                                    <div>
                                                        <div className="g22-cardTitle">{player.name}</div>
                                                        <div className="g22-cardSub">
                                                            {player.position} · {player.team}
                                                        </div>
                                                    </div>
                                                    <span className="g22-pill active">{player.sport}</span>
                                                </div>

                                                <div className="g22-metrics">
                                                    <div className="g22-metric">
                                                        <strong>{player.age}</strong>
                                                        Edad
                                                    </div>
                                                    <div className="g22-metric">
                                                        <strong>{formatNumber(player.followers)}</strong>
                                                        Seguidores
                                                    </div>
                                                    <div className="g22-metric">
                                                        <strong>{formatNumber(player.viewsMonth)}</strong>
                                                        Views mes
                                                    </div>
                                                </div>

                                                <div className="g22-cardActions">
                                                    <button className="g22-actionBtn" type="button">Editar</button>
                                                    <button className="g22-actionBtn" type="button">Estadisticas</button>
                                                    <Link href={`/jugadores/${player.id}`} className="g22-actionBtn primary">
                                                        Ver perfil
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
