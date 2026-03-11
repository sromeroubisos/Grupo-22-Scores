import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { FixtureService } from '@/lib/services/fixtureService';
import type { SyncRequest } from '@/lib/types/flashscore-integration';

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const tournamentId = (await params).id;
        const body: SyncRequest = await request.json();
        const { phase_id, round_id, matches } = body;

        if (!phase_id || !Array.isArray(matches) || matches.length === 0) {
            return NextResponse.json(
                { error: 'phase_id y matches[] son requeridos' },
                { status: 400 }
            );
        }

        // Validate all club IDs are resolved
        const unresolved = matches.filter(m => !m.home_club_id || !m.away_club_id);
        if (unresolved.length > 0) {
            return NextResponse.json(
                {
                    error: `${unresolved.length} partido(s) tienen equipos sin resolver. Asigná manualmente antes de importar.`,
                    unresolved_count: unresolved.length,
                },
                { status: 400 }
            );
        }

        const supabase = await createClient();

        // Validate phase belongs to this tournament
        const { data: phase, error: phaseError } = await supabase
            .from('tournament_phases')
            .select('id')
            .eq('id', phase_id)
            .eq('tournament_id', tournamentId)
            .single();

        if (phaseError || !phase) {
            return NextResponse.json(
                { error: 'La fase especificada no existe o no pertenece a este torneo.' },
                { status: 400 }
            );
        }

        // Transform to FixtureService.importMatches format
        const matchesData = matches.map(m => ({
            roundId: round_id ?? null,
            homeClubId: m.home_club_id,
            awayClubId: m.away_club_id,
            dateTime: m.date_time,
            venue: m.venue ?? null,
            status: m.status ?? 'scheduled',
        }));

        const result = await FixtureService.importMatches(tournamentId, phase_id, matchesData);

        // Update last_sync timestamp
        const { data: existing } = await supabase
            .from('tournaments')
            .select('ruleset')
            .eq('id', tournamentId)
            .single();

        if (existing) {
            const currentRuleset = (existing as any).ruleset ?? {};
            const updatedRuleset = {
                ...currentRuleset,
                flashscore: {
                    ...(currentRuleset.flashscore ?? {}),
                    last_sync: new Date().toISOString(),
                },
            };
            await supabase
                .from('tournaments')
                .update({ ruleset: updatedRuleset } as any)
                .eq('id', tournamentId);
        }

        return NextResponse.json(result);
    } catch (err: any) {
        console.error('Error in POST /external/flashscore/sync:', err);
        return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
    }
}
