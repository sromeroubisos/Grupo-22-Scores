/**
 * Carga del histórico del Torneo Cordobés / Región Centro (1931-2023) desde
 * rugbyarchive.net (competición 122) al torneo "Top 10 del Centro" de G22.
 *
 *   npx tsx src/scripts/rugbyarchive-historico.ts --plan      no escribe nada
 *   npx tsx src/scripts/rugbyarchive-historico.ts --execute   escribe
 *   ... [--anio=2013]                                         limita a un año
 *
 * ── Dos carriles ────────────────────────────────────────────────────────────
 * Temporadas con partidos (2000-2023): estructura FIEL construida por
 * `lib/integrations/rugbyarchive/estructura.ts` — una fase de G22 por fase de
 * la fuente, zonas como `tournament_groups` con su propia tabla, llaves con
 * sus rondas — escrita directo con las MISMAS formas de fila que produce
 * `HistoricalTournamentImportService.confirmIntoSeason` (participantes en 3
 * pasos por la FK circular, tablas `fully_manual`, todo privado). El wizard
 * mismo no se usa acá porque aplana a liga+playoff y una sola tabla.
 *
 * Temporadas solo-campeón (1931-1999): una fila en `tournament_seasons` con
 * `champion_club_id`, sin hijos.
 *
 * ── Por qué se puede reanudar ───────────────────────────────────────────────
 * (tournament_id, season_code) es la guarda: lo existente se saltea. Si una
 * temporada falla a medio escribir, la limpieza compensatoria borra sus hijos
 * por season_id y la temporada vuelve a estar pendiente.
 *
 * ── Visibilidad ─────────────────────────────────────────────────────────────
 * Todo entra con `settings.visibility = 'private'`, igual que 2024/2025.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import * as dotenv from 'dotenv';

import { fetchStagioneCompetizione } from '../lib/integrations/rugbyarchive/client.ts';
import {
  CLUBES_NUEVOS,
  CLUB_MAP,
  RA_COMP_ID,
  construirPlanDeTemporada,
  type PlanDeTemporada,
  type RaStagione,
} from '../lib/integrations/rugbyarchive/torneo122.ts';
import {
  construirEstructuraDeTemporada,
  type EstructuraDeTemporada,
} from '../lib/integrations/rugbyarchive/estructura.ts';

const REPO = process.cwd();
dotenv.config({ path: path.join(REPO, '.env.local') });

const TOURNAMENT_ID = '55f28144-3d92-484b-a57d-646e06740808'; // Top 10 del Centro
const CACHE = path.join(REPO, '.rugbyarchive-cache');
const PLAN_MD = path.join(REPO, 'RUGBYARCHIVE_HISTORICO_PLAN.md');
const ROLLBACK = path.join(REPO, 'RUGBYARCHIVE_HISTORICO_ROLLBACK.sql');
const LOG = path.join(REPO, 'RUGBYARCHIVE_HISTORICO_LOG.jsonl');

const ANIOS: string[] = [];
for (let y = 1931; y <= 2023; y++) ANIOS.push(String(y));

const modo = process.argv.includes('--execute') ? 'execute'
  : process.argv.includes('--plan') ? 'plan' : null;
if (!modo) { console.error('usá --plan o --execute'); process.exit(2); }
const soloAnio = process.argv.find((a) => a.startsWith('--anio='))?.slice(7) || null;

const URL_BASE = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
if (!URL_BASE || !KEY) throw new Error('Faltan credenciales en .env.local');
const H = { apikey: KEY, authorization: `Bearer ${KEY}` };

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

/** Limpieza compensatoria: deja la temporada como si nunca se hubiera escrito. */
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

async function escribirTemporadaCompleta(params: {
  plan: PlanDeTemporada;
  est: EstructuraDeTemporada;
  actor: string;
  clubes: Map<string, ClubInfo>;
  puntos: { win: number; draw: number; loss: number };
}): Promise<{ seasonId: string; fases: number; grupos: number; rondas: number; partidos: number; tabla: number }> {
  const { plan, est, actor, clubes, puntos } = params;
  const ahora = new Date().toISOString();
  const seasonId = crypto.randomUUID();
  const nombreDe = (clubId: string | null) => (clubId ? clubes.get(clubId)?.name || clubId : null);

  try {
    await insertar('tournament_seasons', [{
      id: seasonId,
      tournament_id: TOURNAMENT_ID,
      legacy_tournament_id: TOURNAMENT_ID,
      season_code: est.year,
      name: plan.nombre,
      display_name: plan.nombre,
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
    const clubIds = Array.from(new Set(Array.from(est.clubesRaIds).map((ra) => CLUB_MAP[ra]).filter(Boolean)));
    const participantes = clubIds.map((clubId) => {
      const participantId = crypto.randomUUID();
      const entryId = crypto.randomUUID();
      const info = clubes.get(clubId);
      return {
        participante: {
          id: participantId, tournament_id: TOURNAMENT_ID, season_id: seasonId,
          season_entry_id: null as string | null, club_id: clubId,
          name: info?.name || clubId, type: 'club', status: 'active',
          seed: posicionDe.get(clubId) ?? null, short_code: info?.short_name || null,
          notes: null, created_at: ahora, updated_at: ahora,
        },
        entryId,
        entrada: {
          id: entryId, season_id: seasonId, tournament_id: TOURNAMENT_ID,
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
      season_id: seasonId, tournament_id: TOURNAMENT_ID,
      team_season_entry_id: p.entryId, club_id: p.entrada.club_id, team_id: null,
      name: `Plantel ${est.year}`, roster_type: 'official', status: 'active',
      settings: { source: 'historical-season-import' },
      created_at: ahora, updated_at: ahora,
    })));

    // ── Fases, grupos, rondas ───────────────────────────────────────────────
    const filasFases: Record<string, unknown>[] = [];
    const filasGrupos: Record<string, unknown>[] = [];
    const filasRondas: Record<string, unknown>[] = [];
    const filasPartidos: Record<string, unknown>[] = [];
    const filasTabla: Record<string, unknown>[] = [];
    // Zona inicial de cada club (primera fase con grupos): la página pública
    // agrupa participantes y entries por ese group_id.
    const zonaInicial: Array<{ groupId: string; clubIds: string[] }> = [];

    for (const fase of est.fases) {
      const phaseId = crypto.randomUUID();
      // tournament_phases no tiene start_date/end_date (columna fantasma que ya
      // mordió: el servicio del wizard las inserta como "opcionales" y las
      // descarta en el retry). El rango de fechas vive en las rondas.
      // Una fase con zonas va como 'group_stage': la vista por zonas del
      // detalle público SOLO se arma con ese phase_type. Las fases de esta
      // carga que quedaron como 'league' se corrigieron a mano el 2026-08-18.
      filasFases.push({
        id: phaseId, tournament_id: TOURNAMENT_ID, season_id: seasonId,
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
          id: crypto.randomUUID(), tournament_id: TOURNAMENT_ID, season_id: seasonId,
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
            id: crypto.randomUUID(), tournament_id: TOURNAMENT_ID, season_id: seasonId,
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

    // group_id referencia a los grupos recién insertados; un club en dos
    // grupos de la misma fase se queda con el primero.
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
  console.log(`modo: ${modo}${soloAnio ? ` · solo ${soloAnio}` : ''}\nleyendo la base…`);

  const temporadasEnBase = await selectAll<{ id: string; season_code: string; created_by_user_id: string | null }>(
    `tournament_seasons?select=id,season_code,created_by_user_id&tournament_id=eq.${TOURNAMENT_ID}`);
  const codigosExistentes = new Set(temporadasEnBase.map((s) => s.season_code));
  const actor = process.argv.find((a) => a.startsWith('--user='))?.slice(7)
    || temporadasEnBase.find((s) => s.created_by_user_id)?.created_by_user_id;
  if (!actor) throw new Error('No hay un usuario creador en las temporadas existentes: pasá --user=<uuid>');

  const [torneo] = await selectAll<{ ruleset: { points?: { win?: number; draw?: number; loss?: number } } | null }>(
    `tournaments?select=ruleset&id=eq.${TOURNAMENT_ID}`);
  const puntos = {
    win: Number(torneo?.ruleset?.points?.win ?? 4),
    draw: Number(torneo?.ruleset?.points?.draw ?? 2),
    loss: Number(torneo?.ruleset?.points?.loss ?? 0),
  };

  const idsNecesarios = Array.from(new Set(Object.values(CLUB_MAP)));
  const clubesFilas = await selectAll<{ id: string; name: string; short_name: string | null }>(
    `clubs?select=id,name,short_name&id=in.(${idsNecesarios.join(',')})`);
  const clubes = new Map(clubesFilas.map((c) => [c.id, { name: c.name, short_name: c.short_name }]));
  const clubesACrear = CLUBES_NUEVOS.filter((c) => !clubes.has(String(c.id)));
  const faltanYNoSeCrean = idsNecesarios.filter(
    (id) => !clubes.has(id) && !CLUBES_NUEVOS.some((c) => c.id === id));
  if (faltanYNoSeCrean.length) {
    throw new Error(`Clubes del mapeo que no existen ni están en CLUBES_NUEVOS: ${faltanYNoSeCrean.join(', ')}`);
  }

  console.log(`  temporadas ya cargadas: ${Array.from(codigosExistentes).sort().join(', ') || '(ninguna)'}`);
  console.log(`  clubes a crear: ${clubesACrear.length ? clubesACrear.map((c) => c.id).join(', ') : '(ninguno)'}`);

  // ── Descarga (caché primero) y armado de planes ───────────────────────────
  console.log('\nleyendo rugbyarchive (caché primero)…');
  const planes: Array<{ plan: PlanDeTemporada; est: EstructuraDeTemporada | null }> = [];
  const errores: string[] = [];
  const anios = soloAnio ? [soloAnio] : ANIOS;
  for (const anio of anios) {
    const res = await fetchStagioneCompetizione<RaStagione>(RA_COMP_ID, anio, { cacheDir: CACHE });
    if (!res.ok || !res.data) { errores.push(`${anio}: ${res.error || 'sin payload'}`); continue; }
    const plan = construirPlanDeTemporada(anio, res.data);
    planes.push({
      plan,
      est: plan.tipo === 'completa' ? construirEstructuraDeTemporada(anio, res.data) : null,
    });
  }

  const pendientes = planes.filter((p) => !codigosExistentes.has(p.plan.year) && p.plan.tipo !== 'vacia');
  const completas = pendientes.filter((p) => p.plan.tipo === 'completa');
  const soloCampeon = pendientes.filter((p) => p.plan.tipo === 'solo-campeon');
  const vacias = planes.filter((p) => p.plan.tipo === 'vacia');
  const salteadas = planes.filter((p) => codigosExistentes.has(p.plan.year));

  // ── Validaciones que frenan ───────────────────────────────────────────────
  const bloqueos: string[] = [];
  for (const { plan, est } of pendientes) {
    if (est) {
      for (const c of est.sinMapa) bloqueos.push(`${plan.year}: club sin mapear ${c.id} "${c.nome}"`);
      for (const s of est.sinFase) bloqueos.push(`${plan.year}: partido sin fase ${s}`);
      if (!est.campeonClubId && plan.campeonRA) bloqueos.push(`${plan.year}: campeón sin mapeo`);
      if (est.desde && est.desde.slice(0, 4) !== plan.year) {
        bloqueos.push(`${plan.year}: la primera fecha cae en ${est.desde.slice(0, 4)}`);
      }
    } else {
      for (const c of plan.sinMapa) bloqueos.push(`${plan.year}: club sin mapear ${c.id} "${c.nome}"`);
      if (!plan.campeonClubId) bloqueos.push(`${plan.year}: campeón "${plan.campeonRA?.nome}" sin mapeo`);
      if (plan.coCampeonesClubIds.some((c) => !c)) bloqueos.push(`${plan.year}: co-campeón sin mapeo`);
    }
  }

  const totalPartidos = completas.reduce((s, p) => s + (p.est?.partidos || 0), 0);

  // ── Plan legible ──────────────────────────────────────────────────────────
  const md: string[] = [];
  md.push('# Plan de carga: Torneo Cordobés / Región Centro 1931-2023');
  md.push('');
  md.push(`Generado por \`rugbyarchive-historico.ts --${modo}\`. Torneo destino: Top 10 del Centro (\`${TOURNAMENT_ID}\`).`);
  md.push('Estructura fiel: una fase por fase de la fuente, zonas como grupos con su tabla.');
  md.push('');
  md.push(`- Temporadas completas a importar: **${completas.length}** (${totalPartidos} partidos)`);
  md.push(`- Temporadas solo-campeón: **${soloCampeon.length}**`);
  md.push(`- Vacías (no se cargan): ${vacias.map((p) => p.plan.year).join(', ') || '—'}`);
  md.push(`- Ya en la base (se saltean): ${salteadas.map((p) => p.plan.year).join(', ') || '—'}`);
  md.push(`- Clubes nuevos a crear: ${clubesACrear.map((c) => `\`${c.id}\``).join(', ') || '—'}`);
  if (errores.length) md.push(`- Errores de descarga: ${errores.join(' · ')}`);
  md.push('');
  if (bloqueos.length) {
    md.push('## BLOQUEOS (no se ejecuta hasta resolverlos)');
    for (const b of bloqueos) md.push(`- ${b}`);
    md.push('');
  }
  md.push('## Temporadas completas');
  md.push('');
  md.push('| Año | Nombre | Partidos | Desc. | Fases (grupos) | Campeón |');
  md.push('|---|---|---|---|---|---|');
  for (const { plan, est } of completas) {
    const fases = est!.fases
      .map((f) => `${f.nombre}${f.grupos.length ? ` [${f.grupos.map((g) => g.nombre).join('·')}]` : ''}${f.conTabla ? '†' : ''}`)
      .join(' → ');
    md.push(`| ${plan.year} | ${plan.nombre} | ${est!.partidos} | ${est!.descartados.length} | ${fases} | ${plan.campeonRA?.nome ?? '—'} |`);
  }
  md.push('');
  md.push('† = fase con tabla de posiciones persistida');
  md.push('');
  md.push('## Temporadas solo-campeón');
  md.push('');
  md.push(soloCampeon.map((p) => `${p.plan.year} ${p.plan.campeonRA?.nome}`).join(' · ') || '—');
  md.push('');
  const descartesTotales = pendientes.flatMap((p) =>
    (p.est?.descartados || p.plan.descartados).map((d) => `${p.plan.year}: ${d}`));
  if (descartesTotales.length) {
    md.push('## Partidos descartados (no importables)');
    md.push('');
    for (const d of descartesTotales) md.push(`- ${d}`);
    md.push('');
  }
  fs.writeFileSync(PLAN_MD, md.join('\n') + '\n', 'utf8');
  console.log(`\nplan escrito: ${PLAN_MD}`);
  console.log(`  completas ${completas.length} (${totalPartidos} partidos) · solo-campeón ${soloCampeon.length} · salteadas ${salteadas.length} · bloqueos ${bloqueos.length}`);

  // ── Rollback, ANTES de escribir ───────────────────────────────────────────
  const codigos = planes.filter((p) => p.plan.tipo !== 'vacia').map((p) => `'${p.plan.year}'`).join(',');
  const sub = `(SELECT id FROM public.tournament_seasons WHERE tournament_id = '${TOURNAMENT_ID}' AND season_code IN (${codigos}))`;
  const sql: string[] = [];
  sql.push('-- Rollback de la carga histórica de rugbyarchive (Top 10 del Centro, 1931-2023).');
  sql.push('-- Generado ANTES de ejecutar. El corte es (tournament_id, season_code): las');
  sql.push('-- temporadas 2024/2025/2026, cargadas a mano, no están en la lista.');
  sql.push('BEGIN;');
  sql.push(`DELETE FROM public.tournament_standings WHERE season_id IN ${sub};`);
  sql.push(`DELETE FROM public.matches WHERE season_id IN ${sub};`);
  sql.push(`DELETE FROM public.tournament_rounds WHERE season_id IN ${sub};`);
  sql.push(`DELETE FROM public.tournament_groups WHERE season_id IN ${sub};`);
  sql.push(`DELETE FROM public.tournament_phases WHERE season_id IN ${sub};`);
  sql.push(`DELETE FROM public.season_rosters WHERE season_id IN ${sub};`);
  sql.push('-- participantes y entries se referencian mutuamente: primero soltar el vínculo');
  sql.push(`UPDATE public.tournament_participants SET season_entry_id = NULL WHERE season_id IN ${sub};`);
  sql.push(`DELETE FROM public.team_season_entries WHERE season_id IN ${sub};`);
  sql.push(`DELETE FROM public.tournament_participants WHERE season_id IN ${sub};`);
  sql.push(`DELETE FROM public.tournament_seasons WHERE tournament_id = '${TOURNAMENT_ID}' AND season_code IN (${codigos});`);
  sql.push('-- Clubes creados por esta carga. Borrarlos SOLO si no participan de otra cosa:');
  sql.push(`-- DELETE FROM public.clubs WHERE id IN (${CLUBES_NUEVOS.map((c) => `'${c.id}'`).join(',')});`);
  sql.push('-- Los aliases aprendidos en club_aliases son inocuos; limpiarlos es opcional.');
  sql.push('COMMIT;');
  fs.writeFileSync(ROLLBACK, sql.join('\n') + '\n', 'utf8');
  console.log(`rollback escrito: ${ROLLBACK}`);

  if (modo === 'plan') { console.log('\nmodo --plan: no se escribió una sola fila.'); return; }
  if (bloqueos.length) { console.error('\nHay bloqueos: mirá el plan. No se escribe nada.'); process.exit(1); }

  // ── Escritura ─────────────────────────────────────────────────────────────
  anotar({ ts: new Date().toISOString(), evento: 'inicio', completas: completas.length, soloCampeon: soloCampeon.length });

  if (clubesACrear.length) {
    await insertar('clubs', clubesACrear);
    for (const c of clubesACrear) clubes.set(String(c.id), { name: String(c.name), short_name: String(c.short_name) });
    console.log(`clubes creados: ${clubesACrear.length}`);
    anotar({ ts: new Date().toISOString(), evento: 'clubes', creados: clubesACrear.map((c) => c.id) });
  }

  const ahora = new Date().toISOString();
  if (soloCampeon.length) {
    const filas = soloCampeon.map(({ plan }) => ({
      tournament_id: TOURNAMENT_ID,
      legacy_tournament_id: TOURNAMENT_ID,
      season_code: plan.year,
      name: plan.nombre,
      display_name: plan.nombre,
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
        ...(plan.coCampeonesClubIds.length
          ? { co_champions: plan.coCampeonesClubIds.filter(Boolean) }
          : {}),
      },
      champion_club_id: plan.campeonClubId,
      created_by_user_id: actor,
      created_at: ahora,
      updated_at: ahora,
    }));
    await insertar('tournament_seasons', filas);
    console.log(`temporadas solo-campeón escritas: ${filas.length}`);
    anotar({ ts: new Date().toISOString(), evento: 'solo-campeon', cantidad: filas.length });
  }

  let hechas = 0, fallidas = 0;
  for (const { plan, est } of completas) {
    const etiqueta = `[${plan.year}] ${plan.nombre}`;
    try {
      const r = await escribirTemporadaCompleta({ plan, est: est!, actor, clubes, puntos });
      hechas++;
      console.log(`${etiqueta} ok · fases ${r.fases} · grupos ${r.grupos} · rondas ${r.rondas} · partidos ${r.partidos} · tabla ${r.tabla}`);
      anotar({ ts: new Date().toISOString(), evento: 'ok', anio: plan.year, seasonId: r.seasonId, creado: r });
    } catch (e: any) {
      fallidas++;
      console.error(`${etiqueta} FALLÓ: ${e.message}`);
      anotar({ ts: new Date().toISOString(), evento: 'fallo', anio: plan.year, error: String(e.message) });
    }
  }
  if (completas.length) console.log(`\ntemporadas completas: ${hechas} ok · ${fallidas} fallidas`);
  if (fallidas) {
    console.error('Volvé a correr --execute: las temporadas ya escritas se saltean solas.');
    process.exit(1);
  }

  anotar({ ts: new Date().toISOString(), evento: 'fin' });
  console.log('\nlisto. Todo quedó privado: se publica después de revisarlo.');
}

main().catch((e) => { console.error(e); process.exit(1); });
