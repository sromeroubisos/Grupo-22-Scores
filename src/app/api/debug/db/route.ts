import { NextResponse } from 'next/server';
import { getApiErrorMessageForClient, getApiErrorStatus, requireGlobalAdminApiUser } from '@/lib/auth/apiAdmin';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

// Ruta de diagnostico: muestra conteos, errores crudos de PostgREST y detalles
// de infraestructura. En el deploy de produccion no existe (404, no 401: ni se
// anuncia), y en dev/preview la ve solo un admin GLOBAL — antes alcanzaba con
// cualquier admin, incluido un admin de club.
function isProductionDeployment(): boolean {
    return process.env.NODE_ENV === 'production' && process.env.VERCEL_ENV === 'production';
}

export async function GET() {
    if (isProductionDeployment()) {
        return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    try {
        await requireGlobalAdminApiUser();
    } catch (error) {
        return NextResponse.json({ error: getApiErrorMessageForClient(error, 'Unauthorized') }, { status: getApiErrorStatus(error, 401) });
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '(missing)';
    const projectRef = url.includes('.supabase.co')
        ? url.replace('https://', '').split('.')[0]
        : url;
    const hasServiceKey = !!process.env.SUPABASE_SERVICE_ROLE_KEY;

    // Test admin client (service role — bypasses RLS)
    let adminResult: Record<string, unknown> = {};
    try {
        const admin = createAdminClient();
        const { count: matchCount, error: matchError } = await admin
            .from('matches')
            .select('*', { count: 'exact', head: true });
        const { count: clubCount, error: clubError } = await admin
            .from('clubs')
            .select('*', { count: 'exact', head: true });
        adminResult = {
            ok: true,
            matchCount: matchError ? null : matchCount,
            matchError: matchError ? { code: matchError.code, message: matchError.message } : null,
            clubCount: clubError ? null : clubCount,
            clubError: clubError ? { code: clubError.code, message: clubError.message } : null,
        };
    } catch (e) {
        adminResult = { ok: false, threw: e instanceof Error ? e.message : String(e) };
    }

    // Test anon client (subject to RLS)
    let anonResult: Record<string, unknown> = {};
    try {
        const anon = await createClient();
        const { count: matchCount, error: matchError } = await anon
            .from('matches')
            .select('*', { count: 'exact', head: true });
        const { count: clubCount, error: clubError } = await anon
            .from('clubs')
            .select('*', { count: 'exact', head: true });
        anonResult = {
            ok: true,
            matchCount: matchError ? null : matchCount,
            matchError: matchError ? { code: matchError.code, message: matchError.message } : null,
            clubCount: clubError ? null : clubCount,
            clubError: clubError ? { code: clubError.code, message: clubError.message } : null,
        };
    } catch (e) {
        anonResult = { ok: false, threw: e instanceof Error ? e.message : String(e) };
    }

    return NextResponse.json({
        projectRef,
        hasServiceKey,
        admin: adminResult,
        anon: anonResult,
    });
}
