import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createApiPerfTracker } from '@/lib/perf/api';
import { nowMs } from '@/lib/perf/measure';
import { getApiErrorMessageForClient, getApiErrorStatus, requireGlobalAdminApiUser } from '@/lib/auth/apiAdmin';

// Ruta de diagnostico: muestra conteos, errores crudos de PostgREST y detalles
// de infraestructura. En el deploy de produccion no existe (404, no 401: ni se
// anuncia), y en dev/preview la ve solo un admin GLOBAL — antes alcanzaba con
// cualquier admin, incluido un admin de club.
function isProductionDeployment(): boolean {
  return process.env.NODE_ENV === 'production' && process.env.VERCEL_ENV === 'production';
}

export const dynamic = 'force-dynamic';

export async function GET() {
  const route = '/api/debug/supabase-latency';
  const perf = createApiPerfTracker(route);
  const totalStartedAt = nowMs();
  const workspaceInOneDrive = process.cwd().toLowerCase().includes('onedrive');

  // Latency probes touch auth + DB and reveal infra timing details. Antes, en
  // dev/preview cualquiera las corria sin sesion (y un preview de Vercel es
  // publico) y en prod cualquier admin. Ahora: fuera del deploy de produccion
  // y solo para un admin global.
  if (isProductionDeployment()) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  try {
    await requireGlobalAdminApiUser();
  } catch (error) {
    return NextResponse.json({ error: getApiErrorMessageForClient(error, 'Unauthorized') }, { status: getApiErrorStatus(error, 401) });
  }

  try {
    const supabase = await perf.measureStep('create_client', () => createClient(), {
      bucket: 'client',
    });

    const authStartedAt = nowMs();
    const { data: sessionData, error: sessionError } = await perf.measureStep(
      'get_session',
      async () => supabase.auth.getSession(),
      {
        bucket: 'auth',
        logQuery: true,
      },
    );
    const authMs = nowMs() - authStartedAt;

    const queryStartedAt = nowMs();
    const { data, error } = await perf.measureStep(
      'minimal_select',
      async () => supabase
        .from('matches')
        .select('id')
        .limit(1),
      {
        bucket: 'query',
        logQuery: true,
      },
    );
    const queryMs = nowMs() - queryStartedAt;

    const totalMs = nowMs() - totalStartedAt;
    const rows = Array.isArray(data) ? data.length : 0;

    return perf.json({
      ok: !error,
      environment: process.env.NODE_ENV || 'development',
      workspace_in_onedrive: workspaceInOneDrive,
      auth_ms: Number(authMs.toFixed(1)),
      query_ms: Number(queryMs.toFixed(1)),
      total_ms: Number(totalMs.toFixed(1)),
      rows,
      session_present: Boolean(sessionData.session),
      auth_error: sessionError?.message || null,
      query_error: error?.message || null,
    });
  } catch (error: unknown) {
    return perf.json(
      {
        ok: false,
        environment: process.env.NODE_ENV || 'development',
        workspace_in_onedrive: workspaceInOneDrive,
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 },
    );
  }
}
