/**
 * El estado de un partido tal como lo cuentan los proveedores externos.
 *
 * ── Por qué existe este archivo ────────────────────────────────────────────
 * Esta lógica vivía adentro de `MatchDetailClientPage.tsx`, y eso fue
 * exactamente la causa del bug que lo trajo acá: el match center tenía su
 * propia copia privada del traductor de estados, más vieja y más pobre que la
 * del feed diario, sin `stage` y sin la red de tiempo. Un partido terminado
 * 12-36 se dibujaba «Programado».
 *
 * Adentro de un componente cliente de 3.500 líneas no se puede probar nada: hace
 * falta un navegador, un partido jugándose y suerte. Acá son funciones puras y
 * se verifican contra el payload REAL del proveedor.
 *
 * El vocabulario —qué palabras significan terminado, en vivo o suspendido— NO
 * se duplica: sale entero de `resolverEstado` en `@/lib/utils/matchState`. Este
 * archivo sólo traduce ESE vocabulario a los cinco estados que dibuja la página
 * y resuelve las contradicciones entre las dos respuestas del proveedor.
 */
import { resolverEstado, finalizadoPorTiempo } from '../utils/matchState.ts';

export type EstadoDeLaPagina = 'scheduled' | 'live' | 'final' | 'postponed' | 'cancelled';

/**
 * Traduce un token de texto al vocabulario de esta página apoyándose en
 * `resolverEstado`, que es donde vive la lista completa —siglas, frases, los
 * dos idiomas— y donde están los tests.
 *
 * Devuelve `null` cuando el token no dice nada, para que el llamador pueda
 * seguir buscando en otro campo. Esa es la diferencia con `resolverEstado`, que
 * devuelve 'programado' tanto para "scheduled" como para un campo vacío: acá
 * hacen falta distintos, porque «no sé» no es «no empezó».
 */
export function estadoDesdeToken(token: unknown): EstadoDeLaPagina | null {
    const crudo = String(token ?? '').trim().toLowerCase();
    if (!crudo) return null;

    const { estado, etiqueta } = resolverEstado(crudo);
    switch (estado) {
        case 'finalizado': return 'final';
        case 'en-vivo': return 'live';
        // La página no tiene estado propio para el descanso, y el descanso es
        // tiempo de juego: el partido está en curso.
        case 'entretiempo': return 'live';
        case 'suspendido':
            // `resolverEstado` colapsa los suspendidos en un solo estado, pero
            // conserva el motivo en la etiqueta — y acá sí se distinguen.
            return etiqueta === 'POSTERGADO' ? 'postponed' : 'cancelled';
        default:
            return null;
    }
}

export function mapMatchStatus(matchStatusObj: any, simpleStatus?: string): EstadoDeLaPagina {
    if (matchStatusObj) {
        if (matchStatusObj.type === 'inprogress') return 'live';
        if (matchStatusObj.type === 'finished') return 'final';
        if (matchStatusObj.type === 'postponed') return 'postponed';
        if (matchStatusObj.type === 'canceled' || matchStatusObj.type === 'cancelled') return 'cancelled';

        if (matchStatusObj.is_finished) return 'final';
        if (matchStatusObj.is_postponed) return 'postponed';
        if (matchStatusObj.is_cancelled) return 'cancelled';
        if (matchStatusObj.is_in_progress) return 'live';

        // `stage` faltaba, y es JUSTO el campo que en la ficha de este proveedor
        // dice literalmente "Finished". Va antes que `is_started`: un partido
        // terminado también está empezado, y leer sólo el arranque lo deja
        // eternamente en vivo.
        const porToken = estadoDesdeToken(matchStatusObj.stage) ?? estadoDesdeToken(matchStatusObj.code);
        if (porToken) return porToken;

        if (matchStatusObj.is_started) return 'live';
    }

    return estadoDesdeToken(simpleStatus) ?? 'scheduled';
}

/**
 * El estado definitivo del partido, cruzando la ficha con la lista del día.
 *
 * FlashScore manda el estado por DOS caminos y se contradicen. Medido sobre
 * `ALypVsfU`: la ficha decía `stage: "Finished"`, `is_finished: true`; la lista
 * del día, para el MISMO id y con el marcador 12-36 ya cargado, mandaba
 * `stage: null` y todos los flags en `false`.
 *
 * El objeto de estado de la lista SIEMPRE viene; a veces viene vacío. El guard
 * anterior —`listMatchEvt?.match_status ? … : fsStatus`— preguntaba si el sobre
 * existía, no si adentro había algo escrito, así que el sobre vacío ganaba
 * siempre y el partido terminado se dibujaba «Programado».
 *
 * La lista conserva la prioridad, porque es la que llega fresca cuando un
 * partido arranca o termina. Pero sólo cuando dice algo: un 'scheduled' de la
 * lista no puede pisar un 'final' que la ficha ya confirmó.
 *
 * Y arriba de todo va la red de tiempo, la misma que usa el feed diario: si
 * pasó más de lo que dura el deporte, el partido no sigue en juego aunque los
 * dos caminos se hayan quedado callados.
 */
export function cruzarEstado(opciones: {
    listMatchEvt: any;
    fichaStatus: EstadoDeLaPagina;
    sportId: unknown;
    fichaTimestamp?: unknown;
    fechaBase?: unknown;
    /** El reloj entra por parámetro para que esto se pueda probar sin esperar
     *  un sábado a las 15:30. La página no lo pasa: usa el de verdad. */
    ahoraMs?: number;
}): EstadoDeLaPagina {
    const { listMatchEvt, fichaStatus, sportId, fichaTimestamp, fechaBase, ahoraMs = Date.now() } = opciones;

    const deLaLista = listMatchEvt?.match_status ? mapMatchStatus(listMatchEvt.match_status) : null;
    const cruzado: EstadoDeLaPagina = deLaLista && deLaLista !== 'scheduled' ? deLaLista : fichaStatus;

    // Un suspendido explícito no se toca: la red mediría tiempo desde un partido
    // que no se jugó y lo daría por terminado.
    if (cruzado === 'final' || cruzado === 'postponed' || cruzado === 'cancelled') return cruzado;

    return finalizadoPorTiempo({ sportId, inicioMs: resolverArranque(listMatchEvt, fichaTimestamp, fechaBase), ahoraMs })
        ? 'final'
        : cruzado;
}

/**
 * El arranque real del partido, en ms.
 *
 * El orden no es caprichoso: en un partido terminado el `timestamp` de la FICHA
 * ya no es el horario de inicio —en el caso medido venía corrido 104 minutos,
 * o sea hasta el final del partido—. El de la LISTA del día sí es el arranque,
 * así que ese va primero. Anclar la red al de la ficha sería medir contra un
 * número que se mueve.
 */
export function resolverArranque(listMatchEvt: any, fichaTimestamp: unknown, fechaBase: unknown): number | null {
    const deLaLista = Number(listMatchEvt?.timestamp);
    if (Number.isFinite(deLaLista) && deLaLista > 0) return deLaLista * 1000;

    const deLaFicha = Number(fichaTimestamp);
    if (Number.isFinite(deLaFicha) && deLaFicha > 0) return deLaFicha * 1000;

    const parseada = Date.parse(String(fechaBase ?? ''));
    return Number.isFinite(parseada) ? parseada : null;
}
