// La evaluación de la subcomisión, en tres ejes.
//
// En El Interino la directiva te mide en tres cosas con pesos a la vista
// (deportivo, economía, cantera). La traducción al club de rugby es directa y
// es honesta: al entrenador de un club amateur le piden resultados, que no
// funda al club con los viajes, y que los pibes del M19 lleguen a primera.
//
// El peso deportivo es el más alto y por lejos. La presión sigue saliendo casi
// toda de ahí (`pressure.ts`); la caja ya aprieta por deuda, y la cantera suma
// un empujón chico. La nota sirve para LEER el año, no para reemplazar al motor
// de presión que está calibrado con mil carreras.

import type { BoardReview, Objective, SquadPlayer } from '../types/coach.ts';
import { startingXV } from './squad.ts';

/** Los pesos, en porcentaje. Suman 100: hay un test. */
export const BOARD_WEIGHTS = { deportivo: 60, caja: 25, cantera: 15 } as const;

/** Hasta qué edad se cuenta como "un pibe del club". */
export const CANTERA_MAX_AGE = 21;

export interface BoardObjective {
    axis: keyof typeof BOARD_WEIGHTS;
    weight: number;
    text: string;
}

/** Lo que te piden, en los tres ejes. Para la pretemporada. */
export function boardObjectives(objective: Objective): BoardObjective[] {
    return [
        { axis: 'deportivo', weight: BOARD_WEIGHTS.deportivo, text: objective.text },
        { axis: 'caja', weight: BOARD_WEIGHTS.caja, text: 'Cerrar el año sin perder plata.' },
        {
            axis: 'cantera',
            weight: BOARD_WEIGHTS.cantera,
            text: `Que juegue en primera un pibe de ${CANTERA_MAX_AGE} o menos.`,
        },
    ];
}

/** Cuántos pibes juegan de titulares y cuántos están en el banco. */
export function youthInSquad(squad: readonly SquadPlayer[]): { xv: number; banco: number } {
    const xvIds = new Set(startingXV(squad).map((p) => p.id));
    const young = squad.filter((p) => p.age <= CANTERA_MAX_AGE);
    const xv = young.filter((p) => xvIds.has(p.id)).length;
    const banco = young.filter((p) => !xvIds.has(p.id) && p.number >= 16 && p.number <= 23).length;
    return { xv, banco };
}

export function boardReview(r: {
    objective: Objective;
    position: number;
    champion: boolean;
    promoted: boolean;
    relegated: boolean;
    objectiveMet: boolean;
    /** Resultado del año (ingresos − egresos) y lo que entró. */
    resultado: number;
    ingresos: number;
    squad: readonly SquadPlayer[];
}): BoardReview {
    const deportivo = deportivoScore(r);

    // Sin pérdidas, 100. Perder un cuarto de lo que entra en el año es cero.
    const caja =
        r.resultado >= 0 || r.ingresos <= 0
            ? 100
            : clamp(Math.round(100 + (r.resultado / r.ingresos) * 400), 0, 100);

    const youth = youthInSquad(r.squad);
    const cantera = youth.xv >= 2 ? 100 : youth.xv === 1 ? 70 : youth.banco > 0 ? 35 : 0;

    const nota = Math.round(
        (deportivo * BOARD_WEIGHTS.deportivo + caja * BOARD_WEIGHTS.caja + cantera * BOARD_WEIGHTS.cantera) / 100,
    );
    return { deportivo, caja, cantera, nota };
}

function deportivoScore(r: {
    objective: Objective;
    position: number;
    champion: boolean;
    promoted: boolean;
    relegated: boolean;
    objectiveMet: boolean;
}): number {
    if (r.relegated) return 0;
    if (r.objectiveMet || r.champion || r.promoted) return 100;
    // No se cumplió: cuánto faltó. Pedían ganar y saliste primero en la tabla
    // pero perdiste la final no es lo mismo que salir sexto.
    const miss = r.objective.kind === 'campeon' ? r.position : r.position - r.objective.position;
    return clamp(Math.round(60 - (miss - 1) * 12), 0, 60);
}

/** Cómo lee la subcomisión la nota. */
export function boardWord(nota: number): string {
    if (nota >= 85) return 'Conforme';
    if (nota >= 65) return 'Aprueba';
    if (nota >= 45) return 'Con reparos';
    return 'Disconforme';
}

function clamp(v: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, v));
}
