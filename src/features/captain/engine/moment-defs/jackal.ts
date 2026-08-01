// EL JACKAL — el primero por el contrato, y el más chico a propósito.
//
// Un ruck. La pelota queda en el piso y vos llegás antes que el sostén. Te
// parás sobre ella, ponés las manos y aguantás hasta que el referee decida. Tres
// veces en el partido, y cada una es la misma pregunta: ¿llegaste?
//
// ── Por qué esperar y tocar ──
// El jackal real no es puntería ni fuerza: es TIMING sobre una ventana que
// existe y se cierra. Hay un instante —entre que el tackleado toca el piso y
// entra el primer sostén rival— en el que la pelota es legal. Antes de eso te
// vas de offside; después te limpian. La regla entra en una línea y el minijuego
// es esa línea.
//
// ── Calibración ──
// Un 7 de élite se lleva tres o cuatro turnovers por partido (Irlanda gana 8,4
// por 80 minutos entre todo el equipo). Acá se juegan tres oportunidades y dos
// convertidas ya es actuación de figura. La ventana base de 300 ms está apenas
// por encima del tiempo de reacción visual simple de una persona —200 a 300 ms—,
// así que la primera ronda casi se regala y la tercera hay que ganársela.
//
// ── Qué NO hace ──
// No encadena al bunker. Un penal en el breakdown es un penal, y ya se cobra con
// `sanction`: mandarlo también al revisor sería cobrar dos veces la misma
// infracción.

import type { CaptainAttributes } from '../../types/player.ts';
import type { MomentOutcome } from '../../types/moment.ts';
import type {
    MomentDef,
    MomentDeltas,
    MomentResult,
    MomentSetup,
    MomentSetupCtx,
} from '../../types/moment-def.ts';
import { createRng } from '../random.ts';

/** La mano del jugador, sacada de la unión: si cambia allá, esto no compila. */
type JackalInput = Extract<MomentOutcome, { kind: 'jackal' }>;

// ═══════════════════════════════════════════════════════════════════════════
//  Las constantes
// ═══════════════════════════════════════════════════════════════════════════

/** Tres oportunidades. Ni una más: el jackal cansa, y el cuarto ruck ya no es tuyo. */
export const JACKAL_ROUNDS = 3;

/** La ventana de la primera. Apenas por encima del tiempo de reacción humano. */
const BASE_WINDOW_MS = 300;

/** Cuánto se achica por ronda: 300 → 260 → 220. */
const SHRINK_MS = 40;

/**
 * Con aguante alto el achique se parte al medio: 300 → 280 → 260.
 *
 * Es la traducción más directa que tiene el juego de para qué sirve el aguante:
 * no te hace más rápido, te deja llegar a la tercera igual de entero que a la
 * primera. Y `aguante` no cuenta para la media de nadie (CLAUDE.md), así que
 * este es de los pocos lugares donde se ve que existe.
 */
const AGUANTE_FIT = 75;
const SHRINK_FIT_MS = 20;

/** El `robo` sobre 60 ensancha la ventana. Debajo de 60 la achica, simétrico. */
const ROBO_PIVOT = 60;
const ROBO_MS_PER_POINT = 1.2;

/** Piso de la ventana. Ni el peor jugador juega contra algo imposible. */
const MIN_WINDOW_MS = 90;

/** Cuánto tarda en aparecer el destello. Largo y variable: no se puede machacar. */
const DELAY_MIN_MS = 800;
const DELAY_MAX_MS = 2600;

/**
 * SIEMPRE se paga el cuerpo, y a veces la cabeza.
 *
 * El breakdown es donde el rugby se lastima: meter la cabeza donde entran tres
 * pares de rodillas tiene un precio y el juego no lo esconde. Da igual si
 * saliste con la pelota o si te limpiaron — el golpe ya lo recibiste.
 */
const BODY_PER_JACKAL = 1;
const HEAD_KNOCK_CHANCE = 0.06;

/** Lo que paga cada pelota robada. */
const FAME_PER_TURNOVER = 2;
const BELONGING_PER_TURNOVER = 1.5;

/** Lo que cuesta cada penal en contra. */
const FAME_PER_PENALTY = 2;
const SANCTION_PER_PENALTY = 1;

// ═══════════════════════════════════════════════════════════════════════════
//  El Setup
// ═══════════════════════════════════════════════════════════════════════════

export interface JackalSetup extends MomentSetup {
    kind: 'jackal';
    /** Las tres ventanas, en milisegundos y ya con robo, aguante y oficio adentro. */
    windows: number[];
    /** Cuánto tarda cada destello en aparecer. Sorteado acá y no en la pantalla. */
    delays: number[];
    /**
     * Si el golpe del breakdown pega en la cabeza.
     *
     * SE SORTEA ACÁ, no en `resolve`, y ese es todo el punto del contrato: si se
     * sorteara al resolver, recargar la página antes de tocar cambiaría si
     * cobraste un HIA o no. Acá viaja en el guardado y la jugada es la misma
     * antes y después del F5.
     */
    headKnock: boolean;
    /** El minuto, copiado: `resolve` no ve el contexto y la crónica lo nombra. */
    minute: number;
}

/**
 * Las tres ventanas.
 *
 * Exportada aparte del `setup` porque es lo que hay que poder mirar de a dos
 * —robo 60 contra robo 90 sobre el mismo jugador— sin tener que fabricar un
 * contexto entero.
 */
export function jackalWindows(attrs: Readonly<CaptainAttributes>, proficiency: number): number[] {
    const shrink = attrs.aguante >= AGUANTE_FIT ? SHRINK_FIT_MS : SHRINK_MS;
    const porRobo = (attrs.robo - ROBO_PIVOT) * ROBO_MS_PER_POINT;
    // El oficio NUNCA ensancha: se acota a 1 acá y no en cada cuenta de abajo,
    // así que no hay forma de que un Momento futuro invierta el signo por
    // descuido.
    const oficio = Math.min(1, proficiency);

    const ventanas: number[] = [];
    for (let i = 0; i < JACKAL_ROUNDS; i += 1) {
        const bruta = (BASE_WINDOW_MS - i * shrink + porRobo) * oficio;
        ventanas.push(Math.round(Math.max(MIN_WINDOW_MS, bruta)));
    }
    return ventanas;
}

// ═══════════════════════════════════════════════════════════════════════════
//  De lo que hiciste a lo que significa
// ═══════════════════════════════════════════════════════════════════════════

/** Qué pasó en una ronda. El orden es el del reglamento, no el del premio. */
export type JackalBeat = 'offside' | 'turnover' | 'limpiado';

/**
 * Una ronda.
 *
 * Tocar ANTES del destello NO ES "fallaste": es entrar al ruck por el costado y
 * el referee lo cobra. Que llegar tarde salga gratis y llegar temprano salga
 * caro es la asimetría que hace que el minijuego se parezca al puesto.
 */
export function jackalBeat(reaction: number | null, window: number): JackalBeat {
    if (reaction === null) return 'limpiado';
    if (reaction < 0) return 'offside';
    return reaction <= window ? 'turnover' : 'limpiado';
}

export type JackalGrade = 'figura' | 'robo' | 'mixto' | 'sin-premio' | 'desastre';

/**
 * La nota de la jugada.
 *
 * `desastre` es, POR CONSTRUCCIÓN, el caso sin un solo turnover: por eso no
 * puede pagar ni Cartel ni Pertenencia, y no hace falta acordarse de la regla al
 * escribir el próximo Momento. Un `desastre` que igual sumara Pertenencia porque
 * robó una y regaló dos sería una nota que miente.
 */
export function jackalGrade(turnovers: number, offsides: number): JackalGrade {
    if (turnovers === 0) return offsides > 0 ? 'desastre' : 'sin-premio';
    if (offsides > 0) return 'mixto';
    return turnovers >= 2 ? 'figura' : 'robo';
}

const RESULT_LABEL: Record<JackalGrade, string> = {
    figura: 'Jackal decisivo',
    robo: 'Turnover',
    mixto: 'Turnover y penal',
    'sin-premio': 'Sin premio en el piso',
    desastre: 'Penal en el breakdown',
};

function cronica(grade: JackalGrade, minute: number, turnovers: number, offsides: number): string {
    const m = `Minuto ${minute}`;
    const pelotas = `${turnovers} ${turnovers === 1 ? 'pelota' : 'pelotas'}`;
    const penales = `${offsides} ${offsides === 1 ? 'penal' : 'penales'}`;

    switch (grade) {
        case 'figura':
            return `${m}: ${pelotas} robadas en el piso y ni un penal en contra. De eso vivís.`;
        case 'robo':
            return `${m}: llegaste a una, te paraste sobre la pelota y aguantaste. El referee marcó para tu lado.`;
        case 'mixto':
            return `${m}: robaste ${pelotas}, pero en otra entraste antes de tiempo y te cobraron ${penales}.`;
        case 'desastre':
            return `${m}: te tiraste antes de que la pelota estuviera en el piso. ${penales} en contra y la cara del capitán.`;
        default:
            return `${m}: llegaste tarde a las tres. Te limpiaron y el juego siguió sin vos.`;
    }
}

// ═══════════════════════════════════════════════════════════════════════════
//  La definición
// ═══════════════════════════════════════════════════════════════════════════

export const JACKAL: MomentDef<JackalSetup, JackalInput> = {
    kind: 'jackal',
    // El 6, el 7 y el 8. El jackal es del que vive en el piso: un wing que se
    // tira sobre la pelota en el minuto 70 es una anécdota, no un puesto.
    families: ['tercera-linea'],
    weight: 10,
    labelEs: 'El jackal',

    setup(ctx: MomentSetupCtx): JackalSetup {
        // Único sorteo del Momento, y sale de la semilla derivada: no toca el rng
        // de la carrera, así que agregar este Momento no corre el stream de nadie.
        const rng = createRng(ctx.seed);

        // Orden fijo: primero los tres delays y después el golpe. Cambiarlo
        // cambia todos los jackals de todas las partidas.
        const delays: number[] = [];
        for (let i = 0; i < JACKAL_ROUNDS; i += 1) delays.push(rng.int(DELAY_MIN_MS, DELAY_MAX_MS));
        const headKnock = rng.chance(HEAD_KNOCK_CHANCE);

        return {
            kind: 'jackal',
            seed: ctx.seed,
            windows: jackalWindows(ctx.attrs, ctx.proficiency),
            delays,
            headKnock,
            minute: ctx.minute,
        };
    },

    resolve(setup: JackalSetup, input: JackalInput): MomentResult {
        let turnovers = 0;
        let offsides = 0;

        // Se recorre por las VENTANAS y no por las reacciones: una pantalla que
        // mande de menos —o de más— no puede inventar rondas que no existieron.
        for (let i = 0; i < setup.windows.length; i += 1) {
            const beat = jackalBeat(input.reactions[i] ?? null, setup.windows[i]);
            if (beat === 'turnover') turnovers += 1;
            if (beat === 'offside') offsides += 1;
        }

        const grade = jackalGrade(turnovers, offsides);
        const deltas: MomentDeltas = { bodyDamage: BODY_PER_JACKAL };

        // Solo Cartel y Pertenencia. NO empuja la planilla, y es una diferencia
        // con el tackle limpio —que sí suma `statBoost`— que quedó anotada como
        // pregunta de diseño en vez de resuelta por analogía: la gloria de la
        // tercera línea SON los turnovers, así que un jackal que empuje la
        // planilla podría estar cobrando dos veces la misma jugada.
        if (turnovers > 0) {
            deltas.fame = turnovers * FAME_PER_TURNOVER;
            deltas.belonging = turnovers * BELONGING_PER_TURNOVER;
        }
        if (offsides > 0) {
            deltas.fame = (deltas.fame ?? 0) - offsides * FAME_PER_PENALTY;
            deltas.sanction = offsides * SANCTION_PER_PENALTY;
        }
        if (setup.headKnock) deltas.headDamage = 1;

        return {
            deltas,
            result: RESULT_LABEL[grade],
            text: cronica(grade, setup.minute, turnovers, offsides),
        };
    },
};
