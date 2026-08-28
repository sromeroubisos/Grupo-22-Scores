'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { FavoriteItem } from '@/hooks/useFavorites';
import { newsPath } from '@/lib/news/newsUrl';

import styles from './TickerTitulares.module.css';

/**
 * La franja que corre arriba del feed: los titulares de las noticias y, si el
 * hincha sigue algún club, el próximo partido y el último resultado de cada uno.
 *
 * Es la misma franja fina que ocupaba la promo del XV Puma —arriba del feed, un
 * solo renglón, el resultado que el hincha vino a buscar sigue por encima del
 * pliegue—, pero el contenido ya no vence: se arma con lo que hay.
 *
 * Si no hay ni una pieza para mostrar, la franja NO se dibuja. Un riel vacío
 * corriendo en loop es peor que nada.
 *
 * Nada se calcula durante el render del servidor: los datos llegan por fetch y
 * el reloj del navegador no es el del servidor. El primer pintado es `null` y
 * el contenido entra después; es un aviso, no contenido, así que no cuesta nada
 * y saca de raíz el mismatch de hidratación.
 */

/** Cuántos clubes seguidos entran en el riel. /api/teams es una consulta cara por club. */
const MAX_CLUBES = 3;

/** Velocidad del deslizado, en píxeles por segundo. */
const VELOCIDAD = 55;

/**
 * Tope del salto de tiempo entre dos cuadros.
 *
 * Una pestaña que estuvo en segundo plano vuelve con un `delta` de minutos, y
 * sin tope el riel pegaría un salto de miles de píxeles en un solo cuadro. Con
 * él, vuelve caminando desde donde estaba.
 */
const SALTO_MAXIMO_S = 0.1;

/**
 * Un partido empezado sigue siendo "el próximo" un rato: el resultado tarda en
 * cargarse y sacarlo del riel al minuto del pitazo inicial deja al hincha sin la
 * pieza justo cuando más la mira.
 */
const GRACIA_EN_JUEGO_MS = 3 * 60 * 60 * 1000;

type Pieza = {
    key: string;
    rotulo: string;
    texto: string;
    href: string;
};

type MatchLike = {
    match_id?: string;
    event_key?: string;
    home_team?: { name?: string | null } | null;
    away_team?: { name?: string | null } | null;
    scores?: { home?: number | null; away?: number | null } | null;
    timestamp?: number | null;
};

type NewsLike = {
    id?: string | null;
    title?: string | null;
};

/**
 * Cuántos titulares entran a la franja.
 *
 * Son las últimas, sin filtro de fecha: así el riel nunca se queda sin
 * titulares, que es lo que pasaba recortando por día —el 28/8 no se publicó
 * ninguna nota y la franja quedaba solo con los partidos de los clubes—.
 *
 * `/api/news` ya las devuelve ordenadas por `published_at` descendente, así que
 * las primeras cinco SON las últimas cinco.
 */
const MAX_TITULARES = 5;

/**
 * La clave navegable de un partido. Las filas del archivo ('ra-…') no tienen
 * página propia, así que no entran al riel: un titular que no lleva a ningún
 * lado es peor que uno menos.
 */
function claveNavegable(match: MatchLike): string | null {
    const key = String(match.event_key || match.match_id || '').trim();
    if (!key || key.startsWith('ra-')) return null;
    return key;
}

function nombresDe(match: MatchLike): { local: string; visita: string } | null {
    const local = (match.home_team?.name || '').trim();
    const visita = (match.away_team?.name || '').trim();
    if (!local || !visita) return null;
    return { local, visita };
}

/**
 * "sáb 29/8 15:30".
 *
 * El día y la fecha van en DOS llamadas y no en una: pedirle a `es-AR` el día
 * de la semana junto con el día y el mes devuelve "sáb 29-8", con guión, que no
 * es como se escribe una fecha acá.
 *
 * Y la hora lleva `hour12: false` explícito: sin eso `es-AR` contesta
 * "03:30 p. m.", que en una franja de un renglón ocupa el doble y se lee peor.
 */
function cuandoJuega(timestamp: number, timeZone: string): string {
    const fecha = new Date(timestamp * 1000);
    const diaSemana = fecha
        .toLocaleDateString('es-AR', { weekday: 'short', timeZone })
        .replace(/\.$/, '');
    const diaMes = fecha.toLocaleDateString('es-AR', { day: 'numeric', month: 'numeric', timeZone });
    const hora = fecha.toLocaleTimeString('es-AR', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        timeZone,
    });
    return `${diaSemana} ${diaMes} ${hora}`;
}

async function traerTitulares(signal: AbortSignal): Promise<Pieza[]> {
    const res = await fetch('/api/news', { cache: 'no-store', signal });
    if (!res.ok) return [];

    const payload = (await res.json()) as { data?: NewsLike[] | null };
    const filas = Array.isArray(payload?.data) ? payload.data : [];

    return filas
        .filter((fila): fila is { id: string; title: string } => (
            Boolean(fila?.id) && Boolean((fila?.title || '').trim())
        ))
        .slice(0, MAX_TITULARES)
        .map((fila) => ({
            key: `noticia:${fila.id}`,
            rotulo: 'Noticia',
            texto: fila.title.trim(),
            href: newsPath(fila),
        }));
}

async function traerPiezasDelClub(
    club: FavoriteItem,
    timeZone: string,
    signal: AbortSignal,
): Promise<Pieza[]> {
    // `team_id` y no `id`: la ruta contesta 400 "team_id is required" con
    // cualquier otro nombre. Es el mismo contrato que usa la ficha del club.
    const query = new URLSearchParams({ team_id: club.id, skip_squad: 'true' });
    if (club.name) query.set('team_name', club.name);
    const res = await fetch(`/api/teams?${query.toString()}`, { cache: 'no-store', signal });
    if (!res.ok) return [];

    const payload = (await res.json()) as {
        ok?: boolean;
        fixtures?: MatchLike[] | null;
        results?: MatchLike[] | null;
    };
    if (!payload?.ok) return [];

    const piezas: Pieza[] = [];
    const corte = Date.now() - GRACIA_EN_JUEGO_MS;

    const proximo = (Array.isArray(payload.fixtures) ? payload.fixtures : [])
        .filter((match) => (
            typeof match?.timestamp === 'number' && match.timestamp * 1000 >= corte
        ))
        .sort((left, right) => (left.timestamp as number) - (right.timestamp as number))[0];

    if (proximo) {
        const clave = claveNavegable(proximo);
        const nombres = nombresDe(proximo);
        if (clave && nombres) {
            const cuando = cuandoJuega(proximo.timestamp as number, timeZone);
            piezas.push({
                key: `proximo:${clave}`,
                rotulo: 'Próximo',
                texto: `${nombres.local} vs ${nombres.visita} · ${cuando}`,
                href: `/matches/${clave}`,
            });
        }
    }

    const ultimo = (Array.isArray(payload.results) ? payload.results : [])
        .filter((match) => (
            typeof match?.timestamp === 'number'
            && typeof match.scores?.home === 'number'
            && typeof match.scores?.away === 'number'
        ))
        .sort((left, right) => (right.timestamp as number) - (left.timestamp as number))[0];

    if (ultimo) {
        const clave = claveNavegable(ultimo);
        const nombres = nombresDe(ultimo);
        if (clave && nombres) {
            piezas.push({
                key: `resultado:${clave}`,
                rotulo: 'Resultado',
                texto: `${nombres.local} ${ultimo.scores?.home} - ${ultimo.scores?.away} ${nombres.visita}`,
                href: `/matches/${clave}`,
            });
        }
    }

    return piezas;
}

export default function TickerTitulares({ favorites }: { favorites: FavoriteItem[] }) {
    const [titulares, setTitulares] = useState<Pieza[]>([]);
    const [deClubes, setDeClubes] = useState<Pieza[]>([]);

    /*
     * Si las dos búsquedas ya contestaron.
     *
     * La franja se dibuja DESDE EL PRIMER PINTADO, vacía y con su alto puesto:
     * apareciendo recién con los datos empujaba para abajo todo lo que tiene
     * debajo, que es el feed —justo lo que el hincha vino a mirar—.
     *
     * El precio es que un día sin nada dejaría una franja vacía para siempre, y
     * por eso hace falta saber cuándo terminó de buscar: recién ahí, si no hay
     * ni una pieza, se colapsa.
     */
    const [buscoTitulares, setBuscoTitulares] = useState(false);
    const [buscoClubes, setBuscoClubes] = useState(false);

    const ventanaRef = useRef<HTMLDivElement | null>(null);
    const rielRef = useRef<HTMLDivElement | null>(null);
    const grupoRef = useRef<HTMLDivElement | null>(null);

    /*
     * Cuántas copias de la tira hacen falta.
     *
     * Dos alcanzan mientras una copia sea más ancha que la ventana. Con un solo
     * titular del día y ningún club seguido no lo es, y ahí dos copias dejan un
     * hueco a la derecha durante media vuelta. La cuenta es "las que tapan la
     * ventana, más una que entra": la vuelta sigue siendo el ancho de UNA copia,
     * así que agregar copias no cambia el loop.
     */
    const [copias, setCopias] = useState(2);

    /*
     * La posición vive en un ref y NO en el estado, a propósito: es lo único
     * que garantiza el loop. Cuando llegan los partidos de los clubes —después
     * que los titulares— el contenido del riel cambia, y con el estado la
     * animación arrancaba de cero cada vez. Acá el riel sigue exactamente donde
     * estaba y lo único que cambia es dónde da la vuelta.
     */
    const posicionRef = useRef<number | null>(null);

    /** Se detiene con el mouse encima o con el foco adentro: un link que huye no se clickea. */
    const detenidoRef = useRef(false);

    // La zona horaria del que mira, igual que el selector de días del feed: un
    // partido de las 15:30 de Argentina no son las 15:30 en Madrid.
    const timeZone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone, []);

    // Los clubes seguidos, de lo más nuevo a lo más viejo (así los ordena el
    // hook) y acotados: cada uno es una consulta cara.
    const clubes = useMemo(() => favorites
        .filter((item) => item.entity_type === 'club' || item.entity_type === 'team')
        .slice(0, MAX_CLUBES), [favorites]);

    const clavesDeClubes = useMemo(() => clubes.map((club) => club.id).join('|'), [clubes]);

    useEffect(() => {
        const controller = new AbortController();

        traerTitulares(controller.signal)
            .then((piezas) => {
                if (!controller.signal.aborted) setTitulares(piezas);
            })
            .catch(() => {
                // Sin noticias la franja sigue: se queda con lo de los clubes.
            })
            .finally(() => {
                // En el `finally` y no en el `then`: si la búsqueda falla, la
                // franja tiene que poder colapsar igual en vez de quedarse
                // vacía esperando una respuesta que ya no viene.
                if (!controller.signal.aborted) setBuscoTitulares(true);
            });

        return () => controller.abort();
    }, [timeZone]);

    useEffect(() => {
        if (!clavesDeClubes) {
            setDeClubes([]);
            // Sin clubes seguidos no hay nada que buscar: la búsqueda está
            // terminada de entrada, y la franja no queda esperándola.
            setBuscoClubes(true);
            return;
        }

        const controller = new AbortController();
        const pedidos = clavesDeClubes
            .split('|')
            .map((id) => clubes.find((club) => club.id === id))
            .filter((club): club is FavoriteItem => Boolean(club));

        Promise.all(pedidos.map((club) => (
            traerPiezasDelClub(club, timeZone, controller.signal).catch(() => [] as Pieza[])
        ))).then((tandas) => {
            if (!controller.signal.aborted) setDeClubes(tandas.flat());
        }).finally(() => {
            if (!controller.signal.aborted) setBuscoClubes(true);
        });

        return () => controller.abort();
        // `clavesDeClubes` y no `clubes`: el array se rearma en cada render del
        // hook de seguidos y volvería a pedir todo sin que cambiara nada.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [clavesDeClubes, timeZone]);

    // Los clubes del hincha van primero: es lo suyo. El titular general está a
    // un toque de distancia igual.
    const piezas = useMemo(() => {
        const vistas = new Set<string>();
        return [...deClubes, ...titulares].filter((pieza) => {
            if (vistas.has(pieza.key)) return false;
            vistas.add(pieza.key);
            return true;
        });
    }, [deClubes, titulares]);

    /*
     * El riel lo mueve un `requestAnimationFrame`, no una animación de CSS.
     *
     * Con CSS la vuelta es un `translateX(-50%)` cuya DURACIÓN hay que calcular
     * a partir del ancho, y ahí estaba el corte que se veía: los titulares y
     * los partidos de los clubes llegan en momentos distintos, cada llegada
     * cambia el ancho, y cambiarle la duración a una animación que ya está
     * corriendo la reubica de golpe en otro punto del recorrido.
     *
     * Acá la vuelta es un módulo sobre el ancho de UNA copia, y el ancho se lee
     * en cada cuadro: si el contenido cambia, el riel no se entera —sigue en el
     * mismo píxel— y lo único que se corre es dónde da la vuelta. Un loop que
     * no se puede cortar, porque no hay nada que reiniciar.
     */
    useEffect(() => {
        const riel = rielRef.current;
        const grupo = grupoRef.current;
        const ventana = ventanaRef.current;
        if (!riel || !grupo || !ventana || piezas.length === 0) return;

        // Sin movimiento no hay riel que mover: la franja se lee quieta y se
        // scrollea a mano (ver el bloque de reduced-motion en el CSS).
        if (window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) {
            posicionRef.current = 0;
            riel.style.transform = '';
            return;
        }

        if (posicionRef.current === null) {
            /*
             * La primera vez la tira arranca justo afuera del borde derecho y
             * entra girando. Antes las piezas ya estaban puestas cuando la
             * franja se dibujaba, y aparecían de la nada.
             *
             * Es una posición NEGATIVA: el módulo de más abajo conserva el
             * signo, así que la entrada se recorre una sola vez y a partir de
             * la primera vuelta el riel queda en el ciclo normal.
             */
            posicionRef.current = -ventana.clientWidth;
        } else {
            // El contenido nuevo puede ser más corto que la posición actual: se
            // pliega ya para no dejar un hueco hasta la próxima vuelta.
            const vueltaInicial = grupo.scrollWidth;
            if (vueltaInicial > 0) posicionRef.current %= vueltaInicial;
        }

        riel.style.transform = `translate3d(${-posicionRef.current}px, 0, 0)`;

        let anterior = 0;
        let cuadro = 0;

        const paso = (ahora: number) => {
            cuadro = requestAnimationFrame(paso);

            if (!anterior) {
                anterior = ahora;
                return;
            }

            const delta = Math.min((ahora - anterior) / 1000, SALTO_MAXIMO_S);
            anterior = ahora;

            if (detenidoRef.current) return;

            const vuelta = grupo.scrollWidth;
            if (vuelta <= 0) return;

            /*
             * El módulo recién manda cuando la tira ya entró.
             *
             * Durante la entrada la posición es negativa (la tira está a la
             * derecha del borde) y aplicarle el módulo la pliega de una: si la
             * tira es más angosta que la ventana —pocas piezas—, `-844 % 743`
             * da -101 y la entrada se saltea con un tirón de 744 px. Medido.
             */
            const avanzada = (posicionRef.current ?? 0) + VELOCIDAD * delta;
            posicionRef.current = avanzada >= 0 ? avanzada % vuelta : avanzada;
            riel.style.transform = `translate3d(${-posicionRef.current}px, 0, 0)`;
        };

        cuadro = requestAnimationFrame(paso);
        return () => cancelAnimationFrame(cuadro);
    }, [piezas]);

    useEffect(() => {
        const grupo = grupoRef.current;
        const ventana = ventanaRef.current;
        if (!grupo || !ventana || piezas.length === 0) return;

        const calcular = () => {
            const unaCopia = grupo.scrollWidth;
            const aLaVista = ventana.clientWidth;
            if (unaCopia <= 0 || aLaVista <= 0) return;
            setCopias(Math.max(2, Math.ceil(aLaVista / unaCopia) + 1));
        };

        calcular();

        if (typeof ResizeObserver === 'undefined') return;
        const observer = new ResizeObserver(calcular);
        observer.observe(grupo);
        observer.observe(ventana);
        return () => observer.disconnect();
    }, [piezas]);

    const detener = useCallback(() => { detenidoRef.current = true; }, []);
    const soltar = useCallback(() => { detenidoRef.current = false; }, []);

    // Mientras busca, la franja está: vacía, con su alto, sin mover el feed.
    // Si terminó de buscar y no juntó nada, recién ahí se va.
    if (piezas.length === 0 && buscoTitulares && buscoClubes) return null;

    const dibujarGrupo = (indice: number) => {
        const esCopia = indice > 0;

        return (
            <div
                key={`grupo-${indice}`}
                className={styles.grupo}
                ref={esCopia ? undefined : grupoRef}
                aria-hidden={esCopia || undefined}
            >
                {piezas.map((pieza) => (
                    <span key={`${indice}:${pieza.key}`} className={styles.celda}>
                        <Link
                            href={pieza.href}
                            className={styles.pieza}
                            // Las copias existen para que el loop no tenga
                            // costura: no se navega ni se tabula por ellas.
                            tabIndex={esCopia ? -1 : undefined}
                        >
                            <span className={styles.rotulo}>{pieza.rotulo}</span>
                            <span className={styles.texto}>{pieza.texto}</span>
                        </Link>
                        <span className={styles.separador} aria-hidden="true" />
                    </span>
                ))}
            </div>
        );
    };

    return (
        <div
            className={styles.banner}
            onMouseEnter={detener}
            onMouseLeave={soltar}
            onFocusCapture={detener}
            onBlurCapture={soltar}
        >
            <span className={styles.marca}>G22</span>
            <div className={styles.ventana} ref={ventanaRef}>
                <div className={styles.riel} ref={rielRef}>
                    {Array.from({ length: copias }, (_, indice) => dibujarGrupo(indice))}
                </div>
            </div>
        </div>
    );
}
