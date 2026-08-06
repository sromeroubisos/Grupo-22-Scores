/**
 * Normaliza los 8 torneos de URBA que ya existían en G22 antes de la carga.
 *
 *   node src/scripts/urba-normalizar-preexistentes.ts --plan
 *   node src/scripts/urba-normalizar-preexistentes.ts --execute
 *
 * La carga de 2026 no los creó: los VINCULÓ por `external_id`. Por eso traen la
 * forma vieja de G22 —`age_grade = 'Mayores'`, `'Mayores (Adults)'`,
 * `'Juveniles'`; `gender` en NULL; `category` con el nombre largo— y caen en una
 * clave de competencia propia, sin hermanos ni temporadas.
 *
 * `competitionKey` ya los perdona en tiempo de lectura, pero eso es una red, no
 * un arreglo: cualquier consulta que agrupe por las columnas crudas —un GROUP BY
 * en SQL, un filtro del gestor— los sigue viendo separados. Acá se corrige el dato.
 *
 * Lo que NO se toca: el `name`. "Top 14 de la URBA" es el nombre editorial de
 * G22 y es mejor que "URBA: TOP 14 - Superior"; además no entra en ninguna clave.
 */
import fs from 'node:fs';
import path from 'node:path';

import { competitionKey } from '../lib/competitionKey.ts';

const REPO = process.cwd();
const ROLLBACK = path.join(REPO, 'URBA_PREEXISTENTES_ROLLBACK.sql');

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

/**
 * Los valores correctos salen del INVENTARIO, que es lo que URBA publica y lo
 * mismo que llevan los otros 126. No se inventan acá.
 */
const CORRECCIONES: Record<string, { category: string; age_grade: string; gender: string }> = {
  'urba:2025176': { category: 'Top 14', age_grade: 'mayores', gender: 'masculino' },
  'urba:2025177': { category: 'Primera A', age_grade: 'mayores', gender: 'masculino' },
  'urba:2025178': { category: 'Primera B', age_grade: 'mayores', gender: 'masculino' },
  'urba:2025179': { category: 'Primera C', age_grade: 'mayores', gender: 'masculino' },
  'urba:2025213': { category: 'otro', age_grade: 'M19', gender: 'masculino' },
  'urba:2025215': { category: 'otro', age_grade: 'M19', gender: 'masculino' },
  'urba:2025231': { category: 'otro', age_grade: 'M17', gender: 'masculino' },
  'urba:2025233': { category: 'otro', age_grade: 'M17', gender: 'masculino' },
};

async function main() {
  console.log(`modo: ${modo}`);
  const res = await fetch(
    `${URL_BASE}/rest/v1/tournaments?select=id,external_id,name,season_id,category,subcategory,age_grade,gender&external_id=in.(${Object.keys(CORRECCIONES).join(',')})`,
    { headers: H });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const T = await res.json() as any[];
  if (T.length !== 8) { console.error(`se esperaban 8 torneos, vinieron ${T.length}`); process.exit(1); }

  console.log('\n| external_id | category | age_grade | gender |');
  const sql: string[] = [];
  sql.push('-- Rollback de la normalización de los 8 torneos preexistentes de URBA.');
  sql.push('BEGIN;');
  let cambian = 0;
  for (const t of T) {
    const c = CORRECCIONES[t.external_id];
    const antes = competitionKey(t);
    const despues = competitionKey({ ...t, ...c });
    const mueve = t.category !== c.category || t.age_grade !== c.age_grade || t.gender !== c.gender;
    if (mueve) cambian++;
    console.log(`  ${t.external_id} ${String(t.name).slice(0, 30).padEnd(32)}`);
    console.log(`     antes:   ${String(t.category).padEnd(14)} ${String(t.age_grade).padEnd(18)} ${String(t.gender)}`);
    console.log(`     después: ${c.category.padEnd(14)} ${c.age_grade.padEnd(18)} ${c.gender}${mueve ? '' : '   (sin cambios)'}`);
    console.log(`     clave:   ${antes}  ->  ${despues}`);
    sql.push(`UPDATE public.tournaments SET category = ${t.category === null ? 'NULL' : `'${String(t.category).replace(/'/g, "''")}'`}, age_grade = ${t.age_grade === null ? 'NULL' : `'${t.age_grade}'`}, gender = ${t.gender === null ? 'NULL' : `'${t.gender}'`} WHERE external_id = '${t.external_id}';`);
  }
  sql.push('COMMIT;');
  fs.writeFileSync(ROLLBACK, sql.join('\n') + '\n', 'utf8');
  console.log(`\ntorneos que cambian: ${cambian} de 8`);
  console.log(`rollback escrito: ${ROLLBACK}`);

  if (modo === 'plan') { console.log('\nmodo --plan: no se escribió una sola fila.'); return; }

  for (const t of T) {
    const c = CORRECCIONES[t.external_id];
    const r = await fetch(`${URL_BASE}/rest/v1/tournaments?external_id=eq.${encodeURIComponent(t.external_id)}`, {
      method: 'PATCH',
      headers: { ...H, 'content-type': 'application/json', prefer: 'return=minimal' },
      body: JSON.stringify(c),
    });
    if (!r.ok) throw new Error(`PATCH ${t.external_id}: HTTP ${r.status} ${(await r.text()).slice(0, 200)}`);
  }

  const v = await (await fetch(
    `${URL_BASE}/rest/v1/tournaments?select=external_id,category,age_grade,gender&external_id=in.(${Object.keys(CORRECCIONES).join(',')})`,
    { headers: H })).json() as any[];
  const mal = v.filter((t) => {
    const c = CORRECCIONES[t.external_id];
    return t.category !== c.category || t.age_grade !== c.age_grade || t.gender !== c.gender;
  });
  console.log(`\nescrito. filas correctas: ${v.length - mal.length} de ${v.length}`);
  if (mal.length) { console.error('quedaron mal: ' + mal.map((t) => t.external_id).join(', ')); process.exit(1); }
}

main().catch((e) => { console.error(e); process.exit(1); });
