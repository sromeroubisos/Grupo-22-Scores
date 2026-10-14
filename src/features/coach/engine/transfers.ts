// El mercado de jugadores, nacional e internacional (El Entrenador v2, etapa 3).
//
// DOS VENTANAS: la pretemporada (se abre al cerrar el año, con las estadísticas
// de la temporada que terminó) y una corta entre el tramo 1 y el 2 (con las del
// tramo 1). En cada una:
//
//   · OFERTAS por los jugadores del plantel. El interés sale del nivel frente a
//     su división, la edad, el techo y la FORMA de la etapa 2 (titularidades,
//     nota, tries). Cada oferta trae club, país, liga, el vínculo que le ofrecen,
//     la compensación para el club donde existe y la INCLINACIÓN del jugador, a
//     la vista como frase y como porcentaje.
//   · CANDIDATOS para incorporar: libres, los que vuelven del exterior, los que
//     quieren subir de categoría y extranjeros de la región donde el estatus lo
//     permite. La chance de que firmen sale del atractivo del club.
//   · VENCIMIENTOS: los vínculos con `years` en cero (bajan al cierre del año).
//   · PEDIDOS DE SALIDA: el que no juega y anda con el ánimo por el piso.
//   · CESIONES a un club de abajo: vuelve al año con crecimiento extra.
//
// LAS PUERTAS DEL EXTERIOR (CLAUDE.md §5, "la ventana del amateur no cruza la
// frontera"). El que tiene CONTRATO (el semiprofesional) recibe del mercado
// abierto: cualquier liga profesional o semiprofesional del catálogo de Carrera
// de Rugby donde le daría el nivel. El amateur, el becado y el del viático SOLO
// reciben del exterior por una VÍA DECLARADA (`data/transfer-pathways.ts`):
// franquicia, academia o convenio, cada una con su edad y su nivel mínimo. Y en
// los dos casos se elige primero la LIGA (cada liga elegible pesa uno) y después
// el club: la España de 44 clubes no le gana a la Georgia de 10 por volumen.
// Cuántas ofertas son del exterior lo decide `ABROAD_SHARE` por estatus, que es
// una puerta y no un multiplicador: no depende de cuántas ligas entran.
//
// IDENTIDAD AMATEUR. En una división amateur o con viáticos no hay pase: la
// compensación es cero, o una ayuda simbólica cuando un club profesional del
// exterior se lleva a un jugador, que entra a la caja y no se muestra como cifra
// sobre el jugador. El valor de mercado y la negociación de la compensación
// existen solo en el semiprofesional.
//
// DETERMINISMO. Todo el azar del mercado sale de RNG DERIVADOS de la semilla, la
// temporada, el club y el id de la oferta (`mrng`). Mirar el mercado, abrir una
// ventana o resolverla NO consume el RNG de la carrera: los partidos que siguen
// son los mismos que sin mercado, salvo por el plantel que cambió. Cuando hay que
// elegir entre candidatos, se ordenan por id antes.

import { getClub, toCoachRating } from '../data/clubs.ts';
import { URBA_TOP_ID, getCompetition, type CompetitionDef } from '../data/competitions.ts';
import { PAY_REFERENCE, statusOf, type ProStatus } from '../data/professionalism.ts';
import {
    COUNTRY_NAME,
    FRANCHISE_COUNTRY,
    REGIONAL_LEAGUES,
    RETURN_LEAGUES,
    TRANSFER_PATHWAYS,
    getPathway,
    type TransferPathway,
} from '../data/transfer-pathways.ts';
import { FIRST_NAMES, SURNAMES } from '../data/names.ts';
import { CLUBS as CAREER_CLUBS, LEAGUES as CAREER_LEAGUES } from '../../career/data/clubs.ts';
import type {
    ArrivalCandidate,
    CoachState,
    ExitRequest,
    LoanedPlayer,
    Negotiation,
    OfferedDeal,
    OfferRoute,
    PlayerDeal,
    PlayerOffer,
    PlayerStats,
    PositionGroup,
    SquadPlayer,
    TransferLogEntry,
    TransferState,
    WindowKind,
} from '../types/coach.ts';
import { takeFromAcademy } from './academy.ts';
import { debtState } from './finance.ts';
import { acceptCounter, makeOffer, startNegotiation, walkAway } from './negotiation.ts';
import { createRng, hashSeed, type Rng } from './random.ts';
import {
    GROUP_TARGET,
    PERSONALITIES,
    SQUAD_MAX,
    SQUAD_MIN,
    emptyStats,
    marketValue,
    payContext,
    playerLevelOf,
    promoteFromAcademy,
} from './squad.ts';
import { departures } from './tramos.ts';
import { upgradeEffect } from './upgrades.ts';
import { branches, clubsIn } from './world.ts';

/* ------------------------------------------------------------------ */
/* Constantes                                                          */
/* ------------------------------------------------------------------ */

/** El tope (26, con los cedidos) y el mínimo (23, sin ellos). Viven en `squad.ts`. */
export { SQUAD_MAX, SQUAD_MIN };

/** Ofertas como mucho por ventana: las más interesantes, si hay más. */
export const MAX_OFFERS: Readonly<Record<WindowKind, number>> = { pretemporada: 5, corta: 2 };
/** Candidatos por ventana. */
export const ARRIVALS: Readonly<Record<WindowKind, number>> = { pretemporada: 4, corta: 2 };
/** Pedidos de salida como mucho por ventana. */
export const MAX_REQUESTS = 3;

/**
 * La chance de una oferta por jugador y por ventana: `OFFER_SLOPE × (interés −
 * OFFER_FLOOR)`, entre 0 y `OFFER_MAX`, y en la ventana corta por
 * `SHORT_WINDOW_FACTOR` (medio tramo de mercado, no una pretemporada).
 *
 * MEDIDO (200 carreras × 12 temporadas, el mercado resuelto al azar; la tabla
 * entera está en `transfers.test.ts`): ofertas por titular y por temporada,
 * tercio de arriba / del medio / de abajo del XV —amateur 0,24 / 0,09 / 0,02;
 * viáticos 0,29 / 0,12 / 0,03; semiprofesional 0,40 / 0,28 / 0,10—. El mejor de
 * un club amateur recibe una oferta cada cuatro años; el suplente que no juega,
 * casi nunca. Con 0,07 de pendiente el tercio de arriba del amateur quedaba en
 * 0,21: subió a 0,08 para que el mercado se sienta, sin llegar a una feria.
 */
export const OFFER_FLOOR = 1;
export const OFFER_SLOPE = 0.08;
export const OFFER_MAX = 0.55;
export const SHORT_WINDOW_FACTOR = 0.4;

/**
 * La chance de que el club que se interesa sea de afuera, por el estatus de la
 * división. Es una puerta, no un peso por club: no se mueve si el catálogo de
 * Carrera suma ligas ni si a la rama le faltan escalones arriba. Como la puerta
 * del exterior además pide vía declarada o contrato, la parte REAL del exterior
 * queda bastante por debajo (medida en `transfers.test.ts`).
 */
export const ABROAD_SHARE: Readonly<Record<ProStatus, number>> = { amateur: 0.15, viaticos: 0.3, semipro: 0.7 };

/** Un club de otro lado lo quiere si el jugador le llega a esto de su nivel. */
export const FIT_BELOW = 3;
/** Y no lo llama un club mucho más flojo que él. */
export const FIT_ABOVE = 12;

/** La compensación simbólica de un club profesional del exterior a un club sin pase. */
const SYMBOLIC_FEE_BASE = 300_000;
const SYMBOLIC_FEE_PER_BAND = 100_000;

/** Lo que crece de más un cedido: una fracción de lo que le falta para su techo. */
export const LOAN_GROWTH = 0.18;
/** Lo que se le paga a un contratado que se libera antes de tiempo: seis meses. */
export const RELEASE_MONTHS = 6;

/** El que pide salir: ánimo por debajo de esto, o de `REQUEST_LOW_MINUTES_MORALE` y pocas titularidades. */
export const REQUEST_MORALE = 35;
export const REQUEST_LOW_MINUTES_MORALE = 45;
export const REQUEST_STARTS_SHARE = 0.3;

export const EMPTY_TRANSFERS: TransferState = {
    window: null,
    offers: [],
    arrivals: [],
    requests: [],
    loaned: [],
    ledger: { season: 0, compensaciones: 0, indemnizaciones: 0 },
    log: [],
    negotiation: null,
};

/* ------------------------------------------------------------------ */
/* El azar del mercado                                                 */
/* ------------------------------------------------------------------ */

/** RNG derivado: no toca el de la carrera. */
function mrng(state: Pick<CoachState, 'seed' | 'season' | 'clubId'>, tag: string): Rng {
    return createRng(hashSeed(`mercado:${state.seed}:${state.season}:${state.clubId}:${tag}`));
}

/** Una tirada derivada, 0..1, atada a un id estable. */
function roll(state: Pick<CoachState, 'seed'>, key: string): number {
    return createRng(hashSeed(`mercado:${state.seed}:${key}`)).next();
}

/* ------------------------------------------------------------------ */
/* El catálogo del exterior                                            */
/* ------------------------------------------------------------------ */

export type ForeignStatus = 'professional' | 'semi' | 'amateur';

export interface ForeignClub {
    id: string;
    name: string;
    league: string;
    leagueLabel: string;
    /** Código de país; las franquicias del Super Rugby Americas, el suyo. */
    country: string;
    status: ForeignStatus;
    /** 1 (amateur) a 6 (gigante): la billetera del club. */
    band: number;
    /** El nivel de un titular de ese club, en la escala del plantel. */
    level: number;
}

/** Fuerza del catálogo de Carrera → nivel de jugador. La misma conversión que el canon argentino. */
export function foreignLevelOf(careerRating: number): number {
    return playerLevelOf(toCoachRating(careerRating));
}

/**
 * Los 558 clubes del exterior del catálogo de Carrera de Rugby (todos los que no
 * son del canon argentino), ordenados por id. No se modifican: se leen.
 */
export const FOREIGN_CLUBS: readonly ForeignClub[] = CAREER_CLUBS.filter((c) => c.source !== 'canon-ar')
    .map((c) => ({
        id: c.id,
        name: c.name,
        league: c.competitionId,
        leagueLabel: CAREER_LEAGUES[c.competitionId]?.labelEs ?? c.competitionId,
        country: FRANCHISE_COUNTRY[c.id] ?? c.countryCode,
        status: c.professionalStatus,
        band: c.marketBand,
        level: Math.round(foreignLevelOf(c.rating) * 10) / 10,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));

const FOREIGN_BY_ID = new Map(FOREIGN_CLUBS.map((c) => [c.id, c]));
const FOREIGN_BY_LEAGUE = new Map<string, ForeignClub[]>();
for (const c of FOREIGN_CLUBS) {
    const list = FOREIGN_BY_LEAGUE.get(c.league) ?? [];
    list.push(c);
    FOREIGN_BY_LEAGUE.set(c.league, list);
}

export function foreignClub(id: string): ForeignClub | null {
    return FOREIGN_BY_ID.get(id) ?? null;
}

/** Las ligas del mercado abierto: las profesionales y semiprofesionales, ordenadas. */
export const OPEN_MARKET_LEAGUES: readonly string[] = [...FOREIGN_BY_LEAGUE.keys()]
    .filter((l) => (FOREIGN_BY_LEAGUE.get(l) ?? []).every((c) => c.status !== 'amateur'))
    .sort();

/**
 * Los clubes del catálogo que el mercado usa de verdad: los de las ligas del
 * mercado abierto, los de las vías declaradas y los de las ligas de donde llegan
 * extranjeros o vuelven argentinos. Lo cuenta `transfers.test.ts`.
 */
export function marketForeignClubs(): ForeignClub[] {
    const leagues = new Set<string>([
        ...OPEN_MARKET_LEAGUES,
        ...TRANSFER_PATHWAYS.flatMap((p) => p.leagues),
        ...REGIONAL_LEAGUES,
        ...RETURN_LEAGUES,
    ]);
    return FOREIGN_CLUBS.filter((c) => leagues.has(c.league));
}

/** Lo que se muestra de un club que llama o de donde viene alguien. */
export interface ClubInfo {
    name: string;
    country: string;
    league: string;
    status: string;
    abroad: boolean;
}

const FOREIGN_STATUS_LABEL: Readonly<Record<ForeignStatus, string>> = {
    professional: 'Profesional',
    semi: 'Semiprofesional',
    amateur: 'Amateur',
};

const AR_STATUS_LABEL: Readonly<Record<ProStatus, string>> = {
    amateur: 'Amateur',
    viaticos: 'Viáticos',
    semipro: 'Semiprofesional',
};

export function clubInfo(state: Pick<CoachState, 'world'>, clubId: string, abroad: boolean): ClubInfo {
    if (abroad) {
        const f = foreignClub(clubId);
        return {
            name: f?.name ?? clubId,
            country: COUNTRY_NAME[f?.country ?? ''] ?? (f?.country ?? ''),
            league: f?.leagueLabel ?? '',
            status: f ? FOREIGN_STATUS_LABEL[f.status] : '',
            abroad: true,
        };
    }
    const c = getClub(clubId);
    const compId = state.world.divisions[clubId] ?? c?.homeCompetitionId ?? '';
    return {
        name: c?.short ?? clubId,
        country: 'Argentina',
        league: getCompetition(compId)?.short ?? '',
        status: AR_STATUS_LABEL[statusOf(compId)],
        abroad: false,
    };
}

/* ------------------------------------------------------------------ */
/* La pirámide de acá                                                  */
/* ------------------------------------------------------------------ */

let BRANCHES: CompetitionDef[][] | null = null;

/** La rama de la pirámide de un torneo, de arriba hacia abajo. */
function branchOf(competitionId: string): CompetitionDef[] {
    BRANCHES ??= branches();
    return BRANCHES.find((b) => b.some((c) => c.id === competitionId)) ?? [];
}

/** Los torneos de arriba en la rama, del más cercano al más lejano. */
export function divisionsAbove(competitionId: string): CompetitionDef[] {
    const chain = branchOf(competitionId);
    const i = chain.findIndex((c) => c.id === competitionId);
    return i <= 0 ? [] : chain.slice(0, i).reverse();
}

/** Los torneos de abajo en la rama, del más cercano al más lejano. */
export function divisionsBelow(competitionId: string): CompetitionDef[] {
    const chain = branchOf(competitionId);
    const i = chain.findIndex((c) => c.id === competitionId);
    return i < 0 ? [] : chain.slice(i + 1);
}

/** El nivel de un titular de un club de acá. */
function clubLevel(state: Pick<CoachState, 'world'>, clubId: string): number {
    return playerLevelOf(state.world.ratings[clubId] ?? 20);
}

/** El nivel típico de una división: el del club del medio. */
export function divisionLevel(state: Pick<CoachState, 'world'>, competitionId: string): number {
    const ids = clubsIn(state.world, competitionId);
    if (ids.length === 0) return playerLevelOf(20);
    return clubLevel(state, ids[Math.floor(ids.length / 2)]);
}

/* ------------------------------------------------------------------ */
/* El interés: nivel, edad, techo y la forma de la etapa 2             */
/* ------------------------------------------------------------------ */

/** Las estadísticas con las que se mira a cada jugador, y cuántas fechas jugó el club en ese lapso. */
export interface FormRef {
    stats: Readonly<Record<string, PlayerStats>>;
    fixtures: number;
}

/** Tries por titularidad que se esperan de cada puesto. */
const TRY_RATE: Readonly<Record<PositionGroup, number>> = {
    fondo: 0.35,
    centros: 0.3,
    'tercera-linea': 0.18,
    medios: 0.12,
    'segunda-linea': 0.06,
    'primera-linea': 0.05,
};

/**
 * La forma: lo que dijeron las fechas. Titularidades (−2 a +2), la nota media
 * (6 es un partido normal) y los tries frente a lo que se espera de su puesto.
 * El que estuvo en el plantel y no jugó ni un minuto resta. Sin fechas en el
 * lapso (un club recién llegado), la forma no suma ni resta.
 */
export function formScore(p: Pick<SquadPlayer, 'id' | 'group'>, ref: FormRef | null): number {
    if (!ref || ref.fixtures <= 0) return 0;
    const s = ref.stats[p.id];
    if (!s || s.apps <= 0) return -2;
    const share = Math.min(1, s.starts / ref.fixtures);
    let f = (share - 0.5) * 4;
    f += (s.rating - 6) * 2.5;
    const rate = s.tries / Math.max(1, s.starts);
    f += clamp((rate - TRY_RATE[p.group]) * 6, -1, 2);
    return f;
}

/** Lo que pesa la edad: a los clubes les interesa el que tiene carrera por delante. */
function ageScore(age: number): number {
    if (age <= 21) return 1;
    if (age <= 27) return 1;
    if (age <= 30) return 0;
    if (age <= 32) return -2;
    return -4;
}

/** El interés que despierta un jugador. Sin azar: el mismo jugador, el mismo número. */
export function interestScore(p: SquadPlayer, ref: FormRef | null, divLevel: number): number {
    const levelRel = p.level - divLevel;
    const headroom = p.age <= 24 ? Math.min(3, Math.max(0, p.potential - p.level) * 0.2) : 0;
    return levelRel * 0.45 + ageScore(p.age) + headroom + formScore(p, ref);
}

/** La chance de una oferta en la ventana. */
export function offerChance(score: number, kind: WindowKind): number {
    const base = clamp(OFFER_SLOPE * (score - OFFER_FLOOR), 0, OFFER_MAX);
    return kind === 'corta' ? base * SHORT_WINDOW_FACTOR : base;
}

/* ------------------------------------------------------------------ */
/* Los vínculos                                                        */
/* ------------------------------------------------------------------ */

const DEAL_RANK: Readonly<Record<OfferedDeal, number>> = {
    amateur: 0,
    beca: 1,
    viatico: 2,
    contrato: 3,
    academia: 3,
    profesional: 5,
};

export const OFFERED_DEAL_LABEL: Readonly<Record<OfferedDeal, string>> = {
    amateur: 'jugar sin cobrar',
    beca: 'una beca',
    viatico: 'un viático',
    contrato: 'un contrato semiprofesional',
    academia: 'un lugar en la academia',
    profesional: 'un contrato profesional',
};

function roundPay(v: number): number {
    return Math.round(v / 500) * 500;
}

/** El viático de referencia de la división (100 %). */
export function viaticoReference(competitionId: string): number {
    const pay = payContext(competitionId);
    return PAY_REFERENCE.viaticoMensual[pay.level] ?? PAY_REFERENCE.viaticoMensual[4];
}

/**
 * El vínculo justo para un jugador de ese nivel en esa división: lo que pide
 * para firmar o para renovar, antes de su carácter. Es la misma escala de
 * `initialDeal` (`squad.ts`), sin azar. `levelRel` es su nivel menos el del club.
 */
export function fairDeal(competitionId: string, levelRel: number): PlayerDeal {
    const status = statusOf(competitionId);
    if (status === 'amateur') {
        return levelRel >= 6 ? { kind: 'beca', monthly: PAY_REFERENCE.becaMensual, years: 1 } : { kind: 'amateur', monthly: 0, years: 0 };
    }
    if (status === 'viaticos') {
        const byLevel = 0.85 + clamp(levelRel, -6, 8) * 0.03;
        return { kind: 'viatico', monthly: roundPay(viaticoReference(competitionId) * byLevel), years: 2 };
    }
    const { min, max } = PAY_REFERENCE.contratoMensual;
    const t = clamp((levelRel + 8) / 18, 0, 1);
    return { kind: 'contrato', monthly: roundPay(min + (max - min) * t), years: 2 };
}

/** Lo que el carácter le suma al pedido. */
function askPremium(p: Pick<SquadPlayer, 'personality'>): number {
    if (p.personality === 'ambicioso') return 1.1;
    if (p.personality === 'conflictivo') return 1.05;
    if (p.personality === 'leal') return 0.95;
    return 1;
}

/** El nivel del club del jugador (el base del plantel). */
function myBase(state: Pick<CoachState, 'world' | 'clubId'>): number {
    return clubLevel(state, state.clubId);
}

/**
 * Lo que pide un jugador para renovar: el vínculo justo para su nivel de hoy,
 * con su carácter. Una beca se renueva por la beca de siempre.
 */
export function renewalAsk(state: CoachState, p: SquadPlayer): PlayerDeal {
    if (p.deal.kind === 'beca') return { kind: 'beca', monthly: PAY_REFERENCE.becaMensual, years: 1 };
    // Si la división cambió de estatus (ascenso o descenso), pide lo que se usa
    // acá: el del contrato que bajó a los viáticos pide un viático, y en el
    // amateur ya no hay nada que renovar.
    const fair = fairDeal(state.competitionId, p.level - myBase(state));
    if (fair.kind === 'amateur' || fair.kind === 'beca') return { kind: 'amateur', monthly: 0, years: 0 };
    return { ...fair, monthly: roundPay(fair.monthly * askPremium(p)), years: 2 };
}

/* ------------------------------------------------------------------ */
/* La inclinación del jugador                                          */
/* ------------------------------------------------------------------ */

export interface Inclination {
    value: number;
    reasons: string[];
}

interface IncContext {
    buyerLevel: number;
    myLevel: number;
    deal: OfferedDeal;
    abroad: boolean;
    /** Titularidades sobre fechas, si se sabe. */
    share: number | null;
}

/**
 * Cuánto quiere irse, 0..100, y por qué. Sin azar. Pesa: el salto de nivel, la
 * plata (el vínculo que le ofrecen contra el que tiene), el arraigo, el ánimo,
 * los minutos y el carácter. Las razones son las que más pesan, en palabras.
 */
export function inclinationOf(p: SquadPlayer, ctx: IncContext): Inclination {
    const terms: { v: number; up: string; down: string }[] = [];
    const jump = clamp((ctx.buyerLevel - ctx.myLevel) * 1.5, -20, 20);
    terms.push({ v: jump, up: 'Allá jugaría un escalón más arriba.', down: 'Sería bajar de nivel.' });
    const money = (DEAL_RANK[ctx.deal] - DEAL_RANK[p.deal.kind]) * 8;
    terms.push({
        v: money,
        up: ctx.deal === 'profesional' ? 'Le ofrecen vivir del rugby.' : `Le ofrecen ${OFFERED_DEAL_LABEL[ctx.deal]}, más de lo que tiene acá.`,
        down: 'Allá cobraría menos que acá.',
    });
    terms.push({ v: -(p.commitment - 50) * 0.45, up: 'No tiene mucho arraigo en el club.', down: 'Es muy del club.' });
    terms.push({ v: (50 - p.morale) * 0.35, up: 'Anda con el ánimo por el piso.', down: 'Está contento acá.' });
    if (ctx.share !== null) {
        terms.push({ v: (0.5 - ctx.share) * 20, up: 'Acá juega poco.', down: 'Acá es titular.' });
    }
    const pers: Partial<Record<SquadPlayer['personality'], number>> = {
        ambicioso: 12,
        leal: -12,
        conflictivo: 6,
        tranquilo: -4,
        lider: -4,
        profesional: money > 0 ? 4 : 0,
    };
    const pv = pers[p.personality] ?? 0;
    terms.push({ v: pv, up: 'Es ambicioso: quiere más.', down: p.personality === 'leal' ? 'Es leal.' : 'No le gustan los cambios.' });
    if (ctx.abroad) {
        if (p.age >= 30) terms.push({ v: -8, up: '', down: 'A esta edad le cuesta mudarse.' });
        if (p.homegrown) terms.push({ v: -5, up: '', down: 'Se formó en el club.' });
        if (p.personality === 'ambicioso') terms.push({ v: 4, up: 'Quiere probar afuera.', down: '' });
    }
    const value = clamp(Math.round(45 + terms.reduce((s, t) => s + t.v, 0)), 5, 95);
    const reasons = [...terms]
        .filter((t) => Math.abs(t.v) >= 4)
        .sort((a, b) => Math.abs(b.v) - Math.abs(a.v))
        .map((t) => (t.v > 0 ? t.up : t.down))
        .filter((r) => r.length > 0)
        .slice(0, 3);
    return { value, reasons };
}

/** La inclinación en una frase. */
export function inclinationWord(v: number): string {
    if (v >= 70) return 'Se quiere ir';
    if (v >= 45) return 'Lo está pensando';
    return 'Prefiere quedarse';
}

/* ------------------------------------------------------------------ */
/* La compensación                                                     */
/* ------------------------------------------------------------------ */

export interface FeeTerms {
    /** Lo que ofrecen de entrada. */
    anchor: number;
    /** Lo máximo que pondrían. OCULTO. */
    reserve: number;
    /** Hay pase de verdad (cifra a la vista y negociable). */
    real: boolean;
}

/**
 * La compensación de una oferta. Hay pase de verdad solo si el club es
 * semiprofesional y el jugador tiene contrato: sale de su valor de mercado y de
 * la billetera del que compra. Si un club profesional del exterior se lleva a un
 * jugador de un club sin pase, deja una ayuda simbólica. El resto, nada.
 *
 * Sin azar de la carrera: la reserva sale de un RNG derivado del id de la oferta.
 */
export function feeTerms(state: CoachState, offer: Pick<PlayerOffer, 'id' | 'clubId' | 'abroad'>, p: SquadPlayer): FeeTerms {
    const status = statusOf(state.competitionId);
    const buyer = offer.abroad ? foreignClub(offer.clubId) : null;
    if (status === 'semipro' && p.deal.kind === 'contrato') {
        const value = marketValue(p, 'semipro') ?? 0;
        const band = buyer?.band ?? 3;
        const rng = createRng(hashSeed(`mercado:${state.seed}:${offer.id}:reserva`));
        const reserve = Math.round((value * (0.6 + 0.12 * band) * rng.float(0.9, 1.15)) / 50_000) * 50_000;
        const anchor = Math.round((reserve * rng.float(0.6, 0.75)) / 50_000) * 50_000;
        return { anchor, reserve: Math.max(anchor, reserve), real: reserve > 0 };
    }
    if (buyer && buyer.status === 'professional') {
        const symbolic = SYMBOLIC_FEE_BASE + SYMBOLIC_FEE_PER_BAND * buyer.band;
        return { anchor: symbolic, reserve: symbolic, real: false };
    }
    return { anchor: 0, reserve: 0, real: false };
}

/** ¿La compensación se puede mostrar y negociar? Solo en el semiprofesional. */
export function feeIsReal(state: Pick<CoachState, 'competitionId'>, offer: Pick<PlayerOffer, 'fee'>): boolean {
    return statusOf(state.competitionId) === 'semipro' && offer.fee > 0;
}

/* ------------------------------------------------------------------ */
/* Las ofertas                                                         */
/* ------------------------------------------------------------------ */

interface Destination {
    clubId: string;
    abroad: boolean;
    route: OfferRoute;
    pathwayId: string | null;
    deal: OfferedDeal;
    level: number;
}

function foreignDeal(c: ForeignClub, pathway: TransferPathway | null): OfferedDeal {
    if (pathway?.kind === 'academia') return 'academia';
    if (c.status === 'professional') return 'profesional';
    if (c.status === 'semi') return 'contrato';
    return 'beca';
}

/** ¿Una vía declarada le abre la puerta a este jugador para este club? */
export function pathwayAdmits(pathway: TransferPathway, p: Pick<SquadPlayer, 'age' | 'level' | 'potential'>, club: ForeignClub): boolean {
    return (
        pathway.leagues.includes(club.league)
        && p.age >= pathway.minAge
        && p.age <= pathway.maxAge
        && p.level >= pathway.minLevel
        && p.potential >= pathway.minPotential
        && p.level >= club.level - pathway.belowClub
    );
}

/** El exterior posible para un jugador: liga por liga, cada una con sus clubes que le darían. */
function abroadOptions(p: SquadPlayer): { league: string; clubs: ForeignClub[]; pathway: TransferPathway | null }[] {
    const out: { league: string; clubs: ForeignClub[]; pathway: TransferPathway | null }[] = [];
    if (p.deal.kind === 'contrato') {
        // Mercado abierto: el que tiene contrato va donde le dé el nivel.
        for (const league of OPEN_MARKET_LEAGUES) {
            const clubs = (FOREIGN_BY_LEAGUE.get(league) ?? []).filter(
                (c) => p.level >= c.level - FIT_BELOW && p.level <= c.level + FIT_ABOVE,
            );
            if (clubs.length > 0) out.push({ league, clubs, pathway: null });
        }
        return out;
    }
    // Sin contrato: solo por una vía declarada.
    for (const pathway of TRANSFER_PATHWAYS) {
        for (const league of pathway.leagues) {
            const clubs = (FOREIGN_BY_LEAGUE.get(league) ?? []).filter((c) => pathwayAdmits(pathway, p, c));
            if (clubs.length > 0) out.push({ league, clubs, pathway });
        }
    }
    return out;
}

/**
 * Los torneos de acá que pueden llamar: los de arriba en la rama, hasta dos
 * escalones. En el techo de una rama del interior, el Top 14 de la URBA: el
 * único semiprofesional del país (doc 2.8, "o el semipro de su rama") es el
 * escalón que le queda al mejor del interior sin cruzar la frontera.
 */
export function upperDivisions(competitionId: string): CompetitionDef[] {
    const above = divisionsAbove(competitionId).slice(0, 2);
    if (above.length > 0 || competitionId === URBA_TOP_ID) return above;
    const top = getCompetition(URBA_TOP_ID);
    return top ? [top] : [];
}

/** Los clubes de acá que lo querrían, torneo por torneo. */
function nationalOptions(state: CoachState, p: SquadPlayer): { compId: string; clubs: string[] }[] {
    const out: { compId: string; clubs: string[] }[] = [];
    for (const comp of upperDivisions(state.competitionId)) {
        const clubs = clubsIn(state.world, comp.id)
            .filter((id) => id !== state.clubId)
            .filter((id) => {
                const lv = clubLevel(state, id);
                return p.level >= lv - FIT_BELOW && p.level <= lv + FIT_ABOVE;
            })
            .sort((a, b) => a.localeCompare(b));
        if (clubs.length > 0) out.push({ compId: comp.id, clubs });
    }
    return out;
}

/** El club dentro de un mercado ya elegido: el que mejor le calza, con azar. */
function fitWeight(clubLevelV: number, playerLevel: number): number {
    return 1 / (1 + Math.abs(clubLevelV - (playerLevel - 2)) / 3);
}

function chooseDestination(state: CoachState, rng: Rng, p: SquadPlayer): Destination | null {
    // LA PUERTA, no un peso: primero se decide si el que llama es de afuera (con
    // la chance fija del estatus) y después se busca destino de ese lado. Si de
    // ese lado no hay nadie que lo quiera, no hay oferta. Así la parte del
    // exterior no crece porque falten clubes de arriba (el techo de una rama del
    // interior) ni porque el catálogo de Carrera sume ligas.
    const goAbroad = rng.chance(ABROAD_SHARE[statusOf(state.competitionId)]);
    const national = goAbroad ? [] : nationalOptions(state, p);
    const abroad = goAbroad ? abroadOptions(p) : [];
    if (national.length === 0 && abroad.length === 0) return null;
    if (goAbroad) {
        // LA PUERTA: primero la liga, cada una pesa uno; después el club.
        const pick = abroad[rng.int(0, abroad.length - 1)];
        const club = rng.weighted(pick.clubs, (c) => fitWeight(c.level, p.level));
        return {
            clubId: club.id,
            abroad: true,
            route: pick.pathway ? pick.pathway.kind : 'abierto',
            pathwayId: pick.pathway?.id ?? null,
            deal: foreignDeal(club, pick.pathway),
            level: club.level,
        };
    }
    // El escalón de arriba pesa el doble que el de dos arriba.
    const div = rng.weighted(national, (d) => (d === national[0] ? 2 : 1));
    const clubId = rng.weighted(div.clubs, (id) => fitWeight(clubLevel(state, id), p.level));
    const lv = clubLevel(state, clubId);
    const st = statusOf(div.compId);
    const deal: OfferedDeal =
        st === 'semipro' ? 'contrato' : st === 'viaticos' ? 'viatico' : p.level >= lv + 3 ? 'beca' : 'amateur';
    return { clubId, abroad: false, route: 'nacional', pathwayId: null, deal, level: lv };
}

/** Titularidades sobre fechas, o null si no hay fechas en el lapso. */
function shareOf(p: Pick<SquadPlayer, 'id'>, ref: FormRef | null): number | null {
    if (!ref || ref.fixtures <= 0) return null;
    return Math.min(1, (ref.stats[p.id]?.starts ?? 0) / ref.fixtures);
}

/**
 * Las ofertas de una ventana. PURA: mismo estado, misma ventana, mismas
 * estadísticas → mismas ofertas, y no toca el RNG de la carrera.
 */
export function generateOffers(state: CoachState, kind: WindowKind, ref: FormRef | null): PlayerOffer[] {
    const divLevel = divisionLevel(state, state.competitionId);
    const myLevel = myBase(state);
    const hits: { p: SquadPlayer; score: number; dest: Destination }[] = [];
    for (const p of [...state.squad].sort((a, b) => a.id.localeCompare(b.id))) {
        const score = interestScore(p, ref, divLevel);
        const chance = offerChance(score, kind);
        // Cada jugador consume siempre las mismas tiradas: lo que le pasa a uno no
        // corre la suerte del siguiente.
        const pr = createRng(hashSeed(`mercado:${state.seed}:${state.season}:${kind}:${p.id}`));
        if (!pr.chance(chance)) continue;
        const dest = chooseDestination(state, pr, p);
        if (dest) hits.push({ p, score, dest });
    }
    hits.sort((a, b) => b.score - a.score || a.p.id.localeCompare(b.p.id));
    return hits.slice(0, MAX_OFFERS[kind]).map(({ p, dest }) => {
        const id = `${state.season}-${kind === 'pretemporada' ? 'p' : 'c'}-${p.id}`;
        const inc = inclinationOf(p, {
            buyerLevel: dest.level,
            myLevel,
            deal: dest.deal,
            abroad: dest.abroad,
            share: shareOf(p, ref),
        });
        const offer: PlayerOffer = {
            id,
            playerId: p.id,
            clubId: dest.clubId,
            abroad: dest.abroad,
            route: dest.route,
            pathwayId: dest.pathwayId,
            deal: dest.deal,
            fee: 0,
            inclination: inc.value,
            reasons: inc.reasons,
            retainTried: false,
        };
        return { ...offer, fee: feeTerms(state, offer, p).anchor };
    });
}

/* ------------------------------------------------------------------ */
/* Los candidatos                                                      */
/* ------------------------------------------------------------------ */

/**
 * El atractivo del club para un jugador, 5..95: la categoría, la gente, la
 * estructura, cómo le fue el año pasado y el nombre del entrenador.
 */
export function clubAttraction(state: CoachState): number {
    const level = getCompetition(state.competitionId)?.level ?? 4;
    const fin = state.club.finances;
    let a = 30 + (5 - level) * 12 + (fin.hinchada - 50) * 0.2 + (fin.estructura - 50) * 0.2 + (state.coach.reputation - 40) * 0.25;
    const last = state.seasons[state.seasons.length - 1];
    if (last && last.clubId === state.clubId && last.teams > 1) {
        a += (1 - (last.position - 1) / (last.teams - 1)) * 16 - 8 + (last.champion ? 4 : 0);
    }
    return clamp(Math.round(a), 5, 95);
}

const ORIGIN_EASE: Readonly<Record<ArrivalCandidate['origin'], number>> = { libre: -5, vuelve: -10, sube: -12, region: 0 };

/** Lo que pesa cada origen, por estatus: en el amateur no llegan extranjeros. */
const ORIGIN_WEIGHT: Readonly<Record<ProStatus, Readonly<Record<ArrivalCandidate['origin'], number>>>> = {
    amateur: { libre: 3, vuelve: 1, sube: 3, region: 0 },
    viaticos: { libre: 3, vuelve: 2, sube: 3, region: 1.5 },
    semipro: { libre: 2, vuelve: 3, sube: 2, region: 2 },
};

const ORIGINS: readonly ArrivalCandidate['origin'][] = ['libre', 'vuelve', 'sube', 'region'];

/** El puesto que más falta contra la plantilla de 26. Desempata el orden fijo de los puestos. */
export function neediestGroup(players: readonly Pick<SquadPlayer, 'group'>[]): PositionGroup {
    const groups = Object.keys(GROUP_TARGET).sort() as PositionGroup[];
    let best = groups[0];
    let bestGap = -Infinity;
    for (const g of groups) {
        const gap = GROUP_TARGET[g] - players.filter((p) => p.group === g).length;
        if (gap > bestGap) {
            best = g;
            bestGap = gap;
        }
    }
    return best;
}

/** Los candidatos de una ventana. PURA y sin tocar el RNG de la carrera. */
export function generateArrivals(state: CoachState, kind: WindowKind): ArrivalCandidate[] {
    const rng = mrng(state, `llegadas:${kind}`);
    const status = statusOf(state.competitionId);
    const base = myBase(state);
    const attraction = clubAttraction(state);
    const roster = [...state.squad, ...(state.transfers?.loaned ?? []).map((l) => l.player)];
    const out: ArrivalCandidate[] = [];
    const below = divisionsBelow(state.competitionId)[0]?.id ?? state.competitionId;
    const lowerClubs = clubsIn(state.world, below)
        .filter((id) => id !== state.clubId)
        .sort((a, b) => a.localeCompare(b));
    for (let k = 0; k < ARRIVALS[kind]; k++) {
        const origin = rng.weighted(ORIGINS, (o) => ORIGIN_WEIGHT[status][o]);
        const group: PositionGroup = rng.chance(0.6)
            ? neediestGroup([...roster, ...out.map((c) => c.player)])
            : (Object.keys(GROUP_TARGET).sort() as PositionGroup[])[rng.int(0, 5)];
        let age: number;
        let level: number;
        let headroom: number;
        let fromClubId: string | null = null;
        let fromAbroad = false;
        if (origin === 'libre') {
            age = rng.int(23, 31);
            level = rng.normal(base, 4);
            headroom = rng.float(0, 4);
        } else if (origin === 'vuelve') {
            age = rng.int(27, 32);
            level = rng.normal(base + 3, 3);
            headroom = rng.float(0, 2);
            const pool = FOREIGN_CLUBS.filter((c) => RETURN_LEAGUES.includes(c.league));
            fromClubId = pool[rng.int(0, pool.length - 1)].id;
            fromAbroad = true;
        } else if (origin === 'sube') {
            age = rng.int(19, 24);
            level = rng.normal(base - 3, 3);
            headroom = rng.float(6, 12);
            fromClubId = lowerClubs.length > 0 ? lowerClubs[rng.int(0, lowerClubs.length - 1)] : null;
        } else {
            age = rng.int(21, 29);
            level = rng.normal(base + 1, 4);
            headroom = rng.float(1, 6);
            const pool = FOREIGN_CLUBS.filter((c) => REGIONAL_LEAGUES.includes(c.league));
            fromClubId = pool[rng.int(0, pool.length - 1)].id;
            fromAbroad = true;
        }
        level = clamp(round1(level), 12, 88);
        const levelRel = level - base;
        const personality = PERSONALITIES[rng.int(0, PERSONALITIES.length - 1)];
        const deal = fairDeal(state.competitionId, levelRel);
        const ask: PlayerDeal = origin === 'region' && deal.monthly > 0 ? { ...deal, monthly: roundPay(deal.monthly * 1.15) } : deal;
        const id = `${state.clubId}-s${state.season}-${kind === 'pretemporada' ? 'a' : 'b'}${k}`;
        const player: SquadPlayer = {
            id,
            name: `${rng.pick(FIRST_NAMES)} ${rng.pick(SURNAMES)}`,
            group,
            number: 0,
            age,
            level,
            potential: round1(clamp(level + headroom, level, 92)),
            frontRowCertified: group === 'primera-linea' && age >= 21,
            seasonsAtClub: 0,
            morale: rng.int(62, 75),
            fatigue: 0,
            injury: 0,
            personality,
            homegrown: false,
            commitment: rng.int(30, 45),
            deal: ask,
            stats: emptyStats(),
            career: emptyStats(),
        };
        const need = 45 + levelRel * 2.5 + ORIGIN_EASE[origin];
        let chance = clamp(50 + (attraction - need) * 1.2, 8, 92);
        let rivalClubId: string | null = null;
        if (rng.chance(0.35)) {
            const rivals = clubsIn(state.world, state.competitionId)
                .filter((id2) => id2 !== state.clubId)
                .sort((a, b) => a.localeCompare(b));
            if (rivals.length > 0) {
                rivalClubId = rivals[rng.int(0, rivals.length - 1)];
                const rivalA = clamp(attraction + rng.normal(4, 10), 5, 95);
                chance = clamp((chance * 2 * attraction) / (attraction + rivalA), 5, 92);
            }
        }
        const reasons: string[] = [];
        if (origin === 'vuelve') reasons.push('Vuelve del exterior y quiere jugar cerca de casa.');
        if (origin === 'sube') reasons.push('Quiere jugar en una categoría más alta.');
        if (origin === 'libre') reasons.push('Está libre: terminó su vínculo con su club.');
        if (origin === 'region') reasons.push('Quiere probar en el rugby argentino.');
        if (attraction >= need + 10) reasons.push('El club le resulta atractivo.');
        else if (attraction <= need - 10) reasons.push('Para lo que juega, el club le queda chico.');
        if (rivalClubId) reasons.push('Hay otro club que también lo quiere.');
        out.push({ id, origin, fromClubId, fromAbroad, player, chance: Math.round(chance), rivalClubId, reasons });
    }
    return out;
}

/* ------------------------------------------------------------------ */
/* Los pedidos de salida                                               */
/* ------------------------------------------------------------------ */

export function generateRequests(state: CoachState, ref: FormRef | null): ExitRequest[] {
    const out: ExitRequest[] = [];
    for (const p of [...state.squad].sort((a, b) => a.morale - b.morale || a.id.localeCompare(b.id))) {
        const share = shareOf(p, ref);
        const lowMinutes = share !== null && share < REQUEST_STARTS_SHARE;
        const threshold = p.personality === 'leal' ? REQUEST_MORALE - 5 : REQUEST_MORALE;
        const asks = p.morale < threshold || (lowMinutes && p.morale < REQUEST_LOW_MINUTES_MORALE && p.personality !== 'leal');
        if (!asks) continue;
        out.push({
            playerId: p.id,
            reason: lowMinutes
                ? 'No juega y anda con el ánimo por el piso: pide salir.'
                : 'Está disconforme y pide salir del club.',
        });
        if (out.length >= MAX_REQUESTS) break;
    }
    return out;
}

/* ------------------------------------------------------------------ */
/* Abrir y cerrar la ventana                                           */
/* ------------------------------------------------------------------ */

function transfersOf(state: Pick<CoachState, 'transfers'>): TransferState {
    return state.transfers ?? EMPTY_TRANSFERS;
}

/** Abre una ventana. No consume el RNG de la carrera. */
export function openWindow(state: CoachState, kind: WindowKind, ref: FormRef | null): CoachState {
    const t = transfersOf(state);
    const ledger = t.ledger.season === state.season ? t.ledger : { season: state.season, compensaciones: 0, indemnizaciones: 0 };
    const base: CoachState = {
        ...state,
        transfers: {
            ...t,
            window: { season: state.season, kind },
            offers: [],
            arrivals: [],
            requests: [],
            ledger,
            log: t.log.filter((e) => e.season >= state.season - 1),
            negotiation: null,
        },
    };
    return {
        ...base,
        transfers: {
            ...base.transfers,
            offers: generateOffers(base, kind, ref),
            arrivals: generateArrivals(base, kind),
            requests: generateRequests(base, ref),
        },
    };
}

/** Las estadísticas del tramo jugado, para la ventana corta. */
export function inSeasonRef(state: CoachState): FormRef {
    const ins = state.inSeason;
    const fixtures = ins ? ins.matches.filter((m) => m.homeId === state.clubId || m.awayId === state.clubId).length : 0;
    const stats: Record<string, PlayerStats> = {};
    for (const p of state.squad) stats[p.id] = p.stats;
    return { stats, fixtures };
}

/** Los vínculos vencidos: cobran algo y no les queda ningún año. */
export function expiringPlayers(state: Pick<CoachState, 'squad' | 'transfers'>): SquadPlayer[] {
    if (transfersOf(state).window?.kind !== 'pretemporada') return [];
    return state.squad
        .filter((p) => p.deal.kind !== 'amateur' && p.deal.years <= 0)
        .sort((a, b) => a.number - b.number || a.id.localeCompare(b.id));
}

/**
 * Cierra la ventana con lo que quedó sin resolver, y lo que quedó se resuelve
 * como se resolvería en un club de verdad:
 *   · la oferta sin contestar se rechaza (y el que se quería ir lo siente);
 *   · el vínculo vencido se renueva por lo que pide, si la caja lo deja; si la
 *     deuda no deja subirlo, el del contrato se va y el del viático o la beca
 *     se queda sin cobrar;
 *   · el pedido de salida sin contestar queda en nada, y el ánimo baja.
 * No consume el RNG de la carrera.
 */
export function closeWindow(state: CoachState): CoachState {
    const t = transfersOf(state);
    if (!t.window) return t.negotiation ? { ...state, transfers: { ...t, negotiation: null } } : state;
    let s: CoachState = { ...state, transfers: { ...t, negotiation: null } };
    for (const o of [...t.offers]) s = rejectPlayerOffer(s, o.id);
    for (const r of [...transfersOf(s).requests]) s = denyRequest(s, r.playerId, false);
    if (t.window.kind === 'pretemporada') {
        for (const p of expiringPlayers(s)) {
            const renewed = renewAtAsk(s, p.id);
            s = renewed !== s ? renewed : expireDeal(s, p.id);
        }
    }
    const tt = transfersOf(s);
    return { ...s, transfers: { ...tt, window: null, offers: [], arrivals: [], requests: [], negotiation: null } };
}

/* ------------------------------------------------------------------ */
/* El plantel: salidas, llegadas y el mínimo                           */
/* ------------------------------------------------------------------ */

/** El plantel completo: los del club y los cedidos. */
export function rosterSize(state: Pick<CoachState, 'squad' | 'transfers'>): number {
    return state.squad.length + transfersOf(state).loaned.length;
}

function usedNumbers(state: Pick<CoachState, 'squad' | 'transfers'>): Set<number> {
    return new Set([...state.squad.map((p) => p.number), ...transfersOf(state).loaned.map((l) => l.player.number)]);
}

/** El dorsal más bajo libre: el que llega se pone el que dejó el que se fue. */
function freeNumber(state: Pick<CoachState, 'squad' | 'transfers'>): number {
    const used = usedNumbers(state);
    let n = 1;
    while (used.has(n)) n++;
    return n;
}

function uniqueId(state: Pick<CoachState, 'squad' | 'transfers'>, id: string): string {
    const ids = new Set([...state.squad.map((p) => p.id), ...transfersOf(state).loaned.map((l) => l.player.id)]);
    let out = id;
    while (ids.has(out)) out = `${out}x`;
    return out;
}

/**
 * Completa el plantel hasta `target`, cada lugar con el puesto que más falta.
 * Desde la etapa 4, PRIMERO con el M19 de verdad (`takeFromAcademy`: el mejor
 * de 18 o más de ese puesto, o el mejor de cualquiera) y solo si el M19 no
 * tiene a nadie, con un libre generado como antes. `countLoaned`: el tope de 26
 * cuenta a los cedidos; el mínimo de 23 no. RNG derivado: no corre la carrera.
 */
export function fillFromAcademy(state: CoachState, target: number, countLoaned: boolean, tag: string): CoachState {
    let s = state;
    const size = () => (countLoaned ? rosterSize(s) : s.squad.length);
    const rng = mrng(state, `m19:${tag}`);
    for (let guard = 0; guard < SQUAD_MAX && size() < target; guard++) {
        const group = neediestGroup([...s.squad, ...transfersOf(s).loaned.map((l) => l.player)]);
        const fromM19 = takeFromAcademy(s, group);
        if (fromM19) {
            s = fromM19;
            continue;
        }
        const number = freeNumber(s);
        const kid = promoteFromAcademy(
            rng,
            { group, number },
            s.world.ratings[s.clubId] ?? 20,
            s.clubId,
            s.season,
            upgradeEffect(s.club, 'm19'),
            s.competitionId,
        );
        // El id lleva `-m` (intermedia) y no `-n`: el `-s{temporada}-n{dorsal}` es
        // el del pibe que reemplaza a uno en una tarjeta (`apply-decision.ts`), y
        // dos jugadores con el mismo id se acreditarían los mismos tries.
        s = { ...s, squad: [...s.squad, { ...kid, id: uniqueId(s, `${s.clubId}-s${s.season}-m${number}`) }] };
    }
    return s;
}

function addLog(state: CoachState, kind: TransferLogEntry['kind'], text: string): CoachState {
    const t = transfersOf(state);
    const entry: TransferLogEntry = { season: state.season, window: t.window?.kind ?? 'pretemporada', kind, text };
    return { ...state, transfers: { ...t, log: [...t.log, entry] } };
}

function surname(name: string): string {
    const parts = name.trim().split(' ');
    return parts[parts.length - 1];
}

/**
 * Un jugador deja el club. Lo que sumó en el año queda en la planilla (los tries
 * del club siguen siendo la suma de los de sus jugadores), se van las ofertas y
 * pedidos que lo nombran, y si el plantel queda por debajo de 23 sube un pibe.
 */
function depart(state: CoachState, playerId: string, fee: number, indemnizacion: number): CoachState {
    const p = state.squad.find((x) => x.id === playerId);
    if (!p) return state;
    const squad = state.squad.filter((x) => x.id !== playerId);
    const gone = state.inSeason ? departures([p], []) : [];
    const t = transfersOf(state);
    const ledger = t.ledger.season === state.season ? t.ledger : { season: state.season, compensaciones: 0, indemnizaciones: 0 };
    const s: CoachState = {
        ...state,
        squad,
        inSeason: state.inSeason && gone.length > 0 ? { ...state.inSeason, gone: [...state.inSeason.gone, ...gone] } : state.inSeason,
        transfers: {
            ...t,
            offers: t.offers.filter((o) => o.playerId !== playerId),
            requests: t.requests.filter((r) => r.playerId !== playerId),
            negotiation: null,
            ledger: {
                ...ledger,
                compensaciones: ledger.compensaciones + Math.max(0, Math.round(fee)),
                indemnizaciones: ledger.indemnizaciones + Math.max(0, Math.round(indemnizacion)),
            },
        },
    };
    return fillFromAcademy(s, SQUAD_MIN, false, `salida:${playerId}`);
}

/* ------------------------------------------------------------------ */
/* Decisiones sobre una oferta                                         */
/* ------------------------------------------------------------------ */

function findOffer(state: CoachState, offerId: string): PlayerOffer | null {
    return transfersOf(state).offers.find((o) => o.id === offerId) ?? null;
}

/**
 * El club acepta. El jugador decide con la chance que se mostraba (su
 * inclinación), con una tirada derivada del id de la oferta: la misma partida,
 * la misma respuesta. Si se va, la compensación entra al presupuesto del año.
 */
export function acceptPlayerOffer(state: CoachState, offerId: string): CoachState {
    const offer = findOffer(state, offerId);
    const p = offer ? state.squad.find((x) => x.id === offer.playerId) : undefined;
    if (!offer || !p) return state;
    const club = clubInfo(state, offer.clubId, offer.abroad).name;
    if (roll(state, `${offer.id}:respuesta`) * 100 < offer.inclination) {
        const left = depart(state, p.id, offer.fee, 0);
        return addLog(left, 'salida', `${p.name} se va a ${club}.`);
    }
    const t = transfersOf(state);
    const s: CoachState = {
        ...state,
        squad: state.squad.map((x) => (x.id === p.id ? { ...x, commitment: clamp(x.commitment + 6, 0, 100), morale: clamp(x.morale + 2, 0, 100) } : x)),
        transfers: { ...t, offers: t.offers.filter((o) => o.id !== offerId), negotiation: null },
    };
    return addLog(s, 'se-queda', `${p.name} tenía la puerta abierta para ir a ${club} y eligió quedarse.`);
}

/**
 * El club dice que no. Si el jugador se quería ir (inclinación de 50 o más), le
 * pega: baja el ánimo y el arraigo, y si cae lo suficiente va a volver a pedir.
 */
export function rejectPlayerOffer(state: CoachState, offerId: string): CoachState {
    const offer = findOffer(state, offerId);
    if (!offer) return state;
    const t = transfersOf(state);
    const hit = offer.inclination >= 50;
    return {
        ...state,
        squad: hit
            ? state.squad.map((x) =>
                  x.id === offer.playerId
                      ? {
                            ...x,
                            morale: clamp(x.morale - (8 + (x.personality === 'ambicioso' ? 6 : 0)), 0, 100),
                            commitment: clamp(x.commitment - 4, 0, 100),
                        }
                      : x,
              )
            : state.squad,
        transfers: {
            ...t,
            offers: t.offers.filter((o) => o.id !== offerId),
            negotiation: t.negotiation?.target.kind === 'venta' && t.negotiation.target.offerId === offerId ? null : t.negotiation,
        },
    };
}

export interface RetainTerms {
    deal: PlayerDeal;
    /** Qué se le ofrece, en palabras (sin pesos en el amateur ni en los viáticos). */
    label: string;
    /** La chance (0..100) de que alcance. Se muestra. */
    chance: number;
}

/** Lo que el club le puede ofrecer para retenerlo, según el estatus de la división. */
export function retainTerms(state: CoachState, offer: PlayerOffer): RetainTerms | null {
    const p = state.squad.find((x) => x.id === offer.playerId);
    if (!p) return null;
    const status = statusOf(state.competitionId);
    const levelRel = p.level - myBase(state);
    let deal: PlayerDeal | null = null;
    let label = '';
    if (status === 'amateur') {
        if (p.deal.kind === 'amateur') {
            deal = { kind: 'beca', monthly: PAY_REFERENCE.becaMensual, years: 1 };
            label = 'Conseguirle una beca';
        }
    } else if (status === 'viaticos') {
        const ref = viaticoReference(state.competitionId);
        if (p.deal.kind === 'viatico') {
            const monthly = roundPay(p.deal.monthly * 1.25);
            if (monthly <= ref * 1.6) {
                deal = { kind: 'viatico', monthly, years: 2 };
                label = 'Subirle el viático';
            }
        } else {
            deal = { ...fairDeal(state.competitionId, levelRel), kind: 'viatico', years: 2 };
            label = 'Darle un viático';
        }
    } else {
        const { max } = PAY_REFERENCE.contratoMensual;
        if (p.deal.kind === 'contrato') {
            const monthly = roundPay(p.deal.monthly * 1.3);
            if (monthly <= max * 1.3) {
                deal = { kind: 'contrato', monthly, years: Math.max(2, p.deal.years + 2) };
                label = 'Mejorarle el contrato';
            }
        } else {
            deal = { ...fairDeal(state.competitionId, levelRel), years: 2 };
            label = 'Ofrecerle un contrato';
        }
    }
    if (!deal) return null;
    const chance = clamp(Math.round(100 - offer.inclination * 0.7 - (offer.deal === 'profesional' ? 20 : 0) + 15), 10, 95);
    return { deal, label, chance };
}

/** Por qué no se puede retener, o null si se puede. */
export function retainBlock(state: CoachState, offerId: string): string | null {
    const offer = findOffer(state, offerId);
    if (!offer) return 'La oferta ya no está sobre la mesa.';
    if (offer.retainTried) return 'Ya se intentó retenerlo y no alcanzó.';
    if (debtState(state).restrictions.dealsFrozen) {
        return 'Con la deuda complicada no se pueden sumar ni subir becas, viáticos ni contratos.';
    }
    if (!retainTerms(state, offer)) {
        return statusOf(state.competitionId) === 'amateur'
            ? 'Ya tiene beca: un club amateur no tiene más para ofrecerle.'
            : 'Ya cobra lo máximo que el club puede pagar.';
    }
    return null;
}

/**
 * Retener: se le mejora el vínculo. Si alcanza (la chance que se mostraba), se
 * queda con más arraigo y la oferta se cae; si no, la oferta sigue en la mesa y
 * el vínculo no cambia.
 */
export function retainPlayer(state: CoachState, offerId: string): CoachState {
    if (retainBlock(state, offerId)) return state;
    const offer = findOffer(state, offerId) as PlayerOffer;
    const terms = retainTerms(state, offer) as RetainTerms;
    const p = state.squad.find((x) => x.id === offer.playerId) as SquadPlayer;
    const t = transfersOf(state);
    if (roll(state, `${offer.id}:retener`) * 100 < terms.chance) {
        const s: CoachState = {
            ...state,
            squad: state.squad.map((x) =>
                x.id === p.id
                    ? { ...x, deal: terms.deal, commitment: clamp(x.commitment + 10, 0, 100), morale: clamp(x.morale + 6, 0, 100) }
                    : x,
            ),
            transfers: { ...t, offers: t.offers.filter((o) => o.playerId !== p.id), negotiation: null },
        };
        return addLog(s, 'retenido', `${p.name} se queda: ${terms.label.toLowerCase()} alcanzó.`);
    }
    return {
        ...state,
        squad: state.squad.map((x) => (x.id === p.id ? { ...x, morale: clamp(x.morale - 3, 0, 100) } : x)),
        transfers: { ...t, offers: t.offers.map((o) => (o.id === offerId ? { ...o, retainTried: true } : o)) },
    };
}

/* ------------------------------------------------------------------ */
/* La negociación sobre el mercado                                     */
/* ------------------------------------------------------------------ */

/** Por qué no se puede negociar la compensación, o null si se puede. */
export function feeNegotiationBlock(state: CoachState, offerId: string): string | null {
    const offer = findOffer(state, offerId);
    if (!offer) return 'La oferta ya no está sobre la mesa.';
    if (transfersOf(state).negotiation) return 'Hay otra negociación abierta.';
    if (!feeIsReal(state, offer)) {
        return statusOf(state.competitionId) === 'semipro'
            ? 'No tiene contrato: no hay compensación que negociar.'
            : 'En esta división no hay pase: no hay compensación que negociar.';
    }
    return null;
}

export function openFeeNegotiation(state: CoachState, offerId: string): CoachState {
    if (feeNegotiationBlock(state, offerId)) return state;
    const offer = findOffer(state, offerId) as PlayerOffer;
    const p = state.squad.find((x) => x.id === offer.playerId) as SquadPlayer;
    const terms = feeTerms(state, offer, p);
    const buyer = clubInfo(state, offer.clubId, offer.abroad).name;
    const neg = startNegotiation({
        subject: `La compensación de ${buyer} por ${p.name}`,
        side: 'venta',
        unit: 'pesos',
        anchor: offer.fee,
        reserve: terms.reserve,
        patience: 3 + ((foreignClub(offer.clubId)?.band ?? 3) >= 4 ? 1 : 0),
        step: 50_000,
    });
    return { ...state, transfers: { ...transfersOf(state), negotiation: { target: { kind: 'venta', offerId }, neg } } };
}

/** Por qué no se puede renovar por lo que pide, o null. */
export function renewBlock(state: CoachState, playerId: string): string | null {
    const p = state.squad.find((x) => x.id === playerId);
    if (!p || !expiringPlayers(state).some((x) => x.id === playerId)) return 'No tiene un vínculo vencido.';
    const ask = renewalAsk(state, p);
    if (ask.kind === 'amateur') return 'En esta división ya no se paga ese vínculo.';
    if (debtState(state).restrictions.dealsFrozen && ask.monthly > p.deal.monthly) {
        return 'Con la deuda complicada solo se renueva por lo mismo o menos, y pide más.';
    }
    return null;
}

/** Renueva por lo que pide, sin negociar. Devuelve el MISMO estado si no se puede. */
export function renewAtAsk(state: CoachState, playerId: string): CoachState {
    if (renewBlock(state, playerId)) return state;
    const p = state.squad.find((x) => x.id === playerId) as SquadPlayer;
    return renewWith(state, p, renewalAsk(state, p));
}

function renewWith(state: CoachState, p: SquadPlayer, deal: PlayerDeal): CoachState {
    const s: CoachState = {
        ...state,
        squad: state.squad.map((x) => (x.id === p.id ? { ...x, deal, morale: clamp(x.morale + 3, 0, 100) } : x)),
    };
    return addLog(s, 'renovacion', `${p.name} renovó por ${deal.years} ${deal.years === 1 ? 'año' : 'años'}.`);
}

/** Renueva a todos los vencidos por lo que piden. Los que no se pueden quedan como estaban. */
export function renewAllAtAsk(state: CoachState): CoachState {
    let s = state;
    for (const p of expiringPlayers(state)) s = renewAtAsk(s, p.id);
    return s;
}

/**
 * Lo que pasa con un vínculo vencido que no se renueva: el del contrato se va
 * libre; el del viático, si es ambicioso o conflictivo, también; el resto se
 * queda a jugar sin cobrar, con el ánimo y el arraigo en baja. La beca se pierde.
 */
export function expireDeal(state: CoachState, playerId: string): CoachState {
    const p = state.squad.find((x) => x.id === playerId);
    if (!p || p.deal.kind === 'amateur') return state;
    const leaves = p.deal.kind === 'contrato' || (p.deal.kind === 'viatico' && (p.personality === 'ambicioso' || p.personality === 'conflictivo'));
    if (leaves) return addLog(depart(state, p.id, 0, 0), 'libre', `${p.name} terminó su vínculo y se va libre.`);
    const s: CoachState = {
        ...state,
        squad: state.squad.map((x) =>
            x.id === p.id
                ? {
                      ...x,
                      deal: { kind: 'amateur', monthly: 0, years: 0 },
                      morale: clamp(x.morale - 8, 0, 100),
                      commitment: clamp(x.commitment - 8, 0, 100),
                  }
                : x,
        ),
    };
    return addLog(s, 'libre', `${p.name} se queda, pero ya no cobra ${p.deal.kind === 'beca' ? 'la beca' : 'el viático'}.`);
}

/** Dejar ir a un vencido sin esperar el cierre de la ventana. */
export function letExpire(state: CoachState, playerId: string): CoachState {
    if (!expiringPlayers(state).some((x) => x.id === playerId)) return state;
    return expireDeal(state, playerId);
}

/** El viático en porcentaje del de referencia: en los viáticos no se habla en pesos. */
function pctOf(state: CoachState, monthly: number): number {
    return Math.round((monthly / viaticoReference(state.competitionId)) * 100);
}

function monthlyOfPct(state: CoachState, pct: number): number {
    return roundPay((viaticoReference(state.competitionId) * pct) / 100);
}

/** Por qué no se puede negociar la renovación, o null. */
export function renewalNegotiationBlock(state: CoachState, playerId: string): string | null {
    const p = state.squad.find((x) => x.id === playerId);
    if (!p || !expiringPlayers(state).some((x) => x.id === playerId)) return 'No tiene un vínculo vencido.';
    if (transfersOf(state).negotiation) return 'Hay otra negociación abierta.';
    if (p.deal.kind === 'beca') return 'La beca es una sola: se renueva o no.';
    if (renewalAsk(state, p).kind === 'amateur') return 'En esta división ya no se paga ese vínculo.';
    if (debtState(state).restrictions.dealsFrozen) return 'Con la deuda complicada no se negocian vínculos: solo se renueva por lo mismo.';
    return null;
}

export function openRenewalNegotiation(state: CoachState, playerId: string): CoachState {
    if (renewalNegotiationBlock(state, playerId)) return state;
    const p = state.squad.find((x) => x.id === playerId) as SquadPlayer;
    const ask = renewalAsk(state, p);
    const rng = createRng(hashSeed(`mercado:${state.seed}:${state.season}:${p.id}:renovacion`));
    const reserveFactor = rng.float(0.8, 0.93);
    const patience = 3 + (p.personality === 'leal' ? 1 : 0) - (p.personality === 'conflictivo' ? 1 : 0);
    const viatico = ask.kind === 'viatico';
    const neg = startNegotiation({
        subject: `La renovación de ${p.name}`,
        side: 'compra',
        unit: viatico ? 'porcentaje' : 'pesos',
        anchor: viatico ? pctOf(state, ask.monthly) : ask.monthly,
        reserve: viatico ? pctOf(state, ask.monthly * reserveFactor) : ask.monthly * reserveFactor,
        patience,
        step: viatico ? 1 : 500,
    });
    return { ...state, transfers: { ...transfersOf(state), negotiation: { target: { kind: 'renovacion', playerId }, neg } } };
}

/* ------------------------------------------------------------------ */
/* Llegadas                                                            */
/* ------------------------------------------------------------------ */

function findCandidate(state: CoachState, id: string): ArrivalCandidate | null {
    return transfersOf(state).arrivals.find((c) => c.id === id) ?? null;
}

/** Por qué no se puede incorporar, o null. */
export function signBlock(state: CoachState, candidateId: string): string | null {
    const c = findCandidate(state, candidateId);
    if (!c) return 'Ya no está disponible.';
    if (rosterSize(state) >= SQUAD_MAX) {
        return `El plantel está completo (${SQUAD_MAX} con los cedidos): hay que liberar a alguien. Un cedido sigue ocupando su lugar: vuelve al cerrar el año.`;
    }
    if (c.player.deal.monthly > 0 && debtState(state).restrictions.dealsFrozen) {
        return 'Con la deuda complicada no se pueden sumar becas, viáticos ni contratos.';
    }
    return null;
}

/**
 * Se lo llama. Firma con la chance que se mostraba (tirada derivada del id del
 * candidato); si no, firma con otro club. Llega con su vínculo y el dorsal libre
 * más bajo.
 */
export function signCandidate(state: CoachState, candidateId: string, deal?: PlayerDeal): CoachState {
    if (signBlock(state, candidateId)) return state;
    const c = findCandidate(state, candidateId) as ArrivalCandidate;
    const t = transfersOf(state);
    const rest = t.arrivals.filter((a) => a.id !== candidateId);
    if (roll(state, `${c.id}:firma`) * 100 >= c.chance) {
        const where = c.rivalClubId ? (getClub(c.rivalClubId)?.short ?? 'otro club') : 'otro club';
        const s: CoachState = { ...state, transfers: { ...t, arrivals: rest, negotiation: null } };
        return addLog(s, 'se-queda', `${c.player.name} eligió ${where}.`);
    }
    const player: SquadPlayer = {
        ...c.player,
        id: uniqueId(state, c.player.id),
        number: freeNumber(state),
        seasonsAtClub: 1,
        deal: deal ?? c.player.deal,
    };
    const s: CoachState = { ...state, squad: [...state.squad, player], transfers: { ...t, arrivals: rest, negotiation: null } };
    return addLog(s, 'llegada', `Llega ${player.name} (${player.age} años, nivel ${Math.round(player.level)}).`);
}

export function dismissCandidate(state: CoachState, candidateId: string): CoachState {
    const t = transfersOf(state);
    if (!t.arrivals.some((a) => a.id === candidateId)) return state;
    return { ...state, transfers: { ...t, arrivals: t.arrivals.filter((a) => a.id !== candidateId) } };
}

/** Por qué no se puede negociar el vínculo de un candidato, o null. */
export function signingNegotiationBlock(state: CoachState, candidateId: string): string | null {
    const block = signBlock(state, candidateId);
    if (block) return block;
    const c = findCandidate(state, candidateId) as ArrivalCandidate;
    if (transfersOf(state).negotiation) return 'Hay otra negociación abierta.';
    if (c.player.deal.kind === 'amateur' || c.player.deal.kind === 'beca') return 'No pide un vínculo que se negocie.';
    return null;
}

export function openSigningNegotiation(state: CoachState, candidateId: string): CoachState {
    if (signingNegotiationBlock(state, candidateId)) return state;
    const c = findCandidate(state, candidateId) as ArrivalCandidate;
    const ask = c.player.deal;
    const rng = createRng(hashSeed(`mercado:${state.seed}:${c.id}:incorporacion`));
    const reserveFactor = rng.float(0.8, 0.93);
    const viatico = ask.kind === 'viatico';
    const neg = startNegotiation({
        subject: `El vínculo de ${c.player.name}`,
        side: 'compra',
        unit: viatico ? 'porcentaje' : 'pesos',
        anchor: viatico ? pctOf(state, ask.monthly) : ask.monthly,
        reserve: viatico ? pctOf(state, ask.monthly * reserveFactor) : ask.monthly * reserveFactor,
        patience: 3,
        step: viatico ? 1 : 500,
    });
    return { ...state, transfers: { ...transfersOf(state), negotiation: { target: { kind: 'incorporacion', candidateId }, neg } } };
}

/* ------------------------------------------------------------------ */
/* Una ronda de cualquier negociación                                  */
/* ------------------------------------------------------------------ */

/** Lo que pasa cuando la negociación se cierra o se rompe. */
function settleNegotiation(state: CoachState, neg: Negotiation): CoachState {
    const t = transfersOf(state);
    const active = t.negotiation;
    if (!active) return state;
    if (neg.status === 'abierta') return { ...state, transfers: { ...t, negotiation: { ...active, neg } } };
    const cleared: CoachState = { ...state, transfers: { ...t, negotiation: null } };
    const target = active.target;
    if (target.kind === 'venta') {
        const offer = findOffer(cleared, target.offerId);
        if (!offer) return cleared;
        if (neg.status === 'cerrada' && neg.agreed !== null) {
            const tt = transfersOf(cleared);
            const withFee: CoachState = {
                ...cleared,
                transfers: { ...tt, offers: tt.offers.map((o) => (o.id === offer.id ? { ...o, fee: neg.agreed as number } : o)) },
            };
            return acceptPlayerOffer(withFee, offer.id);
        }
        // Se rompió: el club que compraba se va. Para el jugador es un rechazo.
        return rejectPlayerOffer(cleared, offer.id);
    }
    if (target.kind === 'renovacion') {
        const p = cleared.squad.find((x) => x.id === target.playerId);
        if (!p) return cleared;
        if (neg.status === 'cerrada' && neg.agreed !== null) {
            const monthly = neg.unit === 'porcentaje' ? monthlyOfPct(cleared, neg.agreed) : roundPay(neg.agreed);
            return renewWith(cleared, p, { kind: renewalAsk(cleared, p).kind, monthly, years: 2 });
        }
        // Se rompió la charla: no renueva.
        return expireDeal(cleared, p.id);
    }
    const c = findCandidate(cleared, target.candidateId);
    if (!c) return cleared;
    if (neg.status === 'cerrada' && neg.agreed !== null) {
        const monthly = neg.unit === 'porcentaje' ? monthlyOfPct(cleared, neg.agreed) : roundPay(neg.agreed);
        return signCandidate(cleared, c.id, { ...c.player.deal, monthly });
    }
    return dismissCandidate(cleared, c.id);
}

/** El club pone una cifra en la negociación abierta. */
export function negotiationOffer(state: CoachState, amount: number): CoachState {
    const active = transfersOf(state).negotiation;
    if (!active) return state;
    return settleNegotiation(state, makeOffer(active.neg, amount));
}

/** El club acepta la última cifra del rival. */
export function negotiationAcceptCounter(state: CoachState): CoachState {
    const active = transfersOf(state).negotiation;
    if (!active) return state;
    return settleNegotiation(state, acceptCounter(active.neg));
}

/** El club se levanta de la mesa: es lo mismo que se rompa. */
export function negotiationWalkAway(state: CoachState): CoachState {
    const active = transfersOf(state).negotiation;
    if (!active) return state;
    return settleNegotiation(state, walkAway(active.neg));
}

/* ------------------------------------------------------------------ */
/* Pedidos de salida, liberar y ceder                                  */
/* ------------------------------------------------------------------ */

/** Dejarlo ir: se va libre, sin compensación. */
export function grantRequest(state: CoachState, playerId: string): CoachState {
    const t = transfersOf(state);
    if (!t.requests.some((r) => r.playerId === playerId)) return state;
    const p = state.squad.find((x) => x.id === playerId);
    if (!p) return state;
    return addLog(depart(state, playerId, 0, 0), 'libre', `${p.name} pidió salir y se fue libre.`);
}

/**
 * Convencerlo de que se quede. `talk`: el entrenador se sienta a hablar (sube el
 * ánimo); sin charla —el pedido quedó sin contestar— el ánimo baja. Un
 * conflictivo que se queda a disgusto le cuesta algo al vestuario.
 */
export function denyRequest(state: CoachState, playerId: string, talk = true): CoachState {
    const t = transfersOf(state);
    if (!t.requests.some((r) => r.playerId === playerId)) return state;
    const p = state.squad.find((x) => x.id === playerId);
    const conflict = p?.personality === 'conflictivo';
    return {
        ...state,
        squad: state.squad.map((x) =>
            x.id === playerId
                ? {
                      ...x,
                      morale: clamp(x.morale + (talk ? 10 : -4), 0, 100),
                      commitment: clamp(x.commitment - 3, 0, 100),
                  }
                : x,
        ),
        club: conflict ? { ...state.club, cohesion: clamp(state.club.cohesion - (talk ? 2 : 1), 0, 100) } : state.club,
        transfers: { ...t, requests: t.requests.filter((r) => r.playerId !== playerId) },
    };
}

/** Por qué no se puede liberar a alguien, o null. */
export function releaseBlock(state: CoachState, playerId: string): string | null {
    if (!transfersOf(state).window) return 'Solo se puede con la ventana de pases abierta.';
    if (!state.squad.some((x) => x.id === playerId)) return 'No está en el plantel.';
    if (state.squad.length <= SQUAD_MIN) return `Con ${SQUAD_MIN} en el plantel no se puede liberar a nadie más.`;
    return null;
}

/** Lo que cuesta liberarlo: seis meses del contrato, si tiene contrato vigente. */
export function releaseCost(p: Pick<SquadPlayer, 'deal'>): number {
    return p.deal.kind === 'contrato' && p.deal.years > 0 ? p.deal.monthly * RELEASE_MONTHS : 0;
}

export function releasePlayer(state: CoachState, playerId: string): CoachState {
    if (releaseBlock(state, playerId)) return state;
    const p = state.squad.find((x) => x.id === playerId) as SquadPlayer;
    return addLog(depart(state, playerId, 0, releaseCost(p)), 'libre', `Se liberó a ${p.name}.`);
}

/** ¿Es cedible? Un pibe (23 o menos) o uno que no entra en los 23 mejores. */
export function loanEligible(state: Pick<CoachState, 'squad'>, p: SquadPlayer): boolean {
    if (p.age <= 23) return true;
    const top = [...state.squad].sort((a, b) => b.level - a.level || a.id.localeCompare(b.id)).slice(0, SQUAD_MIN);
    return !top.some((x) => x.id === p.id);
}

/** Por qué no se puede ceder, o null. */
export function loanBlock(state: CoachState, playerId: string): string | null {
    if (!transfersOf(state).window) return 'Solo se puede con la ventana de pases abierta.';
    const p = state.squad.find((x) => x.id === playerId);
    if (!p) return 'No está en el plantel.';
    if (state.squad.length <= SQUAD_MIN) return `Con ${SQUAD_MIN} en el plantel no se puede ceder a nadie más.`;
    if (!loanEligible(state, p)) return 'Se cede a los pibes y a los que no entran en los 23: este juega.';
    return null;
}

/** El club al que va cedido: uno de la división de abajo (o el más flojo de la propia, si no hay abajo). */
export function loanDestination(state: CoachState, playerId: string): string | null {
    const below = divisionsBelow(state.competitionId)[0]?.id;
    const pool = (below ? clubsIn(state.world, below) : clubsIn(state.world, state.competitionId).slice(-4))
        .filter((id) => id !== state.clubId)
        .sort((a, b) => a.localeCompare(b));
    if (pool.length === 0) return null;
    return pool[hashSeed(`cesion:${state.seed}:${state.season}:${playerId}`) % pool.length];
}

/** Ceder por la temporada: no juega para el club, vuelve al cierre con crecimiento extra. */
export function loanPlayer(state: CoachState, playerId: string): CoachState {
    if (loanBlock(state, playerId)) return state;
    const clubId = loanDestination(state, playerId);
    if (!clubId) return state;
    const p = state.squad.find((x) => x.id === playerId) as SquadPlayer;
    const gone = state.inSeason ? departures([p], []) : [];
    const t = transfersOf(state);
    const loaned: LoanedPlayer = { player: { ...p, stats: emptyStats(), fatigue: 0 }, clubId, season: state.season };
    const s: CoachState = {
        ...state,
        squad: state.squad.filter((x) => x.id !== playerId),
        inSeason: state.inSeason && gone.length > 0 ? { ...state.inSeason, gone: [...state.inSeason.gone, ...gone] } : state.inSeason,
        transfers: {
            ...t,
            loaned: [...t.loaned, loaned],
            offers: t.offers.filter((o) => o.playerId !== playerId),
            requests: t.requests.filter((r) => r.playerId !== playerId),
        },
    };
    return addLog(s, 'cesion', `${p.name} se va cedido a ${getClub(clubId)?.short ?? clubId} por la temporada.`);
}

/**
 * Los cedidos vuelven al cierre del año: más cerca de su techo, descansados y
 * contentos de haber jugado. Devuelve los jugadores y los ids, para que el cierre
 * los sume al plantel antes de envejecerlo y les aplique el crecimiento extra
 * después.
 */
export function returningLoans(state: Pick<CoachState, 'transfers'>): SquadPlayer[] {
    return transfersOf(state).loaned.map((l) => l.player);
}

/** El crecimiento extra de un cedido que vuelve. Sin azar. */
export function loanGrowth(p: SquadPlayer): SquadPlayer {
    const level = Math.min(p.potential, Math.round((p.level + Math.max(0, p.potential - p.level) * LOAN_GROWTH + 0.5) * 10) / 10);
    return { ...p, level, fatigue: 0, morale: clamp(p.morale + 6, 0, 100) };
}

/* ------------------------------------------------------------------ */
/* Lo que se muestra                                                   */
/* ------------------------------------------------------------------ */

/** El vínculo de un jugador en palabras, sin pesos donde no corresponden. */
export function dealWords(state: Pick<CoachState, 'competitionId'>, deal: PlayerDeal): string {
    const status = statusOf(state.competitionId);
    const years = deal.years > 0 ? ` por ${deal.years} ${deal.years === 1 ? 'año' : 'años'}` : '';
    if (deal.kind === 'amateur' || deal.monthly <= 0) return 'Juega sin cobrar';
    if (deal.kind === 'beca') return `Una beca${years}`;
    if (deal.kind === 'viatico') {
        const pct = Math.round((deal.monthly / viaticoReference(state.competitionId)) * 100);
        return `Viático al ${pct} % del de la división${years}`;
    }
    if (status === 'semipro') return `Contrato de $ ${deal.monthly.toLocaleString('es-AR')} por mes${years}`;
    return `Contrato${years}`;
}

/** Lo que el club recibe por la oferta, en palabras. */
export function feeWords(state: Pick<CoachState, 'competitionId'>, offer: Pick<PlayerOffer, 'fee'>): string {
    if (offer.fee <= 0) return 'No hay pase: se va sin compensación para el club.';
    if (statusOf(state.competitionId) === 'semipro') return `Compensación de $ ${(offer.fee / 1_000_000).toFixed(2).replace('.', ',')} M para el club.`;
    return 'Deja una ayuda simbólica para el club.';
}

/** La vía, si la hay, en palabras. */
export function routeWords(offer: Pick<PlayerOffer, 'route' | 'pathwayId'>): string {
    if (offer.route === 'nacional') return 'Un club de arriba en la rama.';
    if (offer.route === 'abierto') return 'El mercado del exterior: tiene contrato, y el contrato abre la puerta.';
    return getPathway(offer.pathwayId ?? '')?.label ?? 'Una vía declarada.';
}

function clamp(v: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, v));
}

function round1(v: number): number {
    return Math.round(v * 10) / 10;
}

