// EL CAPITÁN — cómo se mueve un jugador con los años.
//
// La media NO SUBE POR RENDIR. Sube por entrenar, por lo que te pasa en los
// eventos, y por la edad. Es la decisión de El Ídolo trasladada tal cual, y en
// rugby aguanta mejor todavía: la evidencia muestra que la fuerza bruta no
// predice el rendimiento en partido de un forward, así que un pilar que hace
// diez tries no se vuelve mejor pilar por eso.
//
// ── Las tres etapas ──
// Antes del pico se crece, y se crece más rápido cuanto más lejos está el
// techo: los últimos puntos cuestan. Adentro del pico no pasa casi nada. Pasado
// el declive se pierde, y se pierde distinto según el puesto — el wing se cae
// de golpe porque cuando se va la velocidad no queda nada atrás, y el pilar
// baja despacio porque el empuje se sostiene con oficio.

import type { CaptainPlayer } from '../types/player.ts';
import type { Rng } from './random.ts';
import { getFamily } from '../data/positions.ts';
import { ovrOf } from './ovr.ts';

/** Cuánto rinde una ficha de entrenamiento, en puntos de atributo por temporada. */
export const TRAINING_PER_TOKEN = 1.15;

/** Lo que crece un pibe por temporada sin entrenar nada, solo por jugar. */
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
 * `trainingTokens` son las fichas de ⏳ que pusiste en entrenar. `bodyDamage`
 * frena el crecimiento y acelera la caída: un cuerpo roto no mejora, aguanta.
 *
 * Muta al jugador —el reducer ya trabaja sobre un clon— y devuelve cuánto se
 * movió la media, que es lo que la pantalla quiere mostrar.
 */
export function ageOneSeason(
    player: CaptainPlayer,
    rng: Rng,
    trainingTokens: number,
    bodyDamage: number,
): number {
    const before = ovrOf(player);
    const family = getFamily(player.family);
    const { peak, decline } = family.age;
    const age = player.age;

    // El cuerpo castigado rinde menos: de 0 a 100 de desgaste, hasta un 40%
    // menos de crecimiento.
    const bodyFactor = 1 - Math.min(0.4, bodyDamage / 250);

    let delta: number;
    if (age < peak[0]) {
        // Etapa de crecimiento. Cuanto más lejos del techo, más rápido se sube:
        // la brecha se cierra, no se salta. Y se corrige por lo corta que sea la
        // ventana del puesto, para que todos tengan la misma chance de llegar.
        const ventana = Math.max(1, peak[0] - 18);
        const ritmo = REFERENCE_GROWTH_WINDOW / ventana;
        const gap = Math.max(0, player.potential - before);
        const pull = Math.min(1, gap / 18);
        delta = (BASE_GROWTH + trainingTokens * TRAINING_PER_TOKEN) * pull * bodyFactor * ritmo;
    } else if (age <= peak[1]) {
        // La meseta. Entrenar todavía sirve, pero poco: acá ya sos lo que sos.
        const gap = Math.max(0, player.potential - before);
        delta = Math.min(gap, trainingTokens * TRAINING_PER_TOKEN * 0.45 * bodyFactor);
    } else if (age < decline) {
        delta = 0;
    } else {
        // La caída. Entrenar la amortigua, no la evita.
        const raw = DECLINE_PER_SEASON[player.family] ?? 1.5;
        const amortiguado = raw - trainingTokens * 0.18;
        delta = -Math.max(0.3, amortiguado) * (1 + Math.min(0.5, bodyDamage / 200));
    }

    // Un poco de ruido para que dos temporadas iguales no se sientan iguales.
    delta += rng.float(-0.35, 0.35);

    // EL TECHO ES EL TECHO. Se recorta después del ruido y no antes, porque si
    // no el ruido es justamente el que lo pasa. Es un invariante medido: ninguna
    // temporada puede dejar la media por encima del potencial.
    if (delta > 0) delta = Math.min(delta, Math.max(0, player.potential - before));

    // El movimiento se reparte entre los cuatro atributos de la familia, con el
    // más pesado llevándose la mayor parte: un wing gana velocidad antes que
    // liderazgo. Se recorre `family.attributes`, que es orden declarado.
    const totalWeight = family.weights.reduce((a, w) => a + w, 0);
    for (let i = 0; i < family.attributes.length; i += 1) {
        const key = family.attributes[i];
        const share = (family.weights[i] / totalWeight) * family.attributes.length;
        player.attrs[key] = clampAttr(player.attrs[key] + delta * share);
    }

    // El aguante no entra en la media pero también envejece, y más temprano.
    if (age >= peak[1]) player.attrs.aguante = clampAttr(player.attrs.aguante - 1);

    player.ovr = ovrOf(player);
    return player.ovr - before;
}
