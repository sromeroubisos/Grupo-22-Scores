/**
 * Seven de la República 2026: deja la base igual a la planilla pública de la
 * organización (la que lee el visor de sites.google.com/view/seven-republica-2026).
 *
 * La usan la ruta `/api/cron/seven-republica-sync` (Vercel, cada 3 minutos) y
 * `scripts/seven-republica/vivo.mjs` (corrida local / respaldo).
 *
 * La fuente: Google Sheet 1uawK2B4…, pestaña PUBLICO, como CSV de gviz. Dos
 * columnas, CLAVE y VALOR_JSON. Cada valor es un JSON partido en celdas
 * (`partidos.0`, `partidos.1`…) que hay que pegar antes de leerlo. Trae
 * `partidos` (101, zonas + cruces), `cruces` (los 33 del domingo, con la
 * instancia y el rival ya resuelto cuando lo hay) y `zonas`. Sólo el marcador
 * final: ni tries ni tarjetas ni minuto a minuto.
 *
 * Un resultado vale SÓLO si `publicado === true` y los dos tantos son números:
 * la misma regla del visor oficial ("nunca usar resultados privados ni sin
 * publicar").
 *
 * Qué hace cada corrida (idempotente: lo que ya está igual no se toca):
 *  1. Los dos torneos masculinos (creados por scripts/seven-republica/seed.mjs)
 *     reciben el id de planilla de cada partido, los partidos de zona que
 *     falten y la fase final con los cruces.
 *  2. Los dos femeninos se crean completos la primera vez, con selecciones
 *     `sel-<x>-f` que heredan escudo y unión de la masculina.
 *  3. Horario y cancha salen de la planilla mientras el partido no esté jugado.
 *  4. Los cruces reciben sus equipos cuando la planilla los publica y se
 *     muestran recién entonces (`is_visible = local && visitante`).
 *  5. Resultado publicado → `final` con marcador y puntos 2/1/0; se recalcula la
 *     tabla de la fase de grupos del torneo que cambió.
 *
 * La ronda "Final" de cada fase final lleva UN solo partido (Copa de Oro, Final
 * del Campeonato, Final del Ascenso): así el trigger `g22_campeon_por_final`
 * corona solo. Plata, Bronce, ubicación y descenso van en "Ubicación".
 */
import crypto from 'node:crypto';

import { recalculatePhaseStandingsScopes } from '@/lib/server/recalculateStandings';

export const SR_ORIGEN = 'seven-republica-2026';
const HOJA_ID = '1uawK2B4xx6LGPH-wNmDo-_9Q18ghA_oty2B1UbzUy2Q';
const HOJA_TAB = 'PUBLICO';
export const SR_FUENTE = `https://docs.google.com/spreadsheets/d/${HOJA_ID}/gviz/tq?sheet=${HOJA_TAB}&tqx=out:csv`;
const UNION_UAR = 'union-argentina-de-rugby';

/** Fuera de esta ventana el cron contesta sin bajar nada. */
export const SR_DESDE = '2026-11-27T12:00:00Z';
export const SR_HASTA = '2026-11-30T06:00:00Z';

/* ── Tipos de la planilla ─────────────────────────────────────────────────── */

export interface PartidoSR {
  id: string;
  numero: string;
  equipo1: string;
  equipo2: string;
  rama: string;
  competencia: string;
  cancha: number | string | null;
  fecha: string;
  hora: string;
  reprogramado?: boolean;
  publicado?: boolean;
  resultado1: number | string | null;
  resultado2: number | string | null;
}
export interface CruceSR {
  id: string;
  rama: string;
  competencia: string;
  instancia: string;
  puesto1: string;
  puesto2: string;
  equipo1?: string;
  equipo2?: string;
}
export interface ZonaSR {
  rama: string;
  competencia: string;
  zona: string;
  puestos: Array<{ equipo: string }>;
}
export interface PlanillaSR {
  partidos: PartidoSR[];
  cruces: CruceSR[];
  zonas: ZonaSR[];
  actualizado?: string;
  modo?: string;
}

export interface OpcionesSR {
  /** false = plan: se lee todo y no se escribe nada. */
  escribir: boolean;
  /** CSV ya bajado (pruebas); si falta, se baja de la planilla. */
  csv?: string;
  log?: (linea: string) => void;
}
export interface ResumenSR {
  partidosPlanilla: number;
  conResultado: number;
  actualizada: string | null;
  torneos: Array<{ nombre: string; id: string | null; nuevos: number; actualizados: number; resultados: number }>;
}

/* ── Configuración del torneo ─────────────────────────────────────────────── */

const PLUMAZO = 'El Plumazo · Club Atlético Estudiantes, Paraná';
const TORTUGUITA = 'La Tortuguita · Paraná Rowing Club';
const SEDE_DE_CANCHA: Record<string, string> = { 1: PLUMAZO, 2: PLUMAZO, 3: TORTUGUITA };
const instante = (fecha: string, hora: string) => new Date(`${fecha}T${hora}:00-03:00`).toISOString();

const PUNTOS = { win: 2, draw: 1, loss: 0 };
const TIEBREAKERS = [
  { order: 'desc', metric: 'points', enabled: true, priority: 1 },
  { order: 'desc', metric: 'headToHead', enabled: true, priority: 2 },
  { order: 'desc', metric: 'triesFor', enabled: true, priority: 3 },
  { order: 'desc', metric: 'pointsDiff', enabled: true, priority: 4 },
];
const RULESET = {
  standings: { bonus_rules: [], points_base: PUNTOS },
  tiebreakers: { order: ['points', 'head_to_head', 'tries_for', 'diff'] },
  competition: { parameters: {}, format_type: 'groups' },
  rugbyModality: 'sevens',
};
const COLORES_ZONA = ['#00a365', '#3b82f6', '#f97316', '#eab308'];

interface TorneoSR {
  rama: string;
  competencia: string;
  genero: 'masculino' | 'femenino';
  slug: string;
  nombre: string;
  /** Los masculinos de Ascenso ya tienen "Fecha 1" = sábado y "Fecha 2" = domingo. */
  fechaPorDia: boolean;
}
const TORNEOS: TorneoSR[] = [
  { rama: 'Masculino', competencia: 'Campeonato', genero: 'masculino', slug: 'seven-de-la-republica-2026-campeonato', nombre: 'Seven de la República - Campeonato', fechaPorDia: false },
  { rama: 'Masculino', competencia: 'Ascenso', genero: 'masculino', slug: 'seven-de-la-republica-2026-ascenso', nombre: 'Seven de la República - Ascenso', fechaPorDia: true },
  { rama: 'Femenino', competencia: 'Campeonato', genero: 'femenino', slug: 'seven-de-la-republica-2026-femenino-campeonato', nombre: 'Seven de la República Femenino - Campeonato', fechaPorDia: false },
  { rama: 'Femenino', competencia: 'Ascenso', genero: 'femenino', slug: 'seven-de-la-republica-2026-femenino-ascenso', nombre: 'Seven de la República Femenino - Ascenso', fechaPorDia: false },
];

const normalizar = (s: unknown) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

/** Nombre de la planilla → club masculino. */
const MASCULINO: Record<string, string> = {
  'buenos aires': 'sel-buenosaires', 'mar del plata': 'sel-mardelplata', 'tierra del fuego': 'sel-tdf',
  'uer b': 'sel-uerb', lagos: 'sel-lagos', 'lagos del sur': 'sel-lagos',
  paraguay: 'paraguay-7s', uruguay: 'uruguay-7s', cuyo: 'cuyo', 'alto valle': 'alto-valle',
};
const claveDe = (nombre: string) => normalizar(nombre).replace(/[^a-z]/g, '');
export function clubMasculino(nombre: string): string {
  return MASCULINO[normalizar(nombre)] ?? `sel-${claveDe(nombre)}`;
}
/** El femenino sigue al masculino: sel-tdf → sel-tdf-f; cuyo / alto-valle → sel-cuyo-f / sel-altovalle-f. */
export function clubDe(rama: string, nombre: string): string {
  const masc = clubMasculino(nombre);
  if (rama === 'Masculino') return masc;
  return masc.startsWith('sel-') ? `${masc}-f` : `sel-${claveDe(nombre)}-f`;
}
/** Un rótulo de origen ("3° Zona 1", "Ganador P 37") no es un equipo. */
export const esRotulo = (s: unknown) => /^\s*(\d+\s*[°º]\s*zona|ganador|perdedor)/i.test(String(s ?? ''));

export function origenDe(rotulo: string) {
  const z = String(rotulo).match(/^\s*(\d+)\s*[°º]\s*zona\s*(\d+)/i);
  if (z) return { type: 'standing', group: `Zona ${z[2]}`, position: Number(z[1]) };
  const p = String(rotulo).match(/^(ganador|perdedor)\s*p\s*(\d+)/i);
  if (p) return { type: p[1].toLowerCase() === 'ganador' ? 'winner' : 'loser', ref: `P${p[2]}` };
  return null;
}
const etiquetaDe = (rotulo: string) => String(rotulo).replace(/\s*[°º]\s*/, 'º ').replace(/P\s+(\d+)/, 'P$1');

export function rondaDeCruce(instancia: string): string {
  const i = normalizar(instancia);
  if (i.startsWith('semifinal')) return 'Semifinales';
  if (i === 'final del campeonato' || i === 'final de copa de oro' || /^final del (masculino|femenino) ascenso/.test(i)) return 'Final';
  return 'Ubicación';
}
const RONDAS_FINAL = ['Semifinales', 'Ubicación', 'Final'];

/* ── Lectura de la planilla ───────────────────────────────────────────────── */

export function parsearCsv(texto: string): string[][] {
  const filas: string[][] = [];
  let fila: string[] = [];
  let celda = '';
  let comillas = false;
  for (let i = 0; i < texto.length; i += 1) {
    const c = texto[i];
    if (comillas) {
      if (c === '"' && texto[i + 1] === '"') { celda += '"'; i += 1; }
      else if (c === '"') comillas = false;
      else celda += c;
    } else if (c === '"') comillas = true;
    else if (c === ',') { fila.push(celda); celda = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && texto[i + 1] === '\n') i += 1;
      fila.push(celda); filas.push(fila); fila = []; celda = '';
    } else celda += c;
  }
  if (celda || fila.length) { fila.push(celda); filas.push(fila); }
  return filas;
}

export function leerCsvPlanilla(texto: string): PlanillaSR {
  const partes = new Map<string, Array<[number, string]>>();
  for (const [clave, valor] of parsearCsv(texto).slice(1)) {
    const m = String(clave ?? '').match(/^(.+)\.(\d+)$/);
    if (!m) continue;
    if (!partes.has(m[1])) partes.set(m[1], []);
    partes.get(m[1])!.push([Number(m[2]), valor]);
  }
  const datos: Record<string, unknown> = {};
  for (const [clave, trozos] of partes) {
    datos[clave] = JSON.parse(trozos.sort((a, b) => a[0] - b[0]).map(([, v]) => v).join(''));
  }
  for (const k of ['partidos', 'cruces', 'zonas']) {
    if (!Array.isArray(datos[k])) throw new Error(`la planilla no trae "${k}"`);
  }
  const planilla = datos as unknown as PlanillaSR;
  if (planilla.partidos.length < 90) throw new Error(`la planilla trae ${planilla.partidos.length} partidos (se esperaban 101): no se toca nada`);
  return planilla;
}

async function bajarCsv(): Promise<string> {
  let ultimoError: unknown;
  for (let intento = 0; intento < 3; intento += 1) {
    try {
      const res = await fetch(`${SR_FUENTE}&_=${Date.now()}`, {
        headers: { 'user-agent': 'Mozilla/5.0 (G22Scores/1.0)' },
        cache: 'no-store',
      });
      if (!res.ok) throw new Error(`la planilla contestó ${res.status}`);
      const cuerpo = await res.text();
      if (!cuerpo.startsWith('"CLAVE"')) throw new Error(`la planilla no trajo el CSV esperado: ${cuerpo.slice(0, 120)}`);
      return cuerpo;
    } catch (e) {
      ultimoError = e;
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
  throw ultimoError instanceof Error ? ultimoError : new Error(String(ultimoError));
}

const numero = (v: unknown) => (v === null || v === undefined || v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null);
export function resultadoPublicado(p: PartidoSR): [number, number] | null {
  if (p.publicado !== true) return null;
  const a = numero(p.resultado1);
  const b = numero(p.resultado2);
  return a === null || b === null ? null : [a, b];
}
function puntosDe(local: number, visita: number): [number, number] {
  if (local === visita) return [PUNTOS.draw, PUNTOS.draw];
  return local > visita ? [PUNTOS.win, PUNTOS.loss] : [PUNTOS.loss, PUNTOS.win];
}

/* ── Cliente PostgREST (service role) ─────────────────────────────────────── */

type Fila = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

function crearRest(escribir: boolean) {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key) throw new Error('Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
  const H = { apikey: key, authorization: `Bearer ${key}` };
  return {
    async leer(recurso: string): Promise<Fila[]> {
      const res = await fetch(encodeURI(`${base}/rest/v1/${recurso}`), { headers: H, cache: 'no-store' });
      if (!res.ok) throw new Error(`GET ${recurso}: ${res.status} ${(await res.text()).slice(0, 300)}`);
      return res.json();
    },
    async insertar(tabla: string, filas: Fila[]) {
      if (!filas.length || !escribir) return;
      const res = await fetch(`${base}/rest/v1/${tabla}`, {
        method: 'POST',
        headers: { ...H, 'content-type': 'application/json', prefer: 'return=minimal' },
        body: JSON.stringify(filas),
      });
      if (!res.ok) throw new Error(`POST ${tabla}: ${res.status} ${(await res.text()).slice(0, 400)}`);
    },
    async actualizar(recurso: string, cuerpo: Fila) {
      if (!escribir) return;
      const res = await fetch(encodeURI(`${base}/rest/v1/${recurso}`), {
        method: 'PATCH',
        headers: { ...H, 'content-type': 'application/json', prefer: 'return=minimal' },
        body: JSON.stringify(cuerpo),
      });
      if (!res.ok) throw new Error(`PATCH ${recurso}: ${res.status} ${(await res.text()).slice(0, 400)}`);
    },
  };
}
type Rest = ReturnType<typeof crearRest>;

const ahora = () => new Date().toISOString();
const extId = (p: PartidoSR) => `${SR_ORIGEN}:${p.id}`;
const ordenDe = (p: PartidoSR) => `${p.fecha}${p.hora}${String(p.numero).padStart(3, '0')}`;

/* ── Altas ────────────────────────────────────────────────────────────────── */

async function asegurarClubesFemeninos(db: Rest, datos: PlanillaSR, log: (l: string) => void) {
  const nombres = new Set<string>();
  for (const z of datos.zonas) if (z.rama === 'Femenino') for (const p of z.puestos) nombres.add(p.equipo);
  if (!nombres.size) return;
  const ids = [...nombres].map((n) => clubDe('Femenino', n));
  const hay = new Set((await db.leer(`clubs?select=id&id=in.(${ids.join(',')})`)).map((c) => c.id));
  const faltan = [...nombres].filter((n) => !hay.has(clubDe('Femenino', n)));
  if (!faltan.length) return;
  const masculinos = await db.leer(`clubs?select=id,union_id,logo_url,country,region&id=in.(${faltan.map(clubMasculino).join(',')})`);
  const base = new Map(masculinos.map((c) => [c.id, c]));
  const filas = faltan.map((n) => {
    const m = base.get(clubMasculino(n));
    if (!m) throw new Error(`no está la selección masculina ${clubMasculino(n)} para heredar el escudo de ${n} femenino`);
    const id = clubDe('Femenino', n);
    return {
      id, union_id: m.union_id, name: `${n} Femenino`, short_name: n, city: null, region: m.region,
      country: m.country || 'ARG', logo_url: m.logo_url, primary_color: null, slug: id,
      is_visible: true, entity_type: 'club', sport: 'rugby', sport_id: 'rugby', category: null,
      categories: [], status: 'active', visibility: 'visible', external_id: null,
      created_at: ahora(), updated_at: ahora(),
    };
  });
  log(`selecciones femeninas a crear (${filas.length}): ${filas.map((f) => f.id).join(', ')}`);
  await db.insertar('clubs', filas);
}

/** Crea un torneo con su fase de grupos, zonas y participantes. */
async function crearTorneo(db: Rest, t: TorneoSR, datos: PlanillaSR, escribir: boolean, log: (l: string) => void): Promise<string | null> {
  const tournamentId = crypto.randomUUID();
  const seasonId = crypto.randomUUID();
  const zonas = datos.zonas
    .filter((z) => z.rama === t.rama && z.competencia === t.competencia)
    .sort((a, b) => Number(a.zona) - Number(b.zona))
    .map((z) => ({ nombre: `Zona ${z.zona}`, equipos: z.puestos.map((p) => p.equipo), groupId: crypto.randomUUID() }));
  const faseId = crypto.randomUUID();
  log(`torneo a crear: ${t.nombre} · ${zonas.map((z) => `${z.nombre} (${z.equipos.join(', ')})`).join(' · ')}`);
  if (!escribir) return null;

  await db.insertar('tournaments', [{
    id: tournamentId, union_id: UNION_UAR, season_id: '2026', name: t.nombre, slug: t.slug,
    original_name: t.nombre, status: 'published', category: 'Seven', age_grade: null,
    region: 'Entre Ríos', country: 'ARG', country_id: 'argentina', country_name: 'Argentina',
    format: 'groups', is_visible: true, is_active: true, logo_url: null,
    ruleset: RULESET, ruleset_version: 1, sport_id: 'rugby', sport: 'rugby', sport_name: 'Rugby',
    gender: t.genero, priority: 0, sponsors: [], social_links: {}, display_order: 0,
    is_popular: false, is_api_managed: false, review_status: 'approved', external_id: null,
    data_source: SR_ORIGEN, created_at: ahora(), updated_at: ahora(),
  }]);
  await db.insertar('tournament_seasons', [{
    id: seasonId, tournament_id: tournamentId, legacy_tournament_id: tournamentId, season_code: '2026',
    name: `${t.nombre} 2026`, display_name: `${t.nombre} 2026`, slug: `${t.slug}-2026`,
    status: 'active', is_active: true, start_date: '2026-11-28', end_date: '2026-11-29',
    format: 'league', ruleset: RULESET, settings: { source: SR_ORIGEN, fuente: SR_FUENTE },
    champion_club_id: null, created_at: ahora(), updated_at: ahora(),
  }]);
  await db.actualizar(`tournaments?id=eq.${tournamentId}`, { current_season_id: seasonId });
  await db.insertar('tournament_phases', [{
    id: faseId, tournament_id: tournamentId, season_id: seasonId, name: 'Fase de grupos',
    phase_type: 'group_stage', order_index: 1, is_active: true,
    settings: {
      legs: 1, teamsCount: zonas.reduce((n, z) => n + z.equipos.length, 0), advanceCount: 0,
      group_names: zonas.map((z) => z.nombre), groupTags: zonas.map((z) => z.nombre),
      groupLabels: zonas.map((z, i) => ({
        id: z.groupId, name: z.nombre, color: COLORES_ZONA[i % COLORES_ZONA.length], colorMode: 'manual', autoColorIndex: i,
      })),
      pointsSystem: { ...PUNTOS, allowBonusPoints: false },
      tiebreakers: TIEBREAKERS, standings: { mode: 'automatic', editable: true },
      matchFormat: { type: 'single_match', label: 'Partido Único' }, source: SR_ORIGEN,
    },
    created_at: ahora(), updated_at: ahora(),
  }]);
  await db.insertar('tournament_groups', zonas.map((z, i) => ({
    id: z.groupId, phase_id: faseId, season_id: seasonId, name: z.nombre, order_index: i,
  })));

  const parts = zonas.flatMap((z) => z.equipos.map((nombre) => ({
    nombre, z, clubId: clubDe(t.rama, nombre), pid: crypto.randomUUID(), eid: crypto.randomUUID(),
  })));
  await db.insertar('tournament_participants', parts.map((p) => ({
    id: p.pid, tournament_id: tournamentId, season_id: seasonId, season_entry_id: null,
    club_id: p.clubId, name: p.nombre, type: 'club', status: 'active', seed: null,
    group_id: p.z.groupId, short_code: null, notes: SR_ORIGEN, joined_at: ahora(),
    created_at: ahora(), updated_at: ahora(),
  })));
  await db.insertar('team_season_entries', parts.map((p) => ({
    id: p.eid, season_id: seasonId, tournament_id: tournamentId, club_id: p.clubId, team_id: null,
    source_participant_id: p.pid, group_id: p.z.groupId, zone: p.z.nombre, category: null,
    status: 'active', seed: null, notes: null, settings: { source: SR_ORIGEN },
    created_at: ahora(), updated_at: ahora(),
  })));
  for (const p of parts) await db.actualizar(`tournament_participants?id=eq.${p.pid}`, { season_entry_id: p.eid });
  await db.insertar('tournament_phase_participants', parts.map((p) => ({
    id: crypto.randomUUID(), tournament_id: tournamentId, season_id: seasonId, phase_id: faseId,
    participant_id: p.pid, group_id: p.z.groupId, status: 'active', seed: null, notes: null,
    created_at: ahora(), updated_at: ahora(),
  })));
  log(`  ✓ creado /tournaments/${tournamentId}`);
  return tournamentId;
}

async function asegurarFaseFinal(db: Rest, torneo: Fila, fases: Fila[], participantes: Fila[], cruces: CruceSR[], log: (l: string) => void): Promise<Fila> {
  const existente = fases.find((f) => f.phase_type === 'playoff');
  if (existente) return existente;
  const porRonda = Object.fromEntries(RONDAS_FINAL.map((r) => [r, cruces.filter((c) => rondaDeCruce(c.instancia) === r).length]));
  const id = crypto.randomUUID();
  log(`  + fase final (${RONDAS_FINAL.map((r) => `${r} ${porRonda[r]}`).join(' · ')})`);
  await db.insertar('tournament_phases', [{
    id, tournament_id: torneo.id, season_id: torneo.current_season_id, name: 'Fase final',
    phase_type: 'playoff', order_index: 2, is_active: false,
    settings: {
      legs: 1, teamsCount: participantes.length, advanceCount: 0, group_names: [], groupTags: [], groupLabels: [],
      pointsSystem: { ...PUNTOS, allowBonusPoints: false }, tiebreakers: TIEBREAKERS,
      standings: { mode: 'automatic', editable: true }, phaseMode: 'playoff', playoffThirdPlace: false,
      playoffStages: RONDAS_FINAL.filter((r) => porRonda[r]).map((r, i) => ({
        id: `playoff_stage_${i + 1}`, name: r, matchCount: porRonda[r], orderIndex: i + 1,
      })),
      source: SR_ORIGEN,
    },
    created_at: ahora(), updated_at: ahora(),
  }]);
  // Todos también en la fase final: sin asignación, un club queda fuera del recálculo.
  await db.insertar('tournament_phase_participants', participantes.map((p) => ({
    id: crypto.randomUUID(), tournament_id: torneo.id, season_id: torneo.current_season_id, phase_id: id,
    participant_id: p.id, group_id: null, status: 'active', seed: null, notes: null,
    created_at: ahora(), updated_at: ahora(),
  })));
  const fase = { id, phase_type: 'playoff', name: 'Fase final' };
  fases.push(fase);
  return fase;
}

async function asegurarRondas(db: Rest, fase: Fila, torneo: Fila, enBase: Fila[], quiero: Map<string, { orden: number; dia: string }>, log: (l: string) => void) {
  const rondas = new Map<string, string>(enBase.filter((r) => r.phase_id === fase.id).map((r) => [r.name, r.id]));
  const nuevas: Fila[] = [];
  for (const [nombre, { orden, dia }] of quiero) {
    if (rondas.has(nombre)) continue;
    const id = crypto.randomUUID();
    rondas.set(nombre, id);
    nuevas.push({
      id, phase_id: fase.id, season_id: torneo.current_season_id, name: nombre, order_index: orden,
      start_date: dia, end_date: dia, is_completed: false, notes: null, created_at: ahora(), updated_at: ahora(),
    });
  }
  if (nuevas.length) log(`  + rondas: ${nuevas.map((r) => r.name).join(', ')}`);
  await db.insertar('tournament_rounds', nuevas);
  return rondas;
}

/* ── Sincronización de un torneo ──────────────────────────────────────────── */

async function sincronizarTorneo(db: Rest, t: TorneoSR, datos: PlanillaSR, escribir: boolean, log: (l: string) => void) {
  const resumen = { nombre: t.nombre, id: null as string | null, nuevos: 0, actualizados: 0, resultados: 0 };
  let [torneo] = await db.leer(`tournaments?select=id,name,current_season_id&slug=eq.${t.slug}`);
  if (!torneo) {
    const id = await crearTorneo(db, t, datos, escribir, log);
    if (!id) { log('  (plan: los partidos de este torneo se ven en la corrida real)'); return resumen; }
    [torneo] = await db.leer(`tournaments?select=id,name,current_season_id&slug=eq.${t.slug}`);
  }
  resumen.id = torneo.id;
  log(`${t.nombre}  /tournaments/${torneo.id}`);

  const fases = await db.leer(`tournament_phases?select=id,name,phase_type&tournament_id=eq.${torneo.id}`);
  const faseGrupos = fases.find((f) => f.phase_type === 'group_stage');
  if (!faseGrupos) throw new Error(`${t.nombre}: no tiene fase de grupos`);
  const grupos = await db.leer(`tournament_groups?select=id,name&phase_id=eq.${faseGrupos.id}`);
  const grupoDe = new Map<string, string>(grupos.map((g) => [g.name, g.id]));
  const participantes = await db.leer(`tournament_participants?select=id,club_id,season_entry_id&tournament_id=eq.${torneo.id}`);
  const entradaDe = new Map<string, string | null>(participantes.map((p) => [p.club_id, p.season_entry_id]));

  const zonasDelTorneo = datos.zonas.filter((x) => x.rama === t.rama && x.competencia === t.competencia);
  const zonaDeEquipo = new Map<string, string>();
  for (const z of zonasDelTorneo) for (const p of z.puestos) zonaDeEquipo.set(clubDe(t.rama, p.equipo), `Zona ${z.zona}`);
  for (const club of zonaDeEquipo.keys()) {
    if (!entradaDe.has(club)) throw new Error(`${t.nombre}: ${club} está en la planilla y no es participante (¿cambió una zona?)`);
  }

  const cruces = new Map(datos.cruces.filter((c) => c.rama === t.rama && c.competencia === t.competencia).map((c) => [c.id, c]));
  const partidos = datos.partidos.filter((p) => p.rama === t.rama && p.competencia === t.competencia);
  const deZona = partidos.filter((p) => !cruces.has(p.id));
  const deCruce = partidos.filter((p) => cruces.has(p.id));

  const faseFinal = await asegurarFaseFinal(db, torneo, fases, participantes, [...cruces.values()], log);
  const rondasEnBase = await db.leer(`tournament_rounds?select=id,name,phase_id&phase_id=in.(${fases.map((f) => f.id).join(',')})`);

  // Fecha de cada partido de zona: por día (Ascenso masc.) o por vuelta de la zona.
  const fechaDe = new Map<string, number>();
  for (const z of zonasDelTorneo) {
    const nombre = `Zona ${z.zona}`;
    const lista = deZona
      .filter((p) => zonaDeEquipo.get(clubDe(t.rama, p.equipo1)) === nombre)
      .sort((a, b) => ordenDe(a).localeCompare(ordenDe(b)));
    const porVuelta = Math.max(1, Math.floor(z.puestos.length / 2));
    lista.forEach((p, i) => fechaDe.set(p.id, t.fechaPorDia ? (p.fecha === '2026-11-28' ? 1 : 2) : Math.floor(i / porVuelta) + 1));
  }
  const quieroGrupo = new Map<string, { orden: number; dia: string }>();
  for (const p of [...deZona].sort((a, b) => ordenDe(a).localeCompare(ordenDe(b)))) {
    const n = fechaDe.get(p.id);
    if (n && !quieroGrupo.has(`Fecha ${n}`)) quieroGrupo.set(`Fecha ${n}`, { orden: n, dia: p.fecha });
  }
  const rondasGrupo = await asegurarRondas(db, faseGrupos, torneo, rondasEnBase, quieroGrupo, log);
  const conCruces = RONDAS_FINAL.filter((r) => [...cruces.values()].some((c) => rondaDeCruce(c.instancia) === r));
  const rondasFinal = await asegurarRondas(db, faseFinal, torneo, rondasEnBase,
    new Map(conCruces.map((r, i) => [r, { orden: i + 1, dia: '2026-11-29' }])), log);

  const enBase = await db.leer(`matches?select=id,external_id,status,score,home_club_id,away_club_id,is_visible,phase_id,date_time,pitch,venue,home_base_points,away_base_points&tournament_id=eq.${torneo.id}`);
  const porExt = new Map(enBase.filter((m) => m.external_id).map((m) => [m.external_id as string, m]));
  const porPar = new Map(enBase.filter((m) => m.phase_id === faseGrupos.id && m.home_club_id && m.away_club_id)
    .map((m) => [[m.home_club_id, m.away_club_id].sort().join('|'), m]));

  const comun = {
    tournament_id: torneo.id, season_id: torneo.current_season_id, sport_id: 'rugby', sport: 'rugby',
    status: 'scheduled', score: null, category: null,
    home_base_points: 0, away_base_points: 0, home_bonus_points: 0, away_bonus_points: 0,
    points_autocalculated: true, live_enabled: false, lineups: { home: [], away: [] },
    events: [], review_status: 'approved',
  };
  const nuevos: Fila[] = [];
  const tocados = new Set<string>();

  for (const p of [...deZona, ...deCruce]) {
    const cruce = cruces.get(p.id);
    // Equipo real: el del partido o el que el cruce ya resolvió; un rótulo no cuenta.
    const nombreLocal = [p.equipo1, cruce?.equipo1].find((n) => n && !esRotulo(n));
    const nombreVisita = [p.equipo2, cruce?.equipo2].find((n) => n && !esRotulo(n));
    let local = nombreLocal ? clubDe(t.rama, nombreLocal) : null;
    let visita = nombreVisita ? clubDe(t.rama, nombreVisita) : null;
    for (const c of [local, visita]) if (c && !entradaDe.has(c)) throw new Error(`${t.nombre} ${p.id}: ${c} no es participante`);
    let marcador = resultadoPublicado(p);
    const cuando = instante(p.fecha, p.hora);
    const cancha = String(p.cancha ?? '');
    const sede = SEDE_DE_CANCHA[cancha] ?? null;

    let m = porExt.get(extId(p));
    if (!m && !cruce && local && visita) m = porPar.get([local, visita].sort().join('|'));

    if (!m) {
      const zona = cruce ? null : zonaDeEquipo.get(local ?? '') ?? null;
      if (!cruce && (!zona || zona !== zonaDeEquipo.get(visita ?? ''))) throw new Error(`${p.id}: ${p.equipo1} y ${p.equipo2} no son de la misma zona`);
      if (!cruce && !grupoDe.get(zona!)) throw new Error(`${t.nombre}: no hay grupo "${zona}" en la base`);
      const ronda = cruce ? rondaDeCruce(cruce.instancia) : `Fecha ${fechaDe.get(p.id)}`;
      const fila: Fila = {
        ...comun, id: crypto.randomUUID(),
        phase_id: cruce ? faseFinal.id : faseGrupos.id,
        group_id: cruce ? null : grupoDe.get(zona!) ?? null,
        round_uuid: cruce ? rondasFinal.get(ronda) : rondasGrupo.get(ronda),
        round_label: cruce ? cruce.instancia : ronda,
        venue: sede, pitch: cancha || null, date_time: cuando,
        home_club_id: local, away_club_id: visita,
        home_season_entry_id: local ? entradaDe.get(local) : null,
        away_season_entry_id: visita ? entradaDe.get(visita) : null,
        is_visible: Boolean(local && visita),
        notes: cruce ? cruce.instancia : zona,
        external_id: extId(p),
        bracket_match_code: cruce ? `P${Number(p.numero)}` : null,
        home_source_label: cruce ? etiquetaDe(cruce.puesto1) : null,
        away_source_label: cruce ? etiquetaDe(cruce.puesto2) : null,
        participant_source: cruce ? { home: origenDe(cruce.puesto1), away: origenDe(cruce.puesto2) } : null,
        created_at: ahora(), updated_at: ahora(),
      };
      if (marcador && local && visita) {
        const [pl, pv] = puntosDe(marcador[0], marcador[1]);
        Object.assign(fila, { status: 'final', score: { home: marcador[0], away: marcador[1] }, home_base_points: pl, away_base_points: pv });
        resumen.resultados += 1;
      }
      log(`  + ${p.id} ${p.fecha.slice(5)} ${p.hora} c${cancha} ${fila.round_label}: ${p.equipo1} v ${p.equipo2}${fila.score ? ` ${fila.score.home}-${fila.score.away}` : ''}`);
      nuevos.push(fila);
      continue;
    }
    tocados.add(m.id);

    const cambios: Fila = {};
    if (m.external_id !== extId(p)) cambios.external_id = extId(p);

    // La base puede tener local y visitante al revés que la planilla: manda la base.
    if (local && visita && m.home_club_id === visita && m.away_club_id === local) {
      [local, visita] = [visita, local];
      if (marcador) marcador = [marcador[1], marcador[0]];
    }
    if (m.status !== 'final') {
      if (new Date(m.date_time).getTime() !== new Date(cuando).getTime()) cambios.date_time = cuando;
      if (cancha && m.pitch !== cancha) cambios.pitch = cancha;
      if (sede && m.venue !== sede) cambios.venue = sede;
      if (cruce) {
        if (local && m.home_club_id !== local) { cambios.home_club_id = local; cambios.home_season_entry_id = entradaDe.get(local); }
        if (visita && m.away_club_id !== visita) { cambios.away_club_id = visita; cambios.away_season_entry_id = entradaDe.get(visita); }
      }
    }
    const casa = cambios.home_club_id ?? m.home_club_id;
    const fuera = cambios.away_club_id ?? m.away_club_id;
    const visible = Boolean(casa && fuera);
    if (m.is_visible !== visible && (cruce || visible)) cambios.is_visible = visible;

    if (marcador && casa && fuera) {
      const [pl, pv] = puntosDe(marcador[0], marcador[1]);
      const igual = m.status === 'final' && m.score?.home === marcador[0] && m.score?.away === marcador[1]
        && m.home_base_points === pl && m.away_base_points === pv;
      if (!igual) {
        Object.assign(cambios, {
          status: 'final', score: { home: marcador[0], away: marcador[1] },
          home_base_points: pl, away_base_points: pv, home_bonus_points: 0, away_bonus_points: 0,
        });
        resumen.resultados += 1;
      }
    }

    if (!Object.keys(cambios).length) continue;
    resumen.actualizados += 1;
    const que = [
      cambios.score ? `${cambios.score.home}-${cambios.score.away}` : null,
      cambios.date_time ? `hora ${p.hora}` : null,
      cambios.pitch ? `cancha ${cancha}` : null,
      cambios.home_club_id || cambios.away_club_id ? 'equipos' : null,
      cambios.is_visible !== undefined ? (cambios.is_visible ? 'visible' : 'oculto') : null,
      cambios.external_id ? 'id' : null,
    ].filter(Boolean).join(', ');
    log(`  ${cambios.score ? '✓' : '~'} ${p.id} ${p.hora} ${p.equipo1} v ${p.equipo2}: ${que}`);
    await db.actualizar(`matches?id=eq.${m.id}`, { ...cambios, updated_at: ahora() });
  }

  await db.insertar('matches', nuevos);
  resumen.nuevos = nuevos.length;

  // Partidos del torneo que la planilla no trae: se avisan, no se borran.
  for (const m of enBase.filter((x) => !tocados.has(x.id))) {
    log(`  ! en la base y no en la planilla: ${m.external_id ?? m.id} ${m.home_club_id ?? '?'} v ${m.away_club_id ?? '?'}`);
  }

  if (resumen.resultados && escribir) {
    const r = await recalculatePhaseStandingsScopes(torneo.id, faseGrupos.id, 'general', torneo.current_season_id);
    if (!r.ok) log('  ! la tabla no se pudo recalcular');
  }
  log(`  ${resumen.nuevos} nuevos · ${resumen.actualizados} actualizados · ${resumen.resultados} resultado(s)`);
  return resumen;
}

/* ── Entrada ──────────────────────────────────────────────────────────────── */

export async function sincronizarSevenRepublica(opciones: OpcionesSR): Promise<ResumenSR> {
  const log = opciones.log ?? (() => {});
  const datos = leerCsvPlanilla(opciones.csv ?? await bajarCsv());
  const conResultado = datos.partidos.filter((p) => resultadoPublicado(p)).length;
  log(`planilla: ${datos.partidos.length} partidos, ${datos.cruces.length} cruces, ${conResultado} con resultado publicado · actualizada ${datos.actualizado ?? '¿?'} · modo ${datos.modo ?? '¿?'}`);
  for (const p of datos.partidos) {
    if (!TORNEOS.some((t) => t.rama === p.rama && t.competencia === p.competencia)) {
      throw new Error(`${p.id}: rama/competencia desconocida ${p.rama}/${p.competencia}`);
    }
  }
  const db = crearRest(opciones.escribir);
  await asegurarClubesFemeninos(db, datos, log);
  const torneos = [];
  for (const t of TORNEOS) torneos.push(await sincronizarTorneo(db, t, datos, opciones.escribir, log));
  return { partidosPlanilla: datos.partidos.length, conResultado, actualizada: datos.actualizado ?? null, torneos };
}
