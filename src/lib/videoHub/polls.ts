// La votación al mejor try (o gol, o punto: lo que se anote en ese deporte)
// dentro del hub de videos de un torneo. Este módulo es puro: define la forma
// de la votación y hace las cuentas. Quién puede crearla y dónde se guarda es
// asunto del servidor (src/lib/server/videoPolls.ts).

export type VideoPollStatus = 'open' | 'closed';

export function isVideoPollStatus(value: unknown): value is VideoPollStatus {
    return value === 'open' || value === 'closed';
}

/** Una opción es un video ya cargado en la ficha de un partido del torneo. */
export interface VideoPollOptionRef {
    matchId: string;
    videoId: string;
}

export interface VideoPollOption extends VideoPollOptionRef {
    /** `${matchId}|${videoId}`: estable, y es la llave con la que se guarda el voto. */
    id: string;
    /** Cómo se presenta el video en la votación ("Try de Boffelli"). Obligatorio al crear. */
    label: string;
}

/** Lo que manda el editor por cada video elegido. */
export interface VideoPollOptionInput extends VideoPollOptionRef {
    label: string;
}

export interface VideoPoll {
    id: string;
    tournamentId: string;
    /** El nombre de la votación, casi siempre la fecha: "Fecha 19". */
    name: string;
    /** La pregunta: "¿Cuál fue el mejor try?". */
    title: string;
    /** Lo que decidió quien administra. El estado que vale es `isPollOpen`. */
    status: VideoPollStatus;
    options: VideoPollOption[];
    /** ISO. Pasada esta fecha la votación se cierra sola; null = sin fecha. */
    closesAt: string | null;
    createdAt: string;
    updatedAt: string;
}

export interface VideoPollVote {
    optionId: string;
    userId: string;
}

export interface VideoPollSummary {
    poll: VideoPoll;
    /** Abierta de verdad: `status` open Y la fecha de cierre (si hay) no pasó. */
    isOpen: boolean;
    totalVotes: number;
    /** Votos por id de opción. Toda opción figura, aunque tenga cero. */
    votes: Record<string, number>;
    /** Enteros que suman 100 (todos cero si nadie votó). */
    percentages: Record<string, number>;
    /** Las que van primero. Varias si empatan; vacío sin votos. */
    leaderIds: string[];
    userOptionId: string | null;
}

export const MAX_POLL_NAME_LENGTH = 80;
export const MAX_POLL_TITLE_LENGTH = 140;
export const MAX_POLL_OPTION_LABEL_LENGTH = 80;
export const MIN_POLL_OPTIONS = 2;
export const MAX_POLL_OPTIONS = 12;

export function pollOptionId(ref: VideoPollOptionRef): string {
    return `${ref.matchId}|${ref.videoId}`;
}

/** ISO válido → ms; cualquier otra cosa → null. */
export function parseIsoTime(value: unknown): number | null {
    if (typeof value !== 'string' || !value.trim()) return null;
    const time = Date.parse(value);
    return Number.isFinite(time) ? time : null;
}

/** Vencida = tiene fecha de cierre y ya pasó. */
export function isPollExpired(poll: Pick<VideoPoll, 'closesAt'>, now: number): boolean {
    const closesAt = parseIsoTime(poll.closesAt);
    return closesAt !== null && closesAt <= now;
}

/** Abierta de verdad: lo que decidió quien administra Y la fecha, si hay. */
export function isPollOpen(poll: Pick<VideoPoll, 'status' | 'closesAt'>, now: number): boolean {
    return poll.status === 'open' && !isPollExpired(poll, now);
}

/** De lo que venga (payload, fila de la base) a opciones válidas y sin repetir. Nunca lanza. */
export function normalizePollOptions(raw: unknown): VideoPollOption[] {
    if (!Array.isArray(raw)) return [];

    const out: VideoPollOption[] = [];
    const seen = new Set<string>();

    for (const item of raw) {
        if (!item || typeof item !== 'object') continue;
        const record = item as Record<string, unknown>;
        const matchId = typeof record.matchId === 'string' ? record.matchId.trim() : '';
        const videoId = typeof record.videoId === 'string' ? record.videoId.trim() : '';
        if (!matchId || !videoId) continue;

        const id = pollOptionId({ matchId, videoId });
        if (seen.has(id)) continue;
        seen.add(id);

        const label = typeof record.label === 'string' ? record.label.trim().slice(0, MAX_POLL_OPTION_LABEL_LENGTH) : '';
        out.push({ id, matchId, videoId, label });
        if (out.length >= MAX_POLL_OPTIONS) break;
    }

    return out;
}

/**
 * Porcentajes enteros que suman 100 (método del resto mayor). Redondear cada
 * uno por su lado da 33 + 33 + 33 = 99, y el hincha lo nota.
 */
export function integerPercentages(votes: Record<string, number>, total: number): Record<string, number> {
    const ids = Object.keys(votes);
    const out: Record<string, number> = {};

    if (total <= 0) {
        for (const id of ids) out[id] = 0;
        return out;
    }

    const parts = ids.map((id) => {
        const exact = (votes[id] * 100) / total;
        const floor = Math.floor(exact);
        return { id, floor, remainder: exact - floor };
    });

    let left = 100 - parts.reduce((sum, part) => sum + part.floor, 0);
    const byRemainder = [...parts].sort((a, b) => b.remainder - a.remainder || a.id.localeCompare(b.id));
    for (const part of byRemainder) {
        out[part.id] = part.floor + (left > 0 ? 1 : 0);
        if (left > 0) left -= 1;
    }

    return out;
}

export function summarizePoll(
    poll: VideoPoll,
    rows: readonly VideoPollVote[],
    userId: string | null,
    now: number,
): VideoPollSummary {
    const votes: Record<string, number> = {};
    for (const option of poll.options) votes[option.id] = 0;

    let totalVotes = 0;
    let userOptionId: string | null = null;

    for (const row of rows) {
        // Un voto a una opción que se quitó después no cuenta ni se muestra.
        if (!(row.optionId in votes)) continue;
        votes[row.optionId] += 1;
        totalVotes += 1;
        if (userId && row.userId === userId) userOptionId = row.optionId;
    }

    const top = Math.max(0, ...Object.values(votes));
    const leaderIds = top > 0
        ? poll.options.filter((option) => votes[option.id] === top).map((option) => option.id)
        : [];

    return {
        poll,
        isOpen: isPollOpen(poll, now),
        totalVotes,
        votes,
        percentages: integerPercentages(votes, totalVotes),
        leaderIds,
        userOptionId,
    };
}

// ── El idioma del deporte ─────────────────────────────────────────────────

export interface PlayLabel {
    singular: string;
    plural: string;
}

/** Lo que se anota en ese deporte: try, gol, punto. Cae en "jugada" si no lo sabemos. */
export function playLabelForSport(sportId: string | null | undefined): PlayLabel {
    switch ((sportId ?? '').trim().toLowerCase()) {
        case 'rugby':
        case 'rugby-union':
        case 'rugby-league':
            return { singular: 'try', plural: 'tries' };
        case 'football':
        case 'soccer':
        case 'futsal':
        case 'field-hockey':
        case 'hockey':
        case 'handball':
        case 'water-polo':
            return { singular: 'gol', plural: 'goles' };
        case 'volleyball':
        case 'tennis':
        case 'padel':
            return { singular: 'punto', plural: 'puntos' };
        default:
            return { singular: 'jugada', plural: 'jugadas' };
    }
}

export function defaultPollTitle(sportId: string | null | undefined): string {
    return `¿Cuál fue el mejor ${playLabelForSport(sportId).singular}?`;
}
