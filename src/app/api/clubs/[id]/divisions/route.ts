import { NextRequest, NextResponse } from 'next/server';
import { canManageClubContext, getClubManagementTarget, requireUserAccessContext } from '@/lib/auth/permissions';
import { EDIT_MEMBERSHIP_ROLES } from '@/lib/auth/roles';
import { createClient } from '@/lib/supabase/server';
import { createDivision, deleteDivision, fetchDivisions, updateDivision } from '@/lib/services/divisionService';

function err(message: string, status: number, details?: unknown) {
    return NextResponse.json({ error: message, details: details ?? null }, { status });
}

function parseBooleanFlag(value: unknown) {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') return value.toLowerCase() === 'true';
    return false;
}

async function resolvePermission(
    supabase: Awaited<ReturnType<typeof createClient>>,
    clubId: string
): Promise<{ allowed: boolean } | null> {
    const context = await requireUserAccessContext(supabase).catch(() => null);
    if (!context) return null;

    const target = await getClubManagementTarget(supabase, clubId);

    return {
        allowed: Boolean(target && canManageClubContext(context, target, EDIT_MEMBERSHIP_ROLES)),
    };
}

function validateDivisionPayload(body: Record<string, unknown>) {
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const gender = typeof body.gender === 'string' ? body.gender : undefined;
    const status = typeof body.status === 'string' ? body.status : undefined;

    if (!name) {
        return { ok: false as const, response: err('El nombre de la division es requerido', 400) };
    }

    const validGenders = ['Masculino', 'Femenino', 'Mixto'];
    const validStatuses = ['active', 'draft', 'archived'];

    if (gender && !validGenders.includes(gender)) {
        return { ok: false as const, response: err('Rama invalida', 400, { allowed: validGenders }) };
    }

    if (status && !validStatuses.includes(status)) {
        return { ok: false as const, response: err('Estado invalido', 400, { allowed: validStatuses }) };
    }

    return {
        ok: true as const,
        payload: {
            name,
            slug: typeof body.slug === 'string' ? body.slug : undefined,
            sport: typeof body.sport === 'string' ? body.sport : undefined,
            gender,
            category: typeof body.category === 'string' ? body.category : undefined,
            status,
            featured: parseBooleanFlag(body.featured),
            season: typeof body.season === 'string' ? body.season : undefined,
            format: typeof body.format === 'string' ? body.format : undefined,
            regulation: typeof body.regulation === 'string' ? body.regulation : undefined,
        },
    };
}

export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;

    try {
        const data = await fetchDivisions(id);
        return NextResponse.json({ data });
    } catch (error: unknown) {
        const details = error instanceof Error ? error.message : error;
        return err('Error al obtener divisiones', 500, details);
    }
}

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id: clubId } = await params;
    const supabase = await createClient();

    const perm = await resolvePermission(supabase, clubId);
    if (!perm) return err('No autenticado', 401);
    if (!perm.allowed) return err('Sin permisos para crear divisiones en este club', 403);

    const { data: club } = await supabase.from('clubs').select('id').eq('id', clubId).single();
    if (!club) return err('Club no encontrado', 404);

    let body: Record<string, unknown>;
    try {
        body = await request.json();
    } catch {
        return err('Payload JSON invalido', 400);
    }

    const validation = validateDivisionPayload(body);
    if (!validation.ok) return validation.response;

    const result = await createDivision(clubId, validation.payload);
    if (!result.success) {
        if (result.code === 'duplicate') {
            return NextResponse.json(
                { error: 'Ya existe una division con ese nombre en este club', details: { name: validation.payload.name } },
                { status: 409 }
            );
        }

        return err('Error al crear division', result.code === 'not_found' ? 404 : 500, result.error);
    }

    return NextResponse.json({ data: result.data }, { status: 201 });
}

export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id: clubId } = await params;
    const supabase = await createClient();

    const perm = await resolvePermission(supabase, clubId);
    if (!perm) return err('No autenticado', 401);
    if (!perm.allowed) return err('Sin permisos para editar divisiones en este club', 403);

    const { searchParams } = new URL(request.url);
    let body: Record<string, unknown>;
    try {
        body = await request.json();
    } catch {
        return err('Payload JSON invalido', 400);
    }

    const divisionId = searchParams.get('division_id') || (typeof body.division_id === 'string' ? body.division_id : null);
    if (!divisionId) return err('division_id es requerido', 400);

    const validation = validateDivisionPayload(body);
    if (!validation.ok) return validation.response;

    const result = await updateDivision(clubId, divisionId, validation.payload);
    if (!result.success) {
        if (result.code === 'duplicate') {
            return NextResponse.json(
                { error: 'Ya existe una division con ese nombre en este club', details: { name: validation.payload.name } },
                { status: 409 }
            );
        }

        return err(
            result.code === 'not_found' ? 'Division no encontrada' : 'Error al actualizar division',
            result.code === 'not_found' ? 404 : 500,
            result.error
        );
    }

    return NextResponse.json({ data: result.data });
}

export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id: clubId } = await params;
    const { searchParams } = new URL(request.url);
    const divisionId = searchParams.get('division_id');
    const name = searchParams.get('name') || undefined;

    if (!divisionId) return err('division_id es requerido', 400);

    const supabase = await createClient();
    const perm = await resolvePermission(supabase, clubId);
    if (!perm) return err('No autenticado', 401);
    if (!perm.allowed) return err('Sin permisos', 403);

    const result = await deleteDivision(clubId, divisionId, name);
    if (!result.success) {
        return err(
            result.code === 'not_found' ? 'Division no encontrada' : 'Error al eliminar division',
            result.code === 'not_found' ? 404 : 500,
            result.error
        );
    }

    return NextResponse.json({ success: true });
}
