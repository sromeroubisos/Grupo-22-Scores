import { NextRequest, NextResponse } from 'next/server';
import { canManageClubContext, getClubManagementTarget, requireUserAccessContext } from '@/lib/auth/permissions';
import { EDIT_MEMBERSHIP_ROLES, VIEW_MEMBERSHIP_ROLES } from '@/lib/auth/roles';
import { getClubFamilySummary } from '@/lib/club-admin/managedClubFamily';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { isMissingTableError } from '@/lib/utils/supabaseSchema';

function err(message: string, status: number) {
    return NextResponse.json({ error: message }, { status });
}

export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    const supabase = await createClient();
    const context = await requireUserAccessContext(supabase).catch(() => null);

    if (!context) {
        return err('No autenticado', 401);
    }

    const target = await getClubManagementTarget(supabase, id);
    if (!target) {
        return err('Club no encontrado', 404);
    }

    if (!canManageClubContext(context, target, VIEW_MEMBERSHIP_ROLES)) {
        return err('Sin permisos para ver esta familia de club', 403);
    }

    const data = await getClubFamilySummary(supabase as never, id);
    return NextResponse.json({ data });
}

/**
 * Alta y baja de un club dentro de la familia.
 *
 * Existe aparte de `/api/admin/super/club-families` a proposito: ese endpoint
 * reescribe la familia ENTERA y, en cada POST, borra las filas de
 * `club_family_divisions` del club base para volver a insertar solo los
 * `divisionGroups` que le manden. Usarlo para sumar un club se lleva puestos los
 * planteles compartidos de la familia sin que nadie lo pida. Aca se toca una
 * sola fila de `club_derivatives` y nada mas.
 *
 * El permiso se pide sobre los DOS clubes: sumar a alguien a tu familia le da a
 * tu equipo acceso a su plantel, asi que no alcanza con administrar el propio.
 */

type FamilyMutationBody = { clubId?: unknown };

function readClubId(body: FamilyMutationBody | null): string {
    return typeof body?.clubId === 'string' ? body.clubId.trim() : '';
}

async function assertCanEditFamily(
    supabase: Awaited<ReturnType<typeof createClient>>,
    context: Awaited<ReturnType<typeof requireUserAccessContext>>,
    clubId: string,
) {
    const target = await getClubManagementTarget(supabase, clubId);
    if (!target) return { error: err(`Club ${clubId} no encontrado`, 404), target: null };
    if (!canManageClubContext(context, target, EDIT_MEMBERSHIP_ROLES)) {
        return { error: err(`Sin permisos para editar ${clubId}`, 403), target: null };
    }
    return { error: null, target };
}

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    const supabase = await createClient();
    const context = await requireUserAccessContext(supabase).catch(() => null);
    if (!context) return err('No autenticado', 401);

    const body = await request.json().catch(() => null) as FamilyMutationBody | null;
    const incomingClubId = readClubId(body);
    if (!incomingClubId) return err('Falta el club a vincular', 400);
    if (incomingClubId === id) return err('Un club no puede vincularse consigo mismo', 400);

    const here = await assertCanEditFamily(supabase, context, id);
    if (here.error) return here.error;
    const there = await assertCanEditFamily(supabase, context, incomingClubId);
    if (there.error) return there.error;

    const rootClubId = here.target!.familyRootId;

    // Un club no puede estar en dos familias: la clave de `club_derivatives` es
    // (base, derivado), asi que sin este chequeo quedaria colgando de las dos.
    if (there.target!.familyRootId !== incomingClubId) {
        return err('Ese club ya pertenece a otra familia. Desvinculalo de la suya primero.', 409);
    }

    if (there.target!.familyClubIds.length > 1) {
        return err('Ese club es la base de su propia familia. Desarmala antes de sumarlo a esta.', 409);
    }

    const admin = createAdminClient();
    const { error } = await admin
        .from('club_derivatives')
        .upsert(
            { base_club_id: rootClubId, derived_club_id: incomingClubId, derivative_type: 'family' },
            { onConflict: 'base_club_id,derived_club_id' },
        );

    if (error) return err(error.message || 'No se pudo vincular el club', 500);

    const data = await getClubFamilySummary(supabase as never, id);
    return NextResponse.json({ data });
}

export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    const supabase = await createClient();
    const context = await requireUserAccessContext(supabase).catch(() => null);
    if (!context) return err('No autenticado', 401);

    const outgoingClubId = (request.nextUrl.searchParams.get('clubId') || '').trim();
    if (!outgoingClubId) return err('Falta el club a desvincular', 400);

    const here = await assertCanEditFamily(supabase, context, id);
    if (here.error) return here.error;

    const rootClubId = here.target!.familyRootId;
    if (outgoingClubId === rootClubId) {
        return err('El club base no se desvincula: es la raiz de la familia.', 400);
    }

    const admin = createAdminClient();
    const { error } = await admin
        .from('club_derivatives')
        .delete()
        .eq('base_club_id', rootClubId)
        .eq('derived_club_id', outgoingClubId);

    if (error) return err(error.message || 'No se pudo desvincular el club', 500);

    // Los planteles compartidos que apuntaban al club que se va quedarian
    // colgados: se limpian los suyos, no los de toda la familia.
    const { error: linksError } = await admin
        .from('club_family_divisions')
        .delete()
        .eq('family_base_club_id', rootClubId)
        .eq('division_club_id', outgoingClubId);

    if (linksError && !isMissingTableError(linksError, 'club_family_divisions')) {
        return err(linksError.message || 'No se pudieron limpiar los planteles compartidos', 500);
    }

    const data = await getClubFamilySummary(supabase as never, id);
    return NextResponse.json({ data });
}
