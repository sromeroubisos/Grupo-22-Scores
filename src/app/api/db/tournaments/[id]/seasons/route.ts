import { NextRequest, NextResponse } from 'next/server';
import { getReadClient } from '@/lib/supabase/read';
import { mergeSlugSeasonFamilyIntoSet, mergeSlugSeasonFamilyIntoSetLoose } from '@/lib/tournamentSeasonChain';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const NO_STORE_HEADERS = {
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    Pragma: 'no-cache',
    Expires: '0',
};

const SEASON_RELATION_TYPES = ['previous_season', 'next_season'] as const;

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

type RelationRow = {
    source_tournament_id: string;
    target_tournament_id: string;
    relation_type: string;
    status: string | null;
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

function compareSeasonLabels(a: SeasonOption, b: SeasonOption): number {
    const yearA = Number.parseInt(String(a.seasonId ?? a.label), 10);
    const yearB = Number.parseInt(String(b.seasonId ?? b.label), 10);
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
    const { data: byIdOrSlug } = await supabase
        .from('tournaments')
        .select(ANCHOR_SELECT)
        .or(`id.eq.${routeId},slug.eq.${routeId}`)
        .maybeSingle<TournamentRow>();

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
    _req: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const { id } = await params;
    const supabase = await getReadClient();

    const lookup = await resolveSeasonAnchorRow(supabase, id);

    if (!lookup) {
        return jsonNoStore({ ok: false, seasons: [] }, { status: 404 });
    }

    const currentId = lookup.id;

    const relationTypes = SEASON_RELATION_TYPES as unknown as string[];
    const isActiveRelation = (rel: RelationRow) =>
        (rel.status ?? 'active') !== 'inactive' && (rel.status ?? 'active') !== 'archived';

    /** Full season cluster: walk previous_season/next_season as an undirected graph (linear chains were missing ends). */
    const involvedIds = new Set<string>([currentId]);
    let grew = true;
    while (grew) {
        grew = false;
        const frontier = Array.from(involvedIds);
        const [{ data: bySource, error: errSource }, { data: byTarget, error: errTarget }] = await Promise.all([
            supabase
                .from('tournament_relations')
                .select('source_tournament_id, target_tournament_id, relation_type, status')
                .in('source_tournament_id', frontier)
                .in('relation_type', relationTypes),
            supabase
                .from('tournament_relations')
                .select('source_tournament_id, target_tournament_id, relation_type, status')
                .in('target_tournament_id', frontier)
                .in('relation_type', relationTypes),
        ]);

        if (errSource || errTarget) {
            const msg = errSource?.message || errTarget?.message || 'relations query failed';
            return jsonNoStore({ ok: false, seasons: [], error: msg }, { status: 500 });
        }

        const batch = [...(bySource ?? []), ...(byTarget ?? [])] as RelationRow[];
        for (const rel of batch) {
            if (!isActiveRelation(rel)) continue;
            const a = rel.source_tournament_id;
            const b = rel.target_tournament_id;
            if (!involvedIds.has(a)) {
                involvedIds.add(a);
                grew = true;
            }
            if (!involvedIds.has(b)) {
                involvedIds.add(b);
                grew = true;
            }
        }
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

    if (involvedIds.size <= 1) {
        return jsonNoStore({
            ok: true,
            seasons: [{
                id: lookup.id,
                label: pickLabel(lookup),
                name: lookup.display_name || lookup.name || 'Temporada',
                slug: lookup.slug,
                seasonId: lookup.season_id,
                isCurrent: true,
                href: buildHref(lookup.slug, lookup.id),
            }],
            currentId,
        });
    }

    const { data: tournamentRowsData, error: tournamentRowsError } = await supabase
        .from('tournaments')
        .select('id, name, display_name, slug, season_id, status, is_visible')
        .in('id', Array.from(involvedIds));

    if (tournamentRowsError) {
        return jsonNoStore({ ok: false, seasons: [], error: tournamentRowsError.message }, { status: 500 });
    }

    const rows = (tournamentRowsData ?? []) as TournamentRow[];
    /* Same competition / linked seasons: list every edition so the switcher stays consistent on every URL. */
    const seasons: SeasonOption[] = rows.map((row) => ({
        id: row.id,
        label: pickLabel(row),
        name: row.display_name || row.name || 'Temporada',
        slug: row.slug,
        seasonId: row.season_id,
        isCurrent: row.id === currentId,
        href: buildHref(row.slug, row.id),
    }));

    seasons.sort(compareSeasonLabels);

    return jsonNoStore({ ok: true, seasons, currentId });
}
