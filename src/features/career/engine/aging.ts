import type { AttributeKey, Attributes, PlayerRole, Position, PositionGroup } from '../types/player.ts';
import type { Rng } from './random.ts';
import { clampAttr } from './scoring.ts';

const START_AGE = 18;

// Edad de pico por atributo y grupo. Forwards sostienen potencia/resistencia
// hasta 30-31; los backs pican en velocidad a los 25-26. Visión y mental tienen
// pico "40" => crecen prácticamente hasta el retiro.
const PEAKS: Record<AttributeKey, Record<PositionGroup, number>> = {
    power: { forward: 30, back: 27 },
    stamina: { forward: 31, back: 28 },
    speed: { forward: 26, back: 25 },
    technique: { forward: 28, back: 28 },
    tackle: { forward: 30, back: 28 },
    kick: { forward: 29, back: 30 },
    vision: { forward: 40, back: 40 },
    mental: { forward: 40, back: 40 },
};

const GROW: Record<AttributeKey, number> = {
    power: 2.2,
    stamina: 2.0,
    speed: 2.6,
    technique: 2.0,
    tackle: 2.0,
    kick: 1.8,
    vision: 1.6,
    mental: 1.8,
};

const DECLINE: Record<AttributeKey, number> = {
    power: 1.6,
    stamina: 1.4,
    speed: 2.2,
    technique: 0.8,
    tackle: 1.4,
    kick: 0.7,
    vision: 0.2,
    mental: 0.1,
};

const ATTR_KEYS = Object.keys(GROW) as AttributeKey[];

/** Edad de pico de un atributo para un grupo (expuesto para la UI de guías). */
export function attributePeakAge(key: AttributeKey, group: PositionGroup): number {
    return PEAKS[key][group];
}

function clamp(value: number, lo: number, hi: number): number {
    return Math.max(lo, Math.min(hi, value));
}

/**
 * Empuje que se mantiene MIENTRAS el jugador esté por debajo de su techo.
 *
 * Antes de 1.9.0 el crecimiento era `(potential - ovr)/12` a secas: una
 * asíntota. El pico se asienta donde el crecimiento iguala al declive, y con esa
 * forma eso ocurre SIEMPRE bastante por debajo del objetivo — sobre 1080
 * carreras la brecha mediana era 12 y solo 9 de 1080 llegaban a 3 o menos. El
 * potencial era inalcanzable por construcción.
 *
 * La primera corrección fue correr el objetivo interno hacia arriba una
 * distancia fija por puesto. No sirve: `environmentSupport` multiplica la
 * escala, así que la distancia de equilibrio NO es constante — un profesional
 * en un club con buena estructura se estabiliza más arriba que un amateur. Con
 * un corrimiento fijo calibrado a la mediana, un tercio de las carreras
 * terminaba PASÁNDOSE del techo declarado.
 *
 * Lo que sí funciona es cambiar la forma: empuje sostenido mientras falte
 * recorrido y CERO al llegar. Así el techo se alcanza (el empuje le gana al
 * declive incipiente) y además se respeta (no hay crecimiento por encima).
 */
const CEILING_PUSH = 0.85;

/**
 * Escala de crecimiento según lo lejos que esté el TECHO del jugador. Es lo que
 * permite que un juvenil de OVR 38 llegue a nivel profesional: cuanto mayor es
 * el margen al potencial, más rápido mejora.
 *
 * `potential` es el techo REAL alcanzable, no un objetivo interno inflado.
 *
 * Sin `position` conserva la forma vieja (asintótica, sin empuje): la usan los
 * tests de progresión que miden la curva desnuda.
 */
export function growthScaleFor(ovr: number, potential: number, position?: Position): number {
    const gap = potential - ovr;
    if (gap <= 0) return 0; // el techo es un techo: no se crece por encima
    const push = position === undefined ? 0 : CEILING_PUSH;
    return clamp(gap / 12 + push, 0, 2.8);
}

/**
 * Cuánto empuja el RENDIMIENTO al desarrollo. Hasta 1.9.0 la progresión no
 * miraba nada de lo que el jugador hacía en la cancha: un titular con gran
 * rating crecía exactamente igual que un suplente del mismo OVR, edad y techo.
 *
 * Se mira la temporada ANTERIOR, no la actual, por dos razones: el
 * envejecimiento se aplica ANTES de simular la temporada (no hay rating todavía)
 * y además es lo más fiel al deporte — venías de un gran año y das el salto.
 */
export function meritDrive(previous: { rating: number; role: PlayerRole } | undefined): number {
    if (previous === undefined) return 1; // debut: no hay nada que premiar ni castigar
    // 6.6 es el rating de una temporada correcta: por encima empuja, por debajo frena.
    const byRating = clamp(1 + (previous.rating - 6.6) * 0.13, 0.82, 1.22);
    const byRole = previous.role === 'starter' ? 1.06 : previous.role === 'rotation' ? 1 : 0.93;
    return clamp(byRating * byRole, 0.8, 1.26);
}

/** Cambio de un atributo para una temporada, dado edad y grupo. */
export function attributeDelta(
    key: AttributeKey,
    age: number,
    group: PositionGroup,
    rng: Rng,
    growthScale = 1,
): number {
    const peak = PEAKS[key][group];
    const noise = rng.float(-0.4, 0.4);

    if (age < peak) {
        // Crecimiento: más rápido de joven, se frena cerca del pico y del techo.
        // El piso subió de 0.25 a 0.45 en 1.9.0: con 0.25 el crecimiento moría
        // varios años ANTES del pico y quedaba empatado con el declive incipiente,
        // y la carrera pasaba hasta ocho temporadas clavada en el mismo OVR.
        const taper = clamp((peak - age) / (peak - START_AGE), 0.45, 1);
        return GROW[key] * taper * growthScale + noise;
    }

    // Declive: se acelera con la edad. Los backs pierden VELOCIDAD más fuerte
    // pasados los 30 (regla explícita del spec).
    // La rampa se acortó de 6 a 4.5 en 1.9.0 por lo mismo: la curva tiene que
    // ATRAVESAR el pico, no sentarse encima. Medido sobre 1080 carreras, la
    // racha plana más larga bajó de 4 a 3 temporadas en los nueve puestos y las
    // rachas de 5+ se redujeron a la mitad.
    let severity = clamp((age - peak) / 4.5, 0.3, 2.2);
    if (key === 'speed' && group === 'back' && age > 30) severity *= 1.5;
    return -DECLINE[key] * severity + noise;
}

/** Aplica el envejecimiento de una temporada. Devuelve los deltas aplicados. */
export function applyAging(
    attributes: Attributes,
    age: number,
    group: PositionGroup,
    rng: Rng,
    growthScale = 1,
): Partial<Record<AttributeKey, number>> {
    const deltas: Partial<Record<AttributeKey, number>> = {};
    for (const key of ATTR_KEYS) {
        const before = attributes[key];
        const delta = attributeDelta(key, age, group, rng, growthScale);
        const after = clampAttr(before + delta);
        attributes[key] = after;
        // El `+ 0` normaliza el -0 que devuelve Math.round con negativos chicos
        // (Math.round(-0.2) === -0). Aritméticamente da igual, pero -0 se muestra
        // como "-0" y sobrevive a structuredClone mientras JSON lo colapsa a 0:
        // sin esto, una partida recargada no es byte-idéntica a la original.
        deltas[key] = Math.round((after - before) * 10) / 10 + 0;
    }
    return deltas;
}
