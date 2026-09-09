import Link from 'next/link';
import { notFound } from 'next/navigation';

import CountryFlag from '@/components/CountryFlag';
import {
    etiquetaDeEstado,
    etiquetaDeRonda,
    etiquetaDeSuperficie,
} from '@/lib/tennis/labels';
import { getTennisMatch } from '@/lib/services/tennis';
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
 */

const USER_TZ = 'America/Argentina/Buenos_Aires';

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

    let details = null;
    try {
        details = await getTennisMatch(id);
    } catch {
        // El proveedor se cayó. Es distinto de "el partido no existe": una ficha
        // que dijera "no encontrado" mandaría a buscar un partido que sí está.
        return <Aviso>No pudimos consultar el proveedor. Probá de nuevo en un rato.</Aviso>;
    }

    if (!details) notFound();

    const { match, statistics } = details;
    const gana = ladoGanador(match);
    const enCurso = setEnCurso(match);
    const superficie = etiquetaDeSuperficie(match.surface);
    const ronda = etiquetaDeRonda(match.round);
    const estado = etiquetaDeEstado(match.statusLabel, match.status);
    const puntoEnJuego = match.isLive && Boolean(match.home.gamePoint || match.away.gamePoint);

    const fecha = match.startsAt
        ? match.startsAt.toLocaleDateString('es-AR', { day: 'numeric', month: 'short', timeZone: USER_TZ })
        : null;
    const hora = match.startsAt
        ? match.startsAt.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', timeZone: USER_TZ })
        : null;

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
                        <span className={styles.crumb}>{match.tournament.name}</span>
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

                    <div className={styles.chips}>
                        {fecha ? <Chip label="Fecha" value={hora ? `${fecha} · ${hora}` : fecha} /> : null}
                        {superficie ? <Chip label="Superficie" value={superficie} /> : null}
                        {ronda ? <Chip label="Instancia" value={ronda} /> : null}
                        {match.tournament.tour ? <Chip label="Circuito" value={match.tournament.tour} /> : null}
                        <Chip label="Modalidad" value={match.draw ?? (match.isDoubles ? 'Dobles' : 'Individual')} />
                        {match.court ? <Chip label="Cancha" value={match.court} /> : null}
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
