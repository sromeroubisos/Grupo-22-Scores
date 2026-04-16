import { NextResponse } from 'next/server';
import { requireGlobalAdminContext } from '@/lib/auth/permissions';
import { normalizeRole } from '@/lib/auth/roles';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

type AppUserRow = {
    id: string;
    name: string | null;
    email: string;
    role: string;
    created_at: string | null;
    last_login_at: string | null;
    avatar_url: string | null;
};

function jsonError(message: string, status = 500, details?: unknown) {
    return NextResponse.json({ error: message, details: details ?? null }, { status });
}

async function ensureGlobalAdmin() {
    const supabase = await createClient();
    return requireGlobalAdminContext(supabase);
}

export async function GET() {
    try {
        await ensureGlobalAdmin();
    } catch (error) {
        return jsonError('Unauthorized', 401, error instanceof Error ? error.message : String(error));
    }

    try {
        const admin = createAdminClient();
        const { data, error } = await admin
            .from('users')
            .select('id, name, email, role, created_at, last_login_at, avatar_url')
            .order('created_at', { ascending: false });

        if (error) {
            return jsonError('No se pudieron cargar los usuarios', 500, error.message);
        }

        const users = ((data ?? []) as unknown as AppUserRow[]).map((user) => ({
            ...user,
            role: normalizeRole(user.role),
        }));

        return NextResponse.json({
            data: {
                users,
            },
        });
    } catch (error) {
        return jsonError(
            'Personas/Roles error',
            500,
            error instanceof Error ? error.message : String(error),
        );
    }
}
