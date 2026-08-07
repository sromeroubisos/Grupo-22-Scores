import { NextRequest, NextResponse } from 'next/server';
import { requireTournamentMutationContext, tournamentApiErrorResponse } from '@/lib/auth/tournamentApi';
import { FixtureService, type MatchUpdateSideEffects } from '@/lib/services/fixtureService';
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
                // El `prev` sólo se usa para dos cosas: verificar que el partido
                // es de este torneo y darle a `recalcAffectedPhases` el scope
                // anterior. `getMatch` para eso era un `select('*')` + 3 joins
                // que arrastraba los JSONB `events`/`lineups` y el escudo del
                // torneo: 290 KB y ~1,2 s medidos contra los 0,3 KB y ~0,28 s
                // del scope. Es el patrón #1c del PERF_BACKLOG, que ya estaba
                // aplicado en la ruta de super-admin y faltaba en ésta.
                const previousMatch = await FixtureService.getMatchScope(matchId);

                if (!previousMatch || previousMatch.tournamentId !== tournamentId) {
                    return NextResponse.json({ error: 'Match not found in this tournament' }, { status: 404 });
                }

                // Si la edición arrastró a otros partidos (avance de playoff,
                // reseed del cuadro), el gestor tiene que recargar: aplicar en
                // memoria sólo el partido guardado dejaría el cruce siguiente
                // mostrando el equipo viejo.
                const sideEffects: MatchUpdateSideEffects = { derivedChanged: false };
                const match = await FixtureService.updateMatch(matchId, body, supabase, sideEffects);

                if (!match) {
                    return NextResponse.json(
                        { error: 'Failed to update match' },
                        { status: 500 }
                    );
                }

                // Con el `status` de los dos extremos, el gate por estado final
                // de `recalcAffectedPhases` puede hacer su trabajo: editar un
                // partido que no está —ni estaba— finalizado no mueve la tabla,
                // así que no hay nada que recalcular. Sin el status, el gate es
                // fail-safe y recalculaba siempre.
                recalcAffectedPhases([
                    previousMatch?.tournamentId && previousMatch?.phaseId
                        ? {
                            tournamentId: previousMatch.tournamentId,
                            phaseId: previousMatch.phaseId,
                            status: previousMatch.status,
                        }
                        : null,
                    match.tournamentId && match.phaseId
                        ? { tournamentId: match.tournamentId, phaseId: match.phaseId, status: match.status }
                        : null,
                ]);

                const response = NextResponse.json(match);
                if (sideEffects.derivedChanged) {
                    response.headers.set('x-fixture-derived-changed', '1');
                }
                return response;
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
        // Mismo criterio que el PATCH: acá sólo hace falta el scope.
        const previousMatch = await FixtureService.getMatchScope(matchId);

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
                {
                    tournamentId: previousMatch.tournamentId,
                    phaseId: previousMatch.phaseId,
                    status: previousMatch.status,
                },
            ]);
        }

        return NextResponse.json({ success: true });
    } catch (error: unknown) {
        console.error('Error in DELETE /api/tournaments/[id]/matches/[matchId]:', error);
        return tournamentApiErrorResponse(error);
    }
}
