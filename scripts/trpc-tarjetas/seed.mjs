/**
 * Alta de los 4 torneos nuevos del zip "Torneo TRPC 2026" (Apertura de Tierra del Fuego,
 * Cordillerano, Oficial Mayores y Primera B del Alto Valle), desde `partidos.json`
 * (salida de parse.mjs). Los 4 torneos que ya existían (Regional Patagónico, Austral,
 * Norpatagónico, Tierra del Fuego Clausura) solo reciben la ficha: eso lo hace
 * `build.py` + `src/scripts/ficha-partido-local.ts`.
 *
 *   node scripts/trpc-tarjetas/seed.mjs <partidos.json> --plan | --execute
 *   node scripts/trpc-tarjetas/seed.mjs <partidos.json> --limpiar --plan | --execute
 *
 * Un participante son TRES filas encadenadas (tournament_participants, team_season_entries,
 * tournament_phase_participants). Los puntos van como los publica la tarjeta: el [n] de cada
 * lado es el TOTAL de puntos de tabla del partido (4 por ganar + bonus), así que
 * bonus = n - base. Después de escribir hay que rehacer la tabla:
 *   npx tsx src/scripts/arusa-recalcular.ts --torneo=<slug>
 * Idempotente: un torneo cuyo slug ya está se saltea. Deja TRPC_2026_ROLLBACK.sql.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { CLUB_POR_NOMBRE, CLUBES_NUEVOS, ORDINALES, ORIGEN, RULESET, TEMPORADA, TIEBREAKERS, TORNEO_CORREGIDO, TORNEOS } from './datos.mjs';

const REPO = process.cwd();
const ROLLBACK = path.join(REPO, 'TRPC_2026_ROLLBACK.sql');
const MOTIVO = 'puntos según la tarjeta oficial de la UAR';

const archivo = process.argv[2];
const modo = process.argv.includes('--execute') ? 'execute' : process.argv.includes('--plan') ? 'plan' : null;
if (!archivo || !modo) { console.error('uso: seed.mjs <partidos.json> --plan|--execute [--limpiar]'); process.exit(2); }

const env = { ...process.env };
for (const l of fs.readFileSync(path.join(REPO, '.env.local'), 'utf8').split(/\r?\n/)) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !env[m[1]]) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
}
const URL_BASE = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_BASE || !KEY) { console.error('Faltan credenciales en .env.local'); process.exit(1); }
const H = { apikey: KEY, authorization: `Bearer ${KEY}` };

async function pedir(metodo, recurso, cuerpo, extra = {}) {
  for (let intento = 1; intento <= 4; intento += 1) {
    const res = await fetch(encodeURI(`${URL_BASE}/rest/v1/${recurso}`), {
      method: metodo,
      headers: { ...H, ...(cuerpo ? { 'content-type': 'application/json' } : {}), prefer: 'return=minimal', ...extra },
      body: cuerpo ? JSON.stringify(cuerpo) : undefined,
    });
    if (res.ok) return metodo === 'GET' ? res.json() : null;
    const txt = (await res.text()).slice(0, 400);
    if (intento < 4 && /timeout|57014|502|503|504/i.test(`${res.status} ${txt}`)) { await new Promise((r) => setTimeout(r, 3000)); continue; }
    throw new Error(`${metodo} ${recurso}: ${res.status} ${txt}`);
  }
}
const leer = (r) => pedir('GET', r, null, { prefer: '' });
const insertar = (t, filas) => (filas.length ? pedir('POST', t, filas) : null);
const actualizar = (r, c) => pedir('PATCH', r, c);
const borrar = (r) => pedir('DELETE', r);

async function limpiarTorneo(id) {
  const fases = (await leer(`tournament_phases?select=id&tournament_id=eq.${id}`)).map((f) => f.id);
  await borrar(`tournament_standings?tournament_id=eq.${id}`);
  await borrar(`matches?tournament_id=eq.${id}`);
  await borrar(`tournament_phase_participants?tournament_id=eq.${id}`);
  await actualizar(`tournament_participants?tournament_id=eq.${id}`, { season_entry_id: null });
  await borrar(`team_season_entries?tournament_id=eq.${id}`);
  await borrar(`tournament_participants?tournament_id=eq.${id}`);
  if (fases.length) await borrar(`tournament_rounds?phase_id=in.(${fases.join(',')})`);
  await borrar(`tournament_phases?tournament_id=eq.${id}`);
  await actualizar(`tournaments?id=eq.${id}`, { current_season_id: null });
  await borrar(`tournament_seasons?tournament_id=eq.${id}`);
  await borrar(`tournaments?id=eq.${id}`);
}

// ── Lectura de la captura ────────────────────────────────────────────────────
function clubDe(nombre) {
  const n = nombre.trim();
  const clave = Object.keys(CLUB_POR_NOMBRE).sort((a, b) => b.length - a.length).find((k) => n === k || n.startsWith(`${k} - `));
  if (!clave) throw new Error(`club sin mapear: "${n}"`);
  return CLUB_POR_NOMBRE[clave];
}
const instante = (txt) => {
  const m = txt.match(/(\d\d)\/(\d\d)\/(\d{4}) (\d\d):(\d\d)/);
  if (!m) throw new Error(`fecha ilegible: ${txt}`);
  return { dia: `${m[3]}-${m[2]}-${m[1]}`, iso: new Date(`${m[3]}-${m[2]}-${m[1]}T${m[4]}:${m[5]}:00-03:00`).toISOString() };
};
function fechaDe(c) {
  const f = (c.fecha || '').toUpperCase().trim();
  if (f === 'FINAL') return 'FINAL';
  const n = f.match(/(\d+)/);
  if (n) return Number(n[1]);
  if (ORDINALES[f]) return ORDINALES[f];
  throw new Error(`fecha desconocida "${c.fecha}" en ${c.numero}`);
}
const base = (a, b) => (a > b ? RULESET.pointsWin : a === b ? RULESET.pointsDraw : RULESET.pointsLoss);

function cargarTarjetas() {
  const todas = JSON.parse(fs.readFileSync(archivo, 'utf8'));
  const porNumero = new Map();
  for (const c of todas) {
    const largo = JSON.stringify(c).length;
    const previa = porNumero.get(c.numero);
    if (!previa || largo > JSON.stringify(previa).length) porNumero.set(c.numero, c);
  }
  const salida = new Map(TORNEOS.map((t) => [t.clave, []]));
  for (const c of porNumero.values()) {
    const nombreTorneo = TORNEO_CORREGIDO[c.numero] || c.torneo;
    const t = TORNEOS.find((x) => x.tarjeta === nombreTorneo);
    if (!t) continue;
    const [l, v] = c.lados;
    const { dia, iso } = instante(c.jugado);
    const estado = c.estado;
    const m = {
      numero: c.numero, fecha: fechaDe(c), dia, iso, lugar: (c.lugar || '').trim(), referee: c.referee,
      local: clubDe(l.nombre), visitante: clubDe(v.nombre), estado,
      pl: l.pts, pv: v.pts, tl: l.bonus, tv: v.bonus,
    };
    if (estado === 'Suspendido' && !m.pl && !m.pv) m.estadoDb = 'postponed';
    // Los W.O. (20-0 / 0-20) vienen sin la línea "Cerrado" pero con puntos de tabla: son resultados.
    else if ((estado === 'Cerrado' || (estado === '' && m.tl + m.tv > 0)) && m.pl !== null && m.pv !== null) m.estadoDb = 'final';
    else m.estadoDb = 'scheduled';
    salida.get(t.clave).push(m);
  }
  for (const ps of salida.values()) ps.sort((a, b) => a.iso.localeCompare(b.iso) || a.numero.localeCompare(b.numero));
  return salida;
}

// ── Filas ────────────────────────────────────────────────────────────────────
const ahora = new Date().toISOString();

function filaDeClub(c) {
  return {
    id: c.id, union_id: c.union, name: c.name, short_name: c.name, city: c.city, region: 'Patagonia', country: 'ARG',
    logo_url: null, primary_color: null, slug: c.id, is_visible: true, entity_type: 'club', sport: 'rugby', sport_id: 'rugby',
    category: null, categories: [], status: 'active', visibility: 'visible', external_id: null, created_at: ahora, updated_at: ahora,
  };
}

function filaDeTorneo(t, id) {
  return {
    id, union_id: t.union, season_id: TEMPORADA, name: t.nombre, display_name: t.nombre, original_name: t.nombre, slug: t.slug,
    status: 'published', category: t.categoria, gender: null, age_grade: 'Mayores (Adults)', region: t.region,
    country: 'ARG', country_id: 'argentina', country_name: 'Argentina', format: 'league', is_visible: true, is_active: true,
    logo_url: null, ruleset: RULESET, ruleset_version: 1, sport_id: 'rugby', sport: 'rugby', sport_name: 'Rugby',
    priority: 0, sponsors: [], social_links: {}, display_order: 0, is_popular: false, is_api_managed: false,
    review_status: 'approved', data_source: ORIGEN, external_id: null, current_season_id: null, created_at: ahora, updated_at: ahora,
  };
}

function settingsDeFase(equipos, playoff) {
  return {
    legs: 1, teamsCount: equipos, advanceCount: 2, group_names: [], groupLabels: [], tableTags: [],
    points: { win: RULESET.pointsWin, draw: RULESET.pointsDraw, loss: RULESET.pointsLoss },
    pointsSystem: { win: 4, draw: 2, loss: 0, bonusTry: 1, bonusLoss: 1, allowBonusPoints: true },
    tiebreakers: TIEBREAKERS, standings: { mode: 'automatic', editable: true },
    phaseMode: playoff ? 'playoff' : 'league', ...(playoff ? { playoffThirdPlace: false } : {}), source: ORIGEN,
  };
}

function puntosDe(m) {
  const bl = m.tl - base(m.pl, m.pv);
  const bv = m.tv - base(m.pv, m.pl);
  if (bl < 0 || bv < 0) throw new Error(`${m.numero}: puntos de tabla menores que la base (${m.tl}/${m.tv})`);
  return {
    status: 'final',
    score: { home: m.pl, away: m.pv, manualOverride: { home: m.pl, away: m.pv, cutoffMinute: null } },
    home_base_points: base(m.pl, m.pv), away_base_points: base(m.pv, m.pl),
    home_bonus_points: bl, away_bonus_points: bv, points_autocalculated: false, points_override_reason: MOTIVO,
  };
}

async function escribirTorneo(t, ps, tournamentId) {
  const seasonId = crypto.randomUUID();
  const regulares = ps.filter((m) => m.fecha !== 'FINAL');
  const finales = ps.filter((m) => m.fecha === 'FINAL');
  const clubes = [...new Set(ps.flatMap((m) => [m.local, m.visitante]))].sort();
  const desde = ps[0].dia; const hasta = ps[ps.length - 1].dia;

  await insertar('tournaments', [filaDeTorneo(t, tournamentId)]);
  await insertar('tournament_seasons', [{
    id: seasonId, tournament_id: tournamentId, legacy_tournament_id: tournamentId, season_code: TEMPORADA,
    name: `${t.nombre} ${TEMPORADA}`, display_name: `${t.nombre} ${TEMPORADA}`, slug: `${t.slug}-${TEMPORADA}`,
    status: 'active', is_active: true, start_date: desde, end_date: hasta, format: 'league', ruleset: RULESET,
    settings: { source: ORIGEN, edition: t.edicion }, champion_club_id: null, created_at: ahora, updated_at: ahora,
  }]);
  await actualizar(`tournaments?id=eq.${tournamentId}`, { current_season_id: seasonId });

  const faseRegular = crypto.randomUUID();
  const faseFinal = finales.length ? crypto.randomUUID() : null;
  await insertar('tournament_phases', [
    { id: faseRegular, tournament_id: tournamentId, season_id: seasonId, name: 'Fase regular', phase_type: 'league', order_index: 1, is_active: true, settings: settingsDeFase(clubes.length, false), created_at: ahora, updated_at: ahora },
    ...(faseFinal ? [{
      id: faseFinal, tournament_id: tournamentId, season_id: seasonId, name: 'Final', phase_type: 'playoff', order_index: 2, is_active: false,
      settings: { ...settingsDeFase(clubes.length, true), playoffStages: [{ id: 'playoff_stage_1', name: 'Final', matchCount: finales.length, orderIndex: 1 }] },
      created_at: ahora, updated_at: ahora,
    }] : []),
  ]);

  const fechas = [...new Set(regulares.map((m) => m.fecha))].sort((a, b) => a - b);
  const rondas = new Map();
  const filasRondas = fechas.map((n) => {
    const dias = regulares.filter((m) => m.fecha === n).map((m) => m.dia).sort();
    const id = crypto.randomUUID(); rondas.set(n, id);
    return {
      id, phase_id: faseRegular, season_id: seasonId, name: `Fecha ${n}`, order_index: n, start_date: dias[0], end_date: dias[dias.length - 1],
      is_completed: regulares.filter((m) => m.fecha === n).every((m) => m.estadoDb === 'final'), notes: null, created_at: ahora, updated_at: ahora,
    };
  });
  let rondaFinal = null;
  if (faseFinal) {
    rondaFinal = crypto.randomUUID();
    filasRondas.push({ id: rondaFinal, phase_id: faseFinal, season_id: seasonId, name: 'Final', order_index: 1, start_date: finales[0].dia, end_date: finales[0].dia, is_completed: finales.every((m) => m.estadoDb === 'final'), notes: null, created_at: ahora, updated_at: ahora });
  }
  await insertar('tournament_rounds', filasRondas);

  const participantes = clubes.map((c) => ({ participantId: crypto.randomUUID(), entryId: crypto.randomUUID(), club: c }));
  const nombres = Object.fromEntries((await leer(`clubs?select=id,name&id=in.(${clubes.join(',')})`)).map((c) => [c.id, c.name]));
  await insertar('tournament_participants', participantes.map((p) => ({
    id: p.participantId, tournament_id: tournamentId, season_id: seasonId, season_entry_id: null, club_id: p.club,
    name: nombres[p.club] || p.club, type: 'club', status: 'active', seed: null, group_id: null, short_code: null,
    notes: ORIGEN, joined_at: ahora, created_at: ahora, updated_at: ahora,
  })));
  await insertar('team_season_entries', participantes.map((p) => ({
    id: p.entryId, season_id: seasonId, tournament_id: tournamentId, club_id: p.club, team_id: null,
    source_participant_id: p.participantId, group_id: null, zone: null, category: null, status: 'active', seed: null, notes: null,
    settings: { source: ORIGEN }, created_at: ahora, updated_at: ahora,
  })));
  for (const p of participantes) await actualizar(`tournament_participants?id=eq.${p.participantId}`, { season_entry_id: p.entryId });
  await insertar('tournament_phase_participants', [faseRegular, faseFinal].filter(Boolean).flatMap((phaseId) => participantes.map((p) => ({
    id: crypto.randomUUID(), tournament_id: tournamentId, season_id: seasonId, phase_id: phaseId, participant_id: p.participantId,
    group_id: null, status: 'active', seed: null, notes: null, created_at: ahora, updated_at: ahora,
  }))));

  const comun = {
    tournament_id: tournamentId, season_id: seasonId, sport_id: 'rugby', sport: 'rugby', status: 'scheduled', score: null, category: null,
    home_base_points: 0, away_base_points: 0, home_bonus_points: 0, away_bonus_points: 0, points_autocalculated: true, points_override_reason: null,
    live_enabled: false, lineups: { home: [], away: [] }, events: [], review_status: 'approved', bracket_match_code: null,
    home_source_label: null, away_source_label: null, participant_source: null, notes: null, group_id: null, is_visible: true,
    created_at: ahora, updated_at: ahora,
  };
  const filaPartido = (m, phaseId, roundUuid, etiqueta) => ({
    ...comun, id: crypto.randomUUID(), phase_id: phaseId, round_uuid: roundUuid, round_label: etiqueta,
    home_club_id: m.local, away_club_id: m.visitante, date_time: m.iso, venue: m.lugar || null,
    external_id: `${ORIGEN}:${m.numero}`, status: m.estadoDb,
    notes: m.estado === 'Iniciado' ? `Tarjeta sin cerrar en la UAR (marcador parcial ${m.pl ?? '-'} - ${m.pv ?? '-'}).`
      : m.estado === 'Suspendido' ? 'Suspendido según la tarjeta de la UAR.' : null,
    ...(m.estadoDb === 'final' ? puntosDe(m) : {}),
  });
  const partidos = [
    ...regulares.map((m) => filaPartido(m, faseRegular, rondas.get(m.fecha), `Fecha ${m.fecha}`)),
    ...finales.map((m) => filaPartido(m, faseFinal, rondaFinal, 'Final')),
  ];
  await insertar('matches', partidos);
  return { participantes: participantes.length, partidos: partidos.length, jugados: partidos.filter((p) => p.status === 'final').length, fechas: filasRondas.length };
}

async function crearTorneo(t, ps) {
  const id = crypto.randomUUID();
  try { return { id, ...(await escribirTorneo(t, ps, id)) }; } catch (e) {
    await limpiarTorneo(id).catch((e2) => console.error(`  la limpieza de ${t.slug} falló también: ${e2.message}`));
    throw e;
  }
}

async function main() {
  console.log(`modo: ${modo}\n`);
  if (process.argv.includes('--limpiar')) {
    const filas = await leer(`tournaments?select=id,name&slug=in.(${TORNEOS.map((t) => t.slug).join(',')})`);
    for (const f of filas) { console.log(`  - ${f.name}`); if (modo === 'execute') await limpiarTorneo(f.id); }
    return;
  }
  const tarjetas = cargarTarjetas();
  const usados = [...new Set([...tarjetas.values()].flat().flatMap((m) => [m.local, m.visitante]))];
  const sinClub = usados.filter((id) => !CLUBES_NUEVOS.some((c) => c.id === id));
  const enBase = new Set((await leer(`clubs?select=id&id=in.(${[...usados].join(',')})`)).map((c) => c.id));
  const faltan = sinClub.filter((id) => !enBase.has(id));
  if (faltan.length) throw new Error(`clubes que debían existir y no están: ${faltan.join(', ')}`);
  const clubesNuevos = CLUBES_NUEVOS.filter((c) => !enBase.has(c.id));
  const existentes = new Set((await leer(`tournaments?select=slug&slug=in.(${TORNEOS.map((t) => t.slug).join(',')})`)).map((t) => t.slug));

  console.log(`clubes a crear (${clubesNuevos.length}): ${clubesNuevos.map((c) => c.name).join(', ') || '—'}\n`);
  for (const t of TORNEOS) {
    const ps = tarjetas.get(t.clave);
    const cuenta = ps.reduce((a, m) => ({ ...a, [m.estadoDb]: (a[m.estadoDb] || 0) + 1 }), {});
    console.log(`${existentes.has(t.slug) ? '(ya existe) ' : '+ '}${t.nombre} [${t.slug}] · ${new Set(ps.flatMap((m) => [m.local, m.visitante])).size} clubes · ${ps.length} partidos`, cuenta);
    for (const m of ps) console.log(`    F${String(m.fecha).padEnd(5)} ${m.dia} ${m.local} ${m.pl ?? '-'}-${m.pv ?? '-'} ${m.visitante} [${m.tl}/${m.tv}] ${m.estadoDb}`);
  }
  if (modo === 'plan') { console.log('\nmodo --plan: no se escribió una sola fila.'); return; }

  await insertar('clubs', clubesNuevos.map(filaDeClub));
  console.log(`\n✓ ${clubesNuevos.length} clubes`);
  const creados = [];
  for (const t of TORNEOS.filter((x) => !existentes.has(x.slug))) {
    const r = await crearTorneo(t, tarjetas.get(t.clave));
    creados.push({ ...t, id: r.id });
    console.log(`✓ ${t.nombre}  /tournaments/${r.id}\n    ${r.fechas} rondas · ${r.participantes} participantes · ${r.partidos} partidos · ${r.jugados} con resultado`);
  }
  const sql = ['-- Rollback de la carga TRPC 2026 (4 torneos nuevos de la Patagonia).', 'BEGIN;', ''];
  for (const c of creados) {
    const fases = `(SELECT id FROM public.tournament_phases WHERE tournament_id = '${c.id}')`;
    sql.push(`-- ${c.nombre}`,
      `DELETE FROM public.tournament_standings WHERE tournament_id = '${c.id}';`,
      `DELETE FROM public.matches WHERE tournament_id = '${c.id}';`,
      `DELETE FROM public.tournament_phase_participants WHERE tournament_id = '${c.id}';`,
      `UPDATE public.tournament_participants SET season_entry_id = NULL WHERE tournament_id = '${c.id}';`,
      `DELETE FROM public.team_season_entries WHERE tournament_id = '${c.id}';`,
      `DELETE FROM public.tournament_participants WHERE tournament_id = '${c.id}';`,
      `DELETE FROM public.tournament_rounds WHERE phase_id IN ${fases};`,
      `DELETE FROM public.tournament_phases WHERE tournament_id = '${c.id}';`,
      `UPDATE public.tournaments SET current_season_id = NULL WHERE id = '${c.id}';`,
      `DELETE FROM public.tournament_seasons WHERE tournament_id = '${c.id}';`,
      `DELETE FROM public.tournaments WHERE id = '${c.id}';`, '');
  }
  if (clubesNuevos.length) sql.push(`DELETE FROM public.clubs WHERE id IN (${clubesNuevos.map((c) => `'${c.id}'`).join(', ')});`, '');
  sql.push('COMMIT;');
  fs.writeFileSync(ROLLBACK, sql.join('\n') + '\n', 'utf8');
  console.log(`\nrollback escrito: ${ROLLBACK}\nAhora: npx tsx src/scripts/arusa-recalcular.ts --torneo=<slug> para cada torneo.`);
}

main().catch((e) => { console.error('\nFALLÓ:', e.message || e); process.exit(1); });
