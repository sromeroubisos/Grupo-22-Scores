import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApiUser } from '@/lib/auth/apiAdmin';
import { FixtureService } from '@/lib/services/fixtureService';
import { recalculateAndPersistStandings } from '@/lib/server/recalculateStandings';

export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string, matchId: string }> }
) {
    try {
        await requireAdminApiUser();
        const { matchId } = await params;
        const body = await request.json();

        const match = await FixtureService.updateMatch(matchId, body);

        if (!match) {
            return NextResponse.json(
                { error: 'Failed to update match' },
                { status: 500 }
            );
        }

        // Auto-recalculate standings when a match result is finalized or score changes on a final match
        const affectsStandings = match.status === 'final' && match.tournamentId && match.phaseId;
        if (affectsStandings) {
            recalculateAndPersistStandings(
                match.tournamentId,
                match.phaseId,
                match.groupId ?? null,
            ).catch((err) =>
                console.error('[PATCH match] Auto-recalculate standings failed:', err)
            );
        }

        return NextResponse.json(match);
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Internal server error';
        console.error('Error in PATCH /api/tournaments/[id]/matches/[matchId]:', error);
        return NextResponse.json(
            { error: message },
            { status: 500 }
        );
    }
}

export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string, matchId: string }> }
) {
    try {
        await requireAdminApiUser();
        const { matchId } = await params;
        const success = await FixtureService.deleteMatch(matchId);

        if (!success) {
            return NextResponse.json(
                { error: 'Failed to delete match' },
                { status: 500 }
            );
        }

        return NextResponse.json({ success: true });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Internal server error';
        console.error('Error in DELETE /api/tournaments/[id]/matches/[matchId]:', error);
        return NextResponse.json(
            { error: message },
            { status: 500 }
        );
    }
}
