import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// GET /api/db/h2h?home=<clubId>&away=<clubId>
// Returns recent matches involving either club (for form columns) and
// direct head-to-head matches, mapped to the FlashScore H2H format used
// by the match detail page.
export async function GET(req: NextRequest) {
    const homeId = req.nextUrl.searchParams.get('home');
    const awayId = req.nextUrl.searchParams.get('away');

    if (!homeId || !awayId) {
        return NextResponse.json({ error: 'home and away params required' }, { status: 400 });
    }

    const supabase = await createClient();

    // Fetch recent matches for either club (covers form + H2H in one query)
    const { data, error } = await supabase
        .from('matches')
        .select(`
            id, date_time, status, score,
            home_club_id, away_club_id,
            home:clubs!matches_home_club_id_fkey(id, name, logo_url),
            away:clubs!matches_away_club_id_fkey(id, name, logo_url)
        `)
        .or(
            `home_club_id.eq.${homeId},away_club_id.eq.${homeId},home_club_id.eq.${awayId},away_club_id.eq.${awayId}`
        )
        .in('status', ['final', 'finished'])
        .order('date_time', { ascending: false })
        .limit(30);

    if (error) {
        console.error('[GET /api/db/h2h] query failed:', error);
        return NextResponse.json({ error: 'Failed to fetch H2H data' }, { status: 500 });
    }

    const matches = (data || []).map((m: any) => ({
        match_id: m.id,
        timestamp: Math.floor(new Date(m.date_time).getTime() / 1000),
        status: 'finished',
        scores: m.score ?? { home: null, away: null },
        home_team: {
            name: m.home?.name ?? '',
            logo: m.home?.logo_url ?? '',
            id: m.home_club_id,
        },
        away_team: {
            name: m.away?.name ?? '',
            logo: m.away?.logo_url ?? '',
            id: m.away_club_id,
        },
    }));

    return NextResponse.json({ ok: true, matches });
}
