/**
 * Un escudo que llega suelto (una descarga, un mail) se guarda en LOCAL y sale
 * con sus variantes, siempre las mismas:
 *
 *   Recursos/<carpeta>/originales/<archivo>   el archivo tal cual llegó
 *   Recursos/<carpeta>/1080x1080/<id>.png     MAESTRO: lienzo 1080 transparente,
 *                                             lado mayor en 900 px, centrado
 *   Recursos/<carpeta>/sobre-oscuro/<id>.png  el maestro con contorno blanco, para
 *                                             placas y fondos oscuros
 *   public/clubs/<id>.png                     WEB: el maestro a 512 px; es la
 *                                             ruta que guarda `clubs.logo_url`
 *
 *   node scripts/escudos/variantes.mjs --carpeta SELECCIONES \
 *     "C:/Users/.../ARG M19.png=argentina-m19" "C:/Users/.../ITALIA M19.png=italia-m19" \
 *     --colores scripts/m19-italia/colores.json --plan | --execute
 *
 * El 1080/900 es el estándar de la biblioteca de Recursos (`_generar-1080x1080.py`,
 * `_generar-escudos-juego.py`, las tandas de "Claude Code logos"): todos los
 * escudos con el mismo encuadre pesan lo mismo puestos uno al lado del otro.
 * La web es el MISMO encuadre achicado, no otro recorte, y 512 es el tope del
 * proxy de escudos (`MAX_PROXY_WIDTH`): más grande no lo pide nadie.
 *
 * Va como ARCHIVO y la base guarda la RUTA: nunca base64, que es lo que infló
 * `clubs` a 905 escudos embebidos.
 *
 * El fondo: si el original es opaco, se saca por INUNDACIÓN DESDE EL BORDE, no
 * "todo lo blanco" — un escudo con letras blancas las perdería. Mismos umbrales
 * que `_generar-escudos-juego.py`.
 */
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const REPO = process.cwd();
const RECURSOS = 'C:/Users/srome/OneDrive/Documentos/________S22/Recursos';
const LIENZO = 1080;
const SEGURA = 900;
const WEB = 512;
/**
 * Grosor del contorno de la variante para fondo oscuro, sobre el lienzo de 1080.
 * Cabe: el maestro deja 90 px de aire por lado.
 */
const CONTORNO = 22;
const TOL_DURO = 26;
const TOL_BLANDO = 90;

const args = process.argv.slice(2);
const modo = args.includes('--execute') ? 'execute' : args.includes('--plan') ? 'plan' : null;
const valor = (flag) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : null; };
const carpeta = valor('--carpeta');
const archivoColores = valor('--colores');
const pares = args.filter((a, i) => a.includes('=') && !args[i - 1]?.startsWith('--'));
if (!modo || !carpeta || !pares.length) {
  console.error('uso: variantes.mjs --carpeta <sub de Recursos> "<origen>=<id>" ... [--colores <json>] --plan|--execute');
  process.exit(2);
}

/** Saca el fondo conectado al borde de un escudo opaco. Devuelve RGBA crudo. */
function quitarFondo(data, w, h) {
  const px = (x, y) => (y * w + x) * 4;
  const esquinas = [px(0, 0), px(w - 1, 0), px(0, h - 1), px(w - 1, h - 1)].map((i) => `${data[i]},${data[i + 1]},${data[i + 2]}`);
  const fondo = esquinas.sort((a, b) => esquinas.filter((e) => e === b).length - esquinas.filter((e) => e === a).length)[0].split(',').map(Number);
  const dist = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    dist[i] = Math.max(Math.abs(data[i * 4] - fondo[0]), Math.abs(data[i * 4 + 1] - fondo[1]), Math.abs(data[i * 4 + 2] - fondo[2]));
  }
  const visto = new Uint8Array(w * h);
  const cola = [];
  const empujar = (x, y) => { const i = y * w + x; if (!visto[i] && dist[i] <= TOL_BLANDO) { visto[i] = 1; cola.push(i); } };
  for (let x = 0; x < w; x++) { empujar(x, 0); empujar(x, h - 1); }
  for (let y = 0; y < h; y++) { empujar(0, y); empujar(w - 1, y); }
  while (cola.length) {
    const i = cola.pop(); const x = i % w; const y = (i - x) / w;
    if (x > 0) empujar(x - 1, y); if (x < w - 1) empujar(x + 1, y);
    if (y > 0) empujar(x, y - 1); if (y < h - 1) empujar(x, y + 1);
  }
  for (let i = 0; i < w * h; i++) {
    if (!visto[i]) continue;
    data[i * 4 + 3] = dist[i] <= TOL_DURO ? 0 : Math.round(255 * (dist[i] - TOL_DURO) / (TOL_BLANDO - TOL_DURO));
  }
  return fondo;
}

/** Color de la entidad: el tono más repetido, salteando blanco, negro y gris. */
function colorDominante(data) {
  const cuentas = new Map();
  for (let i = 0; i < data.length; i += 4) {
    const [r, g, b, a] = [data[i], data[i + 1], data[i + 2], data[i + 3]];
    if (a < 128) continue;
    const max = Math.max(r, g, b); const min = Math.min(r, g, b);
    if ((max > 235 && min > 215) || max < 40 || max - min < 30) continue;
    const balde = `${r >> 4},${g >> 4},${b >> 4}`;
    const p = cuentas.get(balde) || { n: 0, r: 0, g: 0, b: 0 };
    cuentas.set(balde, { n: p.n + 1, r: p.r + r, g: p.g + g, b: p.b + b });
  }
  if (!cuentas.size) return null;
  const top = [...cuentas.values()].sort((a, b) => b.n - a.n)[0];
  const hex = (n) => Math.round(n).toString(16).padStart(2, '0');
  return `#${hex(top.r / top.n)}${hex(top.g / top.n)}${hex(top.b / top.n)}`;
}

async function maestro(origen) {
  const { data, info } = await sharp(origen).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let alfaMin = 255;
  for (let i = 3; i < data.length; i += 4) if (data[i] < alfaMin) alfaMin = data[i];
  const fondoQuitado = alfaMin >= 250 ? quitarFondo(data, info.width, info.height) : null;

  const recortado = await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
    .png().toBuffer()
    .then((b) => sharp(b).trim({ threshold: 1 }).toBuffer({ resolveWithObject: true }));
  const { width: cw, height: ch } = recortado.info;
  const escala = SEGURA / Math.max(cw, ch);
  const nw = cw >= ch ? SEGURA : Math.max(1, Math.round(cw * escala));
  const nh = ch > cw ? SEGURA : Math.max(1, Math.round(ch * escala));
  const capa = await sharp(recortado.data).resize(nw, nh, { fit: 'fill', kernel: 'lanczos3' }).png().toBuffer();
  const png = await sharp({ create: { width: LIENZO, height: LIENZO, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: capa, left: Math.floor((LIENZO - nw) / 2), top: Math.floor((LIENZO - nh) / 2) }])
    .png({ compressionLevel: 9 })
    .toBuffer();
  return { png, rgba: data, orig: [info.width, info.height], contenido: [cw, ch], salida: [nw, nh], fondoQuitado, ampliado: escala > 1 };
}

/**
 * El maestro sobre una silueta blanca engordada `CONTORNO` px: se lee sobre
 * cualquier fondo oscuro sin tocar un píxel del escudo.
 *
 * La silueta sale de una transformada de distancia (chamfer 3-4, dos pasadas),
 * no de `blur` + `threshold` de sharp: medido, eso engordaba la máscara 800
 * píxeles en total —un halo tenue, no un contorno—.
 */
async function sobreOscuro(png) {
  const { data } = await sharp(png).extractChannel(3).raw().toBuffer({ resolveWithObject: true });
  const n = LIENZO;
  const INF = 1e9;
  const d = new Float64Array(n * n);
  for (let i = 0; i < n * n; i++) d[i] = data[i] > 8 ? 0 : INF;
  const paso = (i, j, c) => { if (d[j] + c < d[i]) d[i] = d[j] + c; };
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const i = y * n + x;
    if (x > 0) paso(i, i - 1, 3);
    if (y > 0) { paso(i, i - n, 3); if (x > 0) paso(i, i - n - 1, 4); if (x < n - 1) paso(i, i - n + 1, 4); }
  }
  for (let y = n - 1; y >= 0; y--) for (let x = n - 1; x >= 0; x--) {
    const i = y * n + x;
    if (x < n - 1) paso(i, i + 1, 3);
    if (y < n - 1) { paso(i, i + n, 3); if (x < n - 1) paso(i, i + n + 1, 4); if (x > 0) paso(i, i + n - 1, 4); }
  }
  const alfa = Buffer.alloc(n * n);
  // Un píxel de rampa en el borde exterior para que el contorno no quede escalonado.
  for (let i = 0; i < n * n; i++) alfa[i] = Math.round(255 * Math.min(1, Math.max(0, CONTORNO + 1 - d[i] / 3)));
  const silueta = await sharp({ create: { width: n, height: n, channels: 3, background: '#ffffff' } })
    .joinChannel(alfa, { raw: { width: n, height: n, channels: 1 } }).png().toBuffer();
  return sharp(silueta).composite([{ input: png }]).png({ compressionLevel: 9 }).toBuffer();
}

async function main() {
  const base = path.join(RECURSOS, carpeta);
  const colores = archivoColores && fs.existsSync(archivoColores) ? JSON.parse(fs.readFileSync(archivoColores, 'utf8')) : {};
  console.log(`modo: ${modo} · Recursos/${carpeta}\n`);

  for (const par of pares) {
    const corte = par.lastIndexOf('=');
    const origen = par.slice(0, corte); const id = par.slice(corte + 1);
    if (!fs.existsSync(origen)) throw new Error(`no existe ${origen}`);
    const m = await maestro(origen);
    const oscuro = await sobreOscuro(m.png);
    const web = await sharp(m.png).resize(WEB, WEB).png({ compressionLevel: 9, palette: true }).toBuffer();
    colores[id] = colorDominante(m.rgba);

    const destinos = [
      [path.join(base, 'originales', path.basename(origen)), fs.readFileSync(origen)],
      [path.join(base, '1080x1080', `${id}.png`), m.png],
      [path.join(base, 'sobre-oscuro', `${id}.png`), oscuro],
      [path.join(REPO, 'public', 'clubs', `${id}.png`), web],
    ];
    console.log(`${id}  ← ${path.basename(origen)} ${m.orig.join('x')} · dibujo ${m.contenido.join('x')} → ${m.salida.join('x')}${m.ampliado ? ' (AMPLIADO: origen chico)' : ''} · fondo ${m.fondoQuitado ? `quitado (${m.fondoQuitado})` : 'ya transparente'} · color ${colores[id]}`);
    for (const [destino, buffer] of destinos) {
      console.log(`    ${String(Math.round(buffer.length / 1024)).padStart(4)} KB  ${destino}`);
      if (modo === 'execute') {
        fs.mkdirSync(path.dirname(destino), { recursive: true });
        fs.writeFileSync(destino, buffer);
      }
    }
  }

  if (archivoColores && modo === 'execute') {
    fs.writeFileSync(archivoColores, JSON.stringify(colores, null, 2) + '\n', 'utf8');
    console.log(`\ncolores: ${archivoColores}`);
  }
  if (modo === 'plan') console.log('\nmodo --plan: no se escribió ningún archivo.');
}

main().catch((e) => { console.error(e); process.exit(1); });
