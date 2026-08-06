/**
 * Carga del histórico de URBA, 2021-2025. Dos modos, y el primero NO escribe:
 *
 *   node src/scripts/urba-historico-execute.ts --plan       calcula y emite el rollback
 *   node src/scripts/urba-historico-execute.ts --execute    escribe, en tandas
 *
 * Escribe en `tournaments`, `tournament_phases`, `matches` y
 * `tournament_participants`. No toca `clubs`, ni `club_external_ids`, ni nada de
 * 2026.
 *
 * ── Una tanda es un torneo, y el orden adentro no es negociable ─────────────
 * El torneo primero (necesitamos su UUID), después su fase (necesitamos el suyo),
 * después participantes y partidos. Si la fase falla, los partidos de ESE torneo
 * no se escriben: un partido sin `phase_id` no entra en ninguna tabla de
 * posiciones y no falla nada — es el error que se cometió con los 126 de 2026.
 *
 * ── Por qué se puede reanudar ──────────────────────────────────────────────
 * Antes de cada tanda se relee qué hay en la base y se descuenta. Volver a
 * correrlo después de una caída no duplica: escribe exactamente lo que falta.
 * `matches.external_id` y `tournaments.external_id` son únicos y hacen el resto.
 *
 * ── Visibilidad ────────────────────────────────────────────────────────────
 * Todo entra oculto por las tres puertas a la vez: `is_visible = FALSE`,
 * `is_active = FALSE` y `status = 'draft'`. La que manda es `is_active`, que es
 * la de RLS; las otras dos están por si alguien cambia la política.
 */
import fs from 'node:fs';
import path from 'node:path';

import { fetchChampionship } from '../lib/integrations/urba/client.ts';
import { planTournamentMatches, type MatchRow, type ParticipantRow } from '../lib/integrations/urba/planMatches.ts';
import { categoriaDeTorneoUrba, parseUrbaId } from '../lib/integrations/urba/externalId.ts';
import { planTournamentRow, planPhaseRow, legsDeChampionship } from '../lib/integrations/urba/tournamentRow.ts';

const REPO = process.cwd();
const CACHE = path.join(REPO, '.urba-cache', 'championships');
const CSV = path.join(REPO, 'inventario-torneos-urba.csv');
const LOG = path.join(REPO, 'URBA_HISTORICO_LOG.jsonl');
const ROLLBACK = path.join(REPO, 'URBA_HISTORICO_ROLLBACK.sql');

const ANIOS = [2021, 2022, 2023, 2024, 2025];
const IS_VISIBLE = false;
const LOGO_URL = '/competiciones/ar-urba.png';
const SPORT_ID = 'rugby';
/** La misma marca que usó la carga de 2026: hace exacto el DELETE del rollback. */
const MARCA = 'urba-import';

const modo = process.argv.includes('--execute') ? 'execute'
  : process.argv.includes('--plan') ? 'plan' : null;
if (!modo) { console.error('usá --plan o --execute'); process.exit(2); }

const env: Record<string, string> = { ...process.env as Record<string, string> };
const envFile = path.join(REPO, '.env.local');
if (fs.existsSync(envFile)) {
  for (const l of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !env[m[1]]) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
}
const URL_BASE = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_BASE || !KEY) throw new Error('Faltan credenciales');
const H = { apikey: KEY, authorization: `Bearer ${KEY}` };

async function selectAll<T = any>(recurso: string): Promise<T[]> {
  const filas: T[] = [];
  for (let desde = 0; ; desde += 1000) {
    const res = await fetch(`${URL_BASE}/rest/v1/${recurso}`, { headers: { ...H, range: `${desde}-${desde + 999}` } });
    if (!res.ok) throw new Error(`${recurso}: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
    const chunk = await res.json() as T[];
    filas.push(...chunk);
    if (chunk.length < 1000) break;
  }
  return filas;
}

/** POST que devuelve la fila creada — hace falta el UUID del torneo y de la fase. */
async function insertarYLeer<T = any>(tabla: string, filas: unknown): Promise<T[]> {
  const res = await fetch(`${URL_BASE}/rest/v1/${tabla}`, {
    method: 'POST',
    headers: { ...H, 'content-type': 'application/json', prefer: 'return=representation' },
    body: JSON.stringify(filas),
  });
  if (!res.ok) throw new Error(`POST ${tabla}: HTTP ${res.status} ${(await res.text()).slice(0, 300)}`);
  return await res.json() as T[];
}

/** POST que no necesita devolver nada. Un POST es una transacción en PostgREST. */
async function insertar(tabla: string, filas: unknown[]): Promise<{ ok: boolean; error?: string }> {
  if (!filas.length) return { ok: true };
  const res = await fetch(`${URL_BASE}/rest/v1/${tabla}`, {
    method: 'POST',
    headers: { ...H, 'content-type': 'application/json', prefer: 'return=minimal' },
    body: JSON.stringify(filas),
  });
  if (res.ok) return { ok: true };
  return { ok: false, error: `HTTP ${res.status} ${(await res.text()).slice(0, 300)}` };
}

const anotar = (e: unknown) => fs.appendFileSync(LOG, JSON.stringify(e) + '\n', 'utf8');

interface FilaInv {
  urba_id: string; external_id: string; nombre: string; anio: string;
  division: string; age_grade: string; gender: string; equipos: string;
}

function leerInventario(): FilaInv[] {
  const lineas = fs.readFileSync(CSV, 'utf8').split(/\r?\n/).filter(Boolean);
  const cab = lineas[0].split(',');
  return lineas.slice(1).map((l, i) => {
    const c = l.split(',');
    if (c.length !== cab.length) throw new Error(`inventario línea ${i + 2}: ${c.length} columnas`);
    const o: any = {};
    cab.forEach((h, j) => (o[h] = c[j]));
    return o as FilaInv;
  });
}

async function main() {
  console.log(`modo: ${modo}\nleyendo la base…`);
  const torneosEnBase = await selectAll<{ id: string; external_id: string }>(
    'tournaments?select=id,external_id&external_id=like.urba:*');
  const mapeo = await selectAll<{ external_id: string; club_id: string }>(
    'club_external_ids?select=external_id,club_id&provider=eq.urba');
  const clubes = await selectAll<{ id: string; name: string | null }>('clubs?select=id,name');
  const partidosEnBase = await selectAll<{ external_id: string }>(
    'matches?select=external_id&external_id=like.urba:*');

  const uuidPorExternal = new Map(torneosEnBase.map((t) => [t.external_id, t.id]));
  const porTriple = new Map(mapeo.map((m) => [m.external_id, m.club_id]));
  const nombrePorClub = new Map(clubes.map((c) => [c.id, c.name ?? '']));
  const yaEscritos = new Set(partidosEnBase.map((m) => m.external_id));

  const inventario = leerInventario().filter((r) => ANIOS.includes(Number(r.anio)));
  console.log(`  torneos urba en base ${uuidPorExternal.size} · partidos ${yaEscritos.size}`);
  console.log(`  inventario 2021-2025 ${inventario.length}`);
  console.log('\narmando el plan desde la caché…');

  interface Tanda {
    externalId: string; anio: number; nombre: string;
    fila: ReturnType<typeof planTournamentRow>;
    legs: 1 | 2; equipos: number;
    matches: MatchRow[]; participantes: ParticipantRow[];
  }
  const tandas: Tanda[] = [];
  let n = 0;

  for (const r of inventario) {
    const urbaId = parseUrbaId(r.external_id);
    const categoria = urbaId == null ? null : categoriaDeTorneoUrba(r.nombre);
    if (urbaId == null || !categoria) { console.error(`  ! ${r.external_id} sin categoría: se saltea`); continue; }
    const res = await fetchChampionship(urbaId, { cacheDir: CACHE });
    if (!res.ok || !res.data) { console.error(`  ! ${r.external_id} sin payload: se saltea`); continue; }
    n++;
    if (n % 150 === 0) console.log(`  ${n}/${inventario.length}`);

    const fila = planTournamentRow(r, { isVisible: IS_VISIBLE, logoUrl: LOGO_URL });
    const plan = planTournamentMatches({
      championship: res.data as any,
      tournamentId: '(pendiente)',   // se completa con el UUID real al escribir
      categoria,
      subcategory: fila.subcategory,
      resolverClub: (t) => porTriple.get(t) ?? null,
      existentes: new Map(),
      participantesYaEnBase: new Set(),
      nombreDeClub: (id) => nombrePorClub.get(id) || null,
    });

    tandas.push({
      externalId: r.external_id, anio: Number(r.anio), nombre: r.nombre,
      fila, legs: legsDeChampionship(res.data as any), equipos: Number(r.equipos) || 0,
      matches: plan.crear.filter((f) => !yaEscritos.has(f.external_id)),
      participantes: plan.participantesCrear,
    });
  }

  const totalT = tandas.filter((t) => !uuidPorExternal.has(t.externalId)).length;
  const totalM = tandas.reduce((s, t) => s + t.matches.length, 0);
  const totalP = tandas.reduce((s, t) => s + t.participantes.length, 0);
  console.log(`\nplan: ${totalT} torneos · ${totalT} fases · ${totalM} partidos · ${totalP} participantes`);

  // ── el rollback, ANTES de escribir ────────────────────────────────────────
  const sql: string[] = [];
  sql.push('-- Rollback de la carga histórica de URBA 2021-2025. Generado ANTES de ejecutar.');
  sql.push(`-- ${totalT} torneos · ${totalM} partidos · ${totalP} participantes`);
  sql.push('--');
  sql.push('-- El corte es el AÑO: season_id entre 2021 y 2025 y external_id de URBA.');
  sql.push('-- Los 134 de 2026 tienen season_id = 2026 y no los toca ninguna de estas líneas.');
  sql.push('-- El orden es hijo -> padre: las FK no admiten el inverso.');
  sql.push('');
  sql.push('BEGIN;');
  sql.push('');
  sql.push('-- 1. Partidos');
  sql.push("DELETE FROM public.matches m USING public.tournaments t");
  sql.push("  WHERE m.tournament_id = t.id AND t.external_id LIKE 'urba:%'");
  sql.push("    AND t.season_id IN ('2021','2022','2023','2024','2025');");
  sql.push('');
  sql.push('-- 2. Participantes');
  sql.push('DELETE FROM public.tournament_participants p USING public.tournaments t');
  sql.push("  WHERE p.tournament_id = t.id AND t.external_id LIKE 'urba:%'");
  sql.push("    AND t.season_id IN ('2021','2022','2023','2024','2025')");
  sql.push(`    AND p.notes = '${MARCA}';`);
  sql.push('');
  sql.push('-- 3. Fases');
  sql.push('DELETE FROM public.tournament_phases f USING public.tournaments t');
  sql.push("  WHERE f.tournament_id = t.id AND t.external_id LIKE 'urba:%'");
  sql.push("    AND t.season_id IN ('2021','2022','2023','2024','2025');");
  sql.push('');
  sql.push('-- 4. Torneos');
  sql.push("DELETE FROM public.tournaments WHERE external_id LIKE 'urba:%'");
  sql.push("  AND season_id IN ('2021','2022','2023','2024','2025');");
  sql.push('');
  sql.push('-- 5. Verificación antes de confirmar (tiene que dar 134 y 10917)');
  sql.push("--   SELECT count(*) FROM public.tournaments WHERE external_id LIKE 'urba:%';");
  sql.push("--   SELECT count(*) FROM public.matches WHERE external_id LIKE 'urba:%';");
  sql.push('');
  sql.push('COMMIT;');
  fs.writeFileSync(ROLLBACK, sql.join('\n') + '\n', 'utf8');
  console.log(`rollback escrito: ${ROLLBACK}`);

  if (modo === 'plan') { console.log('\nmodo --plan: no se escribió una sola fila.'); return; }

  // ── la escritura ──────────────────────────────────────────────────────────
  anotar({ ts: new Date().toISOString(), evento: 'inicio', totalT, totalM, totalP });
  let hechosT = 0, hechosF = 0, hechosM = 0, hechosP = 0, fallidas = 0;
  let primeraOk = false;

  for (let i = 0; i < tandas.length; i++) {
    const t = tandas[i];
    const etiqueta = `[${String(i + 1).padStart(3)}/${tandas.length}] ${t.externalId} ${t.anio}`;

    try {
      // 1. el torneo — si ya está (reanudación), se reusa su UUID
      let uuid = uuidPorExternal.get(t.externalId);
      if (!uuid) {
        const creado = await insertarYLeer<{ id: string }>('tournaments', t.fila);
        uuid = creado[0]?.id;
        if (!uuid) throw new Error('el torneo se creó pero no devolvió id');
        uuidPorExternal.set(t.externalId, uuid);
        hechosT++;
      }

      // 2. la fase — antes que los partidos, porque le dan el phase_id
      const fasesDeEste = await selectAll<{ id: string }>(
        `tournament_phases?select=id&tournament_id=eq.${uuid}&order=order_index`);
      let phaseId = fasesDeEste[0]?.id;
      if (!phaseId) {
        const creada = await insertarYLeer<{ id: string }>('tournament_phases',
          planPhaseRow({ tournamentId: uuid, teamsCount: t.equipos, legs: t.legs }));
        phaseId = creada[0]?.id;
        if (!phaseId) throw new Error('la fase se creó pero no devolvió id');
        hechosF++;
      }

      // 3. participantes — se relee justo antes: no hay UNIQUE donde apoyarse
      if (t.participantes.length) {
        const ahora = await selectAll<{ club_id: string }>(
          `tournament_participants?select=club_id&tournament_id=eq.${uuid}`);
        const yaEsta = new Set(ahora.map((x) => x.club_id));
        const faltan = t.participantes
          .filter((p) => !yaEsta.has(p.club_id))
          .map((p) => ({ ...p, tournament_id: uuid, notes: MARCA }));
        const r = await insertar('tournament_participants', faltan);
        if (!r.ok) throw new Error(`participantes: ${r.error}`);
        hechosP += faltan.length;
      }

      // 4. partidos, ya con su torneo y su fase
      if (t.matches.length) {
        const filas = t.matches.map((f) => ({
          ...f, tournament_id: uuid, phase_id: phaseId,
          sport_id: SPORT_ID, is_visible: IS_VISIBLE,
        }));
        const r = await insertar('matches', filas);
        if (!r.ok) throw new Error(`partidos: ${r.error}`);
        hechosM += filas.length;
      }

      primeraOk = true;
      anotar({ ts: new Date().toISOString(), evento: 'ok', torneo: t.externalId, uuid, matches: t.matches.length });
    } catch (e: any) {
      fallidas++;
      console.error(`${etiqueta} FALLÓ: ${e.message}`);
      anotar({ ts: new Date().toISOString(), evento: 'fallo', torneo: t.externalId, error: String(e.message) });
      if (!primeraOk) { console.error('\nLa primera tanda falló: se aborta sin insistir.'); process.exit(1); }
    }

    if ((i + 1) % 25 === 0 || i === tandas.length - 1) {
      console.log(`${etiqueta}  torneos ${hechosT}/${totalT} · fases ${hechosF} · partidos ${hechosM}/${totalM} · particip. ${hechosP}/${totalP}${fallidas ? ` · FALLIDAS ${fallidas}` : ''}`);
    }
  }

  anotar({ ts: new Date().toISOString(), evento: 'fin', hechosT, hechosF, hechosM, hechosP, fallidas });
  console.log(`\nescritos: ${hechosT} torneos · ${hechosF} fases · ${hechosM} partidos · ${hechosP} participantes · fallidas ${fallidas}`);
  if (fallidas) {
    console.error('Quedaron tandas sin escribir. Volvé a correr --execute: sólo escribe lo que falta.');
    process.exit(1);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
