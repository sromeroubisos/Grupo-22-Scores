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
 * Muestra: 1338 partidos, 34182 planillas de 50+ minutos.
 */

export interface Referencia {
    /** La parte del total del equipo que se lleva un jugador normal del puesto. */
    media: number;
    /** Cuanto se dispersa alrededor de la media, en las mismas unidades. */
    desvio: number;
}

/** Partidos que entraron en la medicion. Sube cuando se recalibra. */
export const REFERENCIAS_MUESTRA = {
    partidos: 1338,
    planillas: 34182,
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
export const SESGO = -0.04325;

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
    1: -0.03773,
    2: -0.03055,
    3: -0.01548,
    4: -0.02923,
    5: -0.02854,
    6: -0.02327,
    7: -0.02359,
    8: -0.03322,
    9: -0.12768,
    10: -0.11293,
    11: -0.04493,
    12: -0.03136,
    13: -0.06149,
    14: -0.04794,
    15: -0.03587,
};

/**
 * Lo que hace un equipo PROMEDIO en cada rubro, para el llamador que puntua un
 * jugador suelto y no tiene el plantel a mano. Deja la cuenta en la escala
 * correcta, pero para ese jugador vuelve el sesgo de posesion.
 */
export const TOTAL_DE_EQUIPO: Readonly<Record<string, number>> = {
    carries: 114.46,
    carriesMetres: 412.62,
    cleanBreaks: 5.82,
    defendersBeaten: 21.71,
    dominantTackles: 8.55,
    kicks: 25.42,
    lineoutsWon: 12.83,
    missedTackles: 21.69,
    offloads: 7.78,
    passes: 147.47,
    penaltiesConceded: 9.99,
    ruckTurnovers: 2.69,
    tackles: 133.99,
    totalTackles: 155.69,
    tries: 3.74,
    tryAssists: 2.7,
    turnoversConceded: 14.49,
    turnoversWon: 5.47,
};

export const REFERENCIAS_POR_PUESTO: Readonly<Record<number, Readonly<Record<string, Referencia>>>> = {
    1: {
        carries: { media: 0.06028, desvio: 0.03232 },
        carriesMetres: { media: 0.0237, desvio: 0.02549 },
        cleanBreaks: { media: 0.01178, desvio: 0.05381 },
        defendersBeaten: { media: 0.03249, desvio: 0.05903 },
        dominantTackles: { media: 0.06971, desvio: 0.11219 },
        kicks: { media: 0.00108, desvio: 0.00795 },
        lineoutsWon: { media: 0.00912, desvio: 0.03547 },
        missedTackles: { media: 0.05304, desvio: 0.05916 },
        offloads: { media: 0.02536, desvio: 0.06939 },
        passes: { media: 0.01562, desvio: 0.01404 },
        penaltiesConceded: { media: 0.12884, desvio: 0.12995 },
        ruckTurnovers: { media: 0.03364, desvio: 0.13482 },
        tackles: { media: 0.08221, desvio: 0.03337 },
        totalTackles: { media: 0.07834, desvio: 0.03027 },
        tries: { media: 0.02558, desvio: 0.09885 },
        tryAssists: { media: 0.00753, desvio: 0.06207 },
        turnoversConceded: { media: 0.03, desvio: 0.05428 },
        turnoversWon: { media: 0.05021, desvio: 0.11283 },
    },
    2: {
        carries: { media: 0.07404, desvio: 0.03574 },
        carriesMetres: { media: 0.04695, desvio: 0.03952 },
        cleanBreaks: { media: 0.02928, desvio: 0.08541 },
        defendersBeaten: { media: 0.04227, desvio: 0.06444 },
        dominantTackles: { media: 0.07549, desvio: 0.11274 },
        kicks: { media: 0.00364, desvio: 0.01457 },
        lineoutsWon: { media: 0.00679, desvio: 0.02704 },
        missedTackles: { media: 0.06668, desvio: 0.06612 },
        offloads: { media: 0.04319, desvio: 0.08922 },
        passes: { media: 0.02501, desvio: 0.01804 },
        penaltiesConceded: { media: 0.07328, desvio: 0.10054 },
        ruckTurnovers: { media: 0.0582, desvio: 0.17197 },
        tackles: { media: 0.09198, desvio: 0.03525 },
        totalTackles: { media: 0.08859, desvio: 0.03239 },
        tries: { media: 0.10966, desvio: 0.20287 },
        tryAssists: { media: 0.02214, desvio: 0.10534 },
        turnoversConceded: { media: 0.04887, desvio: 0.06551 },
        turnoversWon: { media: 0.07905, desvio: 0.14186 },
    },
    3: {
        carries: { media: 0.05047, desvio: 0.03127 },
        carriesMetres: { media: 0.01854, desvio: 0.02206 },
        cleanBreaks: { media: 0.00798, desvio: 0.04537 },
        defendersBeaten: { media: 0.01929, desvio: 0.0429 },
        dominantTackles: { media: 0.05751, desvio: 0.09963 },
        kicks: { media: 0.00065, desvio: 0.00587 },
        lineoutsWon: { media: 0.00991, desvio: 0.05287 },
        missedTackles: { media: 0.05596, desvio: 0.05941 },
        offloads: { media: 0.02023, desvio: 0.0648 },
        passes: { media: 0.01433, desvio: 0.01331 },
        penaltiesConceded: { media: 0.12157, desvio: 0.12981 },
        ruckTurnovers: { media: 0.02823, desvio: 0.12154 },
        tackles: { media: 0.07834, desvio: 0.03201 },
        totalTackles: { media: 0.07534, desvio: 0.02951 },
        tries: { media: 0.02323, desvio: 0.09859 },
        tryAssists: { media: 0.0092, desvio: 0.06865 },
        turnoversConceded: { media: 0.02537, desvio: 0.05034 },
        turnoversWon: { media: 0.0377, desvio: 0.10092 },
    },
    4: {
        carries: { media: 0.05823, desvio: 0.03036 },
        carriesMetres: { media: 0.02893, desvio: 0.0284 },
        cleanBreaks: { media: 0.02092, desvio: 0.06819 },
        defendersBeaten: { media: 0.02343, desvio: 0.04331 },
        dominantTackles: { media: 0.07766, desvio: 0.10669 },
        kicks: { media: 0.00166, desvio: 0.00887 },
        lineoutsWon: { media: 0.26979, desvio: 0.19272 },
        missedTackles: { media: 0.05789, desvio: 0.05971 },
        offloads: { media: 0.0425, desvio: 0.08882 },
        passes: { media: 0.0329, desvio: 0.01961 },
        penaltiesConceded: { media: 0.07675, desvio: 0.09668 },
        ruckTurnovers: { media: 0.04788, desvio: 0.14256 },
        tackles: { media: 0.0844, desvio: 0.03065 },
        totalTackles: { media: 0.08086, desvio: 0.02791 },
        tries: { media: 0.02663, desvio: 0.09489 },
        tryAssists: { media: 0.01734, desvio: 0.0899 },
        turnoversConceded: { media: 0.04945, desvio: 0.06283 },
        turnoversWon: { media: 0.06057, desvio: 0.11824 },
    },
    5: {
        carries: { media: 0.06088, desvio: 0.03297 },
        carriesMetres: { media: 0.02937, desvio: 0.02982 },
        cleanBreaks: { media: 0.0177, desvio: 0.05854 },
        defendersBeaten: { media: 0.02577, desvio: 0.04663 },
        dominantTackles: { media: 0.07541, desvio: 0.10378 },
        kicks: { media: 0.00136, desvio: 0.00864 },
        lineoutsWon: { media: 0.23985, desvio: 0.20174 },
        missedTackles: { media: 0.05675, desvio: 0.05772 },
        offloads: { media: 0.04458, desvio: 0.08999 },
        passes: { media: 0.03059, desvio: 0.01911 },
        penaltiesConceded: { media: 0.074, desvio: 0.09326 },
        ruckTurnovers: { media: 0.04547, desvio: 0.14123 },
        tackles: { media: 0.08324, desvio: 0.03069 },
        totalTackles: { media: 0.07974, desvio: 0.02836 },
        tries: { media: 0.03221, desvio: 0.10316 },
        tryAssists: { media: 0.01771, desvio: 0.08925 },
        turnoversConceded: { media: 0.04462, desvio: 0.06105 },
        turnoversWon: { media: 0.05947, desvio: 0.11789 },
    },
    6: {
        carries: { media: 0.06606, desvio: 0.03281 },
        carriesMetres: { media: 0.04929, desvio: 0.04046 },
        cleanBreaks: { media: 0.03939, desvio: 0.08966 },
        defendersBeaten: { media: 0.04859, desvio: 0.06566 },
        dominantTackles: { media: 0.09183, desvio: 0.11191 },
        kicks: { media: 0.00531, desvio: 0.02802 },
        lineoutsWon: { media: 0.20923, desvio: 0.20449 },
        missedTackles: { media: 0.06298, desvio: 0.05892 },
        offloads: { media: 0.05269, desvio: 0.0936 },
        passes: { media: 0.03392, desvio: 0.02788 },
        penaltiesConceded: { media: 0.0711, desvio: 0.09162 },
        ruckTurnovers: { media: 0.06756, desvio: 0.1722 },
        tackles: { media: 0.08857, desvio: 0.03386 },
        totalTackles: { media: 0.08515, desvio: 0.03078 },
        tries: { media: 0.04778, desvio: 0.12228 },
        tryAssists: { media: 0.02908, desvio: 0.11278 },
        turnoversConceded: { media: 0.05575, desvio: 0.06799 },
        turnoversWon: { media: 0.09854, desvio: 0.15253 },
    },
    7: {
        carries: { media: 0.06572, desvio: 0.03193 },
        carriesMetres: { media: 0.05048, desvio: 0.04306 },
        cleanBreaks: { media: 0.04421, desvio: 0.09687 },
        defendersBeaten: { media: 0.05011, desvio: 0.06548 },
        dominantTackles: { media: 0.09319, desvio: 0.11335 },
        kicks: { media: 0.00453, desvio: 0.01508 },
        lineoutsWon: { media: 0.1618, desvio: 0.19489 },
        missedTackles: { media: 0.06513, desvio: 0.06159 },
        offloads: { media: 0.05546, desvio: 0.09688 },
        passes: { media: 0.03356, desvio: 0.01984 },
        penaltiesConceded: { media: 0.07135, desvio: 0.08947 },
        ruckTurnovers: { media: 0.07036, desvio: 0.16772 },
        tackles: { media: 0.09601, desvio: 0.034 },
        totalTackles: { media: 0.09188, desvio: 0.03083 },
        tries: { media: 0.05792, desvio: 0.13664 },
        tryAssists: { media: 0.03262, desvio: 0.11812 },
        turnoversConceded: { media: 0.05749, desvio: 0.06814 },
        turnoversWon: { media: 0.11649, desvio: 0.16302 },
    },
    8: {
        carries: { media: 0.10758, desvio: 0.0402 },
        carriesMetres: { media: 0.09753, desvio: 0.05697 },
        cleanBreaks: { media: 0.04734, desvio: 0.09971 },
        defendersBeaten: { media: 0.09684, desvio: 0.08957 },
        dominantTackles: { media: 0.08778, desvio: 0.10997 },
        kicks: { media: 0.00483, desvio: 0.01522 },
        lineoutsWon: { media: 0.08871, desvio: 0.13482 },
        missedTackles: { media: 0.06118, desvio: 0.05868 },
        offloads: { media: 0.08102, desvio: 0.11928 },
        passes: { media: 0.03659, desvio: 0.02157 },
        penaltiesConceded: { media: 0.07207, desvio: 0.09209 },
        ruckTurnovers: { media: 0.06973, desvio: 0.16921 },
        tackles: { media: 0.08871, desvio: 0.03182 },
        totalTackles: { media: 0.08504, desvio: 0.02923 },
        tries: { media: 0.07221, desvio: 0.1527 },
        tryAssists: { media: 0.0314, desvio: 0.11757 },
        turnoversConceded: { media: 0.06702, desvio: 0.07432 },
        turnoversWon: { media: 0.09901, desvio: 0.14612 },
    },
    9: {
        carries: { media: 0.04748, desvio: 0.02768 },
        carriesMetres: { media: 0.06026, desvio: 0.05425 },
        cleanBreaks: { media: 0.06679, desvio: 0.12216 },
        defendersBeaten: { media: 0.05823, desvio: 0.07455 },
        dominantTackles: { media: 0.02751, desvio: 0.06506 },
        kicks: { media: 0.39627, desvio: 0.16359 },
        lineoutsWon: { media: 0.00757, desvio: 0.03055 },
        missedTackles: { media: 0.07571, desvio: 0.06867 },
        offloads: { media: 0.08632, desvio: 0.125 },
        passes: { media: 0.44398, desvio: 0.11539 },
        penaltiesConceded: { media: 0.03699, desvio: 0.06823 },
        ruckTurnovers: { media: 0.06338, desvio: 0.17685 },
        tackles: { media: 0.04307, desvio: 0.02434 },
        totalTackles: { media: 0.04769, desvio: 0.02331 },
        tries: { media: 0.08173, desvio: 0.1678 },
        tryAssists: { media: 0.2003, desvio: 0.30002 },
        turnoversConceded: { media: 0.08885, desvio: 0.08583 },
        turnoversWon: { media: 0.05208, desvio: 0.11277 },
    },
    10: {
        carries: { media: 0.06055, desvio: 0.02936 },
        carriesMetres: { media: 0.07474, desvio: 0.05791 },
        cleanBreaks: { media: 0.06636, desvio: 0.11704 },
        defendersBeaten: { media: 0.0806, desvio: 0.08225 },
        dominantTackles: { media: 0.02724, desvio: 0.0622 },
        kicks: { media: 0.28726, desvio: 0.1451 },
        lineoutsWon: { media: 0.00916, desvio: 0.03068 },
        missedTackles: { media: 0.07968, desvio: 0.06578 },
        offloads: { media: 0.07548, desvio: 0.10928 },
        passes: { media: 0.13193, desvio: 0.05397 },
        penaltiesConceded: { media: 0.03128, desvio: 0.06006 },
        ruckTurnovers: { media: 0.05281, desvio: 0.14882 },
        tackles: { media: 0.04402, desvio: 0.02369 },
        totalTackles: { media: 0.04912, desvio: 0.02311 },
        tries: { media: 0.03985, desvio: 0.11245 },
        tryAssists: { media: 0.14471, desvio: 0.24494 },
        turnoversConceded: { media: 0.10083, desvio: 0.08701 },
        turnoversWon: { media: 0.03713, desvio: 0.08824 },
    },
    11: {
        carries: { media: 0.06258, desvio: 0.02582 },
        carriesMetres: { media: 0.11405, desvio: 0.07157 },
        cleanBreaks: { media: 0.16624, desvio: 0.16995 },
        defendersBeaten: { media: 0.1121, desvio: 0.0972 },
        dominantTackles: { media: 0.05519, desvio: 0.08933 },
        kicks: { media: 0.04321, desvio: 0.05047 },
        lineoutsWon: { media: 0.00213, desvio: 0.01348 },
        missedTackles: { media: 0.06356, desvio: 0.05781 },
        offloads: { media: 0.077, desvio: 0.10763 },
        passes: { media: 0.02322, desvio: 0.01651 },
        penaltiesConceded: { media: 0.039, desvio: 0.06543 },
        ruckTurnovers: { media: 0.07339, desvio: 0.17103 },
        tackles: { media: 0.03243, desvio: 0.01853 },
        totalTackles: { media: 0.03691, desvio: 0.01829 },
        tries: { media: 0.11264, desvio: 0.17913 },
        tryAssists: { media: 0.04953, desvio: 0.14614 },
        turnoversConceded: { media: 0.09221, desvio: 0.0816 },
        turnoversWon: { media: 0.0554, desvio: 0.10645 },
    },
    12: {
        carries: { media: 0.07367, desvio: 0.02918 },
        carriesMetres: { media: 0.07364, desvio: 0.05141 },
        cleanBreaks: { media: 0.07369, desvio: 0.11797 },
        defendersBeaten: { media: 0.08864, desvio: 0.08576 },
        dominantTackles: { media: 0.05846, desvio: 0.09151 },
        kicks: { media: 0.03565, desvio: 0.04997 },
        lineoutsWon: { media: 0.0072, desvio: 0.02529 },
        missedTackles: { media: 0.0762, desvio: 0.06401 },
        offloads: { media: 0.08294, desvio: 0.1127 },
        passes: { media: 0.05317, desvio: 0.02881 },
        penaltiesConceded: { media: 0.04822, desvio: 0.07292 },
        ruckTurnovers: { media: 0.06468, desvio: 0.16429 },
        tackles: { media: 0.06188, desvio: 0.02545 },
        totalTackles: { media: 0.06405, desvio: 0.02382 },
        tries: { media: 0.04708, desvio: 0.11956 },
        tryAssists: { media: 0.07395, desvio: 0.1771 },
        turnoversConceded: { media: 0.06118, desvio: 0.0681 },
        turnoversWon: { media: 0.06347, desvio: 0.11768 },
    },
    13: {
        carries: { media: 0.06103, desvio: 0.02664 },
        carriesMetres: { media: 0.07769, desvio: 0.05924 },
        cleanBreaks: { media: 0.09518, desvio: 0.13689 },
        defendersBeaten: { media: 0.0851, desvio: 0.08422 },
        dominantTackles: { media: 0.05292, desvio: 0.08616 },
        kicks: { media: 0.03058, desvio: 0.04305 },
        lineoutsWon: { media: 0.00196, desvio: 0.01405 },
        missedTackles: { media: 0.07711, desvio: 0.06513 },
        offloads: { media: 0.0827, desvio: 0.11393 },
        passes: { media: 0.0334, desvio: 0.02399 },
        penaltiesConceded: { media: 0.04416, desvio: 0.07329 },
        ruckTurnovers: { media: 0.07203, desvio: 0.16928 },
        tackles: { media: 0.05137, desvio: 0.02291 },
        totalTackles: { media: 0.05511, desvio: 0.02185 },
        tries: { media: 0.07112, desvio: 0.14394 },
        tryAssists: { media: 0.05622, desvio: 0.15164 },
        turnoversConceded: { media: 0.06571, desvio: 0.07159 },
        turnoversWon: { media: 0.06117, desvio: 0.11181 },
    },
    14: {
        carries: { media: 0.06135, desvio: 0.02715 },
        carriesMetres: { media: 0.1077, desvio: 0.06987 },
        cleanBreaks: { media: 0.15946, desvio: 0.16601 },
        defendersBeaten: { media: 0.10995, desvio: 0.09755 },
        dominantTackles: { media: 0.06273, desvio: 0.0935 },
        kicks: { media: 0.0406, desvio: 0.04612 },
        lineoutsWon: { media: 0.00232, desvio: 0.014 },
        missedTackles: { media: 0.07125, desvio: 0.05991 },
        offloads: { media: 0.08401, desvio: 0.1136 },
        passes: { media: 0.02402, desvio: 0.01811 },
        penaltiesConceded: { media: 0.03933, desvio: 0.06506 },
        ruckTurnovers: { media: 0.0822, desvio: 0.17873 },
        tackles: { media: 0.03761, desvio: 0.01909 },
        totalTackles: { media: 0.04241, desvio: 0.01851 },
        tries: { media: 0.12315, desvio: 0.18136 },
        tryAssists: { media: 0.04493, desvio: 0.13218 },
        turnoversConceded: { media: 0.09696, desvio: 0.08653 },
        turnoversWon: { media: 0.06451, desvio: 0.11302 },
    },
    15: {
        carries: { media: 0.08274, desvio: 0.03011 },
        carriesMetres: { media: 0.13662, desvio: 0.07567 },
        cleanBreaks: { media: 0.11217, desvio: 0.14353 },
        defendersBeaten: { media: 0.10843, desvio: 0.09026 },
        dominantTackles: { media: 0.02081, desvio: 0.05421 },
        kicks: { media: 0.14808, desvio: 0.09817 },
        lineoutsWon: { media: 0.00964, desvio: 0.02897 },
        missedTackles: { media: 0.05118, desvio: 0.05186 },
        offloads: { media: 0.10132, desvio: 0.12285 },
        passes: { media: 0.04626, desvio: 0.02656 },
        penaltiesConceded: { media: 0.03248, desvio: 0.05833 },
        ruckTurnovers: { media: 0.04573, desvio: 0.13463 },
        tackles: { media: 0.01924, desvio: 0.01373 },
        totalTackles: { media: 0.02388, desvio: 0.0146 },
        tries: { media: 0.06658, desvio: 0.13471 },
        tryAssists: { media: 0.0964, desvio: 0.19913 },
        turnoversConceded: { media: 0.1042, desvio: 0.08566 },
        turnoversWon: { media: 0.03544, desvio: 0.08278 },
    },
};

/** La vara de los quince juntos, para el que no trae numero de camiseta. */
export const REFERENCIA_GLOBAL: Readonly<Record<string, Referencia>> = {
    carries: { media: 0.06675, desvio: 0.03353 },
    carriesMetres: { media: 0.06904, desvio: 0.06259 },
    cleanBreaks: { media: 0.06802, desvio: 0.12439 },
    defendersBeaten: { media: 0.06843, desvio: 0.08264 },
    dominantTackles: { media: 0.0617, desvio: 0.09779 },
    kicks: { media: 0.07306, desvio: 0.13791 },
    lineoutsWon: { media: 0.06986, desvio: 0.14727 },
    missedTackles: { media: 0.06598, desvio: 0.0618 },
    offloads: { media: 0.06643, desvio: 0.10692 },
    passes: { media: 0.06883, desvio: 0.11436 },
    penaltiesConceded: { media: 0.06124, desvio: 0.09025 },
    ruckTurnovers: { media: 0.05992, desvio: 0.16072 },
    tackles: { media: 0.06426, desvio: 0.03684 },
    totalTackles: { media: 0.06465, desvio: 0.0329 },
    tries: { media: 0.06407, desvio: 0.14486 },
    tryAssists: { media: 0.05935, desvio: 0.16826 },
    turnoversConceded: { media: 0.06862, desvio: 0.07716 },
    turnoversWon: { media: 0.0652, desvio: 0.12323 },
};
