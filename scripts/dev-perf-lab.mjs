#!/usr/bin/env node
/**
 * Etapa 0 — Lanzador de la app contra el LABORATORIO (Opción B), sin tocar .env.local.
 *
 * Por qué existe: `next dev` NO carga `.env.perf-lab`, y sí carga `.env.local`
 * (producción). @next/env aplica variables de los archivos .env SOLO si no están
 * ya definidas en process.env (verificado en el código). Por eso este lanzador
 * setea las variables del laboratorio en process.env ANTES de arrancar Next: así
 * `.env.local` queda neutralizado para esas claves, sin modificar el archivo.
 *
 * Qué hace:
 *   - Carga SOLO `.env.perf-lab` (ignorado por Git).
 *   - RECHAZA arrancar si el ref/URL es de producción o si falta el ACK de lab.
 *   - Puerto dedicado (default 3100; nunca 3000).
 *   - PERF_EDIT_TRACE=true; apaga TODOS los flags de omisión (PERF_TEST_SKIP_*).
 *   - Neutraliza integraciones externas (crons/webhooks/WhatsApp/RapidAPI/MP/emails)
 *     poniéndolas en "" para que `.env.local` no las reintroduzca.
 *   - No imprime secretos (sólo ref redactado y un resumen).
 *
 * Uso:  node scripts/dev-perf-lab.mjs [--port 3100]
 */
import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';

const PROD_PROJECT_REF = 'vxsolicapdcpemfsahbk';
const EXPECTED_LAB_NAME = 'grupo22-scores-perf-lab';
const LAB_ENV_FILE = process.env.PERF_LAB_ENV_FILE || '.env.perf-lab';

// Claves de integraciones externas que se neutralizan en el laboratorio.
const NEUTRALIZE_KEYS = [
  'CRON_SECRET',
  'WHATSAPP_MATCH_WEBHOOK_SECRET',
  'N8N_MATCH_WEBHOOK_SECRET',
  'RAPIDAPI_KEY',
  'NEXT_PUBLIC_RAPIDAPI_KEY',
  'NEXT_PUBLIC_RAPIDAPI_HOST',
  'RUGBY_API_SPORTS_KEY',
  'MP_ACCESS_TOKEN',
  'MP_WEBHOOK_SECRET',
  'NEXT_PUBLIC_MP_PUBLIC_KEY',
];

function fail(msg) {
  console.error('✖ dev:perf-lab: ' + msg);
  process.exit(1);
}
function redactRef(ref) {
  if (!ref) return '(vacío)';
  return ref.length <= 6 ? ref[0] + '***' : `${ref.slice(0, 4)}…${ref.slice(-2)}`;
}
function parseEnvFile(path) {
  const out = {};
  let text = '';
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    fail(`No existe ${path}. Creá el proyecto de laboratorio y cargá sus variables ahí (ignorado por Git).`);
  }
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*(?:export\s+)?([\w.-]+)\s*=\s*(.*)\s*$/.exec(line);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    out[m[1]] = v;
  }
  return out;
}
function extractRefFromUrl(url) {
  const m = /^https?:\/\/([a-z0-9]+)\.supabase\.co/i.exec(url || '');
  return m ? m[1] : null;
}

const args = process.argv.slice(2);
const portArg = (() => {
  const i = args.indexOf('--port');
  return i >= 0 ? args[i + 1] : null;
})();
const port = String(portArg || process.env.PERF_LAB_PORT || '3100');
if (port === '3000') fail('El puerto no puede ser 3000 (ahí corre el dev server de producción).');

const lab = parseEnvFile(LAB_ENV_FILE);
const url = lab.NEXT_PUBLIC_SUPABASE_URL || '';
const urlRef = extractRefFromUrl(url);
const ref = (lab.PERF_LAB_PROJECT_REF || urlRef || '').trim();
const ack = (lab.PERF_LAB_ACK || '').trim();

// Guardas de arranque (fail-closed).
if (!url) fail(`Falta NEXT_PUBLIC_SUPABASE_URL en ${LAB_ENV_FILE}.`);
if (!lab.NEXT_PUBLIC_SUPABASE_ANON_KEY) fail(`Falta NEXT_PUBLIC_SUPABASE_ANON_KEY en ${LAB_ENV_FILE}.`);
if (!lab.SUPABASE_SERVICE_ROLE_KEY) fail(`Falta SUPABASE_SERVICE_ROLE_KEY (del LAB) en ${LAB_ENV_FILE}.`);
if (!urlRef) fail(`NEXT_PUBLIC_SUPABASE_URL no tiene formato https://<ref>.supabase.co (¿todavía con placeholders?).`);
if (!ref) fail('No se pudo determinar el project ref del laboratorio.');
if (!/^[a-z0-9]{20}$/i.test(ref)) fail(`El ref "${redactRef(ref)}" no tiene formato de project ref de Supabase (¿placeholder sin reemplazar?).`);
if (ref === PROD_PROJECT_REF || urlRef === PROD_PROJECT_REF) fail('El destino es PRODUCCIÓN. ABORTADO.');
if (urlRef !== ref) fail(`Inconsistencia URL (${redactRef(urlRef)}) vs ref (${redactRef(ref)}).`);
if (ack !== EXPECTED_LAB_NAME) fail(`Falta PERF_LAB_ACK=${EXPECTED_LAB_NAME} en ${LAB_ENV_FILE}.`);

// Componer env del hijo: base = process.env, luego lab, luego overrides de lab.
const childEnv = { ...process.env };

// 1) Variables del laboratorio (ganan sobre .env.local por precedencia de @next/env).
for (const [k, v] of Object.entries(lab)) childEnv[k] = v;

// 2) Overrides de laboratorio.
childEnv.PORT = port;
childEnv.PERF_EDIT_TRACE = 'true';
childEnv.PERF_LAB = '1';

// 3) Apagar TODOS los flags de omisión de recalculadores.
for (const k of Object.keys(childEnv)) {
  if (k.startsWith('PERF_TEST_SKIP_')) delete childEnv[k];
}

// 4) Neutralizar integraciones externas ("" cuenta como definido → .env.local no lo reintroduce).
for (const k of NEUTRALIZE_KEYS) childEnv[k] = '';

console.log('▶ Laboratorio (Opción B) — arrancando la app contra el branch remoto de PRUEBA');
console.log(`  project ref (redactado): ${redactRef(ref)}  (≠ producción)`);
console.log(`  puerto: ${port}   PERF_EDIT_TRACE=on   skip-flags=off`);
console.log(`  integraciones externas neutralizadas: ${NEUTRALIZE_KEYS.join(', ')}`);
console.log('  (.env.local NO fue modificado; sus valores de prod quedan neutralizados por precedencia de process.env)\n');

if (args.includes('--check')) {
  console.log('✔ --check: validación OK. No se arrancó Next (modo verificación).');
  process.exit(0);
}

// Arrancar Next en el puerto dedicado con el env compuesto.
const bin = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const child = spawn(bin, ['next', 'dev', '-p', port], {
  env: childEnv,
  stdio: 'inherit',
  shell: false,
});
child.on('exit', (code) => process.exit(code ?? 0));
