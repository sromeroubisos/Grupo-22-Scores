'use client';

import React, { useState } from 'react';
import styles from '../page.module.css';

interface Match {
    id: string;
    home: string;
    away: string;
    homeScore: number;
    awayScore: number;
    status: 'live' | 'finished';
}

const initialLiveMatches: Match[] = [
    { id: '1', home: 'SIC', away: 'CASI', homeScore: 12, awayScore: 10, status: 'live' },
    { id: '2', home: 'Belgrano', away: 'Alumni', homeScore: 5, awayScore: 7, status: 'live' },
];

export default function ResultadosPage() {
    const [matches, setMatches] = useState<Match[]>(initialLiveMatches);

    const updateScore = (id: string, team: 'home' | 'away', delta: number) => {
        setMatches(matches.map(m => {
            if (m.id === id) {
                const newScore = (team === 'home' ? m.homeScore : m.awayScore) + delta;
                return {
                    ...m,
                    [team === 'home' ? 'homeScore' : 'awayScore']: Math.max(0, newScore)
                };
            }
            return m;
        }));
    };

    return (
        <div className={styles.page}>
            <div className={styles.main} style={{ marginLeft: 0 }}>
                <div className={styles.header}>
                    <div className={styles.headerLeft}>
                        <h1 className={styles.pageTitle}>Carga de Resultados</h1>
                        <p className={styles.pageSubtitle}>Partidos en vivo</p>
                    </div>
                </div>

                <div className={styles.content}>
                    <div className={styles.grid}>
                        {matches.map(match => (
                            <div key={match.id} className={styles.card}>
                                <div className={styles.cardHeader}>
                                    <span className={styles.liveBadge}><span className={styles.liveDot}></span>EN VIVO</span>
                                    <span className={styles.cardLink}>#MatchID: {match.id}</span>
                                </div>
                                <div style={{ padding: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    {/* Home */}
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
                                        <h2 style={{ fontSize: '1.5rem' }}>{match.home}</h2>
                                        <div style={{ fontSize: '3rem', fontWeight: 'bold' }}>{match.homeScore}</div>
                                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                                            <button onClick={() => updateScore(match.id, 'home', -1)} className={styles.btn} style={{ padding: '0.5rem 1rem' }}>-</button>
                                            <button onClick={() => updateScore(match.id, 'home', 1)} className={styles.btn} style={{ padding: '0.5rem 1rem', background: 'var(--color-accent)', color: 'white' }}>+1</button>
                                            <button onClick={() => updateScore(match.id, 'home', 5)} className={styles.btn} style={{ padding: '0.5rem 1rem', background: 'var(--color-accent)', color: 'white' }}>+5</button>
                                        </div>
                                    </div>

                                    <div style={{ fontSize: '2rem', color: 'var(--color-text-tertiary)' }}>vs</div>

                                    {/* Away */}
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
                                        <h2 style={{ fontSize: '1.5rem' }}>{match.away}</h2>
                                        <div style={{ fontSize: '3rem', fontWeight: 'bold' }}>{match.awayScore}</div>
                                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                                            <button onClick={() => updateScore(match.id, 'away', -1)} className={styles.btn} style={{ padding: '0.5rem 1rem' }}>-</button>
                                            <button onClick={() => updateScore(match.id, 'away', 1)} className={styles.btn} style={{ padding: '0.5rem 1rem', background: 'var(--color-accent)', color: 'white' }}>+1</button>
                                            <button onClick={() => updateScore(match.id, 'away', 5)} className={styles.btn} style={{ padding: '0.5rem 1rem', background: 'var(--color-accent)', color: 'white' }}>+5</button>
                                        </div>
                                    </div>
                                </div>
                                <div style={{ padding: '1rem', borderTop: '1px solid var(--color-border)', textAlign: 'center' }}>
                                    <button className={styles.btn} style={{ width: '100%', background: 'var(--color-bg-tertiary)' }}>Finalizar Partido</button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
