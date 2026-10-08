/**
 * Alta de la Super XV 2026-27 (primera división de Portugal) que sincroniza
 * `/api/cron/superxv-sync`.
 *
 *   node scripts/superxv/alta.mts --plan
 *   node scripts/superxv/alta.mts --execute
 *
 * Once de los doce clubes ya están en la base (los trajo FlashScore con la CN
 * Honra): se reusan tal cual. El CR Setúbal sube a primera y se crea, con el
 * escudo que dejó `scripts/escudos/variantes.mjs --carpeta PORTUGAL` en
 * `public/clubs/cr-setubal.png`.
 *
 * Escribe: el club nuevo, los alias (`club_external_ids`, provider `superxv`,
 * nombre del sitio normalizado), el torneo con su temporada, UNA fase de liga
 * con `settings.superxv`, una ronda por jornada (del primer al último día con
 * partido; si la jornada todavía no tiene días, el rango del encabezado) y los
 * participantes en sus TRES tablas. Los partidos los escribe la primera
 * corrida del cron. Idempotente; un torneo que falla a mitad se deshace. Deja
 * `SUPERXV_ALTA_ROLLBACK.sql`.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import {
  buildTournamentExternalId, fetchJornada, normalizarNombre, PUNTOS_SXV, SXV_JORNADAS_MAX, SXV_PROVIDER, SXV_TEMPORADA,
  type JornadaSxv,
} from '../../src/lib/integrations/superxv/superxv.ts';

const REPO = process.cwd();
const ROLLBACK = path.join(REPO, 'SUPERXV_ALTA_ROLLBACK.sql');
const PAIS = 'Portugal';
const UNION = null;
const ORIGEN = 'superxv-alta';
const SLUG = `pt-super-xv-${SXV_TEMPORADA}`;
const NOMBRE = 'Super XV';

/** Nombre en superxv.pt → club. Los once primeros ya existen (CN Honra de FlashScore). */
const EQUIPOS: Record<string, string> = {
  'AAC': 'aa-coimbra',
  'Agronomia Rugby': 'agronomia',
  'CF Belenenses': 'belenenses',
  'SL Benfica': 'benfica',
  'GDS Cascais': 'cascais',
  'CDUL': 'cdul',
  'CDUP': 'cdup',
  'GD Direito': 'direito',
  'RC Santarém': 'santarem',
  'CR São Miguel': 'sao-miguel',
  'CR Técnico': 'tecnico',
  'CR Setúbal': 'cr-setubal',
};
const CLUB_NUEVO = { id: 'cr-setubal', name: 'Setúbal', city: 'Setúbal' };

const TIEBREAKERS = [
  { metric: 'points', label: 'Puntos obtenidos', priority: 1, enabled: true },
  { metric: 'head_to_head', label: 'Resultado entre sí', priority: 2, enabled: true },
  { metric: 'points_difference', label: 'Diferencia de tantos', priority: 3, enabled: true },
  { metric: 'won', label: 'Partidos ganados', priority: 4, enabled: true },
];
/** El bonus lo pone el CONECTOR (puntos manuales): defensivo sí, ofensivo no (el sitio no da tries). */
const RULESET = {
  pointsWin: PUNTOS_SXV.win, pointsDraw: PUNTOS_SXV.draw, pointsLoss: PUNTOS_SXV.loss, pointsBonusTry: 1, pointsBonusLoss: 1,
  points: { ...PUNTOS_SXV },
  pointsSystem: { ...PUNTOS_SXV, bonusTry: 1, bonusLoss: 1, allowBonusPoints: true },
  bonus: { offensive: { tries: 4, points: 1 }, defensive: { margin: 7, points: 1 } },
  standings: {
    points_base: { ...PUNTOS_SXV },
    bonus_rules: [
      { id: 'try_bonus', label: '4 tries o más', points_awarded: 1 },
      { id: 'close_loss', label: 'Derrota por 7 o menos', points_awarded: 1 },
    ],
  },
  competition: { format_type: 'league', parameters: { season_model: 'season' } },
  tiebreakers: TIEBREAKERS,
  organizers: [{ name: 'Associação SUPER XV', union_id: UNION, is_primary: true }],
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

async function leerJornadas(): Promise<JornadaSxv[]> {
  const out: JornadaSxv[] = [];
  for (let j = 1; j <= SXV_JORNADAS_MAX; j++) {
    const r = await fetchJornada(j);
    if (r.status === -1) break; // el sitio devolvió la 1: no hay más jornadas
    if (!r.ok || !r.data) throw new Error(`jornada ${j}: superxv.pt no contestó (${r.status})`);
    out.push(r.data);
    await new Promise((listo) => setTimeout(listo, 300));
  }
  return out;
}

function rangoDe(j: JornadaSxv): { desde: string | null; hasta: string | null } {
  const dias = j.partidos.map((p) => p.fecha).filter(Boolean).sort() as string[];
  return dias.length ? { desde: dias[0], hasta: dias[dias.length - 1] } : { desde: j.desde, hasta: j.hasta };
}

async function main() {
  console.log(`modo: ${modo}\n`);
  const jornadas = await leerJornadas();
  const nombres = [...new Set(jornadas.flatMap((j) => j.partidos.flatMap((p) => [p.local, p.visitante])))];
  const sinClub = nombres.filter((n) => !EQUIPOS[n]);
  if (sinClub.length) throw new Error(`equipos del sitio sin club en EQUIPOS: ${sinClub.join(', ')}`);

  const clubes = [...new Set(Object.values(EQUIPOS))];
  const enBase = new Map((await leer<any>(`clubs?select=id,name,country&id=in.(${clubes.join(',')})`)).map((c) => [c.id, c]));
  const faltan = clubes.filter((c) => !enBase.has(c) && c !== CLUB_NUEVO.id);
  if (faltan.length) throw new Error(`clubes que deberían existir y no están: ${faltan.join(', ')}`);
  const crearClub = !enBase.has(CLUB_NUEVO.id);
  if (crearClub && !fs.existsSync(path.join(REPO, 'public', 'clubs', `${CLUB_NUEVO.id}.png`))) {
    throw new Error(`falta public/clubs/${CLUB_NUEVO.id}.png`);
  }

  const aliasBase = new Map((await leer<any>(`club_external_ids?select=external_id,club_id&provider=eq.${SXV_PROVIDER}`)).map((a) => [a.external_id, a.club_id]));
  const alias = Object.entries(EQUIPOS).map(([n, club]) => ({ clave: normalizarNombre(n), club }));
  const distintos = alias.filter((a) => aliasBase.has(a.clave) && aliasBase.get(a.clave) !== a.club);
  if (distintos.length) throw new Error(`alias ya cargados con otro club: ${distintos.map((a) => a.clave).join(', ')}`);
  const aliasNuevos = alias.filter((a) => !aliasBase.has(a.clave))
    .map((a) => ({ provider: SXV_PROVIDER, external_id: a.clave, club_id: a.club, confidence: 'exacto', created_at: ahora }));

  const yaEsta = (await leer<any>(`tournaments?select=id&slug=eq.${SLUG}`)).length > 0;

  console.log(`jornadas: ${jornadas.length} · partidos: ${jornadas.reduce((n, j) => n + j.partidos.length, 0)}`);
  for (const j of jornadas) {
    const r = rangoDe(j);
    console.log(`  Fecha ${j.jornada}: ${r.desde ?? '?'} → ${r.hasta ?? '?'} · ${j.partidos.length} partidos${j.partidos.some((p) => !p.fecha) ? ' (sin días)' : ''}`);
  }
  console.log(`\nclub nuevo: ${crearClub ? CLUB_NUEVO.id : 'ninguno (ya está)'}`);
  console.log(`alias a crear: ${aliasNuevos.length}`);
  console.log(`torneo: ${yaEsta ? 'ya existe, se saltea' : `${NOMBRE} · ${buildTournamentExternalId()}`}`);
  if (modo === 'plan') { console.log('\nmodo --plan: no se escribió nada.'); return; }

  if (crearClub) {
    await insertar('clubs', [{
      id: CLUB_NUEVO.id, union_id: UNION, name: CLUB_NUEVO.name, short_name: CLUB_NUEVO.name, city: CLUB_NUEVO.city, region: null,
      country: PAIS, logo_url: `/clubs/${CLUB_NUEVO.id}.png`, primary_color: null, slug: CLUB_NUEVO.id, is_visible: true,
      entity_type: 'club', sport: 'rugby', sport_id: 'rugby', category: null, categories: [], status: 'active', visibility: 'visible',
      external_id: null, created_at: ahora, updated_at: ahora,
    }]);
  }
  await insertar('club_external_ids', aliasNuevos);
  if (yaEsta) { console.log('✓ club y alias; el torneo ya estaba'); return; }

  const tournamentId = crypto.randomUUID();
  const seasonId = crypto.randomUUID();
  const faseId = crypto.randomUUID();
  const rondas = jornadas.map((j) => ({ ...rangoDe(j), jornada: j.jornada }));
  const fechas = rondas.flatMap((r) => [r.desde, r.hasta]).filter(Boolean).sort() as string[];
  try {
    await insertar('tournaments', [{
      id: tournamentId, union_id: UNION, season_id: SXV_TEMPORADA,
      name: NOMBRE, display_name: NOMBRE, original_name: 'SUPER XV', slug: SLUG,
      status: 'published', category: 'Primera A', gender: 'masculino', age_grade: 'mayores',
      region: PAIS, country: PAIS, country_id: 'portugal', country_name: PAIS,
      format: 'league', is_visible: true, is_active: true, logo_url: null,
      ruleset: RULESET, ruleset_version: 1, sport_id: 'rugby', sport: 'rugby', sport_name: 'Rugby',
      priority: 0, sponsors: [], social_links: {}, display_order: 0, is_popular: false,
      // `url` vacía e `is_api_managed` en false: la página lee la base, no FlashScore.
      is_api_managed: false, review_status: 'approved', data_source: null,
      external_id: buildTournamentExternalId(), current_season_id: null, created_at: ahora, updated_at: ahora,
    }]);
    await insertar('tournament_seasons', [{
      id: seasonId, tournament_id: tournamentId, legacy_tournament_id: tournamentId,
      season_code: SXV_TEMPORADA, name: `${NOMBRE} ${SXV_TEMPORADA}`, display_name: `${NOMBRE} ${SXV_TEMPORADA}`,
      slug: SLUG, status: 'active', is_active: true, start_date: fechas[0] ?? null, end_date: fechas[fechas.length - 1] ?? null,
      format: 'league', ruleset: RULESET, settings: { source: ORIGEN }, champion_club_id: null, created_at: ahora, updated_at: ahora,
    }]);
    await actualizar(`tournaments?id=eq.${tournamentId}`, { current_season_id: seasonId });
    await insertar('tournament_phases', [{
      id: faseId, tournament_id: tournamentId, season_id: seasonId, name: 'Campeonato', phase_type: 'league', order_index: 1, is_active: true,
      settings: {
        teamsCount: clubes.length, legs: 1, points: { ...PUNTOS_SXV },
        pointsSystem: { ...PUNTOS_SXV, bonusTry: 1, bonusLoss: 1, allowBonusPoints: true },
        bonus: RULESET.bonus, tiebreakers: TIEBREAKERS, source: ORIGEN,
        standings: { mode: 'automatic', editable: true },
        superxv: { competicao: 'campeonato', temporada: SXV_TEMPORADA },
      },
      created_at: ahora, updated_at: ahora,
    }]);
    await insertar('tournament_rounds', rondas.map((r) => ({
      id: crypto.randomUUID(), phase_id: faseId, season_id: seasonId, name: `Fecha ${r.jornada}`, order_index: r.jornada,
      start_date: r.desde, end_date: r.hasta, is_completed: false, notes: null, created_at: ahora, updated_at: ahora,
    })));
    const ids = new Map(clubes.map((c) => [c, { p: crypto.randomUUID(), e: crypto.randomUUID() }]));
    const nombreDe = (c: string) => (c === CLUB_NUEVO.id ? CLUB_NUEVO.name : enBase.get(c)?.name ?? c);
    await insertar('tournament_participants', clubes.map((c) => ({
      id: ids.get(c)!.p, tournament_id: tournamentId, season_id: seasonId, season_entry_id: null, club_id: c, name: nombreDe(c),
      type: 'club', status: 'active', seed: null, group_id: null, short_code: null, notes: ORIGEN, joined_at: ahora, created_at: ahora, updated_at: ahora,
    })));
    await insertar('team_season_entries', clubes.map((c) => ({
      id: ids.get(c)!.e, season_id: seasonId, tournament_id: tournamentId, club_id: c, team_id: null, source_participant_id: ids.get(c)!.p,
      group_id: null, zone: null, category: null, status: 'active', seed: null, notes: null, settings: { source: ORIGEN }, created_at: ahora, updated_at: ahora,
    })));
    for (const c of clubes) await actualizar(`tournament_participants?id=eq.${ids.get(c)!.p}`, { season_entry_id: ids.get(c)!.e });
    await insertar('tournament_phase_participants', clubes.map((c) => ({
      id: crypto.randomUUID(), tournament_id: tournamentId, season_id: seasonId, phase_id: faseId, participant_id: ids.get(c)!.p,
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

  const sql = ['-- Rollback del alta de la Super XV 2026-27.', 'BEGIN;',
    `DELETE FROM public.tournament_standings WHERE tournament_id = '${tournamentId}';`,
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
    ...(aliasNuevos.length ? [`DELETE FROM public.club_external_ids WHERE provider = '${SXV_PROVIDER}' AND external_id IN (${aliasNuevos.map((a) => `'${a.external_id}'`).join(', ')});`] : []),
    ...(crearClub ? [`DELETE FROM public.clubs WHERE id = '${CLUB_NUEVO.id}';`] : []),
    'COMMIT;', ''];
  fs.writeFileSync(ROLLBACK, sql.join('\n'), 'utf8');
  console.log(`✓ ${NOMBRE}  /tournaments/${tournamentId}  (${rondas.length} fechas · ${clubes.length} participantes)`);
  console.log(`rollback: ${ROLLBACK}`);
}

main().catch((e) => { console.error('\nFALLÓ:', e.message || e); process.exit(1); });
