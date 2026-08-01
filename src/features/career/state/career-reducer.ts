import type { CareerState } from '../types/career.ts';
import { ENGINE_VERSION, SEASONS_PER_DECISION } from '../types/career.ts';
import type { CareerAction } from './career-actions.ts';
import type { CreatePlayerInput } from '../engine/create-player.ts';
import { createPlayer, drawStartRoute } from '../engine/create-player.ts';
import { createRng, type Rng } from '../engine/random.ts';
import { selectEvent, getPendingEvent } from '../engine/event-selector.ts';
import { applyDecision } from '../engine/apply-decision.ts';
import { simulateSeason } from '../engine/simulate-season.ts';
import { retirementReason, shouldRetire } from '../engine/retirement.ts';
import { CLUB_CATALOG_VERSION } from '../data/clubs.ts';
import { COMPETITION_LEVELS_VERSION } from '../data/competition-levels2026.ts';

/** Prepara la próxima temporada: elige evento (fija pendiente) o deja lista la simulación. */
function beginSeason(state: CareerState, rng: Rng): void {
    const selection = selectEvent(state, rng);
    if (selection) {
        state.pendingEventId = selection.event.id;
        if (selection.offers) state.offers = selection.offers;
        state.phase = 'event';
    } else {
        state.pendingEventId = null;
        state.phase = 'season';
    }
}

/** Cierra la carrera si toca. Devuelve si el jugador se retiró. */
function retireIfDue(state: CareerState, rng: Rng): boolean {
    if (!shouldRetire(state.player, rng)) return false;
    state.player.retired = true;
    state.player.retirementReason = retirementReason(state.player);
    state.phase = 'retired';
    return true;
}

/**
 * Resuelve el evento pendiente (si hay), juega el TRAMO completo y arma la
 * decisión siguiente.
 *
 * Un tramo son las temporadas que `paceMode` hace pasar por decisión. En
 * `intense` (el default y el comportamiento histórico) el tramo es una sola
 * temporada, el bucle de abajo no se ejecuta y no se consume RNG de más: la
 * carrera es byte-idéntica a la de 1.10.0.
 *
 * El tramo se corta antes de tiempo por dos motivos, y solo por esos dos: el
 * retiro y el mercado. Los eventos estáticos sí se saltean — son el ruido que
 * los modos largos vienen a bajar.
 */
function resolveAndPlay(state: CareerState, rng: Rng, optionId?: string): void {
    const event = getPendingEvent(state);
    let movedFrom: string | null = null;

    if (event && optionId) {
        const clubBefore = state.player.club;
        applyDecision(state, event, optionId, rng);
        // Retiro ELEGIDO: la temporada no se juega. "Retirarte ahora" es
        // justamente no jugar una más, así que se sale antes de simular.
        if (state.player.retired) return;
        if (state.player.club !== clubBefore) movedFrom = clubBefore;
    } else {
        // Sin decisión: igual limpiamos el pendiente.
        state.pendingEventId = null;
    }

    simulateSeason(state, rng, movedFrom);
    if (retireIfDue(state, rng)) return;

    const seasonsInBlock = SEASONS_PER_DECISION[state.paceMode];
    for (let played = 1; played < seasonsInBlock; played++) {
        const market = selectEvent(state, rng, { marketOnly: true });
        if (market) {
            state.pendingEventId = market.event.id;
            if (market.offers) state.offers = market.offers;
            state.phase = 'event';
            return;
        }
        simulateSeason(state, rng, null);
        if (retireIfDue(state, rng)) return;
    }

    beginSeason(state, rng);
}

/** Crea una carrera nueva y prepara la primera temporada. */
export function createInitialCareer(input: CreatePlayerInput, seed: number): CareerState {
    const rng = createRng(seed >>> 0);

    // LA RAMA SE SORTEA ACÁ Y SE SELLA EN EL ESTADO. El tiro se hace SIEMPRE,
    // incluso cuando la rama viene declarada (tests, y el replay de una carrera
    // desde el token compartible): si sólo se tirara cuando falta, el stream del
    // rng dependería de por dónde entró la llamada y una carrera reproducida desde
    // el token no sería la misma carrera. Es la misma disciplina que la lotería de
    // techo en `createPlayer`.
    const drawnRoute = drawStartRoute(rng);
    const startRoute = input.startRoute ?? drawnRoute;
    const player = createPlayer({ ...input, startRoute }, rng);

    const state: CareerState = {
        version: ENGINE_VERSION,
        clubCatalogVersion: CLUB_CATALOG_VERSION,
        seed: seed >>> 0,
        rngState: rng.state,
        startRoute,
        // El club de creación se SELLA acá y no se vuelve a tocar: es el único
        // momento en que existe con certeza (un pase en la ventana previa a la
        // primera temporada lo pisaría en `player.club`).
        startClub: player.club,
        paceMode: input.paceMode ?? 'intense',
        player,
        seasons: [],
        phase: 'setup',
        pendingEventId: null,
        recentEventIds: [],
        offers: [],
        marketEvaluatedSeason: -1,
        lastMoveSeason: -10,
        lastStanding: null,
        competitionLevelsVersion: COMPETITION_LEVELS_VERSION,
        previousSeasonLoad: 0,
        history: [],
        pendingTitleBoost: 0,
        pendingTestShare: 1,
        selectionPenalty: 0,
        selectionPenaltySeasons: 0,
        pendingPlayingTime: 0,
        pendingStatBoost: { tries: 0, tackles: 0 },
        divisions: {},
        decisionLog: [],
    };

    beginSeason(state, rng);
    state.rngState = rng.state;
    return state;
}

/**
 * Reducer PURO: dado (state, action) devuelve un nuevo state. Restaura el RNG
 * desde `rngState`, opera y vuelve a guardar el estado del RNG. Same (state,
 * action) ⇒ same next state (clave para reproducir carreras y validar scores).
 */
export function careerReducer(state: CareerState, action: CareerAction): CareerState {
    if (action.type === 'START') {
        return createInitialCareer(action.input, action.seed);
    }

    const next: CareerState = structuredClone(state);
    const rng = createRng(next.rngState);

    switch (action.type) {
        case 'CHOOSE':
            if (next.phase === 'event') resolveAndPlay(next, rng, action.optionId);
            break;
        case 'ADVANCE':
            if (next.phase === 'season') resolveAndPlay(next, rng);
            break;
        case 'RETIRE':
            if (next.phase !== 'retired') {
                next.player.retired = true;
                next.player.retirementReason = 'Anuncia su retiro';
                next.phase = 'retired';
            }
            break;
    }

    next.rngState = rng.state;
    return next;
}
