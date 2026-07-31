import type { Attributes, Position, PositionGroup } from '../types/player.ts';

// Perfil estadístico: tasas esperadas POR PARTIDO. statistics.ts las escala por
// OVR efectivo y rol, y muestrea con distribución normal. Esto es lo que hace
// que un wing y un pilar produzcan planillas radicalmente distintas.
export interface StatProfile {
    tries: number;
    tackles: number;
    metres: number;
    assists: number;
    lineBreaks: number;
    turnovers: number;
    lineoutsWon: number;
    metresKicked: number;
    /** Scrums ganados por partido. Es cosa del pack: los backs van en 0. */
    scrumsWon: number;
    goalKicker: boolean; // patea a los palos
    kicksAtGoal: number; // intentos por partido (0 si no patea)
}

export interface PositionDef {
    id: Position;
    labelEs: string;
    group: PositionGroup;
    numbers: number[]; // números de camiseta típicos
    weights: Attributes; // pesos de OVR (suman 100)
    base: Attributes; // plantilla inicial (prospecto ~18)
    retirement: { soft: number; hard: number };
    stats: StatProfile;
    /**
     * ESCASEZ DEL PUESTO, en puntos de OVR que el seleccionador te perdona.
     *
     * Es de las cosas más ciertas del rugby y no tiene equivalente en el fútbol:
     * un pilar derecho de 74 va convocado y un wing de 74 no, porque hay quince
     * wings que valen 74 y hay tres pilares derechos en todo el país. Los puestos
     * que se aprenden con años —y donde una lesión deja a la unión sin nadie— son
     * hooker, pilar derecho y segunda línea.
     *
     * Vive acá y no en `engine/national-team.ts` a propósito: es una propiedad
     * del puesto, no una regla de la convocatoria. Se lee con
     * `positionScarcity()`.
     */
    scarcity: number;
    /**
     * Dorsales que cobran la escasez. Si no viene, la cobra todo el puesto.
     *
     * Existe por el pilar: el motor modela `prop` como un solo puesto, pero el
     * escaso es el DERECHO (3), no el izquierdo (1). El número ya está en el
     * estado y lo elige el jugador, así que la distinción se puede hacer sin
     * partir la posición en dos ni meter un `if` en el motor.
     */
    scarcityNumbers?: number[];
}

// Tabla de pesos EXACTA del spec (cada fila suma 100).
export const POSITIONS: Record<Position, PositionDef> = {
    prop: {
        id: 'prop',
        labelEs: 'Pilar',
        group: 'forward',
        numbers: [1, 3],
        weights: { power: 30, speed: 5, technique: 10, tackle: 15, kick: 0, vision: 5, mental: 10, stamina: 25 },
        base: { power: 66, speed: 36, technique: 46, tackle: 58, kick: 16, vision: 44, mental: 50, stamina: 62 },
        retirement: { soft: 34, hard: 39 },
        stats: { tries: 0.05, tackles: 9, metres: 12, assists: 0.05, lineBreaks: 0.08, turnovers: 0.4, lineoutsWon: 0, metresKicked: 0, scrumsWon: 7.0, goalKicker: false, kicksAtGoal: 0 },
        scarcity: 2,
        scarcityNumbers: [3], // el escaso es el pilar DERECHO, no el izquierdo
    },
    hooker: {
        id: 'hooker',
        labelEs: 'Hooker',
        group: 'forward',
        numbers: [2],
        weights: { power: 20, speed: 5, technique: 20, tackle: 15, kick: 0, vision: 10, mental: 10, stamina: 20 },
        base: { power: 60, speed: 42, technique: 56, tackle: 56, kick: 18, vision: 50, mental: 52, stamina: 58 },
        retirement: { soft: 34, hard: 38 },
        stats: { tries: 0.10, tackles: 10, metres: 14, assists: 0.06, lineBreaks: 0.10, turnovers: 0.6, lineoutsWon: 3.0, metresKicked: 0, scrumsWon: 6.5, goalKicker: false, kicksAtGoal: 0 },
        scarcity: 2,
    },
    lock: {
        id: 'lock',
        labelEs: 'Segunda línea',
        group: 'forward',
        numbers: [4, 5],
        weights: { power: 25, speed: 5, technique: 10, tackle: 20, kick: 0, vision: 10, mental: 10, stamina: 20 },
        base: { power: 64, speed: 40, technique: 46, tackle: 60, kick: 14, vision: 48, mental: 50, stamina: 60 },
        retirement: { soft: 34, hard: 38 },
        stats: { tries: 0.07, tackles: 11, metres: 16, assists: 0.05, lineBreaks: 0.10, turnovers: 0.5, lineoutsWon: 4.5, metresKicked: 0, scrumsWon: 5.5, goalKicker: false, kicksAtGoal: 0 },
        scarcity: 2,
    },
    backrow: {
        id: 'backrow',
        labelEs: 'Tercera línea',
        group: 'forward',
        numbers: [6, 7, 8],
        weights: { power: 20, speed: 15, technique: 10, tackle: 25, kick: 0, vision: 10, mental: 10, stamina: 10 },
        base: { power: 62, speed: 52, technique: 50, tackle: 64, kick: 16, vision: 52, mental: 54, stamina: 56 },
        retirement: { soft: 33, hard: 37 },
        stats: { tries: 0.18, tackles: 15, metres: 30, assists: 0.12, lineBreaks: 0.25, turnovers: 1.1, lineoutsWon: 1.4, metresKicked: 0, scrumsWon: 4.0, goalKicker: false, kicksAtGoal: 0 },
        scarcity: 0,
    },
    scrumhalf: {
        id: 'scrumhalf',
        labelEs: 'Medio scrum',
        group: 'back',
        numbers: [9],
        weights: { power: 5, speed: 20, technique: 25, tackle: 10, kick: 10, vision: 20, mental: 5, stamina: 5 },
        base: { power: 40, speed: 62, technique: 62, tackle: 48, kick: 52, vision: 62, mental: 52, stamina: 54 },
        retirement: { soft: 32, hard: 36 },
        stats: { tries: 0.20, tackles: 6, metres: 18, assists: 0.45, lineBreaks: 0.30, turnovers: 0.2, lineoutsWon: 0, metresKicked: 70, scrumsWon: 0, goalKicker: false, kicksAtGoal: 0 },
        scarcity: 0,
    },
    flyhalf: {
        id: 'flyhalf',
        labelEs: 'Apertura',
        group: 'back',
        numbers: [10],
        weights: { power: 5, speed: 10, technique: 20, tackle: 5, kick: 25, vision: 20, mental: 10, stamina: 5 },
        base: { power: 40, speed: 54, technique: 62, tackle: 44, kick: 66, vision: 62, mental: 56, stamina: 50 },
        retirement: { soft: 33, hard: 37 },
        stats: { tries: 0.15, tackles: 7, metres: 22, assists: 0.50, lineBreaks: 0.30, turnovers: 0.2, lineoutsWon: 0, metresKicked: 150, scrumsWon: 0, goalKicker: true, kicksAtGoal: 3.2 },
        scarcity: 0,
    },
    centre: {
        id: 'centre',
        labelEs: 'Centro',
        group: 'back',
        numbers: [12, 13],
        weights: { power: 20, speed: 15, technique: 20, tackle: 20, kick: 5, vision: 10, mental: 5, stamina: 5 },
        base: { power: 56, speed: 60, technique: 58, tackle: 58, kick: 40, vision: 54, mental: 50, stamina: 52 },
        retirement: { soft: 33, hard: 37 },
        stats: { tries: 0.30, tackles: 12, metres: 45, assists: 0.30, lineBreaks: 0.45, turnovers: 0.3, lineoutsWon: 0, metresKicked: 25, scrumsWon: 0, goalKicker: false, kicksAtGoal: 0 },
        scarcity: 0,
    },
    wing: {
        id: 'wing',
        labelEs: 'Wing',
        group: 'back',
        numbers: [11, 14],
        weights: { power: 5, speed: 30, technique: 20, tackle: 10, kick: 10, vision: 10, mental: 5, stamina: 10 },
        base: { power: 44, speed: 70, technique: 58, tackle: 48, kick: 44, vision: 52, mental: 48, stamina: 54 },
        retirement: { soft: 31, hard: 35 },
        stats: { tries: 0.42, tackles: 6, metres: 55, assists: 0.20, lineBreaks: 0.60, turnovers: 0.2, lineoutsWon: 0, metresKicked: 20, scrumsWon: 0, goalKicker: false, kicksAtGoal: 0 },
        scarcity: 0,
    },
    fullback: {
        id: 'fullback',
        labelEs: 'Fullback',
        group: 'back',
        numbers: [15],
        weights: { power: 5, speed: 25, technique: 15, tackle: 10, kick: 20, vision: 15, mental: 5, stamina: 5 },
        base: { power: 46, speed: 64, technique: 56, tackle: 50, kick: 60, vision: 58, mental: 50, stamina: 52 },
        retirement: { soft: 32, hard: 36 },
        stats: { tries: 0.34, tackles: 7, metres: 60, assists: 0.35, lineBreaks: 0.55, turnovers: 0.25, lineoutsWon: 0, metresKicked: 130, scrumsWon: 0, goalKicker: true, kicksAtGoal: 2.0 },
        scarcity: 0,
    },
};

export const ALL_POSITIONS: Position[] = Object.keys(POSITIONS) as Position[];

export function getPosition(id: Position): PositionDef {
    return POSITIONS[id];
}

export function positionGroup(id: Position): PositionGroup {
    return POSITIONS[id].group;
}

/**
 * Puntos que la escasez del puesto le perdona al jugador en la convocatoria.
 *
 * El dorsal importa: `prop` cobra la escasez sólo con la 3 (pilar derecho). Un
 * puesto sin `scarcityNumbers` la cobra con cualquier número.
 */
export function positionScarcity(id: Position, number: number): number {
    const pos = POSITIONS[id];
    if (pos.scarcityNumbers && !pos.scarcityNumbers.includes(number)) return 0;
    return pos.scarcity;
}

// Verificación defensiva: los pesos deben sumar 100 (se usa en tests).
export function weightsSum(id: Position): number {
    const w = POSITIONS[id].weights;
    return w.power + w.speed + w.technique + w.tackle + w.kick + w.vision + w.mental + w.stamina;
}
