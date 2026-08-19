#!/usr/bin/env node
/**
 * Etapa 0 — PREFLIGHT de seguridad (SOLO LECTURA).
 *
 * Compuerta OBLIGATORIA antes de cualquier escenario de escritura. Demuestra que
 * el destino NO es producción y que el laboratorio está bien aislado. No escribe
 * nada, no muestra tokens/cookies/claves, y hace una única consulta de sólo
 * lectura contra el servidor local.
 *
 * Uso (con el server local apuntando al branch):
 *   export EDIT_TEST_BASE_URL='http://localhost:3000'
 *   export EDIT_TEST_SUPABASE_URL='https://<branch-ref>.supabase.co'
 *   node scripts/etapa0-preflight.mjs
 *
 * Sale con código != 0 si alguna validación dura falla.
 */
import { execFileSync } from 'node:child_process';

const DENY_PROJECT_REFS = ['vxsolicapdcpemfsahbk']; // ref de PRODUCCIÓN conocido
const ENV_FILE = process.env.EDIT_TEST_ENV_FILE || '.env.test';

let hardFailures = 0;
const ok = (m) => console.log('  ✔ ' + m);
const bad = (m) => {
  console.log('  ✖ ' + m);
  hardFailures += 1;
};
const warn = (m) => console.log('  • ' + m);

function redactRef(ref) {
  if (!ref) return '(vacío)';
  if (ref.length <= 6) return ref[0] + '***';
  return `${ref.slice(0, 4)}…${ref.slice(-2)}`;
}

function extractRef(url) {
  const m = /^https?:\/\/([a-z0-9]+)\.supabase\.co/i.exec(url || '');
  return m ? m[1] : null;
}

// 1 + 2. Destino ≠ producción; ref parcialmente redactado.
console.log('1-2) Destino y project ref');
const supaUrl = process.env.EDIT_TEST_SUPABASE_URL || '';
const ref = extractRef(supaUrl);
if (!supaUrl || !ref) {
  bad('EDIT_TEST_SUPABASE_URL ausente o con formato inesperado.');
} else if (DENY_PROJECT_REFS.includes(ref)) {
  bad(`El project ref es de PRODUCCIÓN (${redactRef(ref)}). ABORTAR.`);
} else {
  ok(`project ref (redactado): ${redactRef(ref)} — no está en la lista de producción.`);
}
if (process.env.NODE_ENV === 'production') bad('NODE_ENV=production.');
else ok(`NODE_ENV=${process.env.NODE_ENV || '(sin definir)'}`);

// 3. El archivo de variables del laboratorio está ignorado por Git.
console.log(`3) ${ENV_FILE} ignorado por Git`);
try {
  execFileSync('git', ['check-ignore', '-q', ENV_FILE]);
  ok(`${ENV_FILE} está en .gitignore (no se commiteará).`);
} catch {
  bad(`${ENV_FILE} NO está ignorado por Git. Agregalo a .gitignore antes de poner credenciales.`);
}

// 4. El servidor local responde (destino de prueba).
console.log('4) Servidor local');
const baseUrl = (process.env.EDIT_TEST_BASE_URL || '').replace(/\/$/, '');
if (!baseUrl) bad('Falta EDIT_TEST_BASE_URL.');
else ok(`base: ${baseUrl}`);
if (/:3000(\/|$)/.test(baseUrl)) {
  warn(
    ':3000 suele ser el server dev que usa .env.local (PRODUCCIÓN). Arrancá el server del ' +
      'laboratorio en un PUERTO DEDICADO (ej. PORT=3100) con el env del branch y apuntá acá a ese puerto.',
  );
}

// 5. Consulta de SÓLO LECTURA (sonda de latencia observada, NO RTT).
async function readOnlyProbe() {
  console.log('5) Consulta de sólo lectura (latencia observada extremo-a-extremo, NO RTT)');
  if (!baseUrl) {
    warn('omitida: falta EDIT_TEST_BASE_URL.');
    return;
  }
  const url = `${baseUrl}/api/debug/supabase-latency`;
  try {
    const t0 = Date.now();
    const res = await fetch(url, { headers: { 'x-request-id': 'etapa0-preflight' } });
    const ms = Date.now() - t0;
    await res.text().catch(() => '');
    if (res.ok) {
      ok(`GET /api/debug/supabase-latency → ${res.status} en ~${ms}ms (observado, incluye red+PostgREST+DB+transferencia).`);
      warn(
        'ATENCIÓN: alcanzar el server NO prueba que use el BRANCH. Este endpoint no revela la DB. ' +
          'Confirmá el cableado con S1: la edición de `venue` debe aparecer en el Studio del BRANCH (no en prod).',
      );
    } else {
      warn(`respondió ${res.status}. Verificá que el server local apunte al branch y el endpoint exista.`);
    }
  } catch (err) {
    warn(`no se pudo alcanzar el server local: ${err instanceof Error ? err.message : String(err)}`);
  }
}

await readOnlyProbe();

// 6 + 7. Recordatorio y veredicto.
console.log('\n6-7) Recordatorio: NO ejecutar escrituras hasta ver todos los ✔. Este preflight no escribe ni muestra secretos.');
if (hardFailures > 0) {
  console.log(`\n✖ PREFLIGHT FALLÓ (${hardFailures}). No ejecutes escenarios de escritura.`);
  process.exit(1);
}
console.log('\n✔ PREFLIGHT OK. Podés ejecutar los 3 escenarios (secuenciales, 1 request c/u).');
