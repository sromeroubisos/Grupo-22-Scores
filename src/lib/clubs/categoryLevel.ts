/**
 * El escalafón de categorías de un club.
 *
 * El panel de una familia mezcla fichas de distinto nivel en la misma jornada, y
 * ordenarlas por horario no dice nada: la Intermedia juega a las 15:15 y la
 * Primera a las 17:00 solo porque comparten cancha. El orden que se lee es el
 * del escalafón — Primera, Reserva, Pre Reserva, y después los juveniles de
 * mayor a menor.
 *
 * La regla del catálogo: **el rango es del sistema, el nombre es del club.**
 * En la URBA y en Córdoba la división que sigue a Primera se llama "Intermedia";
 * en otras uniones, "Reserva". Es el MISMO escalón. Por eso acá hay una lista
 * corta de rangos canónicos y una tabla de alias que traduce el nombre libre.
 * Un club puede llamar "Los Pumitas" a su Reserva: para eso está el selector,
 * que guarda el rango a mano y le gana a cualquier lectura del nombre.
 */

import { categoryKey } from './categoryName.ts';

export type CategoryLevel = {
    /** Clave estable. Se persiste ESTA y no el número: reordenar el escalafón
     *  no puede obligar a migrar filas. */
    key: string;
    label: string;
    rank: number;
};

// Los escalones mayores van de cien en cien: dejan lugar para meter uno en el
// medio sin recalcular los de abajo.
const RANK_PRIMERA = 100;
const RANK_RESERVA = 200;
const RANK_PRE_RESERVA = 300;
const YOUTH_BASE = 400;

/**
 * Los juveniles se ordenan por edad de mayor a menor, y la cuenta sale de la
 * edad en vez de una lista fija. Así un M23 —que la URBA sí usa y este
 * escalafón no nombra— cae solo entre Pre Reserva y M22, que es donde va, en
 * lugar de quedar sin rango.
 */
export function youthRank(age: number): number {
    return YOUTH_BASE + (100 - age);
}

const YOUTH_AGES = [22, 21, 20, 19, 18, 17, 16, 15, 14] as const;

/** Lo que ofrece el selector. La inferencia puede devolver un `m23` que no está
 *  acá; el selector no lo ofrece pero lo respeta si ya venía guardado. */
export const CATEGORY_LEVELS: readonly CategoryLevel[] = [
    { key: 'primera', label: 'Primera', rank: RANK_PRIMERA },
    { key: 'reserva', label: 'Reserva', rank: RANK_RESERVA },
    { key: 'pre-reserva', label: 'Pre Reserva', rank: RANK_PRE_RESERVA },
    ...YOUTH_AGES.map(age => ({
        key: `m${age}`,
        label: `Menores de ${age}`,
        rank: youthRank(age),
    })),
];

const LEVEL_BY_KEY = new Map(CATEGORY_LEVELS.map(level => [level.key, level]));

/** ¿Es una clave que este escalafón sabe ordenar? */
export function isCategoryLevelKey(value: unknown): value is string {
    if (typeof value !== 'string') return false;
    const key = value.trim().toLowerCase();
    if (LEVEL_BY_KEY.has(key)) return true;
    return /^m\d{1,2}$/.test(key);
}

/** El número por el que se ordena. Una clave desconocida va al final. */
export function categoryLevelRank(key: unknown): number {
    if (typeof key !== 'string') return Number.MAX_SAFE_INTEGER;
    const normalized = key.trim().toLowerCase();

    const known = LEVEL_BY_KEY.get(normalized);
    if (known) return known.rank;

    const youth = /^m(\d{1,2})$/.exec(normalized);
    if (youth) return youthRank(Number(youth[1]));

    return Number.MAX_SAFE_INTEGER;
}

/** El rótulo canónico. Sirve para el selector y para explicar una inferencia. */
export function categoryLevelLabel(key: unknown): string {
    if (typeof key !== 'string') return '';
    const normalized = key.trim().toLowerCase();

    const known = LEVEL_BY_KEY.get(normalized);
    if (known) return known.label;

    const youth = /^m(\d{1,2})$/.exec(normalized);
    if (youth) return `Menores de ${youth[1]}`;

    return '';
}

/**
 * Nombres libres que significan un rango del escalafón.
 *
 * El orden IMPORTA: "pre intermedia" contiene "intermedia", así que los "pre"
 * se prueban primero. Sin eso una Pre-Intermedia se ordenaría como Reserva.
 */
const LEVEL_ALIASES: ReadonlyArray<{ pattern: RegExp; key: string }> = [
    { pattern: /\bpre\s*reserva\b/, key: 'pre-reserva' },
    { pattern: /\bpre\s*intermedia\b/, key: 'pre-reserva' },
    { pattern: /\bpreintermedia\b/, key: 'pre-reserva' },
    { pattern: /\bpre\s*primera\b/, key: 'pre-reserva' },
    { pattern: /\breserva\b/, key: 'reserva' },
    { pattern: /\bintermedia\b/, key: 'reserva' },
    { pattern: /\bprimera\b/, key: 'primera' },
    { pattern: /\bsuperior\b/, key: 'primera' },
];

/**
 * Lee el rango del nombre de la ficha.
 *
 * Devuelve `null` solo cuando el nombre no dice nada del nivel. Ese caso NO es
 * un error: "Duendes" o "Univ. Rosario" son la Primera del club y las resuelve
 * `resolveCategoryLevel`, que sabe que la ausencia de categoría es Primera.
 */
export function inferCategoryLevelKey(name: unknown): string | null {
    const key = categoryKey(name);
    if (!key) return null;

    // `categoryKey` ya plegó "menores de 15", "sub 15" y "m 15" a "m15".
    const youth = /\bm(\d{1,2})\b/.exec(key);
    if (youth) return `m${Number(youth[1])}`;

    for (const alias of LEVEL_ALIASES) {
        if (alias.pattern.test(key)) return alias.key;
    }

    return null;
}

/**
 * La letra de la ficha: la "B" de `Univ. Rosario "B"` o de `Club Newman M15 "B"`.
 *
 * Va SIEMPRE dentro de su rango, nunca lo cambia: si un club tiene Primera "A" y
 * Primera "B", las dos van antes que la Reserva. Es la regla que pidió el
 * usuario y por eso la letra es el segundo criterio de orden, no el primero.
 */
export function inferCategoryVariant(name: unknown): string {
    if (typeof name !== 'string') return '';
    const raw = name.trim();
    if (!raw) return '';

    // Se mira el texto CRUDO y no la clave normalizada. Normalizar "Tala R.C."
    // da "tala r c", y esa "c" final —que es la abreviatura de Rugby Club— se
    // leía como nominación: la Primera de Tala aparecía como "Primera C".
    // El punto de la abreviatura es lo que las distingue, y la normalización lo
    // borra.

    // Entrecomillada es inequívoca, y así la escribe el catálogo:
    // `Univ. Rosario "B"`, `Club Newman M15 "C"`.
    const quoted = /["'“”«»]\s*([A-Za-z])\s*["'“”«»]\s*$/.exec(raw);
    if (quoted) return quoted[1].toUpperCase();

    const paren = /\(\s*([A-Za-z])\s*\)\s*$/.exec(raw);
    if (paren) return paren[1].toUpperCase();

    // Suelta al final: "Duendes B". Una abreviatura queda afuera por el punto,
    // esté al final ("Tala R.C.") o pegado a la letra ("Tala R.C").
    if (/\.\s*[A-Za-z]?\s*$/.test(raw)) return '';

    const loose = /[\s-]([A-Za-z])\s*$/.exec(raw);
    if (loose) return loose[1].toUpperCase();

    return '';
}

export type ResolvedCategoryLevel = {
    key: string;
    variant: string;
    rank: number;
    label: string;
    /** `false` cuando salió del nombre y no de una elección del club. */
    explicit: boolean;
};

/**
 * El rango final de una ficha: lo que eligió el club si lo eligió, y si no, lo
 * que dice el nombre.
 *
 * Sin nada legible cae en Primera a propósito. Una ficha sin rango tendría que
 * ir a un limbo al final de la jornada, y el caso más común de "sin categoría en
 * el nombre" es justamente el equipo principal del club — "Duendes", "GEBA",
 * "Univ. Rosario"—, que ES la Primera. Equivocarse hacia Primera deja el panel
 * ordenado; equivocarse hacia el limbo lo deja desordenado.
 */
export function resolveCategoryLevel(input: {
    name?: unknown;
    storedLevel?: unknown;
    storedVariant?: unknown;
}): ResolvedCategoryLevel {
    const stored = typeof input.storedLevel === 'string' ? input.storedLevel.trim().toLowerCase() : '';
    const explicit = isCategoryLevelKey(stored);

    const key = explicit ? stored : (inferCategoryLevelKey(input.name) ?? 'primera');

    const storedVariant = typeof input.storedVariant === 'string' ? input.storedVariant.trim().toUpperCase() : '';
    const variant = storedVariant || inferCategoryVariant(input.name);

    return {
        key,
        variant,
        rank: categoryLevelRank(key),
        label: categoryLevelLabel(key),
        explicit,
    };
}

/**
 * Orden del escalafón: primero el rango, después la letra.
 *
 * La ficha sin letra va antes que la "A": "Primera" a secas es el equipo, y
 * "Primera A"/"Primera B" son la partición de un club que presenta dos.
 */
export function compareCategoryLevel(
    left: { rank: number; variant: string },
    right: { rank: number; variant: string },
): number {
    if (left.rank !== right.rank) return left.rank - right.rank;
    if (left.variant === right.variant) return 0;
    if (!left.variant) return -1;
    if (!right.variant) return 1;
    return left.variant.localeCompare(right.variant);
}
