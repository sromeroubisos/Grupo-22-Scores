'use client';

import { useState } from 'react';
import SectionShell from '../components/SectionShell';
import styles from '../page.module.css';

const teamStats = { played: 12, won: 9, drawn: 1, lost: 2, pointsFor: 312, pointsAgainst: 178, triesFor: 42, triesAgainst: 21, bonusOff: 7, bonusDef: 1 };

const topScorers = [
    { name: 'Tomas Albornoz', position: 'Apertura', tries: 3, conversions: 28, penalties: 14, points: 107 },
    { name: 'Lucio Cinti', position: 'Wing', tries: 8, conversions: 0, penalties: 0, points: 40 },
    { name: 'Juan Cruz Mallia', position: 'Fullback', tries: 6, conversions: 0, penalties: 0, points: 30 },
    { name: 'Santiago Chocobares', position: 'Centro', tries: 5, conversions: 0, penalties: 0, points: 25 },
    { name: 'Juan Martin Gonzalez', position: 'Octavo', tries: 4, conversions: 0, penalties: 0, points: 20 },
    { name: 'Marcos Kremer', position: 'Tercera linea', tries: 3, conversions: 0, penalties: 0, points: 15 },
];

const cardStats = [
    { name: 'Matias Alemanno', yellows: 2, reds: 1 },
    { name: 'Ignacio Ruiz', yellows: 2, reds: 0 },
    { name: 'Marcos Kremer', yellows: 1, reds: 0 },
    { name: 'Juan Martin Gonzalez', yellows: 1, reds: 0 },
];

const matchResults = [
    { round: 'F1', score: 28 }, { round: 'F2', score: 31 }, { round: 'F3', score: 24 },
    { round: 'F4', score: 17 }, { round: 'F5', score: 35 }, { round: 'F6', score: 19 },
    { round: 'F7', score: 42 }, { round: 'F8', score: 28 },
];

export default function ClubEstadisticasPage() {
    const [tab, setTab] = useState<'equipo' | 'goleadores' | 'disciplina'>('equipo');
    const maxScore = Math.max(...matchResults.map(m => m.score));

    const handleExport = () => {
        const payload = {
            tab,
            generatedAt: new Date().toISOString(),
            teamStats,
            topScorers,
            cardStats,
            matchResults,
        };
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `estadisticas-${tab}-${new Date().toISOString().slice(0, 10)}.json`;
        link.click();
        URL.revokeObjectURL(url);
    };

    return (
        <SectionShell
            title="Estadisticas"
            subtitle="Metricas del equipo, divisiones y jugadores."
            actions={<button className={`${styles.btn} ${styles.btnGhost}`} type="button" onClick={handleExport}>Exportar</button>}
        >
            <div className={styles.tabs}>
                {([['equipo', 'Equipo'], ['goleadores', 'Goleadores'], ['disciplina', 'Disciplina']] as const).map(([key, label]) => (
                    <button key={key} className={`${styles.tab} ${tab === key ? styles.tabActive : ''}`} onClick={() => setTab(key)} type="button">{label}</button>
                ))}
            </div>

            {tab === 'equipo' && (
                <>
                    <section className={styles.kpiRow}>
                        <div className={styles.kpiCard}><span className={styles.kpiLabel}>PJ</span><span className={styles.kpiValue}>{teamStats.played}</span></div>
                        <div className={styles.kpiCard}><span className={styles.kpiLabel}>PG</span><span className={styles.kpiValue}>{teamStats.won}</span></div>
                        <div className={styles.kpiCard}><span className={styles.kpiLabel}>PP</span><span className={styles.kpiValue}>{teamStats.lost}</span></div>
                        <div className={styles.kpiCard}><span className={styles.kpiLabel}>Diferencia</span><span className={styles.kpiValue}>+{teamStats.pointsFor - teamStats.pointsAgainst}</span></div>
                    </section>
                    <div className={styles.sectionGrid}>
                        <div className={styles.glassCard}>
                            <div className={styles.sectionHeader}><h2>Resumen general</h2></div>
                            <div className={styles.statRow}><span className={styles.statLabel}>Puntos a favor</span><span className={styles.statValue}>{teamStats.pointsFor}</span></div>
                            <div className={styles.statRow}><span className={styles.statLabel}>Puntos en contra</span><span className={styles.statValue}>{teamStats.pointsAgainst}</span></div>
                            <div className={styles.statRow}><span className={styles.statLabel}>Tries anotados</span><span className={styles.statValue}>{teamStats.triesFor}</span></div>
                            <div className={styles.statRow}><span className={styles.statLabel}>Tries recibidos</span><span className={styles.statValue}>{teamStats.triesAgainst}</span></div>
                            <div className={styles.statRow}><span className={styles.statLabel}>Bonus ofensivo</span><span className={styles.statValue}>{teamStats.bonusOff}</span></div>
                            <div className={styles.statRow}><span className={styles.statLabel}>Bonus defensivo</span><span className={styles.statValue}>{teamStats.bonusDef}</span></div>
                        </div>
                        <div className={styles.glassCard}>
                            <div className={styles.sectionHeader}><h2>Puntos por fecha</h2></div>
                            <div className={styles.barChart}>
                                {matchResults.map((m) => (
                                    <div key={m.round} className={styles.bar} style={{ height: `${(m.score / maxScore) * 100}%` }}>
                                        <span className={styles.barLabel}>{m.round}</span>
                                    </div>
                                ))}
                            </div>
                            <div style={{ marginTop: 32, display: 'flex', gap: 24, justifyContent: 'center', fontSize: 12, color: 'var(--color-text-tertiary)' }}>
                                <span>Promedio a favor: {(teamStats.pointsFor / teamStats.played).toFixed(1)}</span>
                                <span>Promedio en contra: {(teamStats.pointsAgainst / teamStats.played).toFixed(1)}</span>
                            </div>
                        </div>
                    </div>
                </>
            )}

            {tab === 'goleadores' && (
                <div className={styles.glassCard}>
                    <table className={styles.table}>
                        <thead><tr><th>#</th><th>Jugador</th><th>Posicion</th><th>Tries</th><th>Conv.</th><th>Penales</th><th>Puntos</th></tr></thead>
                        <tbody>
                            {topScorers.map((p, i) => (
                                <tr key={p.name}>
                                    <td className={styles.mono}>{i + 1}</td>
                                    <td style={{ fontWeight: 600 }}>{p.name}</td>
                                    <td>{p.position}</td>
                                    <td className={styles.mono}>{p.tries}</td>
                                    <td className={styles.mono}>{p.conversions}</td>
                                    <td className={styles.mono}>{p.penalties}</td>
                                    <td className={styles.mono} style={{ fontWeight: 700, color: 'var(--color-accent)' }}>{p.points}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {tab === 'disciplina' && (
                <div className={styles.glassCard}>
                    <div className={styles.sectionHeader}><h2>Tarjetas acumuladas</h2></div>
                    <table className={styles.table}>
                        <thead><tr><th>Jugador</th><th>Amarillas</th><th>Rojas</th></tr></thead>
                        <tbody>
                            {cardStats.map((p) => (
                                <tr key={p.name}>
                                    <td style={{ fontWeight: 600 }}>{p.name}</td>
                                    <td><span className={`${styles.badge} ${styles.badgeWarning}`}>{p.yellows}</span></td>
                                    <td>{p.reds > 0 ? <span className={`${styles.badge} ${styles.badgeDanger}`}>{p.reds}</span> : <span className={styles.mono}>0</span>}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </SectionShell>
    );
}
