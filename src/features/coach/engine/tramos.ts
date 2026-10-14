// La temporada en tres tramos, partido a partido (El Entrenador v2, etapa 2).
//
// Hasta la 2.0.0 la fase regular se jugaba de una vez (`playLeague`) con el
// rating del plantel de pretemporada. Ahora se parte en tres tramos de fechas
// y cada fecha del club se juega con la alineación REAL de ese día:
//
//   · los lesionados no juegan (`lineup.ts`);
//   · el cansancio y el ánimo del XV mueven el nivel del día, como modificadores
//     CHICOS del rating del lado (`conditionMod`): nunca tocan el dado;
//   · los tries del club se reparten entre los que jugaron, por puesto y nivel;
//     los puntos de pie van al pateador; se suman tackles y la nota del partido;
//   · el cansancio sube por partido y baja descansando; las lesiones salen del
//     dado (la incidencia del partido) y del cansancio, y descuentan fechas;
//   · el ánimo sube jugando y ganando, baja sin minutos.
//
// EL REPARTO DE FECHAS. Las fechas del fixture (1..R) se cortan en tres bloques
// seguidos, lo más parejos posible: los primeros `R mod 3` tramos llevan una
// fecha más. 26 fechas (14 clubes, ida y vuelta) → 9 · 9 · 8; 18 → 6 · 6 · 6;
// 11 (12 clubes, una rueda) → 4 · 4 · 3; 7 (8 clubes, una rueda) → 3 · 2 · 2; 6
// (4 clubes, ida y vuelta: Desarrollo Chubut, la más corta) → 2 · 2 · 2. Ver
// `tramoRange`.
//
// INVARIANTE: los tries del club en la tabla son la suma de los tries de sus
// jugadores, y los puntos también (incluidos los que se fueron a mitad de año:
// `InSeason.gone`). Lo mide `tramos.test.ts` en cada temporada de una carrera
// larga. Para que cierre, los tries de un partido nunca valen más que los puntos
// (`fitTries`): el dado podía dar un try en un partido de tres puntos.
//
// Todo el azar sale del RNG de la carrera, en un orden fijo (fecha por fecha, en
// el orden del fixture). Sin `Math.random`, sin fecha; la única iteración de un
// Map (las filas de la tabla) pasa por `sortTable`, que desempata por id.

import { getCompetition } from '../data/competitions.ts';
import { formatFor } from '../data/formats.ts';
import type {
    CoachState,
    GonePlayer,
    HalfAdjustId,
    InSeason,
    InjuryNote,
    KeyFirstHalf,
    KeyMatch,
    KeyPlanId,
    LineupPolicy,
    MatchResult,
    PlayerStats,
    SeasonStar,
    SeasonStars,
    SquadPlayer,
    TableRow,
    TrainingFocus,
    TrainingWeek,
} from '../types/coach.ts';
import { activeCuts } from './finance.ts';
import { formativeYouthOnly, isFormativeOwn, matchday, type Matchday } from './lineup.ts';
import {
    NEUTRAL_MODS,
    bonusDefensive,
    bonusOffensive,
    rollFirstHalf,
    rollMatch,
    rollSecondHalf,
    type FirstHalfRoll,
    type MatchRoll,
    type MatchSide,
    type SidelineMods,
} from './match.ts';
import { directRival } from './objectives.ts';
import { createRng, hashSeed, type Rng } from './random.ts';
import { buildFixture, sortTable } from './season.ts';
import { benchImpact, teamRating } from './squad.ts';
import { rivalWeakness } from './training.ts';
import { upgradeEffect } from './upgrades.ts';
import { clubsIn } from './world.ts';

/** La fase regular se juega en tres tramos. */
export const TRAMOS = 3;

/** La chance de que llueva en el partido clave. */
export const RAIN_CHANCE = 0.25;

/* ------------------------------------------------------------------ */
/* El nivel del día                                                    */
/* ------------------------------------------------------------------ */

/**
 * El cansancio medio del XV que no pesa. Por encima, el día se juega peor: hasta
 * `FATIGUE_PENALTY` puntos de rating con el XV fundido (100).
 */
export const FATIGUE_FREE = 45;
export const FATIGUE_PENALTY = 1.2;
/** El ánimo neutro. Lejos de él, el día suma o resta hasta `MORALE_SWING`. */
export const MORALE_NEUTRAL = 60;
export const MORALE_SWING = 0.8;

/**
 * El cansancio de una semana: todos recuperan `WEEK_RECOVERY` y el partido le
 * suma `STARTER_FATIGUE` al titular y `BENCH_FATIGUE` al que entra del banco.
 * El titular de todas las fechas sube cinco por semana: en un tramo de nueve
 * fechas llega a 45, donde el cansancio empieza a pesar (`FATIGUE_FREE`). El
 * que no juega baja siete.
 */
export const WEEK_RECOVERY = 7;
export const STARTER_FATIGUE = 12;
export const BENCH_FATIGUE = 5;

/** Por encima de esto, un titular puede resentirse solo (sin choque). */
export const FATIGUE_INJURY_FROM = 70;
/** La chance por partido de resentirse con el cansancio al tope. */
export const FATIGUE_INJURY_MAX = 0.05;

/** Fechas afuera por un golpe del partido, con su peso. */
const KNOCK_OUT: readonly { out: number; weight: number }[] = [
    { out: 1, weight: 35 },
    { out: 2, weight: 30 },
    { out: 3, weight: 18 },
    { out: 4, weight: 10 },
    { out: 6, weight: 7 },
];

/**
 * Cuánto mueve el estado del XV el nivel del día, en puntos de rating. El
 * cansancio solo resta (por encima de `FATIGUE_FREE`); el ánimo suma o resta.
 */
export function conditionMod(xv: readonly Pick<SquadPlayer, 'fatigue' | 'morale'>[]): number {
    if (xv.length === 0) return 0;
    const fatigue = avg(xv.map((p) => p.fatigue));
    const morale = avg(xv.map((p) => p.morale));
    const tired = -Math.max(0, fatigue - FATIGUE_FREE) / (100 - FATIGUE_FREE) * FATIGUE_PENALTY;
    const mood = clamp(((morale - MORALE_NEUTRAL) / 40) * MORALE_SWING, -MORALE_SWING, MORALE_SWING);
    return tired + mood;
}

/** El riesgo de lesión extra por partido con el XV cansado. */
export function fatigueRisk(xv: readonly Pick<SquadPlayer, 'fatigue'>[]): number {
    if (xv.length === 0) return 0;
    return (Math.max(0, avg(xv.map((p) => p.fatigue)) - 60) / 40) * 0.03;
}

/**
 * Lo que el entrenador le pone al club, con lo que dejaron las decisiones. El
 * banco se mide con el plantel del DÍA (`squad`), que es el que sale a la cancha.
 */
export function sidelineOf(state: CoachState, squad: readonly SquadPlayer[] = state.squad): SidelineMods {
    return {
        conduccion: state.coach.attrs.conduccion,
        arenga: state.coach.attrs.arenga,
        disciplina: state.coach.attrs.disciplina,
        cohesion: state.club.cohesion,
        bench: benchImpact(squad),
        pressure: state.pressure,
        // El analista de video rinde todas las temporadas; el kinesiólogo resta
        // riesgo de lesión (el piso del 2 % lo pone `match.ts`).
        seasonRating: state.seasonMods.rating + upgradeEffect(state.club, 'video'),
        extraInjuryRisk: state.seasonMods.injuryRisk - upgradeEffect(state.club, 'kinesiologia'),
        // Viajar corto es una decisión de tarjeta o un recorte de la caja: las dos
        // dejan el banco sin primera línea de recambio.
        bancoCorto: state.seasonMods.bancoCorto || activeCuts(state).includes('viajes'),
    };
}

/** Lo que una situación le suma o le resta al lado en un partido puntual. */
export interface SideExtra {
    rating: number;
    disciplina: number;
    injuryRisk: number;
}

const NO_EXTRA: SideExtra = { rating: 0, disciplina: 0, injuryRisk: 0 };

/** El club del jugador como lado de un partido: la alineación del día, su estado y la semana. */
export function daySide(
    state: CoachState,
    md: Matchday,
    week: TrainingWeek | null,
    extra: SideExtra = NO_EXTRA,
): MatchSide {
    const base = sidelineOf(state, md.squad);
    const xv = xvPlayers(md);
    return {
        clubId: state.clubId,
        rating: md.rating,
        squad: md.squad,
        mods: {
            ...base,
            seasonRating: base.seasonRating + (week?.bonus ?? 0) + conditionMod(xv) + extra.rating,
            disciplina: clamp(base.disciplina + extra.disciplina, 1, 10),
            extraInjuryRisk: base.extraInjuryRisk + (week?.injuryRisk ?? 0) + fatigueRisk(xv) + extra.injuryRisk,
        },
    };
}

/** La política del XV del tramo en curso (la de la semana, o la del plan fijo). */
export function policyOf(state: Pick<CoachState, 'inSeason' | 'trainingDefault'>): LineupPolicy {
    return state.inSeason?.week?.plan.lineup ?? state.trainingDefault?.lineup ?? 'mejores';
}

/** El día de hoy del club: la alineación con la política vigente. */
export function todayOf(state: CoachState): Matchday {
    return matchday(state.squad, policyOf(state), state.competitionId);
}

function xvPlayers(md: Matchday): SquadPlayer[] {
    const out: SquadPlayer[] = [];
    for (const s of md.xv) if (s.player) out.push(s.player);
    return out;
}

/* ------------------------------------------------------------------ */
/* El fixture y los tramos                                             */
/* ------------------------------------------------------------------ */

export interface Fixture {
    round: number;
    homeId: string;
    awayId: string;
}

/** El fixture del año del club. Sin azar: mismo torneo, mismo fixture. */
export function seasonFixture(state: Pick<CoachState, 'world' | 'competitionId' | 'year'>): Fixture[] {
    return buildFixture(clubsIn(state.world, state.competitionId), formatFor(state.competitionId, state.year).rounds);
}

export function totalRounds(fixture: readonly Fixture[]): number {
    let max = 0;
    for (const f of fixture) if (f.round > max) max = f.round;
    return max;
}

/**
 * Las fechas de un tramo, inclusive. Bloques seguidos, lo más parejos posible:
 * los primeros `total mod 3` llevan una fecha más.
 */
export function tramoRange(total: number, tramo: number): { from: number; to: number } {
    const base = Math.floor(total / TRAMOS);
    const extra = total % TRAMOS;
    let from = 1;
    for (let t = 0; t < tramo; t++) from += base + (t < extra ? 1 : 0);
    const size = base + (tramo < extra ? 1 : 0);
    return { from, to: from + size - 1 };
}

function emptyRow(clubId: string): TableRow {
    return { clubId, played: 0, won: 0, drawn: 0, lost: 0, pf: 0, pc: 0, tries: 0, bonusOf: 0, bonusDef: 0, points: 0 };
}

/**
 * Arranca la fase regular: el rating de cada club para el año (con el jitter de
 * temporada, igual que `playLeague`: ±2, en orden de id) y la tabla en cero.
 */
export function startInSeason(state: CoachState, rng: Rng, cards: readonly number[]): InSeason {
    const comp = getCompetition(state.competitionId);
    const clubIds = comp ? clubsIn(state.world, comp.id) : [];
    const effective: Record<string, number> = {};
    for (const id of [...clubIds].sort((a, b) => a.localeCompare(b))) {
        effective[id] = id === state.clubId
            ? teamRating(state.squad)
            : Math.max(4, (state.world.ratings[id] ?? 20) + rng.normal(0, 2, -5, 5));
    }
    return {
        tramo: 0,
        cards: [...cards],
        round: 0,
        effective,
        table: sortTable(clubIds.map(emptyRow)),
        matches: [],
        week: null,
        key: null,
        injuries: [],
        gone: [],
    };
}

/* ------------------------------------------------------------------ */
/* El partido clave                                                    */
/* ------------------------------------------------------------------ */

export const KEY_PLANS: readonly { id: KeyPlanId; label: string; hint: string }[] = [
    { id: 'cerrado', label: 'Juego cerrado', hint: 'Forwards, pie y paciencia. Con lluvia rinde; con cancha seca resigna algo.' },
    { id: 'equilibrado', label: 'El plan de siempre', hint: 'Ni arriesgar ni cuidarse. Lo que dé el día.' },
    { id: 'abierto', label: 'Juego abierto', hint: 'Mover la pelota. Rinde con cancha seca y piernas frescas; con lluvia o cansancio, se paga.' },
];

export const HALF_ADJUSTS: readonly { id: HalfAdjustId; label: string; hint: string }[] = [
    { id: 'mantener', label: 'Seguir con el plan', hint: 'Lo que se habló en la semana.' },
    { id: 'cerrar', label: 'Cerrar el partido', hint: 'Cero riesgos. Achica el azar, resigna algo de ataque.' },
    { id: 'arriesgar', label: 'Ir a buscarlo', hint: 'Más ataque y más azar. Se lastima más gente.' },
    { id: 'rotar', label: 'Rotar', hint: 'Descansan los titulares y entran los pibes. Se resigna nivel.' },
];

/** Cansancio medio del XV a partir del que el juego abierto se paga. */
const OPEN_TIRED = 55;

/** Lo que el plan previo le hace al club en el partido clave. */
export function planExtra(plan: KeyPlanId, rain: boolean, xvFatigue: number, keyBonus: number): SideExtra {
    if (plan === 'cerrado') return { rating: keyBonus + (rain ? 1 : -0.2), disciplina: 2, injuryRisk: 0 };
    if (plan === 'abierto') {
        return { rating: keyBonus + (rain ? -1 : 0.5) - (xvFatigue > OPEN_TIRED ? 0.6 : 0), disciplina: -2, injuryRisk: 0 };
    }
    return { rating: keyBonus, disciplina: 0, injuryRisk: 0 };
}

/** Lo que el ajuste del entretiempo le suma al plan en el segundo tiempo. */
export function adjustExtra(base: SideExtra, adjust: HalfAdjustId): SideExtra {
    if (adjust === 'cerrar') return { ...base, rating: base.rating - 0.2, disciplina: base.disciplina + 3 };
    if (adjust === 'arriesgar') return { rating: base.rating + 0.7, disciplina: base.disciplina - 3, injuryRisk: base.injuryRisk + 0.03 };
    if (adjust === 'rotar') return { ...base, rating: base.rating - 0.4 };
    return base;
}

/**
 * El partido clave del tramo: contra el rival directo si juegan en el tramo; si
 * no, contra el rival del tramo más parejo por fuerza (desempata la fecha y el
 * id). `null` si el club no juega en el tramo.
 */
export function pickKeyMatch(state: CoachState, fixture: readonly Fixture[], from: number, to: number): Omit<KeyMatch, 'rain'> | null {
    const mine = fixture
        .filter((f) => f.round >= from && f.round <= to && (f.homeId === state.clubId || f.awayId === state.clubId))
        .sort((a, b) => a.round - b.round);
    if (mine.length === 0) return null;
    const rivalOf = (f: Fixture) => (f.homeId === state.clubId ? f.awayId : f.homeId);
    const direct = directRival(state);
    const eff = state.inSeason?.effective ?? {};
    const myRating = eff[state.clubId] ?? teamRating(state.squad);
    let pick = direct ? mine.find((f) => rivalOf(f) === direct) : undefined;
    if (!pick) {
        pick = [...mine].sort(
            (a, b) =>
                Math.abs((eff[rivalOf(a)] ?? 20) - myRating) - Math.abs((eff[rivalOf(b)] ?? 20) - myRating)
                || a.round - b.round
                || rivalOf(a).localeCompare(rivalOf(b)),
        )[0];
    }
    const rivalId = rivalOf(pick);
    return {
        round: pick.round,
        rivalId,
        home: pick.homeId === state.clubId,
        weakness: rivalWeakness(rivalId),
        plan: null,
        firstHalf: null,
        adjust: null,
    };
}

/* ------------------------------------------------------------------ */
/* Jugar fechas                                                        */
/* ------------------------------------------------------------------ */

/** Lo que se va modificando mientras se juegan las fechas de un paso. */
interface Work {
    squad: SquadPlayer[];
    rows: Map<string, TableRow>;
    matches: MatchResult[];
    injuries: InjuryNote[];
}

function startWork(state: CoachState, ins: InSeason): Work {
    return {
        squad: state.squad.map((p) => ({ ...p, stats: { ...p.stats } })),
        rows: new Map(ins.table.map((r) => [r.clubId, { ...r }])),
        matches: [...ins.matches],
        injuries: [...ins.injuries],
    };
}

/** Cuatro por ganado, dos por empatado, cero por perdido, más los bonus. */
function applyResult(row: TableRow | undefined, pf: number, pc: number, tries: number): void {
    if (!row) return;
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

/**
 * Un try son cinco puntos: un partido de tres puntos no puede tener un try. El
 * dado lo permitía en los marcadores chicos (`(pts / 7) × 1,2` redondeado). No
 * cambia ningún bonus: con cuatro tries hacen falta 20,4 puntos o más.
 */
export function fitTries(tries: number, pf: number): number {
    return Math.min(tries, Math.floor(pf / 5));
}

function rivalSide(state: CoachState, ins: InSeason, id: string): MatchSide {
    return { clubId: id, rating: ins.effective[id] ?? state.world.ratings[id] ?? 20, mods: NEUTRAL_MODS };
}

/** Cuánto pesa cada puesto para hacer un try. Wings y centros más; la primera línea, menos. */
const TRY_WEIGHT: Readonly<Record<string, number>> = {
    fondo: 3,
    centros: 2.4,
    'tercera-linea': 1.5,
    medios: 1.1,
    'segunda-linea': 0.6,
    'primera-linea': 0.5,
};

/** Tackles por partido de un titular de cada puesto. */
const TACKLE_BASE: Readonly<Record<string, number>> = {
    'segunda-linea': 11,
    'tercera-linea': 12,
    'primera-linea': 8,
    centros: 8,
    medios: 6,
    fondo: 4,
};

/** Lo que juega el del banco, como fracción del partido. */
const BENCH_SHARE = 0.35;

interface Played {
    player: SquadPlayer;
    group: string;
    starter: boolean;
}

/**
 * Le pone el partido a los jugadores: tries, puntos, tackles, nota, cansancio,
 * ánimo y lesiones. Devuelve la nota del partido para la planilla.
 */
function creditMatch(
    rng: Rng,
    w: Work,
    md: Matchday,
    round: number,
    res: { pf: number; pc: number; tries: number; hurtId: string | null; note: string | null },
    opts: { week: TrainingWeek | null; rotate: boolean },
): string | null {
    const byId = new Map(w.squad.map((p) => [p.id, p]));
    const played: Played[] = [];
    for (const s of md.xv) {
        const p = s.player ? byId.get(s.player.id) : undefined;
        if (p) played.push({ player: p, group: s.group, starter: true });
    }
    for (const b of md.bench) {
        const p = byId.get(b.id);
        if (p) played.push({ player: p, group: p.group, starter: false });
    }
    // Rotar en el entretiempo: los pibes de afuera de los 23 también suman minutos.
    if (opts.rotate) {
        const inMatch = new Set(played.map((x) => x.player.id));
        const kids = w.squad
            .filter((p) => !inMatch.has(p.id) && p.injury <= 0)
            .sort((a, b) => a.age - b.age || b.level - a.level || a.id.localeCompare(b.id))
            .slice(0, 3);
        for (const p of kids) played.push({ player: p, group: p.group, starter: false });
    }
    if (played.length === 0) return res.note;

    const avgLevel = avg(played.filter((x) => x.starter).map((x) => x.player.level));
    const share = (x: Played) => (x.starter ? 1 : BENCH_SHARE);

    // Tries, por puesto y nivel.
    const tries = new Map<string, number>();
    for (let t = 0; t < res.tries; t++) {
        const who = rng.weighted(
            played,
            (x) => (TRY_WEIGHT[x.group] ?? 1) * Math.max(0.4, 1 + (x.player.level - avgLevel) / 30) * share(x),
        );
        tries.set(who.player.id, (tries.get(who.player.id) ?? 0) + 1);
    }
    // El pie, al pateador del día.
    const kicks = Math.max(0, res.pf - res.tries * 5);
    const kickerId = md.kickerId && byId.has(md.kickerId) ? md.kickerId : played[0].player.id;

    const result = res.pf > res.pc ? 1 : res.pf < res.pc ? -1 : 0;
    const oppFactor = 0.8 + res.pc / 100;
    for (const x of played) {
        const p = x.player;
        const myTries = tries.get(p.id) ?? 0;
        const myKicks = p.id === kickerId ? kicks : 0;
        const expected = (TACKLE_BASE[x.group] ?? 7) * share(x) * oppFactor;
        const tackles = Math.max(0, Math.round(expected * rng.float(0.6, 1.4)));
        const note = clamp(
            Math.round(
                (6
                    + result * 0.5
                    + myTries * 0.7
                    + myKicks * 0.04
                    + (tackles - expected) * 0.08
                    + (p.level - avgLevel) * 0.04
                    + rng.normal(0, 0.5))
                    * 10,
            ) / 10,
            3,
            10,
        );
        const s = p.stats;
        const apps = s.apps + 1;
        p.stats = {
            apps,
            starts: s.starts + (x.starter ? 1 : 0),
            tries: s.tries + myTries,
            points: s.points + myTries * 5 + myKicks,
            tackles: s.tackles + tackles,
            rating: Math.round(((s.rating * s.apps + note) / apps) * 100) / 100,
        };
    }
    // Si el pateador no estaba en la lista (no debería), sus puntos no se pierden.
    if (!played.some((x) => x.player.id === kickerId) && kicks > 0) {
        const p = played[0].player;
        p.stats = { ...p.stats, points: p.stats.points + kicks };
    }

    // Lesiones: el golpe del partido y el que se resiente de cansado.
    let note = res.note;
    const hurt = res.hurtId ? byId.get(res.hurtId) : undefined;
    if (hurt && hurt.injury <= 0) {
        const out = rng.weighted(KNOCK_OUT, (k) => k.weight).out;
        hurt.injury = out;
        w.injuries.push({ playerId: hurt.id, name: hurt.name, round, out });
    }
    for (const x of played) {
        if (!x.starter || x.player.injury > 0 || x.player.fatigue < FATIGUE_INJURY_FROM) continue;
        const chance = ((x.player.fatigue - FATIGUE_INJURY_FROM) / (100 - FATIGUE_INJURY_FROM)) * FATIGUE_INJURY_MAX
            + Math.max(0, opts.week?.injuryRisk ?? 0);
        if (rng.chance(chance)) {
            const out = rng.int(1, 2);
            x.player.injury = out;
            w.injuries.push({ playerId: x.player.id, name: x.player.name, round, out });
            if (!note) note = `${x.player.name} se resiente del cansancio y queda afuera ${out === 1 ? 'una fecha' : `${out} fechas`}.`;
        }
    }

    // Cansancio y ánimo.
    const starters = new Set(played.filter((x) => x.starter).map((x) => x.player.id));
    const used = new Set(played.map((x) => x.player.id));
    const relief = opts.week?.fatigueRelief ?? 0;
    for (const p of w.squad) {
        if (starters.has(p.id)) {
            const gain = (STARTER_FATIGUE - relief) * (opts.rotate ? 0.5 : 1);
            p.fatigue = clamp(Math.round(p.fatigue - WEEK_RECOVERY + gain), 0, 100);
            p.morale = moraleAfter(p, result > 0 ? 4 : result < 0 ? -2 : 1);
        } else if (used.has(p.id)) {
            p.fatigue = clamp(Math.round(p.fatigue - WEEK_RECOVERY + BENCH_FATIGUE), 0, 100);
            p.morale = moraleAfter(p, result > 0 ? 2 : result < 0 ? -1 : 0);
        } else {
            p.fatigue = clamp(p.fatigue - WEEK_RECOVERY, 0, 100);
            p.morale = moraleAfter(p, p.injury > 0 ? 0 : benchedDrop(p));
        }
    }
    return note;
}

/** Lo que baja el ánimo del que se queda afuera de los 23. */
function benchedDrop(p: SquadPlayer): number {
    if (p.personality === 'ambicioso') return -5;
    if (p.personality === 'tranquilo') return -1;
    if (p.personality === 'leal') return -2;
    return -3;
}

/** El ánimo vuelve de a poco a su neutro, y después suma lo de la fecha. */
function moraleAfter(p: SquadPlayer, delta: number): number {
    const drift = (MORALE_NEUTRAL - p.morale) * 0.08;
    return clamp(Math.round(p.morale + drift + delta), 0, 100);
}

/** Una fecha libre: todos descansan. */
function restRound(w: Work): void {
    for (const p of w.squad) {
        p.fatigue = clamp(p.fatigue - WEEK_RECOVERY, 0, 100);
        p.morale = clamp(Math.round(p.morale + (MORALE_NEUTRAL - p.morale) * 0.08), 0, 100);
    }
}

/** Una fecha que pasó: al que ya estaba lesionado le queda una menos. */
function healRound(w: Work, wasHurt: ReadonlySet<string>): void {
    for (const p of w.squad) if (wasHurt.has(p.id) && p.injury > 0) p.injury -= 1;
}

/** Lo que el paso necesita para jugar la fecha del partido clave. */
interface KeyPlay {
    md: Matchday;
    roll: MatchRoll;
    rotate: boolean;
}

/**
 * Juega las fechas `from..to` (inclusive). Si `key` viene, el partido del club
 * en su fecha ya está jugado (los dos tiempos) y solo se acredita.
 */
function playRounds(
    state: CoachState,
    rng: Rng,
    ins: InSeason,
    w: Work,
    fixture: readonly Fixture[],
    from: number,
    to: number,
    key: { round: number; play: KeyPlay } | null,
): void {
    for (let r = from; r <= to; r++) {
        const wasHurt = new Set(w.squad.filter((p) => p.injury > 0).map((p) => p.id));
        let mine = false;
        for (const fx of fixture) {
            if (fx.round !== r) continue;
            const isMine = fx.homeId === state.clubId || fx.awayId === state.clubId;
            if (!isMine) {
                const roll = rollMatch(rng, rivalSide(state, ins, fx.homeId), rivalSide(state, ins, fx.awayId));
                record(w, fx, roll, null);
                continue;
            }
            mine = true;
            const iAmHome = fx.homeId === state.clubId;
            let md: Matchday;
            let roll: MatchRoll;
            let rotate = false;
            if (key && key.round === r) {
                ({ md, roll, rotate } = key.play);
            } else {
                md = matchday(w.squad, policyOf({ inSeason: ins, trainingDefault: state.trainingDefault }), state.competitionId);
                const me = daySide({ ...state, squad: w.squad }, md, ins.week);
                const rival = rivalSide(state, ins, iAmHome ? fx.awayId : fx.homeId);
                roll = rollMatch(rng, iAmHome ? me : rival, iAmHome ? rival : me, { trackHome: iAmHome, trackAway: !iAmHome });
            }
            const pf = iAmHome ? roll.homePf : roll.awayPf;
            const pc = iAmHome ? roll.awayPf : roll.homePf;
            const tries = fitTries(iAmHome ? roll.homeTries : roll.awayTries, pf);
            const note = creditMatch(
                rng,
                w,
                md,
                r,
                { pf, pc, tries, hurtId: roll.hurtId, note: roll.note },
                { week: ins.week, rotate },
            );
            record(w, fx, roll, note);
        }
        if (!mine) restRound(w);
        healRound(w, wasHurt);
    }
}

/** Anota un partido en la tabla y en la planilla. */
function record(w: Work, fx: Fixture, roll: MatchRoll, note: string | null): void {
    const homeTries = fitTries(roll.homeTries, roll.homePf);
    const awayTries = fitTries(roll.awayTries, roll.awayPf);
    applyResult(w.rows.get(fx.homeId), roll.homePf, roll.awayPf, homeTries);
    applyResult(w.rows.get(fx.awayId), roll.awayPf, roll.homePf, awayTries);
    w.matches.push({
        round: fx.round,
        homeId: fx.homeId,
        awayId: fx.awayId,
        homePf: roll.homePf,
        awayPf: roll.awayPf,
        homeTries,
        awayTries,
        note,
    });
}

function finishWork(state: CoachState, ins: InSeason, w: Work, round: number): CoachState {
    return {
        ...state,
        squad: w.squad,
        inSeason: {
            ...ins,
            round,
            table: sortTable([...w.rows.values()]),
            matches: w.matches,
            injuries: w.injuries,
        },
    };
}

/* ------------------------------------------------------------------ */
/* Los pasos del tramo                                                 */
/* ------------------------------------------------------------------ */

/**
 * Cierra la semana y juega hasta el partido clave (sin incluirlo). Si el club no
 * juega en el tramo, juega el tramo entero. Devuelve el estado con la semana y
 * el partido clave pendientes, y si quedó el partido clave por jugar.
 */
export function runToKeyMatch(state: CoachState, rng: Rng, week: TrainingWeek, keyBase: Omit<KeyMatch, 'rain'> | null): { state: CoachState; pendingKey: boolean } {
    const ins = state.inSeason as InSeason;
    const fixture = seasonFixture(state);
    const { to } = tramoRange(totalRounds(fixture), ins.tramo);
    const withWeek: InSeason = { ...ins, week, key: null };
    const w = startWork(state, withWeek);
    if (!keyBase) {
        playRounds(state, rng, withWeek, w, fixture, ins.round + 1, to, null);
        return { state: finishWork(state, withWeek, w, to), pendingKey: false };
    }
    const key: KeyMatch = { ...keyBase, rain: rng.chance(RAIN_CHANCE) };
    playRounds(state, rng, withWeek, w, fixture, ins.round + 1, key.round - 1, null);
    const next = finishWork(state, { ...withWeek, key }, w, key.round - 1);
    return { state: next, pendingKey: true };
}

/** El lado del club y el del rival en el partido clave, con el plan (y el ajuste) puesto. */
function keySides(state: CoachState, plan: KeyPlanId, adjust: HalfAdjustId | null): { md: Matchday; home: MatchSide; away: MatchSide; key: KeyMatch } {
    const ins = state.inSeason as InSeason;
    const key = ins.key as KeyMatch;
    const md = todayOf(state);
    const xvFatigue = avg(xvPlayers(md).map((p) => p.fatigue));
    const base = planExtra(plan, key.rain, xvFatigue, ins.week?.keyBonus ?? 0);
    const me = daySide(state, md, ins.week, adjust ? adjustExtra(base, adjust) : base);
    const rival = rivalSide(state, ins, key.rivalId);
    return { md, home: key.home ? me : rival, away: key.home ? rival : me, key };
}

/** El primer tiempo del partido clave. No toca la tabla: queda el marcador a la vista. */
export function keyFirstHalf(state: CoachState, rng: Rng, plan: KeyPlanId): CoachState {
    const { home, away, key } = keySides(state, plan, null);
    const half = rollFirstHalf(rng, home, away, { trackHome: key.home, trackAway: !key.home });
    const firstHalf: KeyFirstHalf = {
        homePf: half.homePf,
        awayPf: half.awayPf,
        homeCost: half.homeCost,
        awayCost: half.awayCost,
        note: half.note,
        hurtId: half.hurtId,
    };
    return { ...state, inSeason: { ...(state.inSeason as InSeason), key: { ...key, plan, firstHalf } } };
}

/** El segundo tiempo, con el ajuste del entretiempo, y el resto del tramo. */
export function keySecondHalf(state: CoachState, rng: Rng, adjust: HalfAdjustId): CoachState {
    const ins = state.inSeason as InSeason;
    const key = ins.key as KeyMatch;
    const first = key.firstHalf as KeyFirstHalf;
    const { md, home, away } = keySides(state, key.plan ?? 'equilibrado', adjust);
    const roll = rollSecondHalf(rng, home, away, first as FirstHalfRoll, { trackHome: key.home, trackAway: !key.home });

    const fixture = seasonFixture(state);
    const { to } = tramoRange(totalRounds(fixture), ins.tramo);
    const doneKey: KeyMatch = { ...key, adjust };
    const nextIns: InSeason = { ...ins, key: doneKey };
    const w = startWork(state, nextIns);
    playRounds(state, rng, nextIns, w, fixture, key.round, to, { round: key.round, play: { md, roll, rotate: adjust === 'rotar' } });
    return finishWork(state, nextIns, w, to);
}

/* ------------------------------------------------------------------ */
/* Las chances que se muestran                                         */
/* ------------------------------------------------------------------ */

const SAMPLES = 300;

/**
 * Las chances de ganar el partido clave con cada plan, en porcentaje. Se juegan
 * `SAMPLES` partidos con un RNG DERIVADO (semilla, temporada, tramo, plan):
 * mirarlas no corre el azar de la carrera.
 */
export function keyPlanChances(state: CoachState): Record<KeyPlanId, number> {
    const out = { cerrado: 0, equilibrado: 0, abierto: 0 } as Record<KeyPlanId, number>;
    const ins = state.inSeason;
    if (!ins?.key) return out;
    for (const p of KEY_PLANS) {
        const rng = createRng(hashSeed(`clave:${state.seed}:${state.season}:${ins.tramo}:${p.id}`));
        const { home, away, key } = keySides(state, p.id, null);
        let wins = 0;
        for (let i = 0; i < SAMPLES; i++) {
            const roll = rollMatch(rng, home, away);
            if ((roll.homePf > roll.awayPf) === key.home && roll.homePf !== roll.awayPf) wins++;
        }
        out[p.id] = Math.round((wins / SAMPLES) * 100);
    }
    return out;
}

/** Las chances de ganar con cada ajuste del entretiempo, con el marcador que hay. */
export function halfAdjustChances(state: CoachState): Record<HalfAdjustId, number> {
    const out = { mantener: 0, cerrar: 0, arriesgar: 0, rotar: 0 } as Record<HalfAdjustId, number>;
    const ins = state.inSeason;
    const first = ins?.key?.firstHalf;
    if (!ins?.key || !first) return out;
    for (const a of HALF_ADJUSTS) {
        const rng = createRng(hashSeed(`entretiempo:${state.seed}:${state.season}:${ins.tramo}:${a.id}`));
        const { home, away, key } = keySides(state, ins.key.plan ?? 'equilibrado', a.id);
        let wins = 0;
        for (let i = 0; i < SAMPLES; i++) {
            const roll = rollSecondHalf(rng, home, away, first as FirstHalfRoll);
            if ((roll.homePf > roll.awayPf) === key.home && roll.homePf !== roll.awayPf) wins++;
        }
        out[a.id] = Math.round((wins / SAMPLES) * 100);
    }
    return out;
}

/** El cansancio medio del XV que saldría hoy. Para la pantalla. */
export function xvFatigueOf(state: CoachState): number {
    return Math.round(avg(xvPlayers(todayOf(state)).map((p) => p.fatigue)));
}

/** La debilidad del rival clave del tramo que viene, si ya se sabe. */
export function upcomingKeyRival(state: CoachState): { rivalId: string; weakness: TrainingFocus; round: number; home: boolean } | null {
    const ins = state.inSeason;
    if (!ins) return null;
    const fixture = seasonFixture(state);
    const { from, to } = tramoRange(totalRounds(fixture), ins.tramo);
    const k = pickKeyMatch(state, fixture, Math.max(from, ins.round + 1), to);
    return k ? { rivalId: k.rivalId, weakness: k.weakness, round: k.round, home: k.home } : null;
}

/* ------------------------------------------------------------------ */
/* Lo que se cuenta al cerrar                                          */
/* ------------------------------------------------------------------ */

/**
 * Un jugador que se fue a mitad de año (una tarjeta lo reemplazó): sus números
 * quedan en la planilla del club. Sin esto, los tries del club dejarían de ser
 * la suma de los de sus jugadores.
 */
export function departures(before: readonly SquadPlayer[], after: readonly SquadPlayer[]): GonePlayer[] {
    const still = new Set(after.map((p) => p.id));
    return before
        .filter((p) => !still.has(p.id) && p.stats.apps > 0)
        .map((p) => ({ id: p.id, name: p.name, age: p.age, homegrown: p.homegrown, stats: { ...p.stats } }));
}

/** Titularidades de los propios en la fase regular, incluidos los que se fueron. */
export function ownStarts(state: Pick<CoachState, 'squad' | 'inSeason' | 'competitionId'>): number {
    const youthOnly = formativeYouthOnly(state.competitionId);
    let n = 0;
    for (const p of state.squad) if (isFormativeOwn(p, youthOnly)) n += p.stats.starts;
    for (const g of state.inSeason?.gone ?? []) if (isFormativeOwn(g, youthOnly)) n += g.stats.starts;
    return n;
}

/** Las fechas que juega el club en el año (sin las libres). */
export function myFixtures(state: Pick<CoachState, 'world' | 'competitionId' | 'year' | 'clubId'>): number {
    return seasonFixture(state).filter((f) => f.homeId === state.clubId || f.awayId === state.clubId).length;
}

/** Los nombres del año. Desempata por id: sin eso dependería del orden del plantel. */
export function seasonStars(players: readonly { id: string; name: string; stats: PlayerStats }[], fechas: number): SeasonStars {
    const top = (value: (s: PlayerStats) => number, filter: (s: PlayerStats) => boolean = () => true): SeasonStar | null => {
        let best: { id: string; name: string; v: number } | null = null;
        for (const p of [...players].sort((a, b) => a.id.localeCompare(b.id))) {
            if (!filter(p.stats)) continue;
            const v = value(p.stats);
            if (v <= 0) continue;
            if (!best || v > best.v) best = { id: p.id, name: p.name, v };
        }
        return best ? { playerId: best.id, name: best.name, value: best.v } : null;
    };
    const half = Math.max(1, Math.floor(fechas / 2));
    return {
        tries: top((s) => s.tries),
        tackles: top((s) => s.tackles),
        apps: top((s) => s.apps),
        best: top((s) => s.rating, (s) => s.apps >= half),
    };
}

/** Las estadísticas de la temporada sumadas a las de la carrera. */
export function addStats(a: PlayerStats, b: PlayerStats): PlayerStats {
    const apps = a.apps + b.apps;
    return {
        apps,
        starts: a.starts + b.starts,
        tries: a.tries + b.tries,
        points: a.points + b.points,
        tackles: (a.tackles ?? 0) + (b.tackles ?? 0),
        rating: apps > 0 ? Math.round(((a.rating * a.apps + b.rating * b.apps) / apps) * 100) / 100 : 0,
    };
}

/** Lo que suman los jugadores de la planilla (los de hoy y los que se fueron). */
export function squadTotals(state: Pick<CoachState, 'squad' | 'inSeason'>): { tries: number; points: number } {
    let tries = 0;
    let points = 0;
    for (const p of state.squad) {
        tries += p.stats.tries;
        points += p.stats.points;
    }
    for (const g of state.inSeason?.gone ?? []) {
        tries += g.stats.tries;
        points += g.stats.points;
    }
    return { tries, points };
}

function avg(xs: readonly number[]): number {
    return xs.length === 0 ? 0 : xs.reduce((s, x) => s + x, 0) / xs.length;
}

function clamp(v: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, v));
}
