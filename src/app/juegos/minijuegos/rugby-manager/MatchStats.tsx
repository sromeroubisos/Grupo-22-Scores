'use client';

import type { BroadcastStats } from '../../../../features/manager/engine/live/index.ts';
import type { TeamLook } from './Tablero.tsx';
import styles from './manager.module.css';

interface Props {
    stats: BroadcastStats;
    home: TeamLook;
    away: TeamLook;
}

interface Row {
    label: string;
    home: number;
    away: number;
    /** Se muestra como porcentaje del total (posesión y territorio). */
    percent?: boolean;
}

function share(home: number, away: number): number {
    const total = home + away;
    return total > 0 ? Math.round((home / total) * 100) : 50;
}

/** Posesión, territorio y lo que pasó en el partido, lado a lado. */
export default function MatchStats({ stats, home, away }: Props) {
    const rows: Row[] = [
        { label: 'Posesión', home: stats.possession.home, away: stats.possession.away, percent: true },
        { label: 'Territorio', home: stats.territory.home, away: stats.territory.away, percent: true },
        { label: 'Placajes', home: stats.tackles.home, away: stats.tackles.away },
        { label: 'Rucks', home: stats.rucks.home, away: stats.rucks.away },
        { label: 'Melés', home: stats.scrums.home, away: stats.scrums.away },
        { label: 'Touch', home: stats.lineouts.home, away: stats.lineouts.away },
        { label: 'Pelotas recuperadas', home: stats.turnovers.home, away: stats.turnovers.away },
        { label: 'Penales a favor', home: stats.penalties.home, away: stats.penalties.away },
    ];
    return (
        <section className={styles.card} aria-labelledby="stats-title">
            <h3 id="stats-title" className={styles.sectionTitle}>Estadísticas</h3>
            <div className={styles.statHead}>
                <span className={styles.statTeam} style={{ ['--swatch' as string]: home.color }}>{home.name}</span>
                <span className={styles.statTeam} style={{ ['--swatch' as string]: away.color }}>{away.name}</span>
            </div>
            <ul className={styles.statList}>
                {rows.map((r) => {
                    const homePct = share(r.home, r.away);
                    const shown = (n: number, other: number) => (r.percent ? `${share(n, other)}%` : String(n));
                    return (
                        <li
                            key={r.label}
                            className={styles.statRow}
                            aria-label={`${r.label}: ${home.name} ${shown(r.home, r.away)}, ${away.name} ${shown(r.away, r.home)}`}
                        >
                            <span className={styles.statNum}>{shown(r.home, r.away)}</span>
                            <span className={styles.statMid}>
                                <span className={styles.statLabel}>{r.label}</span>
                                <span className={styles.statBar} aria-hidden="true">
                                    <i style={{ width: `${homePct}%`, background: home.color }} />
                                    <i style={{ width: `${100 - homePct}%`, background: away.color }} />
                                </span>
                            </span>
                            <span className={styles.statNum}>{shown(r.away, r.home)}</span>
                        </li>
                    );
                })}
            </ul>
        </section>
    );
}
