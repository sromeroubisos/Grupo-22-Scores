import { NextRequest, NextResponse } from 'next/server';
import { getApiErrorMessage, getApiErrorStatus, requireAdminApiUser } from '@/lib/auth/apiAdmin';
import { createClient } from '@/lib/supabase/server';
import { FixtureService } from '@/lib/services/fixtureService';
import {
    isFlashScoreEnabledForSport,
    RUGBY_FLASHSCORE_DISABLED_MESSAGE,
    withFlashScoreRuleset,
} from '@/lib/externalProviderPolicy';
import type { SyncRequest } from '@/lib/types/flashscore-integration';

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const tournamentId = (await params).id;
        await requireAdminApiUser();
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

        const { data: tournamentMeta } = await supabase
            .from('tournaments')
            .select('sport_id, sport')
            .eq('id', tournamentId)
            .single();

        if (!isFlashScoreEnabledForSport((tournamentMeta as any)?.sport_id ?? (tournamentMeta as any)?.sport ?? null)) {
            return NextResponse.json({ error: RUGBY_FLASHSCORE_DISABLED_MESSAGE }, { status: 409 });
        }

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
            const updatedRuleset = withFlashScoreRuleset(existing.ruleset, {
                last_sync: new Date().toISOString(),
            });
            await supabase
                .from('tournaments')
                .update({ ruleset: updatedRuleset })
                .eq('id', tournamentId);
        }

        return NextResponse.json(result);
    } catch (err: unknown) {
        const message = getApiErrorMessage(err);
        console.error('Error in POST /external/flashscore/sync:', err);
        return NextResponse.json({ error: message }, { status: getApiErrorStatus(err) });
    }
}
