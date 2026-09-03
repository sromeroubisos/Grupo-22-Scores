/**
 * Recalcula las tablas de posiciones de los torneos de hockey importados que
 * quedaron sin ellas:
 *
 *   npx tsx src/scripts/hockey-recalcular-tablas.ts --plan
 *   npx tsx src/scripts/hockey-recalcular-tablas.ts --execute
 *
 * El importador recalcula al final de la corrida; si se corta antes (una
 * corrida de 57 torneos son varios miles de escrituras), los torneos quedan
 * con sus partidos pero sin tabla. Esto retoma sólo los que faltan, así que es
 * seguro correrlo de nuevo.
 */
import path from 'node:path';
import * as dotenv from 'dotenv';

const REPO = process.cwd();
dotenv.config({ path: path.join(REPO, '.env.local') });

const URL_BASE = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
if (!URL_BASE || !KEY) { console.error('Faltan credenciales en .env.local'); process.exit(1); }
const H = { apikey: KEY, authorization: `Bearer ${KEY}` };
const EJECUTAR = process.argv.includes('--execute');

async function leer<T>(recurso: string): Promise<T> {
  const res = await fetch(encodeURI(`${URL_BASE}/rest/v1/${recurso}`), { headers: H });
  if (!res.ok) throw new Error(`GET ${recurso}: ${res.status} ${await res.text()}`);
  return res.json() as Promise<T>;
}

async function main() {
  const torneos = await leer<{ id: string; name: string; external_id: string }[]>(
    'tournaments?select=id,name,external_id&or=(external_id.like.atahockey:*,external_id.like.cahockey:*)&limit=500',
  );
  // Por lotes y filtrando por estos torneos: PostgREST corta en 1000 filas y
  // `limit=20000` no lo cambia, así que pedir la tabla entera devuelve un set
  // truncado y hace pasar por "sin tabla" a torneos que sí la tienen.
  const conTabla = new Set<string>();
  for (let i = 0; i < torneos.length; i += 40) {
    const lote = torneos.slice(i, i + 40).map((t) => t.id).join(',');
    const filas = await leer<{ tournament_id: string }[]>(
      `tournament_standings?select=tournament_id&tournament_id=in.(${lote})`,
    );
    for (const f of filas) conTabla.add(f.tournament_id);
  }

  // Las fases se piden POR ESTOS torneos: pedir las primeras N de la tabla
  // entera trae las de cualquier otro deporte y deja a los nuestros "sin fase".
  const faseDe = new Map<string, string>();
  for (let i = 0; i < torneos.length; i += 40) {
    const lote = torneos.slice(i, i + 40).map((t) => t.id).join(',');
    const fases = await leer<{ id: string; tournament_id: string; order_index: number }[]>(
      `tournament_phases?select=id,tournament_id,order_index&tournament_id=in.(${lote})&order=order_index`,
    );
    for (const f of fases) if (!faseDe.has(f.tournament_id)) faseDe.set(f.tournament_id, f.id);
  }

  const faltan = torneos.filter((t) => !conTabla.has(t.id) && faseDe.has(t.id));
  console.log(`Torneos de hockey importados : ${torneos.length}`);
  console.log(`  ya tienen tabla            : ${torneos.filter((t) => conTabla.has(t.id)).length}`);
  console.log(`  a recalcular               : ${faltan.length}`);
  const sinFase = torneos.filter((t) => !faseDe.has(t.id));
  if (sinFase.length) console.log(`  SIN FASE (no se puede)     : ${sinFase.length}`);

  if (!EJECUTAR) {
    for (const t of faltan) console.log(`  · ${t.name}`);
    console.log('\nModo plan. Correr con --execute para aplicar.');
    process.exit(0);
  }

  const { recalculatePhaseStandingsScopes } = await import('../lib/server/recalculateStandings.ts');
  let ok = 0;
  const fallados: string[] = [];
  for (const t of faltan) {
    try {
      const r = await recalculatePhaseStandingsScopes(t.id, faseDe.get(t.id)!, 'general');
      if (r.ok) { ok++; console.log(`  ✓ ${t.name}`); }
      else { fallados.push(t.name); console.warn(`  ! ${t.name}: el recálculo devolvió error`); }
    } catch (e) {
      fallados.push(t.name);
      console.error(`  ✗ ${t.name}: ${String(e).slice(0, 160)}`);
    }
  }
  console.log(`\nTablas recalculadas: ${ok} de ${faltan.length}`);
  if (fallados.length) console.log(`Fallaron: ${fallados.length}`);
  process.exit(fallados.length ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
