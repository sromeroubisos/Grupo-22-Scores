import { NextRequest, NextResponse } from 'next/server';

import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import {
    createEmptyMatchVoteSummary,
    type MatchVoteChoice,
    type MatchVoteSummary,
} from '@/lib/types/matchVotes';

type VotePayload = {
    choice?: unknown;
};

type FavoriteVoteRow = {
    entity_id: string;
};

function normalizeChoice(value: unknown): MatchVoteChoice | null {
    if (value === 'home' || value === 'away') {
        return value;
    }

    return null;
}

function buildVoteEntityId(matchId: string, choice: MatchVoteChoice) {
    return `vote:match:${matchId}:${choice}`;
}

function buildVoteEntityIds(matchId: string) {
    return {
        home: buildVoteEntityId(matchId, 'home'),
        away: buildVoteEntityId(matchId, 'away'),
    };
}

async function getCurrentUserContext() {
    const supabase = await createClient();
    const { data: { session }, error } = await supabase.auth.getSession();

    if (error) {
        console.warn('[api/matches/[id]/vote] session lookup error:', error.message);
    }

    return {
        supabase,
        userId: session?.user?.id ?? null,
    };
}

async function readVoteSummary(matchId: string): Promise<MatchVoteSummary> {
    const voteIds = buildVoteEntityIds(matchId);
    const supabase = createAdminClient();
    const { data, error } = await supabase
        .from('favorites')
        .select('entity_id')
        .eq('entity_type', 'match')
        .in('entity_id', [voteIds.home, voteIds.away]);

    if (error) {
        throw error;
    }

    const summary = createEmptyMatchVoteSummary(matchId);
    const rows = (data ?? []) as FavoriteVoteRow[];
    const homeVotes = rows.filter((row) => row.entity_id === voteIds.home).length;
    const awayVotes = rows.filter((row) => row.entity_id === voteIds.away).length;
    const totalVotes = homeVotes + awayVotes;

    return {
        ...summary,
        matchId,
        totalVotes,
        homeVotes,
        awayVotes,
        homePercentage: totalVotes > 0 ? Number(((homeVotes / totalVotes) * 100).toFixed(1)) : 0,
        awayPercentage: totalVotes > 0 ? Number(((awayVotes / totalVotes) * 100).toFixed(1)) : 0,
    };
}

async function readUserChoice(supabase: Awaited<ReturnType<typeof createClient>>, matchId: string, userId: string | null) {
    if (!userId) {
        return null;
    }

    const voteIds = buildVoteEntityIds(matchId);
    const { data, error } = await supabase
        .from('favorites')
        .select('entity_id')
        .eq('user_id', userId)
        .eq('entity_type', 'match')
        .in('entity_id', [voteIds.home, voteIds.away]);

    if (error) {
        throw error;
    }

    const rows = (data ?? []) as FavoriteVoteRow[];

    if (rows.some((row) => row.entity_id === voteIds.home)) {
        return 'home';
    }

    if (rows.some((row) => row.entity_id === voteIds.away)) {
        return 'away';
    }

    return null;
}

export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const matchId = (await params).id;
        const { supabase, userId } = await getCurrentUserContext();
        const [summary, userChoice] = await Promise.all([
            readVoteSummary(matchId),
            readUserChoice(supabase, matchId, userId),
        ]);

        return NextResponse.json({
            ...summary,
            userChoice,
        });
    } catch (error) {
        console.error('[api/matches/[id]/vote] GET error:', error);
        return NextResponse.json(
            { error: 'No se pudo cargar la votacion del partido.' },
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
        const payload = await request.json() as VotePayload;
        const choice = normalizeChoice(payload.choice);

        if (!choice) {
            return NextResponse.json(
                { error: 'La opcion de voto no es valida.' },
                { status: 400 }
            );
        }

        const { supabase, userId } = await getCurrentUserContext();
        const voteIds = buildVoteEntityIds(matchId);

        if (!userId) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            );
        }

        const existingVoteIds = [voteIds.home, voteIds.away];
        const { error: deleteError } = await supabase
            .from('favorites')
            .delete()
            .eq('user_id', userId)
            .eq('entity_type', 'match')
            .in('entity_id', existingVoteIds);

        if (deleteError) {
            throw deleteError;
        }

        const { error: insertError } = await supabase
            .from('favorites')
            .insert({
                user_id: userId,
                entity_type: 'match',
                entity_id: choice === 'home' ? voteIds.home : voteIds.away,
            });

        if (insertError) {
            throw insertError;
        }

        const summary = await readVoteSummary(matchId);

        return NextResponse.json({
            ...summary,
            userChoice: choice,
        });
    } catch (error) {
        console.error('[api/matches/[id]/vote] POST error:', error);
        return NextResponse.json(
            { error: 'No se pudo guardar tu voto.' },
            { status: 500 }
        );
    }
}
