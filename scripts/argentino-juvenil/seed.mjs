/**
 * Carga del Campeonato Argentino Juvenil en G22: los 16 seleccionados M17, los
 * dos torneos de 2026 (Zona Campeonato y Zona Ascenso) con su fixture entero, y
 * el cuadro de honor —M17 desde 2022, M18 desde 2001—.
 *
 *   node scripts/argentino-juvenil/seed.mjs --plan
 *   node scripts/argentino-juvenil/seed.mjs --execute
 *
 * Los escudos tienen que estar ANTES: `node scripts/argentino-juvenil/logos.mjs
 * --execute` los deja en `public/`. Escribir la ruta de un archivo que no está
 * no falla, sólo deja el escudo roto.
 *
 * Un participante son TRES filas encadenadas y cada consumidor lee una
 * distinta: `tournament_participants` es el vínculo, `team_season_entries` es
 * lo que lista la PÁGINA del torneo, y `tournament_phase_participants` es de
 * donde sale la TABLA de posiciones. Ninguno avisa cuando falta el suyo:
 * degradan en silencio.
 *
 * La fase final entra como PLACEHOLDERS: los ocho cruces existen con su fecha y
 * su definición, sin equipos, `is_visible=false` hasta que se sepan los rivales.
 * Los cuatro de la fecha 5 salen de la fecha 4 por
 * `tournament_match_advancement_rules`, así que se completan solos al cargar los
 * resultados. Los de la fecha 4 salen de la TABLA de cada zona, que no es un
 * partido: van con la etiqueta ("1º Zona 1") y se cargan a mano.
 *
 * Idempotente: un torneo cuyo slug ya está en la base se saltea entero, y los
 * clubes que ya existen no se pisan. Deja `ARGENTINO_JUVENIL_ROLLBACK.sql`.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import {
  CLUBES_M17, CLUBES_M18, DIAS, instanteDe, LOGO_TORNEO, PALMARES_M17, PALMARES_M18,
  PUNTOS, RULESET, TIEBREAKERS, TORNEOS, TORNEO_M18,
} from './datos.mjs';

const REPO = process.cwd();
const ROLLBACK = path.join(REPO, 'ARGENTINO_JUVENIL_ROLLBACK.sql');
const UNION_UAR = 'union-argentina-de-rugby';
const ORIGEN = 'argentino-juvenil-2026';

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
    method: 'DELETE',
    headers: { ...H, prefer: 'return=minimal' },
  });
  if (!res.ok) throw new Error(`DELETE ${recurso}: ${res.status} ${(await res.text()).slice(0, 300)}`);
}

/**
 * Deshace un torneo a medio escribir. Sin esto, un fallo en la mitad deja el
 * torneo creado y la próxima corrida lo saltea por slug: queda una cáscara sin
 * fixture que sólo se ve entrando a la página.
 */
async function limpiarTorneo(tournamentId) {
  const fases = await leer(`tournament_phases?select=id&tournament_id=eq.${tournamentId}`);
  const idsFase = fases.map((f) => f.id);
  if (idsFase.length) {
    await borrar(`tournament_match_advancement_rules?phase_id=in.(${idsFase.join(',')})`);
  }
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

const ahora = new Date().toISOString();
const colores = JSON.parse(fs.readFileSync(path.join(REPO, 'scripts', 'argentino-juvenil', 'colores.json'), 'utf8'));

/** Color de zona: el mismo verde/amarillo/naranja que ya usan las zonas cargadas a mano. */
const COLORES_ZONA = ['#00a365', '#eab308', '#f97316', '#3b82f6'];

function filaDeClub(c) {
  const escudo = path.join(REPO, 'public', 'clubs', `${c.id}.png`);
  if (!fs.existsSync(escudo)) throw new Error(`falta el escudo public/clubs/${c.id}.png — corré logos.mjs --execute primero`);
  return {
    id: c.id,
    union_id: c.union_id,
    name: c.name,
    short_name: c.name,
    city: null,
    region: c.region,
    country: c.country,
    logo_url: `/clubs/${c.id}.png`,
    primary_color: colores[c.id] || null,
    slug: c.id,
    is_visible: true,
    entity_type: 'club',
    sport: 'rugby',
    sport_id: 'rugby',
    category: null,
    categories: [],
    status: 'active',
    visibility: 'visible',
    external_id: null,
    created_at: ahora,
    updated_at: ahora,
  };
}

function filaDeTorneo({ id, nombre, slug, edad, seasonCode, formato }) {
  return {
    id,
    union_id: UNION_UAR,
    season_id: seasonCode,
    name: nombre,
    slug,
    original_name: nombre,
    status: 'published',
    category: 'Juvenil',
    age_grade: edad,
    region: 'Argentina',
    country: 'ARG',
    country_id: 'argentina',
    country_name: 'Argentina',
    format: formato,
    is_visible: true,
    is_active: true,
    logo_url: LOGO_TORNEO,
    ruleset: RULESET,
    ruleset_version: 1,
    sport_id: 'rugby',
    sport: 'rugby',
    sport_name: 'Rugby',
    gender: 'masculino',
    priority: 0,
    sponsors: [],
    social_links: {},
    display_order: 0,
    is_popular: false,
    is_api_managed: false,
    review_status: 'approved',
    external_id: null,
    created_at: ahora,
    updated_at: ahora,
  };
}

function filaDeTemporada({ id, tournamentId, seasonCode, nombre, slug, activa, campeon, desde, hasta, nota }) {
  return {
    id,
    tournament_id: tournamentId,
    legacy_tournament_id: tournamentId,
    season_code: seasonCode,
    name: nombre,
    display_name: nombre,
    slug,
    status: activa ? 'active' : 'completed',
    is_active: Boolean(activa),
    start_date: desde || null,
    end_date: hasta || null,
    format: 'league',
    ruleset: activa ? RULESET : {},
    settings: { source: ORIGEN, ...(nota ? { note: nota } : {}) },
    champion_club_id: campeon || null,
    created_at: ahora,
    updated_at: ahora,
  };
}

/** Lo que el gestor y el motor de posiciones leen de una fase. */
function settingsDeFase({ zonas, playoff }) {
  return {
    legs: 1,
    teamsCount: 8,
    advanceCount: playoff ? 1 : 2,
    group_names: zonas.map((z) => z.nombre),
    groupTags: zonas.map((z) => z.nombre),
    groupLabels: zonas.map((z, i) => ({
      id: z.groupId, name: z.nombre, color: COLORES_ZONA[i % COLORES_ZONA.length],
      colorMode: 'manual', autoColorIndex: i,
    })),
    points: { win: PUNTOS.win, draw: PUNTOS.draw, loss: PUNTOS.loss },
    pointsSystem: { ...PUNTOS, allowBonusPoints: true },
    bonus: RULESET.bonus,
    tiebreakers: TIEBREAKERS,
    standings: { mode: 'automatic', editable: true },
    ...(playoff ? { phaseMode: 'playoff', playoffThirdPlace: true } : {}),
    source: ORIGEN,
  };
}

const etiquetaDeOrigen = (s) => (s.zona ? `${s.pos}º ${s.zona}` : `${s.resultado === 'winner' ? 'Ganador' : 'Perdedor'} P${s.de}`);
const fuenteDeOrigen = (s) => (s.zona
  ? { type: 'standing', group: s.zona, position: s.pos }
  : { type: s.resultado, ref: `P${s.de}` });

/**
 * Escribe un torneo de 2026 entero y devuelve el conteo de cada tabla. Si algo
 * falla en el medio, deshace lo escrito: media docena de tablas encadenadas no
 * entran en una transacción sobre PostgREST, así que la limpieza es a mano.
 */
async function crearTorneo2026(t) {
  const tournamentId = crypto.randomUUID();
  const seasonId = crypto.randomUUID();
  try {
    return await escribirTorneo2026(t, tournamentId, seasonId);
  } catch (e) {
    await limpiarTorneo(tournamentId).catch((e2) => {
      console.error(`  la limpieza de ${t.slug} falló también: ${e2.message}`);
    });
    throw e;
  }
}

async function escribirTorneo2026(t, tournamentId, seasonId) {
  await insertar('tournaments', [filaDeTorneo({
    id: tournamentId, nombre: t.nombre, slug: t.slug, edad: 'M17', seasonCode: '2026', formato: 'groups',
  })]);
  await insertar('tournament_seasons', [filaDeTemporada({
    id: seasonId, tournamentId, seasonCode: '2026', nombre: `${t.nombre} 2026`,
    slug: `${t.slug}-2026`, activa: true, desde: '2026-08-22', hasta: '2026-11-15',
  })]);
  await actualizar(`tournaments?id=eq.${tournamentId}`, { current_season_id: seasonId });

  // ── Fases y zonas ────────────────────────────────────────────────────────
  // La fase con zonas va como 'group_stage': la vista por zonas del detalle
  // público SÓLO se arma con ese phase_type.
  const faseGrupos = crypto.randomUUID();
  const faseFinal = crypto.randomUUID();
  const zonas = t.zonas.map((z) => ({ ...z, groupId: crypto.randomUUID() }));
  const groupIdDe = new Map(zonas.map((z) => [z.nombre, z.groupId]));

  await insertar('tournament_phases', [
    {
      id: faseGrupos, tournament_id: tournamentId, season_id: seasonId,
      name: 'Fase de Grupos', phase_type: 'group_stage', order_index: 1, is_active: true,
      settings: settingsDeFase({ zonas, playoff: false }), created_at: ahora, updated_at: ahora,
    },
    {
      id: faseFinal, tournament_id: tournamentId, season_id: seasonId,
      name: 'Fase Final', phase_type: 'playoff', order_index: 2, is_active: false,
      settings: {
        ...settingsDeFase({ zonas: [], playoff: true }),
        playoffStages: [
          { id: 'playoff_stage_1', name: 'Fecha 4', matchCount: 4, orderIndex: 1 },
          { id: 'playoff_stage_2', name: 'Fecha 5', matchCount: 4, orderIndex: 2 },
        ],
        posiciones: t.posiciones,
      },
      created_at: ahora, updated_at: ahora,
    },
  ]);
  await insertar('tournament_groups', zonas.map((z, i) => ({
    id: z.groupId, phase_id: faseGrupos, season_id: seasonId, name: z.nombre, order_index: i,
  })));

  // ── Fechas ───────────────────────────────────────────────────────────────
  const rondas = new Map();
  const filasRondas = [];
  for (const n of [1, 2, 3, 4, 5]) {
    const id = crypto.randomUUID();
    rondas.set(n, id);
    const dia = DIAS[n];
    filasRondas.push({
      id, phase_id: n <= 3 ? faseGrupos : faseFinal, season_id: seasonId,
      name: `Fecha ${n}`, order_index: n <= 3 ? n : n - 3,
      start_date: dia, end_date: dia, is_completed: false, notes: null,
      created_at: ahora, updated_at: ahora,
    });
  }
  await insertar('tournament_rounds', filasRondas);

  // ── Participantes: las TRES filas ────────────────────────────────────────
  const participantes = [];
  for (const z of zonas) {
    for (const clubId of z.clubes) {
      const club = CLUBES_M17.find((c) => c.id === clubId);
      const participantId = crypto.randomUUID();
      const entryId = crypto.randomUUID();
      participantes.push({ participantId, entryId, clubId, zona: z, nombre: club.name });
    }
  }
  await insertar('tournament_participants', participantes.map((p) => ({
    id: p.participantId, tournament_id: tournamentId, season_id: seasonId,
    season_entry_id: null, club_id: p.clubId, name: p.nombre, type: 'club',
    status: 'active', seed: null, group_id: p.zona.groupId, short_code: null,
    notes: ORIGEN, joined_at: ahora, created_at: ahora, updated_at: ahora,
  })));
  await insertar('team_season_entries', participantes.map((p) => ({
    id: p.entryId, season_id: seasonId, tournament_id: tournamentId, club_id: p.clubId,
    team_id: null, source_participant_id: p.participantId, group_id: p.zona.groupId,
    zone: p.zona.nombre, category: null, status: 'active', seed: null, notes: null,
    settings: { source: ORIGEN }, created_at: ahora, updated_at: ahora,
  })));
  // FK circular: el back-ref del participante a su entrada va después.
  for (const p of participantes) {
    await actualizar(`tournament_participants?id=eq.${p.participantId}`, { season_entry_id: p.entryId });
  }
  // La fase final la juegan los ocho: quién va a cada cruce lo decide la tabla,
  // pero todos tienen que estar asignados o quedan fuera del recálculo.
  await insertar('tournament_phase_participants', [
    ...participantes.map((p) => ({
      id: crypto.randomUUID(), tournament_id: tournamentId, season_id: seasonId,
      phase_id: faseGrupos, participant_id: p.participantId, group_id: p.zona.groupId,
      status: 'active', seed: null, notes: null, created_at: ahora, updated_at: ahora,
    })),
    ...participantes.map((p) => ({
      id: crypto.randomUUID(), tournament_id: tournamentId, season_id: seasonId,
      phase_id: faseFinal, participant_id: p.participantId, group_id: null,
      status: 'active', seed: null, notes: null, created_at: ahora, updated_at: ahora,
    })),
  ]);

  // ── Partidos ─────────────────────────────────────────────────────────────
  // Las filas de zona y las de la fase final llevan EXACTAMENTE las mismas
  // claves: el insert masivo de PostgREST rechaza el lote entero con
  // "All object keys must match" si una fila trae una columna que otra no.
  const comun = {
    tournament_id: tournamentId, season_id: seasonId, sport_id: 'rugby', sport: 'rugby',
    venue: null, status: 'scheduled', score: null,
    home_base_points: 0, away_base_points: 0, home_bonus_points: 0, away_bonus_points: 0,
    points_autocalculated: true, live_enabled: false, lineups: { home: [], away: [] },
    events: [], review_status: 'approved', external_id: null,
    bracket_match_code: null, home_source_label: null, away_source_label: null,
    participant_source: null, created_at: ahora, updated_at: ahora,
  };

  const partidos = t.grupos.map((g) => ({
    ...comun, id: crypto.randomUUID(), phase_id: faseGrupos,
    group_id: groupIdDe.get(g.zona), round_uuid: rondas.get(g.fecha), round_label: `Fecha ${g.fecha}`,
    home_club_id: g.local, away_club_id: g.visitante, date_time: instanteDe(g.fecha, g.hora),
    is_visible: true, notes: g.zona,
  }));

  const idPorNumero = new Map();
  for (const f of t.final) {
    const id = crypto.randomUUID();
    idPorNumero.set(f.n, id);
    partidos.push({
      ...comun, id, phase_id: faseFinal, group_id: null,
      round_uuid: rondas.get(f.fecha), round_label: `Fecha ${f.fecha}`,
      home_club_id: null, away_club_id: null, date_time: instanteDe(f.fecha, f.hora),
      is_visible: false, notes: f.definicion,
      bracket_match_code: `P${f.n}`,
      home_source_label: etiquetaDeOrigen(f.local),
      away_source_label: etiquetaDeOrigen(f.visitante),
      participant_source: { home: fuenteDeOrigen(f.local), away: fuenteDeOrigen(f.visitante) },
    });
  }
  await insertar('matches', partidos);

  // ── Avance automático de la fecha 5 ──────────────────────────────────────
  const reglas = [];
  for (const f of t.final.filter((x) => x.fecha === 5)) {
    for (const slot of ['local', 'visitante']) {
      const s = f[slot];
      reglas.push({
        id: crypto.randomUUID(), phase_id: faseFinal,
        source_match_id: idPorNumero.get(s.de), outcome: s.resultado,
        target_match_id: idPorNumero.get(f.n), target_slot: slot === 'local' ? 'home' : 'away',
        target_group_id: null, created_at: ahora, updated_at: ahora,
      });
    }
  }
  await insertar('tournament_match_advancement_rules', reglas);

  return {
    tournamentId, seasonId,
    conteo: {
      fases: 2, zonas: zonas.length, fechas: filasRondas.length,
      participantes: participantes.length, partidos: partidos.length, reglas: reglas.length,
    },
  };
}

async function main() {
  console.log(`modo: ${modo}\n`);

  // `--limpiar` borra los tres torneos de esta carga y deja los clubes: sirve
  // para rehacer el fixture sin tocar los escudos ni las 20 fichas.
  if (process.argv.includes('--limpiar')) {
    const slugs = [...TORNEOS.map((t) => t.slug), TORNEO_M18.slug];
    const filas = await leer(`tournaments?select=id,name,slug&slug=in.(${slugs.join(',')})`);
    console.log(`torneos a borrar (${filas.length}):`);
    for (const f of filas) console.log(`  - ${f.name}`);
    if (modo === 'plan') { console.log('\nmodo --plan: no se borró nada.'); return; }
    for (const f of filas) { await limpiarTorneo(f.id); console.log(`  ✓ borrado ${f.name}`); }
    return;
  }

  // ── Qué falta ─────────────────────────────────────────────────────────────
  const todosLosClubes = [...CLUBES_M17, ...CLUBES_M18];
  const ids = todosLosClubes.map((c) => c.id);
  const existentes = new Set((await leer(`clubs?select=id&id=in.(${ids.join(',')})`)).map((c) => c.id));
  const clubesNuevos = todosLosClubes.filter((c) => !existentes.has(c.id));

  const slugs = [...TORNEOS.map((t) => t.slug), TORNEO_M18.slug];
  const torneosDb = new Set((await leer(`tournaments?select=slug&slug=in.(${slugs.join(',')})`)).map((t) => t.slug));
  const torneos2026 = TORNEOS.filter((t) => !torneosDb.has(t.slug));
  const crearM18 = !torneosDb.has(TORNEO_M18.slug);

  const unionesDb = new Set((await leer('unions?select=id&sport=eq.rugby&limit=500')).map((u) => u.id));
  const sinUnion = CLUBES_M17.filter((c) => !c.union_id);
  const unionRota = todosLosClubes.filter((c) => c.union_id && !unionesDb.has(c.union_id));
  if (unionRota.length) throw new Error(`uniones inexistentes: ${unionRota.map((c) => c.union_id).join(', ')}`);

  console.log(`clubes a crear (${clubesNuevos.length} de ${todosLosClubes.length}):`);
  for (const c of clubesNuevos) console.log(`  + ${c.name.padEnd(22)} ${c.union_id || '— sin unión en la base —'}`);
  if (existentes.size) console.log(`  (ya existen y no se tocan: ${[...existentes].join(', ')})`);
  console.log(`\ntorneos a crear:`);
  for (const t of torneos2026) console.log(`  + ${t.nombre} · 8 equipos · ${t.grupos.length + t.final.length} partidos`);
  if (crearM18) console.log(`  + ${TORNEO_M18.nombre} · ${PALMARES_M18.length} ediciones de palmarés`);
  if (torneosDb.size) console.log(`  (ya existen y se saltean: ${[...torneosDb].join(', ')})`);
  console.log(`\npalmarés M17 sobre "${TORNEOS[0].nombre}": ${PALMARES_M17.map((p) => `${p.anio} ${p.campeon}`).join(' · ')}`);
  if (sinUnion.length) {
    console.log(`\naviso: ${sinUnion.length} uniones no están en la base y esos clubes quedan sin vínculo:`);
    console.log(`  ${sinUnion.map((c) => c.name).join(', ')}`);
  }

  if (modo === 'plan') { console.log('\nmodo --plan: no se escribió una sola fila.'); return; }

  // ── Escritura ─────────────────────────────────────────────────────────────
  await insertar('clubs', clubesNuevos.map(filaDeClub));
  console.log(`\n✓ ${clubesNuevos.length} clubes`);

  const creados = [];
  for (const t of torneos2026) {
    const { tournamentId, seasonId, conteo } = await crearTorneo2026(t);
    creados.push({ nombre: t.nombre, tournamentId, seasonId });
    console.log(`✓ ${t.nombre}`);
    console.log(`    ${conteo.fases} fases · ${conteo.zonas} zonas · ${conteo.fechas} fechas · ${conteo.participantes} participantes · ${conteo.partidos} partidos · ${conteo.reglas} reglas de avance`);
  }

  // Palmarés del M17: temporadas anteriores del torneo principal, sin fixture.
  const principal = creados.find((c) => c.nombre === TORNEOS[0].nombre);
  if (principal) {
    await insertar('tournament_seasons', PALMARES_M17.map((p) => filaDeTemporada({
      id: crypto.randomUUID(), tournamentId: principal.tournamentId, seasonCode: p.anio,
      nombre: `Campeonato Argentino Juvenil M17 ${p.anio}`,
      slug: `campeonato-argentino-juvenil-m17-${p.anio}`, activa: false, campeon: p.campeon,
    })));
    console.log(`✓ palmarés M17: ${PALMARES_M17.length} ediciones`);
  }

  if (crearM18) {
    const tournamentId = crypto.randomUUID();
    await insertar('tournaments', [filaDeTorneo({
      id: tournamentId, nombre: TORNEO_M18.nombre, slug: TORNEO_M18.slug,
      edad: 'M18', seasonCode: '2022', formato: 'league',
    })]);
    const temporadas = PALMARES_M18.map((p) => ({
      id: crypto.randomUUID(),
      fila: filaDeTemporada({
        id: null, tournamentId, seasonCode: p.anio,
        nombre: `${TORNEO_M18.nombre} ${p.anio}`,
        slug: `${TORNEO_M18.slug}-${p.anio}`, activa: false, campeon: p.campeon,
      }),
    }));
    for (const t of temporadas) t.fila.id = t.id;
    await insertar('tournament_seasons', temporadas.map((t) => t.fila));
    const ultima = temporadas[temporadas.length - 1];
    await actualizar(`tournaments?id=eq.${tournamentId}`, { current_season_id: ultima.id });
    creados.push({ nombre: TORNEO_M18.nombre, tournamentId, seasonId: ultima.id });
    console.log(`✓ ${TORNEO_M18.nombre}: ${temporadas.length} ediciones (2020 no se disputó y no lleva temporada)`);
  }

  // ── Rollback ──────────────────────────────────────────────────────────────
  const sql = ['-- Rollback de la carga del Campeonato Argentino Juvenil.',
    '-- Borra SÓLO lo que creó esta corrida. Los clubes van último: los torneos',
    '-- los referencian por FK.', 'BEGIN;', ''];
  for (const c of creados) {
    sql.push(`-- ${c.nombre}`);
    sql.push(`DELETE FROM public.tournament_match_advancement_rules WHERE phase_id IN (SELECT id FROM public.tournament_phases WHERE tournament_id = '${c.tournamentId}');`);
    sql.push(`DELETE FROM public.matches WHERE tournament_id = '${c.tournamentId}';`);
    sql.push(`DELETE FROM public.tournament_phase_participants WHERE tournament_id = '${c.tournamentId}';`);
    sql.push(`UPDATE public.tournament_participants SET season_entry_id = NULL WHERE tournament_id = '${c.tournamentId}';`);
    sql.push(`DELETE FROM public.team_season_entries WHERE tournament_id = '${c.tournamentId}';`);
    sql.push(`DELETE FROM public.tournament_participants WHERE tournament_id = '${c.tournamentId}';`);
    sql.push(`DELETE FROM public.tournament_rounds WHERE phase_id IN (SELECT id FROM public.tournament_phases WHERE tournament_id = '${c.tournamentId}');`);
    sql.push(`DELETE FROM public.tournament_groups WHERE phase_id IN (SELECT id FROM public.tournament_phases WHERE tournament_id = '${c.tournamentId}');`);
    sql.push(`DELETE FROM public.tournament_phases WHERE tournament_id = '${c.tournamentId}';`);
    sql.push(`UPDATE public.tournaments SET current_season_id = NULL WHERE id = '${c.tournamentId}';`);
    sql.push(`DELETE FROM public.tournament_seasons WHERE tournament_id = '${c.tournamentId}';`);
    sql.push(`DELETE FROM public.tournaments WHERE id = '${c.tournamentId}';`);
    sql.push('');
  }
  if (clubesNuevos.length) {
    sql.push('-- Clubes creados por esta corrida');
    sql.push(`DELETE FROM public.clubs WHERE id IN (${clubesNuevos.map((c) => `'${c.id}'`).join(', ')});`);
    sql.push('');
  }
  sql.push('COMMIT;');
  fs.writeFileSync(ROLLBACK, sql.join('\n') + '\n', 'utf8');
  console.log(`\nrollback escrito: ${ROLLBACK}`);
}

main().catch((e) => { console.error('\nFALLÓ:', e.message || e); process.exit(1); });
