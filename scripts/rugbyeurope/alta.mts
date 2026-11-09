/**
 * Alta del U20 Championship 2026 de Rugby Europe (Praga, 8-15/11) que sincroniza
 * `/api/cron/rugbyeurope-sync`.
 *
 *   node scripts/rugbyeurope/alta.mts --plan
 *   node scripts/rugbyeurope/alta.mts --execute
 *
 * Escribe: las 8 selecciones U20 (clubes nuevos, escudo en public/clubs/<id>.png),
 * sus alias (`club_external_ids`, provider `rugbyeurope`, nombre del sitio
 * normalizado), el torneo con su temporada, UNA fase de eliminación, las cinco
 * rondas del cuadro y los participantes en sus TRES tablas. Los partidos los
 * escribe la primera corrida del cron. Idempotente; un torneo que falla a mitad
 * se deshace. Deja `RUGBYEUROPE_ALTA_ROLLBACK.sql`.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { buildTournamentExternalId, normalizarNombre, RE_PROVIDER } from '../../src/lib/integrations/rugbyeurope/rugbyeurope.ts';

const REPO = process.cwd();
const ROLLBACK = path.join(REPO, 'RUGBYEUROPE_ALTA_ROLLBACK.sql');
const ORIGEN = 'rugbyeurope-alta';
const SLUG = 'rugby-europe-u20-championship-2026';
const NOMBRE = 'Rugby Europe U20 Championship';
const TEMPORADA = '2026';

/** Nombre en rugbyeurope.eu → selección U20 (nombres en español, como Italia U20, Chile U20…). */
const EQUIPOS = [
  { sitio: 'PORTUGAL', id: 'portugal-u20', name: 'Portugal U20', country: 'Portugal', union: 'portugal-rugby-union' },
  { sitio: 'MOLDOVA', id: 'moldavia-u20', name: 'Moldavia U20', country: 'Moldavia', union: null },
  { sitio: 'CZECHIA', id: 'chequia-u20', name: 'Chequia U20', country: 'República Checa', union: 'ceske-rugby' },
  { sitio: 'ROMANIA', id: 'rumania-u20', name: 'Rumania U20', country: 'Rumania', union: 'rugby-romania' },
  { sitio: 'NETHERLANDS', id: 'paises-bajos-u20', name: 'Países Bajos U20', country: 'Países Bajos', union: 'rugby-nederlands' },
  { sitio: 'SWITZERLAND', id: 'suiza-u20', name: 'Suiza U20', country: 'Suiza', union: 'switzerland-rugby' },
  { sitio: 'BELGIUM', id: 'belgica-u20', name: 'Bélgica U20', country: 'Bélgica', union: 'belgium-rugby' },
  { sitio: 'POLAND', id: 'polonia-u20', name: 'Polonia U20', country: 'Polonia', union: null },
];

/** Las cinco rondas del cuadro (el orden es el `order_index` que usa el cron). */
const RONDAS = [
  { orden: 1, nombre: 'Cuartos de final', desde: '2026-11-08', hasta: '2026-11-08' },
  { orden: 2, nombre: 'Semifinales', desde: '2026-11-11', hasta: '2026-11-11' },
  { orden: 3, nombre: 'Semifinales de ranking', desde: '2026-11-11', hasta: '2026-11-11' },
  { orden: 4, nombre: 'Final y 3.º puesto', desde: '2026-11-15', hasta: '2026-11-15' },
  { orden: 5, nombre: 'Ranking: 5.º y 7.º puesto', desde: '2026-11-15', hasta: '2026-11-15' },
];

const RULESET = {
  competition: { format_type: 'knockout', parameters: { season_model: 'season' } },
  organizers: [{ name: 'Rugby Europe', union_id: null, is_primary: true }],
};

const modo = process.argv.includes('--execute') ? 'execute' : process.argv.includes('--plan') ? 'plan' : null;
if (!modo) { console.error('usá --plan o --execute'); process.exit(2); }

const env: Record<string, string | undefined> = { ...process.env };
for (const l of fs.readFileSync(path.join(REPO, '.env.local'), 'utf8').split(/\r?\n/)) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !env[m[1]]) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
}
const URL_BASE = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_BASE || !KEY) { console.error('Faltan credenciales en .env.local'); process.exit(1); }
const H = { apikey: KEY, authorization: `Bearer ${KEY}` };

async function leer<T = any>(recurso: string): Promise<T[]> {
  const res = await fetch(encodeURI(`${URL_BASE}/rest/v1/${recurso}`), { headers: H });
  if (!res.ok) throw new Error(`GET ${recurso}: ${res.status} ${(await res.text()).slice(0, 300)}`);
  return res.json();
}
async function insertar(tabla: string, filas: object[]) {
  if (!filas.length) return;
  const res = await fetch(`${URL_BASE}/rest/v1/${tabla}`, {
    method: 'POST', headers: { ...H, 'content-type': 'application/json', prefer: 'return=minimal' }, body: JSON.stringify(filas),
  });
  if (!res.ok) throw new Error(`POST ${tabla}: ${res.status} ${(await res.text()).slice(0, 400)}`);
}
async function actualizar(recurso: string, cuerpo: object) {
  const res = await fetch(encodeURI(`${URL_BASE}/rest/v1/${recurso}`), {
    method: 'PATCH', headers: { ...H, 'content-type': 'application/json', prefer: 'return=minimal' }, body: JSON.stringify(cuerpo),
  });
  if (!res.ok) throw new Error(`PATCH ${recurso}: ${res.status} ${(await res.text()).slice(0, 400)}`);
}
async function borrar(recurso: string) {
  const res = await fetch(encodeURI(`${URL_BASE}/rest/v1/${recurso}`), { method: 'DELETE', headers: { ...H, prefer: 'return=minimal' } });
  if (!res.ok) throw new Error(`DELETE ${recurso}: ${res.status} ${(await res.text()).slice(0, 300)}`);
}

const ahora = new Date().toISOString();

async function main() {
  console.log(`modo: ${modo}\n`);
  for (const e of EQUIPOS) {
    if (!fs.existsSync(path.join(REPO, 'public', 'clubs', `${e.id}.png`))) throw new Error(`falta public/clubs/${e.id}.png`);
  }
  const ids = EQUIPOS.map((e) => e.id);
  const enBase = new Set((await leer<any>(`clubs?select=id&id=in.(${ids.join(',')})`)).map((c) => c.id));
  const uniones = [...new Set(EQUIPOS.map((e) => e.union).filter(Boolean))] as string[];
  const unionesBase = new Set((await leer<any>(`unions?select=id&id=in.(${uniones.join(',')})`)).map((u) => u.id));
  const sinUnion = uniones.filter((u) => !unionesBase.has(u));
  if (sinUnion.length) throw new Error(`uniones que no existen: ${sinUnion.join(', ')}`);

  const aliasBase = new Map((await leer<any>(`club_external_ids?select=external_id,club_id&provider=eq.${RE_PROVIDER}`)).map((a) => [a.external_id, a.club_id]));
  const alias = EQUIPOS.map((e) => ({ clave: normalizarNombre(e.sitio), club: e.id }));
  const distintos = alias.filter((a) => aliasBase.has(a.clave) && aliasBase.get(a.clave) !== a.club);
  if (distintos.length) throw new Error(`alias ya cargados con otro club: ${distintos.map((a) => a.clave).join(', ')}`);
  const aliasNuevos = alias.filter((a) => !aliasBase.has(a.clave))
    .map((a) => ({ provider: RE_PROVIDER, external_id: a.clave, club_id: a.club, confidence: 'exacto', created_at: ahora }));
  const clubesNuevos = EQUIPOS.filter((e) => !enBase.has(e.id));
  const yaEsta = (await leer<any>(`tournaments?select=id&slug=eq.${SLUG}`)).length > 0;

  console.log(`clubes nuevos: ${clubesNuevos.map((c) => c.id).join(', ') || 'ninguno'}`);
  console.log(`alias a crear: ${aliasNuevos.length}`);
  console.log(`torneo: ${yaEsta ? 'ya existe, se saltea' : `${NOMBRE} · ${buildTournamentExternalId()} · ${RONDAS.length} rondas`}`);
  if (modo === 'plan') { console.log('\nmodo --plan: no se escribió nada.'); return; }

  await insertar('clubs', clubesNuevos.map((c) => ({
    id: c.id, union_id: c.union, name: c.name, short_name: c.name, city: null, region: null,
    country: c.country, logo_url: `/clubs/${c.id}.png`, primary_color: null, slug: c.id, is_visible: true,
    entity_type: 'club', sport: 'rugby', sport_id: 'rugby', category: null, categories: [], status: 'active', visibility: 'visible',
    external_id: null, created_at: ahora, updated_at: ahora,
  })));
  await insertar('club_external_ids', aliasNuevos);
  if (yaEsta) { console.log('✓ clubes y alias; el torneo ya estaba'); return; }

  const tournamentId = crypto.randomUUID();
  const seasonId = crypto.randomUUID();
  const faseId = crypto.randomUUID();
  try {
    await insertar('tournaments', [{
      id: tournamentId, union_id: null, season_id: TEMPORADA,
      name: NOMBRE, display_name: NOMBRE, original_name: 'U20 Championship 2026', slug: SLUG,
      status: 'published', category: 'U20', gender: 'masculino', age_grade: 'U20',
      region: 'Europe', country: 'Internacional', country_id: null, country_name: 'Internacional',
      format: 'knockout', is_visible: true, is_active: true, logo_url: null,
      ruleset: RULESET, ruleset_version: 1, sport_id: 'rugby', sport: 'rugby', sport_name: 'Rugby',
      priority: 0, sponsors: [], social_links: {}, display_order: 0, is_popular: false,
      // `url` vacía e `is_api_managed` en false: la página lee la base, no FlashScore.
      is_api_managed: false, review_status: 'approved', data_source: null,
      external_id: buildTournamentExternalId(), current_season_id: null, created_at: ahora, updated_at: ahora,
    }]);
    await insertar('tournament_seasons', [{
      id: seasonId, tournament_id: tournamentId, legacy_tournament_id: tournamentId,
      season_code: TEMPORADA, name: `${NOMBRE} ${TEMPORADA}`, display_name: `${NOMBRE} ${TEMPORADA}`,
      slug: SLUG, status: 'active', is_active: true, start_date: RONDAS[0].desde, end_date: RONDAS[RONDAS.length - 1].hasta,
      format: 'knockout', ruleset: RULESET, settings: { source: ORIGEN }, champion_club_id: null, created_at: ahora, updated_at: ahora,
    }]);
    await actualizar(`tournaments?id=eq.${tournamentId}`, { current_season_id: seasonId });
    await insertar('tournament_phases', [{
      id: faseId, tournament_id: tournamentId, season_id: seasonId, name: 'Cuadro', phase_type: 'playoff', order_index: 1, is_active: true,
      settings: {
        teamsCount: EQUIPOS.length, legs: 1, phaseMode: 'playoff', source: ORIGEN,
        rugbyeurope: { edicion: 'u20-championship-2026' },
      },
      created_at: ahora, updated_at: ahora,
    }]);
    await insertar('tournament_rounds', RONDAS.map((r) => ({
      id: crypto.randomUUID(), phase_id: faseId, season_id: seasonId, name: r.nombre, order_index: r.orden,
      start_date: r.desde, end_date: r.hasta, is_completed: false, notes: null, created_at: ahora, updated_at: ahora,
    })));
    const pid = new Map(ids.map((c) => [c, { p: crypto.randomUUID(), e: crypto.randomUUID() }]));
    await insertar('tournament_participants', EQUIPOS.map((c) => ({
      id: pid.get(c.id)!.p, tournament_id: tournamentId, season_id: seasonId, season_entry_id: null, club_id: c.id, name: c.name,
      type: 'club', status: 'active', seed: null, group_id: null, short_code: null, notes: ORIGEN, joined_at: ahora, created_at: ahora, updated_at: ahora,
    })));
    await insertar('team_season_entries', ids.map((c) => ({
      id: pid.get(c)!.e, season_id: seasonId, tournament_id: tournamentId, club_id: c, team_id: null, source_participant_id: pid.get(c)!.p,
      group_id: null, zone: null, category: null, status: 'active', seed: null, notes: null, settings: { source: ORIGEN }, created_at: ahora, updated_at: ahora,
    })));
    for (const c of ids) await actualizar(`tournament_participants?id=eq.${pid.get(c)!.p}`, { season_entry_id: pid.get(c)!.e });
    await insertar('tournament_phase_participants', ids.map((c) => ({
      id: crypto.randomUUID(), tournament_id: tournamentId, season_id: seasonId, phase_id: faseId, participant_id: pid.get(c)!.p,
      group_id: null, status: 'active', seed: null, notes: null, created_at: ahora, updated_at: ahora,
    })));
  } catch (e) {
    for (const r of [
      `tournament_phase_participants?tournament_id=eq.${tournamentId}`, `team_season_entries?tournament_id=eq.${tournamentId}`,
      `tournament_participants?tournament_id=eq.${tournamentId}`, `tournament_rounds?phase_id=eq.${faseId}`,
      `tournament_phases?tournament_id=eq.${tournamentId}`,
    ]) await borrar(r).catch(() => {});
    await actualizar(`tournaments?id=eq.${tournamentId}`, { current_season_id: null }).catch(() => {});
    await borrar(`tournament_seasons?tournament_id=eq.${tournamentId}`).catch(() => {});
    await borrar(`tournaments?id=eq.${tournamentId}`).catch(() => {});
    throw e;
  }

  const sql = ['-- Rollback del alta del Rugby Europe U20 Championship 2026.', 'BEGIN;',
    `DELETE FROM public.matches WHERE tournament_id = '${tournamentId}';`,
    `DELETE FROM public.tournament_phase_participants WHERE tournament_id = '${tournamentId}';`,
    `UPDATE public.tournament_participants SET season_entry_id = NULL WHERE tournament_id = '${tournamentId}';`,
    `DELETE FROM public.team_season_entries WHERE tournament_id = '${tournamentId}';`,
    `DELETE FROM public.tournament_participants WHERE tournament_id = '${tournamentId}';`,
    `DELETE FROM public.tournament_rounds WHERE phase_id = '${faseId}';`,
    `DELETE FROM public.tournament_phases WHERE tournament_id = '${tournamentId}';`,
    `UPDATE public.tournaments SET current_season_id = NULL WHERE id = '${tournamentId}';`,
    `DELETE FROM public.tournament_seasons WHERE tournament_id = '${tournamentId}';`,
    `DELETE FROM public.tournaments WHERE id = '${tournamentId}';`,
    ...(aliasNuevos.length ? [`DELETE FROM public.club_external_ids WHERE provider = '${RE_PROVIDER}' AND external_id IN (${aliasNuevos.map((a) => `'${a.external_id}'`).join(', ')});`] : []),
    ...(clubesNuevos.length ? [`DELETE FROM public.clubs WHERE id IN (${clubesNuevos.map((c) => `'${c.id}'`).join(', ')});`] : []),
    'COMMIT;', ''];
  fs.writeFileSync(ROLLBACK, sql.join('\n'), 'utf8');
  console.log(`✓ ${NOMBRE}  /tournaments/${tournamentId}  (${RONDAS.length} rondas · ${EQUIPOS.length} participantes)`);
  console.log(`rollback: ${ROLLBACK}`);
}

main().catch((e) => { console.error('\nFALLÓ:', e.message || e); process.exit(1); });
