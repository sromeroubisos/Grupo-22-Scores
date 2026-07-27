// Situación del jugador dentro del plantel. DOS EJES independientes, no un
// único escalón lineal:
//
//   · EmploymentStatus — el VÍNCULO económico. Sí es ordinal.
//   · SquadTrack        — DÓNDE está en el plantel (academia/desarrollo vs
//     senior). NO es un escalón económico: un pibe de desarrollo en Toulouse
//     puede cobrar más que un semipro de Nationale.
//
// Antes existía un `ContractStatus` de 5 valores con `development` metido como
// escalón intermedio, lo que producía absurdos como "primer compensado a los 34"
// en alguien que ya había sido profesional. Ahora son ejes separados y las
// transiciones no usan un rank único para todo.

import type { ClubDef } from '../data/clubs.ts';
import type { EconomicModel } from '../data/competition-levels2026.ts';
import { economicModelOf, sportingBandOf } from '../data/competition-levels2026.ts';

export type EmploymentStatus =
    | 'amateur' // juega por el club, sin contraprestación
    | 'amateur-compensated' // viáticos o compensación, sin vínculo laboral
    | 'semi-professional' // vínculo parcial, compatible con trabajo o estudio
    | 'full-time-professional'; // dedicación completa

export type SquadTrack =
    | 'development' // academia / plantel de desarrollo
    | 'senior'; // plantel principal

export const EMPLOYMENT_ORDER: readonly EmploymentStatus[] = [
    'amateur', 'amateur-compensated', 'semi-professional', 'full-time-professional',
];

export const EMPLOYMENT_LABELS: Readonly<Record<EmploymentStatus, string>> = {
    amateur: 'Amateur',
    'amateur-compensated': 'Compensado',
    'semi-professional': 'Semipro',
    'full-time-professional': 'Profesional',
};

export function employmentRank(status: EmploymentStatus): number {
    return EMPLOYMENT_ORDER.indexOf(status);
}

export function isProfessionalEmployment(status: EmploymentStatus): boolean {
    return status === 'full-time-professional';
}

/**
 * Etiqueta que ve el usuario. El track de desarrollo se muestra como
 * "Desarrollo"; si no, se muestra el vínculo económico.
 */
export function contractLabel(employment: EmploymentStatus, track: SquadTrack): string {
    return track === 'development' ? 'Desarrollo' : EMPLOYMENT_LABELS[employment];
}

/** Techo de empleo que puede ofrecer una competición según su economía. */
export function employmentCeiling(model: EconomicModel): EmploymentStatus {
    if (model === 'amateur') return 'amateur-compensated';
    if (model === 'mixed') return 'semi-professional';
    return 'full-time-professional';
}

export interface ContractInput {
    club: ClubDef;
    age: number;
    /** Valor de mercado del jugador, en la escala de `club.rating`. */
    value: number;
    potential: number;
    ovr: number;
    role: 'starter' | 'rotation' | 'fringe';
}

export interface ContractResolution {
    employment: EmploymentStatus;
    track: SquadTrack;
}

/**
 * ¿El jugador entra por la vía de DESARROLLO? Es un juvenil con proyección en
 * una estructura profesional/mixta, por debajo de la exigencia senior.
 */
function isDevelopmentEntry(input: ContractInput, model: EconomicModel): boolean {
    if (model === 'amateur') return false; // sin academia profesional detrás
    const gap = input.value - input.club.rating;
    const promising = input.potential - input.ovr >= 8;
    return input.age <= 22 && gap < -4 && (promising || input.age <= 20);
}

/**
 * Resuelve empleo + track. Determinístico, sin RNG.
 *   · club amateur: empleo amateur / compensado excepcional; nunca desarrollo.
 *   · club pro/mixto: un juvenil por debajo del senior entra en DESARROLLO,
 *     con el empleo que su estructura sostiene (desde compensado a profesional).
 *   · el full-time senior exige acercarse al nivel que el club pide.
 */
export function resolveContract(input: ContractInput): ContractResolution {
    const { club, age, value, potential, ovr, role } = input;
    const model = economicModelOf(club);
    const ceiling = employmentCeiling(model);

    if (model === 'amateur') {
        const compensated = role === 'starter' && value >= club.rating - 2 && sportingBandOf(club) >= 2;
        return { employment: compensated ? 'amateur-compensated' : 'amateur', track: 'senior' };
    }

    const gap = value - club.rating;
    const young = age <= 23;
    const promising = potential - ovr >= 10;

    // Empleo "merecido", pesando el ROL: un TITULAR de un club profesional es
    // profesional aunque su valor absoluto quede algo por debajo del rating del
    // club (es titular justamente porque está a la altura). Un suplente cobra
    // menos. Esto es lo que permite que un titular de una franquicia SRA
    // (rating ~60-68) sea full-time sin tener el valor de un titular de Top 14.
    let employment: EmploymentStatus;
    if (role === 'starter' && gap >= -8) employment = 'full-time-professional';
    else if (role === 'rotation' && gap >= -4) employment = 'full-time-professional';
    else if (gap >= -10) employment = 'semi-professional';
    else employment = 'amateur-compensated';
    void young;
    if (employmentRank(employment) > employmentRank(ceiling)) employment = ceiling;

    // Track: desarrollo si es un juvenil por debajo del senior.
    const track: SquadTrack = isDevelopmentEntry(input, model) ? 'development' : 'senior';

    // Un juvenil de desarrollo en estructura profesional puede tener vínculo
    // profesional aunque no sea titular: es una promesa contratada.
    if (track === 'development' && model === 'professional' && promising) {
        employment = employmentRank(employment) < employmentRank('semi-professional') ? 'semi-professional' : employment;
    }

    return { employment, track };
}

/**
 * Evolución al quedarse en el club. Empleo sube/baja UN escalón por vez.
 * El track puede cambiar en cualquier dirección (subir a senior, o volver a
 * desarrollo raramente) según el rendimiento, sin pasar por el rank de empleo.
 */
export function renewContract(
    current: ContractResolution,
    input: ContractInput,
): ContractResolution {
    const target = resolveContract(input);

    // Empleo: un escalón por vez.
    const from = employmentRank(current.employment);
    const to = employmentRank(target.employment);
    const employment = to > from
        ? EMPLOYMENT_ORDER[Math.min(from + 1, EMPLOYMENT_ORDER.length - 1)]
        : to < from
            ? EMPLOYMENT_ORDER[Math.max(to, from - 1)]
            : current.employment;

    // Track: el desarrollo gradúa a senior cuando el jugador ya rinde; un senior
    // no vuelve a desarrollo (sí puede perder empleo). Una vez consolidado, se
    // queda en senior.
    let track = current.track;
    if (current.track === 'development') {
        // Una academia lleva tiempo: no se gradúa a senior por rozar el nivel en
        // el primer año. Se sube al plantel principal cuando de verdad rinde
        // (cerca del nivel del club), ya es titular, o por edad.
        const readyForSenior = input.value >= input.club.rating - 2 || input.role === 'starter' || input.age >= 23;
        track = readyForSenior ? 'senior' : target.track;
    }

    return { employment, track };
}
