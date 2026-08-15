// EL CAPITÁN — EL TEST QUE TIENE NOMBRE.
//
// Las ventanas de julio y noviembre son de donde sale la mayoría de los caps
// reales, y hasta acá llegaban a la carrera como un número: «+4 caps». Cuatro
// partidos internacionales resumidos en un entero es exactamente lo que el
// jugador no se acuerda al año siguiente.
//
// Este archivo elige UNO de los partidos que la unión juega esa temporada y le
// pone nombre: contra quién y en qué torneo. El resto sigue siendo agregado, y
// eso es deliberado — no se simulan las ventanas, se le da pantalla al partido
// que la carrera va a recordar. Un test por temporada, el más grande.
//
// ── DE DÓNDE SALE, Y DE DÓNDE NO ───────────────────────────────────────────
// Del calendario (`data/international-calendar.ts`, por la puerta de
// `data/catalogs.ts`) y de ningún otro lado, por la misma razón de siempre: el
// rugby es catálogo y el catálogo tiene un dueño. Acá no hay una lista de
// clásicos escrita a mano — quién juega contra quién ya está declarado en
// `participants`, y el peso de cada rival sale del ranking mundial.
//
// ── NO CONSUME EL RNG DE LA CARRERA ────────────────────────────────────────
// El azar sale de un stream local sembrado con `semilla:test:temporada`, igual
// que la convocatoria, el torneo y los Momentos. Es lo que permite que agregar
// esto no mueva una sola carrera que ya existía: el digest se mueve por lo que
// se escribe en la crónica, no por un corrimiento de tiradas.

import type { InternationalCompetition } from '../data/catalogs.ts';
import {
    WORLD_CUP_ID,
    competitionsFor,
    internationalSeason,
    unionName,
    worldRanking,
} from '../data/catalogs.ts';
import { createRng, hashSeed } from './random.ts';

/** De qué clase es el partido, que es lo que decide cuánto pesa la crónica. */
export type TestKind = 'mundial' | 'torneo' | 'ventana';

export interface NamedTest {
    competitionId: string;
    /** El nombre del torneo, tal como lo declara el calendario. */
    competition: string;
    kind: TestKind;
    /** Código de la unión rival. */
    rivalUnion: string;
    /** Y su nombre, que es lo que se lee. */
    rival: string;
}

/**
 * CUÁNTO PESA UN PARTIDO POR SER DE ESE TORNEO.
 *
 * PARÁMETROS LIBRES, y el orden es lo único que importa: un partido del Mundial
 * le gana a uno del Championship y ése le gana a un amistoso de noviembre. Los
 * saltos son grandes a propósito — con pesos parejos, la temporada del Mundial
 * contaba la crónica de un amistoso de preparación una vez de cada tres, que es
 * el único año en que eso no se puede permitir.
 *
 * ⚠️ NO ES `FAME_BY_OUTCOME` NI EL `nivel` DE `tournament-gate.ts`. Aquellos
 * dicen cuánto Cartel deja un resultado; esto dice cuál de los partidos de la
 * temporada se cuenta. Son dos preguntas distintas y por eso son dos tablas
 * distintas: unificarlas ataría el relato a la economía de la fama, y la próxima
 * recalibración del Cartel cambiaría de qué partido habla la crónica (§1.7).
 */
const KIND_WEIGHT: Record<TestKind, number> = {
    mundial: 100,
    torneo: 30,
    ventana: 10,
};

function kindOf(competition: InternationalCompetition): TestKind {
    if (competition.id === WORLD_CUP_ID) return 'mundial';
    return competition.kind === 'tournament' ? 'torneo' : 'ventana';
}

/**
 * CUÁNTO PESA UN RIVAL POR SER QUIEN ES. Sale del ranking mundial, que es el
 * dato: jugarle a Nueva Zelanda es una historia y jugarle a Chile es un partido.
 *
 * ── POR QUÉ NO REUSA `unionWeight` DE `international-results.ts` ───────────
 * Aquella contesta «¿quién gana el torneo?» y su exponente (1,8) está calibrado
 * para eso: separa al favorito del ganador cantado. Ésta contesta «¿de qué
 * partido se acuerda el jugador?», que no es la misma pregunta —el que perdió
 * 40-3 en Auckland se acuerda igual— y por eso lleva su propio exponente, más
 * chato: el rival grande tiene que ganar seguido y no siempre, o la crónica de
 * un argentino dice «contra Nueva Zelanda» catorce temporadas seguidas.
 *
 * Compartir la constante habría atado el relato a la calibración de los
 * campeones: mover una para que el Championship no se lo lleve siempre el mismo
 * cambiaría de qué partido habla la crónica, sin que nadie lo pidiera (§1.7).
 */
const RANKING_SPAN = 26;
const RANKING_EXPONENT = 0.9;
const RANKING_FLOOR = 1;

function pesoDeCartel(code: string): number {
    const rank = worldRanking(code);
    if (rank === null) return RANKING_FLOOR;
    return Math.max(RANKING_FLOOR, RANKING_SPAN - rank) ** RANKING_EXPONENT;
}

/**
 * EL TEST DEL AÑO, o `null` si la unión no jugó nada.
 *
 * `null` no es un borde a parchear: hay uniones en el catálogo que no juegan
 * ninguna competición —Rusia está suspendida— y una temporada sin fixture no
 * tiene partido que contar. Quien llama ya sabe qué hacer con eso, porque es el
 * mismo `null` que devuelve la convocatoria.
 */
export function namedTestOf(
    union: string | null,
    seasonIndex: number,
    careerSeed: number,
): NamedTest | null {
    if (union === null) return null;
    if (internationalSeason(union, seasonIndex).matches <= 0) return null;

    const competitions = competitionsFor(union, seasonIndex);
    if (competitions.length === 0) return null;

    const rng = createRng(hashSeed(`${careerSeed}:test:${seasonIndex}`));

    // Primero el torneo y después el rival, y no al revés: el partido más grande
    // del año es el del torneo más grande, y recién adentro de él se decide
    // contra quién. Sorteados juntos —un peso por cada par (torneo, rival)— un
    // amistoso contra Nueva Zelanda le ganaría a un partido del Mundial contra
    // Chile, que es al revés de como se recuerdan.
    const competition = rng.weighted(competitions, (c) => KIND_WEIGHT[kindOf(c)]);

    // El orden se estabiliza antes de elegir: `participants` es `readonly` y ya
    // viene en orden declarado, pero copiarla y ordenarla explícitamente es lo
    // que hace que el sorteo no dependa de cómo se escribió el catálogo.
    const rivales = [...competition.participants].filter((u) => u !== union).sort();
    if (rivales.length === 0) return null;

    const rivalUnion = rng.weighted(rivales, pesoDeCartel);

    return {
        competitionId: competition.id,
        competition: competition.name,
        kind: kindOf(competition),
        rivalUnion,
        rival: unionName(rivalUnion),
    };
}

/**
 * LA CRÓNICA DEL TEST, en una línea.
 *
 * Tres voces y no una, porque los tres partidos son distintos: el debut se
 * cuenta una sola vez en la vida, el del Mundial es el partido de la carrera, y
 * el resto es la temporada haciendo su trabajo.
 *
 * El texto va a `entry.note`, que SE PERSISTE: cambiarlo mueve el `stateHash`
 * del digest congelado (CLAUDE.md raíz §2). No es un `hint` de presentación.
 */
export function testLine(test: NamedTest, opts: { debut: boolean }): string {
    if (opts.debut) {
        return `Debutaste contra ${test.rival}, por ${test.competition}.`;
    }
    if (test.kind === 'mundial') {
        return `Tu partido del año fue contra ${test.rival}, en el Mundial.`;
    }
    return `Tu partido del año fue contra ${test.rival}, por ${test.competition}.`;
}
