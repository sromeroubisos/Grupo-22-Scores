/**
 * Escudos del Campeonato Argentino Juvenil: de los originales de Recursos a
 * `public/`, redimensionados.
 *
 *   node scripts/argentino-juvenil/logos.mjs --plan
 *   node scripts/argentino-juvenil/logos.mjs --execute
 *
 * Los originales pesan entre 130 KB y 700 KB cada uno: van a 256 px de lado
 * mayor, que es lo que el escudo ocupa en la ficha más grande. Van como
 * ARCHIVO y la base guarda la RUTA — nunca base64, que es lo que infló
 * `clubs` a 905 escudos embebidos ([[base64-logos-inflan-el-html]]).
 *
 * Cuatro uniones repiten escudo entre el M17 y el M18 (Buenos Aires, Córdoba,
 * Tucumán, Rosario): se escribe un archivo por club igual, porque la
 * convención de `public/clubs/` es un archivo por id y 20 KB no justifican
 * romperla.
 *
 * Imprime también el color dominante de cada escudo, que es el que va a
 * `clubs.primary_color`.
 */
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const REPO = process.cwd();
const ORIGEN = 'C:/Users/srome/OneDrive/Documentos/________S22/Recursos/ARGENTINA/SELECCIONADOS UNIONES/WEB';
const ORIGEN_TORNEO = 'C:/Users/srome/OneDrive/Documentos/________S22/Recursos/ARGENTINO JUVENIL.png';
const LADO = 256;

const modo = process.argv.includes('--execute') ? 'execute'
  : process.argv.includes('--plan') ? 'plan' : null;
if (!modo) { console.error('usá --plan o --execute'); process.exit(2); }

/** id de club → archivo de la unión. Las tildes se resuelven por comparación normalizada. */
export const ESCUDOS = {
  'uruguay-m17': 'Uruguay.png',
  'buenos-aires-m17': 'URBA.png',
  'tucuman-m17': 'Tucumán.png',
  'cordobesa-m17': 'CORDOBESA.png',
  'cuyo-m17': 'Cuyo.png',
  'santafesina-m17': 'Santa Fé.png',
  'rosario-m17': 'Rosario.png',
  'salta-m17': 'Salta.png',
  'austral-m17': 'Austral.png',
  'alto-valle-m17': 'Alto Valle.png',
  'entrerriana-m17': 'Entre Ríos.png',
  'nordeste-m17': 'URNE.png',
  'oeste-m17': 'UROBA.png',
  'sanjuanina-m17': 'San Juan.png',
  'mar-del-plata-m17': 'Mar del Plata.png',
  'chile-m17': 'Chile.png',
  'buenos-aires-m18': 'URBA.png',
  'cordoba-m18': 'CORDOBESA.png',
  'tucuman-m18': 'Tucumán.png',
  'rosario-m18': 'Rosario.png',
};

const norm = (s) => s.normalize('NFC').toLowerCase();

/** OneDrive puede devolver los nombres en NFD: se resuelve por comparación normalizada. */
function resolverArchivo(nombre) {
  const buscado = norm(nombre);
  const encontrado = fs.readdirSync(ORIGEN).find((f) => norm(f) === buscado);
  if (!encontrado) throw new Error(`no está el escudo "${nombre}" en ${ORIGEN}`);
  return path.join(ORIGEN, encontrado);
}

/**
 * Color de la unión: el tono más repetido del escudo, salteando lo que no es
 * color propio.
 *
 * `stats().dominant` de sharp devolvía `#f8f8f8` en los VEINTE escudos: estos
 * PNG traen fondo blanco opaco, así que el tono más frecuente es el fondo. Se
 * descarta entonces el blanco, el negro y el gris (saturación baja), y se
 * cuenta sobre lo que queda, cuantizado a 16 niveles por canal para que dos
 * píxeles casi iguales caigan en el mismo balde.
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
    if (a < 128) continue;                                   // transparente
    const max = Math.max(r, g, b); const min = Math.min(r, g, b);
    if (max > 235 && min > 215) continue;                    // blanco / casi blanco
    if (max < 40) continue;                                  // negro / casi negro
    if (max - min < 30) continue;                            // gris: no es color de unión
    const balde = `${r >> 4},${g >> 4},${b >> 4}`;
    const previo = cuentas.get(balde) || { n: 0, r: 0, g: 0, b: 0 };
    cuentas.set(balde, { n: previo.n + 1, r: previo.r + r, g: previo.g + g, b: previo.b + b });
  }
  if (!cuentas.size) return null;                            // escudo en blanco y negro

  const top = [...cuentas.values()].sort((a, b) => b.n - a.n)[0];
  const hex = (n) => Math.round(n).toString(16).padStart(2, '0');
  return `#${hex(top.r / top.n)}${hex(top.g / top.n)}${hex(top.b / top.n)}`;
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

  const colores = {};
  let antes = 0; let despues = 0;

  console.log(`modo: ${modo} · lado máximo ${LADO}px\n`);
  for (const [id, nombre] of Object.entries(ESCUDOS)) {
    const origen = resolverArchivo(nombre);
    const destino = path.join(destinoClubes, `${id}.png`);
    const pesoOrigen = fs.statSync(origen).size;
    const pesoDestino = await procesar(origen, destino);
    colores[id] = await colorDominante(origen);
    antes += pesoOrigen; despues += pesoDestino;
    console.log(`  ${id.padEnd(20)} ← ${nombre.padEnd(22)} ${String(Math.round(pesoOrigen / 1024)).padStart(4)} KB → ${String(Math.round(pesoDestino / 1024)).padStart(3)} KB · ${colores[id]}`);
  }

  const destinoTorneo = path.join(destinoComp, 'ar-argentino-juvenil.png');
  const pesoTorneo = await procesar(ORIGEN_TORNEO, destinoTorneo);
  console.log(`\n  ar-argentino-juvenil ← ARGENTINO JUVENIL.png ${String(Math.round(fs.statSync(ORIGEN_TORNEO).size / 1024)).padStart(4)} KB → ${Math.round(pesoTorneo / 1024)} KB`);

  console.log(`\ntotal escudos: ${Math.round(antes / 1024)} KB → ${Math.round(despues / 1024)} KB`);

  const salida = path.join(REPO, 'scripts', 'argentino-juvenil', 'colores.json');
  if (modo === 'execute') {
    fs.writeFileSync(salida, JSON.stringify(colores, null, 2) + '\n', 'utf8');
    console.log(`colores escritos: ${salida}`);
  } else {
    console.log('\nmodo --plan: no se escribió ningún archivo.');
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
