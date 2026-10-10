'use client';

import Link from 'next/link';
import type {
    PlacementBoard as PlacementBoardData,
    PlacementMatch,
    PlacementPool,
    PlacementSide,
} from '@/lib/playoff/placementBoard';
import styles from './PlacementBoard.module.css';

/**
 * La fase final de un seven por puestos (Sudamericano): no es una llave, es
 * una tabla de lo que se juega. Arriba el título —la zona, la final y el 3°—,
 * abajo cada escalera de puestos (semis → definiciones) y las definiciones
 * sueltas. Mientras un lado no tiene equipo, dice de dónde sale ("1º Grupo A",
 * "Ganador semi 1"), nunca "TBD".
 *
 * Los datos los arma `buildPlacementBoard`; acá sólo se dibuja.
 */

type Props = {
    board: PlacementBoardData;
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

function SideRow({ side, big }: { side: PlacementSide; big?: boolean }) {
    const className = [
        styles.side,
        side.isWinner ? styles.sideWinner : '',
        side.isLoser ? styles.sideLoser : '',
    ].filter(Boolean).join(' ');
    return (
        <div className={className}>
            <Crest side={side} size={big ? 28 : 20} />
            {side.teamId ? (
                <span className={styles.sideName}>{side.name || 'Equipo'}</span>
            ) : (
                <span className={styles.sideSource}>{side.source || 'A definir'}</span>
            )}
            <span className={styles.sideScore}>{side.score ?? ''}</span>
        </div>
    );
}

function MatchCard({ match, variant, title }: {
    match: PlacementMatch;
    variant?: 'final' | 'third';
    title?: string;
}) {
    const className = [
        styles.card,
        variant === 'final' ? styles.cardFinal : '',
        variant === 'third' ? styles.cardThird : '',
        match.status === 'live' ? styles.cardLive : '',
    ].filter(Boolean).join(' ');
    const label = `${title ?? match.stake}: ${match.home.name || match.home.source || 'A definir'} contra ${match.away.name || match.away.source || 'A definir'}`;
    return (
        <Link href={`/matches/${match.id}`} className={className} aria-label={label}>
            <div className={styles.cardHead}>
                <span className={styles.cardStake}>{title ?? match.stake}</span>
                <StatusChip match={match} />
            </div>
            <SideRow side={match.home} big={variant === 'final'} />
            <SideRow side={match.away} big={variant === 'final'} />
        </Link>
    );
}

function Champion({ match }: { match: PlacementMatch }) {
    if (match.status !== 'finished') return null;
    const winner = match.home.isWinner ? match.home : match.away.isWinner ? match.away : null;
    if (!winner) return null;
    return (
        <div className={styles.champion}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4z" />
                <path d="M17 6h3v2a3 3 0 0 1-3 3M7 6H4v2a3 3 0 0 0 3 3" />
            </svg>
            <span>Campeón</span>
            <strong>{winner.name}</strong>
        </div>
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

export default function PlacementBoard({ board }: Props) {
    const hasTitleBlock = Boolean(board.pool || board.final || board.third);
    return (
        <div className={styles.board}>
            {hasTitleBlock && (
                <section className={styles.section} aria-labelledby="placement-title">
                    <h2 id="placement-title" className={styles.sectionTitle}>
                        <span className={styles.sectionTitleGold}>Por el título</span>
                    </h2>
                    <div className={board.pool ? styles.titleGridWithPool : styles.titleGrid}>
                        {board.pool && <PoolTable pool={board.pool} />}
                        <div className={styles.podium}>
                            {board.final && (
                                <div className={styles.finalWrap}>
                                    <MatchCard match={board.final} variant="final" />
                                    <Champion match={board.final} />
                                </div>
                            )}
                            {board.third && <MatchCard match={board.third} variant="third" />}
                        </div>
                    </div>
                </section>
            )}

            {board.ladders.length > 0 && (
            <div className={styles.ladders}>
            {board.ladders.map((ladder) => (
                <section key={ladder.from} className={styles.section} aria-label={`Del ${ladder.from}° al ${ladder.to}° puesto`}>
                    <h2 className={styles.sectionTitle}>Del {ladder.from}° al {ladder.to}° puesto</h2>
                    <div className={styles.ladder}>
                        <div className={styles.ladderCol}>
                            <span className={styles.ladderColTitle}>Semifinales</span>
                            {ladder.semis.map((match, index) => (
                                <MatchCard key={match.id} match={match} title={`Semi ${index + 1}`} />
                            ))}
                        </div>
                        <div className={styles.ladderArrow} aria-hidden="true">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M5 12h14M13 6l6 6-6 6" />
                            </svg>
                        </div>
                        <div className={styles.ladderCol}>
                            <span className={styles.ladderColTitle}>Definiciones</span>
                            {ladder.finals.map(({ place, match }) => (
                                <MatchCard key={match.id} match={match} title={`${place}° puesto`} />
                            ))}
                        </div>
                    </div>
                </section>
            ))}
            </div>
            )}

            {board.singles.length > 0 && (
                <section className={styles.section} aria-label="Definiciones por puesto">
                    <h2 className={styles.sectionTitle}>Definiciones por puesto</h2>
                    <div className={styles.singles}>
                        {board.singles.map(({ place, match }) => (
                            <MatchCard key={match.id} match={match} title={`${place}° puesto`} />
                        ))}
                    </div>
                </section>
            )}
        </div>
    );
}
