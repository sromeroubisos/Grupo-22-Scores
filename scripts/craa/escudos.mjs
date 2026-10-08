/**
 * Escudos de los equipos de la CRAA, ANTES del alta (el alta los lee de
 * `public/clubs/`).
 *
 *   node scripts/craa/escudos.mjs --plan
 *   node scripts/craa/escudos.mjs --execute
 *
 * Por cada universidad de `datos.mjs` sin `public/clubs/us-<key>.png`: baja el
 * escudo de ESPN a 500 px y, si ESPN no lo tiene, el de la CRAA (50×50: alcanza
 * para una lista, no para una placa). Después le pasa todos a
 * `scripts/escudos/variantes.mjs`, que deja el original, el maestro 1080, la
 * variante sobre oscuro y el de 512 en `public/clubs/`. El masculino y el
 * femenino de una universidad comparten el archivo; los que ya están no se tocan.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { CARPETA_ESCUDOS, ESCUDO_CRAA, ESCUDO_ESPN, UNIVERSIDADES } from './datos.mjs';

const modo = process.argv.includes('--execute') ? '--execute' : process.argv.includes('--plan') ? '--plan' : null;
if (!modo) { console.error('usá --plan o --execute'); process.exit(2); }

const REPO = process.cwd();
const TEMPORAL = path.join(os.tmpdir(), 'craa-escudos');
fs.mkdirSync(TEMPORAL, { recursive: true });

/** El PNG o null. Un id equivocado puede volver 200 con otra cosa: se mira el tipo. */
async function bajar(url) {
  const res = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 (compatible; G22Scores)' } });
  const tipo = res.headers.get('content-type') ?? '';
  if (!res.ok || !tipo.startsWith('image/')) return null;
  const buf = Buffer.from(await res.arrayBuffer());
  return buf.length > 200 ? buf : null;
}

const pendientes = UNIVERSIDADES.filter((u) => !u.escudoDe && !fs.existsSync(path.join(REPO, 'public', 'clubs', `us-${u.key}.png`)));
if (!pendientes.length) { console.log('todos los escudos ya están en public/clubs.'); process.exit(0); }

const pares = [];
const sinEscudo = [];
const deLaCraa = [];
for (const u of pendientes) {
  const destino = path.join(TEMPORAL, `us-${u.key}.png`);
  if (!fs.existsSync(destino)) {
    let buf = u.espn ? await bajar(ESCUDO_ESPN(u.espn)) : null;
    if (!buf && u.craa) {
      buf = await bajar(ESCUDO_CRAA(u.craa));
      if (buf) deLaCraa.push(u.key);
    }
    // Los que no están en ESPN ni en la CRAA (los canadienses, Indiana Tech): Wikipedia.
    if (!buf && u.wiki) buf = await bajar(u.wiki);
    if (!buf) { sinEscudo.push(u.key); continue; }
    fs.writeFileSync(destino, buf);
  }
  pares.push(`${destino}=us-${u.key}`);
}

console.log(`${pares.length} escudos para generar (${deLaCraa.length} de la CRAA a 50×50: ${deLaCraa.join(', ') || 'ninguno'})`);
if (sinEscudo.length) console.log(`sin escudo en ninguna fuente (el club queda sin logo): ${sinEscudo.join(', ')}`);
if (!pares.length) process.exit(0);

const r = spawnSync(process.execPath, [path.join('scripts', 'escudos', 'variantes.mjs'), '--carpeta', CARPETA_ESCUDOS, ...pares, modo], {
  cwd: REPO, stdio: 'inherit',
});
process.exit(r.status ?? 1);
