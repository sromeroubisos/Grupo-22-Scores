// Las votaciones al mejor try de un torneo: dónde se guardan.
//
// Dos tablas de la migración 20260826120000_create_video_polls.sql:
// `video_polls` (una fila por votación, las opciones en JSONB) y
// `video_poll_votes` (una fila por votante y votación; cambiar el voto la
// pisa). Sin las tablas no hay votación: el hub le dice a quien administra
// qué migración falta, y al hincha no le muestra nada.

import { createAdminClient } from '@/lib/supabase/admin';
import { isMissingColumnError, isMissingTableError } from '@/lib/utils/supabaseSchema';
import { getVideoHub } from '@/lib/server/videoHub';
import {
    isVideoPollStatus,
    normalizePollOptions,
    summarizePoll,
    MIN_POLL_OPTIONS,
    type VideoPoll,
    type VideoPollOption,
    type VideoPollStatus,
    type VideoPollSummary,
    type VideoPollVote,
} from '@/lib/videoHub/polls';
import { findHubVideo } from '@/lib/videoHub/types';

const POLLS_TABLE = 'video_polls';
const VOTES_TABLE = 'video_poll_votes';
const POLL_COLUMNS = 'id, tournament_id, name, title, status, options, closes_at, created_at, updated_at';
const PAGE = 1000;

export const VIDEO_POLLS_MIGRATION = '20260826120000_create_video_polls.sql';
export const VIDEO_POLLS_UNAVAILABLE = `La votación todavía no está habilitada: falta correr la migración ${VIDEO_POLLS_MIGRATION}.`;
export const VIDEO_POLLS_OUTDATED = `La tabla video_polls está desactualizada (le faltan name y closes_at): volvé a correr la migración ${VIDEO_POLLS_MIGRATION}, que las agrega.`;

/** 'missing-table' = nunca corrió la migración · 'outdated-table' = corrió una versión vieja del archivo. */
export type VideoPollsUnavailableReason = 'missing-table' | 'outdated-table';

export class VideoPollsUnavailableError extends Error {
    readonly reason: VideoPollsUnavailableReason;

    constructor(reason: VideoPollsUnavailableReason = 'missing-table') {
        super(reason === 'outdated-table' ? VIDEO_POLLS_OUTDATED : VIDEO_POLLS_UNAVAILABLE);
        this.name = 'VideoPollsUnavailableError';
        this.reason = reason;
    }
}

/** Las columnas que se sumaron después de la primera versión del archivo. */
const LATER_COLUMNS = ['name', 'closes_at'];

function isOutdatedTableError(error: unknown): boolean {
    return LATER_COLUMNS.some((column) => isMissingColumnError(error as never, column));
}

type Row = Record<string, unknown>;

function text(value: unknown): string | null {
    return typeof value === 'string' && value ? value : null;
}

function rowToPoll(row: Row | null | undefined): VideoPoll | null {
    const id = text(row?.id);
    const tournamentId = text(row?.tournament_id);
    if (!id || !tournamentId) return null;
    return {
        id,
        tournamentId,
        name: text(row?.name) ?? '',
        title: text(row?.title) ?? '',
        status: isVideoPollStatus(row?.status) ? row!.status : 'closed',
        options: normalizePollOptions(row?.options),
        closesAt: text(row?.closes_at),
        createdAt: text(row?.created_at) ?? '',
        updatedAt: text(row?.updated_at) ?? '',
    };
}

function fail(scope: string, error: unknown, table: string): never {
    if (isMissingTableError(error as never, table)) throw new VideoPollsUnavailableError('missing-table');
    if (isOutdatedTableError(error)) throw new VideoPollsUnavailableError('outdated-table');
    console.error(`[videoPolls] ${scope} failed:`, error);
    throw new Error('No se pudo acceder a la votación.');
}

async function readVotes(pollIds: string[]): Promise<Map<string, VideoPollVote[]>> {
    const out = new Map<string, VideoPollVote[]>();
    if (pollIds.length === 0) return out;

    const admin = createAdminClient();
    for (let from = 0; ; from += PAGE) {
        const { data, error } = await admin
            .from(VOTES_TABLE)
            .select('poll_id, user_id, option_id')
            .in('poll_id', pollIds)
            .order('poll_id')
            .order('user_id')
            .range(from, from + PAGE - 1);
        if (error) fail('votes read', error, VOTES_TABLE);

        const rows = (data ?? []) as Row[];
        for (const row of rows) {
            const pollId = text(row.poll_id);
            const userId = text(row.user_id);
            const optionId = text(row.option_id);
            if (!pollId || !userId || !optionId) continue;
            const list = out.get(pollId) ?? [];
            list.push({ userId, optionId });
            out.set(pollId, list);
        }
        if (rows.length < PAGE) break;
    }

    return out;
}

export interface VideoPollsListing {
    /** false = faltan las tablas, o están viejas (ver `reason`). */
    available: boolean;
    reason?: VideoPollsUnavailableReason;
    polls: VideoPollSummary[];
}

export async function listVideoPolls(tournamentId: string, userId: string | null): Promise<VideoPollsListing> {
    const admin = createAdminClient();
    const { data, error } = await admin
        .from(POLLS_TABLE)
        .select(POLL_COLUMNS)
        .eq('tournament_id', tournamentId)
        .order('created_at', { ascending: false });

    if (error) {
        if (isMissingTableError(error, POLLS_TABLE)) return { available: false, reason: 'missing-table', polls: [] };
        if (isOutdatedTableError(error)) return { available: false, reason: 'outdated-table', polls: [] };
        fail('list', error, POLLS_TABLE);
    }

    const polls = ((data ?? []) as Row[]).map(rowToPoll).filter((poll): poll is VideoPoll => Boolean(poll));
    const votes = await readVotes(polls.map((poll) => poll.id));

    const now = Date.now();
    return {
        available: true,
        polls: polls.map((poll) => summarizePoll(poll, votes.get(poll.id) ?? [], userId, now)),
    };
}

export async function getVideoPoll(id: string): Promise<VideoPoll | null> {
    const admin = createAdminClient();
    const { data, error } = await admin.from(POLLS_TABLE).select(POLL_COLUMNS).eq('id', id).maybeSingle();
    if (error) fail('get', error, POLLS_TABLE);
    return rowToPoll(data as Row | null);
}

export async function summarizeVideoPoll(poll: VideoPoll, userId: string | null): Promise<VideoPollSummary> {
    const votes = await readVotes([poll.id]);
    return summarizePoll(poll, votes.get(poll.id) ?? [], userId, Date.now());
}

/** Cada opción tiene que ser un video real de un partido de ESTE torneo. */
export async function validatePollOptions(
    tournamentId: string,
    options: VideoPollOption[],
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
    if (options.length < MIN_POLL_OPTIONS) {
        return { ok: false, status: 400, error: `Elegí al menos ${MIN_POLL_OPTIONS} videos para votar.` };
    }
    const hub = await getVideoHub(tournamentId);
    if (!hub) return { ok: false, status: 404, error: 'Ese torneo no tiene hub de videos.' };

    const missing = options.filter((option) => !findHubVideo(hub, option));
    if (missing.length > 0) {
        return { ok: false, status: 400, error: 'Alguna de las opciones ya no es un video de este torneo.' };
    }
    return { ok: true };
}

export async function createVideoPoll(input: {
    tournamentId: string;
    name: string;
    title: string;
    status: VideoPollStatus;
    options: VideoPollOption[];
    closesAt: string | null;
    createdBy: string | null;
}): Promise<VideoPoll> {
    const admin = createAdminClient();
    const now = new Date().toISOString();
    const { data, error } = await admin
        .from(POLLS_TABLE)
        .insert({
            tournament_id: input.tournamentId,
            name: input.name,
            title: input.title,
            status: input.status,
            options: input.options,
            closes_at: input.closesAt,
            created_by: input.createdBy,
            created_at: now,
            updated_at: now,
        })
        .select(POLL_COLUMNS)
        .single();
    if (error) fail('create', error, POLLS_TABLE);

    const poll = rowToPoll(data as Row);
    if (!poll) throw new Error('No se pudo crear la votación.');
    return poll;
}

export async function updateVideoPoll(
    id: string,
    patch: { name?: string; title?: string; status?: VideoPollStatus; options?: VideoPollOption[]; closesAt?: string | null },
): Promise<VideoPoll | null> {
    const admin = createAdminClient();
    const payload: Row = { updated_at: new Date().toISOString() };
    if (patch.name !== undefined) payload.name = patch.name;
    if (patch.title !== undefined) payload.title = patch.title;
    if (patch.status !== undefined) payload.status = patch.status;
    if (patch.options !== undefined) payload.options = patch.options;
    if (patch.closesAt !== undefined) payload.closes_at = patch.closesAt;

    const { data, error } = await admin
        .from(POLLS_TABLE)
        .update(payload)
        .eq('id', id)
        .select(POLL_COLUMNS)
        .maybeSingle();
    if (error) fail('update', error, POLLS_TABLE);
    return rowToPoll(data as Row | null);
}

export async function deleteVideoPoll(id: string): Promise<void> {
    const admin = createAdminClient();
    const { error } = await admin.from(POLLS_TABLE).delete().eq('id', id);
    if (error) fail('delete', error, POLLS_TABLE);
}

/** Un voto por persona y votación: volver a votar lo cambia. */
export async function castVideoPollVote(poll: VideoPoll, userId: string, optionId: string): Promise<VideoPollSummary> {
    const admin = createAdminClient();
    const { error } = await admin
        .from(VOTES_TABLE)
        .upsert(
            {
                poll_id: poll.id,
                user_id: userId,
                option_id: optionId,
                updated_at: new Date().toISOString(),
            },
            { onConflict: 'poll_id,user_id' },
        );
    if (error) fail('vote', error, VOTES_TABLE);
    return summarizeVideoPoll(poll, userId);
}
