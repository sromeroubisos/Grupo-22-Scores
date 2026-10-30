/**
 * Actualiza Dos Orillas 2026 con una fecha ya jugada: parchea `extract/2026.json`
 * (la copia fiel de la fuente) y los partidos y campeones en la base.
 *
 *   node scripts/dos-orillas/actualizar-fecha.mjs --plan
 *   node scripts/dos-orillas/actualizar-fecha.mjs --execute
 *
 * Idempotente: busca cada partido por división + fase + local + visitante y lo
 * deja como la fuente lo publicó. Después hay que recalcular la tabla:
 *   npx tsx src/scripts/arusa-recalcular.ts --torneo=dos-orillas-juvenil-m16   (y m17)
 *
 * Fecha cargada: 3ª y última del Final Four M16 y M17 (nota de Tercer Tiempo del 4/10).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fichaDe, sistemaDe } from './datos.mjs';

const REPO = process.cwd();
const EXTRACT = path.join(REPO, 'scripts', 'dos-orillas', 'extract', '2026.json');
const SRC = '2026-10-04_nota-campeones';
const execute = process.argv.includes('--execute');
if (!execute && !process.argv.includes('--plan')) { console.error('usá --plan o --execute'); process.exit(2); }

// Un partido sin marcador publicado: { sinMarcador: true }.
const RESULTADOS = [
  { division: 'M16', phase: 'Final Four Oro', home: 'Tilcara', away: 'Estudiantes', hs: 7, as: 35, hp: 0, ap: 5 },
  { division: 'M16', phase: 'Final Four Oro', home: 'Santa Fe RC', away: 'Universitario', hs: 26, as: 17, hp: 4, ap: 0 },
  { division: 'M16', phase: 'Final Four Plata', home: 'Rowing', away: 'CRAI', hs: 26, as: 27, hp: 1, ap: 4 },
  { division: 'M16', phase: 'Final Four Plata', home: 'CRAR', away: 'Cha Roga Club', hs: 17, as: 13, hp: 4, ap: 1 },
  { division: 'M16', phase: 'Final Four Bronce', home: 'La Salle', away: 'At. Brown', sinMarcador: true },
  { division: 'M16', phase: 'Final Four Bronce', home: 'Alma Juniors', away: 'San Carlos', hs: 31, as: 29, hp: 5, ap: 2 },
  { division: 'M17', phase: 'Final Four Oro', home: 'Estudiantes', away: 'Santa Fe RC', hs: 10, as: 12, hp: 1, ap: 4 },
  { division: 'M17', phase: 'Final Four Oro', home: 'Universitario', away: 'Rowing', hs: 54, as: 28, hp: 5, ap: 1 },
  { division: 'M17', phase: 'Final Four Plata', home: 'CRAR', away: 'La Salle', hs: 19, as: 33, hp: 0, ap: 5 },
];
const CAMPEONES = [
  { division: 'M16', cup: 'Oro', club: 'Santa Fe RC', note: 'Final Four Oro, 11 pts (nota del 4/10)' },
  { division: 'M16', cup: 'Plata', club: 'CRAR', note: 'Final Four Plata, 13 pts (nota del 4/10)' },
  { division: 'M17', cup: 'Oro', club: 'Santa Fe RC', note: 'Final Four Oro, 13 pts (nota del 4/10)' },
  { division: 'M17', cup: 'Plata', club: 'La Salle', note: 'Final Four Plata, 14 pts; faltan CRAR-CRAI y CRAI-Tilcara (nota del 4/10)' },
];
const ISSUES = [
  'M16 Final Four Bronce (nota del 4/10): La Salle - At. Brown figura sin marcador y las posiciones no cambian: not_played. Alma Jrs 31-29 San Carlos (5-2) no se refleja en las posiciones publicadas (Alma 5, San Carlos 0): se cargó el partido, así que la tabla calculada va a diferir de la publicada. Quedan pendientes La Salle - Alma Jrs (2ª fecha) y At. Brown - San Carlos (10/10).',
  'M16 Final Four Oro (nota del 4/10): Santa Fe RC y Estudiantes terminan con 11 puntos y la nota marca campeón a Santa Fe RC sin explicar el desempate. La 2ª fecha ya traía una diferencia de 1 punto con la publicada.',
  'M17 Final Four Plata (nota del 4/10): La Salle campeón con CRAR - CRAI (29/9) y CRAI - Tilcara (6/10) sin resultado publicado; siguen postponed y scheduled.',
];

const aliasId = (a, d) => fichaDe(a, d).id;
const claveMatch = (m) => `${m.division}|${m.phase}|${m.home}|${m.away}`;

// ── 1. extract/2026.json ─────────────────────────────────────────────────────
const ex = JSON.parse(fs.readFileSync(EXTRACT, 'utf8'));
let tocados = 0;
for (const r of RESULTADOS) {
  const fila = ex.matches.find((m) => claveMatch(m) === claveMatch(r));
  if (!fila) throw new Error(`no está en el extract: ${claveMatch(r)}`);
  if (r.sinMarcador) {
    Object.assign(fila, { status: 'not_played', hs: null, as: null, hp: null, ap: null, note: 'disputado sin marcador publicado', src: SRC });
  } else {
    Object.assign(fila, { status: 'final', hs: r.hs, as: r.as, hp: r.hp, ap: r.ap, note: '', src: SRC });
  }
  tocados++;
}
for (const c of CAMPEONES) {
  const i = ex.champions.findIndex((x) => x.division === c.division && x.cup === c.cup);
  if (i >= 0) ex.champions[i] = c; else ex.champions.push(c);
}
for (const t of ISSUES) if (!ex.issues.includes(t)) ex.issues.push(t);
console.log(`extract: ${tocados} partidos y ${CAMPEONES.length} campeones`);
if (execute) fs.writeFileSync(EXTRACT, JSON.stringify(ex, null, 2) + '\n', 'utf8');

// ── 2. base ──────────────────────────────────────────────────────────────────
const env = {};
for (const l of fs.readFileSync(path.join(REPO, '.env.local'), 'utf8').split(/\r?\n/)) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
}
const H = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` };
const U = env.NEXT_PUBLIC_SUPABASE_URL;
const leer = async (r) => { const x = await fetch(encodeURI(`${U}/rest/v1/${r}`), { headers: H }); if (!x.ok) throw new Error(`GET ${r}: ${x.status}`); return x.json(); };
const patch = async (r, cuerpo) => {
  const x = await fetch(encodeURI(`${U}/rest/v1/${r}`), { method: 'PATCH', headers: { ...H, 'content-type': 'application/json', prefer: 'return=representation' }, body: JSON.stringify(cuerpo) });
  if (!x.ok) throw new Error(`PATCH ${r}: ${x.status} ${(await x.text()).slice(0, 300)}`);
  return x.json();
};
const base = (a, b, s) => (a > b ? s.win : a === b ? s.draw : s.loss);
const sistema = sistemaDe('2026');

for (const division of ['M16', 'M17']) {
  const slug = `dos-orillas-juvenil-${division.toLowerCase()}`;
  const [t] = await leer(`tournaments?select=id,current_season_id&slug=eq.${slug}`);
  const season = t.current_season_id;
  const fases = new Map((await leer(`tournament_phases?select=id,name&season_id=eq.${season}`)).map((f) => [f.name, f.id]));

  for (const r of RESULTADOS.filter((x) => x.division === division)) {
    const faseId = fases.get(r.phase);
    const filtro = `matches?select=id,status&season_id=eq.${season}&phase_id=eq.${faseId}&home_club_id=eq.${aliasId(r.home, division)}&away_club_id=eq.${aliasId(r.away, division)}`;
    const [m] = await leer(filtro);
    if (!m) throw new Error(`no está en la base: ${claveMatch(r)}`);
    let cuerpo;
    if (r.sinMarcador) {
      cuerpo = { status: 'suspended', score: null, notes: 'No se disputó · disputado sin marcador publicado' };
    } else {
      const bl = base(r.hs, r.as, sistema); const bv = base(r.as, r.hs, sistema);
      cuerpo = {
        status: 'final', score: { home: r.hs, away: r.as }, points_autocalculated: false,
        home_base_points: bl, away_base_points: bv, home_bonus_points: r.hp - bl, away_bonus_points: r.ap - bv,
        points_override_reason: 'Puntos del partido publicados por la fuente; los tries no se publican y el bonus se despejó de ahí.',
        notes: null,
      };
    }
    console.log(`  ${execute ? '✓' : '·'} ${division} ${r.phase}: ${r.home} ${r.sinMarcador ? 'sin marcador' : `${r.hs}-${r.as}`} ${r.away}  (${m.status} → ${cuerpo.status})`);
    if (execute) await patch(`matches?id=eq.${m.id}`, { ...cuerpo, updated_at: new Date().toISOString() });
  }

  // Rondas cuyos partidos ya no están programados.
  for (const faseId of new Set(RESULTADOS.filter((x) => x.division === division).map((x) => fases.get(x.phase)))) {
    const rondas = await leer(`tournament_rounds?select=id,name&phase_id=eq.${faseId}&name=eq.Fecha 3`);
    for (const ro of rondas) {
      const ms = await leer(`matches?select=status&round_uuid=eq.${ro.id}`);
      const jugada = ms.length > 0 && ms.every((m) => m.status !== 'scheduled');
      if (execute && jugada) await patch(`tournament_rounds?id=eq.${ro.id}`, { is_completed: true });
    }
  }

  // Campeón de la temporada = Oro; todos en settings.titulos.
  const [temp] = await leer(`tournament_seasons?select=settings&id=eq.${season}`);
  const previos = (temp.settings?.titulos || []).filter((x) => !CAMPEONES.some((c) => c.division === division && c.cup === x.copa));
  const nuevos = CAMPEONES.filter((c) => c.division === division).map((c) => ({ copa: c.cup, club: aliasId(c.club, division), alias: c.club, nota: c.note }));
  const oro = nuevos.find((n) => n.copa === 'Oro');
  console.log(`  ${execute ? '✓' : '·'} ${division} títulos: ${nuevos.map((n) => `${n.copa} ${n.alias}`).join(' · ')}  (campeón de temporada: ${oro.alias})`);
  if (execute) {
    await patch(`tournament_seasons?id=eq.${season}`, {
      champion_club_id: oro.club, settings: { ...temp.settings, titulos: [...previos, ...nuevos] }, updated_at: new Date().toISOString(),
    });
  }
}
console.log(execute ? '\nlisto.' : '\nmodo --plan: no se escribió nada (ni el extract).');
