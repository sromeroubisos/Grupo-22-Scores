'use client';

import Link from 'next/link';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import CountryFlag from '@/components/CountryFlag';
import { etiquetaDeEstado, etiquetaDeRonda } from '@/lib/tennis/labels';
import { useTennisLive } from './useTennisLive';
import type { TennisDay, TennisMatch, TennisSide } from '@/types/tennis';

import styles from './TennisMatchList.module.css';

/**
 * El feed de tenis.
 *
 * No reusa `MatchRow` a propósito: ahí un partido es un marcador entre dos
 * escudos, y acá es una planilla —dos jugadores, una columna por set—. Un
 * dobles son dos personas por lado y ninguna tiene escudo.
 *
 * En vivo se marca quién saca: la fuente da el sacador ACTUAL, no quién sacó
 * primero, así que la pelotita dice la verdad game a game.
 */

interface Props {
    /** Fecha en formato YYYY-MM-DD, en el huso del visitante. */
    dateKey: string;
    /** Solo partidos en vivo, cuando el feed está en ese modo. */
    liveOnly?: boolean;
}

/** El JSON de la ruta trae `startsAt` como string ISO, no como Date. */
type SerializedMatch = Omit<TennisMatch, 'startsAt'> & { startsAt: string | null };
type SerializedTournament = Omit<TennisDay['tournaments'][number], 'matches'> & {
    matches: SerializedMatch[];
};
type SerializedDay = Omit<TennisDay, 'tournaments'> & { tournaments: SerializedTournament[] };

function horaLocal(iso: string | null): string {
    if (!iso) return '';
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false });
}

/** El ganador es el que tiene más sets. Un partido sin sets no tiene ganador. */
function ganador(match: SerializedMatch): 'home' | 'away' | null {
    const home = match.home.setsWon;
    const away = match.away.setsWon;
    if (match.status !== 'final' || home == null || away == null || home === away) return null;
    return home > away ? 'home' : 'away';
}

/**
 * La cara del jugador, con la bandera de reserva.
 *
 * En el feed manda la bandera: el banco de retratos del proveedor no tiene ni
 * a la mitad del top 150, y cada foto ausente es un 404 en la consola de la
 * portada, así que el servicio no manda foto acá (sí en la ficha, verificada).
 * La rama de la foto queda por si eso cambia. Sin bandera queda la silueta:
 * nunca un hueco que descuadre la fila.
 */
function Cara({ side, esDobles }: { side: TennisSide; esDobles: boolean }) {
    const [fotoRota, setFotoRota] = useState(false);
    const hayFoto = !esDobles && side.photo && !fotoRota;

    if (hayFoto) {
        return (
            <img
                src={side.photo as string}
                alt=""
                loading="lazy"
                className={styles.avatar}
                onError={() => setFotoRota(true)}
            />
        );
    }

    if (side.country?.code || side.country?.name) {
        return (
            <CountryFlag
                countryId={side.country.code}
                countryName={side.country.name}
                size={18}
                className={styles.avatarFlag}
            />
        );
    }

    return (
        <span className={styles.avatarFallback} aria-hidden="true">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
            </svg>
        </span>
    );
}

function Lado({ side, esGanador, esDobles }: { side: TennisSide; esGanador: boolean; esDobles: boolean }) {
    return (
        <div className={`${styles.side} ${esGanador ? styles.winner : ''}`}>
            <Cara side={side} esDobles={esDobles} />
            <span className={styles.country}>{side.country?.alpha3 || ''}</span>
            <span className={styles.names} title={side.name}>
                {/* En dobles son dos personas: se separan con coma, no con la
                    barra del proveedor, que se lee como un solo nombre raro. */}
                {side.players.length ? side.players.join(', ') : side.name}
            </span>
            {side.seed != null ? <span className={styles.seed}>({side.seed})</span> : null}
            {side.isServing ? (
                <span className={styles.serving} role="img" aria-label="Saca" title="Saca" />
            ) : null}
        </div>
    );
}

function FilaDeSets({ side, sets, live, lado }: {
    side: TennisSide;
    sets: TennisMatch['sets'];
    live: boolean;
    lado: 'home' | 'away';
}) {
    return (
        <div className={styles.scoreRow}>
            {sets.map((set) => {
                const propios = lado === 'home' ? set.home : set.away;
                const ajenos = lado === 'home' ? set.away : set.home;
                const tiebreak = lado === 'home' ? set.homeTiebreak : set.awayTiebreak;
                const ganoElSet = propios != null && ajenos != null && propios > ajenos;
                return (
                    <span key={set.set} className={`${styles.games} ${ganoElSet ? styles.gamesWon : ''}`}>
                        {propios ?? '-'}
                        {tiebreak != null ? <sup className={styles.tiebreak}>{tiebreak}</sup> : null}
                    </span>
                );
            })}
            {live ? <span className={styles.point}>{side.gamePoint ?? ''}</span> : null}
            <span className={styles.setsWon}>{side.setsWon ?? '-'}</span>
        </div>
    );
}

const Partido = memo(function Partido({ match }: { match: SerializedMatch }) {
    const gana = ganador(match);
    const sinSets = match.sets.length === 0;
    const rivales = `${match.home.name} vs ${match.away.name}`;

    /* Un destello corto cuando el partido trae dato nuevo, para que se vea cuál
       se movió sin tener que comparar contra lo que uno recordaba. `memo` hace
       que este efecto sólo corra en la fila que cambió; el montaje inicial no
       cuenta, o parpadearía la lista entera al abrir. */
    const [destello, setDestello] = useState(false);
    const yaMonto = useRef(false);
    useEffect(() => {
        if (!yaMonto.current) {
            yaMonto.current = true;
            return;
        }
        setDestello(true);
        const t = setTimeout(() => setDestello(false), 1200);
        return () => clearTimeout(t);
    }, [match]);

    return (
        <Link
            href={`/tenis/partido/${encodeURIComponent(match.id)}`}
            className={`${styles.match} ${destello ? styles.flash : ''}`}
            aria-label={`Ver ${rivales}`}
        >
            <div className={styles.state}>
                {match.isLive ? (
                    <span className={styles.live}>{etiquetaDeEstado(match.statusLabel, match.status)}</span>
                ) : (
                    <span>{match.status === 'final' ? 'Final' : horaLocal(match.startsAt)}</span>
                )}
                {match.round ? <span className={styles.round}>{etiquetaDeRonda(match.round)}</span> : null}
            </div>

            <div className={styles.sides}>
                <Lado side={match.home} esGanador={gana === 'home'} esDobles={match.isDoubles} />
                <Lado side={match.away} esGanador={gana === 'away'} esDobles={match.isDoubles} />
            </div>

            {sinSets ? (
                /* Un partido cerrado sin sets es un W.O. o un retiro antes de
                   empezar. Mostrar "0-0" diría que se jugó y terminó igualado. */
                <span className={styles.walkover}>{match.status === 'final' ? 'Sin juego' : ''}</span>
            ) : (
                <div className={styles.score}>
                    <FilaDeSets side={match.home} sets={match.sets} live={match.isLive} lado="home" />
                    <FilaDeSets side={match.away} sets={match.sets} live={match.isLive} lado="away" />
                </div>
            )}
        </Link>
    );
});

/**
 * El torneo, que abre y cierra. Arranca abierto: el que entra al feed quiere
 * ver partidos, no una lista de carpetas. El botón dice qué va a pasar con
 * `aria-expanded`, y el panel se oculta con `hidden` para que el lector de
 * pantalla no lea lo que está cerrado.
 */
function Torneo({ tournament }: { tournament: SerializedTournament }) {
    const [abierto, setAbierto] = useState(true);
    const panelId = `tenis-torneo-${tournament.id}`;

    return (
        <section id={`tenis-t-${tournament.id}`} className={styles.tournament}>
            {/* El banner tiene dos destinos: el nombre entra al torneo y el
                resto pliega. Van como <a> y <button> hermanos y no anidados —
                un link adentro de un botón no es HTML válido y el teclado no
                sabría a cuál de los dos está apuntando. */}
            <div className={styles.tournamentHeader}>
                <Link
                    href={`/tenis/torneo/${encodeURIComponent(tournament.id)}`}
                    className={styles.tournamentLink}
                    title={`Ver el cuadro de ${tournament.name}`}
                >
                    {tournament.tour ? <span className={styles.tour}>{tournament.tour}</span> : null}
                    <span className={styles.tournamentName}>{tournament.name}</span>
                </Link>
                <span className={styles.count}>{tournament.matches.length}</span>
                <button
                    type="button"
                    className={styles.toggle}
                    onClick={() => setAbierto((previo) => !previo)}
                    aria-expanded={abierto}
                    aria-controls={panelId}
                    aria-label={abierto ? `Ocultar partidos de ${tournament.name}` : `Ver partidos de ${tournament.name}`}
                >
                    <svg
                        className={`${styles.chevron} ${abierto ? styles.chevronOpen : ''}`}
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        aria-hidden="true"
                    >
                        <path d="M6 9l6 6 6-6" />
                    </svg>
                </button>
            </div>
            <div id={panelId} className={styles.matches} hidden={!abierto}>
                {tournament.matches.map((match) => (
                    <Partido key={match.id} match={match} />
                ))}
            </div>
        </section>
    );
}

export default function TennisMatchList({ dateKey, liveOnly = false }: Props) {
    const [day, setDay] = useState<SerializedDay | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const timeZone = useMemo(
        () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
        [],
    );

    /* Reemplaza SOLO los partidos que llegaron con dato nuevo. Los demás
       conservan su identidad de objeto, así que `memo` los saltea y React no
       vuelve a dibujar ni el torneo cerrado ni la fila que no se movió. */
    const fusionar = useCallback((actualizados: Map<string, SerializedMatch>) => {
        setDay((previo) => {
            if (!previo) return previo;
            let hubocambio = false;
            const tournaments = previo.tournaments.map((torneo) => {
                let cambioElTorneo = false;
                const matches = torneo.matches.map((match) => {
                    const nuevo = actualizados.get(match.id);
                    if (!nuevo || nuevo === match) return match;
                    cambioElTorneo = true;
                    return nuevo;
                });
                if (!cambioElTorneo) return torneo;
                hubocambio = true;
                return { ...torneo, matches };
            });
            return hubocambio ? { ...previo, tournaments } : previo;
        });
    }, []);

    const idsEnVivo = useMemo(
        () => (day?.tournaments ?? []).flatMap((t) => t.matches.filter((m) => m.isLive).map((m) => m.id)),
        [day],
    );

    /* Sólo se sondea si hay algo que pueda moverse. Una fecha vieja sin
       partidos en vivo no cambia, y sondearla sería gastar pedidos al pedo. */
    useTennisLive<SerializedMatch>({
        activo: idsEnVivo.length > 0,
        idsEnVivo,
        onMatches: fusionar,
    });

    useEffect(() => {
        const controller = new AbortController();
        setLoading(true);
        setError(null);

        const query = liveOnly
            ? 'live=1'
            : `date=${encodeURIComponent(dateKey)}&tz=${encodeURIComponent(timeZone)}`;

        fetch(`/api/tennis/matches?${query}`, { signal: controller.signal, cache: 'no-store' })
            .then(async (res) => {
                const payload = await res.json();
                if (controller.signal.aborted) return;
                if (!res.ok) {
                    // El mensaje viene de la ruta y distingue "el bridge no está
                    // configurado" de "el bridge falló". No se colapsan en uno.
                    setError(payload?.message || 'No se pudo consultar el tenis.');
                    setDay(null);
                    return;
                }
                setDay(payload as SerializedDay);
            })
            .catch((err) => {
                if (controller.signal.aborted || (err as Error).name === 'AbortError') return;
                setError('No se pudo consultar el tenis.');
                setDay(null);
            })
            .finally(() => {
                if (!controller.signal.aborted) setLoading(false);
            });

        return () => controller.abort();
    }, [dateKey, liveOnly, timeZone]);

    if (loading) {
        return (
            <div className={styles.empty}>
                <p>Cargando tenis...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className={styles.empty}>
                <h2>No se pudo cargar el tenis</h2>
                <p>{error}</p>
            </div>
        );
    }

    const tournaments = day?.tournaments ?? [];
    if (tournaments.length === 0) {
        return (
            <div className={styles.empty}>
                <h2>{liveOnly ? 'No hay partidos en vivo' : 'No hay partidos programados'}</h2>
                <p>
                    {liveOnly
                        ? 'No se encontraron partidos de tenis en juego.'
                        : 'No se encontraron partidos de tenis para esta fecha.'}
                </p>
            </div>
        );
    }

    return (
        <div className={styles.wrap}>
            {tournaments.map((tournament) => (
                <Torneo key={tournament.id} tournament={tournament} />
            ))}
        </div>
    );
}
