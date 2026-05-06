import { NextRequest, NextResponse } from 'next/server';
import { getReadClient } from '@/lib/supabase/read';
import {
    collectSeasonLinkedTournamentIds,
    mergeSlugSeasonFamilyIntoSet,
    mergeSlugSeasonFamilyIntoSetLoose,
} from '@/lib/tournamentSeasonChain';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const NO_STORE_HEADERS = {
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    Pragma: 'no-cache',
    Expires: '0',
};

type TournamentRow = {
    id: string;
    name: string | null;
    display_name: string | null;
    slug: string | null;
    season_id: string | null;
    status: string | null;
    is_visible: boolean | null;
    sport_id?: string | null;
    country_id?: string | null;
};

type SeasonOption = {
    id: string;
    label: string;
    name: string;
    slug: string | null;
    seasonId: string | null;
    isCurrent: boolean;
    href: string;
};
type TournamentSeasonRow = {
    id: string;
    tournament_id: string;
    season_code: string | null;
    name: string | null;
    display_name: string | null;
    status: string | null;
    is_active: boolean | null;
    start_date?: string | null;
    end_date?: string | null;
    created_at?: string | null;
};

function jsonNoStore(body: unknown, init?: ResponseInit) {
    return NextResponse.json(body, {
        ...init,
        headers: {
            ...NO_STORE_HEADERS,
            ...(init?.headers ?? {}),
        },
    });
}

function buildHref(slug: string | null, id: string): string {
    return `/tournaments/${slug || id}`;
}

function pickLabel(row: TournamentRow): string {
    if (row.season_id && String(row.season_id).trim()) return String(row.season_id).trim();
    return row.display_name || row.name || 'Temporada';
}

function pickSeasonLabel(row: TournamentSeasonRow): string {
    return String(row.season_code || row.display_name || row.name || 'Temporada').trim();
}

function pickSeasonName(row: TournamentSeasonRow): string {
    const label = pickSeasonLabel(row);
    return String(row.display_name || row.name || label).trim();
}

function compareSeasonLabels(a: SeasonOption, b: SeasonOption): number {
    const yearA = Number.parseInt(String(a.label || a.seasonId || ''), 10);
    const yearB = Number.parseInt(String(b.label || b.seasonId || ''), 10);
    if (Number.isFinite(yearA) && Number.isFinite(yearB) && yearA !== yearB) {
        return yearB - yearA;
    }
    return String(b.label).localeCompare(String(a.label), 'es');
}

const ANCHOR_SELECT =
    'id, name, display_name, slug, season_id, status, is_visible, sport_id, country_id';

/** DB `external_id` is often stored without the public route prefix (see favorites migrations). */
function stripPublicRoutePrefix(routeId: string): string {
    return routeId.replace(/^(fs-|ras-league-|espn-league-|espn-racing-league-)/i, '');
}

async function resolveSeasonAnchorRow(
    supabase: Awaited<ReturnType<typeof getReadClient>>,
    routeId: string,
): Promise<TournamentRow | null> {
    const { data: byIdOrSlugData } = await supabase
        .from('tournaments')
        .select(ANCHOR_SELECT)
        .or(`id.eq.${routeId},slug.eq.${routeId}`)
        .maybeSingle();
    const byIdOrSlug = byIdOrSlugData as TournamentRow | null;

    if (byIdOrSlug) return byIdOrSlug;

    const tryExternalId = async (value: string) => {
        if (!value.trim()) return null;
        const { data, error } = await supabase
            .from('tournaments')
            .select(ANCHOR_SELECT)
            .eq('external_id', value)
            .limit(1);
        if (error || !data?.length) return null;
        return data[0] as TournamentRow;
    };

    const direct = await tryExternalId(routeId);
    if (direct) return direct;

    const stripped = stripPublicRoutePrefix(routeId);
    if (stripped !== routeId) {
        const byStripped = await tryExternalId(stripped);
        if (byStripped) return byStripped;
    }

    if (!/^fs-/i.test(routeId)) {
        const withFs = await tryExternalId(`fs-${routeId}`);
        if (withFs) return withFs;
    }

    return null;
}

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const { id } = await params;
    const supabase = await getReadClient();

    const lookup = await resolveSeasonAnchorRow(supabase, id);

    if (!lookup) {
        return jsonNoStore({ ok: false, seasons: [] }, { status: 404 });
    }

    const currentId = lookup.id;
    const requestedSeasonId =
        req.nextUrl.searchParams.get('seasonId') ||
        req.nextUrl.searchParams.get('season_id') ||
        req.nextUrl.searchParams.get('season');

    const involvedIds = new Set<string>([currentId]);
    try {
        const linkedIds = await collectSeasonLinkedTournamentIds(supabase as any, currentId);
        linkedIds.forEach((linkedId) => involvedIds.add(linkedId));
    } catch {
        // Keep the public switcher useful even if relation metadata is temporarily unavailable.
    }

    await mergeSlugSeasonFamilyIntoSet(supabase as any, {
        id: lookup.id,
        slug: lookup.slug,
        sport_id: lookup.sport_id ?? null,
        country_id: lookup.country_id ?? null,
    }, involvedIds);

    if (involvedIds.size <= 1) {
        await mergeSlugSeasonFamilyIntoSetLoose(supabase as any, { slug: lookup.slug }, involvedIds);
    }

    const { data: tournamentRowsData, error: tournamentRowsError } = await supabase
        .from('tournaments')
        .select('id, name, display_name, slug, season_id, status, is_visible')
        .in('id', Array.from(involvedIds));

    if (tournamentRowsError) {
        return jsonNoStore({ ok: false, seasons: [], error: tournamentRowsError.message }, { status: 500 });
    }

    const rows = ((tournamentRowsData ?? []) as TournamentRow[]);
    if (!rows.some((row) => row.id === lookup.id)) {
        rows.push(lookup);
    }
    const tournamentById = new Map(rows.map((row) => [row.id, row]));

    const { data: tournamentSeasonRows, error: tournamentSeasonError } = await supabase
        .from('tournament_seasons')
        .select('id, tournament_id, season_code, name, display_name, status, is_active, start_date, end_date, created_at')
        .in('tournament_id', Array.from(tournamentById.keys()))
        .order('season_code', { ascending: false })
        .order('created_at', { ascending: false });

    const seasonRows = !tournamentSeasonError && Array.isArray(tournamentSeasonRows)
        ? tournamentSeasonRows as TournamentSeasonRow[]
        : [];
    const currentTournamentSeasons = seasonRows.filter((season) => season.tournament_id === currentId);
    const activeSeason =
        currentTournamentSeasons.find((season) => requestedSeasonId && season.id === requestedSeasonId) ||
        currentTournamentSeasons.find((season) => season.is_active) ||
        currentTournamentSeasons[0] ||
        null;

    const seasons: SeasonOption[] = seasonRows.map((season) => {
        const owner = tournamentById.get(season.tournament_id) || lookup;
        const label = pickSeasonLabel(season);
        return {
            id: season.id,
            label,
            name: owner.id === lookup.id
                ? pickSeasonName(season)
                : `${owner.display_name || owner.name || 'Torneo'} - ${pickSeasonName(season)}`,
            slug: owner.slug,
            seasonId: season.id,
            isCurrent: owner.id === currentId && season.id === activeSeason?.id,
            href: `${buildHref(owner.slug, owner.id)}?seasonId=${encodeURIComponent(season.id)}`,
        };
    });

    const tournamentIdsWithSeasonRows = new Set(seasonRows.map((season) => season.tournament_id));
    for (const row of rows) {
        if (tournamentIdsWithSeasonRows.has(row.id)) continue;
        seasons.push({
            id: row.id,
            label: pickLabel(row),
            name: row.display_name || row.name || 'Temporada',
            slug: row.slug,
            seasonId: row.season_id,
            isCurrent: row.id === currentId && !activeSeason,
            href: buildHref(row.slug, row.id),
        });
    }

    seasons.sort(compareSeasonLabels);

    return jsonNoStore({ ok: true, seasons, currentId: activeSeason?.id ?? currentId, tournamentId: lookup.id });
}
