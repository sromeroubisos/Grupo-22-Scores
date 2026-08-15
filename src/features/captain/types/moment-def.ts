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
//  3 · EL NIVEL DE JUEGO — cómo se juega un Momento sin pantalla
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Qué tan bien lo jugó el que no está sentado adelante de la pantalla.
 *
 * ── Por qué existe ──
 * El digest congelado necesita un jugador simulado, y hasta la 0.5.0 la receta
 * del test le daba a cada Momento una POSICIÓN DE INPUT CRUDA: dónde frenaba la
 * barra, dónde apuntaba, cuántas veces insistía. Eso no porta entre mecánicas.
 * "Frena en 0,62" no significa nada para un juego de memoria, y elegido uniforme
 * significa MENOS QUE NADA: al apertura de la tabla le tocó una puntería
 * uniforme en [−1, 1] contra tolerancias de 0,19 a 0,31, o sea un pateador que
 * ignora la bandera. Erró ocho de nueve patadas en trece temporadas y el digest
 * lo leyó como si Los Palos le hubieran arruinado la carrera. No era el balance:
 * era la receta.
 *
 * Con el nivel declarado, la traducción a inputs la hace CADA MOMENTO —el único
 * que sabe qué es apuntar bien en su mecánica— y el digest vuelve a ser
 * comparable entre Momentos y entre versiones, que es lo único que se le pide.
 *
 * ── Qué significa cada uno ──
 *   · `bien`    — la jugada le sale. Es tu jugada de héroe: TIENE que pagar en
 *                 promedio, y hay un test que lo verifica.
 *   · `regular` — la del que la juega sin ser su mejor tarde. Ni premio ni
 *                 desastre.
 *   · `mal`     — la falla, y la falla como se falla en ese puesto.
 *
 * El nivel NO es información: `playAt` ve el Setup entero, incluido lo que el
 * jugador de carne no puede ver —el punto de quiebre del scrum—. Un jugador que
 * juega bien es uno al que le sale, no uno que adivina.
 */
export type PlayLevel = 'bien' | 'regular' | 'mal';

/** Los tres, en orden de mejor a peor. Es el orden que verifica el contrato. */
export const PLAY_LEVELS: readonly PlayLevel[] = ['bien', 'regular', 'mal'];

// ═══════════════════════════════════════════════════════════════════════════
//  4 · EL RESULTADO
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
//  5 · LA DEFINICIÓN
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
    /**
     * La mano que juega un simulado de nivel `level`. Es OBLIGATORIA.
     *
     * ── Por qué es obligatoria y no opcional ──
     * Es la única forma de que el Momento número quince no vuelva a romper el
     * digest como lo rompió el cuarto. Con un método opcional, el que escribe un
     * Momento nuevo no se entera de que existe; con uno obligatorio, olvidárselo
     * es un error de compilación y hay que sentarse a decidir qué es jugar bien
     * en esa mecánica — que es exactamente la conversación que no queremos
     * saltear.
     *
     * ── `variation`, de 0 a 1 ──
     * La da quien llama y sirve para moverse ADENTRO del nivel: de qué lado se
     * va la pelota, qué gesto de la seña se equivoca, en qué ronda llega tarde.
     * Es un número, no un rng: `playAt` tiene que ser pura y determinista, igual
     * que `resolve`. Un mismo (setup, level, variation) da siempre la misma mano.
     *
     * ── Lo que este método NO es ──
     * No es un piloto automático para el jugador de carne, y la pantalla no lo
     * llama: si algún día el juego ofrece "simular la temporada", esa decisión se
     * toma aparte. Hoy vive acá porque el digest necesita un jugador y el único
     * que sabe cómo se juega un Momento es el Momento.
     *
     * OJO AL VERSIONADO: como es parte del motor, tocar las bandas de un nivel
     * mueve el digest congelado sin que el juego haya cambiado para nadie. Es
     * legítimo, pero se revisa como lo que es —un cambio en lo que el digest
     * SIGNIFICA— y no como un ajuste de balance.
     */
    playAt(setup: S, level: PlayLevel, variation: number): I;
}

// La vista con los genéricos borrados —`AnyMomentDef`— vive en el registry
// (`engine/moment-defs/index.ts`) y no acá. Necesita conocer `MomentOutcome`,
// que vive en `moment.ts`, que a su vez necesita `MomentSetup` de este archivo:
// declararla acá sería un ciclo de tipos por comodidad. Y el borrado es una
// decisión del registry, así que le corresponde al registry.
