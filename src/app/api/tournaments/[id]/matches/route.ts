import { NextRequest } from 'next/server';
import { requireTournamentMutationContext, TournamentApiError } from '@/lib/auth/tournamentApi';
import { FixtureService } from '@/lib/services/fixtureService';
import { recalculatePhaseStandingsScopes } from '@/lib/server/recalculateStandings';
import { createApiPerfTracker } from '@/lib/perf/api';

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const tournamentId = (await params).id;
    const route = `/api/tournaments/${tournamentId}/matches`;
    const perf = createApiPerfTracker(route);

    try {
        await perf.measureStep(
            'authorize_tournament_write',
            () => requireTournamentMutationContext(tournamentId),
            {
                bucket: 'auth',
                logQuery: true,
            },
        );

        const rawBody = await request.json();
        const body = {
            ...rawBody,
            streamUrl: typeof rawBody?.streamUrl === 'string' && rawBody.streamUrl.trim()
                ? rawBody.streamUrl.trim()
                : (typeof rawBody?.watchUrl === 'string' && rawBody.watchUrl.trim() ? rawBody.watchUrl.trim() : null),
            category: typeof rawBody?.category === 'string' && rawBody.category.trim()
                ? rawBody.category.trim()
                : null,
            referee: typeof rawBody?.referee === 'string' && rawBody.referee.trim()
                ? rawBody.referee.trim()
                : null,
        };

        const match = await perf.measureStep(
            'create_match',
            async () => FixtureService.createMatch({
                ...body,
                tournamentId,
            }),
            {
                bucket: 'query',
                logQuery: true,
            },
        );

        if (!match) {
            return perf.json(
                { error: 'Failed to create match' },
                { status: 500 }
            );
        }

        const tournamentIdForStandings = match.tournamentId;
        const phaseIdForStandings = match.phaseId;
        if (tournamentIdForStandings && phaseIdForStandings) {
            recalculatePhaseStandingsScopes(
                tournamentIdForStandings,
                phaseIdForStandings,
                'general',
            ).catch((error) =>
                console.error('[POST match] Auto-recalculate standings failed:', error)
            );
        }

        return perf.json(match, { status: 201 });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Internal server error';
        console.error('Error in POST /api/tournaments/[id]/matches:', error);
        if (error instanceof TournamentApiError) {
            return perf.json({ error: message }, { status: error.status });
        }
        return perf.json(
            { error: message },
            { status: 500 }
        );
    }
}
