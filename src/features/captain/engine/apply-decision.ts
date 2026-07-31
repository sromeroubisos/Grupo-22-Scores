// EL CAPITÁN — qué le hace al jugador la opción que elegiste.
//
// Un solo lugar donde un `CaptainEffect` se convierte en estado. Que sea uno
// solo es lo que hace que una decisión no pueda prometer una cosa y hacer otra:
// la pantalla lee el mismo efecto que se aplica acá.

import type { CaptainEffect, CaptainEvent, CaptainOutcome } from '../types/event.ts';
import type { CaptainState } from '../types/captain.ts';
import type { Rng } from './random.ts';
import { FAME_MAX, FAME_MIN } from '../types/currencies.ts';
import { getFamily } from '../data/positions.ts';
import { applyBelonging } from './belonging.ts';
import { addBodyDamage, addHeadDamage } from './damage.ts';
import { applyMoney } from './money.ts';
import { ovrOf } from './ovr.ts';
import { belongingSituation, returnHome, signProfessional } from './contracts.ts';
import { getClub } from '../data/catalogs.ts';

export interface DecisionResult {
    outcomeIndex: number;
    outcome: CaptainOutcome;
    /** Línea extra de crónica, cuando el efecto movió el club o el contrato. */
    extra: string | null;
}

/**
 * Aplica los deltas de atributo RESPETANDO EL TECHO.
 *
 * El potencial es un techo duro: una decisión no puede pasarlo por arriba. Si
 * la suma se pasa, se recorta proporcionalmente sobre los atributos de la
 * familia —los únicos que mueven la media— y los de afuera se aplican enteros,
 * porque no la mueven.
 */
function applyAttrs(state: CaptainState, deltas: NonNullable<CaptainEffect['attrs']>): void {
    const { player } = state;
    const family = getFamily(player.family);
    const propios = new Set<string>(family.attributes);

    const antes = ovrOf(player);
    const snapshot: Partial<Record<string, number>> = {};
    for (const key of family.attributes) snapshot[key] = player.attrs[key];

    // Se recorre `family.attributes` primero y el resto en orden declarado por
    // el propio efecto: nada de `Object.keys` sobre un objeto que decide algo.
    for (const key of family.attributes) {
        const d = deltas[key];
        if (d) player.attrs[key] = Math.min(99, Math.max(5, player.attrs[key] + d));
    }

    const despues = ovrOf(player);
    if (despues > player.potential && despues > antes) {
        const permitido = Math.max(0, player.potential - antes);
        const factor = permitido / (despues - antes);
        for (const key of family.attributes) {
            const original = snapshot[key]!;
            player.attrs[key] = Math.round(original + (player.attrs[key] - original) * factor);
        }
    }

    for (const key of Object.keys(deltas).sort()) {
        if (propios.has(key)) continue;
        const d = deltas[key as keyof typeof deltas];
        if (d) {
            const k = key as keyof typeof player.attrs;
            player.attrs[k] = Math.min(99, Math.max(5, player.attrs[k] + d));
        }
    }

    player.ovr = ovrOf(player);
}

function applyEffect(state: CaptainState, effect: CaptainEffect): string | null {
    let extra: string | null = null;

    if (effect.attrs) applyAttrs(state, effect.attrs);

    if (effect.belonging && state.player.clubId) {
        state.belonging = applyBelonging(state.belonging, effect.belonging, belongingSituation(state, state.player.clubId));
    }

    if (effect.fame) {
        state.fame = Math.min(FAME_MAX, Math.max(FAME_MIN, Math.round((state.fame + effect.fame) * 10) / 10));
    }

    if (effect.money) state.money = applyMoney(state.money, effect.money, state.stage);
    if (effect.head) state.damage = addHeadDamage(state.damage, effect.head);
    if (effect.body) state.damage = addBodyDamage(state.damage, effect.body);

    if (effect.playingTime) state.pendingPlayingTime += effect.playingTime;
    if (effect.statBoost) state.pendingStatBoost += effect.statBoost;
    if (effect.sanction) state.pendingSanction += effect.sanction;

    if (effect.flags) {
        // Orden estable: son contadores, pero el recorrido tiene que ser el
        // mismo siempre para que nada dependa del orden de inserción.
        for (const key of Object.keys(effect.flags).sort()) {
            state.player.flags[key] = (state.player.flags[key] ?? 0) + effect.flags[key];
        }
    }

    if (effect.takeOffer && state.offers.length > 0) {
        // El pase es al club de la oferta que eligió el jugador; la opción y la
        // oferta comparten índice, y el reducer ya lo resolvió antes de llamar.
        const offer = state.offers[0];
        if (offer.kind === 'professional') {
            extra = signProfessional(state, offer.clubId, offer.salary);
        } else {
            state.player.clubId = offer.clubId;
            extra = `Ahora jugás en ${getClub(offer.clubId).name}.`;
        }
        state.player.flags['ultimo-pase'] = state.season;
        state.offers = [];
    }

    if (effect.returnHome) extra = returnHome(state);

    if (effect.retire) {
        state.player.retired = true;
        state.player.retirementReason = 'decision';
        state.phase = 'retired';
    }

    return extra;
}

/**
 * Resuelve una opción: sortea el desenlace por peso y lo aplica.
 *
 * Los pesos se escriben como se leen (70 y 30, no 7 y 3) y el test verifica que
 * sumen 100, así que el sorteo es directamente sobre ellos.
 */
export function applyDecision(
    state: CaptainState,
    event: CaptainEvent,
    optionId: string,
    rng: Rng,
): DecisionResult | null {
    const option = event.options.find((o) => o.id === optionId);
    if (!option) return null;

    // La oferta elegida se pone primera, para que `applyEffect` fiche en el club
    // correcto. Las opciones de mercado se llaman `firmar-N` / `pasar-N`.
    const match = /-(\d+)$/.exec(optionId);
    if (match && state.offers.length > 1) {
        const i = Number(match[1]);
        if (i > 0 && i < state.offers.length) {
            state.offers = [state.offers[i], ...state.offers.filter((_, j) => j !== i)];
        }
    }

    const outcome = rng.weighted(option.outcomes, (o) => o.weight);
    const outcomeIndex = option.outcomes.indexOf(outcome);
    const extra = applyEffect(state, outcome.effect);

    state.decisionLog.push({
        season: state.season,
        eventId: event.id,
        optionId,
        outcomeIndex,
        text: outcome.resultText,
    });

    return { outcomeIndex, outcome, extra };
}
