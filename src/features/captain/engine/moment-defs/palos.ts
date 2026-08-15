// LOS PALOS — la patada que decide, para el apertura.
//
// Última pelota del partido, penal a treinta y ocho metros contra la ceja
// izquierda, dos puntos abajo. Se levanta el tee, se calla la cancha, y hay una
// bandera arriba del palo que se mueve para el lado que no querés.
//
// ── El verbo es APUNTAR, y no es lo mismo que frenar ──
// Quinto verbo distinto: frenar (tackle), esperar (jackal), insistir (ancla),
// acordarse (código), apuntar (palos). La diferencia con el tackle es la que
// hace que valga la pena: allá se frena SOBRE el blanco, acá el blanco no está
// donde se ve. El viento corre la pelota después de que salió, así que apuntar
// al medio de los palos es errarle. Hay que apuntar afuera, y cuánto afuera es
// la pregunta.
//
// Es el único de los cinco donde el error del jugador y el error del PERSONAJE
// se separan limpio: podés leer el viento perfecto y aun así fallar porque la
// pegada no da para treinta y ocho metros. Y al revés — un pateador de élite con
// el viento mal leído la manda a la tribuna igual.
//
// ── El único que no cuesta cuerpo ──
// Y está bien que se note. Los otros cuatro son contacto; este es el que se
// juega con el estómago. Un Momento que no lastima existe para que los que
// lastiman signifiquen algo.
//
// ── Calibración ──
// La banda real de dificultad está en el catálogo del puesto: la élite absoluta
// patea al 95,7%, lo aceptable es 73–79%, la crisis es menos de 70%. Pero un
// Momento no es una patada cualquiera: es la que decide. Acá la tolerancia sale
// de `pegada` contra la distancia y el ángulo, y el viento la corre entera.

import type { CaptainAttributes } from '../../types/player.ts';
import type { MomentOutcome } from '../../types/moment.ts';
import type {
    MomentDef,
    MomentDeltas,
    MomentResult,
    MomentSetup,
    MomentSetupCtx,
    PlayLevel,
} from '../../types/moment-def.ts';
import { createRng } from '../random.ts';

type PalosInput = Extract<MomentOutcome, { kind: 'palos' }>;

// ═══════════════════════════════════════════════════════════════════════════
//  Las constantes
// ═══════════════════════════════════════════════════════════════════════════

/** De dónde se patea. Nada de veinte metros de frente: esto es un Momento. */
const DIST_MIN = 28;
const DIST_MAX = 48;

/** Cuánto corre el viento la pelota, en unidades de la barra de puntería. */
const WIND_PULL = 0.55;

/** La tolerancia con `pegada` en 50, a la distancia mínima y de frente. */
const BASE_TOLERANCE = 0.30;

/** Cada punto de pegada sobre 50 abre un poco los palos. */
const PEGADA_PIVOT = 50;
const TOLERANCE_PER_PEGADA = 0.0035;

/** Cada metro más allá del mínimo los cierra. */
const TOLERANCE_PER_METRE = 0.0055;

/** Y el ángulo desde la ceja los cierra más todavía. */
const TOLERANCE_PER_ANGLE = 0.09;

/** La presión del último minuto. */
const TOLERANCE_PER_PRESSURE = 0.05;

const TOLERANCE_MIN = 0.05;
const TOLERANCE_MAX = 0.42;

/** Lo que paga meterla. Es la patada que decide: paga como tal. */
const FAME_GOAL = 3.5;
const BELONGING_GOAL = 2.5;

/** Y lo que cuesta errarla. */
const FAME_MISS = 2.5;

// ═══════════════════════════════════════════════════════════════════════════
//  El Setup
// ═══════════════════════════════════════════════════════════════════════════

export interface PalosSetup extends MomentSetup {
    kind: 'palos';
    /** Metros. Solo para contar la jugada: la dificultad ya está en `tolerance`. */
    distance: number;
    /** De 0 (de frente) a 1 (contra la bandera del córner). */
    angle: number;
    /**
     * De −1 (empuja a la izquierda) a 1 (empuja a la derecha).
     *
     * La pantalla lo DIBUJA —una bandera arriba del palo— y no lo dice en
     * números. Leer el viento es la mitad del minijuego.
     */
    wind: number;
    /** Cuánto margen tenés, de 0 a 1. Ya trae pegada, distancia, ángulo y presión. */
    tolerance: number;
    minute: number;
}

/** El margen que te dan los palos. Exportada para poder compararla de a dos. */
export function palosTolerance(
    attrs: Readonly<CaptainAttributes>,
    distance: number,
    angle: number,
    pressure: number,
    proficiency: number,
): number {
    const bruta = BASE_TOLERANCE
        + (attrs.pegada - PEGADA_PIVOT) * TOLERANCE_PER_PEGADA
        - (distance - DIST_MIN) * TOLERANCE_PER_METRE
        - angle * TOLERANCE_PER_ANGLE
        - pressure * TOLERANCE_PER_PRESSURE;
    // El oficio NUNCA abre los palos: se acota a 1 antes de multiplicar.
    return Math.min(TOLERANCE_MAX, Math.max(TOLERANCE_MIN, bruta * Math.min(1, proficiency)));
}

/**
 * Dónde termina la pelota, de −1 a 1. Cero es el medio de los palos.
 *
 * Es la cuenta entera del minijuego y por eso vive sola: apuntás a `aim`, el
 * viento la corre, y donde cae se compara contra la tolerancia. Que el jugador
 * tenga que apuntar A CONTRAVIENTO sale de acá y de ningún otro lado.
 */
export function palosLanding(aim: number, wind: number): number {
    return aim + wind * WIND_PULL;
}

/**
 * Dónde habría que apuntar para que la pelota termine justo en el medio.
 *
 * Es la inversa de `palosLanding` y existe para los TESTS: sin ella, un test que
 * quiera un pateador de referencia tendría que hardcodear el factor del viento y
 * quedaría desincronizado la primera vez que se calibre.
 *
 * La pantalla NO la usa —dibujar esto sería resolverle el minijuego al jugador—
 * y hay un test que lo verifica.
 */
export function palosPerfectAim(wind: number): number {
    return -wind * WIND_PULL;
}

// ═══════════════════════════════════════════════════════════════════════════
//  De lo que hiciste a lo que significa
// ═══════════════════════════════════════════════════════════════════════════

export type PalosGrade = 'adentro' | 'palo' | 'afuera';

/**
 * `palo` no es un tercer resultado: es un `afuera` que se cuenta distinto.
 *
 * Pega en el poste y sale. Los puntos no están —el marcador no la perdona— pero
 * la crónica sí, porque errarla por diez centímetros y mandarla a la tribuna no
 * son la misma tarde. Paga lo mismo que `afuera`.
 */
export function palosGrade(landing: number, tolerance: number): PalosGrade {
    const error = Math.abs(landing);
    if (error <= tolerance) return 'adentro';
    return error <= tolerance * 1.35 ? 'palo' : 'afuera';
}

const RESULT_LABEL: Record<PalosGrade, string> = {
    adentro: 'Patada decisiva',
    palo: 'Pegó en el palo',
    afuera: 'Patada errada',
};

function cronica(grade: PalosGrade, minute: number, distance: number): string {
    const m = `Minuto ${minute}`;
    switch (grade) {
        case 'adentro':
            return `${m}: la pusiste desde ${distance} metros con el viento en contra. Entró raspando el palo de adentro y no la miraste.`;
        case 'palo':
            return `${m}: le pegaste bien desde ${distance} metros y dio en el poste. Se escuchó en toda la cancha y salió para afuera.`;
        default:
            return `${m}: desde ${distance} metros el viento se la llevó. Quedaste mirando cómo se iba.`;
    }
}

// ═══════════════════════════════════════════════════════════════════════════
//  La definición
// ═══════════════════════════════════════════════════════════════════════════

export const PALOS: MomentDef<PalosSetup, PalosInput> = {
    kind: 'palos',
    // El 10. Que patee el 15 o el 12 pasa, y para eso está el cruce.
    families: ['apertura'],
    weight: 10,
    labelEs: 'Los palos',

    setup(ctx: MomentSetupCtx): PalosSetup {
        const rng = createRng(ctx.seed);

        // Orden fijo: distancia, ángulo, viento. Cambiarlo cambia todas las
        // patadas de todas las partidas.
        const distance = rng.int(DIST_MIN, DIST_MAX);
        const angle = Math.round(rng.float(0, 1) * 100) / 100;
        const wind = Math.round(rng.float(-1, 1) * 100) / 100;

        return {
            kind: 'palos',
            seed: ctx.seed,
            distance,
            angle,
            wind,
            tolerance: Math.round(palosTolerance(ctx.attrs, distance, angle, ctx.pressure, ctx.proficiency) * 1000) / 1000,
            minute: ctx.minute,
        };
    },

    /**
     * Apuntar bien es apuntar A CONTRAVIENTO, y el nivel se mide EN TOLERANCIAS.
     *
     * Es el Momento donde la receta vieja se rompía y por eso vale decirlo acá:
     * un desvío en unidades de barra no significa nada —0,2 es adentro con
     * tolerancia 0,3 y afuera con 0,15—, así que el error de cada nivel se
     * expresa como fracción del margen que ESTE pateador tiene en ESTA patada.
     * Así "juega bien" quiere decir lo mismo a treinta metros de frente que a
     * cuarenta y ocho contra la ceja.
     *
     *   · bien    — adentro de media tolerancia: entra.
     *   · regular — alrededor del borde: entra, pega en el palo o se va, y las
     *               tres cosas pasan de verdad.
     *   · mal     — más allá del poste. No es "casi": es afuera.
     */
    playAt(setup: PalosSetup, level: PlayLevel, variation: number): PalosInput {
        const perfecto = palosPerfectAim(setup.wind);
        const [desde, hasta] = level === 'bien'
            ? [0, 0.55]
            : level === 'regular' ? [0.6, 1.5] : [1.6, 3.2];

        // La variación decide de qué lado se va y cuánto, en ese orden.
        const lado = variation < 0.5 ? -1 : 1;
        const dentroDelLado = (variation * 2) % 1;
        const error = (desde + dentroDelLado * (hasta - desde)) * setup.tolerance;

        // Si por ese lado se sale de la barra, se va por el otro: el desvío lo
        // manda el nivel y no lo puede recortar el borde de la pantalla.
        const propuesto = perfecto + lado * error;
        const aim = Math.abs(propuesto) <= 1 ? propuesto : perfecto - lado * error;

        return { kind: 'palos', aim: Math.max(-1, Math.min(1, aim)) };
    },

    resolve(setup: PalosSetup, input: PalosInput): MomentResult {
        // Se acota la puntería a la barra: una pantalla no puede apuntar afuera
        // del estadio.
        const aim = Math.max(-1, Math.min(1, input.aim));
        const landing = palosLanding(aim, setup.wind);
        const grade = palosGrade(landing, setup.tolerance);

        // Sin cuerpo y sin sanción: es el único que no se juega con el cuerpo.
        const deltas: MomentDeltas = grade === 'adentro'
            ? { fame: FAME_GOAL, belonging: BELONGING_GOAL }
            : { fame: -FAME_MISS };

        return {
            deltas,
            result: RESULT_LABEL[grade],
            text: cronica(grade, setup.minute, setup.distance),
        };
    },
};
