import { NextRequest, NextResponse } from 'next/server';
import type { PostgrestError } from '@supabase/supabase-js';
import { requireGlobalAdminContext } from '@/lib/auth/permissions';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { APP_ROLES } from '@/lib/auth/roles';
import { getReservedAdminRole } from '@/lib/types/user';

type UserLookupRow = {
    id: string;
    email: string;
};

function jsonError(message: string, status = 400) {
    return NextResponse.json({ error: message }, { status });
}

function serializePostgrestError(error: PostgrestError) {
    return {
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
    };
}

export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ userId: string }> }
) {
    try {
        const supabase = await createClient();
        await requireGlobalAdminContext(supabase);
    } catch {
        return jsonError('Unauthorized', 401);
    }

    const { userId } = await params;
    if (!userId) {
        return jsonError('userId requerido', 400);
    }

    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return jsonError('Body JSON inválido', 400);
    }

    const role = (body as Record<string, unknown>)?.role;
    if (typeof role !== 'string' || !(APP_ROLES as string[]).includes(role)) {
        return jsonError(`Rol inválido. Valores permitidos: ${APP_ROLES.join(', ')}`, 400);
    }

    try {
        const admin = createAdminClient();
        const usersTable = admin.from('users') as any;
        const membershipsTable = admin.from('memberships') as any;

        const targetUserResult = await usersTable
            .select('id, email')
            .eq('id', userId)
            .maybeSingle();
        const targetUser = targetUserResult.data as UserLookupRow | null;
        const targetUserError = targetUserResult.error;

        if (targetUserError) {
            return jsonError(targetUserError.message || 'Error al cargar el usuario', 500);
        }

        if (!targetUser) {
            return jsonError('Usuario no encontrado', 404);
        }

        const reservedRole = getReservedAdminRole(targetUser.email);
        if (reservedRole && role !== reservedRole) {
            return jsonError(`Esta cuenta esta reservada como ${reservedRole} y no puede recibir otro rol.`, 400);
        }

        const updateResult = await usersTable
            .update({ role })
            .eq('id', userId)
            .select('id, role')
            .single();
        const data = updateResult.data as { id: string; role: string } | null;
        const error = updateResult.error;

        if (error) {
            return NextResponse.json(
                { error: 'Error al actualizar el rol', details: serializePostgrestError(error) },
                { status: 500 }
            );
        }

        const { error: membershipsError } = await membershipsTable
            .delete()
            .eq('user_id', userId);

        if (membershipsError) {
            return NextResponse.json(
                { error: 'Error al limpiar accesos heredados', details: serializePostgrestError(membershipsError) },
                { status: 500 }
            );
        }

        return NextResponse.json({ data });
    } catch (err) {
        return jsonError(err instanceof Error ? err.message : 'Error interno', 500);
    }
}
