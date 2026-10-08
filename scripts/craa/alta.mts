/**
 * Alta del rugby universitario de EE.UU. (CRAA) que sincroniza
 * `/api/cron/craa-sync`. El canon es `datos.mjs`; los escudos tienen que estar
 * antes (`node scripts/craa/escudos.mjs --execute`).
 *
 *   node scripts/craa/alta.mts --plan
 *   node scripts/craa/alta.mts --execute
 *
 * Escribe clubes (uno por universidad y rama), el mapa de nombres de la
 * planilla (`club_external_ids`, provider `craa`, `{rama}:{nombre}`) y por
 * división: torneo, temporada, UNA fase de liga con `settings.craa`, las rondas
 * (una por semana con partidos, de lunes a domingo: una fecha es un fin de
 * semana) y los participantes en sus TRES tablas. Los PARTIDOS y la tabla
 * oficial de la D1A no: los escribe el cron en su primera corrida, que es el
 * mismo camino que después los mantiene.
 *
 * Un nombre que juega en la planilla y no está en `datos.mjs` frena el alta
 * antes de escribir nada.
 *
 * Idempotente: un torneo cuyo slug ya está se saltea (pero se le refrescan los
 * husos de `settings.craa.zonas`, para los clubes nuevos), un club que ya existe
 * no se pisa y un alias que ya está no se duplica. Un torneo que falla a mitad
 * se deshace. Deja `CRAA_ALTA_ROLLBACK.sql`.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { fetchPestana } from '../../src/lib/integrations/craa/client.ts';
import {
  buildTournamentExternalId, claveDeEquipo, CRAA_PROVIDER, DIVISIONES, noEsEquipo, type DivisionCraa, type RamaCraa,
} from '../../src/lib/integrations/craa/fuentes.ts';
import type { FilaCraa } from '../../src/lib/integrations/craa/parse.ts';
import { semanaDe } from '../../src/lib/integrations/craa/planMatches.ts';
import {
  INTEGRANTES, ORIGEN, PAIS, PUNTOS, RULESET, TEMPORADA_CODIGO, TEMPORADA_NOMBRE, TIEBREAKERS, UNION, UNIVERSIDADES,
} from './datos.mjs';

const REPO = process.cwd();
const ROLLBACK = path.join(REPO, 'CRAA_ALTA_ROLLBACK.sql');

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
  for (let i = 0; i < filas.length; i += 200) {
    const res = await fetch(`${URL_BASE}/rest/v1/${tabla}`, {
      method: 'POST',
      headers: { ...H, 'content-type': 'application/json', prefer: 'return=minimal' },
      body: JSON.stringify(filas.slice(i, i + 200)),
    });
    if (!res.ok) throw new Error(`POST ${tabla}: ${res.status} ${(await res.text()).slice(0, 400)}`);
  }
}

async function actualizar(recurso: string, cuerpo: object) {
  const res = await fetch(encodeURI(`${URL_BASE}/rest/v1/${recurso}`), {
    method: 'PATCH',
    headers: { ...H, 'content-type': 'application/json', prefer: 'return=minimal' },
    body: JSON.stringify(cuerpo),
  });
  if (!res.ok) throw new Error(`PATCH ${recurso}: ${res.status} ${(await res.text()).slice(0, 400)}`);
}

async function borrar(recurso: string) {
  const res = await fetch(encodeURI(`${URL_BASE}/rest/v1/${recurso}`), { method: 'DELETE', headers: { ...H, prefer: 'return=minimal' } });
  if (!res.ok) throw new Error(`DELETE ${recurso}: ${res.status} ${(await res.text()).slice(0, 300)}`);
}

async function limpiarTorneo(tournamentId: string) {
  const fases = await leer<{ id: string }>(`tournament_phases?select=id&tournament_id=eq.${tournamentId}`);
  const idsFase = fases.map((f) => f.id);
  await borrar(`tournament_standings?tournament_id=eq.${tournamentId}`);
  await borrar(`matches?tournament_id=eq.${tournamentId}`);
  await borrar(`tournament_phase_participants?tournament_id=eq.${tournamentId}`);
  await actualizar(`tournament_participants?tournament_id=eq.${tournamentId}`, { season_entry_id: null });
  await borrar(`team_season_entries?tournament_id=eq.${tournamentId}`);
  await borrar(`tournament_participants?tournament_id=eq.${tournamentId}`);
  if (idsFase.length) await borrar(`tournament_rounds?phase_id=in.(${idsFase.join(',')})`);
  await borrar(`tournament_phases?tournament_id=eq.${tournamentId}`);
  await actualizar(`tournaments?id=eq.${tournamentId}`, { current_season_id: null });
  await borrar(`tournament_seasons?tournament_id=eq.${tournamentId}`);
  await borrar(`tournaments?id=eq.${tournamentId}`);
}

const ahora = new Date().toISOString();

// ── Clubes del canon ─────────────────────────────────────────────────────────

interface ClubCanon {
  id: string;
  name: string;
  rama: RamaCraa;
  universidad: any;
  logo: string | null;
}

const RAMA_DE_DIVISION = new Map(DIVISIONES.map((d) => [d.id, d.rama]));
const integrantesDe = (rama: RamaCraa) => new Set(Object.entries(INTEGRANTES as Record<string, string[]>)
  .filter(([d]) => RAMA_DE_DIVISION.get(d) === rama).flatMap(([, keys]) => keys));
const enDivisiones = { masculino: integrantesDe('masculino'), femenino: integrantesDe('femenino') };
const clubIdDe = (key: string, rama: RamaCraa) => (rama === 'femenino' ? `us-${key}-femenino` : `us-${key}`);

function logoDe(u: any): string | null {
  const archivo = `us-${u.escudoDe ?? u.key}`;
  return fs.existsSync(path.join(REPO, 'public', 'clubs', `${archivo}.png`)) ? `/clubs/${archivo}.png` : null;
}

const CLUBES: ClubCanon[] = (UNIVERSIDADES as any[]).flatMap((u) => (['masculino', 'femenino'] as RamaCraa[])
  .filter((rama) => (rama === 'masculino' ? u.m?.length : u.f?.length) || enDivisiones[rama].has(u.key))
  .map((rama) => ({
    id: clubIdDe(u.key, rama),
    name: rama === 'femenino' ? `${u.name} Femenino` : u.name,
    rama, universidad: u, logo: logoDe(u),
  })));
const clubPorId = new Map(CLUBES.map((c) => [c.id, c]));

/** El huso del campus de cada club: lo lee el cron para la hora de los partidos. */
const ZONAS = Object.fromEntries(CLUBES.map((c) => [c.id, c.universidad.zona]));

function filaDeClub(c: ClubCanon) {
  const u = c.universidad;
  return {
    id: c.id, union_id: UNION, name: c.name, short_name: c.name,
    city: u.ciudad ?? null, region: u.estado ?? null, country: u.pais ?? PAIS,
    logo_url: c.logo, primary_color: null,
    slug: c.id, is_visible: true, entity_type: 'club', sport: 'rugby', sport_id: 'rugby',
    category: null, categories: [], status: 'active', visibility: 'visible',
    external_id: null, created_at: ahora, updated_at: ahora,
  };
}

/** Alias `{rama}:{nombre normalizado}` → club. Dos universidades con el mismo alias frenan el alta. */
function aliasDelCanon() {
  const alias = new Map<string, string>();
  const choques: string[] = [];
  for (const c of CLUBES) {
    const nombres: string[] = (c.rama === 'masculino' ? c.universidad.m : c.universidad.f) ?? [];
    for (const n of new Set([...nombres, c.universidad.name])) {
      const clave = claveDeEquipo(n, c.rama);
      if (alias.has(clave) && alias.get(clave) !== c.id) choques.push(`${clave}: ${alias.get(clave)} y ${c.id}`);
      else alias.set(clave, c.id);
    }
  }
  if (choques.length) throw new Error(`alias repetidos en datos.mjs: ${choques.join(', ')}`);
  return alias;
}

// ── Torneos ──────────────────────────────────────────────────────────────────

interface DivisionLeida {
  div: DivisionCraa;
  filas: FilaCraa[];
  rondas: { nombre: string; desde: string; hasta: string; orden: number }[];
  participantes: string[];
}

async function leerDivision(div: DivisionCraa, alias: Map<string, string>): Promise<DivisionLeida> {
  const filas: FilaCraa[] = [];
  for (const [semestre, url] of Object.entries(div.planillas)) {
    const r = await fetchPestana(url);
    if (!r.ok || !r.data) throw new Error(`${div.nombre} / ${semestre}: la planilla no contestó (${r.status})`);
    filas.push(...r.data);
  }
  const equipos = filas.flatMap((f) => [f.local, f.visitante]).filter((n) => n && !noEsEquipo(n));
  const sinAlias = [...new Set(equipos.filter((n) => !alias.has(claveDeEquipo(n, div.rama))))];
  if (sinAlias.length) throw new Error(`${div.nombre}: nombres de la planilla sin club en datos.mjs (${div.rama}): ${sinAlias.join(', ')}`);

  const semanas = new Map<string, { desde: string; hasta: string }>();
  for (const f of filas) {
    if (!f.fecha || !f.visitante || noEsEquipo(f.local) || noEsEquipo(f.visitante)) continue;
    const s = semanaDe(f.fecha);
    semanas.set(s.desde, s);
  }
  const rondas = [...semanas.values()].sort((a, b) => a.desde.localeCompare(b.desde))
    .map((s, i) => ({ nombre: `Fecha ${i + 1}`, desde: s.desde, hasta: s.hasta, orden: i + 1 }));
  const participantes = ((INTEGRANTES as Record<string, string[]>)[div.id] ?? []).map((k) => clubIdDe(k, div.rama));
  const faltan = participantes.filter((id) => !clubPorId.has(id));
  if (faltan.length) throw new Error(`${div.nombre}: integrantes sin club en el canon: ${faltan.join(', ')}`);
  return { div, filas, rondas, participantes };
}

const slugDe = (div: DivisionCraa) => `us-craa-${div.id}-${TEMPORADA_CODIGO}`;

async function crearTorneo(d: DivisionLeida) {
  const tournamentId = crypto.randomUUID();
  try {
    await escribirTorneo(d, tournamentId);
    return tournamentId;
  } catch (e) {
    await limpiarTorneo(tournamentId).catch((e2) => console.error(`  la limpieza de ${d.div.id} falló también: ${e2.message}`));
    throw e;
  }
}

async function escribirTorneo(d: DivisionLeida, tournamentId: string) {
  const seasonId = crypto.randomUUID();
  const faseId = crypto.randomUUID();
  const { div } = d;
  const femenino = div.rama === 'femenino';
  const conTabla = Boolean(div.tabla);
  const inicio = d.rondas[0]?.desde ?? null;
  const fin = d.rondas[d.rondas.length - 1]?.hasta ?? null;

  // FK circular: el torneo nace sin temporada actual y se engancha después.
  await insertar('tournaments', [{
    id: tournamentId, union_id: UNION, season_id: TEMPORADA_CODIGO,
    name: div.nombre, display_name: div.nombre, original_name: div.nombre, slug: slugDe(div),
    status: 'published', category: 'Universitario', gender: femenino ? 'femenino' : 'masculino', age_grade: 'mayores',
    region: PAIS, country: PAIS, country_id: 'usa', country_name: PAIS,
    format: 'league', is_visible: true, is_active: true, logo_url: `/competiciones/craa-${div.id}.png`,
    ruleset: RULESET, ruleset_version: 1,
    sport_id: 'rugby', sport: 'rugby', sport_name: 'Rugby',
    priority: 0, sponsors: [], social_links: {}, display_order: 0, is_popular: false,
    // `url` vacía e `is_api_managed` en false A PROPÓSITO: con un link en `url`
    // y `is_api_managed` en true la página lo trata como de FlashScore y no lee
    // la base (pasó con iSquad).
    is_api_managed: false, review_status: 'approved', data_source: null,
    external_id: buildTournamentExternalId(div.id, TEMPORADA_CODIGO),
    current_season_id: null, created_at: ahora, updated_at: ahora,
  }]);
  await insertar('tournament_seasons', [{
    id: seasonId, tournament_id: tournamentId, legacy_tournament_id: tournamentId,
    season_code: TEMPORADA_CODIGO, name: `${div.nombre} ${TEMPORADA_NOMBRE}`, display_name: `${div.nombre} ${TEMPORADA_NOMBRE}`,
    slug: slugDe(div), status: 'active', is_active: true,
    start_date: inicio, end_date: fin, format: 'league', ruleset: RULESET,
    settings: { source: ORIGEN, craa: { division: div.id, rama: div.rama } },
    champion_club_id: null, created_at: ahora, updated_at: ahora,
  }]);
  await actualizar(`tournaments?id=eq.${tournamentId}`, { current_season_id: seasonId });

  await insertar('tournament_phases', [{
    id: faseId, tournament_id: tournamentId, season_id: seasonId,
    name: `Temporada ${TEMPORADA_NOMBRE}`, phase_type: 'league', order_index: 1, is_active: true,
    settings: {
      teamsCount: d.participantes.length,
      legs: 1,
      points: { ...PUNTOS },
      pointsSystem: { ...PUNTOS, bonusTry: 0, bonusLoss: 0, allowBonusPoints: false },
      tiebreakers: TIEBREAKERS,
      source: ORIGEN,
      // La D1A muestra la tabla OFICIAL de la CRAA, que escribe el cron.
      standings: conTabla
        ? { mode: 'fully_manual', editable: true, source: 'Tabla oficial de la CRAA' }
        : { mode: 'automatic', editable: true },
      craa: { division: div.id, rama: div.rama, tabla: conTabla, zonas: ZONAS },
    },
    created_at: ahora, updated_at: ahora,
  }]);
  await insertar('tournament_rounds', d.rondas.map((r) => ({
    id: crypto.randomUUID(), phase_id: faseId, season_id: seasonId,
    name: r.nombre, order_index: r.orden, start_date: r.desde, end_date: r.hasta,
    is_completed: false, notes: null, created_at: ahora, updated_at: ahora,
  })));

  // ── Las TRES filas de participante ──────────────────────────────────────
  const ids = new Map(d.participantes.map((c) => [c, { participantId: crypto.randomUUID(), entryId: crypto.randomUUID() }]));
  await insertar('tournament_participants', d.participantes.map((c) => ({
    id: ids.get(c)!.participantId, tournament_id: tournamentId, season_id: seasonId,
    season_entry_id: null, club_id: c, name: clubPorId.get(c)!.name, type: 'club',
    status: 'active', seed: null, group_id: null, short_code: null,
    notes: ORIGEN, joined_at: ahora, created_at: ahora, updated_at: ahora,
  })));
  await insertar('team_season_entries', d.participantes.map((c) => ({
    id: ids.get(c)!.entryId, season_id: seasonId, tournament_id: tournamentId, club_id: c,
    team_id: null, source_participant_id: ids.get(c)!.participantId, group_id: null,
    zone: null, category: null, status: 'active', seed: null, notes: null,
    settings: { source: ORIGEN }, created_at: ahora, updated_at: ahora,
  })));
  for (const c of d.participantes) {
    await actualizar(`tournament_participants?id=eq.${ids.get(c)!.participantId}`, { season_entry_id: ids.get(c)!.entryId });
  }
  await insertar('tournament_phase_participants', d.participantes.map((c) => ({
    id: crypto.randomUUID(), tournament_id: tournamentId, season_id: seasonId,
    phase_id: faseId, participant_id: ids.get(c)!.participantId, group_id: null,
    status: 'active', seed: null, notes: null, created_at: ahora, updated_at: ahora,
  })));
}

async function main() {
  console.log(`modo: ${modo}\n`);

  // ── Clubes ─────────────────────────────────────────────────────────────────
  const ids = CLUBES.map((c) => c.id);
  const enBase = new Map((await leer<any>(`clubs?select=id,name,country&id=in.(${ids.join(',')})`)).map((c) => [c.id, c]));
  const choques = CLUBES.filter((c) => enBase.has(c.id) && ![PAIS, 'Canadá'].includes(enBase.get(c.id).country));
  if (choques.length) throw new Error(`ids ya usados por otro club: ${choques.map((c) => `${c.id} (${enBase.get(c.id).name}, ${enBase.get(c.id).country})`).join(', ')}`);
  const clubesNuevos = CLUBES.filter((c) => !enBase.has(c.id));

  // ── Alias ──────────────────────────────────────────────────────────────────
  const alias = aliasDelCanon();
  const aliasBase = new Map((await leer<any>(`club_external_ids?select=external_id,club_id&provider=eq.${CRAA_PROVIDER}`)).map((a) => [a.external_id, a.club_id]));
  const aliasDistintos = [...alias].filter(([clave, club]) => aliasBase.has(clave) && aliasBase.get(clave) !== club);
  if (aliasDistintos.length) throw new Error(`alias ya cargados con otro club: ${aliasDistintos.map(([k, c]) => `${k}→${c} (base: ${aliasBase.get(k)})`).join(', ')}`);
  const aliasNuevos = [...alias].filter(([clave]) => !aliasBase.has(clave))
    .map(([clave, club]) => ({ provider: CRAA_PROVIDER, external_id: clave, club_id: club, confidence: 'exacto', created_at: ahora }));

  // ── Torneos ────────────────────────────────────────────────────────────────
  const torneosDb = new Map((await leer<any>(`tournaments?select=id,slug&slug=in.(${DIVISIONES.map(slugDe).join(',')})`)).map((t) => [t.slug, t.id]));
  const leidas: DivisionLeida[] = [];
  for (const div of DIVISIONES) leidas.push(await leerDivision(div, alias));

  console.log(`clubes a crear (${clubesNuevos.length}, ${clubesNuevos.filter((c) => !c.logo).length} sin escudo):`);
  for (const c of clubesNuevos) console.log(`  + ${c.id.padEnd(34)} ${c.name.padEnd(30)} ${c.logo ?? '(sin escudo)'}`);
  console.log(`\nalias craa a crear: ${aliasNuevos.length} (ya estaban ${alias.size - aliasNuevos.length})`);
  console.log('\ntorneos:');
  for (const d of leidas) {
    const jugados = d.filas.filter((f) => f.puntosLocal !== null).length;
    const yaEsta = torneosDb.has(slugDe(d.div));
    console.log(`  ${yaEsta ? '=' : '+'} ${d.div.nombre} · ${buildTournamentExternalId(d.div.id, TEMPORADA_CODIGO)} · ${d.filas.length} filas, ${jugados} con resultado · ${d.participantes.length} participantes · ${d.rondas.length} fechas (${d.rondas[0]?.desde ?? '?'} → ${d.rondas[d.rondas.length - 1]?.hasta ?? '?'})${yaEsta ? ' — ya existe: solo se refrescan los husos' : ''}`);
  }

  if (modo === 'plan') { console.log('\nmodo --plan: no se escribió una sola fila.'); return; }

  // ── Escritura ──────────────────────────────────────────────────────────────
  await insertar('clubs', clubesNuevos.map(filaDeClub));
  console.log(`\n✓ ${clubesNuevos.length} clubes`);
  await insertar('club_external_ids', aliasNuevos);
  console.log(`✓ ${aliasNuevos.length} alias craa`);

  const creados: { nombre: string; tournamentId: string }[] = [];
  for (const d of leidas) {
    const existente = torneosDb.get(slugDe(d.div));
    if (existente) {
      const fases = await leer<any>(`tournament_phases?select=id,settings&tournament_id=eq.${existente}`);
      for (const f of fases.filter((x) => x.settings?.craa)) {
        await actualizar(`tournament_phases?id=eq.${f.id}`, { settings: { ...f.settings, craa: { ...f.settings.craa, zonas: ZONAS } }, updated_at: ahora });
      }
      console.log(`= ${d.div.nombre}: husos refrescados`);
      continue;
    }
    const tournamentId = await crearTorneo(d);
    creados.push({ nombre: d.div.nombre, tournamentId });
    console.log(`✓ ${d.div.nombre}  /tournaments/${tournamentId}  (${d.rondas.length} fechas · ${d.participantes.length} participantes)`);
  }

  // ── Rollback ───────────────────────────────────────────────────────────────
  const sql = ['-- Rollback del alta de la CRAA (rugby universitario de EE.UU.).',
    '-- Borra SÓLO lo que creó esta corrida. Los clubes van último: los torneos y',
    '-- los alias los referencian por FK.', 'BEGIN;', ''];
  for (const c of creados) {
    const fases = `(SELECT id FROM public.tournament_phases WHERE tournament_id = '${c.tournamentId}')`;
    sql.push(`-- ${c.nombre}`);
    sql.push(`DELETE FROM public.tournament_standings WHERE tournament_id = '${c.tournamentId}';`);
    sql.push(`DELETE FROM public.matches WHERE tournament_id = '${c.tournamentId}';`);
    sql.push(`DELETE FROM public.tournament_phase_participants WHERE tournament_id = '${c.tournamentId}';`);
    sql.push(`UPDATE public.tournament_participants SET season_entry_id = NULL WHERE tournament_id = '${c.tournamentId}';`);
    sql.push(`DELETE FROM public.team_season_entries WHERE tournament_id = '${c.tournamentId}';`);
    sql.push(`DELETE FROM public.tournament_participants WHERE tournament_id = '${c.tournamentId}';`);
    sql.push(`DELETE FROM public.tournament_rounds WHERE phase_id IN ${fases};`);
    sql.push(`DELETE FROM public.tournament_phases WHERE tournament_id = '${c.tournamentId}';`);
    sql.push(`UPDATE public.tournaments SET current_season_id = NULL WHERE id = '${c.tournamentId}';`);
    sql.push(`DELETE FROM public.tournament_seasons WHERE tournament_id = '${c.tournamentId}';`);
    sql.push(`DELETE FROM public.tournaments WHERE id = '${c.tournamentId}';`);
    sql.push('');
  }
  if (aliasNuevos.length) {
    sql.push('-- Alias de equipos creados por esta corrida');
    sql.push(`DELETE FROM public.club_external_ids WHERE provider = '${CRAA_PROVIDER}' AND external_id IN (${aliasNuevos.map((a) => `'${a.external_id.replace(/'/g, "''")}'`).join(', ')});`);
    sql.push('');
  }
  if (clubesNuevos.length) {
    sql.push('-- Clubes creados por esta corrida (antes, los partidos que los nombran)');
    const lista = clubesNuevos.map((c) => `'${c.id}'`).join(', ');
    sql.push(`DELETE FROM public.matches WHERE external_id LIKE 'craa:%' AND (home_club_id IN (${lista}) OR away_club_id IN (${lista}));`);
    sql.push(`DELETE FROM public.clubs WHERE id IN (${lista});`);
    sql.push('');
  }
  sql.push('COMMIT;');
  fs.writeFileSync(ROLLBACK, sql.join('\n') + '\n', 'utf8');
  console.log(`\nrollback escrito: ${ROLLBACK}`);
  console.log('\nFaltan el fixture y la tabla oficial de la D1A: los escribe la primera corrida de /api/cron/craa-sync.');
}

main().catch((e) => { console.error('\nFALLÓ:', e.message || e); process.exit(1); });
