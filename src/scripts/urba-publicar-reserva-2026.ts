/**
 * Publica los 22 torneos de reserva de 2026: Intermedia y Preintermedia.
 *
 *   node src/scripts/urba-publicar-reserva-2026.ts --plan
 *   node src/scripts/urba-publicar-reserva-2026.ts --execute
 *
 * Son exactamente el contenido del desplegable de grado de mayores. Mientras
 * sigan ocultos, el menú del Top 14 no tiene qué mostrar: sus hermanos existen
 * pero `fetchTournamentData` devuelve "not found" para un torneo con
 * `is_visible = false`, así que listarlos daría 22 links muertos.
 *
 * Se abren las tres puertas, porque cada una filtra en un lugar distinto:
 *   is_visible  la mira `isTournamentVisibleToPublic`, que es la que hoy los corta
 *   is_active   la mira la política de RLS del anónimo
 *   status      lo mira el feed del home (`=== 'published'`, estricto)
 *
 * No van a la portada: `resolveTournamentAudience` los manda a juveniles/reserva
 * y `ocultarGradosSubordinados` los saca del listado general. Se llegan por el
 * desplegable de su división, que es de lo que se trata.
 */
import fs from 'node:fs';
import path from 'node:path';

import { esGradoSubordinado } from '../lib/tournamentNavigation.ts';

const REPO = process.cwd();
const ROLLBACK = path.join(REPO, 'URBA_PUBLICAR_RESERVA_ROLLBACK.sql');
const ANIO = '2026';

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
if (!URL_BASE || !KEY || !ANON) throw new Error('Faltan credenciales (service role y anon)');
const H = { apikey: KEY, authorization: `Bearer ${KEY}` };
const HA = { apikey: ANON, authorization: `Bearer ${ANON}` };

const get = async (h: Record<string, string>, r: string) => {
  const res = await fetch(`${URL_BASE}/rest/v1/${r}`, { headers: h });
  if (!res.ok) throw new Error(`${r}: HTTP ${res.status}`);
  return await res.json() as any[];
};

async function main() {
  console.log(`modo: ${modo}`);
  const T = await get(H, `tournaments?select=id,external_id,name,subcategory,age_grade,is_visible,is_active,status&union_id=eq.urba&season_id=eq.${ANIO}`);

  const objetivo = T.filter((t) => esGradoSubordinado(t.subcategory) && !(t.is_visible && t.is_active));
  const yaOk = T.filter((t) => esGradoSubordinado(t.subcategory) && t.is_visible && t.is_active);
  const ocultosQueNoSonReserva = T.filter((t) => !t.is_visible && !esGradoSubordinado(t.subcategory));

  console.log(`\ntorneos de ${ANIO}: ${T.length}`);
  console.log(`  de reserva a publicar : ${objetivo.length}`);
  console.log(`  de reserva ya publicados: ${yaOk.length}`);
  console.log(`  ocultos que NO son reserva (no se tocan): ${ocultosQueNoSonReserva.length}`);
  ocultosQueNoSonReserva.forEach((t) => console.log(`     ! ${t.external_id} ${t.name} [${t.subcategory}]`));
  objetivo.forEach((t) => console.log(`     ${t.external_id} ${String(t.name).replace(/^URBA: /, '').slice(0, 44).padEnd(46)} [${t.subcategory}]`));

  const sql = [
    '-- Rollback de la publicación de los 22 torneos de reserva de 2026.',
    'BEGIN;',
    `UPDATE public.tournaments SET is_visible = FALSE, is_active = FALSE, status = 'draft'`,
    `  WHERE external_id IN (${objetivo.map((t) => `'${t.external_id}'`).join(', ') || "''"});`,
    'COMMIT;',
  ];
  fs.writeFileSync(ROLLBACK, sql.join('\n') + '\n', 'utf8');
  console.log(`\nrollback escrito: ${ROLLBACK}`);

  if (modo === 'plan') { console.log('\nmodo --plan: no se escribió una sola fila.'); return; }
  if (!objetivo.length) { console.log('\nno hay nada que publicar.'); return; }

  for (const t of objetivo) {
    const r = await fetch(`${URL_BASE}/rest/v1/tournaments?external_id=eq.${encodeURIComponent(t.external_id)}`, {
      method: 'PATCH',
      headers: { ...H, 'content-type': 'application/json', prefer: 'return=minimal' },
      body: JSON.stringify({ is_visible: true, is_active: true, status: 'published' }),
    });
    if (!r.ok) throw new Error(`PATCH ${t.external_id}: HTTP ${r.status} ${(await r.text()).slice(0, 200)}`);
  }
  console.log(`\npublicados: ${objetivo.length}`);

  // La verificación que vale: con la clave del visitante.
  const anonVe = await get(HA, `tournaments?select=id,subcategory&union_id=eq.urba&season_id=eq.${ANIO}`);
  // El filtro va por `esGradoSubordinado` y no por un LIKE: `%ntermedia%`
  // también matchea los `G2 Nivel 1 Intermedia` de juveniles, que no son reserva
  // y contarlos daba 31 donde tenían que ser 22.
  const anonReserva = anonVe.filter((t) => esGradoSubordinado(t.subcategory));
  console.log(`\nel anónimo ve ahora: ${anonVe.length} torneos de ${ANIO}`);
  console.log(`  de ellos, de reserva: ${anonReserva.length}`);
  if (anonReserva.length !== objetivo.length + yaOk.length) {
    console.error(`la verificación con la anon key no da lo esperado (esperaba ${objetivo.length + yaOk.length})`);
    process.exit(1);
  }
  console.log('verificado con la anon key.');
}

main().catch((e) => { console.error(e); process.exit(1); });
