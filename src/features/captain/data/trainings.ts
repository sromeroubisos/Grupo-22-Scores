// EL CAPITÁN — la carta de pretemporada.
//
// Reemplaza al reparto de las seis fichas de ⏳ Tiempo. La diferencia no es de
// contenido sino de GÉNERO: repartir un presupuesto es contabilidad y no deja
// anécdota —nadie cuenta "esa temporada puse tres fichas en gimnasio"— mientras
// que elegir una cosa y comerse la consecuencia sí. Es la carta de El Ídolo, y
// acá aguanta igual.
//
// ── EL EJE NO ES DÓNDE CAEN LOS PUNTOS: ES CUÁNTO PAGÁS ──
// La primera versión de este archivo repartía el mismo presupuesto en las cuatro
// opciones y lo único que cambiaba era en qué atributo caía. Eso NO es una
// decisión: es un reparto con cuatro nombres. Ninguna de las cuatro te pedía
// resignar nada, así que el jugador elegía dirección y nunca compromiso, y el
// barrido de agencia lo cobró — la decisión movía 0,3 puntos de pico contra 16,9
// del sorteo del techo.
//
// Ahora cada carta declara SU PROPIO tamaño y SU PROPIO costo:
//
//   LA MÁQUINA DE SCRUM        DOBLE TURNO CON EL PROFE
//   +4 Empuje +1 Choque        +6 Empuje +2 Choque
//   Un poco de cuerpo.         ⚠️ Cuerpo, minutos y riesgo de romperte
//
// Es la forma de El Ídolo, de donde salió esta carta: "Pretemporada con la
// Reserva" da +4 DEF y +2 LID Y penaliza la titularidad. El costo vive ADENTRO
// de la carta, no en un presupuesto aparte — que es justamente lo que se fue con
// las fichas.
//
// ── Qué sube y qué no ──
// Un entrenamiento mueve UNO O DOS atributos, y nada más. Lo demás —Pertenencia,
// el cuerpo, la escalera representativa, la estabilidad de la vida— dejó de ser
// una ranura donde poner fichas y pasó a derivarse de lo que hacés:
//
//   Pertenencia   ← quedarse, jugar y ganar (`simulate-season.ts`)
//   El cuerpo     ← partidos jugados, menos el descanso de toda pretemporada,
//                   MÁS lo que se lleve la carta que hayas elegido
//   La estabilidad← el evento `per-trabajo-y-entrenamiento`, que ya existía
//   El resto de los atributos ← el RENDIMIENTO de la temporada (`aging.ts`)
//
// ── Por qué el catálogo es por familia y no genérico ──
// Un entrenamiento que suba "el atributo principal de tu puesto" es un slider
// con nombre de fantasía: el jugador lee lo mismo juegue de pilar o de wing. Acá
// cada familia tiene sus cuatro, con nombre de ACCIÓN —cien lanzamientos, el box
// kick, subir la línea— porque es lo que hace que la carta se sienta rugby y no
// una pantalla de asignar puntos.

import type { CaptainAttributeKey, PositionFamilyId } from '../types/player.ts';

/**
 * Los tres tamaños, y lo que cada uno reparte en total.
 *
 * Están acá y no esparcidos por el catálogo para que la calibración se toque en
 * un solo lugar: mover `cara` de 8 a 7 es una línea, y no treinta y dos.
 *
 * ── Por qué el rango es tan ancho ──
 * Porque la media está PONDERADA y el rango tiene que sobrevivir a eso. Ocho
 * puntos repartidos 6/2 sobre los atributos que pesan 40 y 30 compran 3,0 de
 * media; tres puntos en el que pesa 15 compran 0,45. Esa distancia —casi siete
 * veces— es la que tiene que existir para que pagar signifique algo. Con el
 * presupuesto único de 4 la distancia era de 1,6 contra 0,6, y se la comía
 * entero el recorte del techo.
 */
export const TRAINING_POINTS: Record<TrainingTier, number> = {
    floja: 3,
    media: 5,
    cara: 8,
};

/**
 * Cuánto TECHO construye cada tier por temporada — el otro canal, y el que hace
 * que pagar signifique algo.
 *
 * Los puntos de `TRAINING_POINTS` caen ADENTRO del recorte del techo: aceleran
 * la llegada y nada más. Está medido y fue el hallazgo que reescribió este
 * archivo dos veces: sin carta ninguna el jugador tocaba su techo exacto igual,
 * así que el tamaño de la carta no podía decidir nada del pico. Esto cae AFUERA,
 * sobre `player.built`, y por eso es lo único de la carta que mueve el destino.
 *
 * ── La calibración, y qué la ata ──
 * Con la banda en 6 y unas ocho temporadas de crecimiento, elegir siempre la
 * cara llena la banda entera y sobra un poco; siempre la media llega a la mitad;
 * siempre la floja no construye nada. Ese reparto es deliberado: la floja tiene
 * que ser una renuncia de verdad y no un descuento, porque es la que no cobra.
 */
export const TRAINING_CEILING: Record<TrainingTier, number> = {
    floja: 0,
    media: 0.35,
    cara: 0.9,
};

/**
 * Qué tan cara es una carta. Es un dato declarado y no derivado del costo,
 * porque es lo que la pantalla usa para decidir si dibuja el ⚠️ y lo que el
 * test usa para exigir que en cada mano haya de las tres.
 */
export type TrainingTier = 'floja' | 'media' | 'cara';

/** Cuántos puntos van a un atributo. La suma tiene que dar `TRAINING_POINTS[tier]`. */
export interface TrainingGain {
    attr: CaptainAttributeKey;
    points: number;
}

/**
 * Lo que se paga por la carta. Las tres monedas son las que el jugador ya
 * entiende, y ninguna es plata (CLAUDE.md §5).
 *
 * Los tres campos van SIEMPRE presentes y en cero cuando no aplican: un
 * `Record` completo es JSON sin sorpresas y evita el `?? 0` repetido en el
 * motor, que es donde se cuelan los bugs de signo.
 */
export interface TrainingCost {
    /**
     * Puntos de 🦴 que se lleva la pretemporada, ADEMÁS del descanso fijo.
     * Con `BODY_REST_PER_SEASON` en 3,5, una carta de 2,5 se come dos tercios
     * del descanso del año: no te rompe, te deja sin margen.
     */
    body: number;
    /**
     * Escalones de tiempo de juego que resignás. Mismo eje que el `playingTime`
     * de una decisión: cada escalón son 0,12 de `share`, o unos dos partidos y
     * medio de los veintidós del club.
     */
    minutes: number;
    /**
     * Chance de que la pretemporada te deje golpeado y te coma media temporada.
     * Se tira SIEMPRE en `simulate-season.ts`, haya o no riesgo, para que el
     * stream del rng no dependa de la carta elegida.
     */
    injuryRisk: number;
}

export interface TrainingDef {
    id: string;
    labelEs: string;
    /** Corto, y dice qué resignás además de qué ganás. */
    hint: string;
    tier: TrainingTier;
    /**
     * Uno o dos atributos, SIEMPRE de los cuatro que le cuentan a la familia.
     * Subir uno que no cuenta para la media sería una opción trampa, y hay un
     * test que no deja que entre.
     */
    gain: readonly TrainingGain[];
    /** `null` en las flojas, y solo en las flojas. Es lo que las hace flojas. */
    cost: TrainingCost | null;
}

/** Sin costo. Se escribe una vez y se lee en las ocho familias. */
const GRATIS = null;

/** Atajo para no repetir tres campos cuando dos son cero. */
function cuesta(body: number, minutes: number, injuryRisk = 0): TrainingCost {
    return { body, minutes, injuryRisk };
}

/**
 * Cuatro por familia, en ORDEN CANÓNICO. Se itera por acá y nunca por
 * `Object.keys` (CLAUDE.md §1): el orden es el que ve el jugador en pantalla.
 *
 * ── La forma de la mano, y por qué se repite ──
 * Las cuatro son siempre, y en este orden:
 *
 *   0 · CARA   — tu oficio principal a doble intensidad. Compra la mayor parte
 *                de media que el juego ofrece en un año, y se paga con cuerpo,
 *                con minutos y con riesgo.
 *   1 · MEDIA  — el mismo oficio a intensidad normal, o el complemento físico.
 *   2 · MEDIA  — algo lateral del puesto: te hace más completo, no más fuerte.
 *   3 · FLOJA  — la del liderazgo. Es la única gratis, y es gratis porque hablar
 *                no te rompe: sube el atributo que les cuenta a las ocho
 *                familias y no te hace mejor en ninguna otra cosa.
 *
 * Que la forma se repita es deliberado: es lo que hace legible la elección sin
 * explicarla. Y garantiza lo único que no se puede negociar —que en cada mano
 * haya al menos una de cada tipo—, porque si una familia ofreciera cuatro caras
 * o cuatro gratis, ahí no habría decisión.
 */
export const TRAININGS: Record<PositionFamilyId, readonly TrainingDef[]> = {
    // empuje 40 · choque 30 · manos 15 · liderazgo 15
    'primera-linea': [
        {
            id: 'pl-doble-turno',
            labelEs: 'Doble turno con el profe',
            hint: 'Scrum a la mañana, gimnasio a la tarde. Llegás a marzo fundido y con menos lugar.',
            tier: 'cara',
            gain: [{ attr: 'empuje', points: 6 }, { attr: 'choque', points: 2 }],
            cost: cuesta(2.5, 1, 0.1),
        },
        {
            id: 'pl-maquina',
            labelEs: 'La máquina de scrum',
            hint: 'Tres veces por semana contra el fierro. La espalda te lo cobra en junio.',
            tier: 'media',
            gain: [{ attr: 'empuje', points: 4 }, { attr: 'choque', points: 1 }],
            cost: cuesta(1.5, 0),
        },
        {
            id: 'pl-manos',
            labelEs: 'Manos en el line',
            hint: 'Dejás de ser solo el que empuja. Te comés el mediodía y llegás justo al partido.',
            tier: 'media',
            gain: [{ attr: 'manos', points: 3 }, { attr: 'choque', points: 2 }],
            cost: cuesta(0, 1),
        },
        {
            id: 'pl-charla',
            labelEs: 'La charla del pack',
            hint: 'Ordenás adelante sin gastar un gramo. Tampoco ganás uno.',
            tier: 'floja',
            gain: [{ attr: 'liderazgo', points: 3 }],
            cost: GRATIS,
        },
    ],

    // lanzamiento 35 · empuje 25 · choque 25 · liderazgo 15
    hooker: [
        {
            id: 'hk-mil-lanzamientos',
            labelEs: 'Mil lanzamientos por semana',
            hint: 'El line propio deja de ser una lotería. El hombro te avisa antes de la mitad del año.',
            tier: 'cara',
            gain: [{ attr: 'lanzamiento', points: 6 }, { attr: 'choque', points: 2 }],
            cost: cuesta(2, 1, 0.08),
        },
        {
            id: 'hk-scrum',
            labelEs: 'Hookear en el scrum',
            hint: 'Ganás el duelo de adelante. El cuello se lleva lo suyo.',
            tier: 'media',
            gain: [{ attr: 'empuje', points: 3 }, { attr: 'choque', points: 2 }],
            cost: cuesta(1.5, 0),
        },
        {
            id: 'hk-maul',
            labelEs: 'El maul desde el line',
            hint: 'Tries de maul. Es una hora más de video por semana que le sacás al partido.',
            tier: 'media',
            gain: [{ attr: 'choque', points: 3 }, { attr: 'lanzamiento', points: 2 }],
            cost: cuesta(0, 1),
        },
        {
            id: 'hk-voz',
            labelEs: 'La voz del line',
            hint: 'Manejás la formación y no gastás nada. El brazo tampoco mejora.',
            tier: 'floja',
            gain: [{ attr: 'liderazgo', points: 3 }],
            cost: GRATIS,
        },
    ],

    // salto 35 · choque 25 · trabajo 25 · liderazgo 15
    'segunda-linea': [
        {
            id: 'sl-techo',
            labelEs: 'Salto, pesas y video, todo junto',
            hint: 'Llegás más arriba que nadie. Y llegás con el cuerpo justo y menos minutos.',
            tier: 'cara',
            gain: [{ attr: 'salto', points: 6 }, { attr: 'trabajo', points: 2 }],
            cost: cuesta(2.5, 1, 0.1),
        },
        {
            id: 'sl-salto',
            labelEs: 'Salto y tiempo de aire',
            hint: 'Ganás la pelota arriba. Se te va la mañana del sábado en el gimnasio.',
            tier: 'media',
            gain: [{ attr: 'salto', points: 4 }, { attr: 'trabajo', points: 1 }],
            cost: cuesta(0, 1),
        },
        {
            id: 'sl-trabajo',
            labelEs: 'Trabajo sucio en el ruck',
            hint: 'El que limpia. Nadie te lo va a contar en el asado y las rodillas lo anotan.',
            tier: 'media',
            gain: [{ attr: 'trabajo', points: 3 }, { attr: 'choque', points: 2 }],
            cost: cuesta(1.5, 0),
        },
        {
            id: 'sl-llamadas',
            labelEs: 'Las llamadas del line',
            hint: 'La formación la cantás vos, y eso no cuesta nada. No saltás más alto.',
            tier: 'floja',
            gain: [{ attr: 'liderazgo', points: 3 }],
            cost: GRATIS,
        },
    ],

    // tackle 30 · robo 30 · choque 25 · liderazgo 15
    'tercera-linea': [
        {
            id: 'tl-breakdown',
            labelEs: 'Vivir en el breakdown',
            hint: 'Cada pelota del piso es tuya. Es el lugar donde más gente se rompe, y vas a estar ahí.',
            tier: 'cara',
            gain: [{ attr: 'robo', points: 5 }, { attr: 'tackle', points: 3 }],
            cost: cuesta(3, 1, 0.12),
        },
        {
            id: 'tl-tackle',
            labelEs: 'Técnica de tackle',
            hint: 'No fallás uno. Doscientos impactos por semana que el hombro registra.',
            tier: 'media',
            gain: [{ attr: 'tackle', points: 4 }, { attr: 'choque', points: 1 }],
            cost: cuesta(1.5, 0),
        },
        {
            id: 'tl-carga',
            labelEs: 'Cargar la pelota',
            hint: 'Metros post-contacto. Menos tiempo en el breakdown y menos lugar en el equipo.',
            tier: 'media',
            gain: [{ attr: 'choque', points: 3 }, { attr: 'tackle', points: 2 }],
            cost: cuesta(0, 1),
        },
        {
            id: 'tl-lectura',
            labelEs: 'Leer el breakdown',
            hint: 'Sabés cuándo entrar sin pagar nada por saberlo. Físicamente no cambiás.',
            tier: 'floja',
            gain: [{ attr: 'liderazgo', points: 3 }],
            cost: GRATIS,
        },
    ],

    // salida 35 · patada 20 · vision 30 · liderazgo 15
    'medio-scrum': [
        {
            id: 'ms-base',
            labelEs: 'Dos mil pases desde la base',
            hint: 'La pelota sale limpia siempre. La espalda y el lugar en el equipo lo pagan.',
            tier: 'cara',
            gain: [{ attr: 'salida', points: 6 }, { attr: 'vision', points: 2 }],
            cost: cuesta(2, 1, 0.08),
        },
        {
            id: 'ms-box',
            labelEs: 'El box kick',
            hint: 'Salís del rincón. Trescientas patadas por semana que la cadera acusa.',
            tier: 'media',
            gain: [{ attr: 'patada', points: 3 }, { attr: 'salida', points: 2 }],
            cost: cuesta(1.5, 0),
        },
        {
            id: 'ms-tempo',
            labelEs: 'Manejar el tempo',
            hint: 'Ves el partido antes que el resto. Son dos noches de video que le sacás al campo.',
            tier: 'media',
            gain: [{ attr: 'vision', points: 4 }, { attr: 'salida', points: 1 }],
            cost: cuesta(0, 1),
        },
        {
            id: 'ms-mando',
            labelEs: 'Mandar al pack',
            hint: 'Los ocho de adelante te escuchan y no te cuesta un minuto. Nada más.',
            tier: 'floja',
            gain: [{ attr: 'liderazgo', points: 3 }],
            cost: GRATIS,
        },
    ],

    // pegada 30 · vision 30 · tackle 15 · liderazgo 25
    apertura: [
        {
            id: 'ap-doscientas',
            labelEs: 'Doscientas patadas por día',
            hint: 'El porcentaje al palo sube como nunca. La ingle y los minutos son la cuenta.',
            tier: 'cara',
            gain: [{ attr: 'pegada', points: 6 }, { attr: 'vision', points: 2 }],
            cost: cuesta(2, 1, 0.08),
        },
        {
            id: 'ap-tactica',
            labelEs: 'Patada táctica y lectura',
            hint: 'Jugás mejor el territorio. Se te van las tardes en la sala de video.',
            tier: 'media',
            gain: [{ attr: 'vision', points: 4 }, { attr: 'pegada', points: 1 }],
            cost: cuesta(0, 1),
        },
        {
            id: 'ap-canal',
            labelEs: 'Defender el canal',
            hint: 'Dejan de venirte a buscar. Vas a terminar la pretemporada golpeado.',
            tier: 'media',
            gain: [{ attr: 'tackle', points: 3 }, { attr: 'vision', points: 2 }],
            cost: cuesta(1.5, 0),
        },
        {
            id: 'ap-conduccion',
            labelEs: 'Conducir el equipo',
            hint: 'Ordenás la cancha entera sin resignar nada. No pateás un metro más.',
            tier: 'floja',
            gain: [{ attr: 'liderazgo', points: 3 }],
            cost: GRATIS,
        },
    ],

    // choque 25 · quiebre 35 · defensa 25 · liderazgo 15
    centro: [
        {
            id: 'ce-series',
            labelEs: 'Series de quiebre hasta vomitar',
            hint: 'Encontrás el hueco que nadie ve. Los isquios y el lugar en el equipo lo pagan.',
            tier: 'cara',
            gain: [{ attr: 'quiebre', points: 6 }, { attr: 'choque', points: 2 }],
            cost: cuesta(2.5, 1, 0.1),
        },
        {
            id: 'ce-quiebre',
            labelEs: 'Líneas de quiebre',
            hint: 'Cruzás la ventaja más seguido. Es una tarde por semana que no estás en la cancha.',
            tier: 'media',
            gain: [{ attr: 'quiebre', points: 4 }, { attr: 'choque', points: 1 }],
            cost: cuesta(0, 1),
        },
        {
            id: 'ce-defensa',
            labelEs: 'Subir la línea',
            hint: 'Nadie pasa por tu canal. Son cien impactos por semana y el cuerpo los cuenta.',
            tier: 'media',
            gain: [{ attr: 'defensa', points: 3 }, { attr: 'choque', points: 2 }],
            cost: cuesta(1.5, 0),
        },
        {
            id: 'ce-comunicacion',
            labelEs: 'Hablar la defensa',
            hint: 'La línea sube junta y a vos no te cuesta nada. Corrés lo mismo que antes.',
            tier: 'floja',
            gain: [{ attr: 'liderazgo', points: 3 }],
            cost: GRATIS,
        },
    ],

    // velocidad 35 · gambeta 30 · juegoAereo 20 · liderazgo 15
    'wing-fullback': [
        {
            id: 'wf-pista',
            labelEs: 'Pista y pesas seis veces por semana',
            hint: 'Los primeros diez metros no te los gana nadie. Los isquios y los minutos son el precio.',
            tier: 'cara',
            gain: [{ attr: 'velocidad', points: 6 }, { attr: 'gambeta', points: 2 }],
            cost: cuesta(2.5, 1, 0.1),
        },
        {
            id: 'wf-gambeta',
            labelEs: 'Uno contra uno',
            hint: 'Los pasás de a uno. Se te va el entrenamiento del equipo en eso.',
            tier: 'media',
            gain: [{ attr: 'gambeta', points: 4 }, { attr: 'velocidad', points: 1 }],
            cost: cuesta(0, 1),
        },
        {
            id: 'wf-aereo',
            labelEs: 'Pelota alta',
            hint: 'Ganás arriba. Caés de mala manera unas cuantas veces antes de aprender.',
            tier: 'media',
            gain: [{ attr: 'juegoAereo', points: 3 }, { attr: 'velocidad', points: 2 }],
            cost: cuesta(1.5, 0),
        },
        {
            id: 'wf-fondo',
            labelEs: 'Cubrir el fondo',
            hint: 'Ordenás los tres de atrás sin resignar un minuto. No corrés más rápido.',
            tier: 'floja',
            gain: [{ attr: 'liderazgo', points: 3 }],
            cost: GRATIS,
        },
    ],
};

/** Los cuatro de una familia, en orden. Es lo que dibuja la carta. */
export function trainingsFor(family: PositionFamilyId): readonly TrainingDef[] {
    return TRAININGS[family];
}

/**
 * Resuelve un id contra la familia que lo eligió.
 *
 * Devuelve `null` si el id no es de esa familia, y ese `null` es el que hace que
 * el reducer ignore la acción: un id de otro puesto no es una elección válida,
 * igual que una opción de evento que no existe.
 */
export function getTraining(family: PositionFamilyId, id: string): TrainingDef | null {
    return TRAININGS[family].find((t) => t.id === id) ?? null;
}

/**
 * Los puntos que reparte una carta, en total.
 *
 * Se suma del `gain` y no se lee de `TRAINING_POINTS[tier]`: el tier es una
 * etiqueta para la pantalla, y si alguna vez los dos no coincidieran, la verdad
 * la tiene lo que el jugador va a recibir. `trainings.test.ts` exige que
 * coincidan, así que la diferencia no puede sobrevivir a un commit.
 */
export function trainingPoints(training: TrainingDef): number {
    return training.gain.reduce((total, g) => total + g.points, 0);
}

/** Sin costo es sin costo: los tres campos en cero cuentan como gratis. */
export function isFree(training: TrainingDef): boolean {
    const { cost } = training;
    return cost === null || (cost.body === 0 && cost.minutes === 0 && cost.injuryRisk === 0);
}
