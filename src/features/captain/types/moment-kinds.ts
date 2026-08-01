// EL CAPITÁN — el catálogo de Momentos.
//
// Vive en su propio archivo, sin importar nada, porque lo leen tanto los tipos
// como el motor y la pantalla. Cada Momento nuevo agrega su clave acá y su
// definición en `engine/moment-defs/`: el selector no cambia.
//
// ── Los transversales ──
// `tackle` y `bunker` no dependen del puesto: le tocan a cualquiera. El tackle
// causa la mitad de todas las lesiones del rugby, así que es el Momento que
// más se merece ser el hilo común — y encima es el único que se enchufa
// directo con el sistema disciplinario que el motor ya tiene.
//
// ── Por qué el tackle NO va por el contrato ──
// `tackle` y `bunker` se escribieron ANTES de `types/moment-def.ts` y siguen
// resolviéndose por su carril propio en `engine/moments.ts`. No es deuda
// olvidada: migrarlos movería el veredicto del bunker del stream principal del
// rng a la semilla del Setup, y eso corre la carrera entera de cualquiera que
// alguna vez haya hecho un tackle alto. O sea, movería el digest congelado por
// PLOMERÍA y no por diseño — que es exactamente el ruido que la semilla
// derivada existe para evitar. Se migran cuando haya un motivo de diseño.

export type MomentKind = 'tackle' | 'bunker' | 'jackal';

/**
 * Los que puede sortear el selector, en ORDEN CANÓNICO.
 *
 * `bunker` no está: no se sortea, se llega a él. A qué familia le toca cada uno
 * tampoco se decide acá sino en su `MomentDef.families` — este archivo no
 * importa nada y no va a empezar ahora.
 */
export const SELECTABLE_MOMENTS: readonly MomentKind[] = ['tackle', 'jackal'];

export const MOMENT_LABEL: Record<MomentKind, string> = {
    tackle: 'El tackle',
    bunker: 'El bunker',
    jackal: 'El jackal',
};
