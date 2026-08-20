import { NextRequest, NextResponse } from 'next/server';

import { createAdminClient } from '@/lib/supabase/admin';
import { createClient as createServerClient } from '@/lib/supabase/server';
import {
    createEmptyMatchVoteSummary,
    isMatchVoteChoice,
    type MatchVoteChoice,
    type MatchVoteSummary,
} from '@/lib/types/matchVotes';

export const dynamic = 'force-dynamic';

type QueryError = { message?: string | null } | null;
type LooseRow = Record<string, unknown>;

interface LooseQueryBuilder<T = LooseRow> extends PromiseLike<{ data: T[] | null; error: QueryError }> {
    select(columns: string): LooseQueryBuilder<T>;
    eq(column: string, value: string): LooseQueryBuilder<T>;
    in(column: string, values: string[]): LooseQueryBuilder<T>;
    maybeSingle(): PromiseLike<{ data: T | null; error: QueryError }>;
}

interface LooseMutationBuilder<T = LooseRow> extends PromiseLike<{ data: T | null; error: QueryError }> {
    select(columns: string): LooseMutationBuilder<T>;
    single(): PromiseLike<{ data: T | null; error: QueryError }>;
}

interface LooseAdminClient {
    from(table: string): {
        select(columns: string): LooseQueryBuilder<LooseRow>;
        upsert(payload: LooseRow, options?: { onConflict?: string }): LooseMutationBuilder<LooseRow>;
    };
}

type VotePayload = {
    choice?: MatchVoteChoice;
};

function toSafeString(value: unknown) {
    return typeof value === 'string' ? value : '';
}

function toVoteChoice(value: unknown): MatchVoteChoice | null {
    return isMatchVoteChoice(value) ? value : null;
}

function isUuid(value: string) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function buildSummary(matchId: string, rows: LooseRow[], userId?: string | null): MatchVoteSummary {
    const countOf = (choice: MatchVoteChoice) =>
        rows.reduce((sum, row) => sum + (toVoteChoice(row.choice) === choice ? 1 : 0), 0);
    const homeVotes = countOf('home');
    const drawVotes = countOf('draw');
    const awayVotes = countOf('away');
    const totalVotes = homeVotes + drawVotes + awayVotes;
    const userChoice = userId
        ? rows.find((row) => toSafeString(row.user_id) === userId)?.choice ?? null
        : null;

    return {
        matchId,
        totalVotes,
        homeVotes,
        drawVotes,
        awayVotes,
        homePercentage: totalVotes > 0 ? (homeVotes / totalVotes) * 100 : 0,
        drawPercentage: totalVotes > 0 ? (drawVotes / totalVotes) * 100 : 0,
        awayPercentage: totalVotes > 0 ? (awayVotes / totalVotes) * 100 : 0,
        userChoice: toVoteChoice(userChoice),
    };
}

async function fetchVoteSummary(admin: LooseAdminClient, matchId: string, userId?: string | null) {
    const { data, error } = await admin
        .from('match_votes')
        .select('choice, user_id')
        .eq('match_id', matchId);

    if (error) {
        throw new Error(error.message || 'No se pudo obtener la votacion del partido.');
    }

    return buildSummary(matchId, data || [], userId);
}

async function resolveOptionalUserId() {
    const supabase = await createServerClient();
    const {
        data: { user: authUser },
    } = await supabase.auth.getUser();

    return authUser?.id ?? null;
}

async function resolveRequiredUserId() {
    const supabase = await createServerClient();
    const {
        data: { user: authUser },
        error,
    } = await supabase.auth.getUser();

    if (error || !authUser?.id) {
        return null;
    }

    return authUser.id;
}

async function isMatchVotingClosed(admin: LooseAdminClient, matchId: string) {
    // External matches can use provider IDs like `z9h3BNs1`, so we only hit the
    // local `matches` table when the identifier is a real UUID.
    if (!isUuid(matchId)) {
        return false;
    }

    const { data, error } = await admin
        .from('matches')
        .select('status')
        .eq('id', matchId)
        .maybeSingle();

    if (error) {
        throw new Error(error.message || 'No se pudo validar el estado del partido.');
    }

    const status = toSafeString(data?.status);
    return status === 'final' || status === 'cancelled';
}

export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const matchId = (await params).id;
        const admin = createAdminClient() as unknown as LooseAdminClient;
        const userId = await resolveOptionalUserId();
        const summary = await fetchVoteSummary(admin, matchId, userId);

        return NextResponse.json(summary);
    } catch (error) {
        console.error('[matches/vote] get error:', error);
        const matchId = (await params).id;
        return NextResponse.json(
            {
                ...createEmptyMatchVoteSummary(matchId),
                error: error instanceof Error ? error.message : 'No se pudo cargar la votacion en este momento.',
            },
            { status: 500 }
        );
    }
}

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const matchId = (await params).id;
        const userId = await resolveRequiredUserId();

        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const payload = await request.json() as VotePayload;
        const choice = toVoteChoice(payload.choice);

        if (!choice) {
            return NextResponse.json({ error: 'Tenes que elegir un ganador valido.' }, { status: 400 });
        }

        const admin = createAdminClient() as unknown as LooseAdminClient;

        if (await isMatchVotingClosed(admin, matchId)) {
            return NextResponse.json({ error: 'La votacion ya cerro para este partido.' }, { status: 409 });
        }

        const upsertResult = await admin
            .from('match_votes')
            .upsert(
                {
                    match_id: matchId,
                    user_id: userId,
                    choice,
                    updated_at: new Date().toISOString(),
                },
                { onConflict: 'match_id,user_id' }
            )
            .select('choice')
            .single();

        if (upsertResult.error) {
            return NextResponse.json({ error: upsertResult.error.message || 'No se pudo guardar tu voto.' }, { status: 500 });
        }

        const summary = await fetchVoteSummary(admin, matchId, userId);

        return NextResponse.json(summary);
    } catch (error) {
        console.error('[matches/vote] post error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'No se pudo guardar tu voto.' },
            { status: 500 }
        );
    }
}
