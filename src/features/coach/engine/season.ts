// La temporada: el fixture, la tabla con bonus, y lo que se define después.
//
// El FORMATO no se decide acá: sale de `data/formats.ts`, edición por edición.
// Ese archivo dice cuántas ruedas, cómo se define el campeón (la tabla o un
// playoff), quién asciende directo, quién va al reducido y quién desciende. Este
// módulo lo ejecuta sin un solo `if` por torneo.
//
// La temporada se resuelve en tres pasos, y cada uno puede frenar para que el
// entrenador juegue su partido (`engine/run-season.ts`):
//   1. la fase regular (`playLeague`);
//   2. el título: el primero de la tabla, o el playoff;
//   3. el reducido por el ascenso, si el formato lo tiene.
// Los movimientos salen al final de todo (`movementOf`).

import type { FormatEdition } from '../data/formats.ts';
import type { KnockoutTie, MatchResult, SquadPlayer, TableRow } from '../types/coach.ts';
import { playBracket, tagTies } from './bracket.ts';
import {
    NEUTRAL_MODS,
    bonusDefensive,
    bonusOffensive,
    rollMatch,
    type MatchSide,
    type SidelineMods,
} from './match.ts';
import type { Rng } from './random.ts';

export interface LeagueInput {
    competitionId: string;
    format: FormatEdition;
    /** Los clubes del torneo, en cualquier orden: la tabla los ordena sola. */
    clubIds: readonly string[];
    /** Rating base de cada club, del mundo. */
    ratings: Readonly<Record<string, number>>;
    /** El club que dirige el jugador. */
    myClubId: string;
    myRating: number;
    myMods: SidelineMods;
    mySquad: readonly SquadPlayer[];
}

export interface LeagueOutput {
    table: TableRow[];
    matches: MatchResult[];
    /** Rating con el que jugó cada club este año (incluye el jitter de temporada). */
    effective: Record<string, number>;
}

/** Lo que queda definido de la postemporada. `undefined` = todavía no se jugó. */
export interface PostseasonProgress {
    championId?: string;
    /** El ganador del reducido. `null` si el formato no tiene reducido. */
    reducidoWinner?: string | null;
}

export type PostseasonStep =
    | { kind: 'done'; championId: string; reducidoWinner: string | null }
    /** El club del jugador está en esta llave: el entrenador la juega partido a partido. */
    | { kind: 'pending'; bracket: 'titulo' | 'ascenso'; seeds: string[]; championId: string | null };

/** Los que van al playoff por el título, en orden de tabla. Vacío si el campeón es el primero. */
export function titleSeeds(format: FormatEdition, table: readonly TableRow[]): string[] {
    if (format.title.kind !== 'playoff' || table.length < 2) return [];
    return table.slice(0, Math.min(format.title.size, table.length)).map((r) => r.clubId);
}

/** El campeón más los ascensos directos por posición. El reducido viene aparte. */
export function directPromoted(format: FormatEdition, table: readonly TableRow[], championId: string): string[] {
    const rule = format.promotion;
    if (!rule) return [];
    const out: string[] = rule.champion && championId ? [championId] : [];
    const total = out.length + rule.direct;
    for (const row of table) {
        if (out.length >= total) break;
        if (!out.includes(row.clubId)) out.push(row.clubId);
    }
    return out;
}

/**
 * Los que juegan el reducido, en orden de tabla. Es la franja `from..to` de la
 * tabla; si alguno de esa franja ya ascendió (campeón de playoff que terminó
 * tercero), entra el siguiente: el reducido se juega siempre con su cantidad.
 */
export function reducidoSeeds(format: FormatEdition, table: readonly TableRow[], promoted: readonly string[]): string[] {
    const r = format.promotion?.reducido;
    if (!r) return [];
    const size = r.to - r.from + 1;
    return table
        .slice(r.from - 1)
        .map((row) => row.clubId)
        .filter((id) => !promoted.includes(id))
        .slice(0, size);
}

/**
 * Quién asciende y quién desciende, con la tabla y las llaves ya definidas.
 *
 * Ascienden el campeón (si el formato lo dice), los directos por posición y el
 * ganador del reducido. Descienden los últimos que declara el formato; un club
 * que ascendió nunca desciende el mismo año. Con el primero de la tabla campeón
 * y ascenso directo, nadie juega un playoff que no corresponde: es lo que pasa en
 * Primera A, B, C y Segunda de la URBA desde 2026.
 */
export function movementOf(
    format: FormatEdition,
    table: readonly TableRow[],
    championId: string,
    reducidoWinner: string | null,
): { promoted: string[]; relegated: string[] } {
    const promoted = directPromoted(format, table, championId);
    if (reducidoWinner && !promoted.includes(reducidoWinner)) promoted.push(reducidoWinner);
    const n = format.relegation?.direct ?? 0;
    const relegated =
        n > 0
            ? table
                  .slice(-n)
                  .map((r) => r.clubId)
                  .filter((id) => !promoted.includes(id))
            : [];
    return { promoted, relegated };
}

/**
 * El rating con el que un rival juega ESTA temporada.
 *
 * Existe porque el catálogo le puso a los clubes chicos ratings de grilla gruesa
 * —en el Pampeano C hay diez clubes dentro de un punto— y sin esto esas
 * divisiones son diez monedas al aire y la tabla no cuenta nada. El jitter le
 * devuelve al torneo la textura que el dato no trae: quién arrancó bien el año,
 * quién perdió medio equipo. Es chico (±2) a propósito: no reordena la pirámide,
 * la despeina.
 *
 * Va acá y no en el catálogo porque es de la TEMPORADA, no del club.
 */
function seasonRating(rng: Rng, base: number): number {
    return Math.max(4, base + rng.normal(0, 2, -5, 5));
}

/**
 * Fixture de todos contra todos por el método del círculo. Determinista y sin
 * RNG: mismo torneo, mismo fixture. Con equipos impares uno descansa por fecha.
 */
export function buildFixture(
    clubIds: readonly string[],
    rounds: 1 | 2,
): { round: number; homeId: string; awayId: string }[] {
    const BYE = '__bye__';
    const teams = [...clubIds];
    if (teams.length % 2 === 1) teams.push(BYE);

    const n = teams.length;
    const half = n / 2;
    const rotating = teams.slice(1);
    const fixture: { round: number; homeId: string; awayId: string }[] = [];

    for (let leg = 0; leg < rounds; leg++) {
        for (let r = 0; r < n - 1; r++) {
            const round = leg * (n - 1) + r + 1;
            const left = [teams[0], ...rotating.slice(0, half - 1)];
            const right = rotating.slice(half - 1).reverse();
            for (let i = 0; i < half; i++) {
                const a = left[i];
                const b = right[i];
                if (a === BYE || b === BYE) continue;
                // La revancha invierte la localía: si la ida fue en tu cancha, la
                // vuelta es afuera. Sin esto un club jugaría de local las 18.
                const swap = (r + leg) % 2 === 1;
                fixture.push({ round, homeId: swap ? b : a, awayId: swap ? a : b });
            }
            rotating.push(rotating.shift() as string);
        }
    }

    return fixture;
}

function emptyRow(clubId: string): TableRow {
    return {
        clubId,
        played: 0,
        won: 0,
        drawn: 0,
        lost: 0,
        pf: 0,
        pc: 0,
        tries: 0,
        bonusOf: 0,
        bonusDef: 0,
        points: 0,
    };
}

/**
 * Ordena la tabla. Puntos, después diferencia, después puntos a favor, y el id
 * al final: sin ese último desempate el orden dependería del orden de inserción,
 * que es una fuente de no-determinismo encubierta.
 */
export function sortTable(rows: readonly TableRow[]): TableRow[] {
    return [...rows].sort(
        (a, b) =>
            b.points - a.points
            || b.pf - b.pc - (a.pf - a.pc)
            || b.pf - a.pf
            || a.clubId.localeCompare(b.clubId),
    );
}

/** Cuatro por ganado, dos por empatado, cero por perdido, más los bonus. */
function applyResult(row: TableRow, pf: number, pc: number, tries: number): void {
    row.played += 1;
    row.pf += pf;
    row.pc += pc;
    row.tries += tries;
    if (pf > pc) {
        row.won += 1;
        row.points += 4;
    } else if (pf === pc) {
        row.drawn += 1;
        row.points += 2;
    } else {
        row.lost += 1;
    }
    if (bonusOffensive(tries)) {
        row.bonusOf += 1;
        row.points += 1;
    }
    if (bonusDefensive(pf, pc)) {
        row.bonusDef += 1;
        row.points += 1;
    }
}

/** El club como lado de un partido, con el rating que jugó el año. */
export function sideFor(
    input: Pick<LeagueInput, 'myClubId' | 'myMods' | 'mySquad' | 'ratings'>,
    effective: Readonly<Record<string, number>>,
): (id: string) => MatchSide {
    return (id: string): MatchSide =>
        id === input.myClubId
            ? { clubId: id, rating: effective[id], mods: input.myMods, squad: input.mySquad }
            : { clubId: id, rating: effective[id] ?? input.ratings[id] ?? 20, mods: NEUTRAL_MODS };
}

/** La fase regular: el fixture entero y la tabla. */
export function playLeague(rng: Rng, input: LeagueInput): LeagueOutput {
    const { clubIds, myClubId } = input;

    // Rating con el que cada club juega este año. El del jugador NO se despeina:
    // el suyo sale de su plantel, que es lo que él construyó.
    const effective: Record<string, number> = {};
    for (const id of [...clubIds].sort((a, b) => a.localeCompare(b))) {
        effective[id] = id === myClubId ? input.myRating : seasonRating(rng, input.ratings[id] ?? 20);
    }

    const sideOf = sideFor(input, effective);
    const rows = new Map(clubIds.map((id) => [id, emptyRow(id)]));
    const matches: MatchResult[] = [];

    for (const fx of buildFixture(clubIds, input.format.rounds)) {
        const roll = rollMatch(rng, sideOf(fx.homeId), sideOf(fx.awayId), {
            trackHome: fx.homeId === myClubId,
            trackAway: fx.awayId === myClubId,
        });
        applyResult(rows.get(fx.homeId) as TableRow, roll.homePf, roll.awayPf, roll.homeTries);
        applyResult(rows.get(fx.awayId) as TableRow, roll.awayPf, roll.homePf, roll.awayTries);
        matches.push({
            round: fx.round,
            homeId: fx.homeId,
            awayId: fx.awayId,
            homePf: roll.homePf,
            awayPf: roll.awayPf,
            homeTries: roll.homeTries,
            awayTries: roll.awayTries,
            note: roll.note,
        });
    }

    return { table: sortTable([...rows.values()]), matches, effective };
}

/**
 * Resuelve lo que falta de la postemporada. Juega solo las llaves en las que el
 * club del jugador NO está; si está en una y `defer` es true, frena y la
 * devuelve pendiente para que el entrenador la juegue. Se puede llamar de nuevo
 * con lo ya definido en `progress` y sigue desde ahí.
 */
export function resolvePostseason(
    rng: Rng,
    format: FormatEdition,
    competitionId: string,
    table: readonly TableRow[],
    sideOf: (id: string) => MatchSide,
    ties: KnockoutTie[],
    myClubId: string,
    progress: PostseasonProgress,
    defer: boolean,
): PostseasonStep {
    let championId = progress.championId;
    if (championId === undefined) {
        const seeds = titleSeeds(format, table);
        if (seeds.length === 0) {
            championId = table[0]?.clubId ?? '';
        } else if (defer && seeds.includes(myClubId)) {
            return { kind: 'pending', bracket: 'titulo', seeds, championId: null };
        } else {
            const from = ties.length;
            championId = playBracket(rng, seeds, sideOf, ties, competitionId, myClubId);
            tagTies(ties, from, 'titulo');
        }
    }

    let reducidoWinner = progress.reducidoWinner;
    if (reducidoWinner === undefined) {
        const seeds = reducidoSeeds(format, table, directPromoted(format, table, championId));
        if (seeds.length === 0) {
            reducidoWinner = null;
        } else if (seeds.length === 1) {
            reducidoWinner = seeds[0];
        } else if (defer && seeds.includes(myClubId)) {
            return { kind: 'pending', bracket: 'ascenso', seeds, championId };
        } else {
            const from = ties.length;
            reducidoWinner = playBracket(rng, seeds, sideOf, ties, competitionId, myClubId);
            tagTies(ties, from, 'ascenso');
        }
    }

    return { kind: 'done', championId, reducidoWinner };
}

export interface SeasonOutput extends LeagueOutput {
    playoff: KnockoutTie[];
    championId: string;
    reducidoWinner: string | null;
    myPosition: number;
    promoted: string[];
    relegated: string[];
}

/** La temporada entera, sin frenar: liga, llaves y movimientos. Para tests y simulaciones. */
export function runSeason(rng: Rng, input: LeagueInput): SeasonOutput {
    const league = playLeague(rng, input);
    const ties: KnockoutTie[] = [];
    const step = resolvePostseason(
        rng,
        input.format,
        input.competitionId,
        league.table,
        sideFor(input, league.effective),
        ties,
        input.myClubId,
        {},
        false,
    );
    if (step.kind !== 'done') throw new Error('runSeason no frena: defer=false');
    const { promoted, relegated } = movementOf(input.format, league.table, step.championId, step.reducidoWinner);
    return {
        ...league,
        playoff: ties,
        championId: step.championId,
        reducidoWinner: step.reducidoWinner,
        myPosition: league.table.findIndex((r) => r.clubId === input.myClubId) + 1,
        promoted,
        relegated,
    };
}
