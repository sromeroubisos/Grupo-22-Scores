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

export async function GET(request: NextRequest) {
    try {
        await requireExactSuperAdmin();
    } catch (error) {
        return jsonError(error instanceof Error ? error.message : 'Unauthorized', getStatusCode(error));
    }

    try {
        const readClient = await getReadClient();
        const requestedSport = canonicalizeSportId(new URL(request.url).searchParams.get('sport'));

        const [{ data: clubs, error: clubsError }, { data: aliases, error: aliasesError }] = await Promise.all([
            readClient
                .from('clubs')
                .select('id, name, short_name, logo_url, sport, sport_id')
                .order('name'),
            readClient
                .from('club_aliases')
                .select('club_id, alias'),
        ]);

        if (clubsError) {
            return jsonError('No se pudo cargar el catalogo de clubes.', 500, clubsError.message);
        }

        if (aliasesError) {
            return jsonError('No se pudieron cargar los aliases de clubes.', 500, aliasesError.message);
        }

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
