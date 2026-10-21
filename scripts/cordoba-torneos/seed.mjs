/**
 * Carga de los torneos 2026 de la Unión Cordobesa desde sus planillas
 * (Partidos + Posiciones): juveniles M15-M19, Intermedia, Preintermedia, Súper 9 "B"
 * Intermedia, Regional "B" Intermedia, Liga Desarrollo y los femeninos.
 *
 *   node scripts/cordoba-torneos/seed.mjs --plan
 *   node scripts/cordoba-torneos/seed.mjs --execute [--only=m16-a]
 *   node scripts/cordoba-torneos/seed.mjs --execute --limpiar [--only=m16-a]
 *
 * Mismo molde que scripts/cordoba-m19/seed.mjs (M19 "A"). Dos formas de armar un torneo:
 *
 * - Por defecto: una fase de liga "Campeonato" con TODOS los partidos de la instancia
 *   CAMPEONATO (la tabla oficial los cuenta a todos: fechas, REC, copas y cuartos) y una
 *   fase de llaves por cada instancia que no es campeonato.
 * - Con `fases` (Liga Desarrollo): cada instancia es una fase de liga con SU tabla.
 *
 * Los amistosos no entran. La tabla es la OFICIAL, no la que recalcula el motor: la
 * planilla no trae los tries por partido, así que el bonus ofensivo se despeja de los
 * puntos (Ptos − 4·PG − 2·PE − bonus defensivo). La fase queda `fully_manual`.
 *
 * Etiquetas de tabla: una banda por llave (o copa) SÓLO cuando los equipos de esa llave
 * ocupan puestos contiguos de la tabla oficial. La etiqueta va por puesto y no por
 * club: si los clasificados no coinciden con el bloque, pintar diría algo falso.
 *
 * Los clubes de Liga Desarrollo y las fichas femeninas tienen que existir ANTES
 * (scripts/cordoba-torneos/clubes-nuevos.mjs): acá no se inventan.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { claveDe, fichaDe, leerPartidos, leerTabla, TEMPORADA, TORNEOS, UNION_CORDOBESA } from './datos.mjs';

const REPO = process.cwd();
const ROLLBACK = path.join(REPO, 'CORDOBA_TORNEOS_ROLLBACK.sql');
const REGISTRO = path.join(REPO, 'scripts', 'cordoba-torneos', 'creados.json');
const ORIGEN = 'cordoba-torneos-2026';
const HORA_POR_DEFECTO = '12:00';
const COLORES = ['#00a365', '#3b82f6', '#eab308', '#94a3b8'];

const modo = process.argv.includes('--execute') ? 'execute' : process.argv.includes('--plan') ? 'plan' : null;
if (!modo) { console.error('usá --plan o --execute'); process.exit(2); }
const limpiarFlag = process.argv.includes('--limpiar');
const soloClave = process.argv.find((a) => a.startsWith('--only='))?.split('=')[1] ?? null;

const env = { ...process.env };
for (const l of fs.readFileSync(path.join(REPO, '.env.local'), 'utf8').split(/\r?\n/)) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !env[m[1]]) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
}
const URL_BASE = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_BASE || !KEY) { console.error('Faltan credenciales en .env.local'); process.exit(1); }
const H = { apikey: KEY, authorization: `Bearer ${KEY}` };
// El escudo de la Unión que ya está en Storage como logo del Top 10 del Centro.
const LOGO_UNION = `${URL_BASE}/storage/v1/object/public/tournaments/logos/55f28144-3d92-484b-a57d-646e06740808-1787176338921.png`;

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

async function limpiarTorneo(tournamentId) {
  const fases = await leer(`tournament_phases?select=id&tournament_id=eq.${tournamentId}`);
  const idsFase = fases.map((f) => f.id);
  if (idsFase.length) await borrar(`tournament_match_advancement_rules?phase_id=in.(${idsFase.join(',')})`);
  await borrar(`team_labels?tournament_id=eq.${tournamentId}`);
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

// ── Reglamento ───────────────────────────────────────────────────────────────
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

const ahora = new Date().toISOString();
const instanteDe = (fecha, hora) => new Date(`${fecha}T${hora || HORA_POR_DEFECTO}:00-03:00`).toISOString();
const esAmistoso = (p) => /^amistos/i.test(p.instancia);
const titulo = (s) => { const t = s.trim().toLowerCase(); return t.charAt(0).toUpperCase() + t.slice(1); };
const jugado = (p) => p.estado === 'final' || p.estado === 'walkover';

/** Nombre de la fase de llaves de un partido que no es de campeonato. */
function nombreDeLlave(p) {
  const i = p.instancia;
  if (/^m\d+ [a-z] - /i.test(i)) return titulo(i.replace(/^m\d+ [a-z] - /i, ''));
  if (i.length <= 3) return titulo(p.ronda);                 // "se" (cortado en la fuente) → "Semifinales"
  if (i === i.toUpperCase()) return titulo(i).replace(/\b(oro|plata)\b/, (w) => titulo(w)); // "CUARTOS DE FINAL" → "Cuartos de final"
  return i.replace(/\s+/g, ' ').replace(/(\s)(ORO|PLATA)$/, (_, s, w) => `${s}${titulo(w)}`);
}

/** Orden de las rondas: por etapa (la que arranca antes primero) y por número. */
function ordenarRondas(partidos) {
  const prefijo = (r) => r.replace(/\s*\d+$/, '');
  const etapa = new Map();
  for (const p of partidos) { const k = prefijo(p.ronda); if (!etapa.has(k) || p.fecha < etapa.get(k)) etapa.set(k, p.fecha); }
  const rondas = new Map();
  for (const p of partidos) {
    const r = rondas.get(p.ronda) ?? { nombre: p.ronda, desde: p.fecha, hasta: p.fecha };
    if (p.fecha < r.desde) r.desde = p.fecha;
    if (p.fecha > r.hasta) r.hasta = p.fecha;
    rondas.set(p.ronda, r);
  }
  const num = (r) => Number(/(\d+)$/.exec(r)?.[1] ?? 0);
  return [...rondas.values()].sort((a, b) => etapa.get(prefijo(a.nombre)).localeCompare(etapa.get(prefijo(b.nombre))) || num(a.nombre) - num(b.nombre));
}

/** "CUARTOS DE FINAL" (todo en mayúsculas en la planilla) → "Cuartos de final". */
const nombreDeRonda = (r) => (r === r.toUpperCase() && /[A-Z]{3}/.test(r) ? titulo(r) : r);

function camposDePartido(p) {
  const arbitro = p.arbitro ? `Árbitro: ${p.arbitro}` : null;
  if (p.estado === 'scheduled') return { status: 'scheduled', score: null, notes: arbitro };
  if (p.estado === 'suspended') return { status: 'suspended', score: null, notes: 'Partido suspendido; la planilla no trae nueva fecha.' };
  const notas = [
    p.estado === 'walkover' ? 'W.O.: ganado por no presentación del rival.' : null,
    p.sinFecha ? 'La planilla no trae fecha: se usó la de su ronda.' : null,
    arbitro,
  ].filter(Boolean);
  return { status: 'final', score: { home: p.hs, away: p.as }, notes: notas.join(' · ') || null };
}

const fichaId = (t, club, nombreMadre) => fichaDe(t, club, nombreMadre.get(club.madre)).id;

/** Bandas de una tabla: una por fase posterior cuyos equipos (de esta tabla) ocupan puestos contiguos. */
function etiquetasDe(tabla, ids, otras, t, nombreMadre) {
  const puesto = new Map(tabla.map((r, i) => [fichaId(t, r.club, nombreMadre), i + 1]));
  const etiquetas = []; const sinEtiqueta = [];
  for (const o of otras) {
    const equipos = new Set(o.partidos.flatMap((p) => [fichaId(t, p.local, nombreMadre), fichaId(t, p.visitante, nombreMadre)]));
    const propios = [...equipos].filter((id) => puesto.has(id));
    const ps = propios.map((id) => puesto.get(id)).sort((a, b) => a - b);
    if (propios.length < 2 || propios.length === tabla.length) { sinEtiqueta.push(`${o.nombre} (abarca a todos o a uno solo)`); continue; }
    if (propios.length !== equipos.size && !t.fases) { sinEtiqueta.push(`${o.nombre} (tiene equipos de afuera de la tabla)`); continue; }
    if (!ps.every((v, i) => i === 0 || v === ps[i - 1] + 1)) { sinEtiqueta.push(`${o.nombre} (puestos ${ps.join(',')} no son contiguos)`); continue; }
    etiquetas.push({ nombre: o.nombre, desde: ps[0], hasta: ps[ps.length - 1] });
  }
  etiquetas.sort((a, b) => a.desde - b.desde);
  return { etiquetas, sinEtiqueta };
}

// ── Plan de un torneo ────────────────────────────────────────────────────────
function armarPlan(t, nombreMadre) {
  const partidos = leerPartidos(t).filter((p) => !esAmistoso(p) && !(t.omitirSinResultado && !jugado(p))).map((p) => ({ ...p, ronda: nombreDeRonda(p.ronda) }));
  const permitidos = new Set(t.fueraDeTabla ?? []);
  let fases;

  if (t.fases) {
    fases = t.fases.map((cfg) => {
      // `prefijo`: dos fases comparten instancia y se separan por cómo arranca la ronda ("CENTRO - Fecha 3").
      const ps = partidos.filter((p) => p.instancia === cfg.instancia && (!cfg.prefijo || cfg.prefijo.test(p.ronda)))
        .map((p) => (cfg.prefijo ? { ...p, ronda: p.ronda.replace(cfg.prefijo, '') } : p));
      if (!ps.length) throw new Error(`${t.clave}: la fase "${cfg.nombre}" no tiene partidos`);
      const equipos = new Set(ps.flatMap((p) => [claveDe(p.local), claveDe(p.visitante)]));
      // La planilla de la tabla trae a todos los equipos del torneo: sólo cuentan los que jugaron esa fase.
      // Si la tabla parte un equipo en dos filas (un combinado que cambió de nombre), queda la de más partidos.
      const filas = leerTabla(t, cfg.tabla).filter((r) => equipos.has(claveDe(r.club)));
      const tabla = filas.filter((r) => !filas.some((o) => o !== r && claveDe(o.club) === claveDe(r.club) && (o.pj > r.pj || (o.pj === r.pj && filas.indexOf(o) < filas.indexOf(r)))));
      return { nombre: cfg.nombre, liga: true, partidos: ps, rondas: ordenarRondas(ps), tabla };
    });
    const cubiertos = fases.reduce((n, f) => n + f.partidos.length, 0);
    if (cubiertos !== partidos.length) throw new Error(`${t.clave}: ${partidos.length - cubiertos} partidos no caen en ninguna fase configurada (instancias: ${[...new Set(partidos.map((p) => p.instancia))].join(', ')})`);
  } else {
    const liga = partidos.filter((p) => p.instancia === 'CAMPEONATO');
    const llaves = new Map();
    for (const p of partidos.filter((x) => x.instancia !== 'CAMPEONATO')) {
      const n = nombreDeLlave(p);
      if (!llaves.has(n)) llaves.set(n, []);
      llaves.get(n).push(p);
    }
    fases = [{ nombre: 'Campeonato', liga: true, partidos: liga, rondas: ordenarRondas(liga), tabla: leerTabla(t) }];
    // Oro antes que Plata y las dos antes que lo demás; dentro de cada grupo, por fecha.
    const peso = (n) => (/\bOro\b/.test(n) ? 0 : /\bPlata\b/.test(n) ? 1 : 2);
    for (const [nombre, ps] of [...llaves.entries()].sort((a, b) => peso(a[0]) - peso(b[0]) || a[1][0].fecha.localeCompare(b[1][0].fecha))) {
      fases.push({ nombre, liga: false, partidos: ps, rondas: ordenarRondas(ps) });
    }
  }

  const todos = new Map();
  for (const f of fases) for (const c of [...f.partidos.flatMap((p) => [p.local, p.visitante]), ...(f.tabla ?? []).map((r) => r.club)]) todos.set(claveDe(c), c);
  for (const f of fases.filter((x) => x.tabla)) {
    const enTabla = new Set(f.tabla.map((r) => claveDe(r.club)));
    const fuera = [...new Set(f.partidos.flatMap((p) => [claveDe(p.local), claveDe(p.visitante)]))].filter((k) => !enTabla.has(k) && !permitidos.has(k));
    if (fuera.length) throw new Error(`${t.clave} · ${f.nombre}: clubes de partidos que no están en la tabla: ${fuera.join(', ')}`);
  }

  // Etiquetas: cada tabla con las fases que vienen DESPUÉS.
  const sinEtiqueta = [];
  fases.forEach((f, i) => {
    if (!f.tabla) return;
    const r = etiquetasDe(f.tabla, null, fases.slice(i + 1), t, nombreMadre);
    f.etiquetas = r.etiquetas; sinEtiqueta.push(...r.sinEtiqueta.map((s) => `${f.nombre}: ${s}`));
  });
  return { t, fases, todos: [...todos.values()], sinEtiqueta };
}

// ── Escritura de un torneo ───────────────────────────────────────────────────
async function escribirTorneo(plan, nombreMadre) {
  const { t } = plan;
  const tournamentId = crypto.randomUUID();
  const seasonId = crypto.randomUUID();
  const id = (c) => fichaId(t, c, nombreMadre);
  const todosPartidos = plan.fases.flatMap((f) => f.partidos);
  const hayPendientes = todosPartidos.some((p) => p.estado === 'scheduled' || p.estado === 'suspended') || (!t.fases && plan.fases.length > 1) || Boolean(t.enCurso);
  const fechas = todosPartidos.map((p) => p.fecha).sort();
  try {
    await insertar('tournaments', [{
      id: tournamentId, union_id: UNION_CORDOBESA, season_id: TEMPORADA, name: t.nombre, slug: t.slug, original_name: t.original,
      status: 'published', category: t.category, age_grade: t.ageGrade, region: 'Centro', country: 'ARG', country_id: 'argentina', country_name: 'Argentina',
      format: 'league', is_visible: true, is_active: true, logo_url: LOGO_UNION, ruleset: RULESET, ruleset_version: 1,
      sport_id: 'rugby', sport: 'rugby', sport_name: 'Rugby', gender: t.gender ?? 'masculino', priority: 0, sponsors: [], social_links: {}, display_order: 0,
      is_popular: false, is_api_managed: false, review_status: 'approved', data_source: ORIGEN, external_id: null, created_at: ahora, updated_at: ahora,
    }]);
    await insertar('tournament_seasons', [{
      id: seasonId, tournament_id: tournamentId, legacy_tournament_id: tournamentId, season_code: TEMPORADA,
      name: `${t.nombre} ${TEMPORADA}`, display_name: `${t.nombre} ${TEMPORADA}`, slug: `${t.slug}-${TEMPORADA}`,
      status: hayPendientes ? 'active' : 'completed', is_active: true, start_date: fechas[0], end_date: fechas[fechas.length - 1], format: 'league',
      ruleset: RULESET, settings: { source: ORIGEN, organiza: 'Unión Cordobesa de Rugby' }, champion_club_id: null, created_at: ahora, updated_at: ahora,
    }]);
    await actualizar(`tournaments?id=eq.${tournamentId}`, { current_season_id: seasonId, season_id: TEMPORADA, updated_at: ahora });

    const clubIds = plan.todos.map(id);
    const nombresClub = new Map((await leer(`clubs?select=id,name,logo_url&id=in.(${clubIds.join(',')})`)).map((c) => [c.id, c]));
    const parts = plan.todos.map((c) => ({ participantId: crypto.randomUUID(), entryId: crypto.randomUUID(), clubId: id(c), nombre: nombresClub.get(id(c))?.name ?? fichaDe(t, c, nombreMadre.get(c.madre)).nombre }));
    await insertar('tournament_participants', parts.map((p) => ({
      id: p.participantId, tournament_id: tournamentId, season_id: seasonId, season_entry_id: null, club_id: p.clubId,
      name: p.nombre, type: 'club', status: 'active', seed: null, group_id: null, short_code: null,
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

    const fasesEscritas = [];
    for (const [i, f] of plan.fases.entries()) {
      const faseId = crypto.randomUUID();
      const activa = t.fases ? f.nombre === t.activa : f.liga;
      const equipos = [...new Set(f.partidos.flatMap((p) => [id(p.local), id(p.visitante)]))];
      const base = {
        legs: 1, points: { win: 4, draw: 2, loss: 0 }, pointsSystem: { ...RULESET.pointsSystem }, bonus: RULESET.bonus,
        tiebreakers: TIEBREAKERS, standings: { mode: 'automatic', editable: true }, source: ORIGEN,
      };
      await insertar('tournament_phases', [{
        id: faseId, tournament_id: tournamentId, season_id: seasonId, name: f.nombre,
        phase_type: f.liga ? 'league' : 'playoff', order_index: i + 1, is_active: Boolean(activa),
        settings: f.liga ? { ...base, teamsCount: t.fases ? equipos.length : plan.todos.length }
          : { ...base, advanceCount: 1, phaseMode: 'playoff', bracketMode: 'manual',
            playoffStages: f.rondas.map((r, k) => ({ id: `playoff_stage_${k + 1}`, name: r.nombre, orderIndex: k + 1, matchCount: f.partidos.filter((p) => p.ronda === r.nombre).length })) },
        created_at: ahora, updated_at: ahora,
      }]);
      const rondaDe = new Map();
      await insertar('tournament_rounds', f.rondas.map((r, k) => {
        const rid = crypto.randomUUID(); rondaDe.set(r.nombre, rid);
        const completa = f.partidos.filter((p) => p.ronda === r.nombre).every(jugado);
        return { id: rid, phase_id: faseId, season_id: seasonId, name: r.nombre, order_index: k + 1, start_date: r.desde, end_date: r.hasta, is_completed: completa, notes: null, created_at: ahora, updated_at: ahora };
      }));
      await insertar('tournament_phase_participants', equipos.map((c) => ({
        id: crypto.randomUUID(), tournament_id: tournamentId, season_id: seasonId, phase_id: faseId,
        participant_id: participanteDe.get(c), group_id: null, status: 'active', seed: null, notes: null, created_at: ahora, updated_at: ahora,
      })));
      await insertar('matches', f.partidos.map((p) => ({
        id: crypto.randomUUID(), tournament_id: tournamentId, season_id: seasonId, sport_id: 'rugby', sport: 'rugby',
        phase_id: faseId, group_id: null, round_uuid: rondaDe.get(p.ronda), round_label: p.ronda,
        home_club_id: id(p.local), away_club_id: id(p.visitante), date_time: instanteDe(p.fecha, p.hora), venue: null,
        ...camposDePartido(p),
        points_autocalculated: true, home_base_points: 0, away_base_points: 0, home_bonus_points: 0, away_bonus_points: 0,
        points_override_reason: null, bracket_match_code: null, home_source_label: null, away_source_label: null, participant_source: null,
        live_enabled: false, lineups: { home: [], away: [] }, events: [], is_visible: true, review_status: 'approved',
        external_id: null, created_at: ahora, updated_at: ahora,
      })));
      fasesEscritas.push({ f, faseId, settings: f.liga ? { ...base, teamsCount: t.fases ? equipos.length : plan.todos.length } : null });
    }

    // Tablas oficiales y bandas, fase por fase.
    for (const { f, faseId } of fasesEscritas.filter((x) => x.f.tabla)) {
      await insertar('tournament_standings', f.tabla.map((r, i) => {
        const cid = id(r.club);
        const ofensivo = r.pts - 4 * r.pg - 2 * r.pe - r.bTantos;
        return {
          tournament_id: tournamentId, season_id: seasonId, phase_id: faseId, group_id: null, club_id: cid, season_entry_id: entradas.get(cid) ?? null,
          table_type: 'general', position: i + 1, played: r.pj, won: r.pg, drawn: r.pe, lost: r.pp, points: r.pts,
          scored: r.tf, conceded: r.tc, bonus_points: ofensivo + r.bTantos, form: null, streak: null, last_updated: ahora,
          stats: {
            status: null, team_name: nombresClub.get(cid)?.name ?? cid, team_logo: nombresClub.get(cid)?.logo_url ?? null,
            difference: r.tf - r.tc, table_type: 'general', adjustments: 0, tries_for: r.tryF, tries_against: r.tryC,
            bonus_offensive: ofensivo, bonus_defensive: r.bTantos, bonus_destrezas: 0,
            fuente: 'Tabla oficial de la Unión Cordobesa de Rugby (bonus ofensivo despejado de los puntos)', calculated_at: ahora,
          },
        };
      }));
      const [fase] = await leer(`tournament_phases?select=settings&id=eq.${faseId}`);
      const settings = { ...(fase.settings || {}) };
      settings.standings = { ...(settings.standings || {}), mode: 'fully_manual', editable: true, source: 'Tabla oficial de la Unión Cordobesa de Rugby' };
      if (f.etiquetas?.length) {
        const labels = f.etiquetas.map((e, i) => ({ id: crypto.randomUUID(), name: e.nombre, color: COLORES[i % COLORES.length], scope: 'standings' }));
        await insertar('ui_labels', labels);
        await insertar('team_labels', f.etiquetas.flatMap((e, i) => Array.from({ length: e.hasta - e.desde + 1 }, (_, k) => ({
          label_id: labels[i].id, club_id: null, position: e.desde + k, tournament_id: tournamentId, phase_id: faseId, group_id: null,
        }))));
        settings.groupLabels = labels.map((l) => ({ id: l.id, name: l.name, color: l.color, colorMode: 'manual', autoColorIndex: 0 }));
        settings.groupTags = labels.map((l) => l.name);
      }
      await actualizar(`tournament_phases?id=eq.${faseId}`, { settings });
    }
    return { tournamentId, partidos: todosPartidos.length };
  } catch (e) {
    await limpiarTorneo(tournamentId).catch((e2) => console.error(`  la limpieza de ${t.slug} falló también: ${e2.message}`));
    throw e;
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`modo: ${modo}${limpiarFlag ? ' · limpiar' : ''}${soloClave ? ` · sólo ${soloClave}` : ''}\n`);
  const torneos = TORNEOS.filter((t) => !soloClave || t.clave === soloClave);

  if (limpiarFlag) {
    const filas = await leer(`tournaments?select=id,name,slug&slug=in.(${torneos.map((t) => t.slug).join(',')})`);
    for (const f of filas) console.log(`se borra ${f.name}`);
    if (modo === 'plan') { console.log('\nmodo --plan: no se borró nada.'); return; }
    for (const f of filas) { await limpiarTorneo(f.id); console.log(`  ✓ borrado ${f.name}`); }
    return;
  }

  const cargables = torneos.filter((t) => leerPartidos(t) !== null);
  for (const t of torneos.filter((x) => !cargables.includes(x))) console.log(`⚠ ${t.nombre}: hay tabla pero falta la planilla de partidos — NO se carga.\n`);

  // Clubes madre (sólo los que existen en la base: los de ficha propia se resuelven abajo).
  const madresIds = new Set();
  for (const t of cargables) {
    for (const p of leerPartidos(t)) for (const c of [p.local, p.visitante]) madresIds.add(c.madre);
    for (const r of t.fases ? t.fases.flatMap((f) => leerTabla(t, f.tabla)) : leerTabla(t)) madresIds.add(r.club.madre);
  }
  const madresDb = new Map((await leer(`clubs?select=id,name,union_id,city,region,logo_url&id=in.(${[...madresIds].join(',')})`)).map((c) => [c.id, c]));
  const nombreMadre = new Map([...madresDb.values()].map((c) => [c.id, c.name]));

  const existentes = new Set((await leer(`tournaments?select=slug&slug=in.(${cargables.map((t) => t.slug).join(',')})`)).map((t) => t.slug));
  const planes = cargables.map((t) => armarPlan(t, nombreMadre));

  const fichas = new Map();
  for (const pl of planes) for (const c of pl.todos) { const f = fichaDe(pl.t, c, nombreMadre.get(c.madre)); fichas.set(f.id, { ...f, madre: c.madre }); }
  const idsFicha = [...fichas.keys()];
  const enBase = new Set();
  for (let i = 0; i < idsFicha.length; i += 80) for (const c of await leer(`clubs?select=id&id=in.(${idsFicha.slice(i, i + 80).join(',')})`)) enBase.add(c.id);
  const nuevas = [...fichas.values()].filter((f) => !enBase.has(f.id));
  // Las fichas "existentes" (Desarrollo, femeninos) se crean con clubes-nuevos.mjs; las de categoría salen de su club madre.
  const sinCrear = nuevas.filter((f) => f.categoria === null || f.categoria === 'femenino');
  if (sinCrear.length && planes.some((pl) => !existentes.has(pl.t.slug))) throw new Error(`faltan clubes en la base (corré clubes-nuevos.mjs): ${sinCrear.map((f) => f.id).join(', ')}`);
  const sinMadre = nuevas.filter((f) => !madresDb.has(f.madre));
  if (sinMadre.length) throw new Error(`fichas cuyo club madre no está en la base: ${sinMadre.map((f) => `${f.id} ← ${f.madre}`).join(', ')}`);
  const vinculadas = new Set();
  for (let i = 0; i < idsFicha.length; i += 80) for (const d of await leer(`club_derivatives?select=derived_club_id&derived_club_id=in.(${idsFicha.slice(i, i + 80).join(',')})`)) vinculadas.add(d.derived_club_id);
  const raices = new Map((await leer(`club_derivatives?select=base_club_id,derived_club_id&derived_club_id=in.(${[...madresIds].join(',')})`)).map((d) => [d.derived_club_id, d.base_club_id]));
  const vinculos = nuevas.map((f) => ({ ...f })).filter((f) => !vinculadas.has(f.id)).map((f) => ({ base_club_id: raices.get(f.madre) || f.madre, derived_club_id: f.id, derivative_type: 'family' }));

  console.log(`fichas: ${fichas.size} (${nuevas.length} nuevas, ${fichas.size - nuevas.length} ya existen) · vínculos nuevos: ${vinculos.length}\n`);
  for (const pl of planes) {
    const total = pl.fases.reduce((n, f) => n + f.partidos.length, 0);
    const jug = pl.fases.reduce((n, f) => n + f.partidos.filter(jugado).length, 0);
    console.log(`${existentes.has(pl.t.slug) ? '=' : '+'} ${pl.t.nombre}  (${pl.t.slug})${existentes.has(pl.t.slug) ? '  ya existe, se saltea' : ''}`);
    console.log(`    ${pl.todos.length} clubes · ${total} partidos (${jug} jugados, ${total - jug} sin jugar)`);
    for (const f of pl.fases) console.log(`    fase ${f.nombre.padEnd(32)} ${f.liga ? 'liga ' : 'llave'} ${String(f.rondas.length).padStart(2)} rondas · ${String(f.partidos.length).padStart(3)} partidos${f.tabla ? ` · tabla ${f.tabla.length}` : ''}${f.etiquetas?.length ? ` · bandas: ${f.etiquetas.map((e) => `${e.nombre} ${e.desde}-${e.hasta}`).join(', ')}` : ''}`);
    if (pl.sinEtiqueta.length) console.log(`    sin banda: ${pl.sinEtiqueta.join('; ')}`);
  }
  if (modo === 'plan') { console.log('\nmodo --plan: no se escribió una sola fila.'); return; }

  // ── Escritura ──
  const filaFicha = (f) => {
    const madre = madresDb.get(f.madre);
    return {
      id: f.id, union_id: madre.union_id ?? UNION_CORDOBESA, name: f.nombre, short_name: f.nombre, city: madre.city ?? null, region: madre.region ?? null,
      country: 'ARG', logo_url: madre.logo_url ?? null, primary_color: null, slug: f.id, is_visible: true, entity_type: 'club', sport: 'rugby', sport_id: 'rugby',
      category: f.categoria, categories: [], status: 'active', visibility: 'visible', external_id: null, created_at: ahora, updated_at: ahora,
    };
  };
  const previo = fs.existsSync(REGISTRO) ? JSON.parse(fs.readFileSync(REGISTRO, 'utf8')) : { clubes: [], vinculos: [], slugs: [] };
  await insertar('clubs', nuevas.map(filaFicha));
  await insertar('club_derivatives', vinculos.map((v) => ({ id: crypto.randomUUID(), ...v, created_at: ahora })));
  console.log(`\n✓ ${nuevas.length} fichas · ${vinculos.length} vínculos`);
  const registro = {
    clubes: [...new Set([...previo.clubes, ...nuevas.map((f) => f.id)])],
    vinculos: [...new Set([...previo.vinculos, ...vinculos.map((v) => v.derived_club_id)])],
    slugs: [...previo.slugs],
  };
  fs.writeFileSync(REGISTRO, JSON.stringify(registro, null, 2) + '\n', 'utf8');

  for (const pl of planes.filter((p) => !existentes.has(p.t.slug))) {
    const r = await escribirTorneo(pl, nombreMadre);
    registro.slugs = [...new Set([...registro.slugs, pl.t.slug])];
    fs.writeFileSync(REGISTRO, JSON.stringify(registro, null, 2) + '\n', 'utf8');
    console.log(`✓ ${pl.t.nombre}: ${r.partidos} partidos · ${pl.fases.filter((f) => f.tabla).length} tablas oficiales · ${pl.fases.reduce((n, f) => n + (f.etiquetas?.length ?? 0), 0)} etiquetas`);
  }

  const sql = ['-- Rollback de la carga de los torneos 2026 de la Unión Cordobesa (cordoba-torneos).', '-- Borra los torneos con todo lo que les cuelga y las fichas que creó la carga.', 'BEGIN;', ''];
  for (const slug of registro.slugs) {
    const t = `(SELECT id FROM public.tournaments WHERE slug = '${slug}')`;
    sql.push(`-- ${slug}`,
      `DELETE FROM public.team_labels WHERE tournament_id = ${t};`,
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
      `DELETE FROM public.tournaments WHERE slug = '${slug}';`, '');
  }
  if (registro.vinculos.length) sql.push(`DELETE FROM public.club_derivatives WHERE derived_club_id IN (${registro.vinculos.map((x) => `'${x}'`).join(', ')});`, '');
  if (registro.clubes.length) sql.push(`DELETE FROM public.clubs WHERE id IN (${registro.clubes.map((x) => `'${x}'`).join(', ')});`, '');
  sql.push('COMMIT;', '');
  fs.writeFileSync(ROLLBACK, sql.join('\n'), 'utf8');
  console.log(`\nrollback escrito: ${ROLLBACK}`);
}

main().catch((e) => { console.error('\nFALLÓ:', e.message || e); process.exit(1); });
