/**
 * Escudos de la carga del Dos Orillas y del Regional M19: de los originales de
 * Recursos a `public/`, redimensionados.
 *
 *   node scripts/dos-orillas/logos.mjs --plan
 *   node scripts/dos-orillas/logos.mjs --execute
 *
 * Van como ARCHIVO y la base guarda la RUTA, nunca base64.
 *
 * Son pocos: las fichas juveniles no llevan escudo (heredan el de la madre) y
 * las madres ya existían con el suyo. Entran sólo los clubes nuevos que tienen
 * original en Recursos, Brown de San Vicente —que estaba en la base sin
 * escudo— y el logo del Regional M19. San Carlos, Capibá y El Quillá no tienen
 * original: quedan con las iniciales.
 */
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

import { ESCUDO_BROWN, LOGO_TRL, MADRES } from './datos.mjs';

const REPO = process.cwd();
const ORIGEN = 'C:/Users/srome/OneDrive/Documentos/________S22/Recursos/ARGENTINA/Litoral';
const LADO = 256;

const modo = process.argv.includes('--execute') ? 'execute'
  : process.argv.includes('--plan') ? 'plan' : null;
if (!modo) { console.error('usá --plan o --execute'); process.exit(2); }

const norm = (s) => s.normalize('NFC').toLowerCase();

/** OneDrive puede devolver los nombres en NFD: se resuelve por comparación normalizada. */
function resolverArchivo(nombre) {
  const buscado = norm(nombre);
  const encontrado = fs.readdirSync(ORIGEN).find((f) => norm(f) === buscado);
  if (!encontrado) throw new Error(`no está "${nombre}" en ${ORIGEN}`);
  return path.join(ORIGEN, encontrado);
}

async function procesar(origen, destino) {
  const buffer = await sharp(origen)
    .resize(LADO, LADO, { fit: 'inside', withoutEnlargement: true })
    .png({ compressionLevel: 9, palette: true })
    .toBuffer();
  if (modo === 'execute') fs.writeFileSync(destino, buffer);
  return buffer.length;
}

async function main() {
  const destinoClubes = path.join(REPO, 'public', 'clubs');
  const destinoComp = path.join(REPO, 'public', 'competiciones');
  for (const d of [destinoClubes, destinoComp]) {
    if (!fs.existsSync(d)) throw new Error(`falta la carpeta ${d}`);
  }

  const trabajos = [
    ...Object.values(MADRES).filter((m) => m.nuevo && m.escudo)
      .map((m) => ({ origen: m.escudo, destino: path.join(destinoClubes, `${m.id}.png`) })),
    { origen: ESCUDO_BROWN.escudo, destino: path.join(destinoClubes, `${ESCUDO_BROWN.id}.png`) },
    { origen: 'M19.png', destino: path.join(REPO, 'public', LOGO_TRL.replace(/^\//, '')) },
  ];

  console.log(`modo: ${modo} · lado máximo ${LADO}px\n`);
  for (const t of trabajos) {
    const origen = resolverArchivo(t.origen);
    const peso = await procesar(origen, t.destino);
    console.log(`  ${path.relative(REPO, t.destino).padEnd(52)} ← ${t.origen.padEnd(28)} ${String(Math.round(fs.statSync(origen).size / 1024)).padStart(4)} KB → ${Math.round(peso / 1024)} KB`);
  }
  if (modo === 'plan') console.log('\nmodo --plan: no se escribió ningún archivo.');
}

main().catch((e) => { console.error(e); process.exit(1); });
