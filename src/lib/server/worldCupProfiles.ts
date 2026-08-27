// Las fichas de lo que solo existe en el feed del Mundial de hockey: las
// selecciones y sus jugadoras.
//
// No hay fila en la base para ninguna de las dos. La ficha se arma en el
// momento contra el feed de la FIH —fixture, tabla de grupos y planteles, que
// ya viven cacheados en `services/fihHockey.ts`— y se resuelve por el id de la
// URL (`fih-wc-1867-ARG`, `fih-wc-1867-ARG-3968`; ver `fihHockeyParser.ts`).
//
// Nada de esto se persiste: cuando la FIH rote los ids entre ediciones, las
// fichas viejas dejan de resolver y contestan 404, que es la verdad. Guardar
// una copia seria inventar un plantel que ya no existe.

import {
    FIH_COMPETITIONS,
    FIH_COMPETITION_KEYS,
    fihPlayerDisplayName,
    fihTeamFlagUrl,
    fihTeamNameFromCode,
    parseFihTeamRef,
    parseFihPlayerRef,
    toFihMatchId,
    toFihPlayerRef,
    toFihTeamRef,
    type FihCompetition,
    type FihCompetitionKey,
    type FihMatchRow,
    type FihStandingRow,
} from '@/lib/services/fihHockeyParser';
import type { FihSquadPlayer } from '@/lib/services/fihMatchDataParser';
import {
    getFihCompetitionMatches,
    getFihCompetitionPools,
    getFihWorldCupBoxScore,
    getFihWorldCupSquad,
    getFihWorldCupTeam,
} from '@/lib/services/fihHockey';
import type { MatchStatus } from '@/types/match';

/** Un lado de un partido, como lo dibuja la ficha. */
export interface WorldCupMatchSide {
    code: string | null;
    name: string;
    flagUrl: string | null;
    /** true si es la seleccion de esta ficha. */
    isSelf: boolean;
}

/** Lo que hizo una jugadora en un partido, segun la planilla. */
export interface WorldCupPlayerLine {
    starter: boolean;
    played: boolean;
    goals: number;
    penaltyStrokes: number;
    greenCards: number;
    yellowCards: number;
    redCards: number;
}

export interface WorldCupMatchLine {
    id: string;
    /** ISO en UTC. null si la fila no trae fecha legible. */
    dateTime: string | null;
    stageName: string;
    status: MatchStatus;
    venue: string | null;
    home: WorldCupMatchSide;
    away: WorldCupMatchSide;
    score: { home: number; away: number } | null;
    shootout: { home: number; away: number } | null;
    /**
     * Como le fue a la seleccion de la ficha: 'win' | 'draw' | 'loss', o null
     * si todavia no se jugo. El shoot-out desempata, igual que en la tabla.
     */
    outcome: 'win' | 'draw' | 'loss' | null;
    /** Solo en la ficha de una jugadora: su linea en ese partido. */
    line: WorldCupPlayerLine | null;
    /**
     * Si la planilla de ese partido se pudo leer. Sin esto, `line: null` diria
     * dos cosas a la vez —"no estuvo" y "no pudimos leerlo"— y la ficha
     * contaria de menos los partidos de alguien que si jugo.
     */
    lineKnown: boolean;
}

export interface WorldCupSquadPlayer {
    ref: string;
    name: string;
    number: number | null;
    caps: number | null;
    isGoalkeeper: boolean;
    image: string | null;
}

export interface WorldCupStanding {
    pool: string;
    rank: number | null;
    played: number | null;
    wins: number | null;
    draws: number | null;
    losses: number | null;
    goalsFor: number | null;
    goalsAgainst: number | null;
    goalDifference: number | null;
    points: number | null;
}

export interface WorldCupTeamCompetition {
    competition: FihCompetition;
    /** El id de la ficha DE ESTA competencia (un pais puede jugar las dos). */
    ref: string;
    /**
     * Su fila en cada grupo que jugo, en el orden en que los publica la FIH.
     * Son varias porque el Mundial 2026 tiene DOS fases de grupos: quedarse
     * con la primera mostraba una tabla vieja como si fuera la actual.
     */
    standings: WorldCupStanding[];
    matches: WorldCupMatchLine[];
    squad: WorldCupSquadPlayer[];
}

export interface WorldCupTeamProfile {
    code: string;
    name: string;
    flagUrl: string;
    /** Una entrada, o dos si el id no dice el genero (el viejo `fih-team-ARG`). */
    competitions: WorldCupTeamCompetition[];
}

export interface WorldCupPlayerTotals {
    played: number;
    goals: number;
    penaltyStrokes: number;
    greenCards: number;
    yellowCards: number;
    redCards: number;
}

export interface WorldCupPlayerProfile {
    ref: string;
    name: string;
    number: number | null;
    caps: number | null;
    isGoalkeeper: boolean;
    image: string | null;
    competition: FihCompetition;
    team: { ref: string; code: string; name: string; flagUrl: string };
    /** Los partidos de su seleccion, con su linea cuando la planilla se pudo leer. */
    matches: WorldCupMatchLine[];
    totals: WorldCupPlayerTotals;
    /**
     * true si NINGUNA planilla se pudo leer. La ficha lo dice en vez de
     * mostrar ceros, que se leerian como "jugo y no hizo nada".
     */
    linesUnavailable: boolean;
    /** Cuantos partidos jugados quedaron sin planilla. Los numeros son sobre el resto. */
    linesMissing: number;
    teammates: WorldCupSquadPlayer[];
}

/**
 * Cuanto se espera a las planillas de una jugadora. Son ~7 pedidos en
 * paralelo y despues quedan cacheados; el primero que abre la ficha paga la
 * espera, y si el proveedor no llega, la ficha sale igual: los partidos cuya
 * planilla no contesto quedan marcados como tales (`lineKnown: false`), no
 * como partidos que no jugo.
 */
const LINES_BUDGET_MS = 9000;

function flagOf(code: string | null): string | null {
    return code ? fihTeamFlagUrl(code) || null : null;
}

function sideOf(code: string | null, name: string, selfCode: string): WorldCupMatchSide {
    return {
        code,
        // El feed escribe los nombres en ingles; la tabla de codigos los pasa
        // a castellano. Un marcador de posicion ("Ganador 47") no tiene codigo
        // y se muestra tal cual.
        name: code ? fihTeamNameFromCode(code.toUpperCase()) || name : name,
        flagUrl: flagOf(code),
        isSelf: (code ?? '').toUpperCase() === selfCode,
    };
}

function outcomeOf(row: FihMatchRow, selfCode: string): WorldCupMatchLine['outcome'] {
    if (row.state !== 'final' || row.homeGoals === null || row.awayGoals === null) return null;
    const isHome = (row.homeCode ?? '').toUpperCase() === selfCode;
    const own = isHome ? row.homeGoals : row.awayGoals;
    const rival = isHome ? row.awayGoals : row.homeGoals;
    if (own !== rival) return own > rival ? 'win' : 'loss';
    // Empatados en el tiempo reglamentario: manda el shoot-out si lo hubo.
    if (!row.shootout) return 'draw';
    const ownShootout = isHome ? row.shootout.home : row.shootout.away;
    const rivalShootout = isHome ? row.shootout.away : row.shootout.home;
    if (ownShootout === rivalShootout) return 'draw';
    return ownShootout > rivalShootout ? 'win' : 'loss';
}

function toMatchLine(row: FihMatchRow, key: FihCompetitionKey, selfCode: string): WorldCupMatchLine | null {
    if (!row.altiusId) return null;
    return {
        id: toFihMatchId(key, row.altiusId),
        dateTime: row.startsAtIso,
        stageName: row.stageName,
        status: row.state,
        venue: row.venue || null,
        home: sideOf(row.homeCode, row.homeName, selfCode),
        away: sideOf(row.awayCode, row.awayName, selfCode),
        score: row.homeGoals !== null && row.awayGoals !== null ? { home: row.homeGoals, away: row.awayGoals } : null,
        shootout: row.shootout,
        outcome: outcomeOf(row, selfCode),
        line: null,
        lineKnown: false,
    };
}

/** Del mas viejo al mas nuevo: una ficha se lee como la campana, en orden. */
function byKickoff(a: WorldCupMatchLine, b: WorldCupMatchLine): number {
    return (a.dateTime ?? '').localeCompare(b.dateTime ?? '') || a.id.localeCompare(b.id);
}

function toSquadPlayer(player: FihSquadPlayer, key: FihCompetitionKey, code: string): WorldCupSquadPlayer {
    return {
        ref: toFihPlayerRef(key, code, player.id),
        name: fihPlayerDisplayName(player.name),
        number: player.number,
        caps: player.caps,
        isGoalkeeper: player.isGoalkeeper,
        image: player.image,
    };
}

/** El plantel ordenado por dorsal; quien no lo tiene, al final y por nombre. */
function bySquadNumber(a: WorldCupSquadPlayer, b: WorldCupSquadPlayer): number {
    if (a.number === null && b.number === null) return a.name.localeCompare(b.name);
    if (a.number === null) return 1;
    if (b.number === null) return -1;
    return a.number - b.number;
}

function toStanding(row: FihStandingRow, poolName: string): WorldCupStanding {
    return {
        pool: poolName,
        rank: row.rank,
        played: row.played,
        wins: row.wins,
        draws: row.draws,
        losses: row.losses,
        goalsFor: row.goalsFor,
        goalsAgainst: row.goalsAgainst,
        goalDifference: row.goalDifference,
        points: row.points,
    };
}

/** Sus filas en las tablas de los grupos que jugo. */
async function standingsOf(key: FihCompetitionKey, code: string): Promise<WorldCupStanding[]> {
    try {
        const pools = await getFihCompetitionPools(key);
        return pools.flatMap((pool) => {
            const row = pool.rows.find((candidate) => (candidate.code ?? '').toUpperCase() === code);
            return row ? [toStanding(row, pool.name)] : [];
        });
    } catch (error) {
        console.warn('[worldCupProfiles] tabla no disponible:', error instanceof Error ? error.message : error);
        return [];
    }
}

/** Los partidos del pais en esa competencia, del primero al ultimo. */
async function matchesOf(key: FihCompetitionKey, code: string): Promise<WorldCupMatchLine[]> {
    try {
        const rows = await getFihCompetitionMatches(key);
        return rows
            .filter((row) => (row.homeCode ?? '').toUpperCase() === code || (row.awayCode ?? '').toUpperCase() === code)
            .map((row) => toMatchLine(row, key, code))
            .filter((line): line is WorldCupMatchLine => line !== null)
            .sort(byKickoff);
    } catch (error) {
        console.warn('[worldCupProfiles] fixture no disponible:', error instanceof Error ? error.message : error);
        return [];
    }
}

async function competitionOf(key: FihCompetitionKey, code: string): Promise<WorldCupTeamCompetition | null> {
    const team = await getFihWorldCupTeam(key, code);
    if (!team) return null;

    const [standings, matches, squad] = await Promise.all([
        standingsOf(key, code),
        matchesOf(key, code),
        getFihWorldCupSquad(key, team.teamId).catch(() => [] as FihSquadPlayer[]),
    ]);

    return {
        competition: FIH_COMPETITIONS[key],
        ref: toFihTeamRef(key, code),
        standings,
        matches,
        squad: squad.map((player) => toSquadPlayer(player, key, code)).sort(bySquadNumber),
    };
}

/**
 * La ficha de una seleccion. null si ese pais no juega el Mundial (o si el id
 * no nombra a nadie), que es un 404 de verdad.
 *
 * Con el id viejo (`fih-team-ARG`, el que ponen las filas de partidos) no se
 * sabe el genero, asi que se miran las dos competencias y la ficha muestra
 * las que existan.
 */
export async function getWorldCupTeamProfile(ref: string): Promise<WorldCupTeamProfile | null> {
    const parsed = parseFihTeamRef(ref);
    if (!parsed) return null;

    const keys = parsed.key ? [parsed.key] : FIH_COMPETITION_KEYS;
    const settled = await Promise.all(keys.map((key) => competitionOf(key, parsed.code).catch((error) => {
        console.error('[worldCupProfiles] competencia no disponible:', error);
        return null;
    })));
    const competitions = settled.filter((entry): entry is WorldCupTeamCompetition => entry !== null);
    if (competitions.length === 0) return null;

    return {
        code: parsed.code,
        name: fihTeamNameFromCode(parsed.code) || parsed.code,
        flagUrl: fihTeamFlagUrl(parsed.code),
        competitions,
    };
}

/** La linea de una jugadora en una planilla, por su id de Sportradar. */
function lineOf(players: Awaited<ReturnType<typeof getFihWorldCupBoxScore>>, srPersonId: string): WorldCupPlayerLine | null {
    const row = players.find((player) => player.id === srPersonId);
    if (!row) return null;
    return {
        starter: row.starter,
        played: row.played,
        goals: row.stats.goalsScored ?? 0,
        penaltyStrokes: row.stats.penaltyStrokesScored ?? 0,
        greenCards: row.stats.greenCards ?? 0,
        yellowCards: row.stats.yellowCards ?? 0,
        redCards: row.stats.redCards ?? 0,
    };
}

/**
 * Las planillas de los partidos ya jugados, con tope de tiempo. `answered` son
 * los partidos cuya planilla SI se leyo: de los demas no se sabe nada, y la
 * ficha tiene que decirlo en vez de contarlos como partidos sin jugar.
 */
async function linesOf(
    matches: WorldCupMatchLine[],
    srPersonId: string,
): Promise<{ lines: Map<string, WorldCupPlayerLine>; answered: Set<string> }> {
    const lines = new Map<string, WorldCupPlayerLine>();
    const answered = new Set<string>();

    const played = matches.filter((match) => match.status === 'final' || match.status === 'live');
    if (played.length === 0) return { lines, answered };

    const work = Promise.all(played.map(async (match) => {
        const players = await getFihWorldCupBoxScore(match.id);
        if (players.length === 0) return;
        answered.add(match.id);
        const line = lineOf(players, srPersonId);
        if (line) lines.set(match.id, line);
    }));

    await Promise.race([
        work,
        new Promise((resolve) => setTimeout(resolve, LINES_BUDGET_MS)),
    ]);

    return { lines, answered };
}

function totalsOf(matches: WorldCupMatchLine[]): WorldCupPlayerTotals {
    return matches.reduce<WorldCupPlayerTotals>((totals, match) => {
        const line = match.line;
        if (!match.lineKnown || !line || !line.played) return totals;
        return {
            played: totals.played + 1,
            goals: totals.goals + line.goals,
            penaltyStrokes: totals.penaltyStrokes + line.penaltyStrokes,
            greenCards: totals.greenCards + line.greenCards,
            yellowCards: totals.yellowCards + line.yellowCards,
            redCards: totals.redCards + line.redCards,
        };
    }, { played: 0, goals: 0, penaltyStrokes: 0, greenCards: 0, yellowCards: 0, redCards: 0 });
}

/** La ficha de una jugadora del Mundial. null si el plantel ya no la tiene. */
export async function getWorldCupPlayerProfile(ref: string): Promise<WorldCupPlayerProfile | null> {
    const parsed = parseFihPlayerRef(ref);
    if (!parsed) return null;

    const { key, code, personId } = parsed;
    const team = await getFihWorldCupTeam(key, code);
    if (!team) return null;

    const squad = await getFihWorldCupSquad(key, team.teamId).catch(() => [] as FihSquadPlayer[]);
    const player = squad.find((candidate) => candidate.id === personId);
    if (!player) return null;

    const matches = await matchesOf(key, code);
    const read = player.srPersonId ? await linesOf(matches, player.srPersonId) : null;
    const withLines: WorldCupMatchLine[] = matches.map((match) => ({
        ...match,
        line: read?.lines.get(match.id) ?? null,
        lineKnown: read?.answered.has(match.id) ?? false,
    }));

    return {
        ref,
        name: fihPlayerDisplayName(player.name),
        number: player.number,
        caps: player.caps,
        isGoalkeeper: player.isGoalkeeper,
        image: player.image,
        competition: FIH_COMPETITIONS[key],
        team: {
            ref: toFihTeamRef(key, code),
            code,
            name: fihTeamNameFromCode(code) || team.name,
            flagUrl: fihTeamFlagUrl(code),
        },
        matches: withLines,
        totals: totalsOf(withLines),
        // Solo se avisa cuando NINGUNA planilla llego; las que faltan de a una
        // se marcan partido por partido.
        linesUnavailable: withLines.some((match) => match.status === 'final') && !withLines.some((match) => match.lineKnown),
        linesMissing: withLines.filter((match) => (match.status === 'final' || match.status === 'live') && !match.lineKnown).length,
        teammates: squad
            .filter((candidate) => candidate.id !== personId)
            .map((candidate) => toSquadPlayer(candidate, key, code))
            .sort(bySquadNumber),
    };
}
