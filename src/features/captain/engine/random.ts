// EL CAPITÁN — el azar.
//
// El PRNG se REUSA, no se copia. `career/engine/random.ts` es un mulberry32 con
// hash FNV-1a que no importa nada, no sabe qué es un club y ya está probado:
// copiarlo sería mantener dos veces el mismo generador y arriesgarse a que un
// día difieran en un `>>> 0`.
//
// Este archivo existe igual, y no es ceremonia: hace que TODO captain/ pida el
// azar por la misma ruta local. Si mañana el PRNG se muda a un lugar neutro,
// hay un solo archivo que tocar.
//
// ── Cómo se usa ──
// El rng es MUTABLE por clausura: no devuelve uno nuevo, mutás el objeto y leés
// `rng.state` cuando querés sellar. El patrón del reducer es siempre el mismo:
//
//     const rng = createRng(next.rngState);
//     ...operar...
//     next.rngState = rng.state;
//
// Y la regla que no se rompe (CLAUDE.md §1): si necesitás azar, pedí un `rng`
// por parámetro. Nunca lo tomes de un scope superior, nunca uses Math.random.

export { createRng, rngFromState, hashSeed } from '../../career/engine/random.ts';
export type { Rng } from '../../career/engine/random.ts';
