import { NextResponse } from 'next/server';
import { requireAdminApiUser } from '@/lib/auth/apiAdmin';
import { getReadClient } from '@/lib/supabase/read';

const QUERY_TIMEOUT_MS = 8_000;

type QueryError = {
    code?: string | null;
    message?: string | null;
    details?: string | null;
} | null;

type TopClubRow = {
    id: string;
    name: string;
    logo_url?: string | null;
    primary_color?: string | null;
};

function jsonError(message: string, status = 500, details?: unknown) {
    return NextResponse.json({ error: message, details: details ?? null }, { status });
}

async function withSoftTimeout<T>(
    promise: PromiseLike<T>,
    ms: number,
    fallback: T,
) {
    let settled = false;

    return new Promise<T>((resolve, reject) => {
        const timeoutId = setTimeout(() => {
            if (settled) return;
            settled = true;
            resolve(fallback);
        }, ms);

        Promise.resolve(promise)
            .then((value) => {
                if (settled) return;
                settled = true;
                clearTimeout(timeoutId);
                resolve(value);
            })
            .catch((error) => {
                if (settled) return;
                settled = true;
                clearTimeout(timeoutId);
                reject(error);
            });
    });
}

export async function GET() {
    try {
        await requireAdminApiUser();
    } catch {
        return jsonError('Unauthorized', 401);
    }

    try {
        const readClient = await getReadClient();
        const favoritesResult = await withSoftTimeout(
            readClient
                .from('favorites')
                .select('entity_id')
                .eq('entity_type', 'club') as PromiseLike<{
                    data: { entity_id: string }[] | null;
                    error: QueryError;
                }>,
            QUERY_TIMEOUT_MS,
            { data: [] as { entity_id: string }[], error: null },
        );

        if (favoritesResult.error) {
            return jsonError('Failed to load top clubs', 500, favoritesResult.error.message);
        }

        const clubCounts = new Map<string, number>();
        for (const row of favoritesResult.data ?? []) {
            clubCounts.set(row.entity_id, (clubCounts.get(row.entity_id) ?? 0) + 1);
        }

        const topEntries = Array.from(clubCounts.entries())
            .sort((left, right) => right[1] - left[1])
            .slice(0, 10);

        if (topEntries.length === 0) {
            return NextResponse.json({ data: [] });
        }

        const clubIds = topEntries.map(([clubId]) => clubId);
        const { data: clubs, error } = await withSoftTimeout(
            readClient
                .from('clubs')
                .select('id, name, logo_url, primary_color')
                .in('id', clubIds) as PromiseLike<{
                    data: TopClubRow[] | null;
                    error: QueryError;
                }>,
            QUERY_TIMEOUT_MS,
            { data: [] as TopClubRow[], error: null },
        );

        if (error) {
            return jsonError('Failed to load top club details', 500, error.message);
        }

        const clubMap = new Map((clubs ?? []).map((club) => [club.id, club]));
        const data = topEntries
            .map(([clubId, followersCount]) => {
                const club = clubMap.get(clubId);
                if (!club) return null;

                return {
                    id: club.id,
                    name: club.name,
                    logo_url: club.logo_url ?? null,
                    primary_color: club.primary_color ?? null,
                    followers_count: followersCount,
                };
            })
            .filter((club): club is NonNullable<typeof club> => Boolean(club));

        return NextResponse.json({ data });
    } catch (error) {
        return jsonError('Failed to load top clubs', 500, error instanceof Error ? error.message : String(error));
    }
}
