import type { CareerState } from '../types/career.ts';
import type { AttributeKey, Player } from '../types/player.ts';
import type { Effect, GameEvent } from '../types/event.ts';
import type { Rng } from './random.ts';
import { clampAttr } from './scoring.ts';
import { moveToClub } from './club-offers.ts';

function clamp01_100(v: number): number {
    return Math.max(0, Math.min(100, v));
}

const SEVERITY_IMPACT: Record<'leve' | 'moderada' | 'grave', number> = { leve: 2, moderada: 3, grave: 6 };

const ATTR_KEYS: AttributeKey[] = ['power', 'speed', 'technique', 'tackle', 'kick', 'vision', 'mental', 'stamina'];

function applyEffect(state: CareerState, effect: Effect): void {
    const p: Player = state.player;

    // Atributos planos, por su nombre real (`{ mental: 4 }`).
    for (const key of ATTR_KEYS) {
        const delta = effect[key];
        if (delta !== undefined) p.attributes[key] = clampAttr(p.attributes[key] + delta);
    }

    if (effect.morale !== undefined) p.dynamics.morale = clamp01_100(p.dynamics.morale + effect.morale);
    if (effect.form !== undefined) p.dynamics.form = clamp01_100(p.dynamics.form + effect.form);
    if (effect.fatigue !== undefined) p.dynamics.fatigue = clamp01_100(p.dynamics.fatigue + effect.fatigue);
    if (effect.fame !== undefined) p.dynamics.fame = clamp01_100(p.dynamics.fame + effect.fame);
    if (effect.injuryRisk !== undefined) p.dynamics.injuryRisk = clamp01_100(p.dynamics.injuryRisk + effect.injuryRisk);

    if (effect.flags) {
        for (const [flag, delta] of Object.entries(effect.flags)) {
            p.flags[flag] = (p.flags[flag] ?? 0) + delta;
        }
    }

    if (effect.changePosition) {
        p.position = effect.changePosition;
    }

    if (effect.forceInjury) {
        p.injuries.push({
            season: p.seasonsPlayed, // afecta la temporada que se está por jugar
            age: p.age,
            name: effect.forceInjury.name,
            severity: effect.forceInjury.severity,
            seasonsOut: effect.forceInjury.seasonsOut,
            ovrImpact: SEVERITY_IMPACT[effect.forceInjury.severity],
        });
        if (effect.forceInjury.severity === 'grave') {
            p.dynamics.injuryRisk = clamp01_100(p.dynamics.injuryRisk + 8);
        }
    }

    if (effect.moveToOffer) {
        moveToClub(p, effect.moveToOffer);
        state.offers = [];
        // Ancla del cooldown de mercado: solo un PASE REAL lo dispara.
        state.lastMoveSeason = p.seasonsPlayed;
    }

    if (effect.titleBoost) state.pendingTitleBoost += effect.titleBoost;
    if (effect.capBoost) state.pendingCapBoost += effect.capBoost;
}

export interface DecisionResult {
    text: string;
    optionId: string;
}

/**
 * Aplica la decisión del jugador sobre el evento pendiente. Elige el desenlace
 * por peso (permite opciones probabilísticas), aplica el efecto y actualiza los
 * registros (flags, usados, recientes, log). Muta `state`.
 */
export function applyDecision(state: CareerState, event: GameEvent, optionId: string, rng: Rng): DecisionResult {
    const option = event.options.find((o) => o.id === optionId) ?? event.options[0];
    const outcome = option.outcomes.length === 1 ? option.outcomes[0] : rng.weighted(option.outcomes, (o) => o.weight);

    applyEffect(state, outcome.effect);

    const p = state.player;
    if (!event.repeatable && !p.usedEventIds.includes(event.id)) {
        p.usedEventIds.push(event.id);
    }
    state.recentEventIds = [event.id, ...state.recentEventIds].slice(0, 8);
    state.decisionLog.push({ seasonIndex: p.seasonsPlayed, eventId: event.id, optionId: option.id, text: outcome.resultText });

    state.pendingEventId = null;

    return { text: outcome.resultText, optionId: option.id };
}
