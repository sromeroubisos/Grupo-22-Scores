/**
 * Super XV (superxv.pt): la primera división de Portugal desde 2026-27, la que
 * reemplaza al Campeonato Nacional de Honra. Doce clubes, todos contra todos
 * en 11 jornadas (octubre → enero).
 *
 * La fuente es el sitio de la liga: un Next.js con Payload CMS que dibuja el
 * calendario en el servidor, una jornada por página:
 *
 *   https://superxv.pt/calendario?epoca=2026-27&competicao=campeonato&jornada=N
 *
 * `robots.txt` deja leer todo menos `/api/`, así que se lee el HTML, no la API
 * del CMS. El JSON-LD (`SportsEvent`) de la página NO sirve: es la tira de
 * próximos partidos de la cabecera, la misma en todas las jornadas. Una
 * jornada que no existe devuelve la 1: el encabezado "Jornada N" es la prueba.
 *
 * Medido el 2026-10-08, antes del primer partido: todavía no se vio cómo se
 * dibuja un resultado. El parser toma dos números en la celda central (donde
 * hoy dice "VS") y lo cuenta como final solo con un estado que no sea "Por
 * jogar"/"Por agendar" o pasadas tres horas del inicio.
 *
 * Puro salvo `fetchJornada`.
 */
import { horaLocalAIso } from '../craa/fuentes.ts';

export const SXV_PROVIDER = 'superxv';
export const SXV_ID_PREFIX = 'superxv:';
export const SXV_WEB = 'https://superxv.pt';
export const SXV_ZONA = 'Europe/Lisbon';
export const SXV_TEMPORADA = '2026-27';
export const SXV_JORNADAS_MAX = 30;
/** Sin horario, el partido se ubica a las 15 de Lisboa. */
export const HORA_POR_DEFECTO = '15:00';
export const PREFIJO_NOTA = 'Super XV · ';
export const NOTA_SIN_HORARIO = 'Horario a confirmar';
export const NOTA_SIN_FECHA = 'Fecha y horario a confirmar';
/** Reglamento FPR, el que usaba la Honra: 4/2/0 y bonus. El ofensivo pide tries, que el sitio no publica. */
export const PUNTOS_SXV = { win: 4, draw: 2, loss: 0 } as const;
export const BONUS_DEFENSIVO_MARGEN = 7;
const HORAS_PARA_FINAL = 3;

export const urlJornada = (jornada: number, temporada = SXV_TEMPORADA) =>
  `${SXV_WEB}/calendario?epoca=${temporada}&competicao=campeonato&jornada=${jornada}`;

export const buildTournamentExternalId = (temporada = SXV_TEMPORADA) => `${SXV_ID_PREFIX}campeonato:${temporada}`;
export const buildMatchExternalId = (temporada: string, local: string, visitante: string, n: number) =>
  `${SXV_ID_PREFIX}${temporada}:${local}~${visitante}:${n}`;

/** "CR São Miguel" → `cr-sao-miguel`. */
export function normalizarNombre(nombre: string): string {
  return nombre.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/['’.]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

// ── Lectura ──────────────────────────────────────────────────────────────────

export interface PartidoSxv {
  jornada: number;
  /** `yyyy-mm-dd`, o null si el día dice "Por confirmar" */
  fecha: string | null;
  /** `HH:MM` de Lisboa, o null */
  hora: string | null;
  local: string;
  visitante: string;
  puntosLocal: number | null;
  puntosVisitante: number | null;
  /** "Por jogar", "Por agendar", … tal cual */
  estado: string;
  cancha: string | null;
}

export interface JornadaSxv {
  jornada: number;
  /** el rango del encabezado ("17 – 18 outubro") */
  desde: string | null;
  hasta: string | null;
  partidos: PartidoSxv[];
}

const MESES: Record<string, number> = {
  jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6, jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12,
};
const mesDe = (s: string | undefined) => (s ? MESES[s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().slice(0, 3)] ?? null : null);

/** La temporada va de agosto a julio: de agosto en adelante es el primer año. */
export function anioDe(mes: number, temporada = SXV_TEMPORADA): number {
  const primero = Number(temporada.slice(0, 4));
  return mes >= 8 ? primero : primero + 1;
}

const iso = (anio: number, mes: number, dia: number) =>
  `${anio}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;

const texto = (html: string) => html
  .replace(/<!--[\s\S]*?-->/g, '')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&amp;/g, '&').replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&nbsp;/g, ' ')
  .replace(/\s+/g, ' ').trim();

/** "Sábado 17 out" → `2026-10-17`; "Por confirmar" → null. */
export function leerDia(encabezado: string, temporada = SXV_TEMPORADA): string | null {
  const m = /(\d{1,2})\s+([A-Za-zçÇ]{3,})/.exec(encabezado);
  const mes = mesDe(m?.[2]);
  if (!m || !mes) return null;
  return iso(anioDe(mes, temporada), mes, Number(m[1]));
}

/** "17 – 18 outubro", "31 outubro – 1 novembro" → el rango; null si no se entiende. */
export function leerRango(s: string, temporada = SXV_TEMPORADA): { desde: string; hasta: string } | null {
  const m = /(\d{1,2})(?:\s+([A-Za-zçÇ]{3,}))?\s*[–-]\s*(\d{1,2})\s+([A-Za-zçÇ]{3,})/.exec(s);
  if (!m) return null;
  const mes2 = mesDe(m[4]);
  if (!mes2) return null;
  const d1 = Number(m[1]);
  const d2 = Number(m[3]);
  let mes1 = mesDe(m[2]) ?? mes2;
  if (!m[2] && d1 > d2) mes1 = mes2 === 1 ? 12 : mes2 - 1;
  return { desde: iso(anioDe(mes1, temporada), mes1, d1), hasta: iso(anioDe(mes2, temporada), mes2, d2) };
}

/**
 * Una página de jornada → sus partidos. `null` si la página no es la jornada
 * pedida (el sitio devuelve la 1 para cualquier número que no existe) o no
 * tiene la forma esperada.
 */
export function parseJornada(html: string, pedida: number, temporada = SXV_TEMPORADA): JornadaSxv | null {
  const cab = /<h2[^>]*>\s*Jornada\s+(\d+)\s*<\/h2>\s*<span[^>]*>([^<]*)<\/span>/.exec(html);
  if (!cab || Number(cab[1]) !== pedida) return null;
  const rango = leerRango(texto(cab[2]), temporada);
  const cuerpo = html.slice(cab.index);

  // Recorrido en orden: encabezados de día (<h3>) y filas de partido (la grilla de escritorio).
  const marcas = [...cuerpo.matchAll(/<h3[^>]*>([\s\S]*?)<\/h3>|fixtures:grid fixtures:grid-cols-/g)];
  const partidos: PartidoSxv[] = [];
  let dia: string | null = null;
  for (const [i, m] of marcas.entries()) {
    if (m[1] !== undefined) { dia = leerDia(texto(m[1]), temporada); continue; }
    const inicio = m.index ?? 0;
    const finFila = cuerpo.indexOf('fixtures:hidden', inicio);
    const siguiente = marcas[i + 1]?.index ?? cuerpo.length;
    const fila = cuerpo.slice(inicio, finFila > 0 && finFila < siguiente ? finFila : siguiente);

    const equipos = [...fila.matchAll(/<span class="type-team[^"]*">([\s\S]*?)<\/span>/g)].map((x) => texto(x[1]));
    if (equipos.length < 2) continue;
    const primera = /<div class="flex flex-col gap-1">\s*<span[^>]*>([\s\S]*?)<\/span>\s*<span[^>]*>([\s\S]*?)<\/span>/.exec(fila);
    const hora = /^(\d{1,2}):(\d{2})$/.exec(texto(primera?.[1] ?? ''));
    const centro = /<div class="font-display text-canvas-dark flex items-center justify-center[^"]*">([\s\S]*?)<\/div>/.exec(fila);
    const marcador = /(\d{1,3})\D+?(\d{1,3})/.exec(texto(centro?.[1] ?? ''));
    const cancha = /<div class="border-divider flex flex-col[^"]*">\s*<span[^>]*>([\s\S]*?)<\/span>/.exec(fila);

    partidos.push({
      jornada: pedida,
      fecha: dia,
      hora: hora ? `${hora[1].padStart(2, '0')}:${hora[2]}` : null,
      local: equipos[0],
      visitante: equipos[1],
      puntosLocal: marcador ? Number(marcador[1]) : null,
      puntosVisitante: marcador ? Number(marcador[2]) : null,
      estado: texto(primera?.[2] ?? ''),
      cancha: texto(cancha?.[1] ?? '') || null,
    });
  }
  return { jornada: pedida, desde: rango?.desde ?? null, hasta: rango?.hasta ?? null, partidos };
}

const CABECERAS = { 'user-agent': 'Mozilla/5.0 (compatible; G22Scores)', accept: 'text/html' };

/** Una jornada; `status` -1 = la página no es esa jornada o cambió de forma. */
export async function fetchJornada(jornada: number, temporada = SXV_TEMPORADA): Promise<{ ok: boolean; status: number; data: JornadaSxv | null }> {
  const control = new AbortController();
  const timer = setTimeout(() => control.abort(), 20_000);
  try {
    const res = await fetch(urlJornada(jornada, temporada), { headers: CABECERAS, cache: 'no-store', signal: control.signal });
    if (!res.ok) return { ok: false, status: res.status, data: null };
    const data = parseJornada(await res.text(), jornada, temporada);
    return data ? { ok: true, status: res.status, data } : { ok: false, status: -1, data: null };
  } catch {
    return { ok: false, status: 0, data: null };
  } finally {
    clearTimeout(timer);
  }
}

// ── Plan de escritura ────────────────────────────────────────────────────────

export type EstadoG22 = 'scheduled' | 'final' | 'postponed' | 'suspended';

export interface ExistenteSxv {
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
  home_base_points: number | null;
  away_base_points: number | null;
  home_bonus_points: number | null;
  away_bonus_points: number | null;
}

export interface FilaPartidoSxv {
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
  points_autocalculated: false;
  home_base_points: number;
  away_base_points: number;
  home_bonus_points: number;
  away_bonus_points: number;
}

export interface PlanSxv {
  crear: FilaPartidoSxv[];
  actualizar: { id: string; patch: Partial<FilaPartidoSxv>; cambios: string[] }[];
  equiposSinAlias: string[];
  /** un tanteo con un estado que no es de final: se ignora hasta que termine */
  enJuego: string[];
  correcciones: string[];
  huerfanos: string[];
  sinCambios: number;
}

export const puntosDeBase = (propios: number, rival: number) =>
  propios > rival ? PUNTOS_SXV.win : propios < rival ? PUNTOS_SXV.loss : PUNTOS_SXV.draw;

/** Solo el defensivo: el ofensivo pide los tries, que el sitio no publica. */
export const bonusDefensivo = (propios: number, rival: number) =>
  (propios < rival && rival - propios <= BONUS_DEFENSIVO_MARGEN ? 1 : 0);

const ESTADO_PENDIENTE = /por\s+(jogar|agendar|confirmar)/i;
const ESTADO_FINAL = /final|terminad|conclu[ií]d|resultado/i;
const ESTADO_ADIADO = /adiad/i;
const ESTADO_CANCELADO = /cancelad|anulad/i;

const mismoInstante = (a: string | null, b: string | null) => {
  if (!a || !b) return a === b;
  return Math.abs(Date.parse(a) - Date.parse(b)) < 60_000;
};

export function planSxv(input: {
  jornadas: JornadaSxv[];
  temporada: string;
  resolverEquipo: (nombre: string) => string | null;
  /** jornada → la ronda de la fase */
  rondaDe: (jornada: number) => { id: string | null; nombre: string };
  existentes: ExistenteSxv[];
  ahora: Date;
}): PlanSxv {
  const { jornadas, temporada, resolverEquipo, rondaDe, existentes, ahora } = input;
  const plan: PlanSxv = { crear: [], actualizar: [], equiposSinAlias: [], enJuego: [], correcciones: [], huerfanos: [], sinCambios: 0 };
  const sinAlias = new Set<string>();
  const porExternal = new Map(existentes.filter((e) => e.external_id).map((e) => [e.external_id as string, e]));
  const vistos = new Set<string>();
  const veces = new Map<string, number>();

  const ordenadas = [...jornadas].sort((a, b) => a.jornada - b.jornada);
  for (const j of ordenadas) {
    for (const p of j.partidos) {
      const home = resolverEquipo(p.local);
      const away = resolverEquipo(p.visitante);
      if (!home) sinAlias.add(p.local);
      if (!away) sinAlias.add(p.visitante);
      if (!home || !away || home === away) continue;

      const cruce = `${home}~${away}`;
      const n = (veces.get(cruce) ?? 0) + 1;
      veces.set(cruce, n);
      const externalId = buildMatchExternalId(temporada, home, away, n);
      vistos.add(externalId);

      // Sin día, el primer día de la jornada; sin eso, nada que ubicar.
      const fecha = p.fecha ?? j.desde;
      if (!fecha) continue;
      const dateTime = horaLocalAIso(fecha, p.hora ?? HORA_POR_DEFECTO, SXV_ZONA) as string;

      const conTanteo = p.puntosLocal !== null && p.puntosVisitante !== null;
      const yaPaso = Date.parse(dateTime) + HORAS_PARA_FINAL * 3_600_000 < ahora.getTime();
      let status: EstadoG22 = 'scheduled';
      if (ESTADO_ADIADO.test(p.estado)) status = 'postponed';
      else if (ESTADO_CANCELADO.test(p.estado)) status = 'suspended';
      else if (conTanteo && (ESTADO_FINAL.test(p.estado) || (!ESTADO_PENDIENTE.test(p.estado) && yaPaso))) status = 'final';
      else if (conTanteo) plan.enJuego.push(`J${j.jornada} ${p.local} ${p.puntosLocal}-${p.puntosVisitante} ${p.visitante} (${p.estado || 'sin estado'})`);

      const score = status === 'final' ? { home: p.puntosLocal as number, away: p.puntosVisitante as number } : null;
      const notaFecha = !p.fecha ? NOTA_SIN_FECHA : !p.hora ? NOTA_SIN_HORARIO : null;
      const ronda = rondaDe(j.jornada);
      const deseado: FilaPartidoSxv = {
        external_id: externalId,
        home_club_id: home,
        away_club_id: away,
        date_time: dateTime,
        status,
        score,
        round_uuid: ronda.id,
        round_label: ronda.nombre,
        venue: p.cancha,
        notes: PREFIJO_NOTA + [`Jornada ${j.jornada}`, notaFecha].filter(Boolean).join(' · '),
        points_autocalculated: false,
        home_base_points: score ? puntosDeBase(score.home, score.away) : 0,
        away_base_points: score ? puntosDeBase(score.away, score.home) : 0,
        home_bonus_points: score ? bonusDefensivo(score.home, score.away) : 0,
        away_bonus_points: score ? bonusDefensivo(score.away, score.home) : 0,
      };

      const e = porExternal.get(externalId);
      if (!e) { plan.crear.push(deseado); continue; }

      const patch: Partial<FilaPartidoSxv> = {};
      const cambios: string[] = [];
      const poner = <K extends keyof FilaPartidoSxv>(k: K, etiqueta: string) => {
        (patch as Record<string, unknown>)[k] = deseado[k];
        cambios.push(etiqueta);
      };
      if (e.status !== status) poner('status', `estado ${e.status} → ${status}`);
      const mismoScore = (e.score === null || score === null) ? e.score === score : e.score.home === score.home && e.score.away === score.away;
      if (!mismoScore) {
        if (e.status === 'final' && e.score && score) plan.correcciones.push(`${p.local} vs ${p.visitante}: estaba ${e.score.home}-${e.score.away}, el sitio publica ${score.home}-${score.away}`);
        poner('score', 'marcador');
      }
      if (Number(e.home_base_points ?? 0) !== deseado.home_base_points || Number(e.away_base_points ?? 0) !== deseado.away_base_points
        || Number(e.home_bonus_points ?? 0) !== deseado.home_bonus_points || Number(e.away_bonus_points ?? 0) !== deseado.away_bonus_points) {
        patch.home_base_points = deseado.home_base_points;
        patch.away_base_points = deseado.away_base_points;
        patch.home_bonus_points = deseado.home_bonus_points;
        patch.away_bonus_points = deseado.away_bonus_points;
        patch.points_autocalculated = false;
        cambios.push('puntos');
      }
      if (!mismoInstante(e.date_time, dateTime)) poner('date_time', `fecha ${e.date_time} → ${dateTime}`);
      if (deseado.round_uuid && e.round_uuid !== deseado.round_uuid) poner('round_uuid', 'ronda');
      if (e.round_label !== deseado.round_label) poner('round_label', 'rótulo de ronda');
      if (deseado.venue && e.venue !== deseado.venue) poner('venue', 'cancha');
      if ((e.notes === null || e.notes.startsWith(PREFIJO_NOTA)) && e.notes !== deseado.notes) poner('notes', 'nota');

      if (cambios.length) plan.actualizar.push({ id: e.id, patch, cambios });
      else plan.sinCambios++;
    }
  }
  plan.equiposSinAlias = [...sinAlias].sort();
  for (const e of existentes) if (e.external_id && !vistos.has(e.external_id)) plan.huerfanos.push(e.external_id);
  return plan;
}
