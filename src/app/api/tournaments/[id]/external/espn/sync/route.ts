import { NextRequest, NextResponse } from 'next/server';
import { getApiErrorMessage, getApiErrorStatus, requireAdminApiUser } from '@/lib/auth/apiAdmin';
import { createClient } from '@/lib/supabase/server';
import { FixtureService } from '@/lib/services/fixtureService';
import {
    getTournamentEspnAmericanFootballConfig,
    getTournamentEspnMotorsportConfig,
    isAmericanFootballSport,
    isMotorsportSport,
    withEspnAmericanFootballRuleset,
    withEspnMotorsportRuleset,
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
            return NextResponse.json({ error: 'phase_id and matches[] are required' }, { status: 400 });
        }

        const unresolved = matches.filter((match) => !match.home_club_id || !match.away_club_id);
        if (unresolved.length > 0) {
            return NextResponse.json({
                error: `${unresolved.length} match(es) have unresolved teams.`,
                unresolved_count: unresolved.length,
            }, { status: 400 });
        }

        const supabase = await createClient();
        const { data: tournamentMeta } = await supabase
            .from('tournaments')
            .select('sport_id, sport, ruleset')
            .eq('id', tournamentId)
            .single();

        const sportKey = (tournamentMeta as any)?.sport_id ?? (tournamentMeta as any)?.sport ?? null;
        const isAmericanFootball = isAmericanFootballSport(sportKey);
        const isMotorsport = isMotorsportSport(sportKey);

        if (!isAmericanFootball && !isMotorsport) {
            return NextResponse.json({ error: 'This provider is only available for american football and motorsport tournaments.' }, { status: 409 });
        }

        if (isMotorsport) {
            return NextResponse.json({ error: 'ESPN sync import is not available for motorsport tournaments yet.' }, { status: 409 });
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
            const previousConfig = isAmericanFootball
                ? getTournamentEspnAmericanFootballConfig(tournamentMeta as any)
                : getTournamentEspnMotorsportConfig(tournamentMeta as any);
            const updatedRuleset = isAmericanFootball
                ? withEspnAmericanFootballRuleset((tournamentMeta as any).ruleset, {
                    ...previousConfig,
                    last_sync_at: new Date().toISOString(),
                })
                : withEspnMotorsportRuleset((tournamentMeta as any).ruleset, {
                ...previousConfig,
                last_sync_at: new Date().toISOString(),
            });

            await supabase
                .from('tournaments')
                .update({ ruleset: updatedRuleset } as any)
                .eq('id', tournamentId);
        }

        return NextResponse.json(result);
    } catch (error: unknown) {
        return NextResponse.json(
            { error: getApiErrorMessage(error) },
            { status: getApiErrorStatus(error) }
        );
    }
}
