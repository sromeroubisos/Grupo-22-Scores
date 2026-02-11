'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import ExportImage from '@/components/ExportImage';
import DateStrip from '@/components/DateStrip';
import styles from './page.module.css';

// Mock data
const tournaments = [
    { id: 'apertura-2026', name: 'Torneo Apertura 2026' },
    { id: 'liga-nacional-2026', name: 'Liga Nacional 2026' },
];

const matchesByDate = [
    {
        date: '2026-02-03',
        label: 'Hoy',
        matches: [
            { id: 1, time: '15:30', tournament: 'Torneo Apertura 2026', category: 'Primera División', home: 'Club Atlético', homeLogo: '🔵', homeScore: 24, away: 'Racing Club', awayLogo: '🟢', awayScore: 17, status: 'live', minute: "62'" },
            { id: 2, time: '15:30', tournament: 'Torneo Apertura 2026', category: 'Primera División', home: 'San Lorenzo', homeLogo: '🟡', homeScore: 31, away: 'CASI', awayLogo: '⚪', awayScore: 28, status: 'live', minute: "78'" },
            { id: 3, time: '18:00', tournament: 'Torneo Apertura 2026', category: 'Primera División', home: 'Deportivo FC', homeLogo: '🔴', away: 'Hindu Club', awayLogo: '🟠', status: 'scheduled', venue: 'Cancha Deportivo' },
            { id: 4, time: '20:30', tournament: 'Torneo Apertura 2026', category: 'Primera División', home: 'Belgrano AC', homeLogo: '🔵', away: 'Newman', awayLogo: '🔴', status: 'scheduled', venue: 'Estadio Belgrano' },
        ]
    },
    {
        date: '2026-02-04',
        label: 'Mañana',
        matches: [
            { id: 5, time: '16:00', tournament: 'Liga Nacional 2026', category: 'Primera División', home: 'Pucará', homeLogo: '🟣', away: 'La Plata RC', awayLogo: '⚫', status: 'scheduled', venue: 'Cancha Pucará' },
            { id: 6, time: '16:00', tournament: 'Liga Nacional 2026', category: 'Primera División', home: 'Los Tilos', homeLogo: '🟤', away: 'Universitario', awayLogo: '🔵', status: 'scheduled', venue: 'Club Los Tilos' },
            { id: 7, time: '18:30', tournament: 'Liga Nacional 2026', category: 'Primera División', home: 'Jockey Rosario', homeLogo: '🟠', away: 'Old Resian', awayLogo: '⚪', status: 'scheduled', venue: 'Jockey Club Rosario' },
        ]
    },
    {
        date: '2026-02-08',
        label: 'Sábado 8 Feb',
        matches: [
            { id: 8, time: '15:30', tournament: 'Torneo Apertura 2026', category: 'Primera División', home: 'Racing Club', homeLogo: '🟢', away: 'San Lorenzo', awayLogo: '🟡', status: 'scheduled', venue: 'Estadio Racing' },
            { id: 9, time: '15:30', tournament: 'Torneo Apertura 2026', category: 'Primera División', home: 'CASI', homeLogo: '⚪', away: 'Club Atlético', awayLogo: '🔵', status: 'scheduled', venue: 'CASI Club' },
            { id: 10, time: '18:00', tournament: 'Torneo Apertura 2026', category: 'Primera División', home: 'Hindu Club', homeLogo: '🟠', away: 'Belgrano AC', awayLogo: '🔵', status: 'scheduled', venue: 'Hindu Club' },
        ]
    },
];

type ViewMode = 'list' | 'calendar';

export default function FixturesPage() {
    // Default to today (mock data uses '2026-02-04' as today)
    const [selectedDate, setSelectedDate] = useState('2026-02-04');
    const [selectedTournament, setSelectedTournament] = useState('all');

    const filteredMatches = useMemo(() => {
        const dateGroup = matchesByDate.find(d => d.date === selectedDate);
        if (!dateGroup) return [];
        return dateGroup.matches;
    }, [selectedDate]);

    const liveMatches = matchesByDate
        .flatMap(d => d.matches)
        .filter(m => m.status === 'live');

    return (
        <div className={styles.page}>
            {/* Header */}
            <section className={styles.header}>
                <div className="container">
                    <div className={styles.headerContent}>
                        <div>
                            <h1 className={styles.title}>Fixtures</h1>
                            <p className={styles.subtitle}>
                                Calendario completo de partidos programados
                            </p>
                        </div>

                        <div className={styles.headerActions}>
                            {/* Date Strip (Mobile/Desktop) */}
                            <div className={styles.dateSelector}>
                                <DateStrip
                                    selectedDate={selectedDate}
                                    onSelectDate={setSelectedDate}
                                />
                            </div>

                            {/* Tournament Filter */}
                            <select
                                className={styles.select}
                                value={selectedTournament}
                                onChange={(e) => setSelectedTournament(e.target.value)}
                            >
                                <option value="all">Todos los torneos</option>
                                {tournaments.map(t => (
                                    <option key={t.id} value={t.id}>{t.name}</option>
                                ))}
                            </select>

                            <ExportImage
                                template="dailyMatches"
                                data={{
                                    date: new Date(selectedDate).toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' }),
                                    tournament: 'Torneo Apertura 2026',
                                    matches: filteredMatches.map(m => ({
                                        homeTeam: m.home,
                                        awayTeam: m.away,
                                        homeScore: m.homeScore,
                                        awayScore: m.awayScore,
                                        time: m.time,
                                        status: m.status as 'scheduled' | 'live' | 'finished',
                                    })),
                                }}
                                filename="fixtures"
                            />
                        </div>
                    </div>
                </div>
            </section>

            {/* Live Matches Banner */}
            {liveMatches.length > 0 && (
                <section className={styles.liveBanner}>
                    <div className="container">
                        <div className={styles.liveHeader}>
                            <span className={styles.liveBadge}>
                                <span className={styles.liveDot}></span>
                                {liveMatches.length} partido{liveMatches.length > 1 ? 's' : ''} en vivo
                            </span>
                        </div>
                        <div className={styles.liveMatches}>
                            {liveMatches.map(match => (
                                <Link key={match.id} href={`/partidos/${match.id}`} className={styles.liveCard}>
                                    <div className={styles.liveCardHeader}>
                                        <span className={styles.liveTournament}>{match.tournament}</span>
                                        <span className={styles.liveMinute}>{match.minute}</span>
                                    </div>
                                    <div className={styles.liveTeams}>
                                        <span className={styles.liveTeam}>
                                            <span>{match.homeLogo}</span>
                                            <span>{match.home}</span>
                                            <span className={styles.liveScore}>{match.homeScore}</span>
                                        </span>
                                        <span className={styles.liveTeam}>
                                            <span>{match.awayLogo}</span>
                                            <span>{match.away}</span>
                                            <span className={styles.liveScore}>{match.awayScore}</span>
                                        </span>
                                    </div>
                                </Link>
                            ))}
                        </div>
                    </div>
                </section>
            )}

            {/* Matches by Date */}
            <section className={styles.content}>
                <div className="container">
                    {filteredMatches.length > 0 ? (
                        <div className={styles.matchesList}>
                            {filteredMatches.map(match => (
                                <Link key={match.id} href={`/partidos/${match.id}`} className={styles.matchCard}>
                                    <div className={styles.matchTime}>
                                        {match.status === 'live' ? (
                                            <span className={styles.matchLive}>
                                                <span className={styles.matchLiveDot}></span>
                                                {match.minute}
                                            </span>
                                        ) : (
                                            <span>{match.time}</span>
                                        )}
                                    </div>

                                    <div className={styles.matchInfo}>
                                        <span className={styles.matchTournament}>{match.tournament}</span>
                                        <div className={styles.matchTeams}>
                                            <div className={styles.matchTeam}>
                                                <span className={styles.teamLogo}>{match.homeLogo}</span>
                                                <span className={styles.teamName}>{match.home}</span>
                                                {match.status === 'live' && (
                                                    <span className={styles.matchScore}>{match.homeScore}</span>
                                                )}
                                            </div>
                                            <div className={styles.matchTeam}>
                                                <span className={styles.teamLogo}>{match.awayLogo}</span>
                                                <span className={styles.teamName}>{match.away}</span>
                                                {match.status === 'live' && (
                                                    <span className={styles.matchScore}>{match.awayScore}</span>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    <div className={styles.matchMeta}>
                                        {match.venue && (
                                            <span className={styles.matchVenue}>
                                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                                                    <circle cx="12" cy="10" r="3"></circle>
                                                </svg>
                                                {match.venue}
                                            </span>
                                        )}
                                        <span className={styles.matchCategory}>{match.category}</span>
                                    </div>

                                    <svg className={styles.matchArrow} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <path d="M9 18l6-6-6-6" />
                                    </svg>
                                </Link>
                            ))}
                        </div>
                    ) : (
                        <div className={styles.emptyState}>
                            <p>No hay partidos programados para esta fecha.</p>
                        </div>
                    )}
                </div>
            </section >
        </div >
    );
}
