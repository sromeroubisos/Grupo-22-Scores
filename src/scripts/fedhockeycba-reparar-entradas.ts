/**
 * Reparación de los participantes que el sync de fedhockeycba creó sin
 * inscripción de temporada:
 *
 *   npx tsx src/scripts/fedhockeycba-reparar-entradas.ts --plan
 *   npx tsx src/scripts/fedhockeycba-reparar-entradas.ts --execute
 *
 * Dos síntomas, dos etapas:
 *
 * 1. La página del torneo lee los participantes por su `season_entry_id`
 *    (team_season_entries); una fila con NULL existe para la base pero no
 *    para la pantalla — Damas B mostraba 2 de 13 equipos. Se les pone el
 *    season_id del torneo y su entrada, cerrando la FK circular en 3 pasos
 *    (mismo patrón que el import histórico de rugbyarchive).
 *
 * 2. La TABLA de posiciones sale de `tournament_phase_participants`: un
 *    participante sin asignación de fase no entra al recálculo aunque tenga
 *    partidos (la tabla de Damas B tenía UNA fila). La asignación se deriva
 *    de los partidos: club que juega en la fase → asignado a la fase. Vale
 *    para cualquier participante al que le falte, no solo los del sync.
 */
import crypto from 'node:crypto';
import path from 'node:path';
import * as dotenv from 'dotenv';

import { FEDHOCKEYCBA_ID_PREFIX } from '../lib/integrations/fedhockeycba/nombres.ts';

const REPO = process.cwd();
dotenv.config({ path: path.join(REPO, '.env.local') });

const URL_BASE = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
if (!URL_BASE || !KEY) { console.error('Faltan credenciales en .env.local'); process.exit(1); }
const H = { apikey: KEY, authorization: `Bearer ${KEY}` };
const EJECUTAR = process.argv.includes('--execute');

async function leer<T>(recurso: string): Promise<T> {
  const res = await fetch(encodeURI(`${URL_BASE}/rest/v1/${recurso}`), { headers: H });
  if (!res.ok) throw new Error(`GET ${recurso}: ${res.status} ${await res.text()}`);
  return res.json() as Promise<T>;
}

async function escribir(recurso: string, metodo: 'PATCH' | 'POST', cuerpo: unknown): Promise<void> {
  const res = await fetch(encodeURI(`${URL_BASE}/rest/v1/${recurso}`), {
    method: metodo,
    headers: { ...H, 'content-type': 'application/json', prefer: 'return=minimal' },
    body: JSON.stringify(cuerpo),
  });
  if (!res.ok) throw new Error(`${metodo} ${recurso}: ${res.status} ${await res.text()}`);
}

async function main() {
  const torneos = await leer<{ id: string; name: string; external_id: string }[]>(
    `tournaments?select=id,name,external_id&external_id=like.${FEDHOCKEYCBA_ID_PREFIX}*`,
  );

  for (const t of torneos) {
    const participantes = await leer<{ id: string; club_id: string; name: string; season_id: string | null; season_entry_id: string | null }[]>(
      `tournament_participants?select=id,club_id,name,season_id,season_entry_id&tournament_id=eq.${t.id}`,
    );
    const sinEntrada = participantes.filter((p) => !p.season_entry_id);
    if (!sinEntrada.length) { console.log(`${t.name.trim()}: completo (${participantes.length} participantes)`); continue; }

    // La temporada del torneo sale de los hermanos: primero de un participante
    // ya inscripto, si no de un partido con season_id.
    let seasonId = participantes.find((p) => p.season_id)?.season_id ?? null;
    if (!seasonId) {
      const partidos = await leer<{ season_id: string | null }[]>(
        `matches?select=season_id&tournament_id=eq.${t.id}&season_id=not.is.null&limit=1`,
      );
      seasonId = partidos[0]?.season_id ?? null;
    }
    if (!seasonId) { console.log(`${t.name.trim()}: SIN temporada detectable — se saltea (${sinEntrada.length} sin entrada)`); continue; }

    console.log(`${t.name.trim()}: ${sinEntrada.length} participantes sin entrada → season ${seasonId.slice(0, 8)}`);
    for (const p of sinEntrada) console.log(`  - ${p.club_id}`);
    if (!EJECUTAR) continue;

    const ahora = new Date().toISOString();
    const filas = sinEntrada.map((p) => ({ p, entryId: crypto.randomUUID() }));
    await escribir('team_season_entries', 'POST', filas.map(({ p, entryId }) => ({
      id: entryId, season_id: seasonId, tournament_id: t.id,
      club_id: p.club_id, team_id: null, source_participant_id: p.id,
      group_id: null, zone: null, category: null, status: 'active',
      seed: null, notes: null,
      settings: { source: 'fedhockeycba-sync-repair' },
      created_at: ahora, updated_at: ahora,
    })));
    for (const { p, entryId } of filas) {
      await escribir(`tournament_participants?id=eq.${p.id}`, 'PATCH', { season_entry_id: entryId, season_id: seasonId });
    }
    console.log(`  reparados: ${filas.length}`);
  }

  // ── Etapa 2: asignaciones de fase que faltan, derivadas de los partidos ──
  for (const t of torneos) {
    const participantes = await leer<{ id: string; club_id: string; season_id: string | null }[]>(
      `tournament_participants?select=id,club_id,season_id&tournament_id=eq.${t.id}&status=eq.active`,
    );
    const porClub = new Map(participantes.map((p) => [p.club_id, p]));
    const partidos = await leer<{ phase_id: string | null; home_club_id: string; away_club_id: string }[]>(
      `matches?select=phase_id,home_club_id,away_club_id&tournament_id=eq.${t.id}&limit=2000`,
    );
    const asignadas = new Set(
      (await leer<{ phase_id: string; participant_id: string }[]>(
        `tournament_phase_participants?select=phase_id,participant_id&tournament_id=eq.${t.id}`,
      )).map((a) => `${a.phase_id}|${a.participant_id}`),
    );

    const faltantes: { phase_id: string; participante: { id: string; club_id: string; season_id: string | null } }[] = [];
    for (const m of partidos) {
      if (!m.phase_id) continue;
      for (const club of [m.home_club_id, m.away_club_id]) {
        const p = porClub.get(club);
        if (!p) continue;
        const clave = `${m.phase_id}|${p.id}`;
        if (asignadas.has(clave)) continue;
        asignadas.add(clave);
        faltantes.push({ phase_id: m.phase_id, participante: p });
      }
    }

    if (!faltantes.length) { console.log(`${t.name.trim()}: asignaciones de fase completas`); continue; }
    console.log(`${t.name.trim()}: ${faltantes.length} asignaciones de fase a crear`);
    for (const f of faltantes) console.log(`  - fase ${f.phase_id.slice(0, 8)} ← ${f.participante.club_id}`);
    if (!EJECUTAR) continue;

    const ahora = new Date().toISOString();
    await escribir('tournament_phase_participants', 'POST', faltantes.map((f) => ({
      id: crypto.randomUUID(), tournament_id: t.id, season_id: f.participante.season_id,
      phase_id: f.phase_id, participant_id: f.participante.id,
      group_id: null, status: 'active', seed: null, notes: null,
      created_at: ahora, updated_at: ahora,
    })));
    console.log(`  creadas: ${faltantes.length}`);
  }

  if (!EJECUTAR) console.log('\nModo plan. Correr con --execute para aplicar.');
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
