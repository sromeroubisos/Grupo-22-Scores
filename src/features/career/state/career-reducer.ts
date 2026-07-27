import type { CareerState } from '../types/career.ts';
import type { Player } from '../types/player.ts';
import { ENGINE_VERSION } from '../types/career.ts';
import type { CareerAction } from './career-actions.ts';
import type { CreatePlayerInput } from '../engine/create-player.ts';
import { createPlayer } from '../engine/create-player.ts';
import { createRng, type Rng } from '../engine/random.ts';
import { selectEvent, getPendingEvent } from '../engine/event-selector.ts';
import { applyDecision } from '../engine/apply-decision.ts';
import { simulateSeason, shouldRetire } from '../engine/simulate-season.ts';
import { getPosition } from '../data/positions.ts';
import { CLUB_CATALOG_VERSION } from '../data/clubs.ts';
import { COMPETITION_LEVELS_VERSION } from '../data/competition-levels2026.ts';

function retirementReason(player: Player): string {
    const { hard } = getPosition(player.position).retirement;
    if (player.age >= hard) return 'Se retira por el paso de los años';
    if (player.injuries.filter((i) => i.severity === 'grave').length >= 2) return 'El cuerpo dijo basta';
    if (player.dynamics.morale < 35) return 'Se apagó la motivación';
    return 'Cierra una gran carrera en lo más alto';
}

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

/** Resuelve el evento pendiente (si hay), juega la temporada y arma la siguiente. */
function resolveAndPlay(state: CareerState, rng: Rng, optionId?: string): void {
    const event = getPendingEvent(state);
    let movedFrom: string | null = null;

    if (event && optionId) {
        const clubBefore = state.player.club;
        applyDecision(state, event, optionId, rng);
        if (state.player.club !== clubBefore) movedFrom = clubBefore;
    } else {
        // Sin decisión: igual limpiamos el pendiente.
        state.pendingEventId = null;
    }

    simulateSeason(state, rng, movedFrom);

    if (shouldRetire(state.player, rng)) {
        state.player.retired = true;
        state.player.retirementReason = retirementReason(state.player);
        state.phase = 'retired';
    } else {
        beginSeason(state, rng);
    }
}

/** Crea una carrera nueva y prepara la primera temporada. */
export function createInitialCareer(input: CreatePlayerInput, seed: number): CareerState {
    const rng = createRng(seed >>> 0);
    const player = createPlayer(input, rng);

    const state: CareerState = {
        version: ENGINE_VERSION,
        clubCatalogVersion: CLUB_CATALOG_VERSION,
        seed: seed >>> 0,
        rngState: rng.state,
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
        pendingCapBoost: 0,
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
