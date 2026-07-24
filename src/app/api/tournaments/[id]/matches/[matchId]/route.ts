import { NextRequest, NextResponse } from 'next/server';
import { requireTournamentMutationContext, tournamentApiErrorResponse } from '@/lib/auth/tournamentApi';
import { FixtureService } from '@/lib/services/fixtureService';
import { recalcAffectedPhases } from '@/lib/server/recalcAffectedPhasesTraced';
import { traceEditRoute, markEditTrace } from '@/lib/perf/editTrace';

export const maxDuration = 30;

export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string, matchId: string }> }
) {
    return traceEditRoute(
        request,
        { routeName: 'PATCH /api/tournaments/[id]/matches/[matchId]', routeType: 'tournament_admin_match', actorType: 'tournament_admin' },
        async () => {
            try {
                const { id: tournamentId, matchId } = await params;
                markEditTrace({ matchId, tournamentId, responseBeforeDerived: true });
                const { writer: supabase } = await requireTournamentMutationContext(tournamentId);
                const body = await request.json();
                const previousMatch = await FixtureService.getMatch(matchId);

                if (!previousMatch || previousMatch.tournamentId !== tournamentId) {
                    return NextResponse.json({ error: 'Match not found in this tournament' }, { status: 404 });
                }

                const match = await FixtureService.updateMatch(matchId, body, supabase);

                if (!match) {
                    return NextResponse.json(
                        { error: 'Failed to update match' },
                        { status: 500 }
                    );
                }

                recalcAffectedPhases([
                    previousMatch?.tournamentId && previousMatch?.phaseId
                        ? { tournamentId: previousMatch.tournamentId, phaseId: previousMatch.phaseId }
                        : null,
                    match.tournamentId && match.phaseId
                        ? { tournamentId: match.tournamentId, phaseId: match.phaseId }
                        : null,
                ]);

                return NextResponse.json(match);
            } catch (error: unknown) {
                console.error('Error in PATCH /api/tournaments/[id]/matches/[matchId]:', error);
                return tournamentApiErrorResponse(error);
            }
        },
    );
}

export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string, matchId: string }> }
) {
    try {
        const { id: tournamentId, matchId } = await params;
        await requireTournamentMutationContext(tournamentId);
        const previousMatch = await FixtureService.getMatch(matchId);

        if (!previousMatch || previousMatch.tournamentId !== tournamentId) {
            return NextResponse.json({ error: 'Match not found in this tournament' }, { status: 404 });
        }

        const success = await FixtureService.deleteMatch(matchId);

        if (!success) {
            return NextResponse.json(
                { error: 'Failed to delete match' },
                { status: 500 }
            );
        }

        if (success && previousMatch?.tournamentId && previousMatch?.phaseId) {
            recalcAffectedPhases([
                { tournamentId: previousMatch.tournamentId, phaseId: previousMatch.phaseId },
            ]);
        }

        return NextResponse.json({ success: true });
    } catch (error: unknown) {
        console.error('Error in DELETE /api/tournaments/[id]/matches/[matchId]:', error);
        return tournamentApiErrorResponse(error);
    }
}
