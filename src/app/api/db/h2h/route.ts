import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { canonicalizeSportId } from '@/lib/clubDerivatives';

// GET /api/db/h2h?home=<clubId>&away=<clubId>
// Returns recent matches involving either club (for form columns) and
// direct head-to-head matches, mapped to the FlashScore H2H format used
// by the match detail page.
export async function GET(req: NextRequest) {
    const homeId = req.nextUrl.searchParams.get('home');
    const awayId = req.nextUrl.searchParams.get('away');
    const sportParam = req.nextUrl.searchParams.get('sport');
    const requestedSport = canonicalizeSportId(sportParam);

    if (!homeId || !awayId) {
        return NextResponse.json({ error: 'home and away params required' }, { status: 400 });
    }

    const supabase = await createClient();

    // Fetch recent matches for either club (covers form + H2H in one query)
    const { data, error } = await supabase
        .from('matches')
        .select(`
            id, date_time, status, score, sport_id,
            home_club_id, away_club_id,
            home:clubs!matches_home_club_id_fkey(id, name, logo_url),
            away:clubs!matches_away_club_id_fkey(id, name, logo_url),
            tournament:tournament_id(name, sport_id)
        `)
        .or(
            `home_club_id.eq.${homeId},away_club_id.eq.${homeId},home_club_id.eq.${awayId},away_club_id.eq.${awayId}`
        )
        .in('status', ['final', 'finished'])
        .order('date_time', { ascending: false })
        .limit(requestedSport ? 100 : 30);

    if (error) {
        console.error('[GET /api/db/h2h] query failed:', error);
        return NextResponse.json({ error: 'Failed to fetch H2H data' }, { status: 500 });
    }

    const filteredRows = (data || [])
        .filter((match: any) => {
            if (!requestedSport) return true;

            const matchSport = canonicalizeSportId(
                match?.sport_id ??
                match?.tournament?.sport_id ??
                null,
            );

            return !matchSport || matchSport === requestedSport;
        })
        .slice(0, 30);

    const matches = filteredRows.map((m: any) => {
        const homeLogo = m.home?.logo_url ?? '';
        const awayLogo = m.away?.logo_url ?? '';

        return ({
        match_id: m.id,
        timestamp: Math.floor(new Date(m.date_time).getTime() / 1000),
        status: 'finished',
        scores: m.score ?? { home: null, away: null },
        tournament_name: m.tournament?.name ?? '',
        home_team: {
            name: m.home?.name ?? '',
            logo: homeLogo,
            image_path: homeLogo,
            small_image_path: homeLogo,
            id: m.home_club_id,
            team_id: m.home_club_id,
        },
        away_team: {
            name: m.away?.name ?? '',
            logo: awayLogo,
            image_path: awayLogo,
            small_image_path: awayLogo,
            id: m.away_club_id,
            team_id: m.away_club_id,
        },
        });
    });

    return NextResponse.json({ ok: true, matches });
}
