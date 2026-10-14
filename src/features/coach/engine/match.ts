// El dado. Un partido de rugby, en puntos.
//
// LA CALIBRACIÓN NO ESTÁ INVENTADA. Sale de rugby-manager-pro/js/calibration.js,
// que midió 286 partidos reales de 2026: la localía vale +4,38 puntos, un punto
// de rating vale 1,965 puntos de marcador, el local gana el 61,8% y el empate
// aparece en el 2-4% de los partidos. `match-calibration.test.ts` simula mil
// temporadas y verifica que el motor siga cayendo ahí.
//
// Todo se cuenta EN PUNTOS y no en unidades abstractas, y esa es la diferencia
// grande con el simulador de fútbol del que viene el formato: acá el marcador no
// es cosmético. El punto bonus ofensivo y el defensivo salen del mismo dado que
// el resultado, así que perder por seis en cancha del líder suma, y puede definir
// la temporada.

import type { MatchOutcome, SquadPlayer } from '../types/coach.ts';
import type { Rng } from './random.ts';
import { hasFrontRowCover, isFrontRowShirt } from './squad.ts';

/** Lo que la localía vale en puntos de marcador. Medido, no elegido. */
export const HOME_ADV_PTS = 4.38;
/** Cuántos puntos de marcador vale un punto de rating de equipo. Medido. */
export const PTS_PER_RATING = 1.965;
/**
 * Dispersión del margen. `calibration.js` la midió en 11,9 para partidos entre
 * iguales. Es la perilla del azar: subirla hace el torneo más impredecible.
 */
export const MARGIN_SD = 11.9;

/** Lo que el entrenador le pone (o le saca) a su equipo, en puntos de rating. */
export interface SidelineMods {
    /** Manejo del partido: los cambios, la salida, cuándo ir a los palos. */
    conduccion: number;
    /** Lo que le sacás al plantel cuando el partido se pone cuesta arriba. */
    arenga: number;
    /** El orden. No mueve la media: aprieta la campana. */
    disciplina: number;
    /** Cohesión del grupo, 0..100. */
    cohesion: number;
    /** Aporte del banco, ya calculado por `benchImpact`. */
    bench: number;
    /** Presión sobre el entrenador, 0..100. Es lo que activa la arenga. */
    pressure: number;
    /** Lo que dejaron las decisiones de esta temporada. */
    seasonRating: number;
    /** Riesgo extra de lesión por partido, de las decisiones. */
    extraInjuryRisk: number;
    /** Viaja con 22 en vez de 26: el banco se queda sin primera línea. */
    bancoCorto: boolean;
}

/** El rival del catálogo, que no tiene entrenador que lo dirija. */
export const NEUTRAL_MODS: SidelineMods = {
    conduccion: 5,
    arenga: 5,
    disciplina: 5,
    cohesion: 50,
    bench: 0,
    pressure: 0,
    seasonRating: 0,
    extraInjuryRisk: 0,
    bancoCorto: false,
};

export interface MatchSide {
    clubId: string;
    /** Rating de equipo en escala de pirámide. */
    rating: number;
    mods: SidelineMods;
    /** El plantel, solo si es el club del jugador. El rival no lo necesita. */
    squad?: readonly SquadPlayer[];
}

export interface MatchRoll {
    homePf: number;
    awayPf: number;
    homeTries: number;
    awayTries: number;
    /** Desde el punto de vista del LOCAL. */
    outcome: MatchOutcome;
    note: string | null;
    /**
     * El jugador del club del jugador que se lesionó, si hubo. Sale del mismo
     * sorteo que la nota: no consume azar de más (etapa 2, para descontarle fechas).
     */
    hurtId: string | null;
}

/**
 * Lo que el entrenador le suma al rating de su equipo, en puntos de rating.
 * La arenga solo entra con la presión alta y eso es deliberado: el que levanta
 * un vestuario tranquilo no está levantando nada.
 */
export function sidelineEdge(mods: SidelineMods): number {
    const conduccion = (mods.conduccion - 5) * 0.8;
    const arenga = mods.pressure >= 60 ? (mods.arenga - 5) * 1.2 : 0;
    const grupo = (mods.cohesion - 50) / 8;
    return conduccion + arenga + grupo + mods.bench + mods.seasonRating;
}

/** Un equipo ordenado es más previsible. No gana más: pierde menos raro. */
function noiseFactor(mods: SidelineMods): number {
    return clamp(1 - (mods.disciplina - 5) / 20, 0.85, 1.15);
}

interface Incident {
    /** Puntos de marcador que le cuesta al equipo que lo sufre. */
    cost: number;
    note: string | null;
    hurtId: string | null;
}

/**
 * Lo que puede pasar dentro de los ochenta minutos. Los pesos son los de El
 * Interino traducidos: 84% no pasa nada, 6% amarilla, 2% roja, 8% lesión.
 *
 * Y una rama que el fútbol no tiene: si el lesionado es primera línea y en el
 * banco no queda nadie certificado, el partido sigue con SCRUMS SIMULADOS. No es
 * una estadística que baja — es el reglamento sacándote el arma del pack, y por
 * eso cuesta fijo y no proporcional.
 */
function rollIncident(rng: Rng, mods: SidelineMods, squad?: readonly SquadPlayer[]): Incident {
    // La disciplina del entrenador corre las tarjetas, no las lesiones.
    const cardShift = (mods.disciplina - 5) * 0.004;
    const yellow = Math.max(0.01, 0.06 - cardShift);
    const red = Math.max(0.004, 0.02 - cardShift / 2);
    const injury = clamp(0.08 + mods.extraInjuryRisk, 0.02, 0.35);

    const roll = rng.next();
    if (roll < yellow) return { cost: 4, note: 'Amarilla: diez minutos con uno menos.', hurtId: null };
    if (roll < yellow + red) return { cost: 8, note: 'Roja: el resto del partido con catorce.', hurtId: null };
    if (roll < yellow + red + injury) {
        const starters = squad?.filter((p) => p.number <= 15) ?? [];
        const hurt = starters.length > 0 ? rng.pick(starters) : null;
        if (hurt && isFrontRowShirt(hurt.number) && !hasFrontRowCover(squad ?? [], mods.bancoCorto)) {
            return {
                cost: 6,
                note: `Se lesiona ${hurt.name} y no hay primera línea certificada en el banco: scrums simulados.`,
                hurtId: hurt.id,
            };
        }
        return { cost: 3, note: hurt ? `Se lesiona ${hurt.name} y sale.` : null, hurtId: hurt?.id ?? null };
    }
    return { cost: 0, note: null, hurtId: null };
}

/**
 * Juega un partido. `neutral` apaga la localía — la final se juega en cancha de
 * nadie. `trackHome`/`trackAway` dicen de qué lado está el club del jugador: es
 * el único del que se narra lo que pasó.
 */
export function rollMatch(
    rng: Rng,
    home: MatchSide,
    away: MatchSide,
    opts: { neutral?: boolean; trackHome?: boolean; trackAway?: boolean } = {},
): MatchRoll {
    const homeInc = rollIncident(rng, home.mods, opts.trackHome ? home.squad : undefined);
    const awayInc = rollIncident(rng, away.mods, opts.trackAway ? away.squad : undefined);

    const edge = home.rating + sidelineEdge(home.mods) - (away.rating + sidelineEdge(away.mods));
    const expected =
        edge * PTS_PER_RATING + (opts.neutral ? 0 : HOME_ADV_PTS) - homeInc.cost + awayInc.cost;

    const sd = MARGIN_SD * ((noiseFactor(home.mods) + noiseFactor(away.mods)) / 2);
    const margin = Math.round(rng.normal(expected, sd));

    // El que pierde igual anota: un 0 a algo es raro y la calibración lo dice
    // (shutout 0,0 en el tramo parejo). La media de 20 deja el total en ~50, que
    // es el avgTotal medido.
    const loserPts = Math.max(0, Math.round(rng.normal(20, 8)));
    const homePf = margin >= 0 ? loserPts + margin : loserPts;
    const awayPf = margin >= 0 ? loserPts : loserPts - margin;

    const outcome: MatchOutcome = margin > 0 ? 'win' : margin < 0 ? 'loss' : 'draw';

    // Un try con su conversión son siete puntos; el resto sale del pie. La banda
    // deja que un partido se gane a fuerza de penales y otro con cuatro tries.
    const triesOf = (pts: number) => Math.max(0, Math.round((pts / 7) * rng.float(0.7, 1.2)));

    return {
        homePf,
        awayPf,
        homeTries: triesOf(homePf),
        awayTries: triesOf(awayPf),
        outcome,
        note: opts.trackHome ? homeInc.note : opts.trackAway ? awayInc.note : null,
        hurtId: opts.trackHome ? homeInc.hurtId : opts.trackAway ? awayInc.hurtId : null,
    };
}

/* ------------------------------------------------------------------ */
/* El partido en dos tiempos (el partido clave, etapa 2)               */
/* ------------------------------------------------------------------ */

/**
 * El mismo dado, partido al medio. Cada tiempo es una normal con la MITAD del
 * margen esperado y la dispersión dividida por √2: la suma de los dos tiempos es
 * exactamente la normal del partido entero (misma media, misma varianza). Las
 * incidencias se sortean una vez, al arrancar, igual que en `rollMatch`, y su
 * costo se reparte mitad y mitad.
 *
 * Los puntos del que pierde cada tiempo salen de una normal de media
 * `HALF_LOSER_MEAN`, no de 10 (la mitad de 20): como |m1| + |m2| ≥ |m1 + m2|, la
 * mitad exacta inflaba el total del partido. Con 9 cae sobre el del partido
 * entero. Medido el 2026-10-14 con 20.000 partidos por caso (misma semilla):
 * entre iguales de local, el local gana 62,6 % entero y 62,7 % en dos tiempos,
 * empate 3,0 y 3,2 %, margen 4,40 y 4,32 (desvío 12,1 y 12,0), total 50,4 y
 * 50,6; con diez de rating en cancha neutral, margen 19,7 y 19,6. Lo verifica
 * `tramos.test.ts` con las bandas de `match-calibration.test.ts`.
 *
 * NO toca `HOME_ADV_PTS`, `PTS_PER_RATING` ni `MARGIN_SD`: los reusa.
 */
export const HALF_LOSER_MEAN = 9;

export interface HalfInput {
    neutral?: boolean;
    trackHome?: boolean;
    trackAway?: boolean;
}

export interface FirstHalfRoll {
    homePf: number;
    awayPf: number;
    homeCost: number;
    awayCost: number;
    note: string | null;
    hurtId: string | null;
}

function rollHalfScore(rng: Rng, home: MatchSide, away: MatchSide, neutral: boolean, homeCost: number, awayCost: number): { homePf: number; awayPf: number } {
    const edge = home.rating + sidelineEdge(home.mods) - (away.rating + sidelineEdge(away.mods));
    const expected = (edge * PTS_PER_RATING + (neutral ? 0 : HOME_ADV_PTS) - homeCost + awayCost) / 2;
    const sd = (MARGIN_SD * ((noiseFactor(home.mods) + noiseFactor(away.mods)) / 2)) / Math.SQRT2;
    const margin = Math.round(rng.normal(expected, sd));
    const loserPts = Math.max(0, Math.round(rng.normal(HALF_LOSER_MEAN, 8 / Math.SQRT2)));
    return { homePf: margin >= 0 ? loserPts + margin : loserPts, awayPf: margin >= 0 ? loserPts : loserPts - margin };
}

/** El primer tiempo. Las incidencias de todo el partido se sortean acá. */
export function rollFirstHalf(rng: Rng, home: MatchSide, away: MatchSide, opts: HalfInput = {}): FirstHalfRoll {
    const homeInc = rollIncident(rng, home.mods, opts.trackHome ? home.squad : undefined);
    const awayInc = rollIncident(rng, away.mods, opts.trackAway ? away.squad : undefined);
    const homeCost = homeInc.cost / 2;
    const awayCost = awayInc.cost / 2;
    const score = rollHalfScore(rng, home, away, !!opts.neutral, homeCost, awayCost);
    return {
        ...score,
        homeCost,
        awayCost,
        note: opts.trackHome ? homeInc.note : opts.trackAway ? awayInc.note : null,
        hurtId: opts.trackHome ? homeInc.hurtId : opts.trackAway ? awayInc.hurtId : null,
    };
}

/**
 * El segundo tiempo y el partido completo. Los lados pueden traer otros
 * modificadores que en el primero: es el ajuste del entretiempo. Los tries
 * salen del marcador FINAL con la misma regla que `rollMatch`.
 */
export function rollSecondHalf(rng: Rng, home: MatchSide, away: MatchSide, first: FirstHalfRoll, opts: HalfInput = {}): MatchRoll {
    const second = rollHalfScore(rng, home, away, !!opts.neutral, first.homeCost, first.awayCost);
    const homePf = first.homePf + second.homePf;
    const awayPf = first.awayPf + second.awayPf;
    const triesOf = (pts: number) => Math.max(0, Math.round((pts / 7) * rng.float(0.7, 1.2)));
    return {
        homePf,
        awayPf,
        homeTries: triesOf(homePf),
        awayTries: triesOf(awayPf),
        outcome: homePf > awayPf ? 'win' : homePf < awayPf ? 'loss' : 'draw',
        note: first.note,
        hurtId: first.hurtId,
    };
}

/** Punto bonus ofensivo: cuatro tries o más. */
export function bonusOffensive(tries: number): boolean {
    return tries >= 4;
}

/** Punto bonus defensivo: perdés por siete o menos. */
export function bonusDefensive(pf: number, pc: number): boolean {
    return pc > pf && pc - pf <= 7;
}

function clamp(v: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, v));
}
