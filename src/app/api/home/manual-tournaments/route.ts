import { NextRequest, NextResponse } from 'next/server';
import { memoryCache } from '@/lib/cache';
import { HOME_MANUAL_TOURNAMENTS_CACHE_PREFIX } from '@/lib/server/cacheKeys';
import { getReadClient } from '@/lib/supabase/read';
import { isMissingColumnError } from '@/lib/utils/supabaseSchema';
import { sortTournamentsByPriority } from '@/lib/utils/tournamentOrdering';
import { resolveSerializableLogoUrl } from '@/lib/utils/logoUrl';
import { filtrarPorTemporada } from '@/lib/tournamentSeasonFilter';

// Rugby se guarda con tres sport_id distintos y los tres son el mismo deporte
// para quien mira la pagina.
const RUGBY_SPORT_IDS = ['rugby', 'rugby-union', 'rugby-league'];
// Bajo el prefijo compartido: asi la invalidacion por prefijo tambien lo limpia
// cuando se crea o se edita un torneo.
const MANUAL_TOURNAMENTS_ROWS_CACHE_KEY = `${HOME_MANUAL_TOURNAMENTS_CACHE_PREFIX}:rows`;
const MANUAL_TOURNAMENTS_ROWS_TTL_SECONDS = 60;
const MANUAL_TOURNAMENTS_QUERY_LIMIT = 3000;

export function resolveManualSportFilter(rawSport: string | null): string[] | null {
    const sport = rawSport?.trim().toLowerCase();
    if (!sport) return null;
    if (RUGBY_SPORT_IDS.includes(sport)) return RUGBY_SPORT_IDS;
    return [sport];
}

type ManualTournamentRow = {
    id: string;
    name: string | null;
    display_name: string | null;
    sport_id: string | null;
    legacy_sport?: string | null;
    country: string | null;
    country_id: string | null;
    logo_url?: string | null;
    category: string | null;
    season_id: string | null;
    status: string | null;
    is_visible: boolean | null;
    age_grade: string | null;
    format: string | null;
    priority: number | null;
    /** Para el filtro de temporada y para agrupar en familias en el selector. */
    union_id: string | null;
    /** 'union' | 'regional' | 'nacional': separa los regionales de los de cada unión. */
    scope?: string | null;
    subcategory: string | null;
    gender: string | null;
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
    country,
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
    country,
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
    country,
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
    country,
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

    // `scope` es una columna nueva: si esa base todavía no la tiene se pide sin ella.
    let conScope = true;

    for (let i = 0; i < attempts.length; i += 1) {
        const attempt = attempts[i];
        let query = supabase
            .from('tournaments')
            .select(`${attempt.select}, union_id, subcategory, gender${conScope ? ', scope' : ''}`)
            .neq('is_visible', false);

        if (attempt.usesPriority) {
            query = query.order('priority', { ascending: false, nullsFirst: false });
        }

        const result = await query
            .order('display_name', { ascending: true })
            .limit(MANUAL_TOURNAMENTS_QUERY_LIMIT) as unknown as ManualTournamentQueryResult;

        if (!result.error) {
            return result;
        }

        if (conScope && isMissingColumnError(result.error, 'scope')) {
            conScope = false;
            i -= 1;
            continue;
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

let manualTournamentRowsInFlight: Promise<ManualTournamentQueryResult> | null = null;

// Una sola lectura compartida entre pedidos: el recorte por deporte se hace
// despues, en memoria, asi que pedir rugby y hockey no son dos consultas.
async function readManualTournamentRows(
    supabase: Awaited<ReturnType<typeof getReadClient>>,
): Promise<ManualTournamentQueryResult> {
    const cachedRows = memoryCache.get<ManualTournamentRow[]>(MANUAL_TOURNAMENTS_ROWS_CACHE_KEY);
    if (cachedRows) {
        return { data: cachedRows, error: null };
    }

    if (manualTournamentRowsInFlight) {
        return manualTournamentRowsInFlight;
    }

    manualTournamentRowsInFlight = (async () => {
        try {
            const result = await queryVisibleManualTournaments(supabase);
            if (!result.error && result.data) {
                memoryCache.set(MANUAL_TOURNAMENTS_ROWS_CACHE_KEY, result.data, MANUAL_TOURNAMENTS_ROWS_TTL_SECONDS);
            }
            return result;
        } finally {
            manualTournamentRowsInFlight = null;
        }
    })();

    return manualTournamentRowsInFlight;
}

export async function GET(request: NextRequest) {
    try {
        const sportFilter = resolveManualSportFilter(new URL(request.url).searchParams.get('sport'));
        const supabase = await getReadClient();
        const queryResult = await readManualTournamentRows(supabase);

        const { data, error } = queryResult;

        if (error) {
            console.error('[GET /api/home/manual-tournaments] query failed:', error);
            return NextResponse.json(
                { error: 'No se pudieron cargar los torneos manuales.' },
                { status: 500 }
            );
        }

        const deLosDeportes = (data || []).filter((tournament) => {
            const status = tournament.status?.toLowerCase?.() || null;
            if (status === 'archived' || status === 'deleted') return false;

            if (!sportFilter) return true;

            const sportId = tournament.sport_id || tournament.legacy_sport || 'rugby';
            return sportFilter.includes(sportId);
        });

        // Una sola temporada por unión que carga calendarios enteros. Sin esto la
        // URBA mandaba sus seis temporadas (811 filas) y el selector de ligas
        // mostraba "Menores de 16" de 2021 al lado del Top 14 de 2026. La misma
        // regla que ya usa el listado público: los torneos cargados a mano no
        // filtran, y el filtro no se puede aplicar en la consulta porque la
        // temporada "en curso" de una unión depende de qué más tiene cargado.
        const visibleTournaments = sortTournamentsByPriority(filtrarPorTemporada(deLosDeportes).map((tournament) => ({
            ...tournament,
            sport_id: tournament.sport_id || tournament.legacy_sport || 'rugby',
            logo_url: resolveSerializableLogoUrl(tournament.logo_url, {
                key: tournament.id,
                name: tournament.display_name || tournament.name,
            }),
            priority: typeof tournament.priority === 'number' ? tournament.priority : 0,
        })));

        return NextResponse.json({ data: visibleTournaments }, {
            headers: { 'Cache-Control': 'public, max-age=300, stale-while-revalidate=600' },
        });
    } catch (error) {
        console.error('[GET /api/home/manual-tournaments] unexpected error:', error);
        return NextResponse.json(
            { error: 'No se pudieron cargar los torneos manuales.' },
            { status: 500 }
        );
    }
}
