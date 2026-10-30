/**
 * Las categorías que un club elige con un toque, sin escribirlas.
 *
 * "Primera" es el club base; el resto, si el club todavía no la tiene, se crea
 * como club derivado con el nombre completo ("Catamarca R.C. M16"). Los rótulos
 * son los del interior (Intermedia, no Reserva): el orden lo da `level`, que es
 * el mismo escalón con cualquier nombre (ver `categoryLevel.ts`).
 *
 * Hay dos grupos. Las categorías comunes y las de DESARROLLO (M1, M2): los
 * clubes en formación juntan edades porque no llegan a armar un equipo por
 * año, y esas fichas no son ningún "Menores de N" del escalafón.
 *
 * Cada categoría admite letra (A a H): "M16 A", "M16 B". La letra va en el
 * nombre, que es de donde la lee `inferCategoryVariant`.
 *
 * Lo usan las dos puertas por donde un club crea categorías: el alta de partido
 * (`PanelMatchForm`) y la pestaña Jugadores del gestor de club, las dos a
 * través de `CategoryPicker`.
 */

import { inferCategoryLevelKey, resolveCategoryLevel } from './categoryLevel.ts';

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

/** Categorías de desarrollo: edades agrupadas, no un año del escalafón. */
export const DEVELOPMENT_PRESETS: readonly CategoryPreset[] = [
    { label: 'M1', level: 'm1' },
    { label: 'M2', level: 'm2' },
];

export const ALL_PRESETS: readonly CategoryPreset[] = [...CATEGORY_PRESETS, ...DEVELOPMENT_PRESETS];

/** Las letras que ofrece la fila de equipos de una categoría. */
export const CATEGORY_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'] as const;

export type CategoryOption = { id: string; name: string; isBase: boolean };

/**
 * El rango que DICE el nombre de la ficha, o `null` si no dice ninguno.
 *
 * No se usa `resolveCategoryLevel(...).key` porque esa cae en Primera cuando el
 * nombre no dice nada (decisión correcta para ordenar una jornada), y acá eso
 * mezclaría "Catamarca R.C. Damas" con el botón Primera. El club base sí es
 * Primera aunque su nombre no lo diga.
 */
export function categoryOptionLevel(option: CategoryOption): string | null {
    const inferred = inferCategoryLevelKey(option.name);
    if (inferred) return inferred;
    return option.isBase ? 'primera' : null;
}

/** La letra de una ficha ("B" de "Catamarca R.C. M16 B"), o '' si no tiene. */
export function categoryOptionVariant(option: CategoryOption): string {
    if (option.isBase) return '';
    return resolveCategoryLevel({ name: option.name }).variant;
}

/**
 * La ficha de una lista que corresponde a un rango y una letra.
 *
 * Sin `variant` (undefined) devuelve la "principal" del rango: la base para
 * Primera, si no la que no tiene letra, y si solo hay con letra, la primera.
 * Con `variant` ('' = sin letra, 'B' = la B) busca exactamente esa.
 */
export function findCategoryByLevel(
    options: readonly CategoryOption[],
    level: string,
    variant?: string,
): CategoryOption | null {
    const sameLevel = options.filter((option) => categoryOptionLevel(option) === level);
    const plain = sameLevel.find((option) => option.isBase)
        ?? sameLevel.find((option) => categoryOptionVariant(option) === '')
        ?? null;

    if (variant === undefined) return plain ?? sameLevel[0] ?? null;
    if (variant === '') return plain;
    return sameLevel.find((option) => !option.isBase && categoryOptionVariant(option) === variant) ?? null;
}

/** El rótulo con que se pide la categoría al servidor: "M16" o "M16 B". */
export function presetLabel(preset: CategoryPreset, variant = ''): string {
    return variant ? `${preset.label} ${variant}` : preset.label;
}

/** El nombre que va a tener la categoría si se crea. */
export function presetCategoryName(baseName: string, preset: CategoryPreset, variant = ''): string {
    if (preset.level === 'primera' && !variant) return baseName;
    return `${baseName} ${presetLabel(preset, variant)}`;
}

/** Las fichas que no caen en ningún botón: nombres propios como "Damas". */
export function customCategories(options: readonly CategoryOption[]): CategoryOption[] {
    const presetLevels = new Set(ALL_PRESETS.map((preset) => preset.level));
    return options.filter((option) => {
        if (option.isBase) return false;
        const level = categoryOptionLevel(option);
        return !level || !presetLevels.has(level);
    });
}
