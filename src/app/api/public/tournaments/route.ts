import { NextRequest, NextResponse } from 'next/server';
import { getReadClient } from '@/lib/supabase/read';

const RUGBY_SPORT_IDS = ['rugby', 'rugby-union', 'rugby-league'];

function resolveSportFilter(rawSport: string | null) {
    if (!rawSport || rawSport === 'rugby') {
        return RUGBY_SPORT_IDS;
    }

    return [rawSport];
}

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const sport = searchParams.get('sport');
        const search = searchParams.get('search')?.trim().toLowerCase() || '';

        const supabase = await getReadClient();
        const sportFilter = resolveSportFilter(sport);

        const { data, error } = await supabase
            .from('tournaments')
            .select('id, name, display_name, country_id, sport_id, legacy_sport:sport, logo_url, slug, is_visible, status')
            .neq('is_visible', false)
            .order('display_name', { ascending: true })
            .order('name', { ascending: true });

        if (error) {
            console.error('[GET /api/public/tournaments] query failed:', error);
            return NextResponse.json(
                { error: 'No se pudieron cargar los torneos.' },
                { status: 500 }
            );
        }

        const tournaments = (data || [])
            .filter((tournament) => {
                const status = tournament.status?.toLowerCase?.() || null;
                if (status === 'archived' || status === 'deleted') return false;
                const normalizedSport = tournament.sport_id || tournament.legacy_sport || 'rugby';
                if (!sportFilter.includes(normalizedSport)) return false;
                if (!search) return true;

                const name = tournament.name?.toLowerCase?.() || '';
                const displayName = tournament.display_name?.toLowerCase?.() || '';
                return name.includes(search) || displayName.includes(search);
            })
            .map((tournament) => ({
                id: tournament.id,
                name: tournament.name,
                display_name: tournament.display_name,
                country_id: tournament.country_id,
                sport_id: tournament.sport_id || tournament.legacy_sport || 'rugby',
                logo_url: tournament.logo_url,
                slug: tournament.slug,
            }));

        return NextResponse.json({ data: tournaments });
    } catch (error) {
        console.error('[GET /api/public/tournaments] unexpected error:', error);
        return NextResponse.json(
            { error: 'No se pudieron cargar los torneos.' },
            { status: 500 }
        );
    }
}
