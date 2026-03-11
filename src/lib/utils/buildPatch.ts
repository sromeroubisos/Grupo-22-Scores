// ============================================================
// BUILD PATCH UTILITY
// ============================================================
// Detecta campos "sucios" (dirty fields) comparando valores
// iniciales vs. actuales, y construye un PATCH parcial.
//
// Esto evita:
// - Enviar todos los campos al backend (eficiencia)
// - Pisar valores existentes con nulls accidentales
// - Confusión sobre qué cambió realmente
// ============================================================

import { isEqual, normalizeText } from './normalize';

/**
 * Construye un patch con solo los campos que cambiaron
 *
 * @param initial - Valores iniciales (del servidor)
 * @param current - Valores actuales (del form)
 * @param normalizers - Map de funciones de normalización por campo (opcional)
 * @returns Objeto con solo los campos que cambiaron
 *
 * Ejemplo:
 * ```ts
 * const initial = { name: 'SIC', city: 'Rosario', logo_url: null };
 * const current = { name: 'SIC', city: 'Rosario ', logo_url: '' };
 *
 * const patch = buildPatch(initial, current, {
 *   city: normalizeText,
 *   logo_url: normalizeText
 * });
 *
 * // patch = {} (city normalizado es igual, logo_url "" → null = igual)
 * ```
 */
export function buildPatch<T extends Record<string, any>>(
  initial: T,
  current: T,
  normalizers?: Partial<Record<keyof T, (val: any) => any>>
): Partial<T> {
  const patch: Partial<T> = {};

  for (const key of Object.keys(current) as (keyof T)[]) {
    const initialVal = initial[key];
    const currentVal = current[key];

    // Aplicar normalización si existe
    const normalizer = normalizers?.[key];
    const normalizedInitial = normalizer ? normalizer(initialVal) : initialVal;
    const normalizedCurrent = normalizer ? normalizer(currentVal) : currentVal;

    // Si son diferentes, agregarlo al patch
    if (!isEqual(normalizedInitial, normalizedCurrent)) {
      patch[key] = normalizedCurrent;
    }
  }

  return patch;
}

/**
 * Construye un patch para arrays (detecta add/remove)
 *
 * @param initial - Array inicial
 * @param current - Array actual
 * @returns Objeto con { add, remove }
 *
 * Ejemplo:
 * ```ts
 * const initial = ['alias1', 'alias2'];
 * const current = ['alias2', 'alias3'];
 *
 * const diff = buildArrayPatch(initial, current);
 * // diff = { add: ['alias3'], remove: ['alias1'] }
 * ```
 */
export function buildArrayPatch(
  initial: string[],
  current: string[]
): { add: string[]; remove: string[] } {
  const initialSet = new Set(initial.map(normalizeText).filter(Boolean) as string[]);
  const currentSet = new Set(current.map(normalizeText).filter(Boolean) as string[]);

  const add: string[] = [];
  const remove: string[] = [];

  // Items en current pero no en initial → add
  for (const item of currentSet) {
    if (!initialSet.has(item)) {
      add.push(item);
    }
  }

  // Items en initial pero no en current → remove
  for (const item of initialSet) {
    if (!currentSet.has(item)) {
      remove.push(item);
    }
  }

  return { add, remove };
}

/**
 * Verifica si un patch está vacío (no hay cambios)
 */
export function isPatchEmpty(patch: Record<string, any>): boolean {
  return Object.keys(patch).length === 0;
}

/**
 * Verifica si un array patch está vacío
 */
export function isArrayPatchEmpty(patch: { add: any[]; remove: any[] }): boolean {
  return patch.add.length === 0 && patch.remove.length === 0;
}

/**
 * Combina múltiples patches en uno solo
 * (útil si tienes patches de diferentes secciones)
 */
export function mergePatches<T extends Record<string, any>>(
  ...patches: Partial<T>[]
): Partial<T> {
  return Object.assign({}, ...patches);
}
