/**
 * Carga del Torneo Nacional Desarrollo M16 en G22: los nueve seleccionados, los
 * cuatro torneos de la competencia y el cuadro de honor 2016-2026, con el
 * fixture completo de la edición 2026 del Desarrollo Sur.
 *
 *   node scripts/m16-desarrollo/seed.mjs --plan
 *   node scripts/m16-desarrollo/seed.mjs --execute
 *   node scripts/m16-desarrollo/seed.mjs --execute --limpiar
 *
 * Los escudos tienen que estar ANTES: `node scripts/m16-desarrollo/logos.mjs
 * --execute` los deja en `public/`. Escribir la ruta de un archivo que no está
 * no falla, sólo deja el escudo roto.
 *
 * Un participante son TRES filas encadenadas y cada consumidor lee una
 * distinta: `tournament_participants` es el vínculo, `team_season_entries` es
 * lo que lista la PÁGINA del torneo, y `tournament_phase_participants` es de
 * donde sale la TABLA de posiciones. Ninguno avisa cuando falta el suyo:
 * degradan en silencio.
 *
 * Los seis partidos van con resultado y con `points_autocalculated: false`. El
 * parte oficial no publicó tries, así que el bonus va escrito a mano —despejado
 * de los totales publicados, ver `datos.mjs`—: dejándoselo al motor la tabla
 * daría 12/8/4/0 en vez de 14/9/5/1.
 *
 * Idempotente: un torneo cuyo slug ya está en la base se saltea entero, y los
 * clubes que ya existen no se pisan. Deja `M16_DESARROLLO_ROLLBACK.sql`.
 *
 * Después de esto hay que rehacer la tabla, que es persistida y no se calcula
 * sola:
 *
 *   npx tsx src/scripts/arusa-recalcular.ts --torneo=m16-desarrollo-sur
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import {
  CAMPEON_2026, CLUBES, DIAS, instanteDe, LOGO_TORNEO, PARTIDOS, PLANTEL_2026,
  PUNTOS, RULESET, SEDE, TIEBREAKERS, TORNEOS,
} from './datos.mjs';

const REPO = process.cwd();
const ROLLBACK = path.join(REPO, 'M16_DESARROLLO_ROLLBACK.sql');
const UNION_UAR = 'union-argentina-de-rugby';
const ORIGEN = 'm16-desarrollo-2026';

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

const ahora = new Date().toISOString();
const rutaColores = path.join(REPO, 'scripts', 'm16-desarrollo', 'colores.json');
const colores = fs.existsSync(rutaColores) ? JSON.parse(fs.readFileSync(rutaColores, 'utf8')) : {};

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

function filaDeTorneo({ id, nombre, slug, seasonCode }) {
  return {
    id,
    union_id: UNION_UAR,
    season_id: seasonCode,
    name: nombre,
    slug,
    original_name: nombre,
    status: 'published',
    category: 'Juvenil',
    age_grade: 'M16',
    region: 'Argentina',
    country: 'ARG',
    country_id: 'argentina',
    country_name: 'Argentina',
    format: 'league',
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

function filaDeTemporada({ id, tournamentId, seasonCode, nombre, slug, activa, campeon, desde, hasta }) {
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
    settings: { source: ORIGEN },
    champion_club_id: campeon || null,
    created_at: ahora,
    updated_at: ahora,
  };
}

/** Lo que el gestor y el motor de posiciones leen de una fase de liga. */
function settingsDeFase() {
  return {
    legs: 1,
    teamsCount: PLANTEL_2026.length,
    points: { win: PUNTOS.win, draw: PUNTOS.draw, loss: PUNTOS.loss },
    pointsSystem: { ...PUNTOS, allowBonusPoints: true },
    bonus: RULESET.bonus,
    tiebreakers: TIEBREAKERS,
    standings: { mode: 'automatic', editable: true },
    source: ORIGEN,
  };
}

/**
 * Escribe la edición 2026 del Desarrollo Sur entera —fase, jornadas,
 * participantes y partidos con resultado— sobre un torneo y una temporada que
 * ya existen. Si algo falla en el medio, el que llama deshace: media docena de
 * tablas encadenadas no entran en una transacción sobre PostgREST.
 */
async function escribirFixture2026(tournamentId, seasonId) {
  const faseId = crypto.randomUUID();
  await insertar('tournament_phases', [{
    id: faseId, tournament_id: tournamentId, season_id: seasonId,
    name: 'Fase Regular', phase_type: 'league', order_index: 1, is_active: true,
    settings: settingsDeFase(), created_at: ahora, updated_at: ahora,
  }]);

  // ── Jornadas ─────────────────────────────────────────────────────────────
  // Las dos caen en el MISMO fin de semana y aun así son dos jornadas de
  // verdad: los cuatro seleccionados repiten entre una y otra, que es lo que
  // distingue un torneo concentrado de una fecha partida al medio por el
  // importador. Cada una guarda su período REAL —un día— y no el nominal.
  const jornadas = new Map();
  const filasJornadas = Object.entries(DIAS).map(([n, dia]) => {
    const id = crypto.randomUUID();
    jornadas.set(Number(n), id);
    return {
      id, phase_id: faseId, season_id: seasonId,
      name: `Jornada ${n}`, order_index: Number(n),
      start_date: dia, end_date: dia, is_completed: true, notes: null,
      created_at: ahora, updated_at: ahora,
    };
  });
  await insertar('tournament_rounds', filasJornadas);

  // ── Participantes: las TRES filas ────────────────────────────────────────
  const participantes = PLANTEL_2026.map((clubId) => ({
    participantId: crypto.randomUUID(),
    entryId: crypto.randomUUID(),
    clubId,
    nombre: CLUBES.find((c) => c.id === clubId).name,
  }));
  await insertar('tournament_participants', participantes.map((p) => ({
    id: p.participantId, tournament_id: tournamentId, season_id: seasonId,
    season_entry_id: null, club_id: p.clubId, name: p.nombre, type: 'club',
    status: 'active', seed: null, group_id: null, short_code: null,
    notes: ORIGEN, joined_at: ahora, created_at: ahora, updated_at: ahora,
  })));
  await insertar('team_season_entries', participantes.map((p) => ({
    id: p.entryId, season_id: seasonId, tournament_id: tournamentId, club_id: p.clubId,
    team_id: null, source_participant_id: p.participantId, group_id: null,
    zone: null, category: null, status: 'active', seed: null, notes: null,
    settings: { source: ORIGEN }, created_at: ahora, updated_at: ahora,
  })));
  // FK circular: el back-ref del participante a su entrada va después.
  for (const p of participantes) {
    await actualizar(`tournament_participants?id=eq.${p.participantId}`, { season_entry_id: p.entryId });
  }
  await insertar('tournament_phase_participants', participantes.map((p) => ({
    id: crypto.randomUUID(), tournament_id: tournamentId, season_id: seasonId,
    phase_id: faseId, participant_id: p.participantId, group_id: null,
    status: 'active', seed: null, notes: null, created_at: ahora, updated_at: ahora,
  })));

  // ── Partidos ─────────────────────────────────────────────────────────────
  // `points_autocalculated: false` con los base y los bonus escritos: el parte
  // no publicó tries y el motor, sin ellos, no puede repartir el bonus
  // ofensivo. Ver la cuenta en `datos.mjs`.
  const partidos = PARTIDOS.map((p) => ({
    id: crypto.randomUUID(),
    tournament_id: tournamentId, season_id: seasonId, sport_id: 'rugby', sport: 'rugby',
    phase_id: faseId, group_id: null,
    round_uuid: jornadas.get(p.jornada), round_label: `Jornada ${p.jornada}`,
    home_club_id: p.local, away_club_id: p.visitante,
    date_time: instanteDe(p.jornada, p.orden),
    venue: SEDE,
    status: 'final',
    score: { home: p.ptsLocal, away: p.ptsVisitante },
    home_base_points: p.ptsLocal > p.ptsVisitante ? PUNTOS.win : p.ptsLocal === p.ptsVisitante ? PUNTOS.draw : PUNTOS.loss,
    away_base_points: p.ptsVisitante > p.ptsLocal ? PUNTOS.win : p.ptsLocal === p.ptsVisitante ? PUNTOS.draw : PUNTOS.loss,
    home_bonus_points: p.bonusLocal,
    away_bonus_points: p.bonusVisitante,
    points_autocalculated: false,
    points_override_reason: 'El parte oficial no publicó tries: el bonus se despejó de los puntos finales de la tabla.',
    live_enabled: false,
    lineups: { home: [], away: [] },
    events: [],
    is_visible: true,
    review_status: 'approved',
    external_id: null,
    created_at: ahora, updated_at: ahora,
  }));
  await insertar('matches', partidos);

  return { fases: 1, jornadas: filasJornadas.length, participantes: participantes.length, partidos: partidos.length };
}

/** Un torneo entero: cabecera, temporadas del palmarés y —si toca— el fixture. */
async function crearTorneo(t) {
  const tournamentId = crypto.randomUUID();
  try {
    await insertar('tournaments', [filaDeTorneo({
      id: tournamentId, nombre: t.nombre, slug: t.slug, seasonCode: t.seasonActual,
    })]);

    // Las temporadas viejas van sin fechas ni reglamento: de ellas sólo se sabe
    // quién ganó. La del año corriente lleva el período real del certamen.
    const temporadas = t.palmares.map((p) => ({
      id: crypto.randomUUID(),
      anio: p.anio,
      campeon: p.campeon,
      activa: p.anio === t.seasonActual,
    }));
    if (t.conFixture) {
      temporadas.push({ id: crypto.randomUUID(), anio: t.seasonActual, campeon: CAMPEON_2026, activa: true });
    }

    await insertar('tournament_seasons', temporadas.map((s) => filaDeTemporada({
      id: s.id, tournamentId, seasonCode: s.anio,
      nombre: `${t.nombre} ${s.anio}`, slug: `${t.slug}-${s.anio}`,
      activa: s.activa, campeon: s.campeon,
      desde: s.activa && t.conFixture ? DIAS[1] : null,
      hasta: s.activa && t.conFixture ? DIAS[2] : null,
    })));

    const actual = temporadas.find((s) => s.anio === t.seasonActual) ?? temporadas[temporadas.length - 1];
    await actualizar(`tournaments?id=eq.${tournamentId}`, { current_season_id: actual.id });

    const conteo = t.conFixture
      ? await escribirFixture2026(tournamentId, actual.id)
      : { fases: 0, jornadas: 0, participantes: 0, partidos: 0 };

    return { tournamentId, seasonId: actual.id, temporadas: temporadas.length, conteo };
  } catch (e) {
    await limpiarTorneo(tournamentId).catch((e2) => {
      console.error(`  la limpieza de ${t.slug} falló también: ${e2.message}`);
    });
    throw e;
  }
}

async function main() {
  console.log(`modo: ${modo}\n`);

  // `--limpiar` borra los cuatro torneos de esta carga y deja los clubes: sirve
  // para rehacer el fixture sin tocar los escudos ni las nueve fichas.
  if (process.argv.includes('--limpiar')) {
    const slugs = TORNEOS.map((t) => t.slug);
    const filas = await leer(`tournaments?select=id,name,slug&slug=in.(${slugs.join(',')})`);
    console.log(`torneos a borrar (${filas.length}):`);
    for (const f of filas) console.log(`  - ${f.name}`);
    if (modo === 'plan') { console.log('\nmodo --plan: no se borró nada.'); return; }
    for (const f of filas) { await limpiarTorneo(f.id); console.log(`  ✓ borrado ${f.name}`); }
    return;
  }

  // ── Qué falta ─────────────────────────────────────────────────────────────
  const ids = CLUBES.map((c) => c.id);
  const existentes = new Set((await leer(`clubs?select=id&id=in.(${ids.join(',')})`)).map((c) => c.id));
  const clubesNuevos = CLUBES.filter((c) => !existentes.has(c.id));

  const slugs = TORNEOS.map((t) => t.slug);
  const torneosDb = new Set((await leer(`tournaments?select=slug&slug=in.(${slugs.join(',')})`)).map((t) => t.slug));
  const porCrear = TORNEOS.filter((t) => !torneosDb.has(t.slug));

  const unionesDb = new Set((await leer('unions?select=id&limit=500')).map((u) => u.id));
  const sinUnion = CLUBES.filter((c) => !c.union_id);
  const unionRota = CLUBES.filter((c) => c.union_id && !unionesDb.has(c.union_id));
  if (unionRota.length) throw new Error(`uniones inexistentes: ${unionRota.map((c) => c.union_id).join(', ')}`);

  console.log(`clubes a crear (${clubesNuevos.length} de ${CLUBES.length}):`);
  for (const c of clubesNuevos) console.log(`  + ${c.name.padEnd(22)} ${c.union_id || '— sin unión en la base —'}`);
  if (existentes.size) console.log(`  (ya existen y no se tocan: ${[...existentes].join(', ')})`);

  console.log('\ntorneos a crear:');
  for (const t of porCrear) {
    const ediciones = t.palmares.length + (t.conFixture ? 1 : 0);
    console.log(`  + ${t.nombre.padEnd(48)} ${ediciones} ediciones${t.conFixture ? ` · fixture ${t.seasonActual}: ${PARTIDOS.length} partidos` : ''}`);
  }
  if (torneosDb.size) console.log(`  (ya existen y se saltean: ${[...torneosDb].join(', ')})`);

  if (sinUnion.length) {
    console.log(`\naviso: ${sinUnion.length} unión(es) no está(n) en la base y ese club queda sin vínculo:`);
    console.log(`  ${sinUnion.map((c) => c.name).join(', ')}`);
  }

  if (modo === 'plan') { console.log('\nmodo --plan: no se escribió una sola fila.'); return; }

  // ── Escritura ─────────────────────────────────────────────────────────────
  await insertar('clubs', clubesNuevos.map(filaDeClub));
  console.log(`\n✓ ${clubesNuevos.length} clubes`);

  const creados = [];
  for (const t of porCrear) {
    const { tournamentId, seasonId, temporadas, conteo } = await crearTorneo(t);
    creados.push({ nombre: t.nombre, slug: t.slug, tournamentId, seasonId });
    console.log(`✓ ${t.nombre}`);
    console.log(`    ${temporadas} temporadas${conteo.partidos ? ` · ${conteo.fases} fase · ${conteo.jornadas} jornadas · ${conteo.participantes} participantes · ${conteo.partidos} partidos` : ' (sólo palmarés)'}`);
  }

  // ── Rollback ──────────────────────────────────────────────────────────────
  const sql = ['-- Rollback de la carga del Torneo Nacional Desarrollo M16.',
    '-- Borra SÓLO lo que creó esta corrida. Los clubes van último: los torneos',
    '-- los referencian por FK.', 'BEGIN;', ''];
  for (const c of creados) {
    sql.push(`-- ${c.nombre}`);
    sql.push(`DELETE FROM public.tournament_standings WHERE tournament_id = '${c.tournamentId}';`);
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

  const conFixture = creados.find((c) => c.slug === TORNEOS[0].slug);
  if (conFixture) {
    console.log('\nfalta la tabla, que es persistida y no se rehace sola:');
    console.log(`  npx tsx src/scripts/arusa-recalcular.ts --torneo=${conFixture.slug}`);
  }
}

main().catch((e) => { console.error('\nFALLÓ:', e.message || e); process.exit(1); });
