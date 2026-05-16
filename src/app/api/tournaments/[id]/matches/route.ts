import { NextRequest, NextResponse } from 'next/server';
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

/**
 * Bulk delete matches in a single request.
 *
 * Previously the client fired one DELETE fetch per match via Promise.all.
 * With dozens of matches that produced a thundering herd against the dev
 * server (browser caps ~6 connections/host, every request re-runs auth and
 * triggered a standings recalc), surfacing as `TypeError: Failed to fetch`.
 * This collapses it into one request: authorize once, delete with bounded
 * concurrency, and recalculate standings once per affected phase.
 */
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const tournamentId = (await params).id;

    try {
        await requireTournamentMutationContext(tournamentId);

        const body = await request.json().catch(() => null);
        const rawIds: unknown[] = Array.isArray(body?.matchIds) ? body.matchIds : [];
        const ids: string[] = Array.from(
            new Set(
                rawIds.filter((value): value is string =>
                    typeof value === 'string' && value.length > 0,
                ),
            ),
        );

        if (ids.length === 0) {
            return NextResponse.json(
                { error: 'No match ids provided' },
                { status: 400 },
            );
        }

        const deleted: string[] = [];
        const failures: { id: string; error: string }[] = [];
        const affectedPhaseIds = new Set<string>();

        const CONCURRENCY = 6;
        let cursor = 0;
        const worker = async () => {
            while (cursor < ids.length) {
                const matchId = ids[cursor++];
                try {
                    const match = await FixtureService.getMatch(matchId);
                    if (!match || match.tournamentId !== tournamentId) {
                        failures.push({ id: matchId, error: 'Match not found in this tournament' });
                        continue;
                    }

                    const ok = await FixtureService.deleteMatch(matchId);
                    if (ok) {
                        deleted.push(matchId);
                        if (match.phaseId) affectedPhaseIds.add(match.phaseId);
                    } else {
                        failures.push({ id: matchId, error: 'Failed to delete match' });
                    }
                } catch (err) {
                    failures.push({
                        id: matchId,
                        error: err instanceof Error ? err.message : 'Delete failed',
                    });
                }
            }
        };

        await Promise.all(
            Array.from({ length: Math.min(CONCURRENCY, ids.length) }, () => worker()),
        );

        if (affectedPhaseIds.size > 0) {
            await Promise.all(
                [...affectedPhaseIds].map((phaseId) =>
                    recalculatePhaseStandingsScopes(tournamentId, phaseId, 'general').catch(
                        (err) =>
                            console.error(
                                '[DELETE /api/tournaments/[id]/matches] Auto-recalculate standings failed:',
                                err,
                            ),
                    ),
                ),
            );
        }

        return NextResponse.json({
            success: failures.length === 0,
            deleted: deleted.length,
            failures,
        });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Internal server error';
        console.error('Error in DELETE /api/tournaments/[id]/matches:', error);
        if (error instanceof TournamentApiError) {
            return NextResponse.json({ error: message }, { status: error.status });
        }
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
