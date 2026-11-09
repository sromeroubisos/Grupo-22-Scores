/**
 * Alta de las competiciones de Rugby Europe que sincroniza `/api/cron/rugbyeurope-sync`.
 *
 *   node scripts/rugbyeurope/alta.mts --plan                       qué haría, sin escribir
 *   node scripts/rugbyeurope/alta.mts --execute                    todas las ediciones
 *   node scripts/rugbyeurope/alta.mts --execute --edicion=<clave>  una sola
 *
 * Por edición lee la página del sitio, resuelve cada equipo al catálogo
 * (`integrations/rugbyeurope/ediciones.ts`) y escribe: los clubes que faltan (escudo
 * en public/clubs/<id>.png, bajado del sitio), sus alias (`club_external_ids`,
 * provider `rugbyeurope`, con la categoría como prefijo: `w:andorra`), y el torneo
 * con su temporada, su fase (cuadro, liga o zonas), las zonas y los participantes en
 * sus TRES tablas. Las rondas de una liga las crea el cron al ver cada semana; las del
 * cuadro, este script. Los partidos los escribe la primera corrida del cron.
 *
 * Idempotente: lo que ya existe se saltea; un torneo que falla a mitad se deshace.
 * Deja `RUGBYEUROPE_ALTA_ROLLBACK_<fecha>.sql` (sin versionar).
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { EDICIONES, claveAlias, clubDe, edicionPorClave, type ClubDef, type EdicionRe } from '../../src/lib/integrations/rugbyeurope/ediciones.ts';
import {
  RE_PROVIDER, RONDAS, buildTournamentExternalId, fetchPagina, parseEquipos, parsePools, type EquipoRe,
} from '../../src/lib/integrations/rugbyeurope/rugbyeurope.ts';

const REPO = process.cwd();
const ORIGEN = 'rugbyeurope-alta';

/** Las cinco rondas de un cuadro, con sus fechas (por edición, las dice el sitio). */
const FECHAS_CUADRO: Record<string, string[]> = {
  'u20-championship-2026': ['2026-11-08', '2026-11-11', '2026-11-11', '2026-11-15', '2026-11-15'],
  'u18-championship-2026': ['2026-11-07', '2026-11-10', '2026-11-10', '2026-11-14', '2026-11-14'],
};

const TIEBREAKERS = [
  { metric: 'points', label: 'Puntos obtenidos', priority: 1, enabled: true },
  { metric: 'head_to_head', label: 'Resultado entre sí', priority: 2, enabled: true },
  { metric: 'points_difference', label: 'Diferencia de tantos', priority: 3, enabled: true },
  { metric: 'won', label: 'Partidos ganados', priority: 4, enabled: true },
];
const PUNTOS = { win: 4, draw: 2, loss: 0 };
const ORGANIZADORES = [{ name: 'Rugby Europe', union_id: null, is_primary: true }];

/** El bonus lo pone el CONECTOR: el defensivo sí; el ofensivo no (el sitio no da tries por partido). */
const rulesetDe = (ed: EdicionRe) => {
  if (ed.formato === 'eliminatoria') return { competition: { format_type: 'knockout', parameters: { season_model: 'season' } }, organizers: ORGANIZADORES };
  return {
    pointsWin: PUNTOS.win, pointsDraw: PUNTOS.draw, pointsLoss: PUNTOS.loss, pointsBonusTry: 1, pointsBonusLoss: 1,
    points: { ...PUNTOS },
    pointsSystem: { ...PUNTOS, bonusTry: 1, bonusLoss: 1, allowBonusPoints: true },
    bonus: { offensive: { tries: 4, points: 1 }, defensive: { margin: 7, points: 1 } },
    standings: {
      points_base: { ...PUNTOS },
      bonus_rules: [
        { id: 'try_bonus', label: '4 tries o más', points_awarded: 1 },
        { id: 'close_loss', label: 'Derrota por 7 o menos', points_awarded: 1 },
      ],
    },
    competition: { format_type: ed.formato === 'zonas' ? 'groups' : 'league', parameters: { season_model: 'season' } },
    tiebreakers: TIEBREAKERS,
    organizers: ORGANIZADORES,
  };
};

const modo = process.argv.includes('--execute') ? 'execute' : process.argv.includes('--plan') ? 'plan' : null;
if (!modo) { console.error('usá --plan o --execute (y opcional --edicion=<clave>)'); process.exit(2); }
const filtro = process.argv.find((a) => a.startsWith('--edicion='))?.slice('--edicion='.length) ?? null;
if (filtro && !edicionPorClave(filtro)) { console.error(`edición desconocida: ${filtro}. Hay: ${EDICIONES.map((e) => e.clave).join(', ')}`); process.exit(2); }
const ediciones = filtro ? [edicionPorClave(filtro) as EdicionRe] : [...EDICIONES];

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

interface EquipoPlan extends EquipoRe { club: ClubDef }
interface EdicionPlan { ed: EdicionRe; equipos: EquipoPlan[]; zonas: { nombre: string; equipos: EquipoPlan[] }[] }

/** Lee la página y resuelve cada equipo a un club. Si algo no cierra, corta: no se escribe a medias. */
async function planear(ed: EdicionRe): Promise<EdicionPlan> {
  const pagina = await fetchPagina(ed);
  if (!pagina.ok) throw new Error(`${ed.clave}: la página no bajó (HTTP ${pagina.status})`);
  const equipos: EquipoPlan[] = parseEquipos(pagina.html).map((e) => {
    const club = clubDe(ed.grupo, e.nombre);
    if (!club) throw new Error(`${ed.clave}: el catálogo no conoce a "${e.nombre}"`);
    return { ...e, club };
  });
  if (!equipos.length) throw new Error(`${ed.clave}: la página no trae equipos`);
  let zonas: EdicionPlan['zonas'] = [];
  if (ed.formato === 'zonas') {
    const porAbr = new Map(equipos.filter((e) => e.abr).map((e) => [e.abr as string, e]));
    zonas = parsePools(pagina.html).map((z) => ({
      nombre: `Zona ${/pool\s+(\w+)/i.exec(z.nombre)?.[1]?.toUpperCase() ?? z.nombre}`,
      equipos: z.abrs.map((a) => {
        const e = porAbr.get(a);
        if (!e) throw new Error(`${ed.clave}: la zona ${z.nombre} nombra "${a}" y ninguna fila de partidos la explica`);
        return e;
      }),
    }));
    const enZona = new Set(zonas.flatMap((z) => z.equipos.map((e) => e.club.id)));
    const sueltos = equipos.filter((e) => !enZona.has(e.club.id)).map((e) => e.nombre);
    if (!zonas.length || sueltos.length) throw new Error(`${ed.clave}: equipos sin zona: ${sueltos.join(', ') || '(no se leyó ninguna zona)'}`);
  }
  return { ed, equipos, zonas };
}

/** La bandera propia (`public/logos/selecciones/<bandera>.png`) como escudo del club. */
function copiarBandera(id: string, bandera: string) {
  const origen = path.join(REPO, 'public', 'logos', 'selecciones', `${bandera}.png`);
  if (!fs.existsSync(origen)) throw new Error(`falta la bandera public/logos/selecciones/${bandera}.png (club ${id}): hay que armarla con el molde`);
  fs.copyFileSync(origen, path.join(REPO, 'public', 'clubs', `${id}.png`));
}

/**
 * `--banderas`: pone la bandera propia a las selecciones que este script ya creó con el
 * escudo de Rugby Europe. Solo toca los clubes cuyo logo es el archivo local `/clubs/<id>.png`
 * (los que tienen un escudo cargado a mano en Storage conservan su identidad) y sube su
 * `updated_at` para que la caché de logos los vuelva a pedir.
 */
async function aplicarBanderas(clubes: Map<string, { club: ClubDef; logo: string | null }>) {
  const ids = [...clubes.keys()].filter((id) => clubes.get(id)?.club.bandera);
  const filas: { id: string; logo_url: string | null }[] = [];
  for (let i = 0; i < ids.length; i += 60) filas.push(...await leer<any>(`clubs?select=id,logo_url&id=in.(${ids.slice(i, i + 60).join(',')})`));
  // `--tambien=a,b`: clubes que ya tenían un escudo propio y se quieren con bandera igual.
  // Se reapunta su `logo_url` y se imprime el anterior, para poder devolverlo.
  const tambien = new Set((process.argv.find((a) => a.startsWith('--tambien='))?.slice('--tambien='.length) ?? '').split(',').filter(Boolean));
  const propio = (c: { id: string; logo_url: string | null }) => c.logo_url === `/clubs/${c.id}.png`;
  const mios = filas.filter((c) => propio(c) || tambien.has(c.id));
  const ajenos = filas.filter((c) => !propio(c) && !tambien.has(c.id)).map((c) => c.id);
  console.log(`clubes con bandera propia a poner: ${mios.length} · se dejan (escudo propio en Storage): ${ajenos.join(', ') || 'ninguno'}`);
  for (const c of mios) console.log(`   ${c.id.padEnd(24)} ← ${clubes.get(c.id)?.club.bandera}.png${propio(c) ? '' : `   (antes: ${c.logo_url})`}`);
  if (modo === 'plan') { console.log('\nmodo --plan: no se escribió nada.'); return; }
  for (const c of mios) {
    copiarBandera(c.id, clubes.get(c.id)!.club.bandera as string);
    await actualizar(`clubs?id=eq.${c.id}`, propio(c) ? { updated_at: ahora } : { logo_url: `/clubs/${c.id}.png`, updated_at: ahora });
  }
  console.log(`\n✓ ${mios.length} clubes con su bandera.`);
}

async function bajarEscudo(id: string, logo: string) {
  const res = await fetch(`${logo}?width=256&format=png`, { headers: { 'user-agent': 'Mozilla/5.0' } });
  if (!res.ok) throw new Error(`escudo de ${id}: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.subarray(0, 4).toString('hex') !== '89504e47') throw new Error(`escudo de ${id}: no es un PNG`);
  fs.writeFileSync(path.join(REPO, 'public', 'clubs', `${id}.png`), buf);
}

async function main() {
  console.log(`modo: ${modo}  ·  ${ediciones.length} edición(es)\n`);
  const planes: EdicionPlan[] = [];
  for (const ed of ediciones) planes.push(await planear(ed));

  // ── clubes ──
  const clubes = new Map<string, { club: ClubDef; logo: string | null }>();
  for (const p of planes) for (const e of p.equipos) if (!clubes.has(e.club.id)) clubes.set(e.club.id, { club: e.club, logo: e.logo });
  const ids = [...clubes.keys()];
  const enBase = new Set<string>();
  for (let i = 0; i < ids.length; i += 60) {
    for (const c of await leer<any>(`clubs?select=id&id=in.(${ids.slice(i, i + 60).join(',')})`)) enBase.add(c.id);
  }
  if (process.argv.includes('--banderas')) { await aplicarBanderas(clubes); return; }
  const clubesNuevos = ids.filter((id) => !enBase.has(id));
  const unionesPedidas = [...new Set(clubesNuevos.map((id) => clubes.get(id)?.club.union).filter(Boolean))] as string[];
  const unionesBase = new Set<string>();
  if (unionesPedidas.length) for (const u of await leer<any>(`unions?select=id&id=in.(${unionesPedidas.join(',')})`)) unionesBase.add(u.id);
  const unionDe = (c: ClubDef) => (c.union && unionesBase.has(c.union) ? c.union : null);
  const sinUnion = unionesPedidas.filter((u) => !unionesBase.has(u));

  // ── alias ──
  const aliasBase = new Map((await leer<any>(`club_external_ids?select=external_id,club_id&provider=eq.${RE_PROVIDER}&limit=1000`)).map((a) => [a.external_id, a.club_id]));
  const aliasNuevos = new Map<string, string>();
  for (const p of planes) {
    for (const e of p.equipos) {
      const clave = claveAlias(p.ed.grupo, e.nombre);
      const previo = aliasBase.get(clave) ?? aliasNuevos.get(clave);
      if (previo && previo !== e.club.id) throw new Error(`alias ${clave} ya apunta a ${previo}, no a ${e.club.id}`);
      if (!previo) aliasNuevos.set(clave, e.club.id);
    }
  }

  // ── torneos ──
  const existentes = new Set((await leer<any>(`tournaments?select=slug&slug=in.(${planes.map((p) => p.ed.slug).join(',')})`)).map((t) => t.slug));

  console.log(`clubes: ${ids.length} en el catálogo · ${enBase.size} ya están · NUEVOS ${clubesNuevos.length}`);
  for (const id of clubesNuevos) console.log(`   + ${id.padEnd(26)} ${clubes.get(id)?.club.name}${fs.existsSync(path.join(REPO, 'public', 'clubs', `${id}.png`)) ? '' : '  (escudo a bajar)'}`);
  if (sinUnion.length) console.log(`uniones que no existen (el club queda sin unión): ${sinUnion.join(', ')}`);
  console.log(`alias nuevos: ${aliasNuevos.size}`);
  for (const p of planes) {
    console.log(`torneo ${p.ed.clave.padEnd(28)} ${existentes.has(p.ed.slug) ? 'ya existe, se saltea' : `${p.ed.nombre} · ${p.ed.formato} · ${p.equipos.length} equipos${p.zonas.length ? ` · ${p.zonas.map((z) => `${z.nombre}:${z.equipos.length}`).join(' ')}` : ''}`}`);
  }
  if (modo === 'plan') { console.log('\nmodo --plan: no se escribió nada.'); return; }

  // Los escudos primero: si uno falla no queda nada escrito en la base. Las selecciones llevan
  // la bandera propia (el molde rectangular de dos esquinas curvas); solo los clubes, su escudo.
  for (const id of clubesNuevos) {
    const bandera = clubes.get(id)?.club.bandera;
    if (bandera) { copiarBandera(id, bandera); continue; }
    if (fs.existsSync(path.join(REPO, 'public', 'clubs', `${id}.png`))) continue;
    const logo = clubes.get(id)?.logo;
    if (!logo) throw new Error(`el club ${id} es nuevo y el sitio no trae su escudo`);
    await bajarEscudo(id, logo);
  }

  await insertar('clubs', clubesNuevos.map((id) => {
    const c = clubes.get(id)!.club;
    return {
      id, union_id: unionDe(c), name: c.name, short_name: c.name, city: null, region: null,
      country: c.country, logo_url: `/clubs/${id}.png`, primary_color: null, slug: id, is_visible: true,
      entity_type: 'club', sport: 'rugby', sport_id: 'rugby', category: null, categories: [], status: 'active', visibility: 'visible',
      external_id: null, created_at: ahora, updated_at: ahora,
    };
  }));
  await insertar('club_external_ids', [...aliasNuevos].map(([clave, club]) => ({
    provider: RE_PROVIDER, external_id: clave, club_id: club, confidence: 'exacto', created_at: ahora,
  })));

  const sql: string[] = ['-- Rollback del alta de Rugby Europe.', 'BEGIN;'];
  for (const p of planes) {
    if (existentes.has(p.ed.slug)) continue;
    sql.push(...(await crearTorneo(p)));
  }
  if (aliasNuevos.size) sql.push(`DELETE FROM public.club_external_ids WHERE provider = '${RE_PROVIDER}' AND external_id IN (${[...aliasNuevos.keys()].map((k) => `'${k}'`).join(', ')});`);
  if (clubesNuevos.length) sql.push(`DELETE FROM public.clubs WHERE id IN (${clubesNuevos.map((c) => `'${c}'`).join(', ')});`);
  sql.push('COMMIT;', '');
  const archivo = path.join(REPO, `RUGBYEUROPE_ALTA_ROLLBACK_${ahora.slice(0, 10)}.sql`);
  fs.writeFileSync(archivo, sql.join('\n'), 'utf8');
  console.log(`\n✓ listo. rollback: ${archivo}`);
}

/** Crea un torneo completo; si falla a mitad lo deshace. Devuelve las líneas de su rollback. */
async function crearTorneo(p: EdicionPlan): Promise<string[]> {
  const { ed } = p;
  const tournamentId = crypto.randomUUID();
  const seasonId = crypto.randomUUID();
  const faseId = crypto.randomUUID();
  const ruleset = rulesetDe(ed);
  const formatoDb = ed.formato === 'eliminatoria' ? 'knockout' : ed.formato === 'zonas' ? 'groups' : 'league';
  const fechasCuadro = FECHAS_CUADRO[ed.clave];
  if (ed.formato === 'eliminatoria' && !fechasCuadro) throw new Error(`${ed.clave}: faltan las fechas del cuadro en FECHAS_CUADRO`);
  const desde = fechasCuadro?.[0] ?? ed.desde;
  const hasta = fechasCuadro?.[fechasCuadro.length - 1] ?? ed.hasta;
  const grupoIds = new Map(p.zonas.map((z) => [z.nombre, crypto.randomUUID()]));
  const zonaDeClub = new Map<string, string>();
  for (const z of p.zonas) for (const e of z.equipos) zonaDeClub.set(e.club.id, grupoIds.get(z.nombre) as string);

  try {
    await insertar('tournaments', [{
      id: tournamentId, union_id: null, season_id: ed.temporada,
      name: ed.nombre, display_name: ed.nombre, original_name: ed.original, slug: ed.slug,
      status: 'published', category: ed.categoria, gender: ed.genero, age_grade: ed.categoria,
      region: 'Europe', country: 'Internacional', country_id: null, country_name: 'Internacional',
      format: formatoDb, is_visible: true, is_active: true, logo_url: null,
      ruleset, ruleset_version: 1, sport_id: 'rugby', sport: 'rugby', sport_name: 'Rugby',
      priority: 0, sponsors: [], social_links: {}, display_order: 0, is_popular: false,
      // `url` vacía e `is_api_managed` en false: la página lee la base, no FlashScore.
      is_api_managed: false, review_status: 'approved', data_source: null,
      external_id: buildTournamentExternalId(ed.clave), current_season_id: null, created_at: ahora, updated_at: ahora,
    }]);
    await insertar('tournament_seasons', [{
      id: seasonId, tournament_id: tournamentId, legacy_tournament_id: tournamentId,
      season_code: ed.temporada, name: `${ed.nombre} ${ed.temporada}`, display_name: `${ed.nombre} ${ed.temporada}`,
      slug: ed.slug, status: 'active', is_active: true, start_date: desde, end_date: hasta,
      format: formatoDb, ruleset, settings: { source: ORIGEN }, champion_club_id: null, created_at: ahora, updated_at: ahora,
    }]);
    await actualizar(`tournaments?id=eq.${tournamentId}`, { current_season_id: seasonId });

    const base = { teamsCount: p.equipos.length, legs: 1, source: ORIGEN, rugbyeurope: { edicion: ed.clave } };
    const ajustesLiga = {
      points: { ...PUNTOS }, pointsSystem: { ...PUNTOS, bonusTry: 1, bonusLoss: 1, allowBonusPoints: true },
      bonus: { offensive: { tries: 4, points: 1 }, defensive: { margin: 7, points: 1 } }, tiebreakers: TIEBREAKERS,
      standings: { mode: 'automatic', editable: true },
    };
    await insertar('tournament_phases', [{
      id: faseId, tournament_id: tournamentId, season_id: seasonId, order_index: 1, is_active: true,
      name: ed.formato === 'eliminatoria' ? 'Cuadro' : ed.formato === 'zonas' ? 'Fase de zonas' : 'Campeonato',
      phase_type: ed.formato === 'eliminatoria' ? 'playoff' : ed.formato === 'zonas' ? 'group_stage' : 'league',
      settings: ed.formato === 'eliminatoria' ? { ...base, phaseMode: 'playoff' } : { ...base, ...ajustesLiga },
      created_at: ahora, updated_at: ahora,
    }]);
    if (p.zonas.length) {
      await insertar('tournament_groups', p.zonas.map((z, i) => ({
        id: grupoIds.get(z.nombre), phase_id: faseId, season_id: seasonId, name: z.nombre, order_index: i + 1, created_at: ahora,
      })));
    }
    if (ed.formato === 'eliminatoria') {
      await insertar('tournament_rounds', RONDAS.map((r, i) => ({
        id: crypto.randomUUID(), phase_id: faseId, season_id: seasonId, name: r.nombre, order_index: r.orden,
        start_date: fechasCuadro[i], end_date: fechasCuadro[i], is_completed: false, notes: null, created_at: ahora, updated_at: ahora,
      })));
    }

    const clubesDelTorneo = [...new Map(p.equipos.map((e) => [e.club.id, e.club])).values()];
    const pid = new Map(clubesDelTorneo.map((c) => [c.id, { p: crypto.randomUUID(), e: crypto.randomUUID() }]));
    await insertar('tournament_participants', clubesDelTorneo.map((c) => ({
      id: pid.get(c.id)!.p, tournament_id: tournamentId, season_id: seasonId, season_entry_id: null, club_id: c.id, name: c.name,
      type: 'club', status: 'active', seed: null, group_id: zonaDeClub.get(c.id) ?? null, short_code: null, notes: ORIGEN,
      joined_at: ahora, created_at: ahora, updated_at: ahora,
    })));
    await insertar('team_season_entries', clubesDelTorneo.map((c) => ({
      id: pid.get(c.id)!.e, season_id: seasonId, tournament_id: tournamentId, club_id: c.id, team_id: null, source_participant_id: pid.get(c.id)!.p,
      group_id: zonaDeClub.get(c.id) ?? null, zone: null, category: null, status: 'active', seed: null, notes: null,
      settings: { source: ORIGEN }, created_at: ahora, updated_at: ahora,
    })));
    for (const c of clubesDelTorneo) await actualizar(`tournament_participants?id=eq.${pid.get(c.id)!.p}`, { season_entry_id: pid.get(c.id)!.e });
    await insertar('tournament_phase_participants', clubesDelTorneo.map((c) => ({
      id: crypto.randomUUID(), tournament_id: tournamentId, season_id: seasonId, phase_id: faseId, participant_id: pid.get(c.id)!.p,
      group_id: zonaDeClub.get(c.id) ?? null, status: 'active', seed: null, notes: null, created_at: ahora, updated_at: ahora,
    })));
  } catch (e) {
    for (const r of [
      `tournament_phase_participants?tournament_id=eq.${tournamentId}`, `team_season_entries?tournament_id=eq.${tournamentId}`,
      `tournament_participants?tournament_id=eq.${tournamentId}`, `tournament_rounds?phase_id=eq.${faseId}`,
      `tournament_groups?phase_id=eq.${faseId}`, `tournament_phases?tournament_id=eq.${tournamentId}`,
    ]) await borrar(r).catch(() => {});
    await actualizar(`tournaments?id=eq.${tournamentId}`, { current_season_id: null }).catch(() => {});
    await borrar(`tournament_seasons?tournament_id=eq.${tournamentId}`).catch(() => {});
    await borrar(`tournaments?id=eq.${tournamentId}`).catch(() => {});
    throw e;
  }
  console.log(`✓ ${ed.nombre}  /tournaments/${tournamentId}  (${p.equipos.length} equipos${p.zonas.length ? ` · ${p.zonas.length} zonas` : ''})`);
  return [
    `DELETE FROM public.matches WHERE tournament_id = '${tournamentId}';`,
    `DELETE FROM public.tournament_phase_participants WHERE tournament_id = '${tournamentId}';`,
    `UPDATE public.tournament_participants SET season_entry_id = NULL WHERE tournament_id = '${tournamentId}';`,
    `DELETE FROM public.team_season_entries WHERE tournament_id = '${tournamentId}';`,
    `DELETE FROM public.tournament_participants WHERE tournament_id = '${tournamentId}';`,
    `DELETE FROM public.tournament_rounds WHERE phase_id = '${faseId}';`,
    `DELETE FROM public.tournament_groups WHERE phase_id = '${faseId}';`,
    `DELETE FROM public.tournament_standings WHERE tournament_id = '${tournamentId}';`,
    `DELETE FROM public.tournament_phases WHERE tournament_id = '${tournamentId}';`,
    `UPDATE public.tournaments SET current_season_id = NULL WHERE id = '${tournamentId}';`,
    `DELETE FROM public.tournament_seasons WHERE tournament_id = '${tournamentId}';`,
    `DELETE FROM public.tournaments WHERE id = '${tournamentId}';`,
  ];
}

main().catch((e) => { console.error('\nFALLÓ:', e.message || e); process.exit(1); });
