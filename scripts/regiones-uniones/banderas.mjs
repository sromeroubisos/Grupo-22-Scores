// Colores del degradé de cada país en el selector de ligas, sacados de su bandera.
//
//   node scripts/regiones-uniones/banderas.mjs
//
// Rasteriza cada `public/flags/<codigo>.svg` y calcula sus dos colores dominantes
// con el mismo criterio que los logos de las uniones (`colores.mjs`). Escribe
// `src/lib/flagColors.ts`, indexado por el código de bandera, para que los colores
// no se calculen en el navegador.

import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { dominantes } from './colores.mjs';

const CARPETA = path.resolve('public/flags');
const SALIDA = path.resolve('src/lib/flagColors.ts');

const archivos = fs.readdirSync(CARPETA).filter((f) => f.endsWith('.svg')).sort();
const filas = [];
let sinColor = 0;

for (const archivo of archivos) {
  const codigo = archivo.replace(/\.svg$/, '');
  try {
    const { data, info } = await sharp(path.join(CARPETA, archivo), { density: 72 })
      .resize(96, 72, { fit: 'fill' })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const colores = dominantes(data, info.width, info.height);
    if (!colores) { sinColor++; continue; }
    filas.push(`  '${codigo}': { c1: '${colores[0]}', c2: ${colores[1] ? `'${colores[1]}'` : 'null'} },`);
  } catch (error) {
    console.log('✗', codigo, error.message);
  }
}

fs.writeFileSync(SALIDA, `// GENERADO por scripts/regiones-uniones/banderas.mjs: no se edita a mano.
//
// Los dos colores del degradé del bloque de cada país en el selector de ligas,
// sacados de su bandera e indexados por el código de \`public/flags\`. Un país sin
// entrada (o sin bandera, como "Internacional") se dibuja con un bloque neutro.

export interface ColoresDeBandera {
  c1: string;
  /** Null cuando la bandera tiene un solo color vivo: el degradé usa una variante oscura. */
  c2: string | null;
}

export const COLORES_DE_BANDERA: Record<string, ColoresDeBandera> = {
${filas.join('\n')}
};
`);

console.log(filas.length, 'banderas con color,', sinColor, 'sin color (blanco/negro/gris) de', archivos.length);
