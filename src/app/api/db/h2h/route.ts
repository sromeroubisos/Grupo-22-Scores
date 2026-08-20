import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { canonicalizeSportId } from '@/lib/clubDerivatives';
import { buildTeamLogoProxyUrl } from '@/lib/utils/logoUrl';

const FINAL_STATUSES = ['final', 'finished', 'ft'] as const;

type ClubSideRow = {
    id: string;
    name: string | null;
} | null;

type TournamentRow = {
    name: string | null;
    sport_id: string | null;
} | null;

type MatchScore = {
    home?: number | null;
    away?: number | null;
} | null;

type DbH2HMatchRow = {
    id: string;
    date_time: string | null;
    status: string | null;
    score: MatchScore;
    sport_id: string | null;
    home_club_id: string | null;
    away_club_id: string | null;
    home: ClubSideRow;
    away: ClubSideRow;
    tournament: TournamentRow;
};

type ClubDerivativeIncoming = {
    base_club_id: string;
};

type ClubDerivativeOutgoing = {
    derived_club_id: string;
};

type ClubDerivativesClient = {
    from(table: 'club_derivatives'): {
        select(columns: 'base_club_id'): {
            eq(column: 'derived_club_id', value: string): {
                maybeSingle(): Promise<{ data: ClubDerivativeIncoming | null }>;
            };
        };
        select(columns: 'derived_club_id'): {
            eq(column: 'base_club_id', value: string): Promise<{ data: ClubDerivativeOutgoing[] | null }>;
        };
    };
};

function looksOpaqueSportId(value: string | null) {
    if (!value) return false;
    const normalized = value.trim().toLowerCase();
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalized);
}

async function resolveClubFamilyIds(supabase: Awaited<ReturnType<typeof createClient>>, clubId: string) {
    const familyIds = new Set<string>([clubId]);
    let baseClubId = clubId;

    try {
        const derivativesClient = supabase as unknown as ClubDerivativesClient;
        const { data: incoming } = await derivativesClient
            .from('club_derivatives')
            .select('base_club_id')
            .eq('derived_club_id', clubId)
            .maybeSingle();

        baseClubId = incoming?.base_club_id || clubId;
        familyIds.add(baseClubId);

        const { data: outgoing } = await derivativesClient
            .from('club_derivatives')
            .select('derived_club_id')
            .eq('base_club_id', baseClubId);

        (Array.isArray(outgoing) ? outgoing : []).forEach((row) => {
            if (row?.derived_club_id) familyIds.add(row.derived_club_id);
        });
    } catch {
        // Fall back to the original club id when derivative data is unavailable.
    }

    return Array.from(familyIds);
}

function mergeMatchRows(...rowGroups: Array<DbH2HMatchRow[] | null | undefined>) {
    const rowsById = new Map<string, DbH2HMatchRow>();

    for (const group of rowGroups) {
        for (const row of group ?? []) {
            if (row?.id && !rowsById.has(row.id)) {
                rowsById.set(row.id, row);
            }
        }
    }

    return Array.from(rowsById.values()).sort((left, right) => {
        const leftTime = left.date_time ? new Date(left.date_time).getTime() : 0;
        const rightTime = right.date_time ? new Date(right.date_time).getTime() : 0;
        return rightTime - leftTime;
    });
}

// El escudo NO viaja en la consulta: se arma por proxy desde el id y el nombre.
// `resolveSerializableLogoUrl` no sirve acá porque devuelve null cuando no hay
// valor crudo — y al sacar `logo_url` del select no lo hay. `buildTeamLogoProxyUrl`
// construye la URL con la clave, que es lo que el proxy necesita.
function serializeClubLogo(input: {
    id?: string | null;
    name?: string | null;
}) {
    return buildTeamLogoProxyUrl({
        key: input.id ?? null,
        name: input.name ?? null,
    }) ?? '';
}

// GET /api/db/h2h?home=<clubId>&away=<clubId>
// Returns recent matches involving either club (for form columns) and
// direct head-to-head matches, mapped to the FlashScore H2H format used
// by the match detail page.
export async function GET(req: NextRequest) {
    const homeId = req.nextUrl.searchParams.get('home');
    const awayId = req.nextUrl.searchParams.get('away');
    const sportParam = req.nextUrl.searchParams.get('sport');
    const requestedSport = canonicalizeSportId(sportParam);

    if (!homeId || !awayId) {
        return NextResponse.json({ error: 'home and away params required' }, { status: 400 });
    }

    const supabase = await createClient();
    const [homeFamilyIds, awayFamilyIds] = await Promise.all([
        resolveClubFamilyIds(supabase, homeId),
        resolveClubFamilyIds(supabase, awayId),
    ]);
    // Idem para la forma: los ultimos partidos del club son los del club.
    const relevantClubIds = Array.from(new Set([homeId, awayId]));
    const homeFamilySet = new Set(homeFamilyIds);
    const awayFamilySet = new Set(awayFamilyIds);

    // Sin `logo_url`. Muchos clubes guardan el escudo en base64 y embeberlo por
    // fila hace que la consulta muera con `57014: canceling statement due to
    // statement timeout` — el 500 que dejaba la pestana H2H rota. El escudo se
    // arma por proxy desde el id y el nombre, como en el resto del producto.
    const matchSelect = `
            id, date_time, status, score, sport_id,
            home_club_id, away_club_id,
            home:clubs!matches_home_club_id_fkey(id, name),
            away:clubs!matches_away_club_id_fkey(id, name),
            tournament:tournament_id(name, sport_id)
        `;
    const queryLimit = requestedSport ? 100 : 30;

    // Los enfrentamientos directos se PIDEN, no se pescan.
    //
    // Antes salian de recortar los 30 partidos mas recientes de ambos clubes, asi
    // que si los dos venian de jugar seguido contra otros, el frente a frente
    // mostraba uno solo —o ninguno—. Esta consulta los busca por lo que son, con
    // las dos orientaciones (cada club pudo ser local o visitante).
    // Y se piden con los DOS clubes del partido, no con sus familias.
    //
    // `resolveClubFamilyIds` expande a las filiales, y con eso el historial de
    // San Isidro vs Champagnat se llenaba de "SIC M17 B vs Champagnat M17 B".
    // Una filial es otro equipo: el historial de este partido es el de estos
    // dos clubes. Es la misma regla que ya rige para los rivales de un club.
    const quote = (ids: string[]) => ids.map((id) => `"${id.replace(/"/g, '')}"`).join(',');
    const directFilter =
        `and(home_club_id.in.(${quote([homeId])}),away_club_id.in.(${quote([awayId])})),` +
        `and(home_club_id.in.(${quote([awayId])}),away_club_id.in.(${quote([homeId])}))`;

    // Fetch both sides separately so Postgres can use home/away club indexes.
    const [homeMatchesResult, awayMatchesResult, directMatchesResult] = await Promise.all([
        supabase
            .from('matches')
            .select(matchSelect)
            .in('home_club_id', relevantClubIds)
            .in('status', [...FINAL_STATUSES])
            .order('date_time', { ascending: false })
            .limit(queryLimit),
        supabase
            .from('matches')
            .select(matchSelect)
            .in('away_club_id', relevantClubIds)
            .in('status', [...FINAL_STATUSES])
            .order('date_time', { ascending: false })
            .limit(queryLimit),
        supabase
            .from('matches')
            .select(matchSelect)
            .or(directFilter)
            .in('status', [...FINAL_STATUSES])
            .order('date_time', { ascending: false })
            // El historial entre dos clubes es TODO el historial, no una
            // muestra: el balance que se muestra arriba se cuenta sobre esto.
            // Es una consulta chica y por indice, asi que el tope es generoso.
            .limit(200),
    ]);

    // Un fallo en la consulta de directos no tiene por que tirar abajo la forma:
    // se degrada a lo que habia antes en vez de devolver 500.
    if (directMatchesResult.error) {
        console.error('[GET /api/db/h2h] direct query failed:', directMatchesResult.error);
    }

    const error = homeMatchesResult.error || awayMatchesResult.error;

    if (error) {
        console.error('[GET /api/db/h2h] query failed:', error);
        return NextResponse.json({ error: 'Failed to fetch H2H data' }, { status: 500 });
    }

    const baseRows = mergeMatchRows(
        homeMatchesResult.data as DbH2HMatchRow[] | null,
        awayMatchesResult.data as DbH2HMatchRow[] | null,
    );
    const shouldApplySportFilter = Boolean(requestedSport) && !looksOpaqueSportId(requestedSport);
    const filteredRows = (shouldApplySportFilter
        ? baseRows.filter((match) => {
            const matchSport = canonicalizeSportId(
                match?.sport_id ??
                match?.tournament?.sport_id ??
                null,
            );

            return !matchSport || matchSport === requestedSport;
        })
        : baseRows)
        .slice(0, 30);

    // Los directos van primero y no los recorta el tope de la forma: son la
    // columna del medio de la pestana y son lo que menos filas tiene.
    const directRows = mergeMatchRows(directMatchesResult.data as DbH2HMatchRow[] | null);
    const allRows = mergeMatchRows(directRows, filteredRows);

    const directIds = new Set(directRows.map((row) => row.id));
    const matches = allRows.map((m) => {
        const normalizedHomeId = m.home_club_id && homeFamilySet.has(m.home_club_id)
            ? homeId
            : m.home_club_id && awayFamilySet.has(m.home_club_id)
                ? awayId
                : m.home_club_id;
        const normalizedAwayId = m.away_club_id && homeFamilySet.has(m.away_club_id)
            ? homeId
            : m.away_club_id && awayFamilySet.has(m.away_club_id)
                ? awayId
                : m.away_club_id;
        // Ojo: el escudo se pide con el id REAL del club de esa fila, no con el
        // normalizado. Normalizar sirve para agrupar filiales al comparar, pero
        // si se usa como clave del escudo, un rival cualquiera termina con el
        // escudo del club de esta pagina.
        const homeLogo = serializeClubLogo({
            id: m.home?.id ?? m.home_club_id ?? normalizedHomeId,
            name: m.home?.name ?? null,
        });
        const awayLogo = serializeClubLogo({
            id: m.away?.id ?? m.away_club_id ?? normalizedAwayId,
            name: m.away?.name ?? null,
        });

        return ({
        match_id: m.id,
        timestamp: Math.floor(new Date(m.date_time).getTime() / 1000),
        status: 'finished',
        // Lo marca el servidor, que es quien sabe de que consulta salio.
        is_direct: directIds.has(m.id),
        scores: m.score ?? { home: null, away: null },
        tournament_name: m.tournament?.name ?? '',
        home_club_id: normalizedHomeId ?? null,
        away_club_id: normalizedAwayId ?? null,
        home_team: {
            name: m.home?.name ?? '',
            logo: homeLogo,
            image_path: homeLogo,
            small_image_path: homeLogo,
            id: normalizedHomeId,
            team_id: normalizedHomeId,
        },
        away_team: {
            name: m.away?.name ?? '',
            logo: awayLogo,
            image_path: awayLogo,
            small_image_path: awayLogo,
            id: normalizedAwayId,
            team_id: normalizedAwayId,
        },
        });
    });

    return NextResponse.json({ ok: true, matches });
}
