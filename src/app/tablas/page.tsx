'use client';

import { useState, useRef } from 'react';
import Link from 'next/link';
import ExportImage from '@/components/ExportImage';
import styles from './page.module.css';

// Mock data
const tournaments = [
    { id: 'apertura-2026', name: 'Torneo Apertura 2026', categories: ['Primera División', 'Reserva', 'M21'] },
    { id: 'liga-nacional-2026', name: 'Liga Nacional 2026', categories: ['Primera División'] },
];

const standingsData = {
    'apertura-2026': {
        'Primera División': [
            { pos: 1, team: 'Club Atlético', logo: '🔵', played: 8, won: 7, drawn: 0, lost: 1, pf: 245, pa: 120, diff: 125, bonus: 4, points: 32, trend: 'up' },
            { pos: 2, team: 'Racing Club', logo: '🟢', played: 8, won: 6, drawn: 1, lost: 1, pf: 210, pa: 135, diff: 75, bonus: 3, points: 28, trend: 'up' },
            { pos: 3, team: 'San Lorenzo', logo: '🟡', played: 8, won: 5, drawn: 1, lost: 2, pf: 195, pa: 148, diff: 47, bonus: 3, points: 24, trend: 'same' },
            { pos: 4, team: 'CASI', logo: '⚪', played: 8, won: 5, drawn: 0, lost: 3, pf: 180, pa: 155, diff: 25, bonus: 2, points: 22, trend: 'down' },
            { pos: 5, team: 'Deportivo FC', logo: '🔴', played: 8, won: 4, drawn: 1, lost: 3, pf: 165, pa: 160, diff: 5, bonus: 2, points: 19, trend: 'up' },
            { pos: 6, team: 'Hindu Club', logo: '🟠', played: 8, won: 4, drawn: 0, lost: 4, pf: 155, pa: 165, diff: -10, bonus: 1, points: 17, trend: 'down' },
            { pos: 7, team: 'Newman', logo: '🔴', played: 8, won: 3, drawn: 1, lost: 4, pf: 140, pa: 170, diff: -30, bonus: 2, points: 15, trend: 'up' },
            { pos: 8, team: 'Belgrano AC', logo: '🔵', played: 8, won: 3, drawn: 0, lost: 5, pf: 135, pa: 178, diff: -43, bonus: 1, points: 13, trend: 'same' },
            { pos: 9, team: 'Pucará', logo: '🟣', played: 8, won: 2, drawn: 1, lost: 5, pf: 120, pa: 185, diff: -65, bonus: 1, points: 10, trend: 'down' },
            { pos: 10, team: 'La Plata RC', logo: '⚫', played: 8, won: 2, drawn: 0, lost: 6, pf: 110, pa: 190, diff: -80, bonus: 0, points: 8, trend: 'down' },
            { pos: 11, team: 'Los Tilos', logo: '🟤', played: 8, won: 1, drawn: 1, lost: 6, pf: 95, pa: 200, diff: -105, bonus: 1, points: 6, trend: 'same' },
            { pos: 12, team: 'Universitario', logo: '🔵', played: 8, won: 0, drawn: 0, lost: 8, pf: 70, pa: 214, diff: -144, bonus: 0, points: 0, trend: 'down' },
        ],
        'Reserva': [
            { pos: 1, team: 'Racing Club', logo: '🟢', played: 8, won: 7, drawn: 1, lost: 0, pf: 220, pa: 95, diff: 125, bonus: 5, points: 35, trend: 'up' },
            { pos: 2, team: 'Club Atlético', logo: '🔵', played: 8, won: 6, drawn: 0, lost: 2, pf: 195, pa: 110, diff: 85, bonus: 3, points: 27, trend: 'same' },
            { pos: 3, team: 'CASI', logo: '⚪', played: 8, won: 5, drawn: 1, lost: 2, pf: 180, pa: 125, diff: 55, bonus: 3, points: 24, trend: 'up' },
        ],
    }
};

export default function TablasPage() {
    const [selectedTournament, setSelectedTournament] = useState('apertura-2026');
    const [selectedCategory, setSelectedCategory] = useState('Primera División');
    const tableRef = useRef<HTMLDivElement>(null);

    const currentTournament = tournaments.find(t => t.id === selectedTournament);
    const standings = standingsData[selectedTournament as keyof typeof standingsData]?.[selectedCategory as keyof typeof standingsData['apertura-2026']] || [];

    return (
        <div className={styles.page}>
            {/* Header */}
            <section className={styles.header}>
                <div className="container">
                    <div className={styles.headerContent}>
                        <div>
                            <h1 className={styles.title}>Tablas de Posiciones</h1>
                            <p className={styles.subtitle}>
                                Posiciones actualizadas de todos los torneos
                            </p>
                        </div>

                        <div className={styles.headerActions}>
                            <ExportImage
                                template="standings"
                                data={{
                                    title: currentTournament?.name || 'Tabla',
                                    subtitle: selectedCategory,
                                    rows: standings.map(s => ({
                                        pos: s.pos,
                                        team: s.team,
                                        played: s.played,
                                        won: s.won,
                                        lost: s.lost,
                                        diff: s.diff > 0 ? `+${s.diff}` : String(s.diff),
                                        points: s.points,
                                    })),
                                }}
                                filename={`tabla-${selectedTournament}`}
                            />
                        </div>
                    </div>

                    {/* Filters */}
                    <div className={styles.filters}>
                        <select
                            className={styles.select}
                            value={selectedTournament}
                            onChange={(e) => {
                                setSelectedTournament(e.target.value);
                                const t = tournaments.find(t => t.id === e.target.value);
                                if (t) setSelectedCategory(t.categories[0]);
                            }}
                        >
                            {tournaments.map(t => (
                                <option key={t.id} value={t.id}>{t.name}</option>
                            ))}
                        </select>

                        <div className={styles.categoryTabs}>
                            {currentTournament?.categories.map(cat => (
                                <button
                                    key={cat}
                                    className={`${styles.categoryTab} ${selectedCategory === cat ? styles.active : ''}`}
                                    onClick={() => setSelectedCategory(cat)}
                                >
                                    {cat}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </section>

            {/* Standings Table */}
            <section className={styles.content}>
                <div className="container">
                    <div className={styles.tableCard} ref={tableRef}>
                        <div className={styles.tableHeader}>
                            <h2 className={styles.tableTournament}>{currentTournament?.name}</h2>
                            <span className={styles.tableCategory}>{selectedCategory}</span>
                        </div>

                        <div className={styles.tableWrapper}>
                            <table className={styles.table}>
                                <thead>
                                    <tr>
                                        <th className={styles.thPos}>Pos</th>
                                        <th className={styles.thTeam}>Equipo</th>
                                        <th>PJ</th>
                                        <th>G</th>
                                        <th>E</th>
                                        <th>P</th>
                                        <th>PF</th>
                                        <th>PC</th>
                                        <th>Dif</th>
                                        <th>Bonus</th>
                                        <th className={styles.thPoints}>Pts</th>
                                        <th className={styles.thTrend}>Tend</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {standings.map((row) => (
                                        <tr key={row.pos} className={styles.tableRow}>
                                            <td>
                                                <span className={`${styles.position} ${styles[`pos${row.pos}`]}`}>
                                                    {row.pos}
                                                </span>
                                            </td>
                                            <td>
                                                <Link href={`/clubes/${row.team.toLowerCase().replace(/\s+/g, '-')}`} className={styles.teamCell}>
                                                    <span className={styles.teamLogo}>{row.logo}</span>
                                                    <span className={styles.teamName}>{row.team}</span>
                                                </Link>
                                            </td>
                                            <td>{row.played}</td>
                                            <td className={styles.won}>{row.won}</td>
                                            <td>{row.drawn}</td>
                                            <td className={styles.lost}>{row.lost}</td>
                                            <td>{row.pf}</td>
                                            <td>{row.pa}</td>
                                            <td className={row.diff > 0 ? styles.positive : row.diff < 0 ? styles.negative : ''}>
                                                {row.diff > 0 ? '+' : ''}{row.diff}
                                            </td>
                                            <td>{row.bonus}</td>
                                            <td className={styles.points}>{row.points}</td>
                                            <td>
                                                <span className={`${styles.trend} ${styles[row.trend]}`}>
                                                    {row.trend === 'up' && (
                                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                                                            <path d="M18 15l-6-6-6 6" />
                                                        </svg>
                                                    )}
                                                    {row.trend === 'down' && (
                                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                                                            <path d="M6 9l6 6 6-6" />
                                                        </svg>
                                                    )}
                                                    {row.trend === 'same' && (
                                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                                                            <path d="M5 12h14" />
                                                        </svg>
                                                    )}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        <div className={styles.tableLegend}>
                            <div className={styles.legendItem}>
                                <span className={`${styles.legendDot} ${styles.legendClassification}`}></span>
                                <span>Clasificación directa</span>
                            </div>
                            <div className={styles.legendItem}>
                                <span className={`${styles.legendDot} ${styles.legendPlayoff}`}></span>
                                <span>Zona de playoffs</span>
                            </div>
                            <div className={styles.legendItem}>
                                <span className={`${styles.legendDot} ${styles.legendRelegation}`}></span>
                                <span>Zona de descenso</span>
                            </div>
                        </div>
                    </div>
                </div>
            </section>
        </div>
    );
}
