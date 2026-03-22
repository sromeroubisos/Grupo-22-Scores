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

type ManualTournamentQueryResult = {
    data: ManualTournamentRow[] | null;
    error: { code?: string | null; message?: string | null; details?: string | null } | null;
};

const SELECT_WITH_LEGACY_SPORT_AND_PRIORITY = `
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

const SELECT_WITHOUT_LEGACY_SPORT_AND_PRIORITY = `
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
    format
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
    format
`;

async function queryVisibleManualTournaments(
    supabase: Awaited<ReturnType<typeof getReadClient>>,
): Promise<ManualTournamentQueryResult> {
    const attempts: Array<{ select: string; usesLegacySport: boolean; usesPriority: boolean }> = [
        { select: SELECT_WITH_LEGACY_SPORT_AND_PRIORITY, usesLegacySport: true, usesPriority: true },
        { select: SELECT_WITHOUT_LEGACY_SPORT_AND_PRIORITY, usesLegacySport: false, usesPriority: true },
        { select: SELECT_WITH_LEGACY_SPORT, usesLegacySport: true, usesPriority: false },
        { select: SELECT_WITHOUT_LEGACY_SPORT, usesLegacySport: false, usesPriority: false },
    ];

    for (const attempt of attempts) {
        let query = supabase
            .from('tournaments')
            .select(attempt.select)
            .neq('is_visible', false);

        if (attempt.usesPriority) {
            query = query.order('priority', { ascending: false, nullsFirst: false });
        }

        const result = await query.order('display_name', { ascending: true }) as unknown as ManualTournamentQueryResult;

        if (!result.error) {
            return result;
        }

        const missingSport = attempt.usesLegacySport && isMissingColumnError(result.error, 'sport');
        const missingPriority = attempt.usesPriority && isMissingColumnError(result.error, 'priority');

        if (missingSport || missingPriority) {
            continue;
        }

        return result;
    }

    return {
        data: null,
        error: { message: 'No compatible tournament query could be built for the current schema.' },
    };
}

export async function GET() {
    try {
        const supabase = await getReadClient();
        const queryResult = await queryVisibleManualTournaments(supabase);

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
