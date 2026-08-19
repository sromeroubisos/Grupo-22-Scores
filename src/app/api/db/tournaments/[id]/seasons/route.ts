import { NextRequest, NextResponse } from 'next/server';
import { getReadClient } from '@/lib/supabase/read';
import { fetchTournamentData } from '@/lib/server/fetchTournamentData';
import { resolveSerializableLogoUrl } from '@/lib/utils/logoUrl';
import {
    collectSeasonLinkedTournamentIds,
    collectTournamentSeasonFamilyRows,
    mergeSlugSeasonFamilyIntoSet,
    mergeSlugSeasonFamilyIntoSetLoose,
    type TournamentSeasonFamilyRow,
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

const ANCHOR_SELECT =
    'id, name, display_name, slug, season_id, status, is_visible, sport_id, country_id';
// Cinco grupos, no cuatro. Al que estaba acá le faltaba el tercer bloque de 4
// (8-4-4-12 en vez de 8-4-4-4-12), así que NINGÚN uuid real lo pasaba: la
// búsqueda por `id` no se intentaba nunca y un torneo abierto por uuid caía
// siempre en la rama de slug, no encontraba nada y se quedaba sin el
// desplegable de temporadas.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function coerceTournamentRow(value: Record<string, unknown> | null | undefined): TournamentRow | null {
    const id = typeof value?.id === 'string' ? value.id.trim() : '';
    if (!id) return null;

    return {
        id,
        name: typeof value?.name === 'string' ? value.name : null,
        display_name: typeof value?.display_name === 'string' ? value.display_name : null,
        slug: typeof value?.slug === 'string' ? value.slug : null,
        season_id: typeof value?.season_id === 'string' ? value.season_id : null,
        status: typeof value?.status === 'string' ? value.status : null,
        is_visible: typeof value?.is_visible === 'boolean' ? value.is_visible : null,
        sport_id: typeof value?.sport_id === 'string' ? value.sport_id : null,
        country_id: typeof value?.country_id === 'string' ? value.country_id : null,
    };
}

/** DB `external_id` is often stored without the public route prefix (see favorites migrations). */
function stripPublicRoutePrefix(routeId: string): string {
    return routeId.replace(/^(fs-|ras-league-|espn-league-|espn-racing-league-)/i, '');
}

async function resolveSeasonAnchorRow(
    supabase: Awaited<ReturnType<typeof getReadClient>>,
    routeId: string,
): Promise<TournamentRow | null> {
    const routeKey = routeId.trim();

    if (UUID_RE.test(routeKey)) {
        const { data: byIdData } = await supabase
            .from('tournaments')
            .select(ANCHOR_SELECT)
            .eq('id', routeKey)
            .maybeSingle();
        const byId = byIdData as TournamentRow | null;
        if (byId) return byId;
    }

    const { data: bySlugData } = await supabase
        .from('tournaments')
        .select(ANCHOR_SELECT)
        .eq('slug', routeKey)
        .maybeSingle();
    const bySlug = bySlugData as TournamentRow | null;

    if (bySlug) return bySlug;

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

    const direct = await tryExternalId(routeKey);
    if (direct) return direct;

    const stripped = stripPublicRoutePrefix(routeKey);
    if (stripped !== routeKey) {
        const byStripped = await tryExternalId(stripped);
        if (byStripped) return byStripped;
    }

    if (!/^fs-/i.test(routeKey)) {
        const withFs = await tryExternalId(`fs-${routeKey}`);
        if (withFs) return withFs;
    }

    const fallback = await fetchTournamentData(routeKey);
    const fallbackTournament = coerceTournamentRow(fallback?.tournament);
    if (fallbackTournament) return fallbackTournament;

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

    const seasonRows = await collectTournamentSeasonFamilyRows(supabase as any, involvedIds, requestedSeasonId);
    seasonRows.forEach((season) => {
        if (season.tournament_id) involvedIds.add(season.tournament_id);
        if (season.legacy_tournament_id) involvedIds.add(season.legacy_tournament_id);
    });

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
