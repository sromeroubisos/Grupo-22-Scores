/**
 * Carga de los torneos 2026 (2º semestre) de la Unión de Rugby de Tierra del
 * Fuego: Zona Competencia (Plantel Superior) y Juveniles M18, con los clubes que
 * faltaban, el fixture entero y los resultados publicados. El canon es `datos.mjs`.
 *
 *   node scripts/urtdf-2026/seed.mjs --plan | --execute
 *   node scripts/urtdf-2026/seed.mjs --resultados --plan | --execute
 *   node scripts/urtdf-2026/seed.mjs --escudos --plan | --execute
 *   node scripts/urtdf-2026/seed.mjs --limpiar --plan | --execute
 *
 * `--resultados` baja al fixture los resultados del canon (por `external_id`) y
 * saltea los que ya están: es lo que se corre fecha a fecha. `--escudos` completa
 * `logo_url` de los clubes nuevos cuyo `public/clubs/<id>.png` apareció después.
 * `--limpiar` borra los dos torneos y deja los clubes.
 *
 * Un participante son TRES filas encadenadas: `tournament_participants`,
 * `team_season_entries` (lo que lista la PÁGINA) y `tournament_phase_participants`
 * (de donde sale la TABLA). Participante con entrada NULL → entrada → PATCH.
 *
 * Antes de escribir, valida el canon: doble rueda completa y que los resultados
 * reproduzcan EXACTO la tabla oficial de la fecha 2. Después de escribir hay que
 * rehacer la tabla: `npx tsx src/scripts/arusa-recalcular.ts --torneo=<slug>`.
 *
 * Idempotente: un torneo cuyo slug ya está se saltea y un club que ya existe no
 * se pisa. Deja `URTDF_2026_ROLLBACK.sql`.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { CLUBES, instanteDe, ORIGEN, RULESET, TEMPORADA, TIEBREAKERS, TORNEOS, UNION } from './datos.mjs';

const REPO = process.cwd();
const ROLLBACK = path.join(REPO, 'URTDF_2026_ROLLBACK.sql');
const MOTIVO_BONUS = 'bonus según la tabla oficial de la URTDF';

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

/** Deshace un torneo a medio escribir: sin esto la próxima corrida lo saltea por slug. */
async function limpiarTorneo(tournamentId) {
  const fases = await leer(`tournament_phases?select=id&tournament_id=eq.${tournamentId}`);
  const idsFase = fases.map((f) => f.id);
  await borrar(`tournament_standings?tournament_id=eq.${tournamentId}`);
  await borrar(`matches?tournament_id=eq.${tournamentId}`);
  await borrar(`tournament_phase_participants?tournament_id=eq.${tournamentId}`);
  await actualizar(`tournament_participants?tournament_id=eq.${tournamentId}`, { season_entry_id: null });
  await borrar(`team_season_entries?tournament_id=eq.${tournamentId}`);
  await borrar(`tournament_participants?tournament_id=eq.${tournamentId}`);
  if (idsFase.length) await borrar(`tournament_rounds?phase_id=in.(${idsFase.join(',')})`);
  await borrar(`tournament_phases?tournament_id=eq.${tournamentId}`);
  await actualizar(`tournaments?id=eq.${tournamentId}`, { current_season_id: null });
  await borrar(`tournament_seasons?tournament_id=eq.${tournamentId}`);
  await borrar(`tournaments?id=eq.${tournamentId}`);
}

const ahora = new Date().toISOString();
const club = (sigla) => {
  const c = CLUBES[sigla];
  if (!c) throw new Error(`sigla desconocida: ${sigla}`);
  return c;
};
const externalIdDe = (t, m) => `${ORIGEN}:${t.clave}:F${m.fecha}:${m.local}-${m.visitante}`;
const externalIdFinal = (t, f) => `${ORIGEN}:${t.clave}:${f.nombre.toLowerCase().replace(/\s+/g, '-')}`;
const sede = (sigla) => `Cancha de ${club(sigla).name}`;

function escudoLocal(id) {
  return fs.existsSync(path.join(REPO, 'public', 'clubs', `${id}.png`)) ? `/clubs/${id}.png` : null;
}

// ── Validación del canon ─────────────────────────────────────────────────────
function validar(t) {
  const siglas = Object.keys(t.tabla);
  // Doble rueda: cada par se cruza dos veces, una de local cada uno.
  for (const a of siglas) for (const b of siglas) {
    if (a === b) continue;
    const n = t.partidos.filter((m) => m.local === a && m.visitante === b).length;
    if (n !== 1) throw new Error(`${t.nombre}: ${a} vs ${b} aparece ${n} veces`);
  }
  for (let f = 1; f <= t.fechas; f += 1) {
    const enFecha = t.partidos.filter((m) => m.fecha === f).flatMap((m) => [m.local, m.visitante]);
    if (new Set(enFecha).size !== enFecha.length) throw new Error(`${t.nombre}: un club juega dos veces en la fecha ${f}`);
  }
  // Los resultados tienen que dar EXACTO la tabla oficial.
  const calc = Object.fromEntries(siglas.map((s) => [s, [0, 0, 0, 0, 0, 0, 0, 0]]));
  for (const m of t.partidos.filter((x) => x.r)) {
    const [hl, hv, bl, bv] = m.r;
    for (const [s, pf, pc, bp] of [[m.local, hl, hv, bl], [m.visitante, hv, hl, bv]]) {
      const fila = calc[s];
      fila[0] += 1;
      if (pf > pc) fila[1] += 1; else if (pf === pc) fila[2] += 1; else fila[3] += 1;
      fila[4] += pf; fila[5] += pc; fila[6] += bp;
      fila[7] += (pf > pc ? RULESET.pointsWin : pf === pc ? RULESET.pointsDraw : RULESET.pointsLoss) + bp;
    }
  }
  for (const s of siglas) {
    if (calc[s].join() !== t.tabla[s].join()) {
      throw new Error(`${t.nombre}: ${s} calcula [${calc[s]}] y la tabla oficial dice [${t.tabla[s]}]`);
    }
  }
}

function puntosDe(m) {
  const [hl, hv, bl, bv] = m.r;
  const base = (a, b) => (a > b ? RULESET.pointsWin : a === b ? RULESET.pointsDraw : RULESET.pointsLoss);
  return {
    status: 'final',
    score: { home: hl, away: hv, manualOverride: { home: hl, away: hv, cutoffMinute: null } },
    home_base_points: base(hl, hv), away_base_points: base(hv, hl),
    home_bonus_points: bl, away_bonus_points: bv,
    points_autocalculated: false, points_override_reason: MOTIVO_BONUS,
  };
}

// ── Filas ────────────────────────────────────────────────────────────────────
function filaDeClub(c) {
  return {
    id: c.id, union_id: UNION, name: c.name, short_name: c.name,
    city: c.city, region: 'Tierra del Fuego', country: 'ARG',
    logo_url: escudoLocal(c.id), primary_color: null,
    slug: c.id, is_visible: true, entity_type: 'club', sport: 'rugby', sport_id: 'rugby',
    category: null, categories: [], status: 'active', visibility: 'visible',
    external_id: null, created_at: ahora, updated_at: ahora,
  };
}

function filaDeTorneo(t, id) {
  return {
    id, union_id: UNION, season_id: TEMPORADA,
    name: t.nombre, display_name: t.nombre, original_name: t.nombre, slug: t.slug,
    status: 'published', category: t.categoria, gender: null, age_grade: t.edad,
    region: 'Tierra del Fuego', country: 'ARG', country_id: 'argentina', country_name: 'Argentina',
    format: 'league', is_visible: true, is_active: true, logo_url: null,
    ruleset: RULESET, ruleset_version: 1,
    sport_id: 'rugby', sport: 'rugby', sport_name: 'Rugby',
    priority: 0, sponsors: [], social_links: {}, display_order: 0, is_popular: false,
    is_api_managed: false, review_status: 'approved', data_source: ORIGEN, external_id: null,
    current_season_id: null, created_at: ahora, updated_at: ahora,
  };
}

function settingsDeFase(t, playoff) {
  const equipos = Object.keys(t.tabla).length;
  return {
    legs: 2,
    teamsCount: equipos,
    advanceCount: playoff ? equipos : 2,
    group_names: [], groupLabels: [],
    tableTags: playoff ? [] : t.tags,
    points: { win: RULESET.pointsWin, draw: RULESET.pointsDraw, loss: RULESET.pointsLoss },
    pointsSystem: { win: 4, draw: 2, loss: 0, bonusTry: 1, bonusLoss: 1, allowBonusPoints: true },
    tiebreakers: TIEBREAKERS,
    standings: { mode: 'automatic', editable: true },
    phaseMode: playoff ? 'playoff' : 'league',
    ...(playoff ? { playoffThirdPlace: t.finales.length > 1 } : {}),
    source: ORIGEN,
  };
}

async function crearTorneo(t) {
  const tournamentId = crypto.randomUUID();
  try {
    return await escribirTorneo(t, tournamentId);
  } catch (e) {
    await limpiarTorneo(tournamentId).catch((e2) => console.error(`  la limpieza de ${t.slug} falló también: ${e2.message}`));
    throw e;
  }
}

async function escribirTorneo(t, tournamentId) {
  const seasonId = crypto.randomUUID();
  // FK circular: el torneo nace sin temporada actual y se engancha después.
  await insertar('tournaments', [filaDeTorneo(t, tournamentId)]);
  await insertar('tournament_seasons', [{
    id: seasonId, tournament_id: tournamentId, legacy_tournament_id: tournamentId,
    season_code: TEMPORADA, name: `${t.nombre} ${TEMPORADA}`, display_name: `${t.nombre} ${TEMPORADA}`,
    slug: `${t.slug}-${TEMPORADA}`, status: 'active', is_active: true,
    start_date: t.desde, end_date: t.hasta, format: 'league', ruleset: RULESET,
    settings: { source: ORIGEN, edition: '2º semestre' }, champion_club_id: null,
    created_at: ahora, updated_at: ahora,
  }]);
  await actualizar(`tournaments?id=eq.${tournamentId}`, { current_season_id: seasonId });

  // ── Fases ──────────────────────────────────────────────────────────────────
  const faseRegular = crypto.randomUUID();
  const faseFinal = crypto.randomUUID();
  await insertar('tournament_phases', [
    {
      id: faseRegular, tournament_id: tournamentId, season_id: seasonId,
      name: 'Fase regular', phase_type: 'league', order_index: 1, is_active: true,
      settings: settingsDeFase(t, false), created_at: ahora, updated_at: ahora,
    },
    {
      id: faseFinal, tournament_id: tournamentId, season_id: seasonId,
      name: 'Finales', phase_type: 'playoff', order_index: 2, is_active: false,
      settings: {
        ...settingsDeFase(t, true),
        playoffStages: [{ id: 'playoff_stage_1', name: 'Finales', matchCount: t.finales.length, orderIndex: 1 }],
      },
      created_at: ahora, updated_at: ahora,
    },
  ]);

  // ── Fechas: numeradas como la Unión (la 1 se juega después de la 3) ────────
  const rondas = new Map();
  const filasRondas = [];
  for (let n = 1; n <= t.fechas; n += 1) {
    const dias = t.partidos.filter((m) => m.fecha === n).map((m) => m.dia).sort();
    const id = crypto.randomUUID();
    rondas.set(n, id);
    filasRondas.push({
      id, phase_id: faseRegular, season_id: seasonId, name: `Fecha ${n}`, order_index: n,
      start_date: dias[0], end_date: dias[dias.length - 1],
      is_completed: t.partidos.filter((m) => m.fecha === n).every((m) => m.r),
      notes: t.libres[n] ? `Libre: ${t.libres[n]}` : null,
      created_at: ahora, updated_at: ahora,
    });
  }
  const rondaFinal = crypto.randomUUID();
  filasRondas.push({
    id: rondaFinal, phase_id: faseFinal, season_id: seasonId, name: 'Finales', order_index: 1,
    start_date: t.finales[0].dia, end_date: t.finales[0].dia, is_completed: false, notes: null,
    created_at: ahora, updated_at: ahora,
  });
  await insertar('tournament_rounds', filasRondas);

  // ── Participantes: las TRES filas ──────────────────────────────────────────
  const participantes = Object.keys(t.tabla).map((sigla) => ({
    participantId: crypto.randomUUID(), entryId: crypto.randomUUID(), c: club(sigla),
  }));
  await insertar('tournament_participants', participantes.map((p) => ({
    id: p.participantId, tournament_id: tournamentId, season_id: seasonId,
    season_entry_id: null, club_id: p.c.id, name: p.c.name, type: 'club',
    status: 'active', seed: null, group_id: null, short_code: null,
    notes: ORIGEN, joined_at: ahora, created_at: ahora, updated_at: ahora,
  })));
  await insertar('team_season_entries', participantes.map((p) => ({
    id: p.entryId, season_id: seasonId, tournament_id: tournamentId, club_id: p.c.id,
    team_id: null, source_participant_id: p.participantId, group_id: null,
    zone: null, category: null, status: 'active', seed: null, notes: null,
    settings: { source: ORIGEN }, created_at: ahora, updated_at: ahora,
  })));
  for (const p of participantes) {
    await actualizar(`tournament_participants?id=eq.${p.participantId}`, { season_entry_id: p.entryId });
  }
  await insertar('tournament_phase_participants', [faseRegular, faseFinal].flatMap((phaseId) => participantes.map((p) => ({
    id: crypto.randomUUID(), tournament_id: tournamentId, season_id: seasonId,
    phase_id: phaseId, participant_id: p.participantId, group_id: null,
    status: 'active', seed: null, notes: null, created_at: ahora, updated_at: ahora,
  }))));

  // ── Partidos ───────────────────────────────────────────────────────────────
  // Mismas claves en TODAS las filas: PostgREST rechaza el lote si una difiere.
  const comun = {
    tournament_id: tournamentId, season_id: seasonId, sport_id: 'rugby', sport: 'rugby',
    status: 'scheduled', score: null, category: null,
    home_base_points: 0, away_base_points: 0, home_bonus_points: 0, away_bonus_points: 0,
    points_autocalculated: true, points_override_reason: null,
    live_enabled: false, lineups: { home: [], away: [] }, events: [], review_status: 'approved',
    bracket_match_code: null, home_source_label: null, away_source_label: null,
    participant_source: null, notes: null, created_at: ahora, updated_at: ahora,
  };
  const partidos = t.partidos.map((m) => ({
    ...comun, id: crypto.randomUUID(), phase_id: faseRegular, group_id: null,
    round_uuid: rondas.get(m.fecha), round_label: `Fecha ${m.fecha}`,
    home_club_id: club(m.local).id, away_club_id: club(m.visitante).id,
    date_time: instanteDe(m.dia, m.hora), venue: sede(m.local), is_visible: true,
    external_id: externalIdDe(t, m),
    ...(m.r ? puntosDe(m) : {}),
  }));
  for (const f of t.finales) {
    partidos.push({
      ...comun, id: crypto.randomUUID(), phase_id: faseFinal, group_id: null,
      round_uuid: rondaFinal, round_label: f.nombre,
      home_club_id: null, away_club_id: null,
      date_time: instanteDe(f.dia, f.hora), venue: null, is_visible: false,
      external_id: externalIdFinal(t, f),
      notes: `${f.nombre} · cancha y horario a definir`,
      home_source_label: `${f.local}º`, away_source_label: `${f.visitante}º`,
      participant_source: {
        home: { type: 'standing', group: null, position: f.local },
        away: { type: 'standing', group: null, position: f.visitante },
      },
    });
  }
  await insertar('matches', partidos);

  return {
    tournamentId,
    conteo: { fechas: filasRondas.length, participantes: participantes.length, partidos: partidos.length, jugados: t.partidos.filter((m) => m.r).length },
  };
}

// ── Modos de mantenimiento ───────────────────────────────────────────────────
async function sincronizarResultados() {
  let cambios = 0;
  for (const t of TORNEOS) {
    validar(t);
    const [torneo] = await leer(`tournaments?select=id&slug=eq.${t.slug}`);
    if (!torneo) { console.log(`${t.nombre}: no está en la base`); continue; }
    const filas = await leer(`matches?select=id,external_id,status,score&tournament_id=eq.${torneo.id}`);
    const porExternal = new Map(filas.map((m) => [m.external_id, m]));
    console.log(t.nombre);
    for (const m of t.partidos.filter((x) => x.r)) {
      const fila = porExternal.get(externalIdDe(t, m));
      if (!fila) { console.log(`  F${m.fecha} ${m.local}-${m.visitante}: no está en la base`); continue; }
      if (fila.status === 'final' && fila.score?.home === m.r[0] && fila.score?.away === m.r[1]) continue;
      console.log(`  F${m.fecha} ${club(m.local).name} ${m.r[0]}-${m.r[1]} ${club(m.visitante).name} (bonus ${m.r[2]}/${m.r[3]})`);
      cambios += 1;
      if (modo === 'execute') await actualizar(`matches?id=eq.${fila.id}`, { ...puntosDe(m), updated_at: new Date().toISOString() });
    }
  }
  console.log(`\n${cambios} resultados ${modo === 'execute' ? 'cargados' : 'a cargar'}.`);
  if (cambios && modo === 'execute') console.log('Rehacé las tablas: npx tsx src/scripts/arusa-recalcular.ts --torneo=<slug>');
}

async function completarEscudos() {
  const nuevos = Object.values(CLUBES).filter((c) => c.nuevo);
  const filas = await leer(`clubs?select=id,logo_url&id=in.(${nuevos.map((c) => c.id).join(',')})`);
  for (const f of filas.filter((x) => !x.logo_url)) {
    const ruta = escudoLocal(f.id);
    console.log(`  ${f.id}: ${ruta ?? 'sigue sin archivo en public/clubs'}`);
    if (ruta && modo === 'execute') await actualizar(`clubs?id=eq.${f.id}`, { logo_url: ruta, updated_at: new Date().toISOString() });
  }
}

async function main() {
  console.log(`modo: ${modo}\n`);
  if (process.argv.includes('--resultados')) { await sincronizarResultados(); return; }
  if (process.argv.includes('--escudos')) { await completarEscudos(); return; }
  if (process.argv.includes('--limpiar')) {
    const filas = await leer(`tournaments?select=id,name&slug=in.(${TORNEOS.map((t) => t.slug).join(',')})`);
    console.log(`torneos a borrar (${filas.length}):`);
    for (const f of filas) console.log(`  - ${f.name}`);
    if (modo === 'plan') { console.log('\nmodo --plan: no se borró nada.'); return; }
    for (const f of filas) { await limpiarTorneo(f.id); console.log(`  ✓ borrado ${f.name}`); }
    return;
  }

  for (const t of TORNEOS) validar(t);
  console.log('canon validado: doble rueda completa y resultados = tabla oficial de la fecha 2\n');

  const todos = Object.values(CLUBES);
  const enBase = new Set((await leer(`clubs?select=id&id=in.(${todos.map((c) => c.id).join(',')})`)).map((c) => c.id));
  const faltanViejos = todos.filter((c) => !c.nuevo && !enBase.has(c.id));
  if (faltanViejos.length) throw new Error(`clubes que debían existir y no están: ${faltanViejos.map((c) => c.id).join(', ')}`);
  const clubesNuevos = todos.filter((c) => c.nuevo && !enBase.has(c.id));

  const torneosDb = new Set((await leer(`tournaments?select=slug&slug=in.(${TORNEOS.map((t) => t.slug).join(',')})`)).map((t) => t.slug));
  const torneos = TORNEOS.filter((t) => !torneosDb.has(t.slug));

  console.log(`clubes a crear (${clubesNuevos.length}):`);
  for (const c of clubesNuevos) console.log(`  + ${c.name.padEnd(32)} ${c.city.padEnd(11)} escudo: ${escudoLocal(c.id) ?? '— (sin archivo)'}`);
  console.log('\ntorneos a crear:');
  for (const t of torneos) {
    console.log(`  + ${t.nombre} (${t.edad}) · ${Object.keys(t.tabla).length} clubes · ${t.partidos.length} + ${t.finales.length} partidos`);
    for (const m of [...t.partidos].sort((a, b) => a.dia.localeCompare(b.dia) || a.hora.localeCompare(b.hora))) {
      const res = m.r ? `  ${m.r[0]}-${m.r[1]} (bonus ${m.r[2]}/${m.r[3]})` : '';
      console.log(`      F${String(m.fecha).padEnd(3)} ${m.dia} ${m.hora}  ${club(m.local).name} vs ${club(m.visitante).name}${res}`);
    }
    for (const f of t.finales) console.log(`      ${f.nombre.padEnd(4)} ${f.dia}  ${f.local}º vs ${f.visitante}º`);
  }
  if (torneosDb.size) console.log(`  (ya existen y se saltean: ${[...torneosDb].join(', ')})`);

  if (modo === 'plan') { console.log('\nmodo --plan: no se escribió una sola fila.'); return; }

  await insertar('clubs', clubesNuevos.map(filaDeClub));
  console.log(`\n✓ ${clubesNuevos.length} clubes`);

  const creados = [];
  for (const t of torneos) {
    const { tournamentId, conteo } = await crearTorneo(t);
    creados.push({ nombre: t.nombre, slug: t.slug, tournamentId });
    console.log(`✓ ${t.nombre}  /tournaments/${tournamentId}`);
    console.log(`    ${conteo.fechas} fechas · ${conteo.participantes} participantes · ${conteo.partidos} partidos · ${conteo.jugados} con resultado`);
  }

  const sql = ['-- Rollback de la carga URTDF 2026 (Zona Competencia y M18).',
    '-- Borra SÓLO lo que creó esta corrida. Los clubes van último: los torneos', '-- los referencian por FK.', 'BEGIN;', ''];
  for (const c of creados) {
    const fases = `(SELECT id FROM public.tournament_phases WHERE tournament_id = '${c.tournamentId}')`;
    sql.push(`-- ${c.nombre}`);
    sql.push(`DELETE FROM public.tournament_standings WHERE tournament_id = '${c.tournamentId}';`);
    sql.push(`DELETE FROM public.matches WHERE tournament_id = '${c.tournamentId}';`);
    sql.push(`DELETE FROM public.tournament_phase_participants WHERE tournament_id = '${c.tournamentId}';`);
    sql.push(`UPDATE public.tournament_participants SET season_entry_id = NULL WHERE tournament_id = '${c.tournamentId}';`);
    sql.push(`DELETE FROM public.team_season_entries WHERE tournament_id = '${c.tournamentId}';`);
    sql.push(`DELETE FROM public.tournament_participants WHERE tournament_id = '${c.tournamentId}';`);
    sql.push(`DELETE FROM public.tournament_rounds WHERE phase_id IN ${fases};`);
    sql.push(`DELETE FROM public.tournament_phases WHERE tournament_id = '${c.tournamentId}';`);
    sql.push(`UPDATE public.tournaments SET current_season_id = NULL WHERE id = '${c.tournamentId}';`);
    sql.push(`DELETE FROM public.tournament_seasons WHERE tournament_id = '${c.tournamentId}';`);
    sql.push(`DELETE FROM public.tournaments WHERE id = '${c.tournamentId}';`, '');
  }
  if (clubesNuevos.length) {
    sql.push('-- Clubes creados por esta corrida');
    sql.push(`DELETE FROM public.clubs WHERE id IN (${clubesNuevos.map((c) => `'${c.id}'`).join(', ')});`, '');
  }
  sql.push('COMMIT;');
  fs.writeFileSync(ROLLBACK, sql.join('\n') + '\n', 'utf8');
  console.log(`\nrollback escrito: ${ROLLBACK}`);
  console.log('Ahora: npx tsx src/scripts/arusa-recalcular.ts --torneo=<slug> para cada torneo.');
}

main().catch((e) => { console.error('\nFALLÓ:', e.message || e); process.exit(1); });
