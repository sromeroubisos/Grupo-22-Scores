// EL CAPITÁN — el registry de los siete verbos.
//
// La lista es un ARRAY en orden declarado y el índice se arma a partir de ella,
// nunca al revés: un `Record` literal obligaría a recorrerlo con `Object.keys`
// para listarlos, y elegir sobre el orden de inserción de un objeto es la fuente
// de no-determinismo encubierta que CLAUDE.md §1 prohíbe.
//
// Acá NO hay React. La pantalla de cada verbo se registra del lado de `app/`
// (`MomentScreens.tsx`), para que el motor pueda correr en un test de Node sin
// DOM.

import type { MechanicId, Mechanic } from '../../types/minigame.ts';
import { VENTANA } from './ventana.ts';
import { SOSTEN } from './sosten.ts';
import { PUNTERIA } from './punteria.ts';
import { PUNTO } from './punto.ts';
import { LECTURA } from './lectura.ts';
import { SECUENCIA } from './secuencia.ts';
import { MEMORIA } from './memoria.ts';

/**
 * La mecánica con los genéricos borrados.
 *
 * El borrado es seguro POR CONSTRUCCIÓN —el spec empareja verbo y parámetros en
 * el tipo (`AnyMinigameSpec`), así que a `setup` no le puede llegar un
 * `MemoriaParams` estando indexada en `ventana`— y aun así hay un test que lo
 * verifica, por lo mismo que en el registry de Momentos: seguro por
 * construcción no alcanza cuando la construcción la hace otro.
 */
export type AnyMechanic = Mechanic<never, unknown, never>;

function widen<P, S, I>(m: Mechanic<P, S, I>): AnyMechanic {
    return m as unknown as AnyMechanic;
}

/** Los siete, en ORDEN DECLARADO y estable. */
export const MECHANICS: readonly AnyMechanic[] = [
    widen(VENTANA),
    widen(SOSTEN),
    widen(PUNTERIA),
    widen(PUNTO),
    widen(LECTURA),
    widen(SECUENCIA),
    widen(MEMORIA),
];

const BY_ID: Partial<Record<MechanicId, AnyMechanic>> = {};
for (const m of MECHANICS) BY_ID[m.id] = m;

/**
 * El verbo, o TIRA con el nombre adentro.
 *
 * No devuelve `null` como `getMomentDef`, y la diferencia es real: allá el
 * `null` significa "es pre-contrato y va por el otro carril", que es un caso
 * legítimo. Acá no hay otro carril — un spec con un verbo que no existe es un
 * error de programación, y devolver `null` lo dejaría llegar hasta la pantalla
 * como una tarjeta muda que traba la carrera.
 */
export function getMechanic(id: MechanicId): AnyMechanic {
    const found = BY_ID[id];
    if (!found) {
        throw new Error(
            `El verbo '${id}' no existe: los siete están en engine/mechanics/index.ts.`,
        );
    }
    return found;
}

export type { VentanaSetup, VentanaInput } from './ventana.ts';
export { VENTANA, ventanaGrade } from './ventana.ts';

export type { SostenSetup, SostenInput } from './sosten.ts';
export { SOSTEN, SOSTEN_CORRECCION, sostenDentro, sostenGrade, sostenTrack } from './sosten.ts';

export type { PunteriaSetup, PunteriaInput } from './punteria.ts';
export { PUNTERIA, punteriaGrade, punteriaLanding, punteriaPerfectAim } from './punteria.ts';

export type { PuntoSetup, PuntoInput } from './punto.ts';
export { PUNTO, puntoGrade } from './punto.ts';

export type { LecturaSetup, LecturaInput } from './lectura.ts';
export { LECTURA, lecturaGrade } from './lectura.ts';

export type { SecuenciaSetup, SecuenciaInput } from './secuencia.ts';
export { SECUENCIA, secuenciaAciertos, secuenciaArranco, secuenciaGrade } from './secuencia.ts';

export type { MemoriaSetup, MemoriaInput } from './memoria.ts';
export { MEMORIA, memoriaAciertos, memoriaGrade } from './memoria.ts';
