import { NextRequest, NextResponse } from 'next/server';
import { canManageClubContext, getClubManagementTarget, requireUserAccessContext } from '@/lib/auth/permissions';
import { VIEW_MEMBERSHIP_ROLES } from '@/lib/auth/roles';
import { getClubFamilySummary } from '@/lib/club-admin/managedClubFamily';
import { createClient } from '@/lib/supabase/server';

function err(message: string, status: number) {
    return NextResponse.json({ error: message }, { status });
}

export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    const supabase = await createClient();
    const context = await requireUserAccessContext(supabase).catch(() => null);

    if (!context) {
        return err('No autenticado', 401);
    }

    const target = await getClubManagementTarget(supabase, id);
    if (!target) {
        return err('Club no encontrado', 404);
    }

    if (!canManageClubContext(context, target, VIEW_MEMBERSHIP_ROLES)) {
        return err('Sin permisos para ver esta familia de club', 403);
    }

    const data = await getClubFamilySummary(supabase as never, id);
    return NextResponse.json({ data });
}
