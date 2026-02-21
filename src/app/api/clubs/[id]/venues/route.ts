import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

function err(message: string, status: number, details?: unknown) {
    return NextResponse.json({ error: message, details: details ?? null }, { status });
}

async function resolvePermission(
    supabase: Awaited<ReturnType<typeof createClient>>,
    clubId: string
): Promise<{ allowed: boolean } | null> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const { data: profile } = await supabase
        .from('users').select('role').eq('id', user.id).single();

    if (profile?.role === 'super_admin') return { allowed: true };

    const { data: club } = await supabase
        .from('clubs').select('union_id').eq('id', clubId).single();

    const unionId = club?.union_id;
    const filter = unionId
        ? `and(scope_type.eq.club,scope_id.eq.${clubId}),and(scope_type.eq.union,scope_id.eq.${unionId})`
        : `and(scope_type.eq.club,scope_id.eq.${clubId})`;

    const { data: membership } = await supabase
        .from('memberships')
        .select('role')
        .eq('user_id', user.id)
        .or(filter)
        .in('role', ['admin', 'editor'])
        .maybeSingle();

    return { allowed: Boolean(membership) };
}

// ─── GET /api/clubs/:id/venues ────────────────────────────────────────────────

export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    const supabase = await createClient();

    const { data, error } = await supabase
        .from('club_venues')
        .select('*')
        .eq('club_id', id)
        .order('is_primary', { ascending: false })
        .order('name');

    if (error) return err('Error al obtener sedes', 500, error.message);
    return NextResponse.json({ data: data ?? [] });
}

// ─── POST /api/clubs/:id/venues ───────────────────────────────────────────────

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id: clubId } = await params;
    const supabase = await createClient();

    const perm = await resolvePermission(supabase, clubId);
    if (!perm)         return err('No autenticado', 401);
    if (!perm.allowed) return err('Sin permisos para agregar sedes', 403);

    const { data: club } = await supabase
        .from('clubs').select('id').eq('id', clubId).single();
    if (!club) return err('Club no encontrado', 404);

    let body: Record<string, unknown>;
    try {
        body = await request.json();
    } catch {
        return err('Payload JSON inválido', 400);
    }

    const { name, address, city, maps_link, is_primary } = body as Record<string, unknown>;

    if (!name || String(name).trim().length < 1) {
        return err('El nombre de la sede es requerido', 400);
    }

    // Si se marca como principal, desmarcar las existentes
    if (is_primary) {
        await supabase
            .from('club_venues')
            .update({ is_primary: false })
            .eq('club_id', clubId);
    }

    const payload = {
        club_id:    clubId,
        name:       String(name).trim(),
        address:    address ? String(address) : null,
        city:       city    ? String(city)    : null,
        maps_link:  maps_link ? String(maps_link) : null,
        is_primary: Boolean(is_primary),
    };

    const { data, error } = await supabase
        .from('club_venues')
        .insert([payload])
        .select('*')
        .single();

    if (error) return err('Error al crear sede', 500, error.message);
    return NextResponse.json({ data }, { status: 201 });
}

// ─── DELETE /api/clubs/:id/venues?venue_id=:v_id ──────────────────────────────

export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id: clubId } = await params;
    const { searchParams } = new URL(request.url);
    const venueId = searchParams.get('venue_id');

    if (!venueId) return err('venue_id es requerido', 400);

    const supabase = await createClient();
    const perm = await resolvePermission(supabase, clubId);
    if (!perm)         return err('No autenticado', 401);
    if (!perm.allowed) return err('Sin permisos', 403);

    const { error } = await supabase
        .from('club_venues')
        .delete()
        .eq('id', venueId)
        .eq('club_id', clubId);

    if (error) return err('Error al eliminar sede', 500, error.message);
    return NextResponse.json({ success: true });
}
