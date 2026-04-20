import { NextRequest, NextResponse } from 'next/server';
import { canManageClubContext, getClubManagementTarget, requireUserAccessContext } from '@/lib/auth/permissions';
import { EDIT_MEMBERSHIP_ROLES } from '@/lib/auth/roles';
import { createClient } from '@/lib/supabase/server';
import { normalizeSlug } from '@/lib/utils/normalize';

function err(message: string, status: number, details?: unknown) {
    return NextResponse.json({ error: message, details: details ?? null }, { status });
}

async function resolvePermission(
    supabase: Awaited<ReturnType<typeof createClient>>,
    clubId: string
): Promise<{ userId: string; allowed: boolean } | null> {
    const context = await requireUserAccessContext(supabase).catch(() => null);
    if (!context) return null;

    const target = await getClubManagementTarget(supabase, clubId);

    return {
        userId: context.userId,
        allowed: Boolean(target && canManageClubContext(context, target, EDIT_MEMBERSHIP_ROLES)),
    };
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
        'slug', 'is_visible', 'categories',
    ];

    const updates: Record<string, unknown> = {};
    for (const field of ALLOWED_FIELDS) {
        if (field in body) updates[field] = body[field];
    }

    if (Object.keys(updates).length === 0) {
        return err('No se enviaron campos para actualizar', 400);
    }

    const nullableTextFields = ['short_name', 'city', 'region', 'country', 'logo_url', 'primary_color', 'sport', 'union_id'];
    for (const field of nullableTextFields) {
        if (typeof updates[field] === 'string' && !String(updates[field]).trim()) {
            updates[field] = null;
        }
    }

    if ('name' in updates && typeof updates.name === 'string') {
        updates.name = updates.name.trim();
        if (!updates.name) {
            return err('El nombre del club es obligatorio', 400);
        }
    }

    if ('slug' in updates) {
        const normalized = typeof updates.slug === 'string' ? normalizeSlug(updates.slug) : null;
        if (!normalized) {
            return err('El slug no puede estar vacío', 400);
        }
        updates.slug = normalized;
    }

    if ('categories' in updates) {
        if (Array.isArray(updates.categories)) {
            updates.categories = updates.categories
                .map((value) => typeof value === 'string' ? value.trim() : '')
                .filter(Boolean);
        } else if (updates.categories !== null && updates.categories !== undefined) {
            return err('Las categorias deben ser un arreglo de texto', 400);
        }
    }

    const { data, error } = await supabase
        .from('clubs')
        .update(updates)
        .eq('id', id)
        .select('*')
        .single();

    if (error?.code === '23505' && error.message.includes('slug')) {
        return err('El slug ya está en uso. Elegí uno diferente.', 409);
    }
    if (error) return err('Error al actualizar club', 500, error.message);
    return NextResponse.json({ data });
}

export async function DELETE(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    const supabase = await createClient();

    const perm = await resolvePermission(supabase, id);
    if (!perm) return err('No autenticado', 401);
    if (!perm.allowed) return err('Sin permisos para eliminar este club', 403);

    const { error } = await supabase
        .from('clubs')
        .delete()
        .eq('id', id);

    if (error) return err('Error al eliminar club', 500, error.message);
    return NextResponse.json({ success: true });
}
