import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApiUser } from '@/lib/auth/apiAdmin';
import { FixtureService } from '@/lib/services/fixtureService';
import { recalculatePhaseStandingsScopes } from '@/lib/server/recalculateStandings';

export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string, matchId: string }> }
) {
    try {
        await requireAdminApiUser();
        const { matchId } = await params;
        const body = await request.json();
        const previousMatch = await FixtureService.getMatch(matchId);

        const match = await FixtureService.updateMatch(matchId, body);

        if (!match) {
            return NextResponse.json(
                { error: 'Failed to update match' },
                { status: 500 }
            );
        }

        const affectedScopes = new Map<string, { tournamentId: string; phaseId: string }>();
        const previousScope = previousMatch?.tournamentId && previousMatch?.phaseId
            ? { tournamentId: previousMatch.tournamentId, phaseId: previousMatch.phaseId }
            : null;
        const nextScope = match.tournamentId && match.phaseId
            ? { tournamentId: match.tournamentId, phaseId: match.phaseId }
            : null;

        [previousScope, nextScope].forEach((scope) => {
            if (!scope) return;
            affectedScopes.set(`${scope.tournamentId}:${scope.phaseId}`, scope);
        });

        if (affectedScopes.size > 0) {
            Promise.all(
                [...affectedScopes.values()].map((scope) =>
                    recalculatePhaseStandingsScopes(scope.tournamentId, scope.phaseId, 'general'),
                ),
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
        const previousMatch = await FixtureService.getMatch(matchId);
        const success = await FixtureService.deleteMatch(matchId);

        if (!success) {
            return NextResponse.json(
                { error: 'Failed to delete match' },
                { status: 500 }
            );
        }

        if (success && previousMatch?.tournamentId && previousMatch?.phaseId) {
            recalculatePhaseStandingsScopes(
                previousMatch.tournamentId,
                previousMatch.phaseId,
                'general',
            ).catch((err) =>
                console.error('[DELETE match] Auto-recalculate standings failed:', err)
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
