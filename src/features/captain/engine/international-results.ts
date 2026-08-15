// EL CAPITÁN — LOS TÍTULOS DE SELECCIÓN.
//
// La misma regla que el título de club, y no es casualidad: **el torneo existe
// con o sin vos**. Tu unión gana o no gana por su cuenta —hay UN campeón por
// torneo y por año, y lo decide una semilla del torneo, no la tuya— y el trofeo
// se te acredita solamente si esa temporada sumaste al menos un cap.
//
// Es la traducción correcta de lo que pasa: el Championship que ganó Argentina
// el año que vos jugabas la Primera B lo ganó Argentina, no vos. Y el que ganó
// con vos adentro, aunque hayas entrado veinte minutos, es tuyo.
//
// ── DE DÓNDE SALE EL CALENDARIO ────────────────────────────────────────────
// De `data/international-calendar.ts`, por la puerta de `data/catalogs.ts`, y de
// ningún otro lado. Veinte competiciones, ciento treinta y una uniones,
// diecinueve trofeos, con las ediciones, los participantes y los reemplazos ya
// resueltos: `competitionsFor(union, temporada)` devuelve lo que esa unión juega
// ese año, sin que este archivo tenga que saber que el Nations Championship le
// tapa la ventana de noviembre a Irlanda pero no a Namibia.
//
// Hubo brevemente una versión con seis torneos escritos a mano acá al lado. Está
// contado en `data/catalogs.ts`; el resumen es que el rugby es catálogo y el
// catálogo tiene un dueño.
//
// ── Por qué el campeón no depende de tu carrera (casi) ─────────────────────
// La semilla sale de `(torneo, temporada)`. Consecuencia buscada: Nueva Zelanda
// gana lo que gana juegue quien juegue, así que el mundo se siente un mundo y no
// un espejo de tu partida — y elegir otra carta de pretemporada no cambia quién
// levantó la copa del otro lado del planeta.
//
// La excepción es el MUNDIAL, y es deliberada: ahí sí tu peso en el plantel
// empuja a tu selección, porque es el único torneo donde el juego promete que
// estar cambia algo. El empujón es chico y proporcional a los caps del año, así
// que un suplente no gana Mundiales solo y un titular indiscutido inclina la
// balanza sin decidirla.
//
// ── LO QUE NO SE OTORGA, y esto SÍ sale del dato ──────────────────────────
// El calendario declara diecinueve trofeos y dos de ellos llevan `requires`: el
// Grand Slam pide ganar el torneo Y los cinco partidos, y la Triple Corona pide
// haberles ganado a las otras tres británicas. Los dos dependen de resultado
// PARTIDO A PARTIDO, y este motor no simula el fixture — sabe quién ganó el
// torneo, no cómo.
//
// Así que no se otorgan, y el filtro es una línea que lee `requires` en vez de
// una lista de ids escrita a mano: el día que entre un trofeo condicional nuevo
// queda excluido solo, sin que nadie se acuerde de venir. Se prefiere no darlos
// a darlos mal.

import type { Title } from '../types/captain.ts';
import type { InternationalCompetition, Trophy } from '../data/catalogs.ts';
import { WORLD_CUP_ID, competitionsFor, worldRanking } from '../data/catalogs.ts';
import { createRng, hashSeed } from './random.ts';

/**
 * Cuánto pesa una unión en el sorteo del campeón.
 *
 * Sale del ranking mundial, que es el dato: el 1 pesa mucho más que el 20 pero
 * el 20 no pesa cero. La potencia de 1,8 es lo que separa "favorito" de
 * "ganador cantado" — con exponente 1 el Championship se lo llevaba cualquiera
 * de los cuatro casi por igual, y con 3 lo ganaba siempre el mismo.
 *
 * Una unión sin ranking pesa el piso: existe, compite y casi nunca gana.
 */
const RANKING_SPAN = 26;
const RANKING_EXPONENT = 1.8;
const RANKING_FLOOR = 0.5;

function unionWeight(code: string): number {
    const rank = worldRanking(code);
    if (rank === null) return RANKING_FLOOR;
    return Math.max(RANKING_FLOOR, RANKING_SPAN - rank) ** RANKING_EXPONENT;
}

/**
 * Cuánto empuja el jugador a su selección EN EL MUNDIAL.
 *
 * Tope en +35% con una temporada de titular indiscutido. Está acotado a
 * propósito: si el empujón pudiera decidir el torneo, el Mundial dejaría de ser
 * un logro del plantel para ser una recompensa por haber llegado.
 */
const HOME_PUSH_PER_CAP = 0.045;
const HOME_PUSH_MAX = 0.35;

export interface InternationalContext {
    /** La unión del jugador. */
    unionCode: string;
    /**
     * LOS TORNEOS QUE EL JUGADOR VA A JUGAR ÉL MISMO, esta temporada.
     *
     * El sorteo NO los resuelve: ya tienen un campeón, y lo decide la llave que
     * el jugador está por destapar. Sin esta puerta, un Mundial jugado y perdido
     * en pantalla podría aparecer igual en la vitrina porque el sorteo dijo que
     * tu unión lo ganó — y esa contradicción se lee en la única línea que el
     * jugador va a releer.
     *
     * Es la regla 3 de `types/tournament.ts`: el campeón que se JUEGA le gana al
     * campeón que se SORTEA. El sorteo sigue existiendo para las otras ciento
     * treinta uniones y para las temporadas en que no te toca; lo que no puede
     * es opinar sobre el torneo que estás jugando.
     */
    playedIds?: readonly string[];
    /**
     * ÍNDICE de temporada del calendario, no el número de temporada de la
     * carrera. El calendario cuenta desde 0 —la temporada 0 es la del catálogo—
     * y El Capitán cuenta desde 1. La conversión vive en `simulate-season.ts`,
     * en un solo lugar y con nombre.
     */
    seasonIndex: number;
    /** Caps de ESTA temporada. Cero = el título no es tuyo aunque tu unión gane. */
    caps: number;
}

/**
 * ¿Este trofeo se puede otorgar con lo que el motor sabe?
 *
 * Lee `requires` en vez de nombrar trofeos: un condicional nuevo queda excluido
 * por su propia declaración y no por una lista que alguien tenga que mantener.
 */
export function isAwardable(trophy: Trophy): boolean {
    return !trophy.requires;
}

/** Los trofeos de un torneo que una unión puede levantar sin simular el fixture. */
export function awardableTrophies(
    competition: InternationalCompetition,
    unionCode: string,
): Trophy[] {
    return competition.trophies.filter(
        (t) => isAwardable(t) && (!t.eligible || t.eligible.includes(unionCode)),
    );
}

/**
 * Quién gana un torneo en una temporada. Determinístico y ajeno a tu carrera,
 * salvo el empujón del Mundial.
 */
export function championOfTournament(
    competition: InternationalCompetition,
    seasonIndex: number,
    ctx: InternationalContext | null = null,
): string | null {
    // La lista viene ordenada del catálogo, pero se vuelve a ordenar acá: si
    // mañana alguien agrega una unión al final, el sorteo no puede depender de
    // en qué posición la escribió.
    const uniones = [...competition.participants].sort();
    if (uniones.length < 2) return null;

    const empuje = competition.id === WORLD_CUP_ID && ctx
        ? 1 + Math.min(HOME_PUSH_MAX, ctx.caps * HOME_PUSH_PER_CAP)
        : 1;

    const rng = createRng(hashSeed(`intl:${competition.id}:${seasonIndex}`));
    return rng.weighted(uniones, (code) => (
        code === ctx?.unionCode ? unionWeight(code) * empuje : unionWeight(code)
    ));
}

/**
 * Los títulos de selección que se lleva el jugador esta temporada.
 *
 * Devuelve las filas de vitrina listas: `Title` con `kind: 'national'` y sin
 * club, porque el trofeo es de la unión.
 *
 * LAS VENTANAS NO REPARTEN NADA. La de julio y la de noviembre son `kind:
 * 'window'` y no tienen trofeo declarado, así que quedan afuera por el dato y no
 * por un `if`: nadie sale campeón de una gira.
 */
export function nationalTitlesFor(ctx: InternationalContext): Title[] {
    // Sin un cap no hay título, y el corte va ANTES del sorteo a propósito: el
    // torneo se resuelve igual —lo gana quien lo gana— pero no hay por qué
    // pagarlo cuando la respuesta no puede cambiar. El sorteo no toca el stream
    // de la carrera, así que saltearlo no desalinea nada.
    if (ctx.caps <= 0) return [];

    const titulos: Title[] = [];
    for (const competition of competitionsFor(ctx.unionCode, ctx.seasonIndex)) {
        // El que jugás vos no se sortea. Ver `playedIds`.
        if (ctx.playedIds?.includes(competition.id)) continue;

        const trofeos = awardableTrophies(competition, ctx.unionCode);
        if (trofeos.length === 0) continue;
        if (championOfTournament(competition, ctx.seasonIndex, ctx) !== ctx.unionCode) continue;

        for (const trofeo of trofeos) {
            titulos.push({
                season: ctx.seasonIndex + 1,
                competitionId: competition.id,
                labelEs: trofeo.name,
                clubId: null,
                kind: 'national',
            });
        }
    }
    return titulos;
}
