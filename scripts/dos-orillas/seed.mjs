/**
 * Carga del Torneo Juvenil Dos Orillas (M15, M16, M17 y M19, 2012-2026) y del
 * Torneo Regional del Litoral M19 (bloques A y B) en G22.
 *
 *   node scripts/dos-orillas/seed.mjs --plan
 *   node scripts/dos-orillas/seed.mjs --execute
 *   node scripts/dos-orillas/seed.mjs --execute --limpiar   (borra los torneos, deja clubes)
 *
 * OJO con `--limpiar`: por PostgREST el DELETE de `team_season_entries` de un
 * torneo con 14 temporadas se corta por `statement_timeout` (57014) y deja el
 * torneo a medio borrar — y el seed después lo saltea por slug. Para rehacer,
 * correr las sentencias de torneos de `DOS_ORILLAS_ROLLBACK.sql` en el editor
 * SQL (con `set statement_timeout = '10min'`) y después `--execute`.
 *
 * Antes: `node scripts/dos-orillas/logos.mjs --execute`.
 * Después, la tabla, que es persistida y no se rehace sola:
 *
 *   npx tsx src/scripts/arusa-recalcular.ts --torneo=dos-orillas-juvenil-m19   (y m15, m16, m17)
 *
 * Qué escribe, en orden:
 *
 * 1. Los clubes madre que faltan (San Carlos, Querandí, Capibá, El Quillá) y el
 *    escudo de Brown de San Vicente si sigue vacío.
 * 2. Una FICHA por equipo juvenil ("Santa Fe RC M19") sin escudo propio —hereda
 *    el de la madre— y su vínculo en `club_derivatives`. La base es la RAÍZ de
 *    la familia de la madre: los consumidores resuelven la familia con un solo
 *    salto, así que si la madre ya cuelga de otra ficha (GER cuelga de "GER B",
 *    Universitario de Rosario de su rama de hockey) el vínculo va a esa raíz.
 * 3. Un torneo por división con una temporada por año y, en cada temporada, una
 *    fase de liga por cada fase del formato de ese año. Participantes en las
 *    TRES tablas (vínculo, entrada de temporada y asignación de fase: la página
 *    lee la segunda y la tabla de posiciones la tercera).
 * 4. Los dos torneos del Regional M19 con su palmarés y la 1ª fecha de 2026.
 *
 * Puntos: cuando la nota publicó los puntos del partido entre paréntesis
 * ("(5-0)"), el partido va con `points_autocalculated: false` y el bonus
 * despejado de ahí — los tries no se publican y sin ellos el motor no puede
 * dar el ofensivo. Sin paréntesis, lo calcula el motor (sólo el defensivo).
 *
 * Idempotente: un torneo cuyo slug ya está se saltea entero; clubes, fichas y
 * vínculos que ya existen no se pisan. Deja `DOS_ORILLAS_ROLLBACK.sql`.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import {
  DIVISIONES, ESCUDO_BROWN, fichaDe, instanteDe, LOGO_TRL, MADRES, ORDEN_FASES,
  reglamentoDe, RULESET_TORNEO, sistemaDe, TIEBREAKERS, PUNTOS, torneoDe, TRL, TRL_FECHA1, UNION_TORNEO,
} from './datos.mjs';

const REPO = process.cwd();
const DIR_EXTRACT = path.join(REPO, 'scripts', 'dos-orillas', 'extract');
const ROLLBACK = path.join(REPO, 'DOS_ORILLAS_ROLLBACK.sql');
const REGISTRO = path.join(REPO, 'scripts', 'dos-orillas', 'creados.json');
const ORIGEN = 'dos-orillas-seed';
const ANIO_ACTUAL = '2026';

const modo = process.argv.includes('--execute') ? 'execute'
  : process.argv.includes('--plan') ? 'plan' : null;
if (!modo) { console.error('usá --plan o --execute'); process.exit(2); }
const soloDivision = process.argv.find((a) => a.startsWith('--division='))?.split('=')[1] ?? null;

const env = { ...process.env };
for (const l of fs.readFileSync(path.join(REPO, '.env.local'), 'utf8').split(/\r?\n/)) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !env[m[1]]) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
}
const URL_BASE = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_BASE || !KEY) { console.error('Faltan credenciales en .env.local'); process.exit(1); }
const H = { apikey: KEY, authorization: `Bearer ${KEY}` };

// ── PostgREST ────────────────────────────────────────────────────────────────

async function leer(recurso) {
  const res = await fetch(encodeURI(`${URL_BASE}/rest/v1/${recurso}`), { headers: H });
  if (!res.ok) throw new Error(`GET ${recurso}: ${res.status} ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

/**
 * Insert plano CON `return=representation` y conteo de lo que vuelve: un 201
 * sin cuerpo no prueba que la fila quedó (se perdieron 1420 vínculos de
 * familia así). Por lotes de 400 para no pasar el tope del cuerpo.
 */
async function insertar(tabla, filas) {
  for (let i = 0; i < filas.length; i += 400) {
    const lote = filas.slice(i, i + 400);
    const res = await fetch(`${URL_BASE}/rest/v1/${tabla}?select=id`, {
      method: 'POST',
      headers: { ...H, 'content-type': 'application/json', prefer: 'return=representation' },
      body: JSON.stringify(lote),
    });
    if (!res.ok) throw new Error(`POST ${tabla}: ${res.status} ${(await res.text()).slice(0, 400)}`);
    const vuelto = await res.json();
    if (vuelto.length !== lote.length) throw new Error(`POST ${tabla}: mandé ${lote.length} y volvieron ${vuelto.length}`);
  }
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

async function limpiarTorneo(tournamentId) {
  const fases = await leer(`tournament_phases?select=id&tournament_id=eq.${tournamentId}`);
  const idsFase = fases.map((f) => f.id);
  await borrar(`tournament_standings?tournament_id=eq.${tournamentId}`);
  await borrar(`matches?tournament_id=eq.${tournamentId}`);
  await borrar(`tournament_phase_participants?tournament_id=eq.${tournamentId}`);
  await actualizar(`tournament_participants?tournament_id=eq.${tournamentId}`, { season_entry_id: null });
  await borrar(`team_season_entries?tournament_id=eq.${tournamentId}`);
  await borrar(`tournament_participants?tournament_id=eq.${tournamentId}`);
  for (let i = 0; i < idsFase.length; i += 50) {
    const lote = idsFase.slice(i, i + 50).join(',');
    await borrar(`tournament_rounds?phase_id=in.(${lote})`);
  }
  await borrar(`tournament_phases?tournament_id=eq.${tournamentId}`);
  await actualizar(`tournaments?id=eq.${tournamentId}`, { current_season_id: null });
  await borrar(`tournament_seasons?tournament_id=eq.${tournamentId}`);
  await borrar(`tournaments?id=eq.${tournamentId}`);
}

// ── Lectura de la extracción ─────────────────────────────────────────────────

function leerExtraccion() {
  const anios = fs.readdirSync(DIR_EXTRACT).filter((f) => /^\d{4}\.json$/.test(f)).sort();
  return anios.map((f) => JSON.parse(fs.readFileSync(path.join(DIR_EXTRACT, f), 'utf8')));
}

/** "Final Six Oro" + "Zona A" → "Final Six Oro · Zona A". */
const nombreFase = (fase, grupo) => (grupo ? `${fase} · ${grupo}` : fase);

function ordenFase(nombre) {
  const base = nombre.split(' · ')[0];
  const i = ORDEN_FASES.indexOf(base);
  return i === -1 ? ORDEN_FASES.length : i;
}

/**
 * El campeón de la temporada para `champion_club_id`: la Copa de Oro, o el
 * título de la temporada. En los años de Apertura y Clausura (2023-2024, M15 y
 * M16) va el del Clausura, que cierra el año; los dos quedan en
 * `settings.titulos`, que es donde viven también Plata, Bronce y los títulos
 * compartidos.
 */
function campeonDeTemporada(titulos) {
  const prioridad = [null, 'Oro', 'Temporada', 'Campeonato', 'Clausura', 'Apertura'];
  for (const p of prioridad) {
    const t = titulos.find((x) => (x.cup || null) === p);
    if (t) return t;
  }
  return null;
}

// ── Filas ────────────────────────────────────────────────────────────────────

const ahora = new Date().toISOString();

function filaDeClub({ id, nombre, union, ciudad, region, logo, categoria }) {
  return {
    id, union_id: union ?? null, name: nombre, short_name: nombre,
    city: ciudad ?? null, region: region ?? null, country: 'ARG',
    logo_url: logo ?? null, primary_color: null, slug: id,
    is_visible: true, entity_type: 'club', sport: 'rugby', sport_id: 'rugby',
    category: categoria ?? null, categories: [], status: 'active', visibility: 'visible',
    external_id: null, created_at: ahora, updated_at: ahora,
  };
}

function filaDeTorneo({ id, nombre, slug, ageGrade, logo, seasonCode }) {
  return {
    id, union_id: UNION_TORNEO, season_id: seasonCode, name: nombre, slug,
    original_name: nombre, status: 'published', category: 'Juvenil', age_grade: ageGrade,
    region: 'Litoral', country: 'ARG', country_id: 'argentina', country_name: 'Argentina',
    format: 'league', is_visible: true, is_active: true, logo_url: logo ?? null,
    ruleset: RULESET_TORNEO(), ruleset_version: 1, sport_id: 'rugby', sport: 'rugby', sport_name: 'Rugby',
    gender: 'masculino', priority: 0, sponsors: [], social_links: {}, display_order: 0,
    is_popular: false, is_api_managed: false, review_status: 'approved', external_id: null,
    created_at: ahora, updated_at: ahora,
  };
}

function filaDeTemporada({ id, tournamentId, anio, nombre, slug, activa, campeon, desde, hasta, extra }) {
  const sistema = sistemaDe(anio);
  return {
    id, tournament_id: tournamentId, legacy_tournament_id: tournamentId,
    season_code: anio, name: nombre, display_name: nombre, slug,
    status: activa ? 'active' : 'completed', is_active: Boolean(activa),
    start_date: desde || null, end_date: hasta || null, format: 'league',
    ruleset: reglamentoDe(sistema), settings: { source: ORIGEN, sistema, ...extra },
    champion_club_id: campeon || null, created_at: ahora, updated_at: ahora,
  };
}

/** Lo que el motor lee de la fase: el sistema de SU año, con o sin bonus. */
function settingsDeFase(equipos, sistema) {
  const r = reglamentoDe(sistema);
  return {
    legs: 1, teamsCount: equipos,
    points: r.points, pointsSystem: r.pointsSystem,
    ...(r.bonus ? { bonus: r.bonus } : {}),
    tiebreakers: TIEBREAKERS,
    standings: { mode: 'automatic', editable: true }, source: ORIGEN,
  };
}

const basePts = (a, b, s) => (a > b ? s.win : a === b ? s.draw : s.loss);

/**
 * Los puntos "(5-0)" que publicó la nota, si son compatibles con el marcador:
 * cada lado entre su base y su base + 2 (ofensivo y defensivo). La fuente tiene
 * erratas con el paréntesis dado vuelta (2021: el ganador con 0 y el perdedor
 * con 5): si invertido cierra, se invierte; si no cierra de ninguna forma, se
 * descarta y el partido lo calcula el motor.
 */
function puntosPublicados(m, s) {
  if (!Number.isInteger(m.hp) || !Number.isInteger(m.ap)) return null;
  const bl = basePts(m.hs, m.as, s); const bv = basePts(m.as, m.hs, s);
  const cierra = (h, a) => h >= bl && h <= bl + 2 && a >= bv && a <= bv + 2;
  if (cierra(m.hp, m.ap)) return { hp: m.hp, ap: m.ap, invertido: false };
  if (cierra(m.ap, m.hp)) return { hp: m.ap, ap: m.hp, invertido: true };
  return null;
}

/** Los campos de estado, marcador y puntos de un partido de la extracción. */
function camposDePartido(m, sistema) {
  const nota = [m.note].filter(Boolean);
  if (m.status === 'final') {
    const f = {
      status: 'final',
      score: { home: m.hs, away: m.as },
      points_autocalculated: true,
      home_base_points: 0, away_base_points: 0,
      home_bonus_points: 0, away_bonus_points: 0,
      points_override_reason: null,
    };
    const pts = puntosPublicados(m, sistema);
    if (pts) {
      const bl = basePts(m.hs, m.as, sistema); const bv = basePts(m.as, m.hs, sistema);
      Object.assign(f, {
        points_autocalculated: false,
        home_base_points: bl, away_base_points: bv,
        home_bonus_points: pts.hp - bl, away_bonus_points: pts.ap - bv,
        points_override_reason: pts.invertido
          ? 'La fuente publicó los puntos del partido dados vuelta; se tomaron invertidos, que es como cierran con el marcador.'
          : 'Puntos del partido publicados por la fuente; los tries no se publican y el bonus se despejó de ahí.',
      });
    }
    return { ...f, notes: nota.join(' · ') || null };
  }
  if (m.status === 'walkover') {
    // GP-PP: ganado sin jugar. Va como final sin marcador y con los puntos
    // escritos: sin marcador el motor no sabe quién ganó.
    const ganaLocal = /local/i.test(m.note || '');
    const bl = ganaLocal ? sistema.win : sistema.loss; const bv = ganaLocal ? sistema.loss : sistema.win;
    const hp = Number.isInteger(m.hp) ? m.hp : bl;
    const ap = Number.isInteger(m.ap) ? m.ap : bv;
    return {
      status: 'final', score: null, points_autocalculated: false,
      home_base_points: bl, away_base_points: bv,
      home_bonus_points: hp - bl, away_bonus_points: ap - bv,
      points_override_reason: 'W.O.: ganado por no presentación del rival.',
      notes: ['W.O.', ...nota].join(' · '),
    };
  }
  const status = m.status === 'scheduled' ? 'scheduled' : m.status === 'postponed' ? 'postponed' : 'suspended';
  return {
    status, score: null, points_autocalculated: true,
    home_base_points: 0, away_base_points: 0, home_bonus_points: 0, away_bonus_points: 0,
    points_override_reason: null, notes: nota.join(' · ') || (m.status === 'not_played' ? 'No se disputó' : null),
  };
}

// ── Plan ─────────────────────────────────────────────────────────────────────

/**
 * Arma, sin tocar la base, todo lo que la carga necesita: fichas, y por cada
 * división sus temporadas, fases, jornadas, participantes y partidos.
 */
function armarPlan(extraccion) {
  const fichas = new Map();          // id → { id, nombre, madreId, division }
  const sinMadre = new Set();
  const usar = (alias, division) => {
    try {
      const f = fichaDe(alias, division);
      if (!fichas.has(f.id)) fichas.set(f.id, { ...f, division });
      return f.id;
    } catch { sinMadre.add(`${alias} (${division})`); return null; }
  };

  const divisiones = (soloDivision ? [soloDivision] : DIVISIONES).map((division) => {
    const temporadas = [];
    for (const anio of extraccion) {
      const partidos = (anio.matches || []).filter((m) => m.division === division);
      const fasesDecl = (anio.phases || []).filter((p) => p.division === division);
      const titulos = (anio.champions || []).filter((c) => c.division === division);
      if (!partidos.length && !titulos.length) continue;

      const fases = new Map();
      const fase = (nombre) => {
        if (!fases.has(nombre)) fases.set(nombre, { nombre, equipos: new Set(), jornadas: new Map(), partidos: [] });
        return fases.get(nombre);
      };
      for (const p of fasesDecl) {
        const f = fase(nombreFase(p.phase, p.group));
        for (const t of p.teams || []) { const id = usar(t, division); if (id) f.equipos.add(id); }
      }
      // Jornadas sin número en la fuente (2012 las tiene): se agrupan por día,
      // numeradas después de la última con número, para no mezclarlas con otra.
      const sinNumero = [...new Set(partidos.filter((m) => !Number.isInteger(m.round)).map((m) => `${nombreFase(m.phase, m.group)}|${m.date}`))].sort();
      const maxRonda = Math.max(0, ...partidos.filter((m) => Number.isInteger(m.round)).map((m) => m.round));
      const rondaDe = (m) => (Number.isInteger(m.round) ? m.round
        : maxRonda + 1 + sinNumero.indexOf(`${nombreFase(m.phase, m.group)}|${m.date}`));

      for (const m of partidos) {
        const f = fase(nombreFase(m.phase, m.group));
        const local = usar(m.home, division); const visitante = usar(m.away, division);
        if (!local || !visitante) continue;
        f.equipos.add(local); f.equipos.add(visitante);
        const r = rondaDe(m);
        const j = f.jornadas.get(r) || { n: r, desde: m.date, hasta: m.date };
        if (m.date && (!j.desde || m.date < j.desde)) j.desde = m.date;
        if (m.date && (!j.hasta || m.date > j.hasta)) j.hasta = m.date;
        f.jornadas.set(r, j);
        f.partidos.push({ ...m, local, visitante, jornada: r });
      }
      // Una fase declarada sin partidos (p.ej. una copa de la que sólo se
      // publicó el campeón) no se escribe: sería una tabla vacía.
      const listaFases = [...fases.values()].filter((f) => f.partidos.length)
        .sort((a, b) => ordenFase(a.nombre) - ordenFase(b.nombre));

      const titulosResueltos = titulos.map((t) => ({ ...t, clubId: usar(t.club, division) }));
      const campeon = campeonDeTemporada(titulosResueltos);
      const fechas = partidos.map((m) => m.date).filter(Boolean).sort();
      temporadas.push({
        anio: String(anio.year),
        formato: anio.format || null,
        titulos: titulosResueltos.map((t) => ({ copa: t.cup || null, club: t.clubId, alias: t.club, nota: t.note || null })),
        campeon: campeon?.clubId ?? null,
        desde: fechas[0] ?? null, hasta: fechas[fechas.length - 1] ?? null,
        etiqueta: (anio.matches || []).find((m) => m.division === division && m.divisionLabel)?.divisionLabel ?? null,
        fases: listaFases,
        equipos: new Set(listaFases.flatMap((f) => [...f.equipos])),
      });
    }
    return { ...torneoDe(division), temporadas };
  });

  return { fichas, sinMadre, divisiones };
}

// ── Escritura ────────────────────────────────────────────────────────────────

async function escribirTemporada(tournamentId, t, s, esActual) {
  const seasonId = crypto.randomUUID();
  await insertar('tournament_seasons', [filaDeTemporada({
    id: seasonId, tournamentId, anio: s.anio,
    nombre: `${t.nombre} ${s.anio}`, slug: `${t.slug}-${s.anio}`,
    activa: esActual, campeon: s.campeon, desde: s.desde, hasta: s.hasta,
    extra: { titulos: s.titulos, formato: s.formato, ...(s.etiqueta ? { divisionLabel: s.etiqueta } : {}) },
  })]);
  if (!s.equipos.size) return { seasonId, partidos: 0 };

  // Participantes de la temporada: las tres filas, con la FK circular en dos pasos.
  const participantes = [...s.equipos].map((clubId) => ({
    participantId: crypto.randomUUID(), entryId: crypto.randomUUID(), clubId,
  }));
  const nombres = new Map((await leer(`clubs?select=id,name&id=in.(${[...s.equipos].join(',')})`)).map((c) => [c.id, c.name]));
  await insertar('tournament_participants', participantes.map((p) => ({
    id: p.participantId, tournament_id: tournamentId, season_id: seasonId, season_entry_id: null,
    club_id: p.clubId, name: nombres.get(p.clubId) || p.clubId, type: 'club', status: 'active',
    seed: null, group_id: null, short_code: null, notes: ORIGEN,
    joined_at: ahora, created_at: ahora, updated_at: ahora,
  })));
  await insertar('team_season_entries', participantes.map((p) => ({
    id: p.entryId, season_id: seasonId, tournament_id: tournamentId, club_id: p.clubId,
    team_id: null, source_participant_id: p.participantId, group_id: null, zone: null,
    category: null, status: 'active', seed: null, notes: null,
    settings: { source: ORIGEN }, created_at: ahora, updated_at: ahora,
  })));
  for (const p of participantes) {
    await actualizar(`tournament_participants?id=eq.${p.participantId}`, { season_entry_id: p.entryId });
  }
  const participanteDe = new Map(participantes.map((p) => [p.clubId, p.participantId]));

  // La fase activa de la temporada en curso: hay UNA sola por temporada (índice
  // único). Es la copa principal de la última instancia —la Final Four Oro—, no
  // la última de la lista, que es el Bronce.
  const principal = [...s.fases].reverse().find((f) => / Oro\b/.test(f.nombre)) ?? s.fases[s.fases.length - 1];
  const activa = esActual ? principal?.nombre : null;

  let nPartidos = 0;
  for (const [i, f] of s.fases.entries()) {
    const faseId = crypto.randomUUID();
    await insertar('tournament_phases', [{
      id: faseId, tournament_id: tournamentId, season_id: seasonId, name: f.nombre,
      phase_type: 'league', order_index: i + 1, is_active: f.nombre === activa,
      settings: settingsDeFase(f.equipos.size, sistemaDe(s.anio)), created_at: ahora, updated_at: ahora,
    }]);

    const jornadas = new Map();
    const filasJ = [...f.jornadas.values()].sort((a, b) => a.n - b.n).map((j) => {
      const id = crypto.randomUUID(); jornadas.set(j.n, id);
      const jugada = f.partidos.filter((p) => p.jornada === j.n).every((p) => p.status !== 'scheduled');
      return {
        id, phase_id: faseId, season_id: seasonId, name: `Fecha ${j.n}`, order_index: j.n,
        start_date: j.desde, end_date: j.hasta, is_completed: jugada, notes: null,
        created_at: ahora, updated_at: ahora,
      };
    });
    await insertar('tournament_rounds', filasJ);

    await insertar('tournament_phase_participants', [...f.equipos].map((clubId) => ({
      id: crypto.randomUUID(), tournament_id: tournamentId, season_id: seasonId, phase_id: faseId,
      participant_id: participanteDe.get(clubId), group_id: null, status: 'active',
      seed: null, notes: null, created_at: ahora, updated_at: ahora,
    })));

    await insertar('matches', f.partidos.map((m) => ({
      id: crypto.randomUUID(), tournament_id: tournamentId, season_id: seasonId,
      sport_id: 'rugby', sport: 'rugby', phase_id: faseId, group_id: null,
      round_uuid: jornadas.get(m.jornada), round_label: `Fecha ${m.jornada}`,
      home_club_id: m.local, away_club_id: m.visitante,
      date_time: instanteDe(m.date, m.time), venue: null,
      ...camposDePartido(m, sistemaDe(s.anio)),
      live_enabled: false, lineups: { home: [], away: [] }, events: [],
      is_visible: true, review_status: 'approved', external_id: null,
      created_at: ahora, updated_at: ahora,
    })));
    nPartidos += f.partidos.length;
  }
  return { seasonId, partidos: nPartidos };
}

async function crearTorneoDivision(t) {
  const tournamentId = crypto.randomUUID();
  try {
    await insertar('tournaments', [filaDeTorneo({
      id: tournamentId, nombre: t.nombre, slug: t.slug, ageGrade: t.division, seasonCode: ANIO_ACTUAL,
    })]);
    let actual = null; let partidos = 0;
    for (const s of t.temporadas) {
      const esActual = s.anio === ANIO_ACTUAL;
      const r = await escribirTemporada(tournamentId, t, s, esActual);
      partidos += r.partidos;
      if (esActual || !actual) actual = r.seasonId;
    }
    await actualizar(`tournaments?id=eq.${tournamentId}`, { current_season_id: actual });
    return { tournamentId, partidos };
  } catch (e) {
    await limpiarTorneo(tournamentId).catch((e2) => console.error(`  la limpieza de ${t.slug} falló también: ${e2.message}`));
    throw e;
  }
}

/** El Regional M19: palmarés + la 1ª fecha de 2026 como fase de liga única. */
async function crearTorneoTrl(b) {
  const tournamentId = crypto.randomUUID();
  try {
    await insertar('tournaments', [filaDeTorneo({
      id: tournamentId, nombre: b.nombre, slug: b.slug, ageGrade: 'M19', logo: LOGO_TRL, seasonCode: ANIO_ACTUAL,
    })]);
    for (const p of b.palmares) {
      await insertar('tournament_seasons', [filaDeTemporada({
        id: crypto.randomUUID(), tournamentId, anio: p.anio, nombre: `${b.nombre} ${p.anio}`,
        slug: `${b.slug}-${p.anio}`, activa: false, campeon: fichaDe(p.campeon, 'M19').id,
      })]);
    }
    const fase = {
      nombre: 'Fase de grupos',
      equipos: new Set(b.fecha1.flatMap((m) => [fichaDe(m.local, 'M19').id, fichaDe(m.visitante, 'M19').id])),
      jornadas: new Map([[1, { n: 1, desde: TRL_FECHA1, hasta: TRL_FECHA1 }]]),
      partidos: b.fecha1.map((m) => ({
        local: fichaDe(m.local, 'M19').id, visitante: fichaDe(m.visitante, 'M19').id, jornada: 1,
        date: TRL_FECHA1, time: m.hora, status: 'scheduled',
        note: `Árbitro: ${m.arbitro}${m.hora ? '' : ' · horario sin confirmar'}`,
      })),
    };
    const s = {
      anio: ANIO_ACTUAL, formato: 'Sólo publicada la 1ª fecha; zonas y resto del fixture sin publicar.',
      titulos: [], campeon: null, desde: TRL_FECHA1, hasta: TRL_FECHA1,
      fases: [fase], equipos: fase.equipos,
    };
    const r = await escribirTemporada(tournamentId, { nombre: b.nombre, slug: b.slug }, s, true);
    await actualizar(`tournaments?id=eq.${tournamentId}`, { current_season_id: r.seasonId });
    return { tournamentId, partidos: r.partidos };
  } catch (e) {
    await limpiarTorneo(tournamentId).catch((e2) => console.error(`  la limpieza de ${b.slug} falló también: ${e2.message}`));
    throw e;
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`modo: ${modo}${soloDivision ? ` · sólo ${soloDivision}` : ''}\n`);
  const slugsTodos = [...DIVISIONES.map((d) => torneoDe(d).slug), ...TRL.map((b) => b.slug)];

  if (process.argv.includes('--limpiar')) {
    const filas = await leer(`tournaments?select=id,name,slug&slug=in.(${slugsTodos.join(',')})`);
    console.log(`torneos a borrar (${filas.length}):`);
    for (const f of filas) console.log(`  - ${f.name}`);
    if (modo === 'plan') { console.log('\nmodo --plan: no se borró nada.'); return; }
    for (const f of filas) { await limpiarTorneo(f.id); console.log(`  ✓ borrado ${f.name}`); }
    return;
  }

  const extraccion = leerExtraccion();
  const plan = armarPlan(extraccion);
  // Las fichas del Regional M19 también.
  for (const b of TRL) {
    const alias = [...b.fecha1.flatMap((m) => [m.local, m.visitante]), ...b.palmares.map((p) => p.campeon)];
    for (const a of alias) {
      const f = fichaDe(a, 'M19');
      if (!plan.fichas.has(f.id)) plan.fichas.set(f.id, { ...f, division: 'M19' });
    }
  }
  if (plan.sinMadre.size) {
    throw new Error(`alias sin club madre en datos.mjs (agregalos a MADRES o COMBINADOS):\n  ${[...plan.sinMadre].sort().join('\n  ')}`);
  }

  // ── Qué existe ya ──────────────────────────────────────────────────────────
  const idsMadre = [...new Set([...plan.fichas.values()].map((f) => f.madreId))];
  const madresDb = new Map((await leer(`clubs?select=id,name,union_id,city,region,logo_url&id=in.(${idsMadre.join(',')})`)).map((c) => [c.id, c]));
  const madresNuevas = Object.values(MADRES).filter((m) => m.nuevo && idsMadre.includes(m.id) && !madresDb.has(m.id));
  const faltanMadres = idsMadre.filter((id) => !madresDb.has(id) && !madresNuevas.some((m) => m.id === id));
  if (faltanMadres.length) throw new Error(`madres que no están en la base ni se crean: ${faltanMadres.join(', ')}`);

  const idsFicha = [...plan.fichas.keys()];
  const fichasDb = new Set();
  for (let i = 0; i < idsFicha.length; i += 100) {
    for (const c of await leer(`clubs?select=id&id=in.(${idsFicha.slice(i, i + 100).join(',')})`)) fichasDb.add(c.id);
  }
  const fichasNuevas = [...plan.fichas.values()].filter((f) => !fichasDb.has(f.id));

  // Raíz de familia de cada madre (un salto) y vínculos que ya tienen las fichas.
  const raices = new Map();
  for (const d of await leer(`club_derivatives?select=base_club_id,derived_club_id&derived_club_id=in.(${idsMadre.join(',')})`)) {
    raices.set(d.derived_club_id, d.base_club_id);
  }
  const vinculadas = new Set();
  for (let i = 0; i < idsFicha.length; i += 100) {
    for (const d of await leer(`club_derivatives?select=derived_club_id&derived_club_id=in.(${idsFicha.slice(i, i + 100).join(',')})`)) vinculadas.add(d.derived_club_id);
  }
  const vinculos = [...plan.fichas.values()].filter((f) => !vinculadas.has(f.id))
    .map((f) => ({ base_club_id: raices.get(f.madreId) || f.madreId, derived_club_id: f.id, derivative_type: 'family' }));

  const torneosDb = new Set((await leer(`tournaments?select=slug&slug=in.(${slugsTodos.join(',')})`)).map((t) => t.slug));

  const brown = madresDb.get(ESCUDO_BROWN.id);
  const completarBrown = brown && !brown.logo_url && fs.existsSync(path.join(REPO, 'public', 'clubs', `${ESCUDO_BROWN.id}.png`));

  // ── Resumen ────────────────────────────────────────────────────────────────
  console.log(`clubes madre a crear (${madresNuevas.length}): ${madresNuevas.map((m) => m.nombreMadre).join(', ') || '—'}`);
  if (completarBrown) console.log('escudo a completar: Brown de San Vicente');
  console.log(`fichas juveniles: ${plan.fichas.size} (${fichasNuevas.length} nuevas)`);
  const porDiv = {};
  for (const f of fichasNuevas) porDiv[f.division] = (porDiv[f.division] || 0) + 1;
  console.log(`  por división: ${Object.entries(porDiv).map(([d, n]) => `${d} ${n}`).join(' · ')}`);
  console.log(`vínculos de familia a crear: ${vinculos.length}`);
  const reraiz = vinculos.filter((v) => raices.has(plan.fichas.get(v.derived_club_id).madreId));
  if (reraiz.length) console.log(`  (van a la raíz de la familia, no a la madre: ${[...new Set(reraiz.map((v) => `${plan.fichas.get(v.derived_club_id).madreId}→${v.base_club_id}`))].join(', ')})`);

  console.log('\ntorneos:');
  for (const t of plan.divisiones) {
    const skip = torneosDb.has(t.slug);
    const partidos = t.temporadas.reduce((n, s) => n + s.fases.reduce((k, f) => k + f.partidos.length, 0), 0);
    console.log(`  ${skip ? '=' : '+'} ${t.nombre.padEnd(36)} ${t.temporadas.length} temporadas · ${partidos} partidos${skip ? '  (ya existe, se saltea)' : ''}`);
    for (const s of t.temporadas) {
      const n = s.fases.reduce((k, f) => k + f.partidos.length, 0);
      const campeon = s.campeon ? plan.fichas.get(s.campeon)?.nombre : '—';
      console.log(`      ${s.anio}  ${String(n).padStart(3)} partidos · ${s.fases.length} fases · ${s.equipos.size} equipos · campeón: ${campeon}`);
    }
  }
  for (const b of TRL) {
    const skip = torneosDb.has(b.slug);
    console.log(`  ${skip ? '=' : '+'} ${b.nombre.padEnd(36)} ${b.palmares.length} temporadas de palmarés + 2026 (${b.fecha1.length} partidos de la 1ª fecha)${skip ? '  (ya existe)' : ''}`);
  }

  if (modo === 'plan') { console.log('\nmodo --plan: no se escribió una sola fila.'); return; }

  // ── Escritura ──────────────────────────────────────────────────────────────
  await insertar('clubs', madresNuevas.map((m) => filaDeClub({
    id: m.id, nombre: m.nombreMadre, union: m.union, ciudad: m.ciudad, region: m.region,
    logo: m.escudo ? `/clubs/${m.id}.png` : null,
  })));
  for (const m of madresNuevas) madresDb.set(m.id, { id: m.id, union_id: m.union, city: m.ciudad, region: m.region, logo_url: m.escudo ? `/clubs/${m.id}.png` : null });
  if (completarBrown) await actualizar(`clubs?id=eq.${ESCUDO_BROWN.id}&logo_url=is.null`, { logo_url: `/clubs/${ESCUDO_BROWN.id}.png`, updated_at: ahora });
  console.log(`\n✓ ${madresNuevas.length} clubes madre`);

  await insertar('clubs', fichasNuevas.map((f) => {
    const madre = madresDb.get(f.madreId);
    // El escudo se COPIA de la madre: la pantalla del torneo lee `logo_url` de
    // la ficha y no hereda por `club_derivatives` (las fichas sin escudo
    // salían con iniciales).
    return filaDeClub({ id: f.id, nombre: f.nombre, union: madre?.union_id, ciudad: madre?.city, region: madre?.region, categoria: f.division, logo: madre?.logo_url });
  }));
  console.log(`✓ ${fichasNuevas.length} fichas juveniles`);
  await insertar('club_derivatives', vinculos.map((v) => ({ id: crypto.randomUUID(), ...v, created_at: ahora })));
  console.log(`✓ ${vinculos.length} vínculos de familia`);

  // Registro acumulado de lo que crearon TODAS las corridas: una corrida que
  // falla después de los clubes deja fichas que la siguiente ya ve como
  // "existentes", y sin este archivo el rollback se olvidaría de ellas.
  const previo = fs.existsSync(REGISTRO) ? JSON.parse(fs.readFileSync(REGISTRO, 'utf8')) : { clubes: [], vinculos: [], brown: false };
  const registro = {
    clubes: [...new Set([...previo.clubes, ...madresNuevas.map((m) => m.id), ...fichasNuevas.map((f) => f.id)])],
    vinculos: [...new Set([...previo.vinculos, ...vinculos.map((v) => v.derived_club_id)])],
    brown: previo.brown || Boolean(completarBrown),
  };
  fs.writeFileSync(REGISTRO, JSON.stringify(registro, null, 2) + '\n', 'utf8');

  const creados = [];
  for (const t of plan.divisiones.filter((x) => !torneosDb.has(x.slug))) {
    const r = await crearTorneoDivision(t);
    creados.push({ nombre: t.nombre, slug: t.slug, ...r });
    console.log(`✓ ${t.nombre}: ${t.temporadas.length} temporadas · ${r.partidos} partidos`);
  }
  for (const b of TRL.filter((x) => !torneosDb.has(x.slug))) {
    const r = await crearTorneoTrl(b);
    creados.push({ nombre: b.nombre, slug: b.slug, ...r });
    console.log(`✓ ${b.nombre}: ${r.partidos} partidos`);
  }

  // ── Rollback ───────────────────────────────────────────────────────────────
  // Los torneos se borran por slug (son todos de esta carga) y los clubes por el
  // registro acumulado, así el archivo sirve aunque haya habido varias corridas.
  const sql = ['-- Rollback de la carga del Dos Orillas juvenil y del Regional del Litoral M19.',
    '-- Borra SÓLO lo que crearon las corridas de seed.mjs. Los clubes van último.', 'BEGIN;', ''];
  for (const slug of slugsTodos) {
    const t = `(SELECT id FROM public.tournaments WHERE slug = '${slug}')`;
    sql.push(`-- ${slug}`,
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
  if (registro.vinculos.length) {
    sql.push('-- Vínculos de familia');
    sql.push(`DELETE FROM public.club_derivatives WHERE derived_club_id IN (${registro.vinculos.map((id) => `'${id}'`).join(', ')});`, '');
  }
  if (registro.clubes.length) {
    sql.push('-- Fichas juveniles y clubes madre creados');
    sql.push(`DELETE FROM public.clubs WHERE id IN (${registro.clubes.map((id) => `'${id}'`).join(', ')});`, '');
  }
  if (registro.brown) sql.push(`UPDATE public.clubs SET logo_url = NULL WHERE id = '${ESCUDO_BROWN.id}';`, '');
  sql.push('COMMIT;');
  fs.writeFileSync(ROLLBACK, sql.join('\n') + '\n', 'utf8');
  console.log(`\nrollback escrito: ${ROLLBACK}`);
  console.log('\nfalta la tabla:');
  for (const c of creados) console.log(`  npx tsx src/scripts/arusa-recalcular.ts --torneo=${c.slug}`);
}

main().catch((e) => { console.error('\nFALLÓ:', e.message || e); process.exit(1); });
