/**
 * Alias para la grafía de estoeshockey.com (la fuente de RESULTADOS del
 * Litoral), curados a mano contra los clubes ya vinculados:
 *
 *   npx tsx src/scripts/ahl-seed-alias-estoeshockey.ts --plan
 *   npx tsx src/scripts/ahl-seed-alias-estoeshockey.ts --execute
 *
 * El sitio abrevia distinto que el boletín de la AHL: "J.C.R. A" donde el
 * boletín dice "JOCKEY A", "C.A.P. B" donde dice "PROVINCIAL B", "N.H.C."
 * para Newell's, "Rosario Central A" donde el boletín dice "CENTRAL".
 * Un club, varias grafías: cada una es una fila de alias, nunca un club.
 *
 * Incluye el Interprovincial de Caballeros: su torneo es de fedhockeycba
 * (lo programa Córdoba) pero estoeshockey publica SUS resultados — los alias
 * van bajo provider 'ahl' con el slug de ese torneo, que es como el
 * ahl-sync los resuelve.
 */
import path from 'node:path';
import * as dotenv from 'dotenv';

import { AHL_PROVIDER } from '../lib/integrations/ahl/nombres.ts';

const REPO = process.cwd();
dotenv.config({ path: path.join(REPO, '.env.local') });

const URL_BASE = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
if (!URL_BASE || !KEY) { console.error('Faltan credenciales en .env.local'); process.exit(1); }
const H = { apikey: KEY, authorization: `Bearer ${KEY}` };
const EJECUTAR = process.argv.includes('--execute');

/** slug → clave (ya normalizada con claveDeNombre) → club. */
const ALIAS: Record<string, Record<string, string>> = {
  'clausura-litoral-a': {
    'atletico del rosario a': 'atletico-del-rosario-a',
    'atletico del rosario b': 'atl-del-rosario-b',
    'c a f a': 'fisherton-a',
    'c a p a': 'c-a-provincial-a',
    'g e r a': 'ger-a',
    'j c r a': 'jockey-club-de-rosario-a',
    'j c r b': 'jockey-rosario-b',
    'old resian club a': 'old-resian-club-hockey',
    'somisa a': 'somisa',
  },
  'clausura-litoral-b': {
    'bancario a': 'bancario',
    'c a p b': 'provincial-b',
    'g e r b': 'ger-b',
    'j c r c': 'jockey-c',
    'logaritmo a': 'logaritmo-rugby-club-hockey',
    'los caranchos a': 'los-caranchos-hockey',
    'municipal m j a': 'municipal-mj',
    'n h c a': 'newell-s-a',
    'rowing a': 'rowing',
    'sportivo a': 'sportivo',
  },
  'clausura-litoral-c': {
    'adeo a': 'adeo',
    'atletico del rosario c': 'atl-del-rosario-c',
    'c a carcarana a': 'carcarana',
    'c a u casildense a': 'union-casildense',
    'c a f b': 'fisherton-b',
    'j c r d': 'jockey-d',
    'old resian club b': 'old-resian-b',
    'rosario central a': 'central',
    'susanense a': 'susanense',
  },
  'clausura-litoral-d': {
    'alumni a': 'alumni',
    'belgrano a': 'belgrano',
    'c almafuerte a': 'almafuerte-hockey',
    'c a p c': 'provincial-c',
    'c a p d': 'provincial-d',
    'c g r a': 'cgr',
    'cosmopolita a': 'cosmopolita',
    'g e p a': 'gep',
    'g e r c': 'ger-c',
    'j c r e': 'jockey-e',
    'j c r f': 'jockey-f',
    'n h c b': 'newell-s-b',
    'old resian club c': 'old-resian-c',
    'talleres a seco a': 'talleres-hockey',
  },
  // El torneo es fedhockeycba; los resultados los trae el ahl-sync.
  'torneo-interprovincial-caballeros-2026': {
    'cba at a': 'cordoba-athletic-club-caballeros',
    'g e r a': 'ger',
    'j c cba a': 'jockey-club-cordoba-caballeros',
    'j c r a': 'jockey-club-rosario',
    'la salle cba a': 'la-salle-h-c-caballeros',
    'palermo bajo a': 'club-palermo-bajo-caballeros',
    'uni cba a': 'club-universitario-de-cordoba-hockey-caballeros',
    'universitario a': 'universitario-rosario',
  },
};

async function main() {
  const res = await fetch(`${URL_BASE}/rest/v1/club_external_ids?select=external_id&provider=eq.${AHL_PROVIDER}&limit=3000`, { headers: H });
  if (!res.ok) throw new Error(`GET alias: ${res.status}`);
  const existentes = new Set(((await res.json()) as { external_id: string }[]).map((a) => a.external_id));

  const altas: { external_id: string; club_id: string }[] = [];
  for (const [slug, mapa] of Object.entries(ALIAS)) {
    for (const [clave, clubId] of Object.entries(mapa)) {
      const externalId = `${slug}|${clave}`;
      if (existentes.has(externalId)) continue;
      altas.push({ external_id: externalId, club_id: clubId });
      console.log(`  + ${externalId} → ${clubId}`);
    }
  }
  console.log(`Alias a sembrar: ${altas.length}`);
  if (!EJECUTAR) { console.log('\nModo plan. Correr con --execute para aplicar.'); process.exit(0); }

  if (altas.length) {
    const post = await fetch(`${URL_BASE}/rest/v1/club_external_ids`, {
      method: 'POST',
      headers: { ...H, 'content-type': 'application/json', prefer: 'return=minimal' },
      body: JSON.stringify(altas.map((a) => ({ provider: AHL_PROVIDER, ...a }))),
    });
    if (!post.ok) throw new Error(`POST alias: ${post.status} ${await post.text()}`);
  }
  console.log('Aplicado.');
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
