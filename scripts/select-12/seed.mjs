/**
 * Carga del Select 12 en G22: los once seleccionados M17, el torneo con el
 * cuadro de honor 2018-2025 y la edición 2026 entera —Norte en dos zonas con su
 * fase final, Sur todos contra todos— con los 16 partidos de zona y los 5 de la
 * fase final del Norte.
 *
 *   node scripts/select-12/logos.mjs --execute   (antes)
 *   node scripts/select-12/seed.mjs --plan
 *   node scripts/select-12/seed.mjs --execute
 *   node scripts/select-12/seed.mjs --execute --limpiar
 *
 * `--limpiar` borra el torneo entero y deja los clubes y los escudos.
 *
 * Un participante son TRES filas encadenadas y cada consumidor lee una
 * distinta: `tournament_participants` es el vínculo, `team_season_entries` es
 * lo que lista la PÁGINA del torneo, y `tournament_phase_participants` es de
 * donde sale la TABLA de posiciones. Ninguno avisa cuando falta el suyo.
 *
 * Todavía no se jugó nada (la nota es una previa): los 21 partidos van
 * `scheduled`. Los de zona llevan equipos; los de la fase final del Norte son
 * placeholders sin equipos y ocultos, que se completan cuando terminan las
 * zonas (las semis a mano desde la tabla, la final y el 3.er puesto solos por
 * `tournament_match_advancement_rules`).
 *
 * Idempotente: un torneo cuyo slug ya está se saltea entero y los clubes que
 * ya existen no se pisan. Deja `SELECT_12_ROLLBACK.sql`.
 *
 * Después hay que rehacer la tabla, que es persistida y no se calcula sola:
 *
 *   npx tsx src/scripts/arusa-recalcular.ts --torneo=select-12
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import {
  ASCENSO, CLUBES_NUEVOS, CLUBES_PALMARES_EXISTENTES, DIAS, instanteDe, LOGO_TORNEO, NOMBRE,
  PALMARES, PARTIDOS_ZONA, PLAYOFF_NORTE, PUNTOS, RONDAS_PLAYOFF, RULESET, SEDES, TEMPORADA,
  TIEBREAKERS, TORNEO_SLUG, ZONAS,
} from './datos.mjs';

const REPO = process.cwd();
const ROLLBACK = path.join(REPO, 'SELECT_12_ROLLBACK.sql');
const UNION_UAR = 'union-argentina-de-rugby';
const ORIGEN = 'select-12-2026';

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
const rutaColores = path.join(REPO, 'scripts', 'select-12', 'colores.json');

/** Color de zona: el mismo verde/amarillo/azul que usan las zonas del Argentino Juvenil. */
const COLORES_ZONA = ['#00a365', '#eab308', '#3b82f6'];

const nombreDeZona = (clave) => ZONAS.find((z) => z.clave === clave).nombre;
const etiquetaDeOrigen = (s) => (s.zona ? `${s.pos}º ${nombreDeZona(s.zona)}` : `${s.resultado === 'winner' ? 'Ganador' : 'Perdedor'} ${s.de}`);
const fuenteDeOrigen = (s) => (s.zona
  ? { type: 'standing', group: nombreDeZona(s.zona), position: s.pos }
  : { type: s.resultado, ref: s.de });

/**
 * Antes de escribir una fila: cada zona tiene que ser un todos contra todos
 * exacto (cada par una sola vez, nadie fuera de su zona), y las SEDES tienen
 * que existir. Un partido mal tipeado en el canon dejaría una tabla que no
 * cierra y nadie lo notaría hasta que juegue.
 */
function validarCanon() {
  const errores = [];
  for (const zona of ZONAS) {
    const partidos = PARTIDOS_ZONA.filter((p) => p.zona === zona.clave);
    const esperados = (zona.clubes.length * (zona.clubes.length - 1)) / 2;
    if (partidos.length !== esperados) errores.push(`${zona.nombre}: ${partidos.length} partidos y deberían ser ${esperados}`);
    const pares = new Set();
    for (const p of partidos) {
      if (!zona.clubes.includes(p.local) || !zona.clubes.includes(p.visitante)) errores.push(`P${p.n}: ${p.local} o ${p.visitante} no es de ${zona.nombre}`);
      const par = [p.local, p.visitante].sort().join('|');
      if (pares.has(par)) errores.push(`P${p.n}: ${p.local} v ${p.visitante} está repetido en ${zona.nombre}`);
      pares.add(par);
    }
  }
  for (const p of PARTIDOS_ZONA) if (!SEDES[p.sede]) errores.push(`P${p.n}: sede ${p.sede} inexistente`);
  const numeros = PARTIDOS_ZONA.map((p) => p.n);
  if (new Set(numeros).size !== numeros.length) errores.push('hay números de partido repetidos');
  if (errores.length) throw new Error(`el canon no cierra:\n  ${errores.join('\n  ')}`);
}

function filaDeClub(c, colores) {
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

function filaDeTorneo(id) {
  return {
    id,
    union_id: UNION_UAR,
    season_id: TEMPORADA,
    name: NOMBRE,
    slug: TORNEO_SLUG,
    original_name: 'Select 12 · Campeonato Argentino Juvenil M17 Zona Desarrollo',
    status: 'published',
    category: 'Juvenil',
    age_grade: 'M17',
    region: 'Argentina',
    country: 'ARG',
    country_id: 'argentina',
    country_name: 'Argentina',
    format: 'groups',
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

/** Lo que el gestor y el motor de posiciones leen de una fase. */
function settingsBase() {
  return {
    legs: 1,
    points: { win: PUNTOS.win, draw: PUNTOS.draw, loss: PUNTOS.loss },
    pointsSystem: { ...PUNTOS, allowBonusPoints: true },
    bonus: RULESET.bonus,
    tiebreakers: TIEBREAKERS,
    standings: { mode: 'automatic', editable: true },
    source: ORIGEN,
  };
}

/** Un torneo entero: cabecera, temporadas del palmarés y la edición 2026 con su fixture. */
async function crearTorneo() {
  const tournamentId = crypto.randomUUID();
  try {
    await insertar('tournaments', [filaDeTorneo(tournamentId)]);

    // ── Temporadas ─────────────────────────────────────────────────────────
    // Las viejas van sin fechas ni reglamento: de ellas sólo se sabe quién
    // ganó. La 2026 lleva el período real y es la activa.
    const seasonId = crypto.randomUUID();
    const filaTemporada = (s) => ({
      id: s.id, tournament_id: tournamentId, legacy_tournament_id: tournamentId,
      season_code: s.anio, name: `${NOMBRE} ${s.anio}`, display_name: `${NOMBRE} ${s.anio}`,
      slug: `${TORNEO_SLUG}-${s.anio}`,
      status: s.activa ? 'active' : 'completed', is_active: s.activa,
      start_date: s.activa ? DIAS[1] : null, end_date: s.activa ? DIAS[2] : null,
      format: 'league', ruleset: s.activa ? RULESET : {},
      settings: s.settings, champion_club_id: s.campeon ?? null,
      created_at: ahora, updated_at: ahora,
    });
    await insertar('tournament_seasons', [
      ...PALMARES.map((p) => filaTemporada({
        id: crypto.randomUUID(), anio: p.anio, activa: false, campeon: p.campeon,
        settings: {
          source: ORIGEN,
          ...(p.subcampeon ? { subcampeon: p.subcampeon } : {}),
          ...(p.coCampeon ? { coCampeon: p.coCampeon } : {}),
          ...(p.final ? { final: p.final } : {}),
          ...(p.nota ? { nota: p.nota } : {}),
        },
      })),
      filaTemporada({
        id: seasonId, anio: TEMPORADA, activa: true, campeon: null,
        settings: { source: ORIGEN, sedes: SEDES, ascenso: ASCENSO },
      }),
    ]);
    await actualizar(`tournaments?id=eq.${tournamentId}`, { current_season_id: seasonId });

    // ── Fases ──────────────────────────────────────────────────────────────
    // Norte (dos zonas) y Sur (una) son TRES grupos de la misma fase de zonas:
    // nunca se cruzan, y así las tres tablas salen en la misma pantalla. La
    // fase final del Norte es playoff aparte, inactiva (una sola activa por
    // temporada). Sin `teamsCount`, para que la página no rellene ni recorte
    // las rondas declaradas; `bracketMode: 'auto'` evita el sync de slots
    // manuales.
    const faseZonas = crypto.randomUUID();
    const fasePlayoff = crypto.randomUUID();
    const zonas = ZONAS.map((z) => ({ ...z, groupId: crypto.randomUUID() }));
    const groupIdDe = new Map(zonas.map((z) => [z.clave, z.groupId]));
    const rondasPlayoff = RONDAS_PLAYOFF.filter((r) => PLAYOFF_NORTE.some((p) => p.ronda === r));

    await insertar('tournament_phases', [
      {
        id: faseZonas, tournament_id: tournamentId, season_id: seasonId,
        name: 'Fase de Zonas', phase_type: 'group_stage', order_index: 1, is_active: true,
        settings: {
          ...settingsBase(),
          teamsCount: zonas.flatMap((z) => z.clubes).length,
          advanceCount: 2,
          group_names: zonas.map((z) => z.nombre),
          groupTags: zonas.map((z) => z.nombre),
          groupLabels: zonas.map((z, i) => ({
            id: z.groupId, name: z.nombre, color: COLORES_ZONA[i % COLORES_ZONA.length],
            colorMode: 'manual', autoColorIndex: i,
          })),
        },
        created_at: ahora, updated_at: ahora,
      },
      {
        id: fasePlayoff, tournament_id: tournamentId, season_id: seasonId,
        name: 'Norte · Fase final', phase_type: 'playoff', order_index: 2, is_active: false,
        settings: {
          ...settingsBase(),
          advanceCount: 1,
          phaseMode: 'playoff',
          bracketMode: 'auto',
          playoffStages: rondasPlayoff.map((ronda, i) => ({
            id: `playoff_stage_${i + 1}`, name: ronda, orderIndex: i + 1,
            matchCount: PLAYOFF_NORTE.filter((p) => p.ronda === ronda).length,
          })),
        },
        created_at: ahora, updated_at: ahora,
      },
    ]);
    await insertar('tournament_groups', zonas.map((z, i) => ({
      id: z.groupId, phase_id: faseZonas, season_id: seasonId, name: z.nombre, order_index: i,
    })));

    // ── Rondas ─────────────────────────────────────────────────────────────
    const rondaZona = new Map([[1, crypto.randomUUID()], [2, crypto.randomUUID()]]);
    const rondaPlayoff = new Map(rondasPlayoff.map((r) => [r, crypto.randomUUID()]));
    await insertar('tournament_rounds', [
      ...[1, 2].map((n) => ({
        id: rondaZona.get(n), phase_id: faseZonas, season_id: seasonId,
        name: `Jornada ${n}`, order_index: n, start_date: DIAS[n], end_date: DIAS[n],
        is_completed: false, notes: null, created_at: ahora, updated_at: ahora,
      })),
      ...rondasPlayoff.map((r, i) => ({
        id: rondaPlayoff.get(r), phase_id: fasePlayoff, season_id: seasonId,
        name: r, order_index: i + 1, start_date: DIAS[2], end_date: DIAS[2],
        is_completed: false, notes: null, created_at: ahora, updated_at: ahora,
      })),
    ]);

    // ── Participantes: las TRES filas ──────────────────────────────────────
    const nombreDe = new Map(CLUBES_NUEVOS.map((c) => [c.id, c.name]));
    const participantes = zonas.flatMap((z) => z.clubes.map((clubId) => ({
      participantId: crypto.randomUUID(), entryId: crypto.randomUUID(), clubId, zona: z, nombre: nombreDe.get(clubId),
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
    // FK circular: el back-ref del participante a su entrada va después.
    for (const p of participantes) {
      await actualizar(`tournament_participants?id=eq.${p.participantId}`, { season_entry_id: p.entryId });
    }
    await insertar('tournament_phase_participants', participantes.map((p) => ({
      id: crypto.randomUUID(), tournament_id: tournamentId, season_id: seasonId,
      phase_id: faseZonas, participant_id: p.participantId, group_id: p.zona.groupId,
      status: 'active', seed: null, notes: null, created_at: ahora, updated_at: ahora,
    })));

    // ── Partidos ───────────────────────────────────────────────────────────
    // Todas las filas llevan EXACTAMENTE las mismas claves: el insert masivo de
    // PostgREST rechaza el lote entero con "All object keys must match".
    const comun = {
      tournament_id: tournamentId, season_id: seasonId, sport_id: 'rugby', sport: 'rugby',
      live_enabled: false, lineups: { home: [], away: [] }, events: [],
      review_status: 'approved', external_id: null, created_at: ahora, updated_at: ahora,
      status: 'scheduled', score: null,
      home_base_points: 0, away_base_points: 0, home_bonus_points: 0, away_bonus_points: 0,
      points_autocalculated: true, points_override_reason: null,
    };

    const partidos = PARTIDOS_ZONA.map((p) => ({
      ...comun, id: crypto.randomUUID(),
      phase_id: faseZonas, group_id: groupIdDe.get(p.zona),
      round_uuid: rondaZona.get(p.jornada), round_label: `Jornada ${p.jornada}`,
      home_club_id: p.local, away_club_id: p.visitante,
      date_time: instanteDe(p.jornada, p.hora), venue: SEDES[p.sede],
      is_visible: true, notes: `P${p.n} · ${nombreDeZona(p.zona)}`,
      bracket_match_code: null, home_source_label: null, away_source_label: null, participant_source: null,
    }));

    const idPorCodigo = new Map();
    for (const p of PLAYOFF_NORTE) {
      const id = crypto.randomUUID();
      idPorCodigo.set(p.codigo, id);
      partidos.push({
        ...comun, id,
        phase_id: fasePlayoff, group_id: null,
        round_uuid: rondaPlayoff.get(p.ronda), round_label: `Norte · ${p.ronda}`,
        home_club_id: null, away_club_id: null,
        date_time: instanteDe(2, p.hora), venue: SEDES.norte,
        is_visible: false, notes: `${p.codigo} · ${p.definicion}`,
        bracket_match_code: p.codigo,
        home_source_label: etiquetaDeOrigen(p.local),
        away_source_label: etiquetaDeOrigen(p.visitante),
        participant_source: { home: fuenteDeOrigen(p.local), away: fuenteDeOrigen(p.visitante) },
      });
    }
    await insertar('matches', partidos);

    // ── Avance automático: semis → final y 3.er puesto ─────────────────────
    const reglas = PLAYOFF_NORTE.filter((p) => p.local.de).flatMap((p) => (
      [['local', 'home'], ['visitante', 'away']].map(([lado, slot]) => ({
        id: crypto.randomUUID(), phase_id: fasePlayoff,
        source_match_id: idPorCodigo.get(p[lado].de), outcome: p[lado].resultado,
        target_match_id: idPorCodigo.get(p.codigo), target_slot: slot,
        target_group_id: null, created_at: ahora, updated_at: ahora,
      }))
    ));
    await insertar('tournament_match_advancement_rules', reglas);

    return {
      tournamentId, seasonId, temporadas: PALMARES.length + 1, fases: 2, grupos: zonas.length,
      participantes: participantes.length, partidos: partidos.length, reglas: reglas.length,
    };
  } catch (e) {
    await limpiarTorneo(tournamentId).catch((e2) => {
      console.error(`  la limpieza del torneo falló también: ${e2.message}`);
    });
    throw e;
  }
}

async function main() {
  console.log(`modo: ${modo}\n`);
  validarCanon();
  console.log('✓ el canon cierra: cada zona es un todos contra todos exacto\n');

  if (process.argv.includes('--limpiar')) {
    const filas = await leer(`tournaments?select=id,name,slug&slug=eq.${TORNEO_SLUG}`);
    console.log(`torneos a borrar (${filas.length}):`);
    for (const f of filas) console.log(`  - ${f.name}`);
    if (modo === 'plan') { console.log('\nmodo --plan: no se borró nada.'); return; }
    for (const f of filas) { await limpiarTorneo(f.id); console.log(`  ✓ borrado ${f.name}`); }
    return;
  }

  // ── Qué falta ─────────────────────────────────────────────────────────────
  const ids = CLUBES_NUEVOS.map((c) => c.id);
  const existentes = new Set((await leer(`clubs?select=id&id=in.(${ids.join(',')})`)).map((c) => c.id));
  const clubesNuevos = CLUBES_NUEVOS.filter((c) => !existentes.has(c.id));

  const previos = new Set((await leer(`clubs?select=id&id=in.(${CLUBES_PALMARES_EXISTENTES.join(',')})`)).map((c) => c.id));
  const sinFicha = CLUBES_PALMARES_EXISTENTES.filter((id) => !previos.has(id));
  if (sinFicha.length) throw new Error(`clubes del palmarés que no están en la base: ${sinFicha.join(', ')}`);

  const todosLosCampeones = PALMARES.flatMap((p) => [p.campeon, p.coCampeon, p.subcampeon]).filter(Boolean);
  const conocidos = new Set([...ids, ...CLUBES_PALMARES_EXISTENTES]);
  const huerfanos = todosLosCampeones.filter((id) => !conocidos.has(id));
  if (huerfanos.length) throw new Error(`campeones sin ficha en el canon: ${[...new Set(huerfanos)].join(', ')}`);

  const unionesDb = new Set((await leer('unions?select=id&limit=1000')).map((u) => u.id));
  const sinUnion = CLUBES_NUEVOS.filter((c) => !c.union_id);
  const unionRota = CLUBES_NUEVOS.filter((c) => c.union_id && !unionesDb.has(c.union_id));
  if (unionRota.length) throw new Error(`uniones inexistentes: ${unionRota.map((c) => c.union_id).join(', ')}`);
  if (!unionesDb.has(UNION_UAR)) throw new Error(`no existe la unión ${UNION_UAR}`);

  const [torneoDb] = await leer(`tournaments?select=id,name&slug=eq.${TORNEO_SLUG}`);
  if (torneoDb) {
    console.log(`${NOMBRE} ya existe (${torneoDb.id}): no se escribe nada.`);
    console.log('Para rehacerlo: --execute --limpiar y después --execute.');
    return;
  }
  if (!fs.existsSync(rutaColores)) throw new Error('falta colores.json — corré logos.mjs --execute primero');
  const colores = JSON.parse(fs.readFileSync(rutaColores, 'utf8'));

  console.log(`clubes a crear (${clubesNuevos.length} de ${CLUBES_NUEVOS.length}):`);
  for (const c of clubesNuevos) console.log(`  + ${c.name.padEnd(22)} ${c.union_id || '— sin unión en la base —'}`);
  if (existentes.size) console.log(`  (ya existen y no se tocan: ${[...existentes].join(', ')})`);
  console.log(`\ntorneo: ${NOMBRE} · ${PALMARES.length} ediciones en el palmarés + ${TEMPORADA}`);
  console.log(`zonas: ${ZONAS.map((z) => `${z.nombre} (${z.clubes.length})`).join(' · ')}`);
  console.log(`partidos de zona: ${PARTIDOS_ZONA.length} · fase final del Norte: ${PLAYOFF_NORTE.length} (placeholders)`);
  if (sinUnion.length) {
    console.log(`\naviso: ${sinUnion.length} unión(es) no está(n) en la base y ese club queda sin vínculo:`);
    console.log(`  ${sinUnion.map((c) => c.name).join(', ')}`);
  }

  if (modo === 'plan') { console.log('\nmodo --plan: no se escribió una sola fila.'); return; }

  // ── Escritura ─────────────────────────────────────────────────────────────
  await insertar('clubs', clubesNuevos.map((c) => filaDeClub(c, colores)));
  console.log(`\n✓ ${clubesNuevos.length} clubes`);

  const r = await crearTorneo();
  console.log(`✓ ${NOMBRE}: ${r.temporadas} temporadas · ${r.fases} fases · ${r.grupos} grupos · ${r.participantes} participantes · ${r.partidos} partidos · ${r.reglas} reglas de avance`);

  // ── Rollback ──────────────────────────────────────────────────────────────
  const t = r.tournamentId;
  const fases = `(SELECT id FROM public.tournament_phases WHERE tournament_id = '${t}')`;
  const sql = [
    `-- Rollback de la carga del ${NOMBRE}.`,
    '-- Borra el torneo que creó esta corrida y los clubes nuevos. Los clubes van',
    '-- último: los partidos los referencian por FK.',
    'BEGIN;', '',
    `DELETE FROM public.tournament_match_advancement_rules WHERE phase_id IN ${fases};`,
    `DELETE FROM public.tournament_standings WHERE tournament_id = '${t}';`,
    `DELETE FROM public.matches WHERE tournament_id = '${t}';`,
    `DELETE FROM public.tournament_phase_participants WHERE tournament_id = '${t}';`,
    `UPDATE public.tournament_participants SET season_entry_id = NULL WHERE tournament_id = '${t}';`,
    `DELETE FROM public.team_season_entries WHERE tournament_id = '${t}';`,
    `DELETE FROM public.tournament_participants WHERE tournament_id = '${t}';`,
    `DELETE FROM public.tournament_rounds WHERE phase_id IN ${fases};`,
    `DELETE FROM public.tournament_groups WHERE phase_id IN ${fases};`,
    `DELETE FROM public.tournament_phases WHERE tournament_id = '${t}';`,
    `UPDATE public.tournaments SET current_season_id = NULL WHERE id = '${t}';`,
    `DELETE FROM public.tournament_seasons WHERE tournament_id = '${t}';`,
    `DELETE FROM public.tournaments WHERE id = '${t}';`,
    '',
    '-- Clubes de esta carga',
    `DELETE FROM public.clubs WHERE id IN (${CLUBES_NUEVOS.map((c) => `'${c.id}'`).join(', ')});`,
    '', 'COMMIT;',
  ];
  fs.writeFileSync(ROLLBACK, sql.join('\n') + '\n', 'utf8');
  console.log(`\nrollback escrito: ${ROLLBACK}`);

  console.log('\nfalta la tabla, que es persistida y no se rehace sola:');
  console.log(`  npx tsx src/scripts/arusa-recalcular.ts --torneo=${TORNEO_SLUG}`);
}

main().catch((e) => { console.error('\nFALLÓ:', e.message || e); process.exit(1); });
