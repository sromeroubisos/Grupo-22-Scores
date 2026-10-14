// El objetivo, la presión y el despido.
//
// La subcomisión no te pide lo mismo si agarrás al puntero que si agarrás al
// último: el objetivo sale de dónde está tu club DENTRO de su torneo, y por eso
// se recalcula cada temporada. Salvarte del descenso con el club más chico del
// Pampeano C es cumplir; salir cuarto con el más grande del Top 14 es fracasar.

import { getCompetition } from '../data/competitions.ts';
import { FORMAT_BASE_YEAR, formatFor, relegationSlotsOf } from '../data/formats.ts';
import type { KnockoutRun, Objective } from '../types/coach.ts';
import { debtLevel, debtMonths } from './economy.ts';

/** Presión con la que arranca cualquier carrera: la de un entrenador nuevo. */
export const INITIAL_PRESSURE = 30;
/** A partir de acá la subcomisión te agradece los servicios. */
export const FIRING_PRESSURE = 100;

/**
 * Lo que te pide el club este año. `seedRank` es la posición del club por fuerza
 * dentro de su torneo, 1-based.
 *
 * El pedido habla el idioma del FORMATO de ese año (`data/formats.ts`): en una
 * división con reducido, "pelear arriba" es meterse en el reducido; con playoff
 * por el título, meterse en la definición; donde el primero es campeón y sube
 * directo, salir campeón ES el ascenso.
 */
export function objectiveFor(competitionId: string, seedRank: number, year: number = FORMAT_BASE_YEAR): Objective {
    const comp = getCompetition(competitionId);
    const teams = comp?.teams ?? 10;
    const format = formatFor(competitionId, year);
    const safe = teams - Math.max(1, relegationSlotsOf(format));
    const mitad = Math.ceil(teams / 2);
    const directAscent = format.title.kind === 'table' && !!format.promotion?.champion;

    if (seedRank <= 2) {
        return {
            kind: 'campeon',
            position: 1,
            text: directAscent
                ? 'Salir campeón: el primero sube directo. Con este plantel no hay excusa.'
                : 'Salir campeón. Con este plantel no hay excusa.',
        };
    }
    if (seedRank <= Math.ceil(teams * 0.4)) {
        const reducido = format.promotion?.reducido;
        if (reducido) {
            return {
                kind: 'playoff',
                position: reducido.to,
                text: `Pelear el ascenso: terminar ${reducido.to}° o mejor y entrar al reducido.`,
            };
        }
        if (format.title.kind === 'playoff') {
            const size = Math.min(format.title.size, teams);
            return { kind: 'playoff', position: size, text: `Meterse en la definición: ${size}° o mejor.` };
        }
        return { kind: 'playoff', position: 3, text: 'Pelear arriba: terminar 3° o mejor.' };
    }
    if (seedRank <= Math.ceil(teams * 0.7)) {
        return { kind: 'mitad', position: mitad, text: `Terminar en la mitad de arriba: ${mitad}° o mejor.` };
    }
    return { kind: 'permanencia', position: safe, text: 'Mantener la categoría. No terminar entre los últimos.' };
}

export interface SeasonReview {
    objective: Objective;
    position: number;
    champion: boolean;
    promoted: boolean;
    relegated: boolean;
    tdi: KnockoutRun;
    nacional: boolean;
    /** Caja al cerrar y lo que entra por año, para medir la deuda. */
    caja: number;
    ingresos: number;
    /**
     * El eje de cantera de la subcomisión, 0..100 (`board.ts`). Opcional: sin él
     * la presión se calcula como antes.
     */
    cantera?: number;
}

export interface PressureOutcome {
    pressure: number;
    /** Positivo si mejoró su nombre en el ambiente. */
    reputationDelta: number;
    objectiveMet: boolean;
    fired: boolean;
    /** Lo que le dijeron, en una línea. */
    verdict: string;
}

/**
 * Cierra la temporada sobre el entrenador. La presión no se reemplaza: se mueve.
 * Un año bueno después de tres malos te descomprime, no te absuelve.
 */
/**
 * Hasta dónde baja la presión por más que todo salga bien.
 *
 * Existe porque sin piso el juego se apaga solo: se veía jugando: a la segunda
 * temporada cumplida la presión tocaba cero y ahí se quedaba para siempre, así
 * que ya no había forma de que te echaran y el eje central del juego —la
 * exigencia— dejaba de existir. Y es lo que pasa de verdad: en el club que te
 * pide el título la subcomisión nunca está del todo tranquila, y en el que te
 * pide no descender te dejan trabajar.
 */
export function pressureFloor(kind: Objective['kind']): number {
    if (kind === 'campeon') return 22;
    if (kind === 'playoff') return 15;
    if (kind === 'mitad') return 9;
    return 4;
}

export function reviewSeason(pressure: number, r: SeasonReview): PressureOutcome {
    // "Salir campeón" es GANAR EL TÍTULO, no terminar primero en la tabla. En un
    // torneo que se define por playoff, el que puntea la fase regular y pierde la
    // final no salió campeón, y la subcomisión lo sabe.
    const met =
        r.objective.kind === 'campeon'
            ? r.champion
            : r.position > 0 && r.position <= r.objective.position;

    // El grueso del movimiento sale de cumplir o no, y de por cuánto.
    let delta = met ? -14 : 12 + Math.min(24, (r.position - r.objective.position) * 2.5);

    // Los logros que no estaban en el pedido descomprimen igual: nadie echa al
    // que salió sexto pero llegó a la final del Interior.
    if (r.champion) delta -= 16;
    if (r.promoted) delta -= 18;
    if (r.tdi === 'campeon') delta -= 22;
    else if (r.tdi === 'final') delta -= 12;
    else if (r.tdi === 'semis') delta -= 7;
    if (r.nacional) delta -= 30;
    if (r.relegated) delta += 30;

    // Y la caja aprieta aunque el equipo ande: el club que no paga el micro no
    // llega a fin de año, y eso también es responsabilidad del entrenador.
    const nivel = debtLevel(debtMonths(r.caja, r.ingresos));
    if (nivel === 'grave') delta += 14;
    else if (nivel === 'complicada') delta += 7;
    else if (nivel === 'ajustada') delta += 3;

    // La cantera: un empujón chico. Que suban los pibes es parte del pedido, pero
    // nadie echa a un entrenador porque el XV tiene 24 años de promedio.
    if (r.cantera !== undefined) {
        if (r.cantera >= 70) delta -= 2;
        else if (r.cantera === 0) delta += 3;
    }

    // El piso depende de lo que te pidieron, no es cero. Ver `pressureFloor`.
    const next = clamp(Math.round(pressure + delta), pressureFloor(r.objective.kind), FIRING_PRESSURE);

    let reputationDelta = 0;
    if (r.nacional) reputationDelta += 14;
    if (r.tdi === 'campeon') reputationDelta += 10;
    else if (r.tdi === 'final') reputationDelta += 5;
    if (r.champion) reputationDelta += 7;
    if (r.promoted) reputationDelta += 6;
    if (r.relegated) reputationDelta -= 9;
    // Cumplir también suma nombre, de a poco: es lo que mira el mercado de
    // entrenadores (`market.ts`) cuando un club busca técnico.
    if (met) reputationDelta += 2;
    if (!met && !r.champion && !r.promoted) reputationDelta -= 3;

    return {
        pressure: next,
        reputationDelta,
        objectiveMet: met,
        fired: next >= FIRING_PRESSURE,
        verdict: verdictFor(met, r, nivel),
    };
}

function verdictFor(met: boolean, r: SeasonReview, nivel: ReturnType<typeof debtLevel>): string {
    if (r.nacional) return 'Campeones del Nacional de Clubes. En el club no lo van a olvidar.';
    if (r.tdi === 'campeon') return 'Campeones del Torneo del Interior.';
    if (r.relegated) return 'Se perdió la categoría. La subcomisión ya habla de otro proyecto.';
    if (r.promoted) return 'Ascenso. El año que viene se juega más arriba.';
    if (r.champion) return 'Campeones del torneo.';
    if (nivel === 'grave') return 'El equipo cumplió, pero el club está en rojo y eso se nota en la sede.';
    if (met) return 'La subcomisión está conforme: se cumplió lo que se pidió.';
    return 'No se cumplió el objetivo. La paciencia no es infinita.';
}

/** Cómo se lee la presión en la cabecera. */
export function pressureBand(pressure: number): 'tranquila' | 'atenta' | 'caliente' | 'terminal' {
    if (pressure < 35) return 'tranquila';
    if (pressure < 60) return 'atenta';
    if (pressure < 85) return 'caliente';
    return 'terminal';
}

function clamp(v: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, v));
}
