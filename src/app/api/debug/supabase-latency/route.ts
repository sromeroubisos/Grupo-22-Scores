import { createClient } from '@/lib/supabase/server';
import { createApiPerfTracker } from '@/lib/perf/api';
import { nowMs } from '@/lib/perf/measure';

export const dynamic = 'force-dynamic';

export async function GET() {
  const route = '/api/debug/supabase-latency';
  const perf = createApiPerfTracker(route);
  const totalStartedAt = nowMs();
  const workspaceInOneDrive = process.cwd().toLowerCase().includes('onedrive');

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
