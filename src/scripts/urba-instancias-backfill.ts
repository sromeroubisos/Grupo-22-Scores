/**
 * Recalcula `subcategory` de los torneos de URBA y aplica lo que cambió.
 *
 *   node src/scripts/urba-instancias-backfill.ts --plan
 *   node src/scripts/urba-instancias-backfill.ts --execute
 *
 * Lo motiva un cambio puntual —`TOP 12 - Play Off` deja de decir 'Superior' y
 * pasa a decir 'Play Off'—, pero NO busca sólo eso: recorre los 811 torneos,
 * recalcula con `subcategoriaDeTorneoUrba` y lista TODA diferencia contra lo que
 * hay en la base.
 *
 * Es a propósito. Un script que busca las 5 filas que espera encuentra 5 filas y
 * no dice nada del resto; uno que recalcula todo cuenta las que se movieron sin
 * que nadie lo pidiera, que es justo lo que hay que saber antes de escribir. Si
 * el número no es el esperado, el `--plan` lo muestra y no se ejecuta nada.
 */
import fs from 'node:fs';
import path from 'node:path';

import { subcategoriaDeTorneoUrba } from '../lib/integrations/urba/externalId.ts';

const REPO = process.cwd();
const ROLLBACK = path.join(REPO, 'URBA_INSTANCIAS_ROLLBACK.sql');

/** Lo que se espera mover. Si el recálculo da otra cosa, el script frena. */
const ESPERADAS = 5;

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
if (!URL_BASE || !KEY) throw new Error('Faltan credenciales de servicio');
const H = { apikey: KEY, authorization: `Bearer ${KEY}` };

async function todas(recurso: string): Promise<any[]> {
  const out: any[] = [];
  const paso = 1000;
  for (let desde = 0; ; desde += paso) {
    const r = await fetch(`${URL_BASE}/rest/v1/${recurso}`, { headers: { ...H, range: `${desde}-${desde + paso - 1}` } });
    if (!r.ok) throw new Error(`${recurso}: HTTP ${r.status}`);
    const filas = await r.json() as any[];
    out.push(...filas);
    if (filas.length < paso) return out;
  }
}

const sql = (v: string | null) => (v === null ? 'NULL' : `'${v.replace(/'/g, "''")}'`);

async function main() {
  console.log(`modo: ${modo}\n`);
  const T = await todas('tournaments?select=id,external_id,name,season_id,subcategory&union_id=eq.urba');
  console.log(`torneos de URBA: ${T.length}`);

  const cambios = T
    .map((t) => ({ ...t, nueva: subcategoriaDeTorneoUrba(t.name) }))
    .filter((t) => (t.nueva ?? null) !== (t.subcategory ?? null));

  console.log(`filas que se mueven: ${cambios.length}\n`);
  for (const c of cambios) {
    console.log(`  ${c.season_id} · ${String(c.name).replace(/^URBA: /, '').slice(0, 44).padEnd(46)} ${String(c.subcategory)} -> ${String(c.nueva)}`);
  }

  if (cambios.length !== ESPERADAS) {
    console.error(`\nSe esperaban ${ESPERADAS} y son ${cambios.length}. No se escribe nada.`);
    console.error('Si el número nuevo es correcto, actualizá ESPERADAS y volvé a correrlo.');
    process.exit(1);
  }

  const lineas = [
    '-- Rollback del recálculo de subcategory de los torneos de URBA.',
    '-- Devuelve cada fila al valor exacto que tenía, una por una.',
    'BEGIN;',
    ...cambios.map((c) => `UPDATE public.tournaments SET subcategory = ${sql(c.subcategory)} WHERE external_id = '${c.external_id}';`),
    'COMMIT;',
  ];
  fs.writeFileSync(ROLLBACK, lineas.join('\n') + '\n', 'utf8');
  console.log(`\nrollback escrito: ${ROLLBACK}`);

  if (modo === 'plan') { console.log('\nmodo --plan: no se escribió una sola fila.'); return; }

  for (const c of cambios) {
    const r = await fetch(`${URL_BASE}/rest/v1/tournaments?external_id=eq.${encodeURIComponent(c.external_id)}`, {
      method: 'PATCH',
      headers: { ...H, 'content-type': 'application/json', prefer: 'return=minimal' },
      body: JSON.stringify({ subcategory: c.nueva }),
    });
    if (!r.ok) throw new Error(`PATCH ${c.external_id}: HTTP ${r.status} ${(await r.text()).slice(0, 200)}`);
  }
  console.log(`\naplicadas: ${cambios.length}`);

  // Verificación: volver a leer y recalcular. Cero diferencias o algo quedó mal.
  const despues = await todas('tournaments?select=id,name,subcategory&union_id=eq.urba');
  const pendientes = despues.filter((t) => (subcategoriaDeTorneoUrba(t.name) ?? null) !== (t.subcategory ?? null));
  console.log(`filas que siguen sin coincidir: ${pendientes.length}`);
  if (pendientes.length) process.exit(1);
  console.log('verificado: la base coincide con la derivación.');
}

main().catch((e) => { console.error(e); process.exit(1); });
