#!/usr/bin/env node
/**
 * Etapa 0 — Runner SEGURO de escenarios de edición (medición).
 *
 * Dispara PATCH/POST controlados contra un entorno de PRUEBAS (branch de
 * Supabase o copia local), NUNCA contra producción, para correlacionar la
 * latencia observada del cliente con las líneas `[EDIT_TRACE]` del servidor
 * (por el `x-request-id` que este script propaga).
 *
 * ── SEGURIDAD ────────────────────────────────────────────────────────────────
 *  - Aborta si NODE_ENV=production.
 *  - Exige --confirm-test-env.
 *  - Exige EDIT_TEST_SUPABASE_URL y RECHAZA cualquier project-ref de producción.
 *  - NO contiene credenciales. La autenticación se lee de variables de entorno.
 *  - No hace nada al importarse (sólo corre como `node scripts/...`).
 *  - Concurrencia baja y explícita (default 1, tope 3).
 *  - Empieza con una sola solicitud salvo que se pida repetir/concurrencia.
 *  - Incluye --dry-run (no envía nada).
 *
 * ── AUTENTICACIÓN (sin guardarla en Git) ─────────────────────────────────────
 *  Pasá la sesión/token por variables de entorno, nunca pegada en el script:
 *    export EDIT_TEST_AUTH='Bearer <token-de-prueba>'      # rutas por API key
 *    export EDIT_TEST_COOKIE='sb-...=...; sb-...=...'        # sesión de admin
 *  Obtené la cookie de una sesión de PRUEBA (login en el branch) desde las
 *  DevTools del navegador (Application → Cookies) y exportala en tu shell.
 *  Guardala en un `.env.test` que esté en .gitignore, o sólo en el shell.
 *
 * ── USO ──────────────────────────────────────────────────────────────────────
 *  export EDIT_TEST_BASE_URL='http://localhost:3000'
 *  export EDIT_TEST_SUPABASE_URL='https://<branch-ref>.supabase.co'
 *  export EDIT_TEST_COOKIE='...'
 *
 *  # Escenario 2 (corregir un resultado ya final), una sola request, dry-run:
 *  node scripts/etapa0-edit-scenarios.mjs --confirm-test-env --dry-run \
 *    --label corregir-final --method PATCH \
 *    --path '/api/admin/matches/<MATCH_ID>' --body-file ./bodies/final.json
 *
 *  # Idempotencia (misma body, distinto x-request-id, 3 veces, secuencial):
 *  node scripts/etapa0-edit-scenarios.mjs --confirm-test-env \
 *    --label idempotencia --path '/api/admin/matches/<ID>' \
 *    --body-file ./bodies/final.json --repeat 3
 *
 *  # Sonda de latencia SOLO-LECTURA (no es RTT; es latencia extremo-a-extremo):
 *  node scripts/etapa0-edit-scenarios.mjs --confirm-test-env --latency-probe 20
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const DENY_PROJECT_REFS = ['vxsolicapdcpemfsahbk']; // ref de PRODUCCIÓN conocido
const MAX_CONCURRENCY = 3;

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) {
      args[key] = true;
    } else {
      args[key] = next;
      i += 1;
    }
  }
  return args;
}

function fail(msg) {
  console.error('✖ ' + msg);
  process.exit(1);
}

function assertSafeTestEnv(args) {
  if (process.env.NODE_ENV === 'production') {
    fail('NODE_ENV=production. Este runner no se ejecuta contra producción.');
  }
  if (!args['confirm-test-env']) {
    fail('Falta --confirm-test-env (confirmación explícita de entorno de pruebas).');
  }
  const supa = process.env.EDIT_TEST_SUPABASE_URL || '';
  if (!supa) {
    fail('Falta EDIT_TEST_SUPABASE_URL: declará la Supabase del branch bajo prueba.');
  }
  for (const ref of DENY_PROJECT_REFS) {
    if (supa.includes(ref)) {
      fail(`EDIT_TEST_SUPABASE_URL contiene un project-ref de PRODUCCIÓN (${ref}). Abortado.`);
    }
  }
  const base = process.env.EDIT_TEST_BASE_URL || args['base-url'];
  if (!base) fail('Falta EDIT_TEST_BASE_URL (o --base-url).');
  for (const ref of DENY_PROJECT_REFS) {
    if (String(base).includes(ref)) fail('EDIT_TEST_BASE_URL apunta a producción. Abortado.');
  }
  return { base: String(base).replace(/\/$/, ''), supa };
}

function authHeaders() {
  const h = {};
  if (process.env.EDIT_TEST_AUTH) h.authorization = process.env.EDIT_TEST_AUTH;
  if (process.env.EDIT_TEST_COOKIE) h.cookie = process.env.EDIT_TEST_COOKIE;
  return h;
}

function redactHeaders(headers) {
  const out = {};
  for (const [k, v] of Object.entries(headers)) {
    out[k] = /^(authorization|cookie)$/i.test(k) ? '[redacted]' : v;
  }
  return out;
}

function makeRequestId(label, i) {
  const stamp = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `etapa0_${label}_${i}_${stamp}_${rand}`;
}

async function sendOne({ base, method, path, body, requestId, dryRun }) {
  const url = base + path;
  const headers = { 'content-type': 'application/json', 'x-request-id': requestId, ...authHeaders() };
  if (dryRun) {
    console.log(`  [dry-run] ${method} ${url}`);
    console.log(`            headers=${JSON.stringify(redactHeaders(headers))}`);
    console.log(`            body=${body ? JSON.stringify(body) : '(none)'}`);
    return { requestId, dryRun: true };
  }
  const t0 = Date.now();
  let status = 0;
  let ok = false;
  let errorText = null;
  try {
    const res = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    status = res.status;
    ok = res.ok;
    // No guardamos el cuerpo completo de la respuesta (puede traer datos).
    await res.text().catch(() => '');
  } catch (err) {
    errorText = err instanceof Error ? err.message : String(err);
  }
  const totalMs = Date.now() - t0;
  const record = { requestId, method, path, status, ok, totalMs, error: errorText };
  console.log(`  → ${method} ${path} [${status || 'ERR'}] ${totalMs}ms  reqId=${requestId}`);
  return record;
}

async function runWithConcurrency(tasks, concurrency) {
  const results = [];
  let idx = 0;
  const workers = Array.from({ length: concurrency }, async () => {
    while (idx < tasks.length) {
      const my = idx;
      idx += 1;
      results[my] = await tasks[my]();
    }
  });
  await Promise.all(workers);
  return results;
}

async function latencyProbe({ base, count, dryRun }) {
  const path = '/api/debug/supabase-latency';
  console.log(`Sonda de latencia OBSERVADA extremo-a-extremo (NO RTT) x${count} → ${path}`);
  console.log('  (incluye red + PostgREST + ejecución DB + transferencia; confirmá región en el dashboard)');
  const samples = [];
  for (let i = 0; i < count; i += 1) {
    const requestId = makeRequestId('latency', i);
    if (dryRun) {
      console.log(`  [dry-run] GET ${base}${path} reqId=${requestId}`);
      continue;
    }
    const t0 = Date.now();
    try {
      const res = await fetch(base + path, { headers: { 'x-request-id': requestId, ...authHeaders() } });
      await res.text().catch(() => '');
      samples.push(Date.now() - t0);
    } catch {
      /* ignore individual failures in the probe */
    }
  }
  if (samples.length) {
    samples.sort((a, b) => a - b);
    const p = (q) => samples[Math.min(samples.length - 1, Math.floor(q * samples.length))];
    console.log(`  n=${samples.length} p50=${p(0.5)}ms p95=${p(0.95)}ms min=${samples[0]}ms max=${samples[samples.length - 1]}ms`);
  }
  return { samples };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const { base } = assertSafeTestEnv(args);
  const dryRun = Boolean(args['dry-run']);
  const outDir = args.out || './.perf-results';

  if (args['latency-probe']) {
    const count = Math.max(1, Math.min(Number(args['latency-probe']) || 10, 100));
    const res = await latencyProbe({ base, count, dryRun });
    if (!dryRun) {
      mkdirSync(outDir, { recursive: true });
      writeFileSync(`${outDir}/latency-probe.json`, JSON.stringify(res, null, 2));
    }
    return;
  }

  const label = String(args.label || 'scenario').replace(/[^a-zA-Z0-9_-]/g, '');
  const method = String(args.method || 'PATCH').toUpperCase();
  // En Git Bash (Windows) un arg que empieza con "/" se convierte a ruta de
  // Windows. Usá EDIT_TEST_PATH, o MSYS_NO_PATHCONV=1, o PowerShell.
  const path = args.path || process.env.EDIT_TEST_PATH;
  if (!path) fail('Falta --path (o EDIT_TEST_PATH), p.ej. /api/admin/matches/<MATCH_ID>.');
  if (!String(path).startsWith('/')) {
    fail(
      `--path debe empezar con "/". Recibí "${path}". En Git Bash el argumento se muta: ` +
        'usá EDIT_TEST_PATH=/api/... , o MSYS_NO_PATHCONV=1, o corré el script desde PowerShell/cmd.',
    );
  }

  let body = null;
  if (args['body-file']) body = JSON.parse(readFileSync(args['body-file'], 'utf8'));
  else if (args.body) body = JSON.parse(args.body);

  const repeat = Math.max(1, Math.min(Number(args.repeat) || 1, 50));
  const concurrency = Math.max(1, Math.min(Number(args.concurrency) || 1, MAX_CONCURRENCY));

  console.log(`Escenario "${label}" | ${method} ${path} | repeat=${repeat} concurrency=${concurrency} dryRun=${dryRun}`);
  console.log('IMPORTANTE: empezá con repeat=1 y concurrency=1 y subí sólo tras confirmar que el entorno es seguro.\n');

  const tasks = Array.from({ length: repeat }, (_, i) => () =>
    sendOne({ base, method, path, body, requestId: makeRequestId(label, i), dryRun }),
  );
  const results = await runWithConcurrency(tasks, concurrency);

  if (!dryRun) {
    mkdirSync(outDir, { recursive: true });
    const file = `${outDir}/${label}.json`;
    writeFileSync(file, JSON.stringify({ label, method, path, repeat, concurrency, results }, null, 2));
    console.log(`\n✔ Resultados guardados en ${file}`);
    console.log('  Correlacioná con las líneas [EDIT_TRACE] del servidor por el x-request-id.');
  }
}

// Sólo corre como ejecutable; NO hace nada al importarse.
if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch((err) => {
    console.error('✖ Error inesperado:', err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}

export { parseArgs, assertSafeTestEnv, makeRequestId };
