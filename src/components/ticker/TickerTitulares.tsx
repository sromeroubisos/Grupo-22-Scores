'use client';

import Link from 'next/link';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

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

/** El riel nunca da una vuelta en menos que esto: con dos piezas quedaría frenético. */
const DURACION_MINIMA = 18;

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
    const [duracion, setDuracion] = useState(DURACION_MINIMA);

    const grupoRef = useRef<HTMLDivElement | null>(null);

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
            });

        return () => controller.abort();
    }, []);

    useEffect(() => {
        if (!clavesDeClubes) {
            setDeClubes([]);
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
     * La duración se MIDE, no se adivina: el riel tiene que correr siempre a la
     * misma velocidad, y con una duración fija dos titulares se arrastran y
     * quince vuelan. Se recalcula cuando cambia el contenido o el ancho.
     */
    useLayoutEffect(() => {
        const grupo = grupoRef.current;
        if (!grupo || piezas.length === 0) return;

        const medir = () => {
            const ancho = grupo.scrollWidth;
            if (!ancho) return;
            setDuracion(Math.max(DURACION_MINIMA, ancho / VELOCIDAD));
        };

        medir();

        if (typeof ResizeObserver === 'undefined') return;
        const observer = new ResizeObserver(medir);
        observer.observe(grupo);
        return () => observer.disconnect();
    }, [piezas]);

    if (piezas.length === 0) return null;

    const dibujarGrupo = (esCopia: boolean) => (
        <div
            className={styles.grupo}
            ref={esCopia ? undefined : grupoRef}
            aria-hidden={esCopia || undefined}
        >
            {piezas.map((pieza) => (
                <span key={`${esCopia ? 'copia' : 'original'}:${pieza.key}`} className={styles.celda}>
                    <Link
                        href={pieza.href}
                        className={styles.pieza}
                        // La copia existe para que el loop no tenga costura: no
                        // se navega ni se tabula por ella.
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

    return (
        <div className={styles.banner}>
            <span className={styles.marca}>G22</span>
            <div className={styles.ventana}>
                <div
                    className={styles.riel}
                    style={{ ['--duracion' as string]: `${duracion}s` }}
                >
                    {dibujarGrupo(false)}
                    {dibujarGrupo(true)}
                </div>
            </div>
        </div>
    );
}
