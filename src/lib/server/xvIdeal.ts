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
export async function listXvIdealPolls(groupKey: string, userId: string | null): Promise<XvIdealListing> {
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
        polls: polls.map((poll) => summarizeXvPoll(poll, votes.get(poll.id) ?? [], userId, now)),
    };
}

export interface XvIdealOpenGroup {
    groupKey: string;
    title: string;
    /** Personas que mandaron boleta en alguna zona del grupo (suma de las zonas). */
    voters: number | null;
}

/**
 * Los grupos con alguna votación abierta, para anunciarlos en la home. Nunca
 * lanza: sin tablas, o con un error, no hay nada que anunciar.
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
    const polls = ((data ?? []) as Row[])
        .map(rowToPoll)
        .filter((poll): poll is XvPoll => Boolean(poll) && isXvPollOpen(poll as XvPoll, now));
    if (polls.length === 0) return [];

    let votes: Map<string, XvVote[]> | null = null;
    try {
        votes = await readVotes(polls.map((poll) => poll.id));
    } catch (error) {
        console.error('[xvIdeal] open polls votes read failed:', error);
    }

    const groups = new Map<string, XvIdealOpenGroup>();
    for (const poll of polls) {
        const group = groups.get(poll.groupKey) ?? { groupKey: poll.groupKey, title: poll.title, voters: votes ? 0 : null };
        if (votes && group.voters !== null) {
            group.voters += (votes.get(poll.id) ?? []).filter((vote) => Object.keys(sanitizePicks(poll.slots, vote.picks)).length > 0).length;
        }
        groups.set(poll.groupKey, group);
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
    return summarizeXvPoll(poll, votes.get(poll.id) ?? [], userId, Date.now());
}
