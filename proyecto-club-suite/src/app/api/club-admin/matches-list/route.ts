import { NextRequest, NextResponse } from 'next/server';
import {
    ACCESS_VIEW_ROLE_SET,
    canManageClubContext,
    getClubManagementTarget,
    requireUserAccessContext,
} from '@/lib/auth/permissions';
import { fetchClubMatchesPaginated, type MatchStatusFilter } from '@/lib/club-admin/clubMatches';
import { createClient } from '@/lib/supabase/server';

function err(message: string, status: number) {
    return NextResponse.json({ ok: false, error: message }, { status });
}

export async function GET(request: NextRequest) {
    try {
        const { searchParams } = request.nextUrl;
        const clubId = searchParams.get('club');
        const statusFilter = (searchParams.get('status') ?? 'all') as MatchStatusFilter;
        const cursor = searchParams.get('cursor');
        const limit = parseInt(searchParams.get('limit') ?? '25', 10);
        const direction = (searchParams.get('direction') ?? 'desc') as 'asc' | 'desc';

        if (!clubId) {
            return err('club param required', 400);
        }

        const supabase = await createClient();
        const context = await requireUserAccessContext(supabase).catch(() => null);
        if (!context) {
            return err('No autenticado', 401);
        }

        const target = await getClubManagementTarget(supabase, clubId);
        if (!target) {
            return err('Club no encontrado', 404);
        }

        if (!canManageClubContext(context, target, ACCESS_VIEW_ROLE_SET)) {
            return err('Sin permisos para ver este club', 403);
        }

        const page = await fetchClubMatchesPaginated(supabase, clubId, {
            statusFilter,
            cursor: cursor || null,
            limit: Number.isFinite(limit) ? limit : 25,
            direction,
        });

        return NextResponse.json({ ok: true, data: page });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Error al cargar partidos';
        console.error('[api/club-admin/matches-list]', error);
        return err(message, 500);
    }
}
