/**
 * Carga del Torneo Regional Norpatagónico 2026 (Unión del Sur + Alto Valle).
 *
 *   node scripts/norpatagonico/seed.mjs --plan
 *   node scripts/norpatagonico/seed.mjs --execute
 *   node scripts/norpatagonico/seed.mjs --execute --limpiar
 *
 * Torneo NUEVO: el `torneo-regional-patagonico` que ya está en la base es otro
 * (Alto Valle + Chubut, ver `datos.mjs`). Los ocho clubes ya existen.
 *
 * Dos fases: la de zonas —dos grupos de cuatro, tres fechas, los doce partidos
 * con resultado— y la Final, que quedó pendiente y entra 'postponed' sin
 * marcador. Las semifinales no se cargan porque no se jugaron: el reglamento
 * las resolvió por el resultado entre sí en el torneo de cada unión, y eso va
 * documentado en la nota de la fase, de la ronda y del partido.
 *
 * Después de esto hay que rehacer la tabla, que es persistida:
 *
 *   npx tsx src/scripts/arusa-recalcular.ts --torneo=torneo-norpatagonico
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import {
  bonusDe, CIUDAD, DIA_FINAL, FECHAS, FINAL, instanteDe, NOMBRE, PARTIDOS,
  PUNTOS, puntosBase, RULESET, TABLA_F1, TEMPORADA, TIEBREAKERS, TORNEO_SLUG,
  UNION, ZONAS,
} from './datos.mjs';

const REPO = process.cwd();
const ROLLBACK = path.join(REPO, 'NORPATAGONICO_2026_ROLLBACK.sql');
const ORIGEN = 'norpatagonico-2026';

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
    method: 'DELETE', headers: { ...H, prefer: 'return=minimal' },
  });
  if (!res.ok) throw new Error(`DELETE ${recurso}: ${res.status} ${(await res.text()).slice(0, 300)}`);
}

const ahora = new Date().toISOString();

/**
 * El canon tiene que cerrar antes de escribir una fila. Lo que de verdad
 * importa: que los cuatro marcadores despejados de la fecha 1 reproduzcan
 * EXACTA la tabla oficial publicada. Si el despeje estuviera mal, la página
 * diría otra cosa que la fuente y nadie lo notaría.
 */
function validarCanon() {
  const errores = [];
  for (const zona of ZONAS) {
    const suyos = PARTIDOS.filter((p) => p.zona === zona.clave);
    if (suyos.length !== 6) errores.push(`${zona.clave}: ${suyos.length} partidos, deberían ser 6`);
    const cruces = new Set();
    for (const p of suyos) {
      const par = [p.local, p.visitante].sort().join(' v ');
      if (cruces.has(par)) errores.push(`${zona.clave}: ${par} se repite`);
      cruces.add(par);
      for (const c of [p.local, p.visitante]) {
        if (!zona.clubes.includes(c)) errores.push(`${zona.clave}: ${c} no está en la zona`);
      }
    }
    if (cruces.size !== 6) errores.push(`${zona.clave}: ${cruces.size} cruces distintos, deberían ser 6`);
    for (const n of [1, 2, 3]) {
      const dela = suyos.filter((p) => p.fecha === n);
      if (dela.length !== 2 || new Set(dela.flatMap((p) => [p.local, p.visitante])).size !== 4) {
        errores.push(`${zona.clave} fecha ${n}: no son 2 partidos con los 4 clubes`);
      }
    }

    // La fecha 1, contra la tabla oficial.
    for (const fila of TABLA_F1[zona.clave]) {
      const p = PARTIDOS.find((x) => x.fecha === 1 && (x.local === fila.club || x.visitante === fila.club));
      const esLocal = p.local === fila.club;
      const tf = esLocal ? p.pts[0] : p.pts[1];
      const tc = esLocal ? p.pts[1] : p.pts[0];
      const pts = puntosBase(tf, tc) + bonusDe(p, esLocal ? 'local' : 'visitante');
      if (tf !== fila.tf || tc !== fila.tc || pts !== fila.pts) {
        errores.push(`${zona.clave} ${fila.club}: la tabla dice ${fila.tf}:${fila.tc} ${fila.pts}pts y el canon da ${tf}:${tc} ${pts}pts`);
      }
    }
  }
  if (errores.length) throw new Error(`el canon no cierra:\n  ${errores.join('\n  ')}`);
}

function filaDeTorneo(id) {
  return {
    id,
    union_id: UNION,
    season_id: TEMPORADA,
    name: NOMBRE,
    original_name: NOMBRE,
    slug: TORNEO_SLUG,
    status: 'published',
    category: 'Primera División',
    age_grade: null,
    region: 'Patagonia',
    country: 'Argentina',
    country_id: 'argentina',
    country_name: 'Argentina',
    format: 'groups',
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

async function limpiar(torneoId, seasonId) {
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
  await actualizar(`tournaments?id=eq.${torneoId}`, { current_season_id: null });
  await borrar(`tournament_seasons?id=eq.${seasonId}`);
  await borrar(`tournaments?id=eq.${torneoId}`);
}

/** El verde y el amarillo que ya usan las zonas del Argentino Juvenil. */
const COLORES_ZONA = ['#00a365', '#eab308'];

async function escribir(torneoId, seasonId, nombreDe) {
  await insertar('tournaments', [filaDeTorneo(torneoId)]);

  await insertar('tournament_seasons', [{
    id: seasonId,
    tournament_id: torneoId,
    legacy_tournament_id: torneoId,
    season_code: TEMPORADA,
    name: `${NOMBRE} ${TEMPORADA}`,
    display_name: `${NOMBRE} ${TEMPORADA}`,
    slug: `${TORNEO_SLUG}-${TEMPORADA}`,
    // La final nunca se jugó: la temporada no está cerrada.
    status: 'active',
    is_active: true,
    start_date: FECHAS[1],
    end_date: null,
    format: 'groups',
    ruleset: RULESET,
    settings: {
      source: ORIGEN,
      organiza: 'Unión de Rugby del Sur y Unión de Rugby de Alto Valle',
      formato: 'Dos zonas de cuatro a una rueda, semifinales Oro y final',
      nota_final: FINAL.nota,
    },
    champion_club_id: null,
    created_at: ahora,
    updated_at: ahora,
  }]);
  await actualizar(`tournaments?id=eq.${torneoId}`, {
    current_season_id: seasonId, season_id: TEMPORADA, updated_at: ahora,
  });

  // ── Fases ────────────────────────────────────────────────────────────────
  // La de zonas va como 'group_stage': la vista por zonas del detalle público
  // sólo se arma con ese phase_type.
  const faseZonas = crypto.randomUUID();
  const faseFinal = crypto.randomUUID();
  const zonas = ZONAS.map((z, i) => ({ ...z, groupId: crypto.randomUUID(), color: COLORES_ZONA[i] }));
  const groupIdDe = new Map(zonas.map((z) => [z.clave, z.groupId]));

  await insertar('tournament_phases', [
    {
      id: faseZonas, tournament_id: torneoId, season_id: seasonId,
      name: 'Fase de Zonas', phase_type: 'group_stage', order_index: 1, is_active: true,
      settings: {
        ...settingsBase(),
        teamsCount: 8,
        advanceCount: 2,
        group_names: zonas.map((z) => z.clave),
        groupTags: zonas.map((z) => z.clave),
        groupLabels: zonas.map((z, i) => ({
          id: z.groupId, name: z.clave, color: z.color, colorMode: 'manual', autoColorIndex: i,
        })),
      },
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
        nota: FINAL.nota,
      },
      created_at: ahora, updated_at: ahora,
    },
  ]);
  await insertar('tournament_groups', zonas.map((z, i) => ({
    id: z.groupId, phase_id: faseZonas, season_id: seasonId, name: z.clave, order_index: i,
  })));

  // ── Rondas ───────────────────────────────────────────────────────────────
  const rondaDe = new Map();
  const filasRondas = [1, 2, 3].map((n) => {
    const id = crypto.randomUUID();
    rondaDe.set(`Fecha ${n}`, id);
    return {
      id, phase_id: faseZonas, season_id: seasonId,
      name: `Fecha ${n}`, order_index: n, start_date: FECHAS[n], end_date: FECHAS[n],
      is_completed: true,
      notes: n === 1
        ? 'Esta fecha no se jugó como tal: los cuatro cruces son entre clubes de la misma unión y se tomaron los puntos de los torneos de cada unión. Día, sede y localía son los de ese torneo.'
        : null,
      created_at: ahora, updated_at: ahora,
    };
  });
  const rondaFinal = crypto.randomUUID();
  rondaDe.set('Final', rondaFinal);
  filasRondas.push({
    id: rondaFinal, phase_id: faseFinal, season_id: seasonId,
    name: 'Final', order_index: 1, start_date: DIA_FINAL, end_date: DIA_FINAL,
    is_completed: false, notes: FINAL.nota, created_at: ahora, updated_at: ahora,
  });
  await insertar('tournament_rounds', filasRondas);

  // ── Participantes: las TRES filas ────────────────────────────────────────
  const participantes = zonas.flatMap((z) => z.clubes.map((clubId) => ({
    participantId: crypto.randomUUID(), entryId: crypto.randomUUID(), clubId, zona: z, nombre: nombreDe.get(clubId),
  })));
  await insertar('tournament_participants', participantes.map((p) => ({
    id: p.participantId, tournament_id: torneoId, season_id: seasonId,
    season_entry_id: null, club_id: p.clubId, name: p.nombre, type: 'club',
    status: 'active', seed: null, group_id: p.zona.groupId, short_code: null,
    notes: ORIGEN, joined_at: ahora, created_at: ahora, updated_at: ahora,
  })));
  await insertar('team_season_entries', participantes.map((p) => ({
    id: p.entryId, season_id: seasonId, tournament_id: torneoId, club_id: p.clubId,
    team_id: null, source_participant_id: p.participantId, group_id: p.zona.groupId,
    zone: p.zona.clave, category: null, status: 'active', seed: null, notes: null,
    settings: { source: ORIGEN }, created_at: ahora, updated_at: ahora,
  })));
  // FK circular: el back-ref del participante a su entrada va después.
  for (const p of participantes) {
    await actualizar(`tournament_participants?id=eq.${p.participantId}`, { season_entry_id: p.entryId });
  }

  const porClub = new Map(participantes.map((p) => [p.clubId, p]));
  const filaFase = (faseId, p, groupId) => ({
    id: crypto.randomUUID(), tournament_id: torneoId, season_id: seasonId,
    phase_id: faseId, participant_id: p.participantId, group_id: groupId,
    status: 'active', seed: null, notes: null, created_at: ahora, updated_at: ahora,
  });
  await insertar('tournament_phase_participants', [
    ...participantes.map((p) => filaFase(faseZonas, p, p.zona.groupId)),
    ...[FINAL.local, FINAL.visitante].map((c) => filaFase(faseFinal, porClub.get(c), null)),
  ]);

  // ── Partidos ─────────────────────────────────────────────────────────────
  // Todas las filas con EXACTAMENTE las mismas claves: el insert masivo de
  // PostgREST rechaza el lote entero con "All object keys must match".
  const SIN_TRIES = 'Los partes no publicaron tries: el bonus ofensivo sólo se aplica donde la tabla oficial lo declaró (fecha 1). El defensivo sale del marcador.';
  const SIN_LOCALIA = 'Fecha resuelta con los resultados de los torneos de cada unión: no se publicaron día, sede ni localía. El marcador está despejado de la tabla oficial.';

  const comun = {
    tournament_id: torneoId, season_id: seasonId, sport_id: 'rugby', sport: 'rugby',
    live_enabled: false, lineups: { home: [], away: [] }, events: [],
    review_status: 'approved', external_id: null, created_at: ahora, updated_at: ahora,
  };

  const partidos = PARTIDOS.map((p) => {
    const [local, visitante] = p.pts;
    return {
      ...comun,
      id: crypto.randomUUID(),
      phase_id: faseZonas,
      group_id: groupIdDe.get(p.zona),
      round_uuid: rondaDe.get(`Fecha ${p.fecha}`),
      round_label: `Fecha ${p.fecha}`,
      home_club_id: p.local,
      away_club_id: p.visitante,
      date_time: instanteDe(p.dia ?? FECHAS[p.fecha], p.hora),
      venue: p.localiaDesconocida ? null : (p.cancha ?? CIUDAD[p.local]),
      status: 'final',
      score: { home: local, away: visitante },
      home_base_points: puntosBase(local, visitante),
      away_base_points: puntosBase(visitante, local),
      home_bonus_points: bonusDe(p, 'local'),
      away_bonus_points: bonusDe(p, 'visitante'),
      points_autocalculated: false,
      points_override_reason: p.localiaDesconocida ? SIN_LOCALIA : SIN_TRIES,
      is_visible: true,
      notes: p.localiaDesconocida ? SIN_LOCALIA : null,
      bracket_match_code: null,
      home_source_label: null,
      away_source_label: null,
      participant_source: null,
    };
  });

  partidos.push({
    ...comun,
    id: crypto.randomUUID(),
    phase_id: faseFinal,
    group_id: null,
    round_uuid: rondaFinal,
    round_label: 'Final',
    home_club_id: FINAL.local,
    away_club_id: FINAL.visitante,
    date_time: instanteDe(DIA_FINAL, '16:00'),
    venue: null,
    status: 'postponed',
    score: null,
    home_base_points: 0, away_base_points: 0, home_bonus_points: 0, away_bonus_points: 0,
    points_autocalculated: false,
    points_override_reason: FINAL.nota,
    is_visible: true,
    notes: FINAL.nota,
    bracket_match_code: 'F',
    home_source_label: '1º Zona 1',
    away_source_label: '1º Zona 2',
    participant_source: {
      home: { type: 'standing', group: 'Zona 1', position: 1 },
      away: { type: 'standing', group: 'Zona 2', position: 1 },
    },
  });

  await insertar('matches', partidos);
  return { participantes: participantes.length, rondas: filasRondas.length, partidos: partidos.length };
}

async function main() {
  console.log(`modo: ${modo}\n`);
  validarCanon();
  console.log('✓ el canon cierra: dos ruedas simples de cuatro, y la fecha 1 despejada reproduce exacta la tabla oficial\n');

  const [existente] = await leer(`tournaments?select=id,name&slug=eq.${TORNEO_SLUG}`);

  if (process.argv.includes('--limpiar')) {
    if (!existente) { console.log('no hay nada cargado que borrar.'); return; }
    console.log(`se borra ${existente.name} (${existente.id}) con su temporada`);
    if (modo === 'plan') { console.log('\nmodo --plan: no se borró nada.'); return; }
    for (const s of await leer(`tournament_seasons?select=id&tournament_id=eq.${existente.id}`)) {
      await limpiar(existente.id, s.id);
    }
    await borrar(`tournaments?id=eq.${existente.id}`).catch(() => {});
    console.log('✓ borrado');
    return;
  }

  if (existente) {
    console.log(`${existente.name} ya existe (${existente.id}): no se escribe nada.`);
    console.log('Para rehacerlo: --execute --limpiar y después --execute.');
    return;
  }

  const todos = ZONAS.flatMap((z) => z.clubes);
  const enBase = await leer(`clubs?select=id,name,logo_url&id=in.(${todos.join(',')})`);
  const nombreDe = new Map(enBase.map((c) => [c.id, c.name]));
  const faltan = todos.filter((id) => !nombreDe.has(id));
  if (faltan.length) throw new Error(`clubes que no están en la base: ${faltan.join(', ')}`);
  const sinEscudo = enBase.filter((c) => !c.logo_url).map((c) => c.id);
  if (sinEscudo.length) console.log(`aviso: sin escudo en la base → ${sinEscudo.join(', ')}\n`);

  for (const zona of ZONAS) {
    console.log(`${zona.clave}: ${zona.clubes.map((c) => nombreDe.get(c)).join(' · ')}`);
    for (const p of PARTIDOS.filter((x) => x.zona === zona.clave)) {
      console.log(`  Fecha ${p.fecha}  ${p.dia ?? FECHAS[p.fecha]}  ${nombreDe.get(p.local).padEnd(32)} ${String(p.pts[0]).padStart(3)} - ${String(p.pts[1]).padEnd(3)}  ${nombreDe.get(p.visitante)}${p.localiaDesconocida ? '   (localía no publicada)' : ''}`);
    }
    console.log('');
  }
  console.log(`Final (pendiente): ${nombreDe.get(FINAL.local)} v ${nombreDe.get(FINAL.visitante)}\n`);

  if (modo === 'plan') { console.log('modo --plan: no se escribió una sola fila.'); return; }

  const torneoId = crypto.randomUUID();
  const seasonId = crypto.randomUUID();
  let conteo;
  try {
    conteo = await escribir(torneoId, seasonId, nombreDe);
  } catch (e) {
    await limpiar(torneoId, seasonId).catch((e2) => console.error(`  la limpieza falló también: ${e2.message}`));
    throw e;
  }
  console.log(`✓ ${NOMBRE} ${TEMPORADA}: ${conteo.participantes} participantes · ${conteo.rondas} rondas · ${conteo.partidos} partidos`);

  const fases = `(SELECT id FROM public.tournament_phases WHERE season_id = '${seasonId}')`;
  fs.writeFileSync(ROLLBACK, [
    `-- Rollback de la carga del ${NOMBRE} ${TEMPORADA}.`,
    '-- No toca clubes: los ocho ya existían.',
    'BEGIN;', '',
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
    '', 'COMMIT;',
  ].join('\n') + '\n', 'utf8');
  console.log(`\nrollback escrito: ${ROLLBACK}`);
  console.log('\nfalta la tabla, que es persistida y no se rehace sola:');
  console.log(`  npx tsx src/scripts/arusa-recalcular.ts --torneo=${TORNEO_SLUG}`);
}

main().catch((e) => { console.error('\nFALLÓ:', e.message || e); process.exit(1); });
