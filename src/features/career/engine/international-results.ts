// QUIÉN GANA UN TORNEO DE SELECCIONES. Puro y determinístico (sin red, sin Date).
//
// Existía todo menos esto. `data/international-calendar.ts` declara desde hace
// versiones los DIECINUEVE trofeos del calendario —el Mundial, el Seis Naciones,
// el Rugby Championship, los seis continentales— con su nombre, su `tier` y hasta
// su condición extra (`requires: 'win-all'` para el Grand Slam). `CompetitionScope`
// tiene `'national-team'` desde el primer día. Y ninguna línea del motor leía
// `trophies`: medido sobre 200 carreras de uniones tier 1 y 2, con 8.881 caps
// jugados, los títulos acreditados al jugador eran 349 y TODOS de club. Cero de
// selección. El enchufe estaba puesto y el cable nunca se había conectado.
//
// Este módulo es el cable. No inventa reglas nuevas: hace para las selecciones
// exactamente lo que `competition-results.ts` hace para los clubes —fuerza más
// ruido seedeado, orden estable, el jugador aporta un empujón— y por eso las dos
// cosas se leen igual en la vitrina.
//
// ── LO QUE ESTE MÓDULO NO RESUELVE, Y POR QUÉ ────────────────────────────────
//
// El GRAND SLAM y la TRIPLE CORONA quedan sin otorgar, y no por olvido: sus
// condiciones son `win-all` y `beat-all-home-unions`, o sea que dependen de
// RESULTADO PARTIDO A PARTIDO. El motor sabe cuántos tests juega una unión por
// temporada (`internationalSeason`) y no sabe contra quién ni cómo terminó cada
// uno. Otorgarlos exigiría generar el fixture real de cada edición y resolver
// cinco partidos, que es otro trabajo y no un detalle de éste.
//
// Se prefiere no darlos a darlos mal: un Grand Slam sorteado con una moneda entre
// los campeones del Seis Naciones sería un trofeo que dice haber ganado cinco
// partidos que nunca se jugaron. Los trofeos con `requires` se saltean
// explícitamente y hay un test que lo comprueba.

import type { InternationalCompetition, Trophy } from '../data/international-calendar.ts';
import { INTERNATIONAL_COMPETITIONS, WORLD_CUP_ID, competitionsFor } from '../data/international-calendar.ts';
import { resolveWorldCup, type WorldCupBoost } from './world-cup.ts';
import { unionReputation } from '../data/nations.ts';
import { worldRankingAt } from './world-ranking.ts';
import { createRng, hashSeed } from './random.ts';

/**
 * Cuánta ventaja da estar arriba en el ranking, en puntos de fuerza por puesto.
 *
 * EMPEZÓ EN 1,6 Y ESTÁ EN 0,35 POR UNA MEDICIÓN, no por gusto. Con 1,6 el Seis
 * Naciones lo ganaba Francia el 43% de las veces, Inglaterra el 27%, Escocia el
 * 19% e Irlanda el 11% — y ese orden es EXACTAMENTE el alfabético de sus códigos
 * (`fr` < `gb-eng` < `gb-sct` < `ie`). No era casualidad: las cuatro tienen la
 * misma reputación, así que su puesto base en el ranking sale del desempate por
 * código que `data/nations.ts` documenta como "arbitrario y honesto"… y multiplicar
 * ese desempate por 1,6 por puesto lo convertía en el factor que decidía un
 * campeonato. Lo mismo pasaba en Sudamérica: Chile 82%, Uruguay 18%, y la única
 * diferencia entre las dos es que `cl` va antes que `uy`.
 *
 * Un desempate arbitrario puede ordenar una lista; no puede repartir títulos. Con
 * 0,35 diez puestos de ranking valen menos que medio escalón de reputación: el
 * ranking aporta el matiz —una unión que viene subiendo gana un poco más— y el
 * campeón lo decide la fuerza real más el partido.
 */
const RANK_WEIGHT = 0.35;

/**
 * Cuánta ventaja da la REPUTACIÓN de la unión, que mide la profundidad real del
 * plantel. Es el eje principal: un mal año de Nueva Zelanda no la convierte en
 * candidata a perder el Rugby Championship contra cualquiera.
 *
 * BAJÓ DE 9 A 7 Y ES EL NÚMERO MÁS IMPORTANTE DEL ARCHIVO, porque de él sale
 * cuánto se paga cada escalón de reputación. Con 9 y una dispersión de 5, la
 * distancia entre Nueva Zelanda (rep 5) y Argentina (rep 3) eran 18 puntos: medido
 * sobre 25 carreras argentinas con 1.729 caps jugados, los Pumas ganaban CERO
 * torneos. No es que fuera difícil, era imposible — y "imposible" no es una
 * dificultad, es una ausencia.
 *
 * En 7 la cuenta cambia: un escalón de reputación vale ~1,2 veces la dispersión, o
 * sea que el favorito gana unas tres veces más seguido que el de un escalón abajo.
 * Argentina pasa a ~2,5% por edición del Rugby Championship, que sobre las veinte
 * y pico de ediciones de una carrera es cerca de un 40% de carreras con al menos
 * un título. Sigue siendo la excepción y deja de ser una puerta tapiada.
 */
const REPUTATION_WEIGHT = 7;

/**
 * Dispersión del resultado, en puntos de fuerza. Cuanto más corto el torneo, más
 * azar admite — misma idea que `KIND_VOLATILITY` en el grafo de competiciones.
 *
 * Un torneo largo de liguilla (Seis Naciones, 5 fechas; Rugby Championship, 6)
 * premia al mejor; un Mundial es eliminación directa y ahí pasa cualquier cosa,
 * que es justamente por lo que se mira.
 */
const BASE_VOLATILITY = 7;
/**
 * Cuánto MÁS azar admite un torneo de eliminación directa. Bajó de 5 a 3 midiendo:
 * con 5, Uruguay y Chile ganaban un Mundial el 1% de las veces cada uno. Un
 * Mundial tiene que ser la competición donde más sorpresas pasan y aun así hay
 * ocho selecciones que pueden ganarlo, no treinta.
 */
const KNOCKOUT_EXTRA = 3;

/** Torneos que se resuelven por eliminación directa y admiten más sorpresa. */
const KNOCKOUT_IDS: ReadonlySet<string> = new Set(['world-cup']);

function volatilityOf(competition: InternationalCompetition): number {
    const extra = KNOCKOUT_IDS.has(competition.id) ? KNOCKOUT_EXTRA : 0;
    // Un torneo con más fechas es menos aleatorio: cada partido de más achica la
    // chance de que el campeón salga de una tarde suelta.
    return BASE_VOLATILITY + extra - Math.min(3, Math.max(0, competition.matchesPerEdition - 4));
}

/**
 * Fuerza de una unión para ESTA temporada. Sale de dos ejes que ya existen y no
 * de una tabla nueva: la reputación (profundidad del plantel) y el puesto vivo en
 * el ranking mundial (cómo viene).
 */
function strengthOf(unionCode: string, seasonIndex: number, careerSeed: number): number {
    const reputation = unionReputation(unionCode) * REPUTATION_WEIGHT;
    const rank = worldRankingAt(unionCode, seasonIndex, careerSeed);
    // Sin puesto resoluble se usa el fondo de la tabla: no se premia el no saber.
    const rankBonus = rank === null ? 0 : Math.max(0, 40 - rank) * RANK_WEIGHT;
    return reputation + rankBonus;
}

/**
 * EL CAMPEÓN DE UNA EDICIÓN, y quién lo decide es una pregunta importante: NO el
 * jugador que estamos simulando.
 *
 * El rng se RE-SIEMBRA desde `semilla:torneo:temporada` en vez de consumir el
 * stream principal de la carrera, y eso tiene una consecuencia que vale la pena
 * entender: el Seis Naciones 2031 lo gana el mismo país para dos carreras
 * distintas de la misma semilla, jueguen ellas lo que jueguen. Es lo correcto —el
 * torneo existe con o sin vos— y además es lo que impide que agregar esta
 * característica corra el stream y cambie todas las carreras guardadas por un
 * dato que no depende del jugador.
 */
export function resolveInternationalChampion(
    competition: InternationalCompetition,
    seasonIndex: number,
    careerSeed: number,
): string {
    const rng = createRng(hashSeed(`${careerSeed}:nt-title:${competition.id}:${seasonIndex}`));
    const volatility = volatilityOf(competition);
    // Orden estable por código de unión ANTES de tirar: el orden de un array de
    // participantes no puede decidir un campeonato (CLAUDE.md §1).
    const ordered = [...competition.participants].sort((a, b) => a.localeCompare(b));
    let best = ordered[0];
    let bestScore = -Infinity;
    for (const code of ordered) {
        const score = strengthOf(code, seasonIndex, careerSeed) + rng.normal(0, volatility);
        if (score > bestScore) {
            bestScore = score;
            best = code;
        }
    }
    return best;
}

/** Un título de selección ganado en una temporada. */
export interface InternationalTitle {
    competitionId: string;
    /** Nombre del trofeo tal como se lee en la vitrina. */
    trophyName: string;
    /** Jerarquía declarada en el calendario: 1 es el Mundial. */
    tier: Trophy['tier'];
    union: string;
}

/**
 * ¿Puede esta unión levantar este trofeo? `eligible` acota el subconjunto (la
 * Triple Corona es sólo de las británicas e irlandesa) y `requires` marca los que
 * este módulo NO resuelve (ver el encabezado).
 */
function awardable(trophy: Trophy, unionCode: string): boolean {
    if (trophy.requires) return false;
    return trophy.eligible === undefined || trophy.eligible.includes(unionCode);
}

/**
 * Los títulos que gana la unión del jugador en esa temporada.
 *
 * Se recorren SÓLO los torneos que esa unión disputa de verdad
 * (`competitionsFor`), así que nadie sale campeón de algo que no juega — que es
 * la misma regla que el grafo de clubes: clasificar, participar y ganar son tres
 * cosas distintas.
 *
 * Las VENTANAS (julio y noviembre) no entran: son partidos amistosos de gira, no
 * un torneo, y el calendario ya las declara sin trofeos.
 */
export function internationalTitlesFor(
    unionCode: string | null,
    seasonIndex: number,
    careerSeed: number,
    /**
     * Empujón del jugador a SU unión en el Mundial. `null` cuando no corresponde
     * (no lo convocaron, o no es año de Mundial). Sólo lo usa el Mundial: el
     * resto de los torneos se sigue resolviendo sin el jugador.
     */
    boost: WorldCupBoost | null = null,
): InternationalTitle[] {
    if (unionCode === null) return [];
    const titles: InternationalTitle[] = [];
    for (const competition of competitionsFor(unionCode, seasonIndex)) {
        if (competition.kind !== 'tournament') continue;
        if (competition.trophies.length === 0) continue;
        // EL MUNDIAL SE JUEGA, no se sortea: grupos, cruces y final en
        // `world-cup.ts`. El resto sigue con la tirada única, que para una
        // liguilla de cinco fechas es una aproximación honesta.
        const campeon = competition.id === WORLD_CUP_ID
            ? resolveWorldCup(seasonIndex, careerSeed, boost).champion
            : resolveInternationalChampion(competition, seasonIndex, careerSeed);
        if (campeon !== unionCode) continue;
        for (const trophy of competition.trophies) {
            if (!awardable(trophy, unionCode)) continue;
            titles.push({
                competitionId: trophy.id,
                trophyName: trophy.name,
                tier: trophy.tier,
                union: unionCode,
            });
        }
    }
    return titles;
}

/**
 * Trofeos DECLARADOS que este módulo todavía no otorga, con el motivo. Se expone
 * para que el test lo compruebe en vez de que quede como una nota en un comentario
 * que nadie vuelve a leer.
 */
export function unresolvedTrophies(): { id: string; requires: string }[] {
    return INTERNATIONAL_COMPETITIONS.flatMap((competition) =>
        competition.trophies
            .filter((trophy) => trophy.requires)
            .map((trophy) => ({ id: trophy.id, requires: trophy.requires! })),
    );
}
