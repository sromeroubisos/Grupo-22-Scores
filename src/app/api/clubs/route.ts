import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// ─── helpers ────────────────────────────────────────────────────────────────

function err(message: string, status: number, details?: unknown) {
    return NextResponse.json({ error: message, details: details ?? null }, { status });
}

function slugify(value: string): string {
    return value
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 60);
}

async function getAuthenticatedUser(supabase: Awaited<ReturnType<typeof createClient>>) {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) return null;
    return user;
}

async function canCreateClub(
    supabase: Awaited<ReturnType<typeof createClient>>,
    userId: string,
    unionId: string
): Promise<boolean> {
    const { data: profile } = await supabase
        .from('users')
        .select('role')
        .eq('id', userId)
        .single();

    if (profile?.role === 'super_admin') return true;

    const { data: membership } = await supabase
        .from('memberships')
        .select('role')
        .eq('user_id', userId)
        .eq('scope_type', 'union')
        .eq('scope_id', unionId)
        .in('role', ['admin', 'editor'])
        .maybeSingle();

    return Boolean(membership);
}

// ─── POST /api/clubs ─────────────────────────────────────────────────────────
// Crea club mínimo (status=draft, is_visible=false).
// Retorna { id, slug } en ~150ms.

export async function POST(request: NextRequest) {
    const supabase = await createClient();

    const authUser = await getAuthenticatedUser(supabase);
    if (!authUser) return err('No autenticado', 401);

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return err('Payload JSON inválido', 400);
    }

    const { name, sport, union_id, slug: rawSlug } = body as Record<string, string>;

    // Validaciones
    if (!name || name.trim().length < 2) {
        return err('El nombre del club debe tener al menos 2 caracteres', 400);
    }
    if (!union_id) {
        return err('union_id es requerido', 400);
    }

    // Autorización
    const allowed = await canCreateClub(supabase, authUser.id, union_id);
    if (!allowed) return err('Sin permisos para crear clubes en esta unión', 403);

    const slug = rawSlug ? slugify(rawSlug) : slugify(name);
    if (!slug) return err('El slug generado es inválido', 400);

    // Verificar unicidad del slug
    const { data: existing } = await supabase
        .from('clubs')
        .select('id')
        .eq('id', slug)
        .maybeSingle();

    if (existing) {
        return NextResponse.json(
            { error: 'El slug ya está en uso. Elegí un nombre diferente.', details: { slug } },
            { status: 409 }
        );
    }

    const payload = {
        id: slug,          // TEXT PK = slug
        slug,
        name: name.trim(),
        sport: sport || 'rugby',
        union_id,
        status: 'draft',
        is_visible: false,
    };

    const { data, error } = await supabase
        .from('clubs')
        .insert([payload])
        .select('id, slug, name, status')
        .single();

    if (error) {
        // Conflict por constraint (race condition en slug)
        if (error.code === '23505') {
            return NextResponse.json(
                { error: 'El slug ya está en uso', details: { slug } },
                { status: 409 }
            );
        }
        return err('Error al crear club', 500, error.message);
    }

    return NextResponse.json({ data }, { status: 201 });
}

// ─── GET /api/clubs ──────────────────────────────────────────────────────────
// Lista pública (solo clubes visibles). Super admin ve todos.

export async function GET(request: NextRequest) {
    const supabase = await createClient();
    const { searchParams } = new URL(request.url);
    const unionId = searchParams.get('union_id');
    const sport   = searchParams.get('sport');

    const authUser = await getAuthenticatedUser(supabase);
    let isSuperAdmin = false;

    if (authUser) {
        const { data: profile } = await supabase
            .from('users')
            .select('role')
            .eq('id', authUser.id)
            .single();
        isSuperAdmin = profile?.role === 'super_admin';
    }

    let query = supabase.from('clubs').select('*').order('name');

    if (!isSuperAdmin) {
        query = query.eq('is_visible', true);
    }
    if (unionId) query = query.eq('union_id', unionId);

    const { data, error } = await query;
    if (error) return err('Error al obtener clubes', 500, error.message);

    return NextResponse.json({ data });
}
