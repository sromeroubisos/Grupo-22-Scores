import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApiUser } from '@/lib/auth/apiAdmin';
import { FixtureService } from '@/lib/services/fixtureService';

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const tournamentId = (await params).id;
        await requireAdminApiUser();
        const body = await request.json();

        // Ensure tournamentId is in the data
        const matchData = {
            ...body,
            tournamentId
        };

        const match = await FixtureService.createMatch(matchData);

        if (!match) {
            return NextResponse.json(
                { error: 'Failed to create match' },
                { status: 500 }
            );
        }

        return NextResponse.json(match, { status: 201 });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Internal server error';
        console.error('Error in POST /api/tournaments/[id]/matches:', error);
        return NextResponse.json(
            { error: message },
            { status: 500 }
        );
    }
}
