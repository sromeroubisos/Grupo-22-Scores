/**
 * Lectura de las DOS plataformas de datos del Mundial de Hockey 2026.
 *
 * El fixture, el marcador y las posiciones ya salen de Altius RT
 * (`fihHockeyParser.ts`). Lo que Altius NO publica —lo que pasó ADENTRO del
 * partido— vive repartido en otras dos fuentes, las mismas que consume
 * fih.hockey, las dos públicas y sin credenciales:
 *
 *   1. Sportradar Connect  `embed-api.eui.connect.sportradar.com/v1/embed/250`
 *      IDs UUID. Es la que manda en el partido: play-by-play, planilla por
 *      jugador, marcador por cuarto, árbitros.
 *        /fixtures?seasonId=…&sub=FIXTURES|RESULTS   grilla (ver abajo)
 *        /fixture_detail?fixtureId=…                 el partido entero
 *
 *   2. Sportz Interactive  `fih.hockey/datafeeds/static/json/en`
 *      IDs enteros, JSON estático en S3. Es la que sabe de EQUIPOS y GENTE:
 *      planteles, caps, historial entre selecciones.
 *        /sportradar/{serieId}_tour.json        participantes + el puente de IDs
 *        /squads/{serieId}_{teamId}_squad.json  plantel de 20
 *        /h2h/{matchId}_h2h.json                historial entre las dos
 *
 * EL PUENTE ENTRE LAS DOS es `_tour.json`: trae `sr_tour_id` (el seasonId de
 * Sportradar) y, por participante, `sr_team_id` junto al `team_id` de la FIH.
 * Por eso acá NO hay un solo UUID escrito a mano: el id de temporada se
 * descubre desde el id de competencia de Altius, que ya teníamos. Si la FIH
 * rota los UUID —lo hace— el código no se entera.
 *
 * Y el `matchId` del h2h es el MISMO número que Altius pone en `/matches/22334`,
 * o sea el que ya viaja adentro de nuestro `fih-match-m-22334`. El historial
 * sale gratis, sin resolver nada.
 *
 * Este módulo es PURO: entra JSON, sale dato. Sin red, sin caché, sin DOM. La
 * parte que descarga vive en `fihHockey.ts`. Los imports de valor van relativos
 * y con extensión porque `node --test` corre sin el resolver de alias de Next
 * (mismo motivo que en `fihHockeyParser.ts`).
 *
 * OJO CON LA GRILLA DE SPORTRADAR: `/fixtures` NO devuelve el torneo entero.
 * Devuelve la sub-página `FIXTURES` —lo que falta jugar— y saca de la lista lo
 * que ya se jugó, que queda en `sub=RESULTS`. Pedir una sola de las dos es
 * perder justo los partidos que tienen datos.
 */

/** El reloj de Sportradar: ISO-8601 de duración ("PT9M30S", "PT09M04S"). */
const ISO_DURATION_RE = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:([\d.]+)S)?$/;

// --------------------------------------------------------------------------
// Tipos
// --------------------------------------------------------------------------

export type FihSportradarFixture = {
    fixtureId: string;
    /** Instante de inicio en UTC (ISO), tal cual lo publica Sportradar. */
    startsAtIso: string | null;
    pool: string | null;
    homeCode: string | null;
    awayCode: string | null;
    status: string;
};

export type FihTimelineEvent = {
    id: string;
    /** Tipo canónico del catálogo de eventos de hockey de la app. */
    type: string;
    team: 'home' | 'away' | null;
    player: string;
    playerId: string | null;
    number: number | null;
    description: string;
    /** Minuto real de partido (0-60), no el reloj del cuarto. */
    minute: number;
    time: number;
    /** Q1…Q4 · ET (suplementario) · PEN (shoot-out). */
    period: string;
    order: number;
    scoreHome: number | null;
    scoreAway: number | null;
};

export type FihTeamStat = {
    key: string;
    type: string;
    label: string;
    home: string;
    away: string;
    home_value: number | null;
    away_value: number | null;
};

export type FihBoxScorePlayer = {
    id: string | null;
    name: string;
    number: number | null;
    position: string | null;
    isGoalkeeper: boolean;
    starter: boolean;
    played: boolean;
    team: 'home' | 'away';
    image: string | null;
    stats: Record<string, number>;
};

export type FihPeriodScore = {
    period: string;
    label: string;
    home: number | null;
    away: number | null;
};

/** `role` es el código del feed (`UMPIRE`, `JUDGE_TIMING`), `label` lo legible. */
export type FihOfficial = { name: string; role: string; label: string };

export type FihMatchDetail = {
    events: FihTimelineEvent[];
    teamStats: FihTeamStat[];
    players: FihBoxScorePlayer[];
    periods: FihPeriodScore[];
    officials: FihOfficial[];
    attendance: number | null;
    status: string;
};

export type FihTourTeam = {
    /** Código de 3 letras, la misma llave que usan las filas de Altius. */
    code: string;
    /** Id de la FIH: el que arma la URL del plantel. Cambia según el género. */
    teamId: number;
    /** Id de Sportradar (`entityId`): el que aparece en el play-by-play. */
    srTeamId: string | null;
    name: string;
};

export type FihTour = {
    /** `seasonId` de Sportradar, descubierto — no escrito a mano. */
    seasonId: string | null;
    seriesName: string;
    teams: FihTourTeam[];
};

export type FihSquadPlayer = {
    id: string;
    name: string;
    number: number | null;
    caps: number | null;
    isGoalkeeper: boolean;
    /** `personId` de Sportradar: cruza el plantel con la planilla del partido. */
    srPersonId: string | null;
    image: string | null;
};

export type FihH2HMatch = {
    matchId: string | null;
    dateIso: string | null;
    timestamp: number | null;
    homeCode: string;
    awayCode: string;
    homeName: string;
    awayName: string;
    homeScore: number | null;
    awayScore: number | null;
    tournamentName: string;
};

export type FihH2HBalance = {
    code: string;
    name: string;
    played: number;
    won: number;
    lost: number;
    drawn: number;
};

export type FihH2H = { balance: FihH2HBalance[]; matches: FihH2HMatch[] };

// --------------------------------------------------------------------------
// Utilidades
// --------------------------------------------------------------------------

function asRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : null;
}

function asArray(value: unknown): unknown[] {
    return Array.isArray(value) ? value : [];
}

function readText(value: unknown): string {
    if (typeof value === 'string') return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
    return '';
}

function readNumber(value: unknown): number | null {
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (typeof value === 'string' && value.trim()) {
        const parsed = Number(value.trim());
        return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
}

/** "PT9M30S" -> 570 segundos. Null si no es una duración legible. */
export function parseIsoDurationSeconds(value: unknown): number | null {
    const raw = readText(value);
    if (!raw) return null;

    const match = ISO_DURATION_RE.exec(raw);
    if (!match) return null;

    const [, days, hours, minutes, seconds] = match;
    if (!days && !hours && !minutes && !seconds) return null;

    return Number(days || 0) * 86400
        + Number(hours || 0) * 3600
        + Number(minutes || 0) * 60
        + Number(seconds || 0);
}

/**
 * Llave con la que se cruzan las dos grillas: Altius y Sportradar publican el
 * mismo partido con identificadores distintos, pero coinciden en los códigos de
 * las selecciones y en el horario UTC.
 *
 * El par va ORDENADO y el horario se recorta al DÍA. Lo primero, porque cuál es
 * local es una convención que las dos fuentes podrían escribir al revés; lo
 * segundo, porque un adelanto de media hora en la programación no puede romper
 * el cruce, y dos selecciones no se enfrentan dos veces el mismo día.
 */
export function fihFixtureJoinKey(
    homeCode: string | null,
    awayCode: string | null,
    startsAtIso: string | null,
): string | null {
    const home = readText(homeCode).toUpperCase();
    const away = readText(awayCode).toUpperCase();
    if (!home || !away) return null;

    const pair = [home, away].sort().join('-');
    const day = readText(startsAtIso).slice(0, 10);
    return day ? `${pair}@${day}` : pair;
}

// --------------------------------------------------------------------------
// Sportradar · grilla
// --------------------------------------------------------------------------

function competitorSides(competitors: unknown[]) {
    const records = competitors.map(asRecord).filter((entry): entry is Record<string, unknown> => entry !== null);
    const home = records.find((entry) => entry.isHome === true) || records[0] || null;
    const away = records.find((entry) => entry.isHome !== true && entry !== home) || records[1] || null;
    return { home, away };
}

export function parseSportradarFixtures(payload: unknown): FihSportradarFixture[] {
    const fixtures = asArray(asRecord(asRecord(payload)?.data)?.fixtures);

    return fixtures.flatMap((raw): FihSportradarFixture[] => {
        const fixture = asRecord(raw);
        const fixtureId = readText(fixture?.fixtureId);
        if (!fixture || !fixtureId) return [];

        const { home, away } = competitorSides(asArray(fixture.competitors));
        const startsAtIso = readText(fixture.startTimeUTC);

        return [{
            fixtureId,
            // Sportradar escribe el UTC sin sufijo de zona. Sin la Z, `new Date`
            // lo lee como hora local del servidor y el partido se corre tantas
            // horas como tenga de offset la máquina que corra esto.
            startsAtIso: startsAtIso ? `${startsAtIso.replace(/Z$/, '')}Z` : null,
            pool: readText(fixture.pool) || null,
            homeCode: readText(home?.code).toUpperCase() || null,
            awayCode: readText(away?.code).toUpperCase() || null,
            status: readText(asRecord(fixture.status)?.value),
        }];
    });
}

// --------------------------------------------------------------------------
// Sportradar · detalle del partido
// --------------------------------------------------------------------------

/**
 * Vocabulario de Sportradar -> el catálogo de eventos de hockey de la app
 * (`matchEventCatalog.ts`). No es una traducción libre: los tipos de la
 * izquierda son los ÚNICOS que emite el feed y los de la derecha ya existen con
 * su semántica —el corner corto suma solo si termina en gol, el stroke igual—,
 * así que la cronología y las estadísticas derivadas leen esto sin saber de
 * dónde vino.
 */
const EVENT_TYPE_MAP: Record<string, string> = {
    goal: 'goal',
    penaltycorner: 'penalty_corner',
    penaltystroke: 'penalty_stroke',
    greencard: 'green_card',
    yellowcard: 'yellow_card',
    redcard: 'red_card',
    shootout: 'penalty_stroke',
    shootoutattempt: 'penalty_stroke',
};

const EVENT_DESCRIPTIONS: Record<string, string> = {
    goal: 'Gol',
    penalty_corner: 'Corner corto',
    penalty_stroke: 'Penal stroke',
    green_card: 'Tarjeta verde',
    yellow_card: 'Tarjeta amarilla',
    red_card: 'Tarjeta roja',
};

/**
 * `periodId` de Sportradar -> el vocabulario de períodos de la app. Los cuartos
 * son 1-4; del 10 en adelante son suplementario y shoot-out.
 */
function periodCode(periodId: number | null, label: string): string {
    if (periodId === 1 || periodId === 2 || periodId === 3 || periodId === 4) return `Q${periodId}`;
    if (periodId === 12) return 'PEN';
    if (periodId !== null && periodId >= 10) return 'ET';

    const upper = label.toUpperCase();
    if (/^Q[1-4]$/.test(upper)) return upper;
    if (upper === 'PEN' || upper === 'SO') return 'PEN';
    if (upper.startsWith('OT')) return 'ET';
    return upper || 'Q1';
}

const PERIOD_LABELS: Record<string, string> = {
    Q1: '1° cuarto',
    Q2: '2° cuarto',
    Q3: '3° cuarto',
    Q4: '4° cuarto',
    ET: 'Suplementario',
    PEN: 'Shoot-out',
};

const TEAM_STAT_LABELS: Record<string, string> = {
    goalsScored: 'Goles',
    fieldGoalsScored: 'Goles de jugada',
    penaltyCornersEarned: 'Corners cortos',
    penaltyCornersScored: 'Goles de corner',
    penaltyCornersEfficency: 'Efectividad de corner',
    penaltyStrokesEarned: 'Penales stroke',
    penaltyStrokesScored: 'Strokes convertidos',
    penaltyStrokesSaved: 'Strokes atajados',
    penaltyStrokesMissed: 'Strokes errados',
    greenCards: 'Tarjetas verdes',
    yellowCards: 'Tarjetas amarillas',
    redCards: 'Tarjetas rojas',
};

/**
 * Orden de la planilla, de lo más mirado a lo menos. `goalsConceded` queda
 * AFUERA a propósito: son los goles del rival, ya están en la fila de arriba, y
 * repetidos convierten una tabla comparativa en un espejo.
 */
const TEAM_STAT_ORDER = [
    'goalsScored',
    'fieldGoalsScored',
    'penaltyCornersEarned',
    'penaltyCornersScored',
    'penaltyCornersEfficency',
    'penaltyStrokesEarned',
    'penaltyStrokesScored',
    'penaltyStrokesSaved',
    'penaltyStrokesMissed',
    'greenCards',
    'yellowCards',
    'redCards',
];

const PERCENT_STATS = new Set(['penaltyCornersEfficency']);

function statText(key: string, value: number | null): string {
    if (value === null) return '';
    if (PERCENT_STATS.has(key)) return `${Math.round(value * 10) / 10}%`;
    return String(value);
}

function detailRoot(payload: unknown) {
    const data = asRecord(asRecord(payload)?.data);
    const bannerFixture = asRecord(asRecord(data?.banner)?.fixture);
    return { data, bannerFixture };
}

function detailSides(payload: unknown) {
    const { data, bannerFixture } = detailRoot(payload);
    const { home, away } = competitorSides(asArray(bannerFixture?.competitors));
    const base = asRecord(asRecord(asRecord(data?.statistics)?.data)?.base);
    return { data, bannerFixture, home, away, base };
}

function parseEvents(payload: unknown): FihTimelineEvent[] {
    const { data, bannerFixture, home, away } = detailSides(payload);
    const periods = asRecord(bannerFixture?.matchEvents);
    if (!periods) return [];

    const periodLabels = asRecord(asRecord(data?.periodData)?.periodLabels) || {};
    const homeId = readText(home?.entityId);
    const awayId = readText(away?.entityId);

    // El feed solo pone el nombre del jugador en los goles. Para tarjetas y
    // corners se lo pedimos a la planilla, que sí lo trae siempre.
    const roster = new Map<string, { name: string; number: number | null }>();
    for (const player of parseBoxScore(payload)) {
        if (player.id) roster.set(player.id, { name: player.name, number: player.number });
    }

    const events: FihTimelineEvent[] = [];
    const periodKeys = Object.keys(periods).sort((left, right) => Number(left) - Number(right));

    for (const periodKey of periodKeys) {
        const period = asRecord(periods[periodKey]);
        if (!period) continue;

        const periodId = readNumber(periodKey);
        const code = periodCode(periodId, readText(periodLabels[periodKey]));
        const durationSeconds = (readNumber(period.durationMinutes) || 0) * 60;
        const beforeSeconds = (readNumber(period.elapsedMinutesBeforePeriod) || 0) * 60;

        for (const raw of asArray(period.events)) {
            const event = asRecord(raw);
            if (!event) continue;

            const type = EVENT_TYPE_MAP[readText(event.eventType).toLowerCase()];
            if (!type) continue;

            // El reloj de Sportradar cuenta HACIA ATRÁS adentro del cuarto
            // (15:00 -> 0:00), así que el minuto de partido es lo transcurrido
            // antes del cuarto más lo que el cuarto ya consumió.
            const remaining = parseIsoDurationSeconds(event.clock);
            const elapsed = remaining === null
                ? 0
                : Math.max(0, durationSeconds - remaining);
            const minute = Math.round((beforeSeconds + elapsed) / 60);

            const personId = readText(event.personId) || null;
            const fromRoster = personId ? roster.get(personId) : undefined;
            const entityId = readText(event.entityId);
            const scores = asRecord(event.scores) || {};

            events.push({
                id: readText(event.eventId) || `${code}-${events.length}`,
                type,
                team: entityId && entityId === homeId ? 'home' : entityId && entityId === awayId ? 'away' : null,
                player: readText(event.name) || fromRoster?.name || '',
                playerId: personId,
                number: readNumber(event.bib) ?? fromRoster?.number ?? null,
                // El `desc` del feed viene en inglés ("Penalty Corner") y va a
                // parar abajo del nombre del jugador en la cronología, así que
                // manda el nuestro.
                description: EVENT_DESCRIPTIONS[type] || readText(event.desc),
                minute,
                time: minute,
                period: code,
                order: events.length,
                scoreHome: homeId ? readNumber(scores[homeId]) : null,
                scoreAway: awayId ? readNumber(scores[awayId]) : null,
            });
        }
    }

    return events;
}

function parseTeamStats(payload: unknown): FihTeamStat[] {
    const { base } = detailSides(payload);
    const homeTotals = asRecord(asRecord(base?.home)?.totalEntityStats) || {};
    const awayTotals = asRecord(asRecord(base?.away)?.totalEntityStats) || {};

    const keys = [
        ...TEAM_STAT_ORDER.filter((key) => key in homeTotals || key in awayTotals),
        ...Object.keys(homeTotals).filter((key) => !TEAM_STAT_ORDER.includes(key) && key !== 'goalsConceded'),
    ];

    return keys.flatMap((key): FihTeamStat[] => {
        const homeValue = readNumber(homeTotals[key]);
        const awayValue = readNumber(awayTotals[key]);
        // Antes del bols la planilla existe con todos los campos en null. Una
        // tabla de trece filas vacías dice menos que no mostrar nada.
        if (homeValue === null && awayValue === null) return [];

        const label = TEAM_STAT_LABELS[key] || key;
        return [{
            key,
            type: label,
            label,
            home: statText(key, homeValue),
            away: statText(key, awayValue),
            home_value: homeValue,
            away_value: awayValue,
        }];
    });
}

export function parseBoxScore(payload: unknown): FihBoxScorePlayer[] {
    const { base } = detailSides(payload);
    if (!base) return [];

    const players: FihBoxScorePlayer[] = [];

    for (const side of ['home', 'away'] as const) {
        const block = asRecord(base[side]);
        if (!block) continue;

        for (const rawTable of asArray(block.persons)) {
            const table = asRecord(rawTable);
            if (!table) continue;

            for (const rawRow of asArray(table.rows)) {
                const row = asRecord(rawRow);
                const name = readText(row?.personName);
                if (!row || !name) continue;

                const stats: Record<string, number> = {};
                for (const [key, value] of Object.entries(asRecord(row.statistics) || {})) {
                    const numeric = readNumber(value);
                    if (numeric !== null) stats[key] = numeric;
                }

                const position = readText(row.position) || null;
                players.push({
                    id: readText(row.personId) || null,
                    name,
                    number: readNumber(row.bib),
                    position,
                    isGoalkeeper: position?.toUpperCase() === 'GK',
                    starter: row.starter === true,
                    played: row.participated !== false,
                    team: side,
                    image: readText(row.personImage) || null,
                    stats,
                });
            }
        }
    }

    return players;
}

function parsePeriodScores(payload: unknown): FihPeriodScore[] {
    const { data, home, away } = detailSides(payload);
    const periodData = asRecord(data?.periodData);
    const teamScores = asRecord(periodData?.teamScores);
    if (!teamScores) return [];

    const periodLabels = asRecord(periodData?.periodLabels) || {};
    const readSide = (entityId: string) => {
        const rows = new Map<number, number | null>();
        for (const raw of asArray(teamScores[entityId])) {
            const entry = asRecord(raw);
            const periodId = readNumber(entry?.periodId);
            if (periodId !== null) rows.set(periodId, readNumber(entry?.score));
        }
        return rows;
    };

    const homeRows = readSide(readText(home?.entityId));
    const awayRows = readSide(readText(away?.entityId));
    const periodIds = Array.from(new Set([...homeRows.keys(), ...awayRows.keys()])).sort((l, r) => l - r);

    return periodIds.map((periodId) => {
        const code = periodCode(periodId, readText(periodLabels[String(periodId)]));
        return {
            period: code,
            label: PERIOD_LABELS[code] || readText(periodLabels[String(periodId)]) || code,
            home: homeRows.get(periodId) ?? null,
            away: awayRows.get(periodId) ?? null,
        };
    });
}

function parseOfficials(payload: unknown): FihOfficial[] {
    const { data } = detailRoot(payload);
    return asArray(asRecord(data?.teamStaff)?.matchOfficials).flatMap((raw): FihOfficial[] => {
        const official = asRecord(raw);
        const name = readText(official?.name);
        if (!name) return [];
        const role = readText(official?.role).toUpperCase();
        return [{ name, role, label: readText(official?.roleLabel) || role }];
    });
}

export function parseSportradarMatchDetail(payload: unknown): FihMatchDetail {
    const { bannerFixture } = detailRoot(payload);

    return {
        events: parseEvents(payload),
        teamStats: parseTeamStats(payload),
        players: parseBoxScore(payload),
        periods: parsePeriodScores(payload),
        officials: parseOfficials(payload),
        attendance: readNumber(bannerFixture?.attendance),
        status: readText(bannerFixture?.status),
    };
}

// --------------------------------------------------------------------------
// Sportz Interactive · equipos y gente
// --------------------------------------------------------------------------

export function parseFihTour(payload: unknown): FihTour {
    const root = asRecord(payload);
    const series = asArray(root?.series).map(asRecord).filter((entry): entry is Record<string, unknown> => entry !== null);
    const first = series[0] || null;

    const teams = asArray(first?.participants).flatMap((raw): FihTourTeam[] => {
        const participant = asRecord(raw);
        const code = readText(participant?.team_name_short).toUpperCase();
        const teamId = readNumber(participant?.team_id);
        if (!code || teamId === null) return [];

        return [{
            code,
            teamId,
            srTeamId: readText(participant?.sr_team_id) || null,
            name: readText(participant?.team_name) || code,
        }];
    });

    return {
        seasonId: readText(root?.sr_tour_id) || null,
        seriesName: readText(root?.tour_name) || readText(first?.series_name),
        teams,
    };
}

export function parseFihSquad(payload: unknown): FihSquadPlayer[] {
    const players = asArray(asRecord(asRecord(payload)?.squads)?.players);

    return players.flatMap((raw): FihSquadPlayer[] => {
        const player = asRecord(raw);
        const name = readText(player?.name);
        const id = readText(player?.person_id) || readText(player?.id);
        if (!player || !name) return [];

        return [{
            id: id || name,
            name,
            number: readNumber(player.jersey_no),
            caps: readNumber(player.caps),
            isGoalkeeper: player.is_goalkeeper === true,
            srPersonId: readText(player.si_person_id) || null,
            image: readText(player.player_image_url) || null,
        }];
    });
}

export function parseFihH2H(payload: unknown): FihH2H {
    const root = asRecord(payload);

    const balance = asArray(root?.teams).flatMap((raw): FihH2HBalance[] => {
        const team = asRecord(raw);
        const name = readText(team?.team_name);
        if (!name) return [];
        return [{
            code: readText(team?.team_short_name).toUpperCase(),
            name,
            played: readNumber(team?.matches_played) ?? 0,
            won: readNumber(team?.won) ?? 0,
            lost: readNumber(team?.lost) ?? 0,
            drawn: readNumber(team?.tied) ?? 0,
        }];
    });

    const matches = asArray(root?.last_n_matches).flatMap((raw): FihH2HMatch[] => {
        const entry = asRecord(raw);
        const homeName = readText(entry?.team1_name);
        const awayName = readText(entry?.team2_name);
        if (!entry || !homeName || !awayName) return [];

        const date = readText(entry.match_date);
        const time = readText(entry.match_time) || '00:00:00';
        // Las fechas del feed vienen sin huso. Se leen como UTC —no como hora
        // local del servidor— para que el año/día no se corra en Vercel.
        const parsed = date ? Date.parse(`${date}T${time}Z`) : NaN;

        return [{
            matchId: readText(entry.match_id) || null,
            dateIso: date || null,
            timestamp: Number.isNaN(parsed) ? null : Math.floor(parsed / 1000),
            homeCode: readText(entry.team1_short_name).toUpperCase(),
            awayCode: readText(entry.team2_short_name).toUpperCase(),
            homeName,
            awayName,
            homeScore: readNumber(entry.team1_score),
            awayScore: readNumber(entry.team2_score),
            tournamentName: readText(entry.comp_name),
        }];
    });

    return { balance, matches };
}
