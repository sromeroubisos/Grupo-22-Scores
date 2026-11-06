/**
 * Decide en qué estado y con qué marcador queda un partido de RugbyPass
 * después de un sondeo en vivo.
 *
 * LA FUENTE DE VERDAD ES LA FICHA (`action=update`), NO EL POLL.
 *
 * `poll-vue-games` contesta `status: 0` y `0-0` para un partido que está en el
 * segundo tiempo (Irlanda–Argentina, 2026-11-06: el poll decía 0-0 con el
 * partido 42-12 al minuto 72). Tomar ese 0 como dato hacía dos daños: el
 * marcador se quedaba en 0-0 y, pasados los 100 minutos del kickoff, la guarda
 * de cierre lo daba por `final` con ese 0-0. Por eso el poll queda de
 * respaldo y SOLO se le cree cuando dice que el partido está en juego.
 */

export const RUGBY_MATCH_SPAN_MS = 100 * 60 * 1000;

export interface FilaRugbyPass {
    status: string;
    date_time: string;
    score?: { home?: number | null; away?: number | null; penalties?: unknown } | null;
}

export interface FichaVista {
    /** `game.id` que contestó la ficha: si no coincide, es OTRO partido. */
    gameId: number | null | undefined;
    terminado: boolean;
    home: number | null;
    away: number | null;
}

export interface PollVisto {
    status: string;
    home: number | null;
    away: number | null;
}

export interface Decision {
    status: string;
    score: FilaRugbyPass['score'];
    cambio: boolean;
}

const esNumero = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);

export function decidirRugbyPass(
    fila: FilaRugbyPass,
    gameId: number,
    ficha: FichaVista | null,
    poll: PollVisto | null,
    ahora: number,
): Decision {
    const kickoffMs = new Date(fila.date_time).getTime();
    const empezo = !Number.isNaN(kickoffMs) && ahora >= kickoffMs;
    const pasoElSpan = !Number.isNaN(kickoffMs) && ahora - kickoffMs > RUGBY_MATCH_SPAN_MS;

    let status = fila.status;
    let marcador: { home: number; away: number } | null = null;

    if (ficha !== null && ficha.gameId === gameId) {
        const traeMarcador = esNumero(ficha.home) && esNumero(ficha.away);
        if (ficha.terminado) {
            status = 'final';
            if (traeMarcador) marcador = { home: ficha.home as number, away: ficha.away as number };
        } else if (empezo) {
            status = 'live';
            if (traeMarcador) marcador = { home: ficha.home as number, away: ficha.away as number };
        }
    } else if (poll) {
        if (poll.status === 'live') {
            status = 'live';
            if (esNumero(poll.home) && esNumero(poll.away)) marcador = { home: poll.home, away: poll.away };
        } else if (fila.status === 'live' && pasoElSpan) {
            // Sin ficha y con el poll mudo, cerrar es lo único honesto, pero NO
            // se escribe el 0-0 del poll: se conserva el marcador guardado.
            status = 'final';
        }
    }

    const score = marcador ? { home: marcador.home, away: marcador.away, penalties: null } : fila.score ?? null;
    const cambioMarcador =
        marcador !== null && (fila.score?.home !== marcador.home || fila.score?.away !== marcador.away);

    return { status, score, cambio: status !== fila.status || cambioMarcador };
}
