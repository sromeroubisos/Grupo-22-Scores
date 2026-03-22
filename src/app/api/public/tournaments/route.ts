import { NextRequest, NextResponse } from 'next/server';
import { getReadClient } from '@/lib/supabase/read';
import { isMissingColumnError } from '@/lib/utils/supabaseSchema';
import { sortTournamentsByPriority } from '@/lib/utils/tournamentOrdering';

const RUGBY_SPORT_IDS = ['rugby', 'rugby-union', 'rugby-league'];
const SELECT_WITH_LEGACY_SPORT = 'id, name, display_name, country, country_id, country_ref:countries(name), sport_id, legacy_sport:sport, logo_url, slug, is_visible, status, priority';
const SELECT_WITHOUT_LEGACY_SPORT = 'id, name, display_name, country, country_id, country_ref:countries(name), sport_id, logo_url, slug, is_visible, status, priority';

type PublicTournamentRow = {
    id: string;
    name: string | null;
    display_name: string | null;
    country: string | null;
    country_id: string | null;
    country_ref: { name?: string } | null;
    sport_id: string | null;
    legacy_sport?: string | null;
    logo_url: string | null;
    slug: string | null;
    is_visible: boolean | null;
    status: string | null;
    priority: number | null;
};

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

        let queryResult: {
            data: PublicTournamentRow[] | null;
            error: { code?: string | null; message?: string | null; details?: string | null } | null;
        } = await supabase
            .from('tournaments')
            .select(SELECT_WITH_LEGACY_SPORT)
            .neq('is_visible', false)
            .order('priority', { ascending: false, nullsFirst: false })
            .order('display_name', { ascending: true })
            .order('name', { ascending: true });

        if (isMissingColumnError(queryResult.error, 'sport')) {
            queryResult = await supabase
                .from('tournaments')
                .select(SELECT_WITHOUT_LEGACY_SPORT)
                .neq('is_visible', false)
                .order('priority', { ascending: false, nullsFirst: false })
                .order('display_name', { ascending: true })
                .order('name', { ascending: true });
        }

        const { data, error } = queryResult;

        if (error) {
            console.error('[GET /api/public/tournaments] query failed:', error);
            return NextResponse.json(
                { error: 'No se pudieron cargar los torneos.' },
                { status: 500 }
            );
        }

        const tournaments = sortTournamentsByPriority((data || [])
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
                country: tournament.country || (tournament.country_ref as { name?: string } | null)?.name || null,
                country_id: tournament.country_id,
                sport_id: tournament.sport_id || tournament.legacy_sport || 'rugby',
                logo_url: tournament.logo_url,
                slug: tournament.slug,
                priority: typeof tournament.priority === 'number' ? tournament.priority : 0,
            })));

        return NextResponse.json({ data: tournaments });
    } catch (error) {
        console.error('[GET /api/public/tournaments] unexpected error:', error);
        return NextResponse.json(
            { error: 'No se pudieron cargar los torneos.' },
            { status: 500 }
        );
    }
}
