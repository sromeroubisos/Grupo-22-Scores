// EL CAPITÁN — las ocho familias de puesto.
//
// Este es el catálogo PROPIO del juego. No reusa `career/data/positions.ts`
// aunque los dos hablen de rugby: aquel modela nueve puestos sobre ocho
// atributos en inglés (`power/speed/technique`) que son del motor de Carrera de
// Rugby. Acá el modelo es otro —cuatro atributos por familia, con `liderazgo`
// siempre entre ellos y `aguante` siempre afuera de la media— y mezclarlos
// dejaría a los dos juegos atados a la misma calibración.
//
// ── El problema del pilar ──
// El desafío de diseño más difícil de este juego, y el que no tiene equivalente
// en fútbol: en el Mundial 2019 pilares y segundas líneas juntos aportaron
// entre el 2 y el 3% de los tries, y los wings solos anotaron el 29%. Si la
// gloria se mide en tries, la mitad del equipo es injugable.
//
// La respuesta vive acá: CADA FAMILIA TIENE SU PROPIO GOL. El pilar acumula
// penales de scrum ganados, el 7 turnovers, la segunda línea robos en line-out.
// La crónica y el palmarés los tratan con el mismo peso visual que los tries —
// si no, el catálogo miente y el jugador se da cuenta en la segunda temporada.
//
// ── Qué congela este archivo y qué no ──
// Congela la FORMA y las INVARIANTES: cuatro atributos distintos por familia,
// `liderazgo` en las ocho, `aguante` en ninguna, pesos que suman 100, los
// dorsales 1..15 cubiertos exactamente una vez, y una curva de edad coherente.
// Todo eso lo verifica `positions.test.ts`.
//
// NO congela la calibración fina. Los `base` y los `weights` son un punto de
// partida razonable; los números se ajustan cuando haya simulación que los
// mueva y algo que medir. Tocar un número acá sube CAPTAIN_POSITIONS_VERSION.

import type {
    CaptainAttributeKey,
    CaptainAttributes,
    PositionFamilyId,
    PositionGroup,
} from '../types/player.ts';

/**
 * Versión del catálogo de puestos. Se sella en el guardado: cambiar un peso o
 * una curva invalida una partida en curso igual que un cambio de reglas.
 */
export const CAPTAIN_POSITIONS_VERSION = '2026-07.3';

/**
 * Las diecinueve claves, en ORDEN CANÓNICO. Se itera por acá y nunca por
 * `Object.keys(attrs)` (CLAUDE.md §1).
 */
export const ATTRIBUTE_KEYS: readonly CaptainAttributeKey[] = [
    'empuje',
    'choque',
    'manos',
    'lanzamiento',
    'salto',
    'trabajo',
    'tackle',
    'robo',
    'defensa',
    'salida',
    'patada',
    'pegada',
    'vision',
    'quiebre',
    'velocidad',
    'gambeta',
    'juegoAereo',
    'liderazgo',
    'aguante',
];

/**
 * Lo que vale un atributo que no es de tu familia. Un wing tiene `empuje`: lo
 * tiene bajo, no lo tiene ausente. Existe para que un cambio de puesto dentro
 * del pack no arranque de cero.
 */
export const ATTRIBUTE_FLOOR = 20;

/**
 * Cómo se acumula una métrica a lo largo de la temporada.
 *
 * `percent` NO SE SUMA: el porcentaje de line-out propio de un hooker es un
 * promedio, no un total. Todas las demás se suman partido a partido. La
 * distinción vive en el tipo y no en un `if` perdido en la planilla.
 */
export type GloryUnit = 'count' | 'metres' | 'percent' | 'points';

export interface GloryMetric {
    id: string;
    labelEs: string;
    unit: GloryUnit;
    /**
     * Lo que produce por partido un jugador de media 70 en su mejor momento.
     * Es el ancla de la calibración: `engine/statistics.ts` la escala por media
     * efectiva y la muestrea. Con `percent` no es "por partido" sino el valor
     * medio de la temporada.
     */
    perMatch: number;
}

/**
 * La curva de edad de la familia. Invariante que verifica el test:
 * `debut < peak[0] <= peak[1] < decline <= soft < hard`.
 *
 * Los rangos salen de la evidencia: el loosehead es medible y consistentemente
 * el puesto más longevo (promedio 29 años en Super Rugby) y el centro externo
 * el más joven (22–23). La carrera media dura 12,7 ± 3,6 años.
 */
export interface AgeCurve {
    /** Edad típica de asentarse en primera. */
    debut: number;
    /** La meseta: entre estas dos edades no se pierde nada. */
    peak: [number, number];
    /** Desde acá afloja. */
    decline: number;
    /** Desde acá se empieza a evaluar el retiro, temporada a temporada. */
    soft: number;
    /** Acá se termina, quiera o no. */
    hard: number;
}

export interface PositionFamily {
    id: PositionFamilyId;
    labelEs: string;
    group: PositionGroup;
    /** Dorsales de la familia. Entre las ocho cubren 1..15 exactamente una vez. */
    numbers: number[];
    /**
     * LOS CUATRO QUE CUENTAN PARA LA MEDIA. `liderazgo` va siempre último, y
     * `aguante` no está en ninguna: queda fuera por construcción.
     */
    attributes: readonly [CaptainAttributeKey, CaptainAttributeKey, CaptainAttributeKey, CaptainAttributeKey];
    /** Pesos de la media (suman 100), en el mismo orden que `attributes`. */
    weights: readonly [number, number, number, number];
    /** Plantilla del pibe de 18: los cuatro más `aguante`. El resto va al piso. */
    base: Partial<Record<CaptainAttributeKey, number>>;
    /** El gol de esta familia. `secondary` puede faltar. */
    glory: { primary: GloryMetric; secondary: GloryMetric | null };
    age: AgeCurve;
}

export const POSITION_FAMILIES: Record<PositionFamilyId, PositionFamily> = {
    'primera-linea': {
        id: 'primera-linea',
        labelEs: 'Primera línea',
        group: 'forward',
        numbers: [1, 3],
        attributes: ['empuje', 'choque', 'manos', 'liderazgo'],
        weights: [40, 30, 15, 15],
        base: { empuje: 58, choque: 56, manos: 40, liderazgo: 44, aguante: 52 },
        glory: {
            primary: { id: 'penales-scrum', labelEs: 'Penales de scrum ganados', unit: 'count', perMatch: 1.1 },
            secondary: null,
        },
        // El puesto más longevo, y el que más tarda en hacerse: un pilar de
        // primera no existe antes de los 20.
        age: { debut: 20, peak: [27, 31], decline: 32, soft: 33, hard: 36 },
    },

    hooker: {
        id: 'hooker',
        labelEs: 'Hooker',
        group: 'forward',
        numbers: [2],
        attributes: ['lanzamiento', 'empuje', 'choque', 'liderazgo'],
        weights: [35, 25, 25, 15],
        base: { lanzamiento: 52, empuje: 52, choque: 54, liderazgo: 47, aguante: 54 },
        glory: {
            // El forward con gloria de back: fue el 6º máximo anotador por puesto
            // del Mundial 2019 con 25 tries (9%), por encima de todos los
            // aperturas, octavos y centros internos. Anota de maul.
            primary: { id: 'lineout-propio', labelEs: 'Line-out propio ganado', unit: 'percent', perMatch: 88 },
            secondary: { id: 'tries-maul', labelEs: 'Tries de maul', unit: 'count', perMatch: 0.22 },
        },
        // El puesto más castigado del rugby. Se retira antes que el pilar.
        age: { debut: 20, peak: [26, 30], decline: 31, soft: 32, hard: 35 },
    },

    'segunda-linea': {
        id: 'segunda-linea',
        labelEs: 'Segunda línea',
        group: 'forward',
        numbers: [4, 5],
        attributes: ['salto', 'choque', 'trabajo', 'liderazgo'],
        weights: [35, 25, 25, 15],
        base: { salto: 56, choque: 52, trabajo: 50, liderazgo: 44, aguante: 54 },
        glory: {
            primary: { id: 'lineouts-ganados', labelEs: 'Line-outs ganados', unit: 'count', perMatch: 4.4 },
            secondary: { id: 'lineouts-robados', labelEs: 'Line-outs robados', unit: 'count', perMatch: 0.35 },
        },
        age: { debut: 19, peak: [26, 30], decline: 31, soft: 32, hard: 34 },
    },

    'tercera-linea': {
        id: 'tercera-linea',
        labelEs: 'Tercera línea',
        group: 'forward',
        numbers: [6, 7, 8],
        attributes: ['tackle', 'robo', 'choque', 'liderazgo'],
        weights: [30, 30, 25, 15],
        base: { tackle: 54, robo: 51, choque: 53, liderazgo: 46, aguante: 58 },
        glory: {
            // Referencia de calibración: Irlanda gana 8,4 turnovers por 80
            // minutos. O sea que esto pasa unas cuatro veces por equipo y partido.
            primary: { id: 'turnovers', labelEs: 'Turnovers', unit: 'count', perMatch: 1.4 },
            secondary: { id: 'metros-post-contacto', labelEs: 'Metros post-contacto', unit: 'metres', perMatch: 24 },
        },
        age: { debut: 19, peak: [25, 29], decline: 30, soft: 31, hard: 34 },
    },

    'medio-scrum': {
        id: 'medio-scrum',
        labelEs: 'Medio scrum',
        group: 'back',
        numbers: [9],
        attributes: ['salida', 'patada', 'vision', 'liderazgo'],
        weights: [35, 20, 30, 15],
        base: { salida: 56, patada: 46, vision: 52, liderazgo: 48, aguante: 56 },
        glory: {
            primary: { id: 'tries-base', labelEs: 'Tries desde la base', unit: 'count', perMatch: 0.12 },
            secondary: { id: 'kick-metres', labelEs: 'Metros de kick', unit: 'metres', perMatch: 175 },
        },
        // Aguanta tanto como un pilar: en Sudáfrica es el puesto más viejo del
        // Super Rugby.
        age: { debut: 19, peak: [26, 30], decline: 31, soft: 33, hard: 35 },
    },

    apertura: {
        id: 'apertura',
        labelEs: 'Apertura',
        group: 'back',
        numbers: [10],
        // Lidera más que nadie: es el que ordena. Por eso `liderazgo` pesa 25 y
        // no 15, y es el único puesto donde no es el peso más chico.
        attributes: ['pegada', 'vision', 'tackle', 'liderazgo'],
        weights: [30, 30, 15, 25],
        base: { pegada: 54, vision: 54, tackle: 45, liderazgo: 52, aguante: 52 },
        glory: {
            // Banda real de dificultad: la élite absoluta patea al 95,7%, lo
            // aceptable es 73–79%, la crisis es menos de 70%.
            primary: { id: 'puntos', labelEs: 'Puntos', unit: 'points', perMatch: 9.5 },
            secondary: { id: 'porcentaje-palo', labelEs: 'Porcentaje al palo', unit: 'percent', perMatch: 78 },
        },
        // El puesto con la mayor tasa de conmociones del rugby.
        age: { debut: 19, peak: [25, 29], decline: 30, soft: 32, hard: 34 },
    },

    centro: {
        id: 'centro',
        labelEs: 'Centro',
        group: 'back',
        numbers: [12, 13],
        attributes: ['choque', 'quiebre', 'defensa', 'liderazgo'],
        weights: [25, 35, 25, 15],
        base: { choque: 51, quiebre: 56, defensa: 51, liderazgo: 45, aguante: 54 },
        glory: {
            primary: { id: 'quiebres', labelEs: 'Quiebres de línea', unit: 'count', perMatch: 0.7 },
            secondary: { id: 'metros-post-contacto', labelEs: 'Metros post-contacto', unit: 'metres', perMatch: 24 },
        },
        // El centro externo es el puesto más joven del rugby: 22–23 de promedio.
        // Debuta antes que nadie y declina antes que nadie.
        age: { debut: 18, peak: [24, 28], decline: 29, soft: 30, hard: 33 },
    },

    'wing-fullback': {
        id: 'wing-fullback',
        labelEs: 'Wing y fullback',
        group: 'back',
        numbers: [11, 14, 15],
        attributes: ['velocidad', 'gambeta', 'juegoAereo', 'liderazgo'],
        weights: [35, 30, 20, 15],
        base: { velocidad: 60, gambeta: 54, juegoAereo: 44, liderazgo: 42, aguante: 52 },
        glory: {
            primary: { id: 'tries', labelEs: 'Tries', unit: 'count', perMatch: 0.45 },
            secondary: { id: 'metros', labelEs: 'Metros ganados', unit: 'metres', perMatch: 72 },
        },
        // Declive temprano y abrupto: cuando se va la velocidad no queda nada
        // atrás. Es el reverso del pilar.
        age: { debut: 18, peak: [24, 28], decline: 29, soft: 30, hard: 32 },
    },
};

/**
 * ORDEN CANÓNICO de las familias: el pack de adelante hacia atrás y después la
 * línea de tres cuartos, como se lista un equipo. Se itera por acá y nunca por
 * `Object.keys(POSITION_FAMILIES)`.
 */
export const ALL_FAMILIES: readonly PositionFamilyId[] = [
    'primera-linea',
    'hooker',
    'segunda-linea',
    'tercera-linea',
    'medio-scrum',
    'apertura',
    'centro',
    'wing-fullback',
];

export function getFamily(id: PositionFamilyId): PositionFamily {
    return POSITION_FAMILIES[id];
}

/** Índice dorsal → familia. Se arma una vez, recorriendo en orden canónico. */
const FAMILY_BY_NUMBER: Record<number, PositionFamilyId> = {};
for (const id of ALL_FAMILIES) {
    for (const shirt of POSITION_FAMILIES[id].numbers) FAMILY_BY_NUMBER[shirt] = id;
}

/**
 * A qué familia pertenece un dorsal. Es TOTAL y UNÍVOCA sobre 1..15 —lo
 * verifica el test— así que fuera de ese rango es un error de programación y
 * no un caso a contemplar.
 */
export function familyOfNumber(shirt: number): PositionFamilyId {
    const found = FAMILY_BY_NUMBER[shirt];
    if (!found) throw new Error(`No hay familia para el dorsal ${shirt}: los dorsales van del 1 al 15.`);
    return found;
}

/**
 * La plantilla de atributos de un pibe de esa familia: el piso en todo, más lo
 * que declara `base`. Devuelve las diecinueve claves siempre.
 */
export function baseAttributes(id: PositionFamilyId): CaptainAttributes {
    const attrs = {} as CaptainAttributes;
    for (const key of ATTRIBUTE_KEYS) attrs[key] = ATTRIBUTE_FLOOR;
    const family = POSITION_FAMILIES[id];
    for (const key of ATTRIBUTE_KEYS) {
        const value = family.base[key];
        if (value !== undefined) attrs[key] = value;
    }
    return attrs;
}
