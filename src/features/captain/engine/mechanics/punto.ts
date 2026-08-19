// PUNTO — elegir un lugar.
//
// Una fila de lugares y uno bueno. Limpiar el ruck por el lado que corresponde,
// cerrar el canal donde va a venir, calcular dónde cae la pelota del cielo.
//
// ── Por qué no es un dado con botones ──
// Por dos cosas, y las dos están en el setup:
//
//   1. EL LUGAR BUENO SE SORTEA. No hay una respuesta que se aprenda en la
//      segunda partida.
//   2. EL MARGEN ABRE LA MANO. Con el atributo bajo solo el lugar exacto paga;
//      con el atributo alto, el de al lado también sirve —llegaste mal parado
//      pero llegaste—. Ese ensanchamiento es TODO lo que el puesto aporta acá, y
//      es lo que hace que elegir bien con un mal jugador siga siendo elegir bien
//      pero rinda menos.
//
// La diferencia con `lectura` es de qué se mira: acá se mira la CANCHA —dónde
// está el hueco— y allá se mira una SEÑA que cambia cuál opción vale. Un verbo
// es espacial y el otro es condicional; juntarlos daría un botón genérico con
// dos nombres.

import type { Mechanic, MechanicCtx, MinigameGrade, PuntoParams } from '../../types/minigame.ts';
import type { PlayLevel } from '../../types/moment-def.ts';
import { createRng } from '../random.ts';

/** Desde qué margen el lugar de al lado también paga. */
const MARGEN_VECINO = 0.62;

export interface PuntoSetup {
    lugares: string[];
    /** El índice del lugar bueno. */
    correcto: number;
    /**
     * Los que pagan a medias: los pegados al bueno.
     *
     * Se calculan en el setup y viajan al guardado en vez de derivarse en
     * `grade`, y no es por costo: es para que la pantalla pueda pintar el
     * veredicto con la MISMA lista que el motor puntuó. Derivarla dos veces es
     * la puerta a que un día no coincidan.
     */
    vecinos: number[];
    /** Con margen alto, un vecino paga como el bueno. */
    vecinoPaga: boolean;
    escena: string;
    /**
     * VESTIGIAL, igual que en `lectura`: la pantalla no cuenta para atrás. Acá
     * el tiempo nunca entró en la nota —`puntoGrade` mira el lugar y nada más—,
     * así que el reloj solo podía cobrarte por no tocar a tiempo.
     *
     * Se sigue calculando porque el setup entero viaja al guardado.
     */
    segundos: number;
}

/** Qué lugar elegiste. `null` es no haber elegido a tiempo. */
export interface PuntoInput {
    elegido: number | null;
}

export function puntoGrade(setup: PuntoSetup, elegido: number | null): MinigameGrade {
    if (elegido === null) return 'errado';
    if (elegido === setup.correcto) return 'clavado';
    if (setup.vecinos.includes(elegido)) return setup.vecinoPaga ? 'logrado' : 'tibio';
    return 'errado';
}

export const PUNTO: Mechanic<PuntoParams, PuntoSetup, PuntoInput> = {
    id: 'punto',

    setup(params: PuntoParams, ctx: MechanicCtx) {
        const rng = createRng(ctx.seed);
        const lugares = [...params.lugares];
        const correcto = rng.int(0, lugares.length - 1);

        const vecinos: number[] = [];
        if (correcto > 0) vecinos.push(correcto - 1);
        if (correcto < lugares.length - 1) vecinos.push(correcto + 1);

        return {
            lugares,
            correcto,
            vecinos,
            vecinoPaga: ctx.margin >= MARGEN_VECINO,
            escena: params.escena,
            // La cuenta se conserva tal cual estaba —incluido el `0` que el
            // catálogo usa para decir "acá no se apura"— aunque ya no la lea
            // nadie: cambiarla movería el digest sin cambiar una sola nota.
            segundos: params.segundos > 0
                ? Math.max(1, Math.round(params.segundos * (1 - ctx.pressure * 0.3)))
                : 0,
        };
    },

    grade(setup, input) {
        return puntoGrade(setup, input.elegido);
    },

    /**
     * Elegir bien es elegir el lugar bueno.
     *
     *   · bien    — el bueno.
     *   · regular — un vecino: llegó, pero mal parado.
     *   · mal     — uno cualquiera de los otros, y la variación decide cuál.
     *
     * El `mal` NUNCA cae en el bueno por casualidad, y es a propósito: si el
     * nivel `mal` pudiera acertar, el digest mediría suerte en vez de nivel y
     * los tests de agencia perderían el pareado.
     */
    playAt(setup, level: PlayLevel, variation: number): PuntoInput {
        if (level === 'bien') return { elegido: setup.correcto };

        if (level === 'regular') {
            if (setup.vecinos.length === 0) return { elegido: setup.correcto };
            return { elegido: setup.vecinos[Math.floor(variation * setup.vecinos.length) % setup.vecinos.length] };
        }

        const lejanos = setup.lugares
            .map((_, i) => i)
            .filter((i) => i !== setup.correcto && !setup.vecinos.includes(i));
        if (lejanos.length === 0) return { elegido: null };
        return { elegido: lejanos[Math.floor(variation * lejanos.length) % lejanos.length] };
    },
};
