// VENTANA — tocar en el momento.
//
// Un cursor cruza la barra y hay una franja donde la jugada sale. Es el verbo
// más viejo del juego —el tackle lo viene jugando desde el principio— y el que
// más minijuegos pide del catálogo: el talonaje del hooker, el salto del
// segunda, el drop del 10, el cazador del 7.
//
// ── Lo que lo separa de una barra cualquiera ──
// LA FRANJA NO ESTÁ EN EL MEDIO. Se sortea con la semilla, así que no se puede
// jugar de memoria mirando siempre al centro: hay que mirar dónde está esta vez.
// Un cursor que hay que frenar en el medio de una barra no es un minijuego, es
// un botón con pasos intermedios.
//
// ── Y lo que lo separa del tackle ──
// El tackle tiene una zona PELIGROSA después de la buena, que es lo que lo
// conecta con las tarjetas. Acá no: pasarse es errar, y errar cuesta lo que
// diga el riesgo del minijuego. El tackle sigue con su carril propio por eso y
// porque migrarlo movería el digest por plomería (`moment-kinds.ts`).

import type { Mechanic, MechanicCtx, MinigameGrade, VentanaParams } from '../../types/minigame.ts';
import type { PlayLevel } from '../../types/moment-def.ts';
import { createRng } from '../random.ts';

/** Dónde puede caer el centro de la franja. Ni pegado al borde ni en el medio. */
const CENTRO_MIN = 0.22;
const CENTRO_MAX = 0.78;

/**
 * Cuánto abre el margen la franja, como multiplicador sobre `anchoBase`.
 *
 * Que sea multiplicativo y no aditivo es lo que hace que un minijuego declarado
 * "angosto" siga siendo angosto para el que lo domina: el atributo mejora tu
 * versión de esa jugada, no te la regala.
 *
 * ── Por qué el piso es 0,85 y no 0,5 ──
 * Con 0,5, el minijuego más angosto del catálogo (`d5-robar`, base 0,09) le
 * dejaba al jugador de atributo bajo una media franja de 0,022 sobre una barra
 * de 1. A esa escala, el jugador que la juega REGULAR y el que la juega MAL
 * quedan los dos afuera y sacan la misma nota — que es lo que cazó el contrato
 * («regular no paga más que mal»).
 *
 * Y eso no es una jugada difícil: es una jugada donde jugar mejor no sirve. La
 * dificultad tiene que separar niveles, no aplastarlos contra el mismo cero. El
 * piso alto es lo que garantiza que abajo de todo todavía haya un minijuego, y
 * el techo se subió a la par para que el recorrido del atributo no se achique.
 */
const ANCHO_MIN_FACTOR = 0.85;
const ANCHO_MAX_FACTOR = 2.2;

/** El roce: el borde donde la jugada sale a medias. Fracción de la franja. */
const ROCE = 0.55;

/** Cuánto acelera el cursor la presión del último cuarto. */
const SWEEP_PRESSURE = 0.35;

export interface VentanaSetup {
    /** Dónde está el centro de la franja buena, de 0 a 1. */
    centro: number;
    /** Ancho total de la franja. */
    ancho: number;
    /** Milisegundos de una pasada. */
    sweepMs: number;
    vueltas: number;
    zona: string;
    bordes: [string, string];
}

/** Dónde frenaste, de 0 a 1. `null` es no haber frenado nunca. */
export interface VentanaInput {
    at: number | null;
}

/**
 * La nota de una parada. Exportada para que la pantalla pueda PINTAR lo que
 * pasó sin decidirlo: dibuja el mismo veredicto que el motor calculó.
 */
export function ventanaGrade(setup: VentanaSetup, at: number | null): MinigameGrade {
    // No frenar nunca no es un caso raro: es la jugada que se te pasó.
    if (at === null) return 'errado';

    const d = Math.abs(at - setup.centro);
    const mitad = setup.ancho / 2;

    if (d <= mitad * 0.34) return 'clavado';
    if (d <= mitad) return 'logrado';
    if (d <= mitad * (1 + ROCE)) return 'tibio';
    return 'errado';
}

export const VENTANA: Mechanic<VentanaParams, VentanaSetup, VentanaInput> = {
    id: 'ventana',

    setup(params: VentanaParams, ctx: MechanicCtx) {
        const rng = createRng(ctx.seed);

        // Orden fijo: primero dónde, después nada más. Cambiarlo mueve todas las
        // ventanas de todas las partidas.
        const centro = Math.round(rng.float(CENTRO_MIN, CENTRO_MAX) * 1000) / 1000;

        const factor = ANCHO_MIN_FACTOR + ctx.margin * (ANCHO_MAX_FACTOR - ANCHO_MIN_FACTOR);
        const ancho = Math.round(Math.min(0.6, params.anchoBase * factor) * 1000) / 1000;

        return {
            centro,
            ancho,
            sweepMs: Math.round(params.sweepMs * (1 - ctx.pressure * SWEEP_PRESSURE)),
            vueltas: params.vueltas,
            zona: params.zona,
            bordes: params.bordes,
        };
    },

    grade(setup, input) {
        return ventanaGrade(setup, input.at);
    },

    /**
     * Frenar bien es frenar en el centro, y el error va EN UNIDADES DE BARRA.
     *
     * ═══════════════════════════════════════════════════════════════════════
     *  EL ERROR DEL SIMULADO ES ABSOLUTO. NUNCA UNA FRACCIÓN DEL MARGEN.
     * ═══════════════════════════════════════════════════════════════════════
     *
     * La primera versión lo escribía como fracción de la franja —`0,3 anchos de
     * franja»— copiando la lección de Los Palos, que dice que un desvío en
     * unidades de barra no significa lo mismo con tolerancia 0,3 que con 0,15.
     * Esa lección es correcta para COMPARAR minijuegos entre sí y es un desastre
     * acá, porque hace que el margen se cancele:
     *
     *     el jugador falla por  k · mitad
     *     la nota compara       k · mitad   contra   mitad · {0,34 · 1 · 1,55}
     *     ⇒ la nota depende de k y de NADA MÁS. `mitad` se va de los dos lados.
     *
     * O sea: el atributo del puesto no hacía nada. Un hooker de 20 de trabajo y
     * uno de 90 talonaban exactamente igual. Es el §1.6 —hacé el álgebra antes
     * de escribir el mecanismo— y la cuenta cabe en dos renglones.
     *
     * Y hay un motivo físico además del algebraico, que es el que hay que
     * recordar: LA PRECISIÓN DE UN HUMANO NO MEJORA PORQUE LA VENTANA SEA MÁS
     * ANCHA. Que la ventana sea más ancha es exactamente lo que la hace más
     * fácil. El simulado tiene una precisión fija —la de una persona apretando
     * un botón— y el margen decide si esa precisión alcanza. Ahí está el canal.
     *
     * ── Un detalle que vale la pena tener escrito ──
     * Para el jugador de CARNE el margen siempre importó: su precisión ya era
     * absoluta, así que una franja más ancha siempre le resultó más fácil. El
     * ciego era el simulado — o sea el digest y las tablas de calibración, que
     * es donde se mide el balance del juego.
     *
     *   · bien    — la precisión de alguien que la sabe jugar.
     *   · regular — la de alguien que la juega sin ser su mejor tarde.
     *   · mal     — la falla, y la falla lejos.
     */
    playAt(setup, level: PlayLevel, variation: number): VentanaInput {
        const [desde, hasta] = level === 'bien'
            ? [0, 0.025]
            : level === 'regular' ? [0.04, 0.10] : [0.14, 0.30];

        const lado = variation < 0.5 ? -1 : 1;
        const dentro = (variation * 2) % 1;
        const error = desde + dentro * (hasta - desde);

        // Si por ese lado se sale de la barra, se va por el otro: el desvío lo
        // manda el nivel y no lo puede recortar el borde de la pantalla.
        const propuesto = setup.centro + lado * error;
        const at = propuesto >= 0 && propuesto <= 1 ? propuesto : setup.centro - lado * error;

        return { at: Math.max(0, Math.min(1, at)) };
    },
};
