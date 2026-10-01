/**
 * Las categorías que un club elige con un toque, sin escribirlas.
 *
 * "Primera" es el club base; el resto, si el club todavía no la tiene, se crea
 * como club derivado con el nombre completo ("Catamarca R.C. M16"). Los rótulos
 * son los del interior (Intermedia, no Reserva): el orden lo da `level`, que es
 * el mismo escalón con cualquier nombre (ver `categoryLevel.ts`).
 *
 * Lo usan las dos puertas por donde un club crea categorías: el alta de partido
 * del panel (`PanelMatchForm`) y la pestaña Jugadores del gestor de club.
 */

import { resolveCategoryLevel } from './categoryLevel.ts';

export type CategoryPreset = { label: string; level: string };

export const CATEGORY_PRESETS: readonly CategoryPreset[] = [
    { label: 'Primera', level: 'primera' },
    { label: 'Intermedia', level: 'reserva' },
    { label: 'Pre Intermedia', level: 'pre-reserva' },
    { label: 'M19', level: 'm19' },
    { label: 'M18', level: 'm18' },
    { label: 'M17', level: 'm17' },
    { label: 'M16', level: 'm16' },
    { label: 'M15', level: 'm15' },
    { label: 'M14', level: 'm14' },
];

export type CategoryOption = { id: string; name: string; isBase: boolean; level?: string | null };

/** El rango de una ficha: el que vino guardado o, si no, el que dice el nombre. */
export function categoryOptionLevel(option: CategoryOption): string {
    return option.level || resolveCategoryLevel({ name: option.name }).key;
}

/**
 * La ficha de una lista que corresponde a un rango. La base gana para Primera
 * (un derivado de otro deporte también se lee como "Primera"), y entre "M16" y
 * "M16 B" gana la que no tiene letra.
 */
export function findCategoryByLevel(options: readonly CategoryOption[], level: string): CategoryOption | null {
    if (level === 'primera') {
        const base = options.find(option => option.isBase);
        if (base) return base;
    }
    const matches = options.filter(option => categoryOptionLevel(option) === level);
    return matches.find(option => !resolveCategoryLevel({ name: option.name }).variant) ?? matches[0] ?? null;
}

/** El nombre que va a tener la categoría si se crea. */
export function presetCategoryName(baseName: string, preset: CategoryPreset): string {
    return preset.level === 'primera' ? baseName : `${baseName} ${preset.label}`;
}
