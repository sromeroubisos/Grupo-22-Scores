// PUNTERÍA — apuntar contra algo que no se ve.
//
// El verbo de Los Palos, generalizado para los otros seis que lo piden: el
// lanzamiento del hooker, el box kick del 9, el pase que hay que tirar ADELANTE
// del compañero que corre.
//
// ── La regla que lo hace un minijuego y no una barra ──
// EL BLANCO NO ESTÁ DONDE SE VE. Algo corre la pelota después de que salió —el
// viento, el adelanto del que corre, el rebote— así que apuntar al medio es
// errarle. Hay que apuntar afuera, y cuánto afuera es toda la pregunta.
//
// La señal se DIBUJA, nunca se dice en números. Leerla es la mitad del juego, y
// una pantalla que muestre "desvío: 0,42" ya lo resolvió.
//
// ── Lo que hereda de Los Palos y lo que no ──
// Hereda la cuenta —`landing = aim + desvío`— y la lección de la calibración:
// el nivel del simulado se mide EN TOLERANCIAS y nunca en unidades de barra,
// porque 0,2 es adentro con tolerancia 0,3 y afuera con 0,15.
//
// No hereda el `palo`: aquel tiene un tercer resultado que es un `afuera` que se
// cuenta distinto, y es propio de una patada a los palos. Acá el borde es
// `tibio`, que es el mismo lugar de la escala compartida.

import type { Mechanic, MechanicCtx, MinigameGrade, PunteriaParams } from '../../types/minigame.ts';
import type { PlayLevel } from '../../types/moment-def.ts';
import { createRng } from '../random.ts';

/** La tolerancia con el margen a la mitad. */
const TOL_MIN = 0.07;
const TOL_MAX = 0.34;

export interface PunteriaSetup {
    /** Cuánto corre lo que apuntaste, de −1 a 1. La pantalla lo dibuja. */
    desvio: number;
    /** Cuánto margen tenés a cada lado del blanco. */
    tolerancia: number;
    senal: string;
    bordes: [string, string];
    zona: string;
    sweepMs: number;
}

/** Dónde apuntaste, de −1 a 1. */
export interface PunteriaInput {
    aim: number;
}

/**
 * Dónde termina la pelota. Es la cuenta entera del verbo y por eso vive sola:
 * la pantalla la usa para DIBUJAR dónde cayó, no para decidir si entró.
 */
export function punteriaLanding(aim: number, desvio: number): number {
    return Math.max(-1, Math.min(1, aim)) + desvio;
}

/**
 * Dónde habría que apuntar para clavarla. Es la inversa de `punteriaLanding`.
 *
 * Existe para los TESTS y para `playAt`: sin ella, cualquiera de los dos tendría
 * que hardcodear el signo del desvío y quedaría desincronizado la primera vez
 * que se calibre. La pantalla NO la usa —dibujarla sería resolverle el minijuego
 * al jugador— y hay un test que lo verifica.
 */
export function punteriaPerfectAim(desvio: number): number {
    return -desvio;
}

export function punteriaGrade(setup: PunteriaSetup, aim: number): MinigameGrade {
    const error = Math.abs(punteriaLanding(aim, setup.desvio));
    if (error <= setup.tolerancia * 0.35) return 'clavado';
    if (error <= setup.tolerancia) return 'logrado';
    if (error <= setup.tolerancia * 1.5) return 'tibio';
    return 'errado';
}

export const PUNTERIA: Mechanic<PunteriaParams, PunteriaSetup, PunteriaInput> = {
    id: 'punteria',

    setup(params: PunteriaParams, ctx: MechanicCtx) {
        const rng = createRng(ctx.seed);

        // El desvío primero. Cambiar el orden mueve todas las punterías de todas
        // las partidas.
        const desvio = Math.round(rng.float(-params.desvioMax, params.desvioMax) * 100) / 100;

        return {
            desvio,
            tolerancia: Math.round((TOL_MIN + ctx.margin * (TOL_MAX - TOL_MIN)) * 1000) / 1000,
            senal: params.senal,
            bordes: params.bordes,
            zona: params.zona,
            sweepMs: Math.round(params.sweepMs * (1 - ctx.pressure * 0.3)),
        };
    },

    grade(setup, input) {
        return punteriaGrade(setup, input.aim);
    },

    /**
     * El error va EN UNIDADES DE BARRA, nunca en tolerancias.
     *
     * Escrito como fracción de la tolerancia, el margen se cancela y el atributo
     * del puesto deja de hacer nada: la cuenta está en `ventana.ts`, que es
     * donde se descubrió. Acá el simulado tiene una puntería fija —la de una
     * persona— y la tolerancia decide si le alcanza.
     *
     *   · bien    — lee la señal y le pega derecho.
     *   · regular — la lee a medias.
     *   · mal     — apunta al blanco y deja que la señal haga lo suyo, que es
     *               el error clásico de este verbo y no un desvío al azar.
     */
    playAt(setup, level: PlayLevel, variation: number): PunteriaInput {
        const perfecto = punteriaPerfectAim(setup.desvio);
        const [desde, hasta] = level === 'bien'
            ? [0, 0.03]
            : level === 'regular' ? [0.05, 0.13] : [0.20, 0.45];

        const lado = variation < 0.5 ? -1 : 1;
        const dentro = (variation * 2) % 1;
        const error = desde + dentro * (hasta - desde);

        const propuesto = perfecto + lado * error;
        const aim = Math.abs(propuesto) <= 1 ? propuesto : perfecto - lado * error;

        return { aim: Math.max(-1, Math.min(1, aim)) };
    },
};
