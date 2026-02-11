'use client';

import { useState } from 'react';
import Link from 'next/link';
import ExportImage from '@/components/ExportImage';
import styles from './page.module.css';

// Mock data
const resultsByDate = [
    {
        date: '2026-02-03',
        label: 'Hoy',
        matches: [
            { id: 1, time: '15:30', tournament: 'Torneo Apertura 2026', category: 'Primera División', home: 'Club Atlético', homeLogo: '🔵', homeScore: 28, away: 'Racing Club', awayLogo: '🟢', awayScore: 17, status: 'finished' },
        ]
    },
    {
        date: '2026-02-01',
        label: 'Sábado 1 Feb',
        matches: [
            { id: 2, time: '15:30', tournament: 'Torneo Apertura 2026', category: 'Primera División', home: 'Club Atlético', homeLogo: '🔵', homeScore: 28, away: 'San Lorenzo', awayLogo: '🟡', awayScore: 17, status: 'finished' },
            { id: 3, time: '15:30', tournament: 'Torneo Apertura 2026', category: 'Primera División', home: 'Racing Club', homeLogo: '🟢', homeScore: 35, away: 'Deportivo FC', awayLogo: '🔴', awayScore: 21, status: 'finished' },
            { id: 4, time: '18:00', tournament: 'Torneo Apertura 2026', category: 'Primera División', home: 'CASI', homeLogo: '⚪', homeScore: 24, away: 'Newman', awayLogo: '🔴', awayScore: 24, status: 'finished' },
            { id: 5, time: '18:00', tournament: 'Torneo Apertura 2026', category: 'Primera División', home: 'Hindu Club', homeLogo: '🟠', homeScore: 19, away: 'Belgrano AC', awayLogo: '🔵', awayScore: 22, status: 'finished' },
        ]
    },
    {
        date: '2026-01-25',
        label: 'Sábado 25 Ene',
        matches: [
            { id: 6, time: '15:30', tournament: 'Torneo Apertura 2026', category: 'Primera División', home: 'San Lorenzo', homeLogo: '🟡', homeScore: 31, away: 'CASI', awayLogo: '⚪', awayScore: 14, status: 'finished' },
            { id: 7, time: '15:30', tournament: 'Torneo Apertura 2026', category: 'Primera División', home: 'Deportivo FC', homeLogo: '🔴', homeScore: 27, away: 'Club Atlético', awayLogo: '🔵', awayScore: 34, status: 'finished' },
            { id: 8, time: '18:00', tournament: 'Torneo Apertura 2026', category: 'Primera División', home: 'Newman', homeLogo: '🔴', homeScore: 21, away: 'Racing Club', awayLogo: '🟢', awayScore: 28, status: 'finished' },
        ]
    },
];

export default function ResultadosPage() {
    const [selectedTournament, setSelectedTournament] = useState('all');

    return (
        <div className={styles.page}>
            {/* Header */}
            <section className={styles.header}>
                <div className="container">
                    <div className={styles.headerContent}>
                        <div>
                            <h1 className={styles.title}>Resultados</h1>
                            <p className={styles.subtitle}>
                                Todos los resultados oficiales de los partidos finalizados
                            </p>
                        </div>

                        <div className={styles.headerActions}>
                            <select
                                className={styles.select}
                                value={selectedTournament}
                                onChange={(e) => setSelectedTournament(e.target.value)}
                            >
                                <option value="all">Todos los torneos</option>
                                <option value="apertura-2026">Torneo Apertura 2026</option>
                                <option value="liga-nacional-2026">Liga Nacional 2026</option>
                            </select>

                            <ExportImage
                                template="dailyMatches"
                                data={{
                                    date: resultsByDate[0]?.label || 'Resultados',
                                    tournament: 'Torneo Apertura 2026',
                                    matches: resultsByDate[0]?.matches.map(m => ({
                                        homeTeam: m.home,
                                        awayTeam: m.away,
                                        homeScore: m.homeScore,
                                        awayScore: m.awayScore,
                                        time: m.time,
                                        status: m.status as 'scheduled' | 'live' | 'finished',
                                    })) || [],
                                }}
                                filename="resultados"
                            />
                        </div>
                    </div>
                </div>
            </section>

            {/* Results by Date */}
            <section className={styles.content}>
                <div className="container">
                    {resultsByDate.map((dateGroup) => (
                        <div key={dateGroup.date} className={styles.dateGroup}>
                            <div className={styles.dateHeader}>
                                <h2 className={styles.dateTitle}>{dateGroup.label}</h2>
                                <span className={styles.dateCount}>
                                    {dateGroup.matches.length} partidos
                                </span>
                            </div>

                            <div className={styles.matchesList}>
                                {dateGroup.matches.map(match => (
                                    <Link key={match.id} href={`/partidos/${match.id}`} className={styles.resultCard}>
                                        <div className={styles.resultMeta}>
                                            <span className={styles.resultTournament}>{match.tournament}</span>
                                            <span className={styles.resultCategory}>{match.category}</span>
                                        </div>

                                        <div className={styles.resultContent}>
                                            <div className={styles.resultTeam}>
                                                <span className={styles.teamLogo}>{match.homeLogo}</span>
                                                <span className={styles.teamName}>{match.home}</span>
                                                <span className={`${styles.teamScore} ${match.homeScore > match.awayScore ? styles.winner : ''}`}>
                                                    {match.homeScore}
                                                </span>
                                            </div>

                                            <div className={styles.resultDivider}>
                                                <span className={styles.resultFinal}>Final</span>
                                            </div>

                                            <div className={styles.resultTeam}>
                                                <span className={styles.teamLogo}>{match.awayLogo}</span>
                                                <span className={styles.teamName}>{match.away}</span>
                                                <span className={`${styles.teamScore} ${match.awayScore > match.homeScore ? styles.winner : ''}`}>
                                                    {match.awayScore}
                                                </span>
                                            </div>
                                        </div>

                                        <div className={styles.resultAction}>
                                            <span>Ver detalles</span>
                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                <path d="M9 18l6-6-6-6" />
                                            </svg>
                                        </div>
                                    </Link>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            </section>
        </div>
    );
}
