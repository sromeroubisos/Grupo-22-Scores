// Un jugador simulado que resuelve la ventana de pases con una política simple.
//
// Es para los harness (`invariants.test.ts`, `transfers.test.ts`): mil carreras
// no se juegan tocando botones. Tres políticas:
//
//   · `azar`: cada decisión al azar, con el RNG que se le pasa (el del jugador,
//     nunca el de la carrera);
//   · `acepta`: acepta todas las ofertas, renueva todo por lo que piden, deja ir
//     al que pide salir y firma a todo el que puede;
//   · `rechaza`: rechaza todas las ofertas, no renueva a nadie, no deja ir a
//     nadie y no incorpora.
//
// Las dos puntas son las que miden que un club amateur no se vacíe.

import type { CoachState, SquadPlayer } from '../types/coach.ts';
import {
    DEV_PLANS,
    currentScouting,
    finishScouting,
    loanKid,
    observeCandidate,
    promoteBlock,
    promoteKid,
    releaseKid,
    scoutSignBlock,
    setDevPlan,
    signScout,
    toggleReserve,
} from './academy.ts';
import type { Rng } from './random.ts';
import { isForward } from './squad.ts';
import {
    SQUAD_MAX,
    SQUAD_MIN,
    acceptPlayerOffer,
    denyRequest,
    expiringPlayers,
    feeNegotiationBlock,
    grantRequest,
    letExpire,
    loanBlock,
    loanPlayer,
    negotiationAcceptCounter,
    negotiationOffer,
    openFeeNegotiation,
    rejectPlayerOffer,
    releaseBlock,
    releasePlayer,
    renewAtAsk,
    retainPlayer,
    rosterSize,
    signCandidate,
} from './transfers.ts';

export type MarketPolicy = 'azar' | 'acepta' | 'rechaza';

export function autoResolveWindow(state: CoachState, mode: MarketPolicy, rng: Rng | null = null): CoachState {
    let s = state;
    if (!s.transfers?.window) return s;
    const pick = (n: number): number => (rng ? rng.int(0, n - 1) : 0);

    for (const o of [...s.transfers.offers]) {
        if (!s.transfers.offers.some((x) => x.id === o.id)) continue;
        if (mode === 'acepta') {
            s = acceptPlayerOffer(s, o.id);
            continue;
        }
        if (mode === 'rechaza') {
            s = rejectPlayerOffer(s, o.id);
            continue;
        }
        const choice = pick(4);
        if (choice === 0) s = acceptPlayerOffer(s, o.id);
        else if (choice === 1) s = rejectPlayerOffer(s, o.id);
        else if (choice === 2) {
            const kept = retainPlayer(s, o.id);
            s = kept === s ? rejectPlayerOffer(s, o.id) : kept;
            if (s.transfers.offers.some((x) => x.id === o.id)) s = rejectPlayerOffer(s, o.id);
        } else if (!feeNegotiationBlock(s, o.id)) {
            // Pedir un 30 % más y, si no cierra, quedarse con la contraoferta.
            s = openFeeNegotiation(s, o.id);
            s = negotiationOffer(s, o.fee * 1.3);
            if (s.transfers.negotiation) s = negotiationAcceptCounter(s);
        } else {
            s = acceptPlayerOffer(s, o.id);
        }
    }

    for (const p of expiringPlayers(s)) {
        const renew = mode === 'acepta' || (mode === 'azar' && pick(10) < 7);
        if (renew) {
            const r = renewAtAsk(s, p.id);
            s = r === s ? letExpire(s, p.id) : r;
        } else {
            s = letExpire(s, p.id);
        }
    }

    for (const r of [...s.transfers.requests]) {
        const grant = mode === 'acepta' || (mode === 'azar' && pick(2) === 0);
        s = grant ? grantRequest(s, r.playerId) : denyRequest(s, r.playerId);
    }

    for (const c of [...s.transfers.arrivals]) {
        if (mode === 'rechaza') break;
        if (rosterSize(s) >= SQUAD_MAX) break;
        if (mode === 'acepta' || pick(10) < 3) s = signCandidate(s, c.id);
    }

    // Al azar, a veces se cede al pibe más joven que se pueda ceder.
    if (mode === 'azar' && s.squad.length > SQUAD_MIN && pick(10) < 2) {
        const kid = [...s.squad]
            .sort((a, b) => a.age - b.age || a.level - b.level || a.id.localeCompare(b.id))
            .find((p) => !loanBlock(s, p.id));
        if (kid) s = loanPlayer(s, kid.id);
    }
    return s;
}

/* ------------------------------------------------------------------ */
/* El M19 (etapa 4)                                                    */
/* ------------------------------------------------------------------ */

/**
 * Cómo el jugador simulado maneja el M19 en la pretemporada:
 *
 *   · `azar`: observa y suma al azar, cambia planes, promueve, reserva, cede y
 *     libera con chances fijas (el RNG que se le pasa, nunca el de la carrera);
 *   · `forma`: el club que forma. Mira primero a los que más llaman la
 *     atención, suma a los de mejor rango, plan por puesto, cede a los de 17 y
 *     18 con el plan de minutos, reserva a los de 19 y promueve a todo pibe
 *     listo que esté a la altura del peor de su puesto (liberando a ese);
 *   · `compra`: no capta ni promueve. Lo que sube, sube solo al cierre.
 */
export type AcademyPolicy = 'azar' | 'forma' | 'compra';

const HINT_RANK = ['Todos los que lo vieron', 'Se destaca', 'Cumple', 'Tiene cosas'];

function hintRank(hint: string): number {
    const i = HINT_RANK.findIndex((h) => hint.includes(h));
    return i < 0 ? HINT_RANK.length : i;
}

function mid(x: { estMin: number; estMax: number }): number {
    return (x.estMin + x.estMax) / 2;
}

/** El peor del plantel en ese puesto que se puede liberar (no el que es del club si hay otro). */
function weakestReleasable(s: CoachState, group: string): SquadPlayer | null {
    const pool = s.squad
        .filter((p) => p.group === group && !releaseBlock(s, p.id))
        .sort((a, b) => a.level - b.level || a.id.localeCompare(b.id));
    return pool[0] ?? null;
}

export function autoResolveAcademy(state: CoachState, mode: AcademyPolicy, rng: Rng | null = null): CoachState {
    let s = state;
    const pick = (n: number): number => (rng ? rng.int(0, n - 1) : 0);
    const day = currentScouting(s);

    // La jornada de captación.
    if (day) {
        if (mode === 'azar') {
            for (let i = 0; i < day.pointsMax; i++) {
                const open = currentScouting(s)?.candidates ?? [];
                if (open.length === 0) break;
                s = observeCandidate(s, open[pick(open.length)].id);
            }
            const howMany = pick(day.picksMax + 1);
            for (let i = 0; i < howMany; i++) {
                const left = (currentScouting(s)?.candidates ?? []).filter((c) => !scoutSignBlock(s, c.id));
                if (left.length === 0) break;
                s = signScout(s, left[pick(left.length)].id);
            }
        } else if (mode === 'forma') {
            const byHint = [...day.candidates].sort((a, b) => hintRank(a.hint) - hintRank(b.hint) || a.id.localeCompare(b.id));
            for (const c of byHint) {
                for (let k = 0; k < 2; k++) s = observeCandidate(s, c.id);
            }
            const ranked = [...(currentScouting(s)?.candidates ?? [])].sort((a, b) => mid(b) - mid(a) || a.id.localeCompare(b.id));
            for (const c of ranked) {
                if (scoutSignBlock(s, c.id)) continue;
                s = signScout(s, c.id);
            }
        }
        s = finishScouting(s);
    }

    if (mode === 'compra') return s;

    if (mode === 'forma') {
        for (const k of [...s.academy.players]) {
            s = setDevPlan(s, k.id, isForward(k.group) ? 'fisico' : 'tecnico');
        }
        // Los de 19 quedan reservados: si no, a los 20 se pierden.
        for (const k of s.academy.players.filter((x) => x.age >= 19 && !x.reserve)) s = toggleReserve(s, k.id);
        // Promover a los listos que estén a la altura del peor de su puesto.
        for (const k of [...s.academy.players].filter((x) => x.age >= 18 && !x.loanClubId).sort((a, b) => b.level - a.level)) {
            const worst = weakestReleasable(s, k.group);
            if (promoteBlock(s, k.id)) {
                if (!worst || worst.level > k.level + 2) continue;
                s = releasePlayer(s, worst.id);
            }
            s = promoteKid(s, k.id);
        }
        // Ceder a los dos mejores de 17 y 18 que quedan, con el plan de minutos.
        const loanable = s.academy.players
            .filter((x) => x.age >= 17 && x.age <= 18 && !x.loanClubId)
            .sort((a, b) => b.level - a.level || a.id.localeCompare(b.id))
            .slice(0, 2);
        for (const k of loanable) {
            s = setDevPlan(s, k.id, 'minutos');
            s = loanKid(s, k.id);
        }
        return s;
    }

    // Al azar.
    for (const k of [...s.academy.players]) {
        if (pick(10) < 2) s = setDevPlan(s, k.id, DEV_PLANS[pick(DEV_PLANS.length)].id);
        const now = s.academy.players.find((x) => x.id === k.id);
        if (!now) continue;
        if (now.age >= 18 && pick(10) < 4) {
            if (promoteBlock(s, k.id)) {
                const worst = weakestReleasable(s, now.group);
                if (worst) s = releasePlayer(s, worst.id);
            }
            s = promoteKid(s, k.id);
            continue;
        }
        if (now.age >= 18 && pick(10) < 2) s = toggleReserve(s, k.id);
        else if (now.age >= 17 && pick(10) < 1) s = loanKid(s, k.id);
        else if (pick(20) < 1) s = releaseKid(s, k.id);
    }
    return s;
}
