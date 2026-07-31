import type { CareerState } from '../types/career.ts';
import type { AttributeKey, Player } from '../types/player.ts';
import type { Effect, GameEvent } from '../types/event.ts';
import type { Rng } from './random.ts';
import { clampAttr, computeOvr } from './scoring.ts';
import { moveToClub } from './club-offers.ts';
import { getPosition } from '../data/positions.ts';
import { outcomeWeights, riskBonusOf, spreadValoracion, starDeltaOf } from './impact.ts';

function clamp01_100(v: number): number {
    return Math.max(0, Math.min(100, v));
}

const SEVERITY_IMPACT: Record<'leve' | 'moderada' | 'grave', number> = { leve: 2, moderada: 3, grave: 6 };

const ATTR_KEYS: AttributeKey[] = ['power', 'speed', 'technique', 'tackle', 'kick', 'vision', 'mental', 'stamina'];

function applyEffect(state: CareerState, effect: Effect, reason: string, riskBonus = 0): void {
    const p: Player = state.player;
    // El OVR con el que entra, para poder cerrar la cuenta de la ⭐ al final.
    const ovrAntes = computeOvr(p.attributes, p.position);

    // Atributos planos, por su nombre real (`{ mental: 4 }`).
    for (const key of ATTR_KEYS) {
        const delta = effect[key];
        if (delta !== undefined) p.attributes[key] = clampAttr(p.attributes[key] + delta);
    }

    // ⭐ VALORACIÓN EN PUNTOS ENTEROS. La tarjeta promete 1, 2, 3 o 4, y el motor
    // mueve EXACTAMENTE eso.
    //
    // No alcanzaba con redondear el texto: los eventos están escritos con deltas de
    // atributo, y `{ mental: 4, vision: 2 }` en un apertura mueve 0,6 de OVR. Si la
    // ficha dijera "+1" y el motor moviera 0,6, la tarjeta sería un adorno. Así que
    // acá se CORRIGE la diferencia: se aplican los deltas declarados —que son los
    // que le dan al evento su carácter, físico o técnico— y después se reparte por
    // peso de puesto lo que falte para llegar al entero prometido.
    //
    // El techo sigue mandando: `starDeltaOf` recibe el margen que le queda al
    // jugador, y es la misma función que usa el revelado, así que lo que se aplica
    // y lo que se cuenta no pueden desincronizarse.
    const ovrAntesDeCorregir = computeOvr(p.attributes, p.position);
    const headroom = p.potential - ovrAntes;
    const prometido = starDeltaOf(effect, p.position, headroom, riskBonus);
    const yaAplicado = ovrAntesDeCorregir - ovrAntes;
    const correccion = prometido - yaAplicado;
    if (Math.abs(correccion) > 1e-9) {
        const spread = spreadValoracion(getPosition(p.position).weights, correccion);
        for (const key of ATTR_KEYS) {
            const delta = spread[key];
            if (delta !== undefined) p.attributes[key] = clampAttr(p.attributes[key] + delta);
        }
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

    // 🚫 SANCIÓN. La suspensión cae sobre la temporada que se está por jugar,
    // igual que una lesión forzada: es lo que hace que "seguir jugando al límite"
    // tenga un precio que se ve en la planilla y no sólo en el relato.
    if (effect.sanction) {
        p.sanctions.push({
            season: p.seasonsPlayed,
            age: p.age,
            card: effect.sanction.card ?? null,
            matches: effect.sanction.matches ?? 0,
            reason: effect.sanction.reason ?? reason,
        });
    }

    // 🕒 TIEMPO DE JUEGO: escalones para la temporada que viene. Se ACUMULA
    // porque el mercado puede colgarle una decisión más a la misma temporada, y
    // dos empujones en el mismo sentido tienen que sumar.
    if (effect.playingTime !== undefined) {
        state.pendingPlayingTime += effect.playingTime;
    }

    // 📋 PLANILLA: lo que en otro juego sería plata.
    if (effect.statBoost) {
        state.pendingStatBoost.tries += effect.statBoost.tries ?? 0;
        state.pendingStatBoost.tackles += effect.statBoost.tackles ?? 0;
    }

    if (effect.moveToOffer) {
        moveToClub(p, effect.moveToOffer);
        state.offers = [];
        // Ancla del cooldown de mercado: solo un PASE REAL lo dispara.
        state.lastMoveSeason = p.seasonsPlayed;
    }

    if (effect.titleBoost) state.pendingTitleBoost += effect.titleBoost;
    // Un evento NO otorga caps: mueve la fracción de tests que juega el que ya
    // fue convocado. Los caps salen sólo de `evaluateNationalTeam`.
    if (effect.testShare !== undefined) state.pendingTestShare *= effect.testShare;
    if (effect.selectionPenalty) {
        // Se acumula el peor castigo vigente, no la suma: dos malas temporadas
        // seguidas no tienen por qué sacarte el doble de puntos.
        state.selectionPenalty = Math.max(state.selectionPenalty, effect.selectionPenalty.points);
        state.selectionPenaltySeasons = Math.max(state.selectionPenaltySeasons, effect.selectionPenalty.seasons);
    }

    // El retiro elegido. Cierra la carrera acá mismo: la temporada NO se juega,
    // porque "retirarte ahora" es no jugar una más. Quien llama se entera
    // mirando `player.retired` (ver `resolveAndPlay`).
    if (effect.retire) {
        p.retired = true;
        p.retirementReason = 'Se retira en lo más alto, cuando quiso';
        state.phase = 'retired';
    }
}

export interface DecisionResult {
    text: string;
    optionId: string;
    /** Índice del desenlace que salió, para poder revelarlo. */
    outcomeIndex: number;
}

/**
 * Aplica la decisión del jugador sobre el evento pendiente. Elige el desenlace
 * por peso (permite opciones probabilísticas), aplica el efecto y actualiza los
 * registros (flags, usados, recientes, log). Muta `state`.
 */
export function applyDecision(state: CareerState, event: GameEvent, optionId: string, rng: Rng): DecisionResult {
    const option = event.options.find((o) => o.id === optionId) ?? event.options[0];
    // EL SORTEO USA LOS MISMOS PESOS QUE MOSTRÓ LA TARJETA: inclinados por la
    // valoración del jugador (`outcomeWeights`). Si acá se usara el peso crudo, el
    // porcentaje de la tarjeta sería decorativo.
    const pesos = outcomeWeights(option, state.player.position, computeOvr(state.player.attributes, state.player.position));
    const outcome = option.outcomes.length === 1
        ? option.outcomes[0]
        : rng.weighted(option.outcomes, (o) => pesos[option.outcomes.indexOf(o)]);

    // El motivo por defecto de una sanción es el título de la situación que el
    // jugador acaba de leer: nadie tiene que repetirlo en el dato del evento.
    //
    // Y la PRIMA DE RIESGO se calcula con la opción entera, no con el desenlace
    // suelto: sale de cuánta chance había de que saliera peor. Es el mismo número
    // que la tarjeta mostró antes de elegir (`optionPreview`), así que lo que se
    // prometió es lo que se aplica.
    const outcomeIndex = option.outcomes.indexOf(outcome);
    applyEffect(state, outcome.effect, event.title, riskBonusOf(option, outcomeIndex, state.player.position));

    const p = state.player;
    if (!event.repeatable && !p.usedEventIds.includes(event.id)) {
        p.usedEventIds.push(event.id);
    }
    state.recentEventIds = [event.id, ...state.recentEventIds].slice(0, 8);
    // `outcomeIndex` (arriba) es lo que permite REVELAR lo que salió: sin él, la UI
    // tiene el texto del desenlace pero no sabe cuál de los desenlaces fue, así que
    // no puede mostrar qué se movió. Buscarlo por texto habría funcionado hasta el
    // primer par de desenlaces que comparten narración.
    state.decisionLog.push({
        seasonIndex: p.seasonsPlayed,
        eventId: event.id,
        optionId: option.id,
        outcomeIndex,
        text: outcome.resultText,
    });

    state.pendingEventId = null;

    return { text: outcome.resultText, optionId: option.id, outcomeIndex };
}
