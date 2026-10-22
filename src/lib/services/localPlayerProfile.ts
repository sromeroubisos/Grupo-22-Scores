/**
 * La ficha de un jugador LOCAL (una fila de `people`), armada desde lo que la
 * base realmente tiene cargado.
 *
 * El punto de todo este archivo: las columnas de `people` estan casi siempre
 * vacias —de 1528 jugadores, 144 tienen posicion y 38 fecha de nacimiento— asi
 * que una ficha que se dibuje con ellas queda en blanco para 9 de cada 10. Lo
 * que SI esta cargado son los partidos: `matches.lineups` dice quien jugo, con
 * que numero y si fue titular, y `match_events` dice que hizo. De ahi sale la
 * ficha.
 *
 * Dos reglas que no se rompen:
 *
 * 1. LOS PUNTOS NO SE CUENTAN ACA. Cuanto vale un try o si una conversion
 *    entro lo decide `getConfiguredEventPoints` con las definiciones del
 *    deporte. Sumar 5 por cada `try` a mano seria una segunda fuente de verdad
 *    que se desincroniza con el marcador del partido en el primer reglamento
 *    que cambie —y ademas cuenta como buenos los penales errados, que en el
 *    catalogo llevan `kickAtGoal`.
 *
 * 2. EL ESCUDO NO VIAJA EN BASE64. `clubs.logo_url` guarda PNG embebidos de
 *    hasta 200 KB; devolverlos infla la respuesta y ya tenemos el proxy
 *    (`/api/assets/team-logo`) que ademas redimensiona. Aca va el id del club
 *    y nada mas: el `<TeamLogo>` lo resuelve.
 */

import {
    buildMatchEventDefinitionMap,
    getDefaultMatchEventDefinitions,
    type MatchEventDefinition,
} from '@/lib/matchEventCatalog';
import { isGoalKickAttemptEvent, isGoalKickMade } from '@/lib/matchEventStats';
import { getConfiguredEventPoints } from '@/lib/matchStatsFromEvents';
import { positionLabelFromJerseyNumber } from '@/lib/types/squad';
import {
    addMatchToTotals,
    emptyMatchStats,
    emptyTotals,
    otherActionsOf,
} from './playerProfileAggregate';

type SupabaseLike = {
    from: (table: string) => any;
};

export type PlayerMatchSide = 'home' | 'away';
export type PlayerMatchRole = 'starter' | 'bench';
export type PlayerMatchResult = 'win' | 'loss' | 'draw';

export type PlayerEventTally = {
    type: string;
    label: string;
    count: number;
    /** 'score' | 'card' | 'discipline' | … — de aca sale el color del chip. */
    category: string;
    /**
     * De `count`, cuantos fueron tiros a los palos que NO entraron. `count`
     * sigue siendo el total de intentos: lo bueno es `count - missed`.
     */
    missed?: number;
};

/**
 * Lo que un partido le suma a los contadores, ya interpretado evento por
 * evento. Un tiro a los palos errado NO es una conversion ni un penal: el
 * total anterior los contaba igual porque solo miraba el tipo del evento.
 */
export type PlayerMatchStats = {
    tries: number;
    conversions: number;
    penalties: number;
    dropGoals: number;
    /** Conversiones, penales y drops que no entraron. */
    kicksMissed: number;
    yellowCards: number;
    redCards: number;
};

export type PlayerProfileTeam = {
    id: string;
    name: string;
    shortName: string | null;
    score: number | null;
};

export type PlayerProfileMatch = {
    id: string;
    date: string | null;
    status: string | null;
    venue: string | null;
    tournamentId: string | null;
    tournamentName: string | null;
    home: PlayerProfileTeam;
    away: PlayerProfileTeam;
    side: PlayerMatchSide | null;
    role: PlayerMatchRole | null;
    number: number | null;
    isCaptain: boolean;
    result: PlayerMatchResult | null;
    points: number;
    events: PlayerEventTally[];
    stats: PlayerMatchStats;
    /** Minuto en que ENTRO desde el banco, si hay una sustitucion cargada. */
    subbedOn: { minute: number | null } | null;
    /** Minuto en que SALIO, si hay una sustitucion cargada. */
    subbedOff: { minute: number | null } | null;
    /**
     * Minutos en cancha, CALCULADOS: entrada (0 si es titular, o el minuto del
     * cambio) hasta la salida, la roja o el final reglamentario. `null` si no
     * se puede saber: sin formacion ni cambio cargado, o deporte sin duracion
     * declarada. No se estima nada que los eventos no sostengan.
     */
    minutes: number | null;
};

export type PlayerProfileTotals = PlayerMatchStats & {
    matches: number;
    starts: number;
    bench: number;
    /** Partidos en que fue capitan. */
    captain: number;
    wins: number;
    draws: number;
    losses: number;
    points: number;
    /** Partidos en que entro desde el banco / salio reemplazado (con evento cargado). */
    subbedOn: number;
    subbedOff: number;
    /** Suma de minutos de los partidos donde se pudieron calcular. */
    minutes: number;
    /** En cuantos partidos se pudieron calcular: el promedio se saca de estos. */
    minutesKnown: number;
};

export type PlayerProfileSeason = PlayerProfileTotals & {
    key: string;
    tournamentId: string | null;
    tournamentName: string;
    year: string | null;
    clubId: string | null;
    clubName: string | null;
};

export type PlayerProfileClub = {
    id: string;
    name: string;
    shortName: string | null;
    role: string | null;
    status: string | null;
    joinedAt: string | null;
    leftAt: string | null;
    position: string | null;
};

export type LocalPlayerProfile = {
    id: string;
    name: string;
    photo: string | null;
    birthDate: string | null;
    position: string | null;
    height: number | string | null;
    weight: number | string | null;
    /** Dorsal del ultimo partido en el que aparece. `people` no lo tiene. */
    number: number | null;
    /**
     * El dorsal que MAS uso de titular. Es el que define el puesto: el ultimo
     * puede ser el 22 de una tarde que entro del banco.
     */
    mainNumber: number | null;
    /**
     * De donde salio el puesto. `declared` es `people.position`, cargado a
     * mano; `jersey` lo dedujo el numero de titular. La ficha lo dice, porque
     * un puesto deducido puede errarle y el lector tiene derecho a saberlo.
     */
    positionSource: 'declared' | 'jersey' | null;
    club: PlayerProfileClub | null;
    matches: PlayerProfileMatch[];
    totals: PlayerProfileTotals;
    seasons: PlayerProfileSeason[];
    /**
     * Acciones cargadas que no tienen contador propio (lines, scrums,
     * knock-ons, patadas, lesiones…), sumadas por tipo.
     */
    actions: PlayerEventTally[];
    /**
     * Cuantos partidos del club se miraron. Si el jugador no aparece en
     * ninguno la ficha lo dice, en vez de mostrar ceros como si hubiera
     * jugado y no hubiera hecho nada.
     */
    scanned: number;
    /**
     * Hubo mas filas que el tope de lectura: los totales pueden quedar cortos
     * y la ficha tiene que decirlo en vez de presentarlos como completos.
     */
    truncated: boolean;
};

/**
 * La ficha que puede salir a un anónimo: la EDAD en lugar de la fecha de
 * nacimiento, y sin talla ni peso. Es el mismo criterio que `/api/teams` con
 * el padrón: la lectura es con service_role (no pasa por los privilegios de
 * columna que la migración le revocó a la clave anónima) y entre los jugadores
 * hay juveniles menores de edad.
 */
export type PublicLocalPlayerProfile = Omit<LocalPlayerProfile, 'birthDate' | 'height' | 'weight'> & {
    age: number | null;
};

export function ageFromBirthDate(birthDate: string | null | undefined, now: Date = new Date()): number | null {
    if (!birthDate) return null;
    const birth = new Date(birthDate);
    if (Number.isNaN(birth.getTime())) return null;
    let age = now.getFullYear() - birth.getFullYear();
    const hasBirthdayPassed =
        now.getMonth() > birth.getMonth()
        || (now.getMonth() === birth.getMonth() && now.getDate() >= birth.getDate());
    if (!hasBirthdayPassed) age -= 1;
    return age >= 0 && age < 120 ? age : null;
}

export function toPublicLocalPlayerProfile(profile: LocalPlayerProfile): PublicLocalPlayerProfile {
    const { birthDate, height: _height, weight: _weight, ...rest } = profile;
    return { ...rest, age: ageFromBirthDate(birthDate) };
}

/** Cuantos partidos se traen por lado. Un plantel local no llega ni cerca. */
const MATCH_LIMIT_PER_SIDE = 120;
const EVENT_LIMIT = 600;

/**
 * Tipos que se cuentan aparte en la cinta de numeros. El resto de los eventos
 * (scrums, lines, entradas en 22) entran igual al detalle del partido pero no
 * son un titular: nadie define una carrera por cuantos lines saltó.
 */
const TRY_TYPES = new Set(['try', 'penalty_try']);
const CONVERSION_TYPES = new Set(['conversion']);
const PENALTY_KICK_TYPES = new Set(['penalty_goal', 'penalty']);
const DROP_TYPES = new Set(['drop_goal']);
const YELLOW_TYPES = new Set(['yellow_card', 'card_yellow']);
const RED_TYPES = new Set(['red_card', 'card_red']);
const SUBSTITUTION_TYPE = 'substitution';

/** Duracion reglamentaria por deporte. Sin entrada, los minutos no se calculan. */
const REGULATION_MINUTES: Record<string, number> = { rugby: 80 };

function playedMinutes(
    duration: number | null,
    role: PlayerMatchRole | null,
    subbedOn: { minute: number | null } | null,
    subbedOff: { minute: number | null } | null,
    redMinute: number | null,
    matchHasSubs: boolean,
): number | null {
    if (duration === null) return null;
    // Un partido de rugby sin NINGUN cambio cargado casi siempre es un partido
    // donde los cambios no se cargaron: dar 80' al titular seria inventar.
    if (!matchHasSubs && !subbedOn && !subbedOff) return null;
    let start: number;
    if (subbedOn) {
        if (subbedOn.minute === null) return null;
        start = subbedOn.minute;
    } else if (role === 'starter') {
        start = 0;
    } else if (role === 'bench') {
        // Hay cambios cargados en el partido y el no entro: no jugo.
        return 0;
    } else {
        // Sin formacion y sin cambio propio: no sabemos si jugo.
        return null;
    }
    let end = duration;
    if (subbedOff) {
        if (subbedOff.minute === null) return null;
        end = subbedOff.minute;
    } else if (redMinute !== null) {
        end = redMinute;
    }
    end = Math.min(end, duration);
    return Math.max(0, end - Math.min(start, duration));
}

function readNumber(value: unknown): number | null {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
}

function readText(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
}

/**
 * El lineup guarda `{ id, name, role, number, isCaptain }` por jugador. El `id`
 * es el UUID de `people`, que es lo que ata todo esto.
 */
function findInLineup(lineups: unknown, side: PlayerMatchSide, personId: string) {
    const source = lineups && typeof lineups === 'object' ? (lineups as Record<string, unknown>) : null;
    const list = source?.[side];
    if (!Array.isArray(list)) return null;
    return list.find((entry) => entry && typeof entry === 'object' && (entry as any).id === personId) as
        | Record<string, unknown>
        | undefined
        ?? null;
}

function resolveResult(
    side: PlayerMatchSide | null,
    homeScore: number | null,
    awayScore: number | null,
): PlayerMatchResult | null {
    if (!side || homeScore === null || awayScore === null) return null;
    if (homeScore === awayScore) return 'draw';
    const won = side === 'home' ? homeScore > awayScore : awayScore > homeScore;
    return won ? 'win' : 'loss';
}

function definitionsForSport(sportId: string | null): Record<string, MatchEventDefinition> {
    return buildMatchEventDefinitionMap(getDefaultMatchEventDefinitions(sportId || 'rugby'));
}

/**
 * `match_events.details` es un JSONB `{ team, detail, playerId, playerName }`.
 * El `detail` es el que decide si una conversion entro o se fue afuera, asi
 * que tiene que llegar entero hasta `getConfiguredEventPoints`.
 */
function readEventDetail(details: unknown): string {
    if (!details || typeof details !== 'object') return '';
    const raw = (details as Record<string, unknown>).detail;
    return typeof raw === 'string' ? raw : '';
}

export async function getLocalPlayerProfile(
    supabase: SupabaseLike,
    personId: string,
): Promise<LocalPlayerProfile | null> {
    const { data: person, error: personError } = await supabase
        .from('people')
        .select('id, full_name, name, first_name, last_name, photo_url, avatar_url, birth_date, position, height, weight, club_id')
        .eq('id', personId)
        .maybeSingle();

    if (personError || !person) return null;

    const MATCH_COLUMNS =
        'id, date_time, status, venue, tournament_id, home_club_id, away_club_id, score, sport_id, lineups, is_visible';

    // Dos consultas en vez de un `or`: el operador de contencion de PostgREST
    // lleva llaves y comas propias, que dentro de un `or=(…)` se comen el
    // parser. Dos `contains` en paralelo dicen lo mismo y no hay que escapar
    // nada.
    const [homeRes, awayRes, eventsRes, subsInRes, rolesRes] = await Promise.all([
        supabase
            .from('matches')
            .select(MATCH_COLUMNS)
            .contains('lineups', { home: [{ id: personId }] })
            .order('date_time', { ascending: false })
            .limit(MATCH_LIMIT_PER_SIDE),
        supabase
            .from('matches')
            .select(MATCH_COLUMNS)
            .contains('lineups', { away: [{ id: personId }] })
            .order('date_time', { ascending: false })
            .limit(MATCH_LIMIT_PER_SIDE),
        supabase
            .from('match_events')
            .select('match_id, event_type, minute, details, player_id')
            .eq('player_id', personId)
            .limit(EVENT_LIMIT),
        // En una sustitucion `player_id` es el que SALE; el que ENTRA vive en
        // `details.secondaryPlayerId`. Sin esta lectura, quien entro desde el
        // banco no tenia el cambio en su ficha.
        supabase
            .from('match_events')
            .select('match_id, event_type, minute, details, player_id')
            .eq('event_type', 'substitution')
            .eq('details->>secondaryPlayerId', personId)
            .limit(EVENT_LIMIT),
        supabase
            .from('club_person_roles')
            .select('club_id, role, status, joined_at, left_at, position')
            .eq('person_id', personId)
            .order('joined_at', { ascending: false, nullsFirst: false }),
    ]);

    const matchRows = new Map<string, any>();
    for (const row of [...(homeRes?.data || []), ...(awayRes?.data || [])]) {
        if (row?.id) matchRows.set(row.id, row);
    }

    type EventRow = {
        match_id: string | null;
        event_type: string | null;
        minute: number | null;
        details: unknown;
        player_id: string | null;
    };
    const eventRows = (eventsRes?.data || []) as EventRow[];
    const subsInRows = (subsInRes?.data || []) as EventRow[];
    const truncated =
        (homeRes?.data?.length || 0) >= MATCH_LIMIT_PER_SIDE ||
        (awayRes?.data?.length || 0) >= MATCH_LIMIT_PER_SIDE ||
        eventRows.length >= EVENT_LIMIT ||
        subsInRows.length >= EVENT_LIMIT;

    // Un partido puede tener eventos del jugador y no tenerlo en el lineup
    // (planillas viejas cargadas al reves). Se trae igual: el evento existe,
    // asi que jugo.
    const missingMatchIds = [
        ...new Set(
            [...eventRows, ...subsInRows]
                .map((e) => e.match_id)
                .filter((id): id is string => Boolean(id) && !matchRows.has(id!)),
        ),
    ];
    if (missingMatchIds.length > 0) {
        const { data: extra } = await supabase
            .from('matches')
            .select(MATCH_COLUMNS)
            .in('id', missingMatchIds.slice(0, MATCH_LIMIT_PER_SIDE));
        for (const row of extra || []) {
            if (row?.id) matchRows.set(row.id, row);
        }
    }

    const matches = [...matchRows.values()].filter((row) => row?.is_visible !== false);

    // En que partidos hay cambios cargados (de cualquier jugador). En tandas
    // de 20: PostgREST corta en 1000 filas y un partido trae decenas de cambios.
    const matchIdsWithSubs = new Set<string>();
    const idChunks: string[][] = [];
    for (let i = 0; i < matches.length; i += 20) idChunks.push(matches.slice(i, i + 20).map((m) => m.id));
    const subChunks = await Promise.all(
        idChunks.map((ids) =>
            supabase.from('match_events').select('match_id').eq('event_type', SUBSTITUTION_TYPE).in('match_id', ids).limit(1000),
        ),
    );
    for (const res of subChunks) {
        for (const row of res?.data || []) if (row?.match_id) matchIdsWithSubs.add(row.match_id);
    }

    // Clubes y torneos en dos consultas, no una por fila.
    const clubIds = new Set<string>();
    const tournamentIds = new Set<string>();
    for (const row of matches) {
        if (row.home_club_id) clubIds.add(row.home_club_id);
        if (row.away_club_id) clubIds.add(row.away_club_id);
        if (row.tournament_id) tournamentIds.add(row.tournament_id);
    }
    for (const role of rolesRes?.data || []) {
        if (role?.club_id) clubIds.add(role.club_id);
    }
    if (person.club_id) clubIds.add(person.club_id);

    const [clubsRes, tournamentsRes] = await Promise.all([
        clubIds.size
            ? supabase.from('clubs').select('id, name, short_name').in('id', [...clubIds])
            : Promise.resolve({ data: [] }),
        tournamentIds.size
            ? supabase.from('tournaments').select('id, name, display_name').in('id', [...tournamentIds])
            : Promise.resolve({ data: [] }),
    ]);

    const clubById = new Map<string, { name: string; shortName: string | null }>();
    for (const club of clubsRes?.data || []) {
        clubById.set(club.id, { name: club.name || club.id, shortName: club.short_name || null });
    }
    const tournamentById = new Map<string, string>();
    for (const t of tournamentsRes?.data || []) {
        tournamentById.set(t.id, t.display_name || t.name || '');
    }

    const eventsByMatch = new Map<string, typeof eventRows>();
    for (const event of eventRows) {
        if (!event.match_id) continue;
        const list = eventsByMatch.get(event.match_id) || [];
        list.push(event);
        eventsByMatch.set(event.match_id, list);
    }

    const subsInByMatch = new Map<string, EventRow>();
    for (const event of subsInRows) {
        if (event.match_id) subsInByMatch.set(event.match_id, event);
    }

    const totals: PlayerProfileTotals = emptyTotals();

    const seasonsByKey = new Map<string, PlayerProfileSeason>();
    let latestNumber: number | null = null;
    /**
     * Cuantas veces salio de titular con cada numero. Solo TITULAR: del 16 al
     * 23 el numero es el orden del banco y no dice nada del puesto.
     */
    const starterNumbers = new Map<number, number>();

    const built: PlayerProfileMatch[] = matches.map((row) => {
        const definitionMap = definitionsForSport(row.sport_id || null);

        const homeEntry = findInLineup(row.lineups, 'home', personId);
        const awayEntry = findInLineup(row.lineups, 'away', personId);
        const entry = homeEntry || awayEntry;
        const matchEvents = eventsByMatch.get(row.id) || [];
        // Sin formacion cargada el lado sale de sus propios eventos: un try
        // cargado al equipo `home` dice de que lado jugo. Antes el partido
        // quedaba sin resultado (G/E/P) aunque el jugador hubiera anotado.
        const sideFromEvents = (): PlayerMatchSide | null => {
            for (const event of [...matchEvents, ...(subsInByMatch.has(row.id) ? [subsInByMatch.get(row.id)!] : [])]) {
                const team = event.details && typeof event.details === 'object' ? (event.details as Record<string, unknown>).team : null;
                if (team === 'home' || team === 'away') return team;
            }
            return null;
        };
        const side: PlayerMatchSide | null = homeEntry ? 'home' : awayEntry ? 'away' : sideFromEvents();

        const score = row.score && typeof row.score === 'object' ? (row.score as Record<string, unknown>) : {};
        const homeScore = readNumber(score.home);
        const awayScore = readNumber(score.away);

        const rawRole = readText(entry?.role);
        const role: PlayerMatchRole | null = rawRole ? (rawRole === 'starter' ? 'starter' : 'bench') : null;
        const number = readNumber(entry?.number);

        const tallyByType = new Map<string, PlayerEventTally>();
        const stats = emptyMatchStats();
        let points = 0;
        let subbedOff: PlayerProfileMatch['subbedOff'] = null;
        let redMinute: number | null = null;

        for (const event of matchEvents) {
            const type = readText(event.event_type);
            if (!type) continue;

            // Una sustitucion no es una accion del jugador: es que salio. El
            // minuto sirve para el partido; no entra en el conteo de acciones.
            if (type === SUBSTITUTION_TYPE) {
                subbedOff = { minute: readNumber(event.minute) };
                continue;
            }

            const definition = definitionMap[type];
            // Los eventos de reloj no son del jugador aunque queden atados a el.
            if (definition?.category === 'clock') continue;

            const detail = readEventDetail(event.details);
            points += getConfiguredEventPoints({ type, detail }, definitionMap);

            // Solo los tiros a los palos se pueden errar. El mismo criterio que
            // usa el marcador (`isGoalKickMade`): un penal "al touch" no es un
            // tiro, y una conversion `[palos:miss]` no es una conversion.
            const isKick = Boolean(definition?.kickAtGoal) && isGoalKickAttemptEvent({ type, detail });
            const kickMade = isKick && isGoalKickMade(type, detail);

            if (TRY_TYPES.has(type)) stats.tries += 1;
            else if (YELLOW_TYPES.has(type)) stats.yellowCards += 1;
            else if (RED_TYPES.has(type)) {
                stats.redCards += 1;
                redMinute = readNumber(event.minute);
            }
            else if (isKick && kickMade) {
                if (CONVERSION_TYPES.has(type)) stats.conversions += 1;
                else if (PENALTY_KICK_TYPES.has(type)) stats.penalties += 1;
                else if (DROP_TYPES.has(type)) stats.dropGoals += 1;
            } else if (isKick && !kickMade) {
                stats.kicksMissed += 1;
            }

            const current = tallyByType.get(type);
            if (current) {
                current.count += 1;
                if (isKick && !kickMade) current.missed = (current.missed || 0) + 1;
            } else {
                tallyByType.set(type, {
                    type,
                    label: definition?.label || type,
                    count: 1,
                    category: definition?.category || 'other',
                    ...(isKick && !kickMade ? { missed: 1 } : {}),
                });
            }
        }

        const subIn = subsInByMatch.get(row.id);
        const subbedOn: PlayerProfileMatch['subbedOn'] = subIn ? { minute: readNumber(subIn.minute) } : null;

        const homeClub = row.home_club_id ? clubById.get(row.home_club_id) : undefined;
        const awayClub = row.away_club_id ? clubById.get(row.away_club_id) : undefined;

        const match: PlayerProfileMatch = {
            id: row.id,
            date: row.date_time || null,
            status: row.status || null,
            venue: readText(row.venue),
            tournamentId: row.tournament_id || null,
            tournamentName: row.tournament_id ? tournamentById.get(row.tournament_id) || null : null,
            home: {
                id: row.home_club_id || '',
                name: homeClub?.name || row.home_club_id || 'Local',
                shortName: homeClub?.shortName || null,
                score: homeScore,
            },
            away: {
                id: row.away_club_id || '',
                name: awayClub?.name || row.away_club_id || 'Visitante',
                shortName: awayClub?.shortName || null,
                score: awayScore,
            },
            side,
            role,
            number,
            isCaptain: entry?.isCaptain === true,
            result: resolveResult(side, homeScore, awayScore),
            points,
            events: [...tallyByType.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)),
            stats,
            subbedOn,
            subbedOff,
            minutes: playedMinutes(
                REGULATION_MINUTES[row.sport_id || 'rugby'] ?? null,
                role,
                subbedOn,
                subbedOff,
                redMinute,
                matchIdsWithSubs.has(row.id),
            ),
        };

        return match;
    });

    built.sort((a, b) => {
        const da = a.date ? Date.parse(a.date) : 0;
        const db = b.date ? Date.parse(b.date) : 0;
        return db - da;
    });

    for (const match of built) {
        addMatchToTotals(totals, match);

        if (latestNumber === null && match.number !== null) latestNumber = match.number;
        if (match.role === 'starter' && match.number !== null && match.number >= 1 && match.number <= 15) {
            starterNumbers.set(match.number, (starterNumbers.get(match.number) || 0) + 1);
        }

        const clubId = match.side === 'home' ? match.home.id : match.side === 'away' ? match.away.id : null;
        const year = match.date ? match.date.slice(0, 4) : null;
        const key = `${match.tournamentId || 'sin-torneo'}::${year || 's-f'}`;
        const season: PlayerProfileSeason = seasonsByKey.get(key) || {
            ...emptyTotals(),
            key,
            tournamentId: match.tournamentId,
            tournamentName: match.tournamentName || 'Partidos sueltos',
            year,
            clubId,
            clubName: clubId ? clubById.get(clubId)?.name || clubId : null,
        };

        addMatchToTotals(season, match);
        seasonsByKey.set(key, season);
    }

    const roles = (rolesRes?.data || []) as Array<Record<string, any>>;
    const activeRole = roles.find((r) => r.status === 'active') || roles[0] || null;
    const clubId = activeRole?.club_id || person.club_id || null;
    const clubInfo = clubId ? clubById.get(clubId) : undefined;

    // El dorsal de titular mas repetido. Empate: gana el mas chico, que es el
    // criterio estable — sin desempate, dos numeros con la misma cuenta darian
    // un puesto distinto segun el orden en que llegaron los partidos.
    let mainNumber: number | null = null;
    let mainCount = 0;
    for (const [number, count] of [...starterNumbers.entries()].sort((a, b) => a[0] - b[0])) {
        if (count > mainCount) {
            mainCount = count;
            mainNumber = number;
        }
    }

    const declaredPosition = readText(person.position) || readText(activeRole?.position);
    const inferredPosition = declaredPosition ? null : positionLabelFromJerseyNumber(mainNumber);

    const name =
        readText(person.full_name) ||
        readText(person.name) ||
        [readText(person.first_name), readText(person.last_name)].filter(Boolean).join(' ') ||
        'Jugador';

    return {
        id: person.id,
        name,
        photo: readText(person.photo_url) || readText(person.avatar_url),
        birthDate: person.birth_date || null,
        position: declaredPosition || inferredPosition,
        positionSource: declaredPosition ? 'declared' : inferredPosition ? 'jersey' : null,
        height: person.height ?? null,
        weight: person.weight ?? null,
        number: latestNumber,
        mainNumber,
        club: clubId
            ? {
                id: clubId,
                name: clubInfo?.name || clubId,
                shortName: clubInfo?.shortName || null,
                role: readText(activeRole?.role),
                status: readText(activeRole?.status),
                joinedAt: activeRole?.joined_at || null,
                leftAt: activeRole?.left_at || null,
                position: readText(activeRole?.position),
            }
            : null,
        matches: built,
        totals,
        seasons: [...seasonsByKey.values()].sort((a, b) => (b.year || '').localeCompare(a.year || '')),
        actions: otherActionsOf(built),
        scanned: matches.length,
        truncated,
    };
}
