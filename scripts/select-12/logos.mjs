/**
 * Escudos de los once seleccionados M17 nuevos y logo del torneo.
 *
 *   node scripts/select-12/logos.mjs --plan
 *   node scripts/select-12/logos.mjs --execute
 *
 * Cinco reusan el escudo del M16 Desarrollo (`public/clubs/<id>-m16.png`, ya
 * redimensionado): una misma unión no cambia de escudo según la categoría.
 * Paraguay baja el de la URP que ya está en Storage por el M18. Los otros cinco
 * salen de Recursos con la misma cuenta que `m16-desarrollo/logos.mjs`.
 *
 * Deja los colores en `colores.json`, que es lo que el seed escribe en
 * `clubs.primary_color`, y el logo del torneo en
 * `public/competiciones/ar-select-12.png`.
 */
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

import { CLUBES_NUEVOS } from './datos.mjs';

const REPO = process.cwd();
const RECURSOS = 'C:/Users/srome/OneDrive/Documentos/________S22/Recursos/ARGENTINA';
const LOGO_TORNEO_ORIGEN = `${RECURSOS}/1080x1080/SELECCIONADOS UNIONES/WEB/SELECT 12.png`;
const LADO = 256;

const modo = process.argv.includes('--execute') ? 'execute'
  : process.argv.includes('--plan') ? 'plan' : null;
if (!modo) { console.error('usá --plan o --execute'); process.exit(2); }

/**
 * El tono más repetido del escudo salteando blanco, negro y gris. Es la misma
 * cuenta de `m16-desarrollo/logos.mjs`: `stats().dominant` de sharp devuelve el
 * fondo blanco opaco de estos PNG.
 */
async function colorDominante(entrada) {
  const { data, info } = await sharp(entrada)
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

  const colores = {};
  console.log(`modo: ${modo} · lado máximo ${LADO}px\n`);
  for (const club of CLUBES_NUEVOS) {
    const salida = path.join(destino, `${club.id}.png`);
    let buffer;
    let origenTexto;

    if (club.escudo.m16) {
      const origen = path.join(destino, `${club.escudo.m16}.png`);
      if (!fs.existsSync(origen)) throw new Error(`no está el escudo del M16 public/clubs/${club.escudo.m16}.png`);
      buffer = fs.readFileSync(origen);
      origenTexto = `public/clubs/${club.escudo.m16}.png`;
    } else if (club.escudo.url) {
      const res = await fetch(club.escudo.url);
      if (!res.ok) throw new Error(`GET ${club.escudo.url}: ${res.status}`);
      buffer = await sharp(Buffer.from(await res.arrayBuffer()))
        .resize(LADO, LADO, { fit: 'inside', withoutEnlargement: true })
        .png({ compressionLevel: 9, palette: true })
        .toBuffer();
      origenTexto = 'Storage (URP, por el M18)';
    } else {
      const origen = path.join(RECURSOS, club.escudo.recursos);
      if (!fs.existsSync(origen)) throw new Error(`no está el escudo ${origen}`);
      buffer = await sharp(origen)
        .resize(LADO, LADO, { fit: 'inside', withoutEnlargement: true })
        .png({ compressionLevel: 9, palette: true })
        .toBuffer();
      origenTexto = path.basename(origen);
    }

    if (modo === 'execute') fs.writeFileSync(salida, buffer);
    colores[club.id] = await colorDominante(buffer);
    console.log(`  ${club.id.padEnd(21)} ← ${origenTexto.padEnd(28)} ${String(Math.round(buffer.length / 1024)).padStart(3)} KB · ${colores[club.id] ?? '— blanco y negro —'}`);
  }

  // Logo del torneo: el PNG de 1080 trae el isologo en medio de un lienzo
  // blanco. Se recorta al contenido y se lleva a 256 de lado máximo, como los
  // demás logos de `public/competiciones/`.
  // Sólo el "SELECT 12" grande: el sello chico de abajo ("TORNEO UAR OFICIAL")
  // empieza en y≈735 de la versión 1080, así que se corta antes. Son dos pasos
  // porque sharp no encadena extract y trim.
  const parte = await sharp(LOGO_TORNEO_ORIGEN)
    .extract({ left: 0, top: 0, width: 1080, height: 725 })
    .toBuffer();
  const logo = await sharp(await sharp(parte).trim({ threshold: 10 }).toBuffer())
    .resize(320, 320, { fit: 'inside' })
    .png({ compressionLevel: 9 })
    .toBuffer();
  const meta = await sharp(logo).metadata();
  const salidaLogo = path.join(REPO, 'public', 'competiciones', 'ar-select-12.png');
  if (modo === 'execute') fs.writeFileSync(salidaLogo, logo);
  console.log(`\nlogo del torneo: ${meta.width}x${meta.height} · ${Math.round(logo.length / 1024)} KB → public/competiciones/ar-select-12.png`);

  const archivoColores = path.join(REPO, 'scripts', 'select-12', 'colores.json');
  if (modo === 'execute') {
    fs.writeFileSync(archivoColores, JSON.stringify(colores, null, 2) + '\n', 'utf8');
    console.log(`colores escritos: ${archivoColores}`);
  } else {
    console.log('\nmodo --plan: no se escribió ningún archivo.');
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
