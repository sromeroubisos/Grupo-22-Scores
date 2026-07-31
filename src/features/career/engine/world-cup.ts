// EL MUNDIAL, PARTIDO A PARTIDO. Puro y determinístico (sin red, sin Date).
//
// Hasta acá el campeón de cualquier torneo de selecciones salía de UNA tirada:
// `argmax(fuerza + ruido)` sobre los participantes, sin que se jugara nada. Eso
// alcanzaba para una liguilla —el que suma más puntos en cinco fechas es
// razonablemente el mejor— pero no para un Mundial, que es lo contrario: un
// torneo donde el favorito puede irse en cuartos por un drop en el minuto 79, y
// donde la gracia está justamente en eso.
//
// Acá se juega el torneo: seis grupos de cuatro, los mejores terceros, octavos,
// cuartos, semis y final. Cada partido es una comparación de fuerza con ruido, y
// el ruido de un cruce es más grande que el de un partido de grupo, porque un
// cruce no tiene revancha.
//
// ── POR QUÉ VALE LA PENA ─────────────────────────────────────────────────────
//
// Con una sola tirada no existía el FINALISTA: "Finalista del Mundial" lo
// repartía un evento con una moneda propia, que ni siquiera miraba si tu unión
// había llegado a la final. Un bracket lo da gratis, porque el que pierde la
// final es un dato del torneo y no una tirada aparte.
//
// ── EL EMPUJÓN DEL JUGADOR ───────────────────────────────────────────────────
//
// El torneo lo resuelve un rng RE-SEMBRADO (`semilla:world-cup:temporada`), no el
// stream de la carrera: dos carreras distintas de la misma semilla ven el mismo
// sorteo de grupos y el mismo ruido en cada partido. Lo que cambia entre una y
// otra es la FUERZA de su unión, porque el jugador aporta.
//
// Está hecho así a propósito: el aporte entra como puntos de fuerza y no como
// tiradas consumidas, así que el jugador puede cambiar quién sale campeón sin
// desincronizar el resto del torneo. Un titular grande de una unión chica la
// empuja un poco; un suplente de Nueva Zelanda no le mueve la aguja a Nueva
// Zelanda, y así tiene que ser.

import { INTERNATIONAL_COMPETITIONS, WORLD_CUP_ID } from '../data/international-calendar.ts';
import { unionReputation } from '../data/nations.ts';
import { worldRankingAt } from './world-ranking.ts';
import { createRng, hashSeed, type Rng } from './random.ts';

/** Los mismos pesos que el resto de los torneos: la fuerza no cambia de definición. */
const REPUTATION_WEIGHT = 7;
const RANK_WEIGHT = 0.35;

/**
 * Dispersión de UN partido, en puntos de fuerza. ES EL NÚMERO DE ESTE ARCHIVO.
 *
 * UN BRACKET COMPONE, Y ESO CAMBIA LA CUENTA. La intuición dice que si cada
 * partido tiene poca sorpresa el torneo tiene poca sorpresa, y es al revés: el
 * favorito juega siete partidos y gana los siete, así que una ventaja chica
 * repetida siete veces se vuelve una ventaja enorme. MEDIDO sobre 500 ediciones:
 *
 *   ruido  nz+za   argentina   campeones distintos
 *    5,5   74,2%      0,2%            9
 *      8   65,4%      0,6%           10
 *     10   59,2%      1,0%           12
 *     12   51,6%      1,6%           14
 *     14   46,0%      2,0%           15
 *
 * Está en 10 por el mismo criterio con el que `REPUTATION_WEIGHT` bajó de 9 a 7 en
 * `international-results.ts`: con 5,5 el Mundial reparte como la historia real
 * —Nueva Zelanda y Sudáfrica se llevan tres de cada cuatro— pero una carrera
 * argentina, italiana o georgiana no tiene ninguna chance, y eso no es dificultad,
 * es una puerta tapiada. Con 10 quedan doce selecciones capaces de ganarlo, que es
 * el orden de magnitud declarado en `KNOCKOUT_EXTRA` ("ocho selecciones, no
 * treinta"), y Argentina pasa a ~1% por edición: sobre los cinco Mundiales de una
 * carrera, uno de cada veinte jugadores argentinos ve la copa.
 *
 * Subirlo abre el torneo, bajarlo lo cierra. Es el único número a tocar.
 */
const MATCH_NOISE = 10;

/**
 * Cuánto MÁS ruido tiene un cruce que un partido de grupo.
 *
 * Un grupo son tres partidos y perdonan un mal día; un cruce, ninguno. Es la
 * misma idea que `KNOCKOUT_EXTRA` en los otros torneos, dicha partido a partido
 * en vez de sobre el torneo entero.
 */
const KNOCKOUT_NOISE = 2.5;

/** Techo del empujón del jugador, en puntos de fuerza. */
const MAX_PLAYER_BOOST = 4;

export interface WorldCupBoost {
    /** Unión a la que empuja. */
    union: string;
    /**
     * Cuánto, de 0 a 1. Lo traduce el motor desde el nivel del jugador y su rol:
     * un suplente aporta cerca de 0 y un titular consagrado, cerca de 1.
     */
    weight: number;
}

export interface WorldCupResult {
    champion: string;
    /** El que perdió la final. Antes no existía y lo sorteaba un evento. */
    runnerUp: string;
    /** Los dos que perdieron las semis, en orden estable. */
    semifinalists: string[];
    /** Hasta dónde llegó cada participante. Sirve para el relato y para los tests. */
    reachedBy: Readonly<Record<string, Ronda>>;
}

export type Ronda = 'grupos' | 'octavos' | 'cuartos' | 'semis' | 'final' | 'campeon';

function participantes(): readonly string[] {
    const wc = INTERNATIONAL_COMPETITIONS.find((c) => c.id === WORLD_CUP_ID);
    if (wc === undefined) throw new Error('el Mundial no está en el calendario internacional');
    // Orden estable ANTES de cualquier tirada: el orden de un array no puede
    // decidir un campeonato (CLAUDE.md §1).
    return [...wc.participants].sort((a, b) => a.localeCompare(b));
}

function fuerzaBase(union: string, seasonIndex: number, careerSeed: number): number {
    const rank = worldRankingAt(union, seasonIndex, careerSeed);
    const rankBonus = rank === null ? 0 : Math.max(0, 40 - rank) * RANK_WEIGHT;
    return unionReputation(union) * REPUTATION_WEIGHT + rankBonus;
}

/**
 * UN PARTIDO. Devuelve el ganador.
 *
 * No hay empate: un Mundial se define, y en fase de grupos el empate es tan raro
 * que modelarlo agrega una rama para un caso que casi no pasa.
 */
function partido(a: string, b: string, fuerza: Map<string, number>, rng: Rng, cruce: boolean): string {
    const sd = MATCH_NOISE + (cruce ? KNOCKOUT_NOISE : 0);
    const puntoA = (fuerza.get(a) ?? 0) + rng.normal(0, sd);
    const puntoB = (fuerza.get(b) ?? 0) + rng.normal(0, sd);
    // El desempate por código es estable y no favorece a nadie de forma
    // sistemática: la probabilidad de llegar acá es despreciable.
    if (puntoA === puntoB) return a.localeCompare(b) <= 0 ? a : b;
    return puntoA > puntoB ? a : b;
}

/**
 * SORTEO DE GRUPOS EN SERPIENTE.
 *
 * Se ordena por fuerza y se reparte 1-2-3-4-5-6 / 6-5-4-3-2-1, que es el efecto
 * de los bombos: los seis cabezas de serie caen en grupos distintos. Sin esto el
 * sorteo puramente aleatorio junta a las tres mejores en el mismo grupo cada
 * tanto y el torneo se decide antes de los cruces.
 */
function grupos(orden: readonly string[]): string[][] {
    const g: string[][] = [[], [], [], [], [], []];
    orden.forEach((union, i) => {
        const vuelta = Math.floor(i / 6);
        const col = i % 6;
        g[vuelta % 2 === 0 ? col : 5 - col].push(union);
    });
    return g;
}

export function resolveWorldCup(
    seasonIndex: number,
    careerSeed: number,
    boost: WorldCupBoost | null = null,
): WorldCupResult {
    const rng = createRng(hashSeed(`${careerSeed}:world-cup:${seasonIndex}`));
    const equipos = participantes();

    const fuerza = new Map<string, number>();
    for (const u of equipos) {
        const empujon = boost !== null && boost.union === u
            ? Math.max(0, Math.min(1, boost.weight)) * MAX_PLAYER_BOOST
            : 0;
        fuerza.set(u, fuerzaBase(u, seasonIndex, careerSeed) + empujon);
    }

    const alcanzo: Record<string, Ronda> = {};
    for (const u of equipos) alcanzo[u] = 'grupos';

    // ── FASE DE GRUPOS: todos contra todos, tres partidos por equipo ──────────
    const porGrupo = grupos([...equipos].sort((a, b) => (fuerza.get(b) ?? 0) - (fuerza.get(a) ?? 0) || a.localeCompare(b)));
    const segundos: { union: string; puntos: number }[] = [];
    const clasificados: string[] = [];

    for (const grupo of porGrupo) {
        const puntos = new Map<string, number>(grupo.map((u) => [u, 0]));
        for (let i = 0; i < grupo.length; i++) {
            for (let j = i + 1; j < grupo.length; j++) {
                const ganador = partido(grupo[i], grupo[j], fuerza, rng, false);
                puntos.set(ganador, (puntos.get(ganador) ?? 0) + 1);
            }
        }
        // Desempate: fuerza y después código. Estable y sin tiradas de más.
        const tabla = [...grupo].sort((a, b) =>
            (puntos.get(b) ?? 0) - (puntos.get(a) ?? 0)
            || (fuerza.get(b) ?? 0) - (fuerza.get(a) ?? 0)
            || a.localeCompare(b));
        clasificados.push(tabla[0], tabla[1]);
        segundos.push({ union: tabla[2], puntos: puntos.get(tabla[2]) ?? 0 });
    }

    // Los cuatro mejores terceros completan los dieciséis.
    const mejoresTerceros = segundos
        .sort((a, b) => b.puntos - a.puntos || (fuerza.get(b.union) ?? 0) - (fuerza.get(a.union) ?? 0) || a.union.localeCompare(b.union))
        .slice(0, 4)
        .map((x) => x.union);

    // ── LLAVES ───────────────────────────────────────────────────────────────
    //
    // El cuadro se arma cruzando el mejor con el peor de los clasificados. No es
    // el cuadro real de la World Rugby —que sale del sorteo previo— pero sí su
    // efecto: los favoritos no se encuentran en octavos.
    let ronda = [...clasificados, ...mejoresTerceros]
        .sort((a, b) => (fuerza.get(b) ?? 0) - (fuerza.get(a) ?? 0) || a.localeCompare(b));
    const nombres: Ronda[] = ['octavos', 'cuartos', 'semis', 'final'];

    for (const nombre of nombres) {
        for (const u of ronda) alcanzo[u] = nombre;
        const siguiente: string[] = [];
        for (let i = 0; i < ronda.length / 2; i++) {
            siguiente.push(partido(ronda[i], ronda[ronda.length - 1 - i], fuerza, rng, true));
        }
        ronda = siguiente;
    }

    const champion = ronda[0];
    alcanzo[champion] = 'campeon';

    // El finalista y los semifinalistas se leen del registro: el que quedó en
    // 'final' y no es campeón perdió la final, y los de 'semis' perdieron ahí.
    const runnerUp = equipos.find((u) => alcanzo[u] === 'final' && u !== champion) ?? champion;
    const semifinalists = equipos.filter((u) => alcanzo[u] === 'semis');

    return { champion, runnerUp, semifinalists, reachedBy: alcanzo };
}
