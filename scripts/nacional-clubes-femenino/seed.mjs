/**
 * Carga del Nacional de Clubes Femenino 2026 en G22: los dos torneos (Mayores
 * y Juveniles) con zonas, fixture, cruces de Oro/Plata/Bronce y el cuadro de
 * honor como temporadas anteriores. El canon es `datos.mjs`.
 *
 *   node scripts/nacional-clubes-femenino/seed.mjs --plan
 *   node scripts/nacional-clubes-femenino/seed.mjs --execute
 *   node scripts/nacional-clubes-femenino/seed.mjs --horarios --plan|--execute
 *   node scripts/nacional-clubes-femenino/seed.mjs --limpiar --plan|--execute
 *
 * `--horarios` baja al fixture los horarios del canon (se reconocen por
 * `external_id`) y saltea los partidos ya jugados: es lo que se corre cuando la
 * UAR publique la grilla oficial. `--limpiar` borra los dos torneos y deja los
 * clubes.
 *
 * Los escudos tienen que estar ANTES en `public/clubs/` (los dejó
 * `scripts/escudos/variantes.mjs --carpeta FEMENINO`): escribir la ruta de un
 * archivo que no está no falla, sólo deja el escudo roto.
 *
 * Un participante son TRES filas encadenadas: `tournament_participants` (el
 * vínculo), `team_season_entries` (lo que lista la PÁGINA) y
 * `tournament_phase_participants` (de donde sale la TABLA). Las dos primeras se
 * apuntan por FK: participante con entrada NULL → entrada → PATCH.
 *
 * La segunda jornada entra como PLACEHOLDERS sin equipos e `is_visible=false`.
 * Los cruces que salen de otro partido se completan solos por
 * `tournament_match_advancement_rules`; los que salen de la TABLA de una zona
 * llevan la etiqueta ("1º Zona 1") y se cargan a mano al cerrar la zona.
 *
 * Idempotente: un torneo cuyo slug ya está se saltea entero y un club que ya
 * existe no se pisa. Deja `NACIONAL_CLUBES_FEMENINO_ROLLBACK.sql`.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import {
  CLUBES_NUEVOS, DIAS, ESCUDOS_A_COMPLETAR, instanteDe, LOGO_TORNEO, NOMBRES,
  RULESET, SEDE, TEMPORADA, TIEBREAKERS, TORNEOS, PUNTOS,
} from './datos.mjs';

const REPO = process.cwd();
const ROLLBACK = path.join(REPO, 'NACIONAL_CLUBES_FEMENINO_ROLLBACK.sql');
const UNION_UAR = 'union-argentina-de-rugby';
const ORIGEN = 'nacional-clubes-femenino-2026';
const AVISO_HORARIO = 'horario provisorio: la UAR todavía no publicó la grilla';

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
 * torneo creado y la próxima corrida lo saltea por slug: una cáscara sin fixture.
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
const colores = JSON.parse(fs.readFileSync(path.join(REPO, 'scripts', 'nacional-clubes-femenino', 'colores.json'), 'utf8'));
const COLORES_ZONA = ['#00a365', '#eab308', '#f97316', '#3b82f6'];

const externalIdDe = (t, n) => `${ORIGEN}:${t.clave}:P${n}`;
const diaDeFecha = (t, n) => t.fechas.find((f) => f.n === n).dia;

function escudoLocal(id) {
  const archivo = path.join(REPO, 'public', 'clubs', `${id}.png`);
  if (!fs.existsSync(archivo)) throw new Error(`falta el escudo public/clubs/${id}.png — corré variantes.mjs primero`);
  return `/clubs/${id}.png`;
}

function filaDeClub(c) {
  return {
    id: c.id, union_id: c.union_id, name: c.name, short_name: c.name,
    city: c.city, region: c.region, country: 'ARG',
    logo_url: escudoLocal(c.id), primary_color: colores[c.id] || null,
    slug: c.id, is_visible: true, entity_type: 'club', sport: 'rugby', sport_id: 'rugby',
    category: null, categories: [], status: 'active', visibility: 'visible',
    external_id: null, created_at: ahora, updated_at: ahora,
  };
}

function filaDeTorneo(t, id) {
  return {
    id, union_id: UNION_UAR, season_id: TEMPORADA,
    name: t.nombre, display_name: t.nombre, original_name: t.nombre, slug: t.slug,
    status: 'published', category: 'Femenino', gender: 'femenino', age_grade: t.edad,
    region: 'Argentina', country: 'ARG', country_id: 'argentina', country_name: 'Argentina',
    format: 'groups', is_visible: true, is_active: true, logo_url: LOGO_TORNEO,
    ruleset: { ...RULESET, modality: t.modalidad }, ruleset_version: 1,
    sport_id: 'rugby', sport: 'rugby', sport_name: 'Rugby',
    priority: 0, sponsors: [], social_links: {}, display_order: 0, is_popular: false,
    is_api_managed: false, review_status: 'approved', data_source: ORIGEN, external_id: null,
    current_season_id: null, created_at: ahora, updated_at: ahora,
  };
}

function filaDeTemporada({ id, tournamentId, t, anio, activa, campeon, nota }) {
  return {
    id, tournament_id: tournamentId, legacy_tournament_id: tournamentId,
    season_code: anio, name: `${t.nombre} ${anio}`, display_name: `${t.nombre} ${anio}`,
    slug: `${t.slug}-${anio}`,
    status: activa ? 'active' : 'completed', is_active: Boolean(activa),
    start_date: activa ? t.desde : null, end_date: activa ? t.hasta : null,
    format: 'groups', ruleset: activa ? RULESET : {},
    settings: {
      source: ORIGEN,
      ...(activa ? { venue: SEDE, edition: t.edicion, modality: t.modalidad } : {}),
      ...(nota ? { note: nota } : {}),
    },
    champion_club_id: campeon || null,
    created_at: ahora, updated_at: ahora,
  };
}

function settingsDeFase({ zonas, playoff, equipos }) {
  return {
    legs: 1,
    teamsCount: equipos,
    advanceCount: 1,
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

async function crearTorneo(t) {
  const tournamentId = crypto.randomUUID();
  const seasonId = crypto.randomUUID();
  try {
    return await escribirTorneo(t, tournamentId, seasonId);
  } catch (e) {
    await limpiarTorneo(tournamentId).catch((e2) => {
      console.error(`  la limpieza de ${t.slug} falló también: ${e2.message}`);
    });
    throw e;
  }
}

async function escribirTorneo(t, tournamentId, seasonId) {
  // FK circular: el torneo nace sin temporada actual y se engancha después.
  await insertar('tournaments', [filaDeTorneo(t, tournamentId)]);
  await insertar('tournament_seasons', [filaDeTemporada({ id: seasonId, tournamentId, t, anio: TEMPORADA, activa: true })]);
  await actualizar(`tournaments?id=eq.${tournamentId}`, { current_season_id: seasonId });

  // ── Fases y zonas ──────────────────────────────────────────────────────────
  // 'group_stage': la vista por zonas del detalle público SÓLO se arma con ése.
  const equipos = t.zonas.reduce((n, z) => n + z.clubes.length, 0);
  const faseGrupos = crypto.randomUUID();
  const faseFinal = crypto.randomUUID();
  const zonas = t.zonas.map((z) => ({ ...z, groupId: crypto.randomUUID() }));
  const groupIdDe = new Map(zonas.map((z) => [z.nombre, z.groupId]));

  await insertar('tournament_phases', [
    {
      id: faseGrupos, tournament_id: tournamentId, season_id: seasonId,
      name: 'Fase de Zonas', phase_type: 'group_stage', order_index: 1, is_active: true,
      settings: settingsDeFase({ zonas, playoff: false, equipos }), created_at: ahora, updated_at: ahora,
    },
    {
      id: faseFinal, tournament_id: tournamentId, season_id: seasonId,
      name: 'Copas de Oro, Plata y Bronce', phase_type: 'playoff', order_index: 2, is_active: false,
      settings: {
        ...settingsDeFase({ zonas: [], playoff: true, equipos }),
        playoffStages: [{ id: 'playoff_stage_1', name: 'Definiciones', matchCount: t.final.length, orderIndex: 1 }],
      },
      created_at: ahora, updated_at: ahora,
    },
  ]);
  await insertar('tournament_groups', zonas.map((z, i) => ({
    id: z.groupId, phase_id: faseGrupos, season_id: seasonId, name: z.nombre, order_index: i,
  })));

  // ── Fechas ─────────────────────────────────────────────────────────────────
  const rondas = new Map();
  let ordenGrupos = 0;
  const filasRondas = t.fechas.map((f) => {
    const id = crypto.randomUUID();
    rondas.set(f.n, id);
    const esFinal = f.n === t.fechaFinal;
    return {
      id, phase_id: esFinal ? faseFinal : faseGrupos, season_id: seasonId,
      name: f.nombre, order_index: esFinal ? 1 : ++ordenGrupos,
      start_date: DIAS[f.dia], end_date: DIAS[f.dia], is_completed: false, notes: null,
      created_at: ahora, updated_at: ahora,
    };
  });
  await insertar('tournament_rounds', filasRondas);

  // ── Participantes: las TRES filas ──────────────────────────────────────────
  const participantes = zonas.flatMap((z) => z.clubes.map((clubId) => ({
    participantId: crypto.randomUUID(), entryId: crypto.randomUUID(), clubId, zona: z, nombre: NOMBRES[clubId],
  })));
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
  for (const p of participantes) {
    await actualizar(`tournament_participants?id=eq.${p.participantId}`, { season_entry_id: p.entryId });
  }
  // Todos en las dos fases: sin asignación, un club queda fuera del recálculo.
  await insertar('tournament_phase_participants', [faseGrupos, faseFinal].flatMap((phaseId) => participantes.map((p) => ({
    id: crypto.randomUUID(), tournament_id: tournamentId, season_id: seasonId,
    phase_id: phaseId, participant_id: p.participantId,
    group_id: phaseId === faseGrupos ? p.zona.groupId : null,
    status: 'active', seed: null, notes: null, created_at: ahora, updated_at: ahora,
  }))));

  // ── Partidos ───────────────────────────────────────────────────────────────
  // Mismas claves en TODAS las filas: PostgREST rechaza el lote entero con
  // "All object keys must match" si una trae una columna que otra no.
  const comun = {
    tournament_id: tournamentId, season_id: seasonId, sport_id: 'rugby', sport: 'rugby',
    venue: SEDE, status: 'scheduled', score: null, category: 'Femenino',
    home_base_points: 0, away_base_points: 0, home_bonus_points: 0, away_bonus_points: 0,
    points_autocalculated: true, live_enabled: false, lineups: { home: [], away: [] },
    events: [], review_status: 'approved',
    bracket_match_code: null, home_source_label: null, away_source_label: null,
    participant_source: null, created_at: ahora, updated_at: ahora,
  };

  const partidos = t.grupos.map((g) => ({
    ...comun, id: crypto.randomUUID(), phase_id: faseGrupos,
    group_id: groupIdDe.get(g.zona), round_uuid: rondas.get(g.fecha),
    round_label: t.fechas.find((f) => f.n === g.fecha).nombre,
    home_club_id: g.local, away_club_id: g.visitante,
    date_time: instanteDe(diaDeFecha(t, g.fecha), g.hora),
    is_visible: true, notes: `${g.zona} · ${AVISO_HORARIO}`,
    external_id: externalIdDe(t, g.n),
  }));

  const idPorNumero = new Map();
  for (const f of t.final) {
    const id = crypto.randomUUID();
    idPorNumero.set(f.n, id);
    partidos.push({
      ...comun, id, phase_id: faseFinal, group_id: null,
      round_uuid: rondas.get(t.fechaFinal), round_label: f.definicion,
      home_club_id: null, away_club_id: null,
      date_time: instanteDe(diaDeFecha(t, t.fechaFinal), f.hora),
      is_visible: false, notes: `${f.definicion} · ${AVISO_HORARIO}`,
      external_id: externalIdDe(t, f.n),
      bracket_match_code: `P${f.n}`,
      home_source_label: etiquetaDeOrigen(f.local),
      away_source_label: etiquetaDeOrigen(f.visitante),
      participant_source: { home: fuenteDeOrigen(f.local), away: fuenteDeOrigen(f.visitante) },
    });
  }
  await insertar('matches', partidos);

  // ── Avance automático: los cruces que salen de otro partido ───────────────
  const reglas = [];
  for (const f of t.final) {
    for (const slot of ['local', 'visitante']) {
      const s = f[slot];
      if (!s.de) continue;
      reglas.push({
        id: crypto.randomUUID(), phase_id: faseFinal,
        source_match_id: idPorNumero.get(s.de), outcome: s.resultado,
        target_match_id: idPorNumero.get(f.n), target_slot: slot === 'local' ? 'home' : 'away',
        target_group_id: null, created_at: ahora, updated_at: ahora,
      });
    }
  }
  await insertar('tournament_match_advancement_rules', reglas);

  // ── Cuadro de honor: temporadas anteriores, sin fixture ───────────────────
  await insertar('tournament_seasons', t.palmares.map((p) => filaDeTemporada({
    id: crypto.randomUUID(), tournamentId, t, anio: p.anio, activa: false, campeon: p.campeon, nota: p.nota,
  })));

  return {
    tournamentId, seasonId,
    conteo: {
      zonas: zonas.length, fechas: filasRondas.length, participantes: participantes.length,
      partidos: partidos.length, reglas: reglas.length, palmares: t.palmares.length,
    },
  };
}

/** Baja al fixture los horarios del canon. Saltea lo jugado. */
async function sincronizarHorarios() {
  let cambios = 0;
  for (const t of TORNEOS) {
    const [torneo] = await leer(`tournaments?select=id&slug=eq.${t.slug}`);
    if (!torneo) { console.log(`${t.nombre}: no está en la base`); continue; }
    const filas = await leer(`matches?select=id,external_id,date_time,status&tournament_id=eq.${torneo.id}`);
    const porExternal = new Map(filas.map((m) => [m.external_id, m]));
    const canon = [
      ...t.grupos.map((g) => ({ n: g.n, instante: instanteDe(diaDeFecha(t, g.fecha), g.hora) })),
      ...t.final.map((f) => ({ n: f.n, instante: instanteDe(diaDeFecha(t, t.fechaFinal), f.hora) })),
    ];
    console.log(t.nombre);
    for (const c of canon) {
      const m = porExternal.get(externalIdDe(t, c.n));
      if (!m) { console.log(`  P${c.n}: no está en la base`); continue; }
      if (m.status !== 'scheduled') continue;
      if (new Date(m.date_time).getTime() === new Date(c.instante).getTime()) continue;
      console.log(`  P${c.n}: ${m.date_time} → ${c.instante}`);
      cambios += 1;
      if (modo === 'execute') await actualizar(`matches?id=eq.${m.id}`, { date_time: c.instante, updated_at: new Date().toISOString() });
    }
  }
  console.log(`\n${cambios} horarios ${modo === 'execute' ? 'actualizados' : 'a actualizar'}.`);
}

async function main() {
  console.log(`modo: ${modo}\n`);

  if (process.argv.includes('--horarios')) { await sincronizarHorarios(); return; }

  if (process.argv.includes('--limpiar')) {
    const filas = await leer(`tournaments?select=id,name&slug=in.(${TORNEOS.map((t) => t.slug).join(',')})`);
    console.log(`torneos a borrar (${filas.length}):`);
    for (const f of filas) console.log(`  - ${f.name}`);
    if (modo === 'plan') { console.log('\nmodo --plan: no se borró nada.'); return; }
    for (const f of filas) { await limpiarTorneo(f.id); console.log(`  ✓ borrado ${f.name}`); }
    return;
  }

  // ── Qué falta ────────────────────────────────────────────────────────────
  const idsNuevos = CLUBES_NUEVOS.map((c) => c.id);
  const existentes = new Set((await leer(`clubs?select=id&id=in.(${idsNuevos.join(',')})`)).map((c) => c.id));
  const clubesNuevos = CLUBES_NUEVOS.filter((c) => !existentes.has(c.id));
  for (const c of clubesNuevos) escudoLocal(c.id);

  // Todo club que el fixture o el palmarés nombra tiene que existir al final.
  const referidos = new Set(TORNEOS.flatMap((t) => [...t.zonas.flatMap((z) => z.clubes), ...t.palmares.map((p) => p.campeon)]));
  const enBase = new Set((await leer(`clubs?select=id&id=in.(${[...referidos].join(',')})`)).map((c) => c.id));
  const faltan = [...referidos].filter((id) => !enBase.has(id) && !idsNuevos.includes(id));
  if (faltan.length) throw new Error(`clubes referidos que no existen ni se crean: ${faltan.join(', ')}`);
  const sinNombre = TORNEOS.flatMap((t) => t.zonas.flatMap((z) => z.clubes)).filter((id) => !NOMBRES[id]);
  if (sinNombre.length) throw new Error(`clubes sin nombre de afiche: ${sinNombre.join(', ')}`);

  const unionesDb = new Set((await leer('unions?select=id&limit=1000')).map((u) => u.id));
  const unionRota = clubesNuevos.filter((c) => !unionesDb.has(c.union_id));
  if (unionRota.length) throw new Error(`uniones inexistentes: ${unionRota.map((c) => c.union_id).join(', ')}`);

  const aCompletar = (await leer(`clubs?select=id,logo_url&id=in.(${ESCUDOS_A_COMPLETAR.join(',')})`)).filter((c) => !c.logo_url);

  const torneosDb = new Set((await leer(`tournaments?select=slug&slug=in.(${TORNEOS.map((t) => t.slug).join(',')})`)).map((t) => t.slug));
  const torneos = TORNEOS.filter((t) => !torneosDb.has(t.slug));

  console.log(`clubes a crear (${clubesNuevos.length}):`);
  for (const c of clubesNuevos) console.log(`  + ${c.name.padEnd(20)} ${c.city} · ${c.union_id}`);
  if (aCompletar.length) console.log(`escudo a completar: ${aCompletar.map((c) => c.id).join(', ')}`);
  console.log('\ntorneos a crear:');
  for (const t of torneos) {
    console.log(`  + ${t.nombre} (${t.edad}, ${t.modalidad}) · ${t.zonas.length} zonas · ${t.grupos.length + t.final.length} partidos · ${t.palmares.length} ediciones de palmarés`);
    for (const g of t.grupos) {
      console.log(`      P${String(g.n).padEnd(3)} ${diaDeFecha(t, g.fecha).padEnd(8)} ${g.hora}  ${g.zona}  ${NOMBRES[g.local]} vs ${NOMBRES[g.visitante]}`);
    }
    for (const f of t.final) {
      console.log(`      P${String(f.n).padEnd(3)} ${diaDeFecha(t, t.fechaFinal).padEnd(8)} ${f.hora}  ${f.definicion}: ${etiquetaDeOrigen(f.local)} vs ${etiquetaDeOrigen(f.visitante)}`);
    }
  }
  if (torneosDb.size) console.log(`  (ya existen y se saltean: ${[...torneosDb].join(', ')})`);

  if (modo === 'plan') { console.log('\nmodo --plan: no se escribió una sola fila.'); return; }

  // ── Escritura ──────────────────────────────────────────────────────────────
  await insertar('clubs', clubesNuevos.map(filaDeClub));
  console.log(`\n✓ ${clubesNuevos.length} clubes`);
  for (const c of aCompletar) {
    await actualizar(`clubs?id=eq.${c.id}`, { logo_url: escudoLocal(c.id), primary_color: colores[c.id] || null, updated_at: ahora });
    console.log(`✓ escudo de ${c.id}`);
  }

  const creados = [];
  for (const t of torneos) {
    const { tournamentId, seasonId, conteo } = await crearTorneo(t);
    creados.push({ nombre: t.nombre, tournamentId, seasonId });
    console.log(`✓ ${t.nombre}  /tournaments/${tournamentId}`);
    console.log(`    ${conteo.zonas} zonas · ${conteo.fechas} fechas · ${conteo.participantes} participantes · ${conteo.partidos} partidos · ${conteo.reglas} reglas de avance · ${conteo.palmares} ediciones de palmarés`);
  }

  // ── Rollback ───────────────────────────────────────────────────────────────
  const sql = ['-- Rollback de la carga del Nacional de Clubes Femenino 2026.',
    '-- Borra SÓLO lo que creó esta corrida. Los clubes van último: los torneos',
    '-- los referencian por FK.', 'BEGIN;', ''];
  for (const c of creados) {
    const fases = `(SELECT id FROM public.tournament_phases WHERE tournament_id = '${c.tournamentId}')`;
    sql.push(`-- ${c.nombre}`);
    sql.push(`DELETE FROM public.tournament_match_advancement_rules WHERE phase_id IN ${fases};`);
    sql.push(`DELETE FROM public.matches WHERE tournament_id = '${c.tournamentId}';`);
    sql.push(`DELETE FROM public.tournament_phase_participants WHERE tournament_id = '${c.tournamentId}';`);
    sql.push(`UPDATE public.tournament_participants SET season_entry_id = NULL WHERE tournament_id = '${c.tournamentId}';`);
    sql.push(`DELETE FROM public.team_season_entries WHERE tournament_id = '${c.tournamentId}';`);
    sql.push(`DELETE FROM public.tournament_participants WHERE tournament_id = '${c.tournamentId}';`);
    sql.push(`DELETE FROM public.tournament_rounds WHERE phase_id IN ${fases};`);
    sql.push(`DELETE FROM public.tournament_groups WHERE phase_id IN ${fases};`);
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
  if (aCompletar.length) {
    sql.push('-- Escudos completados (estaban vacíos)');
    sql.push(`UPDATE public.clubs SET logo_url = NULL WHERE id IN (${aCompletar.map((c) => `'${c.id}'`).join(', ')});`);
    sql.push('');
  }
  sql.push('COMMIT;');
  fs.writeFileSync(ROLLBACK, sql.join('\n') + '\n', 'utf8');
  console.log(`\nrollback escrito: ${ROLLBACK}`);
}

main().catch((e) => { console.error('\nFALLÓ:', e.message || e); process.exit(1); });
