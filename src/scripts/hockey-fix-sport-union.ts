/**
 * Corrección de deporte para los clubes de una unión de hockey que quedaron
 * con sport/sport_id = 'rugby' (auditoría clubes-hockey-sport-rugby.csv):
 *
 *   npx tsx src/scripts/hockey-fix-sport-union.ts --union=asociacion-de-hockey-del-litoral --plan
 *   npx tsx src/scripts/hockey-fix-sport-union.ts --union=asociacion-de-hockey-del-litoral --execute
 *
 * Generalización de `hockey-cordoba-fix-sport.ts` (que ya corrigió la unión
 * cordobesa): mismo criterio, la unión entra por parámetro. Antes de escribir
 * verifica que los partidos de esos clubes no referencien torneos de rugby;
 * si alguno lo hace, el club se saltea y se reporta.
 */
import fs from 'node:fs';
import path from 'node:path';
import * as dotenv from 'dotenv';

const REPO = process.cwd();
dotenv.config({ path: path.join(REPO, '.env.local') });

const URL_BASE = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
if (!URL_BASE || !KEY) { console.error('Faltan credenciales en .env.local'); process.exit(1); }
const H = { apikey: KEY, authorization: `Bearer ${KEY}` };

const UNION = process.argv.find((a) => a.startsWith('--union='))?.slice(8);
const EJECUTAR = process.argv.includes('--execute');
if (!UNION) { console.error('Falta --union=<union_id>'); process.exit(1); }

async function leer<T>(recurso: string): Promise<T> {
  const res = await fetch(encodeURI(`${URL_BASE}/rest/v1/${recurso}`), { headers: H });
  if (!res.ok) throw new Error(`GET ${recurso}: ${res.status} ${await res.text()}`);
  return res.json() as Promise<T>;
}

async function main() {
  const clubes = await leer<{ id: string; name: string; sport: string | null; sport_id: string | null }[]>(
    `clubs?select=id,name,sport,sport_id&union_id=eq.${UNION}&or=(sport.neq.field-hockey,sport_id.neq.field-hockey,sport.is.null,sport_id.is.null)`,
  );
  if (!clubes.length) { console.log(`${UNION}: todos los clubes ya están en field-hockey.`); process.exit(0); }

  // Guarda: un club cuyos partidos tocan torneos de RUGBY no se corrige a ciegas.
  const ids = clubes.map((c) => c.id);
  const partidos = await leer<{ home_club_id: string; away_club_id: string; tournaments: { sport_id: string | null } | null }[]>(
    `matches?select=home_club_id,away_club_id,tournaments(sport_id)&or=(home_club_id.in.(${ids.join(',')}),away_club_id.in.(${ids.join(',')}))&limit=2000`,
  );
  const conRugby = new Set<string>();
  for (const m of partidos) {
    if (m.tournaments?.sport_id === 'rugby') {
      for (const c of [m.home_club_id, m.away_club_id]) if (ids.includes(c)) conRugby.add(c);
    }
  }

  const corregibles = clubes.filter((c) => !conRugby.has(c.id));
  console.log(`Clubes a corregir en ${UNION} (${corregibles.length}):`);
  for (const c of corregibles) console.log(`  - ${c.id}: sport=${c.sport} sport_id=${c.sport_id} → field-hockey`);
  for (const c of clubes.filter((x) => conRugby.has(x.id))) {
    console.log(`  ! ${c.id}: tiene partidos en torneos de RUGBY — se saltea, revisar a mano`);
  }

  if (!EJECUTAR) { console.log('\nModo plan. Correr con --execute para aplicar.'); process.exit(0); }

  const rollback = corregibles.map((c) =>
    `UPDATE clubs SET sport = ${c.sport === null ? 'NULL' : `'${c.sport}'`}, sport_id = ${c.sport_id === null ? 'NULL' : `'${c.sport_id}'`} WHERE id = '${c.id}';`);
  fs.writeFileSync(path.join(REPO, `HOCKEY_FIX_${UNION.toUpperCase().replace(/-/g, '_')}_ROLLBACK.sql`), rollback.join('\n') + '\n');

  const res = await fetch(encodeURI(`${URL_BASE}/rest/v1/clubs?id=in.(${corregibles.map((c) => c.id).join(',')})`), {
    method: 'PATCH',
    headers: { ...H, 'content-type': 'application/json', prefer: 'return=representation' },
    body: JSON.stringify({ sport: 'field-hockey', sport_id: 'field-hockey' }),
  });
  if (!res.ok) throw new Error(`PATCH clubs: ${res.status} ${await res.text()}`);
  console.log(`Corregidos: ${((await res.json()) as unknown[]).length}. Rollback escrito.`);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
