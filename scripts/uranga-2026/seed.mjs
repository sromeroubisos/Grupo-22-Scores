/**
 * Carga del Torneo Juvenil M15 "Eduardo Uranga" 2026 (Paraná, 24 y 25/10) en G22:
 * los 32 equipos con su ficha M15 (y la variante Blanco/Negro/Rojo/Azul de los cinco
 * clubes que mandan dos), ocho zonas con sus 48 partidos jugados y las cuatro copas
 * del domingo (Oro, Plata, Bronce, Cristal) con su cuadro y el avance automático.
 *
 *   node scripts/uranga-2026/seed.mjs --plan
 *   node scripts/uranga-2026/seed.mjs --execute
 *   node scripts/uranga-2026/seed.mjs --verificar      (después de recalcular)
 *   node scripts/uranga-2026/seed.mjs --execute --limpiar
 *
 * `--limpiar` borra el torneo entero y deja los clubes.
 *
 * Un participante son TRES filas encadenadas (`tournament_participants`,
 * `team_season_entries`, `tournament_phase_participants`) y cada consumidor lee una
 * distinta: ninguna avisa cuando falta la suya.
 *
 * Las copas siguen el molde del constructor de playoff: UNA fase de playoff con una
 * copa por `tournament_groups`, rondas con `group_id` y partidos con
 * `bracket_match_code`. Los cuartos llevan equipos (salen de las tablas de zona);
 * semis y finales son placeholders ocultos que completa `resolveMatchAdvancement`
 * cuando se cargan los resultados.
 *
 * Después hay que rehacer la tabla, que es persistida y no se calcula sola:
 *
 *   npx tsx src/scripts/arusa-recalcular.ts --torneo=torneo-juvenil-m15-eduardo-uranga
 *   node scripts/uranga-2026/seed.mjs --verificar
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import {
  BASES_NUEVAS, COPAS, DIAS, EQUIPOS, instanteDe, LOGO_TORNEO, NOMBRE, ORIGINAL, PARTIDOS_ZONA,
  PUNTOS, RULESET, SEDE, TEMPORADA, TIEBREAKERS, TORNEO_SLUG, UNION, ZONAS,
} from './datos.mjs';

const REPO = process.cwd();
const ROLLBACK = path.join(REPO, 'URANGA_2026_ROLLBACK.sql');
const ORIGEN = 'uranga-2026';

const modo = process.argv.includes('--execute') ? 'execute'
  : process.argv.includes('--plan') ? 'plan'
    : process.argv.includes('--verificar') ? 'verificar' : null;
if (!modo) { console.error('usá --plan, --execute o --verificar'); process.exit(2); }

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

/** Deshace un torneo a medio escribir (o entero). */
async function limpiarTorneo(tournamentId) {
  const fases = await leer(`tournament_phases?select=id&tournament_id=eq.${tournamentId}`);
  const idsFase = fases.map((f) => f.id);
  if (idsFase.length) await borrar(`tournament_match_advancement_rules?phase_id=in.(${idsFase.join(',')})`);
  const idsEtiqueta = [...new Set((await leer(`team_labels?select=label_id&tournament_id=eq.${tournamentId}&limit=1000`)).map((l) => l.label_id))];
  await borrar(`team_labels?tournament_id=eq.${tournamentId}`);
  if (idsEtiqueta.length) await borrar(`ui_labels?id=in.(${idsEtiqueta.join(',')})`);
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
const COLORES_ZONA = ['#00a365', '#eab308', '#3b82f6', '#ef4444', '#8b5cf6', '#14b8a6', '#f97316', '#64748b'];
const ficha = (k) => EQUIPOS[k].ficha;
const nombreZona = (z) => `Zona ${z}`;
const SEDE_CANCHA = (n) => `${SEDE} · Cancha ${n}`;

// ── Validación del canon ─────────────────────────────────────────────────────

/** Tabla de una zona a partir de sus partidos: 4 por ganado, 2 por empate, 1 por perdido. */
function tablaDeZona(zona) {
  const filas = new Map(ZONAS.find((z) => z.clave === zona).tabla.map((r) => [r[0], { pj: 0, pg: 0, pe: 0, pp: 0, pf: 0, pc: 0, pts: 0 }]));
  for (const [, , l, hl, hv, v] of PARTIDOS_ZONA.filter((p) => p[0] === zona)) {
    const a = filas.get(l); const b = filas.get(v);
    a.pj++; b.pj++; a.pf += hl; a.pc += hv; b.pf += hv; b.pc += hl;
    if (hl > hv) { a.pg++; a.pts += PUNTOS.win; b.pp++; b.pts += PUNTOS.loss; }
    else if (hl < hv) { b.pg++; b.pts += PUNTOS.win; a.pp++; a.pts += PUNTOS.loss; }
    else { a.pe++; b.pe++; a.pts += PUNTOS.draw; b.pts += PUNTOS.draw; }
  }
  return filas;
}

/**
 * Antes de escribir una fila: cada zona es un todos contra todos exacto, los partidos
 * suman la tabla OFICIAL publicada, y los cuartos de cada copa son los clasificados
 * por puesto (A-B, C-D, E-F, G-H). Un partido mal tipeado dejaría una tabla que no
 * cierra y nadie lo notaría hasta que juegue.
 */
function validarCanon() {
  const errores = [];
  for (const z of ZONAS) {
    const equipos = z.tabla.map((r) => r[0]);
    const ps = PARTIDOS_ZONA.filter((p) => p[0] === z.clave);
    if (ps.length !== 6) errores.push(`${nombreZona(z.clave)}: ${ps.length} partidos y deberían ser 6`);
    const pares = new Set();
    for (const [, , l, , , v] of ps) {
      if (!equipos.includes(l) || !equipos.includes(v)) errores.push(`${nombreZona(z.clave)}: ${l} o ${v} no es de la zona`);
      const par = [l, v].sort().join('|');
      if (pares.has(par)) errores.push(`${nombreZona(z.clave)}: ${l} v ${v} repetido`);
      pares.add(par);
    }
    const calc = tablaDeZona(z.clave);
    for (const [k, pj, pg, pe, pp, pf, pc, pts] of z.tabla) {
      const c = calc.get(k);
      const got = [c.pj, c.pg, c.pe, c.pp, c.pf, c.pc, c.pts].join(',');
      const want = [pj, pg, pe, pp, pf, pc, pts].join(',');
      if (got !== want) errores.push(`${nombreZona(z.clave)} · ${k}: los partidos dan ${got} y la tabla oficial dice ${want}`);
    }
  }
  const puesto = (clave, pos) => ZONAS.find((z) => z.clave === clave).tabla[pos - 1][0];
  const cruces = [['A', 'B'], ['C', 'D'], ['E', 'F'], ['G', 'H']];
  for (const copa of COPAS) {
    copa.cuartos.forEach(([, , l, v], i) => {
      const [za, zb] = cruces[i];
      if (l !== puesto(za, copa.puesto) || v !== puesto(zb, copa.puesto)) {
        errores.push(`${copa.nombre} cuartos ${i + 1}: ${l} v ${v} y por tabla serían ${puesto(za, copa.puesto)} v ${puesto(zb, copa.puesto)}`);
      }
    });
  }
  const usados = new Set([...PARTIDOS_ZONA.flatMap((p) => [p[2], p[5]]), ...COPAS.flatMap((c) => c.cuartos.flatMap((q) => [q[2], q[3]]))]);
  for (const k of usados) if (!EQUIPOS[k]) errores.push(`equipo sin ficha en EQUIPOS: ${k}`);
  if (Object.keys(EQUIPOS).length !== 32) errores.push(`EQUIPOS tiene ${Object.keys(EQUIPOS).length} y deberían ser 32`);
  if (errores.length) throw new Error(`el canon no cierra:\n  ${errores.join('\n  ')}`);
}

// ── Clubes ───────────────────────────────────────────────────────────────────

const filaDeClub = (c) => ({
  id: c.id, union_id: c.union_id ?? null, name: c.name, short_name: c.name, city: c.city ?? null, region: c.region ?? null,
  country: 'ARG', logo_url: c.logo_url ?? null, primary_color: c.primary_color ?? null, slug: c.id, is_visible: true,
  entity_type: 'club', sport: 'rugby', sport_id: 'rugby', category: c.category ?? null, category_variant: c.category_variant ?? null,
  categories: [], status: 'active', visibility: 'visible', external_id: null, created_at: ahora, updated_at: ahora,
});

// ── Torneo ───────────────────────────────────────────────────────────────────

const settingsBase = () => ({
  legs: 1, points: { ...PUNTOS }, pointsSystem: { ...PUNTOS, allowBonusPoints: false }, tiebreakers: TIEBREAKERS,
  standings: { mode: 'automatic', editable: true }, source: ORIGEN,
});

async function crearTorneo() {
  const tournamentId = crypto.randomUUID();
  const seasonId = crypto.randomUUID();
  try {
    await insertar('tournaments', [{
      id: tournamentId, union_id: UNION, season_id: TEMPORADA, name: NOMBRE, slug: TORNEO_SLUG, original_name: ORIGINAL,
      status: 'published', category: 'Juvenil', age_grade: 'M15', region: 'Litoral', country: 'ARG', country_id: 'argentina',
      country_name: 'Argentina', format: 'groups', is_visible: true, is_active: true, logo_url: LOGO_TORNEO,
      ruleset: RULESET, ruleset_version: 1, sport_id: 'rugby', sport: 'rugby', sport_name: 'Rugby', gender: 'masculino',
      priority: 0, sponsors: [], social_links: {}, display_order: 0, is_popular: false, is_api_managed: false,
      review_status: 'approved', external_id: null, data_source: ORIGEN, created_at: ahora, updated_at: ahora,
    }]);
    await insertar('tournament_seasons', [{
      id: seasonId, tournament_id: tournamentId, legacy_tournament_id: tournamentId, season_code: TEMPORADA,
      name: `${NOMBRE} ${TEMPORADA}`, display_name: `${NOMBRE} ${TEMPORADA}`, slug: `${TORNEO_SLUG}-${TEMPORADA}`,
      status: 'active', is_active: true, start_date: DIAS.sab, end_date: DIAS.dom, format: 'groups', ruleset: RULESET,
      settings: { source: ORIGEN, sede: SEDE, fuente: 'Placas de @rugbyclick (resultados al sáb 24/10, 19:29)', desempateLlaves: 'drops' },
      champion_club_id: null, created_at: ahora, updated_at: ahora,
    }]);
    await actualizar(`tournaments?id=eq.${tournamentId}`, { current_season_id: seasonId });

    // ── Fases ──
    const faseZonas = crypto.randomUUID();
    // Una FASE de playoff por copa: el selector de la pestaña Playoff separa fases, no copas de una misma fase.
    const copas = COPAS.map((c, i) => ({ ...c, faseId: crypto.randomUUID(), orden: i }));
    const zonas = ZONAS.map((z, i) => ({ ...z, nombre: nombreZona(z.clave), groupId: crypto.randomUUID(), color: COLORES_ZONA[i] }));
    const zonaDe = new Map(zonas.map((z) => [z.clave, z]));
    await insertar('tournament_phases', [
      {
        id: faseZonas, tournament_id: tournamentId, season_id: seasonId, name: 'Fase de zonas', phase_type: 'group_stage',
        // Una sola fase activa por temporada (restricción de la base): la activa es Copa Oro, que es lo que se está jugando.
        order_index: 1, is_active: false,
        settings: {
          ...settingsBase(), teamsCount: 32, advanceCount: 4, group_names: zonas.map((z) => z.nombre), groupTags: zonas.map((z) => z.nombre),
          groupLabels: zonas.map((z, i) => ({ id: z.groupId, name: z.nombre, color: z.color, colorMode: 'manual', autoColorIndex: i })),
        },
        created_at: ahora, updated_at: ahora,
      },
      ...copas.map((c) => ({
        id: c.faseId, tournament_id: tournamentId, season_id: seasonId, name: c.nombre, phase_type: 'playoff',
        // La pestaña Playoff abre en la copa eliminatoria activa: Oro, y las demás a un clic.
        order_index: c.orden + 2, is_active: c.orden === 0,
        settings: { ...settingsBase(), advanceCount: 1, phaseMode: 'playoff', bracketMode: 'auto' },
        created_at: ahora, updated_at: ahora,
      })),
    ]);
    await insertar('tournament_groups', zonas.map((z, i) => ({ id: z.groupId, phase_id: faseZonas, season_id: seasonId, name: z.nombre, order_index: i })));

    // ── Rondas ──
    const rondaZonas = crypto.randomUUID();
    const ETAPAS = [['Cuartos de final', 1], ['Semifinales', 2], ['Final', 3]];
    const rondaDe = new Map(); // `${copa}|${etapa}` → id
    const filasRondas = [{
      id: rondaZonas, phase_id: faseZonas, season_id: seasonId, group_id: null, name: 'Fase de zonas', order_index: 1,
      start_date: DIAS.sab, end_date: DIAS.sab, is_completed: true, notes: null, created_at: ahora, updated_at: ahora,
    }];
    for (const c of copas) {
      for (const [etapa, orden] of ETAPAS) {
        const id = crypto.randomUUID();
        rondaDe.set(`${c.clave}|${etapa}`, id);
        filasRondas.push({
          id, phase_id: c.faseId, season_id: seasonId, group_id: null, name: etapa, order_index: orden,
          start_date: DIAS.dom, end_date: DIAS.dom, is_completed: false, notes: null, created_at: ahora, updated_at: ahora,
        });
      }
    }
    await insertar('tournament_rounds', filasRondas);

    // ── Participantes: las TRES filas ──
    const claves = zonas.flatMap((z) => z.tabla.map((r) => ({ k: r[0], zona: z })));
    const nombres = new Map((await leer(`clubs?select=id,name&id=in.(${claves.map((c) => ficha(c.k)).join(',')})`)).map((c) => [c.id, c.name]));
    const parts = claves.map(({ k, zona }) => ({
      k, zona, participantId: crypto.randomUUID(), entryId: crypto.randomUUID(), clubId: ficha(k), nombre: nombres.get(ficha(k)),
    }));
    await insertar('tournament_participants', parts.map((p) => ({
      id: p.participantId, tournament_id: tournamentId, season_id: seasonId, season_entry_id: null, club_id: p.clubId,
      name: p.nombre, type: 'club', status: 'active', seed: null, group_id: p.zona.groupId, short_code: null,
      notes: ORIGEN, joined_at: ahora, created_at: ahora, updated_at: ahora,
    })));
    await insertar('team_season_entries', parts.map((p) => ({
      id: p.entryId, season_id: seasonId, tournament_id: tournamentId, club_id: p.clubId, team_id: null,
      source_participant_id: p.participantId, group_id: p.zona.groupId, zone: p.zona.nombre, category: null, status: 'active',
      seed: null, notes: null, settings: { source: ORIGEN }, created_at: ahora, updated_at: ahora,
    })));
    for (const p of parts) await actualizar(`tournament_participants?id=eq.${p.participantId}`, { season_entry_id: p.entryId });
    await insertar('tournament_phase_participants', parts.map((p) => ({
      id: crypto.randomUUID(), tournament_id: tournamentId, season_id: seasonId, phase_id: faseZonas, participant_id: p.participantId,
      group_id: p.zona.groupId, status: 'active', seed: null, notes: null, created_at: ahora, updated_at: ahora,
    })));

    // ── Etiquetas de las tablas ── una banda por puesto: a qué copa va cada uno.
    const COLOR_COPA = { ORO: '#d4a017', PLATA: '#94a3b8', BRONCE: '#b4763a', CRISTAL: '#38bdf8' };
    const etiquetas = copas.map((c) => ({ id: crypto.randomUUID(), name: c.nombre, color: COLOR_COPA[c.clave], scope: 'standings', puesto: c.puesto }));
    await insertar('ui_labels', etiquetas.map(({ id, name, color, scope }) => ({ id, name, color, scope })));
    await insertar('team_labels', zonas.flatMap((z) => etiquetas.map((e) => ({
      label_id: e.id, club_id: null, position: e.puesto, tournament_id: tournamentId, phase_id: faseZonas, group_id: z.groupId,
    }))));
    const [{ settings: ajustesZonas }] = await leer(`tournament_phases?select=settings&id=eq.${faseZonas}`);
    await actualizar(`tournament_phases?id=eq.${faseZonas}`, {
      settings: {
        ...ajustesZonas,
        groupLabels: [...ajustesZonas.groupLabels, ...etiquetas.map((e, i) => ({ id: e.id, name: e.name, color: e.color, colorMode: 'manual', autoColorIndex: i }))],
      },
    });

    // ── Partidos ── (todas las filas con EXACTAMENTE las mismas claves)
    const comun = {
      tournament_id: tournamentId, season_id: seasonId, sport_id: 'rugby', sport: 'rugby', live_enabled: false,
      lineups: { home: [], away: [] }, events: [], review_status: 'approved', external_id: null, created_at: ahora, updated_at: ahora,
      home_base_points: 0, away_base_points: 0, home_bonus_points: 0, away_bonus_points: 0, points_autocalculated: true,
      points_override_reason: null,
    };
    const partidos = PARTIDOS_ZONA.map(([z, hora, l, hl, hv, v]) => ({
      ...comun, id: crypto.randomUUID(), phase_id: faseZonas, group_id: zonaDe.get(z).groupId, round_uuid: rondaZonas,
      round_label: 'Fase de zonas', home_club_id: ficha(l), away_club_id: ficha(v), date_time: instanteDe('sab', hora),
      venue: SEDE_CANCHA(ZONAS.find((x) => x.clave === z).cancha), status: 'final', score: { home: hl, away: hv },
      is_visible: true, notes: nombreZona(z), bracket_match_code: null, home_source_label: null, away_source_label: null,
      participant_source: null,
    }));

    const idPorCodigo = new Map();
    const reglasPendientes = []; // [origen, resultado, destino, slot, groupId]
    const cruces = [['A', 'B'], ['C', 'D'], ['E', 'F'], ['G', 'H']];
    for (const c of copas) {
      const fila = (codigo, etapa, hora, cancha, local, visitante, extras) => {
        const id = crypto.randomUUID();
        idPorCodigo.set(codigo, id);
        partidos.push({
          ...comun, id, phase_id: c.faseId, group_id: null, round_uuid: rondaDe.get(`${c.clave}|${etapa}`),
          round_label: etapa, home_club_id: local, away_club_id: visitante,
          date_time: instanteDe('dom', hora), venue: SEDE_CANCHA(cancha), status: 'scheduled', score: null,
          bracket_match_code: codigo, ...extras,
        });
      };
      c.cuartos.forEach(([hora, cancha, l, v], i) => {
        const [za, zb] = cruces[i];
        fila(`${c.clave}-C${i + 1}`, 'Cuartos de final', hora, cancha, ficha(l), ficha(v), {
          is_visible: true, notes: `${c.nombre} · Cuartos ${i + 1}`,
          home_source_label: `${c.puesto}º ${nombreZona(za)}`, away_source_label: `${c.puesto}º ${nombreZona(zb)}`,
          participant_source: {
            home: { type: 'standing', group: nombreZona(za), position: c.puesto },
            away: { type: 'standing', group: nombreZona(zb), position: c.puesto },
          },
        });
      });
      c.semis.forEach(([hora, cancha], i) => {
        const codigo = `${c.clave}-S${i + 1}`;
        const [o1, o2] = [`${c.clave}-C${i * 2 + 1}`, `${c.clave}-C${i * 2 + 2}`];
        fila(codigo, 'Semifinales', hora, cancha, null, null, {
          is_visible: false, notes: `${c.nombre} · Semifinal ${i + 1}`,
          home_source_label: `Ganador cuartos ${i * 2 + 1}`, away_source_label: `Ganador cuartos ${i * 2 + 2}`,
          participant_source: { home: { type: 'winner', ref: o1 }, away: { type: 'winner', ref: o2 } },
        });
        reglasPendientes.push([o1, 'winner', codigo, 'home', c.faseId], [o2, 'winner', codigo, 'away', c.faseId]);
      });
      const codigoFinal = `${c.clave}-F`;
      fila(codigoFinal, 'Final', c.final[0], c.final[1], null, null, {
        is_visible: false, notes: `${c.nombre} · Final`,
        home_source_label: 'Ganador semi 1', away_source_label: 'Ganador semi 2',
        participant_source: { home: { type: 'winner', ref: `${c.clave}-S1` }, away: { type: 'winner', ref: `${c.clave}-S2` } },
      });
      reglasPendientes.push([`${c.clave}-S1`, 'winner', codigoFinal, 'home', c.faseId], [`${c.clave}-S2`, 'winner', codigoFinal, 'away', c.faseId]);
    }
    await insertar('matches', partidos);

    const reglas = reglasPendientes.map(([origen, resultado, destino, slot, faseId]) => ({
      id: crypto.randomUUID(), phase_id: faseId, source_match_id: idPorCodigo.get(origen), outcome: resultado,
      target_match_id: idPorCodigo.get(destino), target_slot: slot, target_group_id: null, created_at: ahora, updated_at: ahora,
    }));
    await insertar('tournament_match_advancement_rules', reglas);

    return { tournamentId, seasonId, participantes: parts.length, partidos: partidos.length, reglas: reglas.length, zonas: zonas.length, copas: copas.length };
  } catch (e) {
    await limpiarTorneo(tournamentId).catch((e2) => console.error(`  la limpieza del torneo falló también: ${e2.message}`));
    throw e;
  }
}

// ── Verificación contra la tabla OFICIAL ─────────────────────────────────────

async function verificar() {
  const [t] = await leer(`tournaments?select=id&slug=eq.${TORNEO_SLUG}`);
  if (!t) throw new Error('el torneo no existe');
  const fases = await leer(`tournament_phases?select=id&tournament_id=eq.${t.id}&phase_type=eq.group_stage`);
  const filas = await leer(`tournament_standings?select=club_id,group_id,position,played,won,drawn,lost,points,scored,conceded&tournament_id=eq.${t.id}&phase_id=eq.${fases[0].id}&order=position.asc&limit=1000`);
  const grupos = new Map((await leer(`tournament_groups?select=id,name&phase_id=eq.${fases[0].id}`)).map((g) => [g.id, g.name]));
  let mal = 0;
  for (const z of ZONAS) {
    const delGrupo = filas.filter((f) => grupos.get(f.group_id) === nombreZona(z.clave)).sort((a, b) => a.position - b.position);
    z.tabla.forEach(([k, pj, pg, pe, pp, pf, pc, pts], i) => {
      const f = delGrupo[i];
      const ok = f && f.club_id === ficha(k) && f.played === pj && f.won === pg && f.drawn === pe && f.lost === pp && f.scored === pf && f.conceded === pc && f.points === pts;
      if (!ok) { mal++; console.log(`✗ ${nombreZona(z.clave)} puesto ${i + 1}: esperaba ${k} ${pj}/${pg}/${pe}/${pp} ${pf}-${pc} ${pts}; la base tiene ${f ? `${f.club_id} ${f.played}/${f.won}/${f.drawn}/${f.lost} ${f.scored}-${f.conceded} ${f.points}` : 'nada'}`); }
    });
  }
  console.log(`\nfilas de posiciones: ${filas.length} (esperadas 32) · discrepancias: ${mal}`);
  if (mal || filas.length !== 32) process.exitCode = 1; else console.log('✓ las 8 tablas coinciden con la oficial, puesto por puesto');
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`modo: ${modo}\n`);
  if (modo === 'verificar') return verificar();
  validarCanon();
  console.log('✓ el canon cierra: 8 zonas todos contra todos, las 8 tablas coinciden con las oficiales y los cuartos salen de los puestos\n');

  if (process.argv.includes('--limpiar')) {
    const filas = await leer(`tournaments?select=id,name&slug=eq.${TORNEO_SLUG}`);
    for (const f of filas) console.log(`se borra ${f.name}`);
    if (modo === 'plan') { console.log('\nmodo --plan: no se borró nada.'); return; }
    for (const f of filas) { await limpiarTorneo(f.id); console.log(`  ✓ borrado ${f.name}`); }
    return;
  }

  const [existente] = await leer(`tournaments?select=id,name&slug=eq.${TORNEO_SLUG}`);
  if (existente) { console.log(`${NOMBRE} ya existe (${existente.id}): no se escribe nada.\nPara rehacerlo: --execute --limpiar y después --execute.`); return; }

  // Bases (existentes + nuevas) con lo que hereda cada ficha.
  const idsBase = [...new Set(Object.values(EQUIPOS).map((e) => e.base))];
  const nuevasIds = new Set(BASES_NUEVAS.map((b) => b.id));
  const basesDb = new Map((await leer(`clubs?select=id,name,city,region,union_id,logo_url,primary_color&id=in.(${idsBase.filter((i) => !nuevasIds.has(i)).join(',')})`)).map((c) => [c.id, c]));
  const faltan = idsBase.filter((i) => !nuevasIds.has(i) && !basesDb.has(i));
  if (faltan.length) throw new Error(`clubes base que no están en la base: ${faltan.join(', ')}`);
  const yaEnBase = new Set((await leer(`clubs?select=id&id=in.(${[...nuevasIds].join(',')})`)).map((c) => c.id));
  const basesACrear = BASES_NUEVAS.filter((b) => !yaEnBase.has(b.id));
  for (const b of BASES_NUEVAS) {
    if (b.escudoDe) {
      const [o] = await leer(`clubs?select=logo_url&id=eq.${b.escudoDe}`);
      b.logo_url = o?.logo_url ?? null;
    }
    basesDb.set(b.id, { id: b.id, name: b.name, city: b.city, region: b.region, union_id: b.union_id, logo_url: b.logo_url ?? null, primary_color: null });
  }

  const fichasIds = Object.values(EQUIPOS).map((e) => e.ficha);
  const fichasDb = new Map((await leer(`clubs?select=id,logo_url&id=in.(${fichasIds.join(',')})`)).map((c) => [c.id, c]));
  const noEsperadas = Object.values(EQUIPOS).filter((e) => e.existe && !fichasDb.has(e.ficha)).map((e) => e.ficha);
  if (noEsperadas.length) throw new Error(`fichas marcadas como existentes que no están: ${noEsperadas.join(', ')}`);
  // Retomable: una corrida que se cortó después de crear las fichas las deja en la base.
  const propias = Object.values(EQUIPOS).filter((e) => !e.existe);
  const fichasACrear = propias.filter((e) => !fichasDb.has(e.ficha)).map((e) => {
    const b = basesDb.get(e.base);
    return filaDeClub({
      id: e.ficha, union_id: b.union_id, name: e.variante ? `${b.name} M15 "${e.variante}"` : `${b.name} M15`, city: b.city, region: b.region,
      logo_url: b.logo_url, primary_color: b.primary_color, category: 'M15',
    });
  });
  const sinLogo = Object.values(EQUIPOS).filter((e) => e.existe && !fichasDb.get(e.ficha).logo_url && basesDb.get(e.base).logo_url);

  console.log(`bases nuevas (${basesACrear.length}): ${basesACrear.map((b) => b.name).join(' · ') || '—'}`);
  console.log(`fichas M15 a crear (${fichasACrear.length}), de ellas ${fichasACrear.filter((f) => /"/.test(f.name)).length} variantes:`);
  for (const f of fichasACrear) console.log(`  + ${f.id.padEnd(38)} ${f.name.padEnd(46)} ${f.logo_url ? 'con escudo' : '— sin escudo —'}`);
  console.log(`fichas existentes que se reusan (${Object.values(EQUIPOS).filter((e) => e.existe).length}); sin logo y se completan: ${sinLogo.map((e) => e.ficha).join(', ') || '—'}`);
  console.log(`\ntorneo: ${NOMBRE} · Litoral · M15 · ${UNION} · logo ${LOGO_TORNEO}`);
  console.log(`zonas: ${ZONAS.length} × 4 · partidos de zona: ${PARTIDOS_ZONA.length} (jugados) · copas: ${COPAS.length} × 7 partidos = ${COPAS.length * 7} (cuartos con equipos, semis y final por avance)`);
  if (modo === 'plan') { console.log('\nmodo --plan: no se escribió una sola fila.'); return; }

  // ── Escritura ──
  const origenLogo = path.join(REPO, 'public', 'clubs', 'estudiantes-de-parana.png');
  if (!fs.existsSync(origenLogo)) throw new Error('falta public/clubs/estudiantes-de-parana.png (el escudo del CAE)');
  fs.copyFileSync(origenLogo, path.join(REPO, 'public', 'competiciones', 'ar-litoral-uranga-m15.png'));
  console.log('\n✓ logo del torneo: public/competiciones/ar-litoral-uranga-m15.png (escudo del CAE de Paraná)');

  await insertar('clubs', basesACrear.map((b) => filaDeClub({ ...b, category: null })));
  await insertar('clubs', fichasACrear);
  const vinculadas = new Set((await leer(`club_derivatives?select=derived_club_id&derived_club_id=in.(${propias.map((e) => e.ficha).join(',')})`)).map((d) => d.derived_club_id));
  await insertar('club_derivatives', propias.filter((e) => !vinculadas.has(e.ficha)).map((e) => ({
    id: crypto.randomUUID(), base_club_id: e.base, derived_club_id: e.ficha, derivative_type: 'family', created_at: ahora,
  })));
  for (const e of sinLogo) await actualizar(`clubs?id=eq.${e.ficha}`, { logo_url: basesDb.get(e.base).logo_url, updated_at: ahora });
  console.log(`✓ ${basesACrear.length} clubes base · ${fichasACrear.length} fichas M15 · ${propias.length - vinculadas.size} vínculos de familia · ${sinLogo.length} logos completados`);

  const r = await crearTorneo();
  console.log(`✓ ${NOMBRE}: ${r.zonas} zonas · ${r.copas} copas · ${r.participantes} participantes · ${r.partidos} partidos · ${r.reglas} reglas de avance`);

  // ── Rollback ──
  const t = r.tournamentId;
  const fases = `(SELECT id FROM public.tournament_phases WHERE tournament_id = '${t}')`;
  const sql = [
    `-- Rollback de la carga del ${NOMBRE}.`, '-- Borra el torneo de esta corrida, las fichas M15 nuevas y las bases nuevas (los clubes van último: los partidos los referencian).',
    'BEGIN;', '',
    `DELETE FROM public.tournament_match_advancement_rules WHERE phase_id IN ${fases};`,
    `CREATE TEMP TABLE etiquetas_uranga AS SELECT DISTINCT label_id FROM public.team_labels WHERE tournament_id = '${t}';`,
    `DELETE FROM public.team_labels WHERE tournament_id = '${t}';`,
    `DELETE FROM public.ui_labels WHERE id IN (SELECT label_id FROM etiquetas_uranga);`,
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
    `DELETE FROM public.tournaments WHERE id = '${t}';`, '',
    `DELETE FROM public.club_derivatives WHERE derived_club_id IN (${propias.map((e) => `'${e.ficha}'`).join(', ')});`,
    `DELETE FROM public.clubs WHERE id IN (${[...propias.map((e) => e.ficha), ...BASES_NUEVAS.map((b) => b.id)].map((x) => `'${x}'`).join(', ')});`,
    '', 'COMMIT;',
  ];
  fs.writeFileSync(ROLLBACK, sql.join('\n') + '\n', 'utf8');
  console.log(`\nrollback escrito: ${ROLLBACK}`);
  console.log('\nfalta la tabla, que es persistida y no se rehace sola:');
  console.log(`  npx tsx src/scripts/arusa-recalcular.ts --torneo=${TORNEO_SLUG}`);
  console.log('  node scripts/uranga-2026/seed.mjs --verificar');
}

main().catch((e) => { console.error('\nFALLÓ:', e.message || e); process.exit(1); });
