// Procesa los logos de las uniones para el selector de ligas.
//
//   node scripts/regiones-uniones/logos.mjs
//
// Lee de la carpeta de recursos (1080x1080 con FONDO BLANCO), y por cada unión:
//   1. saca el fondo: sólo el blanco CONECTADO a los bordes, así los blancos de
//      adentro del escudo (letras, óvalos) se conservan;
//   2. recorta al contenido y lo centra en 160x160 con aire;
//   3. calcula dos colores dominantes, que son los del degradé del bloque.
//
// Escribe `public/uniones/<union-id>.png` y `scripts/regiones-uniones/colores.json`.
// El TS que lee la app (`src/lib/unionBrand.ts`) sale de ese JSON, para que los
// colores no se calculen en el navegador.

import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { dominantes } from './colores.mjs';

const ORIGEN = 'C:/Users/srome/OneDrive/Documentos/________S22/Recursos/ARGENTINA/SELECCIONADOS UNIONES';
const SALIDA = path.resolve('public/uniones');
const JSON_SALIDA = path.resolve('scripts/regiones-uniones/colores.json');

// id de `unions` -> archivo del logo.
const LOGOS = {
  'urba': 'WEB/URBA.png',
  'uroba': 'WEB/UROBA.png',
  'urne': 'WEB/URNE.png',
  'union-austral': 'WEB/Austral.png',
  'union-de-rugby-de-alto-valle': 'WEB/Alto Valle.png',
  'union-andina-de-rugby': 'WEB/Andina.png',
  '0c515ac1-af49-4699-b3c5-7273bc424357': 'WEB/CORDOBESA.png',
  'union-de-rugby-del-valle-del-chubut': 'WEB/Chubut.png',
  '40159cd1-5876-4720-b953-d639b09d5f5b': 'WEB/Cuyo.png',
  'union-entrerriana-de-rugby': 'WEB/Entre Ríos.png',
  'union-de-rugby-de-formosa': 'WEB/Formosa.png',
  'union-de-rugby-de-mar-del-plata': 'WEB/Mar del Plata.png',
  'a37639f8-197c-44c6-a095-2f16f40d7b04': 'WEB/Rosario.png',
  '4263f793-04d6-4dd9-9b43-b7e9823bf721': 'WEB/Salta.png',
  '765e6c46-b1c1-4e44-8490-aa0085ebeb99': 'WEB/San Juan.png',
  'union-santafesina-de-rugby': 'WEB/Santa Fé.png',
  'union-santiaguena-de-rugby': 'WEB/Santiago del Estero.png',
  'union-de-rugby-del-sur': 'WEB/Sur.png',
  'union-de-rugby-de-tierra-del-fuego': 'WEB/Tierra del Fuego.png',
  'e558d0d9-c01b-40ce-a1c7-e533cb81f97c': 'WEB/Tucumán.png',
  'union-de-rugby-de-misiones': 'MISIONES.png',
  // Hockey: las únicas entidades con logo en la carpeta de recursos.
  'federacion-internacional-de-hockey': '../../HOCKEY/FIH-STARS-2026.png',
  '39b95e30-ede4-48e1-a5e5-588b0fb3eb3c': '../../HOCKEY/PAHF.png',
  // Asociaciones de hockey: __GRUPO 22/RECURSOS/HOCKEY (sube tres niveles, hasta ________S22).
  'confederacion-argentina-de-hockey': '../../../__GRUPO 22/RECURSOS/HOCKEY/SELECCIONES/ARGENTINA.png',
  'asociacion-amateur-de-hockey-sobre-cesped-buenos-aires': '../../../__GRUPO 22/RECURSOS/HOCKEY/UNIONES/BUENOS AIRES.png',
  'asociacion-amateur-marplatense-de-hockey': '../../../__GRUPO 22/RECURSOS/HOCKEY/UNIONES/MAR DEL PLATA.png',
  'federacion-cordobesa-de-hockey': '../../../__GRUPO 22/RECURSOS/HOCKEY/UNIONES/CORDOBESA.png',
  'asociacion-de-hockey-del-litoral': '../../../__GRUPO 22/RECURSOS/HOCKEY/UNIONES/LITORAL.png',
  'asociacion-tucumana-amateur-de-hockey': '../../../__GRUPO 22/RECURSOS/HOCKEY/UNIONES/TUCUMAN.png',
  'asociacion-mendocina-de-hockey-sobre-cesped': '../../../__GRUPO 22/RECURSOS/HOCKEY/UNIONES/MENDOZA.png',
  'federacion-chilena-de-hockey-cesped': '../../../__GRUPO 22/RECURSOS/HOCKEY/UNIONES/Chilena.png',
};

const TAM = 160;
const blanco = (r, g, b) => Math.min(r, g, b) >= 232;

function quitarFondo(data, w, h) {
  const visto = new Uint8Array(w * h);
  const pila = [];
  const empujar = (x, y) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const i = y * w + x;
    if (visto[i]) return;
    const o = i * 4;
    if (data[o + 3] === 0 || blanco(data[o], data[o + 1], data[o + 2])) { visto[i] = 1; pila.push(i); }
  };
  for (let x = 0; x < w; x++) { empujar(x, 0); empujar(x, h - 1); }
  for (let y = 0; y < h; y++) { empujar(0, y); empujar(w - 1, y); }
  while (pila.length) {
    const i = pila.pop();
    const x = i % w, y = (i - x) / w;
    data[i * 4 + 3] = 0;
    empujar(x + 1, y); empujar(x - 1, y); empujar(x, y + 1); empujar(x, y - 1);
  }
  // Borde: los píxeles claros pegados al fondo sacado pierden opacidad en vez de
  // dejar un halo blanco.
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      if (visto[i]) continue;
      if (!(visto[i - 1] || visto[i + 1] || visto[i - w] || visto[i + w])) continue;
      const o = i * 4;
      const m = Math.min(data[o], data[o + 1], data[o + 2]);
      if (m >= 200) data[o + 3] = Math.round(255 * Math.max(0, (255 - m) / 55));
    }
  }
}

function cajaOpaca(data, w, h) {
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (data[(y * w + x) * 4 + 3] > 24) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  return { left: x0, top: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 };
}

async function procesar(id, archivo) {
  const origen = path.join(ORIGEN, archivo);
  if (!fs.existsSync(origen)) return { id, error: 'no existe: ' + archivo };
  const { data, info } = await sharp(origen).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  quitarFondo(data, w, h);
  const caja = cajaOpaca(data, w, h);
  const colores = dominantes(data, w, h);
  const recortado = await sharp(data, { raw: { width: w, height: h, channels: 4 } })
    .extract(caja)
    .resize(Math.round(TAM * 0.88), Math.round(TAM * 0.88), { fit: 'inside' })
    .png()
    .toBuffer();
  await sharp({ create: { width: TAM, height: TAM, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: recortado, gravity: 'centre' }])
    .png({ compressionLevel: 9 })
    .toFile(path.join(SALIDA, `${id}.png`));
  return { id, colores };
}

async function main() {
  fs.mkdirSync(SALIDA, { recursive: true });
  const resultado = {};
  for (const [id, archivo] of Object.entries(LOGOS)) {
    const r = await procesar(id, archivo);
    if (r.error) { console.log('✗', id, r.error); continue; }
    resultado[id] = { logo: `/uniones/${id}.png`, c1: r.colores?.[0] ?? null, c2: r.colores?.[1] ?? null };
    console.log('✓', id.padEnd(40), resultado[id].c1, resultado[id].c2);
  }
  fs.writeFileSync(JSON_SALIDA, JSON.stringify(resultado, null, 2) + '\n');
  escribirTs(resultado);
  console.log('\n', Object.keys(resultado).length, 'logos en', SALIDA);
}

// Logos sin color propio (blanco y negro, o grises): el cálculo no encuentra
// identidad que extraer y se fija a mano para que el bloque no quede sin degradé.
const A_MANO = {
  'uroba': { c1: '#6b7785', c2: '#38414c' },
  'union-de-rugby-del-valle-del-chubut': { c1: '#3d4654', c2: '#1d232c' },
};

function escribirTs(resultado) {
  const filas = Object.entries(resultado).map(([id, r]) => {
    const m = A_MANO[id] ?? {};
    const c1 = m.c1 ?? r.c1 ?? '#4b5563';
    const c2 = m.c2 ?? r.c2 ?? null;
    return `  '${id}': { logo: '${r.logo}', c1: '${c1}', c2: ${c2 ? `'${c2}'` : 'null'} },`;
  });
  const ts = `// GENERADO por scripts/regiones-uniones/logos.mjs: no se edita a mano.
//
// El logo de cada unión (en /public/uniones, sin fondo) y los dos colores del
// degradé de su bloque en el selector de ligas, sacados del propio logo.
// Una unión sin entrada acá se dibuja con un bloque neutro y sus iniciales.

export interface MarcaDeUnion {
  logo: string;
  c1: string;
  /** Null cuando el logo tiene un solo color: el degradé usa una variante oscura del primero. */
  c2: string | null;
}

export const MARCAS_DE_UNION: Record<string, MarcaDeUnion> = {
${filas.join('\n')}
};
`;
  fs.writeFileSync(path.resolve('src/lib/unionBrand.ts'), ts);
}

main();
