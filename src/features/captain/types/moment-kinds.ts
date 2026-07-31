// EL CAPITÁN — el catálogo de Momentos.
//
// Vive en su propio archivo, sin importar nada, porque lo leen tanto los tipos
// como el motor y la pantalla. Cuando entren los quince minijuegos por puesto,
// cada uno agrega su clave acá y su resolución en `engine/moments.ts`: el
// selector no cambia.
//
// ── Los transversales ──
// `tackle` y `bunker` no dependen del puesto: le tocan a cualquiera. El tackle
// causa la mitad de todas las lesiones del rugby, así que es el Momento que
// más se merece ser el hilo común — y encima es el único que se enchufa
// directo con el sistema disciplinario que el motor ya tiene.

export type MomentKind = 'tackle' | 'bunker';

/** Los que puede sortear el selector. `bunker` no: se llega a él, no se sortea. */
export const SELECTABLE_MOMENTS: readonly MomentKind[] = ['tackle'];

export const MOMENT_LABEL: Record<MomentKind, string> = {
    tackle: 'El tackle',
    bunker: 'El bunker',
};
