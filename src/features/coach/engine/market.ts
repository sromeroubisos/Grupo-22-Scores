// El mercado de entrenadores.
//
// Las propuestas salen de VACANTES REALES del mundo, no de una lista inventada
// para que haya algo que mostrar. Al cerrar cada temporada:
//
//   1. Cada club decide si sigue con su entrenador. Lo que pesa es lo que le pasó
//      al club: el que descendió echa al técnico la mitad de las veces, el que
//      ascendió casi nunca; en la división del jugador, que es la única que se
//      juega partido a partido, se mira la tabla. Un ciclo largo también se
//      termina solo. Los que se van pasan a la bolsa de entrenadores libres.
//   2. Cada vacante evalúa a los candidatos: los libres y el jugador. A cada uno
//      lo mide igual —reputación contra lo que pide el club—, y al jugador además
//      por los resultados de sus últimas temporadas, así que un entrenador con un
//      ascenso encima le gana la vacante a uno libre con más nombre.
//   3. Si el jugador está entre los candidatos fuertes, el club lo llama: la
//      vacante queda ESPERANDO su respuesta. Si no, el club contrata al mejor de
//      la bolsa o a un ayudante que asciende.
//
// Las propuestas no están garantizadas: un año malo trae menos, o ninguna, y la
// pantalla lo dice. La única garantía es para el que se quedó sin club: nadie
// queda bloqueado para siempre fuera del rugby.
//
// El azar del mercado sale de un RNG DERIVADO (semilla y temporada). No consume
// el de la carrera: el mercado puede cambiar sin correr la secuencia de los
// partidos.

import { getClub } from '../data/clubs.ts';
import type {
    BenchCoach,
    JobOffer,
    MarketNews,
    MarketState,
    SeasonEntry,
    TableRow,
    VacancyReason,
} from '../types/coach.ts';
import { npcCoach, repForLevel } from './coaches.ts';
import { objectiveFor } from './pressure.ts';
import { createRng, hashSeed, type Rng } from './random.ts';
import { clubsIn, levelOf, type Moved, type WorldState } from './world.ts';

/** Cuántas propuestas puede tener el jugador sobre la mesa a la vez. */
export const MAX_OFFERS = 3;
/** Por debajo de este interés un club no llama a nadie. */
export const MIN_INTEREST = 45;
/** Tamaño de la bolsa de entrenadores libres. */
const FREE_AGENT_POOL = 40;
/** Con este nombre un técnico ya es nacional: lo llaman de cualquier región. */
export const NATIONAL_REPUTATION = 60;

/**
 * ¿Este club llamaría a un técnico de otra región? Por debajo del Top 14, no:
 * en el rugby amateur se contrata en la zona. Es una PUERTA y no un descuento
 * del interés a propósito: hay muchas más vacantes afuera de la región del
 * jugador que adentro (el interior tiene seis regiones), y un descuento pierde
 * contra el volumen —medido: con un −12 el 70 % de las propuestas eran de otra
 * región—. Se abre con el nombre: el técnico con reputación nacional va donde
 * lo llamen. Es la misma lección que la ventana del amateur de Carrera de Rugby.
 */
export function regionalDoorOpen(world: WorldState, clubId: string, player: PlayerProfile): boolean {
    const club = getClub(clubId);
    if (!club || !player.regionId || club.regionId === player.regionId) return true;
    return levelOf(world, clubId) <= 2 || player.reputation >= NATIONAL_REPUTATION;
}

export const EMPTY_MARKET: MarketState = { season: 0, offers: [], news: [] };

export interface PlayerProfile {
    name: string;
    reputation: number;
    /** El club que dirige hoy. null = sin club (lo echaron). */
    clubId: string | null;
    /** El escalón del último torneo que dirigió (2 = Top 14, 5 = la base). */
    level: number;
    /** La región del último club que dirigió: en el rugby amateur nadie se muda por nada. */
    regionId: string;
    seasons: readonly SeasonEntry[];
    /** Lo echaron en el cierre que acaba de pasar. */
    justFired: boolean;
}

export interface MarketInput {
    seed: number;
    /** La temporada para la que valen las ofertas (la que viene). */
    season: number;
    /** El año de esa temporada. */
    year: number;
    /** El mundo YA movido por el tick: divisiones del año que viene. */
    world: WorldState;
    moved: Moved;
    /** La tabla del torneo del jugador, la única que se jugó partido a partido. */
    lastTable: readonly TableRow[];
    player: PlayerProfile;
    /** El club que el jugador dejó en este cierre (despido). Su vacante no es para él. */
    leftClubId: string | null;
}

export interface MarketOutput {
    world: WorldState;
    market: MarketState;
}

interface Vacancy {
    clubId: string;
    reason: VacancyReason;
    outgoing: string;
}

/**
 * Lo que un club le pide a un candidato, en reputación. Sale del escalón, de
 * dónde está el club dentro de su torneo y de lo que le acaba de pasar: un club
 * que bajó busca alguien que reconstruya y afloja la vara; uno que subió quiere
 * sostener la categoría y la sube.
 */
export function requiredRep(world: WorldState, clubId: string, moved: 'ascenso' | 'descenso' | null): number {
    const compId = world.divisions[clubId];
    const ids = compId ? clubsIn(world, compId) : [];
    const rank = ids.indexOf(clubId) + 1;
    const teams = Math.max(1, ids.length);
    let need = repForLevel(levelOf(world, clubId));
    if (rank > 0 && rank <= Math.ceil(teams / 3)) need += 8;
    else if (rank > Math.ceil((teams * 2) / 3)) need -= 6;
    if (moved === 'descenso') need -= 8;
    if (moved === 'ascenso') need += 5;
    return need;
}

/**
 * Los resultados recientes del entrenador, como los mira una subcomisión que
 * busca técnico: la última temporada pesa entera, las anteriores un poco menos.
 */
export function formScore(seasons: readonly SeasonEntry[]): number {
    const recent = seasons.slice(-3).reverse();
    const weights = [1, 0.7, 0.45];
    let score = 0;
    recent.forEach((s, i) => {
        let v = s.objectiveMet ? 5 : -5;
        if (s.champion) v += 8;
        if (s.movement === 'ascenso') v += 10;
        if (s.movement === 'descenso') v -= 12;
        if (s.tdi === 'campeon') v += 6;
        if (s.nacional) v += 10;
        score += v * weights[i];
    });
    return score;
}

/** Cuánto quiere un club a un entrenador libre de la bolsa, 0..100. */
export function npcInterest(coach: BenchCoach, need: number): number {
    return clamp(Math.round(50 + (coach.rep - need) * 1.3), 0, 100);
}

/**
 * Cuánto quiere un club al jugador, 0..100, y por qué. Mide lo mismo que a los
 * de la bolsa —reputación contra lo que pide el club— y le suma lo que los otros
 * no tienen a la vista: los resultados de sus últimas temporadas.
 */
export function playerInterest(
    world: WorldState,
    clubId: string,
    moved: 'ascenso' | 'descenso' | null,
    player: PlayerProfile,
): { interest: number; reasons: string[] } {
    const need = requiredRep(world, clubId, moved);
    const level = levelOf(world, clubId);
    // Positivo si el club está más arriba que donde dirige el jugador.
    const jump = player.level - level;
    const form = formScore(player.seasons);
    const club = getClub(clubId);
    const otherRegion = !!club && !!player.regionId && club.regionId !== player.regionId;

    // Tener más nombre que lo que pide el club suma, pero con techo: a un club
    // chico no le cambia nada que el candidato tenga el doble de lo que pide.
    let interest = 50 + Math.max(-40, Math.min(15, player.reputation - need)) * 1.3 + form;
    if (jump >= 2) interest -= 15 * (jump - 1);
    // Un club de abajo sabe que a un técnico con trabajo le cuesta bajar.
    if (jump === -1 && player.clubId !== null) interest -= 10;
    if (jump <= -2) interest -= 25;
    // Mudarse es otra vida: aun pasando la puerta regional (`regionalDoorOpen`),
    // un club de abajo del Top 14 prefiere al de su zona.
    if (otherRegion && level >= 3) interest -= 12;
    if (player.justFired) interest -= 8;

    const reasons: string[] = [];
    const last = player.seasons[player.seasons.length - 1];
    if (last?.movement === 'ascenso') reasons.push(`Vieron el ascenso de ${last.year}.`);
    else if (last?.champion) reasons.push(`Vieron el título de ${last.year}.`);
    else if (last?.objectiveMet) reasons.push('Cumpliste lo que te pidieron el año pasado.');
    if (player.reputation >= need) reasons.push('Tu nombre alcanza para la categoría.');
    else if (form > 0) reasons.push('Te llaman por los resultados más que por el nombre.');
    if (moved === 'descenso') reasons.push('Bajaron de categoría y buscan alguien que reconstruya.');
    if (moved === 'ascenso') reasons.push('Acaban de subir y quieren sostener la categoría.');
    if (jump === 1) reasons.push('Es un escalón más arriba del que dirigís.');
    if (jump >= 2) reasons.push('Es un salto grande de categoría.');
    if (jump <= -1) reasons.push('Es bajar de categoría.');
    if (otherRegion) reasons.push(`Te tenés que mudar${club?.city ? ` a ${club.city}` : ''}.`);
    if (reasons.length === 0) reasons.push('Buscan entrenador y tu perfil les cierra.');

    return { interest: clamp(Math.round(interest), 0, 100), reasons };
}

/** La chance de que el club efectivamente llame, con ese interés. */
function callChance(interest: number): number {
    return clamp((interest - 40) / 40, 0.05, 0.85);
}

/**
 * Probabilidad de que un club cambie de entrenador al cierre. Lo que le pasó al
 * club manda; el ciclo largo suma. En la división del jugador se mira la tabla.
 */
function departureChance(
    world: WorldState,
    clubId: string,
    coach: BenchCoach,
    year: number,
    moved: 'ascenso' | 'descenso' | null,
    tablePos: number,
    tableSize: number,
): number {
    let p = 0.07;
    if (moved === 'descenso') p = 0.5;
    else if (moved === 'ascenso') p = 0.03;
    else if (tablePos > 0) {
        if (tablePos > tableSize - 3) p = 0.3;
        else if (tablePos <= 2) p = 0.03;
    } else {
        const ids = clubsIn(world, world.divisions[clubId] ?? '');
        const rank = ids.indexOf(clubId) + 1;
        if (rank > Math.ceil((ids.length * 2) / 3)) p = 0.1;
    }
    const tenure = year - coach.since;
    if (tenure >= 5) p += Math.min(0.25, 0.05 * (tenure - 4));
    return clamp(p, 0, 0.9);
}

function departureReason(rng: Rng, coach: BenchCoach, year: number, moved: 'ascenso' | 'descenso' | null): VacancyReason {
    if (moved === 'descenso') return 'despido';
    if (year - coach.since >= 6 && rng.chance(0.5)) return 'ciclo';
    return rng.chance(0.7) ? 'despido' : 'renuncia';
}

/** El que se va pasa a la bolsa, con la reputación que le deja la salida. */
function toFreeAgent(coach: BenchCoach, reason: VacancyReason): BenchCoach {
    const delta = reason === 'despido' ? -3 : reason === 'ciclo' ? 2 : 0;
    return { ...coach, rep: clamp(coach.rep + delta, 0, 100) };
}

function sortPool(pool: readonly BenchCoach[]): BenchCoach[] {
    return [...pool].sort((a, b) => b.rep - a.rep || a.name.localeCompare(b.name)).slice(0, FREE_AGENT_POOL);
}

/**
 * Cubre una vacante con el mejor de la bolsa o, si nadie de la bolsa le sirve
 * al club, con un ayudante que asciende. Sin azar: el mismo mundo, el mismo
 * elegido. Devuelve el mundo nuevo y la noticia.
 */
export function fillVacancy(
    world: WorldState,
    clubId: string,
    year: number,
    season: number,
    reason: VacancyReason,
    outgoing: string,
    moved: 'ascenso' | 'descenso' | null = null,
): { world: WorldState; news: MarketNews } {
    const need = requiredRep(world, clubId, moved);
    let bestIdx = -1;
    let bestScore = -1;
    world.freeAgents.forEach((c, i) => {
        const s = npcInterest(c, need);
        if (s > bestScore) {
            bestScore = s;
            bestIdx = i;
        }
    });
    let incoming: BenchCoach;
    const freeAgents = [...world.freeAgents];
    if (bestIdx >= 0 && bestScore >= MIN_INTEREST) {
        incoming = { ...freeAgents[bestIdx], since: year };
        freeAgents.splice(bestIdx, 1);
    } else {
        incoming = npcCoach(`${clubId}:${year}:${season}`, levelOf(world, clubId), year);
    }
    return {
        world: { ...world, benches: { ...world.benches, [clubId]: incoming }, freeAgents },
        news: {
            clubId,
            competitionId: world.divisions[clubId] ?? '',
            reason,
            outgoing,
            incoming: incoming.name,
        },
    };
}

/** La propuesta, armada con lo que el jugador necesita para decidir. */
function buildOffer(
    world: WorldState,
    v: Vacancy,
    moved: 'ascenso' | 'descenso' | null,
    year: number,
    interest: number,
    reasons: string[],
): JobOffer {
    const competitionId = world.divisions[v.clubId] ?? '';
    const ids = clubsIn(world, competitionId);
    const rank = ids.indexOf(v.clubId) + 1;
    return {
        clubId: v.clubId,
        competitionId,
        reason: v.reason,
        outgoing: v.outgoing,
        moved,
        rank,
        teams: ids.length,
        objective: objectiveFor(competitionId, Math.max(1, rank), year),
        interest,
        reasons,
    };
}

/**
 * El mercado al cierre de una temporada: salen entrenadores, se abren vacantes,
 * se evalúan candidatos y el jugador recibe (o no) propuestas.
 */
export function marketTick(input: MarketInput): MarketOutput {
    const { year, season, moved, player } = input;
    const rng = createRng(hashSeed(`mercado:${input.seed}:${season}`));
    let world: WorldState = {
        ...input.world,
        benches: { ...input.world.benches },
        // La bolsa envejece: un año sin club pesa en el nombre.
        freeAgents: input.world.freeAgents.map((c) => ({ ...c, rep: c.rep - 2 })).filter((c) => c.rep > 0),
    };

    // 1. Quién se va. En orden de id: el orden de inserción no decide nada.
    const tableSize = input.lastTable.length;
    const vacancies: Vacancy[] = [];
    const leaving: BenchCoach[] = [];
    for (const clubId of Object.keys(world.benches).sort()) {
        const coach = world.benches[clubId];
        if (!world.divisions[clubId]) continue;
        const pos = input.lastTable.findIndex((r) => r.clubId === clubId) + 1;
        const m = moved[clubId] ?? null;
        if (!rng.chance(departureChance(world, clubId, coach, year, m, pos, tableSize))) continue;
        const reason = departureReason(rng, coach, year, m);
        vacancies.push({ clubId, reason, outgoing: coach.name });
        leaving.push(toFreeAgent(coach, reason));
        delete world.benches[clubId];
    }
    world.freeAgents = sortPool([...world.freeAgents, ...leaving]);
    // El club que el jugador dejó también busca entrenador, pero no lo va a llamar a él.
    if (input.leftClubId && world.divisions[input.leftClubId] && !world.benches[input.leftClubId]) {
        vacancies.push({ clubId: input.leftClubId, reason: 'despido', outgoing: player.name });
    }

    // 2. Los clubes de arriba eligen primero: el Top 14 no espera al Pampeano.
    vacancies.sort((a, b) => levelOf(world, a.clubId) - levelOf(world, b.clubId) || a.clubId.localeCompare(b.clubId));

    const held: JobOffer[] = [];
    const scored: { v: Vacancy; interest: number; reasons: string[] }[] = [];
    for (const v of vacancies) {
        if (v.clubId === input.leftClubId || v.clubId === player.clubId) continue;
        if (!regionalDoorOpen(world, v.clubId, player)) continue;
        const m = moved[v.clubId] ?? null;
        const need = requiredRep(world, v.clubId, m);
        const bestNpc = world.freeAgents.reduce((best, c) => Math.max(best, npcInterest(c, need)), 0);
        const { interest, reasons } = playerInterest(world, v.clubId, m, player);
        scored.push({ v, interest, reasons });
        // El club llama al jugador si es de los candidatos fuertes: le alcanza la
        // vara y no hay en la bolsa alguien claramente mejor.
        const contender = interest >= MIN_INTEREST && interest >= bestNpc - 8;
        if (contender && held.length < MAX_OFFERS && rng.chance(callChance(interest))) {
            held.push(buildOffer(world, v, m, year, interest, reasons));
        }
    }

    // El que se quedó sin club no queda afuera del rugby: si nadie lo llamó, lo
    // llaman las dos vacantes donde mejor cae, aunque no sean las que soñaba. Si
    // en su región no hay ninguna, la puerta se abre: mejor mudarse que no dirigir.
    if (player.clubId === null && held.length === 0 && scored.length === 0) {
        for (const v of vacancies) {
            if (v.clubId === input.leftClubId) continue;
            const m = moved[v.clubId] ?? null;
            scored.push({ v, ...playerInterest(world, v.clubId, m, player) });
        }
    }
    if (player.clubId === null && held.length === 0) {
        const best = [...scored]
            .sort((a, b) => b.interest - a.interest || a.v.clubId.localeCompare(b.v.clubId))
            .slice(0, 2);
        for (const s of best) held.push(buildOffer(world, s.v, moved[s.v.clubId] ?? null, year, s.interest, s.reasons));
    }

    // 3. Lo que no espera al jugador se cubre ahora, en el mismo orden.
    const heldIds = new Set(held.map((o) => o.clubId));
    const news: MarketNews[] = [];
    for (const v of vacancies) {
        if (heldIds.has(v.clubId)) continue;
        const filled = fillVacancy(world, v.clubId, year, season, v.reason, v.outgoing, moved[v.clubId] ?? null);
        world = filled.world;
        news.push(filled.news);
    }

    return {
        world,
        market: {
            season,
            offers: held.sort((a, b) => b.interest - a.interest || a.clubId.localeCompare(b.clubId)),
            news,
        },
    };
}

/** Las propuestas que nadie respondió se caen: esos clubes contratan a otro. */
export function expireOffers(
    world: WorldState,
    market: MarketState,
    year: number,
    keep: string | null = null,
): { world: WorldState; market: MarketState } {
    let w = world;
    const news = [...market.news];
    for (const o of market.offers) {
        if (o.clubId === keep) continue;
        const filled = fillVacancy(w, o.clubId, year, market.season, o.reason, o.outgoing, o.moved);
        w = filled.world;
        news.push(filled.news);
    }
    return { world: w, market: { ...market, offers: [], news } };
}

function clamp(v: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, v));
}
