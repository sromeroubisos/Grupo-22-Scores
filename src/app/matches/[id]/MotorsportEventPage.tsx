'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

import type {
    MotorsportEventDetails,
    MotorsportSession,
    MotorsportSessionResult,
} from '@/lib/services/espnMotorsportEvent';

import styles from './MotorsportEventPage.module.css';

/**
 * La ficha de un fin de semana de carreras.
 *
 * No es la ficha de un partido: no hay local, visitante ni marcador. Hay un
 * Gran Premio con sus SESIONES —prácticas, clasificación, sprint, carrera— y
 * en cada una un orden de llegada con tiempo, gap, grilla, boxes y puntos. El
 * riel de arriba, que en los otros deportes lleva secciones, acá lleva las
 * sesiones; la tabla cambia de columnas según qué sesión es, porque una
 * clasificación se lee por Q1/Q2/Q3 y una carrera por el gap con el ganador.
 *
 * Todo lo que se dibuja viene de `MotorsportEventDetails`. Cuando ESPN no
 * contesta la parte fina, `fallback` alcanza para la cabecera y un aviso.
 */

const USER_TZ = 'America/Argentina/Buenos_Aires';

interface Fallback {
    id: string;
    name: string;
    series: string;
    tournamentId: string | null;
    date: string | null;
    venue: string | null;
    status: string;
}

interface Props {
    details: MotorsportEventDetails | null;
    fallback: Fallback;
    onBack: () => void;
}

function fecha(iso: string | null, opts: Intl.DateTimeFormatOptions): string {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleString('es-AR', { timeZone: USER_TZ, ...opts });
}

function diaCorto(iso: string | null): string {
    return fecha(iso, { weekday: 'short', day: 'numeric', month: 'short' }).replace('.', '');
}

function hora(iso: string | null): string {
    return fecha(iso, { hour: '2-digit', minute: '2-digit', hour12: false });
}

function rangoDeFechas(startsAt: string | null, endsAt: string | null): string {
    const a = fecha(startsAt, { day: 'numeric', month: 'short' });
    const b = fecha(endsAt, { day: 'numeric', month: 'short' });
    if (a && b && a !== b) return `${a} – ${b}`;
    return a || b;
}

function estadoDelEvento(status: string): { text: string; live: boolean } {
    switch (status) {
        case 'live': return { text: 'En pista', live: true };
        case 'final': return { text: 'Terminado', live: false };
        case 'postponed': return { text: 'Postergado', live: false };
        case 'cancelled': return { text: 'Cancelado', live: false };
        default: return { text: 'Programado', live: false };
    }
}

function estadoDeSesion(session: MotorsportSession): string {
    if (session.status === 'live') return 'En pista';
    if (session.status === 'final') return 'Final';
    if (session.status === 'postponed') return 'Postergada';
    if (session.status === 'cancelled') return 'Cancelada';
    return hora(session.startsAt) || 'Por correr';
}

function tournamentHref(fallback: Fallback, details: MotorsportEventDetails | null): string | null {
    const id = fallback.tournamentId;
    if (!id) return null;
    const name = details?.league.name ?? fallback.series;
    return `/tournaments/${encodeURIComponent(id)}?sport=motorsport&name=${encodeURIComponent(name)}`;
}

function Piloto({ result, compact = false }: { result: MotorsportSessionResult; compact?: boolean }) {
    const { driver } = result;
    return (
        <span className={styles.driver}>
            <span className={styles.teamBar} style={result.teamColor ? { background: `#${result.teamColor}` } : undefined} aria-hidden="true" />
            {driver.headshot ? (
                <img src={driver.headshot} alt="" loading="lazy" className={styles.headshot} />
            ) : (
                <span className={`${styles.headshot} ${styles.headshotEmpty}`} aria-hidden="true" />
            )}
            <span className={styles.driverText}>
                <span className={styles.driverName}>
                    {driver.countryFlag ? <img src={driver.countryFlag} alt={driver.countryName ?? ''} loading="lazy" className={styles.flag} /> : null}
                    <span className={styles.driverFull}>{driver.name}</span>
                    {driver.abbreviation ? <span className={styles.driverAbbr}>{driver.abbreviation}</span> : null}
                </span>
                {!compact && result.team ? <span className={styles.driverTeam}>{result.team}</span> : null}
            </span>
        </span>
    );
}

function Grilla({ result }: { result: MotorsportSessionResult }) {
    if (result.grid == null) return <span className={styles.muted}>–</span>;
    const gained = result.gained ?? 0;
    return (
        <span className={styles.gridCell}>
            <span>{result.grid}</span>
            {gained !== 0 ? (
                <span className={`${styles.gained} ${gained > 0 ? styles.gainedUp : styles.gainedDown}`}>
                    {gained > 0 ? `▲${gained}` : `▼${Math.abs(gained)}`}
                </span>
            ) : null}
        </span>
    );
}

function Puntos({ result }: { result: MotorsportSessionResult }) {
    if (result.points == null || result.points === 0) return <span className={styles.muted}>–</span>;
    return (
        <span className={styles.points}>
            {result.points}
            {result.bonusPoints ? <span className={styles.bonus} title="Puntos extra">+{result.bonusPoints}</span> : null}
        </span>
    );
}

/** La columna "Tiempo": el total del ganador, el gap de los demás, o cómo se fue. */
function Tiempo({ result }: { result: MotorsportSessionResult }) {
    if (result.status === 'retired' || result.status === 'disqualified' || result.status === 'not-started' || result.status === 'not-classified') {
        return <span className={styles.retired}>{result.gap ?? result.statusText ?? 'Abandonó'}</span>;
    }
    if (result.winner && result.time) return <span className={styles.timeWinner}>{result.time}</span>;
    if (result.gap) return <span className={styles.gap}>{result.gap}</span>;
    if (result.time) return <span>{result.time}</span>;
    return <span className={styles.muted}>–</span>;
}

function TablaDeSesion({ session, leagueSlug }: { session: MotorsportSession; leagueSlug: string }) {
    const kind = session.kind;
    const isRace = kind === 'race' || kind === 'sprint';
    const isQualifying = kind === 'qualifying' || kind === 'sprint-qualifying';
    const hasQ = isQualifying && session.results.some((r) => r.q1 || r.q2 || r.q3);
    const hasGrid = isRace && session.results.some((r) => r.grid != null);
    const hasPits = isRace && session.results.some((r) => (r.pits ?? 0) > 0);
    const hasLed = isRace && session.results.some((r) => (r.lapsLed ?? 0) > 0);
    const hasPoints = session.results.some((r) => (r.points ?? 0) > 0);
    // NASCAR e IndyCar no publican tiempos ni gaps por piloto: la columna
    // entera sería una hilera de guiones.
    const hasTime = session.results.some((r) => r.time || r.gap || r.statusText);
    const isOval = leagueSlug.startsWith('nascar') || leagueSlug === 'irl';

    if (session.results.length === 0) {
        return (
            <p className={styles.empty}>
                {session.status === 'scheduled'
                    ? `Se corre el ${diaCorto(session.startsAt)} a las ${hora(session.startsAt)}.`
                    : 'La fuente todavía no publicó los resultados de esta sesión.'}
            </p>
        );
    }

    return (
        <div className={styles.tableWrap}>
            <table className={styles.table}>
                <thead>
                    <tr>
                        <th scope="col" className={styles.thPos}>Pos</th>
                        <th scope="col" className={styles.thDriver}>Piloto</th>
                        <th scope="col" className={styles.thNum}>N°</th>
                        {hasGrid ? <th scope="col" className={styles.thNum} title="Posición de largada">Largó</th> : null}
                        {hasQ ? (
                            <>
                                <th scope="col" className={styles.thTime}>Q1</th>
                                <th scope="col" className={styles.thTime}>Q2</th>
                                <th scope="col" className={styles.thTime}>Q3</th>
                            </>
                        ) : hasTime ? (
                            <th scope="col" className={styles.thTime}>{isRace ? 'Tiempo / Gap' : 'Mejor vuelta'}</th>
                        ) : null}
                        {!hasQ && !isRace ? <th scope="col" className={styles.thTime}>Gap</th> : null}
                        <th scope="col" className={styles.thNum}>Vueltas</th>
                        {hasLed ? <th scope="col" className={styles.thNum} title="Vueltas lideradas">Lideró</th> : null}
                        {hasPits ? <th scope="col" className={styles.thNum}>Boxes</th> : null}
                        {hasPoints ? <th scope="col" className={styles.thNum}>Pts</th> : null}
                    </tr>
                </thead>
                <tbody>
                    {session.results.map((result) => (
                        <tr
                            key={`${result.driver.id ?? result.driver.name}-${result.position}`}
                            className={`${styles.row} ${result.winner ? styles.rowWinner : ''} ${result.status === 'retired' || result.status === 'disqualified' ? styles.rowOut : ''}`}
                        >
                            <td className={styles.tdPos}>
                                <span className={`${styles.pos} ${result.position <= 3 && isRace ? styles[`pos${result.position}`] : ''}`}>
                                    {result.position}
                                </span>
                            </td>
                            <td className={styles.tdDriver}><Piloto result={result} /></td>
                            <td className={styles.tdNum}>{result.number ?? <span className={styles.muted}>–</span>}</td>
                            {hasGrid ? <td className={styles.tdNum}><Grilla result={result} /></td> : null}
                            {hasQ ? (
                                <>
                                    <td className={styles.tdTime}>{result.q1 ?? <span className={styles.muted}>–</span>}</td>
                                    <td className={styles.tdTime}>{result.q2 ?? <span className={styles.muted}>–</span>}</td>
                                    <td className={styles.tdTime}>{result.q3 ? <strong>{result.q3}</strong> : <span className={styles.muted}>–</span>}</td>
                                </>
                            ) : hasTime ? (
                                <td className={styles.tdTime}>
                                    {isRace ? <Tiempo result={result} /> : (result.time ?? <span className={styles.muted}>–</span>)}
                                </td>
                            ) : null}
                            {!hasQ && !isRace ? (
                                <td className={styles.tdTime}>{result.winner ? <span className={styles.muted}>–</span> : (result.gap ?? <span className={styles.muted}>–</span>)}</td>
                            ) : null}
                            <td className={styles.tdNum}>{result.laps ?? <span className={styles.muted}>–</span>}</td>
                            {hasLed ? <td className={styles.tdNum}>{result.lapsLed || <span className={styles.muted}>–</span>}</td> : null}
                            {hasPits ? <td className={styles.tdNum}>{result.pits || <span className={styles.muted}>–</span>}</td> : null}
                            {hasPoints ? <td className={styles.tdNum}><Puntos result={result} /></td> : null}
                        </tr>
                    ))}
                </tbody>
            </table>
            {isRace && isOval && hasLed ? (
                <p className={styles.tableNote}>Los puntos extra son los de etapa y de vuelta rápida, según el reglamento de la categoría.</p>
            ) : null}
        </div>
    );
}

function Podio({ session }: { session: MotorsportSession }) {
    const top = session.results.slice(0, 3);
    if (top.length < 3) return null;
    const ordered = [top[1], top[0], top[2]];
    return (
        <ol className={styles.podium} aria-label="Podio">
            {ordered.map((result) => (
                <li key={result.position} className={`${styles.podiumItem} ${styles[`podium${result.position}`]}`}>
                    <span className={styles.podiumPos}>{result.position}°</span>
                    {result.driver.headshot ? (
                        <img src={result.driver.headshot} alt="" loading="lazy" className={styles.podiumPhoto} />
                    ) : (
                        <span className={`${styles.podiumPhoto} ${styles.headshotEmpty}`} aria-hidden="true" />
                    )}
                    <span className={styles.podiumName}>{result.driver.name}</span>
                    <span className={styles.podiumTeam}>
                        <span className={styles.teamDot} style={result.teamColor ? { background: `#${result.teamColor}` } : undefined} aria-hidden="true" />
                        {result.team ?? ''}
                    </span>
                    <span className={styles.podiumTime}>{result.winner ? result.time ?? '' : result.gap ?? ''}</span>
                </li>
            ))}
        </ol>
    );
}

export default function MotorsportEventPage({ details, fallback, onBack }: Props) {
    const sessions = useMemo(() => details?.sessions ?? [], [details]);
    const [sessionId, setSessionId] = useState<string | null>(details?.defaultSessionId ?? null);

    // Si la ficha llega después (o cambia en vivo), la sesión elegida sigue a
    // la que corresponde, salvo que el usuario ya haya tocado el riel.
    const [userPicked, setUserPicked] = useState(false);
    useEffect(() => {
        if (!userPicked) setSessionId(details?.defaultSessionId ?? null);
    }, [details?.defaultSessionId, userPicked]);

    const session = useMemo(
        () => sessions.find((s) => s.id === sessionId) ?? sessions[sessions.length - 1] ?? null,
        [sessions, sessionId],
    );
    const race = useMemo(() => sessions.find((s) => s.kind === 'race') ?? null, [sessions]);
    const estado = estadoDelEvento(details?.status ?? fallback.status);
    const href = tournamentHref(fallback, details);
    const name = details?.name ?? fallback.name;
    const series = details?.league.shortName ?? fallback.series;
    const circuit = details?.circuit;
    const lugar = [circuit?.name ?? fallback.venue, circuit?.city, circuit?.country].filter(Boolean).join(' · ');
    const fechas = details ? rangoDeFechas(details.startsAt, details.endsAt) : fecha(fallback.date, { day: 'numeric', month: 'short' });
    const proxima = sessions.find((s) => s.status === 'scheduled') ?? null;
    const drivers = details?.standings.drivers ?? [];
    const constructors = details?.standings.constructors ?? [];

    return (
        <main className={styles.page}>
            <div className={styles.shell}>
                <header className={styles.contextBar}>
                    <button type="button" className={styles.back} onClick={onBack} aria-label="Volver">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
                            <path d="M15 18l-6-6 6-6" />
                        </svg>
                    </button>
                    <nav className={styles.breadcrumbs} aria-label="Contexto del evento">
                        <span className={styles.crumb}>Automovilismo</span>
                        {href ? (
                            <Link href={href} className={`${styles.crumb} ${styles.crumbLink}`}>{series}</Link>
                        ) : (
                            <span className={styles.crumb}>{series}</span>
                        )}
                        <span className={`${styles.crumb} ${styles.crumbStrong}`}>{name}</span>
                    </nav>
                </header>

                <section className={styles.hero} aria-label="Evento">
                    <div className={styles.heroMain}>
                        <p className={styles.eyebrow}>
                            <span className={styles.seriesPill}>{series}</span>
                            {details?.round.number ? (
                                <span>
                                    Fecha {details.round.number}{details.round.total ? ` de ${details.round.total}` : ''}
                                    {details.season ? ` · Temporada ${details.season}` : ''}
                                </span>
                            ) : null}
                        </p>
                        <h1 className={styles.title}>{name}</h1>
                        <p className={styles.meta}>
                            {circuit?.countryFlag ? <img src={circuit.countryFlag} alt="" className={styles.flag} /> : null}
                            <span>{lugar || 'Circuito por confirmar'}</span>
                            {fechas ? <span className={styles.metaSep} aria-hidden="true">·</span> : null}
                            {fechas ? <span>{fechas}</span> : null}
                        </p>
                        <p className={styles.statusRow}>
                            <span className={`${styles.status} ${estado.live ? styles.statusLive : ''}`}>
                                {estado.live ? <span className={styles.pulse} aria-hidden="true" /> : null}
                                {estado.text}
                            </span>
                            {estado.live && session?.status === 'live' ? (
                                <span className={styles.statusDetail}>
                                    {session.label}
                                    {session.lapsCompleted != null && session.totalLaps ? ` · vuelta ${session.lapsCompleted} de ${session.totalLaps}` : ''}
                                </span>
                            ) : proxima ? (
                                <span className={styles.statusDetail}>
                                    Próxima sesión: {proxima.label} · {diaCorto(proxima.startsAt)} {hora(proxima.startsAt)}
                                </span>
                            ) : null}
                        </p>
                    </div>

                    {race && race.status === 'final' && race.results.length >= 3 ? (
                        <div className={styles.heroSide}>
                            <p className={styles.sideTitle}>Podio de la carrera</p>
                            <Podio session={race} />
                        </div>
                    ) : sessions.length > 0 ? (
                        <div className={styles.heroSide}>
                            <p className={styles.sideTitle}>Programa del fin de semana</p>
                            <ol className={styles.schedule}>
                                {sessions.map((s) => (
                                    <li key={s.id} className={`${styles.scheduleItem} ${s.status === 'live' ? styles.scheduleLive : ''} ${s.status === 'final' ? styles.scheduleDone : ''}`}>
                                        <span className={styles.scheduleDay}>{diaCorto(s.startsAt)}</span>
                                        <span className={styles.scheduleLabel}>{s.label}</span>
                                        <span className={styles.scheduleTime}>{estadoDeSesion(s)}</span>
                                    </li>
                                ))}
                            </ol>
                        </div>
                    ) : null}
                </section>

                {!details ? (
                    <p className={styles.notice}>No pudimos traer las sesiones y los tiempos de este evento. Probá de nuevo en un rato.</p>
                ) : null}

                {sessions.length > 0 ? (
                    <section className={styles.block} aria-labelledby="ms-resultados">
                        <div className={styles.blockHead}>
                            <h2 id="ms-resultados" className={styles.sectionTitle}>Resultados</h2>
                            {session ? (
                                <p className={styles.blockHint}>
                                    {session.label} · {diaCorto(session.startsAt)} {hora(session.startsAt)}
                                    {session.totalLaps ? ` · ${session.totalLaps} vueltas` : ''}
                                    {session.broadcast.length ? ` · TV (EE.UU.): ${session.broadcast.join(', ')}` : ''}
                                </p>
                            ) : null}
                        </div>

                        <div className={styles.rail} role="tablist" aria-label="Sesiones del fin de semana">
                            {sessions.map((s) => {
                                const active = session?.id === s.id;
                                return (
                                    <button
                                        key={s.id}
                                        type="button"
                                        role="tab"
                                        aria-selected={active}
                                        className={`${styles.railItem} ${active ? styles.railItemActive : ''}`}
                                        onClick={() => { setUserPicked(true); setSessionId(s.id); }}
                                    >
                                        <span className={styles.railLabel}>{s.shortLabel}</span>
                                        <span className={`${styles.railState} ${s.status === 'live' ? styles.railStateLive : ''}`}>
                                            {s.status === 'live' ? 'En pista' : s.status === 'final' ? diaCorto(s.startsAt) : `${diaCorto(s.startsAt)} ${hora(s.startsAt)}`}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>

                        {session ? <TablaDeSesion session={session} leagueSlug={details?.league.slug ?? ''} /> : null}
                    </section>
                ) : null}

                <div className={styles.columns}>
                    {circuit && (circuit.name || circuit.length) ? (
                        <section className={`${styles.block} ${styles.card}`} aria-labelledby="ms-circuito">
                            <div className={styles.blockHead}>
                                <h2 id="ms-circuito" className={styles.sectionTitle}>Circuito</h2>
                                <p className={styles.blockHint}>{[circuit.city, circuit.country].filter(Boolean).join(', ')}</p>
                            </div>
                            {circuit.diagramDark ? (
                                <picture className={styles.diagram}>
                                    {circuit.diagramLight ? <source srcSet={circuit.diagramLight} media="(prefers-color-scheme: light)" /> : null}
                                    <img src={circuit.diagramDark} alt={`Trazado de ${circuit.name ?? 'el circuito'}`} loading="lazy" />
                                </picture>
                            ) : null}
                            <p className={styles.circuitName}>{circuit.name}</p>
                            <dl className={styles.facts}>
                                {circuit.length ? <div className={styles.fact}><dt>Longitud</dt><dd>{circuit.length}</dd></div> : null}
                                {circuit.laps ? <div className={styles.fact}><dt>Vueltas</dt><dd>{circuit.laps}</dd></div> : null}
                                {circuit.distance ? <div className={styles.fact}><dt>Distancia</dt><dd>{circuit.distance}</dd></div> : null}
                                {circuit.turns ? <div className={styles.fact}><dt>Curvas</dt><dd>{circuit.turns}</dd></div> : null}
                                {circuit.direction ? <div className={styles.fact}><dt>Sentido</dt><dd>{circuit.direction === 'Clockwise' ? 'Horario' : circuit.direction === 'Anti-clockwise' || circuit.direction === 'Counter-clockwise' ? 'Antihorario' : circuit.direction}</dd></div> : null}
                                {circuit.type ? <div className={styles.fact}><dt>Trazado</dt><dd>{circuit.type}</dd></div> : null}
                                {circuit.established ? <div className={styles.fact}><dt>Inaugurado</dt><dd>{circuit.established}</dd></div> : null}
                                {circuit.lapRecord ? (
                                    <div className={`${styles.fact} ${styles.factWide}`}>
                                        <dt>Récord de vuelta</dt>
                                        <dd>
                                            {circuit.lapRecord.time}
                                            {circuit.lapRecord.driver ? ` · ${circuit.lapRecord.driver}` : ''}
                                            {circuit.lapRecord.year ? ` (${circuit.lapRecord.year})` : ''}
                                        </dd>
                                    </div>
                                ) : null}
                            </dl>
                        </section>
                    ) : null}

                    {drivers.length > 0 ? (
                        <section className={`${styles.block} ${styles.card}`} aria-labelledby="ms-campeonato">
                            <div className={styles.blockHead}>
                                <h2 id="ms-campeonato" className={styles.sectionTitle}>Campeonato</h2>
                                {href ? <Link href={href} className={styles.blockLink}>Ver la tabla completa</Link> : null}
                            </div>
                            <ol className={styles.standings}>
                                {drivers.slice(0, 10).map((row, i) => {
                                    const leader = drivers[0]?.points ?? 0;
                                    return (
                                        <li key={`${row.name}-${row.position}`} className={styles.standingRow}>
                                            <span className={styles.standingPos}>{row.position}</span>
                                            <span className={styles.standingName}>
                                                {row.countryFlag ? <img src={row.countryFlag} alt="" loading="lazy" className={styles.flag} /> : null}
                                                <span className={styles.standingFull}>{row.name}</span>
                                                {row.team ? <span className={styles.standingTeam}>{row.team}</span> : null}
                                            </span>
                                            <span className={styles.standingGap}>{i === 0 ? 'Líder' : `-${leader - row.points}`}</span>
                                            <span className={styles.standingPts}>{row.points}</span>
                                        </li>
                                    );
                                })}
                            </ol>
                            {constructors.length > 0 ? (
                                <>
                                    <h3 className={styles.subTitle}>Constructores</h3>
                                    <ol className={styles.standings}>
                                        {constructors.slice(0, 5).map((row) => (
                                            <li key={`${row.name}-${row.position}`} className={styles.standingRow}>
                                                <span className={styles.standingPos}>{row.position}</span>
                                                <span className={styles.standingName}><span className={styles.standingFull}>{row.name}</span></span>
                                                <span className={styles.standingGap}>{row.wins ? `${row.wins} ${row.wins === 1 ? 'victoria' : 'victorias'}` : ''}</span>
                                                <span className={styles.standingPts}>{row.points}</span>
                                            </li>
                                        ))}
                                    </ol>
                                </>
                            ) : null}
                        </section>
                    ) : null}
                </div>

                {details && (details.previousEvent || details.nextEvent) ? (
                    <nav className={styles.neighbors} aria-label="Otras fechas del calendario">
                        {details.previousEvent ? (
                            <Link href={`/matches/${encodeURIComponent(details.previousEvent.id)}`} className={styles.neighbor}>
                                <span className={styles.neighborLabel}>Fecha anterior</span>
                                <span className={styles.neighborName}>{details.previousEvent.name}</span>
                                <span className={styles.neighborMeta}>{diaCorto(details.previousEvent.startsAt)}</span>
                            </Link>
                        ) : <span />}
                        {details.nextEvent ? (
                            <Link href={`/matches/${encodeURIComponent(details.nextEvent.id)}`} className={`${styles.neighbor} ${styles.neighborNext}`}>
                                <span className={styles.neighborLabel}>Próxima fecha</span>
                                <span className={styles.neighborName}>{details.nextEvent.name}</span>
                                <span className={styles.neighborMeta}>{diaCorto(details.nextEvent.startsAt)}</span>
                            </Link>
                        ) : null}
                    </nav>
                ) : null}
            </div>
        </main>
    );
}
