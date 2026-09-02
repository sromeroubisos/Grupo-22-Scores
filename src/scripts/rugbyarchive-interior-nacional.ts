/**
 * Carga del histórico del Torneo del Interior (A/B/C) y el Nacional de Clubes
 * (A/B) desde rugbyarchive.net a G22.
 *
 *   npx tsx src/scripts/rugbyarchive-interior-nacional.ts --plan
 *   npx tsx src/scripts/rugbyarchive-interior-nacional.ts --execute
 *   ... [--comp=118] [--anio=2016] [--user=<uuid>]
 *
 * Mismo pipeline que `rugbyarchive-historico.ts` (Top 10 del Centro), con tres
 * diferencias:
 *  - CINCO competiciones → cinco torneos de G22. El Interior A y B ya existen
 *    (sus temporadas 2026, cargadas a mano, se saltean por la guarda de
 *    `season_code`); el Interior C y los dos Nacionales se CREAN acá, calcando
 *    la fila del Interior A.
 *  - Herencia del padre: cuando una rama (119/462/115) no tiene datos propios
 *    en un año, la API devuelve el payload del PADRE. Se detecta por
 *    `competizioneStagione.nomeCompetizione` y esa temporada se saltea.
 *  - Partidos de llave: el Nacional 1993-2002/2009-2011/2022-2025 no publica
 *    `partiteGiocate` — la fase final vive en `turniFasiFinali` y
 *    `construirEstructuraDeTemporada` la sintetiza (fechas y resultados reales).
 *
 * Reanudable: (tournament_id, season_code) es la guarda; una temporada a medio
 * escribir se limpia compensatoriamente y queda pendiente.
 * Todo entra con `settings.visibility = 'private'`.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import * as dotenv from 'dotenv';

import { fetchStagioneCompetizione } from '../lib/integrations/rugbyarchive/client.ts';
import type { RaStagione } from '../lib/integrations/rugbyarchive/torneo122.ts';
import {
  CLUBES_NUEVOS_INTERIOR,
  CLUB_MAP_INTERIOR,
  COMPETENCIAS,
  type CompetenciaInterior,
} from '../lib/integrations/rugbyarchive/interior-nacional.ts';
import {
  construirEstructuraDeTemporada,
  filtrarEstructura,
  type EstructuraDeTemporada,
} from '../lib/integrations/rugbyarchive/estructura.ts';

const REPO = process.cwd();
dotenv.config({ path: path.join(REPO, '.env.local') });

const CACHE = path.join(REPO, '.rugbyarchive-cache');
// --out=<sufijo> separa los archivos de salida cuando hay más de una sesión
// importando comps distintas a la vez (no se pisan el plan ni el rollback).
const SUFIJO = process.argv.find((a) => a.startsWith('--out='))?.slice(6);
const sufijo = SUFIJO ? `_${SUFIJO.toUpperCase()}` : '';
const PLAN_MD = path.join(REPO, `RUGBYARCHIVE_INTERIOR${sufijo}_PLAN.md`);
const ROLLBACK = path.join(REPO, `RUGBYARCHIVE_INTERIOR${sufijo}_ROLLBACK.sql`);
const LOG = path.join(REPO, `RUGBYARCHIVE_INTERIOR${sufijo}_LOG.jsonl`);

/** Actor del import del Top 10 del Centro; se usa si --user no viene y las temporadas existentes no tienen creador. */
const ACTOR_FALLBACK = '2442e0bd-59c9-404a-969d-edba2cfeaf6f';

/**
 * Ruleset estándar de los torneos de la UAR en G22 (calcado del Interior A).
 * Es el 4/2/0 con bonus del rugby de clubes y sirve igual fuera de Argentina:
 * las tablas del Uruguayo de Clubes cierran con esta cuenta (Old Christians
 * 2026: 11 ganados × 4 + 9 bonus ofensivos = 53 puntos, el número de la fuente).
 */
const RULESET_UAR = {
  phases: [{
    id: 'phase_1', name: 'Regular Season', format: 'league',
    standings: {
      bonus_rules: [
        { id: 'try_bonus', label: '4+ Tries', points_awarded: 1 },
        { id: 'close_loss', label: 'Loss < 7 pts', points_awarded: 1 },
      ],
      points_base: { win: 4, draw: 2, loss: 0 },
    },
    tiebreakers: { order: ['points', 'diff', 'head_to_head', 'tries', 'fair_play'] },
  }],
  standings: {
    bonus_rules: [
      { id: 'try_bonus', label: '4+ Tries', points_awarded: 1 },
      { id: 'close_loss', label: 'Loss < 7 pts', points_awarded: 1 },
    ],
    points_base: { win: 4, draw: 2, loss: 0 },
  },
  competition: { parameters: {}, format_type: 'league' },
  tiebreakers: { order: ['points', 'diff', 'head_to_head', 'tries', 'fair_play'] },
};

const modo = process.argv.includes('--execute') ? 'execute'
  : process.argv.includes('--plan') ? 'plan' : null;
if (!modo) { console.error('usá --plan o --execute'); process.exit(2); }
const soloAnio = process.argv.find((a) => a.startsWith('--anio='))?.slice(7) || null;
// --comp acepta una lista: --comp=116,117,342
const soloComps = process.argv.find((a) => a.startsWith('--comp='))?.slice(7).split(',').filter(Boolean) || null;

const URL_BASE = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
if (!URL_BASE || !KEY) throw new Error('Faltan credenciales en .env.local');
const H = { apikey: KEY, authorization: `Bearer ${KEY}` };

/**
 * Reintenta errores transitorios (ECONNRESET, y los 5xx que Cloudflare devuelve
 * como HTML). Un 4xx es un error real y se devuelve sin reintentar.
 */
async function fetchConReintentos(url: string, opts: RequestInit, intentos = 4): Promise<Response> {
  for (let i = 1; ; i++) {
    try {
      const res = await fetch(url, opts);
      if (res.status < 500 || i >= intentos) return res;
    } catch (e) {
      if (i >= intentos) throw e;
    }
    await new Promise((r) => setTimeout(r, 1500 * i));
  }
}

async function selectAll<T = any>(recurso: string): Promise<T[]> {
  const filas: T[] = [];
  for (let desde = 0; ; desde += 1000) {
    const res = await fetch(encodeURI(`${URL_BASE}/rest/v1/${recurso}`), {
      headers: { ...H, range: `${desde}-${desde + 999}` },
    });
    if (!res.ok) throw new Error(`${recurso}: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
    const chunk = await res.json() as T[];
    filas.push(...chunk);
    if (chunk.length < 1000) break;
  }
  return filas;
}

async function insertar(tabla: string, filas: unknown[]): Promise<void> {
  if (!filas.length) return;
  const res = await fetch(`${URL_BASE}/rest/v1/${tabla}`, {
    method: 'POST',
    headers: { ...H, 'content-type': 'application/json', prefer: 'return=minimal' },
    body: JSON.stringify(filas),
  });
  if (!res.ok) throw new Error(`POST ${tabla}: HTTP ${res.status} ${(await res.text()).slice(0, 300)}`);
}

async function actualizar(recurso: string, patch: unknown): Promise<void> {
  const res = await fetch(encodeURI(`${URL_BASE}/rest/v1/${recurso}`), {
    method: 'PATCH',
    headers: { ...H, 'content-type': 'application/json', prefer: 'return=minimal' },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(`PATCH ${recurso}: HTTP ${res.status} ${(await res.text()).slice(0, 300)}`);
}

async function borrar(recurso: string): Promise<void> {
  const res = await fetch(encodeURI(`${URL_BASE}/rest/v1/${recurso}`), {
    method: 'DELETE',
    headers: { ...H, prefer: 'return=minimal' },
  });
  if (!res.ok) throw new Error(`DELETE ${recurso}: HTTP ${res.status} ${(await res.text()).slice(0, 300)}`);
}

const anotar = (e: unknown) => fs.appendFileSync(LOG, JSON.stringify(e) + '\n', 'utf8');

async function limpiarTemporada(seasonId: string): Promise<void> {
  for (const tabla of ['tournament_standings', 'matches', 'tournament_rounds', 'tournament_groups', 'tournament_phases', 'season_rosters']) {
    await borrar(`${tabla}?season_id=eq.${seasonId}`);
  }
  await actualizar(`tournament_participants?season_id=eq.${seasonId}`, { season_entry_id: null });
  await borrar(`team_season_entries?season_id=eq.${seasonId}`);
  await borrar(`tournament_participants?season_id=eq.${seasonId}`);
  await borrar(`tournament_seasons?id=eq.${seasonId}`);
}

interface ClubInfo { name: string; short_name: string | null }

interface TemporadaPendiente {
  target: CompetenciaInterior;
  year: string;
  nombre: string;
  /** 'completa' cubre también las temporadas SOLO-TABLA (la vieja Segunda de
   *  la URBA publica la tabla final sin partidos): el escritor banca cero
   *  partidos y escribe fases, grupos, tablas y participantes igual. */
  tipo: 'completa' | 'solo-campeon';
  est: EstructuraDeTemporada;
  campeonRaNome: string | null;
}

/** Mapa de clubes efectivo de una competición: el global + sus correcciones. */
function mapaDe(target: CompetenciaInterior): Record<number, string> {
  return target.overridesClubMap
    ? { ...CLUB_MAP_INTERIOR, ...target.overridesClubMap }
    : CLUB_MAP_INTERIOR;
}

async function escribirTemporadaCompleta(params: {
  tournamentId: string;
  pend: TemporadaPendiente;
  actor: string;
  clubes: Map<string, ClubInfo>;
  puntos: { win: number; draw: number; loss: number };
}): Promise<{ seasonId: string; fases: number; grupos: number; rondas: number; partidos: number; tabla: number }> {
  const { tournamentId, pend, actor, clubes, puntos } = params;
  const { est, nombre } = pend;
  const clubMap = mapaDe(pend.target);
  const ahora = new Date().toISOString();
  const seasonId = crypto.randomUUID();
  const nombreDe = (clubId: string | null) => (clubId ? clubes.get(clubId)?.name || clubId : null);

  try {
    await insertar('tournament_seasons', [{
      id: seasonId,
      tournament_id: tournamentId,
      legacy_tournament_id: tournamentId,
      season_code: est.year,
      name: nombre,
      display_name: nombre,
      status: 'completed',
      is_active: false,
      start_date: est.desde,
      end_date: est.hasta,
      format: 'league',
      ruleset: {},
      settings: {
        source: 'historical-season-import',
        imported: true,
        visibility: 'private',
        origin: 'rugbyarchive',
        runner_up: nombreDe(est.subcampeonClubId),
        third_place: nombreDe(est.terceroClubId),
        ...(est.coCampeonesClubIds.length ? { co_champions: est.coCampeonesClubIds } : {}),
      },
      champion_club_id: est.campeonClubId,
      created_by_user_id: actor,
      created_at: ahora,
      updated_at: ahora,
    }]);

    // ── Participantes: 3 pasos por la FK circular con team_season_entries ────
    const primeraTabla = est.fases.find((f) => f.conTabla);
    const posicionDe = new Map<string, number>();
    for (const fila of primeraTabla ? [...primeraTabla.tablaUnica, ...primeraTabla.grupos.flatMap((g) => g.tabla)] : []) {
      if (fila.clubId && !posicionDe.has(fila.clubId)) posicionDe.set(fila.clubId, fila.posicion);
    }
    const clubIds = Array.from(new Set(Array.from(est.clubesRaIds).map((ra) => clubMap[ra]).filter(Boolean)));
    const participantes = clubIds.map((clubId) => {
      const participantId = crypto.randomUUID();
      const entryId = crypto.randomUUID();
      const info = clubes.get(clubId);
      return {
        participante: {
          id: participantId, tournament_id: tournamentId, season_id: seasonId,
          season_entry_id: null as string | null, club_id: clubId,
          name: info?.name || clubId, type: 'club', status: 'active',
          seed: posicionDe.get(clubId) ?? null, short_code: info?.short_name || null,
          notes: null, created_at: ahora, updated_at: ahora,
        },
        entryId,
        entrada: {
          id: entryId, season_id: seasonId, tournament_id: tournamentId,
          club_id: clubId, team_id: null, source_participant_id: participantId,
          group_id: null, zone: null, category: null, status: 'active',
          seed: posicionDe.get(clubId) ?? null, notes: null,
          settings: { source: 'historical-season-import', imported_team_name: info?.name || clubId },
          created_at: ahora, updated_at: ahora,
        },
      };
    });
    await insertar('tournament_participants', participantes.map((p) => p.participante));
    await insertar('team_season_entries', participantes.map((p) => p.entrada));
    for (const p of participantes) {
      await actualizar(`tournament_participants?id=eq.${p.participante.id}`, { season_entry_id: p.entryId });
    }
    await insertar('season_rosters', participantes.map((p) => ({
      season_id: seasonId, tournament_id: tournamentId,
      team_season_entry_id: p.entryId, club_id: p.entrada.club_id, team_id: null,
      name: `Plantel ${est.year}`, roster_type: 'official', status: 'active',
      settings: { source: 'historical-season-import' },
      created_at: ahora, updated_at: ahora,
    })));

    // ── Fases, grupos, rondas, partidos, tablas ──────────────────────────────
    const filasFases: Record<string, unknown>[] = [];
    const filasGrupos: Record<string, unknown>[] = [];
    const filasRondas: Record<string, unknown>[] = [];
    const filasPartidos: Record<string, unknown>[] = [];
    const filasTabla: Record<string, unknown>[] = [];
    // Zona inicial de cada club (la primera fase con grupos): la página
    // pública agrupa participantes y entries por ese group_id.
    const zonaInicial: Array<{ groupId: string; clubIds: string[] }> = [];

    for (const fase of est.fases) {
      const phaseId = crypto.randomUUID();
      // tournament_phases NO tiene start_date/end_date (columna fantasma): el
      // rango de fechas vive en las rondas.
      // Una fase con zonas va como 'group_stage': la vista por zonas del
      // detalle público SOLO se arma con ese phase_type (lección del primer
      // import, que dejó todo como 'league' y las zonas no se veían).
      filasFases.push({
        id: phaseId, tournament_id: tournamentId, season_id: seasonId,
        name: fase.nombre, phase_type: fase.grupos.length ? 'group_stage' : fase.tipo,
        order_index: fase.orden,
        is_active: fase.orden === 1,
        settings: {
          source: 'historical_import', imported: true, origin: 'rugbyarchive',
          source_phase: fase.nombreFuente,
          ...(fase.conTabla ? { standings: { mode: 'fully_manual', editable: false } } : {}),
        },
        created_at: ahora, updated_at: ahora,
      });

      const grupoIdPorNombre = new Map<string, string>();
      for (const g of fase.grupos) {
        const groupId = crypto.randomUUID();
        grupoIdPorNombre.set(g.nombre, groupId);
        filasGrupos.push({ id: groupId, phase_id: phaseId, season_id: seasonId, name: g.nombre, order_index: g.orden });
        if (fase === est.fases.filter((f) => f.grupos.length).sort((a, b) => a.orden - b.orden)[0]) {
          const clubIds = Array.from(new Set(g.tabla.map((fila) => fila.clubId).filter((c): c is string => Boolean(c))));
          if (clubIds.length) zonaInicial.push({ groupId, clubIds });
        }
      }

      const rondaIdPorClave = new Map<string, string>();
      for (const r of fase.rondas) {
        const roundId = crypto.randomUUID();
        rondaIdPorClave.set(r.clave, roundId);
        filasRondas.push({
          id: roundId, phase_id: phaseId, season_id: seasonId,
          name: r.nombre, order_index: r.orden,
          start_date: r.desde, end_date: r.hasta, is_completed: true,
          notes: `Importada desde ${fase.nombreFuente} (rugbyarchive)`,
          created_at: ahora, updated_at: ahora,
        });
      }

      for (const p of fase.partidos) {
        const base = p.homeScore > p.awayScore
          ? { home: puntos.win, away: puntos.loss }
          : p.homeScore < p.awayScore
            ? { home: puntos.loss, away: puntos.win }
            : { home: puntos.draw, away: puntos.draw };
        filasPartidos.push({
          id: crypto.randomUUID(), tournament_id: tournamentId, season_id: seasonId,
          phase_id: phaseId, round_uuid: rondaIdPorClave.get(p.ronda) || null,
          group_id: p.grupoNombre ? grupoIdPorNombre.get(p.grupoNombre) || null : null,
          home_club_id: p.homeClubId, away_club_id: p.awayClubId,
          date_time: `${p.iso}T12:00:00.000Z`, venue: null, status: 'final',
          score: { home: p.homeScore, away: p.awayScore },
          notes: `Importado desde ${p.etiquetaFuente}`,
          home_base_points: base.home, away_base_points: base.away,
          home_bonus_points: 0, away_bonus_points: 0,
          points_autocalculated: true, points_override_reason: null,
          created_at: ahora, updated_at: ahora,
        });
      }

      const tablas = fase.grupos.length
        ? fase.grupos.map((g) => ({ groupId: grupoIdPorNombre.get(g.nombre) || null, filas: g.tabla }))
        : (fase.tablaUnica.length ? [{ groupId: null as string | null, filas: fase.tablaUnica }] : []);
      for (const t of tablas) {
        for (const fila of t.filas) {
          if (!fila.clubId) continue;
          filasTabla.push({
            id: crypto.randomUUID(), tournament_id: tournamentId, season_id: seasonId,
            phase_id: phaseId, group_id: t.groupId, club_id: fila.clubId,
            position: fila.posicion, played: fila.jugados, won: fila.ganados,
            drawn: fila.empatados, lost: fila.perdidos, points: fila.puntos,
            scored: fila.aFavor, conceded: fila.enContra,
            bonus_points: fila.bonusOfensivo + fila.bonusDefensivo,
            form: null, streak: null,
            stats: {
              imported: true, difference: fila.diferencia,
              try_bonus: fila.bonusOfensivo, losing_bonus: fila.bonusDefensivo,
              note: fila.nota, team_name: fila.nombreRA, status: fila.nota,
            },
            last_updated: ahora,
          });
        }
      }
    }

    await insertar('tournament_phases', filasFases);
    await insertar('tournament_groups', filasGrupos);
    await insertar('tournament_rounds', filasRondas);
    await insertar('matches', filasPartidos);
    await insertar('tournament_standings', filasTabla);

    // La zona inicial se asigna DESPUÉS de insertar los grupos (group_id los
    // referencia). Un club que aparece en dos grupos de la misma fase (Zona 1
    // y Repechaje del Nacional 2005) se queda con el primero.
    const yaAsignados = new Set<string>();
    for (const z of zonaInicial) {
      const clubIds = z.clubIds.filter((c) => !yaAsignados.has(c));
      if (!clubIds.length) continue;
      for (const c of clubIds) yaAsignados.add(c);
      await actualizar(`tournament_participants?season_id=eq.${seasonId}&club_id=in.(${clubIds.join(',')})`, { group_id: z.groupId });
      await actualizar(`team_season_entries?season_id=eq.${seasonId}&club_id=in.(${clubIds.join(',')})`, { group_id: z.groupId });
    }

    return {
      seasonId,
      fases: filasFases.length,
      grupos: filasGrupos.length,
      rondas: filasRondas.length,
      partidos: filasPartidos.length,
      tabla: filasTabla.length,
    };
  } catch (e) {
    try { await limpiarTemporada(seasonId); } catch (e2) {
      console.error(`  limpieza de ${est.year} falló también:`, e2 instanceof Error ? e2.message : e2);
    }
    throw e;
  }
}

async function main() {
  console.log(`modo: ${modo}${soloComps ? ` · comps ${soloComps.join(',')}` : ''}${soloAnio ? ` · solo ${soloAnio}` : ''}\nleyendo la base…`);
  const targets = COMPETENCIAS.filter((t) => !soloComps || soloComps.includes(String(t.comp)));

  // ── Torneos: cuáles existen, cuáles se crean ──────────────────────────────
  const slugs = targets.map((t) => t.slug);
  const torneosDb = await selectAll<{ id: string; slug: string; ruleset: { standings?: { points_base?: { win?: number; draw?: number; loss?: number } } } | null }>(
    `tournaments?select=id,slug,ruleset&slug=in.(${slugs.join(',')})`);
  const torneoPorSlug = new Map(torneosDb.map((t) => [t.slug, t]));
  const torneosACrear = targets.filter((t) => !torneoPorSlug.get(t.slug));
  for (const t of torneosACrear) {
    if (!t.crear) throw new Error(`El torneo ${t.slug} no existe en la base y no tiene receta de creación`);
  }
  // Ids reservados de antemano para que el plan y el rollback los muestren.
  const idNuevoPorSlug = new Map(torneosACrear.map((t) => [t.slug, crypto.randomUUID()]));
  const tournamentIdDe = (t: CompetenciaInterior) => torneoPorSlug.get(t.slug)?.id || idNuevoPorSlug.get(t.slug)!;

  // ── Temporadas existentes por torneo ──────────────────────────────────────
  const idsExistentes = torneosDb.map((t) => t.id);
  const temporadasDb = idsExistentes.length
    ? await selectAll<{ id: string; tournament_id: string; season_code: string; created_by_user_id: string | null }>(
      `tournament_seasons?select=id,tournament_id,season_code,created_by_user_id&tournament_id=in.(${idsExistentes.join(',')})`)
    : [];
  const codigosDe = new Map<string, Set<string>>();
  for (const s of temporadasDb) {
    if (!codigosDe.has(s.tournament_id)) codigosDe.set(s.tournament_id, new Set());
    codigosDe.get(s.tournament_id)!.add(s.season_code);
  }
  const actor = process.argv.find((a) => a.startsWith('--user='))?.slice(7)
    || temporadasDb.find((s) => s.created_by_user_id)?.created_by_user_id
    || ACTOR_FALLBACK;

  // ── Clubes ────────────────────────────────────────────────────────────────
  const idsNecesarios = Array.from(new Set(Object.values(CLUB_MAP_INTERIOR)));
  const clubesFilas = await selectAll<{ id: string; name: string; short_name: string | null }>(
    `clubs?select=id,name,short_name&id=in.(${idsNecesarios.join(',')})`);
  const clubes = new Map(clubesFilas.map((c) => [c.id, { name: c.name, short_name: c.short_name }]));
  const clubesACrear = CLUBES_NUEVOS_INTERIOR.filter((c) => !clubes.has(String(c.id)));
  const faltanYNoSeCrean = idsNecesarios.filter(
    (id) => !clubes.has(id) && !CLUBES_NUEVOS_INTERIOR.some((c) => c.id === id));
  if (faltanYNoSeCrean.length) {
    throw new Error(`Clubes del mapeo que no existen ni están en CLUBES_NUEVOS_INTERIOR: ${faltanYNoSeCrean.join(', ')}`);
  }

  console.log(`  torneos existentes: ${torneosDb.map((t) => t.slug).join(', ') || '(ninguno)'}`);
  console.log(`  torneos a crear: ${torneosACrear.map((t) => t.slug).join(', ') || '(ninguno)'}`);
  console.log(`  clubes a crear: ${clubesACrear.length ? clubesACrear.map((c) => c.id).join(', ') : '(ninguno)'}`);

  // ── Descarga (caché primero) y armado ─────────────────────────────────────
  console.log('\nleyendo rugbyarchive (caché primero)…');
  const pendientes: TemporadaPendiente[] = [];
  const heredadas: string[] = [];   // la rama no jugó ese año: payload del padre
  const salteadas: string[] = [];   // ya está en la base
  const vacias: string[] = [];
  const errores: string[] = [];

  for (const target of targets) {
    const codigos = codigosDe.get(tournamentIdDe(target)) || new Set();
    const anios = soloAnio ? [soloAnio] : target.years;
    for (const year of anios) {
      const res = await fetchStagioneCompetizione<RaStagione>(target.comp, year, { cacheDir: CACHE });
      if (!res.ok || !res.data) { errores.push(`${target.comp}-${year}: ${res.error || 'sin payload'}`); continue; }
      // Propia vs heredada: por id, no por nombre — el nombre cambia por época
      // (URBA Top 14/Top 12…) pero un payload heredado trae el id del PADRE.
      // `compsAceptadas` suma los ids de la misma competición renombrada
      // (la SLAR 579 es el Super Rugby Americas 678 con el nombre viejo).
      const idPayload = res.data.competizioneStagione?.idCompetizione;
      if (idPayload !== target.comp && !target.compsAceptadas?.includes(idPayload as number)) {
        heredadas.push(`${target.comp}-${year}`);
        continue;
      }
      if (codigos.has(year)) { salteadas.push(`${target.slug} ${year}`); continue; }
      let est = construirEstructuraDeTemporada(year, res.data, mapaDe(target), { aliasTurno: target.aliasTurno });
      if (target.soloFases) {
        est = filtrarEstructura(est, (n) => target.soloFases!(n, year), {
          campeonDesdeLlave: target.campeonDesdeLlave,
        });
      }
      // El `vincitori` del payload es el campeón de la línea principal: una
      // rama que deriva su campeón de la llave (la Plata del Oeste) no lo usa
      // ni para el fallback solo-campeón ni para el bloqueo de mapeo.
      const campeonRaNome = target.campeonDesdeLlave
        ? null
        : res.data.vincitori?.[0]?.squadre?.[0]?.nome || null;
      const nombre = target.nombreTemporada(year, res.data.competizioneStagione?.nomeCompetizione || '');
      // Tabla REAL = alguna fila con partidos jugados o puntos. Los sorteos
      // que no se jugaron (2020, covid) publican la tabla en cero: eso no es
      // una temporada, se saltea como vacía.
      const tieneTablaReal = est.fases.some((f) =>
        [...f.tablaUnica, ...f.grupos.flatMap((g) => g.tabla)].some((r) => r.jugados > 0 || r.puntos > 0));
      if (est.partidos > 0 || tieneTablaReal) {
        pendientes.push({ target, year, nombre, tipo: 'completa', est, campeonRaNome });
      } else if (campeonRaNome) {
        pendientes.push({ target, year, nombre, tipo: 'solo-campeon', est, campeonRaNome });
      } else {
        vacias.push(`${target.comp}-${year}`);
      }
    }
  }

  // ── Validaciones que frenan ───────────────────────────────────────────────
  const bloqueos: string[] = [];
  for (const p of pendientes) {
    const eti = `${p.target.slug} ${p.year}`;
    for (const c of p.est.sinMapa) bloqueos.push(`${eti}: club sin mapear ${c.id} "${c.nome}"`);
    for (const s of p.est.sinFase) bloqueos.push(`${eti}: partido sin fase ${s}`);
    if (p.campeonRaNome && !p.est.campeonClubId) bloqueos.push(`${eti}: campeón "${p.campeonRaNome}" sin mapeo`);
    if (p.est.desde && p.est.desde.slice(0, 4) !== p.year) {
      bloqueos.push(`${eti}: la primera fecha cae en ${p.est.desde.slice(0, 4)}`);
    }
  }

  const completas = pendientes.filter((p) => p.tipo === 'completa');
  const soloCampeon = pendientes.filter((p) => p.tipo === 'solo-campeon');
  const totalPartidos = completas.reduce((s, p) => s + p.est.partidos, 0);

  // ── Plan legible ──────────────────────────────────────────────────────────
  const md: string[] = [];
  md.push('# Plan de carga: Torneo del Interior A/B/C y Nacional de Clubes A/B');
  md.push('');
  md.push(`Generado por \`rugbyarchive-interior-nacional.ts --${modo}\`.`);
  md.push('');
  md.push('| Competición RA | Torneo G22 | Estado |');
  md.push('|---|---|---|');
  for (const t of targets) {
    const estado = torneoPorSlug.get(t.slug) ? `existe (\`${torneoPorSlug.get(t.slug)!.id}\`)` : `SE CREA (\`${idNuevoPorSlug.get(t.slug)}\`)`;
    md.push(`| ${t.comp} ${t.nombreEsperado} | ${t.slug} | ${estado} |`);
  }
  md.push('');
  md.push(`- Temporadas completas a importar: **${completas.length}** (${totalPartidos} partidos)`);
  md.push(`- Temporadas solo-campeón: **${soloCampeon.length}**`);
  md.push(`- Heredadas del padre (la rama no jugó ese año, no se cargan): ${heredadas.join(', ') || '—'}`);
  md.push(`- Ya en la base (se saltean): ${salteadas.join(', ') || '—'}`);
  md.push(`- Vacías: ${vacias.join(', ') || '—'}`);
  md.push(`- Clubes nuevos a crear: ${clubesACrear.map((c) => `\`${c.id}\``).join(', ') || '—'}`);
  if (errores.length) md.push(`- Errores de descarga: ${errores.join(' · ')}`);
  md.push('');
  if (bloqueos.length) {
    md.push('## BLOQUEOS (no se ejecuta hasta resolverlos)');
    for (const b of bloqueos) md.push(`- ${b}`);
    md.push('');
  }
  for (const t of targets) {
    const propias = pendientes.filter((p) => p.target === t);
    if (!propias.length) continue;
    md.push(`## ${t.slug}`);
    md.push('');
    md.push('| Año | Nombre | Tipo | Partidos | Desc. | Fases (grupos) | Campeón (RA) |');
    md.push('|---|---|---|---|---|---|---|');
    for (const p of propias) {
      const fases = p.est.fases
        .map((f) => `${f.nombre}${f.grupos.length ? ` [${f.grupos.map((g) => g.nombre).join('·')}]` : ''}${f.conTabla ? '†' : ''}`)
        .join(' → ');
      md.push(`| ${p.year} | ${p.nombre} | ${p.tipo} | ${p.est.partidos} | ${p.est.descartados.length} | ${fases || '—'} | ${p.campeonRaNome ?? '—'} |`);
    }
    md.push('');
  }
  const descartesTotales = pendientes.flatMap((p) =>
    p.est.descartados.map((d) => `${p.target.slug} ${p.year}: ${d}`));
  if (descartesTotales.length) {
    md.push('## Partidos descartados (no importables)');
    md.push('');
    for (const d of descartesTotales) md.push(`- ${d}`);
    md.push('');
  }
  const avisosTotales = pendientes.flatMap((p) =>
    p.est.avisos.map((a) => `${p.target.slug} ${p.year}: ${a}`));
  if (avisosTotales.length) {
    md.push('## Avisos (correcciones aplicadas, no frenan)');
    md.push('');
    for (const a of avisosTotales) md.push(`- ${a}`);
    md.push('');
  }
  fs.writeFileSync(PLAN_MD, md.join('\n') + '\n', 'utf8');
  console.log(`\nplan escrito: ${PLAN_MD}`);
  console.log(`  completas ${completas.length} (${totalPartidos} partidos) · solo-campeón ${soloCampeon.length} · heredadas ${heredadas.length} · salteadas ${salteadas.length} · bloqueos ${bloqueos.length}`);

  // ── Rollback, ANTES de escribir ───────────────────────────────────────────
  const sql: string[] = [];
  sql.push('-- Rollback de la carga histórica de rugbyarchive (Interior A/B/C + Nacional A/B).');
  sql.push('-- Generado ANTES de ejecutar. El corte es (tournament_id, season_code): las');
  sql.push('-- temporadas 2026 del Interior A/B, cargadas a mano, no están en las listas.');
  sql.push('BEGIN;');
  for (const t of targets) {
    const propias = pendientes.filter((p) => p.target === t);
    if (!propias.length) continue;
    const tid = tournamentIdDe(t);
    const codigos = propias.map((p) => `'${p.year}'`).join(',');
    const sub = `(SELECT id FROM public.tournament_seasons WHERE tournament_id = '${tid}' AND season_code IN (${codigos}))`;
    sql.push(`-- ${t.slug}`);
    sql.push(`DELETE FROM public.tournament_standings WHERE season_id IN ${sub};`);
    sql.push(`DELETE FROM public.matches WHERE season_id IN ${sub};`);
    sql.push(`DELETE FROM public.tournament_rounds WHERE season_id IN ${sub};`);
    sql.push(`DELETE FROM public.tournament_groups WHERE season_id IN ${sub};`);
    sql.push(`DELETE FROM public.tournament_phases WHERE season_id IN ${sub};`);
    sql.push(`DELETE FROM public.season_rosters WHERE season_id IN ${sub};`);
    sql.push(`UPDATE public.tournament_participants SET season_entry_id = NULL WHERE season_id IN ${sub};`);
    sql.push(`DELETE FROM public.team_season_entries WHERE season_id IN ${sub};`);
    sql.push(`DELETE FROM public.tournament_participants WHERE season_id IN ${sub};`);
    sql.push(`DELETE FROM public.tournament_seasons WHERE tournament_id = '${tid}' AND season_code IN (${codigos});`);
  }
  if (torneosACrear.length) {
    sql.push('-- Torneos creados por esta carga (después de vaciar sus temporadas):');
    sql.push(`DELETE FROM public.tournaments WHERE slug IN (${torneosACrear.map((t) => `'${t.slug}'`).join(',')}) AND id IN (${torneosACrear.map((t) => `'${idNuevoPorSlug.get(t.slug)}'`).join(',')});`);
  }
  if (clubesACrear.length) {
    sql.push('-- Clubes creados por esta carga. Borrarlos SOLO si no participan de otra cosa:');
    sql.push(`-- DELETE FROM public.clubs WHERE id IN (${clubesACrear.map((c) => `'${c.id}'`).join(',')});`);
  }
  sql.push('COMMIT;');
  fs.writeFileSync(ROLLBACK, sql.join('\n') + '\n', 'utf8');
  console.log(`rollback escrito: ${ROLLBACK}`);

  if (modo === 'plan') { console.log('\nmodo --plan: no se escribió una sola fila.'); return; }
  if (bloqueos.length) { console.error('\nHay bloqueos: mirá el plan. No se escribe nada.'); process.exit(1); }

  // ── Escritura ─────────────────────────────────────────────────────────────
  anotar({ ts: new Date().toISOString(), evento: 'inicio', completas: completas.length, soloCampeon: soloCampeon.length });
  const ahora = new Date().toISOString();

  if (clubesACrear.length) {
    await insertar('clubs', clubesACrear);
    for (const c of clubesACrear) clubes.set(String(c.id), { name: String(c.name), short_name: String(c.short_name) });
    console.log(`clubes creados: ${clubesACrear.length}`);
    anotar({ ts: new Date().toISOString(), evento: 'clubes', creados: clubesACrear.map((c) => c.id) });
  }

  if (torneosACrear.length) {
    await insertar('tournaments', torneosACrear.map((t) => ({
      id: idNuevoPorSlug.get(t.slug),
      union_id: t.crear!.unionId || 'union-argentina-de-rugby',
      season_id: t.crear!.seasonCode,
      name: t.crear!.name,
      slug: t.slug,
      status: 'draft',
      category: null,
      age_grade: 'Mayores (Adults)',
      region: t.crear!.region,
      country: t.crear!.country || 'Argentina',
      format: 'league',
      is_visible: true,
      ruleset: RULESET_UAR,
      ruleset_version: 1,
      country_id: t.crear!.countryId || 'argentina',
      sport_id: 'rugby',
      sport: 'rugby',
      sport_name: 'Rugby',
      country_name: t.crear!.countryName || 'Argentina',
      is_popular: false,
      priority: t.crear!.priority,
      sponsors: [],
      social_links: {},
      original_name: t.crear!.name,
      display_order: 0,
      is_active: false,
      is_api_managed: false,
      review_status: 'approved',
      created_by_user_id: actor,
      created_at: ahora,
      updated_at: ahora,
    })));
    console.log(`torneos creados: ${torneosACrear.map((t) => t.slug).join(', ')}`);
    anotar({ ts: new Date().toISOString(), evento: 'torneos', creados: torneosACrear.map((t) => ({ slug: t.slug, id: idNuevoPorSlug.get(t.slug) })) });
  }

  if (soloCampeon.length) {
    const filas = soloCampeon.map((p) => ({
      tournament_id: tournamentIdDe(p.target),
      legacy_tournament_id: tournamentIdDe(p.target),
      season_code: p.year,
      name: p.nombre,
      display_name: p.nombre,
      status: 'completed',
      is_active: false,
      start_date: null,
      end_date: null,
      format: 'league',
      ruleset: {},
      settings: {
        source: 'historical-season-import',
        imported: true,
        visibility: 'private',
        origin: 'rugbyarchive',
        detail: 'solo campeón: rugbyarchive no tiene partidos de esta temporada',
        ...(p.est.coCampeonesClubIds.length ? { co_champions: p.est.coCampeonesClubIds } : {}),
      },
      champion_club_id: p.est.campeonClubId,
      created_by_user_id: actor,
      created_at: ahora,
      updated_at: ahora,
    }));
    await insertar('tournament_seasons', filas);
    console.log(`temporadas solo-campeón escritas: ${filas.length}`);
    anotar({ ts: new Date().toISOString(), evento: 'solo-campeon', cantidad: filas.length });
  }

  let hechas = 0, fallidas = 0;
  for (const p of completas) {
    const tid = tournamentIdDe(p.target);
    const puntosBase = torneoPorSlug.get(p.target.slug)?.ruleset?.standings?.points_base;
    const puntos = {
      win: Number(puntosBase?.win ?? 4),
      draw: Number(puntosBase?.draw ?? 2),
      loss: Number(puntosBase?.loss ?? 0),
    };
    const etiqueta = `[${p.target.slug} ${p.year}] ${p.nombre}`;
    try {
      const r = await escribirTemporadaCompleta({ tournamentId: tid, pend: p, actor, clubes, puntos });
      hechas++;
      console.log(`${etiqueta} ok · fases ${r.fases} · grupos ${r.grupos} · rondas ${r.rondas} · partidos ${r.partidos} · tabla ${r.tabla}`);
      anotar({ ts: new Date().toISOString(), evento: 'ok', comp: p.target.comp, anio: p.year, seasonId: r.seasonId, creado: r });
    } catch (e: any) {
      fallidas++;
      console.error(`${etiqueta} FALLÓ: ${e.message}`);
      anotar({ ts: new Date().toISOString(), evento: 'fallo', comp: p.target.comp, anio: p.year, error: String(e.message) });
    }
  }
  if (completas.length) console.log(`\ntemporadas completas: ${hechas} ok · ${fallidas} fallidas`);

  // ── current_season_id de los torneos creados ──────────────────────────────
  for (const t of torneosACrear) {
    const tid = idNuevoPorSlug.get(t.slug)!;
    const ultimas = await selectAll<{ id: string; season_code: string }>(
      `tournament_seasons?select=id,season_code&tournament_id=eq.${tid}&order=season_code.desc&limit=1`);
    if (ultimas.length) {
      await actualizar(`tournaments?id=eq.${tid}`, {
        current_season_id: ultimas[0].id,
        season_id: ultimas[0].season_code,
        updated_at: new Date().toISOString(),
      });
    }
  }

  if (fallidas) {
    console.error('Volvé a correr --execute: las temporadas ya escritas se saltean solas.');
    process.exit(1);
  }

  anotar({ ts: new Date().toISOString(), evento: 'fin' });
  console.log('\nlisto. Todo quedó privado: se publica después de revisarlo.');
}

main().catch((e) => { console.error(e); process.exit(1); });
