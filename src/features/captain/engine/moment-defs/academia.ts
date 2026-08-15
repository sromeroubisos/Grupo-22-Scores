// LA ACADEMIA — el ingreso a la Provincial M16.
//
// El primer año, una sola vez, y solo si sos argentino: la semana de la academia
// provincial, donde te miden delante de gente que decide. Se juega
// ACORDÁNDOTE — el entrenador canta la secuencia del line y la tenés que
// repetir— porque eso es literalmente lo que pasa en una captación de menores:
// nadie te pide que corras más rápido, te piden que te acuerdes de la jugada.
//
// ── POR QUÉ ES UN MOMENTO Y NO UN TORNEO ───────────────────────────────────
// Porque es UNA jugada, no seis partidos. Y porque montarlo sobre los rieles del
// Momento le da gratis las tres cosas que costaron caro: se persiste en
// `PendingMoment` y sobrevive al F5, se resuelve sin contexto, y tiene `playAt`
// —así que el digest congelado la puede jugar sin pantalla—. Un mecanismo nuevo
// tendría que ganarse esas tres de nuevo.
//
// ── POR QUÉ NO ENTRA AL SORTEO ─────────────────────────────────────────────
// Porque no tiene casilla en `ALL_MINIGAMES`, y `SELECTABLE` se deriva de ahí.
// Es el mismo mecanismo por el que el bunker no se sortea —«sale solo de que el
// catálogo no tiene casilla para él, sin ningún filtro que haya que acordarse de
// mantener»— y no un filtro nuevo. Llega por su compuerta y por ninguna otra
// puerta.
//
// ── LA MECÁNICA SE REUSA, NO SE REESCRIBE ──────────────────────────────────
// `MEMORIA` ya existe y ya está probada. Este archivo es una def escrita a mano
// que le delega el verbo, igual que hace la fábrica con los cincuenta y nueve:
// lo propio de la academia es el CONTEXTO —qué se memoriza, cuánto dura, qué
// paga— y no el mecanismo de acordarse.

import type { MomentDef, MomentResult, MomentSetupCtx, PlayLevel } from '../../types/moment-def.ts';
import type { MinigameGrade, MemoriaParams } from '../../types/minigame.ts';
import type { MemoriaInput, MemoriaSetup } from '../mechanics/memoria.ts';
import { MEMORIA, memoriaGrade } from '../mechanics/memoria.ts';
import { marginOf } from './from-spec.ts';
import type { MinigameSetup } from '../../types/minigame.ts';

/** El kind. Un solo lugar, y de acá lo lee la compuerta. */
export const ACADEMIA_KIND = 'academia-m16';

/**
 * LA UNIÓN QUE TIENE ACADEMIA PROVINCIAL M16, en minúscula.
 *
 * ⚠️ MINÚSCULA, y va dicho porque ya se pagó una vez: `RUGBY_UNIONS` indexa por
 * ISO en minúscula (`ar`, `uy`, `cl`) y eso es lo que guarda
 * `player.countryCode`. Escrito `'AR'`, la compuerta no abre NUNCA y la academia
 * desaparece del juego sin que falle una sola línea — que es el peor modo de
 * fallar que hay. Lo agarró jugar la primera temporada en el navegador, no la
 * suite; ahora lo vigila `tournament.test.ts`.
 */
export const ACADEMIA_UNION = 'ar';

/** La edad de la citación. Una sola vez, y a los dieciséis. */
export const ACADEMIA_AGE = 16;

/**
 * LA SEÑA DEL LINE, con los símbolos que se cantan de verdad.
 *
 * Cuatro pasos y no seis: a los dieciséis la jugada es corta, y el largo es lo
 * que el minijuego ES —moverlo con el atributo haría que dos pibes del mismo
 * puesto jueguen a cosas distintas—. Lo que el oficio compra es CUÁNTO LA VES, y
 * eso lo resuelve `MEMORIA` sola.
 */
const PARAMS: MemoriaParams = {
    simbolos: ['1', '2', '4', '6', '7', '9'],
    largo: 4,
    showBase: 760,
    escena: 'El entrenador canta la seña y la repite una sola vez',
};

/**
 * LO QUE DEJA, y es deliberadamente chico en atributos y grande en puertas.
 *
 * La academia no te hace mejor jugador en una semana: te hace VISIBLE. Por eso
 * paga en Cartel y en tiempo de juego —el que la clava vuelve al club con el
 * entrenador mirándolo— y no en atributos. Poner puntos de atributo acá sería
 * repetir lo que la pretemporada ya hace, y encima con más volumen que la carta
 * cara, que es la que se supone que cuesta.
 *
 * PARÁMETRO LIBRE (CLAUDE.md §1.9): los cuatro escalones se discuten.
 */
const PAY: Record<MinigameGrade, { fame: number; playingTime: number }> = {
    clavado: { fame: 5, playingTime: 1 },
    logrado: { fame: 3, playingTime: 1 },
    tibio: { fame: 1, playingTime: 0 },
    errado: { fame: 0, playingTime: 0 },
};

const OUTCOME: Record<MinigameGrade, string> = {
    clavado: 'Cantaste las cuatro sin dudar y el entrenador te buscó con la mirada. Volvés al club con nombre.',
    logrado: 'Te comiste una y la peleaste igual. Quedaste en la lista corta.',
    tibio: 'Llegaste tarde a dos señas y el salto salió a destiempo. Ni bien ni mal.',
    errado: 'Te perdiste en la seña y el line se cayó dos veces. La semana pasó y nadie anotó tu nombre.',
};

const RESULT: Record<MinigameGrade, string> = {
    clavado: 'Adentro',
    logrado: 'En la lista',
    tibio: 'Del montón',
    errado: 'Afuera',
};

/**
 * El Setup de la academia.
 *
 * Reusa la forma de `MinigameSetup` —la misma que los cincuenta y nueve del
 * catálogo— a propósito: así la pantalla de `memoria` que ya existe la dibuja sin
 * saber que esto es la academia. Un Setup propio obligaría a una pantalla propia
 * para pintar exactamente lo mismo.
 */
export interface AcademiaSetup extends MinigameSetup {
    kind: typeof ACADEMIA_KIND;
    mechanic: 'memoria';
    play: MemoriaSetup;
}

export interface AcademiaPlay {
    kind: typeof ACADEMIA_KIND;
    play: MemoriaInput;
}

export const ACADEMIA: MomentDef<AcademiaSetup, AcademiaPlay> = {
    kind: ACADEMIA_KIND,
    // Transversal: a la academia entran las ocho familias. El pilar memoriza la
    // misma seña que el wing, porque el que la canta es el entrenador.
    families: null,
    // Peso UNO, y el contrato tiene razón en exigirlo. La tentación era poner
    // cero —«total no se sortea»— y el test lo llama por su nombre: un cero
    // saca del sorteo SIN DECIRLO, o sea esconde el mecanismo real adentro de un
    // número. Lo que saca a la academia del sorteo es no tener casilla en
    // `ALL_MINIGAMES`, y eso se lee en el registry. Este peso es el que tendría
    // si alguna vez fuera sorteable, que es lo único que un peso puede decir.
    weight: 1,
    labelEs: 'La academia',

    setup(ctx: MomentSetupCtx): AcademiaSetup {
        // El Liderazgo abre el margen, y es el único atributo que le cuenta a
        // las ocho familias. En una captación no te miden el empuje: te miden si
        // podés correr la jugada del equipo.
        const margin = marginOf(ctx.attrs.liderazgo, ctx.pressure, ctx.proficiency, ctx.bodyDamage);

        return {
            kind: ACADEMIA_KIND,
            seed: ctx.seed,
            mechanic: 'memoria',
            play: MEMORIA.setup(PARAMS as never, {
                margin,
                pressure: ctx.pressure,
                seed: ctx.seed,
            }) as MemoriaSetup,
            minute: ctx.minute,
            // NO ES UN PARTIDO. Sin esto la pantalla abre con «Minuto 0 ·
            // memoria. Están empatados.», que es el marco de los sesenta y cinco
            // del catálogo aplicado a una semana de entrenamiento.
            sinPartido: true,
            title: 'La academia provincial',
            brief: 'Te citaron a la M16 de tu provincia. Una semana, y al final una lista con nombres.',
        };
    },

    resolve(setup: AcademiaSetup, input: AcademiaPlay): MomentResult {
        const grade = memoriaGrade(setup.play, input.play.repetido);
        const pay = PAY[grade];

        return {
            deltas: { fame: pay.fame, playingTime: pay.playingTime },
            result: RESULT[grade],
            // Sin "Minuto N" adelante: esto no pasa en un partido. Los sesenta y
            // cinco del catálogo lo llevan porque son jugadas; la academia es una
            // semana, y ponerle un minuto sería mentir en la crónica.
            text: `La academia M16: ${OUTCOME[grade]}`,
        };
    },

    playAt(setup: AcademiaSetup, level: PlayLevel, variation: number): AcademiaPlay {
        return {
            kind: ACADEMIA_KIND,
            play: MEMORIA.playAt(setup.play as never, level, variation) as MemoriaInput,
        };
    },
};
