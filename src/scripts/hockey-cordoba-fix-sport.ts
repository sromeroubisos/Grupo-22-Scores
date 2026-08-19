/**
 * Corrección de deporte de los clubes de la Federación Cordobesa de Hockey
 * que quedaron con sport/sport_id = 'rugby' (auditoría clubes-hockey-sport-rugby.csv),
 * más los partidos de torneos field-hockey que quedaron con sport_id NULL.
 *
 *   npx tsx src/scripts/hockey-cordoba-fix-sport.ts --plan
 *   npx tsx src/scripts/hockey-cordoba-fix-sport.ts --execute
 *
 * Alcance deliberado: SOLO la unión federacion-cordobesa-de-hockey (los otros
 * 87 clubes del CSV son de otras uniones y se corrigen aparte cuando toque).
 * Verificado antes de escribir: las participaciones y partidos de estos clubes
 * son todos de torneos con sport_id = 'field-hockey' — cero referencias a rugby.
 *
 * El --execute deja HOCKEY_CORDOBA_FIX_ROLLBACK.sql con el estado previo real.
 */
import fs from 'node:fs';
import path from 'node:path';
import * as dotenv from 'dotenv';

const REPO = process.cwd();
dotenv.config({ path: path.join(REPO, '.env.local') });

const URL_BASE = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
if (!URL_BASE || !KEY) {
  console.error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local');
  process.exit(1);
}
const H = { apikey: KEY, authorization: `Bearer ${KEY}` };

const ROLLBACK = path.join(REPO, 'HOCKEY_CORDOBA_FIX_ROLLBACK.sql');
const EJECUTAR = process.argv.includes('--execute');

/** Los 8 de la unión cordobesa con el deporte mal (7 en ambas columnas, tala solo en sport_id). */
const CLUBES = [
  'club-universitario-de-cordoba-hockey',
  'club-universitario-de-cordoba-hockey-caballeros',
  'cordoba-athletic-club-hockey',
  'cordoba-athletic-club-caballeros',
  'jockey-club-cordoba-hockey',
  'tala-rugby-club-hockey',
  'unc-hockey',
  'uru-cure-rugby-club-hockey-3',
];

async function leer<T>(recurso: string): Promise<T> {
  const res = await fetch(encodeURI(`${URL_BASE}/rest/v1/${recurso}`), { headers: H });
  if (!res.ok) throw new Error(`GET ${recurso}: ${res.status} ${await res.text()}`);
  return res.json() as Promise<T>;
}

async function parchar(recurso: string, cuerpo: unknown): Promise<unknown[]> {
  const res = await fetch(encodeURI(`${URL_BASE}/rest/v1/${recurso}`), {
    method: 'PATCH',
    headers: { ...H, 'content-type': 'application/json', prefer: 'return=representation' },
    body: JSON.stringify(cuerpo),
  });
  if (!res.ok) throw new Error(`PATCH ${recurso}: ${res.status} ${await res.text()}`);
  return res.json() as Promise<unknown[]>;
}

type ClubRow = { id: string; name: string; sport: string | null; sport_id: string | null };
type TorneoRow = { id: string; name: string };
type MatchRow = { id: string; tournament_id: string; sport_id: string | null };

async function main() {
  const filtroClubes = `id=in.(${CLUBES.join(',')})`;
  const clubes = await leer<ClubRow[]>(`clubs?select=id,name,sport,sport_id&${filtroClubes}&order=id`);

  const torneos = await leer<TorneoRow[]>(`tournaments?select=id,name&sport_id=eq.field-hockey`);
  const idsTorneos = torneos.map((t) => t.id);
  const filtroPartidos = `tournament_id=in.(${idsTorneos.join(',')})&sport_id=is.null`;
  const partidos = await leer<MatchRow[]>(`matches?select=id,tournament_id,sport_id&${filtroPartidos}`);

  console.log(`Clubes a corregir (${clubes.length}):`);
  for (const c of clubes) console.log(`  - ${c.id}: sport=${c.sport} sport_id=${c.sport_id} → field-hockey`);
  console.log(`Partidos con sport_id NULL en ${idsTorneos.length} torneos field-hockey: ${partidos.length}`);

  if (!EJECUTAR) {
    console.log('\nModo plan. Correr con --execute para aplicar.');
    return;
  }

  const lineas = [
    '-- Rollback de hockey-cordoba-fix-sport.ts — estado previo capturado al ejecutar.',
    ...clubes.map((c) =>
      `UPDATE clubs SET sport = ${c.sport === null ? 'NULL' : `'${c.sport}'`}, sport_id = ${c.sport_id === null ? 'NULL' : `'${c.sport_id}'`} WHERE id = '${c.id}';`),
    ...(partidos.length
      ? [`UPDATE matches SET sport_id = NULL WHERE id IN (${partidos.map((p) => `'${p.id}'`).join(', ')});`]
      : []),
  ];
  fs.writeFileSync(ROLLBACK, lineas.join('\n') + '\n');

  const clubesHechos = await parchar(`clubs?${filtroClubes}`, { sport: 'field-hockey', sport_id: 'field-hockey' });
  console.log(`Clubes actualizados: ${clubesHechos.length}`);

  if (partidos.length) {
    const partidosHechos = await parchar(`matches?${filtroPartidos}`, { sport_id: 'field-hockey' });
    console.log(`Partidos actualizados: ${partidosHechos.length}`);
  }
  console.log(`Rollback en ${path.basename(ROLLBACK)}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
