/**
 * Una fase final de seven NO es una llave. El domingo de un Sudamericano se
 * juega así: los mejores arman una ZONA (todos contra todos, que arrastra el
 * cruce del sábado) y de ahí salen la Final y el 3° puesto; el resto define
 * puestos —semis del 5° y del 9°, y después 5°, 7°, 9°, 11°—. Dibujado como
 * árbol, el cuadro inventaba columnas, recortaba partidos y llamaba "TBD" a
 * todo lo que todavía no tenía equipo.
 *
 * Este módulo lee los rótulos de los partidos (`round_label`) y, si TODOS
 * hablan el idioma de las definiciones por puesto, arma el tablero:
 *
 *   - "Final"                  → la final (1° y 2°)
 *   - "3° puesto", "5° puesto" → una definición suelta
 *   - "Semifinal 5° puesto"    → semis de una escalera (5° al 8°)
 *   - "Zona Oro"               → la zona por el título, con su tabla
 *
 * Con un solo rótulo que no entienda ("Semifinal", "Cuartos") devuelve null y
 * la fase sigue en el cuadro de siempre. Todo es puro: la página lo usa con
 * los partidos crudos de la base y los tests lo prueban sin base.
 */

export type PlacementStatus = 'scheduled' | 'live' | 'finished';

export type PlacementSide = {
    /** Clave de la fila: el club si se sabe, si no el origen ("1º Grupo A"). */
    key: string;
    teamId: string | null;
    name: string | null;
    logo: string | null;
    /** De dónde sale el equipo mientras no se sabe quién es. */
    source: string | null;
    score: number | null;
    isWinner: boolean;
    isLoser: boolean;
};

export type PlacementMatch = {
    id: string;
    code: string | null;
    /** Lo que se juega, para la cabecera de la tarjeta ("5° puesto", "Semifinal"). */
    stake: string;
    dateTime: string | null;
    status: PlacementStatus;
    home: PlacementSide;
    away: PlacementSide;
};

export type PlacementPoolRow = {
    key: string;
    teamId: string | null;
    name: string | null;
    logo: string | null;
    source: string | null;
    played: number;
    won: number;
    drawn: number;
    lost: number;
    pointsFor: number;
    pointsAgainst: number;
    /** Qué se lleva la posición: la final o el 3° puesto. */
    destination: 'final' | 'third' | null;
};

export type PlacementPool = {
    name: string;
    rows: PlacementPoolRow[];
    matches: PlacementMatch[];
    /** Partidos de la fase anterior que la zona arrastra (mismo grupo). */
    carried: PlacementMatch[];
};

export type PlacementLadder = {
    /** Primer puesto que se define (5 → "Del 5° al 8°"). */
    from: number;
    to: number;
    semis: PlacementMatch[];
    finals: Array<{ place: number; match: PlacementMatch }>;
};

export type PlacementBoard = {
    pool: PlacementPool | null;
    final: PlacementMatch | null;
    third: PlacementMatch | null;
    ladders: PlacementLadder[];
    /** Definiciones sin semis propias (5° y 7° del femenino). */
    singles: Array<{ place: number; match: PlacementMatch }>;
};

type RawTeam = { id?: string | null; name?: string | null; short_name?: string | null; logo_url?: string | null } | null | undefined;

export type RawPlacementMatch = {
    id: string;
    date_time?: string | null;
    status?: string | null;
    score?: { home?: number | null; away?: number | null } | null;
    round_label?: string | null;
    phase_id?: string | null;
    bracket_match_code?: string | null;
    home_source_label?: string | null;
    away_source_label?: string | null;
    home_club_id?: string | null;
    away_club_id?: string | null;
    home?: RawTeam;
    away?: RawTeam;
};

type Stake =
    | { kind: 'final' }
    | { kind: 'place'; place: number }
    | { kind: 'semi'; place: number }
    | { kind: 'pool'; name: string };

const ORDINAL = '\\s*(?:°|º|\\.?º|\\.°)?';
const PLACE_RE = new RegExp(`^(\\d+)${ORDINAL}\\s+puesto$`, 'i');
const SEMI_RE = new RegExp(`^semi(?:final)?\\s+(?:del?\\s+)?(\\d+)${ORDINAL}\\s+puesto$`, 'i');
const POOL_RE = /^zona\s+\S.*$/i;

export function parsePlacementStake(label: string | null | undefined): Stake | null {
    const raw = String(label ?? '').trim().replace(/\s+/g, ' ');
    if (!raw) return null;
    if (/^(gran )?final$/i.test(raw)) return { kind: 'final' };
    const semi = SEMI_RE.exec(raw);
    if (semi) return { kind: 'semi', place: Number(semi[1]) };
    const place = PLACE_RE.exec(raw);
    if (place) {
        const n = Number(place[1]);
        return n === 1 ? { kind: 'final' } : { kind: 'place', place: n };
    }
    if (POOL_RE.test(raw)) return { kind: 'pool', name: raw };
    return null;
}

const LIVE_STATUSES = new Set(['live', 'in_progress', 'inprogress', 'playing', '1h', '2h', 'ht', 'halftime', 'half_time']);
const FINAL_STATUSES = new Set(['final', 'finished', 'ft', 'aet']);

function statusOf(raw: unknown): PlacementStatus {
    const s = String(raw ?? '').trim().toLowerCase();
    if (FINAL_STATUSES.has(s)) return 'finished';
    if (LIVE_STATUSES.has(s)) return 'live';
    return 'scheduled';
}

function numberOrNull(value: unknown): number | null {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function sideOf(match: RawPlacementMatch, which: 'home' | 'away', status: PlacementStatus, source: string | null): PlacementSide {
    const team = which === 'home' ? match.home : match.away;
    const clubId = (which === 'home' ? match.home_club_id : match.away_club_id) ?? team?.id ?? null;
    const own = numberOrNull(match.score?.[which]);
    const other = numberOrNull(match.score?.[which === 'home' ? 'away' : 'home']);
    const showsScore = status !== 'scheduled' && own !== null && other !== null;
    const decided = status === 'finished' && showsScore && own !== other;
    return {
        key: clubId ? `club:${clubId}` : `src:${source ?? which}`,
        teamId: clubId,
        name: clubId ? (team?.name || null) : null,
        logo: clubId ? (team?.logo_url || null) : null,
        source,
        score: showsScore ? own : null,
        isWinner: decided && (own as number) > (other as number),
        isLoser: decided && (own as number) < (other as number),
    };
}

function stakeLabel(stake: Stake): string {
    switch (stake.kind) {
        case 'final': return 'Final';
        case 'place': return `${stake.place}° puesto`;
        case 'semi': return 'Semifinal';
        case 'pool': return stake.name;
    }
}

function byKickoff(a: RawPlacementMatch, b: RawPlacementMatch): number {
    const ta = a.date_time ? Date.parse(a.date_time) : Number.MAX_SAFE_INTEGER;
    const tb = b.date_time ? Date.parse(b.date_time) : Number.MAX_SAFE_INTEGER;
    if (ta !== tb) return ta - tb;
    return String(a.id).localeCompare(String(b.id));
}

/**
 * "Ganador P13" no le dice nada a nadie: el código es interno. Si P13 es una
 * semi, pasa a "Ganador semi 1"; si es otra cosa, al nombre de lo que se jugó.
 */
function humanizeSource(source: string | null, codeNames: Map<string, string>): string | null {
    if (!source) return null;
    const ref = /^(ganador|perdedor)\s+(?:del?\s+)?(P\d+)$/i.exec(source.trim());
    if (!ref) return source.trim();
    const name = codeNames.get(ref[2].toUpperCase());
    const verb = ref[1][0].toUpperCase() + ref[1].slice(1).toLowerCase();
    return name ? `${verb} ${name}` : source.trim();
}

/**
 * Arma el tablero de una fase. `phaseMatches` son los partidos de la fase;
 * `otherMatches`, los del resto del torneo (de ahí salen los cruces que la
 * zona arrastra). Devuelve null si la fase no es de definiciones por puesto.
 */
export function buildPlacementBoard(
    phaseMatches: RawPlacementMatch[],
    otherMatches: RawPlacementMatch[] = [],
): PlacementBoard | null {
    if (phaseMatches.length === 0) return null;
    const parsed = phaseMatches.map((match) => ({ match, stake: parsePlacementStake(match.round_label) }));
    if (parsed.some((entry) => entry.stake === null)) return null;
    const stakes = parsed.map((entry) => entry.stake as Stake);
    // Una Final con su 3° puesto también es una llave común: hace falta algo
    // que sólo existe en las definiciones (una zona, semis por puesto o un 5°).
    const isPlacement = stakes.some((s) => s.kind === 'pool' || s.kind === 'semi' || (s.kind === 'place' && s.place >= 5));
    if (!isPlacement) return null;

    const ordered = [...parsed].sort((a, b) => byKickoff(a.match, b.match));

    // Nombre legible de cada código, para traducir "Ganador P13".
    const semiIndex = new Map<number, number>();
    const codeNames = new Map<string, string>();
    for (const { match, stake } of ordered) {
        const code = String(match.bracket_match_code ?? '').trim().toUpperCase();
        if (!code || !stake) continue;
        if (stake.kind === 'semi') {
            const n = (semiIndex.get(stake.place) ?? 0) + 1;
            semiIndex.set(stake.place, n);
            codeNames.set(code, `semi ${n}`);
        } else {
            codeNames.set(code, `de ${stakeLabel(stake).toLowerCase()}`);
        }
    }

    const toMatch = (match: RawPlacementMatch, stake: Stake): PlacementMatch => {
        const status = statusOf(match.status);
        return {
            id: String(match.id),
            code: match.bracket_match_code ? String(match.bracket_match_code) : null,
            stake: stakeLabel(stake),
            dateTime: match.date_time ?? null,
            status,
            home: sideOf(match, 'home', status, humanizeSource(match.home_source_label ?? null, codeNames)),
            away: sideOf(match, 'away', status, humanizeSource(match.away_source_label ?? null, codeNames)),
        };
    };

    let final: PlacementMatch | null = null;
    let third: PlacementMatch | null = null;
    const poolMatches: PlacementMatch[] = [];
    let poolName: string | null = null;
    const semisByPlace = new Map<number, PlacementMatch[]>();
    const placeMatches: Array<{ place: number; match: PlacementMatch }> = [];

    for (const { match, stake } of ordered) {
        const s = stake as Stake;
        const mapped = toMatch(match, s);
        if (s.kind === 'final') final = final ?? mapped;
        else if (s.kind === 'pool') {
            poolName = poolName ?? s.name;
            poolMatches.push(mapped);
        } else if (s.kind === 'semi') {
            semisByPlace.set(s.place, [...(semisByPlace.get(s.place) ?? []), mapped]);
        } else if (s.place === 3) third = third ?? mapped;
        else placeMatches.push({ place: s.place, match: mapped });
    }

    // Escaleras: las semis del 5° alimentan el 5° y el 7°.
    const ladders: PlacementLadder[] = [];
    const usedPlaces = new Set<number>();
    for (const place of [...semisByPlace.keys()].sort((a, b) => a - b)) {
        const semis = semisByPlace.get(place) ?? [];
        const finals = placeMatches
            .filter((entry) => entry.place === place || entry.place === place + 2)
            .sort((a, b) => a.place - b.place);
        finals.forEach((entry) => usedPlaces.add(entry.place));
        ladders.push({ from: place, to: place + semis.length * 2 - 1, semis, finals });
    }
    const singles = placeMatches
        .filter((entry) => !usedPlaces.has(entry.place))
        .sort((a, b) => a.place - b.place);

    const pool = poolName ? buildPool(poolName, poolMatches, otherMatches, phaseMatches, final, third) : null;

    return { pool, final, third, ladders, singles };
}

function buildPool(
    name: string,
    matches: PlacementMatch[],
    otherMatches: RawPlacementMatch[],
    phaseMatches: RawPlacementMatch[],
    final: PlacementMatch | null,
    third: PlacementMatch | null,
): PlacementPool {
    const rows = new Map<string, PlacementPoolRow>();
    const addRow = (side: PlacementSide) => {
        if (rows.has(side.key)) return;
        rows.set(side.key, {
            key: side.key, teamId: side.teamId, name: side.name, logo: side.logo, source: side.source,
            played: 0, won: 0, drawn: 0, lost: 0, pointsFor: 0, pointsAgainst: 0, destination: null,
        });
    };
    for (const match of matches) {
        addRow(match.home);
        addRow(match.away);
    }

    // Lo que la zona arrastra: el cruce de la fase anterior entre dos de sus
    // equipos (eran del mismo grupo y no se vuelven a enfrentar).
    const teamIds = new Set([...rows.values()].map((row) => row.teamId).filter(Boolean) as string[]);
    const phaseIds = new Set(phaseMatches.map((match) => String(match.id)));
    const poolPairs = new Set(matches
        .filter((match) => match.home.teamId && match.away.teamId)
        .map((match) => [match.home.teamId, match.away.teamId].sort().join('|')));
    const carried: PlacementMatch[] = otherMatches
        .filter((match) => !phaseIds.has(String(match.id)))
        .filter((match) => {
            const home = match.home_club_id ?? match.home?.id ?? null;
            const away = match.away_club_id ?? match.away?.id ?? null;
            return Boolean(home && away && teamIds.has(home) && teamIds.has(away)
                && !poolPairs.has([home, away].sort().join('|')));
        })
        .sort(byKickoff)
        .map((match) => {
            const status = statusOf(match.status);
            return {
                id: String(match.id),
                code: null,
                stake: 'Arrastrado',
                dateTime: match.date_time ?? null,
                status,
                home: sideOf(match, 'home', status, null),
                away: sideOf(match, 'away', status, null),
            };
        });

    for (const match of [...carried, ...matches]) {
        if (match.status !== 'finished' || match.home.score === null || match.away.score === null) continue;
        const home = rows.get(match.home.key);
        const away = rows.get(match.away.key);
        if (!home || !away) continue;
        home.played += 1; away.played += 1;
        home.pointsFor += match.home.score; home.pointsAgainst += match.away.score;
        away.pointsFor += match.away.score; away.pointsAgainst += match.home.score;
        if (match.home.score > match.away.score) { home.won += 1; away.lost += 1; }
        else if (match.home.score < match.away.score) { away.won += 1; home.lost += 1; }
        else { home.drawn += 1; away.drawn += 1; }
    }

    // Orden provisorio: ganados, empatados, diferencia, tantos a favor. Antes
    // del primer partido, el orden de los orígenes ("1º Grupo A" antes que
    // "2º Grupo A"), que es el que el público espera leer.
    const sorted = [...rows.values()].sort((a, b) => {
        if (b.won !== a.won) return b.won - a.won;
        if (b.drawn !== a.drawn) return b.drawn - a.drawn;
        const diff = (b.pointsFor - b.pointsAgainst) - (a.pointsFor - a.pointsAgainst);
        if (diff !== 0) return diff;
        if (b.pointsFor !== a.pointsFor) return b.pointsFor - a.pointsFor;
        return String(a.source ?? a.name ?? '').localeCompare(String(b.source ?? b.name ?? ''), 'es');
    });

    // A dónde va cada puesto, sólo si la final y el 3° lo dicen y la zona ya
    // empezó: sin partidos, el orden es el de los orígenes y marcar "a la
    // final" a los dos primeros sería inventar.
    const poolKey = name.toLowerCase();
    const feeds = (match: PlacementMatch | null) =>
        Boolean(match && [match.home.source, match.away.source].some((s) => String(s ?? '').toLowerCase().includes(poolKey)));
    const started = sorted.some((row) => row.played > 0);
    if (!started) return { name, rows: sorted, matches, carried };
    sorted.forEach((row, index) => {
        if (index < 2 && feeds(final)) row.destination = 'final';
        else if (index < 4 && feeds(third)) row.destination = 'third';
    });

    return { name, rows: sorted, matches, carried };
}

// ── Pestañas ────────────────────────────────────────────────────────────────
// El tablero se muestra como el resto de los playoffs: un cuadro por cada
// definición (el título, el 5°, el 9°…), en pestañas, y la tabla de la zona
// aparte. Los cuadros los dibuja `PlayoffBracket`; acá sólo se le arma la
// forma que él lee.

export type BracketMatchData = {
    match_id: string;
    home_participant: { participant_id: string; participant_name: string; image_path?: string };
    away_participant: { participant_id: string; participant_name: string; image_path?: string };
    score_home: number | null;
    score_away: number | null;
    match_start_iso?: string;
    status: string;
    winner_id?: string;
};

export type BracketRoundData = { round_id: string; name: string; matches: BracketMatchData[] };

export type PlacementTab =
    | { id: string; label: string; kind: 'pool'; pool: PlacementPool }
    | { id: string; label: string; kind: 'bracket'; title: string; rounds: BracketRoundData[] };

function bracketMatch(match: PlacementMatch): BracketMatchData {
    const participant = (side: PlacementSide) => ({
        participant_id: side.key,
        // Sin equipo todavía, el cuadro dice de dónde sale: nunca "TBD".
        participant_name: side.teamId ? (side.name || 'Equipo') : (side.source || 'A definir'),
        ...(side.teamId && side.logo ? { image_path: side.logo } : {}),
    });
    const winner = match.home.isWinner ? match.home : match.away.isWinner ? match.away : null;
    return {
        match_id: match.id,
        home_participant: participant(match.home),
        away_participant: participant(match.away),
        score_home: match.home.score,
        score_away: match.away.score,
        ...(match.dateTime ? { match_start_iso: match.dateTime } : {}),
        // Sin empezar, vacío: el cuadro rotula con lo que reciba y "scheduled" se leería crudo.
        status: match.status === 'finished' ? 'finished' : match.status === 'live' ? 'En vivo' : '',
        ...(winner ? { winner_id: winner.key } : {}),
    };
}

const round = (id: string, name: string, matches: PlacementMatch[]): BracketRoundData => ({
    round_id: id,
    name,
    matches: matches.map(bracketMatch),
});

function placesLabel(places: number[]): string {
    return places.length === 1 ? `${places[0]}°` : `${places.slice(0, -1).join('°, ')}° y ${places[places.length - 1]}°`;
}

/**
 * Una pestaña por definición: la zona (con su tabla), el título (Final y 3°),
 * cada escalera de puestos y las definiciones sueltas. Con nada que mostrar,
 * lista vacía.
 */
export function buildPlacementTabs(board: PlacementBoard): PlacementTab[] {
    const tabs: PlacementTab[] = [];
    if (board.pool) {
        tabs.push({ id: 'zona', label: board.pool.name, kind: 'pool', pool: board.pool });
    }
    if (board.final || board.third) {
        const rounds: BracketRoundData[] = [];
        if (board.final) rounds.push(round('final', 'Final', [board.final]));
        if (board.third) rounds.push(round('third', '3° puesto', [board.third]));
        tabs.push({ id: 'titulo', label: 'Por el título', kind: 'bracket', title: 'Playoff por el título', rounds });
    }
    for (const ladder of board.ladders) {
        const rounds: BracketRoundData[] = [round(`semi-${ladder.from}`, 'Semifinales', ladder.semis)];
        for (const { place, match } of ladder.finals) rounds.push(round(`place-${place}`, `${place}° puesto`, [match]));
        tabs.push({
            id: `escalera-${ladder.from}`,
            label: `Por el ${ladder.from}° puesto`,
            kind: 'bracket',
            title: `Playoff del ${ladder.from}° al ${ladder.to}° puesto`,
            rounds,
        });
    }
    if (board.singles.length > 0) {
        const places = board.singles.map((entry) => entry.place);
        tabs.push({
            id: 'puestos',
            label: `Por el ${placesLabel(places)} puesto`,
            kind: 'bracket',
            title: `Playoff por el ${placesLabel(places)} puesto`,
            rounds: board.singles.map(({ place, match }) => round(`place-${place}`, `${place}° puesto`, [match])),
        });
    }
    return tabs;
}
