/**
 * LOS CATALOGOS DE RUGBYPASS: torneos, equipos y jugadores.
 *
 * Modulo PURO, como `rugbyPassParser.ts`: no abre red, no toca el DOM y corre
 * bajo `node --test`. La parte con red vive en `rugbyPass.ts`.
 *
 *   GET  /tournaments/  -> la grilla visual (logo y colores de marca)
 *   GET  /teams/        -> 299 equipos server-rendered
 *   GET  /players/      -> la pagina, que ademas lleva el CATALOGO DE IDS adentro
 *   POST /players       -> `filter-players`, la lista de jugadores por torneo
 *
 * ── LA TRAMPA DE LOS DOS IDS ────────────────────────────────────────────────
 * Cada torneo tiene DOS numeros distintos y los dos viajan en la misma pagina:
 *
 *   `id`  — el de la pagina del torneo. Es el que usa el `data-comps` de /teams/
 *   `oid` — el de la competicion. Es el que usa el campo `c` de un partido del
 *           feed y el parametro `comp` de `filter-players`
 *
 * "International" es `id=107` / `oid=3`; el Rugby World Cup, `id=111` / `oid=210`.
 * Coinciden en muchos torneos, y por eso confundirlos no falla enseguida: falla
 * en los pocos donde difieren, sin dar ningun error. `RUGBYPASS_COMPETITIONS.id`
 * es el **oid**.
 *
 * Aca se los nombra `competitionId` (oid) y `pageId` (id) para que no haya forma
 * de tomar uno por el otro.
 *
 * ── UN TORNEO PUEDE NO TENER COMPETICION ────────────────────────────────────
 * `The Rugby Championship` y `Celtic Challenge` tienen pagina propia pero NO
 * estan en el catalogo de ids: no hay `oid` con el que pedirles partidos ni
 * jugadores. Los del Rugby Championship llegan por "Internationals" (oid 3), que
 * es el cajon de sastre. Por eso `competitionId` es nullable y quien pida datos
 * tiene que chequearlo — asumir que siempre esta lo rompe justo en el torneo
 * mas importante del hemisferio sur.
 */

import {
    RUGBYPASS_CDN,
    RUGBYPASS_URL,
    decodeRugbyPassEntities,
    isRugbyPassCompetitionEnabled,
    rugbyPassTeamId,
    rugbyPassTournamentId,
} from './rugbyPassParser.ts';

export const RUGBYPASS_PLAYER_ID_PREFIX = 'rp-player-';

/** De `pablo-matera` a `rp-player-pablo-matera`. Ver `rugbyPassTeamId`. */
export function rugbyPassPlayerId(slug: string): string {
    return `${RUGBYPASS_PLAYER_ID_PREFIX}${slug}`;
}

export function isRugbyPassPlayerId(value: unknown): boolean {
    return String(value ?? '').startsWith(RUGBYPASS_PLAYER_ID_PREFIX);
}

/** El absoluto de una ruta del CDN, que llega relativa y a veces con `&amp;`. */
function cdnUrl(path: string): string {
    const limpio = decodeRugbyPassEntities(String(path ?? '')).trim();
    if (!limpio) return '';
    if (/^https?:\/\//i.test(limpio)) return limpio;
    return `${RUGBYPASS_CDN}${limpio.replace(/^\/+/, '')}`;
}

/** `123` de un valor que puede venir numero o texto; `null` si no es un numero. */
function numeroDe(valor: unknown): number | null {
    const n = Number(String(valor ?? '').trim());
    return Number.isFinite(n) ? n : null;
}

/**
 * Un numero que PUEDE NO ESTAR. `null` cuando el campo falta o viene vacio.
 *
 * `numeroDe` no sirve para esto: `Number('')` es 0, asi que un campo ausente
 * sale como un cero AFIRMADO. En la ficha de un jugador eso es una mentira
 * medible — una temporada sin puntos publicados quedaria con "0 puntos", que es
 * lo mismo que dice la de un jugador que jugo y no anoto. `numeroDe` se queda
 * como esta porque sus llamadores le pasan campos que siempre vienen.
 */
function numeroOpcional(valor: unknown): number | null {
    if (valor === null || valor === undefined) return null;
    const texto = String(valor).trim();
    if (texto === '') return null;
    const n = Number(texto);
    return Number.isFinite(n) ? n : null;
}

/** Para meter una URL adentro de una expresion regular. */
function escaparRegex(valor: string): string {
    return valor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ── Torneos ─────────────────────────────────────────────────────────────────

export interface RugbyPassTournament {
    /** `rp-comp-<oid>`. `null` cuando el torneo no tiene competicion asociada. */
    id: string | null;
    /** El **oid**: el que piden el feed y `filter-players`. */
    competitionId: number | null;
    /** El **id** de la pagina: el que aparece en el `data-comps` de /teams/. */
    pageId: number | null;
    name: string;
    slug: string;
    /** Si el conector lo importa hoy (`RUGBYPASS_COMPETITIONS`). */
    enabled: boolean;
    /** Si RugbyPass declara que publica fixture. */
    hasFixtures: boolean;
    logo: string;
    /** Colores de marca de la grilla. `null` si el torneo no sale en la grilla. */
    colors: { background: string; foreground: string } | null;
}

interface RawTournamentId {
    title?: unknown;
    uri?: unknown;
    id?: unknown;
    oid?: unknown;
    fixtures?: unknown;
    hasData?: unknown;
}

/**
 * El array `tournaments: [...]` que la pagina `/players/` lleva embebido.
 *
 * Es el UNICO lugar donde estan los dos ids juntos: ni `/tournaments/` ni
 * `/teams/` lo traen (medido: cero ocurrencias de `"oid"` en las dos). Se lee
 * balanceando corchetes y no con una expresion, porque el array esta adentro de
 * un bundle de JavaScript y cualquier regex se corta en el primer `]` anidado.
 */
export function parseRugbyPassTournamentIds(html: string): RawTournamentId[] {
    const texto = String(html ?? '');
    const marca = texto.search(/tournaments\s*:\s*\[/);
    if (marca < 0) return [];

    const inicio = texto.indexOf('[', marca);
    let profundidad = 0;
    for (let i = inicio; i < texto.length; i++) {
        if (texto[i] === '[') profundidad++;
        else if (texto[i] === ']') {
            profundidad--;
            if (profundidad === 0) {
                try {
                    const leido = JSON.parse(texto.slice(inicio, i + 1));
                    return Array.isArray(leido) ? leido : [];
                } catch {
                    // Un bundle minificado distinto no puede voltear el catalogo.
                    return [];
                }
            }
        }
    }
    return [];
}

export interface RugbyPassTournamentCard {
    slug: string;
    name: string;
    logo: string;
    colors: { background: string; foreground: string };
}

const RE_TARJETA_TORNEO = new RegExp(
    '<a href="' + escaparRegex(RUGBYPASS_URL) +
    '/([a-z0-9-]+)/"\\s*style="background-color:\\s*([^;]+);color:([^"]+)">' +
    '\\s*<span>\\s*<img src="([^"]+)"[^>]*>\\s*</span>\\s*<span>\\s*([^<]+?)\\s*</span>',
    'gi'
);

/**
 * La grilla de `/tournaments/`. Aporta el logo y los colores de marca.
 *
 * OJO con el href: los torneos cuelgan de la RAIZ (`/internationals/`), no de
 * `/tournaments/<slug>/`. Buscar links `/tournaments/...` devuelve cero.
 */
export function parseRugbyPassTournamentCards(html: string): RugbyPassTournamentCard[] {
    const texto = String(html ?? '');
    const salida: RugbyPassTournamentCard[] = [];
    const vistos = new Set<string>();

    RE_TARJETA_TORNEO.lastIndex = 0;
    for (let m = RE_TARJETA_TORNEO.exec(texto); m; m = RE_TARJETA_TORNEO.exec(texto)) {
        const slug = m[1];
        if (vistos.has(slug)) continue;
        vistos.add(slug);
        salida.push({
            slug,
            name: decodeRugbyPassEntities(m[5]),
            logo: cdnUrl(m[4]),
            colors: { background: m[2].trim(), foreground: m[3].trim() },
        });
    }
    return salida;
}

/**
 * Las dos fuentes en una sola lista, unidas por slug.
 *
 * Ninguna es superconjunto de la otra, y por eso se unen en vez de elegir:
 * `the-rugby-championship` y `celtic-challenge` salen solo en la grilla (sin
 * ids), y las cuatro competiciones femeninas —Pacific Four, Mundial femenino,
 * WXV y su Challenger— solo en el catalogo de ids.
 */
export function mergeRugbyPassTournaments(
    ids: readonly RawTournamentId[],
    cards: readonly RugbyPassTournamentCard[]
): RugbyPassTournament[] {
    const porSlug = new Map<string, RugbyPassTournament>();

    for (const raw of ids) {
        const slug = String(raw?.uri ?? '').trim();
        const name = decodeRugbyPassEntities(String(raw?.title ?? '').trim());
        if (!slug || !name) continue;

        const competitionId = numeroDe(raw?.oid);
        porSlug.set(slug, {
            id: competitionId === null ? null : rugbyPassTournamentId(competitionId),
            competitionId,
            pageId: numeroDe(raw?.id),
            name,
            slug,
            enabled: competitionId !== null && isRugbyPassCompetitionEnabled(competitionId),
            hasFixtures: raw?.fixtures === true || raw?.fixtures === 1,
            logo: '',
            colors: null,
        });
    }

    for (const card of cards) {
        const previo = porSlug.get(card.slug);
        if (previo) {
            previo.logo = card.logo;
            previo.colors = card.colors;
            continue;
        }
        // Solo en la grilla: tiene pagina pero no competicion con la que pedir
        // partidos ni jugadores.
        porSlug.set(card.slug, {
            id: null,
            competitionId: null,
            pageId: null,
            name: card.name,
            slug: card.slug,
            enabled: false,
            hasFixtures: false,
            logo: card.logo,
            colors: card.colors,
        });
    }

    return [...porSlug.values()].sort((a, b) => a.slug.localeCompare(b.slug));
}

/** El mapa `pageId -> competitionId` que pide `parseRugbyPassTeams`. */
export function pageIdToCompetitionId(
    torneos: readonly RugbyPassTournament[]
): Map<number, number> {
    const mapa = new Map<number, number>();
    for (const t of torneos) {
        if (t.pageId !== null && t.competitionId !== null) mapa.set(t.pageId, t.competitionId);
    }
    return mapa;
}

// ── Equipos ─────────────────────────────────────────────────────────────────

export interface RugbyPassTeamEntry {
    /** `rp-team-<slug>`: el MISMO id con el que el conector guarda los partidos. */
    id: string;
    slug: string;
    name: string;
    logo: string;
    /** **oid**, ya traducidos desde el `data-comps`, que viene en ids de pagina. */
    competitionIds: number[];
}

const RE_FILA_EQUIPO = new RegExp(
    '<a href="' + escaparRegex(RUGBYPASS_URL) +
    '/teams/([a-z0-9-]+)/" class="roster-row[^"]*" data-name="([^"]*)" data-comps="([^"]*)"' +
    '[\\s\\S]{0,600}?logos/png/(\\d+)\\.png',
    'gi'
);

/**
 * Los equipos de `/teams/`.
 *
 * **La pagina publica la lista DOS VECES** —hay dos bloques `list-players`, una
 * copia por breakpoint— asi que un parseo directo devuelve 598 filas que son
 * 299 equipos repetidos. Se pliega por slug quedandose con la primera.
 *
 * `mapaDeCompeticiones` traduce el `data-comps`, que viene en ids de PAGINA y no
 * en oids (ver la cabecera). Sin el mapa los ids se DESCARTAN en vez de pasar
 * como si fueran competiciones: un numero del espacio equivocado ensucia mas que
 * un dato faltante.
 */
export function parseRugbyPassTeams(
    html: string,
    mapaDeCompeticiones: ReadonlyMap<number, number> = new Map()
): RugbyPassTeamEntry[] {
    const texto = String(html ?? '');
    const porSlug = new Map<string, RugbyPassTeamEntry>();

    RE_FILA_EQUIPO.lastIndex = 0;
    for (let m = RE_FILA_EQUIPO.exec(texto); m; m = RE_FILA_EQUIPO.exec(texto)) {
        const slug = m[1];
        if (porSlug.has(slug)) continue;

        const name = decodeRugbyPassEntities(m[2]).trim();
        if (!name) continue;

        const competitionIds: number[] = [];
        for (const trozo of m[3].split(',')) {
            const pageId = numeroDe(trozo);
            if (pageId === null) continue;
            const oid = mapaDeCompeticiones.get(pageId);
            if (oid !== undefined && !competitionIds.includes(oid)) competitionIds.push(oid);
        }

        porSlug.set(slug, {
            id: rugbyPassTeamId(slug),
            slug,
            name,
            logo: cdnUrl(`webp-images/images/team-images/logos/png/${m[4]}.png.webp`),
            competitionIds,
        });
    }

    return [...porSlug.values()].sort((a, b) => a.slug.localeCompare(b.slug));
}

// ── Jugadores ───────────────────────────────────────────────────────────────

export interface RugbyPassPlayerTeam {
    name: string;
    /** El id interno del proveedor. NO es el numero del escudo. */
    providerId: string | null;
}

export interface RugbyPassPlayer {
    /** `rp-player-<slug>`. El slug es la UNICA identidad — ver `pid` abajo. */
    id: string;
    slug: string;
    name: string;
    /** El puesto tal como lo rotula RugbyPass ("Back Row", "Outside Back"). */
    position: string | null;
    /**
     * El ORDINAL DEL PUESTO (1-15), no el numero de camiseta.
     *
     * Medido sobre los 114 del plantel de Auckland: cada valor cae siempre en el
     * mismo puesto y ninguno en dos (1 y 3 Prop, 2 Hooker, 4 y 5 Lock, 6/7/8
     * Back Row, 9 Scrum Half, 10 Fly Half, 12/13 Centre, 11/14/15 Outside Back).
     * Sirve para ORDENAR un equipo de pilar a fullback; mostrarlo como dorsal
     * pinta siete props distintos con un "1" al lado.
     *
     * `null` cuando llega 0, que es "sin puesto".
     */
    jerseyNumber: number | null;
    /** Los clubes y selecciones por los que paso, en el orden que los publica. */
    teams: RugbyPassPlayerTeam[];
    /** Si integra un plantel vigente. */
    currentSquad: boolean;
    /** Vacio cuando es el comodin `images/common/player.png`. */
    photo: string;
    /** Las competiciones en las que se lo encontro (**oid**). */
    competitionIds: number[];
}

interface RawPlayer {
    n?: unknown; l?: unknown; p?: unknown; pid?: unknown;
    t?: unknown; ti?: unknown; sqd?: unknown; i?: unknown;
}

/** El comodin que RugbyPass usa cuando el jugador no tiene foto. */
const FOTO_GENERICA = 'images/common/player.png';

/** De `players/pablo-matera/` a `pablo-matera`. */
function slugDeJugador(link: unknown): string {
    const m = String(link ?? '').match(/players\/([a-z0-9-]+)\/?/i);
    return m ? m[1].toLowerCase() : '';
}

/**
 * Los jugadores de una respuesta de `load-players` / `filter-players`.
 *
 * ── `pid` NO ES EL ID DEL JUGADOR ───────────────────────────────────────────
 * Es el NUMERO DE CAMISETA. Medido sobre los 2453 jugadores de "Internationals":
 * hay 2453 slugs distintos y apenas **16 valores de `pid`**, del 0 al 15, y cada
 * uno cae siempre en el mismo puesto (1 y 3 Prop, 2 Hooker, 6/7/8 Back Row, 9
 * Scrum Half, 10 Fly Half…). Plegar por `pid` dejaria 16 filas en vez de 2453.
 * La identidad es el slug de `l`.
 *
 * ── `ti` PUEDE TRAER MAS IDS QUE NOMBRES ────────────────────────────────────
 * `t` son los nombres separados por coma y `ti` los ids internos, en el mismo
 * orden. En 2450 de 2453 coinciden, pero hay tres jugadores con dos ids y un
 * solo nombre (el segundo es un registro interno sin nombre publicado). Se
 * parean por indice y el sobrante se ignora: inventarle un nombre a un id seria
 * peor que perderlo.
 */
export function parseRugbyPassPlayers(
    payload: { players?: unknown } | null | undefined,
    competitionId?: number | null
): RugbyPassPlayer[] {
    const crudos = Array.isArray(payload?.players) ? (payload.players as RawPlayer[]) : [];
    const salida: RugbyPassPlayer[] = [];

    for (const raw of crudos) {
        const slug = slugDeJugador(raw?.l);
        const name = decodeRugbyPassEntities(String(raw?.n ?? '').trim());
        if (!slug || !name) continue;

        const nombres = String(raw?.t ?? '')
            .split(',')
            .map((s) => decodeRugbyPassEntities(s).trim())
            .filter(Boolean);
        const ids = Array.isArray(raw?.ti) ? raw.ti.map((v) => String(v ?? '').trim()) : [];

        const camiseta = numeroDe(raw?.pid);
        const foto = String(raw?.i ?? '').trim();

        salida.push({
            id: rugbyPassPlayerId(slug),
            slug,
            name,
            position: decodeRugbyPassEntities(String(raw?.p ?? '').trim()) || null,
            jerseyNumber: camiseta !== null && camiseta > 0 ? camiseta : null,
            teams: nombres.map((nombre, i) => ({ name: nombre, providerId: ids[i] ?? null })),
            currentSquad: raw?.sqd === true || raw?.sqd === 1 || raw?.sqd === '1',
            photo: !foto || foto === FOTO_GENERICA ? '' : cdnUrl(foto),
            competitionIds: typeof competitionId === 'number' ? [competitionId] : [],
        });
    }

    return salida;
}

/**
 * Varias tandas en una sola lista, plegando por slug.
 *
 * Un jugador sale en TODAS las competiciones en las que jugo: Matera aparece en
 * Internationals y en el Top 14, y sin plegar entraria dos veces. Al plegarlo se
 * unen sus competiciones, que es justo el dato que ninguna tanda tiene sola.
 *
 * Gana el primero en llegar, salvo en lo que puede venir vacio —foto, puesto,
 * numero, equipos— donde completa el que lo tenga: una tanda filtrada por torneo
 * a veces publica menos campos que la general, y perder la foto por el orden de
 * las llamadas seria un resultado que depende de nada.
 */
export function mergeRugbyPassPlayers(
    tandas: readonly (readonly RugbyPassPlayer[])[]
): RugbyPassPlayer[] {
    const porSlug = new Map<string, RugbyPassPlayer>();

    for (const tanda of tandas) {
        for (const jugador of tanda) {
            const previo = porSlug.get(jugador.slug);
            if (!previo) {
                porSlug.set(jugador.slug, {
                    ...jugador,
                    teams: [...jugador.teams],
                    competitionIds: [...jugador.competitionIds],
                });
                continue;
            }
            for (const comp of jugador.competitionIds) {
                if (!previo.competitionIds.includes(comp)) previo.competitionIds.push(comp);
            }
            if (!previo.photo && jugador.photo) previo.photo = jugador.photo;
            if (!previo.position && jugador.position) previo.position = jugador.position;
            if (previo.jerseyNumber === null && jugador.jerseyNumber !== null) {
                previo.jerseyNumber = jugador.jerseyNumber;
            }
            if (previo.teams.length === 0 && jugador.teams.length > 0) {
                previo.teams = [...jugador.teams];
            }
            if (jugador.currentSquad) previo.currentSquad = true;
        }
    }

    for (const jugador of porSlug.values()) jugador.competitionIds.sort((a, b) => a - b);
    return [...porSlug.values()].sort((a, b) => a.slug.localeCompare(b.slug));
}

/**
 * El slug del equipo de cada jugador, resuelto contra el catalogo de equipos.
 *
 * Se cruza por NOMBRE porque es lo unico compartido: el `ti` del jugador y el
 * numero del escudo de `/teams/` son espacios de ids distintos (AUNZ XV es `ti`
 * 30389 y escudo 100030389; Auckland es `ti` 4350 y escudo 501). Cruzar por
 * nombre dentro de un mismo proveedor es sano — los nombres los escribe
 * RugbyPass en los dos lados. Entre proveedores NO valdria, que es la regla que
 * ya rige en el resto del proyecto.
 *
 * Lo que no resuelve queda con `slug: null` y NO se descarta: un jugador arrastra
 * clubes historicos ("Stade Francais", "Mie Honda Heat") que no estan entre los
 * 299 equipos vigentes, y perderlos borraria su trayectoria.
 */
export function resolvePlayerTeamSlugs(
    jugadores: readonly RugbyPassPlayer[],
    equipos: readonly RugbyPassTeamEntry[]
): { player: RugbyPassPlayer; teams: { name: string; slug: string | null }[] }[] {
    const porNombre = new Map<string, string>();
    for (const equipo of equipos) {
        const clave = equipo.name.toLowerCase().trim();
        if (!porNombre.has(clave)) porNombre.set(clave, equipo.slug);
    }

    return jugadores.map((player) => ({
        player,
        teams: player.teams.map((t) => ({
            name: t.name,
            slug: porNombre.get(t.name.toLowerCase().trim()) ?? null,
        })),
    }));
}

// ── Tabla de posiciones ─────────────────────────────────────────────────────

export interface RugbyPassStandingRow {
    position: number;
    teamName: string;
    logo: string;
    played: number;
    won: number;
    drawn: number;
    lost: number;
    pointsFor: number;
    pointsAgainst: number;
    pointsDiff: number;
    /** Bonus ofensivo (por tries). RugbyPass lo rotula `BP T`. */
    tryBonus: number;
    /** Bonus defensivo (derrota por 7 o menos). Lo rotula `BP-7`. */
    losingBonus: number;
    /** El total de bonus, que es la suma de los dos de arriba. */
    bonusPoints: number;
    points: number;
}

/**
 * La tabla que viaja en `live-poll-data` cuando se pide con `liveStandings=1`.
 *
 * **Los valores se leen por ENCABEZADO, no por posicion.** El markup es una
 * hilera de `<div>` sin clase que los distinga —`P W L D PF PA PD BP-T BP-7 BP
 * Total` son once divs iguales— asi que atarse al indice significa que el dia
 * que RugbyPass agregue o corra una columna, la tabla sigue mostrando numeros
 * sin dar ningun error: los puntos de un equipo pasarian a leerse como su
 * diferencia. Emparejar por rotulo falla ruidosamente (queda en cero) en vez de
 * mentir.
 *
 * Devuelve lista vacia cuando el torneo no publica tabla, que NO es un error:
 * "Internationals" contesta `No live data for Internationals` porque es un cajon
 * de test matches y no una liga.
 */
export function parseRugbyPassStandings(html: string): RugbyPassStandingRow[] {
    const texto = String(html ?? '');
    if (!texto || /no-standings/.test(texto)) return [];

    // Los rotulos, en el orden en que vienen. El primero es la columna vacia
    // del escudo y no cuenta.
    const cabecera = texto.match(/<div class="standings-titles">([\s\S]*?)<\/div>\s*<div class="team-standing">/i)
        ?? texto.match(/<div class="standings-titles">([\s\S]*?)$/i);
    const rotulos = cabecera
        ? [...cabecera[1].matchAll(/<div[^>]*>\s*([^<]*?)\s*<\/div>/g)]
            .map((m) => m[1].trim().toUpperCase())
            .filter((r, i, todos) => !(i === 0 && r === '') || todos.length === 0)
        : [];
    const columnas = rotulos.filter((r) => r !== '');

    const indice = (...alias: string[]) => {
        for (const a of alias) {
            const i = columnas.indexOf(a);
            if (i >= 0) return i;
        }
        return -1;
    };
    const col = {
        played: indice('P', 'PL'),
        won: indice('W'),
        lost: indice('L'),
        drawn: indice('D'),
        pointsFor: indice('PF'),
        pointsAgainst: indice('PA'),
        pointsDiff: indice('PD'),
        tryBonus: indice('BP T', 'BPT'),
        losingBonus: indice('BP-7', 'BP7'),
        bonusPoints: indice('BP'),
        points: indice('TOTAL', 'PTS'),
    };

    const salida: RugbyPassStandingRow[] = [];
    for (const bloque of texto.split('<div class="team-standing">').slice(1)) {
        const nombre = decodeRugbyPassEntities(
            bloque.match(/<div class="name">\s*<div>\s*([^<]+?)\s*<\/div>/i)?.[1]
            ?? bloque.match(/alt="([^"]*)"/i)?.[1]
            ?? ''
        ).trim();
        if (!nombre) continue;

        const posicion = Number(bloque.match(/^\s*<div>\s*(\d+)\s*<\/div>/i)?.[1] ?? NaN);

        // Los numeros, en orden, salteando el escudo y el nombre.
        const sinCabecera = bloque.slice(bloque.indexOf('</div>', bloque.indexOf('class="name"')));
        const valores = [...sinCabecera.matchAll(/<div(?: class="(?:mb|dt)")?>\s*([\d-]+)\s*<\/div>/g)]
            .map((m) => Number(m[1]))
            .filter((n) => Number.isFinite(n));

        const leer = (i: number) => (i >= 0 && i < valores.length ? valores[i] : 0);
        salida.push({
            position: Number.isFinite(posicion) ? posicion : salida.length + 1,
            teamName: nombre,
            logo: cdnUrl(bloque.match(/<img src="([^"]+)"/i)?.[1] ?? ''),
            played: leer(col.played),
            won: leer(col.won),
            drawn: leer(col.drawn),
            lost: leer(col.lost),
            pointsFor: leer(col.pointsFor),
            pointsAgainst: leer(col.pointsAgainst),
            pointsDiff: leer(col.pointsDiff),
            tryBonus: leer(col.tryBonus),
            losingBonus: leer(col.losingBonus),
            bonusPoints: leer(col.bonusPoints),
            points: leer(col.points),
        });
    }

    return salida;
}

// ── Zonas de la tabla ───────────────────────────────────────────────────────

/**
 * LAS ETIQUETAS DE LA TABLA SON NUESTRAS, NO DE RUGBYPASS.
 *
 * Medido en cuatro torneos con playoffs (NPC, Top 14, URC y Premiership): la
 * tabla que publica RugbyPass trae las mismas siete clases estructurales y NADA
 * mas — sin leyenda, sin colores, sin notas, sin zona de clasificacion ni de
 * descenso. Asi que el reglamento lo pone el proyecto.
 *
 * Los cuatro colores, que es el vocabulario acordado:
 *
 *   verde    `primary`     clasificacion directa (semifinal, o el playoff de arriba)
 *   azul     `secondary`   clasificacion a la instancia previa, o a otra copa
 *   amarillo `playoff`     repechaje: se juega la permanencia o el ascenso
 *   rojo     `relegation`  descenso
 *
 * Este es el UNICO lugar donde se escriben. Un reglamento cambia de temporada a
 * temporada (la Premiership suspendio el descenso, el Top 14 movio el barrage),
 * asi que corregir un torneo es editar una fila de esta tabla y nada mas.
 */
export type RugbyPassZoneKind = 'primary' | 'secondary' | 'playoff' | 'relegation';

export interface RugbyPassZone {
    /** Posiciones que abarca, inclusive y en base 1. */
    from: number;
    to: number;
    kind: RugbyPassZoneKind;
    /** Como se lee en la leyenda. Rioplatense, sin abreviar. */
    name: string;
}

export interface RugbyPassCompetitionZones {
    /** El **oid** de la competicion. */
    competitionId: number;
    /**
     * Cuantos equipos tiene la tabla cuando el reglamento se escribio.
     *
     * No es decorativo: si RugbyPass devuelve una tabla de otro tamano, el
     * reglamento guardado ya no corresponde y las zonas se descartan enteras.
     * Una liga que pasa de 14 a 12 equipos moveria el descenso a un puesto de
     * mitad de tabla, y pintar la fila equivocada de rojo es peor que no pintar
     * nada: el que la lee no tiene como darse cuenta.
     */
    teams: number;
    zones: readonly RugbyPassZone[];
}

export const RUGBYPASS_ZONES: readonly RugbyPassCompetitionZones[] = [
    {
        // Top 14 (Francia). 1 y 2 a semifinal directo; 3 a 6 juegan los barrages.
        // El 14 baja a Pro D2 y el 13 juega el acceso contra el 2 de la Pro D2.
        competitionId: 203,
        teams: 14,
        zones: [
            { from: 1, to: 2, kind: 'primary', name: 'Semifinal' },
            { from: 3, to: 6, kind: 'secondary', name: 'Barrages' },
            { from: 13, to: 13, kind: 'playoff', name: 'Promoción' },
            { from: 14, to: 14, kind: 'relegation', name: 'Descenso' },
        ],
    },
    {
        // Pro D2 (Francia). Los seis de arriba juegan el ascenso; el que gana
        // sube directo y el finalista va al acceso contra el 13 del Top 14.
        // Los dos ultimos bajan a Nationale.
        competitionId: 211,
        teams: 16,
        zones: [
            { from: 1, to: 2, kind: 'primary', name: 'Semifinal' },
            { from: 3, to: 6, kind: 'secondary', name: 'Playoff de ascenso' },
            { from: 15, to: 16, kind: 'relegation', name: 'Descenso' },
        ],
    },
    {
        // United Rugby Championship. Los ocho de arriba a cuartos. Es liga
        // cerrada: no hay descenso.
        competitionId: 204,
        teams: 16,
        zones: [
            { from: 1, to: 8, kind: 'secondary', name: 'Cuartos de final' },
        ],
    },
    {
        // Gallagher Premiership. Los cuatro de arriba a semifinal. El descenso
        // esta suspendido por el sistema de licencias de la RFU, asi que NO se
        // pinta ninguna zona roja: marcar un descenso que no se juega seria
        // inventar una consecuencia.
        competitionId: 201,
        teams: 10,
        zones: [
            { from: 1, to: 4, kind: 'primary', name: 'Semifinal' },
        ],
    },
    {
        // Hilux NPC (Nueva Zelanda). Los cuatro de arriba a semifinal. Es
        // competencia unica desde 2021: sin ascensos ni descensos.
        competitionId: 208,
        teams: 14,
        zones: [
            { from: 1, to: 4, kind: 'primary', name: 'Semifinal' },
        ],
    },
    // "Internationals" (oid 3) no lleva zonas y no es un olvido: no tiene tabla.
    // Es un cajon de test matches, y RugbyPass contesta "No live data".
] as const;

const ZONES_BY_COMPETITION = new Map(RUGBYPASS_ZONES.map((z) => [z.competitionId, z]));

/** El color de cada tipo de zona. Es el vocabulario acordado, en un solo lugar. */
export const RUGBYPASS_ZONE_COLORS: Readonly<Record<RugbyPassZoneKind, string>> = {
    primary: '#16a34a',
    secondary: '#2563eb',
    playoff: '#d97706',
    relegation: '#dc2626',
};

export interface RugbyPassZoneAssignment {
    position: number;
    name: string;
    color: string;
    kind: RugbyPassZoneKind;
}

/**
 * Una asignacion por POSICION, que es como el proyecto pinta la banda de color
 * de una fila (ver `resolveStandingsRowLabel`).
 *
 * Devuelve vacio —y NO a medias— cuando la tabla no tiene el tamano con el que
 * se escribio el reglamento. Ver el porque en `teams`.
 */
export function rugbyPassZonesFor(
    competitionId: number,
    teamsInTable: number
): RugbyPassZoneAssignment[] {
    const reglamento = ZONES_BY_COMPETITION.get(competitionId);
    if (!reglamento || teamsInTable <= 0) return [];
    if (reglamento.teams !== teamsInTable) return [];

    const salida: RugbyPassZoneAssignment[] = [];
    for (const zona of reglamento.zones) {
        for (let pos = zona.from; pos <= Math.min(zona.to, teamsInTable); pos++) {
            salida.push({
                position: pos,
                name: zona.name,
                color: RUGBYPASS_ZONE_COLORS[zona.kind],
                kind: zona.kind,
            });
        }
    }
    return salida;
}

// ── La ficha individual del jugador ─────────────────────────────────────────

/**
 * `/players/<slug>/` — LA FUENTE COMPLETA, y la unica que hay.
 *
 * `filter-players` da una LISTA: nombre, puesto, foto y los clubes por los que
 * paso. La ficha individual da al jugador entero, y todo server-rendered:
 *
 *   nacionalidad (con bandera) · edad · puesto · altura · peso · club actual
 *   la trayectoria CON slug —no cruzada por nombre, escrita en el propio link—
 *   y las estadisticas por competicion y temporada, hasta diez, con los siete
 *   rubros que RugbyPass elige SEGUN EL PUESTO del jugador
 *
 * Por eso la ficha se pide aca y no se arma con el catalogo: el catalogo cuesta
 * seis llamadas de cientos de KB (las seis competiciones enteras) para devolver
 * menos, y encima solo alcanza a los planteles vigentes — 5045 de los 14262
 * jugadores que RugbyPass publica (medido 2026-09-06, `squad=1` contra
 * `squad=0` en las seis competiciones).
 *
 * ── UN SLUG QUE NO EXISTE DA 404, PERO UNO VIEJO DA 200 VACIO ───────────────
 * `no-existe-este-jugador-xyz` contesta 404, asi que el estado sirve. Pero
 * `danny-grewcock` —retirado— contesta 200 con la pagina ARMADA y sin un solo
 * dato: sin nombre, sin puesto, sin equipos, sin estadisticas. Por eso el
 * parser devuelve `null` cuando no hay nombre: un 200 no alcanza para decir que
 * el jugador esta.
 */

/**
 * El unico puesto donde patear a los palos es la NORMA y no la excepcion.
 *
 * Medido sobre 24 jugadores de los ocho puestos: 3 de 3 aperturas anotaron
 * penales o drops, y 0 de los 21 restantes. Es el rotulo tal cual lo escribe
 * RugbyPass, que no traduce los puestos.
 */
const PUESTO_PATEADOR = 'Fly Half';

/** `<div class="detail"> <h3>Height</h3> <div>192cm</div> </div>` */
const RE_DETALLE = /<div class="detail">\s*<h3>([^<]+)<\/h3>\s*<div>([\s\S]*?)<\/div>\s*<\/div>/gi;

/** El `<h1>` del encabezado, con el id de pagina del jugador al lado. */
const RE_ENCABEZADO = /<div class="title-inner" id="(\d+)">\s*<h1>\s*([\s\S]*?)\s*<\/h1>/i;

/** El link al club actual, en la barra fija de arriba. */
const RE_CLUB_ACTUAL = new RegExp(
    '<a href="' + escaparRegex(RUGBYPASS_URL) +
    '/teams/([a-z0-9-]+)/" class="team">\\s*([^<]+?)\\s*</a>',
    'i'
);

/** Cada club de la seccion "Teams", que ya trae el slug escrito en el link. */
const RE_CLUB_TRAYECTORIA = new RegExp(
    '<a href="' + escaparRegex(RUGBYPASS_URL) +
    '/teams/([a-z0-9-]+)/" role="button"[\\s\\S]{0,300}?logos/png/(\\d+)\\.png' +
    '[\\s\\S]{0,400}?<span class="name">\\s*([^<]+?)\\s*</span>',
    'gi'
);

export interface RugbyPassPlayerTeamLink {
    name: string;
    slug: string;
    logo: string;
}

export interface RugbyPassPlayerSeasonStat {
    /** La clave opta (`lineout_takes`), que es por donde se rotula en castellano. */
    key: string;
    /** El titulo tal cual lo publica RugbyPass ("Lineout Takes"). */
    title: string;
    value: number | string;
}

export interface RugbyPassPlayerSeason {
    /** El **oid** de la competicion. `null` si la ficha no lo trae. */
    competitionId: number | null;
    competitionName: string;
    /** `2025`, `2025/2026`. Tal como lo rotula el proveedor. */
    seasonLabel: string;
    logo: string;
    /** Minutos jugados en esa temporada. `null` si no los publica. */
    minutes: number | null;
    /**
     * Los PUNTOS de la temporada, completos.
     *
     * Es el unico lugar donde estan bien: el bloque por partido trae `tries` y
     * `conversions` y NADA MAS —ni penales ni drops—, y con eso los puntos no
     * cierran. Medido: Boffelli hizo 67 en el Mundial 2023 y `tries*5 +
     * conversiones*2` da 28, porque le faltan trece penales. Por eso los puntos
     * se muestran por TEMPORADA y nunca por partido.
     */
    points: number | null;
    /**
     * Los SIETE rubros que RugbyPass elige por PUESTO: a un octavo le muestra
     * lineouts y carries, a un medio-scrum pases y precision. No es una planilla
     * fija y no hay que tratarla como tal. Medido sobre 60 temporadas de 23
     * jugadores: sale de un vocabulario cerrado de dieciseis rubros.
     */
    stats: RugbyPassPlayerSeasonStat[];
    /**
     * LA PLANILLA CRUDA DE OPTA de esa temporada, tal como la manda el
     * proveedor: sesenta claves, de `carries` a `ruck_arrivals_within_1st_3`.
     *
     * `stats` son los siete rubros que RugbyPass ELIGE mostrar segun el puesto;
     * esto es todo lo que midio. De aca sale el puntaje de la temporada, que
     * necesita cuatro que el resumen no siempre trae — `carries`, `metres`,
     * `tackles` y `passes`.
     *
     * Se guardan solo los valores NUMERICOS: la planilla mezcla cuentas con
     * porcentajes y con ids (`player_id`, `player_team_id`), y un id metido en
     * una cuenta seria un carry de diecinueve mil.
     */
    rawStats: Readonly<Record<string, number>>;
}

export interface RugbyPassPlayerMatch {
    /** `Argentina vs South Africa`, como lo rotula el proveedor. */
    title: string;
    /** Segundos epoch del comienzo. `null` si no se entiende. */
    kickoff: number | null;
    competitionName: string;
    competitionLogo: string;
    opponentName: string;
    opponentLogo: string;
    /** `win` | `loss` | `draw`. Sale de dos banderas, no de un marcador. */
    result: 'win' | 'loss' | 'draw';
    minutes: number | null;
    /**
     * LOS PUNTOS DEL JUGADOR EN ESE PARTIDO: `tries * 5 + conversiones * 2`.
     *
     * Es la unica cuenta posible con lo que el proveedor publica por partido, y
     * es EXACTA para el que no patea a los palos — medido: 14 de 17 jugadores no
     * anotaron un solo penal ni un drop en ninguna temporada publicada.
     *
     * Para el pateador se queda corta, porque los penales y los drops no vienen
     * por partido: Boffelli hizo 67 puntos en el Mundial 2023 y esta cuenta da
     * 28. Por eso el perfil marca `goalKicker`, para que la pantalla lo diga en
     * vez de afirmar un numero que no es. El total exacto vive en la temporada.
     */
    points: number | null;
    tries: number | null;
    conversions: number | null;
    yellowCards: number | null;
    redCards: number | null;
}

export interface RugbyPassPlayerProfile {
    slug: string;
    /** El id interno de la pagina (`19761`). No es el numero de camiseta. */
    pageId: number | null;
    name: string;
    photo: string;
    position: string | null;
    nationality: string | null;
    /** La bandera del CDN. Vacia cuando la ficha no publica nacionalidad. */
    nationalityFlag: string;
    /** RugbyPass publica la EDAD, no la fecha de nacimiento. */
    age: number | null;
    /** `192cm`, tal como lo escribe el proveedor. */
    height: string | null;
    /** `109kg`. */
    weight: string | null;
    currentTeam: RugbyPassPlayerTeamLink | null;
    /** La trayectoria, en el orden en que la publica. */
    teams: RugbyPassPlayerTeamLink[];
    /**
     * Si hay que dar por hecho que patea a los palos.
     *
     * Decide si los puntos por partido son el numero completo o apenas los de
     * try y conversion, porque los penales y los drops no vienen por partido.
     *
     * ── SALE DE DOS COSAS, Y HACEN FALTA LAS DOS ────────────────────────────
     *
     * 1. LO MEDIDO: que alguna temporada publicada le cuente un penal o un drop.
     *    Es la evidencia mas fuerte y no depende del puesto — Boffelli es
     *    Outside Back y lleva 29 penales, y una regla por puesto lo perderia.
     *
     * 2. EL PUESTO, pero SOLO el apertura. Medido sobre 24 jugadores de los ocho
     *    puestos que rotula RugbyPass: patean 3 de 3 aperturas y 0 de los otros
     *    21. En el apertura patear es la norma, asi que a uno cuyas temporadas
     *    publicadas no muestren un penal —porque es joven, o porque esas
     *    temporadas no traen planilla— igual NO se le puede afirmar que la
     *    cuenta es su total.
     *
     * El punto 2 es un piso, no un reemplazo: sin el 1 se pierde al wing que
     * patea, y sin el 2 se le miente al apertura del que todavia no hay dato.
     */
    goalKicker: boolean;
    seasons: RugbyPassPlayerSeason[];
    /**
     * PARTIDO POR PARTIDO, del mas nuevo al mas viejo y sin separar por
     * competicion: el proveedor los agrupa, pero la pantalla los lee como una
     * sola linea de tiempo y el nombre de la competicion viaja en cada uno.
     */
    matches: RugbyPassPlayerMatch[];
}

/**
 * Un array JSON embebido en el HTML, leido BALANCEANDO CORCHETES y respetando
 * las comillas.
 *
 * Una expresion regular se corta en el primer `]` anidado, y un balanceo que
 * ignore las cadenas se corta en el primer `]` que aparezca DENTRO de un nombre.
 * Los dos fallan sin dar error: devuelven un JSON truncado que no parsea, y la
 * ficha se queda sin estadisticas sin que nadie sepa por que.
 */
function arrayJsonEmbebido(texto: string, marcaId: string): unknown[] {
    const marca = texto.indexOf(`id="${marcaId}"`);
    if (marca < 0) return [];
    const inicio = texto.indexOf('[', marca);
    if (inicio < 0) return [];

    let profundidad = 0;
    let enCadena = false;
    let escapado = false;

    for (let i = inicio; i < texto.length; i++) {
        const c = texto[i];
        if (enCadena) {
            if (escapado) escapado = false;
            else if (c === '\\') escapado = true;
            else if (c === '"') enCadena = false;
            continue;
        }
        if (c === '"') enCadena = true;
        else if (c === '[') profundidad++;
        else if (c === ']') {
            profundidad--;
            if (profundidad === 0) {
                try {
                    const leido = JSON.parse(texto.slice(inicio, i + 1));
                    return Array.isArray(leido) ? leido : [];
                } catch {
                    // Un bundle distinto no puede voltear la ficha entera.
                    return [];
                }
            }
        }
    }
    return [];
}

interface RawSeasonBlock {
    competition?: {
        oid?: unknown;
        name?: unknown;
        logoCircle?: unknown;
        logo?: unknown;
        season?: { label?: unknown } | null;
        /** La planilla cruda de opta: de aca salen los puntos y si patea. */
        stats?: {
            stats?: {
                points?: unknown;
                penalty_goals?: unknown;
                drop_goals?: unknown;
            } | null;
        } | null;
    } | null;
    main?: {
        totalMinsPlayed?: unknown;
        main?: unknown;
        profile?: unknown;
    } | null;
}

/** El texto de un nodo, sin etiquetas y con las entidades ya resueltas. */
function textoPlano(html: string): string {
    return decodeRugbyPassEntities(String(html ?? '').replace(/<[^>]*>/g, ' '))
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Los rubros de una temporada, uniendo el VALOR (`main.main`) con la CLAVE
 * (`main.profile`).
 *
 * Los dos arrays traen los mismos rubros en el mismo orden, pero solo `profile`
 * lleva la clave opta (`lineout_takes`) y solo `main` lleva el valor absoluto —
 * `profile` publica el percentil contra el resto del puesto ("67%"), que es otra
 * cosa. Se parean por TITULO y no por indice: el indice coincide hoy, pero si
 * algun dia deja de coincidir, el pareo por indice cruza el valor de un rubro
 * con la clave de otro, y eso no se ve.
 */
function rubrosDe(bloque: RawSeasonBlock): RugbyPassPlayerSeasonStat[] {
    const valores = Array.isArray(bloque?.main?.main) ? bloque.main.main : [];
    const perfiles = Array.isArray(bloque?.main?.profile) ? bloque.main.profile : [];

    const claves = new Map<string, string>();
    for (const p of perfiles as { title?: unknown; key?: unknown }[]) {
        const titulo = String(p?.title ?? '').trim();
        const clave = String(p?.key ?? '').trim();
        if (titulo && clave && !claves.has(titulo)) claves.set(titulo, clave);
    }

    const salida: RugbyPassPlayerSeasonStat[] = [];
    for (const v of valores as { title?: unknown; value?: unknown }[]) {
        const title = decodeRugbyPassEntities(String(v?.title ?? '').trim());
        if (!title) continue;
        const valor = v?.value;
        if (typeof valor !== 'number' && typeof valor !== 'string') continue;
        salida.push({ key: claves.get(title) ?? '', title, value: valor });
    }
    return salida;
}

interface RawMatchBlock {
    games?: unknown;
}

interface RawMatch {
    title?: unknown;
    time?: unknown;
    compTitle?: unknown;
    compLogo?: unknown;
    opposition?: { name?: unknown; logo?: unknown } | null;
    win?: unknown;
    draw?: unknown;
    stats?: {
        mins?: unknown;
        tries?: unknown;
        conversions?: unknown;
        yellow_cards?: unknown;
        red_cards?: unknown;
    } | null;
}

/**
 * Los puntos de un jugador en un partido, con la tabla del rugby: el try vale 5
 * y la conversion 2.
 *
 * `null` cuando el proveedor no publica ni tries ni conversiones — ahi no hay
 * cero, hay ausencia, y un "0" seria una afirmacion que nadie hizo.
 */
function puntosDe(tries: number | null, conversiones: number | null): number | null {
    if (tries === null && conversiones === null) return null;
    return (tries ?? 0) * 5 + (conversiones ?? 0) * 2;
}

/**
 * PARTIDO POR PARTIDO, de `app-competitions`.
 *
 * ── LO QUE ESTE BLOQUE NO TIENE ─────────────────────────────────────────────
 * No trae el MARCADOR del partido —solo si se gano, se perdio o se empato— y de
 * lo que hizo el jugador trae `mins`, `tries`, `conversions` y las dos tarjetas.
 * Medido sobre 584 partidos de cuatro jugadores de puestos distintos: esas cinco
 * claves y ninguna mas, en el 100% de los casos.
 *
 * Por eso aca NO se calculan puntos. `tries * 5 + conversiones * 2` parece la
 * cuenta y no lo es: le faltan los penales y los drops, que son la mitad de lo
 * que hace un pateador. Boffelli hizo 67 puntos en el Mundial 2023 y esa cuenta
 * da 28. Los puntos van por temporada, que es donde el proveedor los publica
 * completos.
 *
 * ── EL RESULTADO SON DOS BANDERAS, NO UN MARCADOR ───────────────────────────
 * `win` y `draw`. Empatado es `draw: true`; perdido es `win: false` con `draw`
 * en falso. Leerlo al reves —tomar `win: false` como derrota sin mirar `draw`—
 * convierte todos los empates en derrotas y nadie lo ve hasta que un hincha
 * cuenta los partidos.
 */
function partidosDeLaFicha(html: string): RugbyPassPlayerMatch[] {
    const salida: RugbyPassPlayerMatch[] = [];

    for (const bloque of arrayJsonEmbebido(html, 'app-competitions') as RawMatchBlock[]) {
        const juegos = Array.isArray(bloque?.games) ? (bloque.games as RawMatch[]) : [];
        for (const g of juegos) {
            const title = decodeRugbyPassEntities(String(g?.title ?? '').trim());
            if (!title) continue;
            const st = g?.stats ?? null;

            salida.push({
                title,
                kickoff: numeroOpcional(g?.time),
                competitionName: decodeRugbyPassEntities(String(g?.compTitle ?? '').trim()),
                competitionLogo: cdnUrl(String(g?.compLogo ?? '')),
                opponentName: decodeRugbyPassEntities(String(g?.opposition?.name ?? '').trim()),
                opponentLogo: cdnUrl(String(g?.opposition?.logo ?? '')),
                result: g?.draw === true ? 'draw' : g?.win === true ? 'win' : 'loss',
                minutes: numeroOpcional(st?.mins),
                points: puntosDe(numeroOpcional(st?.tries), numeroOpcional(st?.conversions)),
                tries: numeroOpcional(st?.tries),
                conversions: numeroOpcional(st?.conversions),
                yellowCards: numeroOpcional(st?.yellow_cards),
                redCards: numeroOpcional(st?.red_cards),
            });
        }
    }

    // El proveedor los agrupa por competicion; la pantalla los lee como una sola
    // linea de tiempo. Del mas nuevo al mas viejo, y los sin fecha al final:
    // colarlos adelante pondria un partido sin dia arriba del ultimo jugado.
    return salida.sort((a, b) => (b.kickoff ?? -Infinity) - (a.kickoff ?? -Infinity));
}

/** Solo las claves con valor numerico de la planilla cruda. */
function numerosDe(planilla: unknown): Record<string, number> {
    const salida: Record<string, number> = {};
    if (!planilla || typeof planilla !== 'object') return salida;
    for (const [k, v] of Object.entries(planilla as Record<string, unknown>)) {
        if (typeof v === 'number' && Number.isFinite(v)) salida[k] = v;
    }
    return salida;
}

/**
 * La ficha individual. `null` cuando la pagina no publica NI el nombre, que es
 * el 200 vacio de los retirados.
 */
export function parseRugbyPassPlayerProfile(
    html: string,
    slug: string
): RugbyPassPlayerProfile | null {
    const texto = String(html ?? '');

    const encabezado = texto.match(RE_ENCABEZADO);
    const name = decodeRugbyPassEntities(encabezado?.[2] ?? '').trim();
    if (!name) return null;

    // Los detalles se leen como PARES etiqueta -> valor y no por posicion: la
    // pagina dibuja SOLO los campos que tiene. Will Reilly trae dos ("Position",
    // "Weight") y Pablo Matera cinco; leerlos por indice le pondria el peso en
    // la altura al primero, y una altura de "89kg" no la ve nadie hasta que la
    // ve un usuario.
    const detalles = new Map<string, string>();
    RE_DETALLE.lastIndex = 0;
    for (let m = RE_DETALLE.exec(texto); m; m = RE_DETALLE.exec(texto)) {
        const etiqueta = textoPlano(m[1]);
        if (etiqueta) detalles.set(etiqueta, m[2]);
    }

    // La nacionalidad viene SOLO como bandera: el nombre del pais esta en el
    // `alt` de la imagen y no hay texto al lado.
    const crudoNacionalidad = detalles.get('Nationality') ?? '';
    const bandera = crudoNacionalidad.match(/<img[^>]+src="([^"]+)"/i)?.[1] ?? '';
    const nacionalidad = decodeRugbyPassEntities(
        crudoNacionalidad.match(/<img[^>]+alt="([^"]*)"/i)?.[1] ?? ''
    ).trim() || textoPlano(crudoNacionalidad);

    const edad = numeroOpcional(textoPlano(detalles.get('Age') ?? ''));

    const clubActual = texto.match(RE_CLUB_ACTUAL);
    const logoActual = texto.match(/top-team-logo[^>]+logos\/png\/(\d+)\.png/i)?.[1] ?? '';

    // La seccion "Teams" se acota antes de recorrerla: el mismo patron de link
    // aparece arriba, en el encabezado, y sin acotar el club actual entraria dos
    // veces en la trayectoria.
    const desdeTeams = texto.indexOf('<div class="player-teams">');
    const seccion = desdeTeams < 0 ? '' : texto.slice(desdeTeams);

    const trayectoria: RugbyPassPlayerTeamLink[] = [];
    const vistos = new Set<string>();
    RE_CLUB_TRAYECTORIA.lastIndex = 0;
    for (let m = RE_CLUB_TRAYECTORIA.exec(seccion); m; m = RE_CLUB_TRAYECTORIA.exec(seccion)) {
        const s = m[1];
        if (vistos.has(s)) continue;
        const nombre = decodeRugbyPassEntities(m[3] ?? '').trim();
        if (!nombre) continue;
        vistos.add(s);
        trayectoria.push({
            name: nombre,
            slug: s,
            logo: cdnUrl(`webp-images/images/team-images/logos/png/${m[2]}.png.webp`),
        });
    }

    const seasons: RugbyPassPlayerSeason[] = [];
    let goalKicker = false;
    for (const crudo of arrayJsonEmbebido(texto, 'app-comp-stats') as RawSeasonBlock[]) {
        const competicion = crudo?.competition;
        const competitionName = decodeRugbyPassEntities(String(competicion?.name ?? '').trim());
        if (!competitionName) continue;

        const planilla = crudo?.competition?.stats?.stats;
        if ((numeroOpcional(planilla?.penalty_goals) ?? 0) > 0 ||
            (numeroOpcional(planilla?.drop_goals) ?? 0) > 0) {
            goalKicker = true;
        }

        const stats = rubrosDe(crudo);
        const minutes = numeroOpcional(crudo?.main?.totalMinsPlayed);
        // Una temporada sin minutos y sin un solo rubro no es una temporada: es
        // una fila vacia que ensucia la pantalla.
        if (stats.length === 0 && minutes === null) continue;

        seasons.push({
            competitionId: numeroOpcional(competicion?.oid),
            competitionName,
            seasonLabel: String(competicion?.season?.label ?? '').trim(),
            logo: cdnUrl(String(competicion?.logoCircle ?? competicion?.logo ?? '')),
            minutes,
            points: numeroOpcional(crudo?.competition?.stats?.stats?.points),
            stats,
            rawStats: numerosDe(planilla),
        });
    }

    // La foto se busca DENTRO del encabezado del jugador y no en la pagina
    // entera. Suelta, la expresion pegaba en el primer `players/head/<n>.png`
    // que apareciera, y ese es el de un jugador RELACIONADO del carrusel de
    // noticias: los tres primeros que se probaron devolvian la misma cara —la de
    // Dupont, 452— y hasta Will Reilly, que no tiene foto, "tenia" la de el.
    const foto = texto.match(/head-shot-mobile[\s\S]{0,400}?images\/players\/head\/(\d+)\.png/i)?.[1] ?? '';

    const puesto = textoPlano(detalles.get('Position') ?? '') || null;

    return {
        slug,
        pageId: numeroOpcional(encabezado?.[1]),
        name,
        // El `maxw` es el que pide la propia ficha de RugbyPass para este mismo
        // avatar. Sin el, el CDN manda el original: 307 KB contra 106 KB, por
        // una imagen que se dibuja adentro de un circulo de 72 px.
        photo: foto ? cdnUrl(`webp-images/images/players/head/${foto}.png.webp?maxw=300`) : '',
        position: puesto,
        nationality: nacionalidad || null,
        nationalityFlag: bandera,
        // Una edad en `0` es "sin dato", no un recien nacido.
        age: edad !== null && edad > 0 ? edad : null,
        height: textoPlano(detalles.get('Height') ?? '') || null,
        weight: textoPlano(detalles.get('Weight') ?? '') || null,
        // El escudo del club actual sale del encabezado, pero no todas las fichas
        // lo dibujan (Will Reilly no lo trae). Cuando falta se toma el del mismo
        // club en la trayectoria, que es el MISMO slug y por lo tanto el mismo
        // escudo: no es una adivinanza, es el mismo dato escrito dos veces.
        currentTeam: clubActual
            ? {
                  name: decodeRugbyPassEntities(clubActual[2]).trim(),
                  slug: clubActual[1],
                  logo: logoActual
                      ? cdnUrl(`webp-images/images/team-images/logos/png/${logoActual}.png.webp`)
                      : trayectoria.find((t) => t.slug === clubActual[1])?.logo ?? '',
              }
            : null,
        teams: trayectoria,
        goalKicker: goalKicker || puesto === PUESTO_PATEADOR,
        seasons,
        matches: partidosDeLaFicha(texto),
    };
}
