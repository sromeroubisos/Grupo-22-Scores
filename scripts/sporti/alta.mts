/**
 * Alta de las competiciones de la CBRu que sincroniza `/api/cron/sporti-sync`.
 * El canon es `datos.mjs`; los escudos tienen que estar antes
 * (`node scripts/sporti/escudos.mjs --execute`).
 *
 *   node scripts/sporti/alta.mts --plan
 *   node scripts/sporti/alta.mts --execute
 *
 * Escribe clubes, el mapa de equipos (`club_external_ids`, provider `sporti`,
 * una clave por rama) y por torneo: temporada, fases con `settings.sporti`,
 * grupos, rondas y los participantes en sus TRES tablas. Los PARTIDOS y las
 * tablas oficiales no: los escribe el cron en su primera corrida, que es el
 * mismo camino que después los mantiene.
 *
 * Las rondas salen de SporTI: en las ligas y las llaves son las columnas
 * ("Rodada 3", "SEMI FINAL"); en las fases de grupos —donde la columna es el
 * grupo— son los fines de semana con partidos, de lunes a domingo, para que un
 * partido reprogramado dentro de la semana siga cayendo en la suya. Un equipo
 * que juega y no está en `EQUIPOS` frena el alta antes de escribir nada.
 *
 * Idempotente: un torneo cuyo slug ya está se saltea entero, un club que ya
 * existe no se pisa y un alias que ya está no se duplica. Un torneo que falla a
 * mitad se deshace. Deja `SPORTI_ALTA_ROLLBACK.sql`.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { fetchPartidos, pausa, PAUSA_MS } from '../../src/lib/integrations/sporti/client.ts';
import type { PartidoSporti } from '../../src/lib/integrations/sporti/parse.ts';
import {
  buildTournamentExternalId, claveDeEquipo, nombreDeRonda, SPORTI_PROVIDER, type RamaSporti,
} from '../../src/lib/integrations/sporti/nombres.ts';
import {
  CLUBES, EQUIPOS, ORIGEN, PUNTOS, RULESET, TEMPORADA_CODIGO, TEMPORADA_NOMBRE, TIEBREAKERS, TORNEOS, UNION_CBRU,
} from './datos.mjs';

const REPO = process.cwd();
const ROLLBACK = path.join(REPO, 'SPORTI_ALTA_ROLLBACK.sql');
const PAIS = 'Brasil';
/** El escudo de la CBRu (lo publica SporTI): ninguna competición tiene uno propio. */
const LOGO_CBRU = '/competiciones/br-cbru.png';

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
  await borrar(`tournament_standings?tournament_id=eq.${tournamentId}`);
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
const COLORES_GRUPO = ['#00a365', '#eab308', '#f97316', '#3b82f6'];
const porId = new Map(CLUBES.map((c: any) => [c.id, c]));
const archivoDeEscudo = (id: string) => (porId.get(id)?.escudoDe ?? id) as string;

function escudoLocal(id: string) {
  const archivo = archivoDeEscudo(id);
  if (!fs.existsSync(path.join(REPO, 'public', 'clubs', `${archivo}.png`))) {
    throw new Error(`falta public/clubs/${archivo}.png — corré scripts/sporti/escudos.mjs --execute primero`);
  }
  return `/clubs/${archivo}.png`;
}

function filaDeClub(c: any) {
  const padre = c.padre ? porId.get(c.padre) : null;
  return {
    id: c.id, union_id: UNION_CBRU, name: c.name, short_name: c.name,
    city: c.city ?? padre?.city ?? null, region: c.region ?? padre?.region ?? null, country: PAIS,
    logo_url: escudoLocal(c.id), primary_color: null,
    slug: c.id, is_visible: true, entity_type: 'club', sport: 'rugby', sport_id: 'rugby',
    category: null, categories: [], status: 'active', visibility: 'visible',
    external_id: null, created_at: ahora, updated_at: ahora,
  };
}

const equiposDe = (rama: RamaSporti) => (EQUIPOS as Record<RamaSporti, Record<string, string>>)[rama];

/** `dd/mm/yyyy` → `yyyy-mm-dd`. */
const fechaIso = (ddmmyyyy: string | null) => {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(ddmmyyyy ?? '');
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
};

/** Lunes y domingo de la semana de una fecha `yyyy-mm-dd`. */
function semanaDe(iso: string): { desde: string; hasta: string } {
  const d = new Date(`${iso}T12:00:00Z`);
  const lunes = new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * 86_400_000);
  const domingo = new Date(lunes.getTime() + 6 * 86_400_000);
  return { desde: lunes.toISOString().slice(0, 10), hasta: domingo.toISOString().slice(0, 10) };
}

interface FaseLeida {
  def: any;
  partidos: PartidoSporti[];
  /** letras de grupo, ordenadas (solo `grupos`) */
  grupos: string[];
  /** clubes por grupo (clave `null` sin grupos) */
  equiposPorGrupo: Map<string | null, string[]>;
  rondas: { nombre: string; desde: string | null; hasta: string | null; orden: number }[];
}

async function leerFase(t: any, def: any): Promise<FaseLeida> {
  const r = await fetchPartidos(t.campeonato, def.fase, { puedeEstarVacia: def.puedeEstarVacia });
  await pausa(PAUSA_MS);
  if (!r.ok || !r.data) throw new Error(`${t.nombre} / fase ${def.fase}: SporTI no contestó (${r.status})`);
  const partidos = r.data;
  const mapa = equiposDe(t.rama);
  const sinMapa = [...new Set(partidos.flatMap((p) => [p.localSlug, p.visitanteSlug]).filter((s) => !mapa[s]))];
  if (sinMapa.length) throw new Error(`${t.nombre} / fase ${def.fase}: equipos de SporTI sin club en EQUIPOS.${t.rama}: ${sinMapa.join(', ')}`);

  const esGrupos = def.tipo === 'grupos';
  const grupos = esGrupos ? [...new Set(partidos.map((p) => p.columna ?? ''))].filter(Boolean).sort() : [];
  const equiposPorGrupo = new Map<string | null, string[]>();
  for (const p of partidos) {
    const g = esGrupos ? p.columna : null;
    const lista = equiposPorGrupo.get(g) ?? [];
    for (const s of [p.localSlug, p.visitanteSlug]) if (!lista.includes(mapa[s])) lista.push(mapa[s]);
    equiposPorGrupo.set(g, lista);
  }

  let rondas: FaseLeida['rondas'];
  if (esGrupos) {
    const semanas = new Map<string, { desde: string; hasta: string }>();
    for (const p of partidos) {
      const f = fechaIso(p.fecha);
      if (f) semanas.set(semanaDe(f).desde, semanaDe(f));
    }
    rondas = [...semanas.values()].sort((a, b) => a.desde.localeCompare(b.desde))
      .map((s, i) => ({ nombre: `Rodada ${i + 1}`, desde: s.desde, hasta: s.hasta, orden: i + 1 }));
  } else {
    const porColumna = new Map<string, string[]>();
    for (const p of partidos) {
      if (!p.columna) continue;
      const nombre = nombreDeRonda(p.columna);
      const f = fechaIso(p.fecha);
      porColumna.set(nombre, [...(porColumna.get(nombre) ?? []), ...(f ? [f] : [])]);
    }
    // Una final sin equipos todavía no tiene tarjetas: la ronda se crea igual.
    if (!porColumna.size && def.tipo === 'llave') porColumna.set(nombreDeRonda(def.nombre), []);
    rondas = [...porColumna.entries()].map(([nombre, fechas], i) => {
      const orden = [...fechas].sort();
      return { nombre, desde: orden[0] ?? null, hasta: orden[orden.length - 1] ?? null, orden: i + 1 };
    });
  }
  return { def, partidos, grupos, equiposPorGrupo, rondas };
}

/** Ida y vuelta o una sola vuelta: lo dice el fixture del grupo más grande. */
function vueltasDe(f: FaseLeida): number {
  let mayor: string[] = [];
  let partidos = 0;
  for (const [g, equipos] of f.equiposPorGrupo) {
    if (equipos.length > mayor.length) {
      mayor = equipos;
      partidos = f.partidos.filter((p) => (f.def.tipo === 'grupos' ? p.columna === g : true)).length;
    }
  }
  const unaVuelta = (mayor.length * (mayor.length - 1)) / 2;
  return unaVuelta ? Math.max(1, Math.round(partidos / unaVuelta)) : 1;
}

function settingsDeFase(f: FaseLeida, grupoIds: Map<string, string>, rama: RamaSporti) {
  const equipos = new Set([...f.equiposPorGrupo.values()].flat()).size;
  const base = {
    teamsCount: equipos,
    points: { win: PUNTOS.win, draw: PUNTOS.draw, loss: PUNTOS.loss },
    pointsSystem: { ...PUNTOS, allowBonusPoints: true },
    bonus: RULESET.bonus,
    tiebreakers: TIEBREAKERS,
    source: ORIGEN,
  };
  // Lo que lee el cron: qué fase de SporTI es esta y cómo se cuelgan sus partidos.
  const sporti = {
    fase: f.def.fase,
    rama,
    tabla: f.def.tipo === 'grupos',
    rondas: f.def.tipo === 'grupos' ? 'fin_de_semana' : 'columna',
    ...(f.def.puedeEstarVacia && { puedeEstarVacia: true }),
    ...(grupoIds.size && { grupos: Object.fromEntries(grupoIds) }),
  };
  if (f.def.tipo === 'grupos') {
    return {
      ...base,
      legs: vueltasDe(f),
      group_names: f.grupos.map((g) => `Grupo ${g}`),
      groupTags: f.grupos.map((g) => `Grupo ${g}`),
      groupLabels: f.grupos.map((g, i) => ({
        id: grupoIds.get(g), name: `Grupo ${g}`, color: COLORES_GRUPO[i % COLORES_GRUPO.length], colorMode: 'manual', autoColorIndex: i,
      })),
      // La tabla que se muestra es la OFICIAL, que escribe el cron.
      standings: { mode: 'fully_manual', editable: true, source: 'Tabla oficial de la CBRu (SporTI)' },
      sporti,
    };
  }
  if (f.def.tipo === 'liga') {
    return { ...base, legs: vueltasDe(f), standings: { mode: 'automatic', editable: true }, sporti };
  }
  return {
    ...base,
    legs: 1,
    advanceCount: 1,
    phaseMode: 'playoff',
    bracketMode: 'auto',
    playoffStages: f.rondas.map((r) => ({
      id: `playoff_stage_${r.orden}`, name: r.nombre, orderIndex: r.orden,
      matchCount: Math.max(1, f.partidos.filter((p) => p.columna && nombreDeRonda(p.columna) === r.nombre).length),
    })),
    standings: { mode: 'automatic', editable: true },
    sporti,
  };
}

const TIPO_DE_FASE: Record<string, string> = { grupos: 'group_stage', liga: 'league', llave: 'playoff' };

async function crearTorneo(t: any, fases: FaseLeida[]) {
  const tournamentId = crypto.randomUUID();
  const seasonId = crypto.randomUUID();
  try {
    return await escribirTorneo(t, fases, tournamentId, seasonId);
  } catch (e) {
    await limpiarTorneo(tournamentId).catch((e2) => console.error(`  la limpieza de ${t.slug} falló también: ${e2.message}`));
    throw e;
  }
}

async function escribirTorneo(t: any, fases: FaseLeida[], tournamentId: string, seasonId: string) {
  const fechas = fases.flatMap((f) => f.rondas.flatMap((r) => [r.desde, r.hasta])).filter(Boolean).sort() as string[];
  const formato = fases[0].def.tipo === 'grupos' ? 'groups' : fases[0].def.tipo === 'liga' ? 'league' : 'knockout';

  // FK circular: el torneo nace sin temporada actual y se engancha después.
  await insertar('tournaments', [{
    id: tournamentId, union_id: UNION_CBRU, season_id: TEMPORADA_CODIGO,
    name: t.nombre, display_name: t.nombre, original_name: t.nombre, slug: t.slug,
    status: 'published', category: t.categoria, gender: t.genero, age_grade: t.edad,
    region: PAIS, country: PAIS, country_id: 'brazil', country_name: PAIS,
    format: formato, is_visible: true, is_active: true, logo_url: LOGO_CBRU,
    ruleset: RULESET, ruleset_version: 1,
    sport_id: 'rugby', sport: 'rugby', sport_name: 'Rugby',
    priority: 0, sponsors: [], social_links: {}, display_order: 0, is_popular: false,
    // `url` vacía e `is_api_managed` en false A PROPÓSITO: con un link en `url`
    // y `is_api_managed` en true la página lo trata como de FlashScore y no lee
    // la base (pasó con iSquad).
    is_api_managed: false, review_status: 'approved', data_source: null,
    external_id: buildTournamentExternalId(t.campeonato),
    current_season_id: null, created_at: ahora, updated_at: ahora,
  }]);
  await insertar('tournament_seasons', [{
    id: seasonId, tournament_id: tournamentId, legacy_tournament_id: tournamentId,
    season_code: TEMPORADA_CODIGO, name: `${t.nombre} ${TEMPORADA_NOMBRE}`, display_name: `${t.nombre} ${TEMPORADA_NOMBRE}`,
    slug: `${t.slug}-${TEMPORADA_CODIGO}`, status: 'active', is_active: true,
    start_date: fechas[0] ?? null, end_date: fechas[fechas.length - 1] ?? null, format: formato, ruleset: RULESET,
    settings: { source: ORIGEN, sporti: { campeonato: t.campeonato, rama: t.rama } },
    champion_club_id: null, created_at: ahora, updated_at: ahora,
  }]);
  await actualizar(`tournaments?id=eq.${tournamentId}`, { current_season_id: seasonId });

  // Una fila de participante por club, aunque juegue varias fases.
  const clubes = [...new Set(fases.flatMap((f) => [...f.equiposPorGrupo.values()].flat()))];
  const participanteDe = new Map(clubes.map((c) => [c, { participantId: crypto.randomUUID(), entryId: crypto.randomUUID() }]));
  const nombreDe = (id: string) => (porId.get(id)?.name ?? id) as string;
  // El grupo del participante es el de la PRIMERA fase en que aparece el club.
  const grupoInicial = new Map<string, { groupId: string | null; nombre: string | null }>();

  const conteo = { fases: fases.length, grupos: 0, rondas: 0 };
  const filasFaseParticipante: object[] = [];
  for (const [i, f] of fases.entries()) {
    const faseId = crypto.randomUUID();
    const grupoIds = new Map(f.grupos.map((g) => [g, crypto.randomUUID()]));
    await insertar('tournament_phases', [{
      id: faseId, tournament_id: tournamentId, season_id: seasonId,
      name: f.def.nombre, phase_type: TIPO_DE_FASE[f.def.tipo], order_index: i + 1, is_active: f.def.activa === true,
      settings: settingsDeFase(f, grupoIds, t.rama),
      created_at: ahora, updated_at: ahora,
    }]);
    if (grupoIds.size) {
      await insertar('tournament_groups', f.grupos.map((g, k) => ({
        id: grupoIds.get(g), phase_id: faseId, season_id: seasonId, name: `Grupo ${g}`, order_index: k,
      })));
    }
    await insertar('tournament_rounds', f.rondas.map((r) => ({
      id: crypto.randomUUID(), phase_id: faseId, season_id: seasonId,
      name: r.nombre, order_index: r.orden, start_date: r.desde, end_date: r.hasta,
      is_completed: false, notes: null, created_at: ahora, updated_at: ahora,
    })));
    conteo.grupos += grupoIds.size;
    conteo.rondas += f.rondas.length;

    for (const [g, equipos] of f.equiposPorGrupo) {
      const groupId = g ? grupoIds.get(g) ?? null : null;
      for (const club of equipos) {
        if (!grupoInicial.has(club)) grupoInicial.set(club, { groupId, nombre: g ? `Grupo ${g}` : null });
        filasFaseParticipante.push({
          id: crypto.randomUUID(), tournament_id: tournamentId, season_id: seasonId,
          phase_id: faseId, participant_id: participanteDe.get(club)!.participantId, group_id: groupId,
          status: 'active', seed: null, notes: null, created_at: ahora, updated_at: ahora,
        });
      }
    }
  }

  // ── Las TRES filas de participante ──────────────────────────────────────
  await insertar('tournament_participants', clubes.map((c) => ({
    id: participanteDe.get(c)!.participantId, tournament_id: tournamentId, season_id: seasonId,
    season_entry_id: null, club_id: c, name: nombreDe(c), type: 'club',
    status: 'active', seed: null, group_id: grupoInicial.get(c)?.groupId ?? null, short_code: null,
    notes: ORIGEN, joined_at: ahora, created_at: ahora, updated_at: ahora,
  })));
  await insertar('team_season_entries', clubes.map((c) => ({
    id: participanteDe.get(c)!.entryId, season_id: seasonId, tournament_id: tournamentId, club_id: c,
    team_id: null, source_participant_id: participanteDe.get(c)!.participantId, group_id: grupoInicial.get(c)?.groupId ?? null,
    zone: grupoInicial.get(c)?.nombre ?? null, category: null, status: 'active', seed: null, notes: null,
    settings: { source: ORIGEN }, created_at: ahora, updated_at: ahora,
  })));
  for (const c of clubes) {
    await actualizar(`tournament_participants?id=eq.${participanteDe.get(c)!.participantId}`, { season_entry_id: participanteDe.get(c)!.entryId });
  }
  await insertar('tournament_phase_participants', filasFaseParticipante);

  return { tournamentId, conteo: { ...conteo, participantes: clubes.length } };
}

async function main() {
  console.log(`modo: ${modo}\n`);

  // ── Clubes ─────────────────────────────────────────────────────────────────
  const ids = CLUBES.map((c: any) => c.id);
  const enBase = new Map((await leer<any>(`clubs?select=id,name,country&id=in.(${ids.join(',')})`)).map((c) => [c.id, c]));
  const choques = CLUBES.filter((c: any) => enBase.has(c.id) && enBase.get(c.id).country !== PAIS);
  if (choques.length) throw new Error(`ids ya usados por otro club: ${choques.map((c: any) => `${c.id} (${enBase.get(c.id).name}, ${enBase.get(c.id).country})`).join(', ')}`);
  const clubesNuevos = CLUBES.filter((c: any) => !enBase.has(c.id));
  for (const c of clubesNuevos) escudoLocal(c.id);

  // ── Alias de equipos, por rama ─────────────────────────────────────────────
  const aliasBase = new Map((await leer<any>(`club_external_ids?select=external_id,club_id&provider=eq.${SPORTI_PROVIDER}`)).map((a) => [a.external_id, a.club_id]));
  const todos = (['masculino', 'feminino'] as RamaSporti[]).flatMap((rama) =>
    Object.entries(equiposDe(rama)).map(([slug, club]) => ({ clave: claveDeEquipo(slug, rama), club })));
  const faltanClubes = todos.filter((a) => !porId.has(a.club)).map((a) => a.club);
  if (faltanClubes.length) throw new Error(`EQUIPOS apunta a clubes que no están en CLUBES: ${faltanClubes.join(', ')}`);
  const aliasDistintos = todos.filter((a) => aliasBase.has(a.clave) && aliasBase.get(a.clave) !== a.club);
  if (aliasDistintos.length) throw new Error(`alias ya cargados con otro club: ${aliasDistintos.map((a) => `${a.clave}→${a.club} (base: ${aliasBase.get(a.clave)})`).join(', ')}`);
  const aliasNuevos = todos.filter((a) => !aliasBase.has(a.clave))
    .map((a) => ({ provider: SPORTI_PROVIDER, external_id: a.clave, club_id: a.club, confidence: 'exacto', created_at: ahora }));

  // ── Torneos ────────────────────────────────────────────────────────────────
  const torneosDb = new Set((await leer<any>(`tournaments?select=slug&slug=in.(${TORNEOS.map((t: any) => t.slug).join(',')})`)).map((t) => t.slug));
  const torneos = TORNEOS.filter((t: any) => !torneosDb.has(t.slug));
  const leidos = new Map<string, FaseLeida[]>();
  for (const t of torneos) {
    const fases: FaseLeida[] = [];
    for (const def of t.fases) fases.push(await leerFase(t, def));
    leidos.set(t.slug, fases);
  }

  console.log(`clubes a crear (${clubesNuevos.length}):`);
  for (const c of clubesNuevos) console.log(`  + ${c.id.padEnd(32)} ${c.name.padEnd(24)} ${escudoLocal(c.id)}`);
  console.log(`\nalias sporti a crear: ${aliasNuevos.length} (ya estaban ${todos.length - aliasNuevos.length})`);
  console.log('\ntorneos a crear:');
  for (const t of torneos) {
    console.log(`  + ${t.nombre} · ${buildTournamentExternalId(t.campeonato)} · rama ${t.rama}`);
    for (const f of leidos.get(t.slug)!) {
      const jugados = f.partidos.filter((p) => p.puntosLocal !== null).length;
      console.log(`      ${f.def.nombre} (${f.def.fase}, ${f.def.tipo}): ${f.partidos.length} partidos, ${jugados} jugados · ${vueltasDe(f)} vuelta/s · rondas ${f.rondas.map((r) => `${r.nombre} ${r.desde ?? '?'}→${r.hasta ?? '?'}`).join(' | ')}`);
      for (const [g, equipos] of f.equiposPorGrupo) console.log(`        ${g ? `Grupo ${g}` : 'sin grupo'}: ${equipos.join(', ')}`);
    }
  }
  if (torneosDb.size) console.log(`  (ya existen y se saltean: ${[...torneosDb].join(', ')})`);

  if (modo === 'plan') { console.log('\nmodo --plan: no se escribió una sola fila.'); return; }

  // ── Escritura ──────────────────────────────────────────────────────────────
  await insertar('clubs', clubesNuevos.map(filaDeClub));
  console.log(`\n✓ ${clubesNuevos.length} clubes`);
  await insertar('club_external_ids', aliasNuevos);
  console.log(`✓ ${aliasNuevos.length} alias sporti`);

  const creados: { nombre: string; tournamentId: string }[] = [];
  for (const t of torneos) {
    const { tournamentId, conteo } = await crearTorneo(t, leidos.get(t.slug)!);
    creados.push({ nombre: t.nombre, tournamentId });
    console.log(`✓ ${t.nombre}  /tournaments/${tournamentId}  (${conteo.fases} fase/s · ${conteo.grupos} grupos · ${conteo.rondas} rondas · ${conteo.participantes} participantes)`);
  }

  // ── Rollback ───────────────────────────────────────────────────────────────
  const sql = ['-- Rollback del alta de SporTI (CBRu 2026).',
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
    sql.push(`DELETE FROM public.club_external_ids WHERE provider = '${SPORTI_PROVIDER}' AND external_id IN (${aliasNuevos.map((a) => `'${a.external_id.replace(/'/g, "''")}'`).join(', ')});`);
    sql.push('');
  }
  if (clubesNuevos.length) {
    sql.push('-- Clubes creados por esta corrida');
    sql.push(`DELETE FROM public.clubs WHERE id IN (${clubesNuevos.map((c: any) => `'${c.id}'`).join(', ')});`);
    sql.push('');
  }
  sql.push('COMMIT;');
  fs.writeFileSync(ROLLBACK, sql.join('\n') + '\n', 'utf8');
  console.log(`\nrollback escrito: ${ROLLBACK}`);
  console.log('\nFaltan el fixture y las tablas oficiales: los escribe la primera corrida de /api/cron/sporti-sync.');
}

main().catch((e) => { console.error('\nFALLÓ:', e.message || e); process.exit(1); });
