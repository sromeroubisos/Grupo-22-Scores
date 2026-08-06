/**
 * Reemplaza el literal `'juvenil'` de `tournaments.subcategory` por el eje real.
 *
 *   node src/scripts/urba-eje-juvenil-backfill.ts --plan
 *   node src/scripts/urba-eje-juvenil-backfill.ts --execute
 *
 * Toca SÓLO los torneos de URBA con `age_grade` juvenil (M15…M20). Ni mayores,
 * ni M22, ni femenino, ni universitario.
 *
 * El valor sale de `subcategoriaDeTorneoUrba`, que es la única fuente de esa
 * columna — la misma que usa la carga y la que usa el cron para reportar un
 * torneo nuevo. Si acá se calculara aparte, los torneos que entren mañana
 * quedarían clasificados distinto que los 557 de hoy, en silencio.
 */
import fs from 'node:fs';
import path from 'node:path';

import { subcategoriaDeTorneoUrba } from '../lib/integrations/urba/externalId.ts';
import { ejeJuvenil, ruedaDeTorneoUrba } from '../lib/integrations/urba/ejeJuvenil.ts';

const REPO = process.cwd();
const ROLLBACK = path.join(REPO, 'URBA_EJE_JUVENIL_ROLLBACK.sql');

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

const EDADES_JUVENILES = ['M15', 'M16', 'M17', 'M18', 'M19', 'M20'];

async function selectAll<T = any>(recurso: string): Promise<T[]> {
  const filas: T[] = [];
  for (let desde = 0; ; desde += 1000) {
    const res = await fetch(`${URL_BASE}/rest/v1/${recurso}`, { headers: { ...H, range: `${desde}-${desde + 999}` } });
    if (!res.ok) throw new Error(`${recurso}: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
    const chunk = await res.json() as T[];
    filas.push(...chunk);
    if (chunk.length < 1000) break;
  }
  return filas;
}

async function main() {
  console.log(`modo: ${modo}\nleyendo…`);
  const T = await selectAll<{ id: string; external_id: string; name: string; season_id: string; age_grade: string; category: string; subcategory: string | null }>(
    'tournaments?select=id,external_id,name,season_id,age_grade,category,subcategory&external_id=like.urba:*');
  const juv = T.filter((t) => EDADES_JUVENILES.includes(String(t.age_grade)));
  console.log(`  torneos de URBA ${T.length} · juveniles ${juv.length}`);

  const cambios = juv
    .map((t) => ({ t, nuevo: subcategoriaDeTorneoUrba(t.name) }))
    .filter((c) => c.nuevo !== c.t.subcategory);
  const sinEje = juv.filter((t) => !ejeJuvenil(t.name));

  console.log(`  filas que cambian: ${cambios.length}`);
  console.log(`  sin eje derivable: ${sinEje.length}`);
  sinEje.slice(0, 10).forEach((t) => console.log(`     ${t.external_id} ${t.season_id} · ${t.name}`));

  const valores = new Set(cambios.map((c) => c.nuevo));
  console.log(`  valores distintos que quedarían: ${valores.size}`);
  console.log('\n  muestra:');
  cambios.slice(0, 8).forEach((c) => console.log(`     ${c.t.name.replace(/^URBA: /, '').slice(0, 56).padEnd(58)} ${String(c.t.subcategory)} -> ${c.nuevo}`));

  // ── rollback ──────────────────────────────────────────────────────────────
  const sql: string[] = [];
  sql.push('-- Rollback del eje juvenil en tournaments.subcategory.');
  sql.push(`-- ${cambios.length} filas, con su valor exacto anterior.`);
  sql.push('BEGIN;');
  for (const c of cambios) {
    const antes = c.t.subcategory === null ? 'NULL' : `'${c.t.subcategory.replace(/'/g, "''")}'`;
    sql.push(`UPDATE public.tournaments SET subcategory = ${antes} WHERE external_id = '${c.t.external_id}';`);
  }
  sql.push('COMMIT;');
  fs.writeFileSync(ROLLBACK, sql.join('\n') + '\n', 'utf8');
  console.log(`\nrollback escrito: ${ROLLBACK}`);

  if (modo === 'plan') { console.log('\nmodo --plan: no se escribió una sola fila.'); return; }

  console.log('\nescribiendo…');
  let hechos = 0;
  for (const c of cambios) {
    const r = await fetch(`${URL_BASE}/rest/v1/tournaments?external_id=eq.${encodeURIComponent(c.t.external_id)}`, {
      method: 'PATCH',
      headers: { ...H, 'content-type': 'application/json', prefer: 'return=minimal' },
      body: JSON.stringify({ subcategory: c.nuevo }),
    });
    if (!r.ok) { console.error(`  ! ${c.t.external_id}: HTTP ${r.status} ${(await r.text()).slice(0, 160)}`); continue; }
    hechos++;
    if (hechos % 100 === 0) console.log(`  ${hechos}/${cambios.length}`);
  }
  console.log(`  ${hechos}/${cambios.length}`);

  // ── verificación, contra la base ─────────────────────────────────────────
  const despues = await selectAll<{ external_id: string; name: string; season_id: string; age_grade: string; category: string; subcategory: string | null }>(
    'tournaments?select=external_id,name,season_id,age_grade,category,subcategory&external_id=like.urba:*');
  const j2 = despues.filter((t) => EDADES_JUVENILES.includes(String(t.age_grade)));
  const distintos = new Set(j2.map((t) => t.subcategory));
  const nulos = j2.filter((t) => !t.subcategory).length;
  const literal = j2.filter((t) => t.subcategory === 'juvenil').length;

  const divs = new Map<string, string[]>();
  for (const t of j2) {
    const k = `${t.season_id}|${t.category}|${t.age_grade}`;
    if (!divs.has(k)) divs.set(k, []);
    divs.get(k)!.push(String(t.subcategory));
  }
  const utiles = [...divs.values()].filter((v) => new Set(v).size > 1).length;
  const ruedas = new Set(j2.map((t) => ruedaDeTorneoUrba(t.name)));

  console.log('\n── verificación ──────────────────────────────────');
  console.log(`  valores distintos            : ${distintos.size}`);
  console.log(`  divisiones                   : ${divs.size}`);
  console.log(`  con desplegable útil (>1 val): ${utiles}`);
  console.log(`  torneos sin eje (NULL o literal 'juvenil'): ${nulos + literal}`);
  console.log(`  ruedas presentes             : ${[...ruedas].join(', ')}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
