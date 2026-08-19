// MEMORIA — acordarse.
//
// Se muestra un patrón, desaparece, lo repetís. Es el verbo de El Código —la
// seña del line-out que el hooker canta y el saltador tiene que leer— y del
// hueco que el 10 ve dos segundos antes de que la defensa se cierre.
//
// ── Por qué el margen achica el TIEMPO y no el LARGO ──
// Porque el largo del patrón es lo que el minijuego ES, y moverlo con el
// atributo haría que dos jugadores del mismo puesto jueguen a cosas distintas.
// Lo que el oficio compra es CUÁNTO LO VES: el segunda línea con la seña
// aprendida la lee de un vistazo, el que recién llegó necesita que se la
// muestren. Mismo juego, distinto tiempo — que es exactamente lo que pasa en un
// line-out real.
//
// ── El parcial cuenta ──
// Acertar tres de cuatro no es errar. En el line-out, una seña leída a medias es
// un salto al lugar equivocado que igual se pelea; contarla como cero sería
// tratar la memoria como un sí o un no, y no lo es.

import type { Mechanic, MechanicCtx, MinigameGrade, MemoriaParams } from '../../types/minigame.ts';
import type { PlayLevel } from '../../types/moment-def.ts';
import { createRng } from '../random.ts';

/** Milisegundos que se muestra cada símbolo, como multiplicador sobre la base. */
const SHOW_MIN_FACTOR = 0.6;
const SHOW_MAX_FACTOR = 1.8;

export interface MemoriaSetup {
    /** Los símbolos disponibles, en orden estable. */
    simbolos: string[];
    /** El patrón a repetir: índices de `simbolos`. */
    patron: number[];
    /** Cuánto se muestra cada símbolo. */
    showMs: number;
    escena: string;
}

/** Lo que repetiste, en el orden en que lo tocaste. */
export interface MemoriaInput {
    repetido: number[];
}

/**
 * Cuántos símbolos coinciden EN SU POSICIÓN.
 *
 * Por posición y no por presencia: repetir los cuatro símbolos correctos en el
 * orden equivocado es una seña distinta, y en un line-out eso es la pelota del
 * rival. Contarlo como acierto parcial premiaría justo lo que la jugada castiga.
 */
export function memoriaAciertos(patron: readonly number[], repetido: readonly number[]): number {
    let n = 0;
    for (let i = 0; i < patron.length; i += 1) if (repetido[i] === patron[i]) n += 1;
    return n;
}

export function memoriaGrade(setup: MemoriaSetup, repetido: readonly number[]): MinigameGrade {
    const total = setup.patron.length;
    if (total === 0) return 'errado';

    const aciertos = memoriaAciertos(setup.patron, repetido);
    if (aciertos === total) return 'clavado';
    if (aciertos === total - 1) return 'logrado';
    if (aciertos >= Math.ceil(total / 2)) return 'tibio';
    return 'errado';
}

export const MEMORIA: Mechanic<MemoriaParams, MemoriaSetup, MemoriaInput> = {
    id: 'memoria',

    setup(params: MemoriaParams, ctx: MechanicCtx) {
        const rng = createRng(ctx.seed);

        // El patrón, de una y en orden. Se permite repetir un símbolo: una seña
        // que nunca repite es una seña con menos combinaciones y el jugador lo
        // descubre en la tercera partida.
        const patron: number[] = [];
        for (let i = 0; i < params.largo; i += 1) patron.push(rng.int(0, params.simbolos.length - 1));

        const factor = SHOW_MIN_FACTOR + ctx.margin * (SHOW_MAX_FACTOR - SHOW_MIN_FACTOR);

        return {
            simbolos: [...params.simbolos],
            patron,
            showMs: Math.round(params.showBase * factor * (1 - ctx.pressure * 0.25)),
            escena: params.escena,
        };
    },

    grade(setup, input) {
        return memoriaGrade(setup, input.repetido);
    },

    /**
     * Acordarse bien es repetirlo entero, SI TE LO MOSTRARON EL TIEMPO SUFICIENTE.
     *
     * ── El canal de este verbo pasa por `showMs` y por ningún otro lado ──
     * La primera versión devolvía el patrón completo en el nivel `bien` sin
     * mirar cuánto se había mostrado, así que el margen —que en `memoria` es
     * exactamente el tiempo de exposición— no hacía nada. Es el mismo bicho que
     * en los otros cuatro verbos con otra cara: el simulado era infalible por
     * construcción y el atributo no tenía por dónde entrar.
     *
     * Acá el modelo es el de una persona: codificar un símbolo lleva
     * `ENCODE_MS`, y lo que no se alcanzó a codificar se pierde. Con la seña
     * mostrada de sobra, el que la sabe la repite entera; con la seña mostrada
     * en un flash, hasta el que la sabe pierde una.
     *
     *   · bien    — se acuerda de todo lo que le alcanzó a entrar.
     *   · regular — eso, menos uno.
     *   · mal     — se acuerda de la mitad y el resto lo inventa.
     *
     * Lo inventado NUNCA cae de casualidad en el correcto, porque si pudiera, el
     * digest mediría suerte en vez de nivel — la misma razón por la que el `mal`
     * de `punto` no acierta.
     */
    playAt(setup, level: PlayLevel, variation: number): MemoriaInput {
        const patron = setup.patron;
        const n = setup.simbolos.length;

        // Cuánto tarda una persona en fijar un símbolo. PARÁMETRO LIBRE: sale de
        // que `showBase` en el catálogo está entre 700 y 780 ms, así que con el
        // margen a la mitad el simulado retiene todo y en los extremos no.
        const ENCODE_MS = 620;
        const perdidosPorTiempo = setup.showMs >= ENCODE_MS
            ? 0
            : Math.min(patron.length, Math.round((1 - setup.showMs / ENCODE_MS) * patron.length));

        const fallos = Math.min(
            patron.length,
            perdidosPorTiempo + (level === 'bien' ? 0 : level === 'regular' ? 1 : Math.ceil(patron.length / 2)),
        );

        if (fallos === 0) return { repetido: [...patron] };

        // Se pierden los ÚLTIMOS, que es como se pierde una seña: lo que entró
        // primero queda y la cola se desdibuja.
        const desde = patron.length - fallos;
        const repetido = patron.map((s, i) => {
            if (i < desde) return s;
            const otro = (s + 1 + Math.floor(variation * (n - 1)) + i) % n;
            return otro === s ? (otro + 1) % n : otro;
        });

        return { repetido };
    },
};
