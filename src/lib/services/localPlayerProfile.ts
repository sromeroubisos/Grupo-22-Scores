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
import { getConfiguredEventPoints } from '@/lib/matchStatsFromEvents';
import { positionLabelFromJerseyNumber } from '@/lib/types/squad';

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
};

export type PlayerProfileTotals = {
    matches: number;
    starts: number;
    bench: number;
    points: number;
    tries: number;
    conversions: number;
    penalties: number;
    dropGoals: number;
    yellowCards: number;
    redCards: number;
};

export type PlayerProfileSeason = {
    key: string;
    tournamentId: string | null;
    tournamentName: string;
    year: string | null;
    clubId: string | null;
    clubName: string | null;
    matches: number;
    starts: number;
    tries: number;
    conversions: number;
    penalties: number;
    dropGoals: number;
    points: number;
    yellowCards: number;
    redCards: number;
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
     * Cuantos partidos del club se miraron. Si el jugador no aparece en
     * ninguno la ficha lo dice, en vez de mostrar ceros como si hubiera
     * jugado y no hubiera hecho nada.
     */
    scanned: number;
};

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
    const [homeRes, awayRes, eventsRes, rolesRes] = await Promise.all([
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
            .select('match_id, event_type, minute, details')
            .eq('player_id', personId)
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

    const eventRows = (eventsRes?.data || []) as Array<{
        match_id: string | null;
        event_type: string | null;
        minute: number | null;
        details: unknown;
    }>;

    // Un partido puede tener eventos del jugador y no tenerlo en el lineup
    // (planillas viejas cargadas al reves). Se trae igual: el evento existe,
    // asi que jugo.
    const missingMatchIds = [
        ...new Set(eventRows.map((e) => e.match_id).filter((id): id is string => Boolean(id) && !matchRows.has(id!))),
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

    const totals: PlayerProfileTotals = {
        matches: 0,
        starts: 0,
        bench: 0,
        points: 0,
        tries: 0,
        conversions: 0,
        penalties: 0,
        dropGoals: 0,
        yellowCards: 0,
        redCards: 0,
    };

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
        const side: PlayerMatchSide | null = homeEntry ? 'home' : awayEntry ? 'away' : null;

        const score = row.score && typeof row.score === 'object' ? (row.score as Record<string, unknown>) : {};
        const homeScore = readNumber(score.home);
        const awayScore = readNumber(score.away);

        const rawRole = readText(entry?.role);
        const role: PlayerMatchRole | null = rawRole ? (rawRole === 'starter' ? 'starter' : 'bench') : null;
        const number = readNumber(entry?.number);

        const matchEvents = eventsByMatch.get(row.id) || [];
        const tallyByType = new Map<string, PlayerEventTally>();
        let points = 0;

        for (const event of matchEvents) {
            const type = readText(event.event_type);
            if (!type) continue;
            const definition = definitionMap[type];
            // Los eventos de reloj no son del jugador aunque queden atados a el.
            if (definition?.category === 'clock') continue;

            const detail = readEventDetail(event.details);
            points += getConfiguredEventPoints({ type, detail }, definitionMap);

            const current = tallyByType.get(type);
            if (current) {
                current.count += 1;
            } else {
                tallyByType.set(type, {
                    type,
                    label: definition?.label || type,
                    count: 1,
                    category: definition?.category || 'other',
                });
            }
        }

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
        };

        return match;
    });

    built.sort((a, b) => {
        const da = a.date ? Date.parse(a.date) : 0;
        const db = b.date ? Date.parse(b.date) : 0;
        return db - da;
    });

    for (const match of built) {
        totals.matches += 1;
        if (match.role === 'starter') totals.starts += 1;
        if (match.role === 'bench') totals.bench += 1;
        totals.points += match.points;

        if (latestNumber === null && match.number !== null) latestNumber = match.number;
        if (match.role === 'starter' && match.number !== null && match.number >= 1 && match.number <= 15) {
            starterNumbers.set(match.number, (starterNumbers.get(match.number) || 0) + 1);
        }

        const clubId = match.side === 'home' ? match.home.id : match.side === 'away' ? match.away.id : null;
        const year = match.date ? match.date.slice(0, 4) : null;
        const key = `${match.tournamentId || 'sin-torneo'}::${year || 's-f'}`;
        const season = seasonsByKey.get(key) || {
            key,
            tournamentId: match.tournamentId,
            tournamentName: match.tournamentName || 'Partidos sueltos',
            year,
            clubId,
            clubName: clubId ? clubById.get(clubId)?.name || clubId : null,
            matches: 0,
            starts: 0,
            tries: 0,
            conversions: 0,
            penalties: 0,
            dropGoals: 0,
            points: 0,
            yellowCards: 0,
            redCards: 0,
        };

        season.matches += 1;
        if (match.role === 'starter') season.starts += 1;
        season.points += match.points;

        for (const tally of match.events) {
            if (TRY_TYPES.has(tally.type)) {
                totals.tries += tally.count;
                season.tries += tally.count;
            } else if (CONVERSION_TYPES.has(tally.type)) {
                totals.conversions += tally.count;
                season.conversions += tally.count;
            } else if (PENALTY_KICK_TYPES.has(tally.type)) {
                totals.penalties += tally.count;
                season.penalties += tally.count;
            } else if (DROP_TYPES.has(tally.type)) {
                totals.dropGoals += tally.count;
                season.dropGoals += tally.count;
            } else if (YELLOW_TYPES.has(tally.type)) {
                totals.yellowCards += tally.count;
                season.yellowCards += tally.count;
            } else if (RED_TYPES.has(tally.type)) {
                totals.redCards += tally.count;
                season.redCards += tally.count;
            }
        }

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
        scanned: matches.length,
    };
}
