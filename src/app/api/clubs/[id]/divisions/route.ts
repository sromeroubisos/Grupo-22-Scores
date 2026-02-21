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

// ─── GET /api/clubs/:id/divisions ─────────────────────────────────────────────

export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    const supabase = await createClient();

    const { data, error } = await supabase
        .from('club_divisions')
        .select('*')
        .eq('club_id', id)
        .order('featured', { ascending: false })
        .order('name');

    if (error) return err('Error al obtener divisiones', 500, error.message);
    return NextResponse.json({ data: data ?? [] });
}

// ─── POST /api/clubs/:id/divisions ────────────────────────────────────────────

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id: clubId } = await params;
    const supabase = await createClient();

    const perm = await resolvePermission(supabase, clubId);
    if (!perm) return err('No autenticado', 401);
    if (!perm.allowed) return err('Sin permisos para crear divisiones en este club', 403);

    // Verificar que el club existe
    const { data: club } = await supabase
        .from('clubs').select('id').eq('id', clubId).single();
    if (!club) return err('Club no encontrado', 404);

    let body: Record<string, unknown>;
    try {
        body = await request.json();
    } catch {
        return err('Payload JSON inválido', 400);
    }

    const { name, sport, gender, category, status, featured, season, format, regulation, slug } = body as Record<string, string>;

    if (!name || name.trim().length < 1) {
        return err('El nombre de la división es requerido', 400);
    }

    const VALID_GENDERS = ['Masculino', 'Femenino', 'Mixto'];
    const VALID_STATUSES = ['active', 'draft', 'archived'];

    if (gender && !VALID_GENDERS.includes(gender)) {
        return err('Rama inválida', 400, { allowed: VALID_GENDERS });
    }
    if (status && !VALID_STATUSES.includes(status)) {
        return err('Estado inválido', 400, { allowed: VALID_STATUSES });
    }

    const payload = {
        club_id: clubId,
        name: name.trim(),
        slug: slug || name.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''),
        sport: sport || null,
        gender: gender || null,
        category: category || null,
        status: status || 'active',
        featured: featured === 'true',
        season: season || '2026',
        format: format || null,
        regulation: regulation || null,
    };

    const { data, error } = await supabase
        .from('club_divisions')
        .insert([payload])
        .select('*')
        .single();

    if (error) {
        // Unique constraint (club_id, name)
        if (error.code === '23505') {
            return NextResponse.json(
                { error: 'Ya existe una división con ese nombre en este club', details: { name } },
                { status: 409 }
            );
        }
        return err('Error al crear división', 500, error.message);
    }

    return NextResponse.json({ data }, { status: 201 });
}

// ─── DELETE /api/clubs/:id/divisions?division_id=:div_id ─────────────────────

export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id: clubId } = await params;
    const { searchParams } = new URL(request.url);
    const divisionId = searchParams.get('division_id');

    if (!divisionId) return err('division_id es requerido', 400);

    const supabase = await createClient();
    const perm = await resolvePermission(supabase, clubId);
    if (!perm) return err('No autenticado', 401);
    if (!perm.allowed) return err('Sin permisos', 403);

    const { error } = await supabase
        .from('club_divisions')
        .delete()
        .eq('id', divisionId)
        .eq('club_id', clubId);

    if (error) return err('Error al eliminar división', 500, error.message);
    return NextResponse.json({ success: true });
}
