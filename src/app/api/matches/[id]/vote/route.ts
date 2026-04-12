import { NextRequest, NextResponse } from 'next/server';
import { createEmptyMatchVoteSummary } from '@/lib/types/matchVotes';

export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const matchId = (await params).id;

    return NextResponse.json({
        ...createEmptyMatchVoteSummary(matchId),
        userChoice: null,
    });
}

export async function POST(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const matchId = (await params).id;

    return NextResponse.json(
        {
            ...createEmptyMatchVoteSummary(matchId),
            userChoice: null,
            error: 'La votacion fue desactivada.',
        },
        { status: 410 }
    );
}
