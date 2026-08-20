/**
 * Sincroniza el horario de los 40 partidos con el canon de `datos.mjs`.
 *
 *   node scripts/argentino-juvenil/horarios.mjs --plan
 *   node scripts/argentino-juvenil/horarios.mjs --execute
 *
 * El fixture se cargó con una hora pareja y la organización después confirmó
 * horarios por partido. En vez de tocar la base a mano, la hora se edita en
 * `datos.mjs` —que es la fuente— y esto la baja: así el canon y la base no se
 * separan, y el próximo cambio de horario es una línea y una corrida.
 *
 * Sólo toca `date_time`, y sólo de los partidos que difieren. Un partido ya
 * jugado se saltea: reprogramar algo que terminó no tiene sentido y sería la
 * forma de romper un resultado cargado.
 */
import fs from 'node:fs';
import path from 'node:path';

import { instanteDe, TORNEOS } from './datos.mjs';

const REPO = process.cwd();
const modo = process.argv.includes('--execute') ? 'execute'
  : process.argv.includes('--plan') ? 'plan' : null;
if (!modo) { console.error('usá --plan o --execute'); process.exit(2); }

const env = { ...process.env };
for (const l of fs.readFileSync(path.join(REPO, '.env.local'), 'utf8').split(/\r?\n/)) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !env[m[1]]) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
}
const URL_BASE = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_BASE || !KEY) { console.error('Faltan credenciales en .env.local'); process.exit(1); }
const H = { apikey: KEY, authorization: `Bearer ${KEY}` };

async function leer(recurso) {
  const res = await fetch(encodeURI(`${URL_BASE}/rest/v1/${recurso}`), { headers: H });
  if (!res.ok) throw new Error(`GET ${recurso}: ${res.status} ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

async function actualizar(recurso, cuerpo) {
  const res = await fetch(encodeURI(`${URL_BASE}/rest/v1/${recurso}`), {
    method: 'PATCH',
    headers: { ...H, 'content-type': 'application/json', prefer: 'return=minimal' },
    body: JSON.stringify(cuerpo),
  });
  if (!res.ok) throw new Error(`PATCH ${recurso}: ${res.status} ${(await res.text()).slice(0, 300)}`);
}

/** La hora que se lee en pantalla, para que el plan se pueda revisar de un vistazo. */
const enArgentina = (iso) => new Date(iso).toLocaleString('es-AR', {
  timeZone: 'America/Argentina/Buenos_Aires',
  day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
});

async function main() {
  console.log(`modo: ${modo}\n`);
  let cambios = 0;
  let jugados = 0;

  for (const t of TORNEOS) {
    const [torneo] = await leer(`tournaments?select=id,name&slug=eq.${t.slug}`);
    if (!torneo) { console.log(`  ! ${t.slug} no está en la base, se saltea`); continue; }

    const partidos = await leer(
      `matches?select=id,date_time,status,home_club_id,away_club_id,bracket_match_code,notes&tournament_id=eq.${torneo.id}`,
    );

    // La llave de un partido de zona son sus dos clubes; la de un cruce, su
    // código — todavía no tiene equipos.
    const esperado = new Map([
      ...t.grupos.map((g) => [`${g.local}>${g.visitante}`, { iso: instanteDe(g.fecha, g.hora), rotulo: `${g.local} vs ${g.visitante}` }]),
      ...t.final.map((f) => [`P${f.n}`, { iso: instanteDe(f.fecha, f.hora), rotulo: `P${f.n} · ${f.definicion}` }]),
    ]);

    console.log(torneo.name);
    for (const p of partidos) {
      const llave = p.bracket_match_code || `${p.home_club_id}>${p.away_club_id}`;
      const objetivo = esperado.get(llave);
      if (!objetivo) { console.log(`  ! sin canon: ${llave}`); continue; }
      if (new Date(p.date_time).toISOString() === objetivo.iso) continue;

      if (p.status === 'final') {
        console.log(`  · ya jugado, no se toca: ${objetivo.rotulo}`);
        jugados += 1;
        continue;
      }

      console.log(`  ${enArgentina(p.date_time)} → ${enArgentina(objetivo.iso)}  ${objetivo.rotulo}`);
      if (modo === 'execute') await actualizar(`matches?id=eq.${p.id}`, { date_time: objetivo.iso, updated_at: new Date().toISOString() });
      cambios += 1;
    }
  }

  console.log(`\n${cambios} partidos ${modo === 'execute' ? 'reprogramados' : 'a reprogramar'}${jugados ? ` · ${jugados} salteados por estar jugados` : ''}`);
  if (modo === 'plan') console.log('modo --plan: no se escribió una sola fila.');
}

main().catch((e) => { console.error('\nFALLÓ:', e.message || e); process.exit(1); });
