/**
 * Las tres perspectivas de una tabla de posiciones.
 *
 * Es un módulo hoja a propósito: no importa nada. La lista vive acá y no en el
 * componente ni en el route porque la escriben tres lados (el que recalcula, el
 * que lee y el que valida el body) y una whitelist duplicada es una whitelist
 * que se desincroniza.
 *
 * Los valores son los que ya viajan por la red y están guardados en
 * `stats.table_type`: `general`, `home`, `away`. La traducción a "General",
 * "Local" y "Visitante" es de la UI y se queda ahí.
 */

export const TABLE_TYPES = ['general', 'home', 'away'] as const;

export type TableType = (typeof TABLE_TYPES)[number];

export const DEFAULT_TABLE_TYPE: TableType = 'general';

export function isTableType(value: unknown): value is TableType {
    return typeof value === 'string' && (TABLE_TYPES as readonly string[]).includes(value);
}

/**
 * Devuelve el tipo de tabla si el valor es uno de los tres, o `null` si no.
 *
 * Devuelve `null` en vez de caer a `general` porque el que llama tiene que
 * poder distinguir "no me mandaron nada" de "me mandaron cualquier cosa": lo
 * primero es el default, lo segundo es un 400. Un fallback silencioso a
 * `general` recalcularía la tabla equivocada sin que nadie se entere.
 *
 * `undefined` y `null` sí caen al default: son la ausencia del campo.
 */
export function normalizeTableType(value: unknown): TableType | null {
    if (value === undefined || value === null || value === '') return DEFAULT_TABLE_TYPE;
    if (typeof value !== 'string') return null;
    const trimmed = value.trim().toLowerCase();
    if (trimmed === '') return DEFAULT_TABLE_TYPE;
    return isTableType(trimmed) ? trimmed : null;
}
