import { NextRequest, NextResponse } from 'next/server';
import {
    ACCESS_VIEW_ROLE_SET,
    canManageClubContext,
    getClubManagementTarget,
    requireUserAccessContext,
} from '@/lib/auth/permissions';
import { getClubDashboardOverview } from '@/lib/club-admin/dashboard';
import { EMPTY_CLUB_DASHBOARD_OVERVIEW } from '@/lib/club-admin/dashboard-types';
import { createClient } from '@/lib/supabase/server';
import { getReadClient } from '@/lib/supabase/read';

function err(message: string, status: number) {
    return NextResponse.json({ ok: false, error: message }, { status });
}

export async function GET(request: NextRequest) {
    try {
        const clubId = request.nextUrl.searchParams.get('club');
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

        const readClient = await getReadClient();
        const data = await getClubDashboardOverview(readClient as never, clubId).catch((error) => {
            console.error('[club-admin/dashboard] Falling back to empty overview:', error);
            return EMPTY_CLUB_DASHBOARD_OVERVIEW;
        });

        return NextResponse.json({
            ok: true,
            data,
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'No se pudo cargar el dashboard del club';
        return err(message, 500);
    }
}
