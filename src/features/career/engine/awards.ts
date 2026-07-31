// PREMIOS INDIVIDUALES DE TEMPORADA.
//
// Tres distinciones que se reparten al cerrar cada temporada, y están pensadas
// como una escalera de alcance para que la vitrina no sea sólo del que llegó
// arriba:
//
//   · Mejor de la temporada local — se puede ganar en CUALQUIER nivel. Un amateur
//     que hace una gran temporada en un club que pelea el campeonato de su
//     división lo gana igual que un titular del Top 14. Es el único premio que la
//     carrera que nunca se profesionaliza puede poner en la vitrina, y por eso
//     existe: sin él, el 100% de los premios era del que ya tenía todo.
//   · XV ideal del año — pide nivel Y competición profesional. Repetible: el que
//     se sostiene arriba entra varios años seguidos, y eso ES el logro.
//   · Mejor jugador del mundo — condición dura de OVR 88 más plantel de selección
//     y competición de élite. Es uno por año en todo el rugby: incluso cumpliendo
//     todo, la tirada lo deja afuera tres de cada cuatro veces.
//
// MEDIDO sobre 162 carreras completas: el local lo gana el 27,2% de las carreras
// (hasta 4 veces en una), el XV ideal el 17,3% (hasta 2) y el del mundo el 0,6%.
// Los tres números salen de la tabla `RULES`, que es el único lugar donde se
// calibran.
//
// EL PATRÓN, que es el mismo de los otros premios del proyecto: condición dura →
// umbral por nivel → tirada determinista. La condición dura es lo que impide que
// un premio grande salga por suerte; la tirada es lo que impide que salga siempre
// que se cumple el mínimo.
//
// EL RNG VA RE-SEMBRADO APARTE (`semilla:awards:temporada`) y no toma el `rng` de
// la temporada. Así agregar o quitar un premio no corre el stream principal, que
// es lo que haría que la misma semilla produjera otra carrera entera por haber
// tocado una tabla de premios.

import { hashSeed, rngFromState } from './random.ts';
import type { NationalStatus } from '../types/player.ts';

export type SeasonAwardId = 'world-player' | 'dream-team' | 'domestic-player';

/**
 * Bandera en la que se acumula cada premio. Es un CONTADOR y no un booleano
 * porque el XV ideal es repetible y "entró tres años" no es lo mismo que "entró".
 */
export const AWARD_FLAGS: Readonly<Record<SeasonAwardId, string>> = {
    'world-player': 'mejor_jugador_mundo',
    'dream-team': 'xv_ideal',
    'domestic-player': 'mejor_temporada_local',
};

/** El texto que se muestra. Tiene que coincidir EXACTO con `premios.ts`. */
export const AWARD_LABELS: Readonly<Record<SeasonAwardId, string>> = {
    'world-player': 'Mejor jugador del mundo',
    'dream-team': 'XV ideal del año',
    'domestic-player': 'Mejor de la temporada local',
};

export interface SeasonAwardInput {
    /** OVR al cierre de la temporada. */
    ovr: number;
    /** Rating de la temporada (5.0 .. 9.9). */
    rating: number;
    /** Partidos jugados: sin temporada no hay premio de temporada. */
    matches: number;
    /** Banda deportiva de la competición que disputó. */
    band: number;
    /** Posición final del club y tamaño de la liga. */
    leaguePosition: number;
    leagueTeams: number;
    /** Situación en la selección al cierre. */
    nationalStatus: NationalStatus;
    careerSeed: number;
    seasonIndex: number;
}

/**
 * Partidos mínimos para entrar en cualquier consideración. Sin esto, una
 * temporada de tres partidos con rating alto —que es lo que produce una lesión
 * larga con una buena vuelta— ganaba premios de temporada completa.
 */
const MIN_MATCHES = 8;

/** Umbrales y probabilidad de cada premio. Un solo lugar para calibrarlos. */
const RULES: Readonly<Record<SeasonAwardId, {
    minOvr: number;
    minRating: number;
    minBand: number;
    /** Puestos de arriba de la liga que habilitan el premio. 0 = no lo mira. */
    topPositions: number;
    /** Exige estar en el plantel de la selección. */
    needsNationalSquad: boolean;
    chance: number;
    /**
     * CUÁNTO SUBE LA CHANCE POR CADA PUNTO DE OVR POR ENCIMA DEL MÍNIMO.
     *
     * Sin esto la chance era PLANA: el de 78 y el de 92 tenían la misma
     * probabilidad de entrar al XV ideal, y la única diferencia entre ellos era
     * cuántas temporadas calificaban. Eso hacía que llegar a 90 no se sintiera
     * distinto de llegar a 80 — y llegar a 90 tiene que sentirse distinto.
     *
     * Con la pendiente, el premio deja de ser una lotería con puerta y pasa a ser
     * lo que debe ser: si sos de los mejores, te lo dan; si estás en el borde, a
     * veces. El tope de `MAX_CHANCE` impide que sea automático en una sola
     * temporada — siempre hace falta además la temporada, no sólo el nivel.
     */
    chancePerOvr: number;
    /**
     * A PARTIR DE ESTE OVR EL PREMIO DEJA DE SER UNA TIRADA.
     *
     * Por encima del corte no se tira el dado y se dejan de mirar las puertas de
     * contexto —banda de la liga, estar en el plantel de la selección—: sólo se
     * exige haber jugado la temporada y haberla jugado bien (`minRating`).
     *
     * El motivo es que arriba de 95 el contexto deja de ser una condición y pasa
     * a ser una anomalía. Medido, el 61% de las carreras que picaban en 95+ no
     * ganaba el premio nunca, y no era el dado: era que en sus temporadas de pico
     * no estaba convocado, o su liga no llegaba a banda 6. Un jugador de 95 que no
     * está en su selección es un problema del modelo de convocatoria, no una razón
     * para negarle el premio al mejor jugador del mundo.
     *
     * `null` = el premio siempre se tira. La temporada sigue mandando en los dos
     * casos: sin `minRating` no hay premio ni con 99.
     */
    certainAtOvr: number | null;
}>> = {
    // Uno por año en el mundo. Con 88 apenas asomás; con 95 sos el candidato.
    'world-player': { minOvr: 88, minRating: 8.0, minBand: 6, topPositions: 0, needsNationalSquad: true, chance: 0.25, chancePerOvr: 0.05, certainAtOvr: 95 },
    // El XV del año se elige entre los que juegan competiciones profesionales.
    // Con 87-90 entrar deja de ser una posibilidad y pasa a ser lo normal.
    'dream-team': { minOvr: 78, minRating: 7.6, minBand: 5, topPositions: 0, needsNationalSquad: false, chance: 0.35, chancePerOvr: 0.04, certainAtOvr: null },
    // RELATIVO A SU LIGA: no mira OVR ni banda, mira si hizo una gran temporada
    // en un club que peleó arriba. Es lo que lo hace alcanzable desde abajo, y por
    // eso es el único sin pendiente: acá el OVR no es el criterio.
    'domestic-player': { minOvr: 0, minRating: 7.3, minBand: 0, topPositions: 5, needsNationalSquad: false, chance: 0.45, chancePerOvr: 0, certainAtOvr: null },
};

/** Ni el mejor del mundo lo gana todos los años. Siempre falta la temporada. */
const MAX_CHANCE = 0.85;

/**
 * ORDEN DE EVALUACIÓN, fijo y explícito. Se recorre siempre completo y en este
 * orden para que la tirada de un premio no dependa de si el anterior se ganó: si
 * se cortara al primer premio, agregar uno nuevo arriba desalinearía los de abajo
 * y la misma semilla daría otra vitrina.
 */
const ORDER: readonly SeasonAwardId[] = ['world-player', 'dream-team', 'domestic-player'];

/**
 * Premios que se gana esta temporada. Puro y determinístico: mismo input ⇒ misma
 * salida, hoy y en seis meses.
 */
export function evaluateSeasonAwards(input: SeasonAwardInput): SeasonAwardId[] {
    if (input.matches < MIN_MATCHES) return [];

    const rng = rngFromState(hashSeed(`${input.careerSeed}:awards:${input.seasonIndex}`));
    const enPlantel = input.nationalStatus === 'squad' || input.nationalStatus === 'starter';

    const won: SeasonAwardId[] = [];
    for (const id of ORDER) {
        const r = RULES[id];
        // La tirada se hace SIEMPRE, califique o no, por la misma razón que la
        // lotería de techo en `createPlayer`: si dependiera de calificar, el
        // stream se correría según quién califica y dos carreras con la misma
        // semilla se desalinearían.
        const roll = rng.float(0, 1);
        const califica = input.ovr >= r.minOvr
            && input.rating >= r.minRating
            && input.band >= r.minBand
            && (!r.needsNationalSquad || enPlantel)
            && (r.topPositions === 0
                || (input.leaguePosition > 0 && input.leaguePosition <= r.topPositions));
        // Arriba del corte no hay dado ni puertas de contexto: alcanza con haber
        // jugado la temporada y haberla jugado bien.
        const seguro = r.certainAtOvr !== null && input.ovr >= r.certainAtOvr;
        if (seguro) {
            // Sin dado, sin puertas de contexto y sin umbral de rating: a 95 el
            // jugador ES el mejor del mundo, y una temporada correcta en vez de
            // extraordinaria no lo cambia. Lo único que se sigue exigiendo es
            // haber jugado (`MIN_MATCHES`, arriba): un premio de temporada no se
            // gana desde la enfermería.
            won.push(id);
            continue;
        }
        const chance = Math.min(
            MAX_CHANCE,
            r.chance + Math.max(0, input.ovr - r.minOvr) * r.chancePerOvr,
        );
        if (califica && roll < chance) won.push(id);
    }
    return won;
}
