/**
 * Seven de la República 2026 (42ª edición masculina, 28 y 29 de noviembre, Paraná):
 * los dos torneos —Campeonato y Ascenso— con sus zonas y los partidos del fixture
 * publicado por la Unión Entrerriana.
 *
 *   node scripts/seven-republica/seed.mjs --plan
 *   node scripts/seven-republica/seed.mjs --execute
 *   node scripts/seven-republica/seed.mjs --limpiar --execute   (borra los dos torneos y deja los clubes)
 *
 * Qué NO está cargado, porque el fixture publicado no lo trae:
 *  - la fase final del Campeonato (domingo) ni las copas,
 *  - 4 partidos de zona del Ascenso (Lagos–Jujeña, Misiones–Tierra del Fuego,
 *    UER B–Chubut, Austral–Formosa),
 *  - el femenino.
 *
 * Un participante son TRES filas encadenadas (ver participantes_tres_tablas):
 * tournament_participants, team_season_entries y tournament_phase_participants.
 *
 * Idempotente: un torneo cuyo slug ya existe se saltea, los clubes que ya existen
 * no se tocan. Deja SEVEN_REPUBLICA_ROLLBACK.sql.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const REPO = process.cwd();
const ROLLBACK = path.join(REPO, 'SEVEN_REPUBLICA_ROLLBACK.sql');
const UNION_UAR = 'union-argentina-de-rugby';
const ORIGEN = 'seven-republica-2026';

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
async function insertar(tabla, filas) {
  if (!filas.length) return;
  const res = await fetch(`${URL_BASE}/rest/v1/${tabla}`, {
    method: 'POST',
    headers: { ...H, 'content-type': 'application/json', prefer: 'return=minimal' },
    body: JSON.stringify(filas),
  });
  if (!res.ok) throw new Error(`POST ${tabla}: ${res.status} ${(await res.text()).slice(0, 400)}`);
}
async function actualizar(recurso, cuerpo) {
  const res = await fetch(encodeURI(`${URL_BASE}/rest/v1/${recurso}`), {
    method: 'PATCH',
    headers: { ...H, 'content-type': 'application/json', prefer: 'return=minimal' },
    body: JSON.stringify(cuerpo),
  });
  if (!res.ok) throw new Error(`PATCH ${recurso}: ${res.status} ${(await res.text()).slice(0, 400)}`);
}
async function borrar(recurso) {
  const res = await fetch(encodeURI(`${URL_BASE}/rest/v1/${recurso}`), {
    method: 'DELETE', headers: { ...H, prefer: 'return=minimal' },
  });
  if (!res.ok) throw new Error(`DELETE ${recurso}: ${res.status} ${(await res.text()).slice(0, 300)}`);
}

// ── Los 26 equipos ────────────────────────────────────────────────────────────
// `id` ya existente → se reusa tal cual. Sin `id` → se crea `sel-<clave>` y
// hereda escudo y unión del seleccionado M17 de la misma unión (`m17`), que ya
// tiene el escudo en public/clubs.
const EQUIPOS = {
  nordeste:     { name: 'Nordeste',         m17: 'nordeste-m17',        region: 'Nordeste' },
  tucuman:      { name: 'Tucumán',          m17: 'tucuman-m17',         region: 'Tucumán' },
  salta:        { name: 'Salta',            m17: 'salta-m17',           region: 'Salta' },
  paraguay:     { id: 'paraguay-7s' },
  entrerriana:  { name: 'Entrerriana',      m17: 'entrerriana-m17',     region: 'Entre Ríos' },
  cuyo:         { id: 'cuyo' },
  santafesina:  { name: 'Santafesina',      m17: 'santafesina-m17',     region: 'Santa Fe' },
  oeste:        { name: 'Oeste',            m17: 'oeste-m17',           region: 'Oeste de Buenos Aires' },
  cordobesa:    { name: 'Cordobesa',        m17: 'cordobesa-m17',       region: 'Córdoba' },
  rosario:      { name: 'Rosario',          m17: 'rosario-m17',         region: 'Rosario' },
  altovalle:    { id: 'alto-valle' },
  santiaguena:  { name: 'Santiagueña',      m17: 'santiaguena-m17',     region: 'Santiago del Estero' },
  buenosaires:  { name: 'Buenos Aires',     m17: 'buenos-aires-m17',    region: 'Buenos Aires' },
  mardelplata:  { name: 'Mar del Plata',    m17: 'mar-del-plata-m17',   region: 'Mar del Plata' },
  sanjuanina:   { name: 'Sanjuanina',       m17: 'sanjuanina-m17',      region: 'San Juan' },
  uruguay:      { id: 'uruguay-7s' },
  misiones:     { name: 'Misiones',         m17: 'misiones-m17',        region: 'Misiones' },
  sur:          { name: 'Sur',              m17: 'sur-m17',             region: 'Sur' },
  jujena:       { name: 'Jujeña',           m17: 'jujena-m17',          region: 'Jujuy' },
  tdf:          { name: 'Tierra del Fuego', m17: 'tierra-del-fuego-m17', region: 'Tierra del Fuego' },
  lagos:        { name: 'Lagos del Sur',    m17: 'lagos-del-sur-m17',   region: 'Lagos del Sur' },
  austral:      { name: 'Austral',          m17: 'austral-m17',         region: 'Santa Cruz' },
  andina:       { name: 'Andina',           m17: 'andina-m17',          region: 'Andina' },
  chubut:       { name: 'Chubut',           m17: 'chubut-m17',          region: 'Chubut' },
  formosa:      { name: 'Formosa',          m17: 'formosa-m17',         region: 'Formosa' },
  uerb:         { name: 'UER B',            m17: 'entrerriana-m17',     region: 'Entre Ríos' },
};
const idDe = (k) => EQUIPOS[k].id || `sel-${k}`;

// ── Sedes y horarios ──────────────────────────────────────────────────────────
const PLUMAZO = 'El Plumazo · Club Atlético Estudiantes, Paraná';
const TORTUGUITA = 'La Tortuguita · Paraná Rowing Club';
const SABADO = '2026-11-28';
const DOMINGO = '2026-11-29';
const CANCHA = { 1: PLUMAZO, 2: PLUMAZO, 3: TORTUGUITA };
const instante = (dia, hora) => new Date(`${dia}T${hora}:00-03:00`).toISOString();

const CAMPEONATO = {
  slug: 'seven-de-la-republica-2026-campeonato',
  nombre: 'Seven de la República - Campeonato',
  zonas: [
    { nombre: 'Zona 1', equipos: ['nordeste', 'tucuman', 'salta', 'paraguay'] },
    { nombre: 'Zona 2', equipos: ['entrerriana', 'cuyo', 'santafesina', 'oeste'] },
    { nombre: 'Zona 3', equipos: ['cordobesa', 'rosario', 'altovalle', 'santiaguena'] },
    { nombre: 'Zona 4', equipos: ['buenosaires', 'mardelplata', 'sanjuanina', 'uruguay'] },
  ],
  partidos: [
    // [fecha, hora, cancha, local, visitante]
    [1, '10:40', 1, 'buenosaires', 'uruguay'],
    [1, '10:40', 2, 'mardelplata', 'sanjuanina'],
    [1, '11:00', 1, 'cordobesa', 'santiaguena'],
    [1, '11:00', 2, 'rosario', 'altovalle'],
    [1, '11:20', 1, 'entrerriana', 'oeste'],
    [1, '11:20', 2, 'cuyo', 'santafesina'],
    [1, '11:40', 1, 'nordeste', 'paraguay'],
    [1, '11:40', 2, 'tucuman', 'salta'],
    [2, '16:40', 1, 'buenosaires', 'sanjuanina'],
    [2, '16:40', 2, 'mardelplata', 'uruguay'],
    [2, '17:00', 1, 'cordobesa', 'altovalle'],
    [2, '17:00', 2, 'rosario', 'santiaguena'],
    [2, '17:20', 1, 'entrerriana', 'santafesina'],
    [2, '17:20', 2, 'cuyo', 'oeste'],
    [2, '17:40', 1, 'nordeste', 'salta'],
    [2, '17:40', 2, 'tucuman', 'paraguay'],
    [3, '19:00', 1, 'buenosaires', 'mardelplata'],
    [3, '19:00', 2, 'sanjuanina', 'uruguay'],
    [3, '19:20', 1, 'cordobesa', 'rosario'],
    [3, '19:20', 2, 'altovalle', 'santiaguena'],
    [3, '19:40', 1, 'entrerriana', 'cuyo'],
    [3, '19:40', 2, 'santafesina', 'oeste'],
    [3, '20:00', 1, 'nordeste', 'tucuman'],
    [3, '20:00', 2, 'salta', 'paraguay'],
  ].map(([fecha, hora, cancha, local, visitante]) => ({ dia: SABADO, fecha, hora, cancha, local, visitante })),
};

const ASCENSO = {
  slug: 'seven-de-la-republica-2026-ascenso',
  nombre: 'Seven de la República - Ascenso',
  zonas: [
    { nombre: 'Zona 5', equipos: ['misiones', 'sur', 'jujena', 'tdf', 'lagos'] },
    { nombre: 'Zona 6', equipos: ['austral', 'andina', 'chubut', 'formosa', 'uerb'] },
  ],
  partidos: [
    // [día, fecha, hora, local, visitante] — todo en la cancha 3 (La Tortuguita)
    [SABADO, 1, '09:00', 'misiones', 'lagos'],
    [SABADO, 1, '09:20', 'sur', 'tdf'],
    [SABADO, 1, '09:40', 'austral', 'uerb'],
    [SABADO, 1, '10:00', 'andina', 'formosa'],
    [SABADO, 1, '16:00', 'misiones', 'jujena'],
    [SABADO, 1, '16:20', 'sur', 'lagos'],
    [SABADO, 1, '16:40', 'austral', 'chubut'],
    [SABADO, 1, '17:00', 'andina', 'uerb'],
    [SABADO, 1, '18:40', 'misiones', 'sur'],
    [SABADO, 1, '19:00', 'jujena', 'tdf'],
    [SABADO, 1, '19:20', 'austral', 'andina'],
    [SABADO, 1, '19:40', 'chubut', 'formosa'],
    [DOMINGO, 2, '09:00', 'sur', 'jujena'],
    [DOMINGO, 2, '09:20', 'tdf', 'lagos'],
    [DOMINGO, 2, '09:40', 'andina', 'chubut'],
    [DOMINGO, 2, '10:00', 'formosa', 'uerb'],
  ].map(([dia, fecha, hora, local, visitante]) => ({ dia, fecha, hora, cancha: 3, local, visitante })),
};
const TORNEOS = [CAMPEONATO, ASCENSO];

// ── Reglas ────────────────────────────────────────────────────────────────────
// PROVISORIO: el reglamento del Seven de la República no está cargado todavía.
// Se usa 2/1/0 sin bonus, que es lo habitual en un seven de una jornada.
const PUNTOS = { win: 2, draw: 1, loss: 0 };
const TIEBREAKERS = [
  { order: 'desc', metric: 'points', enabled: true, priority: 1 },
  { order: 'desc', metric: 'headToHead', enabled: true, priority: 2 },
  { order: 'desc', metric: 'triesFor', enabled: true, priority: 3 },
  { order: 'desc', metric: 'pointsDiff', enabled: true, priority: 4 },
];
const RULESET = {
  standings: { bonus_rules: [], points_base: PUNTOS },
  tiebreakers: { order: ['points', 'head_to_head', 'tries_for', 'diff'] },
  competition: { parameters: {}, format_type: 'groups' },
  rugbyModality: 'sevens',
};
const COLORES_ZONA = ['#00a365', '#3b82f6', '#f97316', '#eab308'];
const ahora = new Date().toISOString();

async function limpiarTorneo(tournamentId) {
  const fases = await leer(`tournament_phases?select=id&tournament_id=eq.${tournamentId}`);
  const idsFase = fases.map((f) => f.id);
  await borrar(`matches?tournament_id=eq.${tournamentId}`);
  await borrar(`tournament_phase_participants?tournament_id=eq.${tournamentId}`);
  await actualizar(`tournament_participants?tournament_id=eq.${tournamentId}`, { season_entry_id: null });
  await borrar(`team_season_entries?tournament_id=eq.${tournamentId}`);
  await borrar(`tournament_participants?tournament_id=eq.${tournamentId}`);
  if (idsFase.length) {
    await borrar(`tournament_rounds?phase_id=in.(${idsFase.join(',')})`);
    await borrar(`tournament_groups?phase_id=in.(${idsFase.join(',')})`);
  }
  await borrar(`tournament_phases?tournament_id=eq.${tournamentId}`);
  await actualizar(`tournaments?id=eq.${tournamentId}`, { current_season_id: null });
  await borrar(`tournament_seasons?tournament_id=eq.${tournamentId}`);
  await borrar(`tournaments?id=eq.${tournamentId}`);
}

async function escribirTorneo(t, nombreDe) {
  const tournamentId = crypto.randomUUID();
  const seasonId = crypto.randomUUID();
  try {
    await insertar('tournaments', [{
      id: tournamentId, union_id: UNION_UAR, season_id: '2026', name: t.nombre, slug: t.slug,
      original_name: t.nombre, status: 'published', category: 'Seven', age_grade: null,
      region: 'Entre Ríos', country: 'ARG', country_id: 'argentina', country_name: 'Argentina',
      format: 'groups', is_visible: true, is_active: true, logo_url: null,
      ruleset: RULESET, ruleset_version: 1, sport_id: 'rugby', sport: 'rugby', sport_name: 'Rugby',
      gender: 'masculino', priority: 0, sponsors: [], social_links: {}, display_order: 0,
      is_popular: false, is_api_managed: false, review_status: 'approved', external_id: null,
      created_at: ahora, updated_at: ahora,
    }]);
    await insertar('tournament_seasons', [{
      id: seasonId, tournament_id: tournamentId, legacy_tournament_id: tournamentId, season_code: '2026',
      name: `${t.nombre} 2026`, display_name: `${t.nombre} 2026`, slug: `${t.slug}-2026`,
      status: 'active', is_active: true, start_date: '2026-11-28', end_date: '2026-11-29',
      format: 'league', ruleset: RULESET, settings: { source: ORIGEN, edicion: 42 },
      champion_club_id: null, created_at: ahora, updated_at: ahora,
    }]);
    await actualizar(`tournaments?id=eq.${tournamentId}`, { current_season_id: seasonId });

    const faseId = crypto.randomUUID();
    const zonas = t.zonas.map((z) => ({ ...z, groupId: crypto.randomUUID() }));
    await insertar('tournament_phases', [{
      id: faseId, tournament_id: tournamentId, season_id: seasonId, name: 'Fase de grupos',
      phase_type: 'group_stage', order_index: 1, is_active: true,
      settings: {
        legs: 1, teamsCount: zonas.reduce((n, z) => n + z.equipos.length, 0), advanceCount: 0,
        group_names: zonas.map((z) => z.nombre), groupTags: zonas.map((z) => z.nombre),
        groupLabels: zonas.map((z, i) => ({
          id: z.groupId, name: z.nombre, color: COLORES_ZONA[i % COLORES_ZONA.length],
          colorMode: 'manual', autoColorIndex: i,
        })),
        pointsSystem: { ...PUNTOS, allowBonusPoints: false },
        tiebreakers: TIEBREAKERS, standings: { mode: 'automatic', editable: true },
        matchFormat: { type: 'single_match', label: 'Partido Único' },
        source: ORIGEN,
      },
      created_at: ahora, updated_at: ahora,
    }]);
    await insertar('tournament_groups', zonas.map((z, i) => ({
      id: z.groupId, phase_id: faseId, season_id: seasonId, name: z.nombre, order_index: i,
    })));

    // Fechas: una por número de ronda del fixture, con el día en que se juega.
    const fechas = new Map();
    for (const p of t.partidos) if (!fechas.has(p.fecha)) fechas.set(p.fecha, p.dia);
    const rondas = new Map();
    await insertar('tournament_rounds', [...fechas].sort((a, b) => a[0] - b[0]).map(([n, dia]) => {
      const id = crypto.randomUUID(); rondas.set(n, id);
      return {
        id, phase_id: faseId, season_id: seasonId, name: `Fecha ${n}`, order_index: n,
        start_date: dia, end_date: dia, is_completed: false, notes: null, created_at: ahora, updated_at: ahora,
      };
    }));

    // Participantes: las TRES filas.
    const parts = [];
    for (const z of zonas) for (const k of z.equipos) {
      parts.push({ k, z, clubId: idDe(k), nombre: nombreDe(k), pid: crypto.randomUUID(), eid: crypto.randomUUID() });
    }
    await insertar('tournament_participants', parts.map((p) => ({
      id: p.pid, tournament_id: tournamentId, season_id: seasonId, season_entry_id: null,
      club_id: p.clubId, name: p.nombre, type: 'club', status: 'active', seed: null,
      group_id: p.z.groupId, short_code: null, notes: ORIGEN, joined_at: ahora,
      created_at: ahora, updated_at: ahora,
    })));
    await insertar('team_season_entries', parts.map((p) => ({
      id: p.eid, season_id: seasonId, tournament_id: tournamentId, club_id: p.clubId, team_id: null,
      source_participant_id: p.pid, group_id: p.z.groupId, zone: p.z.nombre, category: null,
      status: 'active', seed: null, notes: null, settings: { source: ORIGEN },
      created_at: ahora, updated_at: ahora,
    })));
    for (const p of parts) await actualizar(`tournament_participants?id=eq.${p.pid}`, { season_entry_id: p.eid });
    await insertar('tournament_phase_participants', parts.map((p) => ({
      id: crypto.randomUUID(), tournament_id: tournamentId, season_id: seasonId, phase_id: faseId,
      participant_id: p.pid, group_id: p.z.groupId, status: 'active', seed: null, notes: null,
      created_at: ahora, updated_at: ahora,
    })));

    // Partidos. Todas las filas con las mismas claves (PostgREST rechaza el lote si no).
    const zonaDe = new Map(zonas.flatMap((z) => z.equipos.map((k) => [k, z])));
    const partidos = t.partidos.map((p) => {
      const z = zonaDe.get(p.local);
      if (z !== zonaDe.get(p.visitante)) throw new Error(`${p.local} y ${p.visitante} no son de la misma zona`);
      return {
        id: crypto.randomUUID(), tournament_id: tournamentId, season_id: seasonId, phase_id: faseId,
        group_id: z.groupId, round_uuid: rondas.get(p.fecha), round_label: `Fecha ${p.fecha}`,
        sport_id: 'rugby', sport: 'rugby', venue: CANCHA[p.cancha], pitch: String(p.cancha),
        status: 'scheduled', score: null,
        home_club_id: idDe(p.local), away_club_id: idDe(p.visitante),
        home_season_entry_id: parts.find((x) => x.k === p.local).eid,
        away_season_entry_id: parts.find((x) => x.k === p.visitante).eid,
        date_time: instante(p.dia, p.hora), is_visible: true, notes: z.nombre,
        home_base_points: 0, away_base_points: 0, home_bonus_points: 0, away_bonus_points: 0,
        points_autocalculated: true, live_enabled: false, lineups: { home: [], away: [] },
        events: [], review_status: 'approved', external_id: null, bracket_match_code: null,
        home_source_label: null, away_source_label: null, participant_source: null,
        created_at: ahora, updated_at: ahora,
      };
    });
    await insertar('matches', partidos);
    return { tournamentId, seasonId, participantes: parts.length, partidos: partidos.length, zonas: zonas.length };
  } catch (e) {
    await limpiarTorneo(tournamentId).catch((e2) => console.error(`  la limpieza falló también: ${e2.message}`));
    throw e;
  }
}

async function main() {
  console.log(`modo: ${modo}\n`);

  if (process.argv.includes('--limpiar')) {
    const filas = await leer(`tournaments?select=id,name&slug=in.(${TORNEOS.map((t) => t.slug).join(',')})`);
    for (const f of filas) console.log(`  - ${f.name}`);
    if (modo === 'plan') { console.log('\nmodo --plan: no se borró nada.'); return; }
    for (const f of filas) { await limpiarTorneo(f.id); console.log(`  ✓ borrado ${f.name}`); }
    return;
  }

  // Controles del fixture: cada par de una zona aparece una sola vez.
  for (const t of TORNEOS) {
    const vistos = new Set();
    for (const p of t.partidos) {
      const par = [p.local, p.visitante].sort().join('|');
      if (vistos.has(par)) throw new Error(`${t.slug}: ${par} repetido`);
      vistos.add(par);
    }
  }

  const claves = Object.keys(EQUIPOS);
  const idsExistentes = claves.filter((k) => EQUIPOS[k].id).map((k) => EQUIPOS[k].id);
  const aCrear = claves.filter((k) => !EQUIPOS[k].id);
  const hay = new Set((await leer(`clubs?select=id&id=in.(${[...idsExistentes, ...aCrear.map(idDe)].join(',')})`)).map((c) => c.id));
  for (const id of idsExistentes) if (!hay.has(id)) throw new Error(`el club existente ${id} no está en la base`);
  const nuevos = aCrear.filter((k) => !hay.has(idDe(k)));
  const fuentes = await leer(`clubs?select=id,union_id,logo_url,country&id=in.(${[...new Set(nuevos.map((k) => EQUIPOS[k].m17))].join(',')})`);
  const fuente = new Map(fuentes.map((c) => [c.id, c]));
  for (const k of nuevos) if (!fuente.get(EQUIPOS[k].m17)) throw new Error(`falta ${EQUIPOS[k].m17} para heredar escudo de ${k}`);

  const nombres = Object.fromEntries((await leer(`clubs?select=id,name&id=in.(${idsExistentes.join(',')})`)).map((c) => [c.id, c.name]));
  const nombreDe = (k) => EQUIPOS[k].name || nombres[EQUIPOS[k].id];

  const slugsDb = new Set((await leer(`tournaments?select=slug&slug=in.(${TORNEOS.map((t) => t.slug).join(',')})`)).map((t) => t.slug));
  const porCrear = TORNEOS.filter((t) => !slugsDb.has(t.slug));

  console.log(`clubes a crear (${nuevos.length}):`);
  for (const k of nuevos) console.log(`  + ${EQUIPOS[k].name.padEnd(18)} sel-${k}  logo ${fuente.get(EQUIPOS[k].m17).logo_url}`);
  console.log(`clubes que se reusan: ${idsExistentes.join(', ')}`);
  for (const t of porCrear) console.log(`torneo + ${t.nombre} · ${t.zonas.length} zonas · ${t.partidos.length} partidos`);
  if (slugsDb.size) console.log(`(ya existen y se saltean: ${[...slugsDb].join(', ')})`);
  if (modo === 'plan') { console.log('\nmodo --plan: no se escribió una sola fila.'); return; }

  await insertar('clubs', nuevos.map((k) => {
    const e = EQUIPOS[k]; const f = fuente.get(e.m17); const id = idDe(k);
    return {
      id, union_id: f.union_id, name: e.name, short_name: e.name, city: null, region: e.region,
      country: f.country || 'ARG', logo_url: f.logo_url, primary_color: null, slug: id,
      is_visible: true, entity_type: 'club', sport: 'rugby', sport_id: 'rugby', category: null,
      categories: [], status: 'active', visibility: 'visible', external_id: null,
      created_at: ahora, updated_at: ahora,
    };
  }));
  console.log(`\n✓ ${nuevos.length} clubes`);

  const creados = [];
  for (const t of porCrear) {
    const r = await escribirTorneo(t, nombreDe);
    creados.push({ nombre: t.nombre, ...r });
    console.log(`✓ ${t.nombre}: ${r.zonas} zonas · ${r.participantes} participantes · ${r.partidos} partidos`);
  }

  const sql = ['-- Rollback de la carga del Seven de la República 2026.', 'BEGIN;', ''];
  for (const c of creados) {
    const q = `(SELECT id FROM public.tournament_phases WHERE tournament_id = '${c.tournamentId}')`;
    sql.push(`-- ${c.nombre}`,
      `DELETE FROM public.matches WHERE tournament_id = '${c.tournamentId}';`,
      `DELETE FROM public.tournament_phase_participants WHERE tournament_id = '${c.tournamentId}';`,
      `UPDATE public.tournament_participants SET season_entry_id = NULL WHERE tournament_id = '${c.tournamentId}';`,
      `DELETE FROM public.team_season_entries WHERE tournament_id = '${c.tournamentId}';`,
      `DELETE FROM public.tournament_participants WHERE tournament_id = '${c.tournamentId}';`,
      `DELETE FROM public.tournament_rounds WHERE phase_id IN ${q};`,
      `DELETE FROM public.tournament_groups WHERE phase_id IN ${q};`,
      `DELETE FROM public.tournament_phases WHERE tournament_id = '${c.tournamentId}';`,
      `UPDATE public.tournaments SET current_season_id = NULL WHERE id = '${c.tournamentId}';`,
      `DELETE FROM public.tournament_seasons WHERE tournament_id = '${c.tournamentId}';`,
      `DELETE FROM public.tournaments WHERE id = '${c.tournamentId}';`, '');
  }
  if (nuevos.length) sql.push(`DELETE FROM public.clubs WHERE id IN (${nuevos.map((k) => `'${idDe(k)}'`).join(', ')});`, '');
  sql.push('COMMIT;');
  fs.writeFileSync(ROLLBACK, sql.join('\n') + '\n', 'utf8');
  console.log(`\nrollback escrito: ${ROLLBACK}`);
}

main().catch((e) => { console.error('\nFALLÓ:', e.message || e); process.exit(1); });
