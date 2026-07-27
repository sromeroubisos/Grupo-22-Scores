import type { AttributeKey, Attributes, PositionGroup } from '../types/player.ts';
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
 * Escala de crecimiento según lo lejos que esté el TECHO del jugador. Es lo que
 * permite que un juvenil de OVR 38 llegue a nivel profesional: cuanto mayor es
 * el margen al potencial, más rápido mejora; pegado al techo, se aplana.
 * 1 = ritmo de referencia (se usa como default en llamadas sin potencial).
 */
export function growthScaleFor(ovr: number, potential: number): number {
    return clamp((potential - ovr) / 12, 0, 2.8);
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
        const taper = clamp((peak - age) / (peak - START_AGE), 0.25, 1);
        return GROW[key] * taper * growthScale + noise;
    }

    // Declive: se acelera con la edad. Los backs pierden VELOCIDAD más fuerte
    // pasados los 30 (regla explícita del spec).
    let severity = clamp((age - peak) / 6, 0.3, 2.2);
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
