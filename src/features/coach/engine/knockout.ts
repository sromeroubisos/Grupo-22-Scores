// El Torneo del Interior y el Nacional de Clubes: el techo de una carrera.
//
// El TDI es la copa nacional del interior y se juega con los clasificados de los
// siete regionales A. El Nacional es una final única entre el campeón del TDI y
// el de la máxima división de URBA — y el de URBA se pide por su ROL, no por su
// nombre: si mañana el Top 14 pasa a llamarse otra cosa o a tener otro tamaño,
// esto sigue siendo correcto.
//
// De los seis regionales que el jugador no dirige no hay tabla, porque no se
// simulan (ver engine/world.ts). Sus clasificados salen de un sorteo ponderado
// por rating: los grandes clasifican casi siempre y de vez en cuando entra uno
// que no se esperaba, que es lo que pasa.

import { COMPETITIONS, NACIONAL_ID, TDI_A_ID, TDI_TEAMS, URBA_TOP_ID } from '../data/competitions.ts';
import type { KnockoutRun, KnockoutStage, KnockoutTie, SquadPlayer } from '../types/coach.ts';
import { NEUTRAL_MODS, rollMatch, type MatchSide, type SidelineMods } from './match.ts';
import type { Rng } from './random.ts';
import { clubsIn, type WorldState } from './world.ts';

export interface CupInput {
    world: WorldState;
    myClubId: string;
    myCompetitionId: string;
    /** Posición final del club del jugador en su torneo. */
    myPosition: number;
    myRating: number;
    myMods: SidelineMods;
    mySquad: readonly SquadPlayer[];
    /** Campeón del torneo del jugador, para el Nacional si dirige en URBA. */
    myLeagueChampionId: string;
}

export interface CupOutput {
    ties: KnockoutTie[];
    tdiChampionId: string;
    nacionalChampionId: string;
    /** Hasta dónde llegó el club del jugador en el TDI. null = no clasificó. */
    myTdiRun: KnockoutRun;
    /** Si el club del jugador ganó el Nacional de Clubes. */
    myNacional: boolean;
}

/** ¿El club del jugador se metió en el TDI con esa posición? */
export function qualifiesForTdi(competitionId: string, position: number): boolean {
    const comp = COMPETITIONS.find((c) => c.id === competitionId);
    return !!comp && comp.tdiSlots > 0 && position > 0 && position <= comp.tdiSlots;
}

/**
 * Los dieciséis del TDI. Del torneo del jugador salen los que salieron de
 * verdad; de los otros, un sorteo ponderado entre los candidatos de arriba.
 */
function tdiField(rng: Rng, input: CupInput): string[] {
    const field: string[] = [];

    const sources = COMPETITIONS.filter((c) => c.tdiSlots > 0)
        .slice()
        .sort((a, b) => a.id.localeCompare(b.id));

    for (const comp of sources) {
        const pool = clubsIn(input.world, comp.id);
        if (comp.id === input.myCompetitionId) {
            // Los del torneo del jugador: el suyo entra si le dio la posición, y
            // los lugares restantes los ocupan los mejores del torneo — que es la
            // aproximación honesta sin guardar la tabla del año pasado.
            const mine = qualifiesForTdi(comp.id, input.myPosition) ? [input.myClubId] : [];
            const others = pool.filter((id) => id !== input.myClubId);
            field.push(...mine, ...others.slice(0, comp.tdiSlots - mine.length));
            continue;
        }
        const bag = pool.slice(0, comp.tdiSlots + 3);
        const chosen: string[] = [];
        while (chosen.length < comp.tdiSlots && bag.length > 0) {
            const pick = rng.weighted(bag, (id) => Math.max(1, input.world.ratings[id] ?? 10));
            chosen.push(pick);
            bag.splice(bag.indexOf(pick), 1);
        }
        field.push(...chosen);
    }

    // Si algún regional quedó corto, se completa con los mejores que falten: el
    // torneo no puede salir a la cancha con quince.
    if (field.length < TDI_TEAMS) {
        const rest = Object.keys(input.world.divisions)
            .filter((id) => !field.includes(id))
            .sort((a, b) => input.world.ratings[b] - input.world.ratings[a] || a.localeCompare(b));
        field.push(...rest.slice(0, TDI_TEAMS - field.length));
    }

    return field.slice(0, TDI_TEAMS);
}

const STAGES: readonly KnockoutStage[] = ['octavos', 'cuartos', 'semis', 'final'];

/** Corre el TDI y el Nacional. Devuelve la llave entera para poder mostrarla. */
export function runCups(rng: Rng, input: CupInput): CupOutput {
    const ties: KnockoutTie[] = [];

    const sideOf = (id: string): MatchSide =>
        id === input.myClubId
            ? { clubId: id, rating: input.myRating, mods: input.myMods, squad: input.mySquad }
            : { clubId: id, rating: input.world.ratings[id] ?? 20, mods: NEUTRAL_MODS };

    const play = (
        competitionId: string,
        stage: KnockoutStage,
        homeId: string,
        awayId: string,
        neutral: boolean,
    ): string => {
        const roll = rollMatch(rng, sideOf(homeId), sideOf(awayId), {
            neutral,
            trackHome: homeId === input.myClubId,
            trackAway: awayId === input.myClubId,
        });
        ties.push({ competitionId, stage, homeId, awayId, homePf: roll.homePf, awayPf: roll.awayPf });
        // En eliminación no hay empate: pasa el mejor sembrado, que es el local.
        return roll.awayPf > roll.homePf ? awayId : homeId;
    };

    // Siembra: el mejor contra el peor. La llave se arma una vez y no se
    // reordena entre rondas — un cuadro que se re-siembra no es un cuadro.
    const seeded = tdiField(rng, input).sort(
        (a, b) => (input.world.ratings[b] ?? 0) - (input.world.ratings[a] ?? 0) || a.localeCompare(b),
    );
    let alive: string[] = [];
    for (let i = 0; i < seeded.length / 2; i++) alive.push(seeded[i], seeded[seeded.length - 1 - i]);

    let myTdiRun: KnockoutRun = alive.includes(input.myClubId) ? 'octavos' : null;

    for (const stage of STAGES) {
        if (alive.length < 2) break;
        const next: string[] = [];
        // Desde semifinales se juega en cancha neutral.
        const neutral = stage === 'semis' || stage === 'final';
        for (let i = 0; i + 1 < alive.length; i += 2) {
            next.push(play(TDI_A_ID, stage, alive[i], alive[i + 1], neutral));
        }
        alive = next;
        if (alive.includes(input.myClubId)) {
            const idx = STAGES.indexOf(stage);
            myTdiRun = stage === 'final' ? 'campeon' : STAGES[idx + 1];
        }
    }

    const tdiChampionId = alive[0] ?? input.myClubId;

    // El Nacional: el campeón del TDI contra el de la máxima de URBA. Si el
    // jugador dirige en URBA, su campeón es el que salió de verdad.
    const urbaPool = clubsIn(input.world, URBA_TOP_ID);
    const urbaChampionId =
        input.myCompetitionId === URBA_TOP_ID
            ? input.myLeagueChampionId
            : (rng.weighted(urbaPool.slice(0, 6), (id) => input.world.ratings[id] ?? 20) ?? urbaPool[0]);

    const nacionalChampionId = play(NACIONAL_ID, 'final', urbaChampionId, tdiChampionId, true);

    return {
        ties,
        tdiChampionId,
        nacionalChampionId,
        myTdiRun,
        myNacional: nacionalChampionId === input.myClubId,
    };
}
