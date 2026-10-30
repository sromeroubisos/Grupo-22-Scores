import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import {
    canManageClubContext,
    getClubManagementTarget,
    requireUserAccessContext,
} from '@/lib/auth/permissions';
import { ADMIN_ONLY_MEMBERSHIP_ROLES, EDIT_MEMBERSHIP_ROLES, VIEW_MEMBERSHIP_ROLES } from '@/lib/auth/roles';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import type { ClubUpdateInput } from '@/lib/types/clubs';
import { fetchClubFull, updateClub } from '@/lib/services/clubService';
import { syncClubLogoToExternalSources } from '@/lib/server/clubLogoExternalSync';
import { persistClubLogo } from '@/lib/server/persistClubLogo';

function err(message: string, status: number, details?: unknown) {
    return NextResponse.json({ error: message, details: details ?? null }, { status });
}

/**
 * Lo que cambia QUIÉN ve el club o DÓNDE está: publicarlo u ocultarlo, su
 * estado, su unión, su slug (la URL pública) y de dónde sale. Antes cualquier
 * editor lo tocaba con service_role. Ahora solo el admin del club (o de su
 * familia, unión o deporte) o un admin global; el editor sigue con el resto
 * (nombre, colores, escudo, perfil, alias).
 */
const SENSITIVE_CORE_FIELDS = [
    'visibility',
    'lifecycle',
    'union_id',
    'slug',
    'entity_type',
    'source',
    'external_id',
    'sync_status',
    'last_sync_at',
] as const;

function touchedSensitiveFields(body: ClubUpdateInput): string[] {
    const core = (body.core ?? {}) as Record<string, unknown>;
    const touched: string[] = SENSITIVE_CORE_FIELDS.filter((field) =>
        Object.prototype.hasOwnProperty.call(core, field)
    );
    const secondary = body.secondary_unions;
    if (secondary && ((secondary.add?.length ?? 0) > 0 || (secondary.remove?.length ?? 0) > 0)) {
        touched.push('secondary_unions');
    }
    return touched;
}

async function resolvePermission(
    supabase: Awaited<ReturnType<typeof createClient>>,
    clubId: string,
    allowedRoles: ReadonlySet<string>
): Promise<{ userId: string; allowed: boolean; isClubAdmin: boolean } | null> {
    const context = await requireUserAccessContext(supabase).catch(() => null);
    if (!context) return null;

    const target = await getClubManagementTarget(supabase, clubId);

    return {
        userId: context.userId,
        allowed: Boolean(target && canManageClubContext(context, target, allowedRoles)),
        isClubAdmin: Boolean(
            target &&
            !context.userId.startsWith('guest:') &&
            canManageClubContext(context, target, ADMIN_ONLY_MEMBERSHIP_ROLES)
        ),
    };
}

export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    const supabase = await createClient();

    const perm = await resolvePermission(supabase, id, VIEW_MEMBERSHIP_ROLES);
    if (!perm) return err('No autenticado', 401);
    if (!perm.allowed) return err('Sin permisos para ver este club', 403);

    const club = await fetchClubFull(id, { supabaseClient: createAdminClient() });
    if (!club) return err('Club no encontrado', 404);

    return NextResponse.json({ data: club });
}

export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    const supabase = await createClient();

    const perm = await resolvePermission(supabase, id, EDIT_MEMBERSHIP_ROLES);
    if (!perm) return err('No autenticado', 401);
    if (!perm.allowed) return err('Sin permisos para editar este club', 403);

    let body: ClubUpdateInput;
    try {
        body = await request.json() as ClubUpdateInput;
    } catch {
        return err('Payload JSON inválido', 400);
    }

    if (!body || typeof body !== 'object') {
        return err('No se enviaron cambios válidos', 400);
    }

    const sensitive = touchedSensitiveFields(body);
    if (sensitive.length > 0 && !perm.isClubAdmin) {
        return err(
            'Solo un admin del club puede cambiar la visibilidad, el estado, la unión o la dirección del club.',
            403,
            { fields: sensitive },
        );
    }

    const adminClient = createAdminClient();

    // El escudo se sube a Storage ANTES de escribir la fila: si viene como data
    // URI, lo que se guarda en `clubs.logo_url` es una URL corta y no 870 KB de
    // base64. Si Storage falla, `persistClubLogo` devuelve el data URI y el
    // guardado sigue — pero avisa.
    let logoWarning: string | undefined;
    if (body.core && Object.prototype.hasOwnProperty.call(body.core, 'logo_url')) {
        const persisted = await persistClubLogo(id, body.core.logo_url, { supabaseClient: adminClient });
        if (persisted.origin === 'rejected') {
            // No se pisa el escudo actual con un archivo que no es imagen.
            return err(persisted.warning || 'El escudo no es una imagen válida.', 400);
        }
        body.core.logo_url = persisted.url;
        logoWarning = persisted.warning;
    }

    const result = await updateClub(id, body, { supabaseClient: adminClient });
    if (!result.success || !result.club) {
        return err(result.error || 'Error al actualizar club', 400, result.validationErrors);
    }

    // When the logo changed, propagate it to the external feed sources (external_teams + override
    // store) so the new escudo also shows in matches/standings/team pages, not just the club panel.
    if (body.core && Object.prototype.hasOwnProperty.call(body.core, 'logo_url')) {
        await syncClubLogoToExternalSources(result.club.core, { supabaseClient: adminClient });
    }

    const updatedSlug = result.club.core.slug || id;
    revalidatePath('/club-admin');
    revalidatePath(`/admin/entities/${id}/manage`);
    revalidatePath('/admin/super/clubes');
    revalidatePath(`/clubs/${id}`);
    if (updatedSlug !== id) {
        revalidatePath(`/clubs/${updatedSlug}`);
    }

    return NextResponse.json({ data: result.club, logoWarning: logoWarning ?? undefined });
}
