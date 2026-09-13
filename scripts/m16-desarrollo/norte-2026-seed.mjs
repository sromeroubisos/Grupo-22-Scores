/**
 * Carga del M16 Desarrollo Norte 2026 sobre el torneo `m16-desarrollo-norte`,
 * que ya existe con el cuadro de honor 2023-2025: los siete seleccionados que
 * faltan, la temporada 2026 con sus cuatro zonas y la jornada 1 jugada, y la
 * jornada 2 en tres copas con los cruces de semifinal ya definidos.
 *
 *   node scripts/m16-desarrollo/norte-2026-logos.mjs --execute   (antes)
 *   node scripts/m16-desarrollo/norte-2026-seed.mjs --plan
 *   node scripts/m16-desarrollo/norte-2026-seed.mjs --execute
 *   node scripts/m16-desarrollo/norte-2026-seed.mjs --execute --limpiar
 *
 * `--limpiar` borra la temporada 2026 entera y le devuelve al torneo la 2025
 * como actual. No toca los clubes ni el palmarés.
 *
 * Un participante son TRES filas encadenadas y cada consumidor lee una
 * distinta (ver `seed.mjs`). Acá además cada copa declara sus cuatro en
 * `tournament_phase_participants`: sin eso la fase no sabe quién la juega.
 *
 * Los 12 partidos de la jornada 1 van con `points_autocalculated: false` y el
 * bonus despejado de la tabla publicada (ver `norte-2026-datos.mjs`). Las seis
 * semis llevan sus rivales; las seis definiciones van sin equipos,
 * `is_visible=false`, y se completan solas por
 * `tournament_match_advancement_rules` cuando el resultado de la semi entra por
 * el gestor. Si entra por script, después hay que tocar "Sincronizar llaves".
 *
 * Después de esto hay que rehacer la tabla, que es persistida:
 *
 *   npx tsx src/scripts/arusa-recalcular.ts --torneo=m16-desarrollo-norte
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { PUNTOS, RULESET, TIEBREAKERS } from './datos.mjs';
import {
  ARBITROS, clubEnPosicion, CLUBES_NUEVOS, COPAS, DIAS, DURACION, instanteDe, JORNADA_1,
  NOMBRE, SEDE, SEMIS_PUBLICADAS, TABLA_J1, TEMPORADA, TORNEO_SLUG, ZONAS,
} from './norte-2026-datos.mjs';

const REPO = process.cwd();
const ROLLBACK = path.join(REPO, 'M16_NORTE_2026_ROLLBACK.sql');
const ORIGEN = 'm16-desarrollo-norte-2026';

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

/** El reglamento del torneo, con el formato de zonas en vez del de liga que tenía la ficha de palmarés. */
const RULESET_ZONAS = {
  ...RULESET,
  competition: { format_type: 'groups', parameters: { season_model: 'single_event' } },
};

/** Color de zona: el mismo verde/amarillo/naranja/azul que usan las zonas del Argentino Juvenil. */
const COLORES_ZONA = ['#00a365', '#eab308', '#f97316', '#3b82f6'];

const puntosBase = (propios, ajenos) => (propios > ajenos ? PUNTOS.win : propios === ajenos ? PUNTOS.draw : PUNTOS.loss);
const nombreDeZona = (clave) => ZONAS.find((z) => z.clave === clave).nombre;
const etiquetaDeOrigen = (s) => (s.zona ? `${s.pos}º ${s.zona}` : `${s.resultado === 'winner' ? 'Ganador' : 'Perdedor'} P${s.de}`);
const fuenteDeOrigen = (s) => (s.zona
  ? { type: 'standing', group: nombreDeZona(s.zona), position: s.pos }
  : { type: s.resultado, ref: `P${s.de}` });

/**
 * Antes de escribir una fila: la jornada 1 tiene que dar EXACTAMENTE la tabla
 * publicada, y la tabla tiene que dar EXACTAMENTE las semis publicadas. Si el
 * bonus despejado estuviera mal, la tabla de la página diría otra cosa que el
 * parte y nadie lo notaría hasta que un lector lo marque.
 */
function validarCanon() {
  const errores = [];
  for (const zona of ZONAS) {
    const pts = new Map(zona.clubes.map((c) => [c, 0]));
    for (const p of JORNADA_1.filter((x) => x.zona === zona.clave)) {
      pts.set(p.local, pts.get(p.local) + puntosBase(p.ptsLocal, p.ptsVisitante) + p.bonusLocal);
      pts.set(p.visitante, pts.get(p.visitante) + puntosBase(p.ptsVisitante, p.ptsLocal) + p.bonusVisitante);
    }
    const calculada = [...pts.entries()].sort((a, b) => b[1] - a[1]);
    TABLA_J1[zona.clave].forEach((fila, i) => {
      const [club, puntos] = calculada[i];
      if (club !== fila.club || puntos !== fila.pts) {
        errores.push(`${zona.clave} ${i + 1}º: publicada ${fila.club} ${fila.pts} · calculada ${club} ${puntos}`);
      }
    });
  }
  for (const copa of COPAS) {
    for (const p of copa.partidos.filter((x) => x.local.zona)) {
      const cruce = [clubEnPosicion(p.local.pos, p.local.zona), clubEnPosicion(p.visitante.pos, p.visitante.zona)];
      if (cruce.join() !== SEMIS_PUBLICADAS[p.n].join()) {
        errores.push(`P${p.n}: la tabla da ${cruce.join(' v ')} y el parte ${SEMIS_PUBLICADAS[p.n].join(' v ')}`);
      }
    }
  }
  if (errores.length) throw new Error(`el canon no cierra:\n  ${errores.join('\n  ')}`);
}

/**
 * Deshace la temporada 2026: todo lo que cuelga de ella por `season_id`, y le
 * devuelve al torneo la temporada anterior como actual. Sirve de limpieza
 * compensatoria si una corrida falla a la mitad —media docena de tablas
 * encadenadas no entran en una transacción sobre PostgREST— y de `--limpiar`.
 */
async function limpiarTemporada(torneo, seasonId, anterior) {
  const fases = await leer(`tournament_phases?select=id&season_id=eq.${seasonId}`);
  const idsFase = fases.map((f) => f.id);
  if (idsFase.length) {
    await borrar(`tournament_match_advancement_rules?phase_id=in.(${idsFase.join(',')})`);
  }
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
  // El torneo suelta la temporada nueva (FK de `current_season_id`), la nueva
  // se borra, y recién ahí se reactiva la anterior: el índice de una sola
  // temporada activa por torneo no admite las dos a la vez.
  if (anterior) {
    await actualizar(`tournaments?id=eq.${torneo.id}`, {
      current_season_id: anterior.id, season_id: anterior.season_code, format: 'league', ruleset: RULESET,
    });
  }
  await borrar(`tournament_seasons?id=eq.${seasonId}`);
  if (anterior) {
    await actualizar(`tournament_seasons?id=eq.${anterior.id}`, { status: 'active', is_active: true, updated_at: new Date().toISOString() });
  }
}

function filaDeClub(c, colores) {
  const escudo = path.join(REPO, 'public', 'clubs', `${c.id}.png`);
  if (!fs.existsSync(escudo)) throw new Error(`falta el escudo public/clubs/${c.id}.png — corré norte-2026-logos.mjs --execute primero`);
  return {
    id: c.id,
    union_id: c.union_id,
    name: c.name,
    short_name: c.name,
    city: null,
    region: c.region,
    country: 'ARG',
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
 * Escribe la temporada 2026 entera sobre el torneo que ya existe. Devuelve el
 * conteo de cada tabla. El que llama deshace si algo falla.
 */
async function escribirTemporada(torneo, seasonId, anterior) {
  // ── Temporada ────────────────────────────────────────────────────────────
  // La anterior se cierra ANTES: `tournament_seasons_one_active_idx` admite
  // una sola temporada activa por torneo y rechaza el insert de la nueva.
  if (anterior) {
    await actualizar(`tournament_seasons?id=eq.${anterior.id}`, { status: 'completed', is_active: false, updated_at: ahora });
  }
  await insertar('tournament_seasons', [{
    id: seasonId,
    tournament_id: torneo.id,
    legacy_tournament_id: torneo.id,
    season_code: TEMPORADA,
    name: `${NOMBRE} ${TEMPORADA}`,
    display_name: `${NOMBRE} ${TEMPORADA}`,
    slug: `${TORNEO_SLUG}-${TEMPORADA}`,
    status: 'active',
    is_active: true,
    start_date: DIAS[1],
    end_date: DIAS[2],
    format: 'league',
    ruleset: RULESET_ZONAS,
    settings: { source: ORIGEN, sede: SEDE, arbitros: ARBITROS, duracion: DURACION },
    champion_club_id: null,
    created_at: ahora,
    updated_at: ahora,
  }]);
  await actualizar(`tournaments?id=eq.${torneo.id}`, {
    current_season_id: seasonId, season_id: TEMPORADA, format: 'groups', ruleset: RULESET_ZONAS, updated_at: ahora,
  });

  // ── Fases ────────────────────────────────────────────────────────────────
  // La de zonas va como 'group_stage': la vista por zonas del detalle público
  // sólo se arma con ese phase_type. Cada copa es una fase playoff propia.
  //
  // Activa sólo la de zonas: `tournament_phases_one_active_idx` admite una
  // fase activa por temporada, y la activa es la que eligen los que leen "la
  // tabla del torneo". Sin fase playoff activa, la página abre el cuadro de la
  // ÚLTIMA fase playoff con partidos: por eso las copas van de Bronce a Oro
  // (orden 2, 3, 4). El selector las lista en ese orden y abre en la de Oro.
  //
  // Las copas NO declaran `teamsCount`: con él, la página calcula cuántas
  // rondas "debería" tener un cuadro de ese tamaño y rellena o recorta las
  // declaradas. Sin él, muestra exactamente las tres de `playoffStages`.
  // `bracketMode: 'auto'` es lo que evita que editar la fase en el gestor le
  // corra el sync de slots manuales, que renombra rondas y mete slots vacíos.
  const faseZonas = crypto.randomUUID();
  const zonas = ZONAS.map((z) => ({ ...z, groupId: crypto.randomUUID() }));
  const groupIdDe = new Map(zonas.map((z) => [z.clave, z.groupId]));
  const copas = COPAS.map((c, i) => ({ ...c, faseId: crypto.randomUUID(), orden: COPAS.length + 1 - i }));

  const rondasDeCopa = (copa) => [...new Set(copa.partidos.map((p) => p.ronda))];

  await insertar('tournament_phases', [
    {
      id: faseZonas, tournament_id: torneo.id, season_id: seasonId,
      name: 'Fase de Zonas', phase_type: 'group_stage', order_index: 1, is_active: true,
      settings: {
        ...settingsBase(),
        teamsCount: 12,
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
    ...copas.map((c) => ({
      id: c.faseId, tournament_id: torneo.id, season_id: seasonId,
      name: c.nombre, phase_type: 'playoff', order_index: c.orden, is_active: false,
      settings: {
        ...settingsBase(),
        advanceCount: 1,
        phaseMode: 'playoff',
        bracketMode: 'auto',
        playoffStages: rondasDeCopa(c).map((ronda, i) => ({
          id: `playoff_stage_${i + 1}`, name: ronda, orderIndex: i + 1,
          matchCount: c.partidos.filter((p) => p.ronda === ronda).length,
        })),
        posiciones: c.posiciones,
      },
      created_at: ahora, updated_at: ahora,
    })),
  ]);
  await insertar('tournament_groups', zonas.map((z, i) => ({
    id: z.groupId, phase_id: faseZonas, season_id: seasonId, name: z.nombre, order_index: i,
  })));

  // ── Rondas ───────────────────────────────────────────────────────────────
  const rondaJ1 = crypto.randomUUID();
  const rondaDe = new Map(); // `${faseId}::${ronda}` → id
  const filasRondas = [{
    id: rondaJ1, phase_id: faseZonas, season_id: seasonId,
    name: 'Jornada 1', order_index: 1, start_date: DIAS[1], end_date: DIAS[1],
    is_completed: true, notes: null, created_at: ahora, updated_at: ahora,
  }];
  for (const c of copas) {
    rondasDeCopa(c).forEach((ronda, i) => {
      const id = crypto.randomUUID();
      rondaDe.set(`${c.faseId}::${ronda}`, id);
      filasRondas.push({
        id, phase_id: c.faseId, season_id: seasonId,
        name: ronda, order_index: i + 1, start_date: DIAS[2], end_date: DIAS[2],
        is_completed: false, notes: null, created_at: ahora, updated_at: ahora,
      });
    });
  }
  await insertar('tournament_rounds', filasRondas);

  // ── Participantes: las TRES filas ────────────────────────────────────────
  const nombreDe = new Map((await leer(`clubs?select=id,name&id=in.(${zonas.flatMap((z) => z.clubes).join(',')})`)).map((c) => [c.id, c.name]));
  const participantes = zonas.flatMap((z) => z.clubes.map((clubId) => ({
    participantId: crypto.randomUUID(), entryId: crypto.randomUUID(), clubId, zona: z, nombre: nombreDe.get(clubId),
  })));
  const participanteDe = new Map(participantes.map((p) => [p.clubId, p]));

  await insertar('tournament_participants', participantes.map((p) => ({
    id: p.participantId, tournament_id: torneo.id, season_id: seasonId,
    season_entry_id: null, club_id: p.clubId, name: p.nombre, type: 'club',
    status: 'active', seed: null, group_id: p.zona.groupId, short_code: null,
    notes: ORIGEN, joined_at: ahora, created_at: ahora, updated_at: ahora,
  })));
  await insertar('team_season_entries', participantes.map((p) => ({
    id: p.entryId, season_id: seasonId, tournament_id: torneo.id, club_id: p.clubId,
    team_id: null, source_participant_id: p.participantId, group_id: p.zona.groupId,
    zone: p.zona.nombre, category: null, status: 'active', seed: null, notes: null,
    settings: { source: ORIGEN }, created_at: ahora, updated_at: ahora,
  })));
  // FK circular: el back-ref del participante a su entrada va después.
  for (const p of participantes) {
    await actualizar(`tournament_participants?id=eq.${p.participantId}`, { season_entry_id: p.entryId });
  }

  // Cada copa la juegan cuatro, y los cuatro se saben: son los de sus semis.
  const clubesDeCopa = (c) => c.partidos.filter((p) => p.local.zona)
    .flatMap((p) => [clubEnPosicion(p.local.pos, p.local.zona), clubEnPosicion(p.visitante.pos, p.visitante.zona)]);
  const filaFase = (faseId, p, groupId) => ({
    id: crypto.randomUUID(), tournament_id: torneo.id, season_id: seasonId,
    phase_id: faseId, participant_id: p.participantId, group_id: groupId,
    status: 'active', seed: null, notes: null, created_at: ahora, updated_at: ahora,
  });
  await insertar('tournament_phase_participants', [
    ...participantes.map((p) => filaFase(faseZonas, p, p.zona.groupId)),
    ...copas.flatMap((c) => clubesDeCopa(c).map((clubId) => filaFase(c.faseId, participanteDe.get(clubId), null))),
  ]);

  // ── Partidos ─────────────────────────────────────────────────────────────
  // Todas las filas llevan EXACTAMENTE las mismas claves: el insert masivo de
  // PostgREST rechaza el lote entero con "All object keys must match". El
  // número del parte va en `notes`; `bracket_match_code` es sólo del cuadro,
  // como en el Argentino Juvenil.
  const comun = {
    tournament_id: torneo.id, season_id: seasonId, sport_id: 'rugby', sport: 'rugby',
    venue: SEDE, live_enabled: false, lineups: { home: [], away: [] }, events: [],
    review_status: 'approved', external_id: null, created_at: ahora, updated_at: ahora,
  };

  const partidos = JORNADA_1.map((p) => ({
    ...comun, id: crypto.randomUUID(),
    phase_id: faseZonas, group_id: groupIdDe.get(p.zona), round_uuid: rondaJ1, round_label: 'Jornada 1',
    home_club_id: p.local, away_club_id: p.visitante, date_time: instanteDe(1, p.hora),
    status: 'final', score: { home: p.ptsLocal, away: p.ptsVisitante },
    home_base_points: puntosBase(p.ptsLocal, p.ptsVisitante),
    away_base_points: puntosBase(p.ptsVisitante, p.ptsLocal),
    home_bonus_points: p.bonusLocal, away_bonus_points: p.bonusVisitante,
    points_autocalculated: false,
    points_override_reason: 'El parte oficial no publicó tries: el bonus se despejó de la tabla publicada tras la jornada 1.',
    is_visible: true, notes: `P${p.n} · ${nombreDeZona(p.zona)}`,
    bracket_match_code: null, home_source_label: null, away_source_label: null, participant_source: null,
  }));

  const idPorNumero = new Map();
  for (const c of copas) {
    for (const p of c.partidos) {
      const id = crypto.randomUUID();
      idPorNumero.set(p.n, id);
      const esSemi = Boolean(p.local.zona);
      partidos.push({
        ...comun, id,
        phase_id: c.faseId, group_id: null, round_uuid: rondaDe.get(`${c.faseId}::${p.ronda}`),
        round_label: `${c.nombre} · ${p.ronda}`,
        home_club_id: esSemi ? clubEnPosicion(p.local.pos, p.local.zona) : null,
        away_club_id: esSemi ? clubEnPosicion(p.visitante.pos, p.visitante.zona) : null,
        date_time: instanteDe(2, p.hora),
        status: 'scheduled', score: null,
        home_base_points: 0, away_base_points: 0, home_bonus_points: 0, away_bonus_points: 0,
        points_autocalculated: true, points_override_reason: null,
        is_visible: esSemi, notes: `P${p.n} · ${p.definicion}`,
        bracket_match_code: `P${p.n}`,
        home_source_label: etiquetaDeOrigen(p.local),
        away_source_label: etiquetaDeOrigen(p.visitante),
        participant_source: { home: fuenteDeOrigen(p.local), away: fuenteDeOrigen(p.visitante) },
      });
    }
  }
  await insertar('matches', partidos);

  // ── Avance automático: semis → final y partido por el puesto ─────────────
  const reglas = copas.flatMap((c) => c.partidos.filter((p) => p.local.de).flatMap((p) => (
    [['local', 'home'], ['visitante', 'away']].map(([lado, slot]) => ({
      id: crypto.randomUUID(), phase_id: c.faseId,
      source_match_id: idPorNumero.get(p[lado].de), outcome: p[lado].resultado,
      target_match_id: idPorNumero.get(p.n), target_slot: slot,
      target_group_id: null, created_at: ahora, updated_at: ahora,
    }))
  )));
  await insertar('tournament_match_advancement_rules', reglas);

  return {
    fases: 1 + copas.length, zonas: zonas.length, rondas: filasRondas.length,
    participantes: participantes.length, partidos: partidos.length, reglas: reglas.length,
  };
}

async function main() {
  console.log(`modo: ${modo}\n`);
  validarCanon();
  console.log('✓ el canon cierra: la jornada 1 da la tabla publicada y la tabla da las semis publicadas\n');

  const [torneo] = await leer(`tournaments?select=id,name,current_season_id&slug=eq.${TORNEO_SLUG}`);
  if (!torneo) throw new Error(`no existe el torneo ${TORNEO_SLUG} — corré seed.mjs primero`);
  const temporadas = await leer(`tournament_seasons?select=id,season_code,status&tournament_id=eq.${torneo.id}&order=season_code`);
  const existente = temporadas.find((s) => s.season_code === TEMPORADA);
  const anterior = temporadas.filter((s) => s.season_code < TEMPORADA).at(-1) ?? null;

  if (process.argv.includes('--limpiar')) {
    if (!existente) { console.log(`${NOMBRE} no tiene temporada ${TEMPORADA}: no hay nada que borrar.`); return; }
    console.log(`se borra la temporada ${TEMPORADA} de ${torneo.name} y vuelve a ser actual la ${anterior?.season_code ?? '—'}`);
    if (modo === 'plan') { console.log('\nmodo --plan: no se borró nada.'); return; }
    await limpiarTemporada(torneo, existente.id, anterior);
    console.log('✓ borrada');
    return;
  }

  if (existente) {
    console.log(`${NOMBRE} ya tiene temporada ${TEMPORADA} (${existente.id}): no se escribe nada.`);
    console.log('Para rehacerla: --execute --limpiar y después --execute.');
    return;
  }

  // ── Qué falta ─────────────────────────────────────────────────────────────
  const todos = ZONAS.flatMap((z) => z.clubes);
  const existentes = new Set((await leer(`clubs?select=id&id=in.(${todos.join(',')})`)).map((c) => c.id));
  const clubesNuevos = CLUBES_NUEVOS.filter((c) => !existentes.has(c.id));
  const faltan = todos.filter((id) => !existentes.has(id) && !CLUBES_NUEVOS.some((c) => c.id === id));
  if (faltan.length) throw new Error(`clubes que no están ni en la base ni en el canon: ${faltan.join(', ')}`);

  const uniones = new Set((await leer(`unions?select=id&id=in.(${CLUBES_NUEVOS.map((c) => c.union_id).join(',')})`)).map((u) => u.id));
  const unionRota = CLUBES_NUEVOS.filter((c) => !uniones.has(c.union_id));
  if (unionRota.length) throw new Error(`uniones inexistentes: ${unionRota.map((c) => c.union_id).join(', ')}`);

  const rutaColores = path.join(REPO, 'scripts', 'm16-desarrollo', 'norte-2026-colores.json');
  if (!fs.existsSync(rutaColores)) throw new Error('falta norte-2026-colores.json — corré norte-2026-logos.mjs --execute primero');
  const colores = JSON.parse(fs.readFileSync(rutaColores, 'utf8'));

  console.log(`torneo: ${torneo.name} · temporada actual ${anterior?.season_code ?? '—'} → pasa a ${TEMPORADA}`);
  console.log(`\nclubes a crear (${clubesNuevos.length}):`);
  for (const c of clubesNuevos) console.log(`  + ${c.name.padEnd(17)} ${c.union_id}`);
  console.log(`\nzonas: ${ZONAS.map((z) => `${z.nombre} (${z.clubes.length})`).join(' · ')}`);
  console.log(`jornada 1: ${JORNADA_1.length} partidos con resultado`);
  for (const c of COPAS) {
    console.log(`${c.nombre} (${c.posiciones}): ${c.partidos.map((p) => `P${p.n} ${p.local.zona ? `${clubEnPosicion(p.local.pos, p.local.zona)} v ${clubEnPosicion(p.visitante.pos, p.visitante.zona)}` : p.ronda}`).join(' · ')}`);
  }

  if (modo === 'plan') { console.log('\nmodo --plan: no se escribió una sola fila.'); return; }

  // ── Escritura ─────────────────────────────────────────────────────────────
  await insertar('clubs', clubesNuevos.map((c) => filaDeClub(c, colores)));
  console.log(`\n✓ ${clubesNuevos.length} clubes`);

  const seasonId = crypto.randomUUID();
  let conteo;
  try {
    conteo = await escribirTemporada(torneo, seasonId, anterior);
  } catch (e) {
    await limpiarTemporada(torneo, seasonId, anterior).catch((e2) => {
      console.error(`  la limpieza de la temporada falló también: ${e2.message}`);
    });
    throw e;
  }
  console.log(`✓ temporada ${TEMPORADA}: ${conteo.fases} fases · ${conteo.zonas} zonas · ${conteo.rondas} rondas · ${conteo.participantes} participantes · ${conteo.partidos} partidos · ${conteo.reglas} reglas de avance`);

  // ── Rollback ──────────────────────────────────────────────────────────────
  const fases = `(SELECT id FROM public.tournament_phases WHERE season_id = '${seasonId}')`;
  const sql = [
    `-- Rollback de la carga del ${NOMBRE} ${TEMPORADA}.`,
    '-- Borra la temporada que creó esta corrida, le devuelve al torneo la anterior',
    '-- como actual y borra los clubes nuevos. Los clubes van último: los partidos',
    '-- los referencian por FK.',
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
  ];
  if (anterior) {
    sql.push(`UPDATE public.tournaments SET current_season_id = '${anterior.id}', season_id = '${anterior.season_code}', format = 'league' WHERE id = '${torneo.id}';`);
  }
  sql.push(`DELETE FROM public.tournament_seasons WHERE id = '${seasonId}';`);
  if (anterior) {
    sql.push(`UPDATE public.tournament_seasons SET status = 'active', is_active = true WHERE id = '${anterior.id}';`);
  }
  sql.push('');
  // Los siete del canon aunque esta corrida no los haya creado: si una corrida
  // anterior falló después de insertarlos, siguen siendo de esta carga.
  sql.push('-- Clubes de esta carga');
  sql.push(`DELETE FROM public.clubs WHERE id IN (${CLUBES_NUEVOS.map((c) => `'${c.id}'`).join(', ')});`, '');
  sql.push('COMMIT;');
  fs.writeFileSync(ROLLBACK, sql.join('\n') + '\n', 'utf8');
  console.log(`\nrollback escrito: ${ROLLBACK}`);

  console.log('\nfalta la tabla, que es persistida y no se rehace sola:');
  console.log(`  npx tsx src/scripts/arusa-recalcular.ts --torneo=${TORNEO_SLUG}`);
}

main().catch((e) => { console.error('\nFALLÓ:', e.message || e); process.exit(1); });
