import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import type { PostgrestError } from '@supabase/supabase-js';
import { requireGlobalAdminContext } from '@/lib/auth/permissions';
import {
    APP_ROLES,
    getAllowedScopesForRole,
    getDefaultScopeForRole,
    isAppRole,
    isGlobalAdminRole,
    type MembershipRole,
    type MembershipScope,
} from '@/lib/auth/roles';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { getReservedAdminRole } from '@/lib/types/user';
import { getApiErrorMessageForClient, guardRejection } from '@/lib/auth/apiAdmin';
import { isMfaError } from '@/lib/auth/mfa';

const accessPayloadSchema = z.object({
    role: z.string().min(1),
    scopeType: z.enum(['union', 'sport', 'tournament', 'match', 'club', 'club_family']),
    membershipRole: z.enum(['admin', 'editor', 'operator', 'viewer']).default('admin'),
    scopeIds: z.array(z.string().min(1)).default([]),
});

function badRequest(message: string, details?: unknown) {
    return NextResponse.json({ error: message, details: details ?? null }, { status: 400 });
}

function forbidden(message = 'Forbidden') {
    return NextResponse.json({ error: message }, { status: 403 });
}

/**
 * El catch de estos handlers contestaba 403 con el mensaje crudo a todo. El
 * segundo factor sigue en 403 pero con un mensaje que dice que hacer, y la
 * falta de sesion pasa a 401.
 */
function guardFailure(error: unknown) {
    if (isMfaError(error)) return forbidden(getApiErrorMessageForClient(error));
    if (error instanceof Error && error.message === 'Unauthorized') {
        const [message, status] = guardRejection(error);
        return NextResponse.json({ error: message }, { status });
    }
    const message = error instanceof Error ? error.message : 'Forbidden';
    return forbidden(message);
}

function serializePostgrestError(error: PostgrestError) {
    return {
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
    };
}

async function ensureGlobalAdmin() {
    const supabase = await createClient();
    return requireGlobalAdminContext(supabase);
}

async function getUserAccessPayload(userId: string) {
    const admin = createAdminClient();
    const [userResult, membershipsResult] = await Promise.all([
        admin
            .from('users')
            .select('id, email, name, role, created_at, last_login_at')
            .eq('id', userId)
            .maybeSingle(),
        admin
            .from('memberships')
            .select('id, scope_type, scope_id, role, created_at')
            .eq('user_id', userId)
            .order('created_at', { ascending: false }),
    ]);

    return {
        user: userResult.data,
        memberships: membershipsResult.data ?? [],
    };
}

export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        await ensureGlobalAdmin();
        const { id } = await params;
        const payload = await getUserAccessPayload(id);

        if (!payload.user) {
            return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 });
        }

        return NextResponse.json({
            data: payload,
            meta: {
                roles: APP_ROLES,
                scopeTypes: ['union', 'sport', 'tournament', 'match', 'club', 'club_family'],
                membershipRoles: ['admin', 'editor', 'operator', 'viewer'],
            },
        });
    } catch (error) {
        return guardFailure(error);
    }
}

export async function PUT(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const actor = await ensureGlobalAdmin();
        const { id: targetUserId } = await params;

        // Nadie se toca su propio acceso: reescribe rol y membresias, o sea
        // que seria una autoescalada (o un autobloqueo) sin testigos.
        if (targetUserId === actor.userId) {
            return forbidden('No podés cambiar tu propio rol ni tus accesos.');
        }

        let body: unknown;
        try {
            body = await request.json();
        } catch {
            return badRequest('Payload JSON inválido');
        }

        const parsed = accessPayloadSchema.safeParse(body);
        if (!parsed.success) {
            return badRequest('Payload inválido', parsed.error.flatten());
        }

        const { role, scopeType, membershipRole, scopeIds } = parsed.data;

        if (!isAppRole(role)) {
            return badRequest('Rol inválido', { allowed: APP_ROLES });
        }

        const defaultScope = getDefaultScopeForRole(role);
        const allowedScopes = getAllowedScopesForRole(role);
        if (allowedScopes && !allowedScopes.includes(scopeType as MembershipScope)) {
            return badRequest('El tipo de usuario no coincide con el alcance elegido', {
                role,
                expectedScopeType: defaultScope,
                allowedScopeTypes: allowedScopes,
                receivedScopeType: scopeType,
            });
        }

        const admin = createAdminClient();
        const uniqueScopeIds = Array.from(new Set(scopeIds.map((value) => value.trim()).filter(Boolean)));

        const { data: targetUser } = await admin
            .from('users')
            .select('id, email, role')
            .eq('id', targetUserId)
            .maybeSingle();

        if (!targetUser) {
            return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 });
        }

        const reservedRole = getReservedAdminRole(targetUser.email);
        if (reservedRole && role !== reservedRole) {
            return badRequest('Esta cuenta tiene un rol reservado y no puede recibir un rol operativo.');
        }

        // Jerarquia: dar un rol global, o tocarle el acceso a quien ya lo
        // tiene, es cosa de un super_admin exacto. Un admin_general no fabrica
        // pares ni degrada a un super admin.
        if ((isGlobalAdminRole(role) || isGlobalAdminRole(targetUser.role)) && actor.role !== 'super_admin') {
            return forbidden('Solo un super admin puede asignar o quitar roles globales.');
        }

        const { error: roleError } = await admin
            .from('users')
            .update({ role })
            .eq('id', targetUserId);

        if (roleError) {
            return NextResponse.json({ error: 'No se pudo actualizar el rol del usuario', details: serializePostgrestError(roleError) }, { status: 500 });
        }

        let deleteQuery = admin
            .from('memberships')
            .delete()
            .eq('user_id', targetUserId);

        if (scopeType === 'club' || scopeType === 'club_family') {
            deleteQuery = deleteQuery.in('scope_type', ['club', 'club_family']);
        } else {
            deleteQuery = deleteQuery.eq('scope_type', scopeType);
        }

        const { error: deleteError } = await deleteQuery;

        if (deleteError) {
            return NextResponse.json({ error: 'No se pudieron limpiar los accesos existentes', details: serializePostgrestError(deleteError) }, { status: 500 });
        }

        if (uniqueScopeIds.length > 0) {
            const inserts: Array<{
                user_id: string;
                scope_type: MembershipScope;
                scope_id: string;
                role: MembershipRole;
            }> = uniqueScopeIds.map((scopeId) => ({
                user_id: targetUserId,
                scope_type: scopeType as MembershipScope,
                scope_id: scopeId,
                role: membershipRole as MembershipRole,
            }));

            const { error: insertError } = await admin
                .from('memberships')
                .insert(inserts);

            if (insertError) {
                return NextResponse.json({ error: 'No se pudieron guardar los nuevos accesos', details: serializePostgrestError(insertError) }, { status: 500 });
            }
        }

        const payload = await getUserAccessPayload(targetUserId);
        return NextResponse.json({ data: payload });
    } catch (error) {
        return guardFailure(error);
    }
}
