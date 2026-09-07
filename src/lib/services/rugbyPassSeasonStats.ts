/**
 * LAS ESTADISTICAS DE UN TORNEO de RugbyPass — la parte pura.
 *
 * Hasta ahora el conector traia estadisticas de PARTIDO (la planilla por
 * jugador de `filter-players-stats`) pero ninguna de TORNEO, asi que la pestana
 * Estadisticas de `/tournaments/rp-comp-203` abria vacia. RugbyPass si las
 * publica, en `/<slug>/stats/`, y por dos vias distintas:
 *
 * ── 1. LIDERES ("Key Stats") ────────────────────────────────────────────────
 * Cuatro rubros, los cinco primeros de cada uno, para equipos y para jugadores.
 * Vienen como JSON PLANO embebido en la pagina (`#team-stats-data` y
 * `#player-stats-data`) y se recargan por temporada con `action=season-stats`.
 * Es lo unico que hay para jugadores: no existe un ranking completo por
 * competicion, y armarlo con el comparador serian 338 llamadas.
 *
 * Y ese bloque tiene un BUG DEL PROVEEDOR, medido en tres temporadas: pedirle
 * `season-stats` de una temporada vieja devuelve bien los equipos (Toulouse
 * 147 tries en 2025-26, Racing 92 84 en 2022-23) pero los JUGADORES vuelven
 * siempre los de la temporada en curso — el mismo "Rayan Rebbadj, 2 tries"
 * para 2025-26, 2024-25 y 2022-23. Por eso el podio de jugadores solo se emite
 * para la temporada que la pagina abre: un podio de dos tries rotulado
 * "2022-23" no se lee como un dato que falta, se lee como un dato.
 *
 * ── 2. TABLA DE EQUIPOS ─────────────────────────────────────────────────────
 * Unos veinte rubros por club (ataque, defensa, disciplina), que solo salen del
 * comparador `action=team-h2h-stats`. Ese endpoint contesta de a DOS clubes,
 * pero los valores son el TOTAL de la temporada de cada uno y no dependen del
 * rival: Toulouse da 147 tries contra Bayonne y 147 contra Pau. Por eso la tabla
 * entera se arma emparejando los clubes de a dos — catorce clubes son siete
 * llamadas, no noventa y una.
 *
 * OJO con dos silencios caros, los dos medidos:
 *
 *   · `team-h2h-stats` quiere el **oid** de Opta (Toulouse = 2350), no el `rpid`
 *     con el que RugbyPass nombra el escudo (214). Con el rpid contesta 200 y
 *     `{"teamStats":[]}`: no es un error, es una tabla en blanco.
 *   · El comparador NO tiene datos hasta bien entrada la temporada. El Top 14
 *     con dos fechas jugadas devuelve cero equipos y cero jugadores —RugbyPass
 *     tampoco dibuja su propia seccion Head to Head— mientras que el NPC, a
 *     mitad de camino, devuelve catorce y 473. Una temporada sin comparador NO
 *     es una falla: se muestran los lideres y listo.
 *
 * Aca no hay red: esto parsea y ordena. La red esta en `rugbyPass.ts`.
 */

/** Una temporada como la nombra RugbyPass, con el rotulo ya en el idioma del proyecto. */
export interface RugbyPassStatsSeason {
    /** El numero interno de RugbyPass, que es el que viaja en `season`. */
    id: number;
    /** `2026-27` o `2026`, el mismo rotulo que usa el resto del torneo. */
    label: string;
}

/** Una fila de un ranking de lideres. */
export interface RugbyPassLeaderRow {
    position: number;
    name: string;
    /** El club. Vacio en el ranking de equipos, donde el club ES la fila. */
    team: string;
    logo: string;
    /** La foto del jugador. Vacia en el ranking de equipos. */
    photo: string;
    value: number | string;
}

/** Un rubro con sus cinco primeros. */
export interface RugbyPassLeaderBoard {
    key: string;
    title: string;
    rows: RugbyPassLeaderRow[];
}

/** Una columna de la tabla de equipos, con el grupo del que salio. */
export interface RugbyPassTeamStatColumn {
    key: string;
    /** El nombre completo, para el `title` de la cabecera. */
    label: string;
    /**
     * Lo que se dibuja en la cabecera.
     *
     * Va aparte porque veinte columnas de 76 px no entran "Tackles dominantes":
     * los rotulos largos se pisaban entre si. La abreviatura se lee, y el nombre
     * entero sigue estando a un hover.
     */
    short: string;
    group: string;
}

/** Un club de la competicion, con su planilla de la temporada. */
export interface RugbyPassTeamSeasonRow {
    oid: string;
    name: string;
    logo: string;
    color: string;
    stats: Record<string, number | string>;
}

/** Un club del comparador: nombre, escudo, color y el **oid** con el que se lo pide. */
export interface RugbyPassStatsTeam {
    oid: string;
    name: string;
    logo: string;
    color: string;
}

/** Lo que la pantalla necesita para dibujar la pestana entera. */
export interface RugbyPassSeasonStats {
    seasons: RugbyPassStatsSeason[];
    season: RugbyPassStatsSeason | null;
    /**
     * La temporada que la pagina de RugbyPass abre por su cuenta.
     *
     * Viaja hasta la pantalla porque es la UNICA para la que los lideres de
     * jugadores son ciertos: el sitio ignora el parametro `season` en ese
     * bloque y siempre contesta el de la temporada en curso.
     */
    defaultSeason: string;
    teamLeaders: RugbyPassLeaderBoard[];
    playerLeaders: RugbyPassLeaderBoard[];
    teamColumns: RugbyPassTeamStatColumn[];
    teamRows: RugbyPassTeamSeasonRow[];
}

/**
 * El rotulo de RugbyPass al del proyecto: `2026/2027` a `2026-27`, y un ano
 * suelto queda como esta.
 *
 * Es lo que empareja la temporada elegida en la cabecera del torneo —que sale de
 * `rugbyPassSeasonOf`— con la que hay que pedirle al sitio. NO se puede derivar
 * el numero interno del rotulo: el NPC llama `2027` a su temporada `2026`, asi
 * que el numero se toma siempre de la lista que publica la pagina.
 */
export function normalizeRugbyPassSeasonLabel(raw: string): string {
    const texto = String(raw ?? '').trim();
    const cruzada = texto.match(/^(\d{4})\s*\/\s*(\d{4})$/);
    if (cruzada) return `${cruzada[1]}-${cruzada[2].slice(2)}`;
    return texto;
}

/**
 * El JSON que RugbyPass deja embebido en un `<div id="…">`.
 *
 * Se corta en el `</div>` siguiente y no hace falta nada mas fino: el JSON sale
 * del `json_encode` de PHP, que escapa la barra (`https:\/\/…`), asi que un
 * `</div>` no puede aparecer adentro.
 */
function bloqueJson(html: string, id: string): unknown {
    const documento = String(html ?? '');
    const i = documento.indexOf(`id="${id}"`);
    if (i < 0) return null;
    const abre = documento.indexOf('>', i);
    if (abre < 0) return null;
    const cierra = documento.indexOf('</div>', abre);
    if (cierra < 0) return null;
    try {
        return JSON.parse(documento.slice(abre + 1, cierra).trim());
    } catch {
        return null;
    }
}

function texto(valor: unknown): string {
    return typeof valor === 'string' ? valor : '';
}

/**
 * Las temporadas que ofrece el desplegable de la pagina de estadisticas.
 *
 * Se toma la PRIMERA lista `seasons:[…]` del documento, que es la del bloque de
 * lideres; la del comparador viene despues y es la misma.
 */
export function parseRugbyPassStatsSeasons(html: string): RugbyPassStatsSeason[] {
    const m = String(html ?? '').match(/seasons\s*:\s*(\[[\s\S]*?\])\s*,\s*sel/);
    if (!m) return [];
    let crudo: unknown;
    try {
        crudo = JSON.parse(m[1]);
    } catch {
        return [];
    }
    if (!Array.isArray(crudo)) return [];

    const salida: RugbyPassStatsSeason[] = [];
    for (const item of crudo) {
        const fila = item as { season?: unknown; label?: unknown };
        const id = Number(fila?.season);
        const label = normalizeRugbyPassSeasonLabel(texto(fila?.label));
        if (!Number.isFinite(id) || !label) continue;
        if (salida.some((s) => s.id === id)) continue;
        salida.push({ id, label });
    }
    return salida;
}

/** La temporada que la pagina ya trae dibujada, para no volver a pedirla. */
export function parseRugbyPassDefaultSeasonLabel(html: string): string {
    const m = String(html ?? '').match(/\bseason\s*:\s*"([^"]+)"/);
    return m ? normalizeRugbyPassSeasonLabel(m[1]) : '';
}

/**
 * Los rubros de la tabla de clubes, en castellano y con vocabulario de rugby.
 *
 * Va por CLAVE (`tackles_success`) y no por el rotulo ingles, porque la clave es
 * lo estable: RugbyPass escribe "Oflloads" con la errata incluida, y el dia que
 * la corrija un mapa por rotulo se queda mudo sin avisar.
 *
 * Un rubro que no este aca se muestra como lo manda el proveedor: preferible un
 * rotulo en ingles a una columna sin nombre.
 */
const RUBRO_ES: Readonly<Record<string, { label: string; short: string }>> = {
    total_tries: { label: 'Tries', short: 'TRIES' },
    tackles_success: { label: 'Tackles completados %', short: 'TCK%' },
    kicks_from_hand: { label: 'Patadas', short: 'PAT' },
    points: { label: 'Puntos', short: 'PTS' },
    penalty_goals: { label: 'Penales', short: 'PEN' },
    conversion_goals: { label: 'Conversiones', short: 'CONV' },
    drop_goals_converted: { label: 'Drops', short: 'DROP' },
    tackle_turnover: { label: 'Pelotas perdidas', short: 'PP' },
    carries: { label: 'Avances', short: 'AV' },
    metres: { label: 'Metros ganados', short: 'MTS' },
    clean_breaks: { label: 'Quiebres', short: 'QBR' },
    offloads: { label: 'Descargas', short: 'DESC' },
    defenders_beaten: { label: 'Rivales superados', short: 'SUP' },
    tackles: { label: 'Tackles', short: 'TCK' },
    missed_tackles: { label: 'Tackles errados', short: 'TCK-E' },
    dominant_tackles: { label: 'Tackles dominantes', short: 'TCK-D' },
    lineouts_won: { label: 'Lines ganados', short: 'LIN' },
    red_cards: { label: 'Rojas', short: 'TR' },
    yellow_cards: { label: 'Amarillas', short: 'TA' },
    penalties_conceded: { label: 'Penales cometidos', short: 'PC' },
};

/**
 * Los grupos y los rubros de los podios, que RugbyPass nombra por texto y no por
 * clave. Son pocos y no se mueven.
 */
const GRUPO_ES: Readonly<Record<string, string>> = {
    'Key Stats': 'Claves',
    'Attack': 'Ataque',
    'Defence': 'Defensa',
    'Discipline': 'Disciplina',
};

const PODIO_ES: Readonly<Record<string, string>> = {
    Tries: 'Tries',
    Tackles: 'Tackles',
    Kicks: 'Patadas',
    Points: 'Puntos',
};

/** Un titulo a una clave estable: `Tackles Completed` queda `tackles-completed`. */
function claveDe(titulo: string): string {
    return titulo.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

/** Los rubros de EQUIPOS. Cada fila trae el club, su escudo y el total. */
export function mapRugbyPassTeamLeaders(payload: unknown): RugbyPassLeaderBoard[] {
    if (!Array.isArray(payload)) return [];
    const salida: RugbyPassLeaderBoard[] = [];
    for (const grupo of payload) {
        const g = grupo as { title?: unknown; stat?: unknown; rows?: unknown };
        const title = texto(g?.title);
        if (!title || !Array.isArray(g?.rows)) continue;
        const rows: RugbyPassLeaderRow[] = [];
        for (const fila of g.rows as unknown[]) {
            const f = fila as { pos?: unknown; value?: unknown; team?: { name?: unknown; logo?: unknown } };
            const name = texto(f?.team?.name);
            if (!name) continue;
            rows.push({
                position: Number(f?.pos) || rows.length + 1,
                name,
                team: '',
                logo: texto(f?.team?.logo),
                photo: '',
                value: (f?.value as number | string) ?? 0,
            });
        }
        if (rows.length > 0) {
            salida.push({ key: texto(g?.stat) || claveDe(title), title: PODIO_ES[title] ?? title, rows });
        }
    }
    return salida;
}

/**
 * Los rubros de JUGADORES.
 *
 * RugbyPass parte cada rubro en dos: el puntero va aparte, en `player`, y los
 * demas en `rows` numerados desde el 2. Aca se juntan en una sola lista, que es
 * como se lee un ranking.
 */
export function mapRugbyPassPlayerLeaders(payload: unknown): RugbyPassLeaderBoard[] {
    if (!Array.isArray(payload)) return [];

    const aFila = (fila: unknown, posicion: number): RugbyPassLeaderRow | null => {
        const f = fila as {
            pos?: unknown; name?: unknown; value?: unknown;
            team?: unknown; logo?: unknown; photo?: unknown;
        };
        const name = texto(f?.name);
        if (!name) return null;
        return {
            position: Number(f?.pos) || posicion,
            name,
            team: texto(f?.team),
            logo: texto(f?.logo),
            photo: texto(f?.photo),
            value: (f?.value as number | string) ?? 0,
        };
    };

    const salida: RugbyPassLeaderBoard[] = [];
    for (const grupo of payload) {
        const g = grupo as { title?: unknown; player?: unknown; rows?: unknown };
        const title = texto(g?.title);
        if (!title) continue;
        const rows: RugbyPassLeaderRow[] = [];
        const puntero = aFila(g?.player, 1);
        if (puntero) rows.push(puntero);
        if (Array.isArray(g?.rows)) {
            for (const fila of g.rows as unknown[]) {
                const f = aFila(fila, rows.length + 1);
                if (f) rows.push(f);
            }
        }
        if (rows.length > 0) salida.push({ key: claveDe(title), title: PODIO_ES[title] ?? title, rows });
    }
    return salida;
}

/** Los lideres que la pagina ya trae dibujados, sin pedir nada. */
export function parseRugbyPassEmbeddedLeaders(html: string): {
    teamLeaders: RugbyPassLeaderBoard[];
    playerLeaders: RugbyPassLeaderBoard[];
} {
    return {
        teamLeaders: mapRugbyPassTeamLeaders(bloqueJson(html, 'team-stats-data')),
        playerLeaders: mapRugbyPassPlayerLeaders(bloqueJson(html, 'player-stats-data')),
    };
}

/** Los clubes que el comparador reconoce para una temporada. */
export function mapRugbyPassStatsTeams(payload: unknown): RugbyPassStatsTeam[] {
    const lista = (payload as { teams?: unknown })?.teams;
    if (!Array.isArray(lista)) return [];
    const salida: RugbyPassStatsTeam[] = [];
    for (const item of lista) {
        const t = item as { oid?: unknown; name?: unknown; logo?: unknown; color?: unknown };
        const oid = typeof t?.oid === 'number' ? String(t.oid) : texto(t?.oid);
        const name = texto(t?.name);
        if (!oid || !name) continue;
        if (salida.some((s) => s.oid === oid)) continue;
        salida.push({ oid, name, logo: texto(t?.logo), color: texto(t?.color) });
    }
    return salida;
}

/**
 * Una respuesta del comparador a las dos planillas que contiene.
 *
 * `team0` es el club que se pidio como `leftTeam` y `team1` el `rightTeam`. Los
 * valores no siempre son numeros: "Tackles Completed" viene como `"88%"`, y se
 * deja tal cual — pasarlo a numero le comeria el signo.
 */
export function mapRugbyPassTeamH2h(payload: unknown): {
    columns: RugbyPassTeamStatColumn[];
    left: Record<string, number | string>;
    right: Record<string, number | string>;
} {
    const grupos = (payload as { teamStats?: unknown })?.teamStats;
    const columns: RugbyPassTeamStatColumn[] = [];
    const left: Record<string, number | string> = {};
    const right: Record<string, number | string> = {};
    if (!Array.isArray(grupos)) return { columns, left, right };

    for (const grupo of grupos) {
        const g = grupo as { title?: unknown; items?: unknown };
        const group = texto(g?.title);
        if (!Array.isArray(g?.items)) continue;
        for (const item of g.items as unknown[]) {
            const it = item as { key?: unknown; name?: unknown; team0?: unknown; team1?: unknown };
            const key = texto(it?.key);
            const label = texto(it?.name);
            if (!key || !label) continue;
            // Un mismo rubro aparece en mas de un grupo (Tries esta en "Key
            // Stats" y en "Attack"): se queda con la primera aparicion, que es
            // la del grupo de mas arriba.
            if (!columns.some((c) => c.key === key)) {
                // Un rubro que el proveedor agregue y no este en el mapa se
                // muestra como el lo manda: mejor un rotulo en ingles que una
                // columna sin nombre.
                const traducido = RUBRO_ES[key];
                columns.push({
                    key,
                    label: traducido?.label ?? label,
                    short: traducido?.short ?? label,
                    group: GRUPO_ES[group] ?? group,
                });
            }
            left[key] = (it?.team0 as number | string) ?? '';
            right[key] = (it?.team1 as number | string) ?? '';
        }
    }
    return { columns, left, right };
}

/**
 * Las columnas y las filas de la tabla de equipos, a partir de las respuestas
 * del comparador ya emparejadas.
 *
 * Cada respuesta cubre DOS clubes; el ultimo de una lista impar se pide contra
 * si mismo, asi que su planilla llega repetida en los dos lados y alcanza con
 * leer uno.
 */
export function buildRugbyPassTeamTable(
    parejas: readonly {
        left: RugbyPassStatsTeam;
        right: RugbyPassStatsTeam;
        payload: unknown;
    }[]
): { columns: RugbyPassTeamStatColumn[]; rows: RugbyPassTeamSeasonRow[] } {
    const columns: RugbyPassTeamStatColumn[] = [];
    const porOid = new Map<string, RugbyPassTeamSeasonRow>();

    const guardar = (equipo: RugbyPassStatsTeam, stats: Record<string, number | string>) => {
        if (Object.keys(stats).length === 0) return;
        const previo = porOid.get(equipo.oid);
        if (previo) {
            Object.assign(previo.stats, stats);
            return;
        }
        porOid.set(equipo.oid, {
            oid: equipo.oid,
            name: equipo.name,
            logo: equipo.logo,
            color: equipo.color,
            stats,
        });
    };

    for (const { left, right, payload } of parejas) {
        const leido = mapRugbyPassTeamH2h(payload);
        for (const columna of leido.columns) {
            if (!columns.some((c) => c.key === columna.key)) columns.push(columna);
        }
        guardar(left, leido.left);
        if (right.oid !== left.oid) guardar(right, leido.right);
    }

    return { columns, rows: [...porOid.values()] };
}
