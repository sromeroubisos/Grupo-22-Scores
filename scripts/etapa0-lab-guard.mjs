#!/usr/bin/env node
/**
 * Etapa 0 — GUARDA ESTRICTA contra producción (Opción B: proyecto de laboratorio).
 *
 * Valida el destino ANTES de `supabase link`. El bloqueo PRINCIPAL es la
 * comparación exacta de project ref (no depende del nombre humano). Aborta si el
 * ref está vacío, si coincide con producción, o si falta el ACK de laboratorio.
 * Nunca muestra claves; sólo refs REDACTADOS.
 *
 * Fuente del ref (en orden): variable de entorno PERF_LAB_PROJECT_REF, o el
 * archivo local `.env.perf-lab` (ignorado por Git).
 *
 * Uso:
 *   node scripts/etapa0-lab-guard.mjs
 *   # o forzando por env:
 *   PERF_LAB_PROJECT_REF=xxxx PERF_LAB_ACK=grupo22-scores-perf-lab node scripts/etapa0-lab-guard.mjs
 *
 * Sale != 0 si la validación falla. Si pasa, NO ejecuta el link: sólo imprime la
 * confirmación y el comando exacto, para que un humano lo apruebe.
 */
import { readFileSync } from 'node:fs';

const PROD_PROJECT_REF = 'vxsolicapdcpemfsahbk'; // producción — BLOQUEADO
const EXPECTED_LAB_NAME = 'grupo22-scores-perf-lab';
const LAB_ENV_FILE = process.env.PERF_LAB_ENV_FILE || '.env.perf-lab';

function redactRef(ref) {
  if (!ref) return '(vacío)';
  if (ref.length <= 6) return ref[0] + '***';
  return `${ref.slice(0, 4)}…${ref.slice(-2)}`;
}

function parseEnvFile(path) {
  const out = {};
  let text = '';
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    return out;
  }
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*(?:export\s+)?([\w.-]+)\s*=\s*(.*)\s*$/.exec(line);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    out[m[1]] = v;
  }
  return out;
}

function extractRefFromUrl(url) {
  const m = /^https?:\/\/([a-z0-9]+)\.supabase\.co/i.exec(url || '');
  return m ? m[1] : null;
}

function fail(msg) {
  console.error('✖ GUARDA: ' + msg);
  process.exit(1);
}

const fileEnv = parseEnvFile(LAB_ENV_FILE);
const ref = (process.env.PERF_LAB_PROJECT_REF || fileEnv.PERF_LAB_PROJECT_REF || '').trim();
const ack = (process.env.PERF_LAB_ACK || fileEnv.PERF_LAB_ACK || '').trim();
const urlRef = extractRefFromUrl(process.env.NEXT_PUBLIC_SUPABASE_URL || fileEnv.NEXT_PUBLIC_SUPABASE_URL);

console.log('Guarda estricta contra producción (Opción B)');
console.log(`  ref de PRODUCCIÓN (bloqueado): ${redactRef(PROD_PROJECT_REF)}`);
console.log(`  ref objetivo (laboratorio):    ${redactRef(ref)}`);

// Bloqueos duros — el principal es la comparación EXACTA de ref.
if (!ref) fail(`PERF_LAB_PROJECT_REF vacío (ni en env ni en ${LAB_ENV_FILE}). Creá el proyecto de laboratorio y cargá el ref.`);
if (ref === PROD_PROJECT_REF) fail('El ref objetivo COINCIDE con producción. ABORTADO.');
if (!/^[a-z0-9]{20}$/i.test(ref)) fail(`El ref "${redactRef(ref)}" no tiene formato de project ref de Supabase (20 chars).`);
if (urlRef && urlRef === PROD_PROJECT_REF) fail('NEXT_PUBLIC_SUPABASE_URL apunta a PRODUCCIÓN. ABORTADO.');
if (urlRef && urlRef !== ref) fail(`Inconsistencia: la URL (${redactRef(urlRef)}) no coincide con PERF_LAB_PROJECT_REF (${redactRef(ref)}).`);
if (ack !== EXPECTED_LAB_NAME) {
  fail(
    `Falta el ACK de laboratorio. Definí PERF_LAB_ACK=${EXPECTED_LAB_NAME} (en env o ${LAB_ENV_FILE}) ` +
      'para confirmar explícitamente que este ref es el del laboratorio.',
  );
}

// Confirmación (rule 7): mostrar comparación + comando, y NO ejecutar el link.
console.log('\n✔ Validación OK. Comparación: objetivo ≠ producción, formato válido, URL consistente, ACK presente.');
console.log('\nComando que se ejecutaría (con tu confirmación final):');
console.log(`  supabase link --project-ref ${redactRef(ref)}    # (ref completo tomado de PERF_LAB_PROJECT_REF)`);
console.log('\nLa guarda NO ejecutó el link. Pedí confirmación humana antes de linkear.');
