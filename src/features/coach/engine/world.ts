// El mundo: qué club juega en qué torneo, y cómo se mueve la pirámide cada año.
//
// El tick anual NO simula los otros 21 torneos partido por partido. Elige quién
// sube y quién baja con un sorteo ponderado por rating, que es lo que hace
// rugby-manager-pro y lo que corresponde: el juego nunca muestra la tabla del
// NEA B, así que simularla sería trabajo para nadie. El torneo del jugador sí se
// juega entero (engine/season.ts) y entra acá como resultado ya decidido.

import { CLUBS, getClub } from '../data/clubs.ts';
import { COMPETITIONS, getCompetition, type CompetitionDef } from '../data/competitions.ts';
import { FORMAT_BASE_YEAR, formatFor, promotionSlotsOf, relegationSlotsOf } from '../data/formats.ts';
import type { BenchCoach } from '../types/coach.ts';
import { initialBench } from './coaches.ts';
import type { Rng } from './random.ts';

export interface WorldState {
    /** Rating de cada club, por id. Deriva temporada a temporada. */
    ratings: Record<string, number>;
    /** En qué torneo juega cada club esta temporada. Solo los que juegan alguno. */
    divisions: Record<string, string>;
    /**
     * Quién dirige cada club. Falta la clave del club del jugador y la de los
     * clubes que esperan su respuesta a una propuesta: esas son las vacantes.
     * Lo mueve `engine/market.ts` al cerrar cada temporada.
     */
    benches: Record<string, BenchCoach>;
    /** Entrenadores sin club, que el mercado considera para las vacantes. */
    freeAgents: BenchCoach[];
}

/** Qué le pasó a cada club que se movió de división en el tick. */
export type Moved = Record<string, 'ascenso' | 'descenso'>;

/** El escalón (2..5) del torneo donde juega un club, o 5 si no juega ninguno. */
export function levelOf(world: Pick<WorldState, 'divisions'>, clubId: string): number {
    const comp = getCompetition(world.divisions[clubId] ?? '');
    return comp?.level ?? 5;
}

/** Quién sube y quién baja en un torneo, al cerrar la temporada. */
export interface TierMovement {
    promoted: string[];
    relegated: string[];
}

/**
 * ¿Puede este club jugar este torneo? Un regional se nutre de todas las uniones
 * de su región; un torneo de unión, solo de la suya.
 */
function eligible(clubId: string, comp: CompetitionDef): boolean {
    const club = getClub(clubId);
    if (!club) return false;
    if (comp.members.unions?.includes(club.unionId)) return true;
    if (club.regionId && comp.members.regions?.includes(club.regionId)) return true;
    return false;
}

/**
 * Las ramas de la pirámide, de arriba hacia abajo. Una rama arranca en un torneo
 * sin `promotesTo` (el techo) y baja por `relegatesTo`. Se deriva del grafo y no
 * se declara a mano: agregar un escalón es tocar el catálogo y nada más.
 */
export function branches(): CompetitionDef[][] {
    const tops = COMPETITIONS.filter((c) => c.promotesTo === null)
        .slice()
        .sort((a, b) => a.id.localeCompare(b.id));
    return tops.map((top) => {
        const chain: CompetitionDef[] = [top];
        let cur: CompetitionDef | null = top;
        while (cur?.relegatesTo) {
            const next: CompetitionDef | null = getCompetition(cur.relegatesTo);
            if (!next || chain.includes(next)) break; // un ciclo en el catálogo no cuelga el juego
            chain.push(next);
            cur = next;
        }
        return chain;
    });
}

/**
 * El reparto inicial: cada club en la división donde juega en 2026, según el
 * canon (`arSystem2026.ts`). Es determinista y no usa RNG.
 *
 * Antes el reparto era "los más fuertes de cada región, escalón por escalón", y
 * eso ponía a los clubes en divisiones que no son las suyas. Ahora la división es
 * un DATO: nadie juega una categoría en la que no participa. Los clubes de una
 * división que el juego no puede jugar (menos de cuatro clubes conocidos) existen
 * en el catálogo y no entran a la pirámide.
 */
export function seedWorld(year: number = FORMAT_BASE_YEAR): WorldState {
    const ratings: Record<string, number> = {};
    const divisions: Record<string, string> = {};
    const benches: Record<string, BenchCoach> = {};
    for (const club of CLUBS) {
        ratings[club.id] = club.rating;
        const comp = getCompetition(club.homeCompetitionId);
        if (!comp) continue;
        divisions[club.id] = comp.id;
        benches[club.id] = initialBench(club.id, comp.level, year);
    }
    return { ratings, divisions, benches, freeAgents: [] };
}

/** Los clubes de un torneo, ordenados por fuerza (desc) con el id de desempate. */
export function clubsIn(world: Pick<WorldState, 'ratings' | 'divisions'>, competitionId: string): string[] {
    return Object.keys(world.divisions)
        .filter((id) => world.divisions[id] === competitionId)
        .sort((a, b) => world.ratings[b] - world.ratings[a] || a.localeCompare(b));
}

/** Los clubes que se pueden dirigir: los que juegan alguno de los 22 torneos. */
export function selectableClubs(world: Pick<WorldState, 'divisions'>): string[] {
    return Object.keys(world.divisions).sort((a, b) => a.localeCompare(b));
}

/**
 * El tick anual. Mueve la pirámide entera y devuelve un mundo nuevo — no muta el
 * que recibe, porque el estado del juego es inmutable de punta a punta.
 *
 * `decided` trae los movimientos que ya se jugaron de verdad (el torneo del
 * jugador). Para el resto, el ascenso se sortea entre los mejores del torneo de
 * abajo y el descenso entre los peores del de arriba: los favoritos ganan más
 * seguido, pero el sorteo deja lugar a la sorpresa, que es lo que pasa.
 */
export function tickWorld(
    world: WorldState,
    rng: Rng,
    decided: Record<string, TierMovement>,
    year: number = FORMAT_BASE_YEAR,
): { world: WorldState; moved: Moved } {
    const divisions = { ...world.divisions };
    const ratings = { ...world.ratings };
    const moved: Moved = {};

    for (const chain of branches()) {
        // De abajo hacia arriba: el que sube deja la plaza que ocupa el que baja.
        for (let i = chain.length - 1; i >= 1; i--) {
            const lower = chain[i];
            const upper = chain[i - 1];
            // Las plazas salen del FORMATO de ese año, no de una cuenta fija: si un
            // reglamento cambia cuántos suben, la pirámide lo respeta.
            const slots = Math.min(
                promotionSlotsOf(formatFor(lower.id, year)),
                relegationSlotsOf(formatFor(upper.id, year)),
            );
            if (slots <= 0) continue;

            const lowerClubs = clubsIn(world, lower.id);
            const upperClubs = clubsIn(world, upper.id);
            if (lowerClubs.length < slots || upperClubs.length < slots) continue;

            const upPicked =
                decided[lower.id]?.promoted?.slice(0, slots)
                ?? pickWeighted(rng, lowerClubs.slice(0, Math.max(slots + 2, 4)), (id) => ratings[id], slots);
            const downPicked =
                decided[upper.id]?.relegated?.slice(0, slots)
                ?? pickWeighted(rng, upperClubs.slice(-Math.max(slots + 2, 4)), (id) => 60 - ratings[id], slots);

            // Suben tantos como bajan, SIEMPRE. Si la temporada jugada definió una
            // cantidad distinta de la del tick, se recorta la mayor: una división no
            // puede terminar el año con un club de más ("15° de 14").
            const n = Math.min(upPicked.length, downPicked.length);
            const up = upPicked.slice(0, n);
            const down = downPicked.slice(0, n);

            for (const id of up) {
                divisions[id] = upper.id;
                moved[id] = 'ascenso';
                // Subir de categoría te hace un poco mejor: mejores rivales, más
                // exigencia. Es chico a propósito — al rating lo mueve el club,
                // no el torneo.
                ratings[id] = clamp(ratings[id] + rng.float(0.6, 1.8), 4, 48);
            }
            for (const id of down) {
                divisions[id] = lower.id;
                moved[id] = 'descenso';
                ratings[id] = clamp(ratings[id] - rng.float(0.6, 1.8), 4, 48);
            }
        }
    }

    // Deriva: cada club se mueve un poco solo. Sin esto la pirámide queda
    // congelada y a la quinta temporada suben siempre los mismos.
    for (const id of Object.keys(ratings)) {
        ratings[id] = clamp(ratings[id] + rng.normal(0, 0.7), 4, 48);
    }

    return { world: { ...world, ratings, divisions }, moved };
}

/**
 * Repara un mundo guardado contra el catálogo de HOY. Sin RNG: es determinista
 * y se puede correr las veces que haga falta sin que cambie nada.
 *
 * Existe para que un cambio de catálogo no borre la partida. Cuando entra un
 * club nuevo, se corrige la unión de otro o desaparece un torneo, el mundo
 * guardado deja de cerrar: hay ids que ya no existen, torneos con plazas de más
 * o de menos, clubes en un torneo para el que ya no son elegibles. Acá se
 * descarta lo que no existe y se rellena lo que falta con la misma regla del
 * reparto inicial (fuerza desc, id de desempate). Lo que ya estaba bien queda
 * como estaba: un club que subió en la partida sigue arriba.
 *
 * `protect` es el club del jugador: nunca se cae de la pirámide. Si su torneo
 * desapareció, va al escalón más bajo de su rama que lo acepte, desplazando al
 * más flojo. Perder la categoría en una migración es mejor que perder la
 * carrera.
 */
export function repairWorld(
    world: Pick<WorldState, 'ratings' | 'divisions'> & Partial<Pick<WorldState, 'benches' | 'freeAgents'>>,
    protect: string | null,
    vacant: readonly string[] = [],
    year: number = FORMAT_BASE_YEAR,
): WorldState {
    const ratings: Record<string, number> = {};
    for (const club of CLUBS) {
        // El rating guardado manda si es un número: el catálogo trae clubes por
        // debajo del piso del tick (hay ratings de 3), así que acá no se acota.
        const saved = world.ratings[club.id];
        ratings[club.id] = Number.isFinite(saved) ? saved : club.rating;
    }

    const divisions: Record<string, string> = {};
    for (const id of Object.keys(world.divisions).sort()) {
        const comp = getCompetition(world.divisions[id]);
        if (!comp || !(id in ratings) || !eligible(id, comp)) continue;
        divisions[id] = comp.id;
    }

    const byStrength = (a: string, b: string) => ratings[b] - ratings[a] || a.localeCompare(b);
    const members = (compId: string) =>
        Object.keys(divisions)
            .filter((id) => divisions[id] === compId)
            .sort(byStrength);

    // Primero se vacían los torneos con plazas de más (el más flojo se va, nunca
    // el club del jugador), después se rellenan los que quedaron cortos. En ese
    // orden, para que el que se cayó de un torneo pueda entrar en otro.
    const allComps = [...COMPETITIONS].sort((a, b) => a.id.localeCompare(b.id));
    for (const comp of allComps) {
        // El club del jugador ocupa una plaza aunque no se lo pueda sacar: si está
        // adentro, a los demás les quedan `teams - 1`. Sin descontarlo, una
        // división guardada con uno de más ("15° de 14") seguía con uno de más.
        const all = members(comp.id);
        const keep = comp.teams - (protect !== null && all.includes(protect) ? 1 : 0);
        const extra = all.filter((id) => id !== protect).slice(keep);
        for (const id of extra) delete divisions[id];
    }
    for (const comp of allComps) {
        const missing = comp.teams - members(comp.id).length;
        if (missing <= 0) continue;
        // Primero los clubes cuya división en el canon ES esta: un hueco se llena
        // con quien juega ahí de verdad, y solo si falta, con uno de su región.
        const home = (id: string) => (getClub(id)?.homeCompetitionId === comp.id ? 0 : 1);
        const pool = CLUBS.map((c) => c.id)
            .filter((id) => !(id in divisions) && eligible(id, comp))
            .sort((a, b) => home(a) - home(b) || byStrength(a, b));
        for (const id of pool.slice(0, missing)) divisions[id] = comp.id;
    }

    if (protect && protect in ratings && !(protect in divisions)) {
        const home = allComps
            .filter((comp) => eligible(protect, comp))
            .sort((a, b) => b.level - a.level || a.id.localeCompare(b.id))[0];
        if (home) {
            const others = members(home.id).filter((id) => id !== protect);
            const weakest = others[others.length - 1];
            if (weakest && members(home.id).length >= home.teams) delete divisions[weakest];
            divisions[protect] = home.id;
        }
    }

    // Los bancos: el que estaba sigue; un club sin entrenador recibe uno, salvo el
    // del jugador y los que esperan su respuesta a una propuesta (`vacant`). Un
    // guardado anterior al mercado no tiene bancos: se reparten como al empezar.
    const savedBenches = isRecord(world.benches) ? world.benches : {};
    const benches: Record<string, BenchCoach> = {};
    for (const id of Object.keys(divisions).sort()) {
        if (id === protect || vacant.includes(id)) continue;
        const saved = savedBenches[id];
        benches[id] = validBench(saved) ? saved : initialBench(id, getCompetition(divisions[id])?.level ?? 5, year);
    }
    const freeAgents = Array.isArray(world.freeAgents) ? world.freeAgents.filter(validBench) : [];

    return { ratings, divisions, benches, freeAgents };
}

function isRecord(v: unknown): v is Record<string, BenchCoach> {
    return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function validBench(b: unknown): b is BenchCoach {
    const r = b as BenchCoach | null;
    return (
        typeof r === 'object'
        && r !== null
        && typeof r.name === 'string'
        && Number.isFinite(r.rep)
        && Number.isFinite(r.since)
    );
}

/** Elige `n` sin repetir, ponderado. Los candidatos entran ya ordenados. */
function pickWeighted(
    rng: Rng,
    candidates: readonly string[],
    weightFn: (id: string) => number,
    n: number,
): string[] {
    const pool = [...candidates];
    const out: string[] = [];
    while (out.length < n && pool.length > 0) {
        const chosen = rng.weighted(pool, (id) => Math.max(0.5, weightFn(id)));
        out.push(chosen);
        pool.splice(pool.indexOf(chosen), 1);
    }
    return out;
}

function clamp(v: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, v));
}
