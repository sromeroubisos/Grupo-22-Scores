// Las llaves de eliminación de una división: el playoff por el título y el
// reducido por el ascenso. Es UN solo motor para los dos, y para cualquier
// tamaño que declare `data/formats.ts` (2, 4, 6 u 8).
//
//   · 2: final.
//   · 4: semis 1°-4° y 2°-3°.
//   · 6: 1° y 2° esperan; cuartos 3°-6° y 4°-5°; en semis el 1° recibe al peor
//        ubicado que quede (así se jugó el NOA B 2026 y el Top 10 del Centro 2025).
//   · 8: cuartos 1-8, 4-5, 2-7, 3-6.
//
// En semis siempre se re-siembra (el mejor contra el peor de los que quedan) y el
// local es el mejor ubicado, que también pasa si empatan. La final, en cancha
// neutral. Sin RNG propio: el azar lo pone el que juega los partidos.

import type { KnockoutStage, KnockoutTie } from '../types/coach.ts';
import { rollMatch, type MatchSide } from './match.ts';
import type { Rng } from './random.ts';

/** La primera instancia de una llave de `size` clubes. */
export function firstStage(size: number): KnockoutStage {
    if (size <= 2) return 'final';
    if (size <= 4) return 'semis';
    return 'cuartos';
}

export function nextStage(stage: KnockoutStage): KnockoutStage | null {
    if (stage === 'octavos') return 'cuartos';
    if (stage === 'cuartos') return 'semis';
    if (stage === 'semis') return 'final';
    return null;
}

/** Los que siguen vivos, en orden de siembra. */
function bySeed(seeds: readonly string[], ids: readonly string[]): string[] {
    return [...ids].sort((a, b) => seeds.indexOf(a) - seeds.indexOf(b));
}

/**
 * Los cruces de una instancia, `[local, visitante]`, con `alive` los que
 * llegaron a ella. El local es siempre el mejor sembrado.
 */
export function stagePairs(seeds: readonly string[], stage: KnockoutStage, alive: readonly string[]): [string, string][] {
    const a = bySeed(seeds, alive);
    if (stage === 'cuartos' || stage === 'octavos') {
        if (seeds.length === 6) {
            const pairs: [string, string][] = [
                [seeds[2], seeds[5]],
                [seeds[3], seeds[4]],
            ];
            return pairs.filter(([h, w]) => a.includes(h) && a.includes(w));
        }
        // Cuadro de ocho: 1-8, 4-5, 2-7, 3-6.
        const n = a.length;
        const order = n === 8 ? [0, 3, 1, 2] : Array.from({ length: Math.floor(n / 2) }, (_, i) => i);
        return order.map((i) => [a[i], a[n - 1 - i]] as [string, string]);
    }
    if (stage === 'semis') {
        if (a.length < 4) return a.length >= 2 ? [[a[0], a[1]]] : [];
        return [
            [a[0], a[3]],
            [a[1], a[2]],
        ];
    }
    return a.length >= 2 ? [[a[0], a[1]]] : [];
}

/** Los que esperan sin jugar la instancia (los dos primeros de una llave de seis). */
export function byesOf(seeds: readonly string[], stage: KnockoutStage, alive: readonly string[]): string[] {
    const playing = new Set(stagePairs(seeds, stage, alive).flat());
    return alive.filter((id) => !playing.has(id));
}

export function isNeutral(stage: KnockoutStage): boolean {
    return stage === 'final';
}

/**
 * Un cruce. En eliminación no hay empate: si el partido termina igualado, pasa
 * el que entró mejor ubicado, que es el que figura como local.
 */
export function playTie(
    rng: Rng,
    sideOf: (id: string) => MatchSide,
    log: KnockoutTie[],
    competitionId: string,
    stage: KnockoutStage,
    homeId: string,
    awayId: string,
    neutral: boolean,
    myClubId: string,
): string {
    const roll = rollMatch(rng, sideOf(homeId), sideOf(awayId), {
        neutral,
        trackHome: homeId === myClubId,
        trackAway: awayId === myClubId,
    });
    log.push({ competitionId, stage, homeId, awayId, homePf: roll.homePf, awayPf: roll.awayPf });
    return roll.awayPf > roll.homePf ? awayId : homeId;
}

/**
 * Juega una instancia entera y devuelve quiénes siguen (los ganadores más los
 * que esperaban), en orden de siembra. `pick` permite jugar un cruce por fuera
 * —el del club del jugador, con la forma de encararlo que eligió—: si devuelve
 * un ganador, ese cruce no se vuelve a jugar acá.
 */
export function playStage(
    rng: Rng,
    seeds: readonly string[],
    stage: KnockoutStage,
    alive: readonly string[],
    sideOf: (id: string) => MatchSide,
    log: KnockoutTie[],
    competitionId: string,
    myClubId: string,
    pick?: (home: string, away: string) => string | null,
): string[] {
    const winners: string[] = byesOf(seeds, stage, alive);
    for (const [home, away] of stagePairs(seeds, stage, alive)) {
        const decided = pick?.(home, away) ?? null;
        winners.push(
            decided ?? playTie(rng, sideOf, log, competitionId, stage, home, away, isNeutral(stage), myClubId),
        );
    }
    return bySeed(seeds, winners);
}

/**
 * Juega la llave desde `from.stage` (o desde la primera instancia, con todos los
 * sembrados) hasta la final y devuelve el ganador.
 */
export function playBracket(
    rng: Rng,
    seeds: readonly string[],
    sideOf: (id: string) => MatchSide,
    log: KnockoutTie[],
    competitionId: string,
    myClubId: string,
    from?: { stage: KnockoutStage | null; alive: readonly string[] },
): string {
    if (seeds.length === 0) return '';
    let stage: KnockoutStage | null = from ? from.stage : firstStage(seeds.length);
    let alive: string[] = [...(from?.alive ?? seeds)];
    while (stage && alive.length > 1) {
        alive = playStage(rng, seeds, stage, alive, sideOf, log, competitionId, myClubId);
        stage = nextStage(stage);
    }
    return alive[0] ?? '';
}

/** Marca a qué llave de la división pertenecen los cruces que todavía no lo dicen. */
export function tagTies(ties: KnockoutTie[], from: number, bracket: 'titulo' | 'ascenso'): void {
    for (let i = from; i < ties.length; i++) {
        if (!ties[i].bracket) ties[i] = { ...ties[i], bracket };
    }
}

/** El cruce del club en una instancia, o null si no juega (espera o quedó afuera). */
export function myPair(
    seeds: readonly string[],
    stage: KnockoutStage,
    alive: readonly string[],
    myClubId: string,
): [string, string] | null {
    return stagePairs(seeds, stage, alive).find(([h, a]) => h === myClubId || a === myClubId) ?? null;
}
