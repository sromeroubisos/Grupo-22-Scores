/**
 * Los cinco estados de un partido, resueltos en un solo lugar.
 *
 * ── Por qué existe ─────────────────────────────────────────────────────────
 * El estado se derivaba a mano en seis renderers distintos de la página de
 * torneo, siempre con la misma pareja copiada:
 *
 *     const isLive     = match.status === 'live' || match.status === 'in_play';
 *     const isFinished = match.status === 'finished' || match.status === 'ft' || isResult;
 *
 * Eso deja tres agujeros, y los tres se ven en pantalla:
 *
 *  1. `'final'` —el valor CANÓNICO del proyecto, declarado en
 *     `src/types/match.ts`— no estaba en la lista. Un partido terminado
 *     guardado por la app dependía de caer en la lista de "resultados" para
 *     mostrarse como terminado; fuera de esa lista, no.
 *  2. `'postponed'` y `'cancelled'`, que ese mismo tipo declara, no se
 *     contemplaban en ningún lado: caían al caso por defecto y se dibujaban
 *     IGUAL que un partido programado, con su horario. La página mandaba a la
 *     gente a una cancha donde no se juega — el peor error posible en esto.
 *  3. El entretiempo no existía: un partido en el descanso se mostraba como
 *     en juego, con el minuto congelado en 40'.
 *
 * ── Vocabulario ───────────────────────────────────────────────────────────
 * Entran dos vocabularios y hay que aceptar los dos: el de la base
 * (`scheduled | live | final | postponed | cancelled`) y el de los proveedores
 * externos, que mandan `ft`, `finished`, `full time`, `ht`, `1st half` y demás.
 * Normalizar acá es justamente lo que evita que cada renderer invente su lista.
 */

export type EstadoDePartido =
    | 'programado'
    | 'en-vivo'
    | 'entretiempo'
    | 'finalizado'
    | 'suspendido';

/** Lo que la UI necesita saber para dibujar el estado sin volver a razonarlo. */
export interface EstadoResuelto {
    estado: EstadoDePartido;
    /** Etiqueta corta, la que va en la fila. */
    etiqueta: string;
    /** Texto largo para `title` / lectores de pantalla. */
    descripcion: string;
    /** ¿Se muestra el marcador? Un partido sin jugar no tiene qué mostrar. */
    muestraMarcador: boolean;
    /** ¿Corre el reloj? Sólo en vivo: en el entretiempo el minuto miente. */
    relojCorriendo: boolean;
}

const normalizar = (valor: unknown) => String(valor ?? '').trim().toLowerCase();

/* ── Siglas exactas vs. frases ──────────────────────────────────────────────
   Las siglas cortas NO se pueden buscar por `includes`: son subcadenas unas de
   otras. `aet` (after extra time, o sea TERMINADO) contiene `et`, así que una
   lista de en-vivo con `et` se come todos los AET y los muestra en juego. El
   test lo agarró en la primera corrida.
   Entonces: las siglas van por igualdad exacta y las frases por inclusión. */
const EXACTOS: Record<string, EstadoDePartido> = {
    ht: 'entretiempo',
    ft: 'finalizado',
    aet: 'finalizado',
    pen: 'finalizado',
    fin: 'finalizado',
    ot: 'en-vivo',
    q1: 'en-vivo', q2: 'en-vivo', q3: 'en-vivo', q4: 'en-vivo',
    wo: 'suspendido',
    // `et` queda AFUERA a propósito: en inglés es extra time (en juego) y en
    // castellano entretiempo (detenido). Un dato que puede significar dos cosas
    // opuestas no se adivina; si llega así, cae en programado y no miente.
};

/* El entretiempo se chequea ANTES que "en vivo": "1st half" y "halftime"
   comparten la palabra `half`. Con el orden invertido, todo descanso se leería
   como juego corriendo. */
const ENTRETIEMPO = ['half time', 'half-time', 'halftime', 'entretiempo', 'descanso'];

const EN_VIVO = [
    'live', 'in_play', 'inplay', 'in play', 'playing', 'inprogress', 'in progress',
    '1st half', '2nd half', 'primer tiempo', 'segundo tiempo',
    '1st period', '2nd period', '3rd period', 'extra time',
];

const FINALIZADO = [
    'final', 'finished', 'full time', 'full-time', 'fulltime',
    'ended', 'finalizado', 'terminado', 'after extra time',
];

const SUSPENDIDO = [
    'postponed', 'cancelled', 'canceled', 'suspended', 'abandoned', 'interrupted', 'walkover',
    'postergado', 'cancelado', 'suspendido',
];

/** Etiqueta propia por motivo: «POSTERGADO» y «CANCELADO» no son lo mismo. */
const ETIQUETA_SUSPENDIDO: Record<string, { etiqueta: string; descripcion: string }> = {
    postponed: { etiqueta: 'POSTERGADO', descripcion: 'Partido postergado' },
    postergado: { etiqueta: 'POSTERGADO', descripcion: 'Partido postergado' },
    cancelled: { etiqueta: 'CANCELADO', descripcion: 'Partido cancelado' },
    canceled: { etiqueta: 'CANCELADO', descripcion: 'Partido cancelado' },
    cancelado: { etiqueta: 'CANCELADO', descripcion: 'Partido cancelado' },
    abandoned: { etiqueta: 'ABANDONADO', descripcion: 'Partido abandonado' },
    walkover: { etiqueta: 'W.O.', descripcion: 'Ganado por no presentación' },
};

const contiene = (token: string, lista: string[]) => lista.some((x) => token.includes(x));

/** Ficha completa a partir del estado ya decidido. Un solo lugar arma la copia. */
function describir(estado: EstadoDePartido, tokenOriginal = ''): EstadoResuelto {
    switch (estado) {
        case 'suspendido': {
            const motivo = Object.keys(ETIQUETA_SUSPENDIDO).find((m) => tokenOriginal.includes(m))
                ?? (tokenOriginal === 'wo' ? 'walkover' : '');
            const copia = ETIQUETA_SUSPENDIDO[motivo] ?? { etiqueta: 'SUSPENDIDO', descripcion: 'Partido suspendido' };
            return {
                estado, etiqueta: copia.etiqueta, descripcion: copia.descripcion,
                // Un W.O. o un abandonado pueden tener marcador; un postergado no.
                muestraMarcador: motivo === 'walkover' || motivo === 'abandoned',
                relojCorriendo: false,
            };
        }
        case 'entretiempo':
            return {
                estado, etiqueta: 'ET', descripcion: 'Entretiempo',
                muestraMarcador: true,
                // El reloj NO corre: 40' congelado hace dudar de todo el dato.
                relojCorriendo: false,
            };
        case 'en-vivo':
            return {
                estado, etiqueta: 'EN VIVO', descripcion: 'Partido en juego',
                muestraMarcador: true, relojCorriendo: true,
            };
        case 'finalizado':
            return {
                estado, etiqueta: 'FT', descripcion: 'Partido finalizado',
                muestraMarcador: true, relojCorriendo: false,
            };
        default:
            return {
                estado: 'programado', etiqueta: '', descripcion: 'Partido programado',
                muestraMarcador: false, relojCorriendo: false,
            };
    }
}

/**
 * @param status  el `status` del partido, en cualquiera de los dos vocabularios
 * @param opciones.estaEnResultados  el partido vino en la lista de resultados.
 *        Es una pista, no una verdad: sirve de red cuando el proveedor no manda
 *        estado, pero NUNCA pisa un estado explícito — un partido con
 *        `postponed` que aparezca listado como resultado sigue siendo postergado.
 */
export function resolverEstado(
    status: unknown,
    opciones: { estaEnResultados?: boolean } = {},
): EstadoResuelto {
    const token = normalizar(status);

    // Las siglas exactas primero: son las que colisionan por subcadena.
    const porSigla = EXACTOS[token];
    if (porSigla) return describir(porSigla, token);

    if (token && contiene(token, SUSPENDIDO)) return describir('suspendido', token);
    if (token && contiene(token, ENTRETIEMPO)) return describir('entretiempo', token);
    if (token && contiene(token, EN_VIVO)) return describir('en-vivo', token);
    if (token && contiene(token, FINALIZADO)) return describir('finalizado', token);

    // Sin estado utilizable: la lista de la que vino es la única pista.
    if (opciones.estaEnResultados) return describir('finalizado', token);

    return describir('programado', token);
}

/* ── La red de tiempo ───────────────────────────────────────────────────────
 * Hay proveedores que mandan el marcador final y dejan TODOS los flags de
 * estado en `false`. Medido sobre `ALypVsfU` (Canterbury 12 - 36 Northland,
 * Bunnings NPC): la ficha del partido decía `stage: "Finished"`,
 * `is_finished: true`; la lista del día, para el MISMO id y con el marcador ya
 * cargado, mandaba `stage: null` y todos los flags en `false`. Sin una red, ese
 * partido se queda «Programado» para siempre.
 *
 * La red ya existía, pero adentro de `flashscore.ts` y con dos límites: sólo
 * corría en el feed diario —nunca en la página del partido— y sólo para rugby,
 * con un número fijo de 100 minutos.
 *
 * Ese número no se puede globalizar: a los 100 minutos un partido de rugby
 * terminó hace rato y uno de tenis a cinco sets recién va por la mitad. Por eso
 * la ventana es POR DEPORTE. Y los deportes sin duración acotada se quedan sin
 * red a propósito: es preferible un «Programado» viejo que un «Finalizado»
 * mentiroso.
 *
 * Ojo con el ancla: en un partido terminado, el `timestamp` de la ficha de
 * FlashScore ya NO es el arranque —en el caso medido venía corrido 104 minutos,
 * o sea hasta el final—. El único inicio confiable es el de la lista del día.
 */

/** Minutos desde el inicio, por `sport_id` de FlashScore. Es el techo realista
 *  de duración del deporte más un margen, no su duración nominal. */
const VENTANA_POR_DEPORTE: Record<number, number> = {
    1: 140,   // fútbol: 90 + entretiempo + descuento + margen
    2: 360,   // tenis: un cinco sets se va largo, la red tiene que ser generosa
    3: 180,   // básquet
    4: 180,   // hockey sobre hielo
    5: 240,   // fútbol americano
    6: 300,   // béisbol: sin reloj, entradas extra
    7: 130,   // handball
    8: 100,   // rugby union — el número que ya usaba el feed
    9: 150,   // floorball
    10: 150,  // bandy
    11: 120,  // futsal
    12: 200,  // vóley
    14: 240,  // dardos
    15: 480,  // snooker: un frame largo estira todo
    16: 180,  // boxeo
    17: 180,  // vóley playa
    18: 200,  // aussie rules
    19: 100,  // rugby league
    21: 180,  // bádminton
    22: 150,  // waterpolo
    24: 130,  // hockey sobre césped
    25: 180,  // tenis de mesa
};

/** Deportes que NO llevan red: su duración no está acotada por reglamento y
 *  cualquier ventana que elijamos sería una invención. Un test de cricket dura
 *  días; un torneo de golf, cuatro jornadas. */
const SIN_RED = new Set([13, 23]); // cricket, golf

/** Cuando el deporte no está en la tabla, cinco horas: lo bastante ancho para
 *  no cortar nada en juego y lo bastante angosto para que sirva de algo. */
const VENTANA_POR_DEFECTO = 300;

/** Minutos que tienen que pasar desde el inicio para dar un partido por
 *  terminado sin confirmación del proveedor. `null` = este deporte no lleva red. */
export function ventanaDeFinalizacion(sportId: unknown): number | null {
    const id = Number(sportId);
    if (!Number.isFinite(id)) return VENTANA_POR_DEFECTO;
    if (SIN_RED.has(id)) return null;
    return VENTANA_POR_DEPORTE[id] ?? VENTANA_POR_DEFECTO;
}

/**
 * ¿Pasó tanto tiempo desde el inicio que el partido no puede seguir en juego?
 *
 * Función pura: el llamador pasa el reloj. Así se puede probar sin esperar un
 * sábado a las 15:30, que es la única forma honesta de verificar esto.
 *
 * NO exige marcador, igual que la red original de rugby: un partido cuyo
 * resultado el proveedor nunca mandó igual terminó, y la página lo dice con
 * «Sin marcador provisto por API» en vez de fingir que todavía no se juega.
 *
 * @param sportId  `sport_id` de FlashScore (8 = rugby union)
 * @param inicioMs el ARRANQUE en ms — el de la lista del día, no el de la ficha
 */
export function finalizadoPorTiempo(opciones: {
    sportId: unknown;
    inicioMs: number | null | undefined;
    ahoraMs: number;
}): boolean {
    const { sportId, inicioMs, ahoraMs } = opciones;
    if (inicioMs == null || !Number.isFinite(inicioMs) || inicioMs <= 0) return false;

    const ventana = ventanaDeFinalizacion(sportId);
    if (ventana == null) return false;

    const minutosDesdeElInicio = (ahoraMs - inicioMs) / 60000;
    return minutosDesdeElInicio > ventana;
}
