/**
 * Lectura del fixture de RugbyPass (rugbypass.com).
 *
 * El sitio publico es una app Vue que se alimenta de un endpoint interno sin
 * credenciales. No hay documentacion; esto es lo que contesta de verdad:
 *
 *   POST /fixtures  loadaction=load-init-fixtures-data  -> todo el calendario
 *   POST /fixtures  action=poll-vue-games&games=a,b,c   -> estado y marcador
 *   GET  /live/<slug>/?g=<id>                           -> los eventos del partido
 *
 * El cuerpo viene envuelto en `<html><body><p>…</p></body></html>` aunque sea
 * JSON, y adentro los `&` de las URLs vienen como `&amp;`. Desenvolver eso es
 * tarea de este modulo (`unwrapRugbyPassBody`).
 *
 * ── LA HORA ─────────────────────────────────────────────────────────────────
 * RugbyPass sirve `t`, `tsm`, `st` y `k` en la ZONA DEL VISITANTE, que resuelve
 * por geo-IP. Medido cambiando la zona de sesion y volviendo a pedir el mismo
 * feed: el mismo partido pasa de `4:10am` (AR) a `7:10pm` (Auckland) a
 * `7:10am` (UTC), y el dia `k` se corre con el. `gmt` es el unico campo que no
 * se mueve. Por eso aca se lee `gmt` y se descarta el resto: si el cron corre
 * en Vercel el geo es otro y esos campos cambiarian solos.
 *
 * ── LA HORA QUE NO EXISTE ───────────────────────────────────────────────────
 * 444 de 2555 partidos (17,4%) traen `gmt` a medianoche UTC exacta. No es un
 * horario: es "sabemos el dia, no la hora". RugbyPass igual lo convierte a la
 * zona del visitante, asi que desde Argentina medianoche del domingo se
 * muestra como las 21:00 del SABADO — el dia equivocado.
 *
 * Se detecta con `isKickoffUnknown` y NO se publica la hora. El placeholder
 * aparece casi solo en partidos futuros (Top 14 83%, Pro D2 89%) y se completa
 * solo cuando se acerca la fecha; en partidos ya jugados es 0%. O sea que es
 * un fixture sin confirmar, no un dato roto.
 *
 * Este modulo es PURO: entra JSON o HTML, sale dato. Sin red, sin DOM. Es lo
 * que se puede probar con `node --test` (`rugbyPassParser.test.ts`).
 */

import type { MatchStatus } from '@/types/match';

export const RUGBYPASS_PROVIDER = 'rugbypass';
export const RUGBYPASS_URL = 'https://www.rugbypass.com';
export const RUGBYPASS_CDN = 'https://eu-cdn.rugbypass.com/';

export const RUGBYPASS_MATCH_ID_PREFIX = 'rp-';
export const RUGBYPASS_TOURNAMENT_ID_PREFIX = 'rp-comp-';
export const RUGBYPASS_TEAM_ID_PREFIX = 'rp-team-';

/** Un partido sin hora confirmada llega con esta marca exacta y no con otra. */
export const RUGBYPASS_UNKNOWN_KICKOFF_SUFFIX = 'T00:00:00+0000';

// ── Catalogo de competiciones ───────────────────────────────────────────────

export interface RugbyPassCompetition {
    /** `c` del partido y `id` del bloque de competicion. Es la clave estable. */
    id: number;
    /** El slug de la URL. Sobrevive a los rebrandeos: "Hilux NPC" sigue en `bunnings-npc`. */
    slug: string;
    name: string;
    /** Va a `country_name` de la cache. Un torneo multipais es 'Internacional'. */
    country: string;
    /**
     * Mes (1-12) en el que ARRANCA una temporada, o `null` si la competicion no
     * tiene temporadas.
     *
     * Es lo unico que hace falta para partir un calendario en temporadas, y es
     * determinista: no depende de cuanto del fixture este publicado. Cortar por
     * HUECOS del calendario NO sirve —una final publicada suelta parte el ano en
     * tres— y cortar por ano calendario mezcla las dos mitades de una liga del
     * norte.
     *
     * `1` es ano calendario y la temporada se rotula con un ano solo ("2025");
     * cualquier otro mes cruza el ano y se rotula con dos ("2025-26").
     */
    seasonStartMonth: number | null;
}

/**
 * Los torneos que este conector trae. Se arranca con seis a proposito: son los
 * que hoy dependen de FlashScore, donde el rugby esta mutilado (`matches/list`
 * no llena `match_status`, asi que un partido terminado llega como programado).
 *
 * Sumar uno es agregarlo aca; el resto del conector no se toca.
 */
export const RUGBYPASS_COMPETITIONS: readonly RugbyPassCompetition[] = [
    { id: 208, slug: 'bunnings-npc', name: 'Hilux NPC', country: 'Nueva Zelanda', seasonStartMonth: 1 },
    { id: 203, slug: 'top-14', name: 'Top 14', country: 'Francia', seasonStartMonth: 7 },
    { id: 211, slug: 'pro-d2', name: 'Pro D2', country: 'Francia', seasonStartMonth: 7 },
    { id: 201, slug: 'premiership', name: 'Gallagher Premiership', country: 'Inglaterra', seasonStartMonth: 7 },
    { id: 204, slug: 'united-rugby-championship', name: 'United Rugby Championship', country: 'Internacional', seasonStartMonth: 7 },
    { id: 3, slug: 'internationals', name: 'Internationals', country: 'Internacional', seasonStartMonth: null },
] as const;

/**
 * Competiciones que RugbyPass publica pero NO hay que importar, con el motivo.
 *
 * El Americas Rugby Championship es dato abandonado y esta medido: de sus seis
 * partidos, los cuatro ya jugados figuran `0-0` con el rotulo "FT" (Argentina XV
 * le gano 58-11 a Paraguay), los seis tienen la hora a medianoche y ninguno
 * trae eventos. Importarlo publica cuatro empates falsos en la tabla.
 *
 * El criterio con el que se detecto sirve para el proximo: en un torneo
 * mantenido, el porcentaje de partidos PASADOS con resultado es ~100% (los 35
 * restantes dan entre 90 y 100). El ARC da 0%.
 */
export const RUGBYPASS_EXCLUDED: readonly { id: number; name: string; reason: string }[] = [
    {
        id: 266,
        name: 'Americas Rugby Championship',
        reason: 'dato abandonado: 0% de los partidos jugados tiene resultado, seis 0-0 falsos rotulados FT',
    },
] as const;

const COMPETITION_BY_ID = new Map(RUGBYPASS_COMPETITIONS.map((c) => [c.id, c]));

export function rugbyPassCompetition(id: number): RugbyPassCompetition | null {
    return COMPETITION_BY_ID.get(id) ?? null;
}

export function isRugbyPassCompetitionEnabled(id: number): boolean {
    return COMPETITION_BY_ID.has(id);
}

// ── Temporadas ──────────────────────────────────────────────────────────────

/**
 * A que temporada pertenece un partido. `null` si la competicion no tiene
 * temporadas (Internationals) o si la fecha no se entiende.
 *
 * El corte es el MES DE INICIO declarado por la competicion, y esta medido
 * contra el feed (1498 partidos, 2026-09-06):
 *
 *   Top 14 / Pro D2 / Premiership / URC  →  sep..jun, y jul vacio los cuatro
 *   Hilux NPC                            →  jul..oct dentro del mismo ano
 *
 * Por eso el norte corta en JULIO —el unico mes sin un solo partido, con junio
 * (las finales) cayendo del lado correcto— y el NPC corta en enero. Sin este
 * corte, el Top 14 muestra 222 partidos de dos temporadas juntos y la pantalla
 * abre con resultados de la pasada.
 */
export function rugbyPassSeasonOf(competitionId: number, iso: string): string | null {
    const competicion = rugbyPassCompetition(competitionId);
    const inicio = competicion?.seasonStartMonth ?? null;
    if (inicio === null) return null;

    const fecha = new Date(iso);
    if (Number.isNaN(fecha.getTime())) return null;

    const anio = fecha.getUTCFullYear();
    const mes = fecha.getUTCMonth() + 1;
    // Un partido de un mes ANTERIOR al de inicio todavia pertenece a la
    // temporada que arranco el ano pasado: junio de 2026 es la final del
    // 2025-26, no el arranque del 2026-27.
    const anioInicio = mes >= inicio ? anio : anio - 1;

    if (inicio === 1) return String(anioInicio);
    return `${anioInicio}-${String((anioInicio + 1) % 100).padStart(2, '0')}`;
}

/**
 * Las temporadas presentes en un conjunto de fechas, de la mas nueva a la mas
 * vieja. Lista vacia si la competicion no tiene temporadas.
 */
export function rugbyPassSeasonsIn(
    competitionId: number,
    isoDates: readonly string[]
): string[] {
    const vistas = new Set<string>();
    for (const iso of isoDates) {
        const temporada = rugbyPassSeasonOf(competitionId, iso);
        if (temporada) vistas.add(temporada);
    }
    // Orden lexicografico descendente: '2026-27' > '2025-26' y '2026' > '2025'.
    // Los dos rotulos empiezan por el ano de inicio, asi que ordena bien sin
    // tener que parsearlos.
    return [...vistas].sort((a, b) => b.localeCompare(a));
}

/**
 * Cual mostrar cuando nadie eligio ninguna: la que corre HOY si tiene partidos,
 * y si no la mas reciente que los tenga.
 *
 * Que la de hoy pueda no estar es el caso normal de un torneo entre temporadas
 * —en julio el Top 14 no tiene un solo partido— y ahi lo que se quiere ver es
 * la que viene, que es la mas nueva del calendario publicado.
 */
export function rugbyPassDefaultSeason(
    competitionId: number,
    seasons: readonly string[],
    nowIso: string
): string | null {
    if (seasons.length === 0) return null;
    const hoy = rugbyPassSeasonOf(competitionId, nowIso);
    if (hoy && seasons.includes(hoy)) return hoy;
    return seasons[0] ?? null;
}

// ── Ids ─────────────────────────────────────────────────────────────────────

export function rugbyPassMatchId(gameId: number | string): string {
    return `${RUGBYPASS_MATCH_ID_PREFIX}${gameId}`;
}

export function isRugbyPassMatchId(value: unknown): boolean {
    return String(value ?? '').toLowerCase().startsWith(RUGBYPASS_MATCH_ID_PREFIX);
}

export function rugbyPassTournamentId(compId: number): string {
    return `${RUGBYPASS_TOURNAMENT_ID_PREFIX}${compId}`;
}

/**
 * El id del equipo sale del slug (`u`) y no del numero del escudo: el slug es
 * el que aparece en la URL publica del club y el que se puede volver a pedir.
 */
export function rugbyPassTeamId(slug: string): string {
    return `${RUGBYPASS_TEAM_ID_PREFIX}${slug}`;
}

/**
 * La URL de la ficha. El slug NO es decorativo: `/live/?g=<id>` sin slug
 * responde 200 pero SIN los eventos, y un slug inventado da 404. Se arma con
 * los slugs de los dos equipos, que es de donde sale el del proveedor.
 *
 * El orden puede venir invertido (RugbyPass no siempre pone al local primero),
 * asi que quien la use tiene que estar listo para probar las dos formas —
 * `getRugbyPassEventsFor` lo hace.
 */
export function rugbyPassMatchUrl(gameId: number | string, homeSlug: string, awaySlug: string): string {
    return `${RUGBYPASS_URL}/live/${homeSlug}-vs-${awaySlug}/?g=${gameId}`;
}

/** De `rp-team-auckland` a `auckland`. */
export function rugbyPassTeamSlugOf(teamId: string): string {
    return teamId.startsWith(RUGBYPASS_TEAM_ID_PREFIX)
        ? teamId.slice(RUGBYPASS_TEAM_ID_PREFIX.length)
        : teamId;
}

// ── Envoltorio ──────────────────────────────────────────────────────────────

/**
 * El endpoint contesta JSON pero con `Content-Type` de HTML y envuelto en
 * `<html><body><p>`. Sacarlo con un parser de HTML seria caro para 2 MB.
 */
export function unwrapRugbyPassBody(body: string): string {
    return body
        .replace(/^\s*<html><body><p>/i, '')
        .replace(/<\/p><\/body><\/html>\s*$/i, '')
        .trim();
}

/** RugbyPass escribe `&` como `&amp;` DENTRO de los strings del JSON. */
export function decodeRugbyPassEntities(value: string): string {
    return value
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#0?39;/g, "'")
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>');
}

// ── Estado y hora ───────────────────────────────────────────────────────────

/**
 * `gmt` a medianoche UTC exacta es "hora desconocida", no las 00:00.
 *
 * Es el valor mas frecuente de todo el feed (444 casos contra 165 del segundo),
 * lo que ya lo delata: el Top 14 y la Pro D2 son franceses y medianoche UTC
 * serian las 02:00 en Francia.
 */
export function isKickoffUnknown(gmt: string): boolean {
    return gmt.endsWith(RUGBYPASS_UNKNOWN_KICKOFF_SUFFIX);
}

/**
 * `s === 1` es en vivo y lo confirma el poll, que devuelve el mismo numero.
 *
 * Un partido pasado que NO dice `Result` se queda en 'scheduled' a proposito:
 * es exactamente la forma del dato abandonado del ARC, que trae `st: "FT"` con
 * el marcador en cero. Inventarle un final ahi publica un empate que no existio.
 */
export function classifyRugbyPassStatus(game: { s?: unknown; sts?: unknown }): MatchStatus {
    if (Number(game.s) === 1) return 'live';
    if (String(game.sts) === 'Result') return 'final';
    return 'scheduled';
}

// ── Partidos ────────────────────────────────────────────────────────────────

export interface RugbyPassTeam {
    id: string;
    slug: string;
    name: string;
    logo: string;
    score: number | null;
}

export interface RugbyPassMatch {
    id: string;
    gameId: number;
    competitionId: number;
    competitionName: string;
    country: string;
    tournamentId: string;
    /** Instante real en UTC. `null` cuando la hora no se conoce todavia. */
    kickoff: string | null;
    /** El dia UTC, que siempre se conoce aunque no se conozca la hora. */
    dayUtc: string;
    kickoffKnown: boolean;
    status: MatchStatus;
    home: RugbyPassTeam;
    away: RugbyPassTeam;
    venue: string | null;
    roundLabel: string | null;
    matchUrl: string;
}

interface RawTeam { n?: unknown; s?: unknown; u?: unknown; un?: unknown; l?: unknown }
interface RawGame {
    id?: unknown; gmt?: unknown; v?: unknown; r?: unknown; l?: unknown;
    s?: unknown; sts?: unknown; c?: unknown; h?: RawTeam; a?: RawTeam;
}

function parseTeam(raw: RawTeam | undefined): RugbyPassTeam | null {
    const slug = String(raw?.u ?? raw?.un ?? '').trim();
    const name = decodeRugbyPassEntities(String(raw?.n ?? '').trim());
    if (!slug || !name) return null;
    const logoPath = decodeRugbyPassEntities(String(raw?.l ?? '').trim());
    const score = typeof raw?.s === 'number' ? raw.s : null;
    return {
        id: rugbyPassTeamId(slug),
        slug,
        name,
        logo: logoPath ? `${RUGBYPASS_CDN}${logoPath.replace(/^\/+/, '')}` : '',
        score,
    };
}

/**
 * Un partido del feed a nuestro modelo. Devuelve `null` cuando la fila no
 * alcanza para publicarla (sin equipos, sin fecha o de una competicion que no
 * esta habilitada), en vez de dejar pasar una fila a medias.
 */
export function parseRugbyPassGame(raw: RawGame): RugbyPassMatch | null {
    const gameId = Number(raw.id);
    const gmt = String(raw.gmt ?? '');
    const competitionId = Number(raw.c);
    if (!Number.isFinite(gameId) || !gmt) return null;

    const competition = rugbyPassCompetition(competitionId);
    if (!competition) return null;

    const home = parseTeam(raw.h);
    const away = parseTeam(raw.a);
    if (!home || !away) return null;

    const parsed = new Date(gmt.replace(/([+-]\d{2})(\d{2})$/, '$1:$2'));
    if (Number.isNaN(parsed.getTime())) return null;

    const kickoffKnown = !isKickoffUnknown(gmt);
    const venue = decodeRugbyPassEntities(String(raw.v ?? '').trim()) || null;
    const round = decodeRugbyPassEntities(String(raw.r ?? '').trim()) || null;

    return {
        id: rugbyPassMatchId(gameId),
        gameId,
        competitionId,
        competitionName: competition.name,
        country: competition.country,
        tournamentId: rugbyPassTournamentId(competitionId),
        kickoff: kickoffKnown ? parsed.toISOString() : null,
        dayUtc: parsed.toISOString().slice(0, 10),
        kickoffKnown,
        status: classifyRugbyPassStatus(raw),
        home,
        away,
        venue,
        roundLabel: round,
        matchUrl: decodeRugbyPassEntities(String(raw.l ?? '')) ||
            `${RUGBYPASS_URL}/live/?g=${gameId}`,
    };
}

interface RawFeed { weeks?: unknown }

/**
 * El calendario entero. La forma es weeks[].d[].g.c[].g[]: semanas, dias,
 * competiciones del dia y partidos de la competicion. Un dia sin partidos trae
 * `g: 0` en vez de un objeto vacio, asi que hay que descartarlo por valor.
 */
export function parseRugbyPassFeed(feed: RawFeed): RugbyPassMatch[] {
    const salida: RugbyPassMatch[] = [];
    const vistos = new Set<string>();

    const weeks = Array.isArray(feed?.weeks) ? feed.weeks : [];
    for (const week of weeks) {
        const dias = Array.isArray((week as { d?: unknown })?.d) ? (week as { d: unknown[] }).d : [];
        for (const dia of dias) {
            const grupo = (dia as { g?: unknown })?.g;
            if (!grupo || typeof grupo !== 'object') continue;
            const comps = Array.isArray((grupo as { c?: unknown }).c) ? (grupo as { c: unknown[] }).c : [];
            for (const comp of comps) {
                const juegos = Array.isArray((comp as { g?: unknown })?.g) ? (comp as { g: unknown[] }).g : [];
                for (const juego of juegos) {
                    const partido = parseRugbyPassGame(juego as RawGame);
                    // El mismo partido aparece una sola vez en el feed, pero la
                    // estructura por semana/dia permite repetirlo: plegamos por id.
                    if (partido && !vistos.has(partido.id)) {
                        vistos.add(partido.id);
                        salida.push(partido);
                    }
                }
            }
        }
    }
    return salida;
}

// ── Poll en vivo ────────────────────────────────────────────────────────────

export interface RugbyPassPollResult {
    id: string;
    gameId: number;
    status: MatchStatus;
    home: number | null;
    away: number | null;
}

interface RawPoll { content?: { games?: Record<string, unknown> } }

/**
 * El poll acepta muchos ids de una y contesta chico: 318 bytes para cuatro
 * partidos. Por eso el sondeo en vivo va en una sola llamada por tanda y no
 * una por partido.
 *
 * Solo distingue en-vivo de no-en-vivo (`status` 1 o 0), asi que no puede
 * decidir por si mismo que un partido termino: eso lo cierra el fixture.
 */
export function parseRugbyPassPoll(payload: RawPoll): RugbyPassPollResult[] {
    const games = payload?.content?.games;
    if (!games || typeof games !== 'object') return [];

    const salida: RugbyPassPollResult[] = [];
    for (const [clave, valor] of Object.entries(games)) {
        const gameId = Number(clave);
        if (!Number.isFinite(gameId)) continue;
        const g = valor as { status?: unknown; homeScore?: unknown; awayScore?: unknown };
        salida.push({
            id: rugbyPassMatchId(gameId),
            gameId,
            status: Number(g?.status) === 1 ? 'live' : 'scheduled',
            home: typeof g?.homeScore === 'number' ? g.homeScore : null,
            away: typeof g?.awayScore === 'number' ? g.awayScore : null,
        });
    }
    return salida;
}

// ── Eventos ─────────────────────────────────────────────────────────────────

/**
 * El icono de RugbyPass al tipo del catalogo de `matchEventCatalog.ts`.
 *
 * OJO con las tarjetas: en el catalogo el rugby usa `card_yellow` / `card_red`
 * y el FUTBOL usa `yellow_card` / `red_card`. Estan al reves entre si. Mapear
 * al nombre del futbol no rompe el insert pero deja los contadores por jugador
 * en cero, porque se cuentan por nombre de tipo.
 *
 * `penalty_try` no tiene icono propio en RugbyPass — no aparecio ninguno en las
 * 97 muestras — asi que un try penal probablemente llegue como `try` y sume 5
 * en vez de 7. Queda pendiente confirmarlo con un partido que tenga uno.
 */
const EVENT_TYPE_BY_ICON: Readonly<Record<string, string>> = {
    try: 'try',
    con: 'conversion',
    pg: 'penalty_goal',
    dg: 'drop_goal',
    yc: 'card_yellow',
    rc: 'card_red',
};

/** Los rotulos de fase que RugbyPass intercala entre los eventos. */
const CLOCK_TYPE_BY_LABEL: Readonly<Record<string, string>> = {
    'start': 'match_start',
    'half time': 'match_half',
    'full time': 'match_end',
};

export function mapRugbyPassEventType(icon: string): string | null {
    return EVENT_TYPE_BY_ICON[icon.trim().toLowerCase()] ?? null;
}

export interface RugbyPassEvent {
    /** Tipo del catalogo del proyecto, no el icono de RugbyPass. */
    type: string;
    /** 'home' | 'away' | null (los rotulos de fase no son de nadie). */
    side: 'home' | 'away' | null;
    minute: number | null;
    playerName: string | null;
    playerSlug: string | null;
    /** Marcador acumulado despues del evento, tal como lo publica la ficha. */
    homeScore: number | null;
    awayScore: number | null;
}

const RE_INTERVALO = /<div class="interval">\s*([^<]+?)\s*<\/div>/i;
const RE_ICONO = /<div class="icon-image ([a-z0-9-]+)"/i;
const RE_JUGADOR = /\/players\/([a-z0-9-]+)\/"[^>]*>\s*([^<]+?)\s*<\/a>/i;
const RE_MINUTO = /<div class="time">\s*(\d+)'/i;
const RE_MARCADOR = /<div class="label">\s*(\d+)\s*-\s*(\d+)\s*<\/div>/i;
/** El texto crudo del `.name`, que en el try penal NO viene envuelto en un `<a>`. */
const RE_NOMBRE_CRUDO = /<div class="name">\s*([^<]+?)\s*<\/div>/i;

/**
 * Los eventos de la ficha (`/live/<slug>/?g=<id>`), que vienen renderizados en
 * el HTML y no por API.
 *
 * Se parsea con expresiones y no con un DOM porque el modulo tiene que seguir
 * siendo puro y correr bajo `node --test` sin navegador.
 *
 * El lado NO se puede sacar por posicion: el bloque `home` escribe el marcador
 * antes que el minuto y el `away` al reves. Se decide por cual de los dos
 * `.side` trae el nombre del jugador.
 */
export function parseRugbyPassEvents(html: string): RugbyPassEvent[] {
    const salida: RugbyPassEvent[] = [];

    const cortes: number[] = [];
    const reBloque = /<div class="key-event">/g;
    for (let m = reBloque.exec(html); m; m = reBloque.exec(html)) cortes.push(m.index);

    for (let i = 0; i < cortes.length; i++) {
        const bloque = html.slice(cortes[i], cortes[i + 1] ?? html.length);

        const intervalo = bloque.match(RE_INTERVALO);
        if (intervalo) {
            const tipo = CLOCK_TYPE_BY_LABEL[intervalo[1].trim().toLowerCase()];
            if (tipo) {
                salida.push({
                    type: tipo, side: null, minute: null,
                    playerName: null, playerSlug: null, homeScore: null, awayScore: null,
                });
            }
            continue;
        }

        const icono = bloque.match(RE_ICONO);
        const tipo = icono ? mapRugbyPassEventType(icono[1]) : null;
        if (!tipo) continue;

        const iSide = bloque.indexOf('<div class="side home"');
        const iIcon = bloque.indexOf('<div class="icon"');
        const bloqueHome = iSide >= 0 && iIcon > iSide ? bloque.slice(iSide, iIcon) : '';
        const ladoEsLocal = /class="name"/.test(bloqueHome);
        const bloqueLado = ladoEsLocal ? bloqueHome : bloque.slice(iIcon >= 0 ? iIcon : 0);

        const jugador = bloqueLado.match(RE_JUGADOR);
        const minuto = bloqueLado.match(RE_MINUTO);
        const marcador = bloqueLado.match(RE_MARCADOR);

        // EL TRY PENAL. RugbyPass no le da icono propio: llega con el mismo
        // `try` y el `.name` dice "Penalty Try" en vez de un jugador, sin `<a>`
        // porque no hay ficha a la que apuntar. Medido en Argentina-Australia
        // del 5/9/2026: el arbitro lo cobra a los 69' y el partido termina
        // 28-28, pero contarlo como try comun daba 26 al visitante — vale 7 y
        // no lleva conversion.
        const nombreCrudo = jugador ? '' : (bloqueLado.match(RE_NOMBRE_CRUDO)?.[1] ?? '').trim();
        const esTryPenal = tipo === 'try' && /^penalty\s+try$/i.test(nombreCrudo);

        salida.push({
            type: esTryPenal ? 'penalty_try' : tipo,
            side: ladoEsLocal ? 'home' : 'away',
            minute: minuto ? Number(minuto[1]) : null,
            playerName: jugador ? decodeRugbyPassEntities(jugador[2]) : null,
            playerSlug: jugador ? jugador[1] : null,
            homeScore: marcador ? Number(marcador[1]) : null,
            awayScore: marcador ? Number(marcador[2]) : null,
        });
    }

    // La ficha los lista del final para atras; la linea de tiempo los quiere
    // en el orden en que pasaron.
    return salida.reverse();
}

// ── La ficha completa: live-poll-data ───────────────────────────────────────

/**
 * `POST /live/<slug>/?g=<id>` con `action=live-poll-data` devuelve TODO lo que
 * muestra el match centre en una sola llamada (~126 KB): la cronologia, las
 * estadisticas del partido, las de cada jugador, la posesion y el territorio.
 *
 * Es MUCHO mejor que raspar la pagina: la pagina trae la cronologia y nada mas.
 * Los bloques vienen como HTML ya renderizado, no como datos, asi que hay que
 * leerlos con expresiones — pero son estables y estan rotulados.
 *
 * OJO con el marcador: `score` de aca puede diferir del que trae el fixture
 * (se vio 57-42 contra 57-35 en el mismo partido). El de la ficha es el que
 * acompana a las estadisticas, asi que es el que se usa PARA la ficha; el
 * listado de partidos sigue con el del fixture.
 */
export interface RugbyPassMatchStat {
    label: string;
    home: string;
    away: string;
}

export interface RugbyPassPlayerStat {
    /** Categoria: carries, cleanBreaks, completedTackles, … */
    category: string;
    rank: number;
    playerName: string;
    teamName: string;
    total: number;
}

export interface RugbyPassMatchDetail {
    status: string | null;
    minutes: string | null;
    homeScore: number | null;
    awayScore: number | null;
    events: RugbyPassEvent[];
    stats: RugbyPassMatchStat[];
    playerStats: RugbyPassPlayerStat[];
    possession: { home: number | null; away: number | null };
    territory: { home: number | null; away: number | null };
    /** Los 23 de cada lado. Vacio cuando la competicion no publica formaciones. */
    lineups: { home: RugbyPassLineupPlayer[]; away: RugbyPassLineupPlayer[] };
}

/** Como se lee cada rotulo del proveedor. Lo que no este acá pasa tal cual. */
const STAT_LABEL_ES: Readonly<Record<string, string>> = {
    'Tries': 'Tries',
    'Conversions': 'Conversiones',
    'Penalty Goals': 'Penales',
    'Drop Goals': 'Drops',
    'Carries': 'Avances',
    'Line Breaks': 'Quiebres',
    'Turnovers Lost': 'Pelotas perdidas',
    'Turnovers Won': 'Pelotas recuperadas',
    // Los seis grupos que `statsSummary` no trae y que hasta ahora se tiraban.
    'Scrums': 'Scrums',
    'Scrum Win %': 'Scrums ganados %',
    'Lineout': 'Lines',
    'Lineout Win %': 'Lines ganados %',
    'Restarts Received': 'Salidas recibidas',
    'Restarts Received Win %': 'Salidas recibidas %',
    'Passes': 'Pases',
    'Ball Carries': 'Avances',
    'Post Contact Metres': 'Metros post contacto',
    'Penalties Conceded': 'Penales cometidos',
    'Yellow Cards': 'Amarillas',
    'Red Cards': 'Rojas',
    'Tackles Made': 'Tackles',
    'Tackles Missed': 'Tackles errados',
    'Tackle Completion %': 'Tackles completados %',
    'Total Kicks': 'Patadas',
    'Kick To Pass Ratio': 'Patada/pase',
};

/**
 * Los siete bloques de estadisticas de `live-poll-data`, en el orden en que la
 * ficha los muestra. `statsSummary` es el unico que se leia: los otros seis
 * traen VEINTE estadisticas mas (scrums, lines, tackles, patadas, tarjetas) que
 * se estaban tirando en cada partido.
 */
export const RUGBYPASS_STAT_GROUPS = [
    'statsSummary', 'setPlays', 'attack', 'defence', 'kicks', 'turnovers', 'penalties',
] as const;

/**
 * LOS RUBROS POR JUGADOR DE LA FICHA.
 *
 * El `live-poll-data` trae seis rubros y SOLO al podio de cada uno: del cuarto
 * para abajo no dice nada. La pestana `/stats/` de la ficha usa otra accion
 * —`filter-players-stats`— que devuelve el ranking COMPLETO, y con veintiun
 * rubros en vez de seis. Es una llamada por rubro, asi que sale mas cara, pero
 * es la unica via a la planilla entera: 46 jugadores con su numero de verdad.
 *
 * `id` es el valor que espera el parametro `stat`. `metricId` es la columna de
 * la tabla de jugadores: los que ya tienen una (tackles, tries, tarjetas) la
 * ocupan en vez de estrenar una segunda al lado con otro nombre.
 *
 * `total_tackles` es la suma de `completed_tackles` y `missed_tackles` —medido
 * sobre los 45 jugadores con tackles del partido, cero desajustes—, asi que se
 * lee "Tackles intentados" y no "Tackles" a secas.
 */
export interface RugbyPassPlayerStatKind {
    id: string;
    metricId: string;
    label: string;
}

export const RUGBYPASS_PLAYER_STAT_KINDS: readonly RugbyPassPlayerStatKind[] = [
    { id: 'carries', metricId: 'carries', label: 'Avances' },
    { id: 'carries_metres', metricId: 'carriesMetres', label: 'Metros ganados' },
    { id: 'carries_per_minute', metricId: 'carriesPerMinute', label: 'Avances por minuto' },
    { id: 'clean_breaks', metricId: 'cleanBreaks', label: 'Quiebres' },
    { id: 'offloads', metricId: 'offloads', label: 'Descargas' },
    { id: 'defenders_beaten', metricId: 'defendersBeaten', label: 'Rivales superados' },
    { id: 'passes', metricId: 'passes', label: 'Pases' },
    { id: 'total_kicks', metricId: 'kicks', label: 'Patadas' },
    { id: 'tries', metricId: 'tries', label: 'Tries' },
    { id: 'try_assists', metricId: 'tryAssists', label: 'Asistencias de try' },
    { id: 'total_tackles', metricId: 'totalTackles', label: 'Tackles intentados' },
    { id: 'completed_tackles', metricId: 'tackles', label: 'Tackles' },
    { id: 'missed_tackles', metricId: 'missedTackles', label: 'Tackles errados' },
    { id: 'dominant_tackles', metricId: 'dominantTackles', label: 'Tackles dominantes' },
    { id: 'tackles_per_minute', metricId: 'tacklesPerMinute', label: 'Tackles por minuto' },
    { id: 'turnovers_won', metricId: 'turnoversWon', label: 'Pelotas recuperadas' },
    { id: 'turnovers_conceded', metricId: 'turnoversConceded', label: 'Pelotas perdidas' },
    { id: 'ruck_turnovers', metricId: 'ruckTurnovers', label: 'Robos en el ruck' },
    { id: 'lineouts_won', metricId: 'lineoutsWon', label: 'Lines ganados' },
    { id: 'penalties_conceded', metricId: 'penaltiesConceded', label: 'Penales cometidos' },
    { id: 'yellow_cards', metricId: 'yellowCards', label: 'Amarillas' },
    { id: 'red_cards', metricId: 'redCards', label: 'Rojas' },
];

/**
 * Un ranking de `filter-players-stats`. Mismo markup que el podio del
 * `live-poll-data` —`.player` con numero, escudo, nombre y total—, pero con
 * todos los jugadores que registraron algo en ese rubro; el que no registro
 * nada NO figura, y eso es un dato: no es lo mismo que un cero.
 */
export function parseRugbyPassPlayerStatRanking(
    category: string,
    html: string
): RugbyPassPlayerStat[] {
    const salida: RugbyPassPlayerStat[] = [];
    for (const trozo of String(html ?? '').split('<div class="player')) {
        const nombre = trozo.match(RE_NAME);
        const total = trozo.match(RE_TOTAL);
        if (!nombre || !total) continue;
        salida.push({
            category,
            rank: Number(trozo.match(RE_NUM)?.[1] ?? 0),
            playerName: decodeRugbyPassEntities(nombre[1]),
            teamName: decodeRugbyPassEntities(trozo.match(RE_ALT)?.[1] ?? ''),
            total: Number(total[1]),
        });
    }
    return salida;
}

export const PLAYER_STAT_LABEL_ES: Readonly<Record<string, string>> = {
    carries: 'Avances',
    cleanBreaks: 'Quiebres',
    completedTackles: 'Tackles',
    turnoversConceded: 'Pelotas perdidas',
    turnoversWon: 'Pelotas recuperadas',
    dominantTackles: 'Tackles dominantes',
};

/**
 * Como viene HOY cada fila: `.stat` con local, rotulo (`.mid`) y visitante.
 *
 * OJO: hasta ahora se buscaba `.home`/`.label`/`.away`, que RugbyPass NO emite,
 * asi que el regex principal no acertaba NUNCA y todo salia por el respaldo de
 * texto plano. El respaldo lee el rotulo con `[A-Za-z .'-]`, que no admite `%`,
 * y por eso se perdian justo "Scrum Win %", "Tackle Completion %" y "Kick To
 * Pass Ratio". Medido: 3 de 6 en setPlays, 2 de 3 en defence, 1 de 2 en kicks.
 */
const RE_STAT_FILA = /<div class="stat">\s*(?:<div class="line[^"]*"><\/div>\s*)?<div>\s*([^<]*?)\s*<\/div>\s*<div class="mid[^"]*">\s*([^<]*?)\s*<\/div>\s*<div>\s*([^<]*?)\s*<\/div>/gi;

const RE_STAT_TRIO = /<div class="home">\s*([^<]*?)\s*<\/div>\s*<div class="label">\s*([^<]*?)\s*<\/div>\s*<div class="away">\s*([^<]*?)\s*<\/div>/gi;

/**
 * El resumen de estadisticas viene como "local / rotulo / visitante". Si el
 * markup no calza, se cae a leer el texto plano en tripletes numero-texto-numero,
 * que es como se lee en pantalla.
 */
export function parseRugbyPassStatsSummary(html: string): RugbyPassMatchStat[] {
    const salida: RugbyPassMatchStat[] = [];

    RE_STAT_FILA.lastIndex = 0;
    for (let m = RE_STAT_FILA.exec(html); m; m = RE_STAT_FILA.exec(html)) {
        const label = decodeRugbyPassEntities(m[2]).trim();
        salida.push({
            label: STAT_LABEL_ES[label] ?? label,
            home: decodeRugbyPassEntities(m[1]).trim(),
            away: decodeRugbyPassEntities(m[3]).trim(),
        });
    }
    if (salida.length > 0) return salida;

    RE_STAT_TRIO.lastIndex = 0;
    for (let m = RE_STAT_TRIO.exec(html); m; m = RE_STAT_TRIO.exec(html)) {
        const label = decodeRugbyPassEntities(m[2]).trim();
        salida.push({
            label: STAT_LABEL_ES[label] ?? label,
            home: decodeRugbyPassEntities(m[1]).trim(),
            away: decodeRugbyPassEntities(m[3]).trim(),
        });
    }
    if (salida.length > 0) return salida;

    const texto = decodeRugbyPassEntities(html.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
    const re = /(\d+(?:%|)?)\s+([A-Za-z][A-Za-z .'-]*?)\s+(\d+%?)(?=\s+\d|\s*$)/g;
    for (let m = re.exec(texto); m; m = re.exec(texto)) {
        const label = m[2].trim();
        salida.push({ label: STAT_LABEL_ES[label] ?? label, home: m[1], away: m[3] });
    }
    return salida;
}

const RE_PLAYER = /<div class="player">([\s\S]*?)<\/div>\s*<\/div>/gi;
const RE_NUM = /<div class="num">\s*(\d+)\s*<\/div>/i;
const RE_NAME = /<div class="name">\s*([^<]+?)\s*<\/div>/i;
const RE_TOTAL = /<div class="total">\s*([\d.]+)\s*<\/div>/i;
const RE_ALT = /alt="([^"]*)"/i;

/** Los mejores de cada categoria, con su nombre y su club. */
export function parseRugbyPassPlayerStats(bloques: Record<string, unknown>): RugbyPassPlayerStat[] {
    const salida: RugbyPassPlayerStat[] = [];
    for (const [category, valor] of Object.entries(bloques ?? {})) {
        if (typeof valor !== 'string') continue;
        // Cada jugador es un `.player` con numero, escudo, nombre y total.
        for (const trozo of valor.split('<div class="player">').slice(1)) {
            const nombre = trozo.match(RE_NAME);
            const total = trozo.match(RE_TOTAL);
            if (!nombre || !total) continue;
            salida.push({
                category,
                rank: Number(trozo.match(RE_NUM)?.[1] ?? 0),
                playerName: decodeRugbyPassEntities(nombre[1]),
                teamName: decodeRugbyPassEntities(trozo.match(RE_ALT)?.[1] ?? ''),
                total: Number(total[1]),
            });
        }
    }
    return salida;
}

/**
 * LAS ALINEACIONES. `homeTable` / `awayTable` de `live-poll-data` traen los 23
 * de cada lado con numero, nombre, el slug del jugador y a que minuto entro o
 * salio. Estaban dadas por inexistentes: llegan en la MISMA llamada que ya se
 * hacia para la cronologia, y se estaban descartando.
 *
 * Los titulares se separan del banco por el `<h3>Substitutes</h3>` que RugbyPass
 * mete entre el 15 y el 16. Se usa esa marca y no "los primeros quince" porque
 * un seven, un M20 con banco corto o una lista incompleta rompen la cuenta fija.
 */
export interface RugbyPassLineupPlayer {
    number: number | null;
    name: string;
    slug: string | null;
    role: 'starter' | 'substitute';
    /** Minuto en que entro (suplente) o salio (titular). `null` si no se movio. */
    onMinute: number | null;
    offMinute: number | null;
}

const RE_LINEUP_NUM = /<div class="num">\s*(\d+)\s*<\/div>/i;
const RE_LINEUP_NOMBRE = /<a href="[^"]*\/players\/([a-z0-9-]+)\/"[^>]*>\s*([^<]+?)\s*<\/a>/i;
const RE_LINEUP_ON = /<div class="on">\s*(\d+)'/i;
const RE_LINEUP_OFF = /<div class="off">\s*(\d+)'/i;

export function parseRugbyPassLineup(html: string): RugbyPassLineupPlayer[] {
    const texto = String(html ?? '');
    if (!texto) return [];

    // Donde arranca el banco. Si la ficha no trae el titulo, quedan todos como
    // titulares: es preferible a inventar un corte en el quince.
    const corte = texto.search(/<h3>\s*Substitutes\s*<\/h3>/i);

    const salida: RugbyPassLineupPlayer[] = [];
    let desde = 0;
    for (const trozo of texto.split('<div class="player').slice(1)) {
        const inicio = texto.indexOf(trozo, desde);
        desde = inicio + 1;

        const nombre = trozo.match(RE_LINEUP_NOMBRE);
        if (!nombre) continue;

        const num = trozo.match(RE_LINEUP_NUM);
        salida.push({
            number: num ? Number(num[1]) : null,
            name: decodeRugbyPassEntities(nombre[2]),
            slug: nombre[1],
            role: corte >= 0 && inicio > corte ? 'substitute' : 'starter',
            onMinute: Number(trozo.match(RE_LINEUP_ON)?.[1] ?? NaN) || null,
            offMinute: Number(trozo.match(RE_LINEUP_OFF)?.[1] ?? NaN) || null,
        });
    }
    return salida;
}

function porcentaje(valor: unknown): number | null {
    const n = Number(String(valor ?? '').replace('%', '').trim());
    return Number.isFinite(n) ? n : null;
}

interface RawDetail {
    statusValue?: unknown;
    minutes?: unknown;
    score?: { home_team?: unknown; away_team?: unknown };
    keyEvents?: unknown;
    statsSummary?: unknown;
    setPlays?: unknown;
    attack?: unknown;
    defence?: unknown;
    kicks?: unknown;
    turnovers?: unknown;
    penalties?: unknown;
    homeTable?: unknown;
    awayTable?: unknown;
    playerStats?: unknown;
    possessionData?: { homePercent?: unknown; awayPercent?: unknown };
    territoryData?: { homePercent?: unknown; awayPercent?: unknown };
}

/**
 * Las estadisticas de los SIETE bloques, no solo del resumen.
 *
 * Un rotulo repetido se queda con la primera aparicion: "Turnovers Won" sale en
 * `statsSummary` y otra vez en `turnovers`, y "Line Breaks" en `statsSummary` y
 * en `attack`. Duplicarlas llenaria la pantalla de filas iguales.
 */
export function parseRugbyPassAllStats(payload: RawDetail): RugbyPassMatchStat[] {
    const salida: RugbyPassMatchStat[] = [];
    const vistos = new Set<string>();
    for (const grupo of RUGBYPASS_STAT_GROUPS) {
        const html = (payload as Record<string, unknown>)?.[grupo];
        if (typeof html !== 'string') continue;
        for (const stat of parseRugbyPassStatsSummary(html)) {
            if (vistos.has(stat.label)) continue;
            vistos.add(stat.label);
            salida.push(stat);
        }
    }
    return salida;
}

export function parseRugbyPassMatchDetail(payload: RawDetail): RugbyPassMatchDetail {
    const score = payload?.score ?? {};
    return {
        status: typeof payload?.statusValue === 'string' ? payload.statusValue : null,
        minutes: typeof payload?.minutes === 'string' ? payload.minutes : null,
        homeScore: typeof score.home_team === 'number' ? score.home_team : null,
        awayScore: typeof score.away_team === 'number' ? score.away_team : null,
        events: typeof payload?.keyEvents === 'string' ? parseRugbyPassEvents(payload.keyEvents) : [],
        stats: parseRugbyPassAllStats(payload),
        playerStats: parseRugbyPassPlayerStats((payload?.playerStats ?? {}) as Record<string, unknown>),
        possession: {
            home: porcentaje(payload?.possessionData?.homePercent),
            away: porcentaje(payload?.possessionData?.awayPercent),
        },
        territory: {
            home: porcentaje(payload?.territoryData?.homePercent),
            away: porcentaje(payload?.territoryData?.awayPercent),
        },
        lineups: {
            home: typeof payload?.homeTable === 'string' ? parseRugbyPassLineup(payload.homeTable) : [],
            away: typeof payload?.awayTable === 'string' ? parseRugbyPassLineup(payload.awayTable) : [],
        },
    };
}
