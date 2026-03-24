import { NextRequest, NextResponse } from 'next/server';
import {
    canManageClubContext,
    getClubManagementTarget,
    requireGlobalAdminContext,
    requireUserAccessContext,
} from '@/lib/auth/permissions';
import { ADMIN_ONLY_MEMBERSHIP_ROLES, isGlobalAdminRole } from '@/lib/auth/roles';
import { createClient } from '@/lib/supabase/server';

function err(message: string, status: number) {
    return NextResponse.json({ error: message }, { status });
}

// ─── POST /api/clubs/:id/publish ─────────────────────────────────────────────
// Idempotente: si ya está publicado, devuelve 200 igualmente.
// Requiere: club con nombre y al menos 1 división.

export async function POST(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    const supabase = await createClient();

    const context = await requireUserAccessContext(supabase).catch(() => null);
    if (!context) return err('No autenticado', 401);

    if (!isGlobalAdminRole(context.role)) {
        const target = await getClubManagementTarget(supabase, id);
        const canPublish = Boolean(target && canManageClubContext(context, target, ADMIN_ONLY_MEMBERSHIP_ROLES));

        if (!canPublish) return err('Sin permisos para publicar este club', 403);
    }

    // Validar que tenga los requisitos mínimos
    const { data: clubData } = await supabase
        .from('clubs').select('name, status').eq('id', id).single();

    if (!clubData) return err('Club no encontrado', 404);

    const { count: divCount } = await supabase
        .from('club_divisions')
        .select('id', { count: 'exact', head: true })
        .eq('club_id', id);

    if (!clubData.name) return err('El club debe tener nombre antes de publicarse', 422);
    if (!divCount || divCount === 0) {
        return err('El club debe tener al menos una división antes de publicarse', 422);
    }

    // Idempotente: si ya está publicado, ok
    if (clubData.status === 'published') {
        return NextResponse.json({ data: { clubId: id, status: 'published', alreadyPublished: true } });
    }

    const { data, error } = await supabase
        .from('clubs')
        .update({ is_visible: true, status: 'published' })
        .eq('id', id)
        .select('id, name, status, is_visible')
        .single();

    if (error) return NextResponse.json({ error: 'Error al publicar club', details: error.message }, { status: 500 });

    return NextResponse.json({ data });
}

// ─── POST /api/clubs/:id/publish con body { action: 'unpublish' } ─────────────
// Opcionalmente también manejamos unpublish desde el mismo endpoint.

export async function DELETE(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    const supabase = await createClient();
    const isGlobalAdmin = await requireGlobalAdminContext(supabase).catch(() => null);
    if (!isGlobalAdmin) return err('Solo un administrador global puede despublicar', 403);

    const { data, error } = await supabase
        .from('clubs')
        .update({ is_visible: false, status: 'draft' })
        .eq('id', id)
        .select('id, name, status')
        .single();

    if (error) return NextResponse.json({ error: 'Error al despublicar', details: error.message }, { status: 500 });

    return NextResponse.json({ data });
}
