// EL CAPITÁN — LOS PREMIOS INDIVIDUALES DE TEMPORADA.
//
// Tres distinciones que se reparten al cerrar cada año, y están armadas como una
// ESCALERA DE ALCANCE para que la vitrina no sea solamente del que llegó arriba:
//
//   · Mejor de la temporada local — se puede ganar en CUALQUIER nivel. No mira
//     la media ni la banda de la liga: mira si hiciste una gran temporada en un
//     club que peleó el campeonato de SU división. Es el único premio que una
//     carrera que nunca se profesionaliza puede poner en la vitrina, y por eso
//     existe. Sin él, el 100% de los premios era del que ya tenía todo — y en
//     este juego, donde la carrera típica termina en un club de barrio, eso
//     quiere decir que el 100% de las partidas no ganaba ninguno.
//   · XV ideal del año — pide nivel Y competición profesional. Repetible: el que
//     se sostiene arriba entra varios años seguidos, y eso ES el logro.
//   · Mejor jugador del mundo — media alta más plantel de la mayor. Es uno por
//     año en todo el rugby: incluso cumpliendo todo, la tirada te deja afuera
//     la mayoría de las veces.
//
// ── EL PATRÓN: condición dura → umbral → tirada ────────────────────────────
// La condición dura impide que un premio grande salga por suerte; la tirada
// impide que salga siempre que se cumple el mínimo. Es el mismo esqueleto del
// campeón de liga: hay UNA distinción y no se regala.
//
// ── EL RNG VA RE-SEMBRADO APARTE, y esto no es un detalle ──────────────────
// La semilla sale de `(semilla de carrera : awards : temporada)` y NO toca el
// stream principal. Consecuencia buscada: agregar, sacar o recalibrar un premio
// no corre una sola tirada del resto del motor, así que el digest congelado se
// mueve solo donde el premio cambió de verdad. Si tomara el `rng` de la
// temporada, tocar esta tabla movería la carrera entera —otro club, otra
// lesión, otro año de retiro— por haber cambiado un umbral.

import type { SquadTrack } from '../types/captain.ts';
import type { SeasonAward, SeasonAwardId } from '../types/achievements.ts';
import { hashSeed, rngFromState } from './random.ts';

// Los TIPOS viven en `types/achievements.ts` porque el estado los guarda. Acá
// viven las REGLAS: los umbrales, las tiradas y el orden de evaluación.
export type { SeasonAward, SeasonAwardId };

/** El texto que se muestra. Es presentación: cambiarlo no toca el estado. */
export const AWARD_LABELS: Readonly<Record<SeasonAwardId, string>> = {
    'mejor-del-mundo': 'Mejor jugador del mundo',
    'xv-ideal': 'XV ideal del año',
    'mejor-local': 'Mejor de la temporada local',
};

/**
 * Partidos mínimos para entrar en cualquier consideración.
 *
 * Sin esto, una temporada de tres partidos con puntaje alto —que es justo lo que
 * produce una lesión larga con una buena vuelta— ganaba premios de temporada
 * completa.
 */
const MIN_MATCHES = 8;

interface AwardRule {
    minOvr: number;
    minRating: number;
    /** Banda deportiva de la competición (0–7). 0 = no la mira. */
    minBand: number;
    /** Puestos de arriba de la liga que habilitan el premio. 0 = no la mira. */
    topPositions: number;
    /** Exige estar en el plantel de la mayor. */
    needsNationalSquad: boolean;
    chance: number;
    /**
     * CUÁNTO SUBE LA CHANCE POR CADA PUNTO DE MEDIA POR ENCIMA DEL MÍNIMO.
     *
     * Sin pendiente la chance es PLANA, y entonces el de 78 y el de 92 entran al
     * XV ideal con la misma probabilidad: la única diferencia entre los dos sería
     * cuántas temporadas califican. Con eso, llegar a 90 no se siente distinto de
     * llegar a 80 — y llegar a 90 tiene que sentirse distinto.
     */
    chancePerOvr: number;
    /**
     * A PARTIR DE ESTA MEDIA EL PREMIO DEJA DE SER UNA TIRADA.
     *
     * Arriba del corte, el contexto deja de ser una condición y pasa a ser una
     * anomalía: un jugador de 95 que no está en su selección es un problema del
     * modelo de convocatoria, no una razón para negarle el premio al mejor del
     * mundo. `null` = siempre se tira.
     */
    certainAtOvr: number | null;
}

/**
 * Umbrales y probabilidad de cada premio. UN SOLO LUGAR para calibrarlos.
 *
 * ── LOS CORTES DE MEDIA SON DE ESTE JUEGO, NO DE CARRERA DE RUGBY ──────────
 * Es el error que este bloque cometió primero y que hay que dejar anotado,
 * porque es de los que se repiten: los umbrales entraron copiados del
 * `awards.ts` de Carrera de Rugby —88 para el mejor del mundo, 78 para el XV
 * ideal— y el resultado medido fue CERO sobre ciento sesenta carreras.
 *
 * No era estricto: era otra escala. Los dos juegos sortean su población con
 * modelos generativos distintos. En Carrera, un techo de 80 es la carrera
 * típica; en El Capitán, `POTENTIAL_MEAN_GAP` deja la media de techo cerca de 65
 * y los 80 viven en la cola —está escrito en `types/player.ts` con todas las
 * letras—. Un 78 allá es "un buen profesional"; acá es "uno de los mejores del
 * mundo". El número era el mismo y el mundo era otro.
 *
 * Los de ahora están anclados a LA ESCALERA DE ESTE JUEGO: el escalón `nacional`
 * de `national-team.ts` pide cerca de 74 para una unión de reputación media, así
 * que el XV ideal se elige entre los que están al nivel de un internacional (74)
 * y el mejor del mundo bastante por encima (82). Si algún día se toca
 * `BASE_THRESHOLD`, estos dos se mueven con él — son ESPEJO de esa escalera, no
 * parámetros libres.
 */
const RULES: Readonly<Record<SeasonAwardId, AwardRule>> = {
    // Uno por año en el mundo. Con 82 apenas asomás; con 90 sos el candidato.
    //
    // ── SIN PUNTAJE, Y ESTÁ MEDIDO (0.28.0) ────────────────────────────────
    // Pedía `minRating: 7.8` y era una condición IMPOSIBLE de cumplir para el
    // único jugador que este premio busca. El puntaje de la temporada se
    // normaliza contra la producción ESPERADA para tu media, así que el cociente
    // da ~1 para todos y el número se clava en el pivote:
    //
    //     correlación media↔puntaje sobre 6.235 temporadas:  r = −0,138
    //     puntaje medio con media 50-59:  6,78
    //     puntaje medio con media 90-99:  6,44   ← el mejor del mundo puntúa PEOR
    //     temporadas de media ≥ 90 que llegan a 7,8:  1,0%
    //
    // O sea que el premio del mejor jugador del mundo le pedía a un tipo de 93
    // algo que le pasa una vez cada cien años. El síntoma que lo destapó fue una
    // tarjeta de retiro con «Mejor jugador del mundo ×9» y un puntaje de 6,8.
    //
    // La media ES el eje de este premio y alcanza sola: `minOvr` ya dice «uno de
    // los mejores del mundo» en la escala de ESTE juego. El puntaje se queda en
    // los otros dos premios, donde sí discrimina —`mejor-local` existe
    // justamente para el que rinde por encima de su nivel—.
    //
    // ⚠️ Esto NO arregla el puntaje, que sigue siendo un número casi constante y
    // levemente anti-correlacionado con el nivel. Ese es un problema abierto y
    // más grande: el puntaje también alimenta el mérito de `growth.ts`, el factor
    // de forma de la Pertenencia y el bono de forma de la convocatoria.
    'mejor-del-mundo': {
        minOvr: 82, minRating: 0, minBand: 6, topPositions: 0,
        needsNationalSquad: true, chance: 0.25, chancePerOvr: 0.05, certainAtOvr: 90,
    },
    // El XV del año se elige entre los que juegan competiciones profesionales y
    // están al nivel de un internacional.
    'xv-ideal': {
        minOvr: 74, minRating: 7.4, minBand: 5, topPositions: 0,
        needsNationalSquad: false, chance: 0.35, chancePerOvr: 0.04, certainAtOvr: null,
    },
    // RELATIVO A SU LIGA: no mira media ni banda, mira si hizo una gran
    // temporada en un club que peleó arriba. Es lo que lo hace alcanzable desde
    // abajo, y por eso es el único sin pendiente — acá la media no es el criterio.
    'mejor-local': {
        minOvr: 0, minRating: 7.3, minBand: 0, topPositions: 5,
        needsNationalSquad: false, chance: 0.45, chancePerOvr: 0, certainAtOvr: null,
    },
};

/** Ni el mejor del mundo lo gana todos los años. Siempre falta la temporada. */
const MAX_CHANCE = 0.85;

/**
 * ORDEN DE EVALUACIÓN, fijo y explícito. Se recorre siempre COMPLETO y en este
 * orden para que la tirada de un premio no dependa de si el anterior se ganó: si
 * se cortara al primero, agregar uno nuevo arriba desalinearía los de abajo y la
 * misma semilla daría otra vitrina.
 *
 * Es la regla del §1.5 aplicada al revés: acá el orden SÍ es la identidad —es lo
 * que mantiene alineado el stream— y por eso se declara como un array literal y
 * no se recorre `Object.keys(RULES)`, que ataría el reparto al orden de
 * inserción de un objeto.
 */
const ORDER: readonly SeasonAwardId[] = ['mejor-del-mundo', 'xv-ideal', 'mejor-local'];

export interface AwardInput {
    /** Media al cierre de la temporada. */
    ovr: number;
    /** El puntaje de la temporada (5,0 – 9,9). */
    rating: number;
    matchesPlayed: number;
    /** Banda deportiva de la competición que disputó el club. */
    band: number;
    /** Dónde terminó el club y cuántos eran. 0 = no se pudo resolver la tabla. */
    leaguePosition: number;
    leagueTeams: number;
    track: SquadTrack;
    careerSeed: number;
    season: number;
}

/**
 * Los premios que se gana esta temporada. Puro y determinístico: mismo input ⇒
 * misma salida, hoy y en seis meses.
 */
export function evaluateSeasonAwards(input: AwardInput): SeasonAwardId[] {
    if (input.matchesPlayed < MIN_MATCHES) return [];

    const rng = rngFromState(hashSeed(`${input.careerSeed}:awards:${input.season}`));
    const enPlantel = input.track === 'nacional';

    const ganados: SeasonAwardId[] = [];
    for (const id of ORDER) {
        const r = RULES[id];
        // La tirada se hace SIEMPRE, califique o no. Si dependiera de calificar,
        // el stream se correría según quién califica y dos carreras con la misma
        // semilla se desalinearían. Es la misma regla que el ruido de `aging.ts`.
        const tirada = rng.float(0, 1);

        const califica = input.ovr >= r.minOvr
            && input.rating >= r.minRating
            && input.band >= r.minBand
            && (!r.needsNationalSquad || enPlantel)
            && (r.topPositions === 0
                || (input.leaguePosition > 0 && input.leaguePosition <= r.topPositions));

        // ARRIBA DEL CORTE SE APAGA EL DADO, NO LAS REGLAS.
        //
        // Decía «alcanza con haber jugado la temporada» y salteaba `califica`
        // entero: banda, plantel de la mayor y puntaje. Medido sobre 320
        // carreras, el 95,3% de los 86 premios que repartía iba a jugadores que
        // NO estaban en el plantel de su unión — o sea que `needsNationalSquad`,
        // que este premio declara en `true`, casi no se cumplía nunca. El cuerpo
        // hacía otra cosa que el nombre y nadie se enteró porque el premio SALÍA
        // (§1.7 del CLAUDE de captain).
        //
        // Con el atajo apagando sólo el dado: 26 premios, 3,8% fuera del plantel
        // —uno, y es un `trial`: su temporada dice `nacional` porque lo llevaron
        // de gira—. Ese borde es correcto y queda.
        //
        // Lo que el atajo existe para decir es «al de 95 no se lo deja afuera
        // por una tirada», y eso se dice apagando el dado. Las condiciones
        // siguen: sin la camiseta de tu unión no sos el mejor jugador del mundo,
        // por más media que tengas. Si eso deja el premio desierto, el problema
        // está en la convocatoria y hay que arreglarlo AHÍ —taparlo acá es lo
        // que produjo la tarjeta con nueve premios y dos caps—.
        if (r.certainAtOvr !== null && input.ovr >= r.certainAtOvr) {
            if (califica) ganados.push(id);
            continue;
        }

        const chance = Math.min(
            MAX_CHANCE,
            r.chance + Math.max(0, input.ovr - r.minOvr) * r.chancePerOvr,
        );
        if (califica && tirada < chance) ganados.push(id);
    }
    return ganados;
}
