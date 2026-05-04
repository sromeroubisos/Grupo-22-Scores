import { NextRequest, NextResponse } from 'next/server';
import { requireTournamentMutationContext, tournamentApiErrorResponse } from '@/lib/auth/tournamentApi';
import { FixtureService } from '@/lib/services/fixtureService';
import { isRugbySport, withRugbyApiSportsRuleset } from '@/lib/externalProviderPolicy';
import type { SyncRequest } from '@/lib/types/flashscore-integration';

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const tournamentId = (await params).id;
        const { writer: supabase } = await requireTournamentMutationContext(tournamentId);

        const body: SyncRequest = await request.json();
        const { phase_id, round_id, matches } = body;

        if (!phase_id || !Array.isArray(matches) || matches.length === 0) {
            return NextResponse.json({ error: 'phase_id and matches[] are required' }, { status: 400 });
        }

        const unresolved = matches.filter((match) => !match.home_club_id || !match.away_club_id);
        if (unresolved.length > 0) {
            return NextResponse.json({
                error: `${unresolved.length} match(es) have unresolved teams.`,
                unresolved_count: unresolved.length,
            }, { status: 400 });
        }

        const { data: tournamentMeta } = await supabase
            .from('tournaments')
            .select('sport_id, sport, ruleset')
            .eq('id', tournamentId)
            .single();

        if (!isRugbySport((tournamentMeta as any)?.sport_id ?? (tournamentMeta as any)?.sport ?? null)) {
            return NextResponse.json({ error: 'This provider is only available for rugby tournaments.' }, { status: 409 });
        }

        const { data: phase, error: phaseError } = await supabase
            .from('tournament_phases')
            .select('id')
            .eq('id', phase_id)
            .eq('tournament_id', tournamentId)
            .single();

        if (phaseError || !phase) {
            return NextResponse.json({ error: 'The selected phase does not belong to this tournament.' }, { status: 400 });
        }

        const matchesData = matches.map((match) => ({
            roundId: round_id ?? null,
            homeClubId: match.home_club_id,
            awayClubId: match.away_club_id,
            dateTime: match.date_time,
            venue: match.venue ?? null,
            status: match.status ?? 'scheduled',
        }));

        const result = await FixtureService.importMatches(tournamentId, phase_id, matchesData);

        if ((tournamentMeta as any)?.ruleset) {
            const updatedRuleset = withRugbyApiSportsRuleset((tournamentMeta as any).ruleset, {
                last_sync_at: new Date().toISOString(),
            });

            await supabase
                .from('tournaments')
                .update({ ruleset: updatedRuleset } as any)
                .eq('id', tournamentId);
        }

        return NextResponse.json(result);
    } catch (error: unknown) {
        return tournamentApiErrorResponse(error);
    }
}
