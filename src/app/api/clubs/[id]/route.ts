import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

function err(message: string, status: number, details?: unknown) {
    return NextResponse.json({ error: message, details: details ?? null }, { status });
}

async function resolvePermission(
    supabase: Awaited<ReturnType<typeof createClient>>,
    clubId: string
): Promise<{ userId: string; allowed: boolean } | null> {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) return null;

    const { data: profile } = await supabase
        .from('users')
        .select('role')
        .eq('id', user.id)
        .single();

    if (profile?.role === 'super_admin') return { userId: user.id, allowed: true };

    // Check membership para union del club
    const { data: club } = await supabase
        .from('clubs')
        .select('union_id')
        .eq('id', clubId)
        .single();

    const unionId = club?.union_id;

    const { data: membership } = await supabase
        .from('memberships')
        .select('role')
        .eq('user_id', user.id)
        .or(
            `and(scope_type.eq.club,scope_id.eq.${clubId}),` +
            (unionId ? `and(scope_type.eq.union,scope_id.eq.${unionId})` : 'scope_type.eq.club')
        )
        .in('role', ['admin', 'editor'])
        .maybeSingle();

    return { userId: user.id, allowed: Boolean(membership) };
}

// ─── GET /api/clubs/:id ───────────────────────────────────────────────────────

export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    const supabase = await createClient();

    const { data, error } = await supabase
        .from('clubs')
        .select('*')
        .eq('id', id)
        .single();

    if (error || !data) return err('Club no encontrado', 404);
    return NextResponse.json({ data });
}

// ─── PATCH /api/clubs/:id ─────────────────────────────────────────────────────
// Actualización parcial. Campos permitidos: name, short_name, city, region,
// country, logo_url, primary_color, sport, union_id, is_visible, website, etc.

export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    const supabase = await createClient();

    const perm = await resolvePermission(supabase, id);
    if (!perm)          return err('No autenticado', 401);
    if (!perm.allowed)  return err('Sin permisos para editar este club', 403);

    let body: Record<string, unknown>;
    try {
        body = await request.json();
    } catch {
        return err('Payload JSON inválido', 400);
    }

    // Whitelist de campos editables (no slug/id/status via este endpoint)
    const ALLOWED_FIELDS = [
        'name', 'short_name', 'city', 'region', 'country',
        'logo_url', 'primary_color', 'sport', 'union_id',
        'website', 'instagram', 'twitter',
    ];

    const updates: Record<string, unknown> = {};
    for (const field of ALLOWED_FIELDS) {
        if (field in body) updates[field] = body[field];
    }

    if (Object.keys(updates).length === 0) {
        return err('No se enviaron campos para actualizar', 400);
    }

    const { data, error } = await supabase
        .from('clubs')
        .update(updates)
        .eq('id', id)
        .select('*')
        .single();

    if (error) return err('Error al actualizar club', 500, error.message);
    return NextResponse.json({ data });
}
