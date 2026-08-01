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
// derivada existe para evitar.
//
// ┌───────────────────────────────────────────────────────────────────────────┐
// │ CUÁNDO SE MIGRAN — decidido, no pendiente de decidir                      │
// │                                                                            │
// │ JUSTO ANTES DEL ÚLTIMO MOMENTO POR PUESTO. Ni ahora ni al final del todo.  │
// │                                                                            │
// │ El motivo es el digest. Migrarlos mueve la tabla congelada una vez, y esa  │
// │ vez el diff es 100% plomería: mismo diseño, otro stream. Si la migración   │
// │ se hace hoy, ese movimiento queda mezclado con los quince movimientos de   │
// │ contenido que vienen después y ya no se puede leer cuál fue cuál. Si se    │
// │ hace al final del todo, es lo mismo al revés.                              │
// │                                                                            │
// │ Puesta justo antes del último, el commit de migración es el único de toda  │
// │ la feature cuyo diff de digest NO se explica por contenido — y se puede    │
// │ revisar solo. Después entra el Momento quince y su movimiento vuelve a ser │
// │ legible.                                                                   │
// └───────────────────────────────────────────────────────────────────────────┘

export type MomentKind = 'tackle' | 'bunker' | 'jackal' | 'ancla' | 'codigo' | 'palos';

/**
 * Los que puede sortear el selector, en ORDEN CANÓNICO.
 *
 * `bunker` no está: no se sortea, se llega a él. A qué familia le toca cada uno
 * tampoco se decide acá sino en su `MomentDef.families` — este archivo no
 * importa nada y no va a empezar ahora.
 */
export const SELECTABLE_MOMENTS: readonly MomentKind[] = ['tackle', 'jackal', 'ancla', 'codigo', 'palos'];

export const MOMENT_LABEL: Record<MomentKind, string> = {
    tackle: 'El tackle',
    bunker: 'El bunker',
    jackal: 'El jackal',
    ancla: 'El ancla',
    codigo: 'El código',
    palos: 'Los palos',
};
