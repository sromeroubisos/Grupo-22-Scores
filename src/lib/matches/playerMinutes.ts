/**
 * Minutos en cancha de cada jugador de un partido, CALCULADOS.
 *
 * Las formaciones no guardan minutos: salen de quién arrancó (`role: starter`),
 * de los cambios (`substitution`: `playerId` es el que SALE y `secondaryPlayerId`
 * el que ENTRA) y de la roja, sobre la duración reglamentaria. La cuenta es la de
 * `minutesFromLineup`; acá sólo se resuelven las entradas y salidas.
 *
 * Un partido sin NINGÚN cambio cargado devuelve vacío: casi siempre es un partido
 * donde los cambios no se cargaron, y dar 80' al titular sería inventar. Es el
 * mismo criterio que la ficha del jugador (`localPlayerProfile.playedMinutes`).
 */
import { minutesFromLineup } from './rugbyPlayerRating.ts';

export type MinutesSide = 'home' | 'away';

export type PlayerMatchMinutes = {
    side: MinutesSide;
    playerId: string;
    name: string;
    minutes: number;
};

const REGULATION_MINUTES = 80;
const RED_TYPES = new Set(['red_card', 'card_red']);

type RawEvent = Record<string, unknown>;

const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

function minuteOf(value: unknown): number | null {
    if (value === null || value === undefined || value === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

const detailsOf = (event: RawEvent) => (event.details && typeof event.details === 'object' ? event.details : {}) as RawEvent;
const typeOf = (event: RawEvent) => text(event.type || event.event_type).toLowerCase();

function eventSide(event: RawEvent): MinutesSide | null {
    const raw = text(event.team || detailsOf(event).team).toLowerCase();
    return raw === 'home' || raw === 'away' ? raw : null;
}

const eventPlayerId = (event: RawEvent) => text(event.playerId || event.player_id || detailsOf(event).playerId);
const eventSecondaryId = (event: RawEvent) =>
    text(event.secondaryPlayerId || detailsOf(event).secondaryPlayerId || detailsOf(event).subPlayerId);

export function computeMatchMinutes(
    lineups: unknown,
    events: unknown,
    duration: number = REGULATION_MINUTES,
): PlayerMatchMinutes[] {
    const source = lineups && typeof lineups === 'object' ? (lineups as Record<string, unknown>) : null;
    const list = (Array.isArray(events) ? events : []).filter((e): e is RawEvent => Boolean(e) && typeof e === 'object');
    const subs = list.filter((e) => typeOf(e) === 'substitution');
    if (!source || subs.length === 0) return [];

    const out: PlayerMatchMinutes[] = [];
    (['home', 'away'] as const).forEach((side) => {
        const players = source[side];
        if (!Array.isArray(players)) return;
        const sideSubs = subs.filter((e) => eventSide(e) === side);
        const sideReds = list.filter((e) => RED_TYPES.has(typeOf(e)) && eventSide(e) === side);

        players.forEach((entry) => {
            if (!entry || typeof entry !== 'object') return;
            const player = entry as RawEvent;
            const id = text(player.id);
            if (!id) return;

            const entered = sideSubs.find((e) => eventSecondaryId(e) === id);
            const left = sideSubs.find((e) => eventPlayerId(e) === id);
            const red = sideReds.find((e) => eventPlayerId(e) === id);

            const role = text(player.role) === 'starter' ? 'starter' : 'substitute';
            const onMinute = entered ? minuteOf(entered.minute) : null;
            // Entró pero sin minuto, o salió sin minuto: no se inventa.
            if (entered && onMinute === null) return;
            const offSource = left ?? red ?? null;
            const offMinute = offSource ? minuteOf(offSource.minute) : null;
            if (left && offMinute === null) return;

            // Un suplente que no entró no jugó; un titular sin cambio juega todo.
            const minutes = minutesFromLineup({ role: entered ? 'substitute' : role, onMinute, offMinute }, duration);
            if (minutes > 0) out.push({ side, playerId: id, name: text(player.name), minutes });
        });
    });
    return out;
}
