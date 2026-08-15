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
import { isRivalJump, payRivalJump } from './betrayal.ts';
import { addBodyDamage, addHeadDamage } from './damage.ts';
import { applyMoney } from './money.ts';
import { ovrOf, potentialOf } from './ovr.ts';
import { belongingSituation, renewContract, returnHome, signProfessional } from './contracts.ts';
import { renewalFor } from './clubs.ts';
import { FAREWELL_FLAG } from './retirement.ts';
import { switchToUnion } from './eligibility.ts';
import { getClub, unionName } from '../data/catalogs.ts';

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
    const techo = potentialOf(player);
    if (despues > techo && despues > antes) {
        const permitido = Math.max(0, techo - antes);
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

/**
 * @param unionCode La unión de la que habla la tarjeta, o `null`. Viene del
 *   evento y no del efecto porque las tarjetas que hablan de una unión se arman
 *   en el momento (`buildFlagSwitchEvent`) y el catálogo es estático.
 */
function applyEffect(
    state: CaptainState,
    effect: CaptainEffect,
    unionCode: string | null,
): string | null {
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
    if (effect.injury) state.pendingInjury += effect.injury;

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
        // ── ¿ES EL CLÁSICO? SE PREGUNTA ACÁ, CON EL CLUB VIEJO TODAVÍA PUESTO ──
        // Dos líneas más abajo `player.clubId` ya es el otro, y entonces la
        // pregunta no se puede volver a hacer: el pase no deja rastro de dónde
        // venías hasta que la temporada siguiente escribe su fila.
        const anterior = state.player.clubId;
        const alClasico = anterior !== null && isRivalJump(anterior, offer.clubId);

        if (offer.kind === 'professional') {
            // EL PLAZO Y EL SUELDO SALEN DE LA OFERTA y no se recalculan acá: son
            // los que el jugador leyó en la tarjeta antes de elegir. Recalcularlos
            // abriría la puerta a firmar por un número distinto del que se mostró.
            extra = signProfessional(state, offer.clubId, offer.years, offer.salary);
        } else {
            state.player.clubId = offer.clubId;
            // EL PAPEL VIEJO SE ROMPE AL IRSE. En el club amateur sos socio y no
            // tenés contrato, así que dejarlo colgado sería guardar una promesa
            // sobre un club donde ya no jugás — un contrato fantasma que le sigue
            // contestando «hasta 2031» a quien pregunte.
            state.contract = null;
            extra = `Ahora jugás en ${getClub(offer.clubId).name}.`;
        }

        // ── Y SE COBRA DESPUÉS, CON EL PASE YA HECHO ────────────────────────
        // El orden importa en un solo sentido y conviene dejarlo escrito: firmar
        // profesional le cobra al club que dejás la penalidad del contrato, así
        // que borrar antes haría que esa penalidad volviera a escribir la cuenta
        // que acabábamos de borrar —en cero, pero escrita—. Al revés no pasa
        // nada: el borrado es absoluto y se lleva puesto cualquier delta previo.
        if (alClasico && anterior) {
            const traicion = payRivalJump(state, anterior);
            if (traicion) extra = extra ? `${extra} ${traicion}` : traicion;
        }

        state.player.flags['ultimo-pase'] = state.season;
        state.offers = [];
    }

    if (effect.renew && state.player.clubId) {
        // Los términos se RECALCULAN con la misma función pura que los dibujó, en
        // vez de viajar adentro del efecto: un efecto es un dato estático y la
        // renovación depende de la media de hoy. Es la misma razón por la que la
        // ⭐ de una tarjeta se deriva en vez de declararse (CLAUDE.md raíz §3.1).
        const terms = renewalFor(state.player, state.player.clubId, state.season);
        if (terms) extra = renewContract(state, terms.years, terms.salary);
        state.offers = [];
    }

    if (effect.returnHome) extra = returnHome(state);

    // ── LA VUELTA QUE CIERRA LA CARRERA ─────────────────────────────────────
    // Se marca la temporada, y de esa marca salen las dos consecuencias: el
    // mercado deja de ponerte la mesa y la que viene es la última. Va DESPUÉS de
    // `returnHome` —que ya te dejó en tu club— y separado de él, porque hay una
    // vuelta a casa que no es una despedida (ver `farewell` en `types/event.ts`).
    if (effect.farewell) state.player.flags[FAREWELL_FLAG] = state.season;

    // ── LA OTRA BANDERA ─────────────────────────────────────────────────────
    // Va DESPUÉS de la fama y la plata del mismo efecto y antes de nada que
    // dependa de la unión, pero el orden acá no decide nada: la convocatoria
    // corre en `simulate-season`, la temporada que viene, que es cuando el cambio
    // se cobra. Es lo correcto y es lo que promete la tarjeta —«jugarías el
    // Mundial el año que viene»—.
    if (effect.switchUnion && unionCode !== null && switchToUnion(state.national.eligibility, unionCode)) {
        // El escalón se resetea a mano y no se hereda: los carriles de la unión
        // vieja no son tuyos desde hoy, y dejar `track` como estaba haría que la
        // cabecera dijera «Seleccionado A» de una unión que ya no podés
        // representar hasta que la temporada siguiente lo recalcule.
        state.national.track = 'club';
        extra = `Ahora jugás para ${unionName(unionCode)}.`;
    }

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
    const extra = applyEffect(state, outcome.effect, event.unionCode ?? null);

    state.decisionLog.push({
        season: state.season,
        eventId: event.id,
        optionId,
        outcomeIndex,
        text: outcome.resultText,
    });

    return { outcomeIndex, outcome, extra };
}
