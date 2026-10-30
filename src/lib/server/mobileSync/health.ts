import 'server-only';

/**
 * Salud de la sincronización móvil: para ver un cuello de botella ANTES de que
 * lo sufran los operadores. Sale del registro (`mobile_sync_mutations`) y de lo
 * que informa cada celular (`mobile_sync_devices`).
 */
import { createAdminClient } from '@/lib/supabase/admin';

const HOUR = 3_600_000;

function percentile(values: number[], p: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] ?? null;
}

export interface SyncHealth {
  generatedAt: string;
  lastHour: {
    operations: number;
    byStatus: Record<string, number>;
    errorRate: number;
    retried: number;
    batchMs: { p50: number | null; p95: number | null };
    /** Desde que el operador cargó algo hasta que llegó a G22 (≈ tiempo sin señal + cola). */
    syncLagMs: { p50: number | null; p95: number | null };
  };
  stuckProcessing: number;
  devices: {
    activeLast15m: number;
    withPending: number;
    withFailures: number;
    worst: Array<{ userId: string; deviceId: string; platform: string | null; appVersion: string | null; pending: number; failed: number; conflicts: number; lastError: string | null; lastSeenAt: string }>;
  };
  alerts: string[];
}

export async function buildSyncHealth(): Promise<SyncHealth> {
  const admin = createAdminClient();
  const now = Date.now();
  const since = new Date(now - HOUR).toISOString();

  const [ledger, stuck, devices] = await Promise.all([
    admin.from('mobile_sync_mutations').select('result_status, duration_ms, attempts, client_created_at, finished_at').gte('finished_at', since).limit(20_000),
    admin
      .from('mobile_sync_mutations')
      .select('mutation_id', { count: 'exact', head: true })
      .eq('status', 'processing')
      .lt('updated_at', new Date(now - 2 * 60_000).toISOString()),
    admin
      .from('mobile_sync_devices')
      .select('user_id, device_id, platform, app_version, pending, failed, conflicts, last_error, last_seen_at')
      .gte('last_seen_at', new Date(now - 24 * HOUR).toISOString())
      .order('pending', { ascending: false })
      .limit(500),
  ]);
  if (ledger.error) throw ledger.error;
  if (devices.error) throw devices.error;

  const rows = (ledger.data ?? []) as Array<{ result_status: string | null; duration_ms: number | null; attempts: number | null; client_created_at: string | null; finished_at: string | null }>;
  const byStatus: Record<string, number> = {};
  for (const row of rows) byStatus[row.result_status ?? 'desconocido'] = (byStatus[row.result_status ?? 'desconocido'] ?? 0) + 1;
  const durations = rows.map((row) => row.duration_ms).filter((value): value is number => typeof value === 'number');
  const lags = rows
    .filter((row) => row.client_created_at && row.finished_at)
    .map((row) => Date.parse(row.finished_at as string) - Date.parse(row.client_created_at as string))
    .filter((value) => Number.isFinite(value) && value >= 0);
  const errors = (byStatus.error ?? 0) + (byStatus.rejected ?? 0);
  const errorRate = rows.length ? errors / rows.length : 0;

  const deviceRows = (devices.data ?? []) as Array<Record<string, any>>;
  const active = deviceRows.filter((row) => Date.parse(row.last_seen_at) >= now - 15 * 60_000);
  const worst = [...deviceRows]
    .sort((a, b) => b.pending + b.failed * 10 - (a.pending + a.failed * 10))
    .slice(0, 20)
    .map((row) => ({
      userId: row.user_id,
      deviceId: row.device_id,
      platform: row.platform ?? null,
      appVersion: row.app_version ?? null,
      pending: row.pending,
      failed: row.failed,
      conflicts: row.conflicts,
      lastError: row.last_error ?? null,
      lastSeenAt: row.last_seen_at,
    }));

  const batchP95 = percentile(durations, 95);
  const stuckCount = stuck.count ?? 0;
  const alerts: string[] = [];
  if (batchP95 !== null && batchP95 > 8_000) alerts.push(`Las tandas tardan ${Math.round(batchP95 / 1000)} s (p95): el servidor se está poniendo lento.`);
  if (rows.length >= 20 && errorRate > 0.05) alerts.push(`${Math.round(errorRate * 100)} % de las operaciones fallan o se rechazan.`);
  if (stuckCount > 0) alerts.push(`${stuckCount} operaciones quedaron a medio procesar hace más de 2 minutos.`);
  const backlog = deviceRows.filter((row) => row.pending > 100).length;
  if (backlog) alerts.push(`${backlog} dispositivos tienen más de 100 cambios sin subir.`);

  return {
    generatedAt: new Date(now).toISOString(),
    lastHour: {
      operations: rows.length,
      byStatus,
      errorRate,
      retried: rows.filter((row) => (row.attempts ?? 0) > 0).length,
      batchMs: { p50: percentile(durations, 50), p95: batchP95 },
      syncLagMs: { p50: percentile(lags, 50), p95: percentile(lags, 95) },
    },
    stuckProcessing: stuckCount,
    devices: {
      activeLast15m: active.length,
      withPending: deviceRows.filter((row) => row.pending > 0).length,
      withFailures: deviceRows.filter((row) => row.failed > 0).length,
      worst,
    },
    alerts,
  };
}
