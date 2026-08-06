/**
 * Carga de URBA. Dos modos, y el primero NO escribe nada:
 *
 *   node src/scripts/urba-execute.ts --plan       calcula el plan y emite URBA_ROLLBACK.sql
 *   node src/scripts/urba-execute.ts --execute    escribe, en tandas, y deja bitácora
 *
 * Escribe en `matches` y en `tournament_participants`. Nada más: no toca `clubs`,
 * ni `club_external_ids`, ni el `ruleset`, ni la visibilidad de ningún torneo.
 *
 * ── Por qué en tandas ──────────────────────────────────────────────────────
 * 10.917 filas en una sola transacción es un lock largo sobre una tabla de
 * producción. Cada torneo es una tanda y cada tanda es un POST, que en PostgREST
 * es una transacción: o entra entera o no entra ninguna de sus filas.
 *
 * ── Por qué se puede reanudar ──────────────────────────────────────────────
 * Antes de escribir se lee lo que YA está en la base y se descuenta. Volver a
 * correrlo después de una caída no duplica: escribe exactamente lo que falta.
 * `tournament_participants` no tiene UNIQUE donde apoyar un ON CONFLICT, así que
 * la protección es esa lectura, repetida por torneo justo antes de insertar.
 */
import fs from 'node:fs';
import path from 'node:path';

import { fetchChampionship } from '../lib/integrations/urba/client.ts';
import { planTournamentMatches, type MatchRow, type ParticipantRow } from '../lib/integrations/urba/planMatches.ts';
import { categoriaDeTorneoUrba, parseUrbaId } from '../lib/integrations/urba/externalId.ts';

const REPO = process.cwd();
const CACHE = path.join(REPO, '.urba-cache', 'championships');
const LOG = path.join(REPO, 'URBA_EXECUTE_LOG.jsonl');

/** La marca de origen de los participantes. `notes` estaba sin usar en las 766
 *  filas de la tabla, así que no pisa nada y hace el rollback exacto. */
const MARCA = 'urba-import';

/** Política de carga, no de mapeo: por eso vive acá y no en el conector. */
const SPORT_ID = 'rugby';
const IS_VISIBLE = false;

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
if (!URL_BASE || !KEY) throw new Error('Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
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

/** Un POST = una transacción. Devuelve el error en vez de tirarlo: una tanda que
 *  falla no puede llevarse puesta la corrida entera. */
async function insertar(tabla: string, filas: any[]): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(`${URL_BASE}/rest/v1/${tabla}`, {
    method: 'POST',
    headers: { ...H, 'content-type': 'application/json', prefer: 'return=minimal' },
    body: JSON.stringify(filas),
  });
  if (res.ok) return { ok: true };
  return { ok: false, error: `HTTP ${res.status} ${(await res.text()).slice(0, 300)}` };
}

const anotar = (e: any) => fs.appendFileSync(LOG, JSON.stringify(e) + '\n', 'utf8');

async function main() {
  console.log(`modo: ${modo}\nleyendo la base…`);
  const torneos = await selectAll<{ id: string; name: string; external_id: string }>(
    'tournaments?select=id,name,external_id&external_id=like.urba:*&order=external_id',
  );
  const mapeo = await selectAll<{ external_id: string; club_id: string }>(
    'club_external_ids?select=external_id,club_id&provider=eq.urba');
  const stg = await selectAll<{ urba_id: number; nombre: string }>('stg_urba_torneos?select=urba_id,nombre');
  const clubes = await selectAll<{ id: string; name: string | null }>('clubs?select=id,name');
  const yaCargados = await selectAll<{ external_id: string }>(
    'matches?select=external_id&external_id=like.urba:*');
  const partsExistentes = await selectAll<{ tournament_id: string; club_id: string }>(
    'tournament_participants?select=tournament_id,club_id');

  const porTriple = new Map(mapeo.map((m) => [m.external_id, m.club_id]));
  const categoriaPorUrbaId = new Map(stg.map((s) => [Number(s.urba_id), categoriaDeTorneoUrba(s.nombre)]));
  const nombrePorClub = new Map(clubes.map((c) => [c.id, c.name ?? '']));
  const yaEscritos = new Set(yaCargados.map((m) => m.external_id));
  const partsPorTorneo = new Map<string, Set<string>>();
  for (const p of partsExistentes) {
    if (!partsPorTorneo.has(p.tournament_id)) partsPorTorneo.set(p.tournament_id, new Set());
    partsPorTorneo.get(p.tournament_id)!.add(p.club_id);
  }

  console.log(`  torneos ${torneos.length} · matches urba ya escritos ${yaEscritos.size}`);

  // ── el plan, torneo por torneo ────────────────────────────────────────────
  const tandas: { torneo: string; uuid: string; nombre: string; matches: MatchRow[]; participantes: ParticipantRow[] }[] = [];
  for (const t of torneos) {
    const urbaId = parseUrbaId(t.external_id);
    const categoria = urbaId == null ? undefined : categoriaPorUrbaId.get(urbaId);
    if (urbaId == null || !categoria) { console.error(`  ! ${t.external_id} sin categoría: se saltea`); continue; }
    const r = await fetchChampionship(urbaId, { cacheDir: CACHE });
    if (!r.ok || !r.data) { console.error(`  ! ${t.external_id} no bajó (HTTP ${r.status}): se saltea`); continue; }

    const plan = planTournamentMatches({
      championship: r.data as any,
      tournamentId: t.id,
      categoria,
      resolverClub: (triple) => porTriple.get(triple) ?? null,
      existentes: new Map(),
      participantesYaEnBase: partsPorTorneo.get(t.id),
      nombreDeClub: (clubId) => nombrePorClub.get(clubId) || null,
    });

    tandas.push({
      torneo: t.external_id,
      uuid: t.id,
      nombre: t.name,
      matches: plan.crear.filter((f) => !yaEscritos.has(f.external_id)),
      participantes: plan.participantesCrear,
    });
  }

  const totalM = tandas.reduce((s, t) => s + t.matches.length, 0);
  const totalP = tandas.reduce((s, t) => s + t.participantes.length, 0);
  console.log(`\nplan: ${totalM} partidos · ${totalP} participantes · ${tandas.length} tandas`);

  // ── el rollback, ANTES de escribir ────────────────────────────────────────
  const sql: string[] = [];
  sql.push('-- Rollback de la carga de URBA. Generado ANTES de ejecutar.');
  sql.push(`-- ${totalM} partidos · ${totalP} participantes · ${tandas.length} torneos`);
  sql.push('--');
  sql.push('-- Los partidos se identifican solos por external_id.');
  sql.push(`-- Los participantes NO tienen marca de origen propia, así que se les escribe`);
  sql.push(`-- notes = '${MARCA}'. La columna estaba sin usar en las 766 filas de la tabla,`);
  sql.push('-- así que no pisa nada y el DELETE es exacto. Igual va abajo la lista explícita,');
  sql.push('-- por si alguien edita ese campo antes del rollback.');
  sql.push('');
  sql.push('BEGIN;');
  sql.push('');
  sql.push('-- 1. Los partidos');
  sql.push("DELETE FROM public.matches WHERE external_id LIKE 'urba:%';");
  sql.push('');
  sql.push('-- 2. Los participantes, por la marca');
  sql.push(`DELETE FROM public.tournament_participants WHERE notes = '${MARCA}';`);
  sql.push('');
  sql.push('-- 3. Los participantes, por lista explícita (equivalente al 2; correr uno u otro)');
  sql.push('-- DELETE FROM public.tournament_participants p');
  sql.push('-- USING (VALUES');
  const pares = tandas.flatMap((t) => t.participantes.map((p) => `--   ('${p.tournament_id}'::uuid, '${p.club_id.replace(/'/g, "''")}')`));
  pares.forEach((l, i) => sql.push(l + (i === pares.length - 1 ? '' : ',')));
  sql.push('-- ) AS v(tournament_id, club_id)');
  sql.push('-- WHERE p.tournament_id = v.tournament_id AND p.club_id = v.club_id;');
  sql.push('');
  sql.push('-- 4. Verificación antes de confirmar');
  sql.push("--   SELECT count(*) FROM public.matches;                                  -- 3898");
  sql.push("--   SELECT count(*) FROM public.tournament_participants;                  -- 766");
  sql.push('');
  sql.push('COMMIT;');
  fs.writeFileSync(path.join(REPO, 'URBA_ROLLBACK.sql'), sql.join('\n') + '\n', 'utf8');
  console.log('rollback escrito: URBA_ROLLBACK.sql');

  if (modo === 'plan') { console.log('\nmodo --plan: no se escribió una sola fila.'); return; }

  // ── la escritura ──────────────────────────────────────────────────────────
  anotar({ ts: new Date().toISOString(), evento: 'inicio', totalM, totalP, tandas: tandas.length });
  let hechosM = 0, hechosP = 0, fallidas = 0, primeraOk = false;

  for (let i = 0; i < tandas.length; i++) {
    const t = tandas[i];
    const etiqueta = `[${String(i + 1).padStart(3)}/${tandas.length}] ${t.torneo}`;

    // participantes: se relee el torneo JUSTO antes, para no depender de una foto vieja
    if (t.participantes.length) {
      const ahora = await selectAll<{ club_id: string }>(
        `tournament_participants?select=club_id&tournament_id=eq.${t.uuid}`);
      const yaEsta = new Set(ahora.map((x) => x.club_id));
      const faltan = t.participantes.filter((p) => !yaEsta.has(p.club_id));
      if (faltan.length) {
        const filas = faltan.map((p) => ({ ...p, notes: MARCA }));
        const r = await insertar('tournament_participants', filas);
        if (r.ok) { hechosP += filas.length; }
        else {
          fallidas++;
          console.error(`${etiqueta} PARTICIPANTES FALLÓ: ${r.error}`);
          anotar({ ts: new Date().toISOString(), evento: 'fallo', tabla: 'tournament_participants', torneo: t.torneo, filas: filas.length, error: r.error });
          if (!primeraOk) { console.error('\nLa primera tanda falló: se aborta sin insistir.'); process.exit(1); }
        }
      }
    }

    // partidos
    if (t.matches.length) {
      const filas = t.matches.map((f) => ({ ...f, sport_id: SPORT_ID, is_visible: IS_VISIBLE }));
      const r = await insertar('matches', filas);
      if (r.ok) {
        hechosM += filas.length; primeraOk = true;
        anotar({ ts: new Date().toISOString(), evento: 'ok', torneo: t.torneo, matches: filas.length });
      } else {
        fallidas++;
        console.error(`${etiqueta} PARTIDOS FALLÓ: ${r.error}`);
        anotar({ ts: new Date().toISOString(), evento: 'fallo', tabla: 'matches', torneo: t.torneo, filas: filas.length, error: r.error });
        if (!primeraOk) { console.error('\nLa primera tanda falló: se aborta sin insistir.'); process.exit(1); }
      }
    }

    if ((i + 1) % 10 === 0 || i === tandas.length - 1) {
      console.log(`${etiqueta}  partidos ${hechosM}/${totalM} · participantes ${hechosP}/${totalP}${fallidas ? ` · TANDAS FALLIDAS ${fallidas}` : ''}`);
    }
  }

  anotar({ ts: new Date().toISOString(), evento: 'fin', hechosM, hechosP, fallidas });
  console.log(`\nescritos: ${hechosM} partidos · ${hechosP} participantes · tandas fallidas ${fallidas}`);
  if (fallidas) {
    console.error('Quedaron tandas sin escribir. Volvé a correr --execute: sólo escribe lo que falta.');
    process.exit(1);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
