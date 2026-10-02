/**
 * Escudos de los clubes de SporTI, ANTES del alta (el alta exige el archivo).
 *
 *   node scripts/sporti/escudos.mjs --plan
 *   node scripts/sporti/escudos.mjs --execute
 *
 * Por cada club de `datos.mjs` con `escudo` y sin `public/clubs/<id>.png` baja
 * el PNG de SporTI a una carpeta temporal, y después le pasa todos a
 * `scripts/escudos/variantes.mjs --carpeta BRASIL`, que deja el original, el
 * maestro 1080, la variante sobre oscuro y el de 512 en `public/clubs/`.
 * Los que ya tienen archivo no se tocan.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { CLUBES, ESCUDO_SPORTI } from './datos.mjs';

const modo = process.argv.includes('--execute') ? '--execute' : process.argv.includes('--plan') ? '--plan' : null;
if (!modo) { console.error('usá --plan o --execute'); process.exit(2); }

const REPO = process.cwd();
const TEMPORAL = path.join(os.tmpdir(), 'sporti-escudos');
fs.mkdirSync(TEMPORAL, { recursive: true });

const pendientes = CLUBES.filter((c) => c.escudo && !fs.existsSync(path.join(REPO, 'public', 'clubs', `${c.id}.png`)));
if (!pendientes.length) { console.log('todos los escudos ya están en public/clubs.'); process.exit(0); }

const pares = [];
for (const c of pendientes) {
  const destino = path.join(TEMPORAL, `${c.id}.png`);
  if (!fs.existsSync(destino)) {
    const fuente = ESCUDO_SPORTI(c.escudo);
    const res = await fetch(fuente, { headers: { 'user-agent': 'Mozilla/5.0 (compatible; G22Scores)' } });
    const tipo = res.headers.get('content-type') ?? '';
    // Un slug mal escrito puede volver 200 con una página: se mira el tipo, no el status.
    if (!res.ok || !tipo.startsWith('image/')) { console.error(`  ✗ ${c.id}: HTTP ${res.status} ${tipo} en ${fuente}`); process.exit(1); }
    fs.writeFileSync(destino, Buffer.from(await res.arrayBuffer()));
  }
  pares.push(`${destino}=${c.id}`);
}

console.log(`${pares.length} escudos para generar:`);
const r = spawnSync(process.execPath, [path.join('scripts', 'escudos', 'variantes.mjs'), '--carpeta', 'BRASIL', ...pares, modo], {
  cwd: REPO, stdio: 'inherit',
});
process.exit(r.status ?? 1);
