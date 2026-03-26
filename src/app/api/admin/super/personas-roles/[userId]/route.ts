import { NextRequest, NextResponse } from 'next/server';
import { requireGlobalAdminContext } from '@/lib/auth/permissions';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { APP_ROLES } from '@/lib/auth/roles';

function jsonError(message: string, status = 400) {
    return NextResponse.json({ error: message }, { status });
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
        const { data, error } = await admin
            .from('users')
            .update({ role })
            .eq('id', userId)
            .select('id, role')
            .single();

        if (error) {
            return jsonError(error.message || 'Error al actualizar el rol', 500);
        }

        return NextResponse.json({ data });
    } catch (err) {
        return jsonError(err instanceof Error ? err.message : 'Error interno', 500);
    }
}
