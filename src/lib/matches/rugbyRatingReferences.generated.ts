/**
 * GENERADO. No editar a mano: `node scripts/rugby-ratings/calibrar.mjs`.
 *
 * Que PARTE del total de su equipo se lleva un jugador normal de cada puesto en
 * ochenta minutos, y cuanto se dispersa alrededor de eso. Es contra estas varas
 * que `rugbyPlayerRating.ts` mide a cada jugador.
 *
 * Son partes y no conteos porque el conteo arrastra la posesion: con conteos,
 * el puntaje medio de un equipo seguia a su volumen de pases con r = 0,726, y
 * un equipo que ganaba sin la pelota mandaba a sus quince jugadores debajo de
 * la vara. Un apertura se lleva una quinta parte de los pases de su equipo
 * tenga el equipo 105 o 182.
 *
 * Los ausentes cuentan como cero: el proveedor lista solo a quien hizo algo, y
 * no marcar un try es un cero, no un dato que falta.
 *
 * Muestra: 1244 partidos, 32004 planillas de 50+ minutos.
 */

export interface Referencia {
    /** La parte del total del equipo que se lleva un jugador normal del puesto. */
    media: number;
    /** Cuanto se dispersa alrededor de la media, en las mismas unidades. */
    desvio: number;
}

/** Partidos que entraron en la medicion. Sube cuando se recalibra. */
export const REFERENCIAS_MUESTRA = {
    partidos: 1244,
    planillas: 32004,
    minutosMinimos: 50,
} as const;

/**
 * LA MEDIANA DE LA SEÑAL, que el motor resta para recentrar.
 *
 * Las varas centran cada rubro en su PROMEDIO, que es lo que iguala a los
 * quince puestos. Pero un conteo tiene cola a la derecha: centrado en el
 * promedio, mas de la mitad del plantel queda abajo y la mediana del partido
 * caia en 5,90, con el 30% de las notas entre 5,5 y 6,0 y solo el 14% entre 6,0
 * y 6,5. No existia la banda del "buen partido": existia "normal-bajo" y
 * "estrella". Restando esto, el partido tipico vale 6 y la media queda un poco
 * arriba, que es como se lee una escala de puntajes.
 */
export const SESGO = -0.04083;

/**
 * Cuanto se normaliza cada rubro por el total del equipo: 1 es la fraccion
 * pura, 0 el conteo crudo. Ver el comentario del denominador en el motor.
 */
export const NORMALIZACION = 0.5;

/**
 * Y uno por puesto, porque la asimetria no es la misma en todos.
 *
 * Con un solo sesgo global el medio scrum quedaba en 5,99 y el wing en 6,37:
 * las varas ya igualaban el PROMEDIO de la señal en los quince, pero la curva
 * no es lineal, asi que dos puestos con la misma media y distinta forma salen
 * en lugares distintos. La parte de pases de un 9 se reparte con el que entra
 * por el; la de un pilar, no. Centrar la mediana de cada puesto lo cierra.
 */
export const SESGO_POR_PUESTO: Readonly<Record<number, number>> = {
    1: -0.03167,
    2: -0.03772,
    3: -0.0148,
    4: -0.01969,
    5: -0.03039,
    6: -0.01335,
    7: -0.03019,
    8: -0.02666,
    9: -0.09295,
    10: -0.12331,
    11: -0.05325,
    12: -0.03834,
    13: -0.06523,
    14: -0.05066,
    15: -0.04269,
};

/**
 * CUANTO SE ABRE PARA ARRIBA LA SEÑAL DE CADA PUESTO. El motor divide la subida
 * por esto, y solo la subida: la caida ya esta comprimida y no se toca.
 *
 * Centrar la mediana iguala el partido tipico, pero no quien llega al 8. Con la
 * caida comprimida, la cola de arriba se vuelve promedio, y la del wing —tries,
 * quiebres— es mucho mas larga que la de un pilar, cuyo trabajo de scrum y ruck
 * la planilla no mide. Medido: el wing sacaba 8 o mas el 14% de las veces y el
 * pilar el 0,6%. Es el percentil 90 menos la mediana de cada puesto, sobre el de
 * los quince juntos, en planillas de 50+ minutos.
 */
export const ESCALA_POR_PUESTO: Readonly<Record<number, number>> = {
    1: 0.755,
    2: 0.772,
    3: 0.7459,
    4: 0.8414,
    5: 0.8096,
    6: 0.916,
    7: 0.9045,
    8: 0.9347,
    9: 0.9998,
    10: 1.0547,
    11: 1.2454,
    12: 1.0805,
    13: 1.1233,
    14: 1.3814,
    15: 1.114,
};


/**
 * Lo que hace un equipo PROMEDIO en cada rubro, para el llamador que puntua un
 * jugador suelto y no tiene el plantel a mano. Deja la cuenta en la escala
 * correcta, pero para ese jugador vuelve el sesgo de posesion.
 */
export const TOTAL_DE_EQUIPO: Readonly<Record<string, number>> = {
    carries: 122.41,
    carriesMetres: 414.75,
    cleanBreaks: 8.31,
    defendersBeaten: 23.45,
    dominantTackles: 7.2,
    kicks: 25.19,
    lineoutsWon: 11.97,
    missedTackles: 23.44,
    offloads: 8.5,
    passes: 129.98,
    penaltiesConceded: 10.08,
    ruckTurnovers: 1.68,
    tackles: 137.96,
    totalTackles: 137.98,
    tries: 3.82,
    tryAssists: 2.69,
    turnoversConceded: 13.95,
    turnoversWon: 6.41,
};

export const REFERENCIAS_POR_PUESTO: Readonly<Record<number, Readonly<Record<string, Referencia>>>> = {
    1: {
        carries: { media: 0.05718, desvio: 0.03078 },
        carriesMetres: { media: 0.02203, desvio: 0.02515 },
        cleanBreaks: { media: 0.01022, desvio: 0.04082 },
        defendersBeaten: { media: 0.03379, desvio: 0.05814 },
        dominantTackles: { media: 0.06522, desvio: 0.11513 },
        kicks: { media: 0.00132, desvio: 0.0086 },
        lineoutsWon: { media: 0.0011, desvio: 0.01775 },
        missedTackles: { media: 0.05412, desvio: 0.05853 },
        offloads: { media: 0.02394, desvio: 0.06494 },
        passes: { media: 0.01479, desvio: 0.01409 },
        penaltiesConceded: { media: 0.12882, desvio: 0.12983 },
        ruckTurnovers: { media: 0.03838, desvio: 0.18488 },
        tackles: { media: 0.08158, desvio: 0.03253 },
        totalTackles: { media: 0.08158, desvio: 0.03253 },
        tries: { media: 0.02505, desvio: 0.09722 },
        tryAssists: { media: 0.00747, desvio: 0.06194 },
        turnoversConceded: { media: 0.02917, desvio: 0.05408 },
        turnoversWon: { media: 0.04357, desvio: 0.09701 },
    },
    2: {
        carries: { media: 0.06894, desvio: 0.03293 },
        carriesMetres: { media: 0.04005, desvio: 0.03686 },
        cleanBreaks: { media: 0.02831, desvio: 0.07144 },
        defendersBeaten: { media: 0.04419, desvio: 0.06289 },
        dominantTackles: { media: 0.07483, desvio: 0.12198 },
        kicks: { media: 0.00363, desvio: 0.01456 },
        lineoutsWon: { media: 0.97336, desvio: 0.22912 },
        missedTackles: { media: 0.06898, desvio: 0.06582 },
        offloads: { media: 0.04098, desvio: 0.08597 },
        passes: { media: 0.02469, desvio: 0.0189 },
        penaltiesConceded: { media: 0.07218, desvio: 0.09793 },
        ruckTurnovers: { media: 0.06421, desvio: 0.23246 },
        tackles: { media: 0.09236, desvio: 0.03403 },
        totalTackles: { media: 0.09235, desvio: 0.03403 },
        tries: { media: 0.11182, desvio: 0.2029 },
        tryAssists: { media: 0.02027, desvio: 0.09868 },
        turnoversConceded: { media: 0.05232, desvio: 0.07029 },
        turnoversWon: { media: 0.07841, desvio: 0.13625 },
    },
    3: {
        carries: { media: 0.04918, desvio: 0.03015 },
        carriesMetres: { media: 0.01699, desvio: 0.02136 },
        cleanBreaks: { media: 0.00692, desvio: 0.03461 },
        defendersBeaten: { media: 0.02212, desvio: 0.04489 },
        dominantTackles: { media: 0.06041, desvio: 0.11086 },
        kicks: { media: 0.00088, desvio: 0.007 },
        lineoutsWon: { media: 0.00039, desvio: 0.00787 },
        missedTackles: { media: 0.05818, desvio: 0.05893 },
        offloads: { media: 0.02128, desvio: 0.06418 },
        passes: { media: 0.01438, desvio: 0.01369 },
        penaltiesConceded: { media: 0.11964, desvio: 0.13064 },
        ruckTurnovers: { media: 0.03166, desvio: 0.1653 },
        tackles: { media: 0.07753, desvio: 0.03173 },
        totalTackles: { media: 0.07752, desvio: 0.03173 },
        tries: { media: 0.02615, desvio: 0.10386 },
        tryAssists: { media: 0.01083, desvio: 0.07589 },
        turnoversConceded: { media: 0.02815, desvio: 0.05445 },
        turnoversWon: { media: 0.03463, desvio: 0.08796 },
    },
    4: {
        carries: { media: 0.05556, desvio: 0.02865 },
        carriesMetres: { media: 0.02591, desvio: 0.02817 },
        cleanBreaks: { media: 0.02063, desvio: 0.05617 },
        defendersBeaten: { media: 0.02472, desvio: 0.04321 },
        dominantTackles: { media: 0.07173, desvio: 0.11273 },
        kicks: { media: 0.00183, desvio: 0.00963 },
        lineoutsWon: { media: 0.00016, desvio: 0.00392 },
        missedTackles: { media: 0.05817, desvio: 0.05598 },
        offloads: { media: 0.04268, desvio: 0.08522 },
        passes: { media: 0.02267, desvio: 0.01657 },
        penaltiesConceded: { media: 0.0748, desvio: 0.09645 },
        ruckTurnovers: { media: 0.03658, desvio: 0.16604 },
        tackles: { media: 0.08341, desvio: 0.02934 },
        totalTackles: { media: 0.0834, desvio: 0.02933 },
        tries: { media: 0.02413, desvio: 0.08973 },
        tryAssists: { media: 0.01482, desvio: 0.08142 },
        turnoversConceded: { media: 0.04574, desvio: 0.06147 },
        turnoversWon: { media: 0.05729, desvio: 0.10472 },
    },
    5: {
        carries: { media: 0.05773, desvio: 0.03084 },
        carriesMetres: { media: 0.02757, desvio: 0.03029 },
        cleanBreaks: { media: 0.01733, desvio: 0.04988 },
        defendersBeaten: { media: 0.02862, desvio: 0.04803 },
        dominantTackles: { media: 0.0708, desvio: 0.10742 },
        kicks: { media: 0.0013, desvio: 0.0087 },
        lineoutsWon: { media: 0.00048, desvio: 0.01474 },
        missedTackles: { media: 0.05464, desvio: 0.05313 },
        offloads: { media: 0.04351, desvio: 0.08505 },
        passes: { media: 0.02225, desvio: 0.01651 },
        penaltiesConceded: { media: 0.07048, desvio: 0.09237 },
        ruckTurnovers: { media: 0.03316, desvio: 0.1571 },
        tackles: { media: 0.08211, desvio: 0.02938 },
        totalTackles: { media: 0.08211, desvio: 0.02938 },
        tries: { media: 0.03167, desvio: 0.10255 },
        tryAssists: { media: 0.01667, desvio: 0.08522 },
        turnoversConceded: { media: 0.04237, desvio: 0.06087 },
        turnoversWon: { media: 0.05435, desvio: 0.1038 },
    },
    6: {
        carries: { media: 0.06127, desvio: 0.02999 },
        carriesMetres: { media: 0.04737, desvio: 0.03948 },
        cleanBreaks: { media: 0.04298, desvio: 0.0782 },
        defendersBeaten: { media: 0.05134, desvio: 0.06427 },
        dominantTackles: { media: 0.08913, desvio: 0.12197 },
        kicks: { media: 0.0055, desvio: 0.02953 },
        lineoutsWon: { media: 0.00096, desvio: 0.01167 },
        missedTackles: { media: 0.06124, desvio: 0.05815 },
        offloads: { media: 0.05012, desvio: 0.08757 },
        passes: { media: 0.02578, desvio: 0.03031 },
        penaltiesConceded: { media: 0.07226, desvio: 0.09389 },
        ruckTurnovers: { media: 0.07509, desvio: 0.23345 },
        tackles: { media: 0.08899, desvio: 0.03326 },
        totalTackles: { media: 0.08898, desvio: 0.03326 },
        tries: { media: 0.04791, desvio: 0.11991 },
        tryAssists: { media: 0.02728, desvio: 0.1085 },
        turnoversConceded: { media: 0.05574, desvio: 0.06851 },
        turnoversWon: { media: 0.0964, desvio: 0.1405 },
    },
    7: {
        carries: { media: 0.06206, desvio: 0.0305 },
        carriesMetres: { media: 0.04781, desvio: 0.04172 },
        cleanBreaks: { media: 0.04348, desvio: 0.07867 },
        defendersBeaten: { media: 0.05076, desvio: 0.06266 },
        dominantTackles: { media: 0.08792, desvio: 0.12063 },
        kicks: { media: 0.00477, desvio: 0.01585 },
        lineoutsWon: { media: 0.00104, desvio: 0.01839 },
        missedTackles: { media: 0.06198, desvio: 0.0582 },
        offloads: { media: 0.0544, desvio: 0.09148 },
        passes: { media: 0.02686, desvio: 0.01937 },
        penaltiesConceded: { media: 0.07211, desvio: 0.0894 },
        ruckTurnovers: { media: 0.08773, desvio: 0.25194 },
        tackles: { media: 0.09395, desvio: 0.03342 },
        totalTackles: { media: 0.09396, desvio: 0.03342 },
        tries: { media: 0.05531, desvio: 0.13083 },
        tryAssists: { media: 0.03093, desvio: 0.1159 },
        turnoversConceded: { media: 0.05529, desvio: 0.06763 },
        turnoversWon: { media: 0.10834, desvio: 0.14411 },
    },
    8: {
        carries: { media: 0.10338, desvio: 0.03777 },
        carriesMetres: { media: 0.0946, desvio: 0.05641 },
        cleanBreaks: { media: 0.04561, desvio: 0.0833 },
        defendersBeaten: { media: 0.09815, desvio: 0.08889 },
        dominantTackles: { media: 0.08437, desvio: 0.11838 },
        kicks: { media: 0.0051, desvio: 0.01556 },
        lineoutsWon: { media: 0.00047, desvio: 0.00774 },
        missedTackles: { media: 0.06426, desvio: 0.05873 },
        offloads: { media: 0.07943, desvio: 0.11301 },
        passes: { media: 0.03372, desvio: 0.02153 },
        penaltiesConceded: { media: 0.07215, desvio: 0.09142 },
        ruckTurnovers: { media: 0.07637, desvio: 0.23563 },
        tackles: { media: 0.08843, desvio: 0.03056 },
        totalTackles: { media: 0.08843, desvio: 0.03057 },
        tries: { media: 0.07121, desvio: 0.14784 },
        tryAssists: { media: 0.03109, desvio: 0.11636 },
        turnoversConceded: { media: 0.06461, desvio: 0.07361 },
        turnoversWon: { media: 0.0917, desvio: 0.13517 },
    },
    9: {
        carries: { media: 0.05394, desvio: 0.02835 },
        carriesMetres: { media: 0.05969, desvio: 0.05356 },
        cleanBreaks: { media: 0.08737, desvio: 0.11429 },
        defendersBeaten: { media: 0.05453, desvio: 0.07118 },
        dominantTackles: { media: 0.02607, desvio: 0.07044 },
        kicks: { media: 0.41494, desvio: 0.15843 },
        lineoutsWon: { media: 0.00372, desvio: 0.02009 },
        missedTackles: { media: 0.07768, desvio: 0.06592 },
        offloads: { media: 0.08409, desvio: 0.11857 },
        passes: { media: 0.49138, desvio: 0.10839 },
        penaltiesConceded: { media: 0.03814, desvio: 0.06871 },
        ruckTurnovers: { media: 0.02413, desvio: 0.13468 },
        tackles: { media: 0.04345, desvio: 0.02284 },
        totalTackles: { media: 0.04345, desvio: 0.02284 },
        tries: { media: 0.07938, desvio: 0.16327 },
        tryAssists: { media: 0.20253, desvio: 0.29859 },
        turnoversConceded: { media: 0.08868, desvio: 0.08609 },
        turnoversWon: { media: 0.05781, desvio: 0.1077 },
    },
    10: {
        carries: { media: 0.07004, desvio: 0.02991 },
        carriesMetres: { media: 0.0802, desvio: 0.05772 },
        cleanBreaks: { media: 0.05783, desvio: 0.0926 },
        defendersBeaten: { media: 0.0764, desvio: 0.0794 },
        dominantTackles: { media: 0.02707, desvio: 0.06773 },
        kicks: { media: 0.27529, desvio: 0.14575 },
        lineoutsWon: { media: 0.00715, desvio: 0.0261 },
        missedTackles: { media: 0.08096, desvio: 0.06445 },
        offloads: { media: 0.07501, desvio: 0.10448 },
        passes: { media: 0.13498, desvio: 0.05865 },
        penaltiesConceded: { media: 0.03042, desvio: 0.05846 },
        ruckTurnovers: { media: 0.01071, desvio: 0.08613 },
        tackles: { media: 0.0435, desvio: 0.02316 },
        totalTackles: { media: 0.04351, desvio: 0.02315 },
        tries: { media: 0.0399, desvio: 0.11059 },
        tryAssists: { media: 0.14831, desvio: 0.24695 },
        turnoversConceded: { media: 0.09961, desvio: 0.08727 },
        turnoversWon: { media: 0.0417, desvio: 0.08744 },
    },
    11: {
        carries: { media: 0.06104, desvio: 0.02466 },
        carriesMetres: { media: 0.11444, desvio: 0.0726 },
        cleanBreaks: { media: 0.15479, desvio: 0.13946 },
        defendersBeaten: { media: 0.10602, desvio: 0.0931 },
        dominantTackles: { media: 0.06106, desvio: 0.10216 },
        kicks: { media: 0.04173, desvio: 0.04805 },
        lineoutsWon: { media: 0.00409, desvio: 0.01926 },
        missedTackles: { media: 0.06245, desvio: 0.05577 },
        offloads: { media: 0.08261, desvio: 0.10523 },
        passes: { media: 0.02044, desvio: 0.01677 },
        penaltiesConceded: { media: 0.03846, desvio: 0.06545 },
        ruckTurnovers: { media: 0.02506, desvio: 0.12451 },
        tackles: { media: 0.03277, desvio: 0.01862 },
        totalTackles: { media: 0.03277, desvio: 0.01862 },
        tries: { media: 0.11234, desvio: 0.17385 },
        tryAssists: { media: 0.04848, desvio: 0.14818 },
        turnoversConceded: { media: 0.09228, desvio: 0.08345 },
        turnoversWon: { media: 0.06432, desvio: 0.10491 },
    },
    12: {
        carries: { media: 0.07828, desvio: 0.02852 },
        carriesMetres: { media: 0.07309, desvio: 0.05036 },
        cleanBreaks: { media: 0.06896, desvio: 0.09695 },
        defendersBeaten: { media: 0.08968, desvio: 0.08373 },
        dominantTackles: { media: 0.06004, desvio: 0.09988 },
        kicks: { media: 0.03479, desvio: 0.04869 },
        lineoutsWon: { media: 0.00079, desvio: 0.00914 },
        missedTackles: { media: 0.07837, desvio: 0.06313 },
        offloads: { media: 0.08399, desvio: 0.1075 },
        passes: { media: 0.05275, desvio: 0.02897 },
        penaltiesConceded: { media: 0.04636, desvio: 0.071 },
        ruckTurnovers: { media: 0.03542, desvio: 0.15417 },
        tackles: { media: 0.06131, desvio: 0.02503 },
        totalTackles: { media: 0.06131, desvio: 0.02503 },
        tries: { media: 0.0488, desvio: 0.11824 },
        tryAssists: { media: 0.07485, desvio: 0.17745 },
        turnoversConceded: { media: 0.06255, desvio: 0.07025 },
        turnoversWon: { media: 0.06707, desvio: 0.10859 },
    },
    13: {
        carries: { media: 0.0617, desvio: 0.02541 },
        carriesMetres: { media: 0.07804, desvio: 0.05854 },
        cleanBreaks: { media: 0.09406, desvio: 0.11221 },
        defendersBeaten: { media: 0.08319, desvio: 0.07774 },
        dominantTackles: { media: 0.05566, desvio: 0.09542 },
        kicks: { media: 0.02976, desvio: 0.04376 },
        lineoutsWon: { media: 0.00094, desvio: 0.00937 },
        missedTackles: { media: 0.07353, desvio: 0.06194 },
        offloads: { media: 0.08049, desvio: 0.10799 },
        passes: { media: 0.03236, desvio: 0.02498 },
        penaltiesConceded: { media: 0.04443, desvio: 0.07117 },
        ruckTurnovers: { media: 0.03433, desvio: 0.15124 },
        tackles: { media: 0.05186, desvio: 0.02282 },
        totalTackles: { media: 0.05187, desvio: 0.02283 },
        tries: { media: 0.06897, desvio: 0.14142 },
        tryAssists: { media: 0.05809, desvio: 0.15479 },
        turnoversConceded: { media: 0.06586, desvio: 0.07263 },
        turnoversWon: { media: 0.06752, desvio: 0.10755 },
    },
    14: {
        carries: { media: 0.05966, desvio: 0.02504 },
        carriesMetres: { media: 0.10891, desvio: 0.06891 },
        cleanBreaks: { media: 0.15593, desvio: 0.13665 },
        defendersBeaten: { media: 0.10382, desvio: 0.08921 },
        dominantTackles: { media: 0.06369, desvio: 0.10475 },
        kicks: { media: 0.03949, desvio: 0.04527 },
        lineoutsWon: { media: 0.00457, desvio: 0.02052 },
        missedTackles: { media: 0.06729, desvio: 0.0589 },
        offloads: { media: 0.08451, desvio: 0.1064 },
        passes: { media: 0.01965, desvio: 0.01607 },
        penaltiesConceded: { media: 0.04077, desvio: 0.06576 },
        ruckTurnovers: { media: 0.03163, desvio: 0.1445 },
        tackles: { media: 0.03735, desvio: 0.0187 },
        totalTackles: { media: 0.03735, desvio: 0.0187 },
        tries: { media: 0.1219, desvio: 0.17787 },
        tryAssists: { media: 0.04484, desvio: 0.13267 },
        turnoversConceded: { media: 0.09724, desvio: 0.0874 },
        turnoversWon: { media: 0.07245, desvio: 0.10902 },
    },
    15: {
        carries: { media: 0.08531, desvio: 0.02906 },
        carriesMetres: { media: 0.14401, desvio: 0.07654 },
        cleanBreaks: { media: 0.10403, desvio: 0.11334 },
        defendersBeaten: { media: 0.10263, desvio: 0.08744 },
        dominantTackles: { media: 0.02157, desvio: 0.05976 },
        kicks: { media: 0.14512, desvio: 0.09617 },
        lineoutsWon: { media: 0.01114, desvio: 0.03379 },
        missedTackles: { media: 0.05075, desvio: 0.04964 },
        offloads: { media: 0.10342, desvio: 0.12181 },
        passes: { media: 0.04423, desvio: 0.02687 },
        penaltiesConceded: { media: 0.03134, desvio: 0.05842 },
        ruckTurnovers: { media: 0.01402, desvio: 0.09658 },
        tackles: { media: 0.01881, desvio: 0.01359 },
        totalTackles: { media: 0.01881, desvio: 0.01361 },
        tries: { media: 0.06522, desvio: 0.13067 },
        tryAssists: { media: 0.09578, desvio: 0.19546 },
        turnoversConceded: { media: 0.1035, desvio: 0.0846 },
        turnoversWon: { media: 0.04242, desvio: 0.08442 },
    },
};

/** La vara de los quince juntos, para el que no trae numero de camiseta. */
export const REFERENCIA_GLOBAL: Readonly<Record<string, Referencia>> = {
    carries: { media: 0.06665, desvio: 0.032 },
    carriesMetres: { media: 0.06887, desvio: 0.06356 },
    cleanBreaks: { media: 0.06674, desvio: 0.10559 },
    defendersBeaten: { media: 0.06757, desvio: 0.07912 },
    dominantTackles: { media: 0.06103, desvio: 0.10523 },
    kicks: { media: 0.07277, desvio: 0.13869 },
    lineoutsWon: { media: 0.05851, desvio: 0.23295 },
    missedTackles: { media: 0.06582, desvio: 0.05997 },
    offloads: { media: 0.06627, desvio: 0.10256 },
    passes: { media: 0.0687, desvio: 0.12557 },
    penaltiesConceded: { media: 0.06085, desvio: 0.08988 },
    ruckTurnovers: { media: 0.04102, desvio: 0.17513 },
    tackles: { media: 0.06403, desvio: 0.0361 },
    totalTackles: { media: 0.06403, desvio: 0.0361 },
    tries: { media: 0.06359, desvio: 0.14219 },
    tryAssists: { media: 0.05924, desvio: 0.16771 },
    turnoversConceded: { media: 0.06832, desvio: 0.07779 },
    turnoversWon: { media: 0.06633, desvio: 0.1144 },
};
