// LECTURA — leer y decidir.
//
// El verbo más de rugby de los siete, y el único donde el jugador no demuestra
// reflejos sino CRITERIO. Minuto 79, dos abajo, penal a treinta y cinco: patear,
// jugar o ir a touch. El scrum del 8: llevarla, abrir o pasarle al 9.
//
// ── Lo que impide que sea un dado con botones ──
// LA OPCIÓN CORRECTA CAMBIA CON LA SEÑA. Se sortea una situación —el rival está
// sin dos defensores, el viento está cruzado, el maul del rival viene
// empujando— y esa seña está A LA VISTA. La misma tarjeta con otra seña tiene
// otra respuesta, así que no hay nada que aprender de memoria: hay que leer.
//
// Esa es toda la diferencia con `punto`. Allá el sorteo esconde DÓNDE; acá el
// sorteo muestra QUÉ PASA y esconde nada. Lo que se pone a prueba es si el
// jugador sabe qué se hace en esa situación.
//
// ── Y el reloj ──
// Decidir rápido y bien es mejor que decidir lento y bien, y por eso `clavado` y
// `logrado` se separan por el TIEMPO y no por la opción. Es la única forma de
// que un verbo de tres botones tenga cuatro notas sin inventar una tercera
// opción "un poco correcta". El umbral sale del margen: al que lee bien el
// partido se le hace más lento.
//
// Ese reloj MIDE, no vence. La pantalla no tiene cuenta regresiva ni cierra la
// jugada sola: tardar te mueve la nota de `clavado` a `logrado` y ahí se termina
// el castigo. Por eso `elegida: null` acá adentro solo lo produce `playAt`, o
// sea las carreras simuladas — una persona frente a la pantalla siempre elige.

import type { Mechanic, MechanicCtx, MinigameGrade, LecturaParams } from '../../types/minigame.ts';
import type { PlayLevel } from '../../types/moment-def.ts';
import { createRng } from '../random.ts';

/** Segundos que tenés para que la decisión cuente como rápida, según el margen. */
const RAPIDO_MIN_MS = 900;
const RAPIDO_MAX_MS = 2600;

export interface LecturaSetup {
    /** La seña que salió, a la vista. */
    sena: { label: string; detalle: string };
    /** El índice de la opción que corresponde a esta seña. */
    mejor: number;
    /** La que no es la mejor pero tampoco es un desastre. `null` si la jugada no perdona. */
    segunda: number | null;
    opciones: { label: string; hint: string }[];
    /**
     * VESTIGIAL: era el fondo de la cuenta regresiva, y ya no hay cuenta
     * regresiva. Ninguna pantalla lo lee.
     *
     * Se sigue calculando porque el setup entero viaja al guardado: sacarlo
     * cambia la forma del estado persistido y tira las partidas en curso a
     * cambio de nada. Se va el día que el guardado suba de esquema por otro
     * motivo. El tiempo que SÍ decide algo es `rapidoMs`.
     */
    segundos: number;
    /** Debajo de esto, decidir bien cuenta como clavarla. */
    rapidoMs: number;
}

/** Qué elegiste y cuánto tardaste. `elegida` en `null` es no haber decidido. */
export interface LecturaInput {
    elegida: number | null;
    ms: number;
}

export function lecturaGrade(setup: LecturaSetup, elegida: number | null, ms: number): MinigameGrade {
    // No decidir es la peor decisión, y en rugby se cobra igual que la mala.
    if (elegida === null) return 'errado';
    if (elegida === setup.mejor) return ms <= setup.rapidoMs ? 'clavado' : 'logrado';
    if (setup.segunda !== null && elegida === setup.segunda) return 'tibio';
    return 'errado';
}

export const LECTURA: Mechanic<LecturaParams, LecturaSetup, LecturaInput> = {
    id: 'lectura',

    setup(params: LecturaParams, ctx: MechanicCtx) {
        const rng = createRng(ctx.seed);

        // Las señas se recorren en el orden en que las declaró el catálogo, que
        // es estable: nunca `Object.keys` ni un `Set` (CLAUDE.md §1).
        const sena = params.senas[rng.int(0, params.senas.length - 1)];

        return {
            sena: { label: sena.label, detalle: sena.detalle },
            mejor: sena.mejor,
            segunda: sena.segunda,
            opciones: params.opciones.map((o) => ({ label: o.label, hint: o.hint })),
            segundos: Math.max(2, Math.round(params.segundos * (1 - ctx.pressure * 0.3))),
            rapidoMs: Math.round(RAPIDO_MIN_MS + ctx.margin * (RAPIDO_MAX_MS - RAPIDO_MIN_MS)),
        };
    },

    grade(setup, input) {
        return lecturaGrade(setup, input.elegida, input.ms);
    },

    /**
     * Leer bien es elegir la que corresponde a la seña, y rápido.
     *
     * ── EL TIEMPO ES ABSOLUTO, no una fracción de `rapidoMs` ──
     * La primera versión devolvía `rapidoMs * 0,3`, o sea que el simulado
     * siempre entraba adentro del umbral por construcción y el umbral —que es
     * por donde entra el atributo— se cancelaba. La cuenta está en `ventana.ts`.
     *
     * Acá el simulado tarda LO QUE TARDA UNA PERSONA en mirar una situación y
     * decidir, y `rapidoMs` decide si eso cuenta como rápido. Es lo que hace que
     * `vision` y `liderazgo` signifiquen algo en este verbo: al que lee bien el
     * partido, el partido se le hace más lento.
     *
     *   · bien    — la mejor, con el tiempo de alguien que ya la vio venir.
     *   · regular — la segunda si existe; si no, la mejor pero pensándola. La
     *               jugada que no perdona no tiene término medio, y eso lo
     *               declara el catálogo con `segunda: null`, no la mecánica.
     *   · mal     — cualquier otra, y tarde.
     */
    playAt(setup, level: PlayLevel, variation: number): LecturaInput {
        if (level === 'bien') {
            return { elegida: setup.mejor, ms: Math.round(700 + variation * 900) };
        }

        if (level === 'regular') {
            const pensada = Math.round(1500 + variation * 1100);
            return setup.segunda !== null
                ? { elegida: setup.segunda, ms: pensada }
                : { elegida: setup.mejor, ms: pensada };
        }

        const malas = setup.opciones
            .map((_, i) => i)
            .filter((i) => i !== setup.mejor && i !== setup.segunda);
        const elegida = malas.length > 0
            ? malas[Math.floor(variation * malas.length) % malas.length]
            : null;

        return { elegida, ms: Math.round(2600 + variation * 1200) };
    },
};
