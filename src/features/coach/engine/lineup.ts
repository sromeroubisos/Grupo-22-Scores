// La alineación de cada fecha: quién juega, de qué, y con qué número.
//
// Hasta la etapa 1 el club jugaba el año entero con `startingXV`, los quince
// mejores por puesto, sanos o no. Desde la etapa 2 cada fecha se arma con el
// plantel REAL de ese día:
//
//   · los lesionados (`injury > 0`) no juegan, nunca;
//   · el cansancio pesa al elegir según la política del tramo (`LineupPolicy`):
//     `mejores` solo saca al que está fundido, `rotacion` descansa antes, y
//     `cantera` le da la camiseta al propio cuando la diferencia es chica;
//   · si un puesto se queda sin nadie sano, lo cubre otro de la misma línea
//     (forward por forward, back por back) con el nivel castigado.
//
// Devuelve el plantel RENUMERADO del día: el XV con el 1 al 15 de su puesto, el
// banco del 16 al 23 y el resto del 24 en adelante. El dado (`match.ts`) lee el
// dorsal para saber quién es titular y si hay primera línea certificada en el
// banco, así que con el plantel del día esas dos cosas dicen la verdad de ESA
// fecha. Nada de esto se guarda: el plantel del estado conserva sus dorsales.
//
// Sin azar: misma situación, misma alineación.

import { statusOf } from '../data/professionalism.ts';
import type { LineupPolicy, PositionGroup, SquadPlayer } from '../types/coach.ts';
import { CANTERA_MAX_AGE } from './board.ts';
import { XV_SHAPE, isForward, lineupRating } from './squad.ts';

/** Los dorsales de cada puesto en el XV, en orden. */
const SLOT_NUMBERS: Readonly<Record<PositionGroup, readonly number[]>> = {
    'primera-linea': [1, 2, 3],
    'segunda-linea': [4, 5],
    'tercera-linea': [6, 7, 8],
    medios: [9, 10],
    centros: [12, 13],
    fondo: [11, 14, 15],
};

/** Lo que pierde un jugador que cubre un puesto que no es el suyo, en puntos de nivel. */
export const OUT_OF_POSITION = 4;

/**
 * El nivel de un puesto que nadie sano puede cubrir: el pibe del M19 que se
 * suma de apuro. No es un jugador del plantel y no suma estadísticas.
 */
export const EMERGENCY_LEVEL = 12;

/** Lo que la política `cantera` le suma al propio para ganarse la camiseta. */
export const CANTERA_PREFERENCE = 5;

const BENCH_SIZE = 8;

/**
 * Los que cuentan para el objetivo formativo. En una división amateur casi todos
 * son formados en el club, así que ahí cuentan solo los de 21 o menos.
 */
export function isFormativeOwn(p: Pick<SquadPlayer, 'age' | 'homegrown'>, youthOnly: boolean): boolean {
    return p.age <= CANTERA_MAX_AGE || (!youthOnly && p.homegrown === true);
}

/** ¿El formativo de esta división cuenta solo a los pibes? */
export function formativeYouthOnly(competitionId: string): boolean {
    return statusOf(competitionId) === 'amateur';
}

export interface MatchdaySlot {
    /** null: el puesto lo cubre uno de apuro (`EMERGENCY_LEVEL`). */
    player: SquadPlayer | null;
    /** El puesto que ocupa, no el del jugador. */
    group: PositionGroup;
    number: number;
    /** Nivel con el que juega ese puesto (castigado si está fuera de puesto). */
    level: number;
}

export interface Matchday {
    xv: MatchdaySlot[];
    bench: SquadPlayer[];
    /** El plantel renumerado del día, para el dado. */
    squad: SquadPlayer[];
    /** El que patea: el 10 del día. */
    kickerId: string | null;
    /** Rating del XV del día, en escala de pirámide (antes del cansancio y el ánimo). */
    rating: number;
}

/** Cuánto vale un jugador a la hora de elegirlo, según la política del tramo. */
function pickScore(p: SquadPlayer, policy: LineupPolicy, youthOnly: boolean): number {
    if (policy === 'mejores') return p.level - Math.max(0, p.fatigue - 75) * 0.3;
    if (policy === 'rotacion') return p.level - Math.max(0, p.fatigue - 50) * 0.25;
    return p.level + (isFormativeOwn(p, youthOnly) ? CANTERA_PREFERENCE : 0) - Math.max(0, p.fatigue - 60) * 0.25;
}

function byScore(policy: LineupPolicy, youthOnly: boolean) {
    return (a: SquadPlayer, b: SquadPlayer) =>
        pickScore(b, policy, youthOnly) - pickScore(a, policy, youthOnly) || b.level - a.level || a.id.localeCompare(b.id);
}

/**
 * Arma la fecha. Con todos sanos, descansados y la política `mejores`, el XV es
 * exactamente `startingXV` y el rating es exactamente `teamRating`: la etapa 2
 * no le cambia la fuerza a nadie por arrancar el año.
 */
export function matchday(squad: readonly SquadPlayer[], policy: LineupPolicy, competitionId: string): Matchday {
    const youthOnly = formativeYouthOnly(competitionId);
    const order = byScore(policy, youthOnly);
    const healthy = squad.filter((p) => p.injury <= 0);
    const taken = new Set<string>();
    const slots: MatchdaySlot[] = [];
    const groups = Object.keys(XV_SHAPE).sort() as PositionGroup[];

    // 1. Cada puesto con los suyos.
    const open: { group: PositionGroup; number: number }[] = [];
    for (const group of groups) {
        const pool = healthy.filter((p) => p.group === group).sort(order);
        const picked = pool.slice(0, XV_SHAPE[group]);
        // Los dorsales del día van en el orden del dorsal habitual: el 10 titular
        // sigue siendo el 10 aunque haya otro medio con más nivel.
        const numbers = SLOT_NUMBERS[group];
        const ordered = [...picked].sort((a, b) => a.number - b.number || a.id.localeCompare(b.id));
        ordered.forEach((p, i) => {
            taken.add(p.id);
            slots.push({ player: p, group, number: numbers[i], level: p.level });
        });
        for (let i = ordered.length; i < numbers.length; i++) open.push({ group, number: numbers[i] });
    }

    // 2. Los puestos vacíos: alguien de la misma línea, o uno de apuro.
    for (const hole of open) {
        const forward = isForward(hole.group);
        const sub = healthy
            .filter((p) => !taken.has(p.id) && isForward(p.group) === forward)
            .sort(order)[0];
        if (sub) {
            taken.add(sub.id);
            slots.push({ player: sub, group: hole.group, number: hole.number, level: sub.level - OUT_OF_POSITION });
        } else {
            slots.push({ player: null, group: hole.group, number: hole.number, level: EMERGENCY_LEVEL });
        }
    }
    slots.sort((a, b) => a.number - b.number);

    // 3. El banco: los mejores que quedan, con un primera línea certificado si lo hay.
    const rest = healthy.filter((p) => !taken.has(p.id)).sort(order);
    let bench = rest.slice(0, BENCH_SIZE);
    if (!bench.some((p) => p.frontRowCertified)) {
        const cover = rest.find((p) => p.frontRowCertified);
        if (cover && bench.length > 0) bench = [...bench.slice(0, bench.length - 1), cover];
        else if (cover) bench = [cover];
    }
    // Los certificados primero: con el banco corto se viaja con los del 16 al 19.
    bench.sort(
        (a, b) =>
            Number(b.frontRowCertified) - Number(a.frontRowCertified)
            || Number(isForward(b.group)) - Number(isForward(a.group))
            || order(a, b),
    );
    for (const p of bench) taken.add(p.id);

    const renumbered: SquadPlayer[] = [];
    for (const s of slots) if (s.player) renumbered.push({ ...s.player, number: s.number });
    bench.forEach((p, i) => renumbered.push({ ...p, number: 16 + i }));
    const others = squad.filter((p) => !taken.has(p.id)).sort((a, b) => a.number - b.number || a.id.localeCompare(b.id));
    others.forEach((p, i) => renumbered.push({ ...p, number: 24 + i }));

    const ten = slots.find((s) => s.number === 10)?.player ?? slots.find((s) => s.number === 9)?.player;
    const kicker =
        ten
        ?? slots
            .filter((s) => s.player && !isForward(s.group))
            .sort((a, b) => b.level - a.level)[0]?.player
        ?? null;

    return {
        xv: slots,
        bench,
        squad: renumbered,
        kickerId: kicker?.id ?? null,
        // Sumado en el mismo orden que `startingXV` (puesto alfabético, nivel): con
        // el XV de siempre el número es el de `teamRating` hasta el último decimal.
        rating: lineupRating(
            [...slots].sort(
                (a, b) =>
                    a.group.localeCompare(b.group)
                    || b.level - a.level
                    || (a.player?.id ?? '').localeCompare(b.player?.id ?? ''),
            ),
        ),
    };
}
