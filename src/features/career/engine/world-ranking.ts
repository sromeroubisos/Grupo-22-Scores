import { RUGBY_UNIONS, unionReputation, worldRanking } from '../data/nations.ts';
import { competitionsFor } from '../data/international-calendar.ts';
import { hashSeed, rngFromState } from './random.ts';

// EL RANKING SE MUEVE, PORQUE UN RANKING QUIETO NO ES UN RANKING.
//
// `worldRanking()` de `data/nations.ts` deriva el puesto de la reputación y lo
// calcula UNA vez al cargar el módulo: Argentina es 8ª el primer año de la
// carrera y sigue siendo 8ª quince temporadas después. Como número de referencia
// —"dónde estoy parado"— sirve; como cosa viva, no dice nada.
//
// Acá se le suma el movimiento. Tres decisiones que conviene leer antes de tocar
// un número:
//
//   1. SE MUEVE POCO Y VUELVE. El paso máximo es de dos puestos por temporada y
//      la deriva acumulada está topeada: una unión no puede alejarse más de
//      `MAX_DRIFT` de su puesto base. Sin ese tope, quince temporadas de paseo
//      aleatorio ponen a Tonga primera, y el ranking deja de significar nada.
//
//   2. LA REPUTACIÓN NO SE TOCA. De `unionReputation` salen los umbrales de
//      convocatoria; de acá sale un número que se muestra. Que Gales caiga tres
//      puestos NO tiene que abaratar su camiseta, porque el pool de jugadores
//      galeses no cambió — es la distinción que `data/nations.ts` ya declara
//      cuando dice que la reputación mide la profundidad y no los resultados.
//      Por eso esto vive en `engine/` y no en el catálogo.
//
//   3. EL MOVIMIENTO DEPENDE DE LOS RIVALES, que es lo que lo hace creíble. Una
//      unión que juega un calendario mucho más duro que ella se mueve más —tiene
//      más para ganar y más para perder—, y una que juega su torneo regional
//      contra pares se queda casi donde está. Es la forma que tiene el ranking
//      real de World Rugby: los puntos que se intercambian dependen de la
//      diferencia entre los dos equipos, no del resultado a secas.
//
// TODO ES DETERMINÍSTICO: la deriva sale de un rng re-sembrado desde
// `semilla:world-ranking:temporada:unión`, así que no consume el stream principal
// y una misma carrera muestra el mismo ranking hoy y dentro de seis meses.

/** Cuánto puede alejarse una unión de su puesto base, en puestos. */
const MAX_DRIFT = 4;
/** Tope duro del salto de UNA temporada. El pedido es "1 o 2 puestos". */
const MAX_STEP = 2;

/**
 * Cuánto pesa la dureza del calendario en el tamaño del paso.
 *
 * `gap` es la diferencia de reputación entre los rivales de la temporada y la
 * unión, en escala 0-5. Un tier 2 que juega contra tier 1 tiene gap ~1,5 y se
 * mueve casi el paso entero; una unión que juega su torneo regional contra pares
 * tiene gap ~0 y se queda quieta salvo por el ruido de base.
 */
const BASE_VOLATILITY = 0.55;
const GAP_VOLATILITY = 0.9;

const ALL_UNIONS: readonly string[] = Object.keys(RUGBY_UNIONS).sort();

function clamp(lo: number, hi: number, v: number): number {
    return Math.max(lo, Math.min(hi, v));
}

/**
 * Dureza del calendario de esa unión en esa temporada: cuánto más fuerte es el
 * rival promedio que ella. Sale del calendario internacional y de ningún otro
 * lado — si no juega nada, no se mueve.
 */
function fixtureGap(unionCode: string, seasonIndex: number): number | null {
    const competitions = competitionsFor(unionCode, seasonIndex);
    if (competitions.length === 0) return null;

    const propia = unionReputation(unionCode);
    let suma = 0;
    let cuenta = 0;
    for (const competition of competitions) {
        for (const rival of competition.participants) {
            if (rival === unionCode) continue;
            suma += unionReputation(rival);
            cuenta++;
        }
    }
    if (cuenta === 0) return null;
    return suma / cuenta - propia;
}

/**
 * Deriva acumulada de una unión hasta esa temporada, en puestos.
 *
 * Se calcula desde cero cada vez y no se guarda en el estado: es una función pura
 * de (semilla, temporada) y guardarla sería una segunda fuente de verdad que se
 * desincroniza en cuanto alguien recargue con otra versión del calendario.
 */
function driftOf(unionCode: string, seasonIndex: number, careerSeed: number): number {
    let drift = 0;
    for (let s = 0; s <= seasonIndex; s++) {
        const gap = fixtureGap(unionCode, s);
        if (gap === null) continue; // sin fixture no hay resultados que ranquear
        const rng = rngFromState(hashSeed(`${careerSeed}:world-ranking:${s}:${unionCode}`));
        const volatility = BASE_VOLATILITY + Math.abs(gap) * GAP_VOLATILITY;
        const step = clamp(-MAX_STEP, MAX_STEP, Math.round(rng.float(-volatility, volatility)));
        drift = clamp(-MAX_DRIFT, MAX_DRIFT, drift + step);
    }
    return drift;
}

/**
 * Tabla del ranking en esa temporada: códigos de unión, del 1º al último.
 *
 * Se ordena por `puesto base + deriva`, desempatando por el puesto base para que
 * dos uniones que quedan en la misma clave conserven el orden de siempre. El
 * desempate NO puede ser el orden de iteración de `RUGBY_UNIONS` (CLAUDE.md §1).
 */
export function worldRankingTable(seasonIndex: number, careerSeed: number): string[] {
    return [...ALL_UNIONS]
        .map((code) => {
            const base = worldRanking(code) ?? ALL_UNIONS.length;
            return { code, base, key: base + driftOf(code, seasonIndex, careerSeed) };
        })
        .sort((a, b) => a.key - b.key || a.base - b.base || a.code.localeCompare(b.code))
        .map((u) => u.code);
}

/**
 * Puesto de una unión en esa temporada, 1 es el mejor. `null` si no tiene
 * selección modelada.
 *
 * La tabla se memoiza por (temporada, semilla): la cabecera la pide en cada
 * render y recalcular 128 derivas por pintada sería caro sin ningún motivo.
 */
const CACHE = new Map<string, string[]>();

export function worldRankingAt(unionCode: string | null, seasonIndex: number, careerSeed: number): number | null {
    if (unionCode === null || !(unionCode in RUGBY_UNIONS)) return null;
    const key = `${careerSeed}:${seasonIndex}`;
    let table = CACHE.get(key);
    if (table === undefined) {
        table = worldRankingTable(seasonIndex, careerSeed);
        CACHE.set(key, table);
    }
    const index = table.indexOf(unionCode);
    return index === -1 ? null : index + 1;
}

/**
 * Cuánto se movió respecto de la temporada anterior. Positivo = subió puestos.
 * `null` en la primera temporada, que no tiene con qué compararse.
 */
export function worldRankingDelta(unionCode: string | null, seasonIndex: number, careerSeed: number): number | null {
    if (seasonIndex <= 0) return null;
    const hoy = worldRankingAt(unionCode, seasonIndex, careerSeed);
    const ayer = worldRankingAt(unionCode, seasonIndex - 1, careerSeed);
    if (hoy === null || ayer === null) return null;
    return ayer - hoy;
}
