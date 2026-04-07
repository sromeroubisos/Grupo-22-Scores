import { NextRequest, NextResponse } from 'next/server';
import { requireGlobalAdminContext } from '@/lib/auth/permissions';
import { createClient } from '@/lib/supabase/server';
import { getReadClient } from '@/lib/supabase/read';
import { isMissingTableError } from '@/lib/utils/supabaseSchema';

type ClubDerivativeRelationRow = {
    base_club_id: string;
    derived_club_id: string;
    derivative_type: string | null;
};

type QueryError = {
    code?: string | null;
    message?: string | null;
    details?: string | null;
} | null;

const ALLOWED_DERIVATIVE_TYPES = new Set(['youth', 'women', 'other_sport']);

function jsonError(message: string, status = 500, details?: unknown) {
    return NextResponse.json({ error: message, details: details ?? null }, { status });
}

export async function GET() {
    try {
        const authClient = await createClient();
        await requireGlobalAdminContext(authClient);
    } catch {
        return jsonError('Unauthorized', 401);
    }

    try {
        const readClient = await getReadClient();
        const { data, error } = await readClient
            .from('club_derivatives')
            .select('base_club_id, derived_club_id, derivative_type')
            .order('base_club_id', { ascending: true }) as {
                data: ClubDerivativeRelationRow[] | null;
                error: QueryError;
            };

        if (error) {
            if (isMissingTableError(error, 'club_derivatives')) {
                return NextResponse.json({ data: [] });
            }

            return jsonError('Failed to load club families', 500, error.message || error.details || null);
        }

        return NextResponse.json({ data: Array.isArray(data) ? data : [] });
    } catch (error) {
        return jsonError('Failed to load club families', 500, error instanceof Error ? error.message : String(error));
    }
}

export async function POST(request: NextRequest) {
    let authClient: Awaited<ReturnType<typeof createClient>>;

    try {
        authClient = await createClient();
        await requireGlobalAdminContext(authClient);
    } catch {
        return jsonError('Unauthorized', 401);
    }

    try {
        const body = await request.json().catch(() => null) as {
            baseClubId?: unknown;
            derivedClubIds?: unknown;
            derivativeType?: unknown;
        } | null;

        const baseClubId = typeof body?.baseClubId === 'string' ? body.baseClubId : '';
        const derivedClubIds = Array.isArray(body?.derivedClubIds)
            ? body.derivedClubIds.filter((id): id is string => typeof id === 'string' && id.length > 0)
            : [];
        const derivativeType = typeof body?.derivativeType === 'string' && ALLOWED_DERIVATIVE_TYPES.has(body.derivativeType)
            ? body.derivativeType
            : 'youth';

        const uniqueDerivedClubIds = Array.from(new Set(derivedClubIds)).filter((id) => id !== baseClubId);

        if (!baseClubId || uniqueDerivedClubIds.length === 0) {
            return jsonError('Select a base club and at least one related club', 400);
        }

        const { error } = await authClient
            .from('club_derivatives')
            .upsert(
                uniqueDerivedClubIds.map((derivedClubId) => ({
                    base_club_id: baseClubId,
                    derived_club_id: derivedClubId,
                    derivative_type: derivativeType,
                })),
                { onConflict: 'base_club_id,derived_club_id' },
            );

        if (error) {
            if (isMissingTableError(error, 'club_derivatives')) {
                return jsonError('club_derivatives table is not available', 409, error.message || error.details || null);
            }

            return jsonError('Failed to create club family', 500, error.message || error.details || null);
        }

        return NextResponse.json({ ok: true });
    } catch (error) {
        return jsonError('Failed to create club family', 500, error instanceof Error ? error.message : String(error));
    }
}
