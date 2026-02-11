'use client';

import React, { useState } from 'react';
import styles from '../page.module.css';

interface Match {
    id: string;
    home: string;
    away: string;
    date: string;
    time: string;
    status: 'scheduled' | 'live' | 'finished';
    homeScore?: number;
    awayScore?: number;
}

const initialMatches: Match[] = [
    { id: '1', home: 'SIC', away: 'CASI', date: '2024-05-20', time: '15:30', status: 'live', homeScore: 12, awayScore: 10 },
    { id: '2', home: 'Belgrano', away: 'Alumni', date: '2024-05-20', time: '15:30', status: 'live', homeScore: 5, awayScore: 7 },
    { id: '3', home: 'CUBA', away: 'Newman', date: '2024-05-20', time: '15:30', status: 'scheduled' },
    { id: '4', home: 'Hindu', away: 'Regatas', date: '2024-05-19', time: '15:30', status: 'finished', homeScore: 28, awayScore: 24 },
];

export default function PartidosPage() {
    const [matches, setMatches] = useState<Match[]>(initialMatches);

    const toggleStatus = (id: string) => {
        setMatches(matches.map(m => {
            if (m.id === id) {
                const nextStatus = m.status === 'scheduled' ? 'live' : m.status === 'live' ? 'finished' : 'scheduled';
                return { ...m, status: nextStatus };
            }
            return m;
        }));
    };

    return (
        <div className={styles.page}>
            <div className={styles.main} style={{ marginLeft: 0 }}>
                <div className={styles.header}>
                    <div className={styles.headerLeft}>
                        <h1 className={styles.pageTitle}>Gestión de Partidos</h1>
                        <p className={styles.pageSubtitle}>Administrar encuentros y horarios</p>
                    </div>
                    <div className={styles.headerRight}>
                        <button className={styles.viewSiteBtn} onClick={() => alert('Abrir modal de carga masiva')}>
                            + Carga Masiva
                        </button>
                    </div>
                </div>

                <div className={styles.content}>
                    <div className={styles.card}>
                        <div className={styles.matchesList}>
                            {matches.map(match => (
                                <div key={match.id} className={styles.matchItem}>
                                    <div className={styles.matchInfo}>
                                        <span className={styles.matchTeams}>{match.home} vs {match.away}</span>
                                        <span className={styles.matchDate}>{match.date} • {match.time}</span>
                                    </div>

                                    <div className={styles.matchActions} style={{ gap: '1rem' }}>
                                        {match.status !== 'scheduled' && (
                                            <div style={{ fontWeight: 'bold', fontSize: '1.2rem', color: 'var(--color-text-primary)' }}>
                                                {match.homeScore} - {match.awayScore}
                                            </div>
                                        )}

                                        <button
                                            className={styles.liveBadge}
                                            onClick={() => toggleStatus(match.id)}
                                            style={{
                                                cursor: 'pointer',
                                                background: match.status === 'live' ? 'rgba(239, 68, 68, 0.15)' : match.status === 'finished' ? 'rgba(34, 197, 94, 0.15)' : 'var(--color-bg-tertiary)',
                                                color: match.status === 'live' ? 'var(--color-error)' : match.status === 'finished' ? 'var(--color-success)' : 'var(--color-text-secondary)'
                                            }}
                                        >
                                            {match.status === 'live' && <span className={styles.liveDot}></span>}
                                            {match.status.toUpperCase()}
                                        </button>

                                        <button style={{ padding: '4px', background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '1.2rem' }}>✏️</button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
