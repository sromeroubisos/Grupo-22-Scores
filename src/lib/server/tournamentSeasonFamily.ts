import { getReadClient } from '@/lib/supabase/read';
import { fetchTournamentData } from '@/lib/server/fetchTournamentData';
import {
    collectSeasonLinkedTournamentIds,
    collectTournamentSeasonFamilyRows,
    mergeSlugSeasonFamilyIntoSet,
    mergeSlugSeasonFamilyIntoSetLoose,
    type TournamentSeasonFamilyRow,
} from '@/lib/tournamentSeasonChain';

/**
 * Las temporadas de un torneo, tal como las lista el selector.
 *
 * Un torneo guarda sus temporadas de dos maneras que conviven: filas de
 * `tournament_seasons` adentro del mismo torneo (el Top 14 tiene 1986-2026 en
 * una sola fila de `tournaments`) y filas de `tournaments` encadenadas como
 * temporadas (URBA 2025 y 2026 son torneos distintos). El selector de
 * temporadas y la tabla histórica tienen que ver la MISMA familia: si la
 * histórica sumara otra cosa, un club tendría puntos de una temporada que no
 * aparece en el selector.
 */

export type TournamentRow = {
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

export type TournamentSeasonFamily = {
    /** El torneo de la ruta. */
    lookup: TournamentRow;
    /** Todas las filas de `tournaments` de la familia, la de la ruta incluida. */
    tournaments: TournamentRow[];
    /** Las temporadas internas (`tournament_seasons`) de toda la familia. */
    seasonRows: TournamentSeasonFamilyRow[];
};

type ReadClient = Awaited<ReturnType<typeof getReadClient>>;

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

async function resolveSeasonAnchorRow(supabase: ReadClient, routeId: string): Promise<TournamentRow | null> {
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

/**
 * null cuando la ruta no corresponde a ningún torneo. Tira si falla la consulta
 * de las filas de la familia: devolver una familia a medias haría que la tabla
 * histórica sumara menos temporadas sin avisar.
 */
export async function resolveTournamentSeasonFamily(
    supabase: ReadClient,
    routeId: string,
    requestedSeasonId: string | null = null,
): Promise<TournamentSeasonFamily | null> {
    const lookup = await resolveSeasonAnchorRow(supabase, routeId);
    if (!lookup) return null;

    const involvedIds = new Set<string>([lookup.id]);
    try {
        const linkedIds = await collectSeasonLinkedTournamentIds(supabase as any, lookup.id);
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

    if (tournamentRowsError) throw new Error(tournamentRowsError.message);

    const tournaments = (tournamentRowsData ?? []) as TournamentRow[];
    if (!tournaments.some((row) => row.id === lookup.id)) tournaments.push(lookup);

    return { lookup, tournaments, seasonRows };
}
