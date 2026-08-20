import { NextRequest, NextResponse } from 'next/server';
import {
    canManageClubContext,
    getClubManagementTarget,
    requireUserAccessContext,
} from '@/lib/auth/permissions';
import { EDIT_MEMBERSHIP_ROLES, VIEW_MEMBERSHIP_ROLES } from '@/lib/auth/roles';
import {
    addPersonToClub,
    deletePersonFromClub,
    fetchPeopleByClub,
    fetchPeopleByDivision,
    updatePersonInClub,
} from '@/lib/services/personService';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

function jsonError(message: string, status: number) {
    return NextResponse.json({ ok: false, error: message }, { status });
}

/**
 * El gate se resolvia con getManagedClubSummaries(), que solo mira las
 * membresias del usuario: un super admin sin membresia en el club recibia 403
 * sobre un club que si puede gestionar, y la pestana de jugadores del gestor
 * quedaba vacia. canManageClubContext() es el mismo criterio que usan
 * /api/club-admin/users y /api/clubs/[id]/manage — rol global primero,
 * membresias despues.
 */
async function ensureManagedClub(clubId: string, allowedRoles = VIEW_MEMBERSHIP_ROLES) {
    const supabase = await createClient();
    const context = await requireUserAccessContext(supabase).catch(() => null);

    if (!context) {
        return { supabase, context: null, error: jsonError('No autenticado', 401) };
    }

    const target = await getClubManagementTarget(supabase, clubId);
    if (!target) {
        return { supabase, context, error: jsonError('Club no encontrado', 404) };
    }

    if (!canManageClubContext(context, target, allowedRoles)) {
        return { supabase, context, error: jsonError('Sin permisos sobre este club', 403) };
    }

    return { supabase, context, target, error: null };
}

export async function GET(request: NextRequest) {
    const clubId = request.nextUrl.searchParams.get('clubId');
    const divisionId = request.nextUrl.searchParams.get('divisionId');
    if (!clubId) {
        return jsonError('clubId es requerido', 400);
    }

    const access = await ensureManagedClub(clubId);
    if (access.error) return access.error;

    try {
        const admin = createAdminClient();
        const people = divisionId
            ? await fetchPeopleByDivision(clubId, divisionId, admin)
            : await fetchPeopleByClub(clubId, admin);
        return NextResponse.json({ ok: true, data: people });
    } catch (error) {
        return jsonError(error instanceof Error ? error.message : 'No se pudo cargar el plantel', 500);
    }
}

export async function POST(request: NextRequest) {
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    const clubId = typeof body?.clubId === 'string' ? body.clubId : '';
    if (!clubId) {
        return jsonError('clubId es requerido', 400);
    }

    const access = await ensureManagedClub(clubId, EDIT_MEMBERSHIP_ROLES);
    if (access.error) return access.error;

    const admin = createAdminClient();
    const result = await addPersonToClub(clubId, {
        first_name: typeof body?.first_name === 'string' ? body.first_name : '',
        last_name: typeof body?.last_name === 'string' ? body.last_name : '',
        role: typeof body?.role === 'string' ? body.role : 'player',
        division_id: typeof body?.division_id === 'string' ? body.division_id : undefined,
        status: typeof body?.status === 'string' ? body.status : undefined,
        position: typeof body?.position === 'string' ? body.position : undefined,
        birth_date: typeof body?.birth_date === 'string' ? body.birth_date : undefined,
        id_number: typeof body?.id_number === 'string' ? body.id_number : undefined,
        photo_url: typeof body?.photo_url === 'string' ? body.photo_url : undefined,
        weight: typeof body?.weight === 'number' ? body.weight : undefined,
        height: typeof body?.height === 'number' ? body.height : undefined,
        jersey_number: typeof body?.jersey_number === 'number' ? body.jersey_number : undefined,
        squad_role: typeof body?.squad_role === 'string' ? body.squad_role : undefined,
        existing_person_id: typeof body?.existing_person_id === 'string' ? body.existing_person_id : undefined,
        force_create_new: body?.force_create_new === true,
    }, admin);

    if (!result.success) {
        return NextResponse.json({
            ok: false,
            error: result.error || 'No se pudo crear la ficha',
            code: result.code,
            matches: result.matches,
        }, { status: 400 });
    }

    return NextResponse.json({ ok: true, data: result.data });
}

export async function PATCH(request: NextRequest) {
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    const clubId = typeof body?.clubId === 'string' ? body.clubId : '';
    const personId = typeof body?.personId === 'string' ? body.personId : '';

    if (!clubId || !personId) {
        return jsonError('clubId y personId son requeridos', 400);
    }

    const access = await ensureManagedClub(clubId, EDIT_MEMBERSHIP_ROLES);
    if (access.error) return access.error;

    const admin = createAdminClient();
    const result = await updatePersonInClub(clubId, personId, {
        first_name: typeof body?.first_name === 'string' ? body.first_name : '',
        last_name: typeof body?.last_name === 'string' ? body.last_name : '',
        role: typeof body?.role === 'string' ? body.role : 'player',
        division_id: typeof body?.division_id === 'string' ? body.division_id : undefined,
        status: typeof body?.status === 'string' ? body.status : undefined,
        position: typeof body?.position === 'string' ? body.position : undefined,
        birth_date: typeof body?.birth_date === 'string' ? body.birth_date : undefined,
        id_number: typeof body?.id_number === 'string' ? body.id_number : undefined,
        photo_url: typeof body?.photo_url === 'string' ? body.photo_url : undefined,
        weight: typeof body?.weight === 'number' ? body.weight : undefined,
        height: typeof body?.height === 'number' ? body.height : undefined,
        jersey_number: typeof body?.jersey_number === 'number' ? body.jersey_number : undefined,
        squad_role: typeof body?.squad_role === 'string' ? body.squad_role : undefined,
    }, admin);

    if (!result.success) {
        return jsonError(result.error || 'No se pudo actualizar la ficha', 400);
    }

    return NextResponse.json({ ok: true, data: result.data });
}

export async function DELETE(request: NextRequest) {
    const clubId = request.nextUrl.searchParams.get('clubId');
    const personId = request.nextUrl.searchParams.get('personId');
    const divisionId = request.nextUrl.searchParams.get('divisionId') || undefined;

    if (!clubId || !personId) {
        return jsonError('clubId y personId son requeridos', 400);
    }

    const access = await ensureManagedClub(clubId, EDIT_MEMBERSHIP_ROLES);
    if (access.error) return access.error;

    const admin = createAdminClient();
    const result = await deletePersonFromClub(clubId, personId, divisionId, admin);
    if (!result.success) {
        return jsonError(result.error || 'No se pudo eliminar la ficha', 400);
    }

    return NextResponse.json({ ok: true });
}
