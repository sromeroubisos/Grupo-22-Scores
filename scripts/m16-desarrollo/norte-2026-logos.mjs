/**
 * Escudos de los siete seleccionados M16 nuevos del Desarrollo Norte 2026.
 *
 *   node scripts/m16-desarrollo/norte-2026-logos.mjs --plan
 *   node scripts/m16-desarrollo/norte-2026-logos.mjs --execute
 *
 * Cinco juegan también el Argentino Juvenil M17 y usan ESE escudo: se copia el
 * archivo ya redimensionado de `public/clubs/<id>-m17.png` y el color sale de
 * `argentino-juvenil/colores.json`, así las dos fichas de una misma unión no
 * difieren ni en un píxel. Los otros dos (Misiones, Santiagueña) salen de
 * Recursos con la misma cuenta que `logos.mjs`.
 *
 * Deja los colores en `norte-2026-colores.json`, que es lo que el seed escribe
 * en `clubs.primary_color`.
 */
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

import { CLUBES_NUEVOS } from './norte-2026-datos.mjs';

const REPO = process.cwd();
const RECURSOS = 'C:/Users/srome/OneDrive/Documentos/________S22/Recursos/ARGENTINA';
const LADO = 256;

const modo = process.argv.includes('--execute') ? 'execute'
  : process.argv.includes('--plan') ? 'plan' : null;
if (!modo) { console.error('usá --plan o --execute'); process.exit(2); }

/**
 * El tono más repetido del escudo salteando blanco, negro y gris. Es la misma
 * cuenta de `logos.mjs` —el porqué está ahí—: `stats().dominant` de sharp
 * devuelve el fondo blanco opaco de estos PNG.
 */
async function colorDominante(archivo) {
  const { data, info } = await sharp(archivo)
    .resize(64, 64, { fit: 'inside' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const cuentas = new Map();
  for (let i = 0; i < data.length; i += info.channels) {
    const [r, g, b, a] = [data[i], data[i + 1], data[i + 2], data[i + 3]];
    if (a < 128) continue;
    const max = Math.max(r, g, b); const min = Math.min(r, g, b);
    if (max > 235 && min > 215) continue;
    if (max < 40) continue;
    if (max - min < 30) continue;
    const balde = `${r >> 4},${g >> 4},${b >> 4}`;
    const previo = cuentas.get(balde) || { n: 0, r: 0, g: 0, b: 0 };
    cuentas.set(balde, { n: previo.n + 1, r: previo.r + r, g: previo.g + g, b: previo.b + b });
  }
  if (!cuentas.size) return null;

  const top = [...cuentas.values()].sort((a, b) => b.n - a.n)[0];
  const hex = (n) => Math.round(n).toString(16).padStart(2, '0');
  return `#${hex(top.r / top.n)}${hex(top.g / top.n)}${hex(top.b / top.n)}`;
}

async function main() {
  const destino = path.join(REPO, 'public', 'clubs');
  if (!fs.existsSync(destino)) throw new Error(`falta la carpeta ${destino}`);
  const coloresM17 = JSON.parse(fs.readFileSync(path.join(REPO, 'scripts', 'argentino-juvenil', 'colores.json'), 'utf8'));

  const colores = {};
  console.log(`modo: ${modo} · lado máximo ${LADO}px\n`);
  for (const club of CLUBES_NUEVOS) {
    const salida = path.join(destino, `${club.id}.png`);

    if (club.escudo.m17) {
      const origen = path.join(destino, `${club.escudo.m17}.png`);
      if (!fs.existsSync(origen)) throw new Error(`no está el escudo del M17 public/clubs/${club.escudo.m17}.png`);
      if (!(club.escudo.m17 in coloresM17)) throw new Error(`no hay color para ${club.escudo.m17} en argentino-juvenil/colores.json`);
      if (modo === 'execute') fs.copyFileSync(origen, salida);
      colores[club.id] = coloresM17[club.escudo.m17];
      console.log(`  ${club.id.padEnd(17)} ← public/clubs/${club.escudo.m17}.png  ${String(Math.round(fs.statSync(origen).size / 1024)).padStart(3)} KB · ${colores[club.id] ?? '— blanco y negro —'}`);
      continue;
    }

    const origen = path.join(RECURSOS, club.escudo.recursos);
    if (!fs.existsSync(origen)) throw new Error(`no está el escudo ${origen}`);
    const buffer = await sharp(origen)
      .resize(LADO, LADO, { fit: 'inside', withoutEnlargement: true })
      .png({ compressionLevel: 9, palette: true })
      .toBuffer();
    if (modo === 'execute') fs.writeFileSync(salida, buffer);
    colores[club.id] = await colorDominante(origen);
    console.log(`  ${club.id.padEnd(17)} ← ${path.basename(origen).padEnd(26)} ${String(Math.round(fs.statSync(origen).size / 1024)).padStart(4)} KB → ${String(Math.round(buffer.length / 1024)).padStart(3)} KB · ${colores[club.id] ?? '— blanco y negro —'}`);
  }

  const archivoColores = path.join(REPO, 'scripts', 'm16-desarrollo', 'norte-2026-colores.json');
  if (modo === 'execute') {
    fs.writeFileSync(archivoColores, JSON.stringify(colores, null, 2) + '\n', 'utf8');
    console.log(`\ncolores escritos: ${archivoColores}`);
  } else {
    console.log('\nmodo --plan: no se escribió ningún archivo.');
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
