import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/server';
import { isGlobalAdminRole } from '@/lib/auth/roles';
import { canonicalizeSportId } from '@/lib/clubDerivatives';
import { getReadClient } from '@/lib/supabase/read';

type ClubRow = {
    id: string;
    name: string;
    short_name?: string | null;
    logo_url?: string | null;
    sport?: string | null;
    sport_id?: string | null;
};

type ClubAliasRow = {
    club_id: string;
    alias: string;
};

function jsonError(message: string, status = 500, details?: unknown) {
    return NextResponse.json({ error: message, details: details ?? null }, { status });
}

async function requireExactSuperAdmin() {
    const user = await getCurrentUser();

    if (!user) {
        throw new Error('Unauthorized');
    }

    if (!isGlobalAdminRole(user.role)) {
        throw new Error('Forbidden: Super admin access required');
    }

    return user;
}

function getStatusCode(error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal Server Error';
    if (message === 'Unauthorized') return 401;
    if (message.includes('Forbidden')) return 403;
    return 500;
}

// PostgREST corta cada request en 1000 filas (db_max_rows). Este catalogo trae
// TODOS los clubes de todos los deportes y filtra por deporte en memoria, asi
// que sin paginar la lista alfabetica moria cerca de la "J" y el alta manual
// no veia el resto. Se pagina cortando cuando llega una pagina incompleta; el
// orden lleva desempate por PK para que ninguna fila se repita ni se saltee.
const CATALOG_PAGE_SIZE = 1000;

async function fetchAllRows<T>(
    fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<{ rows: T[]; error: string | null }> {
    const rows: T[] = [];
    for (let from = 0; ; from += CATALOG_PAGE_SIZE) {
        const { data, error } = await fetchPage(from, from + CATALOG_PAGE_SIZE - 1);
        if (error) return { rows: [], error: error.message };
        const page = data ?? [];
        rows.push(...page);
        if (page.length < CATALOG_PAGE_SIZE) return { rows, error: null };
    }
}

export async function GET(request: NextRequest) {
    try {
        await requireExactSuperAdmin();
    } catch (error) {
        return jsonError(error instanceof Error ? error.message : 'Unauthorized', getStatusCode(error));
    }

    try {
        const readClient = await getReadClient();
        const requestedSport = canonicalizeSportId(new URL(request.url).searchParams.get('sport'));

        const [clubsResult, aliasesResult] = await Promise.all([
            fetchAllRows<ClubRow>((from, to) => readClient
                .from('clubs')
                .select('id, name, short_name, logo_url, sport, sport_id')
                .order('name')
                .order('id')
                .range(from, to)),
            fetchAllRows<ClubAliasRow>((from, to) => readClient
                .from('club_aliases')
                .select('club_id, alias')
                .order('club_id')
                .order('alias')
                .range(from, to)),
        ]);

        if (clubsResult.error) {
            return jsonError('No se pudo cargar el catalogo de clubes.', 500, clubsResult.error);
        }

        if (aliasesResult.error) {
            return jsonError('No se pudieron cargar los aliases de clubes.', 500, aliasesResult.error);
        }

        const clubs = clubsResult.rows;
        const aliases = aliasesResult.rows;

        const aliasMap = new Map<string, string[]>();
        (aliases as ClubAliasRow[] | null | undefined)?.forEach((row) => {
            const list = aliasMap.get(row.club_id) ?? [];
            list.push(row.alias);
            aliasMap.set(row.club_id, list);
        });

        const data = ((clubs as ClubRow[] | null | undefined) ?? [])
            .filter((club) => {
                if (!requestedSport) return true;
                const clubSport = canonicalizeSportId(club.sport || club.sport_id || null);
                return clubSport === requestedSport;
            })
            .map((club) => ({
                id: club.id,
                name: club.name,
                short_name: club.short_name ?? null,
                logo_url: club.logo_url ?? null,
                sport: canonicalizeSportId(club.sport || club.sport_id || null),
                aliases: aliasMap.get(club.id) ?? [],
            }));

        return NextResponse.json({ data });
    } catch (error) {
        return jsonError(
            'No se pudo preparar el catalogo del ranking.',
            500,
            error instanceof Error ? error.message : String(error),
        );
    }
}
