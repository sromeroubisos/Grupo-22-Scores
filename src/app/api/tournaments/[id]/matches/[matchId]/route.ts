import { NextRequest, NextResponse } from 'next/server';
import { requireTournamentMutationContext, tournamentApiErrorResponse } from '@/lib/auth/tournamentApi';
import { FixtureService } from '@/lib/services/fixtureService';
import { recalcAffectedPhases } from '@/lib/server/recalcAffectedPhasesTraced';
import { traceEditRoute, markEditTrace } from '@/lib/perf/editTrace';
import { assignVenueSlot } from '@/lib/server/venueSlots';
import { APP_TIMEZONE, ensureUtcDateTimeString } from '@/lib/timezone';

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

                // Mover la hora o la cancha en una sede compartida: sin cancha va
                // a la primera libre, y no se puede caer encima de otro partido.
                if (body && (body.dateTime !== undefined || body.venue !== undefined)) {
                    const { data: current } = await supabase.from('matches').select('date_time, venue').eq('id', matchId).maybeSingle();
                    const slot = await assignVenueSlot(supabase, {
                        tournamentId,
                        matchId,
                        dateTime: body.dateTime !== undefined
                            ? (body.dateTime ? ensureUtcDateTimeString(body.dateTime, APP_TIMEZONE) : null)
                            : (current?.date_time ?? null),
                        venue: body.venue !== undefined ? body.venue : (current?.venue ?? null),
                    });
                    if (!slot.ok) return NextResponse.json({ error: slot.error }, { status: 409 });
                    if (slot.venue && slot.venue !== (current?.venue ?? null)) body.venue = slot.venue;
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
