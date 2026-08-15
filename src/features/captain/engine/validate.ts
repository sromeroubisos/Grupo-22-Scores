// EL CAPITÁN — ¿ESTE GUARDADO SE PUEDE SEGUIR JUGANDO?
//
// ── EL PROBLEMA QUE ESTE ARCHIVO CIERRA ────────────────────────────────────
// El versionado de `captainStorage.ts` contesta una pregunta y la contesta bien:
// «¿este guardado es de este motor?». Compara doce versiones y descarta lo que
// no coincide.
//
// Lo que NO contesta es la otra: «¿este guardado es COHERENTE consigo mismo?».
// Un estado puede traer las doce versiones correctas y aun así tener un agujero
// —una lista recortada para achicar el payload, una migración a medias, un
// `JSON.parse` de algo escrito por una versión de desarrollo— y ahí el motor no
// falla: DERIVA OTRA COSA, en silencio.
//
// El caso concreto es la división del Mundial juvenil. Se recalcula desde las
// ediciones jugadas, que es exactamente lo que hay que hacer —es lo contrario de
// la constante congelada del §1.9— pero una derivada vale lo que valen sus
// insumos: con una edición faltante, el recorrido termina en otra división y el
// jugador aparece en la B sin haber descendido nunca. No hay excepción, no hay
// log, no hay nada que mirar.
//
// ── DÓNDE VA LA ALARMA, Y POR QUÉ ACÁ Y NO EN EL MOTOR ─────────────────────
// El §2 del CLAUDE raíz es tajante: una partida vieja NUNCA explota. Y el diseño
// pide lo contrario: que falle con su propio mensaje en vez de asumir el tier A.
// Las dos cosas son ciertas y no se contradicen — lo que cambia es DÓNDE.
//
// El motor tira (`TournamentHistoryError`), porque un estado incoherente no
// tiene una respuesta correcta que devolver. Y este archivo corre UNA vez, al
// cargar, antes de que el jugador vea nada: si algo no cierra, `loadCaptain`
// resuelve `'outdated'` y la pantalla ofrece empezar de nuevo con un mensaje
// claro, que es lo que el juego ya sabe hacer.
//
// De la carga en adelante el estado está verificado y el reducer sólo le agrega
// ediciones que `gateOpen` autorizó, así que la invariante no se puede romper
// jugando. Por eso alcanza con validar en la puerta.

import type { CaptainState } from '../types/captain.ts';
import { TOURNAMENTS } from '../data/tournaments.ts';
import { divisionOf } from './tournament-gate.ts';

/**
 * Revisa el estado cargado. Devuelve `null` si está sano, o el motivo en una
 * línea —pensada para leerse en un log, no en la pantalla del jugador—.
 *
 * NO tira: quien llama es la capa de guardado, que tiene que poder contestar
 * `'outdated'` en vez de romperse. Las excepciones del motor se atrapan acá y se
 * traducen a un motivo.
 */
export function validateCaptainState(state: CaptainState): string | null {
    // La forma mínima primero: sin esto, cualquier chequeo posterior explota por
    // el motivo equivocado y el mensaje diría lo que no es.
    if (!state.player || !state.national || !Array.isArray(state.tournaments)) {
        return 'El guardado no tiene la forma de una carrera de El Capitán.';
    }
    if (!Array.isArray(state.history) || !Array.isArray(state.decisionLog)) {
        return 'Al guardado le falta la trayectoria o el registro de decisiones.';
    }

    // LA DIVISIÓN DE CADA CADENA. Se recorren todos los torneos con `tier` y no
    // sólo el M20: el día que entre una segunda cadena —un Trophy de mayores—
    // queda cubierta sola, que es la misma razón por la que `divisionOf` filtra
    // por cadena en vez de mirar un id.
    for (const def of TOURNAMENTS) {
        if (!def.tier) continue;
        try {
            divisionOf(state, def);
        } catch (error) {
            return error instanceof Error ? error.message : `No se pudo reconstruir la división de ${def.labelEs}.`;
        }
    }

    return null;
}
