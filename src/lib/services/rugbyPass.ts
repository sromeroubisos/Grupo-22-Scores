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
    rugbyPassCompetition,
    parseRugbyPassEvents,
    parseRugbyPassPlayerStatRanking,
    parseRugbyPassMatchDetail,
    parseRugbyPassFeed,
    parseRugbyPassPoll,
    unwrapRugbyPassBody,
    parseRugbyPassSeasonFixtures,
} from './rugbyPassParser.ts';
import {
    type RugbyPassPlayer,
    type RugbyPassPlayerProfile,
    type RugbyPassTeamEntry,
    type RugbyPassTournament,
    mergeRugbyPassPlayers,
    mergeRugbyPassTournaments,
    pageIdToCompetitionId,
    parseRugbyPassPlayerProfile,
    parseRugbyPassPlayers,
    parseRugbyPassTeams,
    parseRugbyPassTournamentCards,
    parseRugbyPassTournamentIds,
    parseRugbyPassStandings,
    type RugbyPassStandingRow,
} from './rugbyPassCatalog.ts';
import {
    buildRugbyPassTeamTable,
    mapRugbyPassStatsTeams,
    mapRugbyPassTeamLeaders,
    normalizeRugbyPassSeasonLabel,
    parseRugbyPassDefaultSeasonLabel,
    parseRugbyPassEmbeddedLeaders,
    parseRugbyPassStatsSeasons,
    type RugbyPassSeasonStats,
    type RugbyPassStatsTeam,
} from './rugbyPassSeasonStats.ts';

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

/**
 * LOS PARTIDOS DE UNA COMPETICION EN UNA TEMPORADA.
 *
 * El calendario general trae seis competiciones y nada mas —medido: de sus 1498
 * partidos, cero son del Seis Naciones o de las copas europeas—. Esas salen de
 * la pagina de su competicion, que ademas acepta temporada y por eso es la
 * unica via a la historia: el calendario solo tiene lo que viene.
 *
 * `pageSlug` es la PAGINA, no la competicion: `internationals` devuelve en una
 * sola respuesta el Seis Naciones, el Rugby Championship, la Pacific Nations
 * Cup, el Rugby Europe Championship y los test sueltos. El parser reparte cada
 * partido segun su propio `optaCompId`.
 */
export async function getRugbyPassSeasonFixtures(
    pageSlug: string,
    season: number
): Promise<RugbyPassMatch[]> {
    const url = `${RUGBYPASS_URL}/${pageSlug}/fixtures-results/`;
    const payload = await rugbyPassJson(url, {
        method: 'POST',
        body: formBody({
            action: 'filter-fixtures',
            season: String(season),
            // Sin filtro de equipo ni de competicion: se quiere la temporada
            // entera y el reparto por competicion lo hace el parser.
            team: '0',
            comp: '0',
        }),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Referer: url },
    });
    return parseRugbyPassSeasonFixtures(payload as never);
}

/**
 * Las temporadas que la pagina ofrece, de la mas nueva a la mas vieja.
 *
 * Van leidas de la pagina y no escritas a mano: el proveedor agrega la
 * siguiente sola, y una lista transcripta se queda vieja sin que nadie lo note
 * hasta que falta media temporada.
 */
export async function getRugbyPassSeasons(pageSlug: string): Promise<number[]> {
    const html = await rugbyPassFetch(`${RUGBYPASS_URL}/${pageSlug}/fixtures-results/`);
    const bloque = /seasons\s*:\s*(\[[\s\S]*?\])\s*,\s*[a-zA-Z]/.exec(html);
    if (!bloque) return [];
    try {
        const leido = JSON.parse(bloque[1]) as { season?: unknown }[];
        const anios = leido
            .map((x) => Number(x?.season))
            .filter((n) => Number.isFinite(n) && n > 2000);
        return [...new Set(anios)].sort((a, b) => b - a);
    } catch {
        return [];
    }
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
 * LA FICHA INDIVIDUAL de un jugador: `/players/<slug>/`.
 *
 * Una sola descarga de ~370 KB contra las SEIS de cientos de KB que costaba
 * armarla con el catalogo, y trae mas: nacionalidad, edad, altura, peso, club
 * actual, la trayectoria con slug y hasta diez temporadas de estadisticas.
 *
 * `null` cuando el jugador no existe (404) o cuando la pagina llega VACIA — un
 * retirado como `danny-grewcock` contesta 200 con el armazon y sin un dato, y
 * ahi el parser devuelve `null`. Es la misma trampa del proveedor que ya mordio
 * en la planilla y en la cronologia: no falla, MIENTE.
 *
 * Queda en memoria como los otros catalogos: la pantalla de un jugador se abre,
 * se vuelve y se reabre, y la ficha no cambia en el medio.
 */
export async function getRugbyPassPlayerProfile(
    slug: string
): Promise<RugbyPassPlayerProfile | null> {
    return conMemoria(`player:${slug}`, TTL_CATALOGO_MS, async () => {
        const url = `${RUGBYPASS_URL}/players/${slug}/`;
        let html: string;
        try {
            html = await rugbyPassFetch(url);
        } catch {
            // Un 404 es la respuesta correcta a un slug que no existe, y no un
            // error que haya que propagar: la ficha simplemente no esta.
            return null;
        }
        return parseRugbyPassPlayerProfile(html, slug);
    });
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

// ── Estadisticas de un TORNEO ───────────────────────────────────────────────

/**
 * Cuantas comparaciones de clubes salen a la vez. Cada una es una llamada de
 * 4 KB que tarda ~1 s: de a cuatro, las catorce del Top 14 entran en dos
 * tandas y no se le sienta encima al sitio.
 */
const TEAM_H2H_CONCURRENCY = 4;

/** Los rubros de una competicion se mueven cuando termina una fecha. */
const TTL_STATS_MS = 30 * 60 * 1000;

/**
 * LAS ESTADISTICAS DE UNA COMPETICION, para la pestana Estadisticas del torneo.
 *
 * `season` es el rotulo del proyecto (`2026-27`); el numero interno con el que
 * hay que pedirlas sale SIEMPRE de la lista que publica la pagina, porque no se
 * deriva del rotulo: el NPC llama `2027` a su temporada `2026`.
 *
 * Cuando la temporada pedida es la que la pagina ya trae dibujada, los lideres
 * salen del HTML y no se pide nada mas por ellos.
 *
 * Devuelve `null` si la competicion no esta habilitada o no tiene pagina de
 * estadisticas: "Internationals" es un cajon de test matches y su `/stats/` da
 * 404, asi que ahi la pestana no se dibuja en vez de mostrarse vacia.
 */
export async function getRugbyPassCompetitionStats(
    competitionId: number,
    season?: string | null
): Promise<RugbyPassSeasonStats | null> {
    const competicion = rugbyPassCompetition(competitionId);
    if (!competicion) return null;

    const etiqueta = normalizeRugbyPassSeasonLabel(String(season ?? ''));
    return conMemoria(
        `compstats:${competitionId}:${etiqueta}`,
        TTL_STATS_MS,
        () => pedirEstadisticasDeCompeticion(competicion.slug, etiqueta)
    );
}

async function pedirEstadisticasDeCompeticion(
    slug: string,
    etiqueta: string
): Promise<RugbyPassSeasonStats | null> {
    const url = `${RUGBYPASS_URL}/${slug}/stats/`;

    let html: string;
    try {
        html = await rugbyPassFetch(url);
    } catch (error) {
        // SOLO el 404 significa "esta competicion no publica estadisticas"
        // ("Internationals" es un cajon de test matches y no tiene pagina). Un
        // timeout o un 503 se propagan: taparlos con el mismo `null` le hace
        // decir a la pantalla que el dato no existe cuando el dato existe y no
        // se pudo traer, que es la mentira mas cara de diagnosticar.
        if (error instanceof Error && / 404 /.test(error.message)) return null;
        // Un `AbortError` llega como "This operation was aborted", que en la
        // pantalla no significa nada. Es el caso normal cuando RugbyPass se
        // pone lento, asi que se dice lo que pasa y que se puede reintentar.
        if (error instanceof Error && error.name === 'AbortError') {
            throw new Error('RugbyPass tardo demasiado en responder');
        }
        throw error;
    }

    const seasons = parseRugbyPassStatsSeasons(html);
    const porDefecto = parseRugbyPassDefaultSeasonLabel(html);
    // Una temporada que se pide y RugbyPass no ofrece NO se inventa: se cae a la
    // que la pagina abre, que es la unica que seguro tiene datos.
    const elegida =
        seasons.find((s) => s.label === etiqueta)
        ?? seasons.find((s) => s.label === porDefecto)
        ?? seasons[0]
        ?? null;

    const pedir = (campos: Record<string, string>) => rugbyPassJson(url, {
        method: 'POST',
        body: formBody(campos),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Referer: url },
    });

    // ── Lideres ─────────────────────────────────────────────────────────────
    //
    // OJO, ES UN BUG DE RUGBYPASS y esta medido en tres temporadas: al pedirle
    // `season-stats` de una temporada vieja, el bloque de EQUIPOS sale bien
    // (Top 14: Toulouse 147 tries en 2025-26, Racing 92 84 en 2022-23) pero el
    // de JUGADORES vuelve siempre el de la temporada EN CURSO — el mismo
    // "Rayan Rebbadj, 2 tries" para 2025-26, 2024-25 y 2022-23.
    //
    // Por eso los lideres de jugadores solo se emiten para la temporada que la
    // pagina abre. Mostrarlos en otra seria peor que no mostrarlos: un podio
    // con dos tries rotulado "2022-23" no se lee como un dato faltante, se lee
    // como un dato.
    let teamLeaders = [] as RugbyPassSeasonStats['teamLeaders'];
    let playerLeaders = [] as RugbyPassSeasonStats['playerLeaders'];
    if (!elegida || elegida.label === porDefecto) {
        ({ teamLeaders, playerLeaders } = parseRugbyPassEmbeddedLeaders(html));
    } else {
        try {
            const payload = await pedir({ action: 'season-stats', season: String(elegida.id) });
            teamLeaders = mapRugbyPassTeamLeaders((payload as { teamStats?: unknown })?.teamStats);
        } catch {
            // Sin lideres queda la tabla de equipos, que es la parte gruesa.
        }
    }

    // ── Tabla de equipos ────────────────────────────────────────────────────
    let equipos: RugbyPassStatsTeam[] = [];
    if (elegida) {
        try {
            const payload = await pedir({ action: 'season-h2h-stats', season: String(elegida.id) });
            equipos = mapRugbyPassStatsTeams(payload);
        } catch {
            // Idem: la pestana vive con los lideres solos.
        }
    }

    // Lista vacia es el caso normal de una temporada recien empezada: RugbyPass
    // no llena el comparador hasta que hay varias fechas jugadas.
    const parejas: { left: RugbyPassStatsTeam; right: RugbyPassStatsTeam; payload: unknown }[] = [];
    if (elegida && equipos.length > 0) {
        const aPedir: { left: RugbyPassStatsTeam; right: RugbyPassStatsTeam }[] = [];
        for (let i = 0; i < equipos.length; i += 2) {
            // Un plantel impar deja al ultimo sin par: se lo compara consigo
            // mismo, que devuelve su planilla en los dos lados.
            aPedir.push({ left: equipos[i], right: equipos[i + 1] ?? equipos[i] });
        }
        for (let i = 0; i < aPedir.length; i += TEAM_H2H_CONCURRENCY) {
            const tanda = aPedir.slice(i, i + TEAM_H2H_CONCURRENCY);
            const resultados = await Promise.all(tanda.map(async ({ left, right }) => {
                try {
                    return {
                        left,
                        right,
                        payload: await pedir({
                            action: 'team-h2h-stats',
                            season: String(elegida.id),
                            leftTeam: left.oid,
                            rightTeam: right.oid,
                        }),
                    };
                } catch {
                    // Un par que falla se lleva dos clubes, no la tabla entera.
                    return null;
                }
            }));
            for (const r of resultados) if (r) parejas.push(r);
        }
    }

    const { columns, rows } = buildRugbyPassTeamTable(parejas);

    return {
        seasons,
        season: elegida,
        defaultSeason: porDefecto,
        teamLeaders,
        playerLeaders,
        teamColumns: columns,
        teamRows: rows,
    };
}
