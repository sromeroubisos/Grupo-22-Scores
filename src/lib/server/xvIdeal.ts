// Las votaciones del XV Ideal: dónde se guardan.
//
// Dos tablas de la migración 20261116120000_create_xv_ideal_polls.sql:
// `xv_ideal_polls` (una fila por votación, los candidatos en JSONB) y
// `xv_ideal_votes` (una boleta por votante y votación; volver a votar la
// pisa). Los votos no se leen con la sesión del usuario: traen el user_id de
// cada persona, así que todo pasa por service_role y a la pantalla solo
// llegan los números agregados.

import { createAdminClient } from '@/lib/supabase/admin';
import { isMissingTableError } from '@/lib/utils/supabaseSchema';
import {
    isXvPollOpen,
    isXvPollStatus,
    normalizeSlots,
    sanitizePicks,
    summarizeXvPoll,
    toPublicSummary,
    type XvPicks,
    type XvPoll,
    type XvPollSummary,
    type XvVote,
} from '@/lib/xvIdeal/xvIdeal';

const POLLS_TABLE = 'xv_ideal_polls';
const VOTES_TABLE = 'xv_ideal_votes';
const POLL_COLUMNS = 'id, group_key, tournament_id, name, title, position, status, slots, closes_at, created_at, updated_at';
const PAGE = 1000;

export const XV_IDEAL_MIGRATION = '20261116120000_create_xv_ideal_polls.sql';
export const XV_IDEAL_UNAVAILABLE = `La votación del XV Ideal todavía no está habilitada: falta correr la migración ${XV_IDEAL_MIGRATION}.`;

export class XvIdealUnavailableError extends Error {
    constructor() {
        super(XV_IDEAL_UNAVAILABLE);
        this.name = 'XvIdealUnavailableError';
    }
}

type Row = Record<string, unknown>;

function text(value: unknown): string | null {
    return typeof value === 'string' && value ? value : null;
}

function rowToPoll(row: Row | null | undefined): XvPoll | null {
    const id = text(row?.id);
    const groupKey = text(row?.group_key);
    if (!id || !groupKey) return null;
    return {
        id,
        groupKey,
        tournamentId: text(row?.tournament_id),
        name: text(row?.name) ?? '',
        title: text(row?.title) ?? '',
        position: typeof row?.position === 'number' ? row.position : 0,
        status: isXvPollStatus(row?.status) ? row!.status : 'closed',
        slots: normalizeSlots(row?.slots),
        closesAt: text(row?.closes_at),
        createdAt: text(row?.created_at) ?? '',
        updatedAt: text(row?.updated_at) ?? '',
    };
}

function fail(scope: string, error: unknown, table: string): never {
    if (isMissingTableError(error as never, table)) throw new XvIdealUnavailableError();
    console.error(`[xvIdeal] ${scope} failed:`, error);
    throw new Error('No se pudo acceder a la votación.');
}

async function readVotes(pollIds: string[]): Promise<Map<string, XvVote[]>> {
    const out = new Map<string, XvVote[]>();
    if (pollIds.length === 0) return out;

    const admin = createAdminClient();
    for (let from = 0; ; from += PAGE) {
        const { data, error } = await admin
            .from(VOTES_TABLE)
            .select('poll_id, user_id, picks')
            .in('poll_id', pollIds)
            .order('poll_id')
            .order('user_id')
            .range(from, from + PAGE - 1);
        if (error) fail('votes read', error, VOTES_TABLE);

        const rows = (data ?? []) as Row[];
        for (const row of rows) {
            const pollId = text(row.poll_id);
            const userId = text(row.user_id);
            if (!pollId || !userId) continue;
            const list = out.get(pollId) ?? [];
            list.push({ userId, picks: (row.picks ?? {}) as XvPicks });
            out.set(pollId, list);
        }
        if (rows.length < PAGE) break;
    }
    return out;
}

export interface XvIdealListing {
    /** false = falta correr la migración. */
    available: boolean;
    polls: XvPollSummary[];
}

/** Las votaciones de un grupo, en el orden de las pestañas, con el voto propio si hay sesión. */
export async function listXvIdealPolls(
    groupKey: string,
    userId: string | null,
    /** Solo el super admin pide los resultados. Por defecto NUNCA salen. */
    options: { includeResults?: boolean } = {},
): Promise<XvIdealListing> {
    const admin = createAdminClient();
    const { data, error } = await admin
        .from(POLLS_TABLE)
        .select(POLL_COLUMNS)
        .eq('group_key', groupKey)
        .order('position', { ascending: true })
        .order('created_at', { ascending: true });

    if (error) {
        if (isMissingTableError(error, POLLS_TABLE)) return { available: false, polls: [] };
        fail('list', error, POLLS_TABLE);
    }

    const polls = ((data ?? []) as Row[]).map(rowToPoll).filter((poll): poll is XvPoll => Boolean(poll));
    const votes = await readVotes(polls.map((poll) => poll.id));
    const now = Date.now();
    return {
        available: true,
        polls: polls.map((poll) => {
            const summary = summarizeXvPoll(poll, votes.get(poll.id) ?? [], userId, now);
            return options.includeResults ? summary : toPublicSummary(summary);
        }),
    };
}

export interface XvIdealOpenGroup {
    groupKey: string;
    title: string;
}

/**
 * Los grupos con alguna votación abierta, para anunciarlos en la home. Nunca
 * lanza: sin tablas, o con un error, no hay nada que anunciar. No trae cuántos
 * votos hay: los números son solo del super admin.
 */
export async function listOpenXvIdealGroups(): Promise<XvIdealOpenGroup[]> {
    const admin = createAdminClient();
    const { data, error } = await admin
        .from(POLLS_TABLE)
        .select(POLL_COLUMNS)
        .eq('status', 'open')
        .order('created_at', { ascending: false })
        .limit(PAGE);
    if (error) {
        if (!isMissingTableError(error, POLLS_TABLE)) console.error('[xvIdeal] open polls read failed:', error);
        return [];
    }

    const now = Date.now();
    const groups = new Map<string, XvIdealOpenGroup>();
    for (const row of (data ?? []) as Row[]) {
        const poll = rowToPoll(row);
        if (!poll || !isXvPollOpen(poll, now) || groups.has(poll.groupKey)) continue;
        groups.set(poll.groupKey, { groupKey: poll.groupKey, title: poll.title });
    }
    return [...groups.values()];
}

export async function getXvIdealPoll(id: string): Promise<XvPoll | null> {
    const admin = createAdminClient();
    const { data, error } = await admin.from(POLLS_TABLE).select(POLL_COLUMNS).eq('id', id).maybeSingle();
    if (error) fail('get', error, POLLS_TABLE);
    return rowToPoll(data as Row | null);
}

/** La boleta guardada de UNA persona en una votación (ya depurada), o null si no votó (la leen el mail y la placa). */
export async function getXvIdealUserPicks(poll: XvPoll, userId: string): Promise<XvPicks | null> {
    const admin = createAdminClient();
    const { data, error } = await admin
        .from(VOTES_TABLE)
        .select('picks')
        .eq('poll_id', poll.id)
        .eq('user_id', userId)
        .maybeSingle();
    if (error) fail('user picks', error, VOTES_TABLE);
    if (!data) return null;
    const picks = sanitizePicks(poll.slots, (data as Row).picks);
    return Object.keys(picks).length > 0 ? picks : null;
}

/** La boleta reemplaza a la anterior entera: quitar un puesto es no mandarlo. */
export async function castXvIdealVote(poll: XvPoll, userId: string, rawPicks: unknown): Promise<XvPollSummary> {
    const picks = sanitizePicks(poll.slots, rawPicks);
    const admin = createAdminClient();
    const { error } = await admin
        .from(VOTES_TABLE)
        .upsert(
            { poll_id: poll.id, user_id: userId, picks, updated_at: new Date().toISOString() },
            { onConflict: 'poll_id,user_id' },
        );
    if (error) fail('vote', error, VOTES_TABLE);

    const votes = await readVotes([poll.id]);
    // Quien vota no recibe el conteo: los resultados son solo del super admin.
    return toPublicSummary(summarizeXvPoll(poll, votes.get(poll.id) ?? [], userId, Date.now()));
}

export interface XvIdealDayCount {
    /** "2026-11-16", en hora de Buenos Aires. */
    day: string;
    /** Personas que votaron ESE día por primera vez. */
    votes: number;
}

export interface XvIdealAdminPoll {
    summary: XvPollSummary;
    /** Altas de votantes por día, de la más vieja a la más nueva. */
    byDay: XvIdealDayCount[];
    /** ISO del último voto o cambio de voto; null si todavía no votó nadie. */
    lastActivityAt: string | null;
}

const DAY_FORMAT = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
});

/**
 * El reporte COMPLETO de un grupo de votaciones: resultados por camiseta, personas
 * que votaron y evolución por día. Solo para el super admin: quien lo llama tiene
 * que haber verificado el rol antes. No incluye quién votó qué (ni ids ni mails).
 */
export async function getXvIdealAdminReport(groupKey: string): Promise<{ available: boolean; polls: XvIdealAdminPoll[] }> {
    const listing = await listXvIdealPolls(groupKey, null, { includeResults: true });
    if (!listing.available || listing.polls.length === 0) return { available: listing.available, polls: [] };

    const admin = createAdminClient();
    const dates = new Map<string, { created: string[]; lastActivity: string | null }>();
    for (const poll of listing.polls) dates.set(poll.id, { created: [], lastActivity: null });

    for (let from = 0; ; from += PAGE) {
        const { data, error } = await admin
            .from(VOTES_TABLE)
            .select('poll_id, created_at, updated_at')
            .in('poll_id', listing.polls.map((poll) => poll.id))
            .order('poll_id')
            .order('user_id')
            .range(from, from + PAGE - 1);
        if (error) fail('votes dates', error, VOTES_TABLE);
        const rows = (data ?? []) as Row[];
        for (const row of rows) {
            const entry = dates.get(text(row.poll_id) ?? '');
            if (!entry) continue;
            const created = text(row.created_at);
            const updated = text(row.updated_at) ?? created;
            if (created) entry.created.push(created);
            if (updated && (!entry.lastActivity || updated > entry.lastActivity)) entry.lastActivity = updated;
        }
        if (rows.length < PAGE) break;
    }

    return {
        available: true,
        polls: listing.polls.map((summary) => {
            const entry = dates.get(summary.id) ?? { created: [], lastActivity: null };
            const perDay = new Map<string, number>();
            for (const iso of entry.created) {
                const day = DAY_FORMAT.format(new Date(iso));
                perDay.set(day, (perDay.get(day) ?? 0) + 1);
            }
            return {
                summary,
                byDay: [...perDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([day, votes]) => ({ day, votes })),
                lastActivityAt: entry.lastActivity,
            };
        }),
    };
}
