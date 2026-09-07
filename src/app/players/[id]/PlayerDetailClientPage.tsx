'use client';

/**
 * LA FICHA DE UN JUGADOR DE PROVEEDOR (RugbyPass, FlashScore, ESPN, SofaScore).
 *
 * Los jugadores locales tienen la suya (`PlayerProfile.tsx`); esta es la de los
 * que viven afuera, y por eso todo lo que dibuja es OPCIONAL: un proveedor manda
 * temporadas y partidos, otro manda un nombre y un puesto. La regla es que una
 * seccion sin dato NO se dibuja vacia — la pestaña desaparece.
 *
 * ── COMO ESTA ARMADA ────────────────────────────────────────────────────────
 * Cabecera con identidad y totales (los numeros que un hincha busca primero),
 * barra de pestañas pegada abajo del header del sitio, y cuatro paneles:
 * Resumen (temporada en curso, evolucion, balance por torneo, datos),
 * Temporadas (una fila por competicion que se despliega con todos los rubros),
 * Partidos (columnas en escritorio, tarjetas en telefono) y Trayectoria.
 *
 * ── LO QUE NO SE MUESTRA, Y POR QUE ─────────────────────────────────────────
 * No hay puntos POR PARTIDO cerrados. RugbyPass publica por partido `mins`,
 * `tries`, `conversions` y las dos tarjetas, y con eso los puntos no cierran:
 * faltan penales y drops. Medido: Boffelli hizo 67 puntos en el Mundial 2023 y
 * `tries*5 + conversiones*2` da 28. Los puntos van en la temporada, que es donde
 * el proveedor los publica enteros — y por eso la cabecera NO lleva un total de
 * puntos: seria una suma corta con el nombre de una completa.
 *
 * Tampoco hay "partidos por temporada". El proveedor manda las temporadas por un
 * lado y los partidos por otro, sin la temporada adentro del partido: aparearlos
 * por nombre de competicion y ventana de fechas inventaria un numero que nadie
 * publica. El balance por torneo, que sale entero de los partidos, si esta.
 */

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import styles from './page.module.css';
import { ArrowLeft, Star, ChevronDown } from 'lucide-react';
import { useFavorite } from '@/hooks/useFavorites';
import { FAVORITE_PLAYERS_ENABLED } from '@/lib/favorites/config';
import { resolveTeamLogo } from '@/lib/utils/teamLogoOverrides';

interface SeasonStat {
    key?: string;
    label?: string;
    short_label?: string;
    value?: string | number;
}

interface SeasonView {
    id: string;
    competition_name?: string;
    season_label?: string;
    display_name?: string;
    logo?: string;
    tournament_id?: string;
    points?: number | null;
    /**
     * EL PUNTAJE DE LA TEMPORADA, 1 a 10, con el mismo motor y la misma escala
     * que el del partido. `null` cuando no se puede calcular, y entonces no se
     * dibuja: un hueco es mas honesto que un 6 inventado.
     */
    rating?: number | null;
    minutes?: number | null;
    stats?: SeasonStat[];
}

interface MatchView {
    title?: string;
    date?: string | null;
    competition_name?: string;
    competition_logo?: string;
    opponent_name?: string;
    opponent_logo?: string;
    result?: 'win' | 'loss' | 'draw';
    minutes?: number | null;
    points?: number | null;
    tries?: number | null;
    conversions?: number | null;
    yellow_cards?: number | null;
    red_cards?: number | null;
    /**
     * EL PUNTAJE DEL JUGADOR EN ESE PARTIDO, de 1 a 10, con el mismo motor y la
     * misma escala que la planilla del Match Center. `null` cuando ese partido
     * todavía no está puntuado — y entonces la celda queda vacía.
     */
    rating?: number | null;
    /**
     * El partido en nuestra base (`rp-950802`). Cuando está, la fila se puede
     * abrir; cuando no, la fila queda quieta — la ficha del jugador conoce
     * partidos que nosotros no tenemos, y un link a un 404 es peor que nada.
     */
    match_id?: string | null;
}

const getTeamLogo = (team: unknown) => resolveTeamLogo(team as never);

const buildTeamHref = (teamId?: string | null) => {
    if (!teamId) return '/clubs';
    if (
        teamId.startsWith('fs-team-') ||
        teamId.startsWith('ras-team-') ||
        teamId.startsWith('espn-soccer-team-') ||
        teamId.startsWith('espn-team-') ||
        teamId.startsWith('sofa-team-') ||
        // RugbyPass. Sin esto el fallback de abajo armaba
        // `/clubs/fs-team-rp-team-auckland`, que no es ningun club.
        teamId.startsWith('rp-team-')
    ) {
        return `/clubs/${teamId}`;
    }
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(teamId)) {
        return `/clubs/${teamId}`;
    }
    return `/clubs/fs-team-${teamId}`;
};

/**
 * La fecha de un partido, en UTC A PROPOSITO.
 *
 * El proveedor manda el instante del comienzo y ADEMAS lo imprime como dia
 * ("4 Oct 2025"). Los dos coinciden leyendo el instante en UTC — verificado
 * contra tres partidos de husos distintos. Formatearlo en la zona del que mira
 * correria un partido de sabado a la noche al domingo para media humanidad, y la
 * fecha de un partido ya jugado es un HECHO: no depende de donde esta parado el
 * que lee.
 */
const FECHA = new Intl.DateTimeFormat('es-AR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
});

/** La misma fecha sin el año, para cuando el año ya lo dice el separador. */
const FECHA_SIN_ANIO = new Intl.DateTimeFormat('es-AR', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
});

function fechaCorta(iso?: string | null): string {
    if (!iso) return '';
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '' : FECHA.format(d);
}

function fechaSinAnio(iso?: string | null): string {
    if (!iso) return '';
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '' : FECHA_SIN_ANIO.format(d);
}

/** El año en UTC, por el mismo motivo que la fecha. Separa la lista de partidos. */
function anioDe(iso?: string | null): string {
    if (!iso) return '';
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '' : String(d.getUTCFullYear());
}

const RESULTADO: Record<string, { sigla: string; nombre: string; clase: string }> = {
    win: { sigla: 'G', nombre: 'Ganado', clase: 'win' },
    loss: { sigla: 'P', nombre: 'Perdido', clase: 'loss' },
    draw: { sigla: 'E', nombre: 'Empatado', clase: 'draw' },
};

const numero = (v: unknown) => (typeof v === 'number' ? v.toLocaleString('es-AR') : '');

/**
 * Los rubros que se dibujan.
 *
 * Un rubro en cero es ruido, no informacion. Y el proveedor manda los PUNTOS dos
 * veces —sueltos en `points` y otra vez adentro de su lista de rubros— asi que
 * la tarjeta llegaba a mostrar "Puntos 72" y "Points 72" pegados. Se pliega por
 * clave: gana la primera, que es la nuestra y viene traducida.
 */
function rubrosConDato(stats?: SeasonStat[]): SeasonStat[] {
    const vistos = new Set<string>();
    return (stats || []).filter((s) => {
        const raw = String(s?.value ?? '').trim();
        if (raw === '' || raw === '0' || raw === '-') return false;
        const clave = String(s?.key ?? s?.label ?? '');
        if (clave && vistos.has(clave)) return false;
        if (clave) vistos.add(clave);
        return true;
    });
}

/**
 * El color del puntaje, en los mismos tres escalones que la ficha del partido:
 * un 8 se lee verde y un 4 rojo sin tener que leer el numero.
 *
 * El color NUNCA va solo: el numero esta escrito al lado, asi que quien no
 * distingue los tonos lee lo mismo.
 */
function ChipDePuntaje({
    valor,
    titulo = 'Puntaje de la temporada, de 1 a 10',
    chico = false,
}: {
    valor: number;
    titulo?: string;
    /** En la tabla de partidos la ficha va más chica: son cuarenta seguidas. */
    chico?: boolean;
}) {
    const tono = valor >= 7 ? styles.ratingAlto : valor >= 5.5 ? styles.ratingMedio : styles.ratingBajo;
    return (
        <span className={`${styles.rating} ${tono} ${chico ? styles.ratingSm : ''}`} title={titulo}>
            {valor.toFixed(1).replace('.', ',')}
        </span>
    );
}

/** El promedio de los partidos que SÍ tienen puntaje. `null` si no hay ninguno. */
function promedioDe(partidos: readonly MatchView[]): { valor: number; partidos: number } | null {
    const puntuados = partidos.filter((m) => typeof m.rating === 'number');
    if (puntuados.length === 0) return null;
    const suma = puntuados.reduce((acc, m) => acc + (m.rating as number), 0);
    // Se redondea a un decimal, igual que el puntaje de un partido: un promedio
    // con dos decimales aparenta una precisión que la escala no tiene.
    return { valor: Math.round((suma / puntuados.length) * 10) / 10, partidos: puntuados.length };
}

/** El valor de un rubro de la temporada, por clave. */
function rubro(temporada: SeasonView, clave: string): number | null {
    const s = (temporada.stats || []).find((x) => x.key === clave);
    const v = typeof s?.value === 'number' ? s.value : Number(s?.value);
    return Number.isFinite(v) ? (v as number) : null;
}

/* ── La evolucion por temporada ─────────────────────────────────────────────
 *
 * Las tres metricas que el proveedor publica en TODAS las temporadas. Un
 * selector con una metrica que a veces no viene deja el grafico en blanco sin
 * decir por que, asi que no entra ninguna otra.
 */
const METRICAS = [
    { id: 'minutes', label: 'Minutos', unidad: 'minutos' },
    { id: 'points', label: 'Puntos', unidad: 'puntos' },
    { id: 'tries', label: 'Tries', unidad: 'tries' },
] as const;

type MetricaId = (typeof METRICAS)[number]['id'];

/**
 * El año en que ARRANCA una temporada, leido de su etiqueta: "2025/2026" es
 * 2025 y "2025" es 2025.
 *
 * Hace falta porque el proveedor NO manda las temporadas por año —manda las de
 * la seleccion primero y despues las del club, cada grupo por su cuenta— y un
 * eje de tiempo desordenado no es un eje de tiempo: la lista llegaba 2022,
 * 2023/2024, 2023/2024, 2023, 2023, 2024/2025... La lista de la pestaña se deja
 * en el orden del proveedor, que sabe cual es la que esta en juego; el que se
 * ordena es el grafico, que es el unico que promete una linea de tiempo.
 */
function anioDeTemporada(temporada: SeasonView): number {
    const m = /(\d{4})/.exec(temporada.season_label || '');
    return m ? Number(m[1]) : Number.NEGATIVE_INFINITY;
}

/**
 * Dentro del mismo año, la temporada de UNA sola cifra va primero.
 *
 * "2023" es un torneo de selecciones y se juega en el invierno del hemisferio
 * sur; "2023/2024" es una liga de clubes que arranca en septiembre. Las dos
 * empiezan en 2023, pero poner la liga antes deja el eje leyendose
 * "2023/2024, 2023", que parece un error de ordenamiento.
 */
function esCruzada(temporada: SeasonView): number {
    return (temporada.season_label || '').includes('/') ? 1 : 0;
}

function valorDeMetrica(temporada: SeasonView, metrica: MetricaId): number {
    if (metrica === 'minutes') {
        return typeof temporada.minutes === 'number' ? temporada.minutes : (rubro(temporada, 'minutes') ?? 0);
    }
    if (metrica === 'points') {
        return typeof temporada.points === 'number' ? temporada.points : (rubro(temporada, 'points') ?? 0);
    }
    return rubro(temporada, 'tries') ?? 0;
}

/**
 * EL GRAFICO DE TEMPORADAS.
 *
 * Barras en CSS y no en SVG: arriba de cada barra va el ESCUDO de la
 * competicion —es lo que identifica la columna, no el color— y meter una imagen
 * responsive adentro de un SVG es pelea perdida. El color no porta ningun dato:
 * la barra dice cuanto, el numero de arriba dice cuanto exactamente y el pie
 * dice de que temporada. Abajo va la misma tabla para el lector de pantalla.
 */
function EvolucionPorTemporada({ temporadas }: { temporadas: SeasonView[] }) {
    const [metrica, setMetrica] = useState<MetricaId>('minutes');

    // De la mas vieja a la mas nueva. Dentro del mismo año gana el indice mas
    // alto primero: el proveedor lista cada grupo de la mas nueva a la mas
    // vieja, asi que el indice grande es la mas vieja.
    const orden = useMemo(
        () => temporadas
            .map((s, i) => ({ s, i }))
            .sort((a, b) =>
                anioDeTemporada(a.s) - anioDeTemporada(b.s)
                || esCruzada(a.s) - esCruzada(b.s)
                || b.i - a.i)
            .map((x) => x.s),
        [temporadas]
    );
    const valores = orden.map((s) => valorDeMetrica(s, metrica));
    const tope = Math.max(...valores, 1);
    const elegida = METRICAS.find((m) => m.id === metrica)!;

    return (
        <figure className={styles.chart}>
            <figcaption className={styles.chartHead}>
                <h2 className={styles.cardTitle}>Temporada a temporada</h2>
                <div className={styles.segmented} role="radiogroup" aria-label="Métrica del gráfico">
                    {METRICAS.map((m) => (
                        <button
                            key={m.id}
                            type="button"
                            role="radio"
                            aria-checked={metrica === m.id}
                            className={`${styles.segment} ${metrica === m.id ? styles.segmentOn : ''}`}
                            onClick={() => setMetrica(m.id)}
                        >
                            {m.label}
                        </button>
                    ))}
                </div>
            </figcaption>

            <div className={styles.chartScroll}>
                <div className={styles.chartBars} aria-hidden="true">
                    {orden.map((s, i) => {
                        const v = valores[i];
                        const alto = Math.max(2, Math.round((v / tope) * 100));
                        return (
                            <div
                                key={s.id}
                                className={styles.chartCol}
                                title={`${s.display_name}: ${numero(v)} ${elegida.unidad}`}
                            >
                                {s.logo
                                    ? <img src={s.logo} alt="" loading="lazy" className={styles.chartLogo} />
                                    : <span className={styles.chartLogo} />}
                                <span className={styles.chartValue}>{v === 0 ? '·' : numero(v)}</span>
                                <div className={styles.chartTrack}>
                                    <div
                                        className={`${styles.chartBar} ${v === tope ? styles.chartBarTop : ''}`}
                                        style={{ height: `${alto}%` }}
                                    />
                                </div>
                                <span className={styles.chartLabel}>{s.season_label || '—'}</span>
                            </div>
                        );
                    })}
                </div>
            </div>

            <table className={styles.srOnly}>
                <caption>{elegida.label} por temporada</caption>
                <thead>
                    <tr><th scope="col">Temporada</th><th scope="col">{elegida.label}</th></tr>
                </thead>
                <tbody>
                    {orden.map((s, i) => (
                        <tr key={s.id}><th scope="row">{s.display_name}</th><td>{valores[i]}</td></tr>
                    ))}
                </tbody>
            </table>
        </figure>
    );
}

/**
 * UNA TEMPORADA DE LA LISTA, que se despliega.
 *
 * La fila cerrada muestra los cuatro numeros que se comparan de un vistazo y el
 * resto de los rubros vive adentro. Un `<details>` nativo no sirve: la cabecera
 * tiene grilla propia y el `summary` del nativo se lleva el layout puesto, asi
 * que va un boton con `aria-expanded` y su region.
 */
function FilaDeTemporada({
    temporada,
    abierta,
    onToggle,
}: {
    temporada: SeasonView;
    abierta: boolean;
    onToggle: () => void;
}) {
    const minutos = valorDeMetrica(temporada, 'minutes');
    const puntos = valorDeMetrica(temporada, 'points');
    const tries = valorDeMetrica(temporada, 'tries');
    const asistencias = rubro(temporada, 'try_assist') ?? 0;
    const rubros = rubrosConDato(temporada.stats);
    const panelId = `temporada-${temporada.id}`;

    return (
        <li className={`${styles.seasonRow} ${abierta ? styles.seasonRowOpen : ''}`}>
            <button
                type="button"
                className={styles.seasonHead}
                aria-expanded={abierta}
                aria-controls={panelId}
                onClick={onToggle}
            >
                {temporada.logo
                    ? <img src={temporada.logo} alt="" loading="lazy" className={styles.seasonLogo} />
                    : <span className={styles.seasonLogo} aria-hidden="true" />}
                <span className={styles.seasonName}>
                    <span className={styles.seasonComp}>{temporada.competition_name || temporada.display_name}</span>
                    {temporada.season_label && <span className={styles.seasonLabel}>{temporada.season_label}</span>}
                </span>
                <span className={styles.seasonNums}>
                    {typeof temporada.rating === 'number' && (
                        <span className={styles.seasonNum}>
                            <ChipDePuntaje valor={temporada.rating} />
                            <i>Puntaje</i>
                        </span>
                    )}
                    <span className={styles.seasonNum}><b>{numero(minutos)}</b><i>Min</i></span>
                    <span className={styles.seasonNum}><b>{numero(puntos)}</b><i>Pts</i></span>
                    <span className={styles.seasonNum}><b>{numero(tries)}</b><i>Tries</i></span>
                    <span className={`${styles.seasonNum} ${styles.seasonNumWide}`}><b>{numero(asistencias)}</b><i>Asist.</i></span>
                </span>
                <ChevronDown
                    size={16}
                    aria-hidden="true"
                    className={abierta ? styles.seasonCaretOpen : styles.seasonCaret}
                />
            </button>

            {abierta && (
                <div className={styles.seasonPanel} id={panelId}>
                    {rubros.length > 0 ? (
                        <dl className={styles.statGrid}>
                            {rubros.map((s, i) => (
                                <div key={`${s.key}-${i}`} className={styles.statItem}>
                                    <dt title={s.label || ''}>{s.short_label || s.label || s.key}</dt>
                                    <dd>{s.value}</dd>
                                </div>
                            ))}
                        </dl>
                    ) : (
                        <p className={styles.emptyState}>Sin estadísticas para {temporada.display_name}.</p>
                    )}
                    {temporada.tournament_id && (
                        <Link href={`/tournaments/${temporada.tournament_id}`} className={styles.tournamentLink}>
                            {temporada.logo && (
                                <img src={temporada.logo} alt="" loading="lazy" className={styles.tournamentLinkLogo} />
                            )}
                            Ver {temporada.competition_name}
                        </Link>
                    )}
                </div>
            )}
        </li>
    );
}

export default function PlayerDetailClientPage({ id }: { id: string }) {
    const router = useRouter();
    const playerId = id.trim();
    const { isFavorited, toggle: toggleFavorite } = useFavorite('player', playerId);

    const [activeTab, setActiveTab] = useState('summary');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [details, setDetails] = useState<any>(null);
    const [career, setCareer] = useState<any[]>([]);
    const [seasons, setSeasons] = useState<SeasonView[]>([]);
    const [matches, setMatches] = useState<MatchView[]>([]);
    const [seasonAbierta, setSeasonAbierta] = useState('');
    const [competicion, setCompeticion] = useState('all');
    const [visibles, setVisibles] = useState(40);

    const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

    useEffect(() => {
        let cancelado = false;

        async function fetchData() {
            setLoading(true);
            setError(null);
            try {
                const res = await fetch(`/api/players?player_id=${encodeURIComponent(playerId)}`, { cache: 'no-store' });
                const payload = await res.json();
                if (cancelado) return;

                if (!res.ok || !payload?.ok) {
                    setError(payload?.error || 'No se pudo cargar los datos del jugador.');
                    return;
                }

                const temporadas: SeasonView[] = Array.isArray(payload.seasons) ? payload.seasons : [];
                setDetails(payload.details || null);
                setCareer(Array.isArray(payload.career) ? payload.career : []);
                setSeasons(temporadas);
                setMatches(Array.isArray(payload.matches) ? payload.matches : []);
                setSeasonAbierta(temporadas[0]?.id ?? '');
            } catch (err) {
                console.error('Error fetching player data:', err);
                if (!cancelado) setError('Error al cargar datos del jugador.');
            } finally {
                if (!cancelado) setLoading(false);
            }
        }

        fetchData();
        return () => { cancelado = true; };
    }, [playerId]);

    const playerName = details?.name || details?.player_name || details?.PLAYER_NAME || playerId;
    const playerPhoto = details?.image_path || details?.photo || details?.small_image_path || '';
    const countryName = details?.country?.name || details?.nationality || '';
    const countryFlag = details?.country?.image_path || details?.country?.small_image_path || '';
    const position = details?.position || details?.player_position || '';
    const age = details?.age || '';
    const height = details?.height || '';
    const weight = details?.weight || '';
    const foot = details?.preferred_foot || details?.foot || '';
    const birthDate = details?.birth_date || details?.birthday || '';
    const jerseyNumber = details?.jersey_number || details?.shirt_number || '';
    const currentTeam = details?.team || details?.current_team || null;
    const currentTeamName = currentTeam?.name || currentTeam?.team_name || '';
    const currentTeamId = currentTeam?.team_id || currentTeam?.id || '';
    const currentTeamLogo = getTeamLogo(currentTeam);
    const pateador = details?.goal_kicker === true;

    // `details.season_stats` es la forma vieja y la siguen mandando los otros
    // proveedores: la pestaña se dibuja igual, sin logo ni etiqueta de año.
    const temporadas: SeasonView[] = useMemo(() => {
        if (seasons.length > 0) return seasons;
        const viejas = Array.isArray(details?.season_stats) ? details.season_stats : [];
        return viejas.map((s: any, i: number) => ({
            id: String(i),
            competition_name: s?.display_name || 'Temporada',
            display_name: s?.display_name || 'Temporada',
            stats: s?.stats,
        }));
    }, [seasons, details]);

    const temporadaActual = temporadas[0];
    const rubrosDeLaActual = useMemo(() => rubrosConDato(temporadaActual?.stats), [temporadaActual]);

    /**
     * LOS TOTALES DE LA CABECERA salen de los PARTIDOS y no de las temporadas.
     *
     * Las temporadas que publica el proveedor son las diez ultimas; los partidos
     * son toda la carrera (177 los de Matera contra 10 temporadas). Sumar las
     * diez y llamarlo "partidos jugados" seria un total que se queda corto justo
     * con los jugadores de carrera mas larga.
     */
    const totales = useMemo(() => {
        if (matches.length === 0) return null;
        let minutos = 0;
        let tries = 0;
        const torneos = new Set<string>();
        for (const m of matches) {
            minutos += typeof m.minutes === 'number' ? m.minutes : 0;
            tries += typeof m.tries === 'number' ? m.tries : 0;
            if (m.competition_name) torneos.add(m.competition_name);
        }
        return { partidos: matches.length, minutos, tries, clubes: career.length, torneos: torneos.size };
    }, [matches, career]);

    /** Los ultimos cinco, del mas viejo al mas nuevo: asi se lee una racha. */
    const forma = useMemo(() => matches.slice(0, 5).reverse(), [matches]);

    /**
     * EL BALANCE POR TORNEO sale de los partidos, que es el unico lugar donde el
     * resultado viaja.
     */
    const porTorneo = useMemo(() => {
        const mapa = new Map<string, { nombre: string; logo: string; pj: number; g: number; e: number; p: number }>();
        for (const m of matches) {
            const nombre = m.competition_name || '';
            if (!nombre) continue;
            const fila = mapa.get(nombre) ?? { nombre, logo: m.competition_logo || '', pj: 0, g: 0, e: 0, p: 0 };
            fila.pj += 1;
            if (m.result === 'win') fila.g += 1;
            else if (m.result === 'draw') fila.e += 1;
            else fila.p += 1;
            if (!fila.logo && m.competition_logo) fila.logo = m.competition_logo;
            mapa.set(nombre, fila);
        }
        return [...mapa.values()].sort((a, b) => b.pj - a.pj);
    }, [matches]);

    const partidosVisibles = useMemo(
        () => (competicion === 'all' ? matches : matches.filter((m) => m.competition_name === competicion)),
        [matches, competicion]
    );

    // Un filtro nuevo empieza arriba: dejar el "mostrar mas" donde estaba haria
    // que un torneo de diez partidos apareciera con noventa filas ya abiertas.
    useEffect(() => { setVisibles(40); }, [competicion]);

    const tabs = useMemo(() => {
        const t = [{ id: 'summary', label: 'Resumen' }];
        if (temporadas.length > 0) t.push({ id: 'seasons', label: 'Temporadas' });
        if (matches.length > 0) t.push({ id: 'matches', label: 'Partidos' });
        if (career.length > 0) t.push({ id: 'career', label: 'Trayectoria' });
        return t;
    }, [temporadas, matches, career]);

    // Una pestaña que deja de existir no puede quedar seleccionada: el panel se
    // quedaria en blanco sin decir por que.
    useEffect(() => {
        if (!loading && !tabs.some((t) => t.id === activeTab)) setActiveTab('summary');
    }, [tabs, activeTab, loading]);

    /**
     * Las flechas mueven entre pestañas, que es lo que un `tablist` promete.
     * Sin esto la barra dice que es un tablist y se comporta como una fila de
     * botones sueltos: el teclado tabula uno por uno y nunca llega al panel.
     */
    const teclasDePestana = useCallback((e: React.KeyboardEvent, indice: number) => {
        const paso = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
        let destino = -1;
        if (paso !== 0) destino = (indice + paso + tabs.length) % tabs.length;
        else if (e.key === 'Home') destino = 0;
        else if (e.key === 'End') destino = tabs.length - 1;
        if (destino < 0) return;
        e.preventDefault();
        const siguiente = tabs[destino];
        setActiveTab(siguiente.id);
        tabRefs.current[siguiente.id]?.focus();
    }, [tabs]);

    if (loading) {
        return (
            <div className={styles.page}>
                <div className={styles.hero}>
                    <div className="container">
                        <div className={styles.heroMain}>
                            <div className={`${styles.skeleton} ${styles.skeletonPhoto}`} />
                            <div className={styles.heroInfo}>
                                <div className={`${styles.skeleton} ${styles.skeletonTitle}`} />
                                <div className={`${styles.skeleton} ${styles.skeletonLine}`} />
                            </div>
                        </div>
                        <div className={`${styles.skeleton} ${styles.skeletonRail}`} />
                    </div>
                </div>
                <div className="container">
                    <div className={styles.body}>
                        {[1, 2, 3].map((i) => (
                            <div key={i} className={`${styles.skeleton} ${styles.skeletonCard}`} />
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className={styles.errorContainer}>
                <p>{error}</p>
                <button type="button" className={styles.backButton} onClick={() => router.back()}>
                    <ArrowLeft size={16} aria-hidden="true" /> Volver
                </button>
            </div>
        );
    }

    const datos: { rotulo: string; valor: React.ReactNode }[] = [];
    if (age) datos.push({ rotulo: 'Edad', valor: `${age} años` });
    if (birthDate) datos.push({ rotulo: 'Nacimiento', valor: String(birthDate) });
    if (height) datos.push({ rotulo: 'Altura', valor: String(height) });
    if (weight) datos.push({ rotulo: 'Peso', valor: String(weight) });
    if (position) datos.push({ rotulo: 'Puesto', valor: String(position) });
    if (countryName) datos.push({ rotulo: 'Nacionalidad', valor: String(countryName) });
    if (foot) datos.push({ rotulo: 'Pie hábil', valor: String(foot) });
    if (jerseyNumber) datos.push({ rotulo: 'Dorsal', valor: `#${jerseyNumber}` });

    return (
        // data-sticky-tabs: le pide a globals.css que pase body y main a
        // overflow-x clip. Con hidden son scroll containers y el sticky de la
        // barra de pestañas muere sin avisar.
        <div className={styles.page} data-sticky-tabs="">
            <header className={styles.hero}>
                {/* El escudo del club, gigante y casi transparente, le da identidad a
                    la cabecera sin pintar un color que no salga de un token. */}
                {currentTeamLogo && (
                    <img src={currentTeamLogo} alt="" aria-hidden="true" className={styles.heroCrest} />
                )}

                <div className="container">
                    <nav className={styles.breadcrumb} aria-label="Miga de pan">
                        <Link href="/">Inicio</Link>
                        <span className={styles.separator} aria-hidden="true">/</span>
                        <Link href="/players">Jugadores</Link>
                        <span className={styles.separator} aria-hidden="true">/</span>
                        <span className={styles.breadcrumbActive}>{playerName}</span>
                    </nav>

                    <div className={styles.heroMain}>
                        <div className={styles.photoContainer}>
                            {playerPhoto ? (
                                // La unica imagen sobre el pliegue: sin lazy a proposito.
                                <img src={playerPhoto} alt={playerName} className={styles.playerPhoto} />
                            ) : (
                                <div className={styles.photoPlaceholder} aria-hidden="true">{playerName?.[0]}</div>
                            )}
                            {jerseyNumber && <span className={styles.jersey}>{jerseyNumber}</span>}
                        </div>

                        <div className={styles.heroInfo}>
                            <h1 className={styles.title}>{playerName}</h1>
                            <div className={styles.meta}>
                                {countryName && (
                                    <span className={styles.country}>
                                        {countryFlag && <img src={countryFlag} alt="" className={styles.countryFlag} />}
                                        {countryName}
                                    </span>
                                )}
                                {position && <span className={styles.positionBadge}>{position}</span>}
                                {currentTeamName && (
                                    <Link href={buildTeamHref(currentTeamId)} className={styles.clubChip}>
                                        {currentTeamLogo && <img src={currentTeamLogo} alt="" className={styles.clubChipLogo} />}
                                        {currentTeamName}
                                    </Link>
                                )}
                            </div>
                        </div>

                        {FAVORITE_PLAYERS_ENABLED && (
                            <button
                                type="button"
                                className={`${styles.favButton} ${isFavorited ? styles.favButtonOn : ''}`}
                                // `toggle` recibe METADATOS, no el evento: pasarle el click
                                // guarda un favorito sin nombre ni foto, y la lista de
                                // favoritos queda con una fila en blanco.
                                onClick={() => toggleFavorite({ name: playerName, logo_url: playerPhoto || null })}
                                aria-pressed={isFavorited}
                                aria-label={isFavorited ? 'Quitar de favoritos' : 'Agregar a favoritos'}
                            >
                                <Star size={18} aria-hidden="true" fill={isFavorited ? 'currentColor' : 'none'} />
                            </button>
                        )}
                    </div>

                    {(totales || forma.length > 0) && (
                        <div className={styles.heroRail}>
                            {totales && (
                                <dl className={styles.kpis}>
                                    <div className={styles.kpi}>
                                        <dd>{numero(totales.partidos)}</dd>
                                        <dt>Partidos</dt>
                                    </div>
                                    <div className={styles.kpi}>
                                        <dd>{numero(totales.minutos)}</dd>
                                        <dt>Minutos</dt>
                                    </div>
                                    <div className={styles.kpi}>
                                        <dd>{numero(totales.tries)}</dd>
                                        <dt>Tries</dt>
                                    </div>
                                    <div className={styles.kpi}>
                                        <dd>{numero(totales.torneos)}</dd>
                                        <dt>Torneos</dt>
                                    </div>
                                    <div className={styles.kpi}>
                                        <dd>{numero(totales.clubes)}</dd>
                                        <dt>Clubes</dt>
                                    </div>
                                </dl>
                            )}

                            {forma.length > 0 && (
                                <div className={styles.forma}>
                                    <span className={styles.formaLabel}>Últimos {forma.length}</span>
                                    <ol className={styles.formaList}>
                                        {forma.map((m, i) => {
                                            const r = RESULTADO[m.result || 'loss'];
                                            return (
                                                <li key={`${m.date}-${i}`}>
                                                    <span
                                                        className={`${styles.result} ${styles[r.clase]}`}
                                                        title={`${r.nombre} con ${m.opponent_name || 'el rival'} · ${fechaCorta(m.date)}`}
                                                    >
                                                        <span aria-hidden="true">{r.sigla}</span>
                                                        <span className={styles.srOnly}>
                                                            {r.nombre} con {m.opponent_name || 'el rival'}, {fechaCorta(m.date)}
                                                        </span>
                                                    </span>
                                                </li>
                                            );
                                        })}
                                    </ol>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </header>

            <div className={styles.tabsBar}>
                <div className="container">
                    <div className={styles.tabs} role="tablist" aria-label="Secciones del jugador">
                        {tabs.map((tab, i) => (
                            <button
                                key={tab.id}
                                type="button"
                                role="tab"
                                id={`tab-${tab.id}`}
                                ref={(el) => { tabRefs.current[tab.id] = el; }}
                                aria-selected={activeTab === tab.id}
                                aria-controls={`panel-${tab.id}`}
                                tabIndex={activeTab === tab.id ? 0 : -1}
                                className={`${styles.tab} ${activeTab === tab.id ? styles.tabActive : ''}`}
                                onClick={() => setActiveTab(tab.id)}
                                onKeyDown={(e) => teclasDePestana(e, i)}
                            >
                                {tab.label}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            <div className="container">
                <div className={styles.body}>
                    {activeTab === 'summary' && (
                        <section id="panel-summary" role="tabpanel" aria-labelledby="tab-summary" tabIndex={-1}>
                            <div className={styles.bento}>
                                <div className={styles.bentoMain}>
                                    {temporadaActual && rubrosDeLaActual.length > 0 && (
                                        <article className={styles.card}>
                                            <header className={styles.cardHead}>
                                                <h2 className={styles.cardTitle}>Última temporada</h2>
                                                <span className={styles.cardBadge}>
                                                    {temporadaActual.logo && (
                                                        <img
                                                            src={temporadaActual.logo}
                                                            alt=""
                                                            loading="lazy"
                                                            className={styles.cardBadgeLogo}
                                                        />
                                                    )}
                                                    {temporadaActual.display_name}
                                                </span>
                                            </header>
                                            <dl className={styles.statGrid}>
                                                {rubrosDeLaActual.map((s, i) => (
                                                    <div key={`${s.key}-${i}`} className={styles.statItem}>
                                                        <dt title={s.label || ''}>{s.short_label || s.label || s.key}</dt>
                                                        <dd>{s.value}</dd>
                                                    </div>
                                                ))}
                                            </dl>
                                        </article>
                                    )}

                                    {temporadas.length > 1 && (
                                        <article className={styles.card}>
                                            <EvolucionPorTemporada temporadas={temporadas} />
                                        </article>
                                    )}

                                    {matches.length > 0 && (
                                        <article className={styles.card}>
                                            <header className={styles.cardHead}>
                                                <h2 className={styles.cardTitle}>Últimos partidos</h2>
                                                <button
                                                    type="button"
                                                    className={styles.linkButton}
                                                    onClick={() => setActiveTab('matches')}
                                                >
                                                    Ver los {numero(matches.length)}
                                                </button>
                                            </header>
                                            <ListaDePartidos partidos={matches.slice(0, 5)} pateador={pateador} compacta />
                                        </article>
                                    )}
                                </div>

                                <aside className={styles.bentoSide}>
                                    <article className={styles.card}>
                                        <header className={styles.cardHead}>
                                            <h2 className={styles.cardTitle}>Datos del jugador</h2>
                                        </header>
                                        {datos.length > 0 ? (
                                            <dl className={styles.dataGrid}>
                                                {datos.map((d) => (
                                                    <div key={d.rotulo} className={styles.dataItem}>
                                                        <dt>{d.rotulo}</dt>
                                                        <dd>{d.valor}</dd>
                                                    </div>
                                                ))}
                                            </dl>
                                        ) : (
                                            <p className={styles.emptyState}>
                                                El proveedor no publica datos personales de este jugador.
                                            </p>
                                        )}
                                    </article>

                                    {porTorneo.length > 0 && (
                                        <article className={styles.card}>
                                            <header className={styles.cardHead}>
                                                <h2 className={styles.cardTitle}>Por torneo</h2>
                                            </header>
                                            <ul className={styles.compList}>
                                                {porTorneo.map((t) => (
                                                    <li key={t.nombre} className={styles.compItem}>
                                                        <span className={styles.compTop}>
                                                            {t.logo
                                                                ? <img src={t.logo} alt="" loading="lazy" className={styles.compLogo} />
                                                                : <span className={styles.compLogo} aria-hidden="true" />}
                                                            <span className={styles.compName}>{t.nombre}</span>
                                                            <span className={styles.compCount}>{numero(t.pj)} PJ</span>
                                                        </span>
                                                        <span className={styles.compBottom}>
                                                            <span className={styles.compBar} aria-hidden="true">
                                                                <i className={styles.barWin} style={{ flexGrow: t.g }} />
                                                                <i className={styles.barDraw} style={{ flexGrow: t.e }} />
                                                                <i className={styles.barLoss} style={{ flexGrow: t.p }} />
                                                            </span>
                                                            <span className={styles.compRecord}>
                                                                <span className={styles.srOnly}>
                                                                    {t.g} ganados, {t.e} empatados, {t.p} perdidos
                                                                </span>
                                                                <span aria-hidden="true">{t.g}-{t.e}-{t.p}</span>
                                                            </span>
                                                        </span>
                                                    </li>
                                                ))}
                                            </ul>
                                            <p className={styles.cardFoot}>
                                                Ganados, empatados y perdidos por el club del jugador en cada torneo.
                                            </p>
                                        </article>
                                    )}

                                </aside>
                            </div>
                        </section>
                    )}

                    {activeTab === 'seasons' && (
                        <section id="panel-seasons" role="tabpanel" aria-labelledby="tab-seasons" tabIndex={-1}>
                            <div className={styles.sectionHead}>
                                <h2 className={styles.sectionTitle}>Estadísticas por torneo</h2>
                                <p className={styles.sectionHint}>Tocá una temporada para ver todos los rubros.</p>
                            </div>

                            {temporadas.length > 0 ? (
                                <>
                                    <div className={styles.seasonLegend} aria-hidden="true">
                                        <span>Torneo</span>
                                        <span className={styles.seasonNums}>
                                            <span className={styles.seasonNum}>Min</span>
                                            <span className={styles.seasonNum}>Pts</span>
                                            <span className={styles.seasonNum}>Tries</span>
                                            <span className={`${styles.seasonNum} ${styles.seasonNumWide}`}>Asist.</span>
                                        </span>
                                    </div>
                                    <ul className={styles.seasonList}>
                                        {temporadas.map((t) => (
                                            <FilaDeTemporada
                                                key={t.id}
                                                temporada={t}
                                                abierta={seasonAbierta === t.id}
                                                onToggle={() => setSeasonAbierta((v) => (v === t.id ? '' : t.id))}
                                            />
                                        ))}
                                    </ul>
                                </>
                            ) : (
                                <p className={styles.emptyState}>No hay estadísticas publicadas.</p>
                            )}
                        </section>
                    )}

                    {activeTab === 'matches' && (
                        <section id="panel-matches" role="tabpanel" aria-labelledby="tab-matches" tabIndex={-1}>
                            <div className={styles.sectionHead}>
                                <h2 className={styles.sectionTitle}>
                                    Partidos jugados
                                    <span className={styles.sectionCount}>{numero(partidosVisibles.length)}</span>
                                </h2>
                            </div>

                            {porTorneo.length > 1 && (
                                <div className={styles.chipsScroll}>
                                    <div className={styles.chips} role="radiogroup" aria-label="Filtrar por torneo">
                                        <button
                                            type="button"
                                            role="radio"
                                            aria-checked={competicion === 'all'}
                                            className={`${styles.chip} ${competicion === 'all' ? styles.chipOn : ''}`}
                                            onClick={() => setCompeticion('all')}
                                        >
                                            Todos <span className={styles.chipCount}>{numero(matches.length)}</span>
                                        </button>
                                        {porTorneo.map((t) => (
                                            <button
                                                key={t.nombre}
                                                type="button"
                                                role="radio"
                                                aria-checked={competicion === t.nombre}
                                                className={`${styles.chip} ${competicion === t.nombre ? styles.chipOn : ''}`}
                                                onClick={() => setCompeticion(t.nombre)}
                                            >
                                                {t.logo && <img src={t.logo} alt="" loading="lazy" className={styles.chipLogo} />}
                                                {t.nombre} <span className={styles.chipCount}>{numero(t.pj)}</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <p className={styles.note}>
                                {pateador ? (
                                    <>
                                        <strong>Pts*</strong> cuenta los puntos de try y conversión. Este jugador
                                        además patea a los palos, y los penales y los drops el proveedor no los
                                        publica partido por partido: el total exacto de cada temporada está en{' '}
                                        <button type="button" className={styles.inlineLink} onClick={() => setActiveTab('seasons')}>
                                            Temporadas
                                        </button>.
                                    </>
                                ) : (
                                    <>
                                        <strong>Pts</strong> son los puntos del jugador en el partido: el try vale 5
                                        y la conversión 2. No pateó ningún penal ni drop en las temporadas
                                        publicadas, así que la cuenta es su total.
                                    </>
                                )}
                            </p>

                            {partidosVisibles.some((m) => typeof m.rating === 'number') && (
                                <p className={styles.note}>
                                    <strong>Punt.</strong> es el puntaje del jugador en ese partido, de 1 a 10, con la
                                    misma cuenta que la planilla del partido: pesa cada rubro según el puesto y lo
                                    mide por ochenta minutos. Los partidos sin planilla publicada quedan sin puntaje,
                                    y no entran en el promedio del año.
                                </p>
                            )}

                            <ListaDePartidos partidos={partidosVisibles.slice(0, visibles)} pateador={pateador} conAnios />

                            {partidosVisibles.length > visibles && (
                                // 171 filas de una sola vez son miles de nodos y un escudo por
                                // fila: el telefono tarda mas en pintar la lista que la red en
                                // traerla. De a 40, que ya es mas de lo que entra en una pantalla.
                                <button type="button" className={styles.moreButton} onClick={() => setVisibles((v) => v + 40)}>
                                    Mostrar 40 más
                                    <span className={styles.moreRest}>
                                        quedan {numero(partidosVisibles.length - visibles)}
                                    </span>
                                </button>
                            )}
                        </section>
                    )}

                    {activeTab === 'career' && (
                        <section id="panel-career" role="tabpanel" aria-labelledby="tab-career" tabIndex={-1}>
                            <div className={styles.sectionHead}>
                                <h2 className={styles.sectionTitle}>Trayectoria</h2>
                            </div>
                            <ul className={styles.clubList}>
                                {career.map((entry: any, idx: number) => {
                                    const teamName = entry.team?.name || entry.team_name || '-';
                                    const teamId = entry.team?.team_id || entry.team?.id || '';
                                    const teamLogo = getTeamLogo(entry.team) || entry.logo || entry.image_path || '';
                                    const season = entry.season || entry.season_name || '';
                                    // La seleccion lleva su propia etiqueta: en rugby los caps
                                    // valen mas que la vitrina de clubes, y mezclada en la lista
                                    // se pierde. El proveedor no la marca, pero el nombre del
                                    // equipo es el del pais.
                                    const esSeleccion = Boolean(countryName) && teamName === countryName;
                                    const esActual = Boolean(teamId) && teamId === currentTeamId;
                                    const cuerpo = (
                                        <>
                                            {teamLogo
                                                ? <img src={teamLogo} alt="" loading="lazy" className={styles.clubLogo} />
                                                : <span className={styles.clubLogo} aria-hidden="true" />}
                                            <span className={styles.clubText}>
                                                <span className={styles.clubName}>{teamName}</span>
                                                <span className={styles.clubTags}>
                                                    {esSeleccion && <span className={styles.clubTagNt}>Seleccionado</span>}
                                                    {esActual && <span className={styles.clubTagNow}>Actual</span>}
                                                    {season && <span className={styles.clubSeason}>{season}</span>}
                                                </span>
                                            </span>
                                        </>
                                    );
                                    return (
                                        <li key={`${teamName}-${idx}`} className={styles.clubItem}>
                                            {teamId ? (
                                                <Link href={buildTeamHref(teamId)} className={styles.clubLink}>{cuerpo}</Link>
                                            ) : (
                                                // Sin ficha propia no hay a donde ir, y un link a un 404 es
                                                // peor que un nombre suelto.
                                                <span className={styles.clubPlain}>{cuerpo}</span>
                                            )}
                                        </li>
                                    );
                                })}
                            </ul>
                        </section>
                    )}
                </div>
            </div>
        </div>
    );
}

/**
 * LA FILA DE UN PARTIDO, que a veces se puede abrir y a veces no.
 *
 * Se puede abrir cuando el partido está en nuestra base, que es exactamente
 * cuando tiene puntaje: los dos salen del mismo cruce. La ficha del proveedor
 * conoce partidos que nosotros no tenemos —los anteriores a la ventana de la
 * caché y los torneos que el conector no cubre—, y ahí la fila NO se vuelve un
 * link: mandar a una pantalla que no existe es peor que dejarla quieta.
 *
 * El link es la fila ENTERA y no el nombre del rival: el rival ya lleva a su
 * club en otras pantallas, y dos destinos distintos en la misma fila es la
 * forma más rápida de que nadie toque ninguno.
 */
function Fila({
    href,
    compacta,
    children,
}: {
    href: string | null;
    compacta: boolean;
    children: React.ReactNode;
}) {
    const clase = `${styles.matchRow} ${compacta ? styles.matchRowCompact : ''}`;
    if (!href) return <div className={clase}>{children}</div>;
    return (
        <Link href={href} className={`${clase} ${styles.matchRowLink}`}>
            {children}
        </Link>
    );
}

/**
 * LA LISTA DE PARTIDOS.
 *
 * Era una `<table>` de nueve columnas y en 390px scrolleaba al costado, que es
 * la forma mas rapida de perder el pulgar. Ahora es una lista con grilla: en
 * escritorio las columnas se alinean igual que una tabla (con su cabecera
 * propia) y en telefono cada partido se pliega en una tarjeta donde cada numero
 * lleva su rotulo al lado.
 */
function ListaDePartidos({
    partidos,
    pateador = false,
    compacta = false,
    conAnios = false,
}: {
    partidos: MatchView[];
    /** Si patea a los palos, la columna de puntos lleva asterisco. */
    pateador?: boolean;
    /** En el resumen la lista va sin cabecera ni torneo: son cinco filas. */
    compacta?: boolean;
    /** Separa por año, que es como se busca un partido viejo. */
    conAnios?: boolean;
}) {
    if (partidos.length === 0) {
        return <p className={styles.emptyState}>No hay partidos para este torneo.</p>;
    }

    // Que fila abre un año nuevo se decide ANTES de dibujar. Calcularlo adentro
    // del `map` obliga a arrastrar una variable que se reasigna en pleno
    // render, y una variable asi sobrevive al render y miente en el siguiente.
    const abreAnio = new Set<number>();
    if (conAnios) {
        let previo = '';
        partidos.forEach((m, i) => {
            const anio = anioDe(m.date);
            if (anio !== '' && anio !== previo) {
                abreAnio.add(i);
                previo = anio;
            }
        });
    }

    // EL PROMEDIO DE LA TEMPORADA, por año, calculado sobre lo que se está
    // mirando: si el filtro deja un solo torneo, el promedio es el de ese torneo
    // en ese año. Un promedio que no coincida con las filas de abajo miente.
    //
    // Solo cuenta los partidos PUNTUADOS. Los que no tienen puntaje —los
    // anteriores a que se empezara a guardar la planilla— no valen cero: no se
    // sabe, y un cero los hundiría a todos.
    const promedioPorAnio = new Map<string, { valor: number; partidos: number }>();
    if (conAnios) {
        const porAnio = new Map<string, MatchView[]>();
        for (const m of partidos) {
            const anio = anioDe(m.date);
            if (anio === '') continue;
            const lista = porAnio.get(anio) ?? [];
            lista.push(m);
            porAnio.set(anio, lista);
        }
        for (const [anio, lista] of porAnio) {
            const prom = promedioDe(lista);
            if (prom) promedioPorAnio.set(anio, prom);
        }
    }

    // LA COLUMNA DE PUNTAJE SOLO EXISTE SI HAY PUNTAJES.
    //
    // Un jugador cuyos partidos son todos anteriores a que se empezara a guardar
    // la planilla vería nueve guiones en fila. Una columna vacía no informa: se
    // saca y las otras se reparten el ancho.
    const hayPuntaje = partidos.some((m) => typeof m.rating === 'number');

    return (
        <div
            className={`${compacta ? styles.matchListCompact : styles.matchList} ${hayPuntaje ? styles.conPuntaje : ''}`}
        >
            {/* La cabecera de columnas solo existe en escritorio: en telefono cada
                partido es una tarjeta que se rotula sola. */}
            {!compacta && (
                <div className={styles.matchHead} aria-hidden="true">
                    <span>Fecha</span>
                    <span>Rival</span>
                    <span>Torneo</span>
                    <span className={styles.center}>Res.</span>
                    {hayPuntaje && <span className={styles.center}>Punt.</span>}
                    <span className={styles.center}>Pts{pateador ? '*' : ''}</span>
                    <span className={styles.center}>Min</span>
                    <span className={styles.center}>Tries</span>
                    <span className={styles.center}>Conv</span>
                    <span className={styles.center}>Tarj</span>
                </div>
            )}

            <ul className={styles.matchRows}>
                {partidos.map((m, i) => {
                    const r = RESULTADO[m.result || 'loss'];
                    const amarillas = typeof m.yellow_cards === 'number' ? m.yellow_cards : 0;
                    const rojas = typeof m.red_cards === 'number' ? m.red_cards : 0;
                    return (
                        <React.Fragment key={`${m.title}-${m.date}-${i}`}>
                            {abreAnio.has(i) && (
                                <li className={styles.yearMark}>
                                    <span>{anioDe(m.date)}</span>
                                    {(() => {
                                        const prom = promedioPorAnio.get(anioDe(m.date));
                                        if (!prom) return null;
                                        return (
                                            <span className={styles.yearAvg}>
                                                Promedio
                                                <ChipDePuntaje
                                                    valor={prom.valor}
                                                    chico
                                                    titulo={`Promedio de los ${prom.partidos} partidos puntuados`}
                                                />
                                                <span className={styles.yearAvgCount}>
                                                    {prom.partidos} {prom.partidos === 1 ? 'partido' : 'partidos'}
                                                </span>
                                            </span>
                                        );
                                    })()}
                                </li>
                            )}
                            <li className={styles.matchItem}>
                              <Fila href={m.match_id ? `/matches/${m.match_id}` : null} compacta={compacta}>
                                <span className={styles.matchDate}>
                                    {compacta || conAnios ? fechaSinAnio(m.date) : fechaCorta(m.date)}
                                </span>

                                <span className={styles.rival}>
                                    {m.opponent_logo
                                        ? <img src={m.opponent_logo} alt="" loading="lazy" className={styles.rivalLogo} />
                                        : <span className={styles.rivalLogo} aria-hidden="true" />}
                                    <span className={styles.rivalName}>{m.opponent_name || m.title}</span>
                                </span>

                                {!compacta && <span className={styles.matchComp}>{m.competition_name}</span>}

                                <span className={styles.matchResult}>
                                    {/* El color no puede ser el unico portador del dato: la sigla
                                        dice lo mismo, y el texto oculto lo dice entero. */}
                                    <span className={`${styles.result} ${styles[r.clase]}`} title={r.nombre}>
                                        <span aria-hidden="true">{r.sigla}</span>
                                        <span className={styles.srOnly}>{r.nombre}</span>
                                    </span>
                                </span>

                                {hayPuntaje && (
                                    <span className={styles.matchCell}>
                                        <i className={styles.cellLabel}>Punt.</i>
                                        {typeof m.rating === 'number' ? (
                                            <ChipDePuntaje
                                                valor={m.rating}
                                                chico
                                                titulo="Puntaje del jugador en este partido, de 1 a 10"
                                            />
                                        ) : (
                                            <span className={styles.muted}>-</span>
                                        )}
                                    </span>
                                )}
                                <span className={`${styles.matchCell} ${m.points ? styles.points : styles.muted}`}>
                                    <i className={styles.cellLabel}>Pts</i>{m.points ?? '-'}
                                </span>
                                <span className={styles.matchCell}>
                                    <i className={styles.cellLabel}>Min</i>{numero(m.minutes) || '-'}
                                </span>
                                <span className={`${styles.matchCell} ${m.tries ? styles.strong : ''}`}>
                                    <i className={styles.cellLabel}>Tries</i>{m.tries ?? '-'}
                                </span>
                                <span className={styles.matchCell}>
                                    <i className={styles.cellLabel}>Conv</i>{m.conversions ?? '-'}
                                </span>
                                <span className={styles.matchCell}>
                                    <i className={styles.cellLabel}>Tarj</i>
                                    {amarillas === 0 && rojas === 0 ? (
                                        <span className={styles.muted}>-</span>
                                    ) : (
                                        <span className={styles.cards}>
                                            {amarillas > 0 && (
                                                <span
                                                    className={styles.cardYellow}
                                                    title={`${amarillas} amarilla${amarillas > 1 ? 's' : ''}`}
                                                >
                                                    <span className={styles.srOnly}>{amarillas} amarillas</span>
                                                    {amarillas > 1 ? amarillas : ''}
                                                </span>
                                            )}
                                            {rojas > 0 && (
                                                <span
                                                    className={styles.cardRed}
                                                    title={`${rojas} roja${rojas > 1 ? 's' : ''}`}
                                                >
                                                    <span className={styles.srOnly}>{rojas} rojas</span>
                                                    {rojas > 1 ? rojas : ''}
                                                </span>
                                            )}
                                        </span>
                                    )}
                                </span>
                              </Fila>
                            </li>
                        </React.Fragment>
                    );
                })}
            </ul>
        </div>
    );
}
