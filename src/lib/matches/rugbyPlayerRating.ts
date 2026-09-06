/**
 * EL PUNTAJE DEL JUGADOR EN UN PARTIDO DE RUGBY.
 *
 * Todos arrancan en 6 —el partido correcto, sin nada que destacar ni nada que
 * reprochar— y de ahi se mueven segun lo que hicieron en la cancha. No es un
 * promedio de estadisticas: cada rubro vale distinto segun el puesto, porque
 * ocho tackles de un pilar y ocho de un wing no cuentan la misma historia.
 *
 * La cuenta es determinista y pura: mismas estadisticas y mismos minutos dan
 * el mismo puntaje siempre. No lee reloj, ni entorno, ni azar.
 *
 * OJO con el nombre: `matchPlayerRatings.ts` es OTRA cosa —el semaforo de 1 a 3
 * que votan los usuarios—. Esto no vota nadie: sale de la planilla.
 *
 * ── LO QUE ESTO NO ES ───────────────────────────────────────────────────────
 * Los valores de `RUBROS` estan calibrados a mano contra partidos reales,
 * no salen de percentiles. Un percentil por puesto seria mejor —diria "este
 * flanker esta en el 90 de los flankers"— pero necesita una poblacion que hoy
 * no tenemos. Cuando este, se reemplazan las referencias y el resto no se toca.
 */

/** Los cinco ejes en los que se lee un partido. */
export type RatingComponent = 'ataque' | 'defensa' | 'impacto' | 'juego' | 'disciplina';

export const RATING_COMPONENTS: readonly RatingComponent[] = [
    'ataque', 'defensa', 'impacto', 'juego', 'disciplina',
];

/**
 * El puesto sale del numero de camiseta, que en rugby lo dice sin ambiguedad.
 * RugbyPass no publica la posicion y no hay que inventarla.
 *
 * Del 16 al 23 se asume el banco estandar de una convocatoria de 23. No es
 * infalible —un banco 6-2 mueve los numeros—, pero es la lectura correcta en
 * la enorme mayoria de los partidos y falla hacia el grupo vecino, no lejos.
 */
export const PUESTO_POR_NUMERO: Readonly<Record<number, number>> = {
    1: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 7: 7, 8: 8,
    9: 9, 10: 10, 11: 11, 12: 12, 13: 13, 14: 14, 15: 15,
    16: 2, 17: 1, 18: 3, 19: 4, 20: 6, 21: 9, 22: 10, 23: 13,
};

/**
 * Cuanto pesa cada eje en cada puesto. Suman 100 por fila —lo verifica un test.
 *
 * Un 7 vive del tackle; un 10, del juego. La tabla es lo que hace que el
 * puntaje hable de rugby y no de una planilla.
 *
 * Es la tabla del Rugby Player Rating v1.0. No se toca al voleo: mover una
 * fila cambia todos los puntajes de ese puesto, en todos los partidos.
 */
export const PESOS_POR_PUESTO: Readonly<Record<number, Readonly<Record<RatingComponent, number>>>> = {
    1: { ataque: 15, defensa: 35, impacto: 30, juego: 5, disciplina: 15 },
    2: { ataque: 18, defensa: 27, impacto: 25, juego: 15, disciplina: 15 },
    3: { ataque: 15, defensa: 35, impacto: 30, juego: 5, disciplina: 15 },
    4: { ataque: 12, defensa: 30, impacto: 32, juego: 11, disciplina: 15 },
    5: { ataque: 12, defensa: 30, impacto: 32, juego: 11, disciplina: 15 },
    6: { ataque: 20, defensa: 32, impacto: 28, juego: 8, disciplina: 12 },
    7: { ataque: 18, defensa: 37, impacto: 27, juego: 8, disciplina: 10 },
    8: { ataque: 25, defensa: 25, impacto: 32, juego: 8, disciplina: 10 },
    9: { ataque: 18, defensa: 15, impacto: 12, juego: 45, disciplina: 10 },
    10: { ataque: 25, defensa: 10, impacto: 12, juego: 43, disciplina: 10 },
    11: { ataque: 38, defensa: 20, impacto: 30, juego: 4, disciplina: 8 },
    12: { ataque: 30, defensa: 27, impacto: 25, juego: 10, disciplina: 8 },
    13: { ataque: 30, defensa: 27, impacto: 28, juego: 8, disciplina: 7 },
    14: { ataque: 38, defensa: 20, impacto: 30, juego: 4, disciplina: 8 },
    15: { ataque: 30, defensa: 20, impacto: 22, juego: 20, disciplina: 8 },
};

/**
 * Cuanto mueve el puntaje UNA unidad de cada rubro, por 80 minutos y antes de
 * pesarlo por el puesto.
 *
 * `lineoutsWon` cae en `impacto` y no en `juego` a proposito: el line es del
 * paquete, y `juego` pesa 11 en un segunda linea. Puesto ahi, el salto de un
 * lock contaria menos que un pase de un apertura, que es al reves de como se
 * juega. Cuando existan Lineout Takes y Stolen, el set piece se merece un eje
 * propio y este parche se cae solo.
 *
 * EL TACKLE NO SE PREMIA POR CANTIDAD. `tackles` suma y `missedTackles` resta,
 * asi que lo que queda es la eficiencia pesada por volumen: 17 tackles con 5
 * errados rinden menos que 12 sin ninguno. Es la misma idea que la Tackle
 * Completion del v1.0, expresada en una escala que no necesita percentiles.
 *
 * LAS TARJETAS pegan mas fuerte que el -8 y el -25 del v1.0. No es un desacato:
 * alla esos numeros viven DENTRO del eje disciplina, que despues se pesa por
 * 8-15%, asi que una amarilla terminaba moviendo centesimas. Aca el castigo es
 * directo sobre el puntaje. Transcribir la constante sin la cañeria de atras
 * daba una amarilla gratis.
 */
/**
 * Como se lee un rubro. No todos cuentan igual y meterlos en la misma bolsa es
 * el error que infla cualquier puntaje.
 *
 * - `volumen`: lo que TODOS hacen, mas o menos. Avances, tackles, pases. Se
 *   centra en el promedio: hacer lo normal no suma ni resta, y por debajo se
 *   pierde. Es el unico que puede dar negativo por hacer poco.
 * - `bonus`: lo que NO todos hacen. Un try, un quiebre, un robo. No hacerlo es
 *   lo normal y no se castiga; hacerlo levanta el partido.
 * - `castigo`: el error que todos cometen un poco. Se centra igual que el
 *   volumen y solo resta el EXCESO. Lo pedia una auditoria: con el castigo sin
 *   centrar, un tackle errado costaba tres tackles y medio, asi que un jugador
 *   con la eficiencia promedio del partido ya arrancaba en rojo. De Lutiis
 *   metia 15 tackles en 28 minutos y salia 4,2.
 * - `falta`: la sancion. Esa no se centra ni se perdona: una amarilla no tiene
 *   promedio contra el cual medirse, y si se centrara la primera saldria gratis.
 */
export type TipoDeRubro = 'volumen' | 'bonus' | 'castigo' | 'falta';

export interface RubroRating {
    componente: RatingComponent;
    tipo: TipoDeRubro;
    /**
     * La vara, en ochenta minutos. Para `volumen` es lo que hace un jugador
     * PROMEDIO —no un partidazo—; para `bonus` y `castigo`, una unidad de peso.
     */
    referencia: number;
    /** Cuanto mueve el puntaje quedar una vara por encima (o, en castigo, una vara). */
    aporte: number;
    /**
     * Si la vara se achica para el que jugo menos. El volumen si —cuatro
     * tackles en media hora es el ritmo de doce en el partido—; los hechos
     * puntuales no: una amarilla es una amarilla, entro al minuto 5 o al 75, y
     * prorratearla convertiria un cameo en una expulsion.
     */
    porTiempo?: false;
}

/*
 * Las referencias de volumen y de castigo NO son a ojo: salen de medir la tasa
 * por 80 minutos de los 77 jugadores con veinte minutos o mas de dos partidos
 * de Rugby Championship. Ahi aparecio que `carriesMetres` estaba en 16 cuando
 * la mediana real es 21,6 —medio punto regalado a casi todo el plantel, que era
 * lo que empujaba el promedio del partido por encima de la base.
 *
 * Cuando haya poblacion de verdad, esto es lo primero que se recalcula.
 */
export const RUBROS: Readonly<Record<string, RubroRating>> = {
    tries: { componente: 'ataque', tipo: 'bonus', referencia: 1, aporte: 0.95, porTiempo: false },
    tryAssists: { componente: 'ataque', tipo: 'bonus', referencia: 1, aporte: 0.55, porTiempo: false },
    cleanBreaks: { componente: 'impacto', tipo: 'bonus', referencia: 1, aporte: 0.50, porTiempo: false },
    offloads: { componente: 'impacto', tipo: 'bonus', referencia: 2, aporte: 0.30 },
    defendersBeaten: { componente: 'impacto', tipo: 'bonus', referencia: 3, aporte: 0.40 },
    lineoutsWon: { componente: 'impacto', tipo: 'bonus', referencia: 3, aporte: 0.35 },
    turnoversWon: { componente: 'defensa', tipo: 'bonus', referencia: 1, aporte: 0.45, porTiempo: false },
    ruckTurnovers: { componente: 'defensa', tipo: 'bonus', referencia: 1, aporte: 0.30, porTiempo: false },
    dominantTackles: { componente: 'defensa', tipo: 'bonus', referencia: 2, aporte: 0.40 },

    carries: { componente: 'impacto', tipo: 'volumen', referencia: 8, aporte: 0.55 },
    carriesMetres: { componente: 'impacto', tipo: 'volumen', referencia: 22, aporte: 0.50 },
    tackles: { componente: 'defensa', tipo: 'volumen', referencia: 10, aporte: 0.70 },
    passes: { componente: 'juego', tipo: 'volumen', referencia: 6, aporte: 0.60 },
    kicks: { componente: 'juego', tipo: 'bonus', referencia: 4, aporte: 0.30 },

    missedTackles: { componente: 'defensa', tipo: 'castigo', referencia: 2, aporte: 0.70 },
    turnoversConceded: { componente: 'disciplina', tipo: 'castigo', referencia: 1.2, aporte: 0.60 },
    penaltiesConceded: { componente: 'disciplina', tipo: 'castigo', referencia: 1, aporte: 0.60 },
    yellowCards: { componente: 'disciplina', tipo: 'falta', referencia: 1, aporte: 1.00, porTiempo: false },
    redCards: { componente: 'disciplina', tipo: 'falta', referencia: 1, aporte: 2.40, porTiempo: false },
};

const TOPE_POR_RUBRO = 2.0;

/** Ningun eje decide el puntaje solo: un partido se gana en varios. */
const TOPE_POR_EJE = 1.8;

/**
 * Cuanto puede amplificar el peso del puesto.
 *
 * Lo encontro una auditoria contra Argentina-Australia: Ben Donaldson salia
 * primero del partido (8,9) con 3 avances, 8 tackles y 10 pases, por encima de
 * McReight, que hizo 25 tackles sin errar uno, 9 avances, 43 metros y un try.
 *
 * La cuenta explicaba por que. `juego` pesa 43-45 en el 9 y en el 10, contra un
 * promedio de 13,7 entre los quince: multiplicador 3,3, el UNICO eje que se
 * dispara asi. Y es el eje que peor medimos —la tabla lo penso con Pass
 * Accuracy, kicking success y try assists, y de todo eso solo tenemos volumen
 * crudo de pases y patadas—. Amplificar por 3,3 dos medidas crudas no mide
 * mejor al apertura: le regala puntos por tocar la pelota.
 *
 * El tope deja intacto lo que la tabla queria decir —el 7 cobra sus tackles 1,5
 * veces y el 10 los cobra 0,4— y solo corta el caso patologico. Cuando entren
 * las metricas de calidad de `juego`, este tope se puede levantar.
 */
const TOPE_DEL_FACTOR = 1.8;

/**
 * Las tarjetas quedan FUERA del tope del eje.
 *
 * Lo encontro un test: con el tope puesto, una amarilla y una roja daban el
 * mismo 4,2 —las dos se pasaban de 1,8 y quedaban planchadas contra el techo—.
 * Y una roja tiene que hundir mas que una amarilla siempre, en cualquier
 * partido y en cualquier puesto. El tope existe para que ningun eje GANE el
 * partido solo; una expulsion si puede perderlo sola, que es como se juega.
 */
const FUERA_DEL_TOPE = new Set(['yellowCards', 'redCards']);

/**
 * El piso de la referencia prorrateada.
 *
 * A un suplente de seis minutos no se le pide el volumen de un titular, pero
 * tampoco se lo juzga con la vara de seis minutos: dos avances le darian un
 * diez. Por debajo de esto la vara deja de achicarse.
 */
const MINUTOS_MINIMOS_DE_VARA = 25;

/**
 * Con cuantos minutos el partido cuenta entero.
 *
 * Achicar la vara hace que el juicio sea JUSTO; esto hace que sea HONESTO. Seis
 * minutos no alcanzan para decir que alguien jugo mal: alcanzan para decir que
 * casi no jugo. Por debajo de este umbral el puntaje se acerca a la base en la
 * proporcion que falta, que es el encogimiento hacia el promedio de toda la
 * vida —y el que evita que un cameo termine primero o ultimo de la tabla.
 */
const MINUTOS_PARA_CONFIANZA = 30;

/**
 * El peso del puesto se lee RELATIVO al promedio de los quince, no en bruto.
 *
 * En bruto, cualquier peso (10%, 35%) achicaria el puntaje de todos: la tabla
 * reparte cien puntos, no multiplica. Dividido por el promedio del eje, un 7
 * cobra sus tackles 1,4 veces y un 10 los cobra 0,4 —que es lo que la tabla
 * quiere decir— y la escala queda donde estaba.
 */
const PROMEDIO_DEL_EJE: Readonly<Record<RatingComponent, number>> = (() => {
    const puestos = Object.values(PESOS_POR_PUESTO);
    const salida = {} as Record<RatingComponent, number>;
    for (const eje of RATING_COMPONENTS) {
        salida[eje] = puestos.reduce((suma, pesos) => suma + pesos[eje], 0) / puestos.length;
    }
    return salida;
})();

/**
 * Los rubros sin los cuales NO se puede puntuar.
 *
 * Son los de volumen: el puntaje se construye sobre ellos y un ausente no se
 * distingue de un cero. Si `passes` no llego, todo el plantel aparece como si
 * no hubiera pasado la pelota nunca y el eje juego se desploma parejo —un
 * puntaje que se ve prolijo y no dice nada. Mejor no puntuar.
 */
export const RUBROS_IMPRESCINDIBLES = Object.entries(RUBROS)
    .filter(([, rubro]) => rubro.tipo === 'volumen')
    .map(([metricId]) => metricId);

/**
 * Si la planilla alcanza para puntuar.
 *
 * `rubros` son las metricas que llegaron para el partido, no las de un jugador:
 * la pregunta es si la FUENTE contesto entera, no si tal jugador hizo algo.
 */
export function hayPlanillaParaPuntuar(rubros: Iterable<string>) {
    const presentes = new Set(rubros);
    return RUBROS_IMPRESCINDIBLES.every((metricId) => presentes.has(metricId));
}

/** El puntaje de un partido correcto y sin sobresaltos. */
export const RATING_BASE = 6;

/** Hasta donde llega la escala. El 10 y el 1 existen, pero cuestan. */
const TOPE = { min: 1, max: 10 } as const;

export interface RugbyRatingInput {
    /** Los rubros del partido, en los ids de metrica de la tabla de jugadores. */
    stats: Readonly<Record<string, number>>;
    /** Minutos en cancha. Sin esto no hay tasa por 80 y no hay puntaje. */
    minutes: number | null;
    /** Numero de camiseta: de aca sale el puesto. */
    number: number | null;
}

export interface RugbyRating {
    /** El puntaje, de 1 a 10 con un decimal. */
    value: number;
    /** Cuanto aporto cada eje, ya pesado por el puesto. Sirve para explicar el numero. */
    components: Record<RatingComponent, number>;
    /** El puesto que se le adjudico, o null si no habia numero. */
    position: number | null;
    minutes: number;
}

/**
 * El puntaje de un jugador en un partido.
 *
 * Devuelve `null` cuando no hay con que calcularlo: sin minutos en cancha no
 * hay partido que puntuar, y un suplente que no entro no lleva puntaje. Es
 * distinto de un 6, que dice "jugo y estuvo correcto".
 */
export function rateRugbyPlayer(input: RugbyRatingInput): RugbyRating | null {
    const minutes = input.minutes ?? 0;
    if (minutes <= 0) return null;

    const puesto = input.number != null ? PUESTO_POR_NUMERO[input.number] ?? null : null;
    const pesos = puesto != null ? PESOS_POR_PUESTO[puesto] : null;

    const components: Record<RatingComponent, number> = {
        ataque: 0, defensa: 0, impacto: 0, juego: 0, disciplina: 0,
    };
    let tarjetas = 0;

    // La vara se achica con los minutos en vez de estirar lo hecho hasta los
    // ochenta. Es la diferencia entre "rindio como para doce tackles" y "si
    // seguia a este ritmo hacia treinta": lo segundo es una proyeccion, y una
    // proyeccion sobre diez minutos no es una calificacion.
    const prorrateo = Math.max(MINUTOS_MINIMOS_DE_VARA, Math.min(80, minutes)) / 80;

    for (const [metricId, rubro] of Object.entries(RUBROS)) {
        const bruto = input.stats[metricId] ?? 0;
        if (!Number.isFinite(bruto)) continue;
        // Un rubro de volumen en cero SI cuenta: no hacer un solo tackle en
        // ochenta minutos es informacion. Los otros dos, en cero, no dicen nada.
        if (bruto === 0 && rubro.tipo !== 'volumen') continue;

        const referencia = rubro.porTiempo === false
            ? rubro.referencia
            : rubro.referencia * prorrateo;
        const nivel = Math.min(TOPE_POR_RUBRO, bruto / referencia);

        // El volumen se centra en el promedio —hacer lo normal no suma ni resta—,
        // el castigo tambien pero solo hacia abajo, el bonus solo levanta y la
        // falta hunde entera desde la primera.
        const bruto_aporte = rubro.tipo === 'volumen' ? (nivel - 1) * rubro.aporte
            : rubro.tipo === 'castigo' ? -Math.max(0, nivel - 1) * rubro.aporte
            : rubro.tipo === 'falta' ? -nivel * rubro.aporte
            : nivel * rubro.aporte;

        // Sin numero de camiseta no hay puesto, y el rubro cuenta sin pesar:
        // mejor un puntaje neutro que adivinar donde jugo.
        const factor = pesos
            ? Math.min(TOPE_DEL_FACTOR, pesos[rubro.componente] / PROMEDIO_DEL_EJE[rubro.componente])
            : 1;
        if (FUERA_DEL_TOPE.has(metricId)) tarjetas += bruto_aporte * factor;
        else components[rubro.componente] += bruto_aporte * factor;
    }

    for (const eje of RATING_COMPONENTS) {
        components[eje] = Math.max(-TOPE_POR_EJE, Math.min(TOPE_POR_EJE, components[eje]));
    }
    // Recien despues del tope, para que la expulsion no se planche contra el.
    components.disciplina += tarjetas;

    const confianza = Math.min(1, minutes / MINUTOS_PARA_CONFIANZA);
    const delta = RATING_COMPONENTS.reduce((suma, eje) => suma + components[eje], 0) * confianza;
    const crudo = RATING_BASE + delta;

    return {
        value: Math.round(Math.min(TOPE.max, Math.max(TOPE.min, crudo)) * 10) / 10,
        components,
        position: puesto,
        minutes,
    };
}

/**
 * Los minutos que jugo, leidos de la alineacion.
 *
 * Un titular sin minuto de salida jugo los ochenta; uno que salio, hasta ahi.
 * Un suplente juega desde que entro hasta que sale o hasta el final. El que no
 * entro devuelve 0, que `rateRugbyPlayer` lee como "sin puntaje".
 */
export function minutesFromLineup(
    player: { role: 'starter' | 'substitute'; onMinute: number | null; offMinute: number | null },
    matchMinutes = 80
) {
    const desde = player.role === 'starter' ? 0 : player.onMinute;
    if (desde == null) return 0;
    const hasta = player.offMinute ?? matchMinutes;
    return Math.max(0, Math.min(matchMinutes, hasta) - Math.min(matchMinutes, desde));
}
