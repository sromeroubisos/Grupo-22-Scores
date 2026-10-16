/**
 * Carga del Torneo Menores de 19 "A" 2026 de la Unión Cordobesa de Rugby.
 *
 *   node scripts/cordoba-m19/extraer.mjs          (planillas → fuente/*.json, valida contra la tabla)
 *   node scripts/cordoba-m19/seed.mjs --plan
 *   node scripts/cordoba-m19/seed.mjs --execute
 *   node scripts/cordoba-m19/seed.mjs --execute --limpiar
 *   node scripts/cordoba-m19/seed.mjs --execute --tabla     (reescribe SOLO la tabla oficial)
 *
 * La fuente son dos planillas que la Unión exporta de su sistema de gestión:
 * `Partidos` (con árbitro y estado) y `Posiciones` (la tabla oficial). Los 107
 * partidos jugados reproducen la tabla al tanto (PJ, PG, PP, TF, TC y bonus
 * defensivo); lo valida `extraer.mjs`.
 *
 * Estructura: UNA fase de liga ("Campeonato": 18 fechas y las 5 de la ronda
 * REC, una sola tabla "Grupo único") y dos fases de llaves con lo que todavía
 * no se jugó: las Semifinales y el Posicionamiento 5° al 10°.
 *
 * La tabla es la OFICIAL, no la que recalcula el motor: la planilla no trae los
 * tries por partido, así que el bonus ofensivo (4 tries) no se puede
 * reconstruir partido a partido. Se despeja de los puntos de la tabla
 * (Ptos − 4·PG − 2·PE − bonus defensivo). La fase queda `fully_manual`; un
 * recálculo del motor (editar un partido desde el gestor) la pisa y hay que
 * volver a correr --execute --tabla.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const REPO = process.cwd();
const DIR = path.join(REPO, 'scripts', 'cordoba-m19');
const ROLLBACK = path.join(REPO, 'CORDOBA_M19_ROLLBACK.sql');
const ORIGEN = 'cordoba-m19-2026';
const UNION_CORDOBESA = '0c515ac1-af49-4699-b3c5-7273bc424357';
const TEMPORADA = '2026';
const SLUG = 'torneo-cordobes-m19-a';
const NOMBRE = 'Torneo Cordobés M19 "A"';
const HORA_POR_DEFECTO = '12:00';

const TIEBREAKERS = [
  { metric: 'points',            label: 'Puntos obtenidos',     priority: 1, enabled: true },
  { metric: 'head_to_head',      label: 'Resultado entre sí',   priority: 2, enabled: true },
  { metric: 'points_difference', label: 'Diferencia de tantos', priority: 3, enabled: true },
  { metric: 'tries_for',         label: 'Tries a favor',        priority: 4, enabled: true },
  { metric: 'won',               label: 'Partidos ganados',     priority: 5, enabled: true },
];
const RULESET = {
  pointsWin: 4, pointsDraw: 2, pointsLoss: 0, pointsBonusTry: 1, pointsBonusLoss: 1,
  points: { win: 4, draw: 2, loss: 0 },
  pointsSystem: { win: 4, draw: 2, loss: 0, allowBonusPoints: true, bonusTry: 1, bonusLoss: 1 },
  bonus: { offensive: { tries: 4, points: 1 }, defensive: { margin: 7, points: 1 } },
  standings: { points_base: { win: 4, draw: 2, loss: 0 }, bonus_rules: [] },
  competition: { format_type: 'league', parameters: { season_model: 'multi_phase' } },
  tiebreakers: TIEBREAKERS,
};

const modo = process.argv.includes('--execute') ? 'execute' : process.argv.includes('--plan') ? 'plan' : null;
if (!modo) { console.error('usá --plan o --execute'); process.exit(2); }
const limpiarFlag = process.argv.includes('--limpiar');
const soloTabla = process.argv.includes('--tabla');

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
    method: 'PATCH', headers: { ...H, 'content-type': 'application/json', prefer: 'return=minimal' },
    body: JSON.stringify(cuerpo),
  });
  if (!res.ok) throw new Error(`PATCH ${recurso}: ${res.status} ${(await res.text()).slice(0, 400)}`);
}
async function borrar(recurso) {
  const res = await fetch(encodeURI(`${URL_BASE}/rest/v1/${recurso}`), { method: 'DELETE', headers: { ...H, prefer: 'return=minimal' } });
  if (!res.ok) throw new Error(`DELETE ${recurso}: ${res.status} ${(await res.text()).slice(0, 300)}`);
}

async function limpiarTorneo(tournamentId) {
  const fases = await leer(`tournament_phases?select=id&tournament_id=eq.${tournamentId}`);
  const idsFase = fases.map((f) => f.id);
  if (idsFase.length) await borrar(`tournament_match_advancement_rules?phase_id=in.(${idsFase.join(',')})`);
  await borrar(`tournament_standings?tournament_id=eq.${tournamentId}`);
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

// ── Datos ────────────────────────────────────────────────────────────────────
const partidos = JSON.parse(fs.readFileSync(path.join(DIR, 'fuente', 'partidos.json'), 'utf8'));
const tabla = JSON.parse(fs.readFileSync(path.join(DIR, 'fuente', 'tabla.json'), 'utf8'));
const fichaId = (madre) => `${madre}-m19-a`;
const madres = [...new Set(partidos.flatMap((p) => [p.local, p.visitante]))].sort();
const instanteDe = (fecha, hora) => new Date(`${fecha}T${hora || HORA_POR_DEFECTO}:00-03:00`).toISOString();
const ahora = new Date().toISOString();

/** Fase y ronda de cada partido, según el rótulo de la planilla. */
function ubicar(p) {
  if (p.instancia === 'CAMPEONATO') {
    const rec = /^REC - Fecha (\d+)/.exec(p.ronda);
    if (rec) return { fase: 'Campeonato', ronda: `REC - Fecha ${rec[1]}`, orden: 18 + Number(rec[1]) };
    const n = Number(/Fecha (\d+)/.exec(p.ronda)[1]);
    return { fase: 'Campeonato', ronda: `Fecha ${n}`, orden: n };
  }
  if (p.instancia === 'SEMIFINALES') return { fase: 'Semifinales', ronda: 'Semifinales', orden: 1 };
  return { fase: 'Posicionamiento 5° al 10°', ronda: p.ronda, orden: 1 };
}

function camposDePartido(p) {
  if (p.estado === 'scheduled') {
    return { status: 'scheduled', score: null, notes: p.arbitro ? `Árbitro: ${p.arbitro}` : null };
  }
  const notas = [p.estado === 'walkover' ? 'W.O.: ganado por no presentación del rival.' : null, p.arbitro ? `Árbitro: ${p.arbitro}` : null].filter(Boolean);
  return { status: 'final', score: { home: p.hs, away: p.as }, notes: notas.join(' · ') || null };
}

function armarPlan() {
  const fases = new Map();
  for (const p of partidos) {
    const u = ubicar(p);
    if (!fases.has(u.fase)) fases.set(u.fase, { nombre: u.fase, rondas: new Map(), partidos: [] });
    const f = fases.get(u.fase);
    const r = f.rondas.get(u.ronda) ?? { nombre: u.ronda, orden: u.orden, desde: p.fecha, hasta: p.fecha };
    if (p.fecha < r.desde) r.desde = p.fecha;
    if (p.fecha > r.hasta) r.hasta = p.fecha;
    f.rondas.set(u.ronda, r);
    f.partidos.push({ ...p, ronda: u.ronda });
  }
  return ['Campeonato', 'Semifinales', 'Posicionamiento 5° al 10°'].map((n) => fases.get(n));
}

function filaDeTabla(t, i, ctx) {
  const ofensivo = t.pts - 4 * t.pg - 2 * t.pe - t.bTantos;
  const id = fichaId(t.club);
  return {
    tournament_id: ctx.tournamentId, season_id: ctx.seasonId, phase_id: ctx.faseId, group_id: null,
    club_id: id, season_entry_id: ctx.entradas.get(id) ?? null, table_type: 'general',
    position: i + 1, played: t.pj, won: t.pg, drawn: t.pe, lost: t.pp, points: t.pts,
    scored: t.tf, conceded: t.tc, bonus_points: ofensivo + t.bTantos, form: null, streak: null, last_updated: ahora,
    stats: {
      status: null, team_name: ctx.nombres.get(id)?.name ?? id, team_logo: ctx.nombres.get(id)?.logo_url ?? null,
      difference: t.tf - t.tc, table_type: 'general', adjustments: 0, tries_for: t.tryF, tries_against: t.tryC,
      bonus_offensive: ofensivo, bonus_defensive: t.bTantos, bonus_destrezas: 0,
      fuente: 'Tabla oficial de la Unión Cordobesa de Rugby (bonus ofensivo despejado de los puntos)', calculated_at: ahora,
    },
  };
}

async function escribirTabla(ctx) {
  const rows = tabla.map((t, i) => filaDeTabla(t, i, ctx));
  await borrar(`tournament_standings?phase_id=eq.${ctx.faseId}`);
  await insertar('tournament_standings', rows);
  const [fase] = await leer(`tournament_phases?select=settings&id=eq.${ctx.faseId}`);
  const settings = { ...(fase.settings || {}) };
  settings.standings = { ...(settings.standings || {}), mode: 'fully_manual', editable: true, source: 'Tabla oficial de la Unión Cordobesa de Rugby' };
  await actualizar(`tournament_phases?id=eq.${ctx.faseId}`, { settings });
  return rows.length;
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`modo: ${modo}${limpiarFlag ? ' · limpiar' : ''}${soloTabla ? ' · sólo tabla' : ''}\n`);
  const [existente] = await leer(`tournaments?select=id,name&slug=eq.${SLUG}`);

  if (limpiarFlag) {
    if (!existente) { console.log('no hay nada cargado que borrar.'); return; }
    console.log(`se borra ${existente.name} (${existente.id}) con su temporada`);
    if (modo === 'plan') { console.log('\nmodo --plan: no se borró nada.'); return; }
    await limpiarTorneo(existente.id);
    console.log('✓ borrado (las fichas de club se conservan)');
    return;
  }

  if (soloTabla) {
    if (!existente) throw new Error('el torneo no existe: corré --execute primero');
    const [t] = await leer(`tournaments?select=id,current_season_id&id=eq.${existente.id}`);
    const [fase] = await leer(`tournament_phases?select=id&season_id=eq.${t.current_season_id}&name=eq.Campeonato`);
    const entradas = new Map((await leer(`team_season_entries?select=id,club_id&season_id=eq.${t.current_season_id}`)).map((e) => [e.club_id, e.id]));
    const nombres = new Map((await leer(`clubs?select=id,name,logo_url&id=in.(${madres.map(fichaId).join(',')})`)).map((c) => [c.id, c]));
    if (modo === 'plan') { console.log(`se reescribirían ${tabla.length} filas de la tabla`); return; }
    const n = await escribirTabla({ tournamentId: t.id, seasonId: t.current_season_id, faseId: fase.id, entradas, nombres });
    console.log(`✓ tabla oficial: ${n} filas`);
    return;
  }

  if (existente) {
    console.log(`ya existe: ${existente.name}. No se escribe nada.`);
    console.log('Para rehacerlo: --execute --limpiar y después --execute. Sólo la tabla: --execute --tabla.');
    return;
  }

  // ── Qué existe ya ──
  const madresDb = new Map((await leer(`clubs?select=id,name,union_id,city,region,logo_url&id=in.(${madres.join(',')})`)).map((c) => [c.id, c]));
  const faltan = madres.filter((m) => !madresDb.has(m));
  if (faltan.length) throw new Error(`clubes madre que no están en la base: ${faltan.join(', ')}`);
  const fichasDb = new Set((await leer(`clubs?select=id&id=in.(${madres.map(fichaId).join(',')})`)).map((c) => c.id));
  const fichasNuevas = madres.filter((m) => !fichasDb.has(fichaId(m)));
  const vinculadas = new Set((await leer(`club_derivatives?select=derived_club_id&derived_club_id=in.(${madres.map(fichaId).join(',')})`)).map((d) => d.derived_club_id));
  const raices = new Map((await leer(`club_derivatives?select=base_club_id,derived_club_id&derived_club_id=in.(${madres.join(',')})`)).map((d) => [d.derived_club_id, d.base_club_id]));
  const vinculos = madres.filter((m) => !vinculadas.has(fichaId(m)))
    .map((m) => ({ base_club_id: raices.get(m) || m, derived_club_id: fichaId(m), derivative_type: 'family' }));

  const plan = armarPlan();
  console.log(`fichas M19 "A": ${madres.length} (${fichasNuevas.length} nuevas) · vínculos de familia nuevos: ${vinculos.length}`);
  console.log(`torneo: ${NOMBRE}  (${SLUG})`);
  for (const f of plan) {
    const jugados = f.partidos.filter((p) => p.estado !== 'scheduled').length;
    console.log(`  fase ${f.nombre.padEnd(28)} ${f.rondas.size} rondas · ${f.partidos.length} partidos (${jugados} jugados, ${f.partidos.length - jugados} pendientes)`);
  }
  console.log(`  tabla oficial: ${tabla.length} filas · 1.° ${tabla[0].club} ${tabla[0].pts} pts`);
  if (modo === 'plan') { console.log('\nmodo --plan: no se escribió una sola fila.'); return; }

  // ── Escritura ──
  const filaFicha = (m) => {
    const madre = madresDb.get(m);
    return {
      id: fichaId(m), union_id: madre.union_id ?? UNION_CORDOBESA, name: `${madre.name} M19 "A"`, short_name: `${madre.name} M19 "A"`,
      city: madre.city ?? null, region: madre.region ?? null, country: 'ARG',
      // El escudo se COPIA de la madre: la pantalla del torneo lee `logo_url` de la ficha.
      logo_url: madre.logo_url ?? null, primary_color: null, slug: fichaId(m),
      is_visible: true, entity_type: 'club', sport: 'rugby', sport_id: 'rugby',
      category: 'M19', categories: [], status: 'active', visibility: 'visible',
      external_id: null, created_at: ahora, updated_at: ahora,
    };
  };
  const tournamentId = crypto.randomUUID();
  const seasonId = crypto.randomUUID();
  try {
    await insertar('clubs', fichasNuevas.map(filaFicha));
    await insertar('club_derivatives', vinculos.map((v) => ({ id: crypto.randomUUID(), ...v, created_at: ahora })));
    console.log(`\n✓ ${fichasNuevas.length} fichas · ${vinculos.length} vínculos`);

    await insertar('tournaments', [{
      id: tournamentId, union_id: UNION_CORDOBESA, season_id: TEMPORADA, name: NOMBRE, slug: SLUG, original_name: 'TORNEO MENORES DE 19 "A"',
      status: 'published', category: 'Juvenil', age_grade: 'M19', region: 'Centro', country: 'ARG', country_id: 'argentina', country_name: 'Argentina',
      format: 'league', is_visible: true, is_active: true, logo_url: null, ruleset: RULESET, ruleset_version: 1,
      sport_id: 'rugby', sport: 'rugby', sport_name: 'Rugby', gender: 'masculino', priority: 0, sponsors: [], social_links: {}, display_order: 0,
      is_popular: false, is_api_managed: false, review_status: 'approved', data_source: ORIGEN, external_id: null, created_at: ahora, updated_at: ahora,
    }]);
    const fechas = partidos.map((p) => p.fecha).sort();
    await insertar('tournament_seasons', [{
      id: seasonId, tournament_id: tournamentId, legacy_tournament_id: tournamentId, season_code: TEMPORADA,
      name: `${NOMBRE} ${TEMPORADA}`, display_name: `${NOMBRE} ${TEMPORADA}`, slug: `${SLUG}-${TEMPORADA}`,
      status: 'active', is_active: true, start_date: fechas[0], end_date: fechas[fechas.length - 1], format: 'league',
      ruleset: RULESET, settings: { source: ORIGEN, organiza: 'Unión Cordobesa de Rugby', formato: '18 fechas, ronda REC de 5 fechas, semifinales y posicionamiento' },
      champion_club_id: null, created_at: ahora, updated_at: ahora,
    }]);
    await actualizar(`tournaments?id=eq.${tournamentId}`, { current_season_id: seasonId, season_id: TEMPORADA, updated_at: ahora });

    // Participantes: las TRES filas, con la FK circular en dos pasos.
    const parts = madres.map((m) => ({ participantId: crypto.randomUUID(), entryId: crypto.randomUUID(), clubId: fichaId(m) }));
    const nombreDe = new Map(madres.map((m) => [fichaId(m), `${madresDb.get(m).name} M19 "A"`]));
    await insertar('tournament_participants', parts.map((p) => ({
      id: p.participantId, tournament_id: tournamentId, season_id: seasonId, season_entry_id: null, club_id: p.clubId,
      name: nombreDe.get(p.clubId), type: 'club', status: 'active', seed: null, group_id: null, short_code: null,
      notes: ORIGEN, joined_at: ahora, created_at: ahora, updated_at: ahora,
    })));
    await insertar('team_season_entries', parts.map((p) => ({
      id: p.entryId, season_id: seasonId, tournament_id: tournamentId, club_id: p.clubId, team_id: null,
      source_participant_id: p.participantId, group_id: null, zone: null, category: null, status: 'active', seed: null,
      notes: null, settings: { source: ORIGEN }, created_at: ahora, updated_at: ahora,
    })));
    for (const p of parts) await actualizar(`tournament_participants?id=eq.${p.participantId}`, { season_entry_id: p.entryId });
    const participanteDe = new Map(parts.map((p) => [p.clubId, p.participantId]));
    const entradas = new Map(parts.map((p) => [p.clubId, p.entryId]));

    let faseCampeonato = null;
    for (const [i, f] of plan.entries()) {
      const faseId = crypto.randomUUID();
      const esLiga = f.nombre === 'Campeonato';
      if (esLiga) faseCampeonato = faseId;
      const equipos = [...new Set(f.partidos.flatMap((p) => [p.local, p.visitante]))].map(fichaId);
      const settingsBase = {
        legs: 1, points: { win: 4, draw: 2, loss: 0 }, pointsSystem: { ...RULESET.pointsSystem }, bonus: RULESET.bonus,
        tiebreakers: TIEBREAKERS, standings: { mode: 'automatic', editable: true }, source: ORIGEN,
      };
      await insertar('tournament_phases', [{
        id: faseId, tournament_id: tournamentId, season_id: seasonId, name: f.nombre,
        phase_type: esLiga ? 'league' : 'playoff', order_index: i + 1, is_active: esLiga,
        settings: esLiga ? { ...settingsBase, teamsCount: equipos.length }
          : { ...settingsBase, advanceCount: 1, phaseMode: 'playoff', bracketMode: 'manual',
            playoffStages: [{ id: 'playoff_stage_1', name: [...f.rondas.keys()][0], orderIndex: 1, matchCount: f.partidos.length }] },
        created_at: ahora, updated_at: ahora,
      }]);

      const rondaDe = new Map();
      const filasR = [...f.rondas.values()].sort((a, b) => a.orden - b.orden).map((r, k) => {
        const id = crypto.randomUUID(); rondaDe.set(r.nombre, id);
        const jugada = f.partidos.filter((p) => p.ronda === r.nombre).every((p) => p.estado !== 'scheduled');
        return {
          id, phase_id: faseId, season_id: seasonId, name: r.nombre, order_index: k + 1,
          start_date: r.desde, end_date: r.hasta, is_completed: jugada, notes: null, created_at: ahora, updated_at: ahora,
        };
      });
      await insertar('tournament_rounds', filasR);
      await insertar('tournament_phase_participants', equipos.map((c) => ({
        id: crypto.randomUUID(), tournament_id: tournamentId, season_id: seasonId, phase_id: faseId,
        participant_id: participanteDe.get(c), group_id: null, status: 'active', seed: null, notes: null,
        created_at: ahora, updated_at: ahora,
      })));
      // Todas las filas llevan EXACTAMENTE las mismas claves (insert masivo de PostgREST).
      await insertar('matches', f.partidos.map((p) => ({
        id: crypto.randomUUID(), tournament_id: tournamentId, season_id: seasonId, sport_id: 'rugby', sport: 'rugby',
        phase_id: faseId, group_id: null, round_uuid: rondaDe.get(p.ronda), round_label: p.ronda,
        home_club_id: fichaId(p.local), away_club_id: fichaId(p.visitante),
        date_time: instanteDe(p.fecha, p.hora), venue: null,
        ...camposDePartido(p),
        points_autocalculated: true, home_base_points: 0, away_base_points: 0, home_bonus_points: 0, away_bonus_points: 0,
        points_override_reason: null, bracket_match_code: null, home_source_label: null, away_source_label: null, participant_source: null,
        live_enabled: false, lineups: { home: [], away: [] }, events: [], is_visible: true, review_status: 'approved',
        external_id: null, created_at: ahora, updated_at: ahora,
      })));
      console.log(`✓ ${f.nombre}: ${f.rondas.size} rondas · ${f.partidos.length} partidos`);
    }

    const nombres = new Map((await leer(`clubs?select=id,name,logo_url&id=in.(${madres.map(fichaId).join(',')})`)).map((c) => [c.id, c]));
    const n = await escribirTabla({ tournamentId, seasonId, faseId: faseCampeonato, entradas, nombres });
    console.log(`✓ tabla oficial: ${n} filas (fase en modo fully_manual)`);
  } catch (e) {
    await limpiarTorneo(tournamentId).catch((e2) => console.error(`  la limpieza falló también: ${e2.message}`));
    throw e;
  }

  const t = `(SELECT id FROM public.tournaments WHERE slug = '${SLUG}')`;
  const ids = madres.map(fichaId).map((id) => `'${id}'`).join(', ');
  fs.writeFileSync(ROLLBACK, [
    '-- Rollback de la carga del Torneo Cordobés M19 "A" 2026.',
    '-- Borra el torneo con todo lo que le cuelga y las fichas M19 "A" que creó la carga.',
    'BEGIN;', '',
    `DELETE FROM public.tournament_standings WHERE tournament_id = ${t};`,
    `DELETE FROM public.matches WHERE tournament_id = ${t};`,
    `DELETE FROM public.tournament_phase_participants WHERE tournament_id = ${t};`,
    `UPDATE public.tournament_participants SET season_entry_id = NULL WHERE tournament_id = ${t};`,
    `DELETE FROM public.team_season_entries WHERE tournament_id = ${t};`,
    `DELETE FROM public.tournament_participants WHERE tournament_id = ${t};`,
    `DELETE FROM public.tournament_rounds WHERE phase_id IN (SELECT id FROM public.tournament_phases WHERE tournament_id = ${t});`,
    `DELETE FROM public.tournament_phases WHERE tournament_id = ${t};`,
    `UPDATE public.tournaments SET current_season_id = NULL WHERE id = ${t};`,
    `DELETE FROM public.tournament_seasons WHERE tournament_id = ${t};`,
    `DELETE FROM public.tournaments WHERE slug = '${SLUG}';`, '',
    `DELETE FROM public.club_derivatives WHERE derived_club_id IN (${ids});`,
    `DELETE FROM public.clubs WHERE id IN (${ids});`, '',
    'COMMIT;', '',
  ].join('\n'), 'utf8');
  console.log(`\nrollback escrito: ${ROLLBACK}`);
}

main().catch((e) => { console.error('\nFALLÓ:', e.message || e); process.exit(1); });
