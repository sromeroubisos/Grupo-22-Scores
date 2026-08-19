// EL CAPITÁN — cómo se mueve un jugador con los años.
//
// Dos movimientos por temporada, y son distintos a propósito:
//
//   DIRIGIDO  — la carta de pretemporada. Sube UNO O DOS atributos declarados,
//               los que elegiste. Es el único movimiento que el jugador apunta.
//   GENERAL   — el resto de la familia se mueve por el RENDIMIENTO: cuánto
//               jugaste, en qué etapa de la curva estás, y cómo está el cuerpo.
//               Se reparte por los pesos del puesto, no se apunta.
//
// ── Por qué el rendimiento y ya no una ficha ──
// Hasta 0.6.0 el crecimiento general lo empujaban las fichas de ⏳ puestas en
// entrenar, y era la misma decisión todos los años con distinto número. Ahora lo
// empuja el tiempo de juego, que es la traducción correcta: el que juega la
// temporada entera de titular mejora, y el que mira desde el banco no —aunque
// entrene lo mismo. En rugby la evidencia acompaña: la fuerza bruta no predice
// el rendimiento en partido de un forward, así que lo que hace al jugador es
// jugar.
//
// Lo que NO cambió: la media no sube por hacer tries. `share` es cuánto jugaste,
// no cuánto rendiste en la planilla. Un pilar que hace diez tries no se vuelve
// mejor pilar por eso.
//
// ── Las tres etapas ──
// Antes del pico se crece, y se crece más rápido cuanto más lejos está el
// techo: los últimos puntos cuestan. Adentro del pico no pasa casi nada. Pasado
// el declive se pierde, y se pierde distinto según el puesto — el wing se cae
// de golpe porque cuando se va la velocidad no queda nada atrás, y el pilar
// baja despacio porque el empuje se sostiene con oficio.
//
// ── LO QUE ENTRÓ EN 0.11.0, Y DÓNDE VIVE CADA COSA ─────────────────────────
// El tramo de arriba decide el TAMAÑO del movimiento. Encima corren tres cosas
// nuevas, y ninguna se escribió acá adentro por una razón concreta:
//
//   `growthScale`  cuánto rinde el trabajo de este año — `growth.ts`. Seis
//                  factores con nombre (entorno, vida, edad, tirada, mérito,
//                  perfil), cada uno discutible por separado.
//   la CURVA DE    dónde empieza y dónde termina la meseta DE ESTE JUGADOR —
//   EDAD           `development-profile.ts`, vía `resolveAgeCurve`. Cruza el
//                  perfil (cuándo llegás) con la longevidad (cuánto te dura), y
//                  es la misma curva que lee el retiro: una sola fuente.
//   la CURVA DEL   qué atributo crece y cuál se cae a cada edad — la tabla de
//   ATRIBUTO       más abajo, que es de este archivo porque es envejecimiento.
//
// La curva por atributo es la que faltaba y la que más se nota: hasta 0.10.0 los
// cuatro atributos de la familia se movían en bloque, así que un wing de 31
// perdía liderazgo al mismo ritmo que velocidad. En el rugby de verdad pasa lo
// contrario — se va la velocidad y queda el oficio— y esa es media explicación
// de por qué un apertura juega hasta los 35 y un wing no.

import type { CaptainAttributeKey, CaptainPlayer } from '../types/player.ts';
import type { TrainingDef } from '../data/trainings.ts';
import type { Rng } from './random.ts';
import type { ShopPerks } from './shop.ts';
import { POTENTIAL_BAND, START_AGE } from '../types/player.ts';
import { ALL_FAMILIES, POSITION_FAMILIES, getFamily } from '../data/positions.ts';
import { TRAINING_CEILING, trainingPoints } from '../data/trainings.ts';
import { NO_SHOP_PERKS, isImmune } from './shop.ts';
import { ovrOf, potentialOf } from './ovr.ts';
import { resolveAgeCurve } from './development-profile.ts';

/**
 * Cuánto empuja el crecimiento general una temporada jugada entera.
 *
 * Reemplaza a `TRAINING_PER_TOKEN`, que rendía 1,15 por ficha con dos o tres
 * fichas típicas. Con 2,6 y un `share` de 0,3 a 0,9 el empuje queda entre 0,8 y
 * 2,3: la misma banda de antes, pero ganada en la cancha.
 */
export const PERFORMANCE_GROWTH = 2.6;

/**
 * Cuánto amortigua la caída jugar mucho, pasado el declive.
 *
 * El veterano que sigue siendo titular se cae más despacio que el que ya mira
 * los partidos desde afuera, y esa es la mitad de la explicación de por qué unos
 * llegan a los 35 y otros no.
 */
export const PERFORMANCE_DECLINE_CUSHION = 0.7;

/**
 * Lo que crece un pibe por temporada sin jugar nada.
 *
 * ── Este comentario decía otra cosa, y era mentira ──
 * Decía que había bajado de 1,4 a 0,6 al irse las fichas. La edición nunca
 * aterrizó: el valor siempre fue 1,4. Un comentario que describe un cambio que
 * no ocurrió es peor que no tener comentario, así que queda anotado lo que
 * PASÓ y no lo que se pensó hacer.
 *
 * Y sigue en 1,4 por una razón medida, no por inercia. La idea era que con 1,4
 * de regalo el que no juega llega igual a su techo, y bajarlo devolvería el
 * modo de fracaso. Se probó: con 0,6, un jugador sin entrenar nada sigue
 * tocando 81 de 82. No alcanza, porque el que garantiza la llegada no es este
 * número sino la forma del lazo —`pull` es proporcional a la brecha, así que
 * converge igual, solo que más lento—. Lo que devuelve el fracaso es que el
 * lazo corra MÁS LENTO DE LO QUE DURA UNA CARRERA, y eso es lo que hace
 * `growthScale`: no cambia el punto fijo, cambia cuántas temporadas hacen falta
 * para llegar. El del club de barrio se retira sin haber llegado.
 */
export const BASE_GROWTH = 1.4;

/**
 * Ventana de crecimiento de referencia, en temporadas: de `START_AGE` al pico
 * del puesto que más tarda en hacerse, que es el pilar.
 *
 * Existe por un sesgo medido y nada obvio. El crecimiento corre hasta el pico
 * del puesto, así que un pilar tenía NUEVE temporadas para acercarse a su techo
 * y un centro SEIS. Con el mismo potencial, el pilar llegaba más cerca — y como
 * el umbral de la mayor está en la cola, esa diferencia chica en la media se
 * volvía enorme en el resultado: el 16% de los pilares llegaba a la selección
 * contra el 1% de los centros.
 *
 * El arreglo es el correcto además de conveniente: el que tiene menos años para
 * crecer crece más rápido por año. Los backs maduran antes, y eso es cierto.
 *
 * DERIVADA, y por eso se calcula (CLAUDE de captain §1.9). Estaba escrita como
 * `9` con su propia definición al lado —«de los 18 al pico de un pilar»— y esa
 * definición dejó de dar 9 el día que la carrera empezó a los 16. Escrita a mano
 * seguía valiendo 9 y el pilar pasaba a crecer más lento por año que el resto
 * SIN que nada fallara: exactamente la mentira con fecha de vencimiento que la
 * convención nombra. Calculada, mover `START_AGE` o el pico de un puesto la
 * mueve sola.
 */
const REFERENCE_GROWTH_WINDOW = ALL_FAMILIES.reduce(
    (mayor, id) => Math.max(mayor, POSITION_FAMILIES[id].age.peak[0] - START_AGE),
    1,
);

/**
 * TOPE DURO DE MEDIA POR TEMPORADA.
 *
 * Hoy no lo toca nadie: el crecimiento típico de este motor anda entre uno y
 * tres puntos, así que nueve es techo de sobra. Está igual porque
 * `growthScale` es un producto de seis factores y un producto de seis factores
 * tiene una cola: una tirada alta sobre un pibe de 19 en el Top 14 con mérito
 * máximo y perfil precoz se multiplica sola. Una temporada que sube quince
 * puntos de media no se lee como una irrupción, se lee como un bug — y este
 * número es lo que hace que no pueda pasar aunque alguien mueva una constante
 * de `growth.ts` sin medir.
 */
export const OVR_GROWTH_CAP_PER_SEASON = 9;

/** Piso y techo de un atributo. */
const ATTR_MIN = 5;
const ATTR_MAX = 99;

/**
 * Cuánto se cae por temporada, pasado el declive, por familia.
 *
 * El wing pierde casi el doble que el pilar. No es un número de gusto: es la
 * diferencia entre un puesto que vive de la velocidad —que se va temprano y de
 * golpe— y uno que vive del empuje y del oficio.
 */
const DECLINE_PER_SEASON: Record<string, number> = {
    'primera-linea': 1.1,
    hooker: 1.4,
    'segunda-linea': 1.5,
    'tercera-linea': 1.7,
    'medio-scrum': 1.3,
    apertura: 1.4,
    centro: 1.9,
    'wing-fullback': 2.3,
};

// ═══════════════════════════════════════════════════════════════════════════
//  LA EDAD DE PICO DE CADA ATRIBUTO
// ═══════════════════════════════════════════════════════════════════════════
//
// UNA SOLA TABLA, DOS LECTURAS. De acá salen tanto el reparto del crecimiento
// como el del declive, y por eso no hay dos tablas que puedan separarse: si
// mañana la velocidad pica un año antes, se corrige en un lugar y las dos
// lecturas se mueven juntas (CLAUDE de captain §1.9).
//
// Los números son del rugby, no de gusto:
//
//   · la VELOCIDAD y la GAMBETA pican a los 25-26 y después se van solas. Es la
//     razón por la que un wing tiene la carrera más corta del deporte.
//   · el EMPUJE y el LANZAMIENTO maduran cerca de los 30: el scrum y el line-out
//     se aprenden, y se siguen aprendiendo.
//   · la VISIÓN y el LIDERAZGO crecen prácticamente hasta el retiro. Es lo que
//     hace que un apertura de 34 siga siendo titular con la mitad de las piernas.
//
// PARÁMETRO LIBRE los diecinueve: son afirmaciones sobre el deporte y se
// discuten como tales.
const ATTRIBUTE_PEAK: Readonly<Record<CaptainAttributeKey, number>> = {
    // Pack cerrado
    empuje: 30,
    choque: 28,
    manos: 29,
    lanzamiento: 30,
    salto: 27,
    trabajo: 27,
    // Contacto y breakdown
    tackle: 29,
    robo: 28,
    defensa: 30,
    // Manejo y patada
    salida: 29,
    patada: 31,
    pegada: 31,
    vision: 33,
    // Espacio abierto
    quiebre: 26,
    velocidad: 25,
    gambeta: 26,
    juegoAereo: 28,
    // Transversales
    liderazgo: 34,
    aguante: 27,
};

/**
 * Cuánto se lleva un atributo del CRECIMIENTO de la temporada, según lo lejos
 * que esté de su propio pico.
 *
 * Nunca negativo: mientras el jugador globalmente crece, ninguno de sus
 * atributos baja. La velocidad de un pibe de 24 crece poco, no al revés.
 */
function attributeGrowthFactor(key: CaptainAttributeKey, age: number, shift = 0): number {
    const margen = ATTRIBUTE_PEAK[key] + shift - age;
    if (margen >= 6) return 1.35;
    if (margen >= 2) return 1.1;
    if (margen >= -1) return 0.85;
    if (margen >= -5) return 0.5;
    return 0.25;
}

/**
 * Cuánto se lleva un atributo de la CAÍDA, según lo pasado de pico que esté.
 *
 * La misma tabla leída al revés: el que todavía no llegó a su pico casi no cae
 * —el veterano sigue ganando oficio— y el que hace seis años que lo pasó se
 * derrumba.
 */
function attributeDeclineFactor(key: CaptainAttributeKey, age: number, shift = 0): number {
    const pasado = age - (ATTRIBUTE_PEAK[key] + shift);
    if (pasado <= 0) return 0.35;
    if (pasado <= 3) return 0.8;
    if (pasado <= 6) return 1.25;
    return 1.6;
}

function clampAttr(value: number): number {
    return Math.min(ATTR_MAX, Math.max(ATTR_MIN, Math.round(value)));
}

export interface AgingContext {
    /**
     * Cuánto rinde el trabajo de esta temporada. Sale entero de `growth.ts`; acá
     * solo se multiplica. Uno es "temporada del montón".
     */
    growthScale: number;
    /**
     * LO QUE COMPRÓ EL JUGADOR, leído en cada temporada y nunca guardado.
     *
     * Entra por acá y no por el jugador —que ya viaja como primer argumento—
     * porque los perks se DERIVAN de lo comprado (`shopPerks`) y derivarlos acá
     * adentro los recalcularía en cada llamada. El que simula la temporada los
     * arma una vez y los pasa, igual que hace con `growthScale`.
     *
     * ── Y por qué la CURVA DE EDAD sí se deriva acá adentro, entonces ──
     * Porque el argumento de arriba es sobre el costo, y `resolveAgeCurve` son
     * cinco `max` sobre datos que ya viajan en el jugador. Lo que pesa del otro
     * lado es que el corrimiento del pico ENTRABA por acá y el retiro no lo veía:
     * dos lectores de la misma curva, uno con el corrimiento y el otro sin él.
     * Resolviéndola adentro, quien llama no puede pasarle una curva distinta de
     * la que el jugador tiene.
     */
    perks: ShopPerks;
}

const NEUTRAL_CONTEXT: AgingContext = { growthScale: 1, perks: NO_SHOP_PERKS };

/**
 * Mueve los atributos una temporada.
 *
 * `training` es la carta de pretemporada, o `null` si no se eligió ninguna.
 * `playedShare` es cuánto de la temporada del club jugaste, de 0 a 1: es el
 * rendimiento, y es lo que empuja el movimiento general. `bodyDamage` frena el
 * crecimiento y acelera la caída: un cuerpo roto no mejora, aguanta.
 *
 * Muta al jugador —el reducer ya trabaja sobre un clon— y devuelve cuánto se
 * movió la media, que es lo que la pantalla quiere mostrar.
 */
export function ageOneSeason(
    player: CaptainPlayer,
    rng: Rng,
    training: TrainingDef | null,
    bodyDamage: number,
    playedShare: number,
    context: AgingContext = NEUTRAL_CONTEXT,
): number {
    const before = ovrOf(player);
    const family = getFamily(player.family);
    const age = player.age;

    // LA CURVA DE ESTE JUGADOR, con su perfil y su longevidad ya adentro. Se
    // resuelve y no se lee de la familia porque la familia es el puesto —dato de
    // catálogo, igual para todos— y esto es de él: el precoz longevo entra en la
    // meseta a los 24 y no sale hasta los 33, y su compañero de puesto no.
    const { peak, decline } = resolveAgeCurve(player);

    // El cuerpo castigado rinde menos: de 0 a 100 de desgaste, hasta un 40%
    // menos de crecimiento.
    const bodyFactor = 1 - Math.min(0.4, bodyDamage / 250);
    const rendimiento = Math.min(1, Math.max(0, playedShare));

    // ── LO CONSTRUIDO, Y POR QUÉ VA ACÁ ARRIBA ──────────────────────────────
    // Primero de todo, porque el techo que esta temporada persigue tiene que ser
    // el que la pretemporada acaba de levantar: entrenás, sube el techo, y
    // recién entonces el año corre atrás de él. Al revés, la carta de este año
    // recién se sentiría el año que viene y la decisión perdería su desenlace.
    //
    // Y va AFUERA del recorte de más abajo, que es todo el punto. Lo dirigido
    // cae adentro y por eso solo puede hacerte llegar antes; esto mueve adónde
    // llegás. Es el canal que el motor no tenía, y sin él ninguna carta —de
    // ningún tamaño y con ningún costo— podía decidir nada del pico.
    //
    // Solo se construye mientras se crece. Levantar el techo a los 34 no es una
    // decisión: es un número que no va a alcanzar nadie.
    if (training && age <= peak[1]) {
        player.built = Math.min(POTENTIAL_BAND, player.built + TRAINING_CEILING[training.tier]);
    }

    const techo = potentialOf(player);

    // Cuál de las dos lecturas de `ATTRIBUTE_PEAK` corre esta temporada. Se
    // decide una sola vez, con el tramo, y no atributo por atributo: si cada
    // atributo eligiera su propia lectura, un jugador de 29 estaría creciendo y
    // cayendo al mismo tiempo y la media dejaría de tener un signo legible.
    // LO QUE EL CUERPO ROTO LE SUMA A LA CAÍDA, aparte y con nombre. Se saca del
    // renglón del declive para poder DESHACERLO atributo por atributo: el que
    // compró la recuperación se banca el desgaste en el Tackle, y para eso hay
    // que poder dividir por exactamente lo mismo que se multiplicó.
    const mordidaDelCuerpo = 1 + Math.min(0.5, bodyDamage / 200);

    let delta: number;
    let cayendo = false;
    if (age < peak[0]) {
        // Etapa de crecimiento. Cuanto más lejos del techo, más rápido se sube:
        // la brecha se cierra, no se salta. Y se corrige por lo corta que sea la
        // ventana del puesto, para que todos tengan la misma chance de llegar.
        const ventana = Math.max(1, peak[0] - START_AGE);
        const ritmo = REFERENCE_GROWTH_WINDOW / ventana;
        const gap = Math.max(0, techo - before);
        const pull = Math.min(1, gap / 18);
        delta = (BASE_GROWTH + rendimiento * PERFORMANCE_GROWTH)
            * pull * bodyFactor * ritmo * context.growthScale;
    } else if (age <= peak[1]) {
        // La meseta. Jugar todavía sirve, pero poco: acá ya sos lo que sos.
        const gap = Math.max(0, techo - before);
        delta = Math.min(gap, rendimiento * PERFORMANCE_GROWTH * 0.45 * bodyFactor * context.growthScale);
    } else if (age < decline) {
        delta = 0;
    } else {
        // La caída. Seguir jugando la amortigua, no la evita. Y NO la toca
        // `growthScale`: el entorno decide cuánto rinde el trabajo, no cuánto
        // aguanta el cuerpo. Lo que sí mueve el declive es el perfil, y lo mueve
        // por donde corresponde —corriendo el pico— y no con un factor aparte.
        const raw = DECLINE_PER_SEASON[player.family] ?? 1.5;
        const amortiguado = raw - rendimiento * PERFORMANCE_DECLINE_CUSHION;
        delta = -Math.max(0.3, amortiguado) * mordidaDelCuerpo;
        cayendo = true;
    }

    // Un poco de ruido para que dos temporadas iguales no se sientan iguales.
    // Se tira SIEMPRE y una sola vez, haya o no entrenamiento: si la tirada
    // dependiera de la carta elegida, el stream dependería de la decisión y dos
    // partidas con la misma semilla dejarían de ser comparables.
    delta += rng.float(-0.35, 0.35);

    // ── ANTES DEL DECLIVE NO SE PIERDE NADA, Y EL RUIDO NO ES UNA EXCEPCIÓN ──
    //
    // Medido: con el piso de `DECLINE_FLOOR` ya puesto, 14 de 96 carreras seguían
    // perdiendo media antes de los 33 —una a los 25—. No era la curva: era esta
    // línea. En la meseta y en el tramo llano que va del final del pico al piso,
    // `delta` vale cero o casi, así que media tirada de ruido es negativa y el
    // jugador ve bajar su media en un año en el que el motor no le sacó nada.
    //
    // El ruido sigue existiendo y sigue tirándose igual —el stream no se mueve,
    // que es lo que sostiene el digest— pero de este lado del declive solo puede
    // sumar. Del otro lado no se toca: ahí la variación para los dos lados es
    // justamente lo que hace que dos veteranos no se caigan al mismo ritmo.
    if (!cayendo) delta = Math.max(0, delta);

    // Lo dirigido: los puntos QUE DECLARA ESTA CARTA, que ya no son los mismos
    // para las cuatro. El cuerpo roto también lo frena —entrenar con el cuerpo
    // hecho pedazos rinde menos— y no habría razón para que esto fuera la
    // excepción.
    //
    // Los atributos que declara la carta son SIEMPRE de los cuatro de la
    // familia, y eso lo garantiza `trainings.test.ts`: acá se reparte sobre
    // `family.attributes` y uno de afuera se perdería sin ruido.

    // EL TECHO ES EL TECHO, y recorta LOS DOS MOVIMIENTOS JUNTOS. Se recorta
    // después del ruido y no antes, porque si no el ruido es justamente el que
    // lo pasa. Es un invariante medido: ninguna temporada puede dejar la media
    // por encima del potencial.
    //
    // Que el recorte sea proporcional y no "primero uno y después el otro" es
    // deliberado: si la carta cobrara primero, entrenar cerca del techo robaría
    // el crecimiento general, y el jugador vería que elegir un entrenamiento lo
    // deja peor que no elegir ninguno.
    //
    // El TOPE DE TEMPORADA entra por acá y no por una rama propia: es otro techo
    // sobre la misma subida, así que se aplica con el mismo mecanismo. Un
    // segundo recorte más abajo habría sido una regla nueva donde alcanzaba con
    // achicar el margen.
    let dirigido = training ? trainingPoints(training) * bodyFactor : 0;
    const room = Math.min(OVR_GROWTH_CAP_PER_SEASON, Math.max(0, techo - before));
    const subida = Math.max(0, delta) + dirigido;
    if (subida > room && subida > 0) {
        const factor = room / subida;
        if (delta > 0) delta *= factor;
        dirigido *= factor;
    }

    // ── EL REPARTO ENTRE LOS CUATRO ─────────────────────────────────────────
    // El movimiento general se reparte entre los cuatro atributos de la familia,
    // con el más pesado llevándose la mayor parte: un wing gana velocidad antes
    // que liderazgo. Se recorre `family.attributes`, que es orden declarado.
    //
    // Y encima corre la CURVA DE CADA ATRIBUTO, que es lo que entró en 0.11.0:
    // a los 31, un wing pierde velocidad al doble de lo que pierde liderazgo.
    //
    // ── POR QUÉ SE NORMALIZA, Y POR QUÉ CON EL CUADRADO DEL PESO ────────────
    // Sin normalizar, esta tabla no repartiría el movimiento: lo INFLARÍA o lo
    // desinflaría, y de paso movería la calibración entera del motor sin que
    // nadie lo hubiera pedido. Lo que tiene que hacer es cambiar QUIÉN se lleva
    // el punto, no CUÁNTOS puntos hay.
    //
    // Y el peso de la normalización es `w²` y no `w` porque lo que hay que
    // preservar es el movimiento de LA MEDIA, no la suma de los atributos: la
    // media pesa cada atributo por `w`, y el reparto ya le da a cada uno una
    // porción proporcional a `w`. Normalizar con `w` a secas dejaría la suma
    // quieta y la media corrida — que es exactamente el §1.8 del CLAUDE de
    // captain: si lo que te importa es una tasa, calibrá la tasa y no el
    // parámetro que la produce.
    //
    // Y ENCIMA CORRE LO COMPRADO. El preparador físico personal le corre el pico
    // del Tackle y del Aguante dos años, así que a los 31 ese jugador todavía
    // está del lado bueno de la tabla mientras el resto de su familia ya cae. Es
    // la misma tabla, leída con el pico movido: no hay una segunda curva que se
    // pueda desincronizar de esta.
    const totalWeight = family.weights.reduce((a, w) => a + w, 0);
    const curva = family.attributes.map((key) => {
        const shift = context.perks.peakShift[key] ?? 0;
        return cayendo
            ? attributeDeclineFactor(key, age, shift)
            : attributeGrowthFactor(key, age, shift);
    });
    let pesoCuadrado = 0;
    let curvaPesada = 0;
    for (let i = 0; i < family.weights.length; i += 1) {
        const w2 = family.weights[i] * family.weights[i];
        pesoCuadrado += w2;
        curvaPesada += w2 * curva[i];
    }
    const norma = curvaPesada > 0 ? curvaPesada / pesoCuadrado : 1;

    const movimiento: Partial<Record<CaptainAttributeKey, number>> = {};
    for (let i = 0; i < family.attributes.length; i += 1) {
        const key = family.attributes[i];
        const share = (family.weights[i] / totalWeight) * family.attributes.length;
        let paso = delta * share * (curva[i] / norma);

        // EL CUERPO NO TE BAJA LO QUE COMPRASTE. Se deshace exactamente la
        // mordida que se aplicó arriba, y SOLO del lado de la caída: la promesa
        // del ítem es «el cuerpo castigado deja de bajarte el Tackle», no «te
        // hace crecer más». Que sea una caída más chica y nunca una subida más
        // grande es lo que garantiza que esto no pueda pasar el techo — el
        // recorte contra el potencial ya ocurrió y este paso solo puede acercar
        // el movimiento a cero.
        if (cayendo && isImmune(context.perks, 'cuerpo', key)) paso /= mordidaDelCuerpo;

        movimiento[key] = (movimiento[key] ?? 0) + paso;
    }

    // Y encima, lo dirigido. Se acumula en el mismo mapa y se aplica una sola
    // vez: si se aplicara por separado, dos redondeos consecutivos sobre el
    // mismo atributo darían distinto que uno solo sobre la suma.
    // Y encima, lo dirigido, repartido COMO LO DECLARA LA CARTA y no en partes
    // iguales: una que da +6 de empuje y +2 de choque tiene que dar eso, porque
    // es lo que el jugador leyó antes de elegirla. Se reparte por proporción
    // sobre `dirigido` —y no por los puntos crudos— para que el recorte del
    // techo de más arriba siga valiendo: si se aplicaran los crudos, una carta
    // cara pasaría el potencial de largo.
    //
    // La curva del atributo NO lo toca: lo dirigido es lo que el jugador apuntó,
    // y una carta que promete +6 de empuje tiene que dar +6 de empuje aunque el
    // empuje esté pasado de pico. Prometer una cosa y hacer otra es lo único que
    // este motor no se permite.
    if (training && dirigido > 0) {
        const total = trainingPoints(training);
        for (const { attr, points } of training.gain) {
            movimiento[attr] = (movimiento[attr] ?? 0) + dirigido * (points / total);
        }
    }

    for (const key of family.attributes) {
        player.attrs[key] = clampAttr(player.attrs[key] + (movimiento[key] ?? 0));
    }

    // El aguante no entra en la media pero también envejece, y más temprano.
    if (age >= peak[1]) player.attrs.aguante = clampAttr(player.attrs.aguante - 1);

    player.ovr = ovrOf(player);
    return player.ovr - before;
}

/**
 * LA REGRESIÓN POR LESIÓN GRAVE. El cuerpo paga, y paga en atributos.
 *
 * Sin esto, romperse costaba fechas y desgaste pero no tocaba una sola línea de
 * lo que el jugador ES: volvías de seis meses afuera exactamente con el mismo
 * físico. Con esto, la media puede CAER en una temporada en la que entrenaste
 * bien, que es lo que hace que una lesión se sienta como una lesión.
 *
 * Baja lo físico y no lo técnico, y esa es la parte que importa: la rodilla te
 * saca velocidad, no visión de juego. Los tres son transversales —no dependen
 * de la familia— así que la mordida cae donde tiene que caer aunque el atributo
 * no cuente para la media de ese puesto.
 */
export const INJURY_ATTRIBUTE_LOSS_MIN = 1.5;
export const INJURY_ATTRIBUTE_LOSS_MAX = 3.2;

const INJURY_HIT_ATTRIBUTES: readonly CaptainAttributeKey[] = ['velocidad', 'choque', 'aguante'];

/**
 * LA TIRADA SE HACE SIEMPRE, tenga el jugador el kinesiólogo o no.
 *
 * Es la misma disciplina que el ruido de la temporada: si el tiro dependiera de
 * lo comprado, dos partidas con la misma semilla dejarían de ser comparables y
 * comprar un ítem correría el stream del rng en vez de cambiar un número. Lo que
 * el kinesiólogo cambia es si el número SE APLICA, no si se sortea.
 */
export function applySeriousInjuryRegression(
    player: CaptainPlayer,
    rng: Rng,
    perks: ShopPerks = NO_SHOP_PERKS,
): void {
    for (const key of INJURY_HIT_ATTRIBUTES) {
        const perdida = rng.float(INJURY_ATTRIBUTE_LOSS_MIN, INJURY_ATTRIBUTE_LOSS_MAX);
        if (isImmune(perks, 'lesion', key)) continue;

        const antes = player.attrs[key];
        player.attrs[key] = clampAttr(antes - perdida);
        // Lo que se fue de verdad —con el piso del atributo ya adentro— queda
        // anotado: es lo único con lo que el cirujano puede devolver EXACTAMENTE
        // lo que la lesión sacó, en vez de un número de catálogo que nunca pasó.
        const ido = antes - player.attrs[key];
        if (ido > 0) player.injuryLoss[key] = (player.injuryLoss[key] ?? 0) + ido;
    }
    player.ovr = ovrOf(player);
}

/**
 * LO QUE EL GOLPE SE LLEVA DE LA CABEZA, y no vuelve.
 *
 * Hasta acá `damage.cabeza` era un contador que SUBÍA Y NADIE LEÍA: la cuenta de
 * conmociones existía, se mostraba en la ficha, y no tocaba una sola línea de lo
 * que el jugador es. O sea que un HIA costaba exactamente lo mismo que no
 * tenerlo, y el juego decía en su propia documentación que el protocolo de
 * conmoción no se banaliza.
 *
 * Ahora cuesta VISIÓN, que es lo que la evidencia pone del lado cognitivo, y es
 * poco por golpe a propósito: una carrera con cuatro o cinco HIA pierde dos o
 * tres puntos: se nota en un apertura —Visión pesa 30 en su media— y casi nada
 * en un pilar, que es exactamente el reparto correcto.
 *
 * ES EL ÚNICO DAÑO QUE NO SE PUEDE DESHACER. El cirujano devuelve lo de la
 * lesión; el seguimiento neurológico solo puede EVITAR el golpe que viene, nunca
 * recuperar el que ya pasó. La cuenta de la cabeza sigue subiendo igual: eso no
 * lo arregla nadie.
 */
export const HEAD_VISION_LOSS_PER_HIA = 0.6;

export function applyHeadRegression(
    player: CaptainPlayer,
    hits: number,
    perks: ShopPerks = NO_SHOP_PERKS,
): void {
    if (hits <= 0 || isImmune(perks, 'golpe', 'vision')) return;
    player.attrs.vision = clampAttr(player.attrs.vision - hits * HEAD_VISION_LOSS_PER_HIA);
    player.ovr = ovrOf(player);
}
