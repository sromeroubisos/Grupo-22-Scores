// El bucle de la carrera: crear, decidir, jugar la temporada, cerrar el año.
//
// Cada función recibe un estado y devuelve otro. El RNG se snapshotea en
// `rngState` después de cada paso, así que recargar la página a mitad de una
// temporada retoma exactamente donde estaba: la misma semilla y la misma
// secuencia de decisiones producen la misma carrera, hoy y dentro de seis meses.
//
// Los tres sistemas que se cruzan al cerrar el año están conectados acá:
//   · el formato de la división (`data/formats.ts`) decide campeón, ascensos,
//     reducido y descensos;
//   · el resultado mueve la presión y la reputación (`pressure.ts`);
//   · la reputación y los resultados mueven el mercado (`market.ts`): los clubes
//     que se quedan sin entrenador llaman —o no— al jugador.

import { getClub } from '../data/clubs.ts';
import { competitionName, getCompetition } from '../data/competitions.ts';
import { getEvent } from '../data/events/index.ts';
import { formatFor, type FormatEdition } from '../data/formats.ts';
import { COACH_FIRST_NAMES, SURNAMES } from '../data/names.ts';
import { getProfile, tuneAttrs } from '../data/profiles.ts';
import type {
    CoachAttributes,
    CoachState,
    HalfAdjustId,
    InSeason,
    KeyPlanId,
    KnockoutStage,
    KnockoutTie,
    MarketState,
    MatchResult,
    PendingPlayoff,
    PlayoffApproachId,
    SeasonEntry,
    SeasonMods,
    TableRow,
    TrainingPlan,
} from '../types/coach.ts';
import { EMPTY_ACADEMY, closeAcademy, finishScouting, openScouting, promotionsIn, refillAcademy, seedAcademy } from './academy.ts';
import { applyEffect } from './apply-decision.ts';
import { boardReview } from './board.ts';
import { firstStage, isNeutral, myPair, nextStage, playBracket, playStage, playTie, tagTies } from './bracket.ts';
import { initialFinances } from './economy.ts';
import { EMPTY_FINANCE, activeCuts, budgetOf, netDebt, payLoan, settleDebt, CUT_MANTENIMIENTO_ESTRUCTURA } from './finance.ts';
import {
    TRAMOS,
    addStats,
    daySide,
    departures,
    keyFirstHalf,
    keySecondHalf,
    myFixtures,
    ownStarts,
    pickKeyMatch,
    runToKeyMatch,
    seasonFixture,
    seasonStars,
    sidelineOf,
    startInSeason,
    todayOf,
    totalRounds,
    tramoRange,
} from './tramos.ts';
import { applyWeek, planOf, validTraining, weekEffect } from './training.ts';
import { advanceProject, evaluateObjectives, factsFrom, nextProject, seasonObjectives } from './objectives.ts';
import { CARDS_PER_TRAMO, pickEvent } from './event-selector.ts';
import { decisionImpact } from './impact.ts';
import { qualifiesForTdi, runCups } from './knockout.ts';
import { EMPTY_MARKET, expireOffers, fillVacancy, marketTick } from './market.ts';
import { NEUTRAL_MODS, type MatchSide } from './match.ts';
import { approachMods } from './playoff.ts';
import { FIRING_PRESSURE, INITIAL_PRESSURE, objectiveFor, pressureFloor, reviewSeason } from './pressure.ts';
import { createRng, rngFromState, type Rng } from './random.ts';
import { upgradeEffect } from './upgrades.ts';
import { movementOf, resolvePostseason, sideFor, type PostseasonProgress } from './season.ts';
import { ageSquad, emptyStats, generateSquad, teamRating } from './squad.ts';
import {
    EMPTY_TRANSFERS,
    SQUAD_MAX,
    closeWindow,
    fillFromAcademy,
    inSeasonRef,
    loanGrowth,
    openWindow,
    type FormRef,
} from './transfers.ts';
import { clubsIn, levelOf, seedWorld, tickWorld, type TierMovement, type WorldState } from './world.ts';

/** La primera temporada del juego. */
export const FIRST_YEAR = 2026;

const NO_MODS: SeasonMods = { rating: 0, injuryRisk: 0, bancoCorto: false };

const NEUTRAL_ATTRS = { conduccion: 5, arenga: 5, formacion: 5, gestion: 5, disciplina: 5 };

/** El mundo sin el banco de un club: ese club lo dirige el jugador. */
function withoutBench(world: WorldState, clubId: string): WorldState {
    if (!(clubId in world.benches)) return world;
    const benches = { ...world.benches };
    delete benches[clubId];
    return { ...world, benches };
}

/**
 * Arranca una carrera. `seed` viene de afuera: el motor no la inventa.
 *
 * `attrs` es el ajuste fino del perfil. Si no es legal (`tuneAttrs`), se usa el
 * perfil tal cual: un ajuste roto no arranca una carrera con un entrenador que
 * el juego no permite.
 */
export function createCareer(
    seed: number,
    clubId: string,
    profileId: string,
    attrs?: CoachAttributes,
): CoachState {
    const rng = createRng(seed);
    const world = withoutBench(seedWorld(FIRST_YEAR), clubId);
    const club = getClub(clubId);
    const competitionId = world.divisions[clubId];
    if (!club || !competitionId) {
        throw new Error(`El club ${clubId} no juega ninguno de los torneos del juego`);
    }

    const squad = generateSquad(rng, world.ratings[clubId], clubId, competitionId);
    const seedRank = clubsIn(world, competitionId).indexOf(clubId) + 1;

    const created = withSeasonPlan({
        seed,
        rngState: rng.state,
        season: 1,
        year: FIRST_YEAR,
        phase: 'preseason',
        coach: {
            name: `${rng.pick(COACH_FIRST_NAMES)} ${rng.pick(SURNAMES)}`,
            age: rng.int(34, 48),
            attrs: (attrs && tuneAttrs(profileId, attrs)) ?? getProfile(profileId)?.attrs ?? NEUTRAL_ATTRS,
            reputation: 25,
        },
        clubId,
        competitionId,
        club: { cohesion: 50, finances: initialFinances(club), upgrades: {} },
        squad,
        world,
        pressure: INITIAL_PRESSURE,
        objective: objectiveFor(competitionId, Math.max(1, seedRank), FIRST_YEAR),
        decisionsLeft: CARDS_PER_TRAMO[0],
        seenEvents: {},
        pendingEventId: null,
        pendingReveal: null,
        seasonMods: { ...NO_MODS },
        playoff: null,
        lastTable: [],
        lastMatches: [],
        lastKnockout: [],
        lastLeagueMovement: null,
        seasons: [],
        decisionLog: [],
        flags: {},
        market: { ...EMPTY_MARKET, season: 1 },
        finance: { ...EMPTY_FINANCE },
        objectives: [],
        project: null,
        history: [{ clubId, fromSeason: 1, toSeason: null }],
        inSeason: null,
        trainingDefault: null,
        transfers: { ...EMPTY_TRANSFERS, ledger: { season: 1, compensaciones: 0, indemnizaciones: 0 } },
        // El M19 sale de un RNG derivado: no corre la carrera.
        academy: seedAcademy({ seed, season: 1, clubId, world }),
    });
    // La primera pretemporada ya tiene mercado (sin fechas jugadas, el interés
    // sale del nivel, la edad y el techo) y jornada de captación.
    return openScouting(openWindow(created, 'pretemporada', null));
}

/**
 * Los objetivos de la temporada y el proyecto de tres años. Se arman en cada
 * pretemporada, con un RNG derivado: no corren la carrera.
 */
export function withSeasonPlan(state: CoachState): CoachState {
    return { ...state, objectives: seasonObjectives(state), project: nextProject(state) };
}

/**
 * Cierra la pretemporada, arranca la fase regular y saca las tarjetas del
 * primer tramo. Las propuestas que el jugador no respondió se caen acá: arrancar
 * la temporada es decir que te quedás, y esos clubes contratan a otro.
 *
 * EL TRAMO, EN ORDEN: las tarjetas del tramo (1 o 2, `CARDS_PER_TRAMO`), la
 * semana de entrenamiento (`submitTraining`), las fechas hasta el partido clave,
 * el partido clave en dos tiempos (`playKeyFirstHalf`, `playKeySecondHalf`), el
 * resto de las fechas, y el resumen del tramo (`nextTramo` sigue). "Simular el
 * tramo" (`simulateTramo`) hace la semana y el partido clave con el plan fijo y
 * juega sin más interacción.
 */
export function beginDecisions(input: CoachState): CoachState {
    // La ventana de la pretemporada se cierra: lo que quedó sin contestar se
    // resuelve como en un club de verdad (`closeWindow`). No consume el RNG.
    // La jornada de captación también: los puntos sin usar se pierden.
    const state = finishScouting(closeWindow(input));
    const rng = rngFromState(state.rngState);
    const expired = state.market.offers.length > 0 ? expireOffers(state.world, state.market, state.year) : null;
    const base: CoachState = {
        ...state,
        world: expired?.world ?? state.world,
        market: expired?.market ?? state.market,
    };
    const inSeason = startInSeason(base, rng, CARDS_PER_TRAMO);
    return drawNext({ ...base, inSeason, decisionsLeft: inSeason.cards[0] }, rng);
}

/**
 * Vuelve a sacar una tarjeta SIN descontar la decisión. Es para la carga de una
 * partida guardada cuya tarjeta pendiente ya no existe en el contenido: el
 * jugador no la respondió, así que no se le cobra; se le da otra.
 */
export function redrawPending(state: CoachState): CoachState {
    const rng = rngFromState(state.rngState);
    return drawNext({ ...state, pendingEventId: null, pendingReveal: null }, rng);
}

/** Saca la próxima tarjeta del tramo, o pasa a la semana de entrenamiento si ya no quedan. */
function drawNext(state: CoachState, rng: Rng): CoachState {
    if (state.decisionsLeft <= 0) return toTraining(state, rng);
    const event = pickEvent(rng, state);
    // Si el pool se agotó —muchas temporadas seguidas y todo en cooldown— se
    // sigue con el tramo. Nunca se cuelga la partida esperando una tarjeta.
    if (!event) return toTraining(state, rng);
    return {
        ...state,
        phase: 'decision',
        pendingEventId: event.id,
        pendingReveal: null,
        rngState: rng.state,
    };
}

/**
 * Las tarjetas del tramo se terminaron: a entrenar. Una partida del esquema 6
 * guardada a mitad de las cinco tarjetas de la pretemporada llega acá sin
 * temporada en curso: se arranca con cero tarjetas por tramo, porque las cinco
 * del año ya salieron.
 */
function toTraining(state: CoachState, rng: Rng): CoachState {
    const inSeason = state.inSeason ?? startInSeason(state, rng, [0, 0, 0]);
    return {
        ...state,
        phase: 'training',
        decisionsLeft: 0,
        pendingEventId: null,
        pendingReveal: null,
        inSeason,
        rngState: rng.state,
    };
}

/**
 * Resuelve una opción: sortea el desenlace, lo aplica y prepara el revelado.
 * Los chips salen de RESTAR estados, así que dicen lo que de verdad pasó.
 */
export function chooseOption(state: CoachState, optionId: string): CoachState {
    const event = state.pendingEventId ? getEvent(state.pendingEventId) : null;
    const option = event?.options.find((o) => o.id === optionId);
    if (!event || !option) return state;

    const rng = rngFromState(state.rngState);
    const outcome = rng.weighted(option.outcomes, (o) => o.weight);
    const outcomeIndex = option.outcomes.indexOf(outcome);

    const applied = applyEffect(rng, state, outcome.effect);
    // Si la tarjeta se llevó a alguien a mitad de año, lo que sumó queda en la
    // planilla del club: los tries de la tabla siguen siendo los de sus jugadores.
    const gone = state.inSeason ? departures(state.squad, applied.squad) : [];
    const after: CoachState =
        gone.length > 0 && applied.inSeason
            ? { ...applied, inSeason: { ...applied.inSeason, gone: [...applied.inSeason.gone, ...gone] } }
            : applied;

    return {
        ...after,
        phase: 'reveal',
        rngState: rng.state,
        seenEvents: { ...state.seenEvents, [event.id]: state.season },
        pendingReveal: {
            eventId: event.id,
            optionId,
            outcomeIndex,
            title: event.title,
            text: outcome.resultText,
            chips: decisionImpact(state, after),
        },
        decisionLog: [
            ...state.decisionLog,
            { season: state.season, eventId: event.id, optionId, outcomeIndex, text: outcome.resultText },
        ],
    };
}

/** El jugador leyó el desenlace: se descuenta la decisión y sigue el año. */
export function acknowledgeReveal(state: CoachState): CoachState {
    if (state.phase !== 'reveal') return state;
    const rng = rngFromState(state.rngState);
    return drawNext(
        { ...state, pendingEventId: null, pendingReveal: null, decisionsLeft: state.decisionsLeft - 1 },
        rng,
    );
}

/**
 * El club del jugador como lado de un partido, con lo que le pone el entrenador:
 * la alineación de HOY (sin los lesionados), con su cansancio y su ánimo. Es la
 * que juega el playoff.
 */
export function mySideOf(state: CoachState): MatchSide {
    return daySide(state, todayOf(state), null);
}

/* ------------------------------------------------------------------ */
/* El tramo                                                            */
/* ------------------------------------------------------------------ */

/**
 * Cierra la semana de entrenamiento y juega las fechas hasta el partido clave.
 * `fix` deja el plan fijo para los próximos tramos y para "Simular el tramo".
 * Un plan ilegal no hace nada: devuelve el MISMO estado.
 */
export function submitTraining(state: CoachState, plan: TrainingPlan, fix = false): CoachState {
    const ins = state.inSeason;
    if (state.phase !== 'training' || !ins || !validTraining(plan)) return state;
    const rng = rngFromState(state.rngState);
    const fixture = seasonFixture(state);
    const { to } = tramoRange(totalRounds(fixture), ins.tramo);
    const key = pickKeyMatch(state, fixture, ins.round + 1, to);
    const effect = weekEffect(plan, key?.weakness ?? null);
    const week = {
        plan: { days: plan.days.map((d) => ({ ...d })), lineup: plan.lineup },
        bonus: effect.bonus,
        keyBonus: effect.keyBonus,
        injuryRisk: effect.injuryRisk,
        fatigueRelief: effect.fatigueRelief,
    };
    const trained: CoachState = {
        ...state,
        squad: applyWeek(state.squad, effect, state.coach.attrs.formacion),
        trainingDefault: fix ? week.plan : state.trainingDefault,
    };
    const run = runToKeyMatch(trained, rng, week, key);
    return { ...run.state, phase: run.pendingKey ? 'keymatch' : 'tramo', rngState: rng.state };
}

/** Deja fija (o suelta, con `null`) la semana con la que se simula. No juega nada. */
export function setTrainingDefault(state: CoachState, plan: TrainingPlan | null): CoachState {
    if (plan !== null && !validTraining(plan)) return state;
    return { ...state, trainingDefault: plan ? { days: plan.days.map((d) => ({ ...d })), lineup: plan.lineup } : null };
}

/** El primer tiempo del partido clave con el plan elegido. */
export function playKeyFirstHalf(state: CoachState, plan: KeyPlanId): CoachState {
    const key = state.inSeason?.key;
    if (state.phase !== 'keymatch' || !key || key.firstHalf) return state;
    const rng = rngFromState(state.rngState);
    return { ...keyFirstHalf(state, rng, plan), rngState: rng.state };
}

/** El segundo tiempo con el ajuste del entretiempo, y el resto de las fechas del tramo. */
export function playKeySecondHalf(state: CoachState, adjust: HalfAdjustId): CoachState {
    const key = state.inSeason?.key;
    if (state.phase !== 'keymatch' || !key?.firstHalf) return state;
    const rng = rngFromState(state.rngState);
    return { ...keySecondHalf(state, rng, adjust), phase: 'tramo', rngState: rng.state };
}

/**
 * "Simular el tramo": la semana con el plan fijo (o el del motor), el partido
 * clave con el plan de siempre y sin tocar nada en el entretiempo, y las fechas
 * que falten. Frena en el resumen del tramo.
 */
export function simulateTramo(state: CoachState): CoachState {
    let s = state;
    for (let guard = 0; guard < 4; guard++) {
        if (s.phase === 'training') s = submitTraining(s, planOf(s.trainingDefault));
        else if (s.phase === 'keymatch' && !s.inSeason?.key?.firstHalf) s = playKeyFirstHalf(s, 'equilibrado');
        else if (s.phase === 'keymatch') s = playKeySecondHalf(s, 'mantener');
        else break;
    }
    return s;
}

/**
 * Leído el resumen del tramo: las tarjetas del siguiente, o —si era el último—
 * la postemporada (el playoff que juega el entrenador, o el cierre del año).
 */
export function nextTramo(state: CoachState): CoachState {
    const ins = state.inSeason;
    if (state.phase !== 'tramo' || !ins) return state;
    const rng = rngFromState(state.rngState);
    if (ins.tramo === 0 && TRAMOS > 1) {
        // LA VENTANA CORTA, entre el tramo 1 y el 2 (etapa 3). Se abre con las
        // estadísticas del tramo 1 y, al cerrarla (`closeMarketWindow`), salen
        // las tarjetas del tramo 2. Abrirla no consume el RNG de la carrera.
        const tramo = 1;
        const next: CoachState = {
            ...state,
            phase: 'market',
            inSeason: { ...ins, tramo, week: null, key: null },
            decisionsLeft: ins.cards[tramo] ?? 0,
        };
        return openWindow(next, 'corta', inSeasonRef(state));
    }
    if (ins.tramo < TRAMOS - 1) {
        const tramo = ins.tramo + 1;
        return drawNext(
            { ...state, inSeason: { ...ins, tramo, week: null, key: null }, decisionsLeft: ins.cards[tramo] ?? 0 },
            rng,
        );
    }
    return endRegularSeason(state, rng);
}

/**
 * Cierra la ventana corta (lo que quedó sin contestar se resuelve solo) y saca
 * las tarjetas del tramo 2.
 */
export function closeMarketWindow(state: CoachState): CoachState {
    if (state.phase !== 'market') return state;
    const closed = closeWindow(state);
    const rng = rngFromState(closed.rngState);
    return drawNext(closed, rng);
}

/**
 * Terminó la fase regular: la tabla queda como se jugó y sigue la postemporada.
 * La tabla y los partidos pasan a `lastTable` / `lastMatches` (los escribe la
 * postemporada) y se vacían de la temporada en curso: guardarlos dos veces eran
 * ~20 KB de más en el Top 14. Lo que sigue viviendo hasta el cierre son las
 * lesiones y los que se fueron, que el cierre necesita para las distinciones.
 */
function endRegularSeason(state: CoachState, rng: Rng): CoachState {
    const ins = state.inSeason as InSeason;
    const done: CoachState = {
        ...state,
        inSeason: { ...ins, tramo: TRAMOS, week: null, key: null, table: [], matches: [] },
    };
    return advancePostseason(done, rng, currentFormat(state), ins.table, ins.matches, ins.effective, [], {});
}

/** El formato que rige la división del jugador ESTE año. */
export function currentFormat(state: Pick<CoachState, 'competitionId' | 'year'>): FormatEdition {
    return formatFor(state.competitionId, state.year);
}

/**
 * Juega lo que quede de la fase regular SIN más tarjetas, con la semana fija y
 * el partido clave sin tocar, y lo que se pueda de la postemporada. Si el club
 * entra a una llave —el playoff por el título o el reducido por el ascenso—
 * frena en fase `playoff` y la juega el entrenador partido a partido
 * (`playPlayoffMatch`). Si no, se cierra el año (`finishSeason`).
 *
 * Desde la pretemporada arranca el año (sin vencer las propuestas: eso lo hace
 * `beginDecisions`). Es para los tests y las simulaciones.
 */
export function playSeason(state: CoachState): CoachState {
    if (!getCompetition(state.competitionId)) return state;
    let s: CoachState = state;
    if (!s.inSeason) {
        const rng = rngFromState(s.rngState);
        s = { ...s, inSeason: startInSeason(s, rng, [0, 0, 0]), phase: 'training', rngState: rng.state };
    } else {
        const ins = s.inSeason;
        s = { ...s, inSeason: { ...ins, cards: ins.cards.map((c, i) => (i > ins.tramo ? 0 : c)) } };
    }
    for (let guard = 0; guard < 4 * TRAMOS + 2; guard++) {
        if (s.phase === 'training' || s.phase === 'keymatch') s = simulateTramo(s);
        else if (s.phase === 'tramo') s = nextTramo(s);
        else if (s.phase === 'market') s = closeMarketWindow(s);
        else if (s.phase === 'decision' || s.phase === 'reveal' || s.phase === 'preseason') {
            s = { ...s, phase: 'training', decisionsLeft: 0, pendingEventId: null, pendingReveal: null };
        } else break;
    }
    return s;
}

/**
 * Sigue la postemporada desde lo que ya está definido. Juega las llaves en las
 * que el club no está y frena en la primera en la que sí. Si el club espera en
 * la primera instancia (1° o 2° de una llave de seis), esa instancia se juega
 * sola y el entrenador entra en semis.
 */
function advancePostseason(
    state: CoachState,
    rng: Rng,
    format: FormatEdition,
    table: TableRow[],
    matches: MatchResult[],
    effective: Record<string, number>,
    ties: KnockoutTie[],
    progress: PostseasonProgress,
): CoachState {
    const sideOf = sideFor(
        { myClubId: state.clubId, myMods: sidelineOf(state), mySquad: state.squad, ratings: state.world.ratings },
        effective,
    );
    const step = resolvePostseason(rng, format, state.competitionId, table, sideOf, ties, state.clubId, progress, true);

    if (step.kind === 'done') {
        return finishSeason(state, rng, table, matches, ties, step.championId, step.reducidoWinner);
    }

    // El club está en la llave. Las instancias en las que espera se juegan solas.
    const played: KnockoutTie[] = [];
    let stage: KnockoutStage | null = firstStage(step.seeds.length);
    let alive = step.seeds;
    while (stage && !myPair(step.seeds, stage, alive, state.clubId)) {
        alive = playStage(rng, step.seeds, stage, alive, sideOf, played, state.competitionId, state.clubId);
        stage = nextStage(stage);
    }
    const pair = stage ? myPair(step.seeds, stage, alive, state.clubId) : null;
    if (!stage || !pair) {
        // No debería pasar —el club está en la siembra—, pero nunca se cuelga la temporada.
        const winner = playBracket(rng, step.seeds, sideOf, played, state.competitionId, state.clubId, { stage, alive });
        tagTies(played, 0, step.bracket);
        const next: PostseasonProgress =
            step.bracket === 'titulo'
                ? { championId: winner }
                : { championId: step.championId ?? '', reducidoWinner: winner };
        return advancePostseason(state, rng, format, table, matches, effective, [...ties, ...played], next);
    }

    tagTies(played, 0, step.bracket);
    const pending: PendingPlayoff = {
        kind: step.bracket,
        competitionId: state.competitionId,
        seeds: step.seeds,
        ratings: effective,
        played,
        alive,
        stage,
        homeId: pair[0],
        awayId: pair[1],
        neutral: isNeutral(stage),
        championId: step.championId,
    };
    return {
        ...state,
        phase: 'playoff',
        rngState: rng.state,
        lastTable: table,
        lastMatches: matches,
        lastKnockout: ties,
        playoff: pending,
    };
}

/**
 * Juega el próximo partido de la llave con la forma de encararlo que eligió el
 * entrenador. Se juega la instancia entera (los otros cruces también); si el
 * club pasa, queda el próximo partido pendiente; si no, la llave se termina sola
 * y la postemporada sigue —el reducido después del título— o se cierra el año.
 */
export function playPlayoffMatch(state: CoachState, approach: PlayoffApproachId): CoachState {
    const p = state.playoff;
    if (state.phase !== 'playoff' || !p) return state;
    const rng = rngFromState(state.rngState);
    const me = mySideOf(state);
    const sideOf =
        (withApproach: boolean) =>
        (id: string): MatchSide =>
            id === state.clubId
                ? { ...me, mods: withApproach ? approachMods(me.mods, approach) : me.mods }
                : { clubId: id, rating: p.ratings[id] ?? state.world.ratings[id] ?? 20, mods: NEUTRAL_MODS };

    const played: KnockoutTie[] = [...p.played];
    const alive = playStage(
        rng,
        p.seeds,
        p.stage,
        p.alive,
        sideOf(false),
        played,
        p.competitionId,
        state.clubId,
        (home, away) =>
            home === state.clubId || away === state.clubId
                ? playTie(rng, sideOf(true), played, p.competitionId, p.stage, home, away, isNeutral(p.stage), state.clubId)
                : null,
    );
    tagTies(played, 0, p.kind);
    const next = nextStage(p.stage);

    // Pasó y queda llave: el próximo partido.
    if (alive.includes(state.clubId) && next) {
        const pair = myPair(p.seeds, next, alive, state.clubId);
        if (pair) {
            return {
                ...state,
                rngState: rng.state,
                playoff: {
                    ...p,
                    played,
                    alive,
                    stage: next,
                    homeId: pair[0],
                    awayId: pair[1],
                    neutral: isNeutral(next),
                },
            };
        }
    }

    // Quedó afuera, o ya se jugó la final: la llave se termina sola.
    const winner = playBracket(rng, p.seeds, sideOf(false), played, p.competitionId, state.clubId, {
        stage: next,
        alive,
    });
    tagTies(played, 0, p.kind);
    const progress: PostseasonProgress =
        p.kind === 'titulo' ? { championId: winner } : { championId: p.championId ?? '', reducidoWinner: winner };

    return advancePostseason(
        { ...state, playoff: null },
        rng,
        formatFor(p.competitionId, state.year),
        state.lastTable,
        state.lastMatches,
        p.ratings,
        [...state.lastKnockout, ...played],
        progress,
    );
}

/**
 * Vuelve a resolver la postemporada desde la tabla ya jugada, con el formato de
 * HOY. Es para una partida guardada a mitad de una llave que el formato vigente
 * ya no tiene —un playoff por el título en una división donde el primero es
 * campeón—: la fase regular no se toca, lo que sigue se juega con las reglas
 * nuevas. `ratings` son las del año que se jugó.
 */
export function resumePostseason(state: CoachState, ratings: Record<string, number>): CoachState {
    if (state.lastTable.length === 0) return { ...state, phase: 'preseason', playoff: null };
    const rng = rngFromState(state.rngState);
    return advancePostseason(
        { ...state, playoff: null },
        rng,
        currentFormat(state),
        state.lastTable,
        state.lastMatches,
        ratings,
        [],
        {},
    );
}

/**
 * Cierra el año con la liga ya definida: copas, presupuesto, la subcomisión y
 * la presión. Deja el estado en fase `season` con todo congelado.
 */
function finishSeason(
    state: CoachState,
    rng: Rng,
    table: TableRow[],
    matches: MatchResult[],
    playoffTies: KnockoutTie[],
    championId: string,
    reducidoWinner: string | null,
): CoachState {
    const comp = getCompetition(state.competitionId);
    if (!comp) return state;
    const format = currentFormat(state);

    const myRating = teamRating(state.squad);
    const myMods = sidelineOf(state);
    const movement = movementOf(format, table, championId, reducidoWinner);
    const myPosition = table.findIndex((r) => r.clubId === state.clubId) + 1;

    const cups = runCups(rng, {
        world: state.world,
        myClubId: state.clubId,
        myCompetitionId: state.competitionId,
        myPosition,
        myRating,
        myMods,
        mySquad: state.squad,
        myLeagueChampionId: championId,
    });

    // Cuántos VIAJES del Interior hizo el club: de ahí sale el costo del micro.
    // Octavos y cuartos se juegan en la cancha del mejor sembrado (`knockout.ts`),
    // así que el local no viaja; semifinales, final y el Nacional son en cancha
    // neutral y viajan los dos. Antes se cobraba el micro también de local, y un
    // club que recibía en casa pagaba un viaje a Tucumán que no hizo.
    const copaMatches = cups.ties.filter(
        (t) =>
            t.awayId === state.clubId
            || (t.homeId === state.clubId && (t.stage === 'semis' || t.stage === 'final')),
    ).length;

    // El presupuesto completo: sueldos, mejoras, préstamo, adelantos, recortes y
    // el ajuste de la subcomisión (`finance.ts`). Las fechas son las del formato
    // de este año, que es el mismo que lee `budgetOf` (`fechasOf`).
    const budget = budgetOf(state, { partidosCopa: copaMatches });

    const caja = Math.round(state.club.finances.caja + budget.resultado);
    const champion = championId === state.clubId;
    const promoted = movement.promoted.includes(state.clubId);
    const relegated = movement.relegated.includes(state.clubId);
    const promotedVia: SeasonEntry['promotedVia'] = !promoted
        ? undefined
        : reducidoWinner === state.clubId
          ? 'reducido'
          : champion && format.promotion?.champion
            ? 'campeon'
            : 'directo';

    // La subcomisión mira tres cosas. Lo deportivo se decide igual que antes; la
    // nota se calcula acá para que la cantera mire el plantel que JUGÓ el año.
    const objectiveMet =
        state.objective.kind === 'campeon' ? champion : myPosition > 0 && myPosition <= state.objective.position;
    const board = boardReview({
        objective: state.objective,
        position: myPosition,
        champion,
        promoted,
        relegated,
        objectiveMet,
        resultado: budget.resultado,
        ingresos: budget.ingresos,
        squad: state.squad,
    });

    const review = reviewSeason(state.pressure, {
        objective: state.objective,
        position: myPosition,
        champion,
        promoted,
        relegated,
        tdi: cups.myTdiRun,
        nacional: cups.myNacional,
        caja,
        ingresos: budget.ingresos,
        cantera: board.cantera,
    });

    // LA DEUDA CON CONSECUENCIAS: atrasos, plan de ajuste, intervención.
    const settled = settleDebt({
        state,
        rng,
        caja,
        ingresos: budget.ingresos,
        squad: state.squad,
        finances: state.club.finances,
    });
    let finances = settled.finances;
    if (activeCuts(state).includes('mantenimiento')) {
        finances = { ...finances, estructura: clamp(finances.estructura - CUT_MANTENIMIENTO_ESTRUCTURA, 0, 100) };
    }
    const finance = payLoan(
        {
            ...state.finance,
            // El adelanto de ESTA temporada se descuenta en la que viene; los viejos ya se cobraron.
            duesAdvances: state.finance.duesAdvances.filter((a) => a.season >= state.season),
        },
        budget,
    );

    // LOS OBJETIVOS: cada uno se mide con la temporada jugada.
    const facts = factsFrom({
        state,
        deportivoMet: review.objectiveMet,
        table,
        matches,
        resultado: budget.resultado,
        netDebt: netDebt({ club: { ...state.club, finances }, finance }),
        promoted,
        position: myPosition,
        estructura: finances.estructura,
    });
    const graded = evaluateObjectives(state.objectives, {
        ...facts,
        ownStarts: ownStarts(state),
        promotions: promotionsIn(state, state.season),
    });
    const proj = state.project && state.project.clubId === state.clubId && state.project.status === 'activo'
        ? advanceProject(state.project, facts)
        : null;

    // La presión sigue saliendo de lo deportivo (`reviewSeason`). Los objetivos
    // de los otros ejes la corren unos pocos puntos, el proyecto ocho, y el plan
    // de ajuste lo que diga la gravedad de la deuda. Nunca por debajo del piso.
    const objectivePressure = clamp(graded.effects.pressure, -5, 5);
    let pressure = clamp(
        Math.round(review.pressure + objectivePressure + (proj?.pressure ?? 0) + settled.pressureExtra),
        pressureFloor(state.objective.kind),
        FIRING_PRESSURE,
    );
    if (settled.fired) pressure = FIRING_PRESSURE;
    const verdict = settled.fired
        ? 'Deuda crónica: la subcomisión intervino el club y te agradece los servicios.'
        : settled.status === 'cronica'
          ? 'El club quedó intervenido por la deuda. Un cierre más así y se termina el ciclo.'
          : review.verdict;
    finances = {
        ...finances,
        hinchada: clamp(finances.hinchada + graded.effects.hinchada + (proj?.hinchada ?? 0), 0, 100),
    };
    const nextFinance = {
        ...finance,
        boardBudget: Math.round(clamp(graded.effects.boardBudget + (proj?.boardBudget ?? 0), -0.1, 0.1) * 1000) / 1000,
    };
    const reputationDelta = review.reputationDelta + graded.effects.reputation + (proj?.reputation ?? 0);

    const myRow = table.find((r) => r.clubId === state.clubId);
    // Los nombres del año, con los que se fueron a mitad de temporada adentro.
    const stars = seasonStars([...state.squad, ...(state.inSeason?.gone ?? [])], myFixtures(state));
    const entry: SeasonEntry = {
        season: state.season,
        year: state.year,
        clubId: state.clubId,
        competitionId: state.competitionId,
        competitionName: competitionName(state.competitionId),
        position: myPosition,
        // El tamaño de la tabla JUGADA, no el del catálogo: si alguna vez no
        // coinciden, la planilla no puede decir "15° de 14".
        teams: table.length,
        points: myRow?.points ?? 0,
        won: myRow?.won ?? 0,
        drawn: myRow?.drawn ?? 0,
        lost: myRow?.lost ?? 0,
        pf: myRow?.pf ?? 0,
        pc: myRow?.pc ?? 0,
        champion,
        movement: promoted ? 'ascenso' : relegated ? 'descenso' : null,
        ...(promotedVia ? { promotedVia } : {}),
        tdi: cups.myTdiRun,
        nacional: cups.myNacional,
        objectiveMet: review.objectiveMet,
        objectiveText: state.objective.text,
        verdict,
        pressure,
        caja,
        decisions: state.decisionLog.filter((d) => d.season === state.season).map((d) => d.text),
        board,
        finance: {
            ingresos: budget.ingresos,
            egresos: budget.egresos,
            resultado: budget.resultado,
            debtMonths: settled.months,
            debt: settled.status,
            measures: settled.measures,
        },
        objectives: graded.results,
        ...(proj ? { project: proj.snapshot } : {}),
        stars,
    };

    return {
        ...state,
        phase: 'season',
        rngState: rng.state,
        playoff: null,
        pressure,
        coach: {
            ...state.coach,
            reputation: clamp(state.coach.reputation + reputationDelta, 0, 100),
        },
        club: { ...state.club, finances },
        squad: settled.squad,
        // La intervención por deuda crónica libera un contrato: lo que ese jugador
        // sumó en el año queda en la planilla, como el de cualquier salida.
        inSeason: state.inSeason
            ? { ...state.inSeason, gone: [...state.inSeason.gone, ...departures(state.squad, settled.squad)] }
            : state.inSeason,
        finance: nextFinance,
        project: proj ? proj.project : state.project,
        lastTable: table,
        lastMatches: matches,
        lastKnockout: [...playoffTies, ...cups.ties],
        lastLeagueMovement: { promoted: movement.promoted, relegated: movement.relegated },
        seasons: [...state.seasons, entry],
    };
}

/**
 * Cierra el año: mueve la pirámide, mueve el mercado de entrenadores, envejece
 * el plantel, apaga los modificadores de temporada y pone el objetivo nuevo. Si
 * la presión llegó al tope, te echaron: el mundo se mueve igual (tu club también
 * busca técnico) y las propuestas que te lleguen son para volver a dirigir.
 */
export function closeSeason(state: CoachState): CoachState {
    const fired = state.pressure >= FIRING_PRESSURE;
    const rng = rngFromState(state.rngState);
    const season = state.season + 1;
    const year = state.year + 1;

    // El movimiento del torneo del jugador YA se jugó: el tick lo respeta en vez
    // de sortearlo. Sin esto, el club podría salir campeón y ascender otro.
    const decided: Record<string, TierMovement> = {};
    if (state.lastLeagueMovement) decided[state.competitionId] = state.lastLeagueMovement;

    const { world: ticked, moved } = tickWorld(state.world, rng, decided, state.year);
    const competitionId = ticked.divisions[state.clubId] ?? state.competitionId;

    // Las estadísticas del año que terminó, para el mercado de la pretemporada:
    // el que se destacó despierta interés (`transfers.ts`).
    const formRef: FormRef = {
        stats: Object.fromEntries(state.squad.map((p) => [p.id, p.stats])),
        fixtures: myFixtures(state),
    };

    // Los cedidos vuelven: envejecen con el plantel y suman su crecimiento extra.
    const transfers = state.transfers ?? EMPTY_TRANSFERS;
    const returningIds = new Set(transfers.loaned.map((l) => l.player.id));

    // El receso: lo del año pasa a la carrera, el cansancio se va y los golpes
    // se curan. El ánimo vuelve a mitad de camino de su neutro. Los vínculos
    // pagos cumplen un año: el que llega a cero vence en la pretemporada.
    const rested = [...state.squad, ...transfers.loaned.map((l) => l.player)].map((p) => ({
        ...p,
        career: addStats(p.career, p.stats),
        stats: emptyStats(),
        fatigue: 0,
        injury: 0,
        morale: Math.round(p.morale + (60 - p.morale) / 2),
        deal: p.deal.kind === 'amateur' ? p.deal : { ...p.deal, years: Math.max(0, p.deal.years - 1) },
    }));

    const aged = ageSquad(
        rng,
        rested,
        ticked.ratings[state.clubId] ?? 20,
        state.coach.attrs.formacion,
        state.club.finances.estructura,
        state.clubId,
        state.season,
        {
            growth: upgradeEffect(state.club, 'gimnasio'),
            academyBonus: upgradeEffect(state.club, 'm19'),
            competitionId,
            // El que se retira deja el lugar VACÍO: lo cubre el M19 de verdad.
            replaceRetired: false,
        },
    );
    const squad = aged.map((p) => (returningIds.has(p.id) ? loanGrowth(p) : p));

    // El rating del club sigue al plantel que el entrenador construyó: sin esto
    // el club sería siempre igual de bueno y formar no serviría para nada.
    const ratings = { ...ticked.ratings, [state.clubId]: teamRating(squad) };

    // El mercado: quién se queda sin técnico y a quién llaman. El ascenso, el
    // título y la reputación del cierre ya están en el estado: pesan acá.
    const { world, market } = marketTick({
        seed: state.seed,
        season,
        year,
        world: { ...ticked, ratings },
        moved,
        lastTable: state.lastTable,
        player: {
            name: state.coach.name,
            reputation: state.coach.reputation,
            clubId: fired ? null : state.clubId,
            level: levelOf(ticked, state.clubId),
            regionId: getClub(state.clubId)?.regionId ?? '',
            seasons: state.seasons,
            justFired: fired,
        },
        leftClubId: fired ? state.clubId : null,
    });

    if (fired) {
        return {
            ...state,
            phase: 'fired',
            rngState: rng.state,
            season,
            year,
            world,
            market,
            seasonMods: { ...NO_MODS },
            history: closeTenure(state, state.season),
            inSeason: null,
            // El plantel, los cedidos y el M19 eran del club que te echó.
            transfers: { ...EMPTY_TRANSFERS, ledger: { season, compensaciones: 0, indemnizaciones: 0 } },
            academy: { ...EMPTY_ACADEMY },
        };
    }

    const seedRank = clubsIn(world, competitionId).indexOf(state.clubId) + 1;
    const next: CoachState = {
        ...state,
        phase: 'preseason',
        rngState: rng.state,
        season,
        year,
        world,
        market,
        competitionId,
        squad,
        objective: objectiveFor(competitionId, Math.max(1, seedRank), year),
        // Los modificadores duran UNA temporada y se apagan solos acá.
        seasonMods: { ...NO_MODS },
        decisionsLeft: CARDS_PER_TRAMO[0],
        pendingEventId: null,
        pendingReveal: null,
        inSeason: null,
        transfers: {
            ...transfers,
            loaned: [],
            ledger: { season, compensaciones: 0, indemnizaciones: 0 },
            negotiation: null,
        },
    };
    // EL CIERRE DEL M19 (etapa 4, `academy.ts`): los pibes crecen, los cedidos
    // vuelven, los lugares de los retirados se cubren con los que el entrenador
    // reservó y con los que cumplen 20 (si no hay lugar, se van). Si todavía
    // falta gente, el plantel vuelve a 26 con los mejores del M19 de 18 o más y
    // recién después con libres generados (`fillFromAcademy`). El M19 se
    // completa hasta 8. Todo con RNG derivado: no corre la carrera. Después, los
    // objetivos del año, la ventana de la pretemporada y la jornada de captación.
    const academy = closeAcademy(next, state.season);
    const full = refillAcademy(fillFromAcademy(academy, SQUAD_MAX, true, 'cierre'));
    return openScouting(openWindow(withSeasonPlan(full), 'pretemporada', formRef));
}

/**
 * Arranca en un club nuevo con el mundo ya acomodado. Lo comparten la propuesta
 * aceptada y el regreso después de un despido.
 */
function startAtClub(
    state: CoachState,
    rng: Rng,
    clubId: string,
    world: WorldState,
    market: MarketState,
    season: number,
    year: number,
    pressure: number,
    history: CoachState['history'],
): CoachState {
    const club = getClub(clubId);
    const competitionId = world.divisions[clubId];
    if (!club || !competitionId) return state;
    const squad = generateSquad(rng, world.ratings[clubId], clubId, competitionId);
    const seedRank = clubsIn(world, competitionId).indexOf(clubId) + 1;
    const arrived = withSeasonPlan({
        ...state,
        phase: 'preseason',
        rngState: rng.state,
        season,
        year,
        clubId,
        competitionId,
        squad,
        world: withoutBench(world, clubId),
        market,
        // Las mejoras eran del club anterior: acá se empieza de cero.
        club: { cohesion: 45, finances: initialFinances(club), upgrades: {} },
        pressure,
        objective: objectiveFor(competitionId, Math.max(1, seedRank), year),
        seasonMods: { ...NO_MODS },
        decisionsLeft: CARDS_PER_TRAMO[0],
        pendingEventId: null,
        pendingReveal: null,
        inSeason: null,
        playoff: null,
        lastTable: [],
        lastMatches: [],
        lastKnockout: [],
        lastLeagueMovement: null,
        // La caja, el préstamo y el proyecto eran del club anterior.
        finance: { ...EMPTY_FINANCE },
        project: null,
        history: [...history, { clubId, fromSeason: season, toSeason: null }],
        // El M19 es del club: el nuevo tiene el suyo.
        academy: seedAcademy({ seed: state.seed, season, clubId, world }),
    });
    // El mercado del club nuevo: sus cedidos y su plata empiezan de cero, y la
    // pretemporada ya tiene ventana (sin fechas jugadas en el club: la forma no pesa).
    return openScouting(
        openWindow(
            { ...arrived, transfers: { ...EMPTY_TRANSFERS, ledger: { season, compensaciones: 0, indemnizaciones: 0 } } },
            'pretemporada',
            null,
        ),
    );
}

/**
 * Aceptar una propuesta en la pretemporada. Dejás tu club —que contrata a otro,
 * del mercado—, las otras propuestas se caen y empezás en el nuevo con la
 * presión de un entrenador que llega: la de cualquier comienzo.
 */
export function acceptOffer(state: CoachState, clubId: string): CoachState {
    if (state.phase !== 'preseason') return state;
    const offer = state.market.offers.find((o) => o.clubId === clubId);
    if (!offer) return state;
    const rng = rngFromState(state.rngState);

    // Tu club busca técnico. No te va a llamar a vos: te fuiste.
    const left = fillVacancy(state.world, state.clubId, state.year, state.season, 'salida', state.coach.name);
    const expired = expireOffers(
        left.world,
        { ...state.market, news: [...state.market.news, left.news] },
        state.year,
        clubId,
    );
    // La temporada que pasó fue la última en el club que dejás.
    const history = closeTenure(state, state.season - 1);
    return startAtClub(state, rng, clubId, expired.world, expired.market, state.season, state.year, INITIAL_PRESSURE, history);
}

/** Rechazar una propuesta: el club contrata a otro y la propuesta se va de la mesa. */
export function declineOffer(state: CoachState, clubId: string): CoachState {
    const offer = state.market.offers.find((o) => o.clubId === clubId);
    if (!offer) return state;
    const filled = fillVacancy(state.world, clubId, state.year, state.market.season, offer.reason, offer.outgoing, offer.moved);
    return {
        ...state,
        world: filled.world,
        market: {
            ...state.market,
            offers: state.market.offers.filter((o) => o.clubId !== clubId),
            news: [...state.market.news, filled.news],
        },
    };
}

/**
 * Después de un despido: agarrar otro club. Lo normal es una de las propuestas
 * del mercado; una partida guardada antes del mercado puede elegir de la lista
 * vieja, y en ese caso el entrenador de ese club pasa a la bolsa.
 */
export function takeNewClub(state: CoachState, clubId: string): CoachState {
    const rng = rngFromState(state.rngState);
    // Un despido guardado antes del esquema 5 no avanzó el año al cerrar.
    const legacy = state.season <= state.seasons.length;
    const season = legacy ? state.season + 1 : state.season;
    const year = legacy ? state.year + 1 : state.year;

    let world = state.world;
    const displaced = world.benches[clubId];
    if (displaced) {
        const benches = { ...world.benches };
        delete benches[clubId];
        world = { ...world, benches, freeAgents: [...world.freeAgents, displaced] };
    }
    const expired = expireOffers(world, state.market, year, clubId);

    // La presión no vuelve a cero: llegás con la mochila de lo anterior, aunque
    // el club nuevo te dé aire.
    const pressure = Math.round(INITIAL_PRESSURE + (state.pressure - INITIAL_PRESSURE) * 0.35);
    return startAtClub(state, rng, clubId, expired.world, expired.market, season, year, pressure, state.history);
}

/** Retirarse. Es una decisión del jugador, no un final automático. */
export function retire(state: CoachState): CoachState {
    const last = state.seasons[state.seasons.length - 1];
    return { ...state, phase: 'retired', history: closeTenure(state, last?.season ?? state.season) };
}

/** Cierra el ciclo abierto en el club actual. No toca uno ya cerrado. */
function closeTenure(state: CoachState, toSeason: number): CoachState['history'] {
    return state.history.map((h, i) =>
        i === state.history.length - 1 && h.toSeason === null ? { ...h, toSeason } : h,
    );
}

/** ¿El club clasificó al Torneo del Interior con la posición del año pasado? */
export function reachedTdi(state: CoachState): boolean {
    const last = state.seasons[state.seasons.length - 1];
    return !!last && qualifiesForTdi(last.competitionId, last.position);
}

function clamp(v: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, v));
}
