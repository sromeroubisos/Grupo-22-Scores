// EL CAPITÁN — la planilla de la carrera: partidos, tries, puntos y tackles.
//
// Son los cuatro números que un jugador de rugby dice cuando le preguntan qué
// hizo, y hasta ahora el juego no los tenía juntos en ningún lado: la cabecera
// contaba caps y títulos, y la producción vivía repartida temporada por
// temporada en la métrica del puesto.
//
// ── ES DERIVADA, ASÍ QUE NO SE GUARDA (CLAUDE de captain §1.9) ──────────────
// Los cuatro salen del historial que el estado ya tiene: cada fila guarda los
// partidos que jugaste ese año, la media congelada con la que los jugaste y la
// gloria de tu puesto. Cuatro contadores nuevos en `CaptainState` serían una
// segunda fuente de verdad sobre lo mismo —y una que un pase o una temporada sin
// cerrar desincroniza sin que nada falle— y encima obligarían a subir el schema
// del guardado, o sea a tirar todas las partidas en curso para agregar una fila
// a la cabecera.
//
// ── LA GLORIA MANDA SOBRE LA TASA ───────────────────────────────────────────
// Tres familias ya anotan sus tries como gloria —el wing, el hooker por el maul
// y el medio scrum desde la base— y el apertura anota sus puntos. Para ésas la
// planilla LEE lo que el motor sorteó y no lo vuelve a estimar: si la cabecera
// dijera 34 tries y la tarjeta de temporada 31, una de las dos estaría
// mintiendo. Las demás no los anotan —nadie cuenta line-outs y tries a la vez—
// y salen de una tasa por puesto.

import type { CaptainState } from '../types/captain.ts';
import type { CaptainSeasonEntry } from '../types/season.ts';
import type { PositionFamilyId } from '../types/player.ts';
import type { GloryMetric, PositionFamily } from '../data/positions.ts';
import { getFamily } from '../data/positions.ts';
import { ovrFactor } from './statistics.ts';

export interface CareerTally {
    /** Partidos jugados. La suma de las temporadas CERRADAS. */
    matches: number;
    tries: number;
    points: number;
    tackles: number;
}

/**
 * LAS MÉTRICAS DE GLORIA QUE SON TRIES, por id.
 *
 * Por id y no por unidad: `count` la comparten los line-outs ganados, los
 * turnovers y los penales de scrum, así que la unidad no alcanza para
 * reconocerlos. Que el juego los llame de tres formas distintas —«Tries»,
 * «Tries de maul», «Tries desde la base»— es correcto en la tarjeta de
 * temporada, donde lo que se cuenta es el gol del puesto; acá se suman todos
 * porque un try es un try.
 *
 * Si alguien renombra una de las tres, `career-tally.test.ts` se pone en rojo:
 * la familia quedaría sin fuente de tries y con tasa, que es la deriva que este
 * módulo no puede tener en silencio.
 */
export const TRY_METRIC_IDS: readonly string[] = ['tries', 'tries-maul', 'tries-base'];

/** Lo que vale un try. Es el reglamento, no un parámetro que se discuta. */
const TRY_POINTS = 5;

/**
 * TRIES POR PARTIDO DE LAS FAMILIAS QUE NO LOS ANOTAN. PARÁMETROS LIBRES: son
 * afirmaciones sobre el rugby y se discuten como tales.
 *
 * Escalan por media con `ovrFactor`, igual que la planilla de la temporada: un
 * centro de 90 quiebra más seguido que uno de 70 y termina apoyando más.
 *
 * Las tres que faltan —wing, hooker y medio scrum— NO van acá a propósito:
 * escribirles una tasa sería duplicar el `perMatch` que su gloria ya declara en
 * `data/positions.ts`, y el día que se recalibrara una la cabecera seguiría
 * contando con la otra (§1.9).
 *
 * El apertura SÍ está, y no es una excepción: su gloria son PUNTOS, que no es lo
 * mismo que tries. Los tries se le estiman como a cualquier otro y los puntos se
 * le leen; el test verifica que ninguna familia caiga en las dos listas.
 */
export const TRY_RATE: Partial<Record<PositionFamilyId, number>> = {
    'primera-linea': 0.05,
    'segunda-linea': 0.07,
    'tercera-linea': 0.12,
    apertura: 0.08,
    centro: 0.18,
};

/**
 * TACKLES POR PARTIDO, POR FAMILIA. PARÁMETROS LIBRES, y ninguna familia los
 * anota como gloria: acá no hay nada que leer, se estiman los ocho.
 *
 * El orden es el del rugby real y es lo que la tabla tiene que sostener: el ala
 * y el octavo por arriba de todos, el segunda línea y el hooker atrás, el
 * apertura y el medio scrum en la mitad de eso, y el wing último — su trabajo es
 * el otro.
 *
 * NO escalan por media, y es una decisión: el tackle es del PUESTO y de los
 * minutos, no de la media. El segunda línea de 90 no tackea el doble que el de
 * 70 — tackea mejor, que es otra cosa y ya se cobra en el tiempo de juego, que
 * es lo que multiplica esta tasa.
 */
export const TACKLE_RATE: Record<PositionFamilyId, number> = {
    'primera-linea': 8.5,
    hooker: 10.5,
    'segunda-linea': 11.5,
    'tercera-linea': 13.5,
    'medio-scrum': 5,
    apertura: 6,
    centro: 8.5,
    'wing-fullback': 4,
};

/** Lo que la planilla necesita de una temporada cerrada, y nada más. */
export type TallyRow = Pick<CaptainSeasonEntry, 'matchesPlayed' | 'ovr' | 'glory' | 'glorySecondary'>;

/**
 * La gloria de ESTA fila que corresponde a la métrica que se busca, o `null` si
 * la familia no la anota. Se pregunta por la métrica —qué es— y nunca por la
 * posición primary/secondary, que cambia de familia en familia (§1.5).
 */
function gloryOf(
    family: PositionFamily,
    row: TallyRow,
    esLaQueBusco: (metric: GloryMetric) => boolean,
): number | null {
    const { primary, secondary } = family.glory;
    if (esLaQueBusco(primary)) return row.glory;
    if (secondary && esLaQueBusco(secondary)) return row.glorySecondary;
    return null;
}

const esTry = (metric: GloryMetric): boolean => TRY_METRIC_IDS.includes(metric.id);
const esPunto = (metric: GloryMetric): boolean => metric.unit === 'points';

/**
 * La planilla de un puesto sobre un historial. Es la función que se testea;
 * `careerTally` es la puerta que le pasa el estado.
 */
export function tallyOf(familyId: PositionFamilyId, rows: readonly TallyRow[]): CareerTally {
    const family = getFamily(familyId);
    const tryRate = TRY_RATE[familyId] ?? 0;
    const tackleRate = TACKLE_RATE[familyId];

    let matches = 0;
    let tries = 0;
    let points = 0;
    let tackles = 0;

    for (const row of rows) {
        const jugados = row.matchesPlayed;
        matches += jugados;

        const triesDelAño = gloryOf(family, row, esTry) ?? tryRate * jugados * ovrFactor(row.ovr);
        tries += triesDelAño;

        // El pateador anota sus puntos y ahí están los tries adentro, así que no
        // se suman dos veces. Al que no patea, los puntos son sus tries: en el
        // rugby de verdad las conversiones y los penales los patea uno solo.
        points += gloryOf(family, row, esPunto) ?? triesDelAño * TRY_POINTS;

        tackles += tackleRate * jugados;
    }

    return {
        matches,
        tries: Math.round(tries),
        points: Math.round(points),
        tackles: Math.round(tackles),
    };
}

/**
 * LA PLANILLA DE LA CARRERA, para la cabecera.
 *
 * Cuenta las temporadas CERRADAS y no la que se está jugando, que es lo correcto
 * y no un recorte: la fila del año entra al historial cuando el año termina, y
 * hasta entonces no hay planilla que mostrar. Un cero en la primera temporada
 * también es información —todavía no jugaste nada— y por eso la cabecera lo
 * dibuja igual.
 */
export function careerTally(state: CaptainState): CareerTally {
    return tallyOf(state.player.family, state.history);
}
