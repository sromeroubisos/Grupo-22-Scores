import { NextRequest, NextResponse } from 'next/server';
import { getReadClient } from '@/lib/supabase/read';

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

export async function GET(
    _req: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const { id } = await params;
    const supabase = await getReadClient();

    const { data: lookup, error: lookupError } = await supabase
        .from('tournaments')
        .select('id, name, display_name, slug, season_id, status, is_visible')
        .or(`id.eq.${id},slug.eq.${id}`)
        .maybeSingle<TournamentRow>();

    if (lookupError || !lookup) {
        return jsonNoStore({ ok: false, seasons: [] }, { status: 404 });
    }

    const currentId = lookup.id;

    const { data: directRelationsData, error: directRelationsError } = await supabase
        .from('tournament_relations')
        .select('source_tournament_id, target_tournament_id, relation_type, status')
        .or(`source_tournament_id.eq.${currentId},target_tournament_id.eq.${currentId}`)
        .in('relation_type', SEASON_RELATION_TYPES as unknown as string[]);

    if (directRelationsError) {
        return jsonNoStore({ ok: false, seasons: [], error: directRelationsError.message }, { status: 500 });
    }

    const directRelations = (directRelationsData ?? []) as RelationRow[];
    const activeDirectRelations = directRelations.filter((rel) => (rel.status ?? 'active') !== 'inactive' && (rel.status ?? 'active') !== 'archived');

    const involvedIds = new Set<string>([currentId]);
    activeDirectRelations.forEach((rel) => {
        involvedIds.add(rel.source_tournament_id);
        involvedIds.add(rel.target_tournament_id);
    });

    const parentIds = new Set<string>();
    activeDirectRelations.forEach((rel) => {
        if (rel.target_tournament_id === currentId && rel.relation_type === 'previous_season') {
            parentIds.add(rel.source_tournament_id);
        }
    });

    if (parentIds.size > 0) {
        const { data: siblingRelationsData } = await supabase
            .from('tournament_relations')
            .select('source_tournament_id, target_tournament_id, relation_type, status')
            .in('source_tournament_id', Array.from(parentIds))
            .in('relation_type', SEASON_RELATION_TYPES as unknown as string[]);

        const siblingRelations = (siblingRelationsData ?? []) as RelationRow[];
        siblingRelations
            .filter((rel) => (rel.status ?? 'active') !== 'inactive' && (rel.status ?? 'active') !== 'archived')
            .forEach((rel) => {
                involvedIds.add(rel.source_tournament_id);
                involvedIds.add(rel.target_tournament_id);
            });
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
    const visibleRows = rows.filter((row) => row.id === currentId || row.is_visible !== false);

    const seasons: SeasonOption[] = visibleRows.map((row) => ({
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
