'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import PlayoffBracket from '@/components/PlayoffBracket';
import { buildPlacementTabs } from '@/lib/playoff/placementBoard';
import type {
    PlacementBoard as PlacementBoardData,
    PlacementMatch,
    PlacementPool,
    PlacementSide,
} from '@/lib/playoff/placementBoard';
import styles from './PlacementBoard.module.css';

/**
 * La fase final de un seven por puestos (Sudamericano). Cada definición es un
 * playoff como los demás —el título, el 5°, el 9°— y se ve en su pestaña con
 * `PlayoffBracket`; la tabla de la zona va aparte, en la suya. Mientras un
 * lado no tiene equipo, dice de dónde sale ("1º Grupo A", "Ganador semi 1"),
 * nunca "TBD".
 *
 * Los datos los arma `buildPlacementBoard` / `buildPlacementTabs`; acá sólo
 * se elige la pestaña y se dibuja.
 */

/** Clases del selector de cuadros de la página del torneo: es el mismo de los otros torneos. */
export type ScopeClasses = {
    bar: string;
    label: string;
    group: string;
    pill: string;
    pillActive: string;
};

type Props = {
    board: PlacementBoardData;
    scopeClasses: ScopeClasses;
};

function kickoffLabel(iso: string | null): string {
    if (!iso) return 'A confirmar';
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return 'A confirmar';
    const day = date.toLocaleDateString('es-AR', { weekday: 'short' }).replace('.', '');
    const time = date.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false });
    return `${day.charAt(0).toUpperCase()}${day.slice(1)} ${time}`;
}

function StatusChip({ match }: { match: PlacementMatch }) {
    if (match.status === 'live') {
        return (
            <span className={`${styles.chip} ${styles.chipLive}`}>
                <span className={styles.liveDot} aria-hidden="true" />
                En vivo
            </span>
        );
    }
    if (match.status === 'finished') {
        return <span className={`${styles.chip} ${styles.chipDone}`}>Final</span>;
    }
    // La hora del servidor (UTC) y la del navegador no coinciden: la del
    // navegador es la buena y no rompe la hidratación por eso.
    return <span className={styles.chip} suppressHydrationWarning>{kickoffLabel(match.dateTime)}</span>;
}

function Crest({ side, size }: { side: PlacementSide; size: number }) {
    if (!side.teamId) {
        return <span className={styles.crestEmpty} style={{ width: size, height: size }} aria-hidden="true" />;
    }
    if (!side.logo) {
        return (
            <span className={styles.crestInitials} style={{ width: size, height: size }} aria-hidden="true">
                {(side.name || '?').slice(0, 2).toUpperCase()}
            </span>
        );
    }
    // Junto al nombre: alt vacío, el texto ya nombra al equipo.
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={side.logo} alt="" width={size} height={size} loading="lazy" className={styles.crest} />;
}

function SideRow({ side }: { side: PlacementSide }) {
    const className = [
        styles.side,
        side.isWinner ? styles.sideWinner : '',
        side.isLoser ? styles.sideLoser : '',
    ].filter(Boolean).join(' ');
    return (
        <div className={className}>
            <Crest side={side} size={20} />
            {side.teamId ? (
                <span className={styles.sideName}>{side.name || 'Equipo'}</span>
            ) : (
                <span className={styles.sideSource}>{side.source || 'A definir'}</span>
            )}
            <span className={styles.sideScore}>{side.score ?? ''}</span>
        </div>
    );
}

function MatchCard({ match, title }: {
    match: PlacementMatch;
    title?: string;
}) {
    const className = [
        styles.card,
        match.status === 'live' ? styles.cardLive : '',
    ].filter(Boolean).join(' ');
    const label = `${title ?? match.stake}: ${match.home.name || match.home.source || 'A definir'} contra ${match.away.name || match.away.source || 'A definir'}`;
    return (
        <Link href={`/matches/${match.id}`} className={className} aria-label={label}>
            <div className={styles.cardHead}>
                <span className={styles.cardStake}>{title ?? match.stake}</span>
                <StatusChip match={match} />
            </div>
            <SideRow side={match.home} />
            <SideRow side={match.away} />
        </Link>
    );
}

function PoolTable({ pool }: { pool: PlacementPool }) {
    const hasDestinations = pool.rows.some((row) => row.destination);
    return (
        <div className={styles.pool}>
            <div className={styles.blockHead}>
                <h3 className={styles.blockTitle}>{pool.name}</h3>
                <span className={styles.blockHint}>Todos contra todos</span>
            </div>
            <table className={styles.poolTable}>
                <thead>
                    <tr>
                        <th scope="col" className={styles.colPos}>#</th>
                        <th scope="col" className={styles.colTeam}>Equipo</th>
                        <th scope="col" title="Partidos jugados">PJ</th>
                        <th scope="col" title="Ganados">G</th>
                        <th scope="col" title="Perdidos">P</th>
                        <th scope="col" title="Diferencia de tantos">Dif</th>
                    </tr>
                </thead>
                <tbody>
                    {pool.rows.map((row, index) => {
                        const diff = row.pointsFor - row.pointsAgainst;
                        return (
                            <tr
                                key={row.key}
                                className={row.destination === 'final' ? styles.rowFinal : row.destination === 'third' ? styles.rowThird : ''}
                            >
                                <td className={styles.colPos}>{index + 1}</td>
                                <td className={styles.colTeam}>
                                    <span className={styles.poolTeam}>
                                        <Crest side={{ key: row.key, teamId: row.teamId, name: row.name, logo: row.logo, source: row.source, score: null, isWinner: false, isLoser: false }} size={20} />
                                        {row.teamId
                                            ? <span className={styles.sideName}>{row.name}</span>
                                            : <span className={styles.sideSource}>{row.source}</span>}
                                    </span>
                                </td>
                                <td>{row.played}</td>
                                <td>{row.won}</td>
                                <td>{row.lost}</td>
                                <td>{row.played > 0 ? (diff > 0 ? `+${diff}` : diff) : '–'}</td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
            <p className={styles.poolNote}>
                {hasDestinations && (
                    <>
                        <span className={`${styles.legendSwatch} ${styles.legendFinal}`} aria-hidden="true" /> A la final
                        <span className={`${styles.legendSwatch} ${styles.legendThird}`} aria-hidden="true" /> Al 3° puesto
                        <br />
                    </>
                )}
                Cuenta el partido del sábado entre equipos del mismo grupo. Orden provisorio por ganados y diferencia.
            </p>
            <div className={styles.poolMatches}>
                {pool.carried.map((match) => (
                    <MatchCard key={match.id} match={match} title="Sábado · arrastrado" />
                ))}
                {pool.matches.map((match) => (
                    <MatchCard key={match.id} match={match} />
                ))}
            </div>
        </div>
    );
}

export default function PlacementBoard({ board, scopeClasses }: Props) {
    const tabs = useMemo(() => buildPlacementTabs(board), [board]);
    const [activeId, setActiveId] = useState<string | null>(null);
    if (tabs.length === 0) return null;
    const active = tabs.find((tab) => tab.id === activeId) ?? tabs[0];

    return (
        <div className={styles.board}>
            {tabs.length > 1 && (
                <div className={scopeClasses.bar}>
                    <span className={scopeClasses.label}>Playoff</span>
                    <div className={scopeClasses.group} role="tablist" aria-label="Definiciones de la fase final">
                        {tabs.map((tab) => (
                            <button
                                key={tab.id}
                                type="button"
                                role="tab"
                                id={`placement-tab-${tab.id}`}
                                aria-selected={tab.id === active.id}
                                aria-controls="placement-panel"
                                className={`${scopeClasses.pill} ${tab.id === active.id ? scopeClasses.pillActive : ''}`}
                                onClick={() => setActiveId(tab.id)}
                            >
                                {tab.label}
                            </button>
                        ))}
                    </div>
                </div>
            )}
            <div
                id="placement-panel"
                role="tabpanel"
                aria-labelledby={`placement-tab-${active.id}`}
                className={active.kind === 'pool' ? `${styles.tabPanel} ${styles.poolPanel}` : styles.tabPanel}
            >
                {active.kind === 'pool' ? (
                    <PoolTable pool={active.pool} />
                ) : (
                    <PlayoffBracket data={active.rounds} title={active.title} />
                )}
            </div>
        </div>
    );
}
