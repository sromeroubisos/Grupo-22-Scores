import { NextRequest, NextResponse } from 'next/server';
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

    // Auth
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return err('No autenticado', 401);

    const { data: profile } = await supabase
        .from('users').select('role').eq('id', user.id).single();

    const isSuperAdmin = profile?.role === 'super_admin';
    if (!isSuperAdmin) {
        const { data: club } = await supabase
            .from('clubs').select('union_id').eq('id', id).single();

        const { data: membership } = await supabase
            .from('memberships')
            .select('role')
            .eq('user_id', user.id)
            .or(`and(scope_type.eq.club,scope_id.eq.${id}),and(scope_type.eq.union,scope_id.eq.${club?.union_id ?? 'none'})`)
            .in('role', ['admin'])
            .maybeSingle();

        if (!membership) return err('Sin permisos para publicar este club', 403);
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

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return err('No autenticado', 401);

    const { data: profile } = await supabase
        .from('users').select('role').eq('id', user.id).single();

    if (profile?.role !== 'super_admin') return err('Solo super admin puede despublicar', 403);

    const { data, error } = await supabase
        .from('clubs')
        .update({ is_visible: false, status: 'draft' })
        .eq('id', id)
        .select('id, name, status')
        .single();

    if (error) return NextResponse.json({ error: 'Error al despublicar', details: error.message }, { status: 500 });

    return NextResponse.json({ data });
}
