/**
 * Aviso en vivo de un partido: UNA notificacion por partido y por usuario que se
 * va reemplazando (mismo `tag`) con el marcador y el minuto, como las apps de
 * resultados. Este modulo es PURO (sin red ni base): decide que cambio entre dos
 * fotos del partido y arma el texto. El cron lo usa y el test lo mide.
 *
 * Limites de la plataforma, para no prometer de mas:
 *  - Android (Chrome/Edge): el aviso se reemplaza por `tag`, puede quedar fijo
 *    (`requireInteraction`) y las actualizaciones pueden ir en silencio.
 *  - iPhone (PWA instalada): reemplaza por `tag`, pero no queda fijo y cada push
 *    se muestra, asi que ahi solo se mandan hitos (nada de "avanzo el minuto").
 *  - Ninguna web puede correr el reloj sola ni dibujar una Live Activity.
 */

export type LivePhase = 'scheduled' | 'first' | 'second' | 'halftime' | 'extra' | 'final';

export type LiveSnapshot = {
    matchId: string;
    sportId: string | null;
    homeName: string;
    awayName: string;
    home: number;
    away: number;
    phase: LivePhase;
    minute: number | null;
    redCards: number;
    /** Ultima jugada que cambio el marcador o fue roja, ya redactada. */
    lastPlay: string | null;
};

/** Lo que se guardo la ultima vez que se le mando algo a este usuario. */
export type LiveSentState = {
    home: number;
    away: number;
    phase: LivePhase;
    redCards: number;
    minute: number | null;
    pushedAt: number; // epoch ms
};

export type LiveKind = 'start' | 'score' | 'red' | 'halftime' | 'second-half' | 'final' | 'tick';

export type LiveDecision = {
    kind: LiveKind;
    /** Suena y vibra. Los `tick` van en silencio. */
    loud: boolean;
};

/** Cada cuanto se refresca el minuto en silencio (solo Android). */
export const TICK_EVERY_MS = 10 * 60 * 1000;

const LIVE_STATUS = new Set([
    'live', 'in_play', 'inplay', 'in play', 'playing', 'inprogress', 'in progress', 'in_progress',
    '1st half', '2nd half', 'primer tiempo', 'segundo tiempo', 'extra time',
]);
const HALFTIME_STATUS = new Set(['half time', 'half-time', 'halftime', 'half_time', 'ht', 'entretiempo', 'descanso']);
const FINAL_STATUS = new Set(['final', 'finished', 'completed', 'ft', 'full time', 'full-time', 'fulltime', 'ended', 'finalizado', 'terminado']);

export const LIVE_STATUS_VALUES = [...LIVE_STATUS, ...HALFTIME_STATUS];
export const FINAL_STATUS_VALUES = [...FINAL_STATUS];

type ClockLike = {
    minute?: unknown;
    period?: unknown;
    running?: unknown;
    is_running?: unknown;
    period_started_at?: unknown;
    accumulated_seconds?: unknown;
} | null | undefined;

function norm(value: unknown) {
    return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

export function phaseOf(status: unknown, clock: ClockLike): LivePhase {
    const s = norm(status);
    if (FINAL_STATUS.has(s)) return 'final';
    if (HALFTIME_STATUS.has(s)) return 'halftime';

    const period = norm(clock?.period);
    if (period === 'ht') return 'halftime';
    if (period === 'ft') return 'final';
    if (LIVE_STATUS.has(s)) {
        if (period === '2t' || period === '2h' || s === '2nd half' || s === 'segundo tiempo') return 'second';
        if (period === 'et' || period === 'ot' || s === 'extra time') return 'extra';
        return 'first';
    }
    return 'scheduled';
}

export function isLiveStatus(status: unknown) {
    const s = norm(status);
    return LIVE_STATUS.has(s) || HALFTIME_STATUS.has(s);
}

export function isFinalStatus(status: unknown) {
    return FINAL_STATUS.has(norm(status));
}

/** Minuto de juego. Con el reloj corriendo se calcula; si no, el ultimo guardado. */
export function minuteOf(clock: ClockLike, now: number): number | null {
    if (!clock) return null;
    const running = clock.running === true || clock.is_running === true;
    const accumulated = Number(clock.accumulated_seconds);
    const startedAt = typeof clock.period_started_at === 'string' ? Date.parse(clock.period_started_at) : NaN;

    if (running && Number.isFinite(accumulated) && Number.isFinite(startedAt)) {
        const seconds = accumulated + Math.max(0, (now - startedAt) / 1000);
        return Math.min(Math.floor(seconds / 60), 130);
    }

    const stored = Number(clock.minute);
    return Number.isFinite(stored) && stored >= 0 ? Math.floor(stored) : null;
}

/**
 * Que cambio entre lo ultimo enviado y lo de ahora. `null` = no mandar nada.
 * `canTick`: este dispositivo acepta refrescos silenciosos (Android).
 */
export function decideLive(
    prev: LiveSentState | null,
    next: LiveSnapshot,
    now: number,
    canTick: boolean,
): LiveDecision | null {
    if (next.phase === 'scheduled') return null;

    if (!prev) {
        // Sin aviso previo: un final solo se manda si el partido recien termino
        // (lo decide quien llama), y un partido en curso arranca con su foto.
        if (next.phase === 'final') return { kind: 'final', loud: true };
        return { kind: 'start', loud: true };
    }

    if (prev.phase === 'final') return null;
    if (next.phase === 'final') return { kind: 'final', loud: true };
    if (next.home !== prev.home || next.away !== prev.away) return { kind: 'score', loud: true };
    if (next.redCards > prev.redCards) return { kind: 'red', loud: true };
    if (next.phase === 'halftime' && prev.phase !== 'halftime') return { kind: 'halftime', loud: true };
    if (next.phase === 'second' && prev.phase !== 'second') return { kind: 'second-half', loud: true };

    if (canTick && next.minute !== null && prev.minute !== next.minute && now - prev.pushedAt >= TICK_EVERY_MS) {
        return { kind: 'tick', loud: false };
    }

    return null;
}

const PHASE_LABEL: Record<LivePhase, string> = {
    scheduled: 'Por comenzar',
    first: '1.er tiempo',
    second: '2.º tiempo',
    halftime: 'Entretiempo',
    extra: 'Tiempo extra',
    final: 'Final',
};

const SPORT_ICON: Record<string, string> = {
    rugby: '🏉',
    hockey: '🏑',
    futbol: '⚽',
    football: '⚽',
    soccer: '⚽',
    basquet: '🏀',
    basketball: '🏀',
    voley: '🏐',
    volleyball: '🏐',
    handball: '🤾',
};

export function sportIcon(sportId: string | null | undefined) {
    return SPORT_ICON[norm(sportId)] ?? '🏉';
}

export type LiveMessage = {
    title: string;
    body: string;
    tag: string;
    silent: boolean;
    renotify: boolean;
    requireInteraction: boolean;
};

export function liveTag(matchId: string) {
    return `g22-match-${matchId}`;
}

export function buildLiveMessage(next: LiveSnapshot, decision: LiveDecision, sticky: boolean): LiveMessage {
    const title = `${sportIcon(next.sportId)} ${next.homeName} ${next.home} – ${next.away} ${next.awayName}`;

    const clockLine = next.phase === 'halftime' || next.phase === 'final'
        ? PHASE_LABEL[next.phase]
        : next.minute !== null
            ? `${PHASE_LABEL[next.phase]} · ${next.minute}'`
            : PHASE_LABEL[next.phase];

    let headline: string | null = null;
    switch (decision.kind) {
        case 'start':
            headline = next.phase === 'first' && (next.minute ?? 0) <= 5 ? 'Comenzó el partido' : null;
            break;
        case 'score':
        case 'red':
            headline = next.lastPlay;
            break;
        case 'second-half':
            headline = 'Arrancó el segundo tiempo';
            break;
        case 'final':
            headline = 'Terminó el partido';
            break;
        default:
            headline = null;
    }

    const lines = [headline, clockLine].filter((line): line is string => Boolean(line));

    return {
        title,
        body: lines.join('\n'),
        tag: liveTag(next.matchId),
        // Un aviso nuevo de hito suena; el refresco del minuto reemplaza en silencio.
        silent: !decision.loud,
        renotify: decision.loud,
        // Solo queda fijo mientras se juega; el final se suelta y se puede descartar.
        requireInteraction: sticky && next.phase !== 'final',
    };
}

/** Etiquetas en castellano de los tipos de jugada. Lo que no esta aca no se avisa. */
const PLAY_LABEL: Record<string, string> = {
    try: 'Try',
    penalty_try: 'Try penal',
    conversion: 'Conversión',
    penalty_goal: 'Penal',
    drop_goal: 'Drop',
    card_red: 'Tarjeta roja',
    goal: 'Gol',
};

export function isNotifiablePlay(eventType: string | null | undefined) {
    return Boolean(eventType && PLAY_LABEL[eventType]);
}

export function describePlay(
    eventType: string | null | undefined,
    playerName: string | null | undefined,
    clubName: string | null | undefined,
): string | null {
    const label = eventType ? PLAY_LABEL[eventType] : null;
    if (!label) return null;

    const who = playerName?.trim() ? ` de ${playerName.trim()}` : '';
    const club = clubName?.trim() ? ` (${clubName.trim()})` : '';
    return `${label}${who}${club}`;
}

/** iPhone/iPad: no admiten aviso fijo ni refrescos silenciosos. */
export function isIosUserAgent(userAgent: string | null | undefined) {
    return /iphone|ipad|ipod/i.test(userAgent ?? '');
}
