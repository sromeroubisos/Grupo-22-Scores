/**
 * Carga del Sudamericano de Rugby Seven 2026 en G22: los dos torneos
 * (masculino y femenino) con grupos, fixture y cruces del domingo, más las
 * selecciones de seven que faltaban. El canon es `datos.mjs`.
 *
 *   npx tsx scripts/sudamericano-seven/seed.mjs --plan | --execute
 *   npx tsx scripts/sudamericano-seven/seed.mjs --resultados --plan | --execute [--archivo=nota.html]
 *   npx tsx scripts/sudamericano-seven/seed.mjs --limpiar --plan | --execute
 *
 * `--resultados` vuelve a leer la nota de ESPN (FUENTE_ESPN), que se actualiza
 * durante el torneo: baja los marcadores, completa los equipos de los cruces
 * del domingo con lo que la nota publique y recalcula las tablas. Se puede
 * correr las veces que haga falta: lo que ya está igual no se toca. Va con tsx
 * porque el recálculo de tabla es TypeScript con alias `@/`.
 *
 * Un participante son TRES filas encadenadas: `tournament_participants` (el
 * vínculo), `team_season_entries` (lo que lista la PÁGINA) y
 * `tournament_phase_participants` (de donde sale la TABLA). Las dos primeras se
 * apuntan por FK: participante con entrada NULL → entrada → PATCH.
 *
 * Los cruces del domingo nacen sin equipos e `is_visible=false`, con la
 * etiqueta de origen ("1º Grupo A", "Ganador P13"). No llevan reglas de avance:
 * un resultado escrito por PostgREST no las dispara, y los equipos los pone la
 * nota de ESPN en `--resultados`.
 *
 * Idempotente: un torneo cuyo slug ya está se saltea entero y un club que ya
 * existe no se pisa. Deja `SUDAMERICANO_SEVEN_ROLLBACK.sql`.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import {
  CLUBES_NUEVOS, DIAS, EQUIPOS, FUENTE_ESPN, instanteDe, LOGO_TORNEO, MARGEN_BONUS, NOMBRES, PUNTOS,
  RULESET, SEDE, TEMPORADA, TIEBREAKERS, TORNEOS, UNION_SAR,
} from './datos.mjs';

const REPO = process.cwd();
const ROLLBACK = path.join(REPO, 'SUDAMERICANO_SEVEN_ROLLBACK.sql');
const ORIGEN = 'sudamericano-seven-2026';

const modo = process.argv.includes('--execute') ? 'execute'
  : process.argv.includes('--plan') ? 'plan' : null;
if (!modo) { console.error('usá --plan o --execute'); process.exit(2); }

// A process.env también: el recálculo de tabla arma su propio cliente de ahí.
const env = process.env;
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
  await borrar(`matches?tournament_id=eq.${tournamentId}`);
  await borrar(`tournament_standings?tournament_id=eq.${tournamentId}`);
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
const COLORES_ZONA = ['#00a365', '#eab308', '#f97316', '#3b82f6'];

const externalIdDe = (t, n) => `${ORIGEN}:${t.clave}:P${n}`;

function banderaLocal(slug) {
  const archivo = path.join(REPO, 'public', 'logos', 'selecciones', `${slug}.png`);
  if (!fs.existsSync(archivo)) throw new Error(`falta la bandera public/logos/selecciones/${slug}.png`);
  return `/logos/selecciones/${slug}.png`;
}

function filaDeClub(c) {
  return {
    id: c.id, union_id: null, name: c.name, short_name: c.short,
    city: null, region: null, country: c.pais,
    logo_url: banderaLocal(c.bandera), primary_color: null,
    slug: c.id, is_visible: true, entity_type: 'club', sport: 'rugby', sport_id: 'rugby',
    category: null, categories: [], status: 'active', visibility: 'visible',
    external_id: null, created_at: ahora, updated_at: ahora,
  };
}

function filaDeTorneo(t, id) {
  return {
    id, union_id: UNION_SAR, season_id: TEMPORADA,
    name: t.nombre, display_name: t.nombre, original_name: t.nombre, slug: t.slug,
    status: 'published', category: t.genero === 'femenino' ? 'Femenino' : null,
    gender: t.genero, age_grade: 'Mayores',
    region: 'Sudamérica', country: 'Internacional', country_id: 'international', country_name: 'Internacional',
    format: 'groups', is_visible: true, is_active: true, logo_url: LOGO_TORNEO,
    ruleset: RULESET, ruleset_version: 1,
    sport_id: 'rugby', sport: 'rugby', sport_name: 'Rugby',
    priority: 0, sponsors: [], social_links: {}, display_order: 0, is_popular: false,
    is_api_managed: false, review_status: 'approved', data_source: ORIGEN, external_id: null,
    current_season_id: null, created_at: ahora, updated_at: ahora,
  };
}

function settingsDeFase({ zonas, playoff, equipos }) {
  return {
    legs: 1,
    teamsCount: equipos,
    advanceCount: 2,
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
  await insertar('tournament_seasons', [{
    id: seasonId, tournament_id: tournamentId, legacy_tournament_id: tournamentId,
    season_code: TEMPORADA, name: `${t.nombre} ${TEMPORADA}`, display_name: `${t.nombre} ${TEMPORADA}`,
    slug: `${t.slug}-${TEMPORADA}`, status: 'active', is_active: true,
    start_date: t.desde, end_date: t.hasta, format: 'groups', ruleset: RULESET,
    settings: { source: ORIGEN, venue: SEDE, modality: 'Seven', fuente: FUENTE_ESPN },
    champion_club_id: null, created_at: ahora, updated_at: ahora,
  }]);
  await actualizar(`tournaments?id=eq.${tournamentId}`, { current_season_id: seasonId });

  // ── Fases y grupos ─────────────────────────────────────────────────────────
  // 'group_stage': la vista por zonas del detalle público SÓLO se arma con ése.
  // La fase final NO lleva "puesto" en el nombre: el trigger del campeón
  // descarta las fases secundarias por regex.
  const equipos = t.zonas.reduce((n, z) => n + z.clubes.length, 0);
  const faseGrupos = crypto.randomUUID();
  const faseFinal = crypto.randomUUID();
  const zonas = t.zonas.map((z) => ({ ...z, groupId: crypto.randomUUID() }));
  const groupIdDe = new Map(zonas.map((z) => [z.nombre, z.groupId]));

  await insertar('tournament_phases', [
    {
      id: faseGrupos, tournament_id: tournamentId, season_id: seasonId,
      name: 'Fase de grupos', phase_type: 'group_stage', order_index: 1, is_active: true,
      settings: settingsDeFase({ zonas, playoff: false, equipos }), created_at: ahora, updated_at: ahora,
    },
    {
      id: faseFinal, tournament_id: tournamentId, season_id: seasonId,
      name: 'Fase final', phase_type: 'playoff', order_index: 2, is_active: false,
      settings: {
        ...settingsDeFase({ zonas: [], playoff: true, equipos }),
        playoffStages: t.rondasFinal.map((nombre, i) => ({
          id: `playoff_stage_${i + 1}`, name: nombre,
          matchCount: t.final.filter((f) => f.ronda === nombre).length, orderIndex: i + 1,
        })),
      },
      created_at: ahora, updated_at: ahora,
    },
  ]);
  await insertar('tournament_groups', zonas.map((z, i) => ({
    id: z.groupId, phase_id: faseGrupos, season_id: seasonId, name: z.nombre, order_index: i,
  })));

  // ── Rondas: un día por ronda en grupos; Zona Oro / puestos / Final ───────
  const diasDeGrupos = [...new Set(t.grupos.map((g) => g.dia))];
  const rondaGrupo = new Map();
  const rondaFinal = new Map();
  const filasRondas = [
    ...diasDeGrupos.map((dia, i) => {
      const id = crypto.randomUUID();
      rondaGrupo.set(dia, id);
      return {
        id, phase_id: faseGrupos, season_id: seasonId, name: dia === 'sabado' ? 'Día 1' : 'Día 2',
        order_index: i + 1, start_date: DIAS[dia], end_date: DIAS[dia], is_completed: false, notes: null,
        created_at: ahora, updated_at: ahora,
      };
    }),
    ...t.rondasFinal.map((nombre, i) => {
      const id = crypto.randomUUID();
      rondaFinal.set(nombre, id);
      return {
        id, phase_id: faseFinal, season_id: seasonId, name: nombre,
        order_index: i + 1, start_date: DIAS.domingo, end_date: DIAS.domingo, is_completed: false, notes: null,
        created_at: ahora, updated_at: ahora,
      };
    }),
  ];
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
    zone: p.zona.nombre, category: p.zona.copa ?? null, status: 'active', seed: null, notes: null,
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
    venue: SEDE, status: 'scheduled', score: null, category: t.genero === 'femenino' ? 'Femenino' : null,
    home_base_points: 0, away_base_points: 0, home_bonus_points: 0, away_bonus_points: 0,
    points_autocalculated: true, live_enabled: false, lineups: { home: [], away: [] },
    events: [], review_status: 'approved',
    bracket_match_code: null, home_source_label: null, away_source_label: null,
    participant_source: null, created_at: ahora, updated_at: ahora,
  };

  const partidos = t.grupos.map((g) => {
    const zona = zonas.find((z) => z.nombre === g.zona);
    return {
      ...comun, id: crypto.randomUUID(), phase_id: faseGrupos,
      group_id: groupIdDe.get(g.zona), round_uuid: rondaGrupo.get(g.dia),
      round_label: g.dia === 'sabado' ? 'Día 1' : 'Día 2',
      home_club_id: g.local, away_club_id: g.visitante,
      date_time: instanteDe(g.dia, g.hora),
      is_visible: true, notes: zona.copa ? `${zona.copa} · ${g.zona}` : g.zona,
      external_id: externalIdDe(t, g.n),
    };
  });
  for (const f of t.final) {
    partidos.push({
      ...comun, id: crypto.randomUUID(), phase_id: faseFinal, group_id: null,
      round_uuid: rondaFinal.get(f.ronda), round_label: f.ronda === f.definicion ? f.ronda : f.definicion,
      home_club_id: null, away_club_id: null,
      date_time: instanteDe('domingo', f.hora),
      is_visible: false, notes: f.definicion,
      external_id: externalIdDe(t, f.n),
      bracket_match_code: `P${f.n}`,
      home_source_label: etiquetaDeOrigen(f.local),
      away_source_label: etiquetaDeOrigen(f.visitante),
      participant_source: { home: fuenteDeOrigen(f.local), away: fuenteDeOrigen(f.visitante) },
    });
  }
  await insertar('matches', partidos);

  return {
    tournamentId, seasonId,
    conteo: { zonas: zonas.length, rondas: filasRondas.length, participantes: participantes.length, partidos: partidos.length },
  };
}

/* ── Resultados desde la nota de ESPN ─────────────────────────────────────── */

const normalizar = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

function textoDeCelda(html) {
  return html.replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, ' ').trim();
}

/**
 * Lee las cuatro tablas de la nota. Cada tabla va precedida por un epígrafe
 * ("El fixture femenino del primer día…") que dice la rama y el día; si un día
 * cambia el epígrafe, cae al orden en que se publicaron (fem sáb, masc sáb,
 * fem dom, masc dom). Cada fila: hora · local · marcador o "-" · visitante ·
 * zona. Si el marcador viene pegado a los nombres ("Chile 24", "5 Ecuador"),
 * también se lee.
 */
function leerNota(html) {
  const ORDEN = [['w', 'sabado'], ['m', 'sabado'], ['w', 'domingo'], ['m', 'domingo']];
  const filas = [];
  let desde = 0;
  let indice = 0;
  for (const m of html.matchAll(/<table[\s\S]*?<\/table>/g)) {
    const previo = textoDeCelda(html.slice(desde, m.index)).toLowerCase();
    desde = m.index + m[0].length;
    const ultimo = previo.slice(-400);
    const clave = /femenino/.test(ultimo) ? 'w' : /masculino/.test(ultimo) ? 'm' : ORDEN[indice]?.[0];
    const dia = /primer/.test(ultimo) ? 'sabado' : /segundo/.test(ultimo) ? 'domingo' : ORDEN[indice]?.[1];
    indice += 1;
    for (const tr of m[0].matchAll(/<tr[\s\S]*?<\/tr>/g)) {
      const celdas = [...tr[0].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((c) => textoDeCelda(c[1]));
      if (celdas.length < 4 || !/^\d{1,2}:\d{2}$/.test(celdas[0])) continue;
      let [hora, local, medio, visita] = celdas;
      let marcador = null;
      const enMedio = medio.match(/^(\d+)\s*[-–]\s*(\d+)$/);
      if (enMedio) marcador = [Number(enMedio[1]), Number(enMedio[2])];
      else {
        const l = local.match(/^(.*\D)\s+(\d+)$/);
        const v = visita.match(/^(\d+)\s+(\D.*)$/);
        if (l && v) { marcador = [Number(l[2]), Number(v[1])]; local = l[1]; visita = v[2]; }
      }
      filas.push({ clave, dia, hora: hora.padStart(5, '0'), local, visita, marcador, zona: celdas[4] ?? '' });
    }
  }
  return filas;
}

/** [base local, base visita, bonus local, bonus visita]. El bonus es del que pierde por <= MARGEN_BONUS. */
function puntosDe(local, visitante) {
  if (local === visitante) return [PUNTOS.draw, PUNTOS.draw, 0, 0];
  const gana = local > visitante;
  const bonus = Math.abs(local - visitante) <= MARGEN_BONUS ? PUNTOS.bonusLoss : 0;
  return gana ? [PUNTOS.win, PUNTOS.loss, 0, bonus] : [PUNTOS.loss, PUNTOS.win, bonus, 0];
}

/** Deja las reglas de puntos nuevas en los torneos ya creados (idempotente). */
async function parchearReglas() {
  for (const t of TORNEOS) {
    const [torneo] = await leer(`tournaments?select=id&slug=eq.${t.slug}`);
    if (!torneo) continue;
    await actualizar(`tournaments?id=eq.${torneo.id}`, { ruleset: RULESET, updated_at: new Date().toISOString() });
    await actualizar(`tournament_seasons?tournament_id=eq.${torneo.id}`, { ruleset: RULESET });
    const fases = await leer(`tournament_phases?select=id,settings&tournament_id=eq.${torneo.id}`);
    for (const f of fases) {
      const s = f.settings ?? {};
      await actualizar(`tournament_phases?id=eq.${f.id}`, {
        settings: {
          ...s,
          points: { win: PUNTOS.win, draw: PUNTOS.draw, loss: PUNTOS.loss },
          pointsSystem: { ...PUNTOS, allowBonusPoints: true },
          bonus: RULESET.bonus,
        },
      });
    }
  }
  console.log('reglas de puntos al día: 3/2/0 + 1 por perder por 7 o menos');
}

async function cargarResultados() {
  // `--archivo=<html>` lee una copia local de la nota (para probar el lector).
  const archivo = process.argv.find((a) => a.startsWith('--archivo='))?.slice('--archivo='.length);
  let html;
  if (archivo) html = fs.readFileSync(archivo, 'utf8');
  else {
    const res = await fetch(FUENTE_ESPN, { headers: { 'user-agent': 'Mozilla/5.0 (G22Scores/1.0)' } });
    if (!res.ok) throw new Error(`ESPN contestó ${res.status}`);
    html = await res.text();
  }
  const filasNota = leerNota(html);
  console.log(`nota de ESPN: ${filasNota.length} partidos leídos, ${filasNota.filter((f) => f.marcador).length} con marcador\n`);
  if (filasNota.length < 40) console.log('  ojo: la nota trae menos partidos que el fixture (50); revisar si cambió el formato\n');

  const { recalculatePhaseStandingsScopes } = modo === 'execute'
    ? await import('@/lib/server/recalculateStandings') : { recalculatePhaseStandingsScopes: null };

  if (modo === 'execute') await parchearReglas();
  let escritos = 0;
  for (const t of TORNEOS) {
    const [torneo] = await leer(`tournaments?select=id,current_season_id&slug=eq.${t.slug}`);
    if (!torneo) { console.log(`${t.nombre}: no está en la base (corré el alta primero)`); continue; }
    const enBase = await leer(`matches?select=id,external_id,status,score,home_club_id,away_club_id,is_visible,phase_id,home_base_points,away_base_points,home_bonus_points,away_bonus_points&tournament_id=eq.${torneo.id}`);
    const porExternal = new Map(enBase.map((m) => [m.external_id, m]));
    const canon = [
      ...t.grupos.map((g) => ({ n: g.n, dia: g.dia, hora: g.hora, texto: `${g.zona}` })),
      ...t.final.map((f) => ({ n: f.n, dia: 'domingo', hora: f.hora, texto: f.definicion })),
    ];
    const equipoDe = (nombre) => EQUIPOS[t.clave][normalizar(nombre)] ?? null;
    console.log(t.nombre);

    for (const c of canon) {
      const nota = filasNota.find((f) => f.clave === t.clave && f.dia === c.dia && f.hora === c.hora);
      const m = porExternal.get(externalIdDe(t, c.n));
      if (!nota || !m) { if (!m) console.log(`  P${c.n}: no está en la base`); continue; }

      let local = equipoDe(nota.local);
      let visita = equipoDe(nota.visita);
      let marcador = nota.marcador;
      // `--marcador=m:26=24-5`: carga a mano (clave:partido=local-visita, en el
      // orden de la nota) mientras ESPN no publique el resultado.
      if (!marcador) {
        const manual = process.argv.find((a) => a.startsWith(`--marcador=${t.clave}:${c.n}=`));
        const mm = manual?.match(/=(\d+)-(\d+)$/);
        if (mm) marcador = [Number(mm[1]), Number(mm[2])];
      }
      const cambios = {};

      if (local && visita) {
        if (m.home_club_id === visita && m.away_club_id === local) {
          // La nota dio vuelta local y visitante: se respeta la base.
          [local, visita] = [visita, local];
          if (marcador) marcador = [marcador[1], marcador[0]];
        }
        if (m.home_club_id !== local || m.away_club_id !== visita) {
          if (m.home_club_id && m.away_club_id && m.status === 'final') {
            console.log(`  ! P${c.n}: la base dice ${NOMBRES[m.home_club_id]} v ${NOMBRES[m.away_club_id]} y la nota ${nota.local} v ${nota.visita}; no se toca`);
            continue;
          }
          cambios.home_club_id = local;
          cambios.away_club_id = visita;
        }
        if (!m.is_visible) cambios.is_visible = true;
      }

      const equipoLocal = cambios.home_club_id ?? m.home_club_id;
      const equipoVisita = cambios.away_club_id ?? m.away_club_id;
      if (marcador && equipoLocal && equipoVisita) {
        const [pl, pv, bl, bv] = puntosDe(marcador[0], marcador[1]);
        const igual = m.status === 'final' && m.score?.home === marcador[0] && m.score?.away === marcador[1]
          && m.home_base_points === pl && m.away_base_points === pv
          && m.home_bonus_points === bl && m.away_bonus_points === bv;
        if (!igual) {
          Object.assign(cambios, {
            status: 'final', score: { home: marcador[0], away: marcador[1] },
            home_base_points: pl, away_base_points: pv, home_bonus_points: bl, away_bonus_points: bv,
            points_autocalculated: false, points_override_reason: 'Seven: 3 por ganar, 2 por empatar, 0 por perder; +1 por perder por 7 o menos',
          });
        }
      }

      if (!Object.keys(cambios).length) continue;
      const nl = NOMBRES[equipoLocal] ?? nota.local;
      const nv = NOMBRES[equipoVisita] ?? nota.visita;
      const tanteador = cambios.score ? ` ${cambios.score.home}-${cambios.score.away} ` : ' v ';
      console.log(`  ${cambios.score ? '✓' : '~'} P${String(c.n).padEnd(3)} ${c.hora} ${c.texto.padEnd(20)} ${nl}${tanteador}${nv}`);
      escritos += 1;
      if (modo === 'execute') await actualizar(`matches?id=eq.${m.id}`, { ...cambios, updated_at: new Date().toISOString() });
    }

    if (modo === 'execute') {
      // Sólo la de grupos: la fase final son cruces, no tiene tabla.
      const fases = await leer(`tournament_phases?select=id,name&tournament_id=eq.${torneo.id}&phase_type=eq.group_stage`);
      for (const f of fases) {
        const r = await recalculatePhaseStandingsScopes(torneo.id, f.id, 'general', torneo.current_season_id);
        if (!r.ok) console.log(`  la tabla de ${f.name} no se pudo recalcular`);
      }
    }
  }
  console.log(`\n${escritos} partido(s) ${modo === 'execute' ? 'actualizados · tablas recalculadas' : 'a actualizar (--plan: no se escribió nada)'}`);
}

async function main() {
  console.log(`modo: ${modo}\n`);

  if (process.argv.includes('--resultados')) { await cargarResultados(); return; }

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
  for (const c of clubesNuevos) banderaLocal(c.bandera);
  if (!fs.existsSync(path.join(REPO, 'public', LOGO_TORNEO))) throw new Error(`falta el logo public${LOGO_TORNEO}`);

  const referidos = new Set(TORNEOS.flatMap((t) => t.zonas.flatMap((z) => z.clubes)));
  const enBase = new Set((await leer(`clubs?select=id&id=in.(${[...referidos].join(',')})`)).map((c) => c.id));
  const faltan = [...referidos].filter((id) => !enBase.has(id) && !idsNuevos.includes(id));
  if (faltan.length) throw new Error(`selecciones referidas que no existen ni se crean: ${faltan.join(', ')}`);
  const sinNombre = [...referidos].filter((id) => !NOMBRES[id]);
  if (sinNombre.length) throw new Error(`selecciones sin nombre: ${sinNombre.join(', ')}`);
  for (const t of TORNEOS) {
    for (const g of t.grupos) {
      const z = t.zonas.find((x) => x.nombre === g.zona);
      if (!z.clubes.includes(g.local) || !z.clubes.includes(g.visitante)) throw new Error(`${t.clave} P${g.n}: un equipo no es del ${g.zona}`);
    }
  }

  const torneosDb = new Set((await leer(`tournaments?select=slug&slug=in.(${TORNEOS.map((t) => t.slug).join(',')})`)).map((t) => t.slug));
  const torneos = TORNEOS.filter((t) => !torneosDb.has(t.slug));

  console.log(`selecciones a crear (${clubesNuevos.length}):`);
  for (const c of clubesNuevos) console.log(`  + ${c.name.padEnd(28)} ${c.id}`);
  console.log('\ntorneos a crear:');
  for (const t of torneos) {
    console.log(`  + ${t.nombre} · ${t.zonas.length} grupos · ${t.grupos.length + t.final.length} partidos`);
    for (const g of t.grupos) {
      console.log(`      P${String(g.n).padEnd(3)} ${g.dia.padEnd(8)} ${g.hora}  ${g.zona}  ${NOMBRES[g.local]} vs ${NOMBRES[g.visitante]}`);
    }
    for (const f of t.final) {
      console.log(`      P${String(f.n).padEnd(3)} domingo  ${f.hora}  ${f.definicion}: ${etiquetaDeOrigen(f.local)} vs ${etiquetaDeOrigen(f.visitante)}`);
    }
  }
  if (torneosDb.size) console.log(`  (ya existen y se saltean: ${[...torneosDb].join(', ')})`);

  if (modo === 'plan') { console.log('\nmodo --plan: no se escribió una sola fila.'); return; }

  // ── Escritura ──────────────────────────────────────────────────────────────
  await insertar('clubs', clubesNuevos.map(filaDeClub));
  console.log(`\n✓ ${clubesNuevos.length} selecciones`);

  const creados = [];
  for (const t of torneos) {
    const { tournamentId, conteo } = await crearTorneo(t);
    creados.push({ nombre: t.nombre, tournamentId });
    console.log(`✓ ${t.nombre}  /tournaments/${tournamentId}`);
    console.log(`    ${conteo.zonas} grupos · ${conteo.rondas} rondas · ${conteo.participantes} participantes · ${conteo.partidos} partidos`);
  }

  // ── Rollback ───────────────────────────────────────────────────────────────
  const sql = ['-- Rollback de la carga del Sudamericano de Rugby Seven 2026.',
    '-- Borra SÓLO lo que creó esta corrida. Las selecciones van último: los torneos',
    '-- las referencian por FK.', 'BEGIN;', ''];
  for (const c of creados) {
    const fases = `(SELECT id FROM public.tournament_phases WHERE tournament_id = '${c.tournamentId}')`;
    sql.push(`-- ${c.nombre}`);
    sql.push(`DELETE FROM public.matches WHERE tournament_id = '${c.tournamentId}';`);
    sql.push(`DELETE FROM public.tournament_standings WHERE tournament_id = '${c.tournamentId}';`);
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
    sql.push('-- Selecciones creadas por esta corrida');
    sql.push(`DELETE FROM public.clubs WHERE id IN (${clubesNuevos.map((c) => `'${c.id}'`).join(', ')});`);
    sql.push('');
  }
  sql.push('COMMIT;');
  fs.writeFileSync(ROLLBACK, sql.join('\n') + '\n', 'utf8');
  console.log(`\nrollback escrito: ${ROLLBACK}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error('\nFALLÓ:', e.message || e); process.exit(1); });
