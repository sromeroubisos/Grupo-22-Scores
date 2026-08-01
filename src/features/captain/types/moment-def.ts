// EL CAPITÁN — el contrato de un Momento.
//
// Un Momento es la jugada que decide y que no se simula: se juega. Este archivo
// declara la FORMA que tienen que tener los quince por puesto para entrar sin
// tocar el reducer, la temporada ni el guardado.
//
// Son tipos y nada más: no importa `engine/` ni React. El motor implementa el
// contrato en `engine/moment-defs/`, la pantalla lo dibuja desde `app/`, y
// ninguno de los dos conoce al otro.
//
// ── Las tres reglas que este archivo existe para imponer ──
//
// 1. `resolve` NO RECIBE CONTEXTO. Recibe el Setup y la mano del jugador, nada
//    más. No es purismo: `PendingMoment` se serializa al guardado y se rehidrata
//    en el F5, así que si `resolve` leyera el estado, la misma jugada resuelta
//    antes y después de recargar podría dar distinto —el cuerpo cambió, el club
//    cambió, el rival cambió—. Todo lo que `resolve` necesite del contexto va
//    MASTICADO adentro del Setup, que sí viaja en el guardado. Es el paso 3 del
//    §8 de CLAUDE.md ("probá la recarga") y ningún test de determinismo lo
//    agarra, porque los tests no recargan la página.
//
// 2. `MomentDeltas` ESTÁ CERRADO. Solo los carriles que el motor ya tiene. No
//    hay `flags: Record<string, number>`: una puerta abierta en un tipo que
//    existe para estar cerrado deja que cualquier Momento invente su propio
//    contador y a los tres meses nadie sabe cuáles existen. Cuando La Llave
//    quiera su contador de penales de scrum se agrega un campo tipado acá, y esa
//    conversación —qué carril nuevo merece el motor— ES la conversación de
//    diseño que no queremos saltear.
//
// 3. EL AZAR SE SORTEA EN `setup`, NUNCA EN `resolve`. El Setup lleva su propia
//    semilla y todo lo que el jugador no controla ya viene decidido adentro: los
//    delays del destello, si el golpe pega en la cabeza, el veredicto del
//    revisor. Es la misma regla que ya cumple el bunker —"el veredicto lo decide
//    el motor, no la cuenta regresiva"— pero ahora escrita en el tipo en vez de
//    en un comentario que hay que acordarse de leer.

import type { MomentKind } from './moment-kinds.ts';
import type { CaptainAttributes, PositionFamilyId } from './player.ts';

// ═══════════════════════════════════════════════════════════════════════════
//  1 · LO QUE UN MOMENTO LE PUEDE HACER A LA TEMPORADA
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Los carriles, y son todos los que hay.
 *
 * Cada uno existe en el motor desde antes de los Momentos: `engine/moments.ts`
 * los traduce a estado en un solo lugar (`applyMomentDeltas`), igual que
 * `apply-decision.ts` traduce un `CaptainEffect`. Que la traducción esté en un
 * solo lugar es lo que hace que un Momento no pueda prometer una cosa y hacer
 * otra.
 *
 * NO están: la plata (el rugby amateur no la mueve, CLAUDE.md §5), los
 * atributos (un Momento es un partido, no una temporada de entrenamiento) y los
 * contadores libres (regla 2 de la cabecera).
 */
export interface MomentDeltas {
    /** Cartel. */
    fame?: number;
    /** Pertenencia con el club donde estás parado. */
    belonging?: number;
    /** Empuje a la planilla del puesto. Dura UNA temporada. */
    statBoost?: number;
    /** Partidos de suspensión, que se cobran en ESTA temporada. */
    sanction?: number;
    /** Escalones de tiempo de juego. Dura UNA temporada. */
    playingTime?: number;
    /** Desgaste físico. Puede bajar. */
    bodyDamage?: number;
    /** HIA positivos. Sube y no baja nunca. */
    headDamage?: number;
}

// ═══════════════════════════════════════════════════════════════════════════
//  2 · EL SETUP — lo único que `resolve` va a ver
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Lo que ve `setup`, y solo `setup`.
 *
 * Es la foto del contexto en el instante en que la jugada aparece. Todo lo que
 * el Momento necesite de acá tiene que quedar copiado adentro del Setup que
 * devuelve: después de esta llamada, el contexto no existe más.
 */
export interface MomentSetupCtx {
    kind: MomentKind;
    season: number;
    /** Minuto del partido. Cuanto más tarde, más pesa. */
    minute: number;
    /** El marcador desde tu lado. Negativo es ir perdiendo. */
    scoreDelta: number;
    /** De 0 a 1. Aprieta el reloj y achica los márgenes. */
    pressure: number;
    /** La familia del jugador, para el que quiera mirarla. */
    family: PositionFamilyId;
    /**
     * De 0 a 1: QUÉ TAN TUYA ES ESTA JUGADA.
     *
     * 1 para la familia dueña del Momento. Menos para el que se la encuentra sin
     * ser lo suyo —un centro tirándose sobre la pelota en el breakdown—. Nunca
     * ensancha un margen: el que la juega prestada la juega peor, y el contrato
     * no le da a ningún Momento la chance de invertir ese signo.
     */
    proficiency: number;
    /** Los diecinueve atributos, ya leídos. */
    attrs: Readonly<CaptainAttributes>;
    /** El desgaste físico de hoy. */
    bodyDamage: number;
    /**
     * La semilla del minijuego: `hash(semilla:kind:temporada:idx)`.
     *
     * Derivada, no tomada del stream principal. Dos consecuencias que valen el
     * párrafo: agregar un Momento no corre el rng de la carrera —así el digest
     * congelado se mueve solo donde un Momento cambió el resultado, en vez de
     * moverse entero— y la semilla del minijuego sobrevive al guardado sin
     * necesidad de guardar el estado del rng de nadie.
     *
     * El `idx` es cuántas jugadas van en esta temporada: hoy nunca hay dos del
     * mismo kind, pero un encadenado ya son dos jugadas, y el día que haya dos
     * del mismo tipo no queremos que compartan semilla.
     */
    seed: number;
}

/**
 * La base de todo Setup. Cada Momento la extiende con lo suyo.
 *
 * JSON PURO Y OBLIGATORIO: viaja adentro de `PendingMoment` hasta el
 * `localStorage`. Nada de `Date`, `Map`, `Set`, funciones ni referencias
 * circulares (CLAUDE.md §2). Si te tienta guardar el jugador entero, guardá el
 * número que ibas a leerle.
 */
export interface MomentSetup {
    kind: MomentKind;
    /** La semilla con la que se sortearon los márgenes. Viaja al guardado. */
    seed: number;
}

// ═══════════════════════════════════════════════════════════════════════════
//  3 · EL RESULTADO
// ═══════════════════════════════════════════════════════════════════════════

export interface MomentResult {
    /** Lo que le hace a la temporada. Cerrado a los carriles de arriba. */
    deltas: MomentDeltas;
    /** El resultado en una palabra, para la crónica. */
    result: string;
    /** La línea que se lee en la temporada. */
    text: string;
    /**
     * Encadena OTRA jugada, como el tackle alto encadena el bunker.
     *
     * SE RESUELVE A LO SUMO UNA VEZ, y nunca a sí mismo. Las dos reglas las
     * impone `nextChain` en `engine/moments.ts` y no la buena voluntad de quien
     * escriba el próximo Momento: una cadena sin tope es una carrera que no
     * avanza más, y el jugador no tiene forma de salir.
     */
    chain?: MomentKind;
}

// ═══════════════════════════════════════════════════════════════════════════
//  4 · LA DEFINICIÓN
// ═══════════════════════════════════════════════════════════════════════════

export interface MomentDef<S extends MomentSetup, I> {
    kind: MomentKind;
    /**
     * Las familias a las que les toca, en orden canónico.
     *
     * `null` es transversal: le toca a cualquiera. El tackle lo es porque causa
     * la mitad de las lesiones del rugby y no le pregunta a nadie qué dorsal
     * tiene.
     */
    families: readonly PositionFamilyId[] | null;
    /** Peso relativo en el sorteo, entre los que le tocan a esa familia. */
    weight: number;
    /** Título corto para la pantalla y para la trayectoria. */
    labelEs: string;
    /**
     * Arma los márgenes. Es el ÚNICO lugar del Momento donde se sortea algo, y
     * se sortea con `ctx.seed`: nunca con el rng de la carrera.
     */
    setup(ctx: MomentSetupCtx): S;
    /**
     * De lo que hizo el jugador a lo que le pasa a la temporada.
     *
     * SIN ctx y SIN rng, por la regla 1 de la cabecera. Si te falta un dato,
     * el lugar donde se agrega es el Setup.
     */
    resolve(setup: S, input: I): MomentResult;
}

// La vista con los genéricos borrados —`AnyMomentDef`— vive en el registry
// (`engine/moment-defs/index.ts`) y no acá. Necesita conocer `MomentOutcome`,
// que vive en `moment.ts`, que a su vez necesita `MomentSetup` de este archivo:
// declararla acá sería un ciclo de tipos por comodidad. Y el borrado es una
// decisión del registry, así que le corresponde al registry.
