// EL CAPITÁN — cuándo se termina.
//
// Vivía suelto adentro del reducer, en diez líneas que leían dos números: la
// edad y el desgaste. Está acá porque es motor —la regla de cuándo se acaba una
// carrera es tan regla como la de cuánto crece un atributo— y porque las dos
// cosas que entraron en la 0.29.0 necesitaban un lugar donde poder discutirse
// por separado.
//
// ── LO QUE ESTABA ROTO, MEDIDO ─────────────────────────────────────────────
// Barrido de 320 carreras completas, cuarenta por puesto, con la carta media:
//
//   1. EL DESGASTE SE MAXIMIZABA SOLO. El cuerpo mediano al retiro daba 91 de
//      100, y a los 34 el 44% de los jugadores ya estaba en 90 o más. O sea que
//      «el cuerpo roto adelanta el tope blando hasta tres años» no era el
//      castigo del que se rompió: era el caso normal. La tabla de `positions.ts`
//      decía que un apertura tiene tope blando 36 y el apertura real lo tenía en
//      33. Un dato del catálogo mintiendo tres años sin que nada fallara.
//
//   2. EL RETIRO NO MIRABA CÓMO ESTABAS JUGANDO. La media poblacional a los 34
//      era 85,6 y a los 38 era 85,2: no baja, porque la tirada se llevaba puestos
//      a los que estaban bien. El docstring de esta misma decisión citaba —y sigue
//      citando, abajo— que el 76% de los internacionales sigue a los diez años
//      contra el 38% de los que no lo son. Ese mundo no estaba implementado en
//      ningún lado: ni los caps, ni la media, ni el tiempo de juego entraban en
//      la cuenta. El mejor jugador del mundo tiraba el mismo dado que un suplente
//      de su edad.
//
// Las dos se arreglan acá adentro y ninguna toca la tabla de edades de
// `positions.ts`, que está calibrada contra edades reales del rugby puesto por
// puesto y no es lo que estaba mal.

import type { AgeCurve } from '../data/positions.ts';
import type { CaptainPlayer } from '../types/player.ts';
import type { Rng } from './random.ts';

/**
 * Por qué se terminó la carrera. Son ids: la pantalla los traduce, así que
 * cambiar el texto de la UI no toca el estado guardado.
 */
export type RetirementReason = 'tope-del-puesto' | 'edad' | 'cuerpo' | 'decision';

// ═══════════════════════════════════════════════════════════════════════════
//  LA VUELTA A CASA ES EL ÚLTIMO CAPÍTULO
// ═══════════════════════════════════════════════════════════════════════════
//
// La tarjeta pregunta si querés terminar donde empezaste y el motor no terminaba
// nada: volvías, seguías cobrando ofertas del mercado y podías estirar hasta el
// tope duro del puesto. O sea que la decisión más linda del juego no hacía lo
// único que promete su propio texto.
//
// Ahora la vuelta marca la temporada en la que ocurrió y de esa marca salen las
// dos mitades del cierre: no hay más mesa (`generateOffers`) y se juega UNA
// temporada más —la despedida, en tu club, con tu gente— y ahí se termina.
//
// ── Por qué una marca en `flags` y no un campo nuevo del estado ─────────────
// Porque `flags` ya existe, ya se persiste y ya es el lugar de los contadores
// libres del jugador (`ultimo-pase` vive ahí). Un campo propio obligaría a subir
// el `schema` del guardado y a migrar, para representar exactamente el mismo
// hecho.

/** La marca que deja la vuelta a casa: la temporada en la que volviste. */
export const FAREWELL_FLAG = 'volvio-a-casa';

/**
 * CUÁNTAS TEMPORADAS SE JUEGAN DESPUÉS DE VOLVER. PARÁMETRO LIBRE.
 *
 * Una, y no cero: la tarjeta se decide DESPUÉS de jugada la temporada, así que
 * un cierre inmediato te retiraría sin haber pisado la cancha de tu club ni un
 * sábado — que es justamente lo que la decisión venía a comprar.
 *
 * Y no tres: la despedida que dura tres años no es una despedida, es un pase.
 */
export const FAREWELL_SEASONS = 1;

/**
 * ¿YA SE JUGÓ LA DESPEDIDA?
 *
 * Se DERIVA de la marca y de la temporada en curso, que es lo que hace que no
 * pueda desincronizarse: no hay un contador que alguien tenga que acordarse de
 * bajar (§1.9).
 */
export function farewellClosed(player: CaptainPlayer, season: number): boolean {
    const volvio = player.flags[FAREWELL_FLAG];
    if (volvio === undefined) return false;
    return season - volvio > FAREWELL_SEASONS;
}

/** ¿Volviste a casa a terminar? Lo lee el mercado para no ponerte la mesa. */
export function inFarewell(player: CaptainPlayer): boolean {
    return player.flags[FAREWELL_FLAG] !== undefined;
}

// ═══════════════════════════════════════════════════════════════════════════
//  LO QUE EL CUERPO ADELANTA
// ═══════════════════════════════════════════════════════════════════════════

/**
 * DESDE DÓNDE EMPIEZA A CONTAR EL DESGASTE. PARÁMETRO LIBRE.
 *
 * Antes esto no existía y la cuenta era `floor(cuerpo / 30)` sobre el número
 * crudo, o sea que el primer año se perdía a los 30 de desgaste — que un titular
 * pisa a los 23. Con un piso, el tope blando de la tabla vuelve a describir al
 * jugador típico y el adelanto pasa a medir lo que su nombre dice: cuánto MÁS
 * roto estás que lo normal, no cuántos partidos jugaste.
 *
 * Cuarenta es, medido contra el nuevo reloj del cuerpo (`simulate-season.ts`),
 * el desgaste de una carrera larga sin nada raro. Si ese reloj se recalibra,
 * este número se mueve con él o vuelve a adelantarle años a todo el mundo.
 * ESPEJO de `BODY_REST_BASE` y `BODY_PER_MATCH`.
 */
export const BODY_ANTICIPATION_FLOOR = 40;

/** Cada cuántos puntos de desgaste por encima del piso se pierde un año. */
export const BODY_ANTICIPATION_STEP = 20;

/**
 * Y el tope: tres años y no más, que es lo que ya decía la regla vieja.
 *
 * Con el piso y el paso de arriba, llegar a los tres pide 100 de desgaste — el
 * máximo de la escala. El que se rompe entero paga lo mismo que pagaba antes;
 * lo que cambió es que ahora hay que romperse.
 */
export const BODY_ANTICIPATION_MAX = 3;

/** Cuántos años le adelanta el cuerpo al tope blando. */
export function bodyAnticipation(body: number): number {
    const exceso = Math.max(0, body - BODY_ANTICIPATION_FLOOR);
    return Math.min(BODY_ANTICIPATION_MAX, Math.floor(exceso / BODY_ANTICIPATION_STEP));
}

// ═══════════════════════════════════════════════════════════════════════════
//  LO QUE TE SOSTIENE
// ═══════════════════════════════════════════════════════════════════════════
//
// Tres cosas, y son las que el rugby mira cuando decide si un tipo de 35 sigue
// teniendo camiseta. Ninguna es una palanca nueva: las tres ya viven en el
// estado y ninguna se puede declarar a mano desde un evento.
//
//   NIVEL          seguís siendo el que eras. Se mide contra TU mejor media y no
//                  contra un absoluto, porque si no esto sería un premio para el
//                  que nació con techo alto en vez de una lectura de si te caíste.
//   TITULARIDAD    el club te sigue poniendo. Sale de `ovr − clubRating`, o sea
//                  que es la misma cuenta que decide si jugás: el veterano que
//                  todavía es titular sigue, el que mira desde afuera no.
//   INTERNACIONAL  llegaste a la mayor. Es el dato duro del que sale toda esta
//                  sección: 76% de los internacionales sigue a los diez años,
//                  38% de los que no.
//
// ── Por qué esto NO es la compuerta que el §2 del CLAUDE prohíbe ────────────
// Aquella era una palanca sobre el tiempo de juego puesta a decidir cuánto
// CRECÍAS, y premiaba justo al brazo que quería frenar. Esto no decide nada que
// el jugador elija: decide cuánto dura el que ya llegó, que es precisamente lo
// que el tiempo de juego sabe. La diferencia entre las dos es a qué pregunta
// contesta el número, no de dónde sale.

/**
 * CUÁNTO PUEDE BAJAR LA TIRADA, como máximo. PARÁMETRO LIBRE.
 *
 * Con 0,72 el mejor del mundo tira un cuarto de lo que tira su compañero de
 * puesto en el mismo año. No es inmunidad —el tope duro del puesto sigue
 * cerrando la carrera y el cuerpo sigue adelantando el blando— pero alcanza para
 * que estar en tu mejor momento signifique algo.
 *
 * ── Calibrado contra la tasa y no contra el parámetro (§1.8) ────────────────
 * Lo que se fijó es la SEPARACIÓN entre internacionales y el resto, que es el
 * dato del que sale toda esta sección, y el 0,72 se leyó de ahí. Barrido de 400
 * carreras que nunca cuelgan los botines por su cuenta —o si no se mide al
 * simulado eligiendo irse y no al motor cortando la carrera—:
 *
 *   sostén   internacional (15+ caps)   el resto   mueren en el tope duro
 *   0,00              37,0                37,3              34,8%
 *   0,40              37,0                37,4              42,5%
 *   0,72              38,0                37,5              48,5%
 *
 * EL NÚMERO QUE MANDA ES EL DE LA IZQUIERDA, y lo que dice es incómodo: SIN
 * sostén, el internacional se retira ANTES que el resto —juega más partidos, se
 * desgasta más y encima está en clubes donde le cuesta más ser titular—, o sea
 * que el motor afirmaba lo contrario del dato que lo justifica. Con 0,40 sigue
 * invertido. 0,72 es aproximadamente el mínimo que alcanza para darlo vuelta, y
 * por eso es este y no uno más cómodo.
 *
 * ── Y lo que cuesta, dicho acá y no escondido ───────────────────────────────
 * La columna de la derecha: el tope duro pasa de llevarse un tercio de las
 * carreras a llevarse la mitad. Catorce de esos puntos son de este número. La
 * causa de fondo no es el sostén sino que la ventana `soft → hard` de la tabla
 * de `positions.ts` es de dos años en varios puestos —un apertura tiene 36 y
 * 38—, así que la tirada tiene UNA sola oportunidad real y con el sostén encima
 * casi no dispara. Antes eso no se veía porque el desgaste le adelantaba el
 * blando tres años a todo el mundo y la ventana quedaba en cinco.
 *
 * Si algún día la mitad muriendo en el tope duro molesta, el lugar honesto para
 * arreglarlo es esa ventana y no este número: acá bajarlo devuelve el problema
 * que vino a resolver.
 *
 * Que NO sea 1 es lo que importa: un sostén perfecto convertiría el tope duro en
 * la única salida y todas las carreras de élite terminarían el mismo año, que es
 * el modo de fallo que la longevidad sorteada vino a romper.
 */
export const RETIREMENT_HOLD_MAX = 0.72;

/**
 * Cuánta media perdida hace falta para que el sostén del nivel se apague entero.
 * PARÁMETRO LIBRE.
 *
 * Ocho puntos es la distancia entre ser titular en tu club y ser el que entra
 * veinte minutos. Con el declive del motor —entre 1,1 y 2,3 por temporada según
 * el puesto, amortiguado por lo que jugás— son cuatro o cinco años pasado el
 * declive: el veterano se sostiene y después se apaga, en vez de cortarse de
 * golpe.
 */
const HOLD_LEVEL_WINDOW = 8;

/**
 * La ventana de la titularidad. Por debajo del piso no sostiene nada; en el
 * techo sostiene entero.
 *
 * 0,35 es el suplente que entra; 0,80 es el titular que juega el año completo.
 * Son los mismos escalones que usa `statistics.ts` para repartir minutos, y por
 * eso están escritos así y no como «titular / suplente»: acá no hay categorías,
 * hay una fracción.
 */
const HOLD_SHARE_FLOOR = 0.35;
const HOLD_SHARE_FULL = 0.80;

/**
 * Cuántos caps hacen falta para contar como internacional a estos efectos.
 *
 * Quince y no uno: el dato del 76% habla de internacionales, no de tipos que
 * fueron convocados una vez a una gira. Con `caps / 15` recortado a uno, el que
 * jugó tres tests recibe una quinta parte del sostén, que es lo correcto.
 */
const HOLD_CAPS_FULL = 15;

/**
 * Cuánto pesa cada una. Suman 1 por construcción y hay un test que lo prueba:
 * si no sumaran, `RETIREMENT_HOLD_MAX` dejaría de ser el máximo que dice ser y
 * el nombre y la cosa volverían a decir cosas distintas.
 */
const HOLD_WEIGHTS = { nivel: 0.45, titularidad: 0.35, internacional: 0.2 } as const;

function clamp01(value: number): number {
    return Math.min(1, Math.max(0, value));
}

/** Lo que el motor necesita saber para decidir si se terminó. */
export interface RetirementInput {
    /** La curva de ESTE jugador, con su perfil y su longevidad ya adentro. */
    curve: AgeCurve;
    age: number;
    /** El desgaste físico, de 0 a 100. */
    body: number;
    /** Cuánto de la temporada del club jugaste el último año, de 0 a 1. */
    share: number;
    /** La media de hoy. */
    ovr: number;
    /**
     * La mejor media que tuviste. DERIVADA de `history[]` y nunca guardada: un
     * campo nuevo obligaría a migrar el guardado y podría desincronizarse de la
     * trayectoria que ya lo contiene (CLAUDE de captain §1.9).
     */
    bestOvr: number;
    caps: number;
    /**
     * VOLVISTE A TERMINAR Y LA DESPEDIDA YA SE JUGÓ. Llega masticado por
     * `farewellClosed`, igual que `bestOvr` llega derivado del historial: acá
     * adentro no vive la forma del estado.
     */
    farewellClosed: boolean;
}

/**
 * Cuánto te sostiene lo que sos, de 0 a `RETIREMENT_HOLD_MAX`.
 *
 * Se exporta para que un test pueda medir los tres ejes por separado sin
 * fabricar una carrera entera, y para que la pantalla pueda contarlo el día que
 * queramos mostrarlo.
 */
export function retirementHold(input: RetirementInput): number {
    const pico = Math.max(input.bestOvr, input.ovr);
    const nivel = clamp01(1 - (pico - input.ovr) / HOLD_LEVEL_WINDOW);
    const titularidad = clamp01((input.share - HOLD_SHARE_FLOOR) / (HOLD_SHARE_FULL - HOLD_SHARE_FLOOR));
    const internacional = clamp01(input.caps / HOLD_CAPS_FULL);

    const mezcla = nivel * HOLD_WEIGHTS.nivel
        + titularidad * HOLD_WEIGHTS.titularidad
        + internacional * HOLD_WEIGHTS.internacional;

    return RETIREMENT_HOLD_MAX * mezcla;
}

/**
 * La probabilidad de que esta sea la última temporada.
 *
 * Cero antes del tope blando —corrido por lo que el cuerpo adelante— y uno en el
 * tope duro. En el medio crece lineal y la sostiene lo de arriba.
 *
 * Separada de la tirada a propósito: así un test puede barrer la curva entera sin
 * un rng, que es la única forma de auditar la forma en vez de una muestra.
 */
export function retirementChance(input: RetirementInput): number {
    const { curve, age } = input;
    if (age >= curve.hard) return 1;

    const soft = curve.soft - bodyAnticipation(input.body);
    if (age < soft) return 0;

    const crudo = (age - soft) / Math.max(1, curve.hard - soft);
    return clamp01(crudo * (1 - retirementHold(input)));
}

/**
 * ¿Se terminó? Devuelve el motivo, o `null` si hay otra temporada.
 *
 * LA TIRADA SE CONSUME EN CUANTO ENTRÁS EN LA ZONA, y eso decide solo la edad, el
 * cuerpo y la curva: nunca el sostén. Si el tiro dependiera de si el jugador es
 * de élite, el stream del rng dependería de la carrera y dos partidas con la
 * misma semilla dejarían de ser comparables. Lo que el sostén cambia es el
 * NÚMERO contra el que se compara, no si se tira — que es la misma disciplina
 * que el ruido de `aging.ts` y la de la regresión por lesión.
 */
export function resolveRetirement(input: RetirementInput, rng: Rng): RetirementReason | null {
    // LA DESPEDIDA NO SE TIRA, y va antes que el tope duro: el que volvió a su
    // club a terminar ya decidió cuándo se iba, así que acá no hay dado que
    // consultar ni edad que mirar. El motivo es 'decision' porque eso fue: te
    // fuiste cuando quisiste vos, y así lo cuenta la pantalla de retiro.
    if (input.farewellClosed) return 'decision';

    if (input.age >= input.curve.hard) return 'tope-del-puesto';

    const soft = input.curve.soft - bodyAnticipation(input.body);
    if (input.age < soft) return null;
    if (!rng.chance(retirementChance(input))) return null;

    // El desgaste manda el relato solo cuando de verdad fue el cuerpo. El umbral
    // es el mismo que antes: por debajo, la carrera se terminó por la edad.
    return input.body >= 60 ? 'cuerpo' : 'edad';
}
