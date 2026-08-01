// EL CÓDIGO — el line-out, para el hooker y la segunda línea.
//
// Se forma el line-out en los cinco metros del rival. El hooker canta una seña
// —un número, una palabra, un gesto— y en los dos segundos que tarda la pelota
// en salir de sus manos, siete tipos tienen que haber entendido lo mismo. El
// segunda que salta antes, el ala que levanta tarde, el que se acordó de la seña
// de la semana pasada: cualquiera de los tres y el line-out es del otro.
//
// ── El verbo es ACORDARSE ──
// Cuarto verbo distinto en cinco Momentos, y a propósito: frenar (tackle),
// esperar (jackal), insistir (ancla), acordarse (código), apuntar (palos). El
// line-out no se gana con reflejos ni con huevos, se gana con memoria y con
// haberla practicado el martes.
//
// La forma es una secuencia: la seña se muestra un rato corto y después se
// repite. Cuántas acertaste EN ORDEN es cuánto se entendió el equipo.
//
// ── Por qué la seña se sortea en el Setup ──
// Igual que todo lo demás: es lo que el jugador no controla. Si la sorteara la
// pantalla, recargar antes de repetirla daría otra seña y la jugada dejaría de
// ser reproducible.
//
// ── Por qué el atributo depende de la familia ──
// Porque el line-out es de a dos y cada uno pone lo suyo. El hooker pone el
// `lanzamiento` —si la pelota no llega a la altura, la mejor seña del mundo no
// sirve— y la segunda línea pone el `salto`. `setup` ve la familia, así que la
// distinción vive donde tiene que vivir y no en un `if` de la pantalla.
//
// ── Calibración ──
// El line-out propio se gana entre el 85 y el 90% de las veces en el rugby de
// élite (el `perMatch` del hooker es 88). Un Momento no es un line-out
// cualquiera: es el de los cinco metros con el maul armado atrás. Acertar la
// seña entera tiene que ser lo normal y perderla tiene que doler.

import type { CaptainAttributes, PositionFamilyId } from '../../types/player.ts';
import type { MomentOutcome } from '../../types/moment.ts';
import type {
    MomentDef,
    MomentDeltas,
    MomentResult,
    MomentSetup,
    MomentSetupCtx,
} from '../../types/moment-def.ts';
import { createRng } from '../random.ts';

type CodigoInput = Extract<MomentOutcome, { kind: 'codigo' }>;

// ═══════════════════════════════════════════════════════════════════════════
//  Las constantes
// ═══════════════════════════════════════════════════════════════════════════

/** Cuántos gestos tiene la seña. Cuatro: el line-out no es un truco de memoria. */
export const CODIGO_LENGTH = 4;

/** Cuántos gestos distintos hay para elegir. */
export const CODIGO_SYMBOLS = 4;

/** Cuánto se muestra la seña, con la destreza en 50 y sin presión. */
const BASE_SHOW_MS = 1600;

/** Cada punto de destreza sobre 50 la deja un pelo más de tiempo. */
const DESTREZA_PIVOT = 50;
const SHOW_PER_DESTREZA = 9;

/** Y la presión la acorta: en los cinco metros nadie espera. */
const SHOW_PER_PRESSURE = 420;

const SHOW_MIN_MS = 700;
const SHOW_MAX_MS = 2600;

/** Lo que paga el line-out limpio, entero. */
const FAME_CLEAN = 3;
const BELONGING_CLEAN = 2;

/** Y lo que paga uno que salió a medias: la ganaste sucia. */
const FAME_PARTIAL = 1;
const BELONGING_PARTIAL = 0.5;

/** Lo que cuesta perderlo. No hay sanción: un line-out errado no es penal. */
const FAME_LOST = 2;

/** El salto y la caída. Menos que el breakdown, pero no es gratis. */
const BODY_PER_CODIGO = 0.8;
const HEAD_KNOCK_CHANCE = 0.02;

// ═══════════════════════════════════════════════════════════════════════════
//  El Setup
// ═══════════════════════════════════════════════════════════════════════════

export interface CodigoSetup extends MomentSetup {
    kind: 'codigo';
    /** La seña, ya sorteada. Índices de gesto, de 0 a `CODIGO_SYMBOLS - 1`. */
    call: number[];
    /** Cuánto se muestra antes de taparla. */
    showMs: number;
    headKnock: boolean;
    minute: number;
}

/**
 * El atributo que pone cada uno en el line-out.
 *
 * El hooker pone el lanzamiento y el saltador pone el salto. Cualquier otro que
 * caiga acá por el cruce pone su `liderazgo`, que es lo único que las ocho
 * familias tienen: si te toca una seña que no es tuya, lo único que te queda es
 * haber escuchado la charla.
 */
export function codigoDestreza(attrs: Readonly<CaptainAttributes>, family: PositionFamilyId): number {
    if (family === 'hooker') return attrs.lanzamiento;
    if (family === 'segunda-linea') return attrs.salto;
    return attrs.liderazgo;
}

/** Cuánto tiempo tenés para memorizar la seña. */
export function codigoShowMs(destreza: number, pressure: number, proficiency: number): number {
    const bruta = BASE_SHOW_MS
        + (destreza - DESTREZA_PIVOT) * SHOW_PER_DESTREZA
        - pressure * SHOW_PER_PRESSURE;
    // El oficio NUNCA da más tiempo: se acota a 1 antes de multiplicar.
    return Math.round(Math.min(SHOW_MAX_MS, Math.max(SHOW_MIN_MS, bruta * Math.min(1, proficiency))));
}

// ═══════════════════════════════════════════════════════════════════════════
//  De lo que hiciste a lo que significa
// ═══════════════════════════════════════════════════════════════════════════

export type CodigoGrade = 'limpio' | 'sucio' | 'perdido';

/**
 * Cuántos gestos acertaste EN ORDEN, desde el principio.
 *
 * En orden y no "cuántos de los cuatro estaban": una seña con los mismos gestos
 * en otro orden es otra seña, y el segunda línea salta al lugar equivocado
 * igual.
 */
export function codigoAciertos(call: readonly number[], repetida: readonly number[]): number {
    let n = 0;
    while (n < call.length && repetida[n] === call[n]) n += 1;
    return n;
}

export function codigoGrade(aciertos: number, largo: number): CodigoGrade {
    if (aciertos >= largo) return 'limpio';
    // Con más de la mitad la seña se entendió a medias: la pelota llega, el maul
    // no. Es la diferencia entre ganarlo y ganarlo bien.
    return aciertos * 2 >= largo ? 'sucio' : 'perdido';
}

const RESULT_LABEL: Record<CodigoGrade, string> = {
    limpio: 'Line-out limpio',
    sucio: 'Line-out ganado sucio',
    perdido: 'Line-out perdido',
};

function cronica(grade: CodigoGrade, minute: number): string {
    const m = `Minuto ${minute}`;
    switch (grade) {
        case 'limpio':
            return `${m}: cantaste la seña, saltaron los dos que tenían que saltar y el maul salió armado de una. Try de maul tres fases después.`;
        case 'sucio':
            return `${m}: la seña salió a medias. La pelota fue tuya pero el maul nunca se armó y hubo que jugarla con las manos.`;
        default:
            return `${m}: cantaste una cosa y saltó otra. El segunda de ellos la bajó sin que nadie lo tocara.`;
    }
}

// ═══════════════════════════════════════════════════════════════════════════
//  La definición
// ═══════════════════════════════════════════════════════════════════════════

export const CODIGO: MomentDef<CodigoSetup, CodigoInput> = {
    kind: 'codigo',
    // Los dos que hacen el line-out: el que la tira y el que salta.
    families: ['hooker', 'segunda-linea'],
    weight: 10,
    labelEs: 'El código',

    setup(ctx: MomentSetupCtx): CodigoSetup {
        const rng = createRng(ctx.seed);

        // Orden fijo: primero la seña entera, después el golpe. Cambiarlo cambia
        // todos los line-outs de todas las partidas.
        //
        // ── NUNCA DOS GESTOS IGUALES SEGUIDOS ──
        // Es el modo de fallo clásico de un juego de memoria: dos símbolos
        // idénticos consecutivos se leen como un solo destello largo, el jugador
        // repite uno y pierde por algo que la pantalla nunca le mostró. Acá,
        // encima, no hay nada que perder: una seña de line-out que canta lo
        // mismo dos veces seguidas no es una seña.
        //
        // Se resuelve sumando un SALTO de 1 a 3 en vez de sorteando el gesto
        // suelto, y no reintentando: reintentar haría que la cantidad de tiradas
        // dependiera de los valores sorteados, y entonces el golpe de cabeza
        // —que sale después— cambiaría según qué seña salió. Acá el consumo es
        // siempre el mismo.
        const call: number[] = [rng.int(0, CODIGO_SYMBOLS - 1)];
        for (let i = 1; i < CODIGO_LENGTH; i += 1) {
            const salto = rng.int(1, CODIGO_SYMBOLS - 1);
            call.push((call[i - 1] + salto) % CODIGO_SYMBOLS);
        }
        const headKnock = rng.chance(HEAD_KNOCK_CHANCE);

        return {
            kind: 'codigo',
            seed: ctx.seed,
            call,
            showMs: codigoShowMs(codigoDestreza(ctx.attrs, ctx.family), ctx.pressure, ctx.proficiency),
            headKnock,
            minute: ctx.minute,
        };
    },

    resolve(setup: CodigoSetup, input: CodigoInput): MomentResult {
        const aciertos = codigoAciertos(setup.call, input.call ?? []);
        const grade = codigoGrade(aciertos, setup.call.length);

        const deltas: MomentDeltas = { bodyDamage: BODY_PER_CODIGO };

        if (grade === 'limpio') {
            deltas.fame = FAME_CLEAN;
            deltas.belonging = BELONGING_CLEAN;
        } else if (grade === 'sucio') {
            deltas.fame = FAME_PARTIAL;
            deltas.belonging = BELONGING_PARTIAL;
        } else {
            deltas.fame = -FAME_LOST;
        }

        if (setup.headKnock) deltas.headDamage = 1;

        return {
            deltas,
            result: RESULT_LABEL[grade],
            text: cronica(grade, setup.minute),
        };
    },
};
