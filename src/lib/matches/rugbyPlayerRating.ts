/**
 * EL PUNTAJE DEL JUGADOR EN UN PARTIDO DE RUGBY (v4).
 *
 *   nota = 6,2 + 1,0 · Φ⁻¹( percentil del rendimiento en su grupo )
 *          + bonus por eventos raros − tarjetas
 *          → un decimal, entre 1 y 10
 *
 * La v3 tenia unas cuarenta constantes a mano (sesgo por puesto, escala por
 * puesto, dos curvas tanh, piso de 5,2, castigo por errores acumulados) para
 * emparejar a mano la distribucion de cada puesto. La v4 lo hace por
 * construccion: el rendimiento se convierte en PERCENTIL dentro de su grupo de
 * puestos y el percentil en nota con una unica campana. Todos los grupos tienen
 * la misma distribucion sin que nadie la ajuste.
 *
 * Es determinista y puro: mismas estadisticas y mismos minutos, misma nota. No
 * lee reloj, ni entorno, ni azar. OJO con el nombre: `matchPlayerRatings.ts` es
 * OTRA cosa —el semaforo de 1 a 3 que votan los usuarios—.
 *
 * ── QUE ES EL RENDIMIENTO ───────────────────────────────────────────────────
 * Igual que antes: cada rubro es la PARTE del total de su equipo (mezclada con
 * un equipo promedio, `NORMALIZACION`), leida contra la vara DE SU PUESTO y
 * pasada a z con tope en ±3. Se juntan por eje y los ejes se pesan por la tabla
 * del puesto. Tres cambios sobre la v3:
 *
 *  · El tackle se premia por EFECTIVIDAD (`tackles / intentos`), no por errados
 *    en bruto. Con menos de cinco intentos no hay dato y no cuenta.
 *  · Tries y asistencias salen del rendimiento y pasan a ser un bonus plano.
 *    Son eventos raros: centrados por puesto les daban un z enorme a quien los
 *    tenia y casi nada a quien no.
 *  · Cada rubro habla en su eje segun cuanto lo toca ese puesto
 *    (`voz × min(1, media del puesto / media global)`) y el eje es un promedio
 *    pesado. Antes un pilar tenia en `impacto` cuatro rubros que casi no toca
 *    (quiebres, defensores superados, offloads, lines) con z cerca de cero, y
 *    esos cuatro diluian al unico que si mueve el eje: el acarreo.
 *
 * ── MINUTOS: CONTRACCION ────────────────────────────────────────────────────
 * `rendimiento × m / (m + K_MINUTOS)`, con m topeado en 80. Con ochenta minutos
 * se cuenta el 76% de la señal, con diez el 29%. El suplente corto queda cerca
 * de la media porque se sabe poco de el, sin reglas especiales. Menos de cinco
 * minutos no llevan nota.
 *
 * ── LO QUE SIGUE SIN VERSE ──────────────────────────────────────────────────
 * Scrum, line, ruck y maul no estan en la planilla. Un pilar que domino el
 * scrum no se distingue de uno que lo sufrio. Esa señal es el paso siguiente
 * (carga editorial o datos de equipo del proveedor) y entra como un rubro mas.
 */

import {
    REFERENCIAS_POR_PUESTO,
    REFERENCIA_GLOBAL,
    NORMALIZACION,
    TOTAL_DE_EQUIPO,
    type Referencia,
} from './rugbyRatingReferences.generated.ts';
import {
    CUANTILES_POR_GRUPO,
    EFECTIVIDAD_GLOBAL,
    EFECTIVIDAD_POR_PUESTO,
    PARADA_LIGA,
} from './rugbyRatingPercentiles.generated.ts';

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
 * LOS GRUPOS CONTRA LOS QUE SE HACE EL PERCENTIL.
 *
 * Un jugador compite con los de su grupo, no con los quince puestos juntos: el
 * 90 de un pilar es un buen partido de pilar. Cada grupo tiene la misma
 * distribucion de notas por construccion.
 */
export type GrupoDePuesto =
    | 'pilares' | 'hooker' | 'segundas' | 'terceras'
    | 'medio' | 'apertura' | 'centros' | 'back-tres';

export const GRUPO_POR_PUESTO: Readonly<Record<number, GrupoDePuesto>> = {
    1: 'pilares', 3: 'pilares',
    2: 'hooker',
    4: 'segundas', 5: 'segundas',
    6: 'terceras', 7: 'terceras', 8: 'terceras',
    9: 'medio',
    10: 'apertura',
    12: 'centros', 13: 'centros',
    11: 'back-tres', 14: 'back-tres', 15: 'back-tres',
};

/** El grupo con el que se compara a quien no tiene puesto afirmable. */
export const GRUPO_SIN_PUESTO = 'todos';

/**
 * LA 21 NO SIEMPRE ES UN MEDIO SCRUM.
 *
 * Es la unica camiseta del banco donde equivocarse sale caro: `juego` pesa 45 en
 * un 9, asi que a un tercera linea se le exigian los pases de otro oficio.
 * Medido: de 944 camisetas 21 con 15 minutos o mas, 410 dan menos de 0,25 pases
 * por minuto; de 1.324 camisetas 9, solo 5. Debajo de ese ritmo no se adivina el
 * puesto real: se lo juzga con la vara neutra del jugador sin numero.
 */
const LA_21 = { minutos: 15, pasesPorMinuto: 0.25 } as const;

/** El puesto con el que se juzga el partido, o null si no se lo puede afirmar. */
export function puestoDelPartido(
    number: number | null,
    stats: Readonly<Record<string, number>>,
    minutes: number
): number | null {
    if (number == null) return null;
    if (
        number === 21 &&
        minutes >= LA_21.minutos &&
        (stats.passes ?? 0) / minutes < LA_21.pasesPorMinuto
    ) return null;
    return PUESTO_POR_NUMERO[number] ?? null;
}

/**
 * Cuanto pesa cada eje en cada puesto. Suman 100 por fila —lo verifica un test.
 *
 * Es la tabla del Rugby Player Rating v1.0, intacta. Se reemplaza por pesos
 * aprendidos de notas de expertos cuando haya notas suficientes.
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

/** Hacia donde empuja un rubro: un tackle de mas es bueno, un penal de mas es malo. */
export type DireccionDeRubro = 'suma' | 'resta';

export interface RubroRating {
    componente: RatingComponent;
    direccion: DireccionDeRubro;
    /** Cuanto habla este rubro por su eje: peso RELATIVO dentro del eje. */
    voz: number;
    /**
     * Sin este rubro no se puede puntuar el partido. Son los que TODOS hacen: si
     * no llegaron, todo el plantel figura en cero y el puntaje sale sesgado parejo
     * sin que nadie lo note. Ver `hayPlanillaParaPuntuar`.
     */
    imprescindible?: true;
}

/**
 * Los rubros que se miden como PARTE del equipo. Los errados, los tries y las
 * asistencias no estan: ver `EFECTIVIDAD_DE_TACKLE` y `BONUS`.
 *
 * `lineoutsWon` cae en `impacto` y no en `juego` a proposito: el line es del
 * paquete, y `juego` pesa 11 en un segunda linea.
 */
export const RUBROS: Readonly<Record<string, RubroRating>> = {
    carriesMetres: { componente: 'ataque', direccion: 'suma', voz: 0.9, imprescindible: true },

    tackles: { componente: 'defensa', direccion: 'suma', voz: 1.0, imprescindible: true },
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
 * LA EFECTIVIDAD DEL TACKLE reemplaza a los errados en bruto.
 *
 * `tackles / (tackles + errados)` contra la media del puesto. Los errados en
 * bruto castigaban el volumen: quien tackleaba mas erraba mas aunque acertara lo
 * mismo. Con menos de `minimoIntentos` no hay dato y el rubro no cuenta.
 */
export const EFECTIVIDAD_DE_TACKLE = {
    componente: 'defensa' as RatingComponent,
    voz: 0.8,
    minimoIntentos: 5,
};

/**
 * Los eventos raros suman DESPUES de la nota y planos.
 *
 * Un try le cambia el partido a cualquiera, y un forward que lo marca esta
 * haciendo algo menos esperable que un back. El tope evita que una tarde de
 * tries se coma toda la escala.
 */
export const BONUS = {
    tryForward: 0.45,
    tryBack: 0.35,
    asistencia: 0.2,
    tope: 1.2,
} as const;

/**
 * LA PELOTA PARADA: lo que el proveedor no mide por jugador y si por equipo.
 *
 * RugbyPass no publica scrum ni line por jugador, pero la ficha del partido trae,
 * por equipo, cuantos scrums y lines tuvo y que porcentaje gano. Con eso se arma
 * un indice por equipo y se reparte a quienes cargan con esa pelota:
 *
 *   indice = (porcentaje ganado − media de la liga) / desvio de la liga,
 *            contraido por `n / (n + K)`: 3 scrums al 100% no dicen lo que 12.
 *
 * Se reparte por grupo segun cuanto participa cada uno del scrum y del line, y
 * entra como un eje mas con `peso` puntos de cien. Sin datos del partido (la
 * ficha de temporada, un proveedor que no los trae) el eje no existe y el resto
 * se lee completo, sin penalizar a nadie por un hueco de la fuente.
 *
 * Lo que sale del proveedor es solo el porcentaje y el volumen: no hay robos de
 * scrum ni penales de scrum, asi que el indice no los incluye.
 */
export interface ParadaDeEquipo {
    scrums: number | null;
    /** Porcentaje ganado, de 0 a 1. */
    scrumsGanados: number | null;
    lines: number | null;
    linesGanados: number | null;
}

/** Cuantos eventos hacen falta para creerle la mitad al porcentaje. */
export const PARADA_K = { scrum: 8, line: 10 } as const;

/** Cuanto del scrum y del line carga cada grupo, y cuanto pesa el eje en su nota. */
export const PARADA_POR_GRUPO: Readonly<Record<string, { peso: number; scrum: number; line: number }>> = {
    pilares: { peso: 20, scrum: 1.0, line: 0 },
    hooker: { peso: 20, scrum: 0.7, line: 1.0 },
    segundas: { peso: 15, scrum: 0.4, line: 0.7 },
    terceras: { peso: 6, scrum: 0.2, line: 0.3 },
};

export interface LigaDeParada {
    scrum: Referencia;
    line: Referencia;
}

/** El z de scrum y de line de un equipo en un partido. `null` si el dato no esta. */
export function indiceDeParada(
    parada: ParadaDeEquipo | null | undefined,
    liga: LigaDeParada = PARADA_LIGA
) {
    const z = (ganados: number | null | undefined, n: number | null | undefined, ref: Referencia, k: number) => {
        if (ganados == null || n == null || !Number.isFinite(ganados) || !Number.isFinite(n) || n <= 0 || ref.desvio <= 0) return null;
        const bruto = Math.max(-TOPE_POR_RUBRO, Math.min(TOPE_POR_RUBRO, (ganados - ref.media) / ref.desvio));
        return bruto * (n / (n + k));
    };
    return {
        scrum: z(parada?.scrumsGanados, parada?.scrums, liga.scrum, PARADA_K.scrum),
        line: z(parada?.linesGanados, parada?.lines, liga.line, PARADA_K.line),
    };
}

/**
 * LA TARJETA NO SE COMPARA CON NADA.
 *
 * Se descuenta en PUNTOS, plana, despues de la nota: la amarilla cuesta 1,0 y la
 * roja 2,4 en los quince puestos y en cualquier partido. Una tarjeta mide una
 * infraccion, no rendimiento, y no hay puesto al que se le permita infringir mas.
 */
export const SANCIONES: Readonly<Record<string, number>> = {
    yellowCards: 1.0,
    redCards: 2.4,
};

/** La campana de la nota: media y desvio, iguales para todos los puestos. */
export const NOTA = { media: 6.2, desvio: 1.0 } as const;

/** Hasta donde llega la escala. El 10 y el 1 existen, pero cuestan. */
const TOPE = { min: 1, max: 10 } as const;

/** Cuanto pesa la duda: `m / (m + K)`. Se ajusta con datos. */
export const K_MINUTOS = 25;

/** Menos que esto no lleva nota: no se puede decir nada de cinco minutos. */
export const MINUTOS_MINIMOS = 5;

/** Cuanto puede alejarse un solo rubro del promedio de su puesto, en desvios. */
const TOPE_POR_RUBRO = 3;

/** El piso del desvio de un puesto, como fraccion del desvio global del rubro. */
const PISO_DEL_DESVIO = 0.25;

/**
 * El piso de la referencia prorrateada: a un suplente de seis minutos no se le
 * pide el volumen de un titular, pero tampoco la vara de seis minutos.
 */
const MINUTOS_MINIMOS_DE_VARA = 25;

/**
 * Las probabilidades en las que se guardan los cuantiles de cada grupo: los
 * extremos 0,25% y 99,75%, y de 0,5% a 99,5% de a 0,5. Fuera de ellas el
 * percentil se queda en la punta, y la nota en torno a 6,2 ± 2,8.
 */
export const PROBABILIDADES: readonly number[] = (() => {
    const p = [0.0025];
    for (let i = 1; i <= 199; i++) p.push(i / 200);
    p.push(0.9975);
    return p;
})();

/** Los rubros sin los cuales NO se puede puntuar. */
export const RUBROS_IMPRESCINDIBLES = Object.entries(RUBROS)
    .filter(([, rubro]) => rubro.imprescindible)
    .map(([metricId]) => metricId);

/**
 * Si la planilla alcanza para puntuar. `rubros` son las metricas que llegaron
 * para el partido, no las de un jugador: la pregunta es si la FUENTE contesto
 * entera.
 */
export function hayPlanillaParaPuntuar(rubros: Iterable<string>) {
    const presentes = new Set(rubros);
    return RUBROS_IMPRESCINDIBLES.every((metricId) => presentes.has(metricId));
}

export interface RugbyRatingInput {
    /** Los rubros del partido, en los ids de metrica de la tabla de jugadores. */
    stats: Readonly<Record<string, number>>;
    /** Minutos en cancha. Sin esto no hay tasa por 80 y no hay puntaje. */
    minutes: number | null;
    /** Numero de camiseta: de aca sale el puesto. */
    number: number | null;
    /**
     * Los totales de SU equipo en el partido, rubro por rubro: es el denominador.
     * Cuando falta se usa el equipo PROMEDIO (`TOTAL_DE_EQUIPO`), que deja la
     * cuenta en la escala correcta pero arrastra la posesion para ese jugador.
     */
    team?: Readonly<Record<string, number>>;
    /** Scrum y line de SU equipo en el partido. Opcional: sin esto no hay eje de parada. */
    parada?: ParadaDeEquipo | null;
}

export interface RugbyRating {
    /** El puntaje, de 1 a 10 con un decimal. */
    value: number;
    /** Cuanto se aparto cada eje del promedio DE SU PUESTO, en desvios. */
    components: Record<RatingComponent, number>;
    /** El rendimiento ya contraido por minutos, ANTES del percentil. */
    signal: number;
    /** El percentil (0 a 1) del rendimiento en su grupo. */
    percentile: number;
    /** El bonus por tries y asistencias, ya topeado. */
    bonus: number;
    /** El eje de pelota parada, en desvios, o null si no entro en la cuenta. */
    parada: number | null;
    /** El puesto que se le adjudico, o null si no habia numero. */
    position: number | null;
    minutes: number;
}

/** Opciones para calibrar: permiten medir con tablas que todavia no estan escritas. */
export interface OpcionesDeRendimiento {
    efectividad?: Readonly<Record<number, Referencia>>;
    liga?: LigaDeParada;
}

/** La vara de un rubro para un puesto, con el global de respaldo. */
function referenciaDe(metricId: string, puesto: number | null): Referencia | null {
    const global = REFERENCIA_GLOBAL[metricId];
    if (!global) return null;
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
 * Cuanto de su voz conserva un rubro en un puesto: 1 si el puesto lo toca tanto
 * como el promedio, y menos cuanto menos lo toca. Es lo que evita que un rubro
 * que ese puesto casi no hace diluya al que si.
 */
function presenciaDe(metricId: string, puesto: number | null): number {
    if (puesto == null) return 1;
    const propia = REFERENCIAS_POR_PUESTO[puesto]?.[metricId];
    const global = REFERENCIA_GLOBAL[metricId];
    if (!propia || !global || global.media <= 0) return 1;
    return Math.max(0, Math.min(1, propia.media / global.media));
}

/**
 * El rendimiento de un jugador, en desvios, ya contraido por minutos. Es todo el
 * partido salvo el percentil: lo usa el motor y lo usa la calibracion.
 */
export function rendimientoDe(
    input: RugbyRatingInput,
    opciones: OpcionesDeRendimiento = {}
) {
    const minutes = input.minutes ?? 0;
    const puesto = puestoDelPartido(input.number, input.stats, minutes);
    const pesos = puesto != null ? PESOS_POR_PUESTO[puesto] : null;

    // La vara se achica con los minutos en vez de estirar lo hecho a ochenta: la
    // media baja con el tiempo en cancha y el desvio con su raiz.
    const prorrateo = Math.max(MINUTOS_MINIMOS_DE_VARA, Math.min(80, minutes)) / 80;

    const suma: Record<RatingComponent, number> = { ataque: 0, defensa: 0, impacto: 0, juego: 0, disciplina: 0 };
    const voces: Record<RatingComponent, number> = { ataque: 0, defensa: 0, impacto: 0, juego: 0, disciplina: 0 };

    for (const [metricId, rubro] of Object.entries(RUBROS)) {
        const referencia = referenciaDe(metricId, puesto);
        if (!referencia) continue;

        // Un rubro ausente es un cero de verdad: el proveedor lista solo a quien
        // hizo algo.
        const bruto = input.stats[metricId] ?? 0;
        if (!Number.isFinite(bruto)) continue;

        // LA PARTE, NO EL CONTEO —pero solo en parte—. Dividir por el total
        // entero hacia que el promedio de un plantel no dijera nada de si jugo
        // bien: el denominador mezcla el total real con el de un equipo promedio.
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

        const voz = rubro.voz * presenciaDe(metricId, puesto);
        suma[rubro.componente] += orientado * voz;
        voces[rubro.componente] += voz;
    }

    // La efectividad del tackle. Sin intentos suficientes no hay dato y no entra
    // ni en la suma ni en el denominador del eje.
    const tackles = input.stats.tackles ?? 0;
    const errados = input.stats.missedTackles ?? 0;
    const intentos = tackles + errados;
    if (Number.isFinite(intentos) && intentos >= EFECTIVIDAD_DE_TACKLE.minimoIntentos) {
        const tabla = opciones.efectividad ?? EFECTIVIDAD_POR_PUESTO;
        const referencia = (puesto != null ? tabla[puesto] : undefined) ?? EFECTIVIDAD_GLOBAL;
        if (referencia.desvio > 0) {
            const z = Math.max(
                -TOPE_POR_RUBRO,
                Math.min(TOPE_POR_RUBRO, (tackles / intentos - referencia.media) / referencia.desvio)
            );
            suma[EFECTIVIDAD_DE_TACKLE.componente] += z * EFECTIVIDAD_DE_TACKLE.voz;
            voces[EFECTIVIDAD_DE_TACKLE.componente] += EFECTIVIDAD_DE_TACKLE.voz;
        }
    }

    const components: Record<RatingComponent, number> = { ataque: 0, defensa: 0, impacto: 0, juego: 0, disciplina: 0 };
    for (const eje of RATING_COMPONENTS) {
        components[eje] = voces[eje] > 0 ? suma[eje] / voces[eje] : 0;
    }

    let rendimiento = 0;
    if (pesos) for (const eje of RATING_COMPONENTS) rendimiento += (pesos[eje] / 100) * components[eje];
    else for (const eje of RATING_COMPONENTS) rendimiento += components[eje] / RATING_COMPONENTS.length;

    // La pelota parada, si el partido la trae y el puesto carga con ella. El
    // reparto es por cuanto del scrum y del line toca el grupo, y por cuanto del
    // partido estuvo en cancha: un suplente de veinte minutos vivio un cuarto de
    // los scrums.
    let parada: number | null = null;
    const grupo = puesto != null ? GRUPO_POR_PUESTO[puesto] : undefined;
    const reparto = grupo ? PARADA_POR_GRUPO[grupo] : undefined;
    if (reparto && input.parada) {
        const indice = indiceDeParada(input.parada, opciones.liga);
        const aporte = (indice.scrum != null ? reparto.scrum : 0) + (indice.line != null ? reparto.line : 0);
        if (aporte > 0) {
            const z = ((indice.scrum ?? 0) * reparto.scrum + (indice.line ?? 0) * reparto.line) / aporte;
            parada = z * Math.min(1, minutes / 80);
            // El eje le quita `peso` puntos de cien al resto, que se achica parejo.
            rendimiento = rendimiento * (1 - reparto.peso / 100) + (reparto.peso / 100) * parada;
        }
    }

    const m = Math.min(80, minutes);
    return {
        puesto,
        components,
        parada,
        rendimiento,
        ajustado: rendimiento * (m / (m + K_MINUTOS)),
    };
}

/** La normal estandar acumulada (Abramowitz-Stegun 7.1.26). Solo para el respaldo. */
function normalAcumulada(x: number) {
    const t = 1 / (1 + 0.2316419 * Math.abs(x));
    const d = 0.3989423 * Math.exp(-x * x / 2);
    const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
    return x > 0 ? 1 - p : p;
}

/** La inversa de la normal estandar (Acklam). Convierte un percentil en desvios. */
export function normalInversa(p: number) {
    const a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02, 1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
    const b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02, 6.680131188771972e+01, -1.328068155288572e+01];
    const c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00, -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];
    const d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00, 3.754408661907416e+00];
    const corte = 0.02425;
    if (p < corte) {
        const q = Math.sqrt(-2 * Math.log(p));
        return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
            ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
    }
    if (p <= 1 - corte) {
        const q = p - 0.5, r = q * q;
        return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q /
            (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
    }
    const q = Math.sqrt(-2 * Math.log(1 - p));
    return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
        ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
}

/**
 * El percentil de un rendimiento dentro de su grupo, interpolando entre los
 * cuantiles medidos. Sin tabla para el grupo cae a la normal estandar, que deja
 * la nota en `6,2 + rendimiento`: sirve para arrancar y para los tests, no para
 * mostrar.
 */
export function percentilDe(grupo: string, x: number) {
    const q = CUANTILES_POR_GRUPO[grupo] ?? CUANTILES_POR_GRUPO[GRUPO_SIN_PUESTO];
    const ultimo = PROBABILIDADES.length - 1;
    if (!q || q.length !== PROBABILIDADES.length) {
        return Math.min(PROBABILIDADES[ultimo], Math.max(PROBABILIDADES[0], normalAcumulada(x)));
    }
    if (x <= q[0]) return PROBABILIDADES[0];
    if (x >= q[ultimo]) return PROBABILIDADES[ultimo];
    // Busqueda binaria del tramo [lo, hi] que contiene a x.
    let lo = 0, hi = ultimo;
    while (hi - lo > 1) {
        const medio = (lo + hi) >> 1;
        if (q[medio] <= x) lo = medio; else hi = medio;
    }
    const ancho = q[hi] - q[lo];
    // Un tramo plano (muchos jugadores con el mismo rendimiento) toma el medio.
    const t = ancho > 0 ? (x - q[lo]) / ancho : 0.5;
    return PROBABILIDADES[lo] + t * (PROBABILIDADES[hi] - PROBABILIDADES[lo]);
}

/** El bonus por tries y asistencias, plano y topeado. */
export function bonusPorEventos(stats: Readonly<Record<string, number>>, puesto: number | null) {
    const tries = Number.isFinite(stats.tries) ? Math.max(0, stats.tries) : 0;
    const asistencias = Number.isFinite(stats.tryAssists) ? Math.max(0, stats.tryAssists) : 0;
    const porTry = puesto != null && puesto <= 8 ? BONUS.tryForward : BONUS.tryBack;
    return Math.min(BONUS.tope, tries * porTry + asistencias * BONUS.asistencia);
}

/**
 * El puntaje de un jugador en un partido.
 *
 * Devuelve `null` cuando no hay con que calcularlo: con menos de cinco minutos
 * en cancha no hay partido que puntuar, y un suplente que no entro no lleva
 * puntaje. Es distinto de un 6, que dice "jugo y estuvo correcto".
 */
export function rateRugbyPlayer(input: RugbyRatingInput): RugbyRating | null {
    const minutes = input.minutes ?? 0;
    if (minutes < MINUTOS_MINIMOS) return null;

    const { puesto, components, ajustado, parada } = rendimientoDe(input);
    const grupo = puesto != null ? GRUPO_POR_PUESTO[puesto] : GRUPO_SIN_PUESTO;
    const percentile = percentilDe(grupo, ajustado);
    const bonus = bonusPorEventos(input.stats, puesto);

    let castigo = 0;
    for (const [metricId, puntos] of Object.entries(SANCIONES)) {
        const cantidad = input.stats[metricId] ?? 0;
        if (Number.isFinite(cantidad) && cantidad > 0) castigo += cantidad * puntos;
    }

    const nota = NOTA.media + NOTA.desvio * normalInversa(percentile) + bonus - castigo;
    return {
        value: Math.round(Math.min(TOPE.max, Math.max(TOPE.min, nota)) * 10) / 10,
        components,
        signal: ajustado,
        percentile,
        bonus,
        parada,
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
