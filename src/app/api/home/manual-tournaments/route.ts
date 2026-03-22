import { NextResponse } from 'next/server';
import { getReadClient } from '@/lib/supabase/read';
import { isMissingColumnError } from '@/lib/utils/supabaseSchema';
import { sortTournamentsByPriority } from '@/lib/utils/tournamentOrdering';

type ManualTournamentRow = {
    id: string;
    name: string | null;
    display_name: string | null;
    sport_id: string | null;
    legacy_sport?: string | null;
    country_id: string | null;
    logo_url: string | null;
    category: string | null;
    season_id: string | null;
    status: string | null;
    is_visible: boolean | null;
    age_grade: string | null;
    format: string | null;
    priority: number | null;
};

const SELECT_WITH_LEGACY_SPORT = `
    id,
    name,
    display_name,
    sport_id,
    legacy_sport:sport,
    country_id,
    logo_url,
    category,
    season_id,
    status,
    is_visible,
    age_grade,
    format,
    priority
`;

const SELECT_WITHOUT_LEGACY_SPORT = `
    id,
    name,
    display_name,
    sport_id,
    country_id,
    logo_url,
    category,
    season_id,
    status,
    is_visible,
    age_grade,
    format,
    priority
`;

export async function GET() {
    try {
        const supabase = await getReadClient();
        let queryResult: {
            data: ManualTournamentRow[] | null;
            error: { code?: string | null; message?: string | null; details?: string | null } | null;
        } = await supabase
            .from('tournaments')
            .select(SELECT_WITH_LEGACY_SPORT)
            .neq('is_visible', false)
            .order('priority', { ascending: false, nullsFirst: false })
            .order('display_name', { ascending: true });

        if (isMissingColumnError(queryResult.error, 'sport')) {
            queryResult = await supabase
                .from('tournaments')
                .select(SELECT_WITHOUT_LEGACY_SPORT)
                .neq('is_visible', false)
                .order('priority', { ascending: false, nullsFirst: false })
                .order('display_name', { ascending: true });
        }

        const { data, error } = queryResult;

        if (error) {
            console.error('[GET /api/home/manual-tournaments] query failed:', error);
            return NextResponse.json(
                { error: 'No se pudieron cargar los torneos manuales.' },
                { status: 500 }
            );
        }

        const visibleTournaments = sortTournamentsByPriority((data || []).filter((tournament) => {
            const status = tournament.status?.toLowerCase?.() || null;
            return status !== 'archived' && status !== 'deleted';
        }).map((tournament) => ({
            ...tournament,
            sport_id: tournament.sport_id || tournament.legacy_sport || 'rugby',
            priority: typeof tournament.priority === 'number' ? tournament.priority : 0,
        })));

        return NextResponse.json({ data: visibleTournaments });
    } catch (error) {
        console.error('[GET /api/home/manual-tournaments] unexpected error:', error);
        return NextResponse.json(
            { error: 'No se pudieron cargar los torneos manuales.' },
            { status: 500 }
        );
    }
}
