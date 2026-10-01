/**
 * Alta de las competiciones de la FER que sincroniza `/api/cron/isquad-sync`.
 * El canon es `datos.mjs`; los escudos tienen que estar antes
 * (`node scripts/isquad/escudos.mjs --execute`).
 *
 *   node scripts/isquad/alta.mts --plan
 *   node scripts/isquad/alta.mts --execute
 *
 * Escribe clubes, el mapa de equipos (`club_external_ids`, provider `isquad`) y
 * por torneo: temporada, fase con `settings.isquad.grupos`, zonas, jornadas y
 * los participantes en sus TRES tablas. Los PARTIDOS no: los crea el cron en su
 * primera corrida, que es el mismo camino que después los mantiene. Así no hay
 * dos lógicas de fixture que puedan discrepar.
 *
 * Las jornadas salen de iSquad (número y fechas), y los equipos de cada grupo
 * también: un equipo que juega en un grupo y no está en `EQUIPOS` frena el alta
 * antes de escribir nada.
 *
 * Idempotente: un torneo cuyo slug ya está se saltea entero, un club que ya
 * existe no se pisa y un alias que ya está no se duplica. Un torneo que falla a
 * mitad se deshace (sin eso la corrida siguiente lo saltearía por slug y
 * quedaría una cáscara). Deja `ISQUAD_ALTA_ROLLBACK.sql`.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { fetchResultados, pausa, PAUSA_MS } from '../../src/lib/integrations/isquad/client.ts';
import type { PartidoIsquad } from '../../src/lib/integrations/isquad/parse.ts';
import {
  buildTournamentExternalId, claveDeEquipo, ISQUAD_PROVIDER, madridAIso,
} from '../../src/lib/integrations/isquad/nombres.ts';
import {
  CLUBES, EQUIPOS, ORIGEN, RULESET, TEMPORADA, TEMPORADA_CODIGO, TEMPORADA_NOMBRE, TIEBREAKERS, TORNEOS, UNION_FER, PUNTOS,
} from './datos.mjs';

const REPO = process.cwd();
const ROLLBACK = path.join(REPO, 'ISQUAD_ALTA_ROLLBACK.sql');
const PAIS = 'España';
/** El logo de la federación (lo publica iSquad): ninguna competición tiene uno propio. */
const LOGO_FER = '/competiciones/es-fer.png';

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
    method: 'POST',
    headers: { ...H, 'content-type': 'application/json', prefer: 'return=minimal' },
    body: JSON.stringify(filas),
  });
  if (!res.ok) throw new Error(`POST ${tabla}: ${res.status} ${(await res.text()).slice(0, 400)}`);
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
const COLORES_ZONA = ['#00a365', '#eab308', '#f97316', '#3b82f6'];
const porId = new Map(CLUBES.map((c: any) => [c.id, c]));
const nombresBase = new Map<string, string>();
const archivoDeEscudo = (id: string) => (porId.get(id)?.escudoDe ?? id) as string;

function escudoLocal(id: string) {
  const archivo = archivoDeEscudo(id);
  if (!fs.existsSync(path.join(REPO, 'public', 'clubs', `${archivo}.png`))) {
    throw new Error(`falta public/clubs/${archivo}.png — corré scripts/isquad/escudos.mjs --execute primero`);
  }
  return `/clubs/${archivo}.png`;
}

function filaDeClub(c: any) {
  const padre = c.padre ? porId.get(c.padre) : null;
  return {
    id: c.id, union_id: UNION_FER, name: c.name, short_name: c.name,
    city: c.city ?? padre?.city ?? null, region: c.region ?? padre?.region ?? null, country: PAIS,
    logo_url: escudoLocal(c.id), primary_color: null,
    slug: c.id, is_visible: true, entity_type: 'club', sport: 'rugby', sport_id: 'rugby',
    category: null, categories: [], status: 'active', visibility: 'visible',
    external_id: null, created_at: ahora, updated_at: ahora,
  };
}

const fechaIso = (ddmmyyyy: string | null) => {
  const iso = ddmmyyyy ? madridAIso(ddmmyyyy, '12:00') : null;
  return iso ? iso.slice(0, 10) : null;
};

interface GrupoLeido { id: string; nombre: string | null; partidos: PartidoIsquad[]; equipos: string[] }

async function leerGrupos(t: any): Promise<GrupoLeido[]> {
  const out: GrupoLeido[] = [];
  for (const g of t.fases[0].grupos) {
    const r = await fetchResultados(g.id);
    await pausa(PAUSA_MS);
    if (!r.ok || !r.data) throw new Error(`${t.nombre} / grupo ${g.id}: iSquad no contestó (${r.status})`);
    const equipos = [...new Set(r.data.flatMap((p) => [p.localId, p.visitanteId]))].sort();
    out.push({ id: g.id, nombre: g.nombre, partidos: r.data, equipos });
  }
  return out;
}

function jornadasDe(grupos: GrupoLeido[]) {
  const porNumero = new Map<number, string[]>();
  for (const g of grupos) for (const p of g.partidos) {
    if (!p.jornada) continue;
    const f = fechaIso(p.fecha);
    porNumero.set(p.jornada, [...(porNumero.get(p.jornada) ?? []), ...(f ? [f] : [])]);
  }
  return [...porNumero.entries()].sort((a, b) => a[0] - b[0]).map(([n, fechas]) => {
    const orden = [...fechas].sort();
    return { n, desde: orden[0] ?? null, hasta: orden[orden.length - 1] ?? null };
  });
}

async function crearTorneo(t: any, grupos: GrupoLeido[]) {
  const tournamentId = crypto.randomUUID();
  const seasonId = crypto.randomUUID();
  try {
    return await escribirTorneo(t, grupos, tournamentId, seasonId);
  } catch (e) {
    await limpiarTorneo(tournamentId).catch((e2) => console.error(`  la limpieza de ${t.slug} falló también: ${e2.message}`));
    throw e;
  }
}

async function escribirTorneo(t: any, grupos: GrupoLeido[], tournamentId: string, seasonId: string) {
  const jornadas = jornadasDe(grupos);
  const desde = jornadas[0]?.desde ?? null;
  const hasta = jornadas[jornadas.length - 1]?.hasta ?? null;
  const conZonas = grupos.length > 1;
  const equipos = grupos.reduce((n, g) => n + g.equipos.length, 0);
  // Ida y vuelta o una sola vuelta: lo dice el fixture (la DH B femenina es a una).
  const g0 = grupos[0];
  const vueltas = Math.max(1, Math.round(g0.partidos.length / ((g0.equipos.length * (g0.equipos.length - 1)) / 2)));

  // FK circular: el torneo nace sin temporada actual y se engancha después.
  await insertar('tournaments', [{
    id: tournamentId, union_id: UNION_FER, season_id: TEMPORADA_CODIGO,
    name: t.nombre, display_name: t.nombre, original_name: t.nombre, slug: t.slug,
    status: 'published', category: t.categoria, gender: t.genero, age_grade: t.edad,
    region: PAIS, country: PAIS, country_id: 'spain', country_name: PAIS,
    format: conZonas ? 'groups' : 'league', is_visible: true, is_active: true, logo_url: LOGO_FER,
    ruleset: RULESET, ruleset_version: 1,
    sport_id: 'rugby', sport: 'rugby', sport_name: 'Rugby',
    priority: 0, sponsors: [], social_links: {}, display_order: 0, is_popular: false,
    // `url` vacía e `is_api_managed` en false A PROPÓSITO: con el link de iSquad en `url` y
    // `is_api_managed` en true la página lo trató como de FlashScore y no leyó la base.
    is_api_managed: false, review_status: 'approved', data_source: null,
    external_id: buildTournamentExternalId(TEMPORADA, t.campeonato),
    current_season_id: null, created_at: ahora, updated_at: ahora,
  }]);
  await insertar('tournament_seasons', [{
    id: seasonId, tournament_id: tournamentId, legacy_tournament_id: tournamentId,
    season_code: TEMPORADA_CODIGO, name: `${t.nombre} ${TEMPORADA_NOMBRE}`, display_name: `${t.nombre} ${TEMPORADA_NOMBRE}`,
    slug: `${t.slug}-${TEMPORADA_CODIGO}`, status: 'active', is_active: true,
    start_date: desde, end_date: hasta, format: conZonas ? 'groups' : 'league', ruleset: RULESET,
    settings: { source: ORIGEN, isquad: { temporada: TEMPORADA, campeonato: t.campeonato } },
    champion_club_id: null, created_at: ahora, updated_at: ahora,
  }]);
  await actualizar(`tournaments?id=eq.${tournamentId}`, { current_season_id: seasonId });

  // ── Fase y zonas ──────────────────────────────────────────────────────────
  const faseId = crypto.randomUUID();
  const zonas = grupos.map((g) => ({ ...g, groupId: conZonas ? crypto.randomUUID() : null }));
  const nombres = zonas.map((z) => z.nombre ?? '');
  await insertar('tournament_phases', [{
    id: faseId, tournament_id: tournamentId, season_id: seasonId,
    name: t.fases[0].nombre, phase_type: conZonas ? 'group_stage' : 'league', order_index: 1, is_active: true,
    settings: {
      legs: vueltas,
      teamsCount: equipos,
      ...(conZonas && {
        group_names: nombres,
        groupTags: nombres,
        groupLabels: zonas.map((z, i) => ({
          id: z.groupId, name: z.nombre, color: COLORES_ZONA[i % COLORES_ZONA.length], colorMode: 'manual', autoColorIndex: i,
        })),
      }),
      points: { win: PUNTOS.win, draw: PUNTOS.draw, loss: PUNTOS.loss },
      pointsSystem: { ...PUNTOS, allowBonusPoints: true },
      bonus: RULESET.bonus,
      tiebreakers: TIEBREAKERS,
      standings: { mode: 'automatic', editable: true },
      source: ORIGEN,
      // Lo que lee el cron: qué grupos de iSquad son de esta fase.
      isquad: { grupos: zonas.map((z) => ({ id: z.id, groupId: z.groupId, nombre: z.nombre })) },
    },
    created_at: ahora, updated_at: ahora,
  }]);
  if (conZonas) {
    await insertar('tournament_groups', zonas.map((z, i) => ({
      id: z.groupId, phase_id: faseId, season_id: seasonId, name: z.nombre, order_index: i,
    })));
  }

  // ── Jornadas: el cron cuelga cada partido de la suya por nombre ──────────
  await insertar('tournament_rounds', jornadas.map((j) => ({
    id: crypto.randomUUID(), phase_id: faseId, season_id: seasonId,
    name: `Jornada ${j.n}`, order_index: j.n, start_date: j.desde, end_date: j.hasta,
    is_completed: false, notes: null, created_at: ahora, updated_at: ahora,
  })));

  // ── Participantes: las TRES filas ─────────────────────────────────────────
  const participantes = zonas.flatMap((z) => z.equipos.map((equipoId) => {
    const clubId = (EQUIPOS as Record<string, string>)[equipoId];
    return { participantId: crypto.randomUUID(), entryId: crypto.randomUUID(), clubId, zona: z };
  }));
  // Los clubes `existe: true` no traen nombre en el canon: el de la base.
  const nombreDe = (id: string) => (porId.get(id)?.name ?? nombresBase.get(id) ?? id) as string;
  await insertar('tournament_participants', participantes.map((p) => ({
    id: p.participantId, tournament_id: tournamentId, season_id: seasonId,
    season_entry_id: null, club_id: p.clubId, name: nombreDe(p.clubId), type: 'club',
    status: 'active', seed: null, group_id: p.zona.groupId, short_code: null,
    notes: ORIGEN, joined_at: ahora, created_at: ahora, updated_at: ahora,
  })));
  await insertar('team_season_entries', participantes.map((p) => ({
    id: p.entryId, season_id: seasonId, tournament_id: tournamentId, club_id: p.clubId,
    team_id: null, source_participant_id: p.participantId, group_id: p.zona.groupId,
    zone: p.zona.nombre, category: null, status: 'active', seed: null, notes: null,
    settings: { source: ORIGEN }, created_at: ahora, updated_at: ahora,
  })));
  for (const p of participantes) {
    await actualizar(`tournament_participants?id=eq.${p.participantId}`, { season_entry_id: p.entryId });
  }
  await insertar('tournament_phase_participants', participantes.map((p) => ({
    id: crypto.randomUUID(), tournament_id: tournamentId, season_id: seasonId,
    phase_id: faseId, participant_id: p.participantId, group_id: p.zona.groupId,
    status: 'active', seed: null, notes: null, created_at: ahora, updated_at: ahora,
  })));

  return { tournamentId, seasonId, conteo: { grupos: zonas.length, jornadas: jornadas.length, participantes: participantes.length } };
}

async function main() {
  console.log(`modo: ${modo}\n`);

  // ── Clubes ─────────────────────────────────────────────────────────────────
  const ids = CLUBES.map((c: any) => c.id);
  const enBase = new Map((await leer<any>(`clubs?select=id,name,country,union_id,city,region,logo_url&id=in.(${ids.join(',')})`)).map((c) => [c.id, c]));
  for (const [id, c] of enBase) nombresBase.set(id, c.name);
  const faltanExistentes = CLUBES.filter((c: any) => c.existe && !enBase.has(c.id)).map((c: any) => c.id);
  if (faltanExistentes.length) throw new Error(`clubes marcados existe:true que no están: ${faltanExistentes.join(', ')}`);
  const choques = CLUBES.filter((c: any) => !c.existe && enBase.has(c.id) && enBase.get(c.id).country !== PAIS);
  if (choques.length) throw new Error(`ids ya usados por otro club: ${choques.map((c: any) => `${c.id} (${enBase.get(c.id).name}, ${enBase.get(c.id).country})`).join(', ')}`);
  const clubesNuevos = CLUBES.filter((c: any) => !c.existe && !enBase.has(c.id));
  for (const c of clubesNuevos) escudoLocal(c.id);

  const aCompletar = CLUBES.filter((c: any) => c.existe && c.completar).map((c: any) => {
    const v = enBase.get(c.id);
    const parche: Record<string, unknown> = {};
    for (const [k, valor] of Object.entries(c.completar)) if (v[k] == null) parche[k] = valor;
    if (!v.logo_url && c.escudo) parche.logo_url = escudoLocal(c.id);
    return { id: c.id, parche, antes: Object.fromEntries(Object.keys(parche).map((k) => [k, v[k] ?? null])) };
  }).filter((x: any) => Object.keys(x.parche).length);

  // ── Alias de equipos ───────────────────────────────────────────────────────
  const aliasBase = new Map((await leer<any>(`club_external_ids?select=external_id,club_id&provider=eq.${ISQUAD_PROVIDER}`)).map((a) => [a.external_id, a.club_id]));
  const aliasNuevos = Object.entries(EQUIPOS as Record<string, string>)
    .filter(([equipo]) => !aliasBase.has(claveDeEquipo(equipo)))
    .map(([equipo, club]) => ({ provider: ISQUAD_PROVIDER, external_id: claveDeEquipo(equipo), club_id: club, confidence: 'exacto', created_at: ahora }));
  const aliasDistintos = Object.entries(EQUIPOS as Record<string, string>)
    .filter(([equipo, club]) => aliasBase.has(claveDeEquipo(equipo)) && aliasBase.get(claveDeEquipo(equipo)) !== club);
  if (aliasDistintos.length) throw new Error(`alias ya cargados con otro club: ${aliasDistintos.map(([e, c]) => `${e}→${c} (base: ${aliasBase.get(claveDeEquipo(e))})`).join(', ')}`);

  // ── Torneos ────────────────────────────────────────────────────────────────
  const torneosDb = new Set((await leer<any>(`tournaments?select=slug&slug=in.(${TORNEOS.map((t: any) => t.slug).join(',')})`)).map((t) => t.slug));
  const torneos = TORNEOS.filter((t: any) => !torneosDb.has(t.slug));
  const leidos = new Map<string, GrupoLeido[]>();
  for (const t of torneos) {
    const grupos = await leerGrupos(t);
    const sinMapa = grupos.flatMap((g) => g.equipos.filter((e) => !(EQUIPOS as Record<string, string>)[e]).map((e) => `${g.id}:${e}`));
    if (sinMapa.length) throw new Error(`${t.nombre}: equipos de iSquad sin club en EQUIPOS: ${sinMapa.join(', ')}`);
    leidos.set(t.slug, grupos);
  }

  console.log(`clubes a crear (${clubesNuevos.length}):`);
  for (const c of clubesNuevos) console.log(`  + ${c.id.padEnd(38)} ${c.name.padEnd(36)} ${escudoLocal(c.id)}`);
  for (const c of aCompletar) console.log(`  ~ ${c.id}: completar ${JSON.stringify(c.parche)}`);
  console.log(`\nalias isquad a crear: ${aliasNuevos.length} (ya estaban ${Object.keys(EQUIPOS).length - aliasNuevos.length})`);
  console.log('\ntorneos a crear:');
  for (const t of torneos) {
    const grupos = leidos.get(t.slug)!;
    const jornadas = jornadasDe(grupos);
    console.log(`  + ${t.nombre} · ${buildTournamentExternalId(TEMPORADA, t.campeonato)} · ${jornadas.length} jornadas (${jornadas[0]?.desde} → ${jornadas[jornadas.length - 1]?.hasta})`);
    for (const g of grupos) {
      console.log(`      grupo ${g.id}${g.nombre ? ` (${g.nombre})` : ''}: ${g.equipos.length} equipos, ${g.partidos.length} partidos — ${g.equipos.map((e) => (EQUIPOS as Record<string, string>)[e]).join(', ')}`);
    }
  }
  if (torneosDb.size) console.log(`  (ya existen y se saltean: ${[...torneosDb].join(', ')})`);

  if (modo === 'plan') { console.log('\nmodo --plan: no se escribió una sola fila.'); return; }

  // ── Escritura ──────────────────────────────────────────────────────────────
  await insertar('clubs', clubesNuevos.map(filaDeClub));
  console.log(`\n✓ ${clubesNuevos.length} clubes`);
  for (const c of aCompletar) {
    await actualizar(`clubs?id=eq.${c.id}`, { ...c.parche, updated_at: ahora });
    console.log(`✓ completado ${c.id}`);
  }
  await insertar('club_external_ids', aliasNuevos);
  console.log(`✓ ${aliasNuevos.length} alias isquad`);

  const creados: { nombre: string; tournamentId: string }[] = [];
  for (const t of torneos) {
    const { tournamentId, conteo } = await crearTorneo(t, leidos.get(t.slug)!);
    creados.push({ nombre: t.nombre, tournamentId });
    console.log(`✓ ${t.nombre}  /tournaments/${tournamentId}  (${conteo.grupos} grupo/s · ${conteo.jornadas} jornadas · ${conteo.participantes} participantes)`);
  }

  // ── Rollback ───────────────────────────────────────────────────────────────
  const sql = ['-- Rollback del alta de iSquad (FER 2026/27).',
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
    sql.push(`DELETE FROM public.tournament_groups WHERE phase_id IN ${fases};`);
    sql.push(`DELETE FROM public.tournament_phases WHERE tournament_id = '${c.tournamentId}';`);
    sql.push(`UPDATE public.tournaments SET current_season_id = NULL WHERE id = '${c.tournamentId}';`);
    sql.push(`DELETE FROM public.tournament_seasons WHERE tournament_id = '${c.tournamentId}';`);
    sql.push(`DELETE FROM public.tournaments WHERE id = '${c.tournamentId}';`);
    sql.push('');
  }
  if (aliasNuevos.length) {
    sql.push('-- Alias de equipos creados por esta corrida');
    sql.push(`DELETE FROM public.club_external_ids WHERE provider = '${ISQUAD_PROVIDER}' AND external_id IN (${aliasNuevos.map((a) => `'${a.external_id}'`).join(', ')});`);
    sql.push('');
  }
  for (const c of aCompletar) {
    const sets = Object.entries(c.antes).map(([k, v]) => `${k} = ${v === null ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`}`).join(', ');
    sql.push(`UPDATE public.clubs SET ${sets} WHERE id = '${c.id}';`);
  }
  if (clubesNuevos.length) {
    sql.push('-- Clubes creados por esta corrida');
    sql.push(`DELETE FROM public.clubs WHERE id IN (${clubesNuevos.map((c: any) => `'${c.id}'`).join(', ')});`);
    sql.push('');
  }
  sql.push('COMMIT;');
  fs.writeFileSync(ROLLBACK, sql.join('\n') + '\n', 'utf8');
  console.log(`\nrollback escrito: ${ROLLBACK}`);
  console.log('\nFalta el fixture: lo crea la primera corrida de /api/cron/isquad-sync.');
}

main().catch((e) => { console.error('\nFALLÓ:', e.message || e); process.exit(1); });
