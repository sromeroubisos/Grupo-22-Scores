/**
 * Tabla de planteles del Torneo Regional del Litoral 2026 (Top 10): Reserva, Pre A
 * y Pre B, con los puntos que publicó Tercer Tiempo tras la fecha 17 (17/10/2026,
 * https://www.tercertiemporugby.com.ar/estudiantes-nuevamente-semifinales-del-trl/).
 *
 * La fuente trae SOLO puntos: ni PJ, G, E, P, PF ni PC, y ningún resultado. Por eso
 * cada división es un torneo con una tabla `fully_manual` de puntos y sin partidos,
 * y el grupo `litoral` de `tournament_squad_members` los suma con el Top 10.
 *
 *   node scripts/trl-planteles/seed.mjs --plan
 *   node scripts/trl-planteles/seed.mjs --execute
 *   node scripts/trl-planteles/seed.mjs --execute --limpiar   (rehace solo estos 3 por slug)
 *
 * Correr desde la raíz del repo (lee .env.local de process.cwd()).
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const REPO = process.cwd();
const ORIGEN = 'trl-planteles-seed';
const FUENTE = 'Tercer Tiempo Rugby, fecha 17 del TRL (17/10/2026)';
const TRL_A = 'b1ba2ecc-06e3-400f-9a45-1385321aad46';

// Sigla de la fuente → ficha base del club (la misma que usa el Top 10).
const CLUB = {
  DRC: 'duendes-r-c', CRAI: 'crai', SFRC: 'santa-fe-r-c', GER: 'gimnasia-y-esgrima-de-rosario',
  ORC: 'old-resian-club', JCR: 'jockey-club-de-rosario', PRC: 'parana-rowing',
  CAE: 'estudiantes-de-parana', CUR: 'universitario-de-rosario', JCVT: 'jockey-club-de-venado-tuerto',
};

// En el orden en que los publica la fuente. El último de Pre B figura como "JCR"
// con 3 puntos: es una errata (JCR ya está con 71), se toma por JCVT, el único
// club que falta en esa tabla.
const DIVISIONES = [
  { slug: 'torneo-regional-del-litoral-reserva', nombre: 'Torneo Regional del Litoral - Reserva', label: 'Reserva', orden: 2,
    filas: [['DRC', 66], ['CRAI', 62], ['SFRC', 62], ['GER', 60], ['ORC', 55], ['JCR', 51], ['PRC', 45], ['CAE', 28], ['CUR', 15], ['JCVT', 10]] },
  { slug: 'torneo-regional-del-litoral-pre-a', nombre: 'Torneo Regional del Litoral - Preintermedia "A"', label: 'Pre A', orden: 3,
    filas: [['CRAI', 73], ['GER', 71], ['JCR', 66], ['SFRC', 60], ['DRC', 52], ['ORC', 47], ['PRC', 37], ['CAE', 28], ['CUR', 23], ['JCVT', 3]] },
  { slug: 'torneo-regional-del-litoral-pre-b', nombre: 'Torneo Regional del Litoral - Preintermedia "B"', label: 'Pre B', orden: 4,
    filas: [['SFRC', 71], ['JCR', 71], ['CRAI', 61], ['CAE', 52], ['GER', 51], ['ORC', 51], ['DRC', 43], ['CUR', 38], ['PRC', 16], ['JCVT', 3]] },
];

const modo = process.argv.includes('--execute') ? 'execute' : process.argv.includes('--plan') ? 'plan' : null;
if (!modo) { console.error('usá --plan o --execute'); process.exit(2); }
const limpiar = process.argv.includes('--limpiar');

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
// return=representation y conteo: un 201 sin cuerpo no prueba que la fila quedó.
async function insertar(tabla, filas) {
  const res = await fetch(`${URL_BASE}/rest/v1/${tabla}?select=*`, {
    method: 'POST',
    headers: { ...H, 'content-type': 'application/json', prefer: 'return=representation' },
    body: JSON.stringify(filas),
  });
  if (!res.ok) throw new Error(`POST ${tabla}: ${res.status} ${(await res.text()).slice(0, 400)}`);
  const vuelto = await res.json();
  if (vuelto.length !== filas.length) throw new Error(`POST ${tabla}: mandé ${filas.length} y volvieron ${vuelto.length}`);
}
async function actualizar(recurso, cuerpo) {
  const res = await fetch(encodeURI(`${URL_BASE}/rest/v1/${recurso}`), {
    method: 'PATCH', headers: { ...H, 'content-type': 'application/json', prefer: 'return=minimal' }, body: JSON.stringify(cuerpo),
  });
  if (!res.ok) throw new Error(`PATCH ${recurso}: ${res.status} ${(await res.text()).slice(0, 400)}`);
}
async function borrar(recurso) {
  const res = await fetch(encodeURI(`${URL_BASE}/rest/v1/${recurso}`), { method: 'DELETE', headers: { ...H, prefer: 'return=minimal' } });
  if (!res.ok) throw new Error(`DELETE ${recurso}: ${res.status} ${(await res.text()).slice(0, 300)}`);
}

async function limpiarTorneo(id) {
  await borrar(`tournament_squad_members?tournament_id=eq.${id}`);
  await borrar(`tournament_standings?tournament_id=eq.${id}`);
  await borrar(`tournament_phase_participants?tournament_id=eq.${id}`);
  await actualizar(`tournament_participants?tournament_id=eq.${id}`, { season_entry_id: null });
  await borrar(`team_season_entries?tournament_id=eq.${id}`);
  await borrar(`tournament_participants?tournament_id=eq.${id}`);
  await borrar(`tournament_phases?tournament_id=eq.${id}`);
  await actualizar(`tournaments?id=eq.${id}`, { current_season_id: null });
  await borrar(`tournament_seasons?tournament_id=eq.${id}`);
  await borrar(`tournaments?id=eq.${id}`);
}

const ahora = new Date().toISOString();
const PUNTOS = { win: 4, draw: 2, loss: 0 };

async function crear(d, base, clubes) {
  const tournamentId = crypto.randomUUID();
  const seasonId = crypto.randomUUID();
  const faseId = crypto.randomUUID();
  const ruleset = {
    points: PUNTOS, pointsWin: 4, pointsDraw: 2, pointsLoss: 0,
    standings: { bonus_rules: [], points_base: PUNTOS },
    competition: { parameters: { season_model: 'multi_phase' }, format_type: 'league' },
    pointsSystem: { ...PUNTOS, allowBonusPoints: false },
  };
  await insertar('tournaments', [{
    id: tournamentId, union_id: base.union_id, season_id: '2026', name: d.nombre, slug: d.slug, original_name: d.nombre,
    status: 'published', category: 'Primera', age_grade: 'Mayores (Adults)', region: 'Litoral', country: 'ARG',
    country_id: 'argentina', country_name: 'Argentina', format: 'league', is_visible: true, is_active: true,
    logo_url: base.logo_url, ruleset, ruleset_version: 1, sport_id: 'rugby', sport: 'rugby', sport_name: 'Rugby',
    gender: 'masculino', scope: 'regional', priority: 0, sponsors: [], social_links: {}, display_order: 0,
    is_popular: false, is_api_managed: false, review_status: 'approved', external_id: null, current_season_id: null,
    created_at: ahora, updated_at: ahora,
  }]);
  await insertar('tournament_seasons', [{
    id: seasonId, tournament_id: tournamentId, legacy_tournament_id: tournamentId, season_code: '2026',
    name: `${d.nombre} 2026`, display_name: `${d.nombre} 2026`, slug: `${d.slug}-2026`, status: 'active', is_active: true,
    start_date: null, end_date: null, format: 'league', ruleset, settings: { source: ORIGEN, fuente: FUENTE },
    champion_club_id: null, created_at: ahora, updated_at: ahora,
  }]);
  await actualizar(`tournaments?id=eq.${tournamentId}`, { current_season_id: seasonId });
  await insertar('tournament_phases', [{
    id: faseId, tournament_id: tournamentId, season_id: seasonId, name: 'Fase regular', phase_type: 'league',
    order_index: 1, is_active: true, created_at: ahora, updated_at: ahora,
    settings: {
      legs: 2, teamsCount: d.filas.length, points: PUNTOS, pointsSystem: { ...PUNTOS, allowBonusPoints: false },
      standings: { mode: 'fully_manual', editable: true }, source: ORIGEN,
    },
  }]);

  const ps = d.filas.map(([sigla]) => ({ sigla, clubId: CLUB[sigla], participantId: crypto.randomUUID(), entryId: crypto.randomUUID() }));
  await insertar('tournament_participants', ps.map((p) => ({
    id: p.participantId, tournament_id: tournamentId, season_id: seasonId, season_entry_id: null, club_id: p.clubId,
    name: clubes.get(p.clubId), type: 'club', status: 'active', seed: null, group_id: null, short_code: null,
    notes: ORIGEN, joined_at: ahora, created_at: ahora, updated_at: ahora,
  })));
  await insertar('team_season_entries', ps.map((p) => ({
    id: p.entryId, season_id: seasonId, tournament_id: tournamentId, club_id: p.clubId, team_id: null,
    source_participant_id: p.participantId, group_id: null, zone: null, category: null, status: 'active', seed: null,
    notes: null, settings: { source: ORIGEN }, created_at: ahora, updated_at: ahora,
  })));
  for (const p of ps) await actualizar(`tournament_participants?id=eq.${p.participantId}`, { season_entry_id: p.entryId });
  await insertar('tournament_phase_participants', ps.map((p) => ({
    id: crypto.randomUUID(), tournament_id: tournamentId, season_id: seasonId, phase_id: faseId,
    participant_id: p.participantId, group_id: null, status: 'active', seed: null, notes: null,
    created_at: ahora, updated_at: ahora,
  })));
  await insertar('tournament_standings', d.filas.map(([, pts], i) => {
    const p = ps[i];
    return {
      tournament_id: tournamentId, season_id: seasonId, phase_id: faseId, group_id: null, club_id: p.clubId,
      season_entry_id: p.entryId, table_type: 'general', position: i + 1,
      played: 0, won: 0, drawn: 0, lost: 0, points: pts, scored: 0, conceded: 0, bonus_points: 0,
      form: null, streak: null, last_updated: ahora,
      stats: { team_name: clubes.get(p.clubId), solo_puntos: true, table_type: 'general', fuente: FUENTE, calculated_at: ahora },
    };
  }));
  return tournamentId;
}

async function main() {
  const [base] = await leer(`tournaments?select=union_id,logo_url&id=eq.${TRL_A}`);
  const ids = [...new Set(Object.values(CLUB))];
  const clubes = new Map((await leer(`clubs?select=id,name&id=in.(${ids.join(',')})`)).map((c) => [c.id, c.name]));
  const faltan = ids.filter((i) => !clubes.has(i));
  if (faltan.length) throw new Error(`Clubes que no existen: ${faltan.join(', ')}`);
  for (const d of DIVISIONES) {
    const n = d.filas.length;
    console.log(`${d.slug.padEnd(38)} ${n} filas · 1.° ${d.filas[0][0]} ${d.filas[0][1]} · último ${d.filas[n - 1][0]} ${d.filas[n - 1][1]}`);
  }
  if (modo === 'plan') { console.log('(plan: no se escribió nada)'); return; }

  const creados = [];
  for (const d of DIVISIONES) {
    const [ya] = await leer(`tournaments?select=id&slug=eq.${d.slug}`);
    if (ya && limpiar) { await limpiarTorneo(ya.id); console.log(`  limpio ${d.slug}`); }
    else if (ya) { console.log(`  ${d.slug} ya existe: lo salteo (--limpiar para rehacerlo)`); creados.push({ d, id: ya.id }); continue; }
    creados.push({ d, id: await crear(d, base, clubes) });
    console.log(`  creado ${d.slug}`);
  }

  // El grupo: Top 10 + las tres divisiones.
  const miembros = [
    { tournament_id: TRL_A, label: 'Top 10', sort_order: 1 },
    ...creados.map(({ d, id }) => ({ tournament_id: id, label: d.label, sort_order: d.orden })),
  ].map((m) => ({ group_key: 'litoral', group_name: 'Tabla de Planteles · Regional del Litoral', weight: 1, ...m }));
  await borrar('tournament_squad_members?group_key=eq.litoral');
  await insertar('tournament_squad_members', miembros);
  console.log(`grupo litoral: ${miembros.length} miembros`);
}

main().catch((e) => { console.error(e); process.exit(1); });
