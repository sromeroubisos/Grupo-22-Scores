import { NextRequest, NextResponse } from 'next/server';
import { getReadClient } from '@/lib/supabase/read';
import { resolveSerializableLogoUrl } from '@/lib/utils/logoUrl';
import { type TournamentSeasonFamilyRow } from '@/lib/tournamentSeasonChain';
import { resolveTournamentSeasonFamily, type TournamentRow } from '@/lib/server/tournamentSeasonFamily';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const NO_STORE_HEADERS = {
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    Pragma: 'no-cache',
    Expires: '0',
};

type SeasonChampionRef = {
    id: string;
    name: string;
    logo: string | null;
};

type SeasonOption = {
    id: string;
    label: string;
    name: string;
    slug: string | null;
    seasonId: string | null;
    isCurrent: boolean;
    href: string;
    status: string | null;
    champion: SeasonChampionRef | null;
    /** Títulos compartidos: los demás campeones de esa edición (settings.co_champions). */
    coChampions: SeasonChampionRef[];
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

function pickSeasonLabel(row: TournamentSeasonFamilyRow): string {
    return String(row.season_code || row.display_name || row.name || 'Temporada').trim();
}

function pickSeasonName(row: TournamentSeasonFamilyRow): string {
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

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const { id } = await params;
    const supabase = await getReadClient();

    const requestedSeasonId =
        req.nextUrl.searchParams.get('seasonId') ||
        req.nextUrl.searchParams.get('season_id') ||
        req.nextUrl.searchParams.get('season');

    let family: Awaited<ReturnType<typeof resolveTournamentSeasonFamily>>;
    try {
        family = await resolveTournamentSeasonFamily(supabase, id, requestedSeasonId);
    } catch (error) {
        return jsonNoStore({ ok: false, seasons: [], error: (error as Error).message }, { status: 500 });
    }

    if (!family) {
        return jsonNoStore({ ok: false, seasons: [] }, { status: 404 });
    }

    const { lookup, seasonRows } = family;
    const currentId = lookup.id;
    const rows: TournamentRow[] = family.tournaments;
    const tournamentById = new Map(rows.map((row) => [row.id, row]));
    const currentTournamentSeasons = seasonRows.filter((season) => season.tournament_id === currentId);
    const activeSeason =
        currentTournamentSeasons.find((season) => requestedSeasonId && season.id === requestedSeasonId) ||
        currentTournamentSeasons.find((season) => season.is_active) ||
        currentTournamentSeasons[0] ||
        null;

    // Campeones: un solo lookup por todos los clubes campeones de la familia.
    // El logo pasa por resolveSerializableLogoUrl — los escudos en base64 de
    // `clubs.logo_url` inflarían el payload del selector si viajaran crudos.
    const coChampionIdsOf = (season: TournamentSeasonFamilyRow): string[] => {
        const raw = (season.settings as { co_champions?: unknown } | null)?.co_champions;
        return Array.isArray(raw) ? raw.filter((v): v is string => typeof v === 'string' && Boolean(v.trim())) : [];
    };
    const championClubIds = new Set<string>();
    for (const season of seasonRows) {
        if (season.champion_club_id) championClubIds.add(season.champion_club_id);
        coChampionIdsOf(season).forEach((clubId) => championClubIds.add(clubId));
    }
    const championById = new Map<string, SeasonChampionRef>();
    if (championClubIds.size > 0) {
        const { data: championRowsData } = await supabase
            .from('clubs')
            .select('id, name, short_name, logo_url')
            .in('id', Array.from(championClubIds));
        for (const club of (championRowsData ?? []) as Array<{ id: string; name: string | null; short_name: string | null; logo_url: string | null }>) {
            const clubName = club.name || club.short_name || club.id;
            championById.set(club.id, {
                id: club.id,
                name: clubName,
                logo: resolveSerializableLogoUrl(club.logo_url, { key: club.id, name: clubName }),
            });
        }
    }

    const seasons: SeasonOption[] = seasonRows.map((season) => {
        const owner = tournamentById.get(season.tournament_id) || lookup;
        const label = pickSeasonLabel(season);
        const seasonName = pickSeasonName(season);
        const ownerName = owner.display_name || owner.name || 'Torneo';
        const name = owner.id === lookup.id || ownerName.trim() === seasonName.trim()
            ? seasonName
            : `${ownerName} - ${seasonName}`;
        return {
            id: season.id,
            label,
            name,
            slug: owner.slug,
            seasonId: season.id,
            isCurrent: owner.id === currentId && season.id === activeSeason?.id,
            href: `${buildHref(owner.slug, owner.id)}?seasonId=${encodeURIComponent(season.id)}`,
            status: season.status ?? null,
            champion: (season.champion_club_id && championById.get(season.champion_club_id)) || null,
            coChampions: coChampionIdsOf(season)
                .map((clubId) => championById.get(clubId))
                .filter((club): club is SeasonChampionRef => Boolean(club)),
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
            status: row.status ?? null,
            champion: null,
            coChampions: [],
        });
    }

    seasons.sort(compareSeasonLabels);

    return jsonNoStore({ ok: true, seasons, currentId: activeSeason?.id ?? currentId, tournamentId: lookup.id });
}
