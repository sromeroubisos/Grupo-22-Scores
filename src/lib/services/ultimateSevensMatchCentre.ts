/**
 * La página de un partido en el match centre de Ultimate Sevens
 * (`/match-centre/fixtures/<slug>/`, el `webUrl` de cada partido).
 *
 * La REST de la liga (`/wp-json/afz/v1`) trae el fixture y el marcador, y nada
 * más: `/fixture/{id}/matchreport` contesta vacío. La cronología y las
 * estadísticas del partido existen, pero solo en el HTML de la página, que el
 * servidor arma entero (bloques `data-stats-block="match-timeline"` y
 * `"match-stats"`). No hay un JSON detrás: el `data-api` de esos bloques viene
 * vacío. Así que se lee el HTML.
 *
 * Qué trae, medido en Cardiff (12/09):
 *
 *   - la cronología, con minuto, lado y jugador. Son 60-130 hechos por partido
 *     y la mayoría es planilla ("In Play - Passes" 25 veces, tackles, lines):
 *     acá entra lo que se lee en una cronología de rugby —tries, conversiones,
 *     tarjetas, tiempos muertos— y el resto queda en las estadísticas.
 *   - diez a doce filas de estadísticas por equipo (scrums, lines, tackles,
 *     line breaks, penales...).
 *
 * El marcador de la liga NO es el del rugby: try 5, try bajo los palos 7 sin
 * conversión, y conversiones de 1, 2 o 4 según la zona que elige el equipo. La
 * cronología publica cuánto valió cada tanto ("Conversion - Scored (2 Points)")
 * y eso viaja en `points`: con la tabla del rugby el marcador parcial mentiría.
 * Verificado: la suma de los tantos de cada lado da el marcador final en los
 * partidos de Cardiff, golden point incluido.
 *
 * Módulo PURO: entra HTML, sale dato. Se prueba con `node --test`.
 */

export type Us7EventType = 'try' | 'penalty_try' | 'conversion' | 'card_yellow' | 'card_red' | 'timeout';

export type Us7MatchEvent = {
    type: Us7EventType;
    side: 'home' | 'away';
    /** El minuto publicado. Null cuando la página no lo trae (a veces pone "—"). */
    minute: number | null;
    player: string | null;
    /** Lo que sumó en el marcador: 0 para una conversión errada, una tarjeta o un tiempo muerto. */
    points: number;
    /** Solo para conversiones: si entró. */
    made: boolean | null;
};

export type Us7TeamStat = {
    key: string;
    label: string;
    home: number;
    away: number;
};

export type Us7MatchCentre = {
    events: Us7MatchEvent[];
    stats: Us7TeamStat[];
};

// --------------------------------------------------------------------------
// HTML
// --------------------------------------------------------------------------

const ENTITIES: Record<string, string> = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#039;': "'",
    '&#39;': "'",
    '&#8211;': '-',
    '&#8212;': '-',
    '&ndash;': '-',
    '&mdash;': '-',
    '&nbsp;': ' ',
};

function textOf(fragment: string): string {
    return fragment
        .replace(/<[^>]*>/g, ' ')
        .replace(/&[#a-z0-9]+;/gi, (entity) => ENTITIES[entity.toLowerCase()] ?? ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

/** El contenido del primer `<span>` con esa clase BEM, o null. */
function spanText(fragment: string, className: string): string | null {
    const match = new RegExp(`<span[^>]*class="[^"]*\\b${className}\\b[^"]*"[^>]*>([\\s\\S]*?)</span>`).exec(fragment);
    if (!match) return null;
    const text = textOf(match[1]);
    return text || null;
}

/** El tramo del bloque `data-stats-block="<name>"`, hasta el cierre de su `<section>`. */
function blockOf(html: string, name: string): string {
    const start = html.indexOf(`data-stats-block="${name}"`);
    if (start < 0) return '';
    const end = html.indexOf('</section>', start);
    return html.slice(start, end < 0 ? undefined : end);
}

// --------------------------------------------------------------------------
// Cronología
// --------------------------------------------------------------------------

function pointsInLabel(label: string): number | null {
    const match = /\((\d+)\s*points?\)/i.exec(label);
    return match ? Number(match[1]) : null;
}

/**
 * Un rótulo de la cronología al evento que se muestra. `null` para la
 * planilla (pases, tackles, lines, scrums, patadas, penales cometidos): son
 * decenas por partido y ya están contados en las estadísticas.
 *
 * Formas vistas: "Try - Standard (5 Points)", "Try - Try (7 Points)" (el de
 * bajo los palos), "Conversion - Scored (1 Point)", "Conversion - Missed",
 * "Card - Yellow", "Timeout (90s)".
 */
export function classifyUs7TimelineLabel(label: string): Pick<Us7MatchEvent, 'type' | 'points' | 'made'> | null {
    const text = label.trim();

    if (/^try\b/i.test(text)) {
        const points = pointsInLabel(text) ?? 5;
        return { type: /penalty/i.test(text) ? 'penalty_try' : 'try', points, made: null };
    }
    if (/^conversion\b/i.test(text)) {
        if (/miss/i.test(text)) return { type: 'conversion', points: 0, made: false };
        const points = pointsInLabel(text);
        return points === null ? null : { type: 'conversion', points, made: true };
    }
    if (/^card\b.*yellow|^yellow\s*card/i.test(text)) return { type: 'card_yellow', points: 0, made: null };
    if (/^card\b.*red|^red\s*card/i.test(text)) return { type: 'card_red', points: 0, made: null };
    if (/^time\s*-?\s*out\b/i.test(text)) return { type: 'timeout', points: 0, made: null };
    return null;
}

function parseTimeline(html: string): Us7MatchEvent[] {
    const block = blockOf(html, 'match-timeline');
    const events: Us7MatchEvent[] = [];
    // Los hechos que el "Load More" todavía no mostró vienen igual en el HTML,
    // con `hidden`: la paginación es solo de pantalla.
    for (const item of block.matchAll(/<li\s+class="(stats-block-timeline__event[^"]*)"[^>]*>([\s\S]*?)<\/li>/g)) {
        const [, classes, body] = item;
        const side = /__event--away\b/.test(classes) ? 'away' : /__event--home\b/.test(classes) ? 'home' : null;
        const label = spanText(body, 'stats-block-timeline__label');
        if (!side || !label) continue;

        const kind = classifyUs7TimelineLabel(label);
        if (!kind) continue;

        const minuteText = /^\d+/.exec(spanText(body, 'stats-block-timeline__minute') ?? '');
        events.push({
            ...kind,
            side,
            minute: minuteText ? Number(minuteText[0]) : null,
            player: spanText(body, 'stats-block-timeline__player'),
        });
    }
    return events;
}

// --------------------------------------------------------------------------
// Estadísticas
// --------------------------------------------------------------------------

type StatRowSpec = { key: string; label: string; second?: { key: string; label: string } };

/**
 * Cómo se lee cada fila. Las de dos números ("1/0") son ganados/perdidos
 * —hechos/errados en los tackles—: comprobado contra la cronología del mismo
 * partido (10 tackles hechos y 1 errado en la planilla, 3/0 y 7/1 en la fila).
 * Van partidas en dos filas: un "1/0" comparado como número es un 10.
 */
const STAT_ROWS: Record<string, StatRowSpec> = {
    tries: { key: 'tries', label: 'Tries' },
    conversions: { key: 'conversions', label: 'Conversiones' },
    'line breaks': { key: 'line_breaks', label: 'Line breaks' },
    tackles: { key: 'tackles', label: 'Tackles', second: { key: 'tackles_missed', label: 'Tackles errados' } },
    offloads: { key: 'offloads', label: 'Offloads' },
    'penalties won': { key: 'penalties_won', label: 'Penales ganados' },
    'penalties conceded': { key: 'penalties_conceded', label: 'Penales cometidos' },
    scrums: { key: 'scrums_won', label: 'Scrums ganados', second: { key: 'scrums_lost', label: 'Scrums perdidos' } },
    lineouts: { key: 'lineouts_won', label: 'Lines ganados', second: { key: 'lineouts_lost', label: 'Lines perdidos' } },
    'kickoff kicks': { key: 'kickoffs_won', label: 'Salidas recuperadas', second: { key: 'kickoffs_lost', label: 'Salidas perdidas' } },
    kicks: { key: 'kicks_won', label: 'Patadas en juego ganadas', second: { key: 'kicks_lost', label: 'Patadas en juego perdidas' } },
};

/** El orden en que se leen: lo que hace el marcador primero, las formaciones fijas al final. */
const STAT_ORDER = [
    'tries', 'conversions', 'line_breaks', 'tackles', 'tackles_missed', 'offloads',
    'penalties_won', 'penalties_conceded', 'scrums_won', 'scrums_lost', 'lineouts_won',
    'lineouts_lost', 'kickoffs_won', 'kickoffs_lost', 'kicks_won', 'kicks_lost',
];

function numbersOf(value: string): number[] {
    return (value.match(/\d+/g) ?? []).map(Number);
}

function parseStats(html: string): Us7TeamStat[] {
    const block = blockOf(html, 'match-stats');
    const stats: Us7TeamStat[] = [];
    for (const row of block.matchAll(/<li\s+class="stats-block-match-stats__row"[^>]*>([\s\S]*?)<\/li>/g)) {
        const body = row[1];
        const rawLabel = spanText(body, 'stats-block-match-stats__label');
        const home = numbersOf(spanText(body, 'stats-block-match-stats__value--home') ?? '');
        const away = numbersOf(spanText(body, 'stats-block-match-stats__value--away') ?? '');
        if (!rawLabel || home.length === 0 || away.length === 0) continue;

        const known = STAT_ROWS[rawLabel.toLowerCase()];
        if (!known) {
            // Una fila que la liga agregue después entra con su nombre: mejor
            // en inglés que perdida.
            stats.push({ key: rawLabel.toLowerCase().replace(/[^a-z0-9]+/g, '_'), label: rawLabel, home: home[0], away: away[0] });
            continue;
        }
        stats.push({ key: known.key, label: known.label, home: home[0], away: away[0] });
        if (known.second && home.length > 1 && away.length > 1) {
            stats.push({ key: known.second.key, label: known.second.label, home: home[1], away: away[1] });
        }
    }

    const rank = (key: string) => {
        const index = STAT_ORDER.indexOf(key);
        return index < 0 ? STAT_ORDER.length : index;
    };
    return stats
        .map((stat, index) => ({ stat, index }))
        .sort((left, right) => rank(left.stat.key) - rank(right.stat.key) || left.index - right.index)
        .map(({ stat }) => stat);
}

/** La cronología y las estadísticas de la página de un partido. Vacíos si la página no las trae. */
export function parseUs7MatchCentreHtml(html: string): Us7MatchCentre {
    if (typeof html !== 'string' || !html) return { events: [], stats: [] };
    return { events: parseTimeline(html), stats: parseStats(html) };
}

/** Lo que suma cada lado según la cronología. */
export function us7EventTotals(events: Us7MatchEvent[]): { home: number; away: number } {
    const totals = { home: 0, away: 0 };
    for (const event of events) totals[event.side] += event.points;
    return totals;
}

// --------------------------------------------------------------------------
// A la pantalla
// --------------------------------------------------------------------------

/**
 * El período de un partido de la liga. No hay entretiempo: son diez minutos
 * corridos (más el golden point). Rotularlo "Primer tiempo" prometería un
 * segundo que no existe.
 */
export const US7_MATCH_PERIOD = 'TU';

export type Us7TimelineEvent = {
    type: Us7EventType;
    team: 'home' | 'away';
    player: string;
    playerId: null;
    description: string;
    /**
     * NÚMERO, no "10'": la cronología le pone el apóstrofe ella misma
     * (`LocalPublicEvent.minute`), y con texto dibujaba "10''".
     */
    minute: number;
    time: number;
    minuteNumber: number;
    period: string;
    order: number;
    /** Lo que valió el tanto. La pantalla lo usa en vez de la tabla del rugby. */
    points: number;
};

function pointsWord(points: number): string {
    return points === 1 ? '1 punto' : `${points} puntos`;
}

/** Cómo se lee cada hecho. Castellano de rugby, sin el inglés de la mesa. */
export function us7EventDescription(event: Pick<Us7MatchEvent, 'type' | 'points' | 'made' | 'player'>): string {
    const of = event.player ? ` de ${event.player}` : '';
    switch (event.type) {
        case 'try':
            // El de 7 es el apoyado en la zona bajo los palos: no se convierte.
            return event.points === 7 ? `Try bajo los palos${of} (7)` : `Try${of}`;
        case 'penalty_try':
            return 'Try penal (7)';
        case 'conversion':
            // La errada va con el marcador canónico del Match Center: la
            // cronología lo saca y agrega " · fallada" ella misma. Escrita
            // "errada" se leía dos veces ("Conversión errada · fallada").
            return event.made === false ? `[palos:miss] Conversión${of}` : `Conversión de ${pointsWord(event.points)}${of}`;
        case 'card_yellow':
            return `Tarjeta amarilla${of}`;
        case 'card_red':
            return `Tarjeta roja${of}`;
        case 'timeout':
            return 'Tiempo muerto (90 s)';
    }
}

/**
 * La cronología en la forma que dibuja `MatchTimeline`. El hecho sin minuto
 * toma el del anterior: la página los publica en orden, y en cero se iría al
 * principio de la cronología.
 */
export function toUs7Timeline(events: Us7MatchEvent[]): Us7TimelineEvent[] {
    let lastMinute = 0;
    return events.map((event, order) => {
        if (event.minute !== null) lastMinute = event.minute;
        const minute = event.minute ?? lastMinute;
        return {
            type: event.type,
            team: event.side,
            player: event.type === 'timeout' || event.type === 'penalty_try' ? '' : (event.player ?? ''),
            playerId: null,
            description: us7EventDescription(event),
            minute,
            time: minute,
            minuteNumber: minute,
            period: US7_MATCH_PERIOD,
            order,
            points: event.points,
        };
    });
}

/** Las estadísticas en la forma `{ label, home, away }` de la pestaña. */
export function toUs7StatRows(stats: Us7TeamStat[]): { label: string; home: number; away: number }[] {
    return stats.map((stat) => ({ label: stat.label, home: stat.home, away: stat.away }));
}
