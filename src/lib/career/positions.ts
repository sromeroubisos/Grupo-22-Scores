/**
 * Definición de posiciones: pesos de OVR (tabla del diseño), metadatos y curvas
 * de edad por atributo/grupo. Los pesos de cada posición SUMAN 100 (hay un test
 * que lo verifica), así que el OVR es un promedio ponderado limpio.
 */

import type { AttributeKey, Attributes, Position, PositionGroup, SeasonStats } from './types.ts';

export const ATTRIBUTE_KEYS: AttributeKey[] = [
    'power', 'speed', 'technique', 'tackle', 'kick', 'vision', 'mental', 'stamina',
];

export const ATTRIBUTE_LABELS: Record<AttributeKey, string> = {
    power: 'Potencia',
    speed: 'Velocidad',
    technique: 'Técnica',
    tackle: 'Tackle',
    kick: 'Patada',
    vision: 'Visión',
    mental: 'Mental',
    stamina: 'Resistencia',
};

// Pesos (%) por posición: POT VEL TÉC TAC PAT VIS MEN RES
export const POSITION_WEIGHTS: Record<Position, Attributes> = {
    prop: { power: 30, speed: 5, technique: 10, tackle: 15, kick: 0, vision: 5, mental: 10, stamina: 25 },
    hooker: { power: 20, speed: 5, technique: 20, tackle: 15, kick: 0, vision: 10, mental: 10, stamina: 20 },
    lock: { power: 25, speed: 5, technique: 10, tackle: 20, kick: 0, vision: 10, mental: 10, stamina: 20 },
    flanker: { power: 20, speed: 15, technique: 10, tackle: 25, kick: 0, vision: 10, mental: 10, stamina: 10 },
    scrumhalf: { power: 5, speed: 20, technique: 25, tackle: 10, kick: 10, vision: 20, mental: 5, stamina: 5 },
    flyhalf: { power: 5, speed: 10, technique: 20, tackle: 5, kick: 25, vision: 20, mental: 10, stamina: 5 },
    centre: { power: 20, speed: 15, technique: 20, tackle: 20, kick: 5, vision: 10, mental: 5, stamina: 5 },
    wing: { power: 5, speed: 30, technique: 20, tackle: 10, kick: 10, vision: 10, mental: 5, stamina: 10 },
    fullback: { power: 5, speed: 25, technique: 15, tackle: 10, kick: 20, vision: 15, mental: 5, stamina: 5 },
};

export interface PositionMeta {
    labelEs: string;
    short: string;
    group: PositionGroup;
    retireAge: number;                 // edad típica desde la que empieza a evaluarse el retiro
    tryFactor: number;                 // propensión a anotar tries (0-1)
    primaryStats: (keyof SeasonStats)[];
}

export const POSITION_META: Record<Position, PositionMeta> = {
    prop: { labelEs: 'Pilar', short: 'PIL', group: 'forward', retireAge: 38, tryFactor: 0.05, primaryStats: ['tackles', 'lineoutsWon'] },
    hooker: { labelEs: 'Hooker', short: 'HOO', group: 'forward', retireAge: 37, tryFactor: 0.10, primaryStats: ['lineoutsWon', 'tackles'] },
    lock: { labelEs: 'Segunda línea', short: '2L', group: 'forward', retireAge: 37, tryFactor: 0.08, primaryStats: ['lineoutsWon', 'tackles'] },
    flanker: { labelEs: 'Tercera línea', short: '3L', group: 'forward', retireAge: 35, tryFactor: 0.15, primaryStats: ['tackles', 'turnovers'] },
    scrumhalf: { labelEs: 'Medio scrum', short: 'MS', group: 'back', retireAge: 33, tryFactor: 0.20, primaryStats: ['tries', 'metres'] },
    flyhalf: { labelEs: 'Apertura', short: 'AP', group: 'back', retireAge: 35, tryFactor: 0.15, primaryStats: ['points', 'metres'] },
    centre: { labelEs: 'Centro', short: 'CEN', group: 'back', retireAge: 34, tryFactor: 0.30, primaryStats: ['tries', 'tackles'] },
    wing: { labelEs: 'Wing', short: 'WIN', group: 'back', retireAge: 32, tryFactor: 0.55, primaryStats: ['tries', 'metres'] },
    fullback: { labelEs: 'Fullback', short: 'FB', group: 'back', retireAge: 34, tryFactor: 0.35, primaryStats: ['tries', 'points'] },
};

export const POSITIONS: Position[] = [
    'prop', 'hooker', 'lock', 'flanker', 'scrumhalf', 'flyhalf', 'centre', 'wing', 'fullback',
];

export function positionGroup(position: Position): PositionGroup {
    return POSITION_META[position].group;
}

// ===== Curvas de edad =====
export interface AttrCurve {
    peak: number;      // edad de pico
    growth: number;    // ritmo de crecimiento antes del pico
    decline: number;   // ritmo de caída después del pico
}

const BASE_CURVE: Record<AttributeKey, AttrCurve> = {
    power: { peak: 29, growth: 1.2, decline: 0.7 },
    speed: { peak: 25, growth: 1.3, decline: 1.2 },
    technique: { peak: 30, growth: 1.0, decline: 0.4 },
    tackle: { peak: 29, growth: 1.1, decline: 0.6 },
    kick: { peak: 31, growth: 0.9, decline: 0.4 },
    vision: { peak: 34, growth: 1.0, decline: 0.3 },
    mental: { peak: 36, growth: 1.1, decline: 0.15 },
    stamina: { peak: 28, growth: 1.1, decline: 0.8 },
};

/**
 * Curva efectiva de un atributo según el grupo. Los forwards sostienen potencia
 * y resistencia hasta más tarde; los backs alcanzan la velocidad antes y la
 * pierden con más fuerza pasados los 30. Así un pilar y un wing no recorren la
 * misma carrera cambiando sólo las estadísticas.
 */
export function attributeCurve(attr: AttributeKey, group: PositionGroup): AttrCurve {
    const b = BASE_CURVE[attr];
    if (group === 'forward') {
        if (attr === 'power' || attr === 'stamina') {
            return { peak: b.peak + 2, growth: b.growth + 0.2, decline: b.decline - 0.2 };
        }
        if (attr === 'speed') {
            return { peak: b.peak + 1, growth: b.growth - 0.5, decline: b.decline - 0.2 };
        }
        return b;
    }
    // backs
    if (attr === 'speed') {
        return { peak: b.peak, growth: b.growth + 0.1, decline: b.decline + 0.4 };
    }
    if (attr === 'power') {
        return { peak: b.peak - 2, growth: b.growth - 0.2, decline: b.decline + 0.1 };
    }
    return b;
}
