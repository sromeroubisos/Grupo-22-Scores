import { NextRequest, NextResponse } from 'next/server';
import { canManageClubContext, getClubManagementTarget, requireUserAccessContext } from '@/lib/auth/permissions';
import { EDIT_MEMBERSHIP_ROLES } from '@/lib/auth/roles';
import { syncClubLogoToExternalSources } from '@/lib/server/clubLogoExternalSync';
import { persistClubLogo } from '@/lib/server/persistClubLogo';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { normalizeSlug } from '@/lib/utils/normalize';
import { isMissingColumnError } from '@/lib/utils/supabaseSchema';

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

// El sitio web y las redes NO son columnas de `clubs`: viven en `club_profile`,
// una fila por club. Mandarlas en el update de `clubs` no fallaba solo ese campo,
// tumbaba el UPDATE entero (PostgREST responde PGRST204 antes de tocar nada), así
// que el panel de identidad no guardaba ni el nombre ni el escudo.
const PROFILE_FIELD_MAP: Record<string, string> = {
    website: 'website',
    instagram: 'instagram',
    twitter: 'x_url',
    x_url: 'x_url',
    youtube: 'youtube',
    tiktok: 'tiktok',
};

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

    // El perfil es opcional: si no hay fila (o la tabla no responde) el club se
    // devuelve igual, solo sin sitio web ni redes.
    const { data: profile } = await supabase
        .from('club_profile')
        .select('website, instagram, x_url, youtube, tiktok')
        .eq('club_id', id)
        .maybeSingle();

    return NextResponse.json({
        data: {
            ...data,
            website: profile?.website ?? null,
            instagram: profile?.instagram ?? null,
            twitter: profile?.x_url ?? null,
            x_url: profile?.x_url ?? null,
            youtube: profile?.youtube ?? null,
            tiktok: profile?.tiktok ?? null,
        },
    });
}

// ─── PATCH /api/clubs/:id ─────────────────────────────────────────────────────
// Actualización parcial. A `clubs` van name, short_name, city, region, country,
// logo_url, primary_color, sport, union_id, slug, is_visible y category; el sitio
// web y las redes van a `club_profile` (ver PROFILE_FIELD_MAP).

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
        'slug', 'is_visible', 'category',
    ];

    const updates: Record<string, unknown> = {};
    for (const field of ALLOWED_FIELDS) {
        if (field in body) updates[field] = body[field];
    }

    const profileUpdates: Record<string, unknown> = {};
    for (const [field, column] of Object.entries(PROFILE_FIELD_MAP)) {
        if (!(field in body)) continue;
        const value = body[field];
        profileUpdates[column] = typeof value === 'string' && !value.trim() ? null : value;
    }

    if ('categories' in body && !('category' in updates)) {
        if (Array.isArray(body.categories)) {
            const [category] = body.categories
                .map((value) => typeof value === 'string' ? value.trim() : '')
                .filter((value) => value && !value.includes(':'));
            if (category) updates.category = category;
        } else if (body.categories !== null && body.categories !== undefined) {
            return err('Las categorias deben ser un arreglo de texto', 400);
        }
    }

    if (Object.keys(updates).length === 0 && Object.keys(profileUpdates).length === 0) {
        return err('No se enviaron campos para actualizar', 400);
    }

    // Mismo puente que en /api/clubs/[id]/manage: un escudo subido como archivo
    // llega en data URI y se guarda en Storage, no dentro de la columna.
    let cachedAdminClient: ReturnType<typeof createAdminClient> | null = null;
    const adminClient = () => (cachedAdminClient ??= createAdminClient());

    let logoWarning: string | undefined;
    if ('logo_url' in updates) {
        const persisted = await persistClubLogo(id, updates.logo_url, { supabaseClient: adminClient() });
        updates.logo_url = persisted.url;
        logoWarning = persisted.warning;
    }

    const nullableTextFields = ['short_name', 'city', 'region', 'country', 'logo_url', 'primary_color', 'sport', 'union_id', 'category'];
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

    // Sanación de esquema: si una columna de la whitelist no existe en la base
    // (el repo y la base divergen), la sacamos y reintentamos en vez de perder el
    // guardado entero. Lo que quedó afuera se informa, no se esconde.
    const skippedFields: string[] = [];
    let data: Record<string, unknown> | null = null;
    let error: { code?: string; message: string } | null = null;

    if (Object.keys(updates).length > 0) {
        for (let attempt = 0; attempt <= ALLOWED_FIELDS.length; attempt += 1) {
            const result = await supabase
                .from('clubs')
                .update(updates)
                .eq('id', id)
                .select('*')
                .single();

            data = result.data;
            error = result.error;
            if (!error) break;

            const offending = Object.keys(updates).find((field) => isMissingColumnError(error, field));
            if (!offending) break;

            delete updates[offending];
            skippedFields.push(offending);
            if (Object.keys(updates).length === 0) {
                data = null;
                error = null;
                break;
            }
        }

        if (error?.code === '23505' && error.message.includes('slug')) {
            return err('El slug ya está en uso. Elegí uno diferente.', 409);
        }
        if (error) return err('Error al actualizar club', 500, error.message);
    }

    // El permiso ya se resolvió arriba; el perfil se escribe con el cliente admin
    // igual que en /api/clubs/[id]/manage, para que no dependa de que `club_profile`
    // tenga política de RLS para este rol.
    if (Object.keys(profileUpdates).length > 0) {
        const { error: profileError } = await adminClient()
            .from('club_profile')
            .upsert({ club_id: id, ...profileUpdates }, { onConflict: 'club_id' });

        if (profileError) {
            return err('Error al actualizar el perfil del club', 500, profileError.message);
        }
    }

    if (!data) {
        const { data: current } = await supabase.from('clubs').select('*').eq('id', id).single();
        data = current;
    }

    // El escudo también vive en el store de overrides y en `external_teams`: sin este
    // puente el logo nuevo se ve en el panel pero no en partidos ni tablas.
    if ('logo_url' in body && data) {
        await syncClubLogoToExternalSources(data, { supabaseClient: adminClient() });
    }

    return NextResponse.json({
        data: { ...(data ?? {}), ...profileUpdates },
        skippedFields: skippedFields.length > 0 ? skippedFields : undefined,
        logoWarning: logoWarning ?? undefined,
    });
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
