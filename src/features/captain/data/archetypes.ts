import type { CaptainAttributeKey, CaptainAttributes, PositionFamilyId } from '../types/player.ts';
import { ATTRIBUTE_FLOOR, getFamily } from './positions.ts';

/**
 * EL ARQUETIPO: QUÉ CLASE DE JUGADOR SOS DENTRO DE TU PUESTO.
 *
 * El puesto dice qué cuatro atributos cuentan para la media; el arquetipo dice
 * cómo los repartís. Un apertura pateador y un apertura cerebro tienen la misma
 * media el día uno y no son el mismo jugador: el primero suma con los palos, el
 * segundo con lo que ve. Desde ahí la carta de pretemporada, los Momentos y la
 * planilla los separan solos, porque todos leen esos atributos.
 *
 * ── POR QUÉ ES UN TRASPASO Y NO UN BONO ──────────────────────────────────────
 * Un bono (+5 acá, +4 allá) sube la media de TODOS los que juegan desde la
 * pantalla, y la pirámide de `calibration.test.ts` se mide sin arquetipo: el
 * juego real quedaría calibrado para otro jugador. El traspaso saca de un
 * atributo lo que pone en otro, en la proporción de sus PESOS en la media, así
 * que la media de arranque casi no se mueve (±1 por redondeo y tope). Lo que
 * cambia es la forma, que es exactamente lo que el arquetipo dice ser.
 *
 * No consume azar: se aplica después del sorteo de los atributos, sobre lo que
 * salió, y la misma semilla sigue jugando la misma carrera salvo por esa forma.
 *
 * DATO, NO CÓDIGO: tres por familia, en orden de lectura (I, II, III). Se pide
 * por `id`, nunca por posición (§1.5 del CLAUDE de captain).
 */
export interface Archetype {
    id: string;
    family: PositionFamilyId;
    label: string;
    /** Una línea: qué hacés bien y qué resignás. */
    text: string;
    /** El atributo que sube. Tiene que ser uno de los cuatro del puesto. */
    plus: CaptainAttributeKey;
    /** El que paga. También de los cuatro, para que el traspaso sea neutro. */
    minus: CaptainAttributeKey;
}

/** Lo que sube el atributo fuerte. PARÁMETRO LIBRE: visible sin ser un salto. */
export const ARCHETYPE_SHIFT = 6;
/** Tope de lo que paga el otro, para que un peso chico no lo hunda al piso. PARÁMETRO LIBRE. */
export const ARCHETYPE_MAX_COST = 12;

export const ARCHETYPES: readonly Archetype[] = [
    { id: 'pl-scrum', family: 'primera-linea', label: 'El del scrum', text: 'El scrum es tuyo. Con la pelota en la mano, menos.', plus: 'empuje', minus: 'manos' },
    { id: 'pl-moderno', family: 'primera-linea', label: 'El pilar moderno', text: 'Descargás como un tercera. En el scrum se nota.', plus: 'manos', minus: 'empuje' },
    { id: 'pl-arenga', family: 'primera-linea', label: 'El que arenga', text: 'La delantera te sigue. Chocás menos que los otros.', plus: 'liderazgo', minus: 'choque' },

    { id: 'hk-line', family: 'hooker', label: 'El del line', text: 'Tu lanzamiento no falla. En el contacto sos uno más.', plus: 'lanzamiento', minus: 'choque' },
    { id: 'hk-maul', family: 'hooker', label: 'El del maul', text: 'Empujás como un pilar. El line lo sufrís.', plus: 'empuje', minus: 'lanzamiento' },
    { id: 'hk-voz', family: 'hooker', label: 'La voz de la delantera', text: 'Ordenás el pack. Empujás un poco menos.', plus: 'liderazgo', minus: 'empuje' },

    { id: 'sl-saltador', family: 'segunda-linea', label: 'El saltador', text: 'El line es tuyo. En los rucks se te ve poco.', plus: 'salto', minus: 'trabajo' },
    { id: 'sl-obrero', family: 'segunda-linea', label: 'El obrero', text: 'Ruck, maul, tackle, otra vez. En el aire, menos.', plus: 'trabajo', minus: 'salto' },
    { id: 'sl-cinta', family: 'segunda-linea', label: 'El de la cinta', text: 'Hablás y te escuchan. El contacto no es lo tuyo.', plus: 'liderazgo', minus: 'choque' },

    { id: 'tl-cazador', family: 'tercera-linea', label: 'El cazador', text: 'Llegás primero al ruck y te la quedás. Cargás poco.', plus: 'robo', minus: 'choque' },
    { id: 'tl-tackleador', family: 'tercera-linea', label: 'El tackleador', text: 'Veinte tackles por partido. Robás menos.', plus: 'tackle', minus: 'robo' },
    { id: 'tl-carga', family: 'tercera-linea', label: 'El que carga', text: 'Cada pelota que agarrás gana la línea. Tackleás menos.', plus: 'choque', minus: 'tackle' },

    { id: 'ms-rapido', family: 'medio-scrum', label: 'El rápido de la base', text: 'Sacás antes que nadie. El pie es tu deuda.', plus: 'salida', minus: 'patada' },
    { id: 'ms-pateador', family: 'medio-scrum', label: 'El que patea', text: 'El box kick cae donde querés. Sacás más lento.', plus: 'patada', minus: 'salida' },
    { id: 'ms-director', family: 'medio-scrum', label: 'El director', text: 'Ves el partido antes que pase. Pateás menos.', plus: 'vision', minus: 'patada' },

    { id: 'ap-pateador', family: 'apertura', label: 'El pateador', text: 'Palos de cualquier lado. Leés menos el juego.', plus: 'pegada', minus: 'vision' },
    { id: 'ap-cerebro', family: 'apertura', label: 'El cerebro', text: 'Ves pases que nadie ve. A los palos, de a poco.', plus: 'vision', minus: 'pegada' },
    { id: 'ap-defensor', family: 'apertura', label: 'El apertura que tacklea', text: 'Nadie entra por tu canal. Pateás menos.', plus: 'tackle', minus: 'pegada' },

    { id: 'ce-quiebre', family: 'centro', label: 'El que rompe', text: 'Encontrás el hueco. Defendés de memoria, no de oficio.', plus: 'quiebre', minus: 'defensa' },
    { id: 'ce-muro', family: 'centro', label: 'El muro', text: 'Por tu lado no pasa nadie. Rompés poco.', plus: 'defensa', minus: 'quiebre' },
    { id: 'ce-choque', family: 'centro', label: 'El que choca', text: 'Cada pelota gana un metro. El hueco lo buscan otros.', plus: 'choque', minus: 'quiebre' },

    { id: 'wf-velocista', family: 'wing-fullback', label: 'El velocista', text: 'Nadie te alcanza. La pelota alta te cuesta.', plus: 'velocidad', minus: 'juegoAereo' },
    { id: 'wf-gambeta', family: 'wing-fullback', label: 'El gambeteador', text: 'Uno contra uno, siempre. Un poco menos de pique.', plus: 'gambeta', minus: 'velocidad' },
    { id: 'wf-ultimo', family: 'wing-fullback', label: 'El último hombre', text: 'Las pelotas altas son tuyas. Gambeteás poco.', plus: 'juegoAereo', minus: 'gambeta' },
];

/** El prefijo de la bandera del arquetipo en `player.flags`. Igual que el objetivo. */
export const ARCHETYPE_FLAG_PREFIX = 'arquetipo-';

export function archetypesFor(family: PositionFamilyId): Archetype[] {
    return ARCHETYPES.filter((a) => a.family === family);
}

export function getArchetype(id: string): Archetype | null {
    return ARCHETYPES.find((a) => a.id === id) ?? null;
}

/** El arquetipo de una carrera, leído de su bandera. `null` en las que no eligieron. */
export function archetypeOfFlags(flags: Record<string, number>): Archetype | null {
    return ARCHETYPES.find((a) => (flags[`${ARCHETYPE_FLAG_PREFIX}${a.id}`] ?? 0) > 0) ?? null;
}

/**
 * Lo que mueve un arquetipo: el atributo fuerte sube `ARCHETYPE_SHIFT` y el que
 * paga baja lo mismo PESADO por la media —si el que sube pesa 40 y el que paga
 * 15, paga 12 (tope) en vez de 6—. DERIVADA de los pesos del puesto: si los
 * pesos cambian, el traspaso se recalcula solo.
 */
export function archetypeDelta(a: Archetype): Partial<Record<CaptainAttributeKey, number>> {
    const family = getFamily(a.family);
    const peso = (k: CaptainAttributeKey) => family.weights[family.attributes.indexOf(k)];
    const costo = Math.min(ARCHETYPE_MAX_COST, Math.round((ARCHETYPE_SHIFT * peso(a.plus)) / peso(a.minus)));
    return { [a.plus]: ARCHETYPE_SHIFT, [a.minus]: -costo };
}

/** Aplica el arquetipo sobre los atributos ya sorteados. Puro, sin azar. */
export function applyArchetype(attrs: CaptainAttributes, a: Archetype): CaptainAttributes {
    const out = { ...attrs };
    for (const [k, d] of Object.entries(archetypeDelta(a)) as [CaptainAttributeKey, number][]) {
        out[k] = Math.max(ATTRIBUTE_FLOOR, Math.min(99, out[k] + d));
    }
    return out;
}
