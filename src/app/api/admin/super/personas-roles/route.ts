// El directorio de usuarios del super admin, paginado y buscable EN EL
// SERVIDOR. Antes devolvía todo y la página filtraba en memoria: PostgREST
// corta la respuesta en 1000 filas, así que la búsqueda no encontraba a nadie
// que estuviera más allá. Acá el filtro y el corte los hace la base.

import { NextResponse } from 'next/server';
import { requireGlobalAdminContext } from '@/lib/auth/permissions';
import { normalizeRole } from '@/lib/auth/roles';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

type AppUserRow = {
    id: string;
    name: string | null;
    email: string;
    role: string;
    created_at: string | null;
    last_login_at: string | null;
    avatar_url: string | null;
};

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;
const MAX_PAGE = 10_000;
const QUERY_MAX_LENGTH = 80;

function jsonError(message: string, status = 500, details?: unknown) {
    return NextResponse.json({ error: message, details: details ?? null }, { status });
}

async function ensureGlobalAdmin() {
    const supabase = await createClient();
    return requireGlobalAdminContext(supabase);
}

function parseIntParam(value: string | null, fallback: number, min: number, max: number): number {
    const parsed = Number.parseInt(value ?? '', 10);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(Math.max(parsed, min), max);
}

/**
 * Lo que se busca, apto para un filtro `or` de PostgREST: la coma y los
 * paréntesis separan condiciones, y `*`/`%` son comodines. Se sacan.
 */
function cleanQuery(raw: string | null): string {
    return (raw ?? '')
        .replace(/[,()%*\\]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, QUERY_MAX_LENGTH);
}

/**
 * GET /api/admin/super/personas-roles?q=&page=&pageSize=
 * → { data: { users, total, page, pageSize, query } }
 */
export async function GET(request: Request) {
    try {
        await ensureGlobalAdmin();
    } catch (error) {
        return jsonError('Unauthorized', 401, error instanceof Error ? error.message : String(error));
    }

    const { searchParams } = new URL(request.url);
    const query = cleanQuery(searchParams.get('q'));
    const page = parseIntParam(searchParams.get('page'), 1, 1, MAX_PAGE);
    const pageSize = parseIntParam(searchParams.get('pageSize'), DEFAULT_PAGE_SIZE, 1, MAX_PAGE_SIZE);
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    try {
        const admin = createAdminClient();
        let select = admin
            .from('users')
            .select('id, name, email, role, created_at, last_login_at, avatar_url', { count: 'exact' });

        if (query) {
            select = select.or(`name.ilike.*${query}*,email.ilike.*${query}*,role.ilike.*${query}*`);
        }

        // Los más nuevos primero; el id desempata para que las páginas no se
        // pisen ni salteen filas cuando dos usuarios comparten fecha.
        const { data, error, count } = await select
            .order('created_at', { ascending: false, nullsFirst: false })
            .order('id', { ascending: true })
            .range(from, to);

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
                total: count ?? users.length,
                page,
                pageSize,
                query,
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
