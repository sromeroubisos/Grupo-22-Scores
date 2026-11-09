/**
 * Rugby Europe (rugbyeurope.eu): U20 Championship 2026, Praga, 8-15 de noviembre.
 * Ocho selecciones en cuadro de eliminación: cuartos, semifinales, final y 3.º
 * puesto, más el cuadro de ranking (5.º al 8.º).
 *
 * La fuente es el sitio de la competencia, que dibuja todo en el servidor (medido
 * el 2026-11-08, sin API ni widget):
 *
 *   /competitions/season-2627/xv-competitions/mens-xv-competitions/u20-championship-2026
 *     tabla "Fixtures" y tabla "Results": hora en UTC (`data-raw-date-utc`),
 *     equipos, marcador del resultado y el vínculo a la ficha.
 *   .../u20-championship-2026/{local}-v-{visitante}/
 *     la ficha: ronda y número de partido ("Quarter Finals, M3"), estadio y el
 *     estado ("Fulltime", o la cuenta regresiva "Kick off").
 *
 * Un cruce todavía sin definir ("Winner M4") NO aparece en las tablas: el partido
 * entra a la base cuando el sitio nombra a los dos equipos. Por eso la identidad
 * es el cruce (`local~visitante`), no el número M.
 *
 * Puro salvo `fetchPagina` y `fetchFicha`.
 */

export const RE_PROVIDER = 'rugbyeurope';
export const RE_ID_PREFIX = 'rugbyeurope:';
export const RE_WEB = 'https://www.rugbyeurope.eu';
export const RE_EDICION = 'u20-championship-2026';
export const RE_PATH = '/competitions/season-2627/xv-competitions/mens-xv-competitions/u20-championship-2026';
export const PREFIJO_NOTA = 'Rugby Europe · ';
const HORAS_PARA_FINAL = 3;

export const urlPagina = () => `${RE_WEB}${RE_PATH}`;
export const buildTournamentExternalId = () => `${RE_ID_PREFIX}${RE_EDICION}`;
export const buildMatchExternalId = (local: string, visitante: string, n: number) =>
  `${RE_ID_PREFIX}${RE_EDICION}:${local}~${visitante}:${n}`;

/** "NETHERLANDS " → `netherlands`. */
export function normalizarNombre(nombre: string): string {
  return nombre.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/['’.]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

// ── Rondas ───────────────────────────────────────────────────────────────────

/** Orden de las rondas del torneo: el `order_index` de `tournament_rounds`. */
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

// ── Lectura ──────────────────────────────────────────────────────────────────

const texto = (html: string) => html
  .replace(/<!--[\s\S]*?-->/g, '')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&amp;/g, '&').replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&nbsp;/g, ' ')
  .replace(/\s+/g, ' ').trim();

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

/** Las filas de las tablas Fixtures y Results de la página de la competencia. */
export function parsePagina(html: string): FilaRe[] {
  const out: FilaRe[] = [];
  const marcas = [...html.matchAll(/data-competition-table="(fixtures|results)"/g)];
  for (const [i, m] of marcas.entries()) {
    const desde = m.index ?? 0;
    const hasta = marcas[i + 1]?.index ?? html.length;
    const bloque = html.slice(desde, hasta);
    const filas = bloque.split(/<tr\b[^>]*data-competition-table-row=/).slice(1);
    for (const fila of filas) {
      const utc = /data-raw-date-utc="([^"]+)"/.exec(fila)?.[1];
      const equipos = [...fila.matchAll(/c-fixtures-table__title__team__inner">([\s\S]*?)<\/span>/g)].map((x) => texto(x[1]));
      if (!utc || equipos.length < 2) continue;
      const inicio = new Date(utc.replace(/(\.\d{3})\d+Z$/, '$1Z'));
      if (Number.isNaN(inicio.getTime())) continue;
      const puntos = [...fila.matchAll(/c-fixtures-table__title__score">\s*(\d{1,3})\s*</g)].map((x) => Number(x[1]));
      out.push({
        tabla: m[1] as 'fixtures' | 'results',
        inicio: inicio.toISOString(),
        local: equipos[0],
        visitante: equipos[1],
        puntosLocal: puntos.length >= 2 ? puntos[0] : null,
        puntosVisitante: puntos.length >= 2 ? puntos[1] : null,
        ficha: /href="([^"]*u20-championship-2026\/[^"]+\/)"/.exec(fila)?.[1] ?? null,
      });
    }
  }
  return out;
}

export interface FichaRe {
  /** "Quarter Finals, M3" tal cual */
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
  const rotulo = /c-match-detail__details__line">\s*((?:Quarter|Semi|Ranking|Final|3rd|Third|5th|7th|Play)[^<]*?,\s*M\d+)\s*</i.exec(html)?.[1]?.trim() ?? null;
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

/** La página de la competencia; `status` -1 = bajó pero no tiene las tablas (¿cambió la forma?). */
export async function fetchPagina(): Promise<{ ok: boolean; status: number; filas: FilaRe[] }> {
  const r = await bajar(urlPagina());
  if (!r.ok) return { ok: false, status: r.status, filas: [] };
  if (!/data-competition-table="/.test(r.html)) return { ok: false, status: -1, filas: [] };
  return { ok: true, status: r.status, filas: parsePagina(r.html) };
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

export function planRe(input: {
  partidos: PartidoRe[];
  resolverEquipo: (nombre: string) => string | null;
  /** clave de ronda → la ronda de la fase */
  rondaDe: (clave: ClaveRonda | null) => { id: string | null; nombre: string };
  existentes: ExistenteRe[];
  ahora: Date;
}): PlanRe {
  const { partidos, resolverEquipo, rondaDe, existentes, ahora } = input;
  const plan: PlanRe = { crear: [], actualizar: [], equiposSinAlias: [], correcciones: [], huerfanos: [], sinCambios: 0 };
  const sinAlias = new Set<string>();
  const porExternal = new Map(existentes.filter((e) => e.external_id).map((e) => [e.external_id as string, e]));
  const vistos = new Set<string>();
  const veces = new Map<string, number>();

  for (const p of [...partidos].sort((a, b) => a.inicio.localeCompare(b.inicio) || a.local.localeCompare(b.local))) {
    const home = resolverEquipo(p.local);
    const away = resolverEquipo(p.visitante);
    if (!home) sinAlias.add(p.local);
    if (!away) sinAlias.add(p.visitante);
    if (!home || !away || home === away) continue;

    const cruce = `${home}~${away}`;
    const n = (veces.get(cruce) ?? 0) + 1;
    veces.set(cruce, n);
    const externalId = buildMatchExternalId(home, away, n);
    vistos.add(externalId);

    const { status, puntos } = estadoDe(p, ahora);
    const ronda = rondaDe(claveDeRonda(p.ficha_datos?.rotulo));
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

    const e = porExternal.get(externalId);
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
    // Sin ficha no se conoce la ronda: no se pisa la guardada.
    if (p.ficha_datos && e.round_label !== deseado.round_label) poner('round_label', 'rótulo de ronda');
    if (deseado.venue && e.venue !== deseado.venue) poner('venue', 'estadio');
    if (p.ficha_datos && (e.notes === null || e.notes.startsWith(PREFIJO_NOTA)) && e.notes !== deseado.notes) poner('notes', 'nota');

    if (cambios.length) plan.actualizar.push({ id: e.id, patch, cambios });
    else plan.sinCambios++;
  }
  plan.equiposSinAlias = [...sinAlias].sort();
  for (const e of existentes) if (e.external_id && !vistos.has(e.external_id)) plan.huerfanos.push(e.external_id);
  return plan;
}
