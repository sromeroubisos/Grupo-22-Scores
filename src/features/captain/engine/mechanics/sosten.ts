// SOSTÉN — no soltar.
//
// El scrum que se te inclina, el maul que se para, la barra de aceleración que
// se te acaba antes del in-goal. El rival empuja tic a tic y vos corregís; la
// nota es CUÁNTO TIEMPO estuviste adentro de la banda, no cómo terminaste.
//
// ── Por qué la nota es acumulada y no final ──
// Porque es la diferencia entre un scrum y una moneda. Si valiera el último tic,
// nueve empujones bien aguantados y uno mal valdrían lo mismo que diez mal, y el
// minijuego sería un tiro al final con nueve segundos de decoración. Contando
// tics adentro, aguantar ocho de diez es un resultado propio —el scrum que se
// movió pero no se cayó— y el jugador lo ve mientras pasa.
//
// ── El azar está TODO en el setup ──
// Los empujones del rival se sortean enteros al armar la jugada y viajan al
// guardado. Es la regla 3 de `moment-def.ts` y acá se nota más que en ningún
// otro verbo: si el empujón del tic siete se sorteara en el tic siete, un F5 en
// el tic seis daría otro scrum.

import type { Mechanic, MechanicCtx, MinigameGrade, SostenParams } from '../../types/minigame.ts';
import type { PlayLevel } from '../../types/moment-def.ts';
import { createRng } from '../random.ts';

/**
 * El ancho de la banda, en unidades del valor que se sostiene (que va de −1 a 1).
 *
 * Con margen 0 la banda es angosta; con margen 1, cómoda. Igual que en
 * `ventana`: el atributo mejora tu versión de la jugada, no te la regala.
 */
const BANDA_MIN = 0.13;
const BANDA_MAX = 0.45;

/**
 * CUÁNTO EMPUJA EL RIVAL POR TIC, EN ABSOLUTO Y NO EN ANCHOS DE BANDA.
 *
 * ── El §1.6 en carne propia, y casi no se ve ──
 * La primera versión sorteaba el empujón como `deriva * banda`, que se lee
 * perfectamente razonable: "el rival empuja en proporción a lo cómodo que estás".
 * Hacé el álgebra y desaparece el minijuego. Si los empujones escalan con la
 * banda y la condición de estar adentro es `|v| <= banda`, dividí todo por
 * `banda` y te queda el MISMO proceso para cualquier valor de banda. O sea: el
 * margen no hacía nada, y el atributo del puesto tampoco. Un pilar de 20 de
 * empuje y uno de 90 jugaban el mismo scrum.
 *
 * No lo agarró ninguna revisión —el código hacía exactamente lo que decía— sino
 * el contrato, y de refilón: `d4-maul` empató `bien` con `regular`, que es lo
 * que pasa cuando la dificultad no depende de nada y las dos políticas alcanzan
 * para lo mismo. Es el corolario del §1.7: una igualdad es una acusación contra
 * el instrumento hasta que se demuestre lo contrario, y acá el acusado terminó
 * siendo el mecanismo.
 *
 * Con el empujón en absoluto, la banda vuelve a significar algo: con 0,13 te vas
 * seguido y con 0,45 no te vas nunca.
 */
const BASE_PUSH = 0.14;

/**
 * Cuánto corrige un toque del jugador. Fijo: la palanca es CUÁNDO, no cuánto.
 *
 * Tiene que ser MENOR que `BANDA_MIN`, y no es estética: la política óptima de
 * un control de dos posiciones corrige cuando `|v| > CORRECCIÓN / 2`, así que la
 * corrección define una zona muerta de ese ancho. Si la zona muerta fuera más
 * ancha que la banda más angosta, el jugador con el atributo bajo no tendría
 * ninguna política que lo mantenga adentro — y un minijuego que no se puede
 * jugar no es difícil, está roto.
 */
export const SOSTEN_CORRECCION = 0.15;

/** Los cortes de la nota, en fracción de tics aguantados adentro. */
const CLAVADO = 0.9;
const LOGRADO = 0.68;
const TIBIO = 0.4;

export interface SostenSetup {
    /** Cuánto empuja el rival en cada tic, ya sorteado. De −1 a 1. */
    empujes: number[];
    /** Media banda: adentro es `|v| <= banda`. */
    banda: number;
    ticMs: number;
    bordes: [string, string];
    zona: string;
}

/**
 * Qué hiciste en cada tic: −1 corregir a la izquierda, 1 a la derecha, 0 nada.
 *
 * Es la mano en CRUDO, no "cuántos tics aguanté": la clasificación la hace el
 * motor replayando la física. Si la pantalla mandara el conteo, la física
 * viviría en React y el motor no podría reproducir la jugada sin la pantalla.
 */
export interface SostenInput {
    correcciones: number[];
}

/**
 * Replaya el empuje y devuelve la posición después de cada tic.
 *
 * Exportada porque la pantalla la necesita para DIBUJAR la aguja mientras se
 * juega —tiene que mostrar lo mismo que el motor va a puntuar— y porque un test
 * que quiera un empujador de referencia no puede reimplementar la física sin
 * quedar desincronizado en la primera calibración.
 */
export function sostenTrack(setup: SostenSetup, correcciones: readonly number[]): number[] {
    const track: number[] = [];
    let v = 0;
    for (let i = 0; i < setup.empujes.length; i += 1) {
        const correccion = correcciones[i] ?? 0;
        v += setup.empujes[i] + Math.max(-1, Math.min(1, correccion)) * SOSTEN_CORRECCION;
        v = Math.max(-1, Math.min(1, v));
        track.push(v);
    }
    return track;
}

/** Cuántos tics terminaron adentro de la banda. */
export function sostenDentro(setup: SostenSetup, correcciones: readonly number[]): number {
    return sostenTrack(setup, correcciones).filter((v) => Math.abs(v) <= setup.banda).length;
}

export function sostenGrade(setup: SostenSetup, correcciones: readonly number[]): MinigameGrade {
    const total = setup.empujes.length;
    if (total === 0) return 'errado';
    const ratio = sostenDentro(setup, correcciones) / total;

    if (ratio >= CLAVADO) return 'clavado';
    if (ratio >= LOGRADO) return 'logrado';
    if (ratio >= TIBIO) return 'tibio';
    return 'errado';
}

export const SOSTEN: Mechanic<SostenParams, SostenSetup, SostenInput> = {
    id: 'sosten',

    setup(params: SostenParams, ctx: MechanicCtx) {
        const rng = createRng(ctx.seed);
        const banda = Math.round((BANDA_MIN + ctx.margin * (BANDA_MAX - BANDA_MIN)) * 1000) / 1000;

        // Los empujones, todos de una y en orden. El primero es siempre chico:
        // un scrum que se te va en el primer tic no se juega, se sufre.
        //
        // La fuerza NO depende de `banda` — ver `BASE_PUSH`.
        const empujes: number[] = [];
        for (let i = 0; i < params.tics; i += 1) {
            const fuerza = params.deriva * BASE_PUSH * (i === 0 ? 0.4 : 1);
            empujes.push(Math.round(rng.float(-fuerza, fuerza) * 1000) / 1000);
        }

        return {
            empujes,
            banda,
            ticMs: Math.round(params.ticMs * (1 - ctx.pressure * 0.25)),
            bordes: params.bordes,
            zona: params.zona,
        };
    },

    grade(setup, input) {
        return sostenGrade(setup, input.correcciones);
    },

    /**
     * Sostener bien es corregir CUANDO CORREGIR MEJORA, y no siempre.
     *
     * ── El bicho que este comentario existe para no repetir ──
     * La primera versión hacía que el nivel `bien` corrigiera en TODOS los tics,
     * con la intuición de que el que sostiene bien no afloja nunca. Medido, el
     * `bien` sacaba peor nota que el `regular` y el contrato lo cazó de una
     * («jugarlo bien no paga más que jugarlo regular»).
     *
     * El motivo es aritmético y estaba a la vista: la corrección es un valor
     * FIJO de ±0,34 y la banda mide entre 0,16 y 0,42. Corregir con la aguja
     * cerca del centro no la acerca: la cruza para el otro lado y la deja más
     * lejos que antes. El `bien` que corregía siempre oscilaba de borde a borde,
     * y el `regular` —que solo corregía tarde— le ganaba por no hacer nada.
     *
     * La política correcta es de una línea y es la óptima para un control de
     * dos posiciones: CORREGIR SOLO SI |v| > CORRECCIÓN / 2. Por debajo de ese
     * punto, moverse empeora; por encima, mejora. Es el §1.6 del CLAUDE de
     * captain —hacé el álgebra antes de escribir el mecanismo— aplicado a una
     * cuenta que cabe en un renglón.
     *
     *   · bien    — corrige exactamente cuando conviene.
     *   · regular — recién cuando ya se salió de la banda: llega tarde y de más.
     *   · mal     — corrige para el lado equivocado en uno de cada dos tics.
     *
     * El simulado NO ve el futuro: decide con la posición de ANTES del empujón,
     * que es lo que un jugador de carne siente en el hombro. Darle `empujes[i]`
     * lo haría infalible y el digest mediría un scrum que nadie puede jugar.
     */
    playAt(setup, level: PlayLevel, variation: number): SostenInput {
        const correcciones: number[] = [];
        const umbralOptimo = SOSTEN_CORRECCION / 2;
        let v = 0;

        for (let i = 0; i < setup.empujes.length; i += 1) {
            const sentido = v === 0 ? 0 : (v > 0 ? -1 : 1);
            let correccion: number;

            if (level === 'bien') {
                correccion = Math.abs(v) > umbralOptimo ? sentido : 0;
            } else if (level === 'regular') {
                correccion = Math.abs(v) > setup.banda ? sentido : 0;
            } else {
                // Se equivoca de lado en uno de cada dos, y la variación decide
                // en cuáles: sin ella los tres niveles darían la misma carrera.
                const equivoca = ((i + Math.floor(variation * 7)) % 2) === 0;
                correccion = equivoca ? -sentido : sentido;
            }

            correcciones.push(correccion);
            v = Math.max(-1, Math.min(1, v + setup.empujes[i] + correccion * SOSTEN_CORRECCION));
        }

        return { correcciones };
    },
};
