/**
 * Los dos menús de un torneo, calculados como los calcula la ruta.
 *
 *   node src/scripts/urba-verificar-menus.ts "Top 14"
 *   node src/scripts/urba-verificar-menus.ts            (muestra un muestreo)
 *
 * Replica /api/tournaments/[id]/navegacion con la MISMA lectura: hermanos de la
 * misma unión con `is_active = true`, más el torneo actual aunque esté inactivo.
 * Sirve para ver el efecto de publicar una temporada sin levantar el servidor —
 * la página del torneo tarda minutos contra Supabase desde acá.
 */
import fs from 'node:fs';
import path from 'node:path';

import { menuDeGrados, menuDeTemporadas, type TorneoHermano } from '../lib/tournamentNavigation.ts';

const REPO = process.cwd();
const filtro = process.argv.slice(2).find((a) => !a.startsWith('--'));

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

const COLUMNAS = 'id,name,season_id,category,subcategory,age_grade,gender';

async function main() {
  // Los hermanos: activos, como los pide la ruta.
  const hermanos = await todas(`tournaments?select=${COLUMNAS}&union_id=eq.urba&is_active=is.true`) as TorneoHermano[];
  console.log(`hermanos activos de URBA: ${hermanos.length}\n`);

  const candidatos = filtro
    ? hermanos.filter((t) => t.name.toLowerCase().includes(filtro.toLowerCase()))
    : hermanos.filter((t) => t.season_id === '2026').slice(0, 0);

  const muestra = candidatos.length ? candidatos : hermanos.filter((t) => t.season_id === '2026');
  let conTemporadas = 0;
  let conGrados = 0;

  for (const t of muestra) {
    const otros = hermanos.filter((h) => h.id !== t.id).concat(t);
    const grados = menuDeGrados(t, otros);
    const temporadas = menuDeTemporadas(t, otros);
    if (temporadas.length) conTemporadas++;
    if (grados.length) conGrados++;
    if (filtro) {
      console.log(`── ${t.name}  [${t.season_id} · ${t.subcategory}]`);
      console.log(`   grados    (${grados.length}): ${grados.map((o) => o.label + (o.esActual ? ' *' : '') + (o.detalle ? ` (${o.detalle})` : '')).join(' | ') || '(no se dibuja)'}`);
      console.log(`   temporadas(${temporadas.length}): ${temporadas.map((o) => o.label + (o.esActual ? ' *' : '') + (o.detalle ? ` (${o.detalle})` : '')).join(' | ') || '(no se dibuja)'}\n`);
    }
  }

  console.log(`sobre ${muestra.length} torneos${filtro ? ` que matchean "${filtro}"` : ' de 2026'}:`);
  console.log(`  con menú de grado    : ${conGrados}`);
  console.log(`  con menú de temporada: ${conTemporadas}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
