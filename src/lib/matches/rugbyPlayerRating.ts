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
 * ── CONTRA QUE SE COMPARA CADA JUGADOR (v2) ─────────────────────────────────
 * Cada rubro se lee contra la vara DE SU PUESTO, no contra una vara unica.
 *
 * La v1 comparaba a los quince contra la misma referencia global, y el
 * resultado estaba medido sobre 60.339 puntajes: el pilar derecho promediaba
 * 5,32 y el apertura 7,81. Dos puntos y pico de diferencia que no describian a
 * nadie —describian el puesto—. Y la tabla de pesos no podia salvarlo, porque
 * el peso multiplica pero no cambia el signo: a un pilar con pocos pases, el 5%
 * de `juego` le achicaba una perdida garantizada sin darle ninguna ganancia.
 *
 * Con la vara por puesto, el pilar promedio da 6 y el apertura promedio da 6.
 * Los pesos pasan a hacer lo unico que tenian que hacer: decidir QUE mueve la
 * nota de cada puesto, no si el puesto entero vive arriba o abajo.
 *
 * ── Y POR QUE TAMBIEN SE CENTRAN LOS BONUS ──────────────────────────────────
 * La v1 tenia rubros que solo sumaban: el try, el quiebre, el offload. Sonaba
 * justo —no marcar un try no es una falla— pero convertia la pelota en una
 * renta: el 8 promediaba 7,45 y la segunda linea 6,04 con pesos casi iguales, y
 * la diferencia no salia de la tabla sino de que uno junta quiebres y el otro
 * no. Una ventaja que solo suma no la corrige ningun peso.
 *
 * Centrado por puesto, el wing que no marco no queda en falta: queda donde
 * corresponde, que es en el promedio de los wings. Marcar levanta; no marcar es
 * el partido normal y vale 6. Lo que ya no pasa es que llegue a 7 por ser wing.
 *
 * ── LA PARTE DEL EQUIPO, NO EL CONTEO (v3) ──────────────────────────────────
 * Cada rubro se mide como la PARTE que el jugador se llevo del total de su
 * equipo, no como cuanto hizo.
 *
 * Con conteos crudos, el puntaje medido sobre 2.634 planteles seguia el volumen
 * del equipo: la correlacion entre los pases de un equipo y su puntaje medio
 * era r = 0,726 —la mitad de la varianza—. Los pases, los avances, los metros y
 * los quiebres son todos proporcionales a la posesion, asi que un equipo que
 * elige jugar sin la pelota mandaba a sus quince jugadores debajo de la vara
 * por ejecutar el plan que ganaba el partido. Sudafrica le gano 29-24 a Nueva
 * Zelanda con el 44% de la pelota y 150 tackles, y promediaba 0,67 menos.
 *
 * En partes, eso desaparece solo: un apertura se lleva una quinta parte de los
 * pases de su equipo tenga el equipo 105 o 182, y un pilar una cincuentava. Y
 * se lleva puesto de paso el impuesto por defender: los tackles errados dejan
 * de contarse en bruto —Sudafrica erraba mas que Nueva Zelanda solo porque
 * tackleaba 44% mas, con la misma efectividad— y pasan a pesar como lo que son,
 * una fraccion del trabajo defensivo del equipo.
 *
 * ── LO QUE ESTO SIGUE SIN SER ───────────────────────────────────────────────
 * El proveedor mide avances, tackles, metros, pases y quiebres. No mide scrum,
 * line, limpieza de ruck ni maul —ni por jugador NI POR EQUIPO: no estan en los
 * veintidos rubros de la planilla, asi que ni siquiera se puede repartir un
 * credito colectivo—. Las varas por puesto hacen que el pilar PROMEDIO de 6,
 * que es lo correcto, pero un pilar EXCELENTE no puede llegar a 8,5 con datos
 * que no cuentan su trabajo. El try penal que se lleva un pack dominante no se
 * lo lleva nadie aca. Eso no lo arregla ninguna cuenta: lo arregla una señal de
 * set piece el dia que exista.
 */

import {
    REFERENCIAS_POR_PUESTO,
    NORMALIZACION,
    REFERENCIA_GLOBAL,
    SESGO,
    SESGO_POR_PUESTO,
    TOTAL_DE_EQUIPO,
    type Referencia,
} from './rugbyRatingReferences.generated.ts';

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
 * Es la tabla del Rugby Player Rating v1.0 y se mantiene intacta en la v2. Lo
 * que cambio no fue la tabla —estaba bien pensada— sino contra que se compara
 * cada jugador antes de que la tabla intervenga.
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
 * Hacia donde empuja un rubro.
 *
 * La v1 tenia cuatro tipos —volumen, bonus, castigo, falta— porque cada uno
 * necesitaba su propia forma de centrarse contra una vara global. Con la vara
 * por puesto los cuatro se derriten en uno: todo se lee como distancia al
 * promedio del puesto, y lo unico que queda por declarar es el signo. Un tackle
 * de mas es bueno, un tackle errado de mas es malo, y ninguno de los dos
 * necesita un tipo propio para decirlo.
 *
 * La tarjeta queda afuera de esta cañeria entera: ver `SANCIONES`.
 */
export type DireccionDeRubro = 'suma' | 'resta';

export interface RubroRating {
    componente: RatingComponent;
    direccion: DireccionDeRubro;
    /**
     * Cuanto habla este rubro por su eje. Es un peso RELATIVO dentro del eje:
     * en `defensa`, el tackle habla mas fuerte que el robo porque describe mas
     * partido, aunque el robo sea la jugada mas vistosa.
     */
    voz: number;
    /**
     * Sin este rubro no se puede puntuar el partido. Son los que TODOS hacen:
     * si no llegaron, todo el plantel figura en cero y el puntaje sale sesgado
     * parejo sin que nadie lo note. Ver `hayPlanillaParaPuntuar`.
     */
    imprescindible?: true;
}

/**
 * Los rubros del partido, su eje y cuanto pesan dentro de el.
 *
 * Aca ya NO hay referencias: las varas viven en
 * `rugbyRatingReferences.generated.ts`, una por puesto y por rubro, medidas
 * sobre la cosecha de planillas. Esta tabla dice que significa cada rubro; la
 * generada dice cuanto es normal en cada puesto. Separarlas es lo que permite
 * recalibrar sin volver a discutir el modelo.
 *
 * `lineoutsWon` cae en `impacto` y no en `juego` a proposito: el line es del
 * paquete, y `juego` pesa 11 en un segunda linea. Puesto ahi, el salto de un
 * lock contaria menos que un pase de un apertura, que es al reves de como se
 * juega. Cuando existan Lineout Takes y Stolen, el set piece se merece un eje
 * propio y este parche se cae solo.
 *
 * EL TACKLE NO SE PREMIA POR CANTIDAD. `tackles` suma y `missedTackles` resta,
 * asi que lo que queda es la eficiencia pesada por volumen: 17 tackles con 5
 * errados rinden menos que 12 sin ninguno.
 */
export const RUBROS: Readonly<Record<string, RubroRating>> = {
    tries: { componente: 'ataque', direccion: 'suma', voz: 1.0 },
    tryAssists: { componente: 'ataque', direccion: 'suma', voz: 0.6 },
    carriesMetres: { componente: 'ataque', direccion: 'suma', voz: 0.9, imprescindible: true },

    tackles: { componente: 'defensa', direccion: 'suma', voz: 1.0, imprescindible: true },
    missedTackles: { componente: 'defensa', direccion: 'resta', voz: 0.8 },
    turnoversWon: { componente: 'defensa', direccion: 'suma', voz: 0.5 },
    ruckTurnovers: { componente: 'defensa', direccion: 'suma', voz: 0.35 },
    dominantTackles: { componente: 'defensa', direccion: 'suma', voz: 0.45 },

    carries: { componente: 'impacto', direccion: 'suma', voz: 1.0, imprescindible: true },
    cleanBreaks: { componente: 'impacto', direccion: 'suma', voz: 0.6 },
    defendersBeaten: { componente: 'impacto', direccion: 'suma', voz: 0.5 },
    offloads: { componente: 'impacto', direccion: 'suma', voz: 0.4 },
    lineoutsWon: { componente: 'impacto', direccion: 'suma', voz: 0.4 },

    passes: { componente: 'juego', direccion: 'suma', voz: 1.0, imprescindible: true },
    kicks: { componente: 'juego', direccion: 'suma', voz: 0.5 },

    turnoversConceded: { componente: 'disciplina', direccion: 'resta', voz: 1.0 },
    penaltiesConceded: { componente: 'disciplina', direccion: 'resta', voz: 1.0 },
};

/**
 * LA TARJETA NO SE COMPARA CON NADA Y NO PASA POR LA CURVA.
 *
 * Se descuenta en PUNTOS, plana, despues de que el rendimiento ya se convirtio
 * en nota. Cada exencion tiene su motivo y las dos son deliberadas.
 *
 * NO SE CENTRA POR PUESTO. Todo lo demas se lee contra el promedio del puesto
 * porque MIDE RENDIMIENTO, y el rendimiento se juzga contra lo que se le pide a
 * ese puesto. Una tarjeta no mide rendimiento: mide una infraccion, y no hay
 * puesto al que se le permita infringir mas. Centrada, la primera amarilla del
 * puesto que mas amarillas cobra saldria gratis.
 *
 * NO PASA POR LA CURVA. Si entrara al agregado, el mismo rojo costaria distinto
 * segun donde venia parado el jugador —la tanh comprime en los extremos—, y una
 * expulsion no se abarata porque el tipo venia jugando mal. En puntos planos,
 * la amarilla cuesta 1,0 y la roja 2,4 en los quince puestos y en cualquier
 * partido. Un test lo fija.
 */
export const SANCIONES: Readonly<Record<string, number>> = {
    yellowCards: 1.0,
    redCards: 2.4,
};

/**
 * Cuanto puede alejarse un solo rubro del promedio de su puesto.
 *
 * Tres desvios ya es un partido excepcional en ese rubro. Sin tope, un pilar
 * que marca un try —tres desvios y medio para un pilar— se llevaria el puntaje
 * solo, y un partido no se gana con una jugada.
 */
const TOPE_POR_RUBRO = 3;

/**
 * El piso del desvio de un puesto, como fraccion del desvio global del rubro.
 *
 * Hay rubros que un puesto casi no toca: un wing gana un line cada tantos
 * partidos. Ahi el desvio medido se acerca a cero y cualquier unidad se
 * convertiria en veinte desvios. El piso lo impide sin borrar la señal.
 */
const PISO_DEL_DESVIO = 0.25;

/**
 * La curva que convierte rendimiento en nota.
 *
 * La v1 recortaba: tope por rubro, tope por eje y un clip final entre 1 y 10.
 * Con base 6 y tope de eje 1,8, dos ejes al tope ya daban 9,6 —y de ahi los 460
 * dieces perfectos que habia en la base sobre 60.339 puntajes, con el 5,1% de
 * las notas en 9 o mas cuando deberia ser el 1,5%.
 *
 * La tanh no recorta: satura. El 9 pasa a costar un partido de tres desvios,
 * que es lo que deberia costar, y los extremos son asintotas: se llega
 * acercandose, nunca por acumular una jugada mas.
 *
 * ── LA CAIDA ES MAS CORTA QUE LA SUBIDA ─────────────────────────────────────
 * Tentaba lo contrario —del 6 para abajo hay cinco puntos y para arriba cuatro,
 * asi que estirar la caida parecia aprovechar la escala—. Medido, es al reves:
 * con la señal centrada en cero, bajar por 5 y subir por 4 deja la media del
 * partido en 5,6 y manda al 39% de los jugadores a 5 o menos. El que jugo un
 * poco por debajo del promedio de su puesto no jugo mal, y una curva que lo
 * trata asi miente.
 *
 * Con 4 arriba y 2 abajo la distribucion se para donde tiene que pararse: media
 * 6,28 con la mediana en 6,00, desvio 1,03, el 8,1% de las notas en 8 o mas, el
 * 1,4% en 9 o mas y el 6,4% en 5 o menos. Y describe el
 * deporte: un mal partido esta acotado —el que no aparece es anonimo, y todos
 * los anonimos se parecen— mientras que uno grande no tiene techo, porque cada
 * try, cada quiebre y cada robo se ven y se cuentan.
 *
 * El piso del rendimiento queda entonces en 4. Al 1 se llega, pero por la otra
 * puerta: la tarjeta, que se descuenta despues y en puntos planos. Es la
 * lectura correcta —al fondo de la escala se baja por una expulsion, no por una
 * tarde de pases imprecisos.
 *
 * Ninguna de las dos constantes sale de una intuicion: se barrieron contra la
 * distribucion completa con
 * `node scripts/rugby-ratings/validar.mjs <planillas.jsonl> --barrer-k`.
 */
const CURVA = { k: 0.88, arriba: 4, abajo: 2 } as const;

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
 * Los rubros sin los cuales NO se puede puntuar.
 *
 * Son los que hace todo el mundo: el puntaje se construye sobre ellos y un
 * ausente no se distingue de un cero. Si `passes` no llego, todo el plantel
 * aparece como si no hubiera pasado la pelota nunca y el eje juego se desploma
 * parejo —un puntaje que se ve prolijo y no dice nada. Mejor no puntuar.
 */
export const RUBROS_IMPRESCINDIBLES = Object.entries(RUBROS)
    .filter(([, rubro]) => rubro.imprescindible)
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
    /**
     * Los totales de SU equipo en el partido, rubro por rubro. Es el
     * denominador: sin esto no hay parte que calcular.
     *
     * Opcional porque hay llamadores que puntuan un jugador suelto y no tienen
     * el plantel a mano. Cuando falta se usa el total de equipo PROMEDIO
     * (`TOTAL_DE_EQUIPO`), que deja la cuenta en la escala correcta pero vuelve
     * a arrastrar el sesgo de posesion para ese jugador.
     */
    team?: Readonly<Record<string, number>>;
}

export interface RugbyRating {
    /** El puntaje, de 1 a 10 con un decimal. */
    value: number;
    /**
     * Cuanto se aparto cada eje del promedio DE SU PUESTO, en desvios. Cero es
     * el partido normal de ese puesto. Sirve para explicar el numero.
     */
    components: Record<RatingComponent, number>;
    /**
     * El rendimiento en bruto, en desvios, ANTES de la curva y de la tarjeta.
     * Cero es el partido normal del puesto.
     *
     * Sale afuera para que la calibracion de `CURVA.k` sea una cuenta sobre
     * esto y no una copia del modelo en un script: el dia que se recalibre, se
     * barre `k` contra la distribucion de `signal` y el motor no se toca.
     */
    signal: number;
    /** El puesto que se le adjudico, o null si no habia numero. */
    position: number | null;
    minutes: number;
}

/** La vara de un rubro para un puesto, con el global de respaldo. */
function referenciaDe(metricId: string, puesto: number | null): Referencia | null {
    const global = REFERENCIA_GLOBAL[metricId];
    if (!global) return null;
    // Sin numero de camiseta no hay puesto, y se juzga contra el promedio de
    // los quince: mejor una vara neutra que adivinar donde jugo.
    const propia = puesto != null ? REFERENCIAS_POR_PUESTO[puesto]?.[metricId] : undefined;
    if (!propia) return global;
    return {
        media: propia.media,
        // El desvio del puesto no puede achicarse mas alla de una fraccion del
        // global, o un rubro que ese puesto casi no toca se volveria dinamita.
        desvio: Math.max(propia.desvio, global.desvio * PISO_DEL_DESVIO),
    };
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

    // La vara se achica con los minutos en vez de estirar lo hecho hasta los
    // ochenta. Es la diferencia entre "rindio como para doce tackles" y "si
    // seguia a este ritmo hacia treinta": lo segundo es una proyeccion, y una
    // proyeccion sobre diez minutos no es una calificacion.
    //
    // Se achica para TODOS los rubros. La v1 dejaba afuera al try y al quiebre
    // —la vara del cameo era la del partido entero— y con eso el suplente
    // arrancaba en falta por no marcar en veinte minutos. La unica cosa que de
    // verdad no se prorratea es la tarjeta, y esa ya no pasa por aca.
    const prorrateo = Math.max(MINUTOS_MINIMOS_DE_VARA, Math.min(80, minutes)) / 80;

    // Cada eje junta los desvios de sus rubros, pesados por cuanto habla cada
    // uno. Queda en unidades de desvio: cero es el partido normal del puesto.
    const suma: Record<RatingComponent, number> = {
        ataque: 0, defensa: 0, impacto: 0, juego: 0, disciplina: 0,
    };
    const voces: Record<RatingComponent, number> = {
        ataque: 0, defensa: 0, impacto: 0, juego: 0, disciplina: 0,
    };

    for (const [metricId, rubro] of Object.entries(RUBROS)) {
        const referencia = referenciaDe(metricId, puesto);
        if (!referencia) continue;

        // Un rubro ausente es un cero de verdad: el proveedor lista solo a quien
        // hizo algo, asi que no figurar en la columna de tries es no haber
        // marcado. Cero cuenta, y contra la vara del puesto resta poco o nada
        // segun cuanto se espere de ese puesto.
        const bruto = input.stats[metricId] ?? 0;
        if (!Number.isFinite(bruto)) continue;

        // La media de un contador baja con el tiempo en cancha; el desvio baja
        // con su RAIZ, que es como se comporta cualquier cuenta de sucesos. Si
        // se prorratearan los dos igual, la vara del suplente quedaria absurda
        // de angosta y cualquier avance suyo valdria tres desvios.
        // LA PARTE, NO EL CONTEO —pero solo en parte. Ocho tackles valen
        // distinto en un equipo que hizo 104 que en uno que hizo 150, y el que
        // decide cual de los dos es no es el jugador: es el plan de partido.
        //
        // DIVIDIR POR EL TOTAL ENTERO SE PASA DE LARGO, y esta medido. Si cada
        // jugador se mide como fraccion de su propio equipo, las fracciones de
        // un plantel suman uno por construccion: el promedio del equipo deja de
        // depender de si el equipo jugo bien. Con normalizacion completa el
        // ganador solo promediaba mas que el perdedor en el 60,7% de 1.316
        // partidos —contra 75,3% sin normalizar— y su ventaja caia de 0,33
        // puntos a 0,04. Se iba la posesion y se iba el rendimiento colectivo
        // con ella.
        //
        // El denominador es entonces una mezcla entre el total real del equipo
        // y el de un equipo promedio. `NORMALIZACION` dice cuanto pesa cada uno:
        // en 1 seria la fraccion pura, en 0 el conteo crudo. Se elige barriendo
        // los dos criterios a la vez, que tiran para lados opuestos.
        const totalDelEquipo = input.team?.[metricId];
        const totalPromedio = TOTAL_DE_EQUIPO[metricId] ?? 0;
        if (totalPromedio <= 0) continue;
        const denominador = totalDelEquipo != null && totalDelEquipo > 0
            ? Math.pow(totalDelEquipo, NORMALIZACION) * Math.pow(totalPromedio, 1 - NORMALIZACION)
            : totalPromedio;
        if (denominador <= 0) continue;
        const parte = bruto / denominador;

        const media = referencia.media * prorrateo;
        const desvio = referencia.desvio * Math.sqrt(prorrateo);
        if (desvio <= 0) continue;

        const z = Math.max(-TOPE_POR_RUBRO, Math.min(TOPE_POR_RUBRO, (parte - media) / desvio));
        const orientado = rubro.direccion === 'resta' ? -z : z;

        suma[rubro.componente] += orientado * rubro.voz;
        voces[rubro.componente] += rubro.voz;
    }

    const components: Record<RatingComponent, number> = {
        ataque: 0, defensa: 0, impacto: 0, juego: 0, disciplina: 0,
    };
    for (const eje of RATING_COMPONENTS) {
        // Promedio pesado y no suma: un eje con cinco rubros no puede mover
        // cinco veces mas que uno con dos solo por tener mas columnas.
        components[eje] = voces[eje] > 0 ? suma[eje] / voces[eje] : 0;
    }

    // El peso del puesto entra RELATIVO —los cien puntos de la fila repartidos—,
    // no como multiplicador. Ya no hace falta compararlo contra el promedio de
    // los quince ni topearlo: la v1 necesitaba eso porque el peso tambien tenia
    // que corregir el sesgo del puesto, y ahora el sesgo lo corrige la vara.
    let rendimiento = 0;
    if (pesos) for (const eje of RATING_COMPONENTS) rendimiento += (pesos[eje] / 100) * components[eje];
    else for (const eje of RATING_COMPONENTS) rendimiento += components[eje] / RATING_COMPONENTS.length;

    // Seis minutos no alcanzan para decir que alguien jugo mal.
    const confianza = Math.min(1, minutes / MINUTOS_PARA_CONFIANZA);
    // El SESGO recentra por la MEDIANA. Las varas centran cada rubro en su
    // promedio, que es lo que iguala a los quince puestos, pero un conteo tiene
    // cola a la derecha: al centrar en el promedio, mas de la mitad del plantel
    // queda abajo y la mediana del partido caia en 5,90. Un 5,7 en pantalla se
    // lee "jugo mal" cuando el sistema lo definio como "partido correcto".
    // Restar la mediana de la señal deja el partido tipico en 6 y la media un
    // poco arriba, que es como se lee una escala de puntajes.
    const sesgo = (puesto != null ? SESGO_POR_PUESTO[puesto] : undefined) ?? SESGO;
    const señal = (rendimiento - sesgo) * confianza;
    const amplitud = señal >= 0 ? CURVA.arriba : CURVA.abajo;
    const nota = RATING_BASE + amplitud * Math.tanh(señal / CURVA.k);

    // La tarjeta se descuenta al final, en puntos y plana. Ver `SANCIONES`.
    let castigo = 0;
    for (const [metricId, puntos] of Object.entries(SANCIONES)) {
        const cantidad = input.stats[metricId] ?? 0;
        if (Number.isFinite(cantidad) && cantidad > 0) castigo += cantidad * puntos;
    }

    return {
        value: Math.round(Math.min(TOPE.max, Math.max(TOPE.min, nota - castigo)) * 10) / 10,
        components,
        signal: señal,
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
