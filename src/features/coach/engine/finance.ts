// La deuda con consecuencias.
//
// Hasta la 1.4.0 la deuda solo sumaba presión: se podía seguir comprando mejoras,
// nada se recortaba y ningún jugador lo sentía. "Si tiene déficit no pasa nada"
// era literal. La instrucción del usuario (2026-10-14): "Si un club acumula
// déficit, debe enfrentar problemas reales: restricciones para incorporar
// jugadores, dificultades para renovar contratos, pérdida de capacidad
// competitiva, reducción de recursos, presión de la dirigencia y riesgo de
// crisis institucional. Las consecuencias deben ser proporcionales a la gravedad
// y duración del problema."
//
// La gravedad se mide en MESES de deuda (lo que tarda el club en salir del rojo
// con lo que entra) y la duración en CIERRES seguidos en grave. La duración NO se
// guarda en un contador: se deriva de `seasons[].finance.debt`, que es la foto
// congelada de cada cierre. Un contador sería una segunda fuente de verdad, y
// alcanzaría un cambio de club que se olvide de resetearlo para que la
// subcomisión intervenga un club que nunca debió nada.
//
//   sana        nada.
//   ajustada    < 3 meses. Los sponsors ponen un 10 % menos.
//   complicada  3 a 6. Mejoras bloqueadas, no se suben vínculos, atrasos: baja el
//               ánimo de los que cobran.
//   grave       ≥ 6. Al cerrar, PLAN DE AJUSTE automático y proporcional.
//   crónica     grave en dos cierres seguidos. INTERVENCIÓN: en el semipro se
//               libera el contrato más caro; el próximo cierre en grave es
//               despido seguro.
//
// Para salir, cuatro herramientas de pretemporada: el préstamo de la unión, el
// adelanto de cuotas, el evento a beneficio y los recortes. Todas dejan rastro
// en el estado (`CoachState.finance`) y en el presupuesto del año.
//
// Sin azar salvo el reemplazo del contrato liberado, que usa el RNG de la
// carrera que se le pasa: comprar, pedir un préstamo o recortar no consumen azar.

import { fechasOf, getCompetition } from '../data/competitions.ts';
import { statusOf, type ProStatus } from '../data/professionalism.ts';
import type {
    ClubFinances,
    CoachState,
    CostCutId,
    DebtStatus,
    FinanceState,
    SquadPlayer,
} from '../types/coach.ts';
import { CUOTA_ANUAL, debtLevel, debtMonths, formatMoney, seasonBudget, type SeasonBudget } from './economy.ts';
import type { Rng } from './random.ts';
import { payrollOf, promoteFromAcademy } from './squad.ts';
import { upgradeEffect, upkeepOf } from './upgrades.ts';

/* ------------------------------------------------------------------ */
/* Constantes                                                          */
/* ------------------------------------------------------------------ */

/** El préstamo de la unión: interés anual, cuotas y tamaño. */
export const LOAN_RATE = 0.18;
export const LOAN_SEASONS = 3;
/** Cuánto presta la unión: una fracción de lo que el club recauda en un año. */
export const LOAN_FRACTION = 0.2;

/** El adelanto de cuotas: una fracción de un año de cuotas, y lo que cuesta. */
export const ADVANCE_FRACTION = 0.2;
export const ADVANCE_SOCIOS_LOST = 0.04;
export const ADVANCE_HINCHADA_LOST = 3;

/** El evento a beneficio: por socio, más lo que pone la gente. */
const BENEFIT_PER_SOCIO = 1_000;
const BENEFIT_PER_SOCIO_HINCHADA = 30;
export const BENEFIT_HINCHADA_COST = 2;

/** Recortar viáticos y becas: cuánto se baja y lo que cuesta en el vestuario. */
export const CUT_VIATICOS = 0.25;
const CUT_VIATICOS_MORALE = 6;
const CUT_VIATICOS_COMMITMENT = 5;
/** Diferir el mantenimiento: la estructura se deteriora al cierre. */
export const CUT_MANTENIMIENTO_ESTRUCTURA = 3;

export const EMPTY_FINANCE: FinanceState = {
    loan: null,
    duesAdvances: [],
    benefit: null,
    cuts: { season: 0, kinds: [] },
    boardBudget: 0,
};

/* ------------------------------------------------------------------ */
/* El presupuesto de una partida                                       */
/* ------------------------------------------------------------------ */

/** Los recortes elegidos para ESTA temporada. */
export function activeCuts(state: Pick<CoachState, 'finance' | 'season'>): CostCutId[] {
    const cuts = state.finance?.cuts;
    return cuts && cuts.season === state.season ? cuts.kinds : [];
}

/** Las cuotas de esta temporada que ya se cobraron el año anterior. */
export function advancedDues(state: Pick<CoachState, 'finance' | 'season'>): number {
    return (state.finance?.duesAdvances ?? [])
        .filter((a) => a.season === state.season - 1)
        .reduce((s, a) => s + a.amount, 0);
}

/**
 * El presupuesto COMPLETO de la temporada en curso: sueldos, mantenimiento de las
 * mejoras, préstamo, adelantos, recortes y el ajuste de la subcomisión. Es la
 * única cuenta: la usan el cierre, la pantalla y el selector de eventos.
 */
export function budgetOf(
    state: CoachState,
    opts: { partidosCopa?: number; bancoCorto?: boolean; finances?: ClubFinances; squad?: readonly SquadPlayer[] } = {},
): SeasonBudget {
    const cuts = activeCuts(state);
    const finances = opts.finances ?? state.club.finances;
    // La plata del mercado de ESTA temporada (etapa 3): compensaciones e indemnizaciones.
    const ledger = state.transfers?.ledger?.season === state.season ? state.transfers.ledger : null;
    return seasonBudget({
        finances,
        competitionId: state.competitionId,
        fechas: fechasOf(state.competitionId, state.year),
        partidosCopa: opts.partidosCopa ?? 0,
        bancoCorto: opts.bancoCorto ?? (state.seasonMods.bancoCorto || cuts.includes('viajes')),
        gestion: state.coach.attrs.gestion,
        ahorroViajes: upgradeEffect(state.club, 'micro'),
        sueldos: payrollOf(opts.squad ?? state.squad),
        mantenimientoMejoras: upkeepOf(state.club, finances),
        loan: state.finance?.loan ?? null,
        cuotasAdelantadas: advancedDues(state),
        boardBudget: state.finance?.boardBudget ?? 0,
        mantenimientoDiferido: cuts.includes('mantenimiento'),
        compensaciones: ledger?.compensaciones ?? 0,
        indemnizaciones: ledger?.indemnizaciones ?? 0,
    });
}

/** La deuda que el club tiene de verdad: el descubierto más lo que falta devolver del préstamo. */
export function netDebt(state: Pick<CoachState, 'club' | 'finance'>): number {
    return Math.max(0, -state.club.finances.caja) + (state.finance?.loan?.balance ?? 0);
}

/* ------------------------------------------------------------------ */
/* El estado de la deuda                                               */
/* ------------------------------------------------------------------ */

export interface DebtRestrictions {
    /** Los sponsors ponen un 10 % menos (ajustada o peor). */
    sponsorPenalty: boolean;
    /** No se compran mejoras (complicada o peor). */
    upgradesBlocked: boolean;
    /** No se suman ni se suben becas, viáticos ni contratos (complicada o peor). */
    dealsFrozen: boolean;
    /** Al cerrar en grave, la subcomisión impone un plan de ajuste. */
    adjustmentPlan: boolean;
    /** Crónica: el próximo cierre en grave es despido seguro. */
    intervention: boolean;
}

export interface DebtView {
    status: DebtStatus;
    months: number;
    /** Lo que entra en el año, con lo que se miden los meses. */
    ingresos: number;
    /** Cierres seguidos en grave en este club, contando el último. */
    graveStreak: number;
    restrictions: DebtRestrictions;
    /** Lo que implica, en palabras, para la pantalla. */
    lines: string[];
}

/** La foto del último cierre en ESTE club, si la hay. */
function lastEntryHere(state: Pick<CoachState, 'seasons' | 'clubId'>) {
    const last = state.seasons[state.seasons.length - 1];
    return last && last.clubId === state.clubId ? last : null;
}

/** Cuántos cierres seguidos en grave (o crónica) lleva el club, contando hacia atrás. */
export function graveStreak(state: Pick<CoachState, 'seasons' | 'clubId'>): number {
    let n = 0;
    for (let i = state.seasons.length - 1; i >= 0; i--) {
        const e = state.seasons[i];
        if (e.clubId !== state.clubId) break;
        const d = e.finance?.debt;
        if (d === 'grave' || d === 'cronica') n++;
        else break;
    }
    return n;
}

function restrictionsFor(status: DebtStatus): DebtRestrictions {
    const rank = DEBT_RANK[status];
    return {
        sponsorPenalty: rank >= 1,
        upgradesBlocked: rank >= 2,
        dealsFrozen: rank >= 2,
        adjustmentPlan: rank >= 3,
        intervention: rank >= 4,
    };
}

const DEBT_RANK: Readonly<Record<DebtStatus, number>> = { sana: 0, ajustada: 1, complicada: 2, grave: 3, cronica: 4 };

export function debtRank(status: DebtStatus): number {
    return DEBT_RANK[status];
}

/**
 * El estado de la deuda HOY. Los meses salen de la caja de hoy (que ya incluye
 * un préstamo o un adelanto pedidos en la pretemporada: para eso están); la
 * duración, de los cierres anteriores. "Crónica" es estar en grave después de un
 * cierre que ya fue crónico o de dos cierres seguidos en grave.
 */
export function debtState(state: CoachState): DebtView {
    const budget = budgetOf(state);
    const months = debtMonths(state.club.finances.caja, budget.ingresos);
    const base = debtLevel(months);
    const streak = graveStreak(state);
    const status: DebtStatus = base === 'grave' && streak >= 2 ? 'cronica' : base;
    const restrictions = restrictionsFor(status);
    return { status, months, ingresos: budget.ingresos, graveStreak: streak, restrictions, lines: debtLines(status, streak, state) };
}

function debtLines(status: DebtStatus, streak: number, state: CoachState): string[] {
    const lines: string[] = [];
    const pro = statusOf(state.competitionId);
    if (status === 'sana') return ['Sin deuda: no hay ninguna restricción.'];
    lines.push('Los sponsors ponen un 10 % menos mientras haya deuda.');
    if (status === 'ajustada') {
        lines.push('Por ahora es una alerta: con tres meses de deuda se bloquean las compras.');
        return lines;
    }
    lines.push('No se compran mejoras hasta bajar de tres meses de deuda.');
    lines.push(
        pro === 'amateur'
            ? 'No se pueden dar becas nuevas ni subir las que hay.'
            : 'No se pueden sumar ni subir viáticos, becas ni contratos.',
    );
    lines.push('Los que cobran sufren atrasos: al cierre les baja el ánimo.');
    if (status === 'complicada') return lines;
    lines.push('Si se cierra el año así, la subcomisión impone un plan de ajuste: recorte de viáticos y becas, mantenimiento diferido y socios que se van.');
    if (status === 'grave' && streak === 1) {
        lines.push('Un segundo cierre seguido en grave es deuda crónica: intervención.');
    }
    if (status === 'cronica') {
        lines.push(
            pro === 'semipro'
                ? 'Deuda crónica: el club está intervenido. Ya se liberó el contrato más caro.'
                : 'Deuda crónica: el club está intervenido.',
        );
        lines.push('Otro cierre en grave y la subcomisión te despide, sin importar los resultados.');
    }
    return lines;
}

/* ------------------------------------------------------------------ */
/* El cierre: atrasos, plan de ajuste, intervención                    */
/* ------------------------------------------------------------------ */

export interface DebtSettlement {
    status: DebtStatus;
    months: number;
    squad: SquadPlayer[];
    finances: ClubFinances;
    /** Presión extra que suma la subcomisión por el plan de ajuste. */
    pressureExtra: number;
    /** El tercer cierre seguido en grave: despido seguro. */
    fired: boolean;
    /** Lo que se hizo, en frases, para el cierre y la trayectoria. */
    measures: string[];
}

/**
 * Lo que la deuda le hace al club al cerrar el año. Proporcional a la GRAVEDAD
 * (cuántos meses: la severidad va de 0 a los seis meses a 1 a los dieciocho) y a
 * la DURACIÓN (cuántos cierres seguidos en grave).
 *
 * Una mala temporada no colapsa al club: de sana a grave hay seis meses de deuda,
 * medio año de todo lo que entra. Lo medido está en `economy-objectives.test.ts`.
 */
export function settleDebt(args: {
    state: CoachState;
    rng: Rng;
    caja: number;
    ingresos: number;
    squad: readonly SquadPlayer[];
    finances: ClubFinances;
}): DebtSettlement {
    const { state, rng, caja, ingresos } = args;
    const months = debtMonths(caja, ingresos);
    const base = debtLevel(months);
    const prevStreak = graveStreak(state);
    let squad = [...args.squad];
    let finances = { ...args.finances, caja };
    let pressureExtra = 0;
    let fired = false;
    const measures: string[] = [];
    const pro: ProStatus = statusOf(state.competitionId);

    let status: DebtStatus = base;
    if (base === 'grave') {
        if (prevStreak >= 2) {
            status = 'cronica';
            fired = true;
            measures.push('Tercer cierre seguido en grave: la subcomisión interviene el club y te despide.');
        } else if (prevStreak === 1) {
            status = 'cronica';
            measures.push('Dos cierres seguidos en grave: deuda crónica, el club queda intervenido.');
        }
    }

    // Atrasos: los que cobran lo sienten desde "complicada".
    if (debtRank(status) >= 2) {
        let touched = 0;
        squad = squad.map((p) => {
            if (p.deal.monthly <= 0) return p;
            touched++;
            return { ...p, morale: clamp(p.morale - 4, 0, 100) };
        });
        if (touched > 0) measures.push(`Se pagó con atraso: baja el ánimo de los ${touched} que cobran.`);
    }

    // El plan de ajuste: grave o peor.
    if (debtRank(status) >= 3) {
        const sev = clamp((months - 6) / 12, 0, 1);
        const cut = 0.2 + 0.2 * sev;
        const moraleHit = Math.round(5 + 7 * sev);
        const commitmentHit = Math.round(4 + 6 * sev);
        let affected = 0;
        squad = squad.map((p) => {
            if (p.deal.kind !== 'viatico' && p.deal.kind !== 'beca') return p;
            affected++;
            return {
                ...p,
                deal: { ...p.deal, monthly: roundPay(p.deal.monthly * (1 - cut)) },
                morale: clamp(p.morale - moraleHit, 0, 100),
                commitment: clamp(p.commitment - commitmentHit, 0, 100),
            };
        });
        const estructuraLoss = 2 + Math.round(2 * sev);
        const sociosLoss = 0.03 + 0.03 * sev;
        const sociosBefore = finances.socios;
        finances = {
            ...finances,
            estructura: clamp(finances.estructura - estructuraLoss, 0, 100),
            socios: Math.max(60, Math.round(finances.socios * (1 - sociosLoss))),
        };
        pressureExtra = 4 + Math.round(4 * sev);
        measures.push('Plan de ajuste de la subcomisión:');
        if (affected > 0) {
            measures.push(`viáticos y becas recortados un ${Math.round(cut * 100)} % (${affected} jugadores, baja el ánimo y el arraigo);`);
        }
        measures.push(`mantenimiento diferido: la estructura pierde ${estructuraLoss} puntos;`);
        measures.push(`se van ${sociosBefore - finances.socios} socios.`);
    }

    // La intervención: el primer cierre crónico libera el contrato más caro.
    if (status === 'cronica' && !fired && prevStreak === 1 && pro === 'semipro') {
        let idx = -1;
        for (let i = 0; i < squad.length; i++) {
            const p = squad[i];
            if (p.deal.kind !== 'contrato') continue;
            if (idx < 0 || p.deal.monthly > squad[idx].deal.monthly || (p.deal.monthly === squad[idx].deal.monthly && p.id < squad[idx].id)) idx = i;
        }
        if (idx >= 0) {
            const gone = squad[idx];
            const rookie = promoteFromAcademy(
                rng,
                gone,
                state.world.ratings[state.clubId] ?? 20,
                state.clubId,
                state.season,
                upgradeEffect(state.club, 'm19'),
                state.competitionId,
            );
            squad = squad.map((p, i) => (i === idx ? rookie : p));
            measures.push(`Se libera el contrato más caro: ${gone.name} (${formatMoney(gone.deal.monthly * 12)} por año) deja el club.`);
        }
    }

    return { status, months, squad, finances, pressureExtra, fired, measures };
}

/* ------------------------------------------------------------------ */
/* Las herramientas para salir                                         */
/* ------------------------------------------------------------------ */

export type FinanceAction = 'prestamo' | 'adelanto' | 'beneficio' | CostCutId;

function round100k(v: number): number {
    return Math.round(v / 100_000) * 100_000;
}

function roundPay(v: number): number {
    return Math.round(v / 500) * 500;
}

/** Cuota fija anual de un préstamo francés. */
function annuity(principal: number, rate: number, n: number): number {
    return Math.round((principal * rate) / (1 - (1 + rate) ** -n));
}

export interface LoanOffer {
    amount: number;
    rate: number;
    seasons: number;
    payment: number;
    total: number;
}

/** Lo que la unión presta hoy: un quinto de lo que el club recauda en el año. */
export function loanOffer(state: CoachState): LoanOffer {
    const amount = round100k(budgetOf(state).ingresos * LOAN_FRACTION);
    const payment = annuity(amount, LOAN_RATE, LOAN_SEASONS);
    return { amount, rate: LOAN_RATE, seasons: LOAN_SEASONS, payment, total: payment * LOAN_SEASONS };
}

export function advanceOffer(state: CoachState): { amount: number; sociosLost: number; hinchadaLost: number } {
    const fin = state.club.finances;
    return {
        amount: round100k(fin.socios * CUOTA_ANUAL * ADVANCE_FRACTION),
        sociosLost: Math.round(fin.socios * ADVANCE_SOCIOS_LOST),
        hinchadaLost: ADVANCE_HINCHADA_LOST,
    };
}

/** Lo que rinde un evento a beneficio: más socios y más gente, más plata. */
export function benefitOffer(state: CoachState): { amount: number; hinchadaLost: number } {
    const fin = state.club.finances;
    return {
        amount: round100k(fin.socios * (BENEFIT_PER_SOCIO + BENEFIT_PER_SOCIO_HINCHADA * fin.hinchada)),
        hinchadaLost: BENEFIT_HINCHADA_COST,
    };
}

export interface CostCutOption {
    id: CostCutId;
    label: string;
    /** Qué se hace. */
    text: string;
    /** Lo que se resigna. */
    cost: string;
}

export const COST_CUTS: readonly CostCutOption[] = [
    {
        id: 'viajes',
        label: 'Viajar corto toda la temporada',
        text: 'Se viaja con 22 en vez de 26 a todos lados: el micro sale más barato.',
        cost: 'El banco queda sin primera línea de recambio: una lesión de pilar o hooker es scrum simulado.',
    },
    {
        id: 'viaticos',
        label: 'Recortar viáticos y becas',
        text: `Un ${Math.round(CUT_VIATICOS * 100)} % menos para los que cobran viático o beca. Los contratos no se tocan.`,
        cost: 'Baja el ánimo y el arraigo de los que cobran: algunos van a empezar a mirar otros clubes.',
    },
    {
        id: 'mantenimiento',
        label: 'Diferir el mantenimiento',
        text: 'Canchas, sede y mejoras con lo mínimo este año: la estructura cuesta menos y las mejoras, la mitad.',
        cost: `Al cierre la estructura pierde ${CUT_MANTENIMIENTO_ESTRUCTURA} puntos.`,
    },
];

/**
 * Por qué no se puede usar una herramienta, en palabras, o `null` si se puede.
 * Todas son de pretemporada: con la temporada en marcha la plata ya está
 * comprometida.
 */
export function financeActionBlock(state: CoachState, action: FinanceAction): string | null {
    if (state.phase !== 'preseason') return 'Solo se puede en la pretemporada.';
    const f = state.finance ?? EMPTY_FINANCE;
    if (action === 'prestamo') {
        if (f.loan && f.loan.balance > 0) return 'Ya hay un préstamo de la unión en curso: hasta terminar de pagarlo no hay otro.';
        if (loanOffer(state).amount <= 0) return 'La unión no presta a un club sin ingresos.';
        return null;
    }
    if (action === 'adelanto') {
        if (f.duesAdvances.some((a) => a.season === state.season)) return 'Las cuotas de este año ya se adelantaron.';
        return null;
    }
    if (action === 'beneficio') {
        if (f.benefit && f.benefit.season === state.season) return 'Ya se hizo un evento a beneficio esta temporada.';
        return null;
    }
    if (activeCuts(state).includes(action)) return 'Ese recorte ya está aplicado esta temporada.';
    if (action === 'viaticos' && !state.squad.some((p) => p.deal.kind === 'viatico' || p.deal.kind === 'beca')) {
        return 'Nadie cobra viático ni beca: no hay nada para recortar.';
    }
    return null;
}

function withFinance(state: CoachState, finance: FinanceState, finances: ClubFinances, squad = state.squad): CoachState {
    return { ...state, finance, club: { ...state.club, finances }, squad };
}

/**
 * Pide el préstamo de la unión. Entra la plata ya; la cuota fija (capital más
 * 18 % anual) entra en los egresos de esta temporada y las dos siguientes.
 * Devuelve el MISMO estado si no se puede.
 */
export function takeUnionLoan(state: CoachState): CoachState {
    if (financeActionBlock(state, 'prestamo')) return state;
    const offer = loanOffer(state);
    const f = state.finance ?? EMPTY_FINANCE;
    return withFinance(
        state,
        {
            ...f,
            loan: {
                principal: offer.amount,
                rate: offer.rate,
                balance: offer.amount,
                payment: offer.payment,
                seasonsLeft: offer.seasons,
                takenSeason: state.season,
            },
        },
        { ...state.club.finances, caja: state.club.finances.caja + offer.amount },
    );
}

/**
 * Adelanta cuotas del año que viene: la plata entra ya y se descuenta de las
 * cuotas de la temporada siguiente. Cuesta socios (el que no quiere pagar por
 * adelantado se va) y gente.
 */
export function advanceDues(state: CoachState): CoachState {
    if (financeActionBlock(state, 'adelanto')) return state;
    const offer = advanceOffer(state);
    const f = state.finance ?? EMPTY_FINANCE;
    const fin = state.club.finances;
    return withFinance(
        state,
        {
            ...f,
            duesAdvances: [...f.duesAdvances.filter((a) => a.season >= state.season - 1), { season: state.season, amount: offer.amount }],
        },
        {
            ...fin,
            caja: fin.caja + offer.amount,
            socios: Math.max(60, fin.socios - offer.sociosLost),
            hinchada: clamp(fin.hinchada - offer.hinchadaLost, 0, 100),
        },
    );
}

/** Un evento a beneficio: una cena, una rifa grande. Una vez por temporada. */
export function benefitEvent(state: CoachState): CoachState {
    if (financeActionBlock(state, 'beneficio')) return state;
    const offer = benefitOffer(state);
    const f = state.finance ?? EMPTY_FINANCE;
    const fin = state.club.finances;
    return withFinance(
        state,
        { ...f, benefit: { season: state.season, amount: offer.amount } },
        { ...fin, caja: fin.caja + offer.amount, hinchada: clamp(fin.hinchada - offer.hinchadaLost, 0, 100) },
    );
}

/**
 * Un recorte elegido por el entrenador, para toda la temporada. Viajar corto y
 * diferir el mantenimiento se leen del estado al jugar y al cerrar; el recorte
 * de viáticos cambia los vínculos ya, y es persistente.
 */
export function cutCosts(state: CoachState, kind: CostCutId): CoachState {
    if (financeActionBlock(state, kind)) return state;
    const f = state.finance ?? EMPTY_FINANCE;
    const kinds = [...activeCuts(state), kind].sort();
    let squad = state.squad;
    if (kind === 'viaticos') {
        squad = squad.map((p) =>
            p.deal.kind === 'viatico' || p.deal.kind === 'beca'
                ? {
                      ...p,
                      deal: { ...p.deal, monthly: roundPay(p.deal.monthly * (1 - CUT_VIATICOS)) },
                      morale: clamp(p.morale - CUT_VIATICOS_MORALE, 0, 100),
                      commitment: clamp(p.commitment - CUT_VIATICOS_COMMITMENT, 0, 100),
                  }
                : p,
        );
    }
    return withFinance(state, { ...f, cuts: { season: state.season, kinds } }, state.club.finances, squad);
}

/**
 * Lo que el préstamo queda debiendo después de pagar la cuota del año. Lo llama
 * el cierre con el presupuesto que se usó.
 */
export function payLoan(finance: FinanceState, budget: Pick<SeasonBudget, 'amortizacion'>): FinanceState {
    const loan = finance.loan;
    if (!loan) return finance;
    const balance = Math.max(0, loan.balance - budget.amortizacion);
    const seasonsLeft = loan.seasonsLeft - 1;
    return { ...finance, loan: seasonsLeft <= 0 || balance <= 0 ? null : { ...loan, balance, seasonsLeft } };
}

/** Lo que entra en la pantalla de la división: el estatus. */
export function proStatusOf(state: Pick<CoachState, 'competitionId'>): ProStatus {
    return statusOf(state.competitionId);
}

/** El escalón económico de la división. */
export function economicLevel(state: Pick<CoachState, 'competitionId'>): number {
    return getCompetition(state.competitionId)?.level ?? 4;
}

function clamp(v: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, v));
}
