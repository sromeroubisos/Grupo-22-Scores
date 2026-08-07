/**
 * Activa los torneos de URBA de 2026 que están marcados como visibles.
 *
 *   node src/scripts/urba-activar-2026.ts --plan
 *   node src/scripts/urba-activar-2026.ts --execute
 *
 * ── Por qué hacen falta DOS columnas ───────────────────────────────────────
 * `is_visible` no alcanza, y creer que sí es el error que este script existe
 * para no repetir. Hay tres puertas encadenadas, y cada una filtra distinto:
 *
 *   1. RLS   `USING (is_active = true)`. Es la única que corre en la base. Un
 *            torneo con `is_active = false` NO EXISTE para el anónimo, tenga el
 *            `is_visible` que tenga. Hoy hay 148 torneos con `is_visible = true`
 *            que el anónimo igual no ve, por esto.
 *   2. app   `isTournamentVisibleToPublic` (src/lib/tournamentReview.ts): pide
 *            `is_visible !== false`, `review_status` aprobado y un `status` que
 *            no sea archived/deleted.
 *   3. feed  `src/app/api/matches/route.ts` filtra los partidos por
 *            `tournament.status === 'published'` — ESTRICTO. `'active'` no pasa
 *            por ahí, aunque `isPublicTournamentStatus` lo acepte.
 *
 * Por eso se escribe `is_active = true` Y `status = 'published'`: es el único par
 * que atraviesa las tres. Y por eso el script no se da por terminado hasta
 * comprobar con la ANON KEY que el torneo se ve de verdad — la única prueba que
 * no depende de leer bien la política.
 *
 * Los que están en `is_visible = false` no se tocan.
 */
import fs from 'node:fs';
import path from 'node:path';

const REPO = process.cwd();
const ROLLBACK = path.join(REPO, 'URBA_ACTIVAR_ROLLBACK.sql');

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
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!URL_BASE || !KEY) throw new Error('Faltan credenciales de servicio');
if (!ANON) throw new Error('Falta NEXT_PUBLIC_SUPABASE_ANON_KEY: sin ella no se puede verificar');
const H = { apikey: KEY, authorization: `Bearer ${KEY}` };
const HA = { apikey: ANON, authorization: `Bearer ${ANON}` };

const get = async (h: Record<string, string>, recurso: string) => {
  const r = await fetch(`${URL_BASE}/rest/v1/${recurso}`, { headers: h });
  if (!r.ok) throw new Error(`${recurso}: HTTP ${r.status} ${(await r.text()).slice(0, 200)}`);
  return await r.json() as any[];
};

/** Cuántas filas ve un rol, sin traérselas. */
const contar = async (h: Record<string, string>, recurso: string) => {
  const r = await fetch(`${URL_BASE}/rest/v1/${recurso}&limit=1`, { headers: { ...h, prefer: 'count=exact' } });
  if (!r.ok) throw new Error(`${recurso}: HTTP ${r.status}`);
  return Number((r.headers.get('content-range') ?? '/0').split('/')[1]);
};

async function main() {
  console.log(`modo: ${modo}`);
  const T = await get(H, 'tournaments?select=id,external_id,name,is_visible,is_active,status,review_status&external_id=like.urba:*');
  const aActivar = T.filter((t) => t.is_visible === true);
  const seQuedan = T.filter((t) => t.is_visible !== true);

  console.log(`\ntorneos de URBA: ${T.length}`);
  console.log(`  a activar (is_visible = true) : ${aActivar.length}`);
  console.log(`  se quedan ocultos             : ${seQuedan.length}`);
  const yaOk = aActivar.filter((t) => t.is_active === true && t.status === 'published');
  console.log(`  de los primeros, ya activados : ${yaOk.length}`);
  const revisar = aActivar.filter((t) => t.review_status !== 'approved');
  console.log(`  con review_status != approved : ${revisar.length}${revisar.length ? ' <- no pasarían la puerta 2' : ''}`);

  console.log('\nANTES — lo que ve el anónimo:');
  const antesTorneos = await contar(HA, 'tournaments?select=id&external_id=like.urba:*');
  const antesPartidos = await contar(HA, 'matches?select=id&external_id=like.urba:*');
  console.log(`  torneos de URBA : ${antesTorneos}`);
  console.log(`  partidos de URBA: ${antesPartidos}`);

  const sql: string[] = [];
  sql.push('-- Rollback de la activación de los torneos de URBA 2026.');
  sql.push('-- Los devuelve a draft/inactivo, que es como entraron.');
  sql.push('BEGIN;');
  sql.push(`UPDATE public.tournaments SET is_active = FALSE, status = 'draft'`);
  sql.push(`  WHERE external_id IN (${aActivar.map((t) => `'${t.external_id}'`).join(', ') || "''"});`);
  sql.push('COMMIT;');
  fs.writeFileSync(ROLLBACK, sql.join('\n') + '\n', 'utf8');
  console.log(`\nrollback escrito: ${ROLLBACK}`);

  if (modo === 'plan') { console.log('\nmodo --plan: no se escribió una sola fila.'); return; }

  console.log('\nactivando…');
  const r = await fetch(`${URL_BASE}/rest/v1/tournaments?external_id=like.urba:*&is_visible=is.true`, {
    method: 'PATCH',
    headers: { ...H, 'content-type': 'application/json', prefer: 'return=minimal' },
    body: JSON.stringify({ is_active: true, status: 'published' }),
  });
  if (!r.ok) throw new Error(`PATCH: HTTP ${r.status} ${(await r.text()).slice(0, 300)}`);

  // ── la verificación que importa: con la clave del visitante ───────────────
  console.log('\nDESPUÉS — lo que ve el anónimo:');
  const despuesTorneos = await contar(HA, 'tournaments?select=id&external_id=like.urba:*');
  const despuesPartidos = await contar(HA, 'matches?select=id&external_id=like.urba:*');
  console.log(`  torneos de URBA : ${despuesTorneos}  (esperado ${aActivar.length})`);
  console.log(`  partidos de URBA: ${despuesPartidos}`);

  const ocultosFiltrados = await contar(HA, 'tournaments?select=id&external_id=like.urba:*&is_visible=is.false');
  console.log(`  de los ocultos, ve: ${ocultosFiltrados}  (tiene que ser 0)`);

  const muestra = await get(HA, 'tournaments?select=external_id,name,logo_url,subcategory&external_id=like.urba:*&limit=3');
  console.log('\n  muestra de lo que ve:');
  muestra.forEach((t) => console.log(`    ${t.external_id} · ${String(t.name).slice(0, 40)} · sub=${t.subcategory} · logo=${t.logo_url}`));

  if (despuesTorneos !== aActivar.length || ocultosFiltrados !== 0) {
    console.error('\nLa verificación con la anon key NO da lo esperado.');
    process.exit(1);
  }
  console.log('\nverificado con la anon key.');
}

main().catch((e) => { console.error(e); process.exit(1); });
