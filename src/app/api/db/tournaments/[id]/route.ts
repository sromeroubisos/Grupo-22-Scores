import { NextRequest, NextResponse } from 'next/server';
import { getReadClient } from '@/lib/supabase/read';
import { isMissingColumnError } from '@/lib/utils/supabaseSchema';
import { resolveSerializableLogoUrl } from '@/lib/utils/logoUrl';

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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type TournamentLookupResult = {
    data: TournamentLookupRow | null;
    error: { code?: string | null; message?: string | null; details?: string | null } | null;
};

// Resolves a tournament by either UUID (id) or slug.
// We can't use .or(id.eq.X,slug.eq.X) with a non-UUID value because Postgres
// tries to cast the slug to UUID and aborts the whole statement with
// "invalid input syntax for type uuid". So we look it up by the matching
// column only.
async function lookupTournamentByIdOrSlug(
    supabase: Awaited<ReturnType<typeof getReadClient>>,
    select: string,
    rawId: string,
): Promise<TournamentLookupResult> {
    const value = String(rawId ?? '').trim();
    if (!value) {
        return { data: null, error: null };
    }

    const lookupColumn = UUID_RE.test(value) ? 'id' : 'slug';
    const result = await supabase
        .from('tournaments')
        .select(select)
        .eq(lookupColumn, value)
        .maybeSingle();

    return result as TournamentLookupResult;
}

function sanitizeInlineAssetUrl(
    value: unknown,
    tournament: { id: string; name?: string | null; display_name?: string | null },
): string | null {
    return resolveSerializableLogoUrl(value, {
        key: tournament.id,
        name: tournament.display_name || tournament.name,
    });
}

export async function GET(
    _req: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const { id } = await params;

    const supabase = await getReadClient();

    // Try to find a tournament by ID (UUID) or by slug.
    let queryResult = await lookupTournamentByIdOrSlug(supabase, SELECT_WITH_LEGACY_SPORT, id);

    if (isMissingColumnError(queryResult.error, 'sport')) {
        queryResult = await lookupTournamentByIdOrSlug(supabase, SELECT_WITHOUT_LEGACY_SPORT, id);
    }

    if (isMissingColumnError(queryResult.error, 'banner_url')) {
        const SELECT_LEGACY_NO_BANNER = SELECT_WITH_LEGACY_SPORT.replace(', banner_url', '');
        const SELECT_NO_LEGACY_NO_BANNER = SELECT_WITHOUT_LEGACY_SPORT.replace(', banner_url', '');
        queryResult = await lookupTournamentByIdOrSlug(supabase, SELECT_LEGACY_NO_BANNER, id);
        if (isMissingColumnError(queryResult.error, 'sport')) {
            queryResult = await lookupTournamentByIdOrSlug(supabase, SELECT_NO_LEGACY_NO_BANNER, id);
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
            logo_url: sanitizeInlineAssetUrl(data.logo_url, data),
            banner_url: sanitizeInlineAssetUrl(data.banner_url, data),
            sport_id: data.sport_id || data.legacy_sport || 'rugby',
        }
    });
}
