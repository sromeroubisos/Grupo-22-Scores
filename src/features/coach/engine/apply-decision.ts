// Aplicar un desenlace al estado. Devuelve estado NUEVO: nada se muta.

import { FIRST_NAMES, SURNAMES } from '../data/names.ts';
import type { CoachState, SquadPlayer } from '../types/coach.ts';
import type { CoachEffect } from '../types/event.ts';
import { budgetOf } from './finance.ts';
import type { Rng } from './random.ts';
import { playerLevelOf, rookieExtras, startingXV } from './squad.ts';

/**
 * Aplica un efecto. `rng` hace falta para lo que toca el plantel: qué pibe sube,
 * con qué nivel, con qué nombre.
 */
export function applyEffect(rng: Rng, state: CoachState, effect: CoachEffect): CoachState {
    const fin = { ...state.club.finances };
    let cohesion = state.club.cohesion;
    let pressure = state.pressure;
    let reputation = state.coach.reputation;
    let squad = state.squad;

    if (effect.cajaPct !== undefined) {
        fin.caja = Math.round(fin.caja + cajaBase(state) * effect.cajaPct);
    }
    if (effect.cajaFijo !== undefined) fin.caja = Math.round(fin.caja + effect.cajaFijo);
    if (effect.socios !== undefined) fin.socios = Math.max(60, fin.socios + effect.socios);
    if (effect.estructura !== undefined) fin.estructura = clamp(fin.estructura + effect.estructura, 0, 100);
    if (effect.hinchada !== undefined) fin.hinchada = clamp(fin.hinchada + effect.hinchada, 0, 100);
    if (effect.cohesion !== undefined) cohesion = clamp(cohesion + effect.cohesion, 0, 100);
    if (effect.presion !== undefined) pressure = clamp(pressure + effect.presion, 0, 100);
    if (effect.reputacion !== undefined) reputation = clamp(reputation + effect.reputacion, 0, 100);

    if (effect.jugador) squad = adjustPlayer(squad, effect.jugador);
    if (effect.pierdeMejor) squad = replaceOne(rng, squad, state, bestIndex(squad));
    if (effect.subeDelM19) squad = replaceOne(rng, squad, state, worstIndex(squad));
    if (effect.certificaPrimeraLinea) squad = certifyFrontRow(squad);

    return {
        ...state,
        squad,
        pressure,
        coach: { ...state.coach, reputation },
        // `...state.club` primero: las mejoras compradas no las toca ninguna decisión.
        club: { ...state.club, cohesion, finances: fin },
        seasonMods: {
            rating: state.seasonMods.rating + (effect.rating ?? 0),
            injuryRisk: state.seasonMods.injuryRisk + (effect.injuryRisk ?? 0),
            bancoCorto: state.seasonMods.bancoCorto || effect.bancoCorto === true,
        },
        flags: effect.flags ? mergeFlags(state.flags, effect.flags) : state.flags,
    };
}

/**
 * Sobre qué se calcula un `cajaPct`.
 *
 * Con la caja en positivo es la caja, que es lo intuitivo. Con la caja en rojo NO
 * puede ser la caja: un −35% sobre un número negativo le SUMARÍA plata al club,
 * y una decisión que dice "poner la plata igual" terminaría enriqueciéndolo. Con
 * la caja vacía el club igual se endeuda, y se endeuda en proporción a su tamaño
 * —un cuarto de lo que factura en el año—, no en proporción a lo que no tiene.
 */
function cajaBase(state: CoachState): number {
    if (state.club.finances.caja > 0) return state.club.finances.caja;
    return budgetOf(state, { bancoCorto: false }).ingresos * 0.25;
}

function bestIndex(squad: readonly SquadPlayer[]): number {
    let best = 0;
    for (let i = 1; i < squad.length; i++) if (squad[i].level > squad[best].level) best = i;
    return best;
}

/**
 * El mejor DE LOS QUE TODAVÍA PUEDEN CRECER. Trabajar con el mejor del plantel
 * cuando ya está en su techo no mueve nada (el techo manda: ver `adjustPlayer`),
 * y la tarjeta prometía que el equipo mejoraba. Apareció con la 2.0.0: el
 * plantel nuevo de una semilla del test tenía al mejor clavado en su techo y
 * `career.test.ts` lo delató. Si todos están en su techo, el mejor a secas.
 */
function bestWithRoomIndex(squad: readonly SquadPlayer[]): number {
    let best = -1;
    for (let i = 0; i < squad.length; i++) {
        if (squad[i].potential - squad[i].level < 0.5) continue;
        if (best < 0 || squad[i].level > squad[best].level) best = i;
    }
    return best >= 0 ? best : bestIndex(squad);
}

function worstIndex(squad: readonly SquadPlayer[]): number {
    let worst = 0;
    for (let i = 1; i < squad.length; i++) if (squad[i].level < squad[worst].level) worst = i;
    return worst;
}

/**
 * El más flojo DE LOS QUE JUEGAN, que no es el más flojo del plantel.
 *
 * `teamRating` solo mira al XV, así que levantarle cinco puntos al número 26 no
 * mueve una coma: el efecto se declaraba, se aplicaba y no cambiaba nada. Se veía
 * en la tarjeta del refuerzo del club vecino —decía "el equipo mejora" y el chip
 * de Plantel ni aparecía—, que es exactamente lo que los chips por diferencia
 * existen para delatar.
 *
 * Un refuerzo que llega entra al equipo y desplaza a alguien: el que sube es el
 * más flojo del XV, no el último del plantel.
 */
function weakestStarterIndex(squad: readonly SquadPlayer[]): number {
    const playing = new Set(startingXV(squad).map((p) => p.id));
    let worst = -1;
    for (let i = 0; i < squad.length; i++) {
        if (!playing.has(squad[i].id)) continue;
        if (worst < 0 || squad[i].level < squad[worst].level) worst = i;
    }
    return worst >= 0 ? worst : worstIndex(squad);
}

/**
 * El primera línea sobre el que se trabaja: el más flojo de los tres que juegan.
 * Buscar "el primero del array con ese grupo" agarraba al 1 aunque el 1 no fuera
 * de los tres mejores, y entonces el efecto tampoco movía nada.
 */
function frontRowIndex(squad: readonly SquadPlayer[]): number {
    const playing = new Set(
        startingXV(squad)
            .filter((p) => p.group === 'primera-linea')
            .map((p) => p.id),
    );
    let worst = -1;
    for (let i = 0; i < squad.length; i++) {
        if (!playing.has(squad[i].id)) continue;
        if (worst < 0 || squad[i].level < squad[worst].level) worst = i;
    }
    if (worst >= 0) return worst;
    const any = squad.findIndex((p) => p.group === 'primera-linea');
    return any >= 0 ? any : 0;
}

/** A quién le pega un efecto de jugador. */
function targetIndex(
    squad: readonly SquadPlayer[],
    target: NonNullable<CoachEffect['jugador']>['target'],
): number {
    if (target === 'mejor') return bestWithRoomIndex(squad);
    // 'peor' apunta al más flojo DEL EQUIPO, no del plantel: ver arriba.
    if (target === 'peor') return weakestStarterIndex(squad);
    if (target === 'primera-linea') return frontRowIndex(squad);

    // 'joven': el más chico DE LOS QUE JUEGAN. Igual que arriba — formar al pibe
    // que nunca entra a la cancha no cambia nada, y la tarjeta dice que sí.
    const playing = new Set(startingXV(squad).map((p) => p.id));
    let young = -1;
    for (let i = 0; i < squad.length; i++) {
        if (!playing.has(squad[i].id)) continue;
        const a = squad[i];
        if (young < 0) {
            young = i;
            continue;
        }
        const b = squad[young];
        if (a.age < b.age || (a.age === b.age && a.level > b.level)) young = i;
    }
    return young >= 0 ? young : 0;
}

function adjustPlayer(
    squad: readonly SquadPlayer[],
    spec: NonNullable<CoachEffect['jugador']>,
): SquadPlayer[] {
    const i = targetIndex(squad, spec.target);
    const p = squad[i];
    const potential = clamp(p.potential + (spec.potencial ?? 0), p.potential, 95);
    // El techo manda: una decisión no puede empujar a un jugador por encima de su
    // potencial. Es el mismo invariante que en Carrera de Rugby.
    const level = clamp(p.level + spec.delta, 10, potential);
    return squad.map((x, j) => (j === i ? { ...x, level: round1(level), potential: round1(potential) } : x));
}

/** Se va uno y su dorsal lo hereda un pibe del M19: nivel bajo, techo alto. */
function freshId(squad: readonly SquadPlayer[], id: string): string {
    let out = id;
    while (squad.some((p) => p.id === out)) out = `${out}x`;
    return out;
}

function replaceOne(
    rng: Rng,
    squad: readonly SquadPlayer[],
    state: CoachState,
    index: number,
): SquadPlayer[] {
    const slot = squad[index];
    const base = playerLevelOf(state.world.ratings[state.clubId] ?? 20);
    const level = clamp(rng.normal(base - 7, 4), 10, 70);
    const age = rng.int(19, 21);
    const rookie: SquadPlayer = {
        // Desde la etapa 3 un dorsal puede pasar por dos jugadores en la misma
        // temporada (uno se va, el que llega se lo pone): el id no se repite nunca.
        id: freshId(squad, `${state.clubId}-s${state.season}-r${slot.number}`),
        name: `${rng.pick(FIRST_NAMES)} ${rng.pick(SURNAMES)}`,
        group: slot.group,
        number: slot.number,
        age,
        level: round1(level),
        potential: round1(clamp(level + (28 - age) * rng.float(0.9, 2.1), level, 92)),
        frontRowCertified: false,
        seasonsAtClub: 1,
        ...rookieExtras(rng, state.competitionId, slot.number, level - base),
    };
    return squad.map((x, j) => (j === index ? rookie : x));
}

/** Le da la certificación al primer primera línea que no la tenga. */
function certifyFrontRow(squad: readonly SquadPlayer[]): SquadPlayer[] {
    const i = squad.findIndex((p) => p.group === 'primera-linea' && !p.frontRowCertified);
    if (i < 0) return [...squad];
    return squad.map((x, j) => (j === i ? { ...x, frontRowCertified: true } : x));
}

function mergeFlags(base: Record<string, number>, add: Record<string, number>): Record<string, number> {
    const out = { ...base };
    for (const k of Object.keys(add).sort()) out[k] = (out[k] ?? 0) + add[k];
    return out;
}

function clamp(v: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, v));
}

function round1(v: number): number {
    return Math.round(v * 10) / 10;
}
