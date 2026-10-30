/**
 * Carga del Regional Centro "A" y "B" 2026 (Unión Cordobesa + Unión Andina).
 *
 *   node scripts/regional-centro/seed.mjs --plan
 *   node scripts/regional-centro/seed.mjs --execute
 *   node scripts/regional-centro/seed.mjs --execute --limpiar
 *
 * Crea DOS torneos —uno por zona— porque así los trata la Unión: fixture,
 * final y reválida separados, y el campeón del "B" asciende al "A". Es además
 * lo que ya hace G22 con el Torneo del Interior A/B/C.
 *
 * Los doce clubes YA EXISTEN con escudo: nueve son de la Cordobesa (los mismos
 * del Súper 9 "B") y tres de la Andina. El script no crea clubes; si falta
 * alguno, aborta antes de escribir una fila.
 *
 * Cada zona queda con dos fases: la regular de cinco fechas —es la activa, la
 * que la página lee como "la tabla del torneo"— y la Final como fase playoff
 * de un solo partido, con los rivales ya puestos.
 *
 * Un participante son TRES filas encadenadas —`tournament_participants`,
 * `team_season_entries` y el back-ref— y cada consumidor lee una distinta.
 *
 * Ocho partidos entran sin marcador (ver `datos.mjs`): van 'scheduled' pero
 * con `is_visible` en true igual, para que el fixture se vea completo y el
 * hueco se note. El día que aparezcan los resultados se completan en
 * `datos.mjs` y se vuelve a correr con --limpiar.
 *
 * Después de esto hay que rehacer la tabla, que es persistida:
 *
 *   npx tsx src/scripts/arusa-recalcular.ts --torneo=regional-centro-a
 *   npx tsx src/scripts/arusa-recalcular.ts --torneo=regional-centro-b
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import {
  bonusDefensivo, CIUDAD, DIA_FINAL, FECHAS, HORA, instanteDe, partidosDe,
  PUNTOS, puntosBase, RULESET, TEMPORADA, TIEBREAKERS, UNION_CORDOBESA, ZONAS,
} from './datos.mjs';

const REPO = process.cwd();
const ROLLBACK = path.join(REPO, 'REGIONAL_CENTRO_2026_ROLLBACK.sql');
const ORIGEN = 'regional-centro-2026';

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

const ahora = new Date().toISOString();

/**
 * El canon tiene que cerrar antes de escribir una fila: si el fixture no es un
 * todos contra todos perfecto, el que está mal es el canon y no la base.
 */
function validarCanon() {
  const errores = [];
  for (const zona of ZONAS) {
    const regulares = zona.partidos;
    if (regulares.length !== 15) errores.push(`${zona.nombre}: ${regulares.length} partidos de fase regular, deberían ser 15`);

    // Cada par se juega una sola vez y cada club juega una vez por fecha.
    const cruces = new Set();
    for (const p of regulares) {
      const par = [p.local, p.visitante].sort().join(' v ');
      if (cruces.has(par)) errores.push(`${zona.nombre}: ${par} se repite`);
      cruces.add(par);
      for (const c of [p.local, p.visitante]) {
        if (!zona.clubes.includes(c)) errores.push(`${zona.nombre}: ${c} no está en la zona`);
      }
    }
    if (cruces.size !== 15) errores.push(`${zona.nombre}: ${cruces.size} cruces distintos, deberían ser 15`);

    for (const n of [1, 2, 3, 4, 5]) {
      const dela = regulares.filter((p) => p.fecha === n);
      const clubes = new Set(dela.flatMap((p) => [p.local, p.visitante]));
      if (dela.length !== 3 || clubes.size !== 6) {
        errores.push(`${zona.nombre} fecha ${n}: ${dela.length} partidos y ${clubes.size} clubes, deberían ser 3 y 6`);
      }
    }

    // La final la juegan dos de la zona, y el campeón es el que la ganó.
    const { local, visitante, pts } = zona.final;
    if (!zona.clubes.includes(local) || !zona.clubes.includes(visitante)) {
      errores.push(`${zona.nombre}: la final la juega alguien de afuera de la zona`);
    }
    const ganador = pts[0] > pts[1] ? local : visitante;
    if (ganador !== zona.campeon) errores.push(`${zona.nombre}: la final la ganó ${ganador} y el campeón declarado es ${zona.campeon}`);
    if ((ganador === local ? visitante : local) !== zona.subcampeon) {
      errores.push(`${zona.nombre}: el subcampeón declarado no es el que perdió la final`);
    }
  }
  if (errores.length) throw new Error(`el canon no cierra:\n  ${errores.join('\n  ')}`);
}

function filaDeTorneo({ id, zona }) {
  return {
    id,
    union_id: UNION_CORDOBESA,
    season_id: TEMPORADA,
    name: zona.nombre,
    original_name: zona.nombre,
    slug: zona.slug,
    status: 'published',
    category: 'Primera División',
    age_grade: null,
    region: 'Centro',
    country: 'Argentina',
    country_id: 'argentina',
    country_name: 'Argentina',
    format: 'league',
    is_visible: true,
    is_active: true,
    logo_url: null,
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
    data_source: ORIGEN,
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

/**
 * Deshace una zona entera: la temporada con todo lo que le cuelga y el torneo.
 * Sirve de limpieza compensatoria si una corrida falla a la mitad —media
 * docena de tablas encadenadas no entran en una transacción sobre PostgREST—
 * y de `--limpiar`.
 */
async function limpiarZona(torneoId, seasonId) {
  const fases = await leer(`tournament_phases?select=id&season_id=eq.${seasonId}`);
  const idsFase = fases.map((f) => f.id);
  if (idsFase.length) await borrar(`tournament_match_advancement_rules?phase_id=in.(${idsFase.join(',')})`);
  await borrar(`tournament_standings?season_id=eq.${seasonId}`);
  await borrar(`matches?season_id=eq.${seasonId}`);
  await borrar(`tournament_phase_participants?season_id=eq.${seasonId}`);
  await actualizar(`tournament_participants?season_id=eq.${seasonId}`, { season_entry_id: null });
  await borrar(`team_season_entries?season_id=eq.${seasonId}`);
  await borrar(`tournament_participants?season_id=eq.${seasonId}`);
  if (idsFase.length) {
    await borrar(`tournament_rounds?phase_id=in.(${idsFase.join(',')})`);
    await borrar(`tournament_groups?phase_id=in.(${idsFase.join(',')})`);
  }
  await borrar(`tournament_phases?season_id=eq.${seasonId}`);
  // El torneo suelta la temporada antes de que ésta se borre: `current_season_id` es FK.
  await actualizar(`tournaments?id=eq.${torneoId}`, { current_season_id: null });
  await borrar(`tournament_seasons?id=eq.${seasonId}`);
  await borrar(`tournaments?id=eq.${torneoId}`);
}

/** Escribe una zona entera. El que llama deshace si algo falla. */
async function escribirZona(zona, torneoId, seasonId, nombreDe) {
  await insertar('tournaments', [filaDeTorneo({ id: torneoId, zona })]);

  await insertar('tournament_seasons', [{
    id: seasonId,
    tournament_id: torneoId,
    legacy_tournament_id: torneoId,
    season_code: TEMPORADA,
    name: `${zona.nombre} ${TEMPORADA}`,
    display_name: `${zona.nombre} ${TEMPORADA}`,
    slug: `${zona.slug}-${TEMPORADA}`,
    status: 'completed',
    is_active: true,
    start_date: FECHAS[1],
    end_date: DIA_FINAL,
    format: 'league',
    ruleset: RULESET,
    settings: {
      source: ORIGEN,
      organiza: 'Unión Cordobesa de Rugby y Unión Andina de Rugby',
      formato: 'Todos contra todos a una rueda y final entre el 1º y el 2º',
    },
    champion_club_id: zona.campeon,
    created_at: ahora,
    updated_at: ahora,
  }]);
  await actualizar(`tournaments?id=eq.${torneoId}`, {
    current_season_id: seasonId, season_id: TEMPORADA, updated_at: ahora,
  });

  // ── Fases ────────────────────────────────────────────────────────────────
  // La regular va activa: es la que eligen los que leen "la tabla del torneo".
  // La Final NO declara `teamsCount`: con él, la página calcula cuántas rondas
  // debería tener un cuadro de ese tamaño y rellena las que no existen.
  const faseRegular = crypto.randomUUID();
  const faseFinal = crypto.randomUUID();
  await insertar('tournament_phases', [
    {
      id: faseRegular, tournament_id: torneoId, season_id: seasonId,
      name: 'Fase Regular', phase_type: 'league', order_index: 1, is_active: true,
      settings: { ...settingsBase(), teamsCount: zona.clubes.length, advanceCount: 2 },
      created_at: ahora, updated_at: ahora,
    },
    {
      id: faseFinal, tournament_id: torneoId, season_id: seasonId,
      name: 'Final', phase_type: 'playoff', order_index: 2, is_active: false,
      settings: {
        ...settingsBase(),
        advanceCount: 1,
        phaseMode: 'playoff',
        bracketMode: 'auto',
        playoffStages: [{ id: 'playoff_stage_1', name: 'Final', orderIndex: 1, matchCount: 1 }],
      },
      created_at: ahora, updated_at: ahora,
    },
  ]);

  // ── Rondas ───────────────────────────────────────────────────────────────
  const rondaDe = new Map();
  const filasRondas = [1, 2, 3, 4, 5].map((n) => {
    const id = crypto.randomUUID();
    rondaDe.set(`Fecha ${n}`, id);
    return {
      id, phase_id: faseRegular, season_id: seasonId,
      name: `Fecha ${n}`, order_index: n, start_date: FECHAS[n], end_date: FECHAS[n],
      is_completed: true, notes: null, created_at: ahora, updated_at: ahora,
    };
  });
  const rondaFinal = crypto.randomUUID();
  rondaDe.set('Final', rondaFinal);
  filasRondas.push({
    id: rondaFinal, phase_id: faseFinal, season_id: seasonId,
    name: 'Final', order_index: 1, start_date: DIA_FINAL, end_date: DIA_FINAL,
    is_completed: true, notes: null, created_at: ahora, updated_at: ahora,
  });
  await insertar('tournament_rounds', filasRondas);

  // ── Participantes: las TRES filas ────────────────────────────────────────
  const participantes = zona.clubes.map((clubId) => ({
    participantId: crypto.randomUUID(), entryId: crypto.randomUUID(), clubId, nombre: nombreDe.get(clubId),
  }));
  await insertar('tournament_participants', participantes.map((p) => ({
    id: p.participantId, tournament_id: torneoId, season_id: seasonId,
    season_entry_id: null, club_id: p.clubId, name: p.nombre, type: 'club',
    status: 'active', seed: null, group_id: null, short_code: null,
    notes: ORIGEN, joined_at: ahora, created_at: ahora, updated_at: ahora,
  })));
  await insertar('team_season_entries', participantes.map((p) => ({
    id: p.entryId, season_id: seasonId, tournament_id: torneoId, club_id: p.clubId,
    team_id: null, source_participant_id: p.participantId, group_id: null,
    zone: null, category: null, status: 'active', seed: null, notes: null,
    settings: { source: ORIGEN }, created_at: ahora, updated_at: ahora,
  })));
  // FK circular: el back-ref del participante a su entrada va después.
  for (const p of participantes) {
    await actualizar(`tournament_participants?id=eq.${p.participantId}`, { season_entry_id: p.entryId });
  }

  const porClub = new Map(participantes.map((p) => [p.clubId, p]));
  const filaFase = (faseId, p) => ({
    id: crypto.randomUUID(), tournament_id: torneoId, season_id: seasonId,
    phase_id: faseId, participant_id: p.participantId, group_id: null,
    status: 'active', seed: null, notes: null, created_at: ahora, updated_at: ahora,
  });
  await insertar('tournament_phase_participants', [
    ...participantes.map((p) => filaFase(faseRegular, p)),
    ...[zona.final.local, zona.final.visitante].map((c) => filaFase(faseFinal, porClub.get(c))),
  ]);

  // ── Partidos ─────────────────────────────────────────────────────────────
  // Todas las filas llevan EXACTAMENTE las mismas claves: el insert masivo de
  // PostgREST rechaza el lote entero con "All object keys must match".
  const SIN_TRIES = 'Los partes de la Unión no publicaron tries: el bonus ofensivo no se pudo reconstruir y va en cero. El defensivo sale del marcador.';
  const SIN_MARCADOR = 'El partido se jugó, pero ningún parte publicó el marcador.';

  const partidos = partidosDe(zona).map((p) => {
    const jugado = Array.isArray(p.pts);
    const [local, visitante] = jugado ? p.pts : [null, null];
    return {
      tournament_id: torneoId, season_id: seasonId, sport_id: 'rugby', sport: 'rugby',
      live_enabled: false, lineups: { home: [], away: [] }, events: [],
      review_status: 'approved', external_id: null, created_at: ahora, updated_at: ahora,
      id: crypto.randomUUID(),
      phase_id: p.esFinal ? faseFinal : faseRegular,
      group_id: null,
      round_uuid: rondaDe.get(p.ronda),
      round_label: p.ronda,
      home_club_id: p.local,
      away_club_id: p.visitante,
      date_time: instanteDe(p.dia, p.hora ?? HORA),
      venue: p.cancha ?? CIUDAD[p.local],
      status: jugado ? 'final' : 'scheduled',
      score: jugado ? { home: local, away: visitante } : null,
      home_base_points: jugado ? puntosBase(local, visitante) : 0,
      away_base_points: jugado ? puntosBase(visitante, local) : 0,
      home_bonus_points: jugado ? bonusDefensivo(local, visitante) : 0,
      away_bonus_points: jugado ? bonusDefensivo(visitante, local) : 0,
      points_autocalculated: false,
      points_override_reason: jugado ? SIN_TRIES : SIN_MARCADOR,
      is_visible: true,
      notes: jugado ? `Fuente: ${p.fuente}` : `${SIN_MARCADOR}${p.gano ? ` Ganó el ${p.gano}.` : ''}`,
      bracket_match_code: p.esFinal ? 'F' : null,
      home_source_label: p.esFinal ? '1º Fase Regular' : null,
      away_source_label: p.esFinal ? '2º Fase Regular' : null,
      participant_source: p.esFinal
        ? { home: { type: 'standing', position: 1 }, away: { type: 'standing', position: 2 } }
        : null,
    };
  });
  await insertar('matches', partidos);

  return {
    partidos: partidos.length,
    conResultado: partidos.filter((p) => p.status === 'final').length,
    participantes: participantes.length,
    rondas: filasRondas.length,
  };
}

function escribirRollback(creados) {
  const sql = [
    '-- Rollback de la carga del Regional Centro "A" y "B" 2026.',
    '-- Borra las dos temporadas con todo lo que les cuelga y los dos torneos.',
    '-- No toca clubes: los doce ya existían antes de esta carga.',
    'BEGIN;', '',
  ];
  for (const { zona, torneoId, seasonId } of creados) {
    const fases = `(SELECT id FROM public.tournament_phases WHERE season_id = '${seasonId}')`;
    sql.push(
      `-- ${zona.nombre}`,
      `DELETE FROM public.tournament_match_advancement_rules WHERE phase_id IN ${fases};`,
      `DELETE FROM public.tournament_standings WHERE season_id = '${seasonId}';`,
      `DELETE FROM public.matches WHERE season_id = '${seasonId}';`,
      `DELETE FROM public.tournament_phase_participants WHERE season_id = '${seasonId}';`,
      `UPDATE public.tournament_participants SET season_entry_id = NULL WHERE season_id = '${seasonId}';`,
      `DELETE FROM public.team_season_entries WHERE season_id = '${seasonId}';`,
      `DELETE FROM public.tournament_participants WHERE season_id = '${seasonId}';`,
      `DELETE FROM public.tournament_rounds WHERE phase_id IN ${fases};`,
      `DELETE FROM public.tournament_groups WHERE phase_id IN ${fases};`,
      `DELETE FROM public.tournament_phases WHERE season_id = '${seasonId}';`,
      `UPDATE public.tournaments SET current_season_id = NULL WHERE id = '${torneoId}';`,
      `DELETE FROM public.tournament_seasons WHERE id = '${seasonId}';`,
      `DELETE FROM public.tournaments WHERE id = '${torneoId}';`,
      '',
    );
  }
  sql.push('COMMIT;');
  fs.writeFileSync(ROLLBACK, sql.join('\n') + '\n', 'utf8');
  return ROLLBACK;
}

async function main() {
  console.log(`modo: ${modo}\n`);
  validarCanon();
  console.log('✓ el canon cierra: dos ruedas simples de seis, sin cruces repetidos, y la final da el campeón declarado\n');

  const existentes = await leer(`tournaments?select=id,name,slug&slug=in.(${ZONAS.map((z) => z.slug).join(',')})`);

  if (process.argv.includes('--limpiar')) {
    if (!existentes.length) { console.log('no hay nada cargado que borrar.'); return; }
    for (const t of existentes) console.log(`se borra ${t.name} (${t.id}) con su temporada`);
    if (modo === 'plan') { console.log('\nmodo --plan: no se borró nada.'); return; }
    for (const t of existentes) {
      const temporadas = await leer(`tournament_seasons?select=id&tournament_id=eq.${t.id}`);
      for (const s of temporadas) await limpiarZona(t.id, s.id);
      // Un torneo que quedó sin temporadas igual se borra.
      await borrar(`tournaments?id=eq.${t.id}`).catch(() => {});
    }
    console.log('✓ borrado');
    return;
  }

  if (existentes.length) {
    console.log(`ya existen: ${existentes.map((t) => t.name).join(', ')}. No se escribe nada.`);
    console.log('Para rehacerlo: --execute --limpiar y después --execute.');
    return;
  }

  // ── Qué falta ─────────────────────────────────────────────────────────────
  const todos = [...new Set(ZONAS.flatMap((z) => z.clubes))];
  const enBase = await leer(`clubs?select=id,name,logo_url&id=in.(${todos.join(',')})`);
  const nombreDe = new Map(enBase.map((c) => [c.id, c.name]));
  const faltan = todos.filter((id) => !nombreDe.has(id));
  if (faltan.length) throw new Error(`clubes que no están en la base: ${faltan.join(', ')}`);
  const sinEscudo = enBase.filter((c) => !c.logo_url).map((c) => c.id);
  if (sinEscudo.length) console.log(`aviso: sin escudo en la base → ${sinEscudo.join(', ')}\n`);

  // ── Plan ──────────────────────────────────────────────────────────────────
  for (const zona of ZONAS) {
    const ps = partidosDe(zona);
    const sin = ps.filter((p) => !Array.isArray(p.pts));
    console.log(`${zona.nombre} · ${zona.clubes.length} clubes · ${ps.length} partidos (${ps.length - sin.length} con resultado, ${sin.length} sin)`);
    for (const p of ps) {
      const marcador = Array.isArray(p.pts) ? `${String(p.pts[0]).padStart(2)} - ${String(p.pts[1]).padEnd(2)}` : ' ?  -  ? ';
      console.log(`  ${p.ronda.padEnd(8)} ${p.dia}  ${(nombreDe.get(p.local) ?? p.local).padEnd(22)} ${marcador}  ${nombreDe.get(p.visitante) ?? p.visitante}`);
    }
    console.log(`  campeón: ${nombreDe.get(zona.campeon)}\n`);
  }

  if (modo === 'plan') { console.log('modo --plan: no se escribió una sola fila.'); return; }

  // ── Escritura ─────────────────────────────────────────────────────────────
  const creados = [];
  try {
    for (const zona of ZONAS) {
      const torneoId = crypto.randomUUID();
      const seasonId = crypto.randomUUID();
      const conteo = await escribirZona(zona, torneoId, seasonId, nombreDe);
      creados.push({ zona, torneoId, seasonId });
      console.log(`✓ ${zona.nombre}: ${conteo.participantes} participantes · ${conteo.rondas} rondas · ${conteo.partidos} partidos (${conteo.conResultado} con resultado)`);
    }
  } catch (e) {
    for (const c of creados.reverse()) {
      await limpiarZona(c.torneoId, c.seasonId).catch((e2) => console.error(`  la limpieza de ${c.zona.nombre} falló también: ${e2.message}`));
    }
    throw e;
  }

  console.log(`\nrollback escrito: ${escribirRollback(creados)}`);
  console.log('\nfalta la tabla, que es persistida y no se rehace sola:');
  for (const zona of ZONAS) console.log(`  npx tsx src/scripts/arusa-recalcular.ts --torneo=${zona.slug}`);
}

main().catch((e) => { console.error('\nFALLÓ:', e.message || e); process.exit(1); });
