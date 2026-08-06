/**
 * Le pone el escudo de URBA a los 134 torneos de 2026.
 *
 *   node src/scripts/urba-logo-2026.ts --plan
 *   node src/scripts/urba-logo-2026.ts --execute
 *
 * Va una RUTA (`/competiciones/ar-urba.png`, 36 KB en disco), no un data URI.
 * Los 811 torneos de URBA comparten un solo escudo: guardarlo embebido serían
 * ~227 MB de la misma imagen repetida, y en `tournaments` ya hay 8,8 MB en 72
 * filas que los últimos commits de performance vinieron a sacar.
 *
 * La ruta pasa por `normalizeLogoUrl` → `normalizeUrl` antes de llegar al `<img>`.
 * Esa función no contemplaba rutas desde la raíz y devolvía
 * `https:///competiciones/ar-urba.png` — inválida, y sin error: sólo el escudo
 * roto. Está arreglado en `src/lib/utils/normalize.ts`, con test.
 *
 * Ocho de los 134 ya traen su propio escudo en base64 (son torneos que existían
 * en G22 antes de URBA). Se pisan también —el pedido es que TODOS los torneos de
 * URBA lleven este logo— y el rollback los repone byte a byte.
 */
import fs from 'node:fs';
import path from 'node:path';

const REPO = process.cwd();
const LOGO = '/competiciones/ar-urba.png';
const ARCHIVO = path.join(REPO, 'public', 'competiciones', 'ar-urba.png');
const ROLLBACK = path.join(REPO, 'URBA_LOGO_ROLLBACK.sql');

const modo = process.argv.includes('--execute') ? 'execute'
  : process.argv.includes('--plan') ? 'plan' : null;
if (!modo) { console.error('usá --plan o --execute'); process.exit(2); }

const env: Record<string, string> = { ...process.env as Record<string, string> };
const envFile = path.join(REPO, '.env.local');
if (fs.existsSync(envFile)) {
  for (const l of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !env[m[1]]) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
}
const URL_BASE = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_BASE || !KEY) throw new Error('Faltan credenciales');
const H = { apikey: KEY, authorization: `Bearer ${KEY}` };

async function main() {
  // El asset tiene que existir ANTES: escribir la ruta de un archivo que no está
  // deja 134 escudos rotos y ningún error.
  if (!fs.existsSync(ARCHIVO)) throw new Error(`falta ${ARCHIVO}`);
  console.log(`modo: ${modo}\nasset: ${ARCHIVO} (${Math.round(fs.statSync(ARCHIVO).size / 1024)} KB)`);

  const res = await fetch(`${URL_BASE}/rest/v1/tournaments?select=id,external_id,name,logo_url&external_id=like.urba:*`, { headers: H });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const T = await res.json() as { id: string; external_id: string; name: string; logo_url: string | null }[];

  const sinLogo = T.filter((t) => !t.logo_url);
  const conBase64 = T.filter((t) => t.logo_url?.startsWith('data:'));
  const yaEstan = T.filter((t) => t.logo_url === LOGO);
  const otros = T.filter((t) => t.logo_url && !t.logo_url.startsWith('data:') && t.logo_url !== LOGO);

  console.log(`\ntorneos de URBA: ${T.length}`);
  console.log(`  sin logo (quedan con la ruta) : ${sinLogo.length}`);
  console.log(`  con base64 (se pisan)         : ${conBase64.length} · ${Math.round(conBase64.reduce((s, t) => s + t.logo_url!.length, 0) / 1024)} KB que se liberan`);
  console.log(`  ya con la ruta                : ${yaEstan.length}`);
  console.log(`  con otra URL                  : ${otros.length}`);
  conBase64.forEach((t) => console.log(`    pisa: ${t.external_id} ${t.name.slice(0, 44)}`));

  // ── rollback ──────────────────────────────────────────────────────────────
  const sql: string[] = [];
  sql.push('-- Rollback del logo de URBA en los 134 torneos de 2026.');
  sql.push('-- Los 8 que tenían base64 se reponen byte a byte; el resto vuelve a NULL.');
  sql.push('BEGIN;');
  sql.push('');
  sql.push('-- 1. Los que estaban en NULL');
  sql.push(`UPDATE public.tournaments SET logo_url = NULL WHERE external_id IN (${sinLogo.map((t) => `'${t.external_id}'`).join(', ') || "''"});`);
  sql.push('');
  sql.push('-- 2. Los 8 con escudo propio');
  for (const t of conBase64) {
    sql.push(`UPDATE public.tournaments SET logo_url = '${t.logo_url!.replace(/'/g, "''")}' WHERE external_id = '${t.external_id}';  -- ${t.name}`);
  }
  sql.push('');
  sql.push('COMMIT;');
  fs.writeFileSync(ROLLBACK, sql.join('\n') + '\n', 'utf8');
  console.log(`\nrollback escrito: ${ROLLBACK} (${Math.round(fs.statSync(ROLLBACK).size / 1024)} KB)`);

  if (modo === 'plan') { console.log('\nmodo --plan: no se escribió una sola fila.'); return; }

  const r = await fetch(`${URL_BASE}/rest/v1/tournaments?external_id=like.urba:*`, {
    method: 'PATCH',
    headers: { ...H, 'content-type': 'application/json', prefer: 'return=minimal' },
    body: JSON.stringify({ logo_url: LOGO }),
  });
  if (!r.ok) throw new Error(`PATCH: HTTP ${r.status} ${(await r.text()).slice(0, 300)}`);

  const v = await (await fetch(`${URL_BASE}/rest/v1/tournaments?select=external_id,logo_url&external_id=like.urba:*`, { headers: H })).json() as any[];
  const ok = v.filter((t) => t.logo_url === LOGO).length;
  console.log(`\nescrito. torneos con la ruta: ${ok} de ${v.length}`);
  if (ok !== v.length) { console.error('quedaron filas sin actualizar'); process.exit(1); }
}

main().catch((e) => { console.error(e); process.exit(1); });
