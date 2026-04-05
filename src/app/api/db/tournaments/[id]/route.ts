import { NextRequest, NextResponse } from 'next/server';
import { getReadClient } from '@/lib/supabase/read';
import { isMissingColumnError } from '@/lib/utils/supabaseSchema';

type TournamentLookupRow = {
    id: string;
    name: string | null;
    display_name: string | null;
    external_id?: string | null;
    logo_url: string | null;
    banner_url?: string | null;
    sport_id: string | null;
    legacy_sport?: string | null;
    country_id: string | null;
    slug: string | null;
    format?: string | null;
    ruleset?: Record<string, unknown> | null;
    is_visible: boolean | null;
    status: string | null;
};

const SELECT_WITH_LEGACY_SPORT = 'id, name, display_name, external_id, logo_url, banner_url, sport_id, legacy_sport:sport, country_id, slug, format, ruleset, is_visible, status';
const SELECT_WITHOUT_LEGACY_SPORT = 'id, name, display_name, external_id, logo_url, banner_url, sport_id, country_id, slug, format, ruleset, is_visible, status';

export async function GET(
    _req: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const { id } = await params;

    const supabase = await getReadClient();

    // Try to find a tournament by ID (UUID) or by slug
    let queryResult: {
        data: TournamentLookupRow | null;
        error: { code?: string | null; message?: string | null; details?: string | null } | null;
    } = await supabase
        .from('tournaments')
        .select(SELECT_WITH_LEGACY_SPORT)
        .or(`id.eq.${id},slug.eq.${id}`)
        .maybeSingle();

    if (isMissingColumnError(queryResult.error, 'sport')) {
        queryResult = await supabase
            .from('tournaments')
            .select(SELECT_WITHOUT_LEGACY_SPORT)
            .or(`id.eq.${id},slug.eq.${id}`)
            .maybeSingle();
    }

    if (isMissingColumnError(queryResult.error, 'banner_url')) {
        const SELECT_LEGACY_NO_BANNER = SELECT_WITH_LEGACY_SPORT.replace(', banner_url', '');
        const SELECT_NO_LEGACY_NO_BANNER = SELECT_WITHOUT_LEGACY_SPORT.replace(', banner_url', '');
        queryResult = await supabase
            .from('tournaments')
            .select(SELECT_LEGACY_NO_BANNER)
            .or(`id.eq.${id},slug.eq.${id}`)
            .maybeSingle();
        if (isMissingColumnError(queryResult.error, 'sport')) {
            queryResult = await supabase
                .from('tournaments')
                .select(SELECT_NO_LEGACY_NO_BANNER)
                .or(`id.eq.${id},slug.eq.${id}`)
                .maybeSingle();
        }
    }

    const { data, error } = queryResult;

    if (error || !data) {
        return NextResponse.json({ ok: false }, { status: 404 });
    }

    return NextResponse.json({
        ok: true,
        tournament: {
            ...data,
            sport_id: data.sport_id || data.legacy_sport || 'rugby',
        }
    });
}
