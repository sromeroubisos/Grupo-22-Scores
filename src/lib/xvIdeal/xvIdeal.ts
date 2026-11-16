// La votación del XV Ideal de un torneo. Este módulo es puro: define la forma
// de la votación y hace las cuentas. Dónde se guarda y quién puede votar es
// asunto del servidor (src/lib/server/xvIdeal.ts).
//
// Una votación tiene una entrada por camiseta (`slots`) y cada una sus
// candidatos. La boleta de una persona es `{ "1": "<candidato>", "10": ... }`:
// puede votar solo algunos puestos, y volver a votar la reemplaza entera.

export type XvPollStatus = 'open' | 'closed';

export function isXvPollStatus(value: unknown): value is XvPollStatus {
    return value === 'open' || value === 'closed';
}

export interface XvCandidate {
    /** Estable dentro de la votación: `${camiseta}-${nombre en kebab}`. Es lo que se guarda en el voto. */
    id: string;
    name: string;
    /** La unión o seleccionado: "Buenos Aires". */
    team: string;
    /** Ruta del escudo del equipo (`/clubs/…png`); null = se muestra la inicial. */
    logo: string | null;
    /** Partidos jugados en el torneo; null = no se sabe. */
    pj: number | null;
    /** Puntos que sumó en el torneo; null = no se sabe. */
    points: number | null;
}

export interface XvSlot {
    /** Camiseta, 1 a 15. */
    jersey: number;
    /** "Pilar izquierdo". */
    label: string;
    candidates: XvCandidate[];
}

export interface XvPoll {
    id: string;
    groupKey: string;
    tournamentId: string | null;
    name: string;
    title: string;
    position: number;
    status: XvPollStatus;
    slots: XvSlot[];
    closesAt: string | null;
    createdAt: string;
    updatedAt: string;
}

/** { camiseta: candidato }. Las llaves son números en texto: así viaja en JSON. */
export type XvPicks = Record<string, string>;

export interface XvVote {
    userId: string;
    picks: XvPicks;
}

export const MAX_XV_SLOTS = 15;
export const MAX_XV_CANDIDATES = 12;

/** Las líneas del XV, para agrupar los puestos en pantalla. */
export const XV_LINES: ReadonlyArray<{ label: string; jerseys: readonly number[] }> = [
    { label: 'Primera línea', jerseys: [1, 2, 3] },
    { label: 'Segunda línea', jerseys: [4, 5] },
    { label: 'Tercera línea', jerseys: [6, 7, 8] },
    { label: 'Medio scrum y apertura', jerseys: [9, 10] },
    { label: 'Tres cuartos', jerseys: [11, 12, 13, 14] },
    { label: 'Fullback', jerseys: [15] },
];

/**
 * La cancha: cada fila es una línea del XV y `col` el casillero (de 11) donde
 * arranca cada bloque de 3. Es la disposición de la placa del XV ideal:
 * 1-2-3 / 4-5 / 6-8-7 / 9-10 / 12-13 / 11-15-14. La usan la pantalla y la placa.
 */
export const XV_PITCH: ReadonlyArray<ReadonlyArray<{ jersey: number; col: number }>> = [
    [{ jersey: 1, col: 1 }, { jersey: 2, col: 5 }, { jersey: 3, col: 9 }],
    [{ jersey: 4, col: 3 }, { jersey: 5, col: 7 }],
    [{ jersey: 6, col: 1 }, { jersey: 8, col: 5 }, { jersey: 7, col: 9 }],
    [{ jersey: 9, col: 3 }, { jersey: 10, col: 7 }],
    [{ jersey: 12, col: 3 }, { jersey: 13, col: 7 }],
    [{ jersey: 11, col: 1 }, { jersey: 15, col: 5 }, { jersey: 14, col: 9 }],
];

export function slugify(value: string): string {
    return value
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

export function candidateId(jersey: number, name: string): string {
    return `${jersey}-${slugify(name)}`;
}

function toCount(value: unknown): number | null {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.trunc(value) : null;
}

/** Lo que se lee del JSONB, con cada pieza validada; lo que no cierra se descarta. */
export function normalizeSlots(raw: unknown): XvSlot[] {
    if (!Array.isArray(raw)) return [];
    const slots: XvSlot[] = [];
    const seen = new Set<number>();

    for (const entry of raw) {
        if (!entry || typeof entry !== 'object') continue;
        const slot = entry as Record<string, unknown>;
        const jersey = typeof slot.jersey === 'number' ? Math.trunc(slot.jersey) : NaN;
        const label = typeof slot.label === 'string' ? slot.label.trim() : '';
        if (!(jersey >= 1 && jersey <= MAX_XV_SLOTS) || !label || seen.has(jersey)) continue;

        const ids = new Set<string>();
        const candidates: XvCandidate[] = [];
        for (const item of Array.isArray(slot.candidates) ? slot.candidates : []) {
            if (!item || typeof item !== 'object') continue;
            const c = item as Record<string, unknown>;
            const id = typeof c.id === 'string' ? c.id.trim() : '';
            const name = typeof c.name === 'string' ? c.name.trim() : '';
            if (!id || !name || ids.has(id)) continue;
            ids.add(id);
            candidates.push({
                id,
                name,
                team: typeof c.team === 'string' ? c.team.trim() : '',
                // Solo rutas propias del sitio: el JSONB no es lugar para colar una URL ajena.
                logo: typeof c.logo === 'string' && /^\/[\w\-./]+$/.test(c.logo) ? c.logo : null,
                pj: toCount(c.pj),
                points: toCount(c.points),
            });
        }
        if (candidates.length === 0) continue;

        seen.add(jersey);
        slots.push({ jersey, label, candidates: candidates.slice(0, MAX_XV_CANDIDATES) });
    }

    return slots.sort((a, b) => a.jersey - b.jersey);
}

/**
 * La boleta que llega, reducida a lo válido: solo camisetas que existen en la
 * votación y solo candidatos de ESA camiseta. Lo demás se descarta en silencio
 * (el cliente nunca lo manda; si llega, es un cliente viejo o un intento de
 * meter ruido).
 */
export function sanitizePicks(slots: readonly XvSlot[], raw: unknown): XvPicks {
    const picks: XvPicks = {};
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return picks;
    const input = raw as Record<string, unknown>;

    for (const slot of slots) {
        const choice = input[String(slot.jersey)];
        if (typeof choice === 'string' && slot.candidates.some((candidate) => candidate.id === choice)) {
            picks[String(slot.jersey)] = choice;
        }
    }
    return picks;
}

/**
 * Para votar en una zona hay que completar su XV entero: un jugador en cada
 * una de las camisetas de la votación. No hace falta votar las dos zonas: cada
 * una es una votación aparte.
 */
export function isCompleteBallot(slots: readonly XvSlot[], picks: XvPicks): boolean {
    return slots.length > 0 && slots.every((slot) => Boolean(picks[String(slot.jersey)]));
}

/** Una votación cerrada a mano, o cuya fecha de cierre pasó, no admite más votos. */
export function isXvPollOpen(poll: Pick<XvPoll, 'status' | 'closesAt'>, now: number): boolean {
    if (poll.status !== 'open') return false;
    if (!poll.closesAt) return true;
    const closes = Date.parse(poll.closesAt);
    return Number.isNaN(closes) || now < closes;
}

export interface XvCandidateResult extends XvCandidate {
    votes: number;
    /** Entero 0-100 sobre los votos de esa camiseta; 0 si nadie votó. */
    percent: number;
}

export interface XvSlotResult {
    jersey: number;
    label: string;
    /** Votos emitidos para esta camiseta. */
    total: number;
    /** En el orden en que se cargaron (el de la lista del torneo). */
    candidates: XvCandidateResult[];
}

/** De más a menos votos; a igualdad, el orden de carga (el sort es estable). */
export function byVotes(candidates: readonly XvCandidateResult[]): XvCandidateResult[] {
    return [...candidates].sort((a, b) => b.votes - a.votes);
}

export interface XvPollSummary extends Omit<XvPoll, 'slots'> {
    isOpen: boolean;
    /** Personas que mandaron boleta. */
    voters: number;
    results: XvSlotResult[];
    /** La boleta de quien mira; null si no votó o no hay sesión. */
    userPicks: XvPicks | null;
}

export function summarizeXvPoll(
    poll: XvPoll,
    votes: readonly XvVote[],
    userId: string | null,
    now: number,
): XvPollSummary {
    const sanitized = votes.map((vote) => ({ userId: vote.userId, picks: sanitizePicks(poll.slots, vote.picks) }));
    const voters = sanitized.filter((vote) => Object.keys(vote.picks).length > 0).length;

    const results: XvSlotResult[] = poll.slots.map((slot) => {
        const counts = new Map<string, number>();
        for (const vote of sanitized) {
            const choice = vote.picks[String(slot.jersey)];
            if (choice) counts.set(choice, (counts.get(choice) ?? 0) + 1);
        }
        const total = [...counts.values()].reduce((sum, n) => sum + n, 0);

        // En el orden en que se cargaron: la boleta no puede reordenarse sola
        // mientras se vota. Quien necesite el ranking usa `byVotes`.
        const candidates = slot.candidates.map((candidate): XvCandidateResult => {
            const count = counts.get(candidate.id) ?? 0;
            return {
                ...candidate,
                votes: count,
                percent: total > 0 ? Math.round((count / total) * 100) : 0,
            };
        });

        return { jersey: slot.jersey, label: slot.label, total, candidates };
    });

    const own = userId ? sanitized.find((vote) => vote.userId === userId) : undefined;
    const { slots: _slots, ...rest } = poll;
    void _slots;
    return {
        ...rest,
        isOpen: isXvPollOpen(poll, now),
        voters,
        results,
        userPicks: own && Object.keys(own.picks).length > 0 ? own.picks : null,
    };
}

/**
 * La versión pública de un resumen: sin un solo dato de votos (ni cuántas
 * personas votaron, ni cuántos votos tiene cada jugador). Los resultados son
 * solo del super admin: lo que sale a la pantalla pública pasa siempre por acá,
 * así que el navegador de un hincha nunca recibe un número que no debe ver.
 * Conserva `userPicks` (la boleta propia) y la estructura de la cancha.
 */
export function toPublicSummary(summary: XvPollSummary): XvPollSummary {
    return {
        ...summary,
        voters: 0,
        results: summary.results.map((slot) => ({
            ...slot,
            total: 0,
            candidates: slot.candidates.map((candidate) => ({ ...candidate, votes: 0, percent: 0 })),
        })),
    };
}
