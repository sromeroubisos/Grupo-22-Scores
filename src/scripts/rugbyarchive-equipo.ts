/**
 * Historial completo de UN equipo desde rugbyarchive.net a la caché de
 * partidos externos (`external_match_cache`) + su palmarés
 * (`external_team_honours`) + el vínculo FlashScore↔rugbyarchive
 * (`external_teams.rugbyarchive_id`).
 *
 *   npx tsx src/scripts/rugbyarchive-equipo.ts --ra=595 --fs=lrM6RMBU --plan
 *   npx tsx src/scripts/rugbyarchive-equipo.ts --ra=595 --fs=lrM6RMBU --execute
 *   ... [--desde=1950] [--hasta=2027] [--sport=rugby]
 *
 * `--ra` es el id de rugbyarchive (…/team/595 → 595). `--fs` es el id de
 * FlashScore del mismo equipo (…/clubs/lrM6RMBU → lrM6RMBU); es opcional,
 * pero sin él el historial queda anclado solo a 'ra-team-<ra>' y la página
 * del club no lo levanta hasta que el vínculo exista.
 *
 * Convención de ids (la misma que lee /api/teams):
 *   - partido:  'ra-<idPartita>'
 *   - equipo:   'fs-team-<fs>' para el equipo vinculado, 'ra-team-<id>' para
 *               el resto (rivales sin vínculo conocido)
 *
 * A diferencia de los imports de torneos (rugbyarchive-interior-nacional.ts),
 * esto NO crea torneos de G22: alimenta la caché que la página del club lee
 * DB-first. Reimportar es idempotente (upsert por id; el palmarés se borra y
 * reescribe por ancla+fuente).
 */
import fs from 'node:fs';
import path from 'node:path';
import * as dotenv from 'dotenv';

import {
  fetchArchivioPartite,
  fetchArchivioPartiteDettaglio,
  fetchSquadra,
} from '../lib/integrations/rugbyarchive/client.ts';

const REPO = process.cwd();
dotenv.config({ path: path.join(REPO, '.env.local') });

// ── CLI ───────────────────────────────────────────────────────────────────────

const modo = process.argv.includes('--execute') ? 'execute'
  : process.argv.includes('--plan') ? 'plan' : null;
if (!modo) { console.error('usá --plan o --execute'); process.exit(2); }

const arg = (nombre: string) =>
  process.argv.find((a) => a.startsWith(`--${nombre}=`))?.slice(nombre.length + 3) || null;

const RA_ID = Number(arg('ra'));
if (!Number.isInteger(RA_ID) || RA_ID <= 0) { console.error('--ra=<id numérico de rugbyarchive> es obligatorio'); process.exit(2); }
const FS_ID = (arg('fs') || '').replace(/^fs-team-/i, '').replace(/^fs-/i, '').trim() || null;
const SPORT = arg('sport') || 'rugby';
const DESDE = arg('desde') ? Number(arg('desde')) : null;
const HASTA = arg('hasta') ? Number(arg('hasta')) : null;

const CACHE = path.join(REPO, '.rugbyarchive-cache', 'equipos');
const ROLLBACK = path.join(REPO, `RUGBYARCHIVE_EQUIPO_${RA_ID}_ROLLBACK.sql`);
const LOG = path.join(REPO, `RUGBYARCHIVE_EQUIPO_${RA_ID}_LOG.jsonl`);

const URL_BASE = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
if (!URL_BASE || !KEY) throw new Error('Faltan credenciales en .env.local');
const H = { apikey: KEY, authorization: `Bearer ${KEY}`, 'content-type': 'application/json' };

// ── REST mínimos (mismo estilo que rugbyarchive-interior-nacional.ts) ────────

async function upsert(tabla: string, filas: unknown[], onConflict: string) {
  for (let i = 0; i < filas.length; i += 400) {
    const res = await fetch(`${URL_BASE}/rest/v1/${tabla}?on_conflict=${onConflict}`, {
      method: 'POST',
      headers: { ...H, prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(filas.slice(i, i + 400)),
    });
    if (!res.ok) throw new Error(`POST ${tabla}: HTTP ${res.status} ${(await res.text()).slice(0, 300)}`);
  }
}

async function del(recurso: string) {
  const res = await fetch(`${URL_BASE}/rest/v1/${recurso}`, { method: 'DELETE', headers: H });
  if (!res.ok) throw new Error(`DELETE ${recurso}: HTTP ${res.status} ${(await res.text()).slice(0, 300)}`);
}

async function selectOne<T>(recurso: string): Promise<T | null> {
  const res = await fetch(`${URL_BASE}/rest/v1/${recurso}`, { headers: H });
  if (!res.ok) throw new Error(`GET ${recurso}: HTTP ${res.status} ${(await res.text()).slice(0, 300)}`);
  const filas = await res.json() as T[];
  return filas[0] ?? null;
}

function log(evento: Record<string, unknown>) {
  fs.appendFileSync(LOG, JSON.stringify({ ts: new Date().toISOString(), ...evento }) + '\n', 'utf8');
}

// ── Formas de la API de rugbyarchive ─────────────────────────────────────────

interface RaSquadraRef { id: number | null; nome: string | null }
interface RaPartitaArchivio {
  dataPartita: string | null;          // 'dd/MM/yyyy'
  squadraCasa: RaSquadraRef | null;
  squadraTrasferta: RaSquadraRef | null;
  risultato: string | null;            // '37-23'
  stadio: string | null;
  altreCompetizioni: Array<{ idCompetizione: number | null; idTour: number | null; nome: string | null; stagione: string | null; turno: string | null }> | null;
  idPartita: number | null;
}
interface RaArchivio { anniAvversari: Array<{ stagione: string | null }> | null }
interface RaSquadra {
  id: number;
  nome: string | null;
  urlBadge: string | null;
  alboDOro: Array<{ idPrincipale: number; nome: string | null; vittorie: number; secondiPosti: number }> | null;
  stagioniSquadra: Array<{ stagione: string | null; storiaStagione: string | null }> | null;
}

// ── Vínculo competición → torneo del sitio ───────────────────────────────────
// La página /torneos/{id} resuelve ids 'fs-<leagueId>' (FlashScore) y UUIDs
// internos. Cuando la competición de rugbyarchive existe en el sitio, la fila
// se escribe con ESE id y el partido queda vinculado al torneo; si no, queda
// 'ra-comp-<id>' / 'ra-tour-<id>' y la UI no arma link (mejor sin link que
// con un link roto). Los ids fs- salen de tournaments/ids de FlashScore.
// Extendible por CLI: --vinculo=comp-40=<id del sitio> (repetible).

const VINCULOS_COMPETENCIA = new Map<string, string>([
  ['comp-3', 'fs-M54dkNqe'],   // The Rugby Championship (incluye Tri Nations: mismo id en rugbyarchive)
  ['comp-1', 'fs-ERizbd5N'],   // World Cup
  ['comp-718', 'fs-yzlgt0up'], // Nations Championship
  ['comp-4', 'fs-xgehubo9'],   // Test Matches → World: Friendly International
]);
for (const par of process.argv.filter((a) => a.startsWith('--vinculo=')).map((a) => a.slice(10))) {
  const sep = par.indexOf('=');
  if (sep > 0) VINCULOS_COMPETENCIA.set(par.slice(0, sep), par.slice(sep + 1));
}

// ── Mapeo a filas de la caché ────────────────────────────────────────────────

const BADGE = (id: number) => `http://www.rugbyarchive.net/assets/${id}Badge.png`;

/** Mismo formato que buildTeamLogoProxyUrl: el navegador pega al proxy propio
 *  (rugbyarchive es HTTP puro y en producción sería contenido mixto). */
function logoProxy(key: string, nombre: string, raId: number) {
  const q = new URLSearchParams({ key, name: nombre, fallback: BADGE(raId) });
  return `/api/assets/team-logo?${q.toString()}`;
}

function equipoCacheado(ref: RaSquadraRef | null) {
  const raId = ref?.id ?? null;
  const nombre = (ref?.nome || '').trim();
  const esVinculado = raId !== null && raId === RA_ID && FS_ID;
  const key = esVinculado ? `fs-team-${FS_ID}` : raId !== null ? `ra-team-${raId}` : '';
  const logo = raId !== null ? logoProxy(key, nombre, raId) : '';
  return {
    id: key,
    name: nombre,
    logo,
    shortName: nombre ? nombre.substring(0, 3).toUpperCase() : '---',
    image_path: logo,
    small_image_path: logo,
  };
}

function parseFecha(v: string | null): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec((v || '').trim());
  if (!m) return null;
  // Mediodía UTC: sin hora real, el mediodía mantiene la fecha de calendario
  // en cualquier huso razonable (AR incluido).
  return `${m[3]}-${m[2]}-${m[1]}T12:00:00.000Z`;
}

function parseResultado(v: string | null): { home: number | null; away: number | null } {
  const parts = String(v || '').split(/\s*[-–]\s*/);
  if (parts.length < 2) return { home: null, away: null };
  const home = parseInt(parts[0], 10);
  const away = parseInt(parts[parts.length - 1], 10);
  return { home: Number.isNaN(home) ? null : home, away: Number.isNaN(away) ? null : away };
}

function filaDePartido(p: RaPartitaArchivio): Record<string, unknown> | null {
  if (p.idPartita == null) return null;
  const fecha = parseFecha(p.dataPartita);
  if (!fecha) return null;
  const score = parseResultado(p.risultato);
  const comp = p.altreCompetizioni?.[0] ?? null;
  const esFuturo = Date.parse(fecha) > Date.now();
  const jugado = score.home != null && score.away != null;
  const claveComp = comp?.idCompetizione != null ? `comp-${comp.idCompetizione}`
    : comp?.idTour != null ? `tour-${comp.idTour}` : null;
  return {
    id: `ra-${p.idPartita}`,
    sport: SPORT,
    tournament_id: claveComp ? (VINCULOS_COMPETENCIA.get(claveComp) ?? `ra-${claveComp}`) : null,
    tournament_name: comp?.nome || null,
    country_name: null,
    home_team: equipoCacheado(p.squadraCasa),
    away_team: equipoCacheado(p.squadraTrasferta),
    score,
    status: jugado ? 'final' : esFuturo ? 'scheduled' : 'final',
    date_time: fecha,
    round_label: comp?.turno || null,
  };
}

// ── Palmarés desde stagioniSquadra ───────────────────────────────────────────

interface Logro { competition_name: string; season: string; result: 'champion' | 'runner_up' }

function parseLogros(squadra: RaSquadra): Logro[] {
  const logros: Logro[] = [];
  for (const s of squadra.stagioniSquadra || []) {
    const temporada = (s.stagione || '').trim();
    if (!temporada) continue;
    const re = /(Winner|Second)\s+in\s+<span[^>]*>([^<]+)<\/span>/g;
    for (const m of (s.storiaStagione || '').matchAll(re)) {
      logros.push({
        competition_name: m[2].trim(),
        season: temporada,
        result: m[1] === 'Winner' ? 'champion' : 'runner_up',
      });
    }
  }
  return logros;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const squadraRes = await fetchSquadra<RaSquadra>(RA_ID, { cacheDir: CACHE });
  if (!squadraRes.ok || !squadraRes.data) throw new Error(`squadra/${RA_ID}: ${squadraRes.error || 'sin datos'}`);
  const squadra = squadraRes.data;
  const nombre = (squadra.nome || `equipo ${RA_ID}`).trim();

  const archivioRes = await fetchArchivioPartite<RaArchivio>(RA_ID, { cacheDir: CACHE });
  if (!archivioRes.ok || !archivioRes.data) throw new Error(`archiviopartite/${RA_ID}: ${archivioRes.error || 'sin datos'}`);

  const temporadas = (archivioRes.data.anniAvversari || [])
    .map((a) => (a.stagione || '').trim())
    .filter(Boolean)
    .filter((s) => {
      const anio = parseInt(s, 10);
      if (!Number.isFinite(anio)) return true; // '2023/24' y similares entran
      if (DESDE != null && anio < DESDE) return false;
      if (HASTA != null && anio > HASTA) return false;
      return true;
    });
  // De la más vieja a la más nueva, para que un corte a mitad deje un rango contiguo.
  temporadas.sort();

  console.log(`\n${nombre} (rugbyarchive ${RA_ID}${FS_ID ? ` ↔ FlashScore ${FS_ID}` : ', SIN vínculo FlashScore'})`);
  console.log(`Temporadas con partidos: ${temporadas.length}${temporadas.length ? ` (${temporadas[0]} → ${temporadas[temporadas.length - 1]})` : ''}`);

  const filas: Record<string, unknown>[] = [];
  const rivales = new Map<number, string>();
  let descartados = 0;

  for (const temporada of temporadas) {
    const det = await fetchArchivioPartiteDettaglio<RaPartitaArchivio[]>(RA_ID, temporada, { cacheDir: CACHE });
    if (!det.ok || !Array.isArray(det.data)) {
      console.warn(`  ${temporada}: ${det.error || 'respuesta rara'} — salteada`);
      log({ evento: 'temporada_salteada', temporada, error: det.error });
      continue;
    }
    for (const p of det.data) {
      const fila = filaDePartido(p);
      if (!fila) { descartados++; continue; }
      filas.push(fila);
      for (const ref of [p.squadraCasa, p.squadraTrasferta]) {
        if (ref?.id != null && ref.id !== RA_ID && ref.nome) rivales.set(ref.id, ref.nome.trim());
      }
    }
  }

  // El mismo idPartita puede venir en dos temporadas (fase que cruza el año): última gana.
  const porId = new Map<string, Record<string, unknown>>();
  for (const f of filas) porId.set(f.id as string, f);
  const partidos = Array.from(porId.values());

  const logros = parseLogros(squadra);
  const anclaHonours = FS_ID || `ra-team-${RA_ID}`;

  // Sanity contra el agregado que publica la fuente.
  const campeonesPorComp = new Map<string, number>();
  for (const l of logros) {
    if (l.result === 'champion') campeonesPorComp.set(l.competition_name, (campeonesPorComp.get(l.competition_name) || 0) + 1);
  }
  for (const a of squadra.alboDOro || []) {
    const parseados = campeonesPorComp.get((a.nome || '').trim()) || 0;
    if (a.vittorie !== parseados) {
      console.warn(`  ⚠ ${a.nome}: la fuente dice ${a.vittorie} título(s), el parseo de temporadas encontró ${parseados}`);
    }
  }

  console.log(`Partidos: ${partidos.length} (descartados sin id o sin fecha: ${descartados})`);
  console.log(`Palmarés: ${logros.filter((l) => l.result === 'champion').length} título(s), ${logros.filter((l) => l.result === 'runner_up').length} subcampeonato(s), ancla ${anclaHonours}`);
  console.log(`Rivales para external_teams: ${rivales.size}`);

  if (modo === 'plan') {
    const porComp = new Map<string, string[]>();
    for (const l of logros.filter((x) => x.result === 'champion')) {
      porComp.set(l.competition_name, [...(porComp.get(l.competition_name) || []), l.season]);
    }
    for (const [comp, anios] of porComp) console.log(`  🏆 ${comp}: ${anios.length} (${anios.join(', ')})`);
    console.log('\n--plan: no se escribió nada.');
    return;
  }

  // ── Escritura ──────────────────────────────────────────────────────────────

  // Rollback ANTES de escribir: si el import muere a la mitad, el archivo ya
  // sabe deshacer todo lo que este equipo pudo haber tocado.
  const rollback = [
    `-- Rollback del import de ${nombre} (rugbyarchive ${RA_ID}) — generado ${new Date().toISOString()}`,
    `DELETE FROM external_team_honours WHERE source = 'rugbyarchive' AND team_id IN ('${anclaHonours}', 'ra-team-${RA_ID}');`,
    FS_ID ? `UPDATE external_teams SET rugbyarchive_id = NULL WHERE id = '${FS_ID}';` : null,
    `DELETE FROM external_teams WHERE id = 'ra-team-${RA_ID}' AND source = 'rugbyarchive';`,
    `-- Los rivales 'ra-team-*' se comparten entre imports de equipos: borralos solo si este fue el único.`,
    ...chunk(partidos.map((p) => p.id as string), 200).map(
      (ids) => `DELETE FROM external_match_cache WHERE id IN (${ids.map((id) => `'${id}'`).join(', ')});`,
    ),
  ].filter(Boolean).join('\n');
  fs.writeFileSync(ROLLBACK, rollback + '\n', 'utf8');

  // 1. Partidos.
  await upsert('external_match_cache', partidos, 'id');
  log({ evento: 'partidos_upsert', cantidad: partidos.length });
  console.log(`✓ ${partidos.length} partidos en external_match_cache`);

  // 2. Equipos externos: el propio (ancla ra-) y los rivales, para que el
  //    proxy de escudos tenga de dónde resolver la key 'ra-team-<id>'.
  const filasEquipos = [
    { id: `ra-team-${RA_ID}`, source: 'rugbyarchive', name: nombre, sport: SPORT, logo_url: BADGE(RA_ID) },
    ...Array.from(rivales, ([id, nom]) => ({
      id: `ra-team-${id}`, source: 'rugbyarchive', name: nom, sport: SPORT, logo_url: BADGE(id),
    })),
  ];
  await upsert('external_teams', filasEquipos, 'id');
  log({ evento: 'equipos_upsert', cantidad: filasEquipos.length });
  console.log(`✓ ${filasEquipos.length} equipos en external_teams`);

  // 3. Vínculo FlashScore ↔ rugbyarchive.
  if (FS_ID) {
    const existente = await selectOne<{ id: string }>(`external_teams?id=eq.${encodeURIComponent(FS_ID)}&select=id`);
    if (existente) {
      const res = await fetch(`${URL_BASE}/rest/v1/external_teams?id=eq.${encodeURIComponent(FS_ID)}`, {
        method: 'PATCH', headers: H, body: JSON.stringify({ rugbyarchive_id: String(RA_ID) }),
      });
      if (!res.ok) throw new Error(`PATCH external_teams: HTTP ${res.status} ${(await res.text()).slice(0, 300)}`);
    } else {
      await upsert('external_teams', [
        { id: FS_ID, source: 'flashscore', name: nombre, sport: SPORT, rugbyarchive_id: String(RA_ID) },
      ], 'id');
    }
    log({ evento: 'vinculo', fs: FS_ID, ra: RA_ID });
    console.log(`✓ vínculo external_teams.rugbyarchive_id: ${FS_ID} → ${RA_ID}`);
  }

  // 4. Palmarés: borrar y reescribir por ancla+fuente (reimport idempotente,
  //    y si el equipo se vinculó después, el ancla vieja 'ra-team-…' se va).
  await del(`external_team_honours?source=eq.rugbyarchive&team_id=in.(${encodeURIComponent(`"${anclaHonours}","ra-team-${RA_ID}"`)})`);
  const filasLogros = logros.map((l) => ({
    team_id: anclaHonours,
    sport: SPORT,
    source: 'rugbyarchive',
    source_ref: `rugbyarchive:${RA_ID}`,
    ...l,
  }));
  if (filasLogros.length > 0) {
    await upsert('external_team_honours', filasLogros, 'team_id,competition_name,season,result');
  }
  log({ evento: 'palmares_upsert', cantidad: filasLogros.length });
  console.log(`✓ ${filasLogros.length} filas de palmarés`);
  console.log(`\nListo. Rollback: ${path.basename(ROLLBACK)}`);
}

function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

main().catch((e) => { console.error(e); process.exit(1); });
