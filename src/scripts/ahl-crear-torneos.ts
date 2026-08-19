/**
 * Creación de los torneos de la AHL que el Boletín Competencia programa:
 *
 *   npx tsx src/scripts/ahl-crear-torneos.ts --plan
 *   npx tsx src/scripts/ahl-crear-torneos.ts --execute
 *
 * Mismo molde que fedhockeycba-crear-torneos: cada torneo nace clonando la
 * plantilla de Damas A de Córdoba (ruleset hockey 3/1/0, fase regular con su
 * settings entero), con la UNIÓN DEL LITORAL y su external_id `ahl:{slug}`.
 * El slug sale del encabezado del boletín ('CLAUSURA LITORAL "A"' →
 * clausura-litoral-a — la AHL no escribe el año en el encabezado; cuando
 * arranque 2027 el vínculo se corre al torneo nuevo).
 *
 * OJO: la AHL no publica resultados (viven en SICAH): estos torneos van a
 * tener fixture automático y marcadores manuales.
 */
import crypto from 'node:crypto';
import path from 'node:path';
import * as dotenv from 'dotenv';

import { AHL_ID_PREFIX, claveDeNombre } from '../lib/integrations/ahl/nombres.ts';

const REPO = process.cwd();
dotenv.config({ path: path.join(REPO, '.env.local') });

const URL_BASE = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
if (!URL_BASE || !KEY) { console.error('Faltan credenciales en .env.local'); process.exit(1); }
const H = { apikey: KEY, authorization: `Bearer ${KEY}` };
const EJECUTAR = process.argv.includes('--execute');

const UNION = 'asociacion-de-hockey-del-litoral';
const TORNEO_PLANTILLA = '6d74c8b8-ca1c-4997-80b2-07fd456aa968';
const FASE_PLANTILLA = 'fe78180e-e54c-4ab1-a0d7-4d11f16d6440';

const NUEVOS: { slug: string; nombre: string; gender: 'femenino' | 'masculino' }[] = [
  { slug: 'clausura-litoral-a', nombre: 'Clausura Litoral "A" 2026', gender: 'femenino' },
  { slug: 'clausura-litoral-b', nombre: 'Clausura Litoral "B" 2026', gender: 'femenino' },
  { slug: 'clausura-litoral-c', nombre: 'Clausura Litoral "C" 2026', gender: 'femenino' },
  { slug: 'clausura-litoral-d', nombre: 'Clausura Litoral "D" 2026', gender: 'femenino' },
];

async function leer<T>(recurso: string): Promise<T> {
  const res = await fetch(encodeURI(`${URL_BASE}/rest/v1/${recurso}`), { headers: H });
  if (!res.ok) throw new Error(`GET ${recurso}: ${res.status} ${await res.text()}`);
  return res.json() as Promise<T>;
}

async function escribir(recurso: string, metodo: 'PATCH' | 'POST', cuerpo: unknown): Promise<void> {
  const res = await fetch(encodeURI(`${URL_BASE}/rest/v1/${recurso}`), {
    method: metodo,
    headers: { ...H, 'content-type': 'application/json', prefer: 'return=minimal' },
    body: JSON.stringify(cuerpo),
  });
  if (!res.ok) throw new Error(`${metodo} ${recurso}: ${res.status} ${await res.text()}`);
}

async function main() {
  const existentes = await leer<{ external_id: string }[]>(
    `tournaments?select=external_id&external_id=like.${AHL_ID_PREFIX}*`,
  );
  const yaVinculados = new Set(existentes.map((t) => t.external_id));

  const [plantilla] = await leer<Record<string, unknown>[]>(`tournaments?id=eq.${TORNEO_PLANTILLA}`);
  const [fasePlantilla] = await leer<{ settings: unknown }[]>(`tournament_phases?id=eq.${FASE_PLANTILLA}&select=settings`);
  if (!plantilla || !fasePlantilla) throw new Error('No se pudo leer la plantilla');

  const pendientes = NUEVOS.filter((n) => !yaVinculados.has(`${AHL_ID_PREFIX}${n.slug}`));
  console.log(`Torneos AHL a crear (${pendientes.length}):`);
  for (const n of pendientes) console.log(`  + ${n.nombre} → ${AHL_ID_PREFIX}${n.slug}`);
  if (!EJECUTAR) { console.log('\nModo plan. Correr con --execute para aplicar.'); process.exit(0); }

  const ahora = new Date().toISOString();
  for (const n of pendientes) {
    const tournamentId = crypto.randomUUID();
    const seasonId = crypto.randomUUID();
    const slugPropio = claveDeNombre(n.nombre).replace(/ /g, '-');

    await escribir('tournaments', 'POST', [{
      id: tournamentId,
      union_id: UNION,
      season_id: '2026',
      name: n.nombre,
      slug: slugPropio,
      status: 'published',
      age_grade: 'Mayores',
      region: plantilla.region,
      country: plantilla.country,
      country_id: plantilla.country_id,
      country_name: plantilla.country_name,
      format: 'league',
      is_visible: true,
      is_active: true,
      ruleset: plantilla.ruleset,
      ruleset_version: plantilla.ruleset_version,
      sport_id: 'field-hockey',
      sport: 'field-hockey',
      sport_name: plantilla.sport_name,
      external_id: `${AHL_ID_PREFIX}${n.slug}`,
      priority: 0,
      sponsors: [],
      social_links: {},
      original_name: n.nombre,
      display_order: 0,
      is_popular: false,
      is_api_managed: false,
      review_status: 'approved',
      gender: n.gender,
      created_at: ahora,
      updated_at: ahora,
    }]);

    await escribir('tournament_seasons', 'POST', [{
      id: seasonId,
      tournament_id: tournamentId,
      legacy_tournament_id: tournamentId,
      season_code: '2026',
      name: n.nombre,
      display_name: n.nombre,
      slug: slugPropio,
      status: 'draft',
      is_active: false,
      format: 'league',
      ruleset: plantilla.ruleset,
      created_at: ahora,
      updated_at: ahora,
    }]);
    await escribir(`tournaments?id=eq.${tournamentId}`, 'PATCH', { current_season_id: seasonId });

    await escribir('tournament_phases', 'POST', [{
      id: crypto.randomUUID(),
      tournament_id: tournamentId,
      season_id: seasonId,
      name: 'Fase Regular',
      phase_type: 'league',
      order_index: 1,
      is_active: true,
      settings: fasePlantilla.settings,
      created_at: ahora,
      updated_at: ahora,
    }]);

    console.log(`  ✓ ${n.nombre} (${tournamentId})`);
  }
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
