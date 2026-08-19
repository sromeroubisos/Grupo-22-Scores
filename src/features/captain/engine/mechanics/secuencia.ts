// SECUENCIA — hacer los pasos en orden.
//
// AGACHAR, LEVANTAR, SOSTENER, BAJAR. ENTRAR, AGARRAR, LEVANTAR, SALIR. El
// verbo de las jugadas que no son un instante sino una coreografía, y donde
// llegar tarde a un paso arruina el que sigue aunque lo hagas perfecto.
//
// ── Por qué la nota es acumulada pero el corte es duro ──
// Como en `sosten`, se cuenta cuántos pasos salieron: tres de cuatro es un
// line-out que se ganó mal, no un line-out perdido. Pero acá el primer paso pesa
// distinto —levantar tarde al saltador no se arregla soltándolo bien— y por eso
// un fallo en el paso uno tapa el techo de la nota. Es la única asimetría de la
// mecánica y está acá arriba para que no haya que buscarla.
//
// ── El azar y el reloj ──
// Los pasos caen a intervalos FIJOS, declarados por el catálogo. No se sortean:
// lo que se sortea es cuánta ventana tenés en cada uno, y eso sale del margen.
// Una secuencia con intervalos aleatorios sería una ventana repetida cuatro
// veces, que es otro verbo y ya lo tenemos.

import type { Mechanic, MechanicCtx, MinigameGrade, SecuenciaParams } from '../../types/minigame.ts';
import type { PlayLevel } from '../../types/moment-def.ts';

/** La ventana de cada paso, como multiplicador sobre la base. */
const VENTANA_MIN_FACTOR = 0.55;
const VENTANA_MAX_FACTOR = 1.9;

export interface SecuenciaSetup {
    pasos: string[];
    pasoMs: number;
    /** Cuánto podés desviarte del tiempo del paso, en milisegundos. */
    ventanaMs: number;
}

/**
 * Cuánto te desviaste en cada paso, en milisegundos. Negativo es adelantarse.
 * `null` es no haber tocado ese paso.
 */
export interface SecuenciaInput {
    desvios: (number | null)[];
}

/** Cuántos pasos salieron adentro de su ventana. */
export function secuenciaAciertos(setup: SecuenciaSetup, desvios: readonly (number | null)[]): number {
    let n = 0;
    for (let i = 0; i < setup.pasos.length; i += 1) {
        const d = desvios[i];
        if (d !== null && d !== undefined && Math.abs(d) <= setup.ventanaMs) n += 1;
    }
    return n;
}

/** ¿El primer paso salió? Es el que tapa el techo de la nota. */
export function secuenciaArranco(setup: SecuenciaSetup, desvios: readonly (number | null)[]): boolean {
    const d = desvios[0];
    return d !== null && d !== undefined && Math.abs(d) <= setup.ventanaMs;
}

export function secuenciaGrade(setup: SecuenciaSetup, desvios: readonly (number | null)[]): MinigameGrade {
    const total = setup.pasos.length;
    if (total === 0) return 'errado';

    const aciertos = secuenciaAciertos(setup, desvios);
    const arranco = secuenciaArranco(setup, desvios);

    if (aciertos === total) return 'clavado';
    if (aciertos >= total - 1) return arranco ? 'logrado' : 'tibio';
    if (aciertos >= Math.ceil(total / 2)) return 'tibio';
    return 'errado';
}

export const SECUENCIA: Mechanic<SecuenciaParams, SecuenciaSetup, SecuenciaInput> = {
    id: 'secuencia',

    // Sin rng: esta mecánica no sortea nada (ver la cabecera). Recibe `ctx`
    // igual porque el contrato es uno para los siete, y un verbo que no use el
    // azar no es motivo para que la fábrica tenga dos caminos.
    setup(params: SecuenciaParams, ctx: MechanicCtx) {
        const factor = VENTANA_MIN_FACTOR + ctx.margin * (VENTANA_MAX_FACTOR - VENTANA_MIN_FACTOR);
        return {
            pasos: [...params.pasos],
            pasoMs: Math.round(params.pasoMs * (1 - ctx.pressure * 0.25)),
            ventanaMs: Math.round(params.ventanaBase * factor),
        };
    },

    grade(setup, input) {
        return secuenciaGrade(setup, input.desvios);
    },

    /**
     * El desvío va EN MILISEGUNDOS, nunca en ventanas.
     *
     * Escrito como fracción de `ventanaMs`, el margen se cancela y el atributo
     * del puesto deja de hacer nada: la cuenta está en `ventana.ts`. Acá el
     * simulado llega con el retraso de una persona y la ventana decide si eso
     * alcanza.
     *
     * ── Y CADA PASO SALE DISTINTO ──
     * El desvío se sacude paso a paso con un factor derivado de `(i, variation)`
     * que va de 0,45 a 1,55. No es adorno: con un desvío igual en los cuatro
     * pasos, una secuencia sale ENTERA o no sale ninguna, y las notas del medio
     * —tres de cuatro, dos de cuatro— no aparecían nunca. El contrato lo cazó
     * («la nota 'tibio' no sale nunca») y tenía razón: una coreografía que solo
     * puede salir perfecta o nula no es una coreografía.
     *
     *   · bien    — el retraso de alguien que la sabe.
     *   · regular — el de alguien que la sigue de memoria.
     *   · mal     — arranca y se le desarma: el primer paso casi sale y los
     *               demás llegan cuando la jugada ya pasó.
     */
    playAt(setup, level: PlayLevel, variation: number): SecuenciaInput {
        const total = setup.pasos.length;
        const desvios: (number | null)[] = [];

        // ── LOS TRES NIVELES SE SEPARAN POR LA FORMA, NO POR EL NÚMERO ──────
        // Escritos como tres magnitudes de retraso sobre los mismos cuatro
        // pasos, `regular` y `mal` se aplastan contra el mismo cero en cuanto la
        // ventana se angosta: los dos quedan afuera en los cuatro pasos y sacan
        // la misma nota. Pasó dos veces (`d5-robar` primero y `d12-descarga`
        // después) y las dos con la misma cara.
        //
        // La separación estructural no se puede aplastar:
        //
        //   · bien    — los cuatro pasos con el retraso de alguien que la sabe.
        //   · regular — ARRANCA BIEN Y PIERDE LA COLA. Los dos primeros salen
        //               siempre; los últimos dependen de la ventana, o sea del
        //               atributo. Es donde vive el canal de este verbo.
        //   · mal     — SE LE DESARMA. El primero llega tarde y de los demás ni
        //               se entera: van en `null`, que no es un retraso grande
        //               sino no haber estado. Un `null` no puede caer adentro de
        //               ninguna ventana, así que `mal` nunca alcanza a `regular`
        //               por más que la ventana se abra.
        const COLA = 2;

        for (let i = 0; i < total; i += 1) {
            const lado = ((i + Math.floor(variation * 5)) % 2) === 0 ? 1 : -1;
            // El sacudón por paso. Determinista y sin rng: `playAt` es pura.
            const sacudon = 0.45 + (((i * 7 + Math.floor(variation * 11)) % 10) / 10) * 1.1;

            if (level === 'mal') {
                desvios.push(i === 0 ? Math.round(lado * 700 * sacudon) : null);
                continue;
            }

            // El de `regular` en la cola straddlea el rango de ventanas que
            // produce el catálogo (110 a 418 ms según el margen): adentro con la
            // ventana abierta, afuera con la ventana angosta.
            const base = level === 'bien' ? 55 : i < COLA ? 60 : 300;
            desvios.push(Math.round(lado * base * sacudon));
        }

        return { desvios };
    },
};
