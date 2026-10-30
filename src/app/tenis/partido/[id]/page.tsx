import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import CountryFlag from '@/components/CountryFlag';
import {
    etiquetaDeEstado,
    etiquetaDeRonda,
    etiquetaDeSuperficie,
} from '@/lib/tennis/labels';
import { getTennisMatch } from '@/lib/services/tennis';
import type { TennisMatchDetails, TennisPathStep, TennisPlayerProfile } from '@/lib/services/tennis';
import type { TennisMatch, TennisSide } from '@/types/tennis';

import LiveRefresh from './LiveRefresh';
import Retrato from './Retrato';
import TennisStatsPanel from './TennisStatsPanel';
import styles from './page.module.css';

export const dynamic = 'force-dynamic';

/**
 * Ficha de un partido de tenis.
 *
 * Ruta propia y no `/matches/<id>`: esa ficha está armada para dos clubes con
 * escudo y un marcador, y con un id de tenis devuelve una pantalla de errores.
 *
 * El ARMADO, en cambio, sí es el del resto del sitio —contexto arriba, tarjeta
 * de marcador, fichas de datos, rail y planilla— porque el que entra desde la
 * portada no debería sentir que cambió de producto. Lo que cambia es con qué se
 * llena cada pieza: donde el fútbol pone dos escudos y un número, el tenis pone
 * dos personas y la línea de games set por set, que es como se lee un partido.
 *
 * Lo que ESPN no da (estadísticas del partido, superficie) no se inventa. Lo
 * que sí da y antes no se mostraba —la ficha de cada jugador, el camino de los
 * dos en el cuadro, el formato, el campeón anterior— ahora está abajo del
 * marcador, en el orden en que uno lo pregunta: qué pasó, quiénes son, cómo
 * llegaron hasta acá.
 */

const USER_TZ = 'America/Argentina/Buenos_Aires';

const DESCRIPCION_MAX = 155;

function recortar(texto: string): string {
    if (texto.length <= DESCRIPCION_MAX) return texto;
    return `${texto.slice(0, DESCRIPCION_MAX - 1).trimEnd()}…`;
}

export async function generateMetadata({
    params,
}: {
    params: Promise<{ id: string }>;
}): Promise<Metadata> {
    const { id } = await params;
    // El título no puede tumbar la página: si el proveedor no contesta, la
    // ficha igual tiene que renderizar y decir lo suyo.
    let details: TennisMatchDetails | null = null;
    try {
        details = await getTennisMatch(id);
    } catch {
        details = null;
    }
    if (!details) return { title: 'Partido de tenis · G22 Scores' };

    const { match, resumen } = details;
    const cruce = `${match.home.name} vs ${match.away.name}`;
    const ronda = etiquetaDeRonda(match.round);
    const torneo = match.tournament.name;
    const contexto = [ronda, torneo].filter(Boolean).join(' · ');

    const base = `${cruce}${contexto ? `, ${contexto}` : ''}.`;
    const cuerpo = match.status === 'final' && resumen
        ? `Resultado: ${resumen}. Marcador set por set y estadísticas del partido.`
        : 'Marcador en vivo, set por set, y estadísticas del partido.';

    return {
        title: `${cruce}${contexto ? ` · ${contexto}` : ''} · G22 Scores`,
        description: recortar(`${base} ${cuerpo}`),
    };
}

function ladoGanador(match: TennisMatch): 'home' | 'away' | null {
    const home = match.home.setsWon;
    const away = match.away.setsWon;
    if (match.status !== 'final' || home == null || away == null || home === away) return null;
    return home > away ? 'home' : 'away';
}

/** El set que se está jugando: el último con games cargados, y solo en vivo. */
function setEnCurso(match: TennisMatch): number | null {
    if (!match.isLive || match.sets.length === 0) return null;
    return match.sets[match.sets.length - 1].set;
}

function fechaCorta(date: Date | null): string | null {
    if (!date) return null;
    return date.toLocaleDateString('es-AR', { day: 'numeric', month: 'short', timeZone: USER_TZ });
}

function horaLocal(date: Date | null): string | null {
    if (!date) return null;
    return date.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: USER_TZ });
}

function Jugador({
    side,
    esGanador,
    esDobles,
    rol,
}: {
    side: TennisSide;
    esGanador: boolean;
    esDobles: boolean;
    rol: string;
}) {
    const nombres = side.players.length ? side.players : [side.name];

    return (
        <div className={`${styles.player} ${esGanador ? styles.playerWinner : ''}`}>
            <div className={styles.portraitWrap}>
                <Retrato side={side} esDobles={esDobles} />
            </div>
            <div className={styles.playerMeta}>
                <p className={styles.playerRole}>{rol}</p>
                <p className={styles.playerName}>
                    {nombres.map((nombre, i) => (
                        <span key={nombre} className={styles.playerNameLine}>
                            {nombre}
                            {i < nombres.length - 1 ? <span className={styles.playerNameSep}> / </span> : null}
                        </span>
                    ))}
                </p>
                <p className={styles.playerTags}>
                    {side.isServing ? <span className={styles.playerServing}>Saca</span> : null}
                    {side.country?.name ? (
                        <span className={styles.playerCountry}>
                            <CountryFlag countryId={side.country.code} countryName={side.country.name} size={16} />
                            <span>{side.country.alpha3 ?? side.country.name}</span>
                        </span>
                    ) : null}
                    {side.seed != null ? <span className={styles.playerSeed}>Sembrado {side.seed}</span> : null}
                    {esGanador ? <span className={styles.playerWon}>Ganador</span> : null}
                </p>
            </div>
        </div>
    );
}

function Chip({ label, value }: { label: string; value: string }) {
    return (
        <span className={styles.chip}>
            <span className={styles.chipLabel}>{label}</span>
            <strong className={styles.chipValue}>{value}</strong>
        </span>
    );
}

/**
 * La ficha del jugador: lo que el cronista dice antes del partido. El ranking
 * va primero porque es lo que ordena el cuadro; el sembrado ya está arriba.
 */
function FichaJugador({
    side,
    profile,
    lado,
}: {
    side: TennisSide;
    profile: TennisPlayerProfile | null;
    lado: 'home' | 'away';
}) {
    const datos: Array<{ label: string; value: string }> = [];
    if (profile?.ranking != null) datos.push({ label: 'Ranking', value: `${profile.ranking}°` });
    if (profile?.age != null) datos.push({ label: 'Edad', value: `${profile.age} años` });
    if (profile?.heightCm != null) datos.push({ label: 'Altura', value: `${(profile.heightCm / 100).toFixed(2).replace('.', ',')} m` });
    if (profile?.hand) datos.push({ label: 'Mano', value: profile.hand });
    if (profile?.debutYear != null) {
        datos.push({
            label: 'En el circuito',
            value: profile.seasons != null ? `desde ${profile.debutYear} · ${profile.seasons} temporadas` : `desde ${profile.debutYear}`,
        });
    }
    if (profile?.birthPlace) datos.push({ label: 'Nacido en', value: profile.birthPlace });

    return (
        <article className={`${styles.ficha} ${lado === 'away' ? styles.fichaAway : ''}`}>
            <header className={styles.fichaHead}>
                <span className={styles.fichaMark} aria-hidden="true" />
                <div className={styles.fichaTitle}>
                    <span className={styles.fichaName}>{side.name}</span>
                    {side.country?.name ? (
                        <span className={styles.fichaCountry}>
                            <CountryFlag countryId={side.country.code} countryName={side.country.name} size={14} />
                            <span>{side.country.name}</span>
                        </span>
                    ) : null}
                </div>
            </header>
            {datos.length > 0 ? (
                <dl className={styles.fichaList}>
                    {datos.map((dato) => (
                        <div key={dato.label} className={styles.fichaRow}>
                            <dt className={styles.fichaLabel}>{dato.label}</dt>
                            <dd className={styles.fichaValue}>{dato.value}</dd>
                        </div>
                    ))}
                </dl>
            ) : (
                <p className={styles.fichaEmpty}>La fuente no publica la ficha de este jugador.</p>
            )}
        </article>
    );
}

function rotuloDeResultado(step: TennisPathStep): { text: string; tone: 'won' | 'lost' | 'live' | 'pending' } {
    if (step.status === 'live') return { text: etiquetaDeEstado(step.statusLabel, step.status), tone: 'live' };
    if (step.won === true) return { text: step.statusLabel === 'Walkover' ? 'W.O. a favor' : 'Ganó', tone: 'won' };
    if (step.won === false) return { text: step.statusLabel === 'Retired' ? 'Abandonó' : 'Perdió', tone: 'lost' };
    if (step.status === 'other') return { text: etiquetaDeEstado(step.statusLabel, step.status), tone: 'pending' };
    return { text: 'Por jugar', tone: 'pending' };
}

/**
 * El camino en el cuadro, de la primera ronda a la última. El cruce que se está
 * mirando queda marcado; el que sigue aparece aunque el rival no exista todavía,
 * porque el lugar en la llave ya es del jugador.
 */
function Camino({ side, steps, lado }: { side: TennisSide; steps: TennisPathStep[]; lado: 'home' | 'away' }) {
    return (
        <article className={`${styles.camino} ${lado === 'away' ? styles.caminoAway : ''}`}>
            <h3 className={styles.caminoName}>
                <span className={styles.fichaMark} aria-hidden="true" />
                {side.name}
            </h3>
            <ol className={styles.caminoList}>
                {steps.map((step) => {
                    const rotulo = rotuloDeResultado(step);
                    const contenido = (
                        <>
                            <span className={styles.caminoRound}>{etiquetaDeRonda(step.round) ?? '—'}</span>
                            <span className={styles.caminoRival}>
                                {step.opponent ? (
                                    <>
                                        {step.opponent.country?.code || step.opponent.country?.name ? (
                                            <CountryFlag
                                                countryId={step.opponent.country.code}
                                                countryName={step.opponent.country.name}
                                                size={14}
                                                className={styles.caminoFlag}
                                            />
                                        ) : null}
                                        <span className={styles.caminoRivalName}>{step.opponent.name}</span>
                                        {step.opponent.seed != null ? (
                                            <span className={styles.caminoSeed}>({step.opponent.seed})</span>
                                        ) : null}
                                    </>
                                ) : (
                                    <span className={styles.caminoRivalName}>Rival por definir</span>
                                )}
                            </span>
                            <span className={styles.caminoScore}>
                                {step.score || (step.status === 'scheduled' ? fechaCorta(step.startsAt) ?? '' : '')}
                            </span>
                            <span className={`${styles.caminoTag} ${styles[`caminoTag_${rotulo.tone}`]}`}>{rotulo.text}</span>
                        </>
                    );
                    return (
                        <li
                            key={step.matchId}
                            className={`${styles.caminoItem} ${step.isCurrent ? styles.caminoCurrent : ''}`}
                            aria-current={step.isCurrent ? 'true' : undefined}
                        >
                            {step.isCurrent || !step.opponent ? (
                                <span className={styles.caminoRow}>{contenido}</span>
                            ) : (
                                <Link href={`/tenis/partido/${encodeURIComponent(step.matchId)}`} className={styles.caminoRow}>
                                    {contenido}
                                </Link>
                            )}
                        </li>
                    );
                })}
            </ol>
        </article>
    );
}

function Aviso({ children }: { children: React.ReactNode }) {
    return (
        <main className={styles.page}>
            <div className={styles.shell}>
                <h1 className={styles.title}>Partido de tenis</h1>
                <p className={styles.notice}>{children}</p>
                <Link className={styles.backLink} href="/">Volver a los partidos</Link>
            </div>
        </main>
    );
}

export default async function TenisPartidoPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;

    let details: TennisMatchDetails | null = null;
    try {
        details = await getTennisMatch(id);
    } catch {
        // El proveedor se cayó. Es distinto de "el partido no existe": una ficha
        // que dijera "no encontrado" mandaría a buscar un partido que sí está.
        return <Aviso>No pudimos consultar el proveedor. Probá de nuevo en un rato.</Aviso>;
    }

    if (!details) notFound();

    const { match, statistics, resumen, profiles, paths, tournament, broadcast } = details;
    const gana = ladoGanador(match);
    const enCurso = setEnCurso(match);
    const superficie = etiquetaDeSuperficie(match.surface);
    const ronda = etiquetaDeRonda(match.round);
    const estado = etiquetaDeEstado(match.statusLabel, match.status);
    const puntoEnJuego = match.isLive && Boolean(match.home.gamePoint || match.away.gamePoint);

    const fecha = fechaCorta(match.startsAt);
    // Sin `timeValid` la hora es un relleno del proveedor, no el orden de juego.
    const hora = match.timeValid ? horaLocal(match.startsAt) : null;
    const cuadroHref = `/tenis/torneo/${encodeURIComponent(match.tournament.id)}`;
    const fechasTorneo = tournament.startsAt && tournament.endsAt
        ? `${fechaCorta(tournament.startsAt)} – ${fechaCorta(tournament.endsAt)}`
        : fechaCorta(tournament.startsAt);
    const hayFichas = !match.isDoubles && (profiles.home || profiles.away);
    const hayCamino = paths.home.length > 1 || paths.away.length > 1;

    return (
        <main className={styles.page}>
            {match.isLive ? <LiveRefresh /> : null}

            <div className={styles.shell}>
                <header className={styles.contextBar}>
                    <Link className={styles.back} href="/" aria-label="Volver a los partidos">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
                            <path d="M15 18l-6-6 6-6" />
                        </svg>
                    </Link>
                    <nav className={styles.breadcrumbs} aria-label="Contexto del partido">
                        <span className={styles.crumb}>Tenis</span>
                        {match.tournament.tour ? <span className={styles.crumb}>{match.tournament.tour}</span> : null}
                        <Link href={cuadroHref} className={`${styles.crumb} ${styles.crumbLink}`} title="Ver el cuadro">
                            {match.tournament.name}
                        </Link>
                        {ronda ? <span className={`${styles.crumb} ${styles.crumbStrong}`}>{ronda}</span> : null}
                    </nav>
                </header>

                <h1 className={styles.title}>
                    {match.home.name} <span className={styles.titleVs}>vs</span> {match.away.name}
                </h1>

                <section className={styles.scoreboard} aria-label="Resultado">
                    <div className={styles.statusRow}>
                        <span className={`${styles.status} ${match.isLive ? styles.statusLive : ''}`}>
                            {match.isLive ? <span className={styles.pulse} aria-hidden="true" /> : null}
                            {estado}
                        </span>
                        {puntoEnJuego ? (
                            <span className={styles.gamePoint}>
                                <span className={styles.gamePointLabel}>Game en juego</span>
                                <span className={styles.gamePointValue}>
                                    {match.home.gamePoint ?? '0'}
                                    <span className={styles.gamePointSep} aria-hidden="true">–</span>
                                    {match.away.gamePoint ?? '0'}
                                </span>
                            </span>
                        ) : null}
                    </div>

                    <div className={styles.duel}>
                        <Jugador side={match.home} esGanador={gana === 'home'} esDobles={match.isDoubles} rol="Local" />

                        <div className={styles.setsWon}>
                            <div className={styles.setsWonPair}>
                                <span className={`${styles.setsWonNum} ${gana === 'home' ? styles.setsWonLeads : ''}`}>
                                    {match.home.setsWon ?? '-'}
                                </span>
                                <span className={styles.setsWonSep} aria-hidden="true">:</span>
                                <span className={`${styles.setsWonNum} ${gana === 'away' ? styles.setsWonLeads : ''}`}>
                                    {match.away.setsWon ?? '-'}
                                </span>
                            </div>
                            <span className={styles.setsWonCaption}>Sets</span>
                        </div>

                        <Jugador side={match.away} esGanador={gana === 'away'} esDobles={match.isDoubles} rol="Visitante" />
                    </div>

                    {match.sets.length > 0 ? (
                        <div className={styles.lineWrap}>
                            <table className={styles.line}>
                                <caption className={styles.lineCaption}>Games por set</caption>
                                <thead>
                                    <tr>
                                        <th scope="col" className={styles.lineNameHead}>Jugador</th>
                                        {match.sets.map((set) => (
                                            <th
                                                key={set.set}
                                                scope="col"
                                                className={`${styles.lineCell} ${styles.lineHeadCell} ${set.set === enCurso ? styles.lineCellLive : ''}`}
                                            >
                                                {set.set}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {(['home', 'away'] as const).map((lado) => (
                                        <tr key={lado} className={gana === lado ? styles.lineRowWinner : ''}>
                                            <th scope="row" className={styles.lineName}>
                                                {match[lado].players[0] || match[lado].name}
                                            </th>
                                            {match.sets.map((set) => {
                                                const games = lado === 'home' ? set.home : set.away;
                                                const rival = lado === 'home' ? set.away : set.home;
                                                const tb = lado === 'home' ? set.homeTiebreak : set.awayTiebreak;
                                                // El set ganado se marca solo cuando está cerrado: en
                                                // el set en curso ir 5-4 no es haberlo ganado.
                                                const ganoElSet =
                                                    set.set !== enCurso && games != null && rival != null && games > rival;
                                                return (
                                                    <td
                                                        key={set.set}
                                                        className={`${styles.lineCell} ${ganoElSet ? styles.lineCellWon : ''} ${set.set === enCurso ? styles.lineCellLive : ''}`}
                                                    >
                                                        {games ?? '-'}
                                                        {tb != null ? <sup className={styles.lineTiebreak}>{tb}</sup> : null}
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <p className={styles.notice}>
                            {match.status === 'final'
                                ? 'El partido no se jugó: walkover o retiro antes de empezar.'
                                : 'Todavía no empezó.'}
                        </p>
                    )}

                    {resumen ? <p className={styles.resumen}>{resumen}</p> : null}

                    <div className={styles.chips}>
                        {fecha ? <Chip label="Fecha" value={hora ? `${fecha} · ${hora}` : fecha} /> : null}
                        {!hora && match.status === 'scheduled' ? <Chip label="Hora" value="A confirmar" /> : null}
                        {match.bestOf ? <Chip label="Formato" value={`Al mejor de ${match.bestOf} sets`} /> : null}
                        {superficie ? <Chip label="Superficie" value={superficie} /> : null}
                        {ronda ? <Chip label="Instancia" value={ronda} /> : null}
                        {match.tournament.tour ? <Chip label="Circuito" value={match.tournament.tour} /> : null}
                        <Chip label="Modalidad" value={match.draw ?? (match.isDoubles ? 'Dobles' : 'Individual')} />
                        {match.court ? <Chip label="Cancha" value={match.court} /> : null}
                    </div>
                </section>

                {hayFichas ? (
                    <section className={styles.block} aria-labelledby="tenis-fichas-title">
                        <div className={styles.statsHead}>
                            <h2 id="tenis-fichas-title" className={styles.sectionTitle}>Los jugadores</h2>
                            <p className={styles.blockHint}>Ranking de la semana y ficha del circuito.</p>
                        </div>
                        <div className={styles.fichas}>
                            <FichaJugador side={match.home} profile={profiles.home} lado="home" />
                            <FichaJugador side={match.away} profile={profiles.away} lado="away" />
                        </div>
                    </section>
                ) : null}

                {hayCamino ? (
                    <section className={styles.block} aria-labelledby="tenis-camino-title">
                        <div className={styles.statsHead}>
                            <h2 id="tenis-camino-title" className={styles.sectionTitle}>Camino en el torneo</h2>
                            <p className={styles.blockHint}>Cada cruce abre su ficha. El que se está mirando queda marcado.</p>
                        </div>
                        <div className={styles.caminos}>
                            <Camino side={match.home} steps={paths.home} lado="home" />
                            <Camino side={match.away} steps={paths.away} lado="away" />
                        </div>
                    </section>
                ) : null}

                <section className={styles.block} aria-labelledby="tenis-torneo-title">
                    <div className={styles.statsHead}>
                        <h2 id="tenis-torneo-title" className={styles.sectionTitle}>El torneo</h2>
                        <Link href={cuadroHref} className={styles.blockLink}>Ver el cuadro completo</Link>
                    </div>
                    <div className={styles.torneo}>
                        <div className={styles.torneoMain}>
                            <p className={styles.torneoName}>{match.tournament.name}</p>
                            <p className={styles.torneoMeta}>
                                {[match.tournament.tour, match.draw, tournament.venue].filter(Boolean).join(' · ')}
                            </p>
                        </div>
                        <dl className={styles.torneoFacts}>
                            {fechasTorneo ? (
                                <div className={styles.fichaRow}>
                                    <dt className={styles.fichaLabel}>Fechas</dt>
                                    <dd className={styles.fichaValue}>{fechasTorneo}</dd>
                                </div>
                            ) : null}
                            {tournament.previousWinner ? (
                                <div className={styles.fichaRow}>
                                    <dt className={styles.fichaLabel}>Campeón anterior</dt>
                                    <dd className={`${styles.fichaValue} ${styles.torneoChampion}`}>
                                        {tournament.previousWinner.headshot ? (
                                            <img
                                                src={tournament.previousWinner.headshot}
                                                alt=""
                                                loading="lazy"
                                                className={styles.torneoChampionPhoto}
                                            />
                                        ) : null}
                                        <span>{tournament.previousWinner.name}</span>
                                    </dd>
                                </div>
                            ) : null}
                            {broadcast.length > 0 ? (
                                <div className={styles.fichaRow}>
                                    <dt className={styles.fichaLabel}>TV (EE.UU.)</dt>
                                    <dd className={styles.fichaValue}>{broadcast.join(', ')}</dd>
                                </div>
                            ) : null}
                        </dl>
                    </div>
                </section>

                <TennisStatsPanel
                    statistics={statistics}
                    homeName={match.home.name}
                    awayName={match.away.name}
                />
            </div>
        </main>
    );
}
