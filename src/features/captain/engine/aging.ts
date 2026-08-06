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

import type { CaptainAttributeKey, CaptainPlayer } from '../types/player.ts';
import type { TrainingDef } from '../data/trainings.ts';
import type { Rng } from './random.ts';
import { POTENTIAL_BAND } from '../types/player.ts';
import { getFamily } from '../data/positions.ts';
import { TRAINING_CEILING, trainingPoints } from '../data/trainings.ts';
import { ovrOf, potentialOf } from './ovr.ts';

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
 * converge igual, solo que más lento—. Lo que devuelve el fracaso es que `pull`
 * dependa del rendimiento, y eso es un cambio de motor y no de constante.
 */
export const BASE_GROWTH = 1.4;

/**
 * Ventana de crecimiento de referencia, en temporadas: de los 18 al pico de un
 * pilar, que es el puesto que más tarda en hacerse.
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
 */
const REFERENCE_GROWTH_WINDOW = 9;

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

function clampAttr(value: number): number {
    return Math.min(ATTR_MAX, Math.max(ATTR_MIN, Math.round(value)));
}

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
): number {
    const before = ovrOf(player);
    const family = getFamily(player.family);
    const { peak, decline } = family.age;
    const age = player.age;

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

    let delta: number;
    if (age < peak[0]) {
        // Etapa de crecimiento. Cuanto más lejos del techo, más rápido se sube:
        // la brecha se cierra, no se salta. Y se corrige por lo corta que sea la
        // ventana del puesto, para que todos tengan la misma chance de llegar.
        const ventana = Math.max(1, peak[0] - 18);
        const ritmo = REFERENCE_GROWTH_WINDOW / ventana;
        const gap = Math.max(0, techo - before);
        const pull = Math.min(1, gap / 18);
        delta = (BASE_GROWTH + rendimiento * PERFORMANCE_GROWTH) * pull * bodyFactor * ritmo;
    } else if (age <= peak[1]) {
        // La meseta. Jugar todavía sirve, pero poco: acá ya sos lo que sos.
        const gap = Math.max(0, techo - before);
        delta = Math.min(gap, rendimiento * PERFORMANCE_GROWTH * 0.45 * bodyFactor);
    } else if (age < decline) {
        delta = 0;
    } else {
        // La caída. Seguir jugando la amortigua, no la evita.
        const raw = DECLINE_PER_SEASON[player.family] ?? 1.5;
        const amortiguado = raw - rendimiento * PERFORMANCE_DECLINE_CUSHION;
        delta = -Math.max(0.3, amortiguado) * (1 + Math.min(0.5, bodyDamage / 200));
    }

    // Un poco de ruido para que dos temporadas iguales no se sientan iguales.
    // Se tira SIEMPRE y una sola vez, haya o no entrenamiento: si la tirada
    // dependiera de la carta elegida, el stream dependería de la decisión y dos
    // partidas con la misma semilla dejarían de ser comparables.
    delta += rng.float(-0.35, 0.35);

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
    let dirigido = training ? trainingPoints(training) * bodyFactor : 0;
    const room = Math.max(0, techo - before);
    const subida = Math.max(0, delta) + dirigido;
    if (subida > room && subida > 0) {
        const factor = room / subida;
        if (delta > 0) delta *= factor;
        dirigido *= factor;
    }

    // El movimiento general se reparte entre los cuatro atributos de la familia,
    // con el más pesado llevándose la mayor parte: un wing gana velocidad antes
    // que liderazgo. Se recorre `family.attributes`, que es orden declarado.
    const totalWeight = family.weights.reduce((a, w) => a + w, 0);
    const movimiento: Partial<Record<CaptainAttributeKey, number>> = {};
    for (let i = 0; i < family.attributes.length; i += 1) {
        const key = family.attributes[i];
        const share = (family.weights[i] / totalWeight) * family.attributes.length;
        movimiento[key] = (movimiento[key] ?? 0) + delta * share;
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
