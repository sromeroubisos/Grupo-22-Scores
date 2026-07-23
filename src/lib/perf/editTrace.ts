/**
 * Edit-path tracing (Etapa 0 — medición, no arreglo).
 *
 * Objetivo: registrar, por cada edición de partido/resultado, un resumen
 * estructurado en UNA sola línea de log con:
 *   - requestId / correlationId, endpoint, matchId, tournamentId
 *   - duración total, duración por etapa interna de updateMatch
 *   - cantidad de queries / lecturas / escrituras / rpc y su duración acumulada
 *   - queries lentas, filas leídas/escritas (aprox.)
 *   - si el ranking se reconstruyó COMPLETO o incremental, y cuántos
 *     clubes/partidos procesó
 *   - si corrió standings / playoff advancement / reseed / invalidación de caché
 *   - código HTTP final, timeout/cancelación/error, delta de RSS
 *
 * Diseño:
 *   - 100% ADITIVO y BEHAVIOR-PRESERVING. Todas las funciones son no-op
 *     cuando `PERF_EDIT_TRACE !== 'true'`. No agrega round-trips a la DB.
 *   - Usa AsyncLocalStorage (runtime nodejs) para correlacionar TODAS las
 *     queries de un request sin tener que tocar cada call-site: el fetch
 *     instrumentado (src/lib/perf/supabase.ts) reporta contra el store activo.
 *   - NO loguea cuerpos de partido, tokens ni datos personales: sólo IDs,
 *     contadores y tiempos.
 *
 * Activar:   PERF_EDIT_TRACE=true   (opcional: PERF_EDIT_SLOW_QUERY_MS=500)
 * Desactivar: quitar/ën vaciar la variable (default = apagado).
 */
/**
 * AsyncLocalStorage vive sólo en el runtime Node. Este módulo es alcanzado por
 * el cliente Supabase del browser (editTrace → perf/supabase → supabase/client),
 * así que NO podemos `import ... from 'node:async_hooks'` de forma estática:
 * Turbopack intentaría meter ese builtin en el bundle del navegador y rompe
 * TODA la app ("the chunking context does not support external modules").
 *
 * El trace es server-only (PERF_EDIT_TRACE no es NEXT_PUBLIC), por lo que en el
 * cliente estas funciones ya son no-op. Cargamos el builtin sin que el bundler
 * lo siga, vía process.getBuiltinModule; si no está disponible (navegador /
 * runtime Edge sin async_hooks), degradamos a un ALS no-op equivalente.
 */
type AsyncLocalStorageLike<T> = {
  getStore(): T | undefined;
  run<R>(store: T, fn: () => R): R;
};

function resolveAsyncLocalStorage(): AsyncLocalStorageLike<EditTraceStore> {
  const noop: AsyncLocalStorageLike<EditTraceStore> = {
    getStore: () => undefined,
    run: (_store, fn) => fn(),
  };

  const proc =
    typeof process !== 'undefined'
      ? (process as unknown as { getBuiltinModule?: (id: string) => unknown })
      : undefined;

  if (!proc || typeof proc.getBuiltinModule !== 'function') return noop;

  try {
    const mod = proc.getBuiltinModule('node:async_hooks') as {
      AsyncLocalStorage: new <T>() => AsyncLocalStorageLike<T>;
    };
    return new mod.AsyncLocalStorage<EditTraceStore>();
  } catch {
    return noop;
  }
}

export type EditTraceMeta = {
  /** Etiqueta corta del trace, p.ej. 'PATCH /api/admin/matches/[id]' o 'standings_async'. */
  label: string;
  endpoint?: string;
  matchId?: string | null;
  tournamentId?: string | null;
  /** ID único de la solicitud (header x-request-id o sintético). */
  requestId?: string | null;
  /** Enlaza un trace asíncrono (standings fire-and-forget) con su request padre. */
  correlationId?: string | null;
};

export type EditTraceQuery = {
  action: string; // 'select' | 'insert' | 'update' | 'delete' | 'rpc' | ...
  table: string;
  durationMs: number;
  rows: number;
  ok: boolean;
};

export type EditTraceStore = {
  meta: EditTraceMeta;
  startedAtMs: number;
  startRssBytes: number;
  queries: number;
  reads: number;
  writes: number;
  rpc: number;
  errorsFromDb: number;
  totalDbMs: number;
  rowsRead: number;
  rowsWritten: number;
  slowQueries: Array<{ action: string; table: string; ms: number }>;
  stageStart: Map<string, number>;
  stageMs: Map<string, number>;
  facts: Record<string, unknown>;
  httpStatus?: number;
  errored?: boolean;
  errorMessage?: string;
  emitted?: boolean;
};

const als = resolveAsyncLocalStorage();

export function isEditTraceEnabled(): boolean {
  return process.env.PERF_EDIT_TRACE === 'true';
}

function slowQueryThresholdMs(): number {
  const v = Number(process.env.PERF_EDIT_SLOW_QUERY_MS);
  return Number.isFinite(v) && v > 0 ? v : 500;
}

function nowMs(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function rssBytes(): number {
  try {
    return typeof process !== 'undefined' && typeof process.memoryUsage === 'function'
      ? process.memoryUsage().rss
      : 0;
  } catch {
    return 0;
  }
}

/** Devuelve el store activo, o undefined si el trace está apagado / fuera de contexto. */
export function getEditStore(): EditTraceStore | undefined {
  if (!isEditTraceEnabled()) return undefined;
  return als.getStore();
}

/** requestId del trace activo (para auto-correlacionar procesos derivados). */
export function getEditRequestId(): string | null {
  return getEditStore()?.meta.requestId ?? null;
}

/**
 * Ejecuta `fn` dentro de un contexto de trace. No-op (ejecuta `fn` tal cual)
 * cuando el trace está apagado. Emite una única línea `[EDIT_TRACE]` al terminar.
 */
export async function runWithEditTrace<T>(meta: EditTraceMeta, fn: () => Promise<T>): Promise<T> {
  if (!isEditTraceEnabled()) return fn();

  const store: EditTraceStore = {
    meta,
    startedAtMs: nowMs(),
    startRssBytes: rssBytes(),
    queries: 0,
    reads: 0,
    writes: 0,
    rpc: 0,
    errorsFromDb: 0,
    totalDbMs: 0,
    rowsRead: 0,
    rowsWritten: 0,
    slowQueries: [],
    stageStart: new Map(),
    stageMs: new Map(),
    facts: {},
  };

  return als.run(store, async () => {
    try {
      return await fn();
    } catch (err) {
      store.errored = true;
      store.errorMessage = err instanceof Error ? err.message : String(err);
      throw err;
    } finally {
      emitEditTrace(store);
    }
  });
}

/** Contabiliza una query contra el store activo. Llamada desde el fetch instrumentado. */
export function recordEditQuery(stat: EditTraceQuery): void {
  const store = getEditStore();
  if (!store) return;

  store.queries += 1;
  store.totalDbMs += stat.durationMs;
  if (!stat.ok) store.errorsFromDb += 1;

  if (stat.action === 'select') {
    store.reads += 1;
    store.rowsRead += stat.rows || 0;
  } else if (stat.action === 'rpc') {
    store.rpc += 1;
  } else {
    // insert / update / delete
    store.writes += 1;
    store.rowsWritten += stat.rows || 0; // aprox: sólo cuenta filas si el write pidió representation
  }

  if (stat.durationMs >= slowQueryThresholdMs() && store.slowQueries.length < 25) {
    store.slowQueries.push({ action: stat.action, table: stat.table, ms: Math.round(stat.durationMs) });
  }
}

export function traceStageStart(name: string): void {
  const store = getEditStore();
  if (!store) return;
  store.stageStart.set(name, nowMs());
}

export function traceStageEnd(name: string): void {
  const store = getEditStore();
  if (!store) return;
  const start = store.stageStart.get(name);
  if (start === undefined) return;
  const prev = store.stageMs.get(name) ?? 0;
  store.stageMs.set(name, prev + (nowMs() - start));
  store.stageStart.delete(name);
}

/** Registra hechos del trace (p.ej. rankingPath, clubes/partidos procesados). */
export function markEditTrace(patch: Record<string, unknown>): void {
  const store = getEditStore();
  if (!store) return;
  Object.assign(store.facts, patch);
}

export function setEditTraceHttp(status: number): void {
  const store = getEditStore();
  if (!store) return;
  store.httpStatus = status;
}

/**
 * Acumula un valor en una lista dentro de facts (p.ej. procesos derivados
 * omitidos por los flags de laboratorio). No-op si el trace está apagado.
 */
export function appendEditTraceFact(key: string, value: unknown): void {
  const store = getEditStore();
  if (!store) return;
  const current = store.facts[key];
  if (Array.isArray(current)) {
    if (current.length < 50) current.push(value);
  } else {
    store.facts[key] = [value];
  }
}

const MAX_ERROR_MESSAGE_LEN = 200;
const MAX_FACT_STRING_LEN = 200;
const MAX_FACT_ARRAY_LEN = 50;

/**
 * Sanitiza un mensaje de error para el log: recorta a un largo máximo y
 * redacta patrones sensibles (JWT, Bearer, claves sb_/service_role, hex/base64
 * largos). Nunca vuelca cookies/headers/cuerpos.
 */
function sanitizeErrorMessage(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let msg = String(raw).replace(/\s+/g, ' ').trim();
  msg = msg
    .replace(/eyJ[a-zA-Z0-9_-]{6,}/g, '[jwt]')
    .replace(/(bearer|token|apikey|api_key|secret|password|service_role)[=:\s"']+[^\s"']+/gi, '$1=[redacted]')
    .replace(/\b(sb_[a-z]+_[A-Za-z0-9]{6,}|sbp_[A-Za-z0-9]{6,})\b/g, '[key]')
    .replace(/\b[A-Fa-f0-9]{32,}\b/g, '[hex]');
  if (msg.length > MAX_ERROR_MESSAGE_LEN) msg = msg.slice(0, MAX_ERROR_MESSAGE_LEN) + '…';
  return msg;
}

/** Clasifica un error en una categoría corta, sin exponer el detalle. */
function classifyError(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const m = String(raw).toLowerCase();
  if (m.includes('unauthorized')) return 'unauthorized';
  if (m.includes('forbidden')) return 'forbidden';
  if (m.includes('not found') || m.includes('no existe')) return 'not_found';
  if (m.includes('timeout') || m.includes('timed out') || m.includes('57014')) return 'timeout';
  if (m.includes('abort')) return 'aborted';
  if (m.includes('statement') || m.includes('deadlock') || m.includes('connection')) return 'db_error';
  return 'other';
}

/** Acota valores de facts para evitar logs enormes (protección de rendimiento). */
function boundFactValue(value: unknown): unknown {
  if (typeof value === 'string') {
    return value.length > MAX_FACT_STRING_LEN ? value.slice(0, MAX_FACT_STRING_LEN) + '…' : value;
  }
  if (Array.isArray(value)) {
    return value.slice(0, MAX_FACT_ARRAY_LEN).map(boundFactValue);
  }
  return value;
}

function boundFacts(facts: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(facts)) out[k] = boundFactValue(v);
  return out;
}

function emitEditTrace(store: EditTraceStore): void {
  if (store.emitted) return;
  store.emitted = true;

  const totalMs = Math.round(nowMs() - store.startedAtMs);
  const rssDeltaMb = store.startRssBytes
    ? Math.round(((rssBytes() - store.startRssBytes) / 1024 / 1024) * 10) / 10
    : null;
  const stages = Object.fromEntries(
    [...store.stageMs.entries()].map(([k, v]) => [k, Math.round(v)]),
  );

  // OJO: NO es RTT. Es la latencia media observada por operación Supabase
  // (red + PostgREST + ejecución DB + transferencia). Para RTT/proximidad
  // regional usar una sonda de sólo lectura mínima (/api/debug/supabase-latency)
  // y confirmar la región en los dashboards.
  const avgObservedOpMs = store.queries > 0 ? Math.round(store.totalDbMs / store.queries) : null;

  const payload = {
    label: store.meta.label,
    endpoint: store.meta.endpoint ?? null,
    requestId: store.meta.requestId ?? null,
    correlationId: store.meta.correlationId ?? null,
    matchId: store.meta.matchId ?? null,
    tournamentId: store.meta.tournamentId ?? null,
    totalMs,
    dbMs: Math.round(store.totalDbMs),
    avgObservedOpMs, // latencia media observada/op (NO RTT)
    queries: store.queries,
    reads: store.reads,
    writes: store.writes,
    rpc: store.rpc,
    dbErrors: store.errorsFromDb,
    rowsRead: store.rowsRead,
    rowsWritten: store.rowsWritten,
    slowQueries: store.slowQueries.length,
    slowTop: store.slowQueries.slice(0, 5),
    stages,
    ...boundFacts(store.facts),
    httpStatus: store.httpStatus ?? null,
    errored: Boolean(store.errored),
    errorClass: classifyError(store.errorMessage),
    errorMessage: sanitizeErrorMessage(store.errorMessage),
    rssDeltaMb,
  };

  // Una sola línea estructurada. Sin datos de partido, sin tokens, sin PII.
  console.log('[EDIT_TRACE] ' + JSON.stringify(payload));
}

/** Extrae/sintetiza un requestId de los headers entrantes. */
function readRequestId(request: { headers: { get(name: string): string | null } }): string {
  return (
    request.headers.get('x-request-id') ||
    request.headers.get('x-correlation-id') ||
    `edit_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
  );
}

export type EditRouteMeta = {
  /** Etiqueta legible de la ruta, p.ej. 'PATCH /api/matches/[id]'. */
  routeName: string;
  /** Tipo de ruta/actor, p.ej. 'super_admin_match' | 'public_match' | 'results_api'. */
  routeType: string;
  /** Rol/tipo de actor (NO identidad ni PII). */
  actorType?: string;
};

/**
 * Wrapper común y reutilizable para instrumentar CUALQUIER ruta de edición de
 * partidos/resultados con el MISMO formato de trace. Captura el estado HTTP del
 * `Response` devuelto y marca `errored` si el handler lanza. No-op salvo
 * PERF_EDIT_TRACE=true. El handler recibe el `requestId` para correlacionar
 * procesos derivados (standings) por `correlationId`.
 */
export async function traceEditRoute(
  request: { headers: { get(name: string): string | null } },
  meta: EditRouteMeta,
  handler: (ctx: { requestId: string }) => Promise<Response>,
): Promise<Response> {
  const requestId = readRequestId(request);
  return runWithEditTrace(
    {
      label: meta.routeName,
      endpoint: meta.routeType,
      requestId,
      correlationId: request.headers.get('x-correlation-id'),
    },
    async () => {
      if (meta.actorType) markEditTrace({ actorType: meta.actorType });
      const res = await handler({ requestId });
      try {
        const status = (res as { status?: number } | null | undefined)?.status;
        if (typeof status === 'number') setEditTraceHttp(status);
      } catch {
        /* ignore */
      }
      return res;
    },
  );
}
