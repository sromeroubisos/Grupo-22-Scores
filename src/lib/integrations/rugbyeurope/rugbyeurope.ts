/**
 * Rugby Europe (rugbyeurope.eu): parser y plan de escritura, por edición.
 *
 * La fuente es el sitio de cada competición, que dibuja todo en el servidor
 * (medido el 2026-11-08, sin API ni widget):
 *
 *   {ruta de la edición}
 *     tabla "Fixtures" y tabla "Results": hora en UTC (`data-raw-date-utc`),
 *     equipos (con su sigla y escudo), marcador del resultado y el vínculo a la ficha.
 *     Un partido sin fecha ni hora todavía NO trae `data-raw-date-utc`: se saltea
 *     y entra cuando el sitio lo programa.
 *   {ruta}/{local}-v-{visitante}/
 *     la ficha: estadio y estado ("Fulltime", o la cuenta regresiva "Kick off").
 *     En los cuadros de eliminación también la ronda y el número ("Quarter Finals, M3");
 *     en las ligas NO trae ronda.
 *   tablas "c-pools__table": las zonas (Pool A, B…) con la sigla de cada equipo.
 *   tabla "c-league-table": la tabla oficial (la leen las personas; no se escribe).
 *
 * Un cruce todavía sin definir ("Winner M4") NO aparece en las tablas: el partido
 * entra a la base cuando el sitio nombra a los dos equipos. Por eso la identidad
 * es el cruce (`local~visitante`), no el número M.
 *
 * Puro salvo `fetchPagina` y `fetchFicha`.
 */
import { normalizarNombre, type EdicionRe } from './ediciones.ts';

export { normalizarNombre };

export const RE_PROVIDER = 'rugbyeurope';
export const RE_ID_PREFIX = 'rugbyeurope:';
export const RE_WEB = 'https://www.rugbyeurope.eu';
export const PREFIJO_NOTA = 'Rugby Europe · ';
const HORAS_PARA_FINAL = 3;

export const urlPagina = (ed: EdicionRe) => `${RE_WEB}${ed.ruta}`;
export const buildTournamentExternalId = (clave: string) => `${RE_ID_PREFIX}${clave}`;
/** Los partidos de una edición empiezan todos así: sirve para leerlos con un `like`. */
export const prefijoPartidos = (clave: string) => `${RE_ID_PREFIX}${clave}:`;
export const buildMatchExternalId = (clave: string, local: string, visitante: string, n: number) =>
  `${prefijoPartidos(clave)}${local}~${visitante}:${n}`;

// ── Rondas ───────────────────────────────────────────────────────────────────

/** Orden de las rondas de un cuadro: el `order_index` de `tournament_rounds`. */
export const RONDAS = [
  { orden: 1, clave: 'cuartos', nombre: 'Cuartos de final' },
  { orden: 2, clave: 'semis', nombre: 'Semifinales' },
  { orden: 3, clave: 'ranking-semis', nombre: 'Semifinales de ranking' },
  { orden: 4, clave: 'final', nombre: 'Final y 3.º puesto' },
  { orden: 5, clave: 'ranking-final', nombre: 'Ranking: 5.º y 7.º puesto' },
] as const;
export type ClaveRonda = (typeof RONDAS)[number]['clave'];

/** "Quarter Finals, M3" → `cuartos`. null si el rótulo no se entiende. */
export function claveDeRonda(rotulo: string | null | undefined): ClaveRonda | null {
  const s = (rotulo ?? '').toLowerCase();
  if (!s) return null;
  if (/ranking/.test(s) && /semi/.test(s)) return 'ranking-semis';
  if (/ranking|5th|7th|fifth|seventh/.test(s)) return 'ranking-final';
  if (/quarter/.test(s)) return 'cuartos';
  if (/semi/.test(s)) return 'semis';
  if (/final|3rd|third|bronze/.test(s)) return 'final';
  return null;
}

export interface RondaDb {
  id: string;
  name: string;
  order_index: number;
  start_date: string | null;
}

/** El lunes (UTC) de la semana de un instante: la identidad de una fecha de liga. */
export function lunesDe(iso: string): string {
  const d = new Date(iso);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

/** Las semanas con partidos que todavía no tienen su ronda (ordenadas). */
export function semanasNuevas(partidos: { inicio: string }[], rondas: RondaDb[]): string[] {
  const tengo = new Set(rondas.map((r) => r.start_date?.slice(0, 10)).filter(Boolean));
  return [...new Set(partidos.map((p) => lunesDe(p.inicio)))].filter((s) => !tengo.has(s)).sort();
}

/** Cuadro: la ronda sale del rótulo de la ficha. */
export const rondaEliminatoria = (rondas: RondaDb[]) => (clave: ClaveRonda | null): { id: string | null; nombre: string } => {
  const def = RONDAS.find((r) => r.clave === clave);
  const fila = def ? rondas.find((r) => r.order_index === def.orden) : undefined;
  return { id: fila?.id ?? null, nombre: def?.nombre ?? 'Cuadro' };
};

/** Liga y zonas: una fecha es una semana (lunes a domingo), como en el resto de los torneos. */
export const rondaPorSemana = (rondas: RondaDb[]) => (_clave: ClaveRonda | null, p: { inicio: string }): { id: string | null; nombre: string } => {
  const r = rondas.find((x) => x.start_date?.slice(0, 10) === lunesDe(p.inicio));
  return { id: r?.id ?? null, nombre: r?.name ?? 'Fecha' };
};

// ── Lectura ──────────────────────────────────────────────────────────────────

const texto = (html: string) => html
  .replace(/<!--[\s\S]*?-->/g, '')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
  .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&nbsp;/g, ' ')
  .replace(/\s+/g, ' ').trim();

export interface EquipoRe {
  nombre: string;
  /** la sigla de tres letras con la que las zonas nombran al equipo */
  abr: string | null;
  /** el escudo, sin parámetros */
  logo: string | null;
}

export interface FilaRe {
  tabla: 'fixtures' | 'results';
  /** instante UTC ISO */
  inicio: string;
  local: string;
  visitante: string;
  puntosLocal: number | null;
  puntosVisitante: number | null;
  /** ruta de la ficha, sin dominio */
  ficha: string | null;
}

/** Cada fila de las tablas Fixtures y Results, cortada en su `</tr>`. */
function* filasDeTablas(html: string): Generator<{ tabla: 'fixtures' | 'results'; fila: string }> {
  const marcas = [...html.matchAll(/data-competition-table="(fixtures|results)"/g)];
  for (const [i, m] of marcas.entries()) {
    const bloque = html.slice(m.index ?? 0, marcas[i + 1]?.index ?? html.length);
    for (const crudo of bloque.split(/<tr\b[^>]*data-competition-table-row=/).slice(1)) {
      yield { tabla: m[1] as 'fixtures' | 'results', fila: crudo.split('</tr>')[0] };
    }
  }
}

function equiposDeFila(fila: string): EquipoRe[] {
  const nombres = [...fila.matchAll(/c-fixtures-table__title__team__inner">([\s\S]*?)<\/span>/g)].map((x) => texto(x[1]));
  const abrs = [...fila.matchAll(/c-fixtures-table__title__team" data-abbr="([^"]*)"/g)].map((x) => x[1]);
  const logos = [...fila.matchAll(/<img src="([^"]+)"[^>]*c-fixtures-table__image/g)].map((x) => x[1].replace(/&amp;/g, '&').split('?')[0]);
  return nombres.map((nombre, i) => ({ nombre, abr: abrs[i] || null, logo: logos[i] ?? null }));
}

/** Las filas con fecha de las tablas Fixtures y Results de la página de la competición. */
export function parsePagina(html: string): FilaRe[] {
  const out: FilaRe[] = [];
  for (const { tabla, fila } of filasDeTablas(html)) {
    const utc = /data-raw-date-utc="([^"]+)"/.exec(fila)?.[1];
    const equipos = equiposDeFila(fila);
    if (!utc || equipos.length < 2) continue;
    const inicio = new Date(utc.replace(/(\.\d{3})\d+Z$/, '$1Z'));
    if (Number.isNaN(inicio.getTime())) continue;
    const puntos = [...fila.matchAll(/c-fixtures-table__title__score">\s*(\d{1,3})\s*</g)].map((x) => Number(x[1]));
    out.push({
      tabla,
      inicio: inicio.toISOString(),
      local: equipos[0].nombre,
      visitante: equipos[1].nombre,
      puntosLocal: puntos.length >= 2 ? puntos[0] : null,
      puntosVisitante: puntos.length >= 2 ? puntos[1] : null,
      ficha: /href="(\/competitions\/[^"]*\/[^"/]*-v-[^"/]*\/)"/.exec(fila)?.[1] ?? null,
    });
  }
  return out;
}

/** Todos los equipos que nombran las tablas, también los de partidos todavía sin fecha. */
export function parseEquipos(html: string): EquipoRe[] {
  const mapa = new Map<string, EquipoRe>();
  for (const { fila } of filasDeTablas(html)) {
    for (const e of equiposDeFila(fila)) if (!mapa.has(e.nombre)) mapa.set(e.nombre, e);
  }
  return [...mapa.values()];
}

export interface PoolRe {
  nombre: string;
  abrs: string[];
}

/** Las zonas ("Pool A"…) con la sigla de sus equipos, en el orden de la tabla. */
export function parsePools(html: string): PoolRe[] {
  return [...html.matchAll(/<table class="c-pools__table[^"]*">([\s\S]*?)<\/table>/g)].map((t) => {
    const celdas = [...t[1].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)]
      .map((r) => [...r[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)].map((c) => texto(c[1])));
    const [cabecera, ...filas] = celdas;
    return { nombre: cabecera?.[0] ?? '', abrs: filas.map((f) => f[0]).filter(Boolean) };
  }).filter((p) => p.nombre && p.abrs.length);
}

export interface FilaTablaRe {
  /** el nombre del equipo (tabla de liga) o su sigla (zonas) */
  clave: string;
  jugados: number;
  bonus: number;
  puntos: number;
}

/**
 * La tabla oficial del sitio: `c-league-table` (posición, equipo, Pld W D L F A B Pts) en las
 * ligas y `c-pools__table` (sigla, Pld W D L F A B Pts) en las zonas. La B es el bonus TOTAL
 * del equipo, defensivo y ofensivo juntos: el sitio no dice en qué partido lo ganó.
 */
export function parseTablaOficial(html: string): FilaTablaRe[] {
  const tablas = [
    ...[...html.matchAll(/<table class="c-league-table">([\s\S]*?)<\/table>/g)].map((t) => t[1]),
    ...[...html.matchAll(/<table class="c-pools__table[^"]*">([\s\S]*?)<\/table>/g)].map((t) => t[1]),
  ];
  const out: FilaTablaRe[] = [];
  for (const tabla of tablas) {
    for (const fila of tabla.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)) {
      const celdas = [...fila[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)].map((c) => texto(c[1]));
      const resto = celdas.length === 10 ? celdas.slice(2) : celdas.length === 9 ? celdas.slice(1) : null;
      if (!resto) continue;
      const n = resto.map(Number);
      if (n.some((x) => !Number.isFinite(x))) continue; // la cabecera ("Pld", "W"…)
      out.push({ clave: celdas.length === 10 ? celdas[1] : celdas[0], jugados: n[0], bonus: n[6], puntos: n[7] });
    }
  }
  return out;
}

/** Club → bonus total oficial. La sigla de las zonas se traduce al nombre con las filas de partidos. */
export function bonosDeTabla(html: string, resolverEquipo: (nombre: string) => string | null): Map<string, number> {
  const nombrePorAbr = new Map(parseEquipos(html).filter((e) => e.abr).map((e) => [e.abr as string, e.nombre]));
  const out = new Map<string, number>();
  for (const f of parseTablaOficial(html)) {
    const club = resolverEquipo(nombrePorAbr.get(f.clave) ?? f.clave);
    if (club) out.set(club, f.bonus);
  }
  return out;
}

/**
 * La tabla oficial da el bonus TOTAL por equipo; los marcadores solo permiten deducir el
 * defensivo. Lo que falta es el ofensivo (4 tries o más): se le suma a los partidos en los
 * que el equipo más tantos hizo, de a uno por partido. Los totales cierran con la oficial;
 * en qué partido cae cada bonus es una inferencia (no hay tries por partido).
 */
export function repartirBonusOfensivo(filas: FilaPartidoRe[], partidos: PartidoRe[], oficial: Map<string, number>): void {
  const idx = filas.map((f, i) => i).filter((i) => filas[i].status === 'final' && filas[i].score);
  const clubes = [...new Set(idx.flatMap((i) => [filas[i].home_club_id, filas[i].away_club_id]))].sort();
  for (const club of clubes) {
    const total = oficial.get(club);
    if (total === undefined) continue;
    const suyos = idx.filter((i) => filas[i].home_club_id === club || filas[i].away_club_id === club);
    const esLocal = (i: number) => filas[i].home_club_id === club;
    const propio = (i: number) => (esLocal(i) ? filas[i].score?.home ?? 0 : filas[i].score?.away ?? 0);
    const defensivo = suyos.reduce((s, i) => s + ((esLocal(i) ? filas[i].home_bonus_points : filas[i].away_bonus_points) ?? 0), 0);
    let faltan = total - defensivo;
    if (faltan <= 0) continue;
    const orden = [...suyos].sort((a, b) => propio(b) - propio(a) || partidos[a].inicio.localeCompare(partidos[b].inicio));
    for (const i of orden) {
      if (faltan <= 0) break;
      if (esLocal(i)) filas[i].home_bonus_points = (filas[i].home_bonus_points ?? 0) + 1;
      else filas[i].away_bonus_points = (filas[i].away_bonus_points ?? 0) + 1;
      faltan--;
    }
  }
}

export interface FichaRe {
  /** "Quarter Finals, M3" tal cual (solo en los cuadros) */
  rotulo: string | null;
  /** el número del partido en el cuadro ("M3" → 3) */
  numero: number | null;
  estadio: string | null;
  /** "Fulltime", "Half time", …: el título del banner; null mientras es la cuenta regresiva */
  estadoTexto: string | null;
  cuentaRegresiva: boolean;
  puntosLocal: number | null;
  puntosVisitante: number | null;
}

export function parseFicha(html: string): FichaRe {
  // "Quarter Finals, M4" lleva el número; "Semi Finals" a secas, no (medido en el U18).
  const rotulo = /c-match-detail__details__line">\s*((?:Quarter|Semi|Ranking|Final|3rd|Third|5th|7th|Play[ -]?off)[^<]*?)\s*</i.exec(html)?.[1]?.trim() || null;
  const estadoTexto = /c-match-banner__fulltime-title">([^<]*)</.exec(html)?.[1]?.trim() || null;
  const local = /data-match-banner-score-home>\s*(\d{1,3})\s*</.exec(html)?.[1];
  const visita = /data-match-banner-score-away>\s*(\d{1,3})\s*</.exec(html)?.[1];
  return {
    rotulo,
    numero: rotulo ? Number(/M(\d+)\s*$/.exec(rotulo)?.[1]) || null : null,
    estadio: texto(/c-match-banner__venue">([\s\S]*?)<\/p>/.exec(html)?.[1] ?? '') || null,
    estadoTexto,
    cuentaRegresiva: /c-match-banner__countdown/.test(html),
    puntosLocal: local !== undefined && visita !== undefined ? Number(local) : null,
    puntosVisitante: local !== undefined && visita !== undefined ? Number(visita) : null,
  };
}

const CABECERAS = { 'user-agent': 'Mozilla/5.0 (compatible; G22Scores)', accept: 'text/html' };

async function bajar(url: string): Promise<{ ok: boolean; status: number; html: string }> {
  const control = new AbortController();
  const timer = setTimeout(() => control.abort(), 20_000);
  try {
    const res = await fetch(url, { headers: CABECERAS, cache: 'no-store', signal: control.signal });
    return { ok: res.ok, status: res.status, html: res.ok ? await res.text() : '' };
  } catch {
    return { ok: false, status: 0, html: '' };
  } finally {
    clearTimeout(timer);
  }
}

/** La página de la competición; `status` -1 = bajó pero no tiene las tablas (¿cambió la forma?). */
export async function fetchPagina(ed: EdicionRe): Promise<{ ok: boolean; status: number; filas: FilaRe[]; html: string }> {
  const r = await bajar(urlPagina(ed));
  if (!r.ok) return { ok: false, status: r.status, filas: [], html: '' };
  if (!/data-competition-table="/.test(r.html)) return { ok: false, status: -1, filas: [], html: '' };
  return { ok: true, status: r.status, filas: parsePagina(r.html), html: r.html };
}

export async function fetchFicha(ruta: string): Promise<{ ok: boolean; status: number; ficha: FichaRe | null }> {
  const r = await bajar(ruta.startsWith('http') ? ruta : `${RE_WEB}${ruta}`);
  return { ok: r.ok, status: r.status, ficha: r.ok ? parseFicha(r.html) : null };
}

// ── Plan de escritura ────────────────────────────────────────────────────────

export type EstadoG22 = 'scheduled' | 'live' | 'final';

export interface PartidoRe extends FilaRe {
  ficha_datos: FichaRe | null;
}

export interface ExistenteRe {
  id: string;
  external_id: string | null;
  home_club_id: string | null;
  away_club_id: string | null;
  date_time: string | null;
  status: string | null;
  score: { home: number; away: number } | null;
  round_uuid: string | null;
  round_label: string | null;
  venue: string | null;
  notes: string | null;
  group_id?: string | null;
  home_base_points?: number | null;
  away_base_points?: number | null;
  home_bonus_points?: number | null;
  away_bonus_points?: number | null;
  points_autocalculated?: boolean | null;
}

export interface FilaPartidoRe {
  external_id: string;
  home_club_id: string;
  away_club_id: string;
  date_time: string;
  status: EstadoG22;
  score: { home: number; away: number } | null;
  round_uuid: string | null;
  round_label: string;
  venue: string | null;
  notes: string;
  /** solo en las zonas */
  group_id?: string | null;
  /** solo en ligas y zonas: los puntos de tabla (4/2/0) y el bonus defensivo */
  home_base_points?: number;
  away_base_points?: number;
  home_bonus_points?: number;
  away_bonus_points?: number;
  /** false: el motor usa estos puntos y no los recalcula con el marcador (así no pisa el bonus ofensivo) */
  points_autocalculated?: false;
}

export interface PlanRe {
  crear: FilaPartidoRe[];
  actualizar: { id: string; patch: Partial<FilaPartidoRe>; cambios: string[] }[];
  equiposSinAlias: string[];
  correcciones: string[];
  huerfanos: string[];
  sinCambios: number;
}

const mismoInstante = (a: string | null, b: string | null) => {
  if (!a || !b) return a === b;
  return Math.abs(Date.parse(a) - Date.parse(b)) < 60_000;
};

/** 4 por ganar, 2 por empatar, 0 por perder: la tabla de Rugby Europe. */
export const puntosDeBase = (propios: number, rival: number) => (propios > rival ? 4 : propios < rival ? 0 : 2);

/**
 * Solo el defensivo (perder por 7 o menos). El ofensivo pide los tries, que el
 * sitio no publica por partido: la tabla oficial lo suma por equipo y la nuestra
 * puede quedar por debajo en ese punto.
 */
export const bonusDefensivo = (propios: number, rival: number) => (propios < rival && rival - propios <= 7 ? 1 : 0);

/**
 * El estado sale, en este orden, de: la tabla Results (final), la ficha ("Fulltime"
 * = final; otro título con marcador = en juego) y la hora (una ficha sin novedad
 * queda programada: no se inventa un final).
 */
export function estadoDe(p: PartidoRe, ahora: Date): { status: EstadoG22; puntos: { home: number; away: number } | null } {
  const f = p.ficha_datos;
  if (p.tabla === 'results' && p.puntosLocal !== null && p.puntosVisitante !== null) {
    return { status: 'final', puntos: { home: p.puntosLocal, away: p.puntosVisitante } };
  }
  if (f && f.puntosLocal !== null && f.puntosVisitante !== null && f.estadoTexto) {
    const puntos = { home: f.puntosLocal, away: f.puntosVisitante };
    if (/full\s*-?\s*time|final/i.test(f.estadoTexto)) return { status: 'final', puntos };
    const arranco = Date.parse(p.inicio) <= ahora.getTime();
    const dentroDeVentana = Date.parse(p.inicio) + HORAS_PARA_FINAL * 3_600_000 > ahora.getTime();
    if (arranco && dentroDeVentana) return { status: 'live', puntos };
  }
  return { status: 'scheduled', puntos: null };
}

/**
 * ¿Vale la pena bajar la ficha de este partido? Es una página por partido, así que
 * se pide solo lo que puede traer algo nuevo:
 *  - un resultado ya cerrado y guardado, no (en un cuadro, hasta tener ronda y estadio);
 *  - un partido en curso o por empezar, sí: ahí vive el estado en vivo;
 *  - en un cuadro, siempre: la ronda sale de la ficha;
 *  - en una liga, una sola vez al darlo de alta (estadio) y, mientras falte el estadio,
 *    para los próximos siete días.
 */
export function necesitaFicha(p: FilaRe, edicion: EdicionRe, existente: ExistenteRe | undefined, ahora: Date): boolean {
  const t = Date.parse(p.inicio);
  const ahoraMs = ahora.getTime();
  const mismoMarcador = !!existente?.score && existente.score.home === p.puntosLocal && existente.score.away === p.puntosVisitante;
  const cerrado = p.tabla === 'results' && existente?.status === 'final' && mismoMarcador
    && (edicion.formato !== 'eliminatoria' || (!!existente.venue && !!existente.round_uuid));
  if (cerrado) return false;
  if (t <= ahoraMs + 30 * 60_000 && t + HORAS_PARA_FINAL * 3_600_000 > ahoraMs) return true;
  if (edicion.formato === 'eliminatoria') return true;
  if (!existente) return Math.abs(t - ahoraMs) < 14 * 86_400_000;
  if (existente.venue) return false;
  return t > ahoraMs && t - ahoraMs < 7 * 86_400_000;
}

export function planRe(input: {
  edicion: EdicionRe;
  partidos: PartidoRe[];
  resolverEquipo: (nombre: string) => string | null;
  /** clave de ronda (solo cuadros) y partido → la ronda de la fase */
  rondaDe: (clave: ClaveRonda | null, p: PartidoRe) => { id: string | null; nombre: string };
  /** la zona de los dos clubes (solo zonas): null si no juegan la misma */
  grupoDe?: (home: string, away: string) => string | null;
  /** club → bonus total de la tabla oficial (ligas y zonas): de ahí sale el ofensivo */
  bonosOficiales?: Map<string, number>;
  existentes: ExistenteRe[];
  ahora: Date;
}): PlanRe {
  const { edicion, partidos, resolverEquipo, rondaDe, grupoDe, bonosOficiales, existentes, ahora } = input;
  const eliminatoria = edicion.formato === 'eliminatoria';
  const plan: PlanRe = { crear: [], actualizar: [], equiposSinAlias: [], correcciones: [], huerfanos: [], sinCambios: 0 };
  const sinAlias = new Set<string>();
  const porExternal = new Map(existentes.filter((e) => e.external_id).map((e) => [e.external_id as string, e]));
  const vistos = new Set<string>();
  const veces = new Map<string, number>();

  // Primera pasada: lo que DEBERÍA haber guardado de cada partido.
  const items: { p: PartidoRe; deseado: FilaPartidoRe }[] = [];
  for (const p of [...partidos].sort((a, b) => a.inicio.localeCompare(b.inicio) || a.local.localeCompare(b.local))) {
    const home = resolverEquipo(p.local);
    const away = resolverEquipo(p.visitante);
    if (!home) sinAlias.add(p.local);
    if (!away) sinAlias.add(p.visitante);
    if (!home || !away || home === away) continue;

    const cruce = `${home}~${away}`;
    const n = (veces.get(cruce) ?? 0) + 1;
    veces.set(cruce, n);
    const externalId = buildMatchExternalId(edicion.clave, home, away, n);
    vistos.add(externalId);

    const { status, puntos } = estadoDe(p, ahora);
    const ronda = rondaDe(claveDeRonda(p.ficha_datos?.rotulo), p);
    const numero = p.ficha_datos?.numero ?? null;
    const deseado: FilaPartidoRe = {
      external_id: externalId,
      home_club_id: home,
      away_club_id: away,
      date_time: p.inicio,
      status,
      score: puntos,
      round_uuid: ronda.id,
      round_label: ronda.nombre,
      venue: p.ficha_datos?.estadio ?? null,
      notes: PREFIJO_NOTA + [ronda.nombre, numero ? `M${numero}` : null].filter(Boolean).join(' · '),
    };
    if (!eliminatoria) {
      const cerrado = status === 'final' && puntos;
      deseado.home_base_points = cerrado ? puntosDeBase(puntos.home, puntos.away) : 0;
      deseado.away_base_points = cerrado ? puntosDeBase(puntos.away, puntos.home) : 0;
      deseado.home_bonus_points = cerrado ? bonusDefensivo(puntos.home, puntos.away) : 0;
      deseado.away_bonus_points = cerrado ? bonusDefensivo(puntos.away, puntos.home) : 0;
      deseado.points_autocalculated = false;
    }
    if (grupoDe) deseado.group_id = grupoDe(home, away);
    items.push({ p, deseado });
  }
  if (!eliminatoria && bonosOficiales?.size) repartirBonusOfensivo(items.map((i) => i.deseado), items.map((i) => i.p), bonosOficiales);

  // Segunda pasada: contra lo guardado.
  for (const { p, deseado } of items) {
    const { status, score: puntos } = deseado;
    const e = porExternal.get(deseado.external_id);
    if (!e) { plan.crear.push(deseado); continue; }

    const patch: Partial<FilaPartidoRe> = {};
    const cambios: string[] = [];
    const poner = <K extends keyof FilaPartidoRe>(k: K, etiqueta: string) => {
      (patch as Record<string, unknown>)[k] = deseado[k];
      cambios.push(etiqueta);
    };
    if (e.status !== status) poner('status', `estado ${e.status} → ${status}`);
    const mismoScore = (e.score === null || puntos === null) ? e.score === puntos : e.score.home === puntos.home && e.score.away === puntos.away;
    if (!mismoScore) {
      if (e.status === 'final' && e.score && puntos) plan.correcciones.push(`${p.local} vs ${p.visitante}: estaba ${e.score.home}-${e.score.away}, el sitio publica ${puntos.home}-${puntos.away}`);
      poner('score', 'marcador');
    }
    if (!mismoInstante(e.date_time, p.inicio)) poner('date_time', `fecha ${e.date_time} → ${p.inicio}`);
    if (deseado.round_uuid && e.round_uuid !== deseado.round_uuid) poner('round_uuid', 'ronda');
    // En un cuadro la ronda sale de la ficha: sin ficha no se conoce y no se pisa la guardada.
    const rondaConocida = !eliminatoria || !!p.ficha_datos;
    if (rondaConocida && e.round_label !== deseado.round_label) poner('round_label', 'rótulo de ronda');
    if (deseado.venue && e.venue !== deseado.venue) poner('venue', 'estadio');
    if (rondaConocida && (e.notes === null || e.notes.startsWith(PREFIJO_NOTA)) && e.notes !== deseado.notes) poner('notes', 'nota');
    if (!eliminatoria && (
      Number(e.home_base_points ?? 0) !== deseado.home_base_points || Number(e.away_base_points ?? 0) !== deseado.away_base_points
      || Number(e.home_bonus_points ?? 0) !== deseado.home_bonus_points || Number(e.away_bonus_points ?? 0) !== deseado.away_bonus_points
      || e.points_autocalculated !== false
    )) {
      patch.points_autocalculated = false;
      patch.home_base_points = deseado.home_base_points;
      patch.away_base_points = deseado.away_base_points;
      patch.home_bonus_points = deseado.home_bonus_points;
      patch.away_bonus_points = deseado.away_bonus_points;
      cambios.push('puntos de tabla');
    }
    if (grupoDe && deseado.group_id && e.group_id !== deseado.group_id) poner('group_id', 'zona');

    if (cambios.length) plan.actualizar.push({ id: e.id, patch, cambios });
    else plan.sinCambios++;
  }
  plan.equiposSinAlias = [...sinAlias].sort();
  for (const e of existentes) if (e.external_id && !vistos.has(e.external_id)) plan.huerfanos.push(e.external_id);
  return plan;
}
