import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isRugbySport } from '@/lib/externalProviderPolicy';
import { getRugbyApiSportsLeagues } from '@/lib/services/rugbyApiSports';
import { isBlockedRugbyApiSportsLeagueId } from '@/lib/utils/blockedTournaments';

function normalizeSearchText(value: unknown) {
    return typeof value === 'string' ? value.trim() : '';
}

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const tournamentId = (await params).id;
        const supabase = await createClient();
        const explicitQuery = normalizeSearchText(request.nextUrl.searchParams.get('q'));

        const { data: tournament, error } = await supabase
            .from('tournaments')
            .select('name, display_name, country_id, sport_id, sport, country:countries(name)')
            .eq('id', tournamentId)
            .single();

        if (error || !tournament) {
            return NextResponse.json({ error: 'Tournament not found' }, { status: 404 });
        }

        if (!isRugbySport((tournament as any).sport_id ?? (tournament as any).sport ?? null)) {
            return NextResponse.json({ error: 'This provider is only available for rugby tournaments.' }, { status: 409 });
        }

        const fallbackQuery = normalizeSearchText((tournament as any).display_name || (tournament as any).name);
        const search = explicitQuery || fallbackQuery;
        if (!search) {
            return NextResponse.json({ candidates: [] });
        }

        const countryName = normalizeSearchText((Array.isArray((tournament as any).country)
            ? (tournament as any).country[0]?.name
            : (tournament as any).country?.name) || '');

        const leagues = (await getRugbyApiSportsLeagues({ search }))
            .filter((league) => !isBlockedRugbyApiSportsLeagueId(league.id));
        const filtered = countryName
            ? leagues.filter((league) => {
                const leagueCountry = normalizeSearchText(league.country?.name || '');
                return !leagueCountry || leagueCountry.toLowerCase() === countryName.toLowerCase();
            })
            : leagues;

        const candidates = (filtered.length > 0 ? filtered : leagues).slice(0, 12).map((league) => ({
            id: league.id,
            name: league.name,
            type: league.type || 'League',
            logo: league.logo || '',
            country_id: league.country?.id || null,
            country: league.country?.name || '',
            seasons: (league.seasons || [])
                .slice()
                .sort((left, right) => right.season - left.season)
                .map((season) => ({
                    season: season.season,
                    current: season.current === true,
                    start: season.start || null,
                    end: season.end || null,
                })),
        }));

        return NextResponse.json({
            search,
            country: countryName || null,
            candidates,
        });
    } catch (error: any) {
        return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
    }
}
