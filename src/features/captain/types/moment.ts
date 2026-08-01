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
import type { MomentSetup } from './moment-def.ts';

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
     *
     * Es del carril PRE-CONTRATO (tackle y bunker). Los Momentos que van por
     * `MomentDef` guardan lo suyo adentro de `setup`.
     */
    verdict?: BunkerVerdict;
    /**
     * Los márgenes con los que se juega, ya sorteados.
     *
     * Presente solo en los Momentos que van por el contrato. VIAJA AL GUARDADO
     * y es lo único que `resolve` va a ver: por eso una jugada retomada después
     * de un F5 se resuelve con los mismos márgenes con los que apareció.
     */
    setup?: MomentSetup;
    /**
     * Esta jugada llegó encadenada desde otra.
     *
     * La marca la pone `nextChain` y sirve para una sola cosa: que una cadena se
     * resuelva A LO SUMO UNA VEZ. Sin esto, dos Momentos que se encadenen mutuamente
     * dejan la carrera girando sin que el jugador tenga forma de salir.
     */
    chained?: true;
}

/** Dónde frenaste la barra del tackle. El orden es el del riesgo creciente. */
export type TackleZone = 'piernas' | 'legal' | 'alto' | 'tarde';

/** Qué decidió el oficial revisor. */
export type BunkerVerdict = 'amarilla' | 'roja-20';

/**
 * Lo que el jugador produjo. Se guarda en el estado: es su jugada, no un dado.
 *
 * La pantalla reporta LO QUE HIZO, en crudo, y el motor decide qué significa.
 * Nunca al revés: si la pantalla mandara "acerté", la clasificación viviría en
 * React y el motor no podría reproducir la jugada sin la pantalla.
 */
export type MomentOutcome =
    /** `at` es dónde frenaste, de 0 a 1: cuánto te pasaste importa. */
    | { kind: 'tackle'; zone: TackleZone; at: number }
    | { kind: 'bunker' }
    /**
     * Los tres tiempos de reacción del jackal, en milisegundos DESDE EL
     * DESTELLO. Negativo es haber tocado antes —offside—, y `null` es no haber
     * tocado nunca. El motor los clasifica contra las ventanas del Setup.
     */
    | { kind: 'jackal'; reactions: (number | null)[] }
    /** Cuántas veces insististe en el scrum antes de soltar. Cero es soltar enseguida. */
    | { kind: 'ancla'; pushes: number }
    /** La seña que repetiste, en el orden en que la tocaste. */
    | { kind: 'codigo'; call: number[] }
    /**
     * Dónde apuntaste, de −1 (izquierda del todo) a 1 (derecha del todo). El
     * viento lo corre después: apuntar al medio NO es apuntar bien.
     */
    | { kind: 'palos'; aim: number };

/** Una jugada ya resuelta, para la trayectoria. */
export interface MomentRecord {
    season: number;
    kind: MomentKind;
    /** El resultado en una palabra, para la crónica. */
    result: string;
    /** La línea que se lee en la temporada. */
    text: string;
}
