/**
 * Carga de los torneos M19 2026 de la URNE (Apertura y Oficial): clubes M19, fixture
 * entero con los resultados de las fichas y las semifinales pendientes del Oficial.
 * El canon es `datos.mjs`. Molde: scripts/urtdf-2026/seed.mjs.
 *
 *   node scripts/urne-m19-2026/seed.mjs --plan | --execute
 *   node scripts/urne-m19-2026/seed.mjs --limpiar --plan | --execute
 *
 * Un participante son TRES filas encadenadas: `tournament_participants`,
 * `team_season_entries` (lo que lista la PÁGINA) y `tournament_phase_participants`
 * (de donde sale la TABLA). Después hay que rehacer la tabla (es persistida):
 *   npx tsx src/scripts/arusa-recalcular.ts --torneo=<slug>
 *
 * Idempotente: un torneo cuyo slug ya está se saltea y un club que ya existe no se
 * pisa. Valida el canon contra la tabla oficial antes de escribir. Deja el rollback
 * en URNE_M19_2026_ROLLBACK.sql.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { CLUBES, instanteDe, ORIGEN, RULESET, TEMPORADA, TIEBREAKERS, TORNEOS, UNION } from './datos.mjs';

const REPO = process.cwd();
const ROLLBACK = path.join(REPO, 'URNE_M19_2026_ROLLBACK.sql');
const MOTIVO_BONUS = 'bonus según la ficha oficial de la UAR';

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
/** Insert con `return=representation` y conteo: un 201 sin cuerpo no prueba que la fila quedó. */
async function insertar(tabla, filas) {
  for (let i = 0; i < filas.length; i += 400) {
    const lote = filas.slice(i, i + 400);
    const res = await fetch(`${URL_BASE}/rest/v1/${tabla}?select=id`, {
      method: 'POST', headers: { ...H, 'content-type': 'application/json', prefer: 'return=representation' },
      body: JSON.stringify(lote),
    });
    if (!res.ok) throw new Error(`POST ${tabla}: ${res.status} ${(await res.text()).slice(0, 400)}`);
    const vuelto = await res.json();
    if (vuelto.length !== lote.length) throw new Error(`POST ${tabla}: mandé ${lote.length} y volvieron ${vuelto.length}`);
  }
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
  if (idsFase.length) await borrar(`tournament_match_advancement_rules?phase_id=in.(${idsFase.join(',')})`);
  const idsEtiqueta = [...new Set((await leer(`team_labels?select=label_id&tournament_id=eq.${tournamentId}&limit=1000`)).map((l) => l.label_id))];
  await borrar(`team_labels?tournament_id=eq.${tournamentId}`);
  if (idsEtiqueta.length) await borrar(`ui_labels?id=in.(${idsEtiqueta.join(',')})`);
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
const externalIdDe = (t, m) => `${ORIGEN}:${t.clave}:${m.nro}`;
const sede = (sigla) => `Cancha de ${club(sigla).name.replace(/ M19.*$/, '')}`;

// ── Validación del canon ─────────────────────────────────────────────────────
function validar(t) {
  const siglas = Object.keys(t.tabla);
  const calc = Object.fromEntries(siglas.map((s) => [s, [0, 0, 0, 0, 0, 0, 0]]));
  const vistos = new Set();
  for (const m of t.partidos) {
    if (vistos.has(m.nro)) throw new Error(`${t.nombre}: partido ${m.nro} repetido`);
    vistos.add(m.nro);
    const [hl, hv, bl, bv] = m.r;
    for (const [s, pf, pc, bp] of [[m.local, hl, hv, bl], [m.visitante, hv, hl, bv]]) {
      const fila = calc[s];
      fila[0] += 1;
      if (pf > pc) fila[1] += 1; else if (pf === pc) fila[2] += 1; else fila[3] += 1;
      fila[4] += pf; fila[5] += pc;
      fila[6] += (pf > pc ? RULESET.pointsWin : pf === pc ? RULESET.pointsDraw : RULESET.pointsLoss) + bp;
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
function filaDeClub(c, logo) {
  return {
    id: c.id, union_id: UNION, name: c.name, short_name: c.name,
    city: c.city, region: 'NEA', country: 'ARG',
    logo_url: logo ?? null, primary_color: null,
    slug: c.id, is_visible: true, entity_type: 'club', sport: 'rugby', sport_id: 'rugby',
    category: 'M19', categories: [], status: 'active', visibility: 'visible',
    external_id: null, created_at: ahora, updated_at: ahora,
  };
}

function filaDeTorneo(t, id) {
  return {
    id, union_id: UNION, season_id: TEMPORADA,
    name: t.nombre, display_name: t.nombre, original_name: t.nombre, slug: t.slug,
    status: 'published', category: 'Juvenil', gender: null, age_grade: 'M19',
    region: 'NEA', country: 'ARG', country_id: 'argentina', country_name: 'Argentina',
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
    legs: playoff ? 1 : t.legs,
    teamsCount: playoff ? 4 : equipos,
    advanceCount: playoff ? 1 : (t.semis.length ? 4 : equipos),
    ...(playoff ? { bracketMode: 'auto' } : {}),
    group_names: [], groupLabels: [],
    tableTags: [],
    points: { win: RULESET.pointsWin, draw: RULESET.pointsDraw, loss: RULESET.pointsLoss },
    pointsSystem: { win: 4, draw: 2, loss: 0, bonusTry: 1, bonusLoss: 1, allowBonusPoints: true },
    tiebreakers: TIEBREAKERS,
    standings: { mode: 'automatic', editable: true },
    phaseMode: playoff ? 'playoff' : 'league',
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
  const hayPlayoff = t.semis.length > 0;
  // FK circular: el torneo nace sin temporada actual y se engancha después.
  await insertar('tournaments', [filaDeTorneo(t, tournamentId)]);
  await insertar('tournament_seasons', [{
    id: seasonId, tournament_id: tournamentId, legacy_tournament_id: tournamentId,
    season_code: TEMPORADA, name: `${t.nombre} ${TEMPORADA}`, display_name: `${t.nombre} ${TEMPORADA}`,
    slug: `${t.slug}-${TEMPORADA}`, status: 'active', is_active: true,
    start_date: t.desde, end_date: t.hasta, format: 'league', ruleset: RULESET,
    settings: { source: ORIGEN }, champion_club_id: null, created_at: ahora, updated_at: ahora,
  }]);
  await actualizar(`tournaments?id=eq.${tournamentId}`, { current_season_id: seasonId });

  // ── Fases ──────────────────────────────────────────────────────────────────
  const faseRegular = crypto.randomUUID();
  const fasePlayoff = hayPlayoff ? crypto.randomUUID() : null;
  await insertar('tournament_phases', [
    {
      id: faseRegular, tournament_id: tournamentId, season_id: seasonId,
      name: 'Fase regular', phase_type: 'league', order_index: 1, is_active: true,
      settings: settingsDeFase(t, false), created_at: ahora, updated_at: ahora,
    },
    ...(hayPlayoff ? [{
      id: fasePlayoff, tournament_id: tournamentId, season_id: seasonId,
      name: 'Playoffs', phase_type: 'playoff', order_index: 2, is_active: false,
      settings: {
        ...settingsDeFase(t, true),
        playoffStages: [
          { id: 'playoff_stage_1', name: 'Semifinales', matchCount: 2, orderIndex: 1 },
          { id: 'playoff_stage_2', name: 'Final', matchCount: 1, orderIndex: 2 },
        ],
      },
      created_at: ahora, updated_at: ahora,
    }] : []),
  ]);

  // ── Fechas ─────────────────────────────────────────────────────────────────
  const rondas = new Map();
  const filasRondas = [];
  for (let n = 1; n <= t.fechas; n += 1) {
    const enFecha = t.partidos.filter((m) => m.fecha === n);
    const dias = enFecha.map((m) => m.dia).sort();
    const id = crypto.randomUUID();
    rondas.set(n, id);
    filasRondas.push({
      id, phase_id: faseRegular, season_id: seasonId, name: `Fecha ${n}`, order_index: n,
      start_date: dias[0] ?? null, end_date: dias[dias.length - 1] ?? null,
      is_completed: enFecha.length > 0, notes: null, created_at: ahora, updated_at: ahora,
    });
  }
  let rondaSemi = null; let rondaFinal = null;
  if (hayPlayoff) {
    rondaSemi = crypto.randomUUID(); rondaFinal = crypto.randomUUID();
    const dias = t.semis.map((s) => s.dia).sort();
    filasRondas.push(
      { id: rondaSemi, phase_id: fasePlayoff, season_id: seasonId, name: 'Semifinales', order_index: 1,
        start_date: dias[0], end_date: dias[dias.length - 1], is_completed: false, notes: null, created_at: ahora, updated_at: ahora },
      { id: rondaFinal, phase_id: fasePlayoff, season_id: seasonId, name: 'Final', order_index: 2,
        start_date: null, end_date: null, is_completed: false, notes: 'fecha a definir', created_at: ahora, updated_at: ahora },
    );
  }
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
  const clasificados = new Set(t.semis.flatMap((x) => [x.local, x.visitante]));
  await insertar('tournament_phase_participants', [faseRegular, fasePlayoff].filter(Boolean).flatMap((phaseId) => participantes.filter((p) => phaseId === faseRegular || [...clasificados].some((sg) => club(sg).id === p.c.id)).map((p) => ({
    id: crypto.randomUUID(), tournament_id: tournamentId, season_id: seasonId,
    phase_id: phaseId, participant_id: p.participantId, group_id: null,
    status: 'active', seed: null, notes: null, created_at: ahora, updated_at: ahora,
  }))));

  // ── Etiqueta de la tabla ── la banda sale de ui_labels + team_labels POR POSICIÓN
  // (settings.tableTags no lo lee nadie).
  if (hayPlayoff) {
    const labelId = crypto.randomUUID();
    await insertar('ui_labels', [{ id: labelId, name: 'Semifinales', color: '#00a365', scope: 'standings' }]);
    await insertar('team_labels', [1, 2, 3, 4].map((position) => ({
      label_id: labelId, club_id: null, position, tournament_id: tournamentId, phase_id: faseRegular, group_id: null,
    })));
    await actualizar(`tournament_phases?id=eq.${faseRegular}`, {
      settings: { ...settingsDeFase(t, false), groupLabels: [{ id: labelId, name: 'Semifinales', color: '#00a365', colorMode: 'manual', autoColorIndex: 0 }] },
    });
  }

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
    date_time: instanteDe(m.dia, m.hora), venue: sede(m.sede), is_visible: true,
    external_id: externalIdDe(t, m),
    ...puntosDe(m),
  }));
  if (hayPlayoff) {
    for (const s of t.semis) {
      partidos.push({
        ...comun, id: crypto.randomUUID(), phase_id: fasePlayoff, group_id: null,
        round_uuid: rondaSemi, round_label: 'Semifinales',
        home_club_id: club(s.local).id, away_club_id: club(s.visitante).id,
        date_time: instanteDe(s.dia, s.hora), venue: sede(s.local), is_visible: true,
        external_id: `${ORIGEN}:${t.clave}:${s.nro}`, bracket_match_code: s.codigo,
      });
    }
    partidos.push({
      ...comun, id: crypto.randomUUID(), phase_id: fasePlayoff, group_id: null,
      round_uuid: rondaFinal, round_label: 'Final',
      home_club_id: null, away_club_id: null,
      date_time: instanteDe('2026-11-08', '14:00'), venue: null, is_visible: false,
      external_id: `${ORIGEN}:${t.clave}:final`, bracket_match_code: 'F',
      notes: 'Final · fecha y horario a definir',
      home_source_label: 'Ganador SF-1', away_source_label: 'Ganador SF-2',
      participant_source: { home: { type: 'winner', ref: 'SF-1' }, away: { type: 'winner', ref: 'SF-2' } },
    });
  }
  await insertar('matches', partidos);
  if (hayPlayoff) {
    // Los ganadores de las semis pasan solos a la final (lo resuelve resolveMatchAdvancement).
    const porCodigo = new Map(partidos.filter((p) => p.bracket_match_code).map((p) => [p.bracket_match_code, p.id]));
    await insertar('tournament_match_advancement_rules', [['SF-1', 'home'], ['SF-2', 'away']].map(([origen, slot]) => ({
      id: crypto.randomUUID(), phase_id: fasePlayoff, source_match_id: porCodigo.get(origen), outcome: 'winner',
      target_match_id: porCodigo.get('F'), target_slot: slot, target_group_id: null, created_at: ahora, updated_at: ahora,
    })));
  }

  return {
    tournamentId,
    conteo: { fechas: filasRondas.length, participantes: participantes.length, partidos: partidos.length, jugados: t.partidos.length },
  };
}

async function main() {
  console.log(`modo: ${modo}\n`);
  if (process.argv.includes('--limpiar')) {
    const filas = await leer(`tournaments?select=id,name&slug=in.(${TORNEOS.map((t) => t.slug).join(',')})`);
    console.log(`torneos a borrar (${filas.length}):`);
    for (const f of filas) console.log(`  - ${f.name}`);
    if (modo === 'plan') { console.log('\nmodo --plan: no se borró nada.'); return; }
    for (const f of filas) { await limpiarTorneo(f.id); console.log(`  ✓ borrado ${f.name}`); }
    return;
  }

  for (const t of TORNEOS) validar(t);
  console.log('canon validado: los resultados reproducen EXACTO la tabla oficial de cada torneo\n');

  const todos = Object.values(CLUBES);
  const enBase = new Set((await leer(`clubs?select=id&id=in.(${todos.map((c) => c.id).join(',')})`)).map((c) => c.id));
  const bases = await leer(`clubs?select=id,logo_url&id=in.(${[...new Set(todos.map((c) => c.base))].join(',')})`);
  const logoDe = Object.fromEntries(bases.map((b) => [b.id, b.logo_url]));
  const sinBase = [...new Set(todos.map((c) => c.base))].filter((b) => !(b in logoDe));
  if (sinBase.length) throw new Error(`clubes base que no existen: ${sinBase.join(', ')}`);
  const clubesNuevos = todos.filter((c) => !enBase.has(c.id));

  const torneosDb = new Set((await leer(`tournaments?select=slug&slug=in.(${TORNEOS.map((t) => t.slug).join(',')})`)).map((t) => t.slug));
  const torneos = TORNEOS.filter((t) => !torneosDb.has(t.slug));

  console.log(`clubes a crear (${clubesNuevos.length}):`);
  for (const c of clubesNuevos) console.log(`  + ${c.name.padEnd(30)} escudo de ${c.base}: ${logoDe[c.base] ? 'sí' : '—'}`);
  console.log('\ntorneos a crear:');
  for (const t of torneos) {
    console.log(`  + ${t.nombre} · ${Object.keys(t.tabla).length} clubes · ${t.partidos.length} jugados + ${t.semis.length} semis`);
  }
  if (torneosDb.size) console.log(`  (ya existen y se saltean: ${[...torneosDb].join(', ')})`);

  if (modo === 'plan') { console.log('\nmodo --plan: no se escribió una sola fila.'); return; }

  await insertar('clubs', clubesNuevos.map((c) => filaDeClub(c, logoDe[c.base])));
  console.log(`\n✓ ${clubesNuevos.length} clubes`);

  const creados = [];
  for (const t of torneos) {
    const { tournamentId, conteo } = await crearTorneo(t);
    creados.push({ nombre: t.nombre, slug: t.slug, tournamentId });
    console.log(`✓ ${t.nombre}  /tournaments/${tournamentId}`);
    console.log(`    ${conteo.fechas} fechas · ${conteo.participantes} participantes · ${conteo.partidos} partidos · ${conteo.jugados} con resultado`);
  }

  const sql = ['-- Rollback de la carga URNE M19 2026 (Apertura y Oficial).',
    '-- Borra SÓLO lo que creó esta corrida. Los clubes van último: los torneos', '-- los referencian por FK.', 'BEGIN;', ''];
  for (const c of creados) {
    const fases = `(SELECT id FROM public.tournament_phases WHERE tournament_id = '${c.tournamentId}')`;
    sql.push(`-- ${c.nombre}`);
    sql.push(`DELETE FROM public.tournament_standings WHERE tournament_id = '${c.tournamentId}';`);
    sql.push(`DELETE FROM public.tournament_match_advancement_rules WHERE phase_id IN ${fases};`);
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
