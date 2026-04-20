import { NextRequest } from 'next/server';
import { canManageTournamentContext, getTournamentManagementTarget, requireUserAccessContext } from '@/lib/auth/permissions';
import { EDIT_MEMBERSHIP_ROLES, hasFederationAdminAccess } from '@/lib/auth/roles';
import { FixtureService } from '@/lib/services/fixtureService';
import { recalculatePhaseStandingsScopes } from '@/lib/server/recalculateStandings';
import { createClient } from '@/lib/supabase/server';
import { createApiPerfTracker } from '@/lib/perf/api';

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const tournamentId = (await params).id;
    const route = `/api/tournaments/${tournamentId}/matches`;
    const perf = createApiPerfTracker(route);

    try {
        const supabase = await perf.measureStep('create_client', () => createClient(), {
            bucket: 'client',
        });
        const context = await perf.measureStep(
            'load_access_context',
            async () => requireUserAccessContext(supabase).catch(() => null),
            {
                bucket: 'auth',
                logQuery: true,
            },
        );

        if (!context) {
            return perf.json(
                { error: 'Unauthorized' },
                { status: 401 }
            );
        }

        if (!hasFederationAdminAccess(context.rawRole, context.memberships)) {
            const target = await perf.measureStep(
                'load_management_target',
                async () => getTournamentManagementTarget(supabase, tournamentId),
                {
                    bucket: 'auth',
                    logQuery: true,
                },
            );

            if (!target || !canManageTournamentContext(context, target, EDIT_MEMBERSHIP_ROLES)) {
                return perf.json(
                    { error: 'Forbidden' },
                    { status: 403 }
                );
            }
        }

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
        return perf.json(
            { error: message },
            { status: 500 }
        );
    }
}
