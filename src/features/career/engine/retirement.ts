import type { GameEvent, EventOption } from '../types/event.ts';
import type { Player } from '../types/player.ts';
import type { Rng } from './random.ts';
import { getEvent, VETERAN_END_OF_SEASON_ID } from '../data/events/index.ts';

/**
 * EL RETIRO ES UNA DECISIÓN, NO UNA SENTENCIA.
 *
 * Hasta 1.14.0 el motor retiraba solo: cada temporada a partir de la edad
 * "blanda" del puesto tiraba un dado contra la edad, el OVR efectivo y la moral.
 * El resultado era que una carrera se cerraba a los 34, titular y campeón, sin
 * que el jugador dijera nada. El juego decidía el final de la historia.
 *
 * La regla nueva tiene tres tramos y ninguno depende del puesto:
 *
 *   · hasta los 33 — no se ofrece. El retiro no existe como opción.
 *   · de 34 a 38   — "Retirarte" aparece en la decisión de cada temporada.
 *   · a los 39     — se fuerza, sin opción.
 *
 * Lo único que puede cortar antes de los 39 es el CUERPO: una lesión grave
 * reciente. Ni la edad sola ni la moral baja retiran a nadie — eso ahora lo
 * decide el jugador, que es de lo que se trata.
 */
export const RETIREMENT_CHOICE_AGE = 34;
export const FORCED_RETIREMENT_AGE = 39;

/** Id de la opción de retiro. Estable: entra en `decisionLog` y en el digest. */
export const RETIRE_OPTION_ID = 'retire-now';

/** ¿La decisión de esta temporada tiene que ofrecer el retiro? */
export function retirementIsOptional(player: Player): boolean {
    return player.age >= RETIREMENT_CHOICE_AGE && player.age < FORCED_RETIREMENT_AGE;
}

/**
 * Cierre AUTOMÁTICO de la carrera. Solo dos causas: la edad tope y el cuerpo.
 *
 * El dado de la lesión se tira únicamente si hay una lesión grave reciente, así
 * que en una carrera sana esta función no consume RNG antes de los 39 — el
 * stream queda para el juego, no para preguntarle todos los años si se retira.
 */
export function shouldRetire(player: Player, rng: Rng): boolean {
    if (player.age >= FORCED_RETIREMENT_AGE) return true;
    if (player.age < RETIREMENT_CHOICE_AGE) return false;

    const severe = player.injuries.filter((i) => i.severity === 'grave');
    const recent = severe.some((i) => i.season >= player.seasonsPlayed - 1);
    if (!recent) return false;

    // Cuanto más viejo y más roto, más chances de que la lesión sea la última.
    const pressure = 0.22
        + (player.age - RETIREMENT_CHOICE_AGE) * 0.09
        + (severe.length - 1) * 0.1;
    return rng.chance(Math.min(0.85, pressure));
}

/** La causa que se muestra en el retiro. Ordenada de la más específica a la más general. */
export function retirementReason(player: Player): string {
    if (player.age >= FORCED_RETIREMENT_AGE) return 'Se retira por el paso de los años';
    const severe = player.injuries.filter((i) => i.severity === 'grave');
    if (severe.some((i) => i.season >= player.seasonsPlayed - 1)) return 'Una lesión grave le cortó la carrera';
    if (severe.length >= 2) return 'El cuerpo dijo basta';
    return 'Se retira en lo más alto, cuando quiso';
}

/** La opción de retirarse, para colgarla de la decisión que traiga la temporada. */
function retireOption(): EventOption {
    return {
        id: RETIRE_OPTION_ID,
        label: 'Retirarte ahora',
        hint: 'Cerrás en lo más alto. Te quedás con lo que tenés.',
        outcomes: [
            {
                weight: 1,
                effect: { retire: true },
                resultText: 'Anunciás el retiro con la temporada terminada y el plantel de pie.',
            },
        ],
    };
}

/**
 * Cuelga la opción de retirarse de CUALQUIER decisión que aparezca entre los 34
 * y los 38.
 *
 * Es lo que hace que la opción esté "todas las temporadas, todos los años" sin
 * secuestrar esos cinco años con una pantalla única: si el mercado abre, el
 * veterano decide entre quedarse, irse a un club de abajo o colgar los botines,
 * las tres en la misma tarjeta.
 *
 * Determinística y sin RNG: se aplica igual al elegir el evento y al releerlo
 * después de una recarga, así que `applyDecision` siempre encuentra la opción.
 */
export function withRetirementOption(event: GameEvent, player: Player): GameEvent {
    if (!retirementIsOptional(player)) return event;
    if (event.options.some((o) => o.id === RETIRE_OPTION_ID)) return event;
    return { ...event, options: [...event.options, retireOption()] };
}

/**
 * La decisión de fin de temporada del veterano, para las temporadas en las que
 * no salió ninguna otra. Sin esto, un año tranquilo a los 36 no ofrecería
 * retirarse y la regla dejaría de cumplirse justo cuando más importa.
 */
export function veteranSeasonEvent(): GameEvent | null {
    return getEvent(VETERAN_END_OF_SEASON_ID) ?? null;
}
