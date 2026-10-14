// Los perfiles de entrenador. Es lo que se elige al empezar una carrera.
//
// Los cinco atributos suman lo mismo en los cinco perfiles: no hay uno mejor,
// hay uno que resuelve otras cosas. El formador construye a diez años y sufre el
// primero; el de la sede mantiene el club a flote y no gana partidos por sí solo.

import type { CoachAttributes } from '../types/coach.ts';

export interface CoachProfile {
    id: string;
    name: string;
    /** Una línea que dice qué resigna, no solo qué gana. */
    text: string;
    attrs: CoachAttributes;
}

/** Los veinticinco puntos que reparte cualquier perfil. Hay un test. */
export const PROFILE_POINTS = 25;

export const COACH_PROFILES: readonly CoachProfile[] = [
    {
        id: 'estratega',
        name: 'El estratega',
        text: 'Ganás partidos desde el pizarrón. La sede y la caja son problema de otro.',
        attrs: { conduccion: 8, arenga: 4, formacion: 5, gestion: 3, disciplina: 5 },
    },
    {
        id: 'formador',
        name: 'El formador',
        text: 'En tres años tenés un plantel propio. En el primero vas a comer varias.',
        attrs: { conduccion: 4, arenga: 5, formacion: 9, gestion: 4, disciplina: 3 },
    },
    {
        id: 'motivador',
        name: 'El motivador',
        text: 'Con el agua al cuello sacás partidos de cualquier lado. Con todo tranquilo, no aportás de más.',
        attrs: { conduccion: 5, arenga: 9, formacion: 4, gestion: 4, disciplina: 3 },
    },
    {
        id: 'dirigente',
        name: 'El de la sede',
        text: 'Conseguís el sponsor, la cancha y el micro. Los sábados dependés del plantel.',
        attrs: { conduccion: 4, arenga: 4, formacion: 5, gestion: 9, disciplina: 3 },
    },
    {
        id: 'disciplinador',
        name: 'El del orden',
        text: 'Tu equipo no regala penales ni tarjetas. Tampoco improvisa cuando hace falta.',
        attrs: { conduccion: 5, arenga: 3, formacion: 4, gestion: 4, disciplina: 9 },
    },
];

export function getProfile(id: string): CoachProfile | null {
    return COACH_PROFILES.find((p) => p.id === id) ?? null;
}

/**
 * Cuánto se puede mover cada eje respecto del perfil. Es el reparto de puntos de
 * El Interino, con una diferencia a propósito: la SUMA NO CAMBIA. Lo que le
 * sacás a un eje se lo ponés a otro, así que ningún ajuste da un entrenador
 * mejor que otro —da uno distinto— y el balance medido sobre los cinco perfiles
 * sigue valiendo. Y el ±2 hace que el perfil siga significando algo: el formador
 * ajustado sigue siendo un formador.
 */
export const TUNE_RANGE = 2;

const ATTR_KEYS: readonly (keyof CoachAttributes)[] = ['conduccion', 'arenga', 'formacion', 'gestion', 'disciplina'];

/**
 * Valida un ajuste sobre un perfil. Devuelve los atributos si es legal, o `null`
 * si algún eje se pasa del rango, sale de 1..10, no es entero o la suma cambió.
 */
export function tuneAttrs(profileId: string, attrs: CoachAttributes): CoachAttributes | null {
    const profile = getProfile(profileId);
    if (!profile) return null;
    let sum = 0;
    for (const key of ATTR_KEYS) {
        const v = attrs[key];
        if (!Number.isInteger(v) || v < 1 || v > 10) return null;
        if (Math.abs(v - profile.attrs[key]) > TUNE_RANGE) return null;
        sum += v;
    }
    if (sum !== PROFILE_POINTS) return null;
    return { ...attrs };
}
