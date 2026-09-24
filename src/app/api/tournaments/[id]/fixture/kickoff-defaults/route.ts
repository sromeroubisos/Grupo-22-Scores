import { NextRequest, NextResponse } from 'next/server';
import { requireTournamentMutationContext, tournamentApiErrorResponse } from '@/lib/auth/tournamentApi';
import { sanitizeKickoffDefaults, withKickoffDefaults } from '@/lib/services/fixtureKickoffDefaults';

export const dynamic = 'force-dynamic';

/**
 * Guarda los horarios habituales que usa el importador de fixtures.
 *
 * Lee el ruleset, cambia SÓLO `fixtureImport.kickoffDefaults` y lo vuelve a
 * escribir: el resto del ruleset (puntos, desempates, fases, integraciones) no
 * se toca. Los clubes que no participan del torneo se descartan.
 */
export async function PUT(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const tournamentId = (await params).id;
        const { writer: supabase } = await requireTournamentMutationContext(tournamentId);
        const body = await request.json().catch(() => null);

        if (!body || typeof body !== 'object' || !body.kickoffDefaults) {
            return NextResponse.json({ error: 'kickoffDefaults es obligatorio.' }, { status: 400 });
        }

        const [tournamentRes, participantsRes] = await Promise.all([
            supabase.from('tournaments').select('ruleset').eq('id', tournamentId).single(),
            supabase
                .from('tournament_participants')
                .select('club_id')
                .eq('tournament_id', tournamentId)
                .eq('status', 'active'),
        ]);

        if (tournamentRes.error || !tournamentRes.data) {
            return NextResponse.json({ error: 'No se encontró el torneo.' }, { status: 404 });
        }
        if (participantsRes.error) {
            return NextResponse.json({ error: participantsRes.error.message }, { status: 500 });
        }

        const clubIds = new Set<string>(
            (participantsRes.data ?? [])
                .map((row: { club_id: string | null }) => row.club_id)
                .filter((id: string | null): id is string => Boolean(id)),
        );
        const kickoffDefaults = sanitizeKickoffDefaults(body.kickoffDefaults, clubIds);
        const ruleset = withKickoffDefaults((tournamentRes.data as { ruleset: unknown }).ruleset, kickoffDefaults);

        const { error: updateError } = await supabase
            .from('tournaments')
            .update({ ruleset } as never)
            .eq('id', tournamentId);

        if (updateError) {
            return NextResponse.json({ error: updateError.message }, { status: 500 });
        }

        return NextResponse.json({ kickoffDefaults });
    } catch (error: unknown) {
        console.error('Error in PUT /api/tournaments/[id]/fixture/kickoff-defaults:', error);
        return tournamentApiErrorResponse(error);
    }
}
