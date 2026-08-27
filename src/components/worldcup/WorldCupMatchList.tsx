// La lista de partidos de una ficha del Mundial: la comparten la selección y
// la jugadora. En la de la jugadora, cada partido puede traer además su línea
// —titular o banco, goles, tarjetas— cuando la planilla se pudo leer.
//
// Componente de servidor: la ficha entera se dibuja antes del primer byte, así
// que el nombre y el resultado están en el HTML (se comparte y se indexa).

import Link from 'next/link';

import type { WorldCupMatchLine, WorldCupMatchSide } from '@/lib/server/worldCupProfiles';

import styles from './WorldCup.module.css';

const TIME_ZONE = 'America/Argentina/Buenos_Aires';
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/**
 * "27 ago · 12:30", en hora argentina. Se arma por partes numéricas para que
 * el mes salga siempre en castellano y la hora en 24 h, pase lo que pase con
 * el locale del servidor.
 */
function whenLabel(iso: string | null): string | null {
    if (!iso) return null;
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return null;

    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: TIME_ZONE,
        day: 'numeric',
        month: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
    }).formatToParts(date);
    const get = (type: string) => parts.find((part) => part.type === type)?.value;

    const day = get('day');
    const month = Number(get('month'));
    const hour = get('hour');
    const minute = get('minute');
    if (!day || !month) return null;

    const dayLabel = `${day} ${MONTHS[month - 1]}`;
    return hour && minute ? `${dayLabel} · ${hour}:${minute}` : dayLabel;
}

const OUTCOME_LABEL = { win: 'G', draw: 'E', loss: 'P' } as const;
const OUTCOME_TITLE = { win: 'Ganó', draw: 'Empató', loss: 'Perdió' } as const;

function Side({ side, away = false }: { side: WorldCupMatchSide; away?: boolean }) {
    return (
        <span className={`${styles.matchSide} ${away ? styles.matchSideAway : ''} ${side.isSelf ? styles.matchSideSelf : ''}`}>
            {side.flagUrl && (
                // eslint-disable-next-line @next/next/no-img-element -- bandera del CDN de la FIH, chica y debajo del pliegue.
                <img src={side.flagUrl} alt="" loading="lazy" decoding="async" className={styles.matchFlag} />
            )}
            <span className={styles.matchName}>{side.name}</span>
        </span>
    );
}

/** "Titular · 2 goles" — lo que hizo la jugadora en ese partido. */
function lineText(line: NonNullable<WorldCupMatchLine['line']>): string[] {
    if (!line.played) return ['En el banco, sin entrar'];

    const parts = [line.starter ? 'Titular' : 'Entró desde el banco'];
    if (line.goals > 0) parts.push(`${line.goals} ${line.goals === 1 ? 'gol' : 'goles'}`);
    if (line.penaltyStrokes > 0) parts.push(`${line.penaltyStrokes} de penal`);
    if (line.greenCards > 0) parts.push(`${line.greenCards} verde`);
    if (line.yellowCards > 0) parts.push(`${line.yellowCards} amarilla`);
    if (line.redCards > 0) parts.push(`${line.redCards} roja`);
    return parts;
}

interface Props {
    matches: WorldCupMatchLine[];
    empty: string;
    /** true en la ficha de una jugadora: debajo de cada partido va su línea. */
    showLines?: boolean;
}

export default function WorldCupMatchList({ matches, empty, showLines = false }: Props) {
    if (matches.length === 0) {
        return <p className={styles.empty}>{empty}</p>;
    }

    return (
        <ul className={styles.matchList}>
            {matches.map((match) => {
                const when = whenLabel(match.dateTime);
                const line = match.line;
                return (
                    <li key={match.id}>
                        <Link href={`/matches/${match.id}`} className={styles.match}>
                            <span className={styles.matchWhen}>
                                <span className={styles.matchStage}>{match.stageName}</span>
                                {when && <span>{when}</span>}
                            </span>

                            <span className={styles.matchTeams}>
                                <Side side={match.home} />
                                <span>
                                    {match.score ? (
                                        <span className={styles.matchScore}>{match.score.home}–{match.score.away}</span>
                                    ) : (
                                        <span className={styles.matchScoreSoft}>vs</span>
                                    )}
                                    {match.shootout && (
                                        <span className={styles.matchShootout}>
                                            SO {match.shootout.home}–{match.shootout.away}
                                        </span>
                                    )}
                                </span>
                                <Side side={match.away} away />
                            </span>

                            {match.outcome && (
                                <span
                                    className={`${styles.outcome} ${styles[match.outcome]}`}
                                    title={OUTCOME_TITLE[match.outcome]}
                                >
                                    {OUTCOME_LABEL[match.outcome]}
                                </span>
                            )}

                            {showLines && (match.status === 'final' || match.status === 'live') && (
                                <span className={styles.matchLine}>
                                    {!match.lineKnown ? (
                                        <span>La planilla de este partido no está disponible</span>
                                    ) : line ? (
                                        lineText(line).map((part, index) => (
                                            <span key={part} className={index === 0 ? undefined : styles.matchLineStrong}>{part}</span>
                                        ))
                                    ) : (
                                        <span>No estuvo en la planilla</span>
                                    )}
                                </span>
                            )}
                        </Link>
                    </li>
                );
            })}
        </ul>
    );
}
