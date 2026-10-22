/**
 * Las cuentas de la ficha de un jugador, en un solo lugar y sin dependencias
 * de servidor: las usa `getLocalPlayerProfile` para los totales y las
 * temporadas, y la pantalla para recalcular cuando el lector filtra por
 * torneo. Dos copias de esta aritmetica se desincronizan en el primer
 * contador nuevo.
 *
 * Todo sale de `PlayerProfileMatch.stats`, que el servicio arma partido por
 * partido mirando CADA evento (incluido si el tiro a los palos entro o no).
 * Aca no se interpreta ningun evento: solo se suma.
 */

import type {
    PlayerEventTally,
    PlayerMatchStats,
    PlayerProfileMatch,
    PlayerProfileTotals,
} from './localPlayerProfile';

export function emptyMatchStats(): PlayerMatchStats {
    return {
        tries: 0,
        conversions: 0,
        penalties: 0,
        dropGoals: 0,
        kicksMissed: 0,
        yellowCards: 0,
        redCards: 0,
    };
}

export function emptyTotals(): PlayerProfileTotals {
    return {
        matches: 0,
        starts: 0,
        bench: 0,
        captain: 0,
        wins: 0,
        draws: 0,
        losses: 0,
        points: 0,
        subbedOn: 0,
        subbedOff: 0,
        minutes: 0,
        minutesKnown: 0,
        ...emptyMatchStats(),
    };
}

/** Tipos que ya tienen su propio contador: no se repiten en "otras acciones". */
const COUNTED_ELSEWHERE = new Set([
    'try',
    'penalty_try',
    'conversion',
    'penalty_goal',
    'penalty',
    'drop_goal',
    'yellow_card',
    'card_yellow',
    'red_card',
    'card_red',
    'substitution',
]);

export function addMatchToTotals(totals: PlayerProfileTotals, match: PlayerProfileMatch): void {
    totals.matches += 1;
    if (match.role === 'starter') totals.starts += 1;
    if (match.role === 'bench') totals.bench += 1;
    if (match.isCaptain) totals.captain += 1;
    if (match.result === 'win') totals.wins += 1;
    if (match.result === 'draw') totals.draws += 1;
    if (match.result === 'loss') totals.losses += 1;
    if (match.subbedOn) totals.subbedOn += 1;
    if (match.subbedOff) totals.subbedOff += 1;
    if (match.minutes !== null) {
        totals.minutes += match.minutes;
        totals.minutesKnown += 1;
    }
    totals.points += match.points;
    totals.tries += match.stats.tries;
    totals.conversions += match.stats.conversions;
    totals.penalties += match.stats.penalties;
    totals.dropGoals += match.stats.dropGoals;
    totals.kicksMissed += match.stats.kicksMissed;
    totals.yellowCards += match.stats.yellowCards;
    totals.redCards += match.stats.redCards;
}

export function totalsOf(matches: PlayerProfileMatch[]): PlayerProfileTotals {
    const totals = emptyTotals();
    for (const match of matches) addMatchToTotals(totals, match);
    return totals;
}

/**
 * Todo lo que el jugador hizo y NO tiene contador propio (lines, scrums,
 * knock-ons, patadas, lesiones…), sumado por tipo. Es lo que impide que un
 * evento cargado desaparezca de la ficha solo porque nadie le armo una
 * columna: un deporte o un tipo nuevo aparece aca sin tocar la pantalla.
 */
export function otherActionsOf(matches: PlayerProfileMatch[]): PlayerEventTally[] {
    const byType = new Map<string, PlayerEventTally>();
    for (const match of matches) {
        for (const tally of match.events) {
            if (COUNTED_ELSEWHERE.has(tally.type)) continue;
            const current = byType.get(tally.type);
            if (current) {
                current.count += tally.count;
                current.missed = (current.missed || 0) + (tally.missed || 0);
            } else {
                byType.set(tally.type, { ...tally });
            }
        }
    }
    return [...byType.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'es'));
}
