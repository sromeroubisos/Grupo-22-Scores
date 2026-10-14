// Los juveniles: el M19 y la jornada de captación (El Entrenador v2, etapa 4).
//
// EL M19. De 8 a 12 pibes de 16 a 19 años que viven en `CoachState.academy`:
// no son parte de `squad` ni cuentan para el tope de 26. Cada uno tiene puesto,
// nivel, personalidad, un plan de desarrollo y un TECHO REAL OCULTO. Lo que el
// club sabe del techo es un RANGO ESTIMADO (`estMin`..`estMax`) que siempre lo
// contiene y se angosta con la observación y con los años. El techo real no se
// muestra ni se escribe en ningún texto: lo mide `academy.test.ts`.
//
// LA JORNADA DE CAPTACIÓN (minijuego 4), una vez por año en la pretemporada.
// Una tanda de candidatos con información parcial —puesto, edad, una pista en
// palabras y un rango ancho— y PUNTOS DE OBSERVACIÓN para gastar antes de
// elegir: observar a uno angosta su rango a la mitad y deja ver su nivel de hoy.
// Los puntos salen de la formación del entrenador, la estructura y el
// entrenador del M19. Se suman hasta `SCOUT_PICKS`, si hay lugar. De vez en
// cuando aparece una JOYA (`GEM_CHANCE`): techo muy alto y ninguna garantía,
// porque techo no es nivel y un pibe se puede estancar.
//
// LOS PLANES. Físico (rinde en los forwards), técnico (en los backs), minutos
// (rinde de verdad si el pibe juega: cedido) y equilibrado. El crecimiento de
// cada año multiplica el plan por la formación del entrenador, la estructura y
// la mejora del M19, y por una tirada de "cómo le fue el año" que puede
// estancarlo.
//
// EL CIERRE (`closeAcademy`, lo llama `closeSeason`):
//   1. los pibes crecen y cumplen un año; los cedidos vuelven;
//   2. los lugares que dejaron los retirados se cubren primero con los que el
//      entrenador RESERVÓ para primera;
//   3. REGLA DE LOS 20: el que cumple 20 deja el M19. Si hay lugar en el
//      plantel, sube; si no, se va. Está escrita así en la pantalla;
//   4. si todavía faltan, `fillFromAcademy` (transfers.ts) sube a los mejores
//      del M19 de 18 o más, avisado como "subió solo", y recién si el M19 no
//      alcanza genera libres como antes;
//   5. el M19 se completa hasta 8 con chicos de las categorías del club.
//
// DETERMINISMO. Todo el azar sale de RNG DERIVADOS de la semilla, la temporada
// y el club (`arng`): mirar, observar, sumar o promover no consumen el RNG de
// la carrera. Los candidatos se ordenan por id antes de elegir.

import { tierBelow } from '../data/competitions.ts';
import { FIRST_NAMES, SURNAMES } from '../data/names.ts';
import type {
    AcademyLogEntry,
    AcademyPlayer,
    AcademyState,
    CoachState,
    DevPlan,
    PositionGroup,
    ScoutCandidate,
    ScoutingDay,
    SquadPlayer,
} from '../types/coach.ts';
import { debtState } from './finance.ts';
import { createRng, hashSeed, type Rng } from './random.ts';
import {
    GROUP_TARGET,
    SQUAD_MAX,
    drawPersonality,
    emptyStats,
    initialDeal,
    isForward,
    payContext,
    playerLevelOf,
} from './squad.ts';
import { upgradeLevel } from './upgrades.ts';
import { clubsIn } from './world.ts';

/* ------------------------------------------------------------------ */
/* Constantes                                                          */
/* ------------------------------------------------------------------ */

/** El M19 nunca baja de 8 (se completa al cierre) ni pasa de 12. */
export const ACADEMY_MIN = 8;
export const ACADEMY_MAX = 12;
/** Con cuántos arranca un club. */
export const ACADEMY_START = 10;
/** La edad más alta del M19. Al cumplir 20 sube o se va. */
export const ACADEMY_MAX_AGE = 19;
/** Desde esta edad se puede subir a primera a mano. */
export const PROMOTE_MIN_AGE = 17;
/** Desde esta edad sube solo para cubrir un lugar. */
export const AUTO_MIN_AGE = 18;
/** Cedidos del M19 a la vez. */
export const ACADEMY_LOANS = 3;

/** Los que se pueden sumar en una jornada. */
export const SCOUT_PICKS = 3;
/** Candidatos: base, más uno por nivel del entrenador del M19 y uno con estructura ≥ 50. Tope 10. */
export const SCOUT_BASE = 6;
export const SCOUT_MAX = 10;
/**
 * Puntos de observación: `OBS_BASE` + la mitad de la formación (para abajo),
 * +1 con estructura ≥ 60, +1 por nivel del entrenador del M19. El neutro (5)
 * tiene 4; el formador (9), 6; con todo, 10.
 */
export const OBS_BASE = 2;

/**
 * La chance de una joya por jornada. MEDIDO (`academy.test.ts`, 400 carreras ×
 * 12 jornadas): entre el 2 y el 4,5 % de las jornadas traen una.
 */
export const GEM_CHANCE = 0.03;

/** El rango de un candidato: ancho de entrada y lo que queda al observarlo. */
export const SCOUT_WIDTH = 18;
export const GEM_WIDTH = 24;
export const OBSERVE_FACTOR = 0.5;
/** Lo que se angosta el rango de un pibe del M19 cada año que pasa en el club. */
export const YEAR_FACTOR = 0.75;
export const MIN_WIDTH = 3;
/** El rango de un chico de las categorías del club: se lo conoce de chico. */
export const HOME_WIDTH = 10;

/**
 * El crecimiento de un año en el M19: `GROWTH_RATE` de lo que le falta para el
 * techo, por el plan, el entrenador, la estructura, la mejora y la tirada del
 * año (`STALL_MIN`..`STALL_MAX`: con 0,35 el pibe se estancó).
 *
 * MEDIDO el 2026-10-14 (150 carreras × 10 años, el M19 al azar): el pibe que
 * sube a primera llega en promedio 9,9 puntos debajo del nivel base del club;
 * el libre que se generaba al retirarse uno llegaba a base − 8 (más la mejora).
 * Formar no regala nivel: lo que da es elegir a quién, a qué ritmo, con qué
 * techo (la captación trae techos más altos que los chicos del club) y que el
 * que sube es del club (formativo, arraigo, sin vínculo caro).
 */
export const GROWTH_RATE = 0.24;
export const STALL_MIN = 0.35;
export const STALL_MAX = 1.35;
/** Lo que suma cada nivel del entrenador del M19 al crecimiento. */
export const M19_GROWTH_PER_LEVEL = 0.12;

/** Lo que rinde cada plan, por línea y según juegue o no. */
export const PLAN_FACTOR: Readonly<Record<DevPlan, { forward: number; back: number; home: number; loan: number }>> = {
    equilibrado: { forward: 1, back: 1, home: 1, loan: 1.15 },
    fisico: { forward: 1.2, back: 0.9, home: 1, loan: 1.15 },
    tecnico: { forward: 0.9, back: 1.2, home: 1, loan: 1.15 },
    minutos: { forward: 1, back: 1, home: 0.85, loan: 1.45 },
};

export const DEV_PLANS: readonly { id: DevPlan; label: string; hint: string }[] = [
    { id: 'equilibrado', label: 'Equilibrado', hint: 'Un poco de todo. Sin sorpresas.' },
    { id: 'fisico', label: 'Físico', hint: 'Gimnasio y contacto. Rinde en los forwards, menos en los backs.' },
    { id: 'tecnico', label: 'Técnico', hint: 'Pase, pie y lectura. Rinde en los backs, menos en los forwards.' },
    { id: 'minutos', label: 'Minutos', hint: 'Que juegue. Cedido crece mucho; en el club, menos que con otro plan.' },
];

export const EMPTY_ACADEMY: AcademyState = { players: [], scouting: null, log: [] };

/* ------------------------------------------------------------------ */
/* Azar derivado                                                       */
/* ------------------------------------------------------------------ */

type Ctx = Pick<CoachState, 'seed' | 'season' | 'clubId'>;

/** RNG derivado: no toca el de la carrera. */
function arng(state: Ctx, tag: string): Rng {
    return createRng(hashSeed(`academia:${state.seed}:${state.season}:${state.clubId}:${tag}`));
}

function academyOf(state: Pick<CoachState, 'academy'>): AcademyState {
    return state.academy ?? EMPTY_ACADEMY;
}

/** El nivel base de un jugador de primera en el club. */
function baseLevel(state: Pick<CoachState, 'world' | 'clubId'>): number {
    return playerLevelOf(state.world.ratings[state.clubId] ?? 20);
}

/** El orden de puestos para repartir a los chicos: el de la plantilla. */
const GROUP_ORDER: readonly PositionGroup[] = (Object.keys(GROUP_TARGET) as PositionGroup[]).sort();

function groupFor(rng: Rng): PositionGroup {
    // Por peso de la plantilla: hay más primeras líneas que medios.
    return rng.weighted(GROUP_ORDER, (g) => GROUP_TARGET[g]);
}

function round1(v: number): number {
    return Math.round(v * 10) / 10;
}

function clamp(v: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, v));
}

/**
 * Arma el rango estimado alrededor del techo: `width` de ancho, con el techo en
 * un lugar al azar adentro. Lo contiene SIEMPRE.
 */
function rangeAround(rng: Rng, ceiling: number, width: number): { estMin: number; estMax: number } {
    const below = width * rng.float(0.15, 0.85);
    return { estMin: round1(ceiling - below), estMax: round1(ceiling - below + width) };
}

/**
 * Angosta un rango por `factor`, encogiéndolo PROPORCIONALMENTE alrededor del
 * techo: el techo queda adentro y la posición relativa no cambia, así que
 * angostar no le dice al jugador nada que el ancho nuevo no diga.
 */
function narrow<T extends { ceiling: number; estMin: number; estMax: number }>(x: T, factor: number): T {
    const width = x.estMax - x.estMin;
    if (width <= MIN_WIDTH) return x;
    const next = Math.max(MIN_WIDTH, width * factor);
    const k = next / width;
    const below = (x.ceiling - x.estMin) * k;
    const above = (x.estMax - x.ceiling) * k;
    // Redondeo hacia afuera: el techo nunca queda fuera por una décima.
    return { ...x, estMin: Math.floor((x.ceiling - below) * 10) / 10, estMax: Math.ceil((x.ceiling + above) * 10) / 10 };
}

/** El mínimo del rango de un pibe del club nunca queda debajo de lo que ya es. */
function floorAtLevel(k: AcademyPlayer): AcademyPlayer {
    return k.estMin >= k.level ? k : { ...k, estMin: round1(Math.min(k.level, k.ceiling)) };
}

/* ------------------------------------------------------------------ */
/* Generación                                                          */
/* ------------------------------------------------------------------ */

/** Un chico de las categorías del club: se lo conoce, el rango es más angosto. */
function homeKid(rng: Rng, base: number, age: number, id: string, season: number): AcademyPlayer {
    const group = groupFor(rng);
    const level = round1(clamp(rng.normal(base - 16 + (age - 16) * 3, 3.5), 8, 70));
    const ceiling = round1(clamp(level + (27 - age) * rng.float(0.7, 1.5), level, 92));
    const name = `${rng.pick(FIRST_NAMES)} ${rng.pick(SURNAMES)}`;
    const personality = drawPersonality(rng);
    const range = rangeAround(rng, ceiling, HOME_WIDTH);
    return floorAtLevel({
        id,
        name,
        group,
        age,
        level,
        ceiling,
        ...range,
        personality,
        plan: 'equilibrado',
        joined: season,
        loanClubId: null,
        reserve: false,
        gem: false,
    });
}

/**
 * El M19 con el que arranca un club, sin tocar el RNG de la carrera. Lo usan
 * `createCareer`, el cambio de club y el migrador del esquema 8.
 */
export function seedAcademy(state: Pick<CoachState, 'seed' | 'season' | 'clubId' | 'world'>): AcademyState {
    const rng = arng(state, 'inicio');
    const base = baseLevel(state);
    const ages = [16, 16, 17, 17, 17, 18, 18, 18, 19, 19];
    const players = ages.slice(0, ACADEMY_START).map((age, i) =>
        homeKid(rng, base, age, `${state.clubId}-j${state.season}-i${i}`, state.season),
    );
    return { players, scouting: null, log: [] };
}

const FORWARD_TRAITS = [
    'Fuerte en el contacto',
    'Gana la pelota en el line',
    'Empuja en el scrum como uno grande',
    'Llega a todos los rucks',
    'Todavía le falta peso',
    'Tacklea bajo y se levanta rápido',
];
const BACK_TRAITS = [
    'Rápido cuando encuentra espacio',
    'Tiene buena mano',
    'Patea bien con los dos pies',
    'Lee bien a la defensa',
    'Le cuesta el tackle',
    'Cambia de ritmo y se va',
];

/**
 * La pista de un candidato: un rasgo físico o técnico y una impresión. La
 * impresión mira el techo con RUIDO (no es el techo): una joya suele llamar la
 * atención, pero un pibe común también puede.
 */
function hintFor(rng: Rng, group: PositionGroup, ceiling: number, base: number): string {
    const trait = rng.pick(isForward(group) ? FORWARD_TRAITS : BACK_TRAITS);
    const noisy = ceiling - base + rng.normal(0, 4);
    const impression =
        noisy >= 10
            ? 'Todos los que lo vieron hablan de él.'
            : noisy >= 3
              ? 'Se destaca entre los de su edad.'
              : noisy >= -4
                ? 'Cumple, sin llamar la atención.'
                : 'Tiene cosas, pero le falta.';
    return `${trait}. ${impression}`;
}

function scoutCandidate(rng: Rng, base: number, id: string, gem: boolean): ScoutCandidate {
    const group = groupFor(rng);
    const age = gem ? rng.int(16, 17) : rng.int(16, 18);
    const level = round1(clamp(rng.normal(base - 16 + (age - 16) * 3, 4), 8, 70));
    let ceiling = level + (27 - age) * rng.float(0.8, 1.7) + Math.max(0, rng.normal(1, 3));
    if (gem) ceiling = Math.max(ceiling, base + rng.float(10, 18));
    ceiling = round1(clamp(ceiling, level, 92));
    const name = `${rng.pick(FIRST_NAMES)} ${rng.pick(SURNAMES)}`;
    const personality = drawPersonality(rng);
    const hint = hintFor(rng, group, ceiling, base);
    const range = rangeAround(rng, ceiling, gem ? GEM_WIDTH : SCOUT_WIDTH);
    return { id, name, group, age, level, ceiling, ...range, personality, hint, observed: 0, gem };
}

/** Puntos de observación de la jornada. */
export function observationPoints(state: Pick<CoachState, 'coach' | 'club'>): number {
    return (
        OBS_BASE
        + Math.floor(state.coach.attrs.formacion / 2)
        + (state.club.finances.estructura >= 60 ? 1 : 0)
        + upgradeLevel(state.club, 'm19')
    );
}

/** Candidatos de la jornada. */
export function scoutCount(state: Pick<CoachState, 'club'>): number {
    return Math.min(
        SCOUT_MAX,
        SCOUT_BASE + upgradeLevel(state.club, 'm19') + (state.club.finances.estructura >= 50 ? 1 : 0),
    );
}

/** Arma la jornada de la temporada. Determinista por semilla, temporada y club. */
export function scoutingDay(state: CoachState): ScoutingDay {
    const rng = arng(state, 'captacion');
    const base = baseLevel(state);
    const n = scoutCount(state);
    // La joya se decide primero y en un lugar fijo: la tanda es la misma con o sin ella.
    const gemAt = rng.chance(GEM_CHANCE) ? rng.int(0, n - 1) : -1;
    const candidates: ScoutCandidate[] = [];
    for (let i = 0; i < n; i++) {
        candidates.push(scoutCandidate(rng, base, `${state.clubId}-j${state.season}-c${i}`, i === gemAt));
    }
    const points = observationPoints(state);
    return { season: state.season, candidates, points, pointsMax: points, picksMax: SCOUT_PICKS, signed: [], done: false };
}

/** Abre la jornada del año (en la pretemporada). No consume el RNG de la carrera. */
export function openScouting(state: CoachState): CoachState {
    const a = academyOf(state);
    return { ...state, academy: { ...a, scouting: scoutingDay(state) } };
}

/** La jornada abierta de ESTA temporada, o null. */
export function currentScouting(state: CoachState): ScoutingDay | null {
    const s = academyOf(state).scouting;
    return s && s.season === state.season && !s.done && state.phase === 'preseason' ? s : null;
}

/* ------------------------------------------------------------------ */
/* La jornada: observar, sumar, terminar                               */
/* ------------------------------------------------------------------ */

function withScouting(state: CoachState, scouting: ScoutingDay): CoachState {
    return { ...state, academy: { ...academyOf(state), scouting } };
}

export function observeBlock(state: CoachState, candidateId: string): string | null {
    const day = currentScouting(state);
    if (!day) return 'La jornada de captación ya terminó.';
    const c = day.candidates.find((x) => x.id === candidateId);
    if (!c) return 'Ese chico ya no está en la tanda.';
    if (day.signed.includes(candidateId)) return 'Ya se sumó al M19.';
    if (day.points <= 0) return 'No quedan puntos de observación.';
    if (c.estMax - c.estMin <= MIN_WIDTH) return 'Ya se lo vio todo lo que se lo podía ver.';
    return null;
}

/** Gasta un punto en un candidato: su rango se angosta a la mitad y se ve su nivel de hoy. Sin azar. */
export function observeCandidate(state: CoachState, candidateId: string): CoachState {
    if (observeBlock(state, candidateId)) return state;
    const day = currentScouting(state) as ScoutingDay;
    return withScouting(state, {
        ...day,
        points: day.points - 1,
        candidates: day.candidates.map((c) =>
            c.id === candidateId ? { ...narrow(c, OBSERVE_FACTOR), observed: c.observed + 1 } : c,
        ),
    });
}

export function scoutSignBlock(state: CoachState, candidateId: string): string | null {
    const day = currentScouting(state);
    if (!day) return 'La jornada de captación ya terminó.';
    if (!day.candidates.some((x) => x.id === candidateId)) return 'Ese chico ya no está en la tanda.';
    if (day.signed.includes(candidateId)) return 'Ya se sumó al M19.';
    if (day.signed.length >= day.picksMax) return `Ya sumaste ${day.picksMax}: es lo que el M19 puede recibir por año.`;
    if (academyOf(state).players.length >= ACADEMY_MAX) {
        return `El M19 está completo (${ACADEMY_MAX}): hay que liberar a alguno o subirlo a primera.`;
    }
    return null;
}

/** Suma a un candidato al M19. Llega con el rango que se le vio. */
export function signScout(state: CoachState, candidateId: string): CoachState {
    if (scoutSignBlock(state, candidateId)) return state;
    const day = currentScouting(state) as ScoutingDay;
    const c = day.candidates.find((x) => x.id === candidateId) as ScoutCandidate;
    const kid: AcademyPlayer = {
        id: c.id,
        name: c.name,
        group: c.group,
        age: c.age,
        level: c.level,
        ceiling: c.ceiling,
        estMin: c.estMin,
        estMax: c.estMax,
        personality: c.personality,
        plan: 'equilibrado',
        joined: state.season,
        loanClubId: null,
        reserve: false,
        gem: c.gem,
    };
    const a = academyOf(state);
    const s: CoachState = {
        ...state,
        academy: { ...a, players: [...a.players, floorAtLevel(kid)], scouting: { ...day, signed: [...day.signed, c.id] } },
    };
    return addLog(s, 'sumado', `${c.name} se suma al M19 (${c.age} años).`);
}

/** Termina la jornada. Los puntos que quedan se pierden. */
export function finishScouting(state: CoachState): CoachState {
    const day = academyOf(state).scouting;
    if (!day || day.done) return state;
    return withScouting(state, { ...day, done: true });
}

/* ------------------------------------------------------------------ */
/* Decisiones sobre cada pibe                                          */
/* ------------------------------------------------------------------ */

function findKid(state: CoachState, kidId: string): AcademyPlayer | null {
    return academyOf(state).players.find((k) => k.id === kidId) ?? null;
}

function mapKid(state: CoachState, kidId: string, f: (k: AcademyPlayer) => AcademyPlayer): CoachState {
    const a = academyOf(state);
    return { ...state, academy: { ...a, players: a.players.map((k) => (k.id === kidId ? f(k) : k)) } };
}

function addLog(state: CoachState, kind: AcademyLogEntry['kind'], text: string, playerId = ''): CoachState {
    const a = academyOf(state);
    return {
        ...state,
        academy: {
            ...a,
            log: [...a.log.filter((e) => e.season >= state.season - 1), { season: state.season, kind, playerId, text }],
        },
    };
}

/** ¿Se pueden tomar decisiones sobre el M19 ahora? En la pretemporada y en la ventana corta. */
function decisionsOpen(state: CoachState): boolean {
    return state.phase === 'preseason' || state.phase === 'market';
}

export function setDevPlan(state: CoachState, kidId: string, plan: DevPlan): CoachState {
    const k = findKid(state, kidId);
    if (!k || k.plan === plan || !PLAN_FACTOR[plan] || !decisionsOpen(state)) return state;
    return mapKid(state, kidId, (x) => ({ ...x, plan }));
}

function rosterSize(state: Pick<CoachState, 'squad' | 'transfers'>): number {
    return state.squad.length + (state.transfers?.loaned.length ?? 0);
}

export function promoteBlock(state: CoachState, kidId: string): string | null {
    if (!decisionsOpen(state)) return 'Solo se sube a primera en la pretemporada o en la ventana corta.';
    const k = findKid(state, kidId);
    if (!k) return 'Ya no está en el M19.';
    if (k.loanClubId) return 'Está cedido: vuelve al cerrar el año.';
    if (k.age < PROMOTE_MIN_AGE) return `Con ${k.age} años todavía no puede jugar en primera: desde los ${PROMOTE_MIN_AGE}.`;
    if (rosterSize(state) >= SQUAD_MAX) {
        return `El plantel está completo (${SQUAD_MAX} con los cedidos): hay que liberar a alguien, o reservarlo para el cierre.`;
    }
    return null;
}

function usedNumbers(state: Pick<CoachState, 'squad' | 'transfers'>): Set<number> {
    return new Set([...state.squad.map((p) => p.number), ...(state.transfers?.loaned ?? []).map((l) => l.player.number)]);
}

function freeNumber(state: Pick<CoachState, 'squad' | 'transfers'>): number {
    const used = usedNumbers(state);
    let n = 1;
    while (used.has(n)) n++;
    return n;
}

function uniqueId(state: Pick<CoachState, 'squad' | 'transfers'>, id: string): string {
    const ids = new Set([...state.squad.map((p) => p.id), ...(state.transfers?.loaned ?? []).map((l) => l.player.id)]);
    let out = id;
    while (ids.has(out)) out = `${out}x`;
    return out;
}

/**
 * El pibe pasa al plantel: formado en el club, con ganas y con el vínculo más
 * bajo de su dorsal (amateur si la deuda no deja sumar vínculos). Desde acá su
 * techo es el de un jugador de primera (`potential`), que la ficha del plantel
 * muestra como siempre: en primera el cuerpo técnico ya lo conoce.
 */
function kidToPlayer(state: CoachState, k: AcademyPlayer): SquadPlayer {
    const number = freeNumber(state);
    const rng = createRng(hashSeed(`academia:${state.seed}:${k.id}:sube`));
    const pay = payContext(state.competitionId);
    const frozen = pay.status !== 'amateur' && debtState(state).restrictions.dealsFrozen;
    const deal = frozen
        ? { kind: 'amateur' as const, monthly: 0, years: 0 }
        : initialDeal(rng, pay, number, Math.min(k.level - baseLevel(state), -6));
    return {
        id: uniqueId(state, k.id),
        name: k.name,
        group: k.group,
        number,
        age: k.age,
        level: k.level,
        potential: k.ceiling,
        frontRowCertified: false,
        seasonsAtClub: 1,
        morale: 70,
        fatigue: 0,
        injury: 0,
        personality: k.personality,
        homegrown: true,
        commitment: 75,
        deal,
        stats: emptyStats(),
        career: emptyStats(),
    };
}

/** Sube al pibe y lo saca del M19. `kind` dice si fue decisión o para cubrir un lugar. */
function promote(state: CoachState, k: AcademyPlayer, kind: 'promocion' | 'auto', why: string): CoachState {
    const player = kidToPlayer(state, k);
    const a = academyOf(state);
    const s: CoachState = {
        ...state,
        squad: [...state.squad, player],
        academy: { ...a, players: a.players.filter((x) => x.id !== k.id) },
    };
    // El lugar que deja en el M19 lo ocupa un chico de las categorías del club:
    // el M19 nunca baja de 8.
    return refillAcademy(
        addLog(s, kind, `${k.name} sube a primera (${k.age} años, nivel ${Math.round(k.level)})${why}.`, player.id),
    );
}

/** Subir a primera ahora: entra al plantel con el dorsal libre más bajo. */
export function promoteKid(state: CoachState, kidId: string): CoachState {
    if (promoteBlock(state, kidId)) return state;
    return promote(state, findKid(state, kidId) as AcademyPlayer, 'promocion', '');
}

/** Reservarlo para primera: cubre el primer lugar que se libere al cierre. */
export function toggleReserve(state: CoachState, kidId: string): CoachState {
    const k = findKid(state, kidId);
    if (!k || !decisionsOpen(state)) return state;
    return mapKid(state, kidId, (x) => ({ ...x, reserve: !x.reserve }));
}

/** El club al que va cedido un pibe del M19: uno de la división de abajo, o de los flojos de la propia. */
export function kidLoanDestination(state: CoachState, kidId: string): string | null {
    const below = tierBelow(state.competitionId)?.id;
    const pool = (below ? clubsIn(state.world, below) : clubsIn(state.world, state.competitionId).slice(-4))
        .filter((id) => id !== state.clubId)
        .sort((a, b) => a.localeCompare(b));
    if (pool.length === 0) return null;
    return pool[hashSeed(`cesion-m19:${state.seed}:${state.season}:${kidId}`) % pool.length];
}

export function loanKidBlock(state: CoachState, kidId: string): string | null {
    if (state.phase !== 'preseason') return 'Solo se cede en la pretemporada.';
    const k = findKid(state, kidId);
    if (!k) return 'Ya no está en el M19.';
    if (k.loanClubId) return 'Ya está cedido.';
    if (k.age < PROMOTE_MIN_AGE) return `Con ${k.age} años no se lo cede: desde los ${PROMOTE_MIN_AGE}.`;
    if (academyOf(state).players.filter((x) => x.loanClubId).length >= ACADEMY_LOANS) {
        return `Ya hay ${ACADEMY_LOANS} cedidos del M19: más es vaciar la categoría.`;
    }
    if (!kidLoanDestination(state, kidId)) return 'No hay un club de abajo que lo reciba.';
    return null;
}

/** Cederlo por la temporada: juega en un club de abajo y vuelve al cierre. Sigue siendo del M19. */
export function loanKid(state: CoachState, kidId: string): CoachState {
    if (loanKidBlock(state, kidId)) return state;
    const k = findKid(state, kidId) as AcademyPlayer;
    const clubId = kidLoanDestination(state, kidId) as string;
    const s = mapKid(state, kidId, (x) => ({ ...x, loanClubId: clubId, reserve: false }));
    return addLog(s, 'cesion', `${k.name} se va cedido por la temporada.`, kidId);
}

export function releaseKidBlock(state: CoachState, kidId: string): string | null {
    if (!decisionsOpen(state)) return 'Solo en la pretemporada o en la ventana corta.';
    const k = findKid(state, kidId);
    if (!k) return 'Ya no está en el M19.';
    if (k.loanClubId) return 'Está cedido: se decide cuando vuelva.';
    if (academyOf(state).players.length <= ACADEMY_MIN) return `Con ${ACADEMY_MIN} en el M19 no se puede liberar a nadie más.`;
    return null;
}

/** Liberarlo: deja el club. */
export function releaseKid(state: CoachState, kidId: string): CoachState {
    if (releaseKidBlock(state, kidId)) return state;
    const k = findKid(state, kidId) as AcademyPlayer;
    const a = academyOf(state);
    const s: CoachState = { ...state, academy: { ...a, players: a.players.filter((x) => x.id !== kidId) } };
    return addLog(s, 'se-va', `${k.name} deja el M19.`, kidId);
}

/* ------------------------------------------------------------------ */
/* Subir para cubrir un lugar                                          */
/* ------------------------------------------------------------------ */

/**
 * Sube del M19 al mejor de 18 o más (o de `minAge`), del puesto que se le pide
 * si hay; si no, el mejor de cualquier puesto. null si el M19 no tiene a nadie.
 * La usa `fillFromAcademy` antes de generar un libre.
 */
export function takeFromAcademy(state: CoachState, group: PositionGroup, minAge = AUTO_MIN_AGE): CoachState | null {
    const pool = academyOf(state)
        .players.filter((k) => !k.loanClubId && k.age >= minAge)
        .sort((a, b) => b.level - a.level || a.id.localeCompare(b.id));
    const k = pool.find((x) => x.group === group) ?? pool[0];
    if (!k) return null;
    return promote(state, k, 'auto', ': subió para cubrir un lugar');
}

/* ------------------------------------------------------------------ */
/* El cierre                                                           */
/* ------------------------------------------------------------------ */

/** El multiplicador del entrenador, la estructura y la mejora del M19. */
export function academyFactor(state: Pick<CoachState, 'coach' | 'club'>): number {
    return (
        (0.6 + state.coach.attrs.formacion / 12)
        * (0.7 + state.club.finances.estructura / 160)
        * (1 + upgradeLevel(state.club, 'm19') * M19_GROWTH_PER_LEVEL)
    );
}

/** Lo que crece un pibe en un año, con la tirada que se le pasa. */
export function growKid(k: AcademyPlayer, factor: number, stall: number): AcademyPlayer {
    const f = PLAN_FACTOR[k.plan] ?? PLAN_FACTOR.equilibrado;
    const plan = (isForward(k.group) ? f.forward : f.back) * (k.loanClubId ? f.loan : f.home);
    const pers = k.personality === 'profesional' ? 1.1 : k.personality === 'conflictivo' ? 0.85 : 1;
    const gap = Math.max(0, k.ceiling - k.level);
    const level = round1(Math.min(k.ceiling, k.level + gap * GROWTH_RATE * plan * factor * stall * pers));
    return { ...k, level: Math.max(k.level, level) };
}

/**
 * El M19 al cerrar el año. `state` ya es el de la temporada NUEVA (con el
 * plantel envejecido y sin los retirados); `prevSeason` es la que terminó (de
 * ella sale la tirada del crecimiento). Hace los pasos 1 a 3 del encabezado;
 * el 4 lo hace `fillFromAcademy` y el 5 `refillAcademy`.
 */
export function closeAcademy(state: CoachState, prevSeason: number): CoachState {
    const a = academyOf(state);
    const rng = arng({ ...state, season: prevSeason }, 'cierre');
    const factor = academyFactor(state);
    let s: CoachState = state;
    const grown: AcademyPlayer[] = [];
    for (const k of [...a.players].sort((x, y) => x.id.localeCompare(y.id))) {
        const stall = rng.float(STALL_MIN, STALL_MAX);
        const g = growKid(k, factor, stall);
        const back = narrow({ ...g, age: g.age + 1, loanClubId: null }, YEAR_FACTOR);
        grown.push(floorAtLevel(back));
        if (k.loanClubId) s = addLog(s, 'vuelve', `${k.name} vuelve de la cesión.`, k.id);
    }
    // El orden del M19 se conserva (el de la lista que ve el jugador).
    const order = new Map(a.players.map((k, i) => [k.id, i]));
    grown.sort((x, y) => (order.get(x.id) ?? 0) - (order.get(y.id) ?? 0));
    s = { ...s, academy: { ...academyOf(s), players: grown } };

    const byLevel = (x: AcademyPlayer, y: AcademyPlayer) => y.level - x.level || x.id.localeCompare(y.id);
    // 2. Los reservados, a los lugares que quedaron.
    for (const k of grown.filter((x) => x.reserve).sort(byLevel)) {
        if (rosterSize(s) >= SQUAD_MAX) break;
        if (k.age < PROMOTE_MIN_AGE) continue;
        s = promote(s, { ...k, reserve: false }, 'promocion', ': lo habías reservado para primera');
    }
    // 3. La regla de los 20: sube si hay lugar; si no, se va.
    for (const k of academyOf(s).players.filter((x) => x.age > ACADEMY_MAX_AGE).sort(byLevel)) {
        if (rosterSize(s) < SQUAD_MAX) {
            s = promote(s, k, 'auto', ': cumplió 20 y había lugar');
        } else {
            const left: CoachState = {
                ...s,
                academy: { ...academyOf(s), players: academyOf(s).players.filter((x) => x.id !== k.id) },
            };
            s = addLog(left, 'se-va', `${k.name} cumplió 20 y no había lugar en primera: deja el club.`, k.id);
        }
    }
    // Los reservados que no entraron siguen reservados para la próxima, y se avisa:
    // si no, la reserva parece no haber hecho nada.
    for (const k of academyOf(s).players.filter((x) => x.reserve).sort(byLevel)) {
        s = addLog(s, 'espera', `${k.name} estaba reservado y no se liberó ningún lugar en primera: sigue reservado.`, k.id);
    }
    return s;
}

/**
 * Completa el M19 hasta 8 con chicos de 16 y 17 de las categorías del club. Se
 * llama cada vez que uno sube y al cierre. El tag y los ids llevan cuántos
 * movimientos hubo en la temporada (cada salida del M19 deja uno en el
 * registro), así que dos rellenos del mismo año no repiten chico.
 */
export function refillAcademy(state: CoachState): CoachState {
    const a = academyOf(state);
    if (a.players.length >= ACADEMY_MIN) return state;
    const moves = a.log.filter((e) => e.season === state.season).length;
    const rng = arng(state, `relleno:${moves}`);
    const base = baseLevel(state);
    const players = [...a.players];
    for (let i = 0; players.length < ACADEMY_MIN; i++) {
        players.push(homeKid(rng, base, rng.int(16, 17), `${state.clubId}-j${state.season}-r${moves}-${i}`, state.season));
    }
    return { ...state, academy: { ...a, players } };
}

/* ------------------------------------------------------------------ */
/* Lecturas                                                            */
/* ------------------------------------------------------------------ */

/** Los que subieron del M19 a primera en la temporada (por decisión o para cubrir un lugar). */
export function promotionsIn(state: Pick<CoachState, 'academy'>, season: number): number {
    return academyOf(state).log.filter((e) => e.season === season && (e.kind === 'promocion' || e.kind === 'auto')).length;
}

/** Los que podrían subir hoy: 18 o más, en el club. */
export function readyKids(state: Pick<CoachState, 'academy'>): AcademyPlayer[] {
    return academyOf(state).players.filter((k) => !k.loanClubId && k.age >= AUTO_MIN_AGE);
}

/** El rango estimado como lo lee el jugador: enteros que contienen al rango guardado. */
export function estimateOf(x: Pick<AcademyPlayer, 'estMin' | 'estMax'>): { min: number; max: number } {
    return { min: Math.floor(x.estMin), max: Math.ceil(x.estMax) };
}

/** El rango en palabras. Nunca el techo real. */
export function estimateWords(x: Pick<AcademyPlayer, 'estMin' | 'estMax'>): string {
    const { min, max } = estimateOf(x);
    return `Techo estimado entre ${min} y ${max}`;
}

/** Lo que pasó con el M19 en esta temporada, para la pantalla. */
export function academyNews(state: Pick<CoachState, 'academy' | 'season'>): AcademyLogEntry[] {
    return academyOf(state).log.filter((e) => e.season === state.season);
}
