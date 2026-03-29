import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
    getTournamentRugbyApiSportsConfig,
    isRugbySport,
    withRugbyApiSportsRuleset,
} from '@/lib/externalProviderPolicy';
import {
    getRugbyApiSportsLeagues,
    getRugbyApiSportsStandingsGroups,
    getRugbyApiSportsStandingsStages,
} from '@/lib/services/rugbyApiSports';

function pickSeason(
    league: Awaited<ReturnType<typeof getRugbyApiSportsLeagues>>[number] | undefined,
    requestedSeason: unknown
) {
    const numericRequestedSeason = Number(requestedSeason);
    if (league?.seasons?.some((season) => season.season === numericRequestedSeason)) {
        return numericRequestedSeason;
    }

    const currentSeason = league?.seasons?.find((season) => season.current);
    if (currentSeason) return currentSeason.season;

    const ordered = (league?.seasons || []).slice().sort((left, right) => right.season - left.season);
    return ordered[0]?.season ?? null;
}

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const tournamentId = (await params).id;
        const body = await request.json();
        const leagueId = Number(body?.league_id);
        const requestedStage = typeof body?.stage === 'string' && body.stage.trim() ? body.stage.trim() : undefined;
        const requestedGroup = typeof body?.group === 'string' && body.group.trim() ? body.group.trim() : undefined;

        if (!Number.isFinite(leagueId)) {
            return NextResponse.json({ error: 'league_id is required' }, { status: 400 });
        }

        const supabase = await createClient();
        const { data: existing, error: readError } = await supabase
            .from('tournaments')
            .select('ruleset, sport_id, sport')
            .eq('id', tournamentId)
            .single();

        if (readError || !existing) {
            return NextResponse.json({ error: 'Tournament not found' }, { status: 404 });
        }

        if (!isRugbySport((existing as any).sport_id ?? (existing as any).sport ?? null)) {
            return NextResponse.json({ error: 'This provider is only available for rugby tournaments.' }, { status: 409 });
        }

        const league = (await getRugbyApiSportsLeagues({ id: leagueId }))[0];
        if (!league) {
            return NextResponse.json({ error: 'League not found in Rugby API-Sports.' }, { status: 404 });
        }

        const season = pickSeason(league, body?.season);
        if (!season) {
            return NextResponse.json({ error: 'No available season was found for that league.' }, { status: 400 });
        }

        const [stages, groups] = await Promise.allSettled([
            getRugbyApiSportsStandingsStages({ league: leagueId, season }),
            getRugbyApiSportsStandingsGroups({ league: leagueId, season }),
        ]);

        const availableStages = stages.status === 'fulfilled' ? stages.value : [];
        const availableGroups = groups.status === 'fulfilled' ? groups.value : [];

        const resolvedConfig = {
            league_id: leagueId,
            season,
            stage: requestedStage || undefined,
            group: requestedGroup || undefined,
            country_id: league.country?.id || undefined,
            league_name: league.name,
            country_name: league.country?.name || undefined,
            league_logo: league.logo || undefined,
            resolved_at: new Date().toISOString(),
            last_sync_at: getTournamentRugbyApiSportsConfig(existing as any)?.last_sync_at,
        };

        const mergedRuleset = withRugbyApiSportsRuleset((existing as any).ruleset, resolvedConfig);

        const { error: updateError } = await supabase
            .from('tournaments')
            .update({ ruleset: mergedRuleset } as any)
            .eq('id', tournamentId);

        if (updateError) {
            return NextResponse.json({ error: updateError.message }, { status: 500 });
        }

        return NextResponse.json({
            config: getTournamentRugbyApiSportsConfig({ ...existing, ruleset: mergedRuleset }),
            league: {
                id: league.id,
                name: league.name,
                logo: league.logo || '',
                country: league.country?.name || '',
            },
            stages: availableStages,
            groups: availableGroups,
        });
    } catch (error: any) {
        return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
    }
}
