/**
 * La parte con red del conector de RugbyPass. El parseo esta en
 * `rugbyPassParser.ts`, que es puro y se prueba con `node --test`.
 *
 * No hay credenciales ni rate limit publicado. El calendario entero es UNA
 * sola llamada (~2 MB, 2555 partidos de 36 competiciones), asi que el cron no
 * pagina ni pide por fecha: pide todo y filtra en memoria.
 *
 * No se fija la zona horaria de la sesion a proposito. RugbyPass la resuelve
 * por geo-IP y con ella calcula `t`, `tsm`, `st` y `k` — pero `gmt` no se mueve,
 * y es el unico campo que lee el parser. Fijarla no cambiaria nada y agregaria
 * un ida y vuelta con cookies.
 */

import {
    RUGBYPASS_URL,
    rugbyPassMatchUrl,
    rugbyPassTeamSlugOf,
    type RugbyPassEvent,
    type RugbyPassMatch,
    type RugbyPassMatchDetail,
    type RugbyPassPollResult,
    type RugbyPassPlayerStat,
    RUGBYPASS_PLAYER_STAT_KINDS,
    parseRugbyPassEvents,
    parseRugbyPassPlayerStatRanking,
    parseRugbyPassMatchDetail,
    parseRugbyPassFeed,
    parseRugbyPassPoll,
    unwrapRugbyPassBody,
} from './rugbyPassParser.ts';
import {
    type RugbyPassPlayer,
    type RugbyPassTeamEntry,
    type RugbyPassTournament,
    mergeRugbyPassPlayers,
    mergeRugbyPassTournaments,
    pageIdToCompetitionId,
    parseRugbyPassPlayers,
    parseRugbyPassTeams,
    parseRugbyPassTournamentCards,
    parseRugbyPassTournamentIds,
    parseRugbyPassStandings,
    type RugbyPassStandingRow,
} from './rugbyPassCatalog.ts';

/** Sin esto RugbyPass contesta el HTML de la pagina en vez del JSON. */
const AJAX_HEADERS: Record<string, string> = {
    'X-Requested-With': 'XMLHttpRequest',
    'Referer': `${RUGBYPASS_URL}/fixtures/`,
    'User-Agent': 'Mozilla/5.0 (compatible; G22Scores/1.0; +https://www.g22scores.com)',
};

const DEFAULT_TIMEOUT_MS = 25_000;

async function rugbyPassFetch(
    url: string,
    init: RequestInit & { timeoutMs?: number } = {}
): Promise<string> {
    const { timeoutMs = DEFAULT_TIMEOUT_MS, ...rest } = init;
    const abort = new AbortController();
    const reloj = setTimeout(() => abort.abort(), timeoutMs);
    try {
        const res = await fetch(url, {
            ...rest,
            signal: abort.signal,
            headers: { ...AJAX_HEADERS, ...(rest.headers as Record<string, string> | undefined) },
        });
        if (!res.ok) {
            throw new Error(`[rugbypass] ${res.status} ${res.statusText} en ${url}`);
        }
        // Algunas fichas vienen con bytes que no son UTF-8 valido. `text()` los
        // reemplaza por U+FFFD en vez de tirar, que es lo que queremos: un
        // nombre con un caracter roto no puede voltear la sincronizacion.
        return await res.text();
    } finally {
        clearTimeout(reloj);
    }
}

/** El cuerpo llega como JSON envuelto en HTML; el parser lo desenvuelve. */
async function rugbyPassJson(url: string, init?: RequestInit): Promise<unknown> {
    const crudo = await rugbyPassFetch(url, init);
    const limpio = unwrapRugbyPassBody(crudo);
    try {
        return JSON.parse(limpio);
    } catch {
        throw new Error(`[rugbypass] respuesta no parseable en ${url} (${limpio.slice(0, 120)}…)`);
    }
}

function formBody(campos: Record<string, string>): string {
    // El endpoint espera un formulario, e `isContent=1` lo manda siempre el
    // front: sin eso contesta la pagina entera.
    return new URLSearchParams({ ...campos, isContent: '1' }).toString();
}

/**
 * El calendario completo, ya filtrado a las competiciones habilitadas en
 * `RUGBYPASS_COMPETITIONS`. Todo lo demas —incluido el Americas Rugby
 * Championship, que es dato abandonado— lo descarta el parser.
 */
export async function getRugbyPassFixtures(): Promise<RugbyPassMatch[]> {
    const payload = await rugbyPassJson(`${RUGBYPASS_URL}/fixtures`, {
        method: 'POST',
        body: formBody({ loadaction: 'load-init-fixtures-data' }),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    return parseRugbyPassFeed(payload as { weeks?: unknown });
}

/** Cuantos ids entran en una llamada al poll. Es barato: 318 bytes para 4. */
const POLL_BATCH = 40;

/**
 * Estado y marcador en vivo de varios partidos. Una sola llamada por tanda:
 * pedirlos de a uno seria 40 veces mas caro para el mismo dato.
 */
export async function getRugbyPassPoll(gameIds: number[]): Promise<RugbyPassPollResult[]> {
    const salida: RugbyPassPollResult[] = [];
    for (let i = 0; i < gameIds.length; i += POLL_BATCH) {
        const tanda = gameIds.slice(i, i + POLL_BATCH);
        if (tanda.length === 0) continue;
        const payload = await rugbyPassJson(`${RUGBYPASS_URL}/fixtures`, {
            method: 'POST',
            body: formBody({ action: 'poll-vue-games', games: tanda.join(',') }),
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        });
        salida.push(...parseRugbyPassPoll(payload as never));
    }
    return salida;
}

/**
 * Los eventos de un partido, de su ficha (`/live/<slug>/?g=<id>`). Vienen
 * renderizados en el HTML, asi que es una llamada por partido — no hay API.
 *
 * Devuelve lista vacia cuando la ficha no los publica: la Farah Palmer Cup y el
 * Super Rugby Aupiki traen marcador pero cero eventos, y eso NO es un error.
 */
export async function getRugbyPassEvents(matchUrl: string): Promise<RugbyPassEvent[]> {
    const html = await rugbyPassFetch(matchUrl);
    return parseRugbyPassEvents(html);
}

/**
 * Los eventos a partir del numero de partido y los slugs de los equipos.
 *
 * RugbyPass no siempre pone al local primero en el slug, y con el orden
 * equivocado la pagina existe igual pero llega SIN eventos — no da error, da
 * una lista vacia, que es lo peor para diagnosticar. Por eso, si la primera
 * forma vuelve vacia, se prueba la inversa antes de darla por sin eventos.
 */
export async function getRugbyPassEventsFor(
    gameId: number | string,
    homeSlug: string,
    awaySlug: string
): Promise<RugbyPassEvent[]> {
    const primera = await getRugbyPassEvents(rugbyPassMatchUrl(gameId, homeSlug, awaySlug));
    if (primera.length > 0) return primera;
    try {
        return await getRugbyPassEvents(rugbyPassMatchUrl(gameId, awaySlug, homeSlug));
    } catch {
        // La inversa puede dar 404 y esta bien: significa que la primera era la
        // buena y el partido simplemente no publica eventos.
        return primera;
    }
}

/**
 * Cuantos rubros se piden a la vez. Son veintidos llamadas por partido, una por
 * rubro: de a seis tarda unos cuatro segundos y no le tira el sitio encima.
 */
const PLAYER_STATS_CONCURRENCY = 6;

/**
 * LA PLANILLA COMPLETA POR JUGADOR.
 *
 * `live-poll-data` trae seis rubros y solo el podio de cada uno. La pestana
 * `/stats/` de la ficha usa `filter-players-stats`, que devuelve el ranking
 * ENTERO y veintidos rubros: con eso cada jugador tiene su propia planilla en
 * vez de aparecer solo si salio primero, segundo o tercero en algo.
 *
 * `team: '0'` es "los dos equipos" —los ids de club son otros, 100 y 800 en
 * este partido—. Con cualquier otro valor el endpoint contesta 200 con el
 * `html` VACIO, que es la falla mas cara de diagnosticar que tiene: no es un
 * error, es una planilla en blanco.
 *
 * Un rubro sin registros devuelve lista vacia y eso es correcto: si no hubo
 * ninguna roja, nadie tiene rojas.
 */
export async function getRugbyPassPlayerStats(
    gameId: number | string,
    homeSlug: string,
    awaySlug: string
): Promise<RugbyPassPlayerStat[]> {
    const pedir = async (url: string, kind: (typeof RUGBYPASS_PLAYER_STAT_KINDS)[number]) => {
        try {
            const payload = await rugbyPassJson(url, {
                method: 'POST',
                body: formBody({ action: 'filter-players-stats', team: '0', stat: kind.id }),
                headers: { 'Content-Type': 'application/x-www-form-urlencoded', Referer: url },
            });
            const html = (payload as { html?: unknown })?.html;
            if (typeof html !== 'string' || html === '') return [];
            return parseRugbyPassPlayerStatRanking(kind.id, html);
        } catch {
            // Un rubro que falla no puede voltear la planilla entera: se pierde
            // esa columna y las otras veintiuna siguen.
            return [];
        }
    };

    // MISMA TRAMPA QUE EN LA CRONOLOGIA Y LA FICHA: RugbyPass no siempre pone al
    // local primero en el slug, y con el orden equivocado la pagina no existe.
    // Con Sudafrica-Nueva Zelanda (949461) pasaba justo eso: la planilla volvia
    // vacia, se caia al podio del `live-poll-data` y de 46 jugadores quedaban 12.
    //
    // Se tantea con UN rubro antes de pedir los veintidos: si el primero no trae
    // nada, la culpa es del orden y no del partido.
    const [primero, ...resto] = RUGBYPASS_PLAYER_STAT_KINDS;
    let url = rugbyPassMatchUrl(gameId, homeSlug, awaySlug);
    let cabecera = await pedir(url, primero);
    if (cabecera.length === 0) {
        const invertida = rugbyPassMatchUrl(gameId, awaySlug, homeSlug);
        const segundoIntento = await pedir(invertida, primero);
        if (segundoIntento.length > 0) {
            url = invertida;
            cabecera = segundoIntento;
        }
    }

    const salida: RugbyPassPlayerStat[] = [...cabecera];
    for (let i = 0; i < resto.length; i += PLAYER_STATS_CONCURRENCY) {
        const tanda = resto.slice(i, i + PLAYER_STATS_CONCURRENCY);
        const resultados = await Promise.all(tanda.map((kind) => pedir(url, kind)));
        for (const filas of resultados) salida.push(...filas);
    }
    return salida;
}

/**
 * TODA la ficha en una sola llamada: cronologia, estadisticas del partido, de
 * cada jugador, posesion y territorio (~126 KB).
 *
 * Raspar la pagina solo daba la cronologia. Este endpoint es el que usa el
 * propio match centre para refrescarse mientras el partido se juega, asi que
 * tambien es la via correcta para verlo evolucionar.
 */
export async function getRugbyPassMatchDetail(
    gameId: number | string,
    homeSlug: string,
    awaySlug: string
): Promise<RugbyPassMatchDetail | null> {
    const url = rugbyPassMatchUrl(gameId, homeSlug, awaySlug);
    const intentar = async (u: string) => {
        const payload = await rugbyPassJson(u, {
            method: 'POST',
            body: formBody({ action: 'live-poll-data', event: String(gameId), liveStandings: '0' }),
            headers: { 'Content-Type': 'application/x-www-form-urlencoded', Referer: u },
        });
        return parseRugbyPassMatchDetail(payload as never);
    };

    try {
        const detalle = await intentar(url);
        // Con el slug invertido la pagina existe pero vuelve vacia: misma trampa
        // que en `getRugbyPassEventsFor`.
        if (detalle.events.length > 0 || detalle.stats.length > 0) return detalle;
    } catch {
        // Sigue con el orden inverso.
    }
    try {
        return await intentar(rugbyPassMatchUrl(gameId, awaySlug, homeSlug));
    } catch {
        return null;
    }
}

// ── Los catalogos: torneos, equipos y jugadores ─────────────────────────────

/**
 * MEMORIA DE PROCESO, para que la pantalla de un torneo no pague dos veces lo
 * mismo.
 *
 * El catalogo de torneos son DOS paginas de cientos de KB y cambia un par de
 * veces por temporada; la tabla de posiciones solo se mueve cuando termina un
 * partido. Pedirlos en cada visita es lo que hacia lenta la pantalla.
 *
 * Es un Map con vencimiento y NO un `setInterval`: un temporizador de modulo
 * deja el proceso vivo y cuelga `node --test` (ya paso con `cache.ts`). Aca lo
 * viejo se descarta al leerlo, que alcanza y no engancha nada.
 */
const memoria = new Map<string, { vence: number; valor: unknown }>();

async function conMemoria<T>(clave: string, ttlMs: number, cargar: () => Promise<T>): Promise<T> {
    const guardado = memoria.get(clave);
    if (guardado && guardado.vence > Date.now()) return guardado.valor as T;

    const valor = await cargar();
    memoria.set(clave, { vence: Date.now() + ttlMs, valor });
    return valor;
}

/** Un catalogo de torneos cambia un par de veces por temporada. */
const TTL_CATALOGO_MS = 6 * 60 * 60 * 1000;
/** Una tabla solo se mueve cuando termina un partido. */
const TTL_TABLA_MS = 5 * 60 * 1000;

/** Vacia la memoria. Para los tests y para forzar una recarga a mano. */
export function clearRugbyPassCatalogCache(): void {
    memoria.clear();
}


/**
 * El catalogo de torneos, unido de sus DOS fuentes.
 *
 * Los ids (`id` y `oid`) solo estan en el array embebido de `/players/`; el logo
 * y los colores de marca, solo en la grilla de `/tournaments/`. Ninguna de las
 * dos es superconjunto de la otra, asi que se piden las dos y se unen por slug.
 *
 * Van en paralelo porque no dependen entre si: son dos GET a la misma casa.
 */
export async function getRugbyPassTournaments(): Promise<RugbyPassTournament[]> {
    return conMemoria('tournaments', TTL_CATALOGO_MS, async () => {
        const [players, tournaments] = await Promise.all([
            rugbyPassFetch(`${RUGBYPASS_URL}/players/`),
            rugbyPassFetch(`${RUGBYPASS_URL}/tournaments/`),
        ]);
        return mergeRugbyPassTournaments(
            parseRugbyPassTournamentIds(players),
            parseRugbyPassTournamentCards(tournaments)
        );
    });
}

/**
 * El logo y los colores de marca de una competicion, por su **oid**.
 *
 * Sale del catalogo, que queda en memoria: la cabecera del torneo no dispara dos
 * descargas por visita.
 */
export async function getRugbyPassTournamentBranding(
    competitionId: number
): Promise<{ logo: string; colors: { background: string; foreground: string } | null }> {
    try {
        const torneos = await getRugbyPassTournaments();
        const torneo = torneos.find((t) => t.competitionId === competitionId);
        return { logo: torneo?.logo ?? '', colors: torneo?.colors ?? null };
    } catch {
        // Sin logo la cabecera cae a la inicial, que es lo que hacia hasta ahora.
        return { logo: '', colors: null };
    }
}

/**
 * Los equipos de `/teams/`, con sus competiciones ya en **oid**.
 *
 * Pide el catalogo de torneos porque sin el no se puede traducir el `data-comps`
 * de cada fila, que viene en ids de PAGINA. Se le puede pasar uno ya cargado
 * para no pedirlo dos veces en la misma corrida.
 */
export async function getRugbyPassTeams(
    torneos?: readonly RugbyPassTournament[]
): Promise<RugbyPassTeamEntry[]> {
    // Con memoria como el catalogo de torneos: la ficha de un club lo pide por
    // visita y son cientos de KB de HTML para 299 filas que cambian una vez por
    // temporada.
    return conMemoria('teams', TTL_CATALOGO_MS, async () => {
        const catalogo = torneos ?? (await getRugbyPassTournaments());
        const html = await rugbyPassFetch(`${RUGBYPASS_URL}/teams/`);
        return parseRugbyPassTeams(html, pageIdToCompetitionId(catalogo));
    });
}

/**
 * Los jugadores de las competiciones pedidas, sin repetidos.
 *
 * Usa `filter-players` y NO `load-players`: el filtrado por torneo devuelve la
 * lista ENTERA en una sola llamada (medido: 1729 del Top 14, 1158 de la URC,
 * 2453 de Internationals), mientras que el otro pagina de a 150 y obligaria a
 * una decena de idas y vueltas por torneo para el mismo dato.
 *
 * Las competiciones se piden EN SERIE a proposito. Son respuestas de cientos de
 * KB y el proveedor no publica rate limit: pedir seis en paralelo es la forma
 * mas rapida de que empiece a cortar. El plegado por slug junta al jugador que
 * aparece en varias y le une sus competiciones.
 */
export async function getRugbyPassPlayers(
    competitionIds: readonly number[]
): Promise<RugbyPassPlayer[]> {
    // La clave lleva las competiciones ORDENADAS: pedir [203, 3] y [3, 203] es
    // la misma lista y tiene que pegarle a la misma entrada. Sin memoria, la
    // ficha de un jugador cuesta los 7,2 s de la corrida entera por visita.
    const clave = `players:${[...competitionIds].sort((a, b) => a - b).join(',')}`;
    return conMemoria(clave, TTL_CATALOGO_MS, () => cargarJugadores(competitionIds));
}

async function cargarJugadores(
    competitionIds: readonly number[]
): Promise<RugbyPassPlayer[]> {
    const tandas: RugbyPassPlayer[][] = [];

    for (const competitionId of competitionIds) {
        const payload = await rugbyPassJson(`${RUGBYPASS_URL}/players`, {
            method: 'POST',
            body: formBody({
                action: 'filter-players',
                pos: '0',
                team: '0',
                comp: String(competitionId),
                squad: '1',
                keyword: '',
            }),
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                Referer: `${RUGBYPASS_URL}/players/`,
            },
        });
        tandas.push(parseRugbyPassPlayers(payload as { players?: unknown }, competitionId));
    }

    return mergeRugbyPassPlayers(tandas);
}

/**
 * La TABLA DE POSICIONES de la competicion a la que pertenece un partido.
 *
 * No hay endpoint de tabla por torneo: la tabla viaja adentro de la ficha de un
 * partido, y solo si se pide con `liveStandings=1` — con `0`, que es lo que pide
 * la ficha, el campo `standings` llega en `0` y parece que el torneo no tuviera.
 *
 * Trae las once columnas del rugby: P, W, L, D, PF, PA, PD, bonus por tries,
 * bonus por perder por 7, bonus total y puntos.
 *
 * Lista vacia cuando la competicion no publica tabla, y eso NO es un error:
 * "Internationals" contesta `No live data for Internationals` porque es un cajon
 * de test matches, no una liga.
 */
export async function getRugbyPassStandings(
    matchId: number | string,
    homeTeamId: string,
    awayTeamId: string
): Promise<RugbyPassStandingRow[]> {
    const gameId = String(matchId).replace(/^rp-/i, '');
    const homeSlug = rugbyPassTeamSlugOf(homeTeamId);
    const awaySlug = rugbyPassTeamSlugOf(awayTeamId);

    return conMemoria(`standings:${gameId}`, TTL_TABLA_MS, () =>
        pedirStandings(gameId, homeSlug, awaySlug));
}

async function pedirStandings(
    gameId: string,
    homeSlug: string,
    awaySlug: string
): Promise<RugbyPassStandingRow[]> {
    const pedir = async (url: string) => {
        const payload = await rugbyPassJson(url, {
            method: 'POST',
            body: formBody({ action: 'live-poll-data', event: gameId, liveStandings: '1' }),
            headers: { 'Content-Type': 'application/x-www-form-urlencoded', Referer: url },
        });
        const standings = (payload as { standings?: unknown })?.standings;
        return typeof standings === 'string' ? parseRugbyPassStandings(standings) : [];
    };

    try {
        const tabla = await pedir(rugbyPassMatchUrl(gameId, homeSlug, awaySlug));
        if (tabla.length > 0) return tabla;
    } catch {
        // Sigue con el orden inverso: misma trampa del slug que en la ficha.
    }
    try {
        return await pedir(rugbyPassMatchUrl(gameId, awaySlug, homeSlug));
    } catch {
        return [];
    }
}
