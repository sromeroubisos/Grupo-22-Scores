/**
 * Evita que un cruce de copas repita rival de zona.
 *
 * Caso del Veco Villegas: "1.º Primero vs Mejor Segundo". Si el mejor segundo
 * salió de la misma zona que el 1.º primero, ya se enfrentaron en la
 * clasificatoria y "se intercambian los cruces". Se expresa como un
 * intercambio de sembrados: si el sembrado `seed` es de la misma zona que el
 * sembrado `as`, se cambian de lugar los sembrados `swap`.
 *
 * Sin dependencias (ni alias `@/`) para poder probarlo con `node --test`.
 */

export interface ZoneConflictSwap {
  seed: number;
  as: number;
  swap: [number, number];
}

export function parseZoneConflictSwap(raw: unknown): ZoneConflictSwap | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const seed = Math.floor(Number(r.seed));
  const as = Math.floor(Number(r.as));
  const swap = Array.isArray(r.swap) ? r.swap.map((n) => Math.floor(Number(n))) : [];
  if (swap.length !== 2) return null;
  if (![seed, as, swap[0], swap[1]].every((n) => Number.isFinite(n) && n >= 1)) return null;
  if (swap[0] === swap[1] || seed === as) return null;
  return { seed, as, swap: [swap[0], swap[1]] };
}

/**
 * Aplica la regla sobre el orden de sembrados (índice 0 = sembrado #1).
 * Devuelve el mismo arreglo si no hay conflicto o si falta algún sembrado.
 */
export function applyZoneConflictSwap(
  order: string[],
  groupOf: Map<string, string | null>,
  rule: ZoneConflictSwap | null | undefined,
): string[] {
  if (!rule) return order;
  const a = order[rule.seed - 1];
  const b = order[rule.as - 1];
  const s0 = order[rule.swap[0] - 1];
  const s1 = order[rule.swap[1] - 1];
  if (!a || !b || !s0 || !s1) return order;
  const ga = groupOf.get(a) ?? null;
  const gb = groupOf.get(b) ?? null;
  if (!ga || ga !== gb) return order;
  const next = order.slice();
  next[rule.swap[0] - 1] = s1;
  next[rule.swap[1] - 1] = s0;
  return next;
}
