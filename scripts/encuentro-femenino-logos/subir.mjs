/**
 * Logo del torneo y escudos de las selecciones del Encuentro Femenino de XV 2026.
 * Sube a Storage (tournaments / club-assets) y guarda la URL en la base.
 *   node scripts/encuentro-femenino-logos/subir.mjs [--execute]
 */
import fs from 'node:fs';
import crypto from 'node:crypto';
import sharp from 'sharp';

const EXEC = process.argv.includes('--execute');
const R = 'C:/Users/srome/OneDrive/Documentos/________S22/Recursos/ARGENTINA';
const TORNEO = '939a640c-728b-4601-a31f-25237ced7302';
const env = {};
for (const l of fs.readFileSync('.env.local', 'utf8').split('\n')) {
  if (l.includes('=') && !l.startsWith('#')) { const i = l.indexOf('='); env[l.slice(0, i)] = l.slice(i + 1).trim().replace(/^["']|["']$/g, ''); }
}
const URL = env.NEXT_PUBLIC_SUPABASE_URL, KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };

const ESCUDOS = [
  ['buenos-aires-femenino', `${R}/SELECCIONADOS UNIONES/WEB/URBA.png`],
  ['alto-valle-femenino', `${R}/SELECCIONADOS UNIONES/WEB/Alto Valle.png`],
  ['nordeste-femenino', `${R}/SELECCIONADOS UNIONES/WEB/URNE.png`],
];

const web512 = (buf) => sharp(buf).resize(512, 512, { fit: 'inside', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();

async function subir(bucket, ruta, buf) {
  const r = await fetch(`${URL}/storage/v1/object/${bucket}/${ruta}`, { method: 'POST', headers: { ...H, 'Content-Type': 'image/png', 'x-upsert': 'true' }, body: buf });
  if (!r.ok) throw new Error(`Storage ${bucket}/${ruta}: ${r.status} ${await r.text()}`);
  return `${URL}/storage/v1/object/public/${bucket}/${ruta}`;
}
async function patch(tabla, id, logo_url) {
  const r = await fetch(`${URL}/rest/v1/${tabla}?id=eq.${id}`, { method: 'PATCH', headers: { ...H, 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify({ logo_url }) });
  if (!r.ok) throw new Error(`PATCH ${tabla}/${id}: ${r.status} ${await r.text()}`);
}

const items = [
  { tabla: 'tournaments', id: TORNEO, bucket: 'tournaments', archivo: `${R}/LOGO 512.png`, ruta: (h) => `logos/${TORNEO}-${h}.png` },
  ...ESCUDOS.map(([id, archivo]) => ({ tabla: 'clubs', id, bucket: 'club-assets', archivo, ruta: (h) => `logos/${id}/${h}.png` })),
];
for (const it of items) {
  const buf = await web512(fs.readFileSync(it.archivo));
  const h = crypto.createHash('sha256').update(buf).digest('hex').slice(0, 16);
  console.log(EXEC ? 'SUBE' : 'PLAN', it.tabla, it.id, it.archivo.split('/').pop(), buf.length, 'bytes');
  if (!EXEC) continue;
  const url = await subir(it.bucket, it.ruta(h), buf);
  await patch(it.tabla, it.id, url);
  console.log('  ->', url);
}
