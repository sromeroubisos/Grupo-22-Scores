/**
 * Crea los clubes de rugby de la Unión Cordobesa que faltaban para la Liga
 * Desarrollo y las fichas femeninas de los torneos femeninos. Idempotente: lo
 * que ya existe se saltea.
 *
 *   node scripts/cordoba-torneos/clubes-nuevos.mjs --plan
 *   node scripts/cordoba-torneos/clubes-nuevos.mjs --execute
 *
 * Los escudos salen ANTES con scripts/escudos/variantes.mjs (carpeta
 * "ARGENTINA/Córdoba"): acá `logo_url` es la ruta `/clubs/<id>.png` si el archivo
 * está en `public/clubs/`, y null si el club no tiene escudo en Recursos (la web
 * muestra las iniciales).
 *
 * Los clubes con homónimo en otro deporte (Oliva, Unión Oncativo y Siglo 21
 * existen como hockey) NO se reusan: son clubes de rugby aparte.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const REPO = process.cwd();
const modo = process.argv.includes('--execute') ? 'execute' : process.argv.includes('--plan') ? 'plan' : null;
if (!modo) { console.error('usá --plan o --execute'); process.exit(2); }
const UNION = '0c515ac1-af49-4699-b3c5-7273bc424357';
const REGISTRO = path.join(REPO, 'scripts', 'cordoba-torneos', 'creados.json');

const env = { ...process.env };
for (const l of fs.readFileSync(path.join(REPO, '.env.local'), 'utf8').split(/\r?\n/)) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !env[m[1]]) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
}
const U = env.NEXT_PUBLIC_SUPABASE_URL;
const H = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` };
const req = async (metodo, recurso, cuerpo) => {
  const res = await fetch(encodeURI(`${U}/rest/v1/${recurso}`), {
    method: metodo, headers: { ...H, 'content-type': 'application/json', prefer: 'return=representation' },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  if (!res.ok) throw new Error(`${metodo} ${recurso}: ${res.status} ${(await res.text()).slice(0, 300)}`);
  return res.status === 204 ? [] : res.json();
};

/** [id, nombre, ciudad] — el escudo se resuelve por public/clubs/<id>.png. */
const MASCULINOS = [
  ['rosedal-r-c', 'Rosedal R.C.', null],
  ['cuises-portena-rugby', 'Cuises Porteña Rugby', 'Porteña'],
  ['universidad-siglo-21-rugby', 'Universidad Siglo 21', 'Córdoba'],
  ['asociacion-cordobesa-volantes', 'Asociación Cordobesa Volantes', 'Córdoba'],
  ['los-toros-de-brinkmann', 'Los Toros de Brinkmann', 'Brinkmann'],
  ['ajedrez-cosquin-r-c', 'Ajedrez Cosquín R.C.', 'Cosquín'],
  ['salsipuedes-r-c', 'Salsipuedes R.C.', 'Salsipuedes'],
  ['villa-libertador-r-c', 'Villa Libertador R.C.', 'Córdoba'],
  ['chelcos-de-villa-del-rosario', 'Chelcos de Villa del Rosario', 'Villa del Rosario'],
  ['san-nicolas-rugby', 'San Nicolás Rugby', null],
  ['manke-la-calera', 'Mañke', 'La Calera'],
  ['aguilas-general-deheza', 'Águilas (General Deheza)', 'General Deheza'],
  ['ranqueles-rugby', 'Ranqueles Rugby', null],
  ['mackenna-r-c', 'Mackenna R.C.', 'Mackenna'],
  ['las-iguanas-independiente-dolores', 'Las Iguanas (Independiente Dolores)', null],
  ['mirage-rugby-club', 'Mirage Rugby Club', null],
  ['los-patriotas-ucacha', 'Los Patriotas R.C. (Ucacha)', 'Ucacha'],
  ['union-oncativo-rugby', 'Unión Oncativo (Los Lagartos)', 'Oncativo'],
  ['universitario-villa-maria-rugby', 'Club Universitario de Villa María', 'Villa María'],
  ['los-tordos-hernando', 'Los Tordos (Hernando)', 'Hernando'],
  ['nautico-fitz-simon', 'Náutico Fitz Simon', null],
  ['oliva-rugby-club', 'Oliva Rugby Club', 'Oliva'],
  // Combinados de Juveniles Desarrollo M2 (sin escudo propio).
  ['combinado-capital', 'Combinado Capital', 'Córdoba'],
  ['combinado-punilla', 'Combinado Punilla', null],
  ['combinado-centro', 'Combinado Centro', null],
  ['buitres-san-basilio-mackenna-mirage', 'Buitres / San Basilio / Mackenna / Mirage', null],
  ['jockey-rio-iv-aguilas-adelia-maria', 'Jockey Río IV / Águilas / Adelia María', 'Río Cuarto'],
  ['hurones-portena-oncativo', 'Hurones / Porteña / Oncativo', null],
];

/** [id, nombre, club base (para el escudo y la familia) o null si es un combinado] */
const FEMENINAS = [
  ['taborin-rc-femenino-verde', 'Taborín RC Femenino "Verde"', 'taborin-rc'],
  ['aero-club-rio-iv-femenino', 'Aero Club Río IV Femenino', 'aero-club-rio-iv'],
  ['manke-la-calera-femenino', 'Mañke Femenino', 'manke-la-calera'],
  ['los-chelcos-femenino', 'Los Chelcos Femenino', 'los-chelcos'],
  ['palermo-bajo-carlos-paz-femenino', 'Palermo Bajo / Carlos Paz Femenino', null],
  ['cordoba-rc-la-tablada-femenino', 'Córdoba R.C. / La Tablada Femenino', null],
];

const ahora = new Date().toISOString();
const fila = (id, name, city, logo, union, region) => ({
  id, union_id: union, name, short_name: name, city, region, country: 'ARG', logo_url: logo, primary_color: null, slug: id,
  is_visible: true, entity_type: 'club', sport: 'rugby', sport_id: 'rugby', category: null, categories: [], status: 'active', visibility: 'visible',
  external_id: null, created_at: ahora, updated_at: ahora,
});

async function main() {
  console.log(`modo: ${modo}\n`);
  const ids = [...MASCULINOS.map((c) => c[0]), ...FEMENINAS.map((c) => c[0])];
  const existentes = new Set((await req('GET', `clubs?select=id&id=in.(${ids.join(',')})`)).map((c) => c.id));
  const basesIds = FEMENINAS.map((f) => f[2]).filter(Boolean);
  const bases = new Map((await req('GET', `clubs?select=id,logo_url,city,region,union_id&id=in.(${basesIds.join(',')})`)).map((c) => [c.id, c]));
  const crest = (id) => (fs.existsSync(path.join(REPO, 'public', 'clubs', `${id}.png`)) ? `/clubs/${id}.png` : null);

  const masc = []; const fem = []; const vinculos = [];
  for (const [id, nombre, ciudad] of MASCULINOS) {
    if (existentes.has(id)) continue;
    masc.push(fila(id, nombre, ciudad, crest(id), UNION, 'Córdoba'));
  }
  for (const [id, nombre, base] of FEMENINAS) {
    if (existentes.has(id)) continue;
    const b = base ? (bases.get(base) ?? masc.find((n) => n.id === base) ?? null) : null;
    const f = fila(id, nombre, b?.city ?? null, b?.logo_url ?? null, b?.union_id ?? UNION, b?.region ?? 'Córdoba');
    f.category = 'femenino';
    fem.push(f);
    if (base) vinculos.push({ id: crypto.randomUUID(), base_club_id: base, derived_club_id: id, derivative_type: 'women', created_at: ahora });
  }
  for (const n of [...masc, ...fem]) console.log(`+ ${n.id.padEnd(38)} ${n.name.padEnd(40)} escudo: ${n.logo_url ?? '— (sin escudo en Recursos)'}`);
  console.log(`\n${masc.length + fem.length} clubes a crear (${existentes.size} ya existían), ${vinculos.length} vínculos`);
  if (modo === 'plan') { console.log('\nmodo --plan: no se escribió nada.'); return; }

  // Los masculinos primero: Mañke femenino cuelga de Mañke.
  if (masc.length) await req('POST', 'clubs?select=id', masc);
  if (fem.length) await req('POST', 'clubs?select=id', fem);
  if (vinculos.length) await req('POST', 'club_derivatives?select=id', vinculos);
  const previo = fs.existsSync(REGISTRO) ? JSON.parse(fs.readFileSync(REGISTRO, 'utf8')) : { clubes: [], vinculos: [], slugs: [] };
  fs.writeFileSync(REGISTRO, JSON.stringify({
    clubes: [...new Set([...previo.clubes, ...masc.map((n) => n.id), ...fem.map((n) => n.id)])],
    vinculos: [...new Set([...previo.vinculos, ...vinculos.map((v) => v.derived_club_id)])],
    slugs: previo.slugs,
  }, null, 2) + '\n', 'utf8');
  console.log(`\n✓ ${masc.length + fem.length} clubes · ${vinculos.length} vínculos`);
}

main().catch((e) => { console.error('\nFALLÓ:', e.message || e); process.exit(1); });
