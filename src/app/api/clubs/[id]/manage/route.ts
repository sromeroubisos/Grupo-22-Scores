import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import {
    canManageClubContext,
    getClubManagementTarget,
    requireUserAccessContext,
} from '@/lib/auth/permissions';
import { EDIT_MEMBERSHIP_ROLES, VIEW_MEMBERSHIP_ROLES } from '@/lib/auth/roles';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import type { ClubUpdateInput } from '@/lib/types/clubs';
import { fetchClubFull, updateClub } from '@/lib/services/clubService';

function err(message: string, status: number, details?: unknown) {
    return NextResponse.json({ error: message, details: details ?? null }, { status });
}

async function resolvePermission(
    supabase: Awaited<ReturnType<typeof createClient>>,
    clubId: string,
    allowedRoles: ReadonlySet<string>
): Promise<{ userId: string; allowed: boolean } | null> {
    const context = await requireUserAccessContext(supabase).catch(() => null);
    if (!context) return null;

    const target = await getClubManagementTarget(supabase, clubId);

    return {
        userId: context.userId,
        allowed: Boolean(target && canManageClubContext(context, target, allowedRoles)),
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

    const result = await updateClub(id, body, { supabaseClient: createAdminClient() });
    if (!result.success || !result.club) {
        return err(result.error || 'Error al actualizar club', 400, result.validationErrors);
    }

    const updatedSlug = result.club.core.slug || id;
    revalidatePath('/club-admin');
    revalidatePath(`/admin/entities/${id}/manage`);
    revalidatePath('/admin/super/clubes');
    revalidatePath(`/clubs/${id}`);
    if (updatedSlug !== id) {
        revalidatePath(`/clubs/${updatedSlug}`);
    }

    return NextResponse.json({ data: result.club });
}
