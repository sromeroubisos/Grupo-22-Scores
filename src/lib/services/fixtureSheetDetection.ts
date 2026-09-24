/**
 * Reconocimiento automático de una planilla de fixture.
 *
 * El importador leía la primera hoja con `sheet_to_json`, que da por hecho que
 * la fila 1 son los encabezados, y mapeaba una columna sólo si su título era
 * IGUAL a un alias. Las planillas reales de las uniones no son así:
 *
 *   - arriba hay un título («Torneo Regional 2026 — Fixture») y una fila vacía;
 *   - la jornada no es una columna sino una fila suelta («FECHA 3») que vale
 *     para los partidos de abajo;
 *   - «Fecha» a veces es el día y a veces el número de jornada;
 *   - el partido viene en una sola celda («Tala vs Jockey»);
 *   - hay una hoja por fecha, todas con la misma plantilla.
 *
 * Este módulo resuelve eso mirando el CONTENIDO además del título, y devuelve
 * filas planas con los mismos encabezados que ve el usuario, para que el mapeo
 * manual del asistente siga funcionando igual que antes.
 *
 * Puro: recibe la grilla de celdas (`sheet_to_json({ header: 1, raw: true })`)
 * y no sabe nada de SheetJS, Supabase ni React.
 */
import type {
  FixtureColumnMapping,
  FixtureColumnSuggestion,
  FixtureImportConfidence,
} from '../types/fixture-import.ts';
import {
  extractGroupLabel,
  extractRoundLabel,
  normalizeDateToken,
  normalizeTimeToken,
  parseFixtureText,
  type ParsedFixtureText,
} from './fixtureLineParser.ts';

export type SheetCell = string | number | boolean | Date | null | undefined;
export type SheetGrid = SheetCell[][];

type FieldKey = keyof FixtureColumnMapping;

/**
 * Títulos que se reconocen por campo, ya normalizados (sin tildes, minúscula,
 * `N°` → `n`). El título exacto pesa más que el que sólo contiene el alias.
 */
const HEADER_ALIASES: Record<FieldKey, string[]> = {
  // Castellano, inglés y portugués: las planillas de torneos sudamericanos y de
  // World Rugby llegan en cualquiera de los tres.
  home_team: ['local', 'equipo local', 'club local', 'home', 'home team', 'hosts', 'host', 'club a', 'equipo a', 'equipo 1', 'team a', 'team 1', 'anfitrion', 'locatario', 'mandante', 'time da casa'],
  away_team: ['visitante', 'equipo visitante', 'club visitante', 'away', 'away team', 'visitor', 'visitors', 'guest', 'guests', 'club b', 'equipo b', 'equipo 2', 'team b', 'team 2', 'visita', 'visitantes'],
  match_date: ['fecha', 'fecha partido', 'fecha del partido', 'fecha de juego', 'dia', 'date', 'fecha y hora', 'match date', 'data', 'dia del partido', 'fecha hora'],
  match_time: ['hora', 'horario', 'hs', 'hora local', 'kickoff', 'kick off', 'ko', 'time', 'inicio', 'hora inicio', 'hora de inicio', 'horario de inicio', 'hour', 'horas'],
  venue: ['cancha', 'sede', 'estadio', 'venue', 'field', 'ground', 'stadium', 'lugar', 'club sede', 'campo'],
  round: ['jornada', 'fecha n', 'fecha nro', 'fecha no', 'nro fecha', 'n fecha', 'numero de fecha', 'n de fecha', 'round', 'ronda', 'matchday', 'semana', 'rodada', 'week', 'gameweek', 'gw', 'rd'],
  group: ['zona', 'grupo', 'pool', 'group', 'conferencia', 'serie'],
  phase: ['fase', 'etapa', 'instancia', 'stage', 'phase'],
  competition_name: ['torneo', 'competencia', 'competition', 'campeonato'],
  category: ['categoria', 'division', 'category', 'plantel'],
  status: ['estado', 'status', 'situacion'],
  score: ['resultado', 'score', 'marcador', 'tanteador'],
  score_home: ['goles local', 'puntos local', 'local score', 'tantos local', 'pts local'],
  score_away: ['goles visitante', 'puntos visitante', 'away score', 'tantos visitante', 'pts visitante'],
  match_number: ['partido n', 'n partido', 'nro partido', 'partido nro', 'numero de partido', 'partido', 'match', 'match no', 'nro', 'n', 'id', 'cod', 'codigo'],
};

/**
 * Títulos ambiguos: nombran el campo sólo si el contenido lo confirma. «Fecha»
 * en el rugby argentino es tanto el día como la jornada; con puntaje 0.5 no
 * alcanza el umbral por sí solo, y con números de jornada adentro sí.
 */
const WEAK_ALIASES: Partial<Record<FieldKey, string[]>> = {
  round: ['fecha'],
};

/**
 * Títulos que dicen «un equipo» sin decir cuál: «Equipo | Equipo», «Club |
 * Club», «Teams». Cuando la hoja no tiene «Local» y «Visitante», la primera de
 * estas columnas es el local y la segunda el visitante — el orden de lectura es
 * la convención universal del fixture.
 */
const GENERIC_TEAM_ALIASES = new Set(['equipo', 'equipos', 'club', 'clubes', 'clubs', 'team', 'teams', 'equipe', 'equipes', 'institucion', 'seleccion']);

/** Encabezados sintéticos: columnas que no existen en la hoja pero salen de ella. */
export const SYNTHETIC_HEADERS = {
  home: 'Local (de «Partido»)',
  away: 'Visitante (de «Partido»)',
  round: 'Jornada (fila de sección)',
  group: 'Zona (fila de sección)',
  date: 'Fecha (fila de sección)',
  phase: 'Fase (fila de sección)',
  sheetRound: 'Jornada (nombre de la hoja)',
  sheetGroup: 'Zona (nombre de la hoja)',
  sheetPhase: 'Fase (nombre de la hoja)',
  matrixHome: 'Local (fila de la tabla)',
  matrixAway: 'Visitante (columna de la tabla)',
  matrixDate: 'Fecha (celda de la tabla)',
  matrixTime: 'Hora (celda de la tabla)',
  matrixRound: 'Jornada (celda de la tabla)',
} as const;

const HEADER_SCAN_ROWS = 20;
const CONTENT_SAMPLE = 40;

export function normalizeKey(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[°º]/g, '')
    .replace(/#/g, ' n ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function cellText(value: SheetCell): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? '' : value.toISOString();
  return String(value).trim();
}

const pad = (value: number) => String(value).padStart(2, '0');

/**
 * Serie de Excel redondeada al minuto y pegada a la medianoche si le falta o le
 * sobra muy poco. Las planillas que genera un script (o SheetJS con la zona de
 * Buenos Aires) traen la medianoche como 46283.99944: 48 segundos de menos por
 * el offset histórico de 1900. Sin esto, el 19/9 se lee 18/9 a las 23:59.
 */
const MIDNIGHT_SNAP = 2 / 1440;
const toMinuteSerial = (value: number) => {
  // El mismo desvío corre la hora: 15:30 llega como 15:29:12. Un partido
  // arranca en múltiplos de 5 minutos, así que a menos de un minuto de uno se
  // pega a ese; si no, al minuto más cercano.
  const seconds = value * 86400;
  const fiveMinutes = Math.round(seconds / 300) * 300;
  const snapped = Math.abs(seconds - fiveMinutes) <= 60 ? fiveMinutes / 86400 : Math.round(value * 1440) / 1440;
  const fraction = snapped - Math.floor(snapped);
  if (fraction > 1 - MIDNIGHT_SNAP) return Math.ceil(snapped);
  if (fraction < MIDNIGHT_SNAP) return Math.floor(snapped);
  return snapped;
};

// ─── Celdas: fecha, hora, partido ─────────────────────────────────────────

/**
 * Fecha de una celda, en ISO. Con `raw: true` SheetJS entrega la fecha de
 * Excel como número de serie (46100 = 19/03/2026), así que se decodifica acá y
 * no se depende del formato regional con que se guardó la planilla — leer el
 * texto formateado daba `3/19/26` en un Excel en inglés, y leído día primero
 * era el mes 19.
 */
export function cellToDate(value: SheetCell, fallbackYear?: number): string | null {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
  }
  if (typeof value === 'number') {
    // Serie de Excel. Por debajo de 1950 (18264) no es un fixture: es un
    // número de jornada o de partido.
    if (!Number.isFinite(value) || value < 18264 || value > 73051) return null;
    // 25569 = serie del 1/1/1970, con el 29/2/1900 fantasma de Excel incluido.
    const date = new Date((Math.floor(toMinuteSerial(value)) - 25569) * 86400000);
    return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
  }
  const raw = cellText(value);
  if (!raw) return null;
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  return normalizeDateToken(raw, fallbackYear);
}

/**
 * Hora de una celda, `HH:mm`.
 *
 * `allowDateTime`: si la celda es una fecha CON hora (serie con decimales,
 * «19/09/2026 16:30»), devuelve la parte de la hora. Sin el flag, un número
 * mayor a 1 no es una hora: es una fecha o un número de jornada.
 */
export function cellToTime(value: SheetCell, options: { allowDateTime?: boolean } = {}): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const serial = toMinuteSerial(value);
    let fraction: number;
    if (serial >= 0 && serial < 1) fraction = serial;
    else if (options.allowDateTime && serial >= 1) fraction = serial - Math.floor(serial);
    else return null;
    const totalMinutes = Math.round(fraction * 1440);
    // Medianoche dentro de una fecha es «sin hora», no las 00:00.
    if (totalMinutes === 0 && serial >= 1) return null;
    return `${pad(Math.floor(totalMinutes / 60) % 24)}:${pad(totalMinutes % 60)}`;
  }
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime()) || !options.allowDateTime) return null;
    const hour = value.getHours();
    const minute = value.getMinutes();
    return hour === 0 && minute === 0 ? null : `${pad(hour)}:${pad(minute)}`;
  }

  const raw = cellText(value);
  if (!raw) return null;

  if (options.allowDateTime) {
    // Dentro de una fecha sólo cuenta una hora con dos puntos: `19.09` es el
    // día, no las 19:09.
    const inside = raw.match(/\b(\d{1,2}):(\d{2})\b/);
    return inside ? toClock(Number(inside[1]), Number(inside[2]), raw) : null;
  }

  // Una celda que es una fecha no es una hora.
  if (/\d{1,2}[/-]\d{1,2}/.test(raw)) return null;

  const meridiem = raw.match(/^(\d{1,2})(?:[:.](\d{2}))?\s*([ap])\.?\s*m\.?$/i);
  if (meridiem) {
    let hour = Number(meridiem[1]) % 12;
    if (meridiem[3].toLowerCase() === 'p') hour += 12;
    return toClock(hour, Number(meridiem[2] || 0), '');
  }

  return normalizeTimeToken(raw);
}

function toClock(hour: number, minute: number, raw: string): string | null {
  let h = hour;
  if (/\bp\.?\s*m\b/i.test(raw) && h < 12) h += 12;
  if (h > 23 || minute > 59) return null;
  return `${pad(h)}:${pad(minute)}`;
}

const MATCHUP_SPLIT_RE = /\s+(?:vs\.?|v\.?|versus|contra|x)\s+/i;

/**
 * Parte «Tala vs Jockey» en local y visitante. El guion sólo cuenta si los dos
 * lados tienen letras: `24 - 17` es un resultado, no un partido.
 */
export function splitMatchup(value: SheetCell): { home: string; away: string } | null {
  const raw = cellText(value);
  if (!raw) return null;
  let parts = raw.split(MATCHUP_SPLIT_RE);
  if (parts.length !== 2) parts = raw.split(/\s+[-–—]\s+/);
  if (parts.length !== 2) return null;
  const [home, away] = parts.map((part) => part.trim());
  if (!/[a-záéíóúñ]/i.test(home) || !/[a-záéíóúñ]/i.test(away)) return null;
  return { home, away };
}

// ─── Encabezados ──────────────────────────────────────────────────────────

/** Qué tan bien un título nombra un campo: 1 exacto, 0.8 lo contiene, 0 nada. */
function headerScore(header: string, field: FieldKey): number {
  const key = normalizeKey(header);
  if (!key) return 0;
  let best = 0;
  for (const alias of HEADER_ALIASES[field]) {
    if (key === alias) return 1;
    // «Contiene» sólo con palabras enteras y alias de más de dos letras: sin
    // eso «n» (número) aparecería en cualquier título.
    if (alias.length > 2 && ` ${key} `.includes(` ${alias} `)) best = Math.max(best, 0.8);
  }
  if (!best && WEAK_ALIASES[field]?.includes(key)) best = 0.5;
  return best;
}

function bestFieldForHeader(header: string): { field: FieldKey; score: number } | null {
  let best: { field: FieldKey; score: number } | null = null;
  for (const field of Object.keys(HEADER_ALIASES) as FieldKey[]) {
    const score = headerScore(header, field);
    if (score > (best?.score ?? 0)) best = { field, score };
  }
  return best;
}

/**
 * Cuál de las primeras filas es la de encabezados: la que nombra más campos
 * distintos. Hacen falta al menos dos (con uno solo, «FIXTURE» en una celda
 * sería un encabezado). Sin candidata, la primera fila con algo — lo que se
 * hacía antes.
 */
export function detectHeaderRow(grid: SheetGrid): number {
  let bestRow = -1;
  let bestCount = 1;
  const limit = Math.min(grid.length, HEADER_SCAN_ROWS);
  for (let index = 0; index < limit; index += 1) {
    const fields = new Set<FieldKey>();
    for (const cell of grid[index] ?? []) {
      if (typeof cell !== 'string') continue;
      const hit = bestFieldForHeader(cell);
      if (hit && hit.score >= 0.8) fields.add(hit.field);
    }
    if (fields.size > bestCount) {
      bestCount = fields.size;
      bestRow = index;
    }
  }
  if (bestRow >= 0) return bestRow;
  const firstFilled = grid.findIndex((row) => (row ?? []).some((cell) => cellText(cell)));
  return Math.max(0, firstFilled);
}

// ─── Contenido de columna ─────────────────────────────────────────────────

type ColumnProfile = {
  filled: number;
  dateRatio: number;
  timeRatio: number;
  matchupRatio: number;
  smallIntRatio: number;
  roundLabelRatio: number;
  scoreRatio: number;
  textRatio: number;
};

function profileColumn(values: SheetCell[]): ColumnProfile {
  const sample = values.filter((value) => cellText(value) !== '').slice(0, CONTENT_SAMPLE);
  const filled = sample.length;
  const ratio = (predicate: (value: SheetCell) => boolean) =>
    filled ? sample.filter(predicate).length / filled : 0;
  return {
    filled,
    // «3/14/2026» también es una fecha, aunque leída día primero el mes 14 no
    // exista: `detectMonthFirst` decide después para qué lado se lee.
    dateRatio: ratio((value) => cellToDate(value) !== null || cellToDate(swapMonthDay(value)) !== null),
    timeRatio: ratio((value) => cellToTime(value) !== null),
    matchupRatio: ratio((value) => splitMatchup(value) !== null),
    smallIntRatio: ratio((value) => /^\d{1,2}$/.test(cellText(value))),
    roundLabelRatio: ratio((value) => extractRoundLabel(cellText(value)) !== null),
    scoreRatio: ratio((value) => /^\s*\d{1,3}\s*[-:]\s*\d{1,3}\s*$/.test(cellText(value))),
    textRatio: ratio((value) => /[a-záéíóúñ]{3,}/i.test(cellText(value))),
  };
}

/**
 * Ajuste por contenido de lo que el título sugiere. Es lo que desempata
 * «Fecha»: con días adentro es la fecha del partido; con 1, 2, 3 o «Fecha 3»,
 * la jornada.
 */
function contentScore(field: FieldKey, profile: ColumnProfile): number {
  if (!profile.filled) return 0;
  switch (field) {
    case 'match_date':
      return profile.dateRatio >= 0.6 ? 0.5 : -0.6;
    case 'round':
      if (profile.smallIntRatio + profile.roundLabelRatio >= 0.6) return 0.5;
      return profile.dateRatio >= 0.6 ? -0.6 : 0;
    case 'match_time':
      return profile.timeRatio >= 0.6 ? 0.5 : -0.4;
    case 'home_team':
    case 'away_team':
      return profile.textRatio >= 0.6 ? 0.2 : -0.5;
    case 'score':
      return profile.scoreRatio >= 0.5 ? 0.3 : 0;
    case 'match_number':
      // «Partido» con «A vs B» adentro no es un número: es el cruce.
      return profile.matchupRatio >= 0.5 ? -1 : 0;
    default:
      return 0;
  }
}

export interface DetectedSheet {
  headerRowIndex: number;
  headers: string[];
  rows: Record<string, SheetCell>[];
  mapping: FixtureColumnMapping;
  suggestions: FixtureColumnSuggestion[];
  /** Filas de sección («FECHA 3», «Zona A») heredadas a los partidos de abajo. */
  sectionRows: number;
  /** Columna que traía el partido en una sola celda, si la hubo. */
  matchupHeader: string | null;
  /** Cómo se leyó la hoja; la UI lo cuenta en una línea. */
  layout?: 'table' | 'matrix';
  /** Celdas vacías que se completaron con el valor de arriba (fecha, jornada, zona, fase). */
  filledDown?: number;
  /** La columna de fecha venía en mes/día (formato de Excel en inglés). */
  monthFirstDates?: boolean;
}

/** Títulos únicos: dos columnas «Fecha» pasan a «Fecha» y «Fecha (2)». */
function uniqueHeaders(row: SheetCell[], width: number): string[] {
  const seen = new Map<string, number>();
  return Array.from({ length: width }, (_, index) => {
    const base = cellText(row[index]) || `Columna ${index + 1}`;
    const count = (seen.get(base) ?? 0) + 1;
    seen.set(base, count);
    return count === 1 ? base : `${base} (${count})`;
  });
}

/** El título sin el « (2)» que le pone `uniqueHeaders` a los repetidos. */
const baseHeader = (header: string) => header.replace(/\s\(\d+\)$/, '');

type SectionKind = 'round' | 'group' | 'date' | 'phase';

const PHASE_WORDS_RE = /\b(fase|etapa|instancia|playoffs?|repechaje|cuartos|semifinal(?:es)?|final(?:es)?|octavos|reclasificacion)\b/;

/**
 * Una fila con una o dos celdas y ningún cruce es un rótulo de sección:
 * «FECHA 3», «Zona A», «Sábado 19/09», «Semifinales». Vale para las filas de
 * abajo hasta el próximo rótulo del mismo tipo.
 */
function classifySectionRow(cells: SheetCell[]): Array<{ kind: SectionKind; value: string }> {
  const filledCells = cells.filter((cell) => cellText(cell));
  if (!filledCells.length || filledCells.length > 2) return [];
  const text = filledCells.map(cellText).join(' ');
  if (splitMatchup(text)) return [];
  const found: Array<{ kind: SectionKind; value: string }> = [];
  const round = extractRoundLabel(text);
  if (round) found.push({ kind: 'round', value: round });
  const group = extractGroupLabel(text);
  if (group) found.push({ kind: 'group', value: group });
  const date = filledCells.map((cell) => cellToDate(cell)).find(Boolean);
  if (date) found.push({ kind: 'date', value: date });
  if (!round && PHASE_WORDS_RE.test(normalizeKey(text))) found.push({ kind: 'phase', value: cellText(filledCells[0]) });
  return found;
}

/**
 * ¿La columna de fechas escritas como texto viene en mes/día? Sólo se afirma
 * con evidencia: algún valor con el segundo número mayor a 12 («3/19/2026») y
 * ninguno con el primero mayor a 12. Sin evidencia, día primero — es un gestor
 * rioplatense.
 */
function detectMonthFirst(values: SheetCell[]): boolean {
  let dayFirst = false;
  let monthFirst = false;
  for (const value of values) {
    if (typeof value !== 'string') continue;
    const match = value.match(/\b(\d{1,2})[/.-](\d{1,2})(?:[/.-]\d{2,4})?\b/);
    if (!match) continue;
    if (Number(match[1]) > 12) dayFirst = true;
    if (Number(match[2]) > 12) monthFirst = true;
  }
  return monthFirst && !dayFirst;
}

/** «3/19/2026» → «19/3/2026», para que el resto lo lea día primero. */
function swapMonthDay(value: SheetCell): SheetCell {
  if (typeof value !== 'string') return value;
  return value.replace(/\b(\d{1,2})([/.-])(\d{1,2})\b/, '$3$2$1');
}

export interface DetectSheetOptions {
  /** La jornada que dice el nombre de la hoja («Fecha 3»). */
  sheetRound?: string | null;
  /** La zona que dice el nombre de la hoja («Zona A»). */
  sheetGroup?: string | null;
  /** La fase que dice el nombre de la hoja («Semifinales»). */
  sheetPhase?: string | null;
}

/** Campos que, vacíos, valen «lo mismo que arriba» (celdas combinadas o planillas tipeadas así). */
const FILL_DOWN_FIELDS: Array<[FieldKey, SectionKind]> = [
  ['match_date', 'date'],
  ['round', 'round'],
  ['group', 'group'],
  ['phase', 'phase'],
];

/**
 * Detecta encabezados, mapeo y filas de UNA tabla.
 */
export function detectSheet(grid: SheetGrid, options: DetectSheetOptions = {}): DetectedSheet {
  const headerRowIndex = detectHeaderRow(grid);
  const body = grid.slice(headerRowIndex + 1);
  const width = Math.max(0, ...grid.slice(headerRowIndex, headerRowIndex + 1 + CONTENT_SAMPLE).map((row) => row?.length ?? 0));
  const headers = uniqueHeaders(grid[headerRowIndex] ?? [], width);
  const headerKeys = headers.map(normalizeKey);

  const isRepeatedHeader = (row: SheetCell[]) =>
    row.filter((cell, index) => cellText(cell) && normalizeKey(cellText(cell)) === headerKeys[index]).length >= 2;

  // Filas de partido para perfilar columnas: ni rótulos, ni vacías, ni el
  // encabezado repetido.
  const dataRows = body.filter((row) => {
    const cells = row ?? [];
    const filled = cells.filter((cell) => cellText(cell)).length;
    if (!filled || isRepeatedHeader(cells)) return false;
    return filled > 2 || classifySectionRow(cells).length === 0;
  });
  const profiles = headers.map((_, column) => profileColumn(dataRows.map((row) => row?.[column])));

  // Todas las combinaciones campo×columna con puntaje; se asignan de mayor a
  // menor, una columna por campo y un campo por columna.
  const candidates: Array<{ field: FieldKey; column: number; score: number }> = [];
  headers.forEach((header, column) => {
    for (const field of Object.keys(HEADER_ALIASES) as FieldKey[]) {
      const byTitle = headerScore(header, field);
      if (!byTitle) continue;
      candidates.push({ field, column, score: byTitle + contentScore(field, profiles[column]) });
    }
  });
  candidates.sort((a, b) => b.score - a.score || a.column - b.column);

  const mapping: FixtureColumnMapping = {};
  const confidence: Partial<Record<FieldKey, FixtureImportConfidence>> = {};
  const usedColumns = new Set<number>();
  for (const candidate of candidates) {
    if (candidate.score < 0.6) break;
    if (mapping[candidate.field] || usedColumns.has(candidate.column)) continue;
    mapping[candidate.field] = headers[candidate.column];
    confidence[candidate.field] = candidate.score >= 1 ? 'alta' : 'media';
    usedColumns.add(candidate.column);
  }

  // «Equipo | Equipo»: sin «Local» ni «Visitante», las columnas que dicen «un
  // equipo» se toman en orden de lectura.
  if (!mapping.home_team || !mapping.away_team) {
    const generic = headers
      .map((header, column) => ({ header, column }))
      .filter(({ header, column }) =>
        !usedColumns.has(column)
        && GENERIC_TEAM_ALIASES.has(normalizeKey(baseHeader(header)))
        && profiles[column].textRatio >= 0.6);
    for (const field of ['home_team', 'away_team'] as const) {
      if (mapping[field]) continue;
      const next = generic.shift();
      if (!next) break;
      mapping[field] = next.header;
      confidence[field] = 'media';
      usedColumns.add(next.column);
    }
  }

  // Por contenido, para lo que el título no resolvió.
  const takeByContent = (field: FieldKey, predicate: (profile: ColumnProfile) => boolean) => {
    if (mapping[field]) return;
    const column = profiles.findIndex((profile, index) => !usedColumns.has(index) && profile.filled > 0 && predicate(profile));
    if (column < 0) return;
    mapping[field] = headers[column];
    confidence[field] = 'media';
    usedColumns.add(column);
  };

  let matchupHeader: string | null = null;
  if (!mapping.home_team && !mapping.away_team) {
    const column = profiles.findIndex((profile) => profile.matchupRatio >= 0.6);
    if (column >= 0) {
      matchupHeader = headers[column];
      usedColumns.add(column);
    }
  }
  takeByContent('match_date', (profile) => profile.dateRatio >= 0.7);
  takeByContent('match_time', (profile) => profile.timeRatio >= 0.7);
  takeByContent('score', (profile) => profile.scoreRatio >= 0.7);

  const dateColumn = mapping.match_date ? headers.indexOf(mapping.match_date) : -1;
  const monthFirstDates = dateColumn >= 0 && detectMonthFirst(dataRows.map((row) => row?.[dateColumn]));

  // Rótulos ARRIBA del encabezado («ZONA A», «FECHA 3 – 14/03»): valen para
  // toda la tabla, salvo que un rótulo de abajo los cambie.
  const current: Partial<Record<SectionKind, string>> = {};
  for (const row of grid.slice(0, headerRowIndex)) {
    for (const section of classifySectionRow(row ?? [])) current[section.kind] = section.value;
  }

  const extraHeaders = new Set<string>();
  const rows: Record<string, SheetCell>[] = [];
  const lastValue: Partial<Record<FieldKey, SheetCell>> = {};
  let sectionRows = 0;
  let filledDown = 0;

  for (const rawRow of body) {
    const row = rawRow ?? [];
    if (!row.some((cell) => cellText(cell))) continue;
    if (isRepeatedHeader(row)) continue;

    const sections = classifySectionRow(row);
    if (sections.length) {
      sectionRows += 1;
      for (const section of sections) {
        current[section.kind] = section.value;
        // Un rótulo nuevo corta el «igual que arriba» de su campo.
        for (const [field, kind] of FILL_DOWN_FIELDS) if (kind === section.kind) delete lastValue[field];
      }
      continue;
    }

    const record: Record<string, SheetCell> = {};
    headers.forEach((header, column) => {
      record[header] = row[column] ?? null;
    });
    if (monthFirstDates && mapping.match_date) record[mapping.match_date] = swapMonthDay(record[mapping.match_date]);

    if (matchupHeader) {
      const split = splitMatchup(record[matchupHeader]);
      record[SYNTHETIC_HEADERS.home] = split?.home ?? null;
      record[SYNTHETIC_HEADERS.away] = split?.away ?? null;
      extraHeaders.add(SYNTHETIC_HEADERS.home);
      extraHeaders.add(SYNTHETIC_HEADERS.away);
    }

    // Celdas combinadas o «igual que arriba»: la fecha, la jornada, la zona y
    // la fase se escriben una vez por bloque. La hora NO: una hora vacía es
    // una hora que falta, y para eso están los horarios habituales.
    for (const [field] of FILL_DOWN_FIELDS) {
      const column = mapping[field];
      if (!column) continue;
      if (cellText(record[column])) {
        lastValue[field] = record[column];
      } else if (lastValue[field] !== undefined) {
        record[column] = lastValue[field];
        filledDown += 1;
      }
    }

    const inherit = (field: FieldKey, kind: SectionKind, synthetic: string) => {
      const value = current[kind];
      if (!value) return;
      const column = mapping[field];
      if (column && cellText(record[column])) return;
      if (column) {
        record[column] = value;
      } else {
        record[synthetic] = value;
        extraHeaders.add(synthetic);
      }
    };
    inherit('round', 'round', SYNTHETIC_HEADERS.round);
    inherit('group', 'group', SYNTHETIC_HEADERS.group);
    inherit('match_date', 'date', SYNTHETIC_HEADERS.date);
    inherit('phase', 'phase', SYNTHETIC_HEADERS.phase);

    // Lo que dice el nombre de la hoja, cuando la hoja no lo dice adentro.
    const fromSheetName = (field: FieldKey, kind: SectionKind, value: string | null | undefined, synthetic: string) => {
      if (!value || current[kind]) return;
      if (mapping[field] && cellText(record[mapping[field] as string])) return;
      record[synthetic] = value;
      extraHeaders.add(synthetic);
    };
    fromSheetName('round', 'round', options.sheetRound, SYNTHETIC_HEADERS.sheetRound);
    fromSheetName('group', 'group', options.sheetGroup, SYNTHETIC_HEADERS.sheetGroup);
    fromSheetName('phase', 'phase', options.sheetPhase, SYNTHETIC_HEADERS.sheetPhase);

    rows.push(record);
  }

  // Los sintéticos se mapean solos cuando el campo no tenía columna.
  const syntheticFor: Array<[FieldKey, string]> = [
    ['home_team', SYNTHETIC_HEADERS.home],
    ['away_team', SYNTHETIC_HEADERS.away],
    ['round', SYNTHETIC_HEADERS.round],
    ['round', SYNTHETIC_HEADERS.sheetRound],
    ['group', SYNTHETIC_HEADERS.group],
    ['group', SYNTHETIC_HEADERS.sheetGroup],
    ['match_date', SYNTHETIC_HEADERS.date],
    ['phase', SYNTHETIC_HEADERS.phase],
    ['phase', SYNTHETIC_HEADERS.sheetPhase],
  ];
  for (const [field, header] of syntheticFor) {
    if (!mapping[field] && extraHeaders.has(header)) {
      mapping[field] = header;
      confidence[field] = 'media';
    }
  }

  const realHeaders = headers.filter((header, column) => profiles[column].filled > 0 || cellText(grid[headerRowIndex]?.[column]));
  const suggestions: FixtureColumnSuggestion[] = (Object.keys(HEADER_ALIASES) as FieldKey[]).map((field) => ({
    field,
    header: mapping[field] ?? null,
    confidence: mapping[field] ? confidence[field] ?? 'media' : 'baja',
  }));

  return {
    headerRowIndex,
    headers: [...realHeaders, ...extraHeaders],
    rows,
    mapping,
    suggestions,
    sectionRows,
    matchupHeader,
    layout: 'table',
    filledDown,
    monthFirstDates,
  };
}

// ─── Celdas combinadas ────────────────────────────────────────────────────

export interface MergeRange {
  s: { r: number; c: number };
  e: { r: number; c: number };
}

/**
 * Copia hacia abajo el valor de cada rango combinado. SheetJS deja el valor
 * sólo arriba a la izquierda: una fecha combinada para cinco partidos quedaba
 * en el primero y los otros cuatro sin fecha. Hacia la derecha no se copia —una
 * combinación horizontal es un título que ocupa varias columnas, y repetirlo
 * fabricaría columnas que no existen—.
 */
export function applyMerges(grid: SheetGrid, merges: MergeRange[] | undefined): SheetGrid {
  if (!merges?.length) return grid;
  const out = grid.map((row) => [...(row ?? [])]);
  for (const merge of merges) {
    const value = out[merge.s.r]?.[merge.s.c];
    if (value === null || value === undefined || value === '') continue;
    for (let r = merge.s.r + 1; r <= merge.e.r; r += 1) {
      out[r] = out[r] ?? [];
      out[r][merge.s.c] = value;
    }
  }
  return out;
}

// ─── Tablas lado a lado ───────────────────────────────────────────────────

/**
 * Parte la hoja en franjas de columnas cuando el encabezado se repite: «Zona A»
 * y «Zona B» una al lado de la otra, cada una con su «Local | Visitante».
 * Cada franja se lee como una tabla propia. Con un solo encabezado, una franja.
 */
export function splitRepeatedTables(grid: SheetGrid): SheetGrid[] {
  const headerRowIndex = detectHeaderRow(grid);
  const header = grid[headerRowIndex] ?? [];
  const homeColumns: number[] = [];
  header.forEach((cell, column) => {
    if (typeof cell !== 'string') return;
    if (headerScore(cell, 'home_team') >= 0.8 && headerScore(cell, 'match_time') < 1 && headerScore(cell, 'score_home') < 1) homeColumns.push(column);
  });
  if (homeColumns.length < 2) return [grid];

  const firstFilled = header.findIndex((cell) => cellText(cell));
  const lead = Math.max(0, homeColumns[0] - Math.max(0, firstFilled));
  const starts = homeColumns.map((column, index) => (index === 0 ? 0 : Math.max(0, column - lead)));
  return starts.map((start, index) => {
    const end = starts[index + 1];
    return grid.map((row) => (row ?? []).slice(start, end));
  });
}

// ─── Tabla de doble entrada ───────────────────────────────────────────────

const EMPTY_CROSS_RE = /^(x|-|—|–|\/|\*|libre|bye|n\/a)$/i;

/**
 * Tabla de doble entrada: los clubes en una fila y en una columna, y en cada
 * cruce la fecha (o la jornada) del partido. La fila es el local y la columna
 * el visitante, que es como se arma siempre esta tabla.
 */
export function detectMatrix(grid: SheetGrid): DetectedSheet | null {
  const limit = Math.min(grid.length, HEADER_SCAN_ROWS);
  for (let headerRow = 0; headerRow < limit; headerRow += 1) {
    const header = grid[headerRow] ?? [];
    const firstName = header.findIndex((cell) => /[a-záéíóúñ]{3,}/i.test(cellText(cell)));
    const labelColumn = firstName - 1;
    if (labelColumn < 0) continue;
    const columnNames = header
      .map((cell, column) => ({ column, name: cellText(cell) }))
      .filter(({ column, name }) => column > labelColumn && /[a-záéíóúñ]{3,}/i.test(name));
    if (columnNames.length < 3) continue;

    const rowNames = grid
      .slice(headerRow + 1)
      .map((row, offset) => ({ row: headerRow + 1 + offset, name: cellText(row?.[labelColumn]) }))
      .filter(({ name }) => /[a-záéíóúñ]{3,}/i.test(name));
    if (rowNames.length < 3) continue;

    // Los mismos clubes en las dos puntas: si no, es otra cosa (una tabla de
    // posiciones también tiene nombres en la primera columna).
    const columnKeys = new Set(columnNames.map(({ name }) => normalizeKey(name)));
    const overlap = rowNames.filter(({ name }) => columnKeys.has(normalizeKey(name))).length;
    if (overlap < Math.min(columnNames.length, rowNames.length) * 0.6) continue;

    const rows: Record<string, SheetCell>[] = [];
    for (const { row, name: home } of rowNames) {
      for (const { column, name: away } of columnNames) {
        if (normalizeKey(home) === normalizeKey(away)) continue;
        const value = grid[row]?.[column];
        const text = cellText(value);
        if (!text || EMPTY_CROSS_RE.test(text)) continue;
        const date = cellToDate(value);
        const time = cellToTime(value, { allowDateTime: true });
        const round = date ? null : extractRoundLabel(text) ?? (/^\d{1,2}$/.test(text) ? `Fecha ${Number(text)}` : null);
        if (!date && !round) continue;
        rows.push({
          [SYNTHETIC_HEADERS.matrixHome]: home,
          [SYNTHETIC_HEADERS.matrixAway]: away,
          [SYNTHETIC_HEADERS.matrixDate]: date,
          [SYNTHETIC_HEADERS.matrixTime]: time,
          [SYNTHETIC_HEADERS.matrixRound]: round,
        });
      }
    }
    if (rows.length < 3) continue;

    const mapping: FixtureColumnMapping = {
      home_team: SYNTHETIC_HEADERS.matrixHome,
      away_team: SYNTHETIC_HEADERS.matrixAway,
      match_date: SYNTHETIC_HEADERS.matrixDate,
      match_time: SYNTHETIC_HEADERS.matrixTime,
      round: SYNTHETIC_HEADERS.matrixRound,
    };
    return {
      headerRowIndex: headerRow,
      headers: Object.values(mapping) as string[],
      rows,
      mapping,
      suggestions: (Object.keys(HEADER_ALIASES) as FieldKey[]).map((field) => ({
        field,
        header: mapping[field] ?? null,
        confidence: mapping[field] ? 'media' : 'baja',
      })),
      sectionRows: 0,
      matchupHeader: null,
      layout: 'matrix',
    };
  }
  return null;
}

// ─── La hoja como texto ───────────────────────────────────────────────────

function cellToLineText(cell: SheetCell): string {
  if (typeof cell === 'number') {
    const date = cellToDate(cell);
    if (date) {
      const [year, month, day] = date.split('-');
      const time = cellToTime(cell, { allowDateTime: true });
      return `${day}/${month}/${year}${time ? ` ${time}` : ''}`;
    }
    if (cell > 0 && cell < 1) return cellToTime(cell) ?? String(cell);
  }
  return cellText(cell);
}

const SECTION_CELL_RE = /^(fecha|jornada|round|ronda|rodada|zona|grupo|pool)\b/i;

/**
 * Franjas de columnas para leer bloques lado a lado. Cada columna con rótulos
 * de jornada («FECHA 1» en B, «FECHA 2» en H) abre una franja que se lee entera
 * antes de pasar a la de la derecha: si no, cada fila mezcla un partido de cada
 * fecha. Con los rótulos siempre en la misma columna, una sola franja.
 */
function blockBands(grid: SheetGrid): Array<[number, number | undefined]> {
  const columns = new Set<number>();
  for (const row of grid) {
    (row ?? []).forEach((cell, column) => {
      const text = cellText(cell);
      if (text.length <= 30 && SECTION_CELL_RE.test(text) && extractRoundLabel(text)) columns.add(column);
    });
  }
  const starts = [...columns].sort((a, b) => a - b)
    // Columnas pegadas son el mismo bloque («FECHA» | «3»).
    .filter((column, index, list) => index === 0 || column - list[index - 1] > 2);
  if (starts.length < 2) return [[0, undefined]];
  return starts.map((start, index) => [index === 0 ? 0 : start, starts[index + 1]]);
}

/**
 * La hoja como texto, una línea por fila y un tab por celda.
 *
 * Para las planillas sin encabezados de columna: el fixture de la Unión
 * Cordobesa son bloques «FECHA 1 | 14/03/2026» con los partidos abajo y los
 * números de los cruces al costado. No hay columna «Local» que mapear; lo que
 * sí sirve es el parser de líneas, que ya entiende los rótulos de jornada. Las
 * fechas y horas de Excel se escriben como las escribiría una persona.
 */
export function gridToText(grid: SheetGrid): string {
  const lines: string[] = [];
  for (const [start, end] of blockBands(grid)) {
    for (const row of grid) {
      const cells = (row ?? []).slice(start, end).map(cellToLineText).filter(Boolean);
      // Un rótulo de sección que comparte fila con otra cosa —en la planilla de
      // la UCR, «FECHA 1 | 14/03/2026» va en la misma fila que el renglón del
      // sorteo y el título «Cruces»— se separa en su propia línea: si no, el
      // parser no lo reconoce como rótulo y la jornada no se hereda.
      const sectionAt = cells.findIndex((cell, index) => index > 0 && SECTION_CELL_RE.test(cell));
      if (sectionAt > 0) {
        lines.push(cells.slice(0, sectionAt).join('\t'));
        lines.push(cells.slice(sectionAt).join('\t'));
      } else {
        lines.push(cells.join('\t'));
      }
    }
    lines.push('');
  }
  return lines.join('\n');
}

/** ¿La hoja trae partidos? Hace falta saber quién juega contra quién. */
export function sheetHasFixture(detected: DetectedSheet): boolean {
  return Boolean(detected.mapping.home_team && detected.mapping.away_team && detected.rows.length);
}

export interface DetectedWorkbook {
  /** Hoja cuya plantilla manda (la del mapeo). */
  primarySheet: string;
  /** Hojas cuyas filas entran, en el orden del libro. */
  usedSheets: string[];
  /** Hojas que se dejaron afuera: sin partidos o con otra plantilla. */
  skippedSheets: string[];
  /** Tablas lado a lado que se leyeron por separado. */
  sideBySideTables: number;
  detected: DetectedSheet;
}

/** Lo que el nombre de una hoja dice: «Fecha 3», «Zona A», «Semifinales». */
function sheetNameOptions(name: string): DetectSheetOptions {
  const round = extractRoundLabel(name);
  const group = extractGroupLabel(name);
  return {
    sheetRound: round,
    sheetGroup: group,
    sheetPhase: !round && !group && PHASE_WORDS_RE.test(normalizeKey(name)) ? name.trim() : null,
  };
}

/** Pasa las filas de una tabla a los títulos de otra, campo por campo. */
function remapRows(rows: Record<string, SheetCell>[], from: FixtureColumnMapping, to: FixtureColumnMapping) {
  return rows.map((row) => {
    const record: Record<string, SheetCell> = { ...row };
    for (const field of Object.keys(to) as FieldKey[]) {
      const target = to[field];
      const source = from[field];
      if (target && source && source !== target && !cellText(record[target])) record[target] = row[source] ?? null;
    }
    return record;
  });
}

/**
 * Elige qué hojas del libro importar y cómo leer cada una.
 *
 * Cada hoja se prueba como tabla (con sus tablas lado a lado por separado) y,
 * si no tiene local y visitante, como tabla de doble entrada. Manda la hoja con
 * más partidos; las otras entran si usan LA MISMA plantilla —el caso de «una
 * hoja por fecha» o «una hoja por zona»—. Una hoja con otra forma
 * (posiciones, instrucciones) se deja afuera y se avisa.
 */
export function detectWorkbook(sheets: Array<{ name: string; grid: SheetGrid }>): DetectedWorkbook | null {
  let sideBySideTables = 0;
  const analysed = sheets.map((sheet) => {
    const options = sheetNameOptions(sheet.name);
    const parts = splitRepeatedTables(sheet.grid).map((band) => detectSheet(band, options));
    let detected: DetectedSheet;
    if (parts.length > 1 && parts.every(sheetHasFixture)) {
      sideBySideTables += parts.length;
      // Cada franja trae sus propios títulos; se unifican con los de la primera.
      const [first, ...others] = parts;
      const mapping = { ...first.mapping };
      for (const part of others) {
        for (const field of Object.keys(part.mapping) as FieldKey[]) if (!mapping[field]) mapping[field] = part.mapping[field];
      }
      detected = {
        ...first,
        mapping,
        headers: [...new Set(parts.flatMap((part) => part.headers))],
        rows: parts.flatMap((part) => remapRows(part.rows, part.mapping, mapping)),
        sectionRows: parts.reduce((sum, part) => sum + part.sectionRows, 0),
        filledDown: parts.reduce((sum, part) => sum + (part.filledDown ?? 0), 0),
      };
    } else {
      detected = parts[0];
    }
    if (!sheetHasFixture(detected)) {
      const matrix = detectMatrix(sheet.grid);
      if (matrix) detected = matrix;
    }
    return { name: sheet.name, detected };
  });
  if (!analysed.length) return null;

  const withFixture = analysed.filter((sheet) => sheetHasFixture(sheet.detected));
  if (!withFixture.length) {
    const [first, ...rest] = analysed;
    return { primarySheet: first.name, usedSheets: [first.name], skippedSheets: rest.map((s) => s.name), sideBySideTables: 0, detected: first.detected };
  }

  const primary = withFixture.reduce((best, sheet) =>
    sheet.detected.rows.length > best.detected.rows.length ? sheet : best);
  // La firma mira sólo columnas reales: que una hoja saque la jornada de un
  // rótulo y otra de su nombre no cambia la plantilla.
  const synthetic = new Set<string>(Object.values(SYNTHETIC_HEADERS));
  const signature = (detected: DetectedSheet) =>
    `${detected.layout ?? 'table'}:` + (Object.keys(detected.mapping) as FieldKey[])
      .filter((field) => detected.mapping[field] && !synthetic.has(detected.mapping[field] as string))
      .sort()
      .map((field) => `${field}=${detected.mapping[field]}`)
      .join('|');
  const primarySignature = signature(primary.detected);
  const used = withFixture.filter((sheet) => sheet === primary || signature(sheet.detected) === primarySignature);

  // Una hoja puede sacar un campo de un sintético que la primaria no tiene (la
  // zona sale del nombre en una y de un rótulo en otra): se unifica.
  const mapping = { ...primary.detected.mapping };
  for (const sheet of used) {
    for (const field of Object.keys(sheet.detected.mapping) as FieldKey[]) {
      if (!mapping[field]) mapping[field] = sheet.detected.mapping[field];
    }
  }
  const headers: string[] = [];
  for (const sheet of used) {
    for (const header of sheet.detected.headers) if (!headers.includes(header)) headers.push(header);
  }

  return {
    primarySheet: primary.name,
    usedSheets: used.map((sheet) => sheet.name),
    skippedSheets: analysed.filter((sheet) => !used.includes(sheet)).map((sheet) => sheet.name),
    sideBySideTables,
    detected: {
      ...primary.detected,
      mapping,
      headers,
      rows: used.flatMap((sheet) => remapRows(sheet.detected.rows, sheet.detected.mapping, mapping)),
      sectionRows: used.reduce((sum, sheet) => sum + sheet.detected.sectionRows, 0),
      filledDown: used.reduce((sum, sheet) => sum + (sheet.detected.filledDown ?? 0), 0),
      monthFirstDates: used.some((sheet) => sheet.detected.monthFirstDates),
    },
  };
}

export type WorkbookFixture =
  | {
      mode: 'table';
      detection: DetectedWorkbook | null;
      headers: string[];
      rows: Record<string, SheetCell>[];
      mapping: FixtureColumnMapping;
      suggestions: FixtureColumnSuggestion[];
      needsManualMapping: boolean;
    }
  | {
      mode: 'lines';
      detection: DetectedWorkbook | null;
      text: string;
      parsed: ParsedFixtureText;
    };

const REQUIRED_TEAM_FIELDS: FieldKey[] = ['home_team', 'away_team'];

/**
 * Cómo leer un libro entero. Primero como tabla (con todo lo de
 * `detectWorkbook`: tablas lado a lado, doble entrada, una hoja por fecha o
 * zona). Si ninguna hoja dice quién es local y quién visitante —y el usuario
 * tampoco lo asignó a mano—, fila por fila con el parser de líneas: es el caso
 * de las planillas de bloques («FECHA 1 | 14/03/2026» y los partidos abajo).
 *
 * `manualMapping` es lo que el usuario corrigió en el asistente; gana sobre lo
 * detectado sólo para columnas que siguen existiendo.
 */
export function extractWorkbookFixture(
  sheets: Array<{ name: string; grid: SheetGrid }>,
  manualMapping: FixtureColumnMapping | null = null,
): WorkbookFixture {
  const detection = detectWorkbook(sheets);
  const detected = detection?.detected;
  const headers = detected?.headers ?? [];
  const manual = Object.fromEntries(
    Object.entries(manualMapping || {}).filter(([, header]) => !header || headers.includes(String(header))),
  ) as FixtureColumnMapping;
  const mapping = { ...(detected?.mapping ?? {}), ...manual };
  const needsManualMapping = REQUIRED_TEAM_FIELDS.some((field) => !mapping[field]);

  if (needsManualMapping && !manual.home_team && !manual.away_team) {
    const text = sheets.map((sheet) => gridToText(sheet.grid)).join('\n');
    const parsed = parseFixtureText(text);
    if (parsed.rows.length) return { mode: 'lines', detection, text, parsed };
  }

  return {
    mode: 'table',
    detection,
    headers,
    rows: detected?.rows ?? [],
    mapping,
    suggestions: detected?.suggestions ?? [],
    needsManualMapping,
  };
}
