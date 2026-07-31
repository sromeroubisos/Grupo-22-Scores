// EL CAPITÁN — los Momentos.
//
// Un Momento es la jugada que decide algo y que NO se simula: la jugás. Es el
// equivalente de los minijuegos de El Ídolo, con una diferencia que ordena todo
// el sistema: acá el resultado no es un premio suelto sino un multiplicador
// sobre un número que la temporada ya calcula.
//
// ── El contrato con el motor ──
// El Momento se decide ANTES de simular la temporada y se resuelve con una
// acción del jugador. Su resultado entra por los mismos carriles que ya existen
// —`pendingStatBoost`, `pendingSanction`, Cartel, Pertenencia, daño— así que
// agregar un Momento nuevo no toca `simulate-season.ts`.
//
// ── Determinismo ──
// El resultado de un Momento es UNA ENTRADA DEL JUGADOR, igual que elegir una
// opción: se guarda en el estado y por eso una partida cargada muestra lo que
// pasó de verdad. Lo que sí consume azar es lo que el jugador no controla —el
// veredicto del bunker— y eso sale del rng sembrado.

import type { MomentKind } from './moment-kinds.ts';

export type { MomentKind };

/**
 * La jugada que te espera esta temporada.
 *
 * Lleva su propio contexto porque la pantalla tiene que poder contar POR QUÉ
 * importa: "minuto 63, tres puntos abajo" no es lo mismo que "minuto 12, veinte
 * arriba", aunque la barra sea la misma.
 */
export interface PendingMoment {
    kind: MomentKind;
    /** Minuto del partido. Cuanto más tarde, más pesa. */
    minute: number;
    /** El marcador desde tu lado. Negativo es ir perdiendo. */
    scoreDelta: number;
    /** De 0 a 1. Aprieta el reloj y achica los márgenes. */
    pressure: number;
    /**
     * El veredicto del bunker, YA DECIDIDO cuando la escena se monta.
     *
     * Lo decide el motor con el rng sembrado, no la cuenta regresiva: si lo
     * sorteara la pantalla, recargar en el segundo siete daría otro resultado y
     * la partida dejaría de ser reproducible.
     */
    verdict?: BunkerVerdict;
}

/** Dónde frenaste la barra del tackle. El orden es el del riesgo creciente. */
export type TackleZone = 'piernas' | 'legal' | 'alto' | 'tarde';

/** Qué decidió el oficial revisor. */
export type BunkerVerdict = 'amarilla' | 'roja-20';

/**
 * Lo que el jugador produjo. Se guarda en el estado: es su jugada, no un dado.
 */
export type MomentOutcome =
    /** `at` es dónde frenaste, de 0 a 1: cuánto te pasaste importa. */
    | { kind: 'tackle'; zone: TackleZone; at: number }
    | { kind: 'bunker' };

/** Una jugada ya resuelta, para la trayectoria. */
export interface MomentRecord {
    season: number;
    kind: MomentKind;
    /** El resultado en una palabra, para la crónica. */
    result: string;
    /** La línea que se lee en la temporada. */
    text: string;
}
