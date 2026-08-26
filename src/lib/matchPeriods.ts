import type { MatchPeriodRules } from './americanFootballRules.ts';

export type { MatchPeriodRules };

/**
 * Con que se resuelven los periodos: el deporte a secas (lo de siempre) o el
 * deporte MAS las reglas de periodo del torneo. Existe porque el futbol
 * americano no tiene un unico reglamento: un torneo de flag juega dos tiempos
 * de 20' y uno de tackle cuatro cuartos de 12' o de 15'. Todo lo que ya
 * pasaba un `sportId` string sigue compilando y haciendo exactamente lo mismo.
 */
export type PeriodSportRef =
  | string
  | null
  | undefined
  | { sportId: string | null | undefined; periodRules?: MatchPeriodRules | null };

type PeriodSportRefObject = { sportId: string | null | undefined; periodRules?: MatchPeriodRules | null };

export function unpackPeriodSportRef(ref: PeriodSportRef): { sportId: string | null | undefined; periodRules: MatchPeriodRules | null } {
  if (ref !== null && ref !== undefined && typeof ref === 'object') {
    const object = ref as PeriodSportRefObject;
    return { sportId: object.sportId, periodRules: object.periodRules ?? null };
  }
  return { sportId: ref as string | null | undefined, periodRules: null };
}

export const DEFAULT_MATCH_PERIOD = '1T';

const PERIOD_ALIAS_MAP: Record<string, string> = {
  PRE: 'PRE',
  /* ── cuartos ──
   * El hockey sobre cesped se juega en cuatro cuartos de 15', no en dos
   * tiempos. Hasta ahora el vocabulario solo expresaba 1T/2T y el reloj lo
   * aproximaba a mitades de 30': el numero salia bien pero los eventos perdian
   * la atribucion por cuarto. Estos codigos son ADITIVOS: ningun deporte que
   * hoy usa 1T/2T los emite, asi que nada cambia para rugby, futbol o basquet.
   */
  Q1: 'Q1',
  '1C': 'Q1',
  C1: 'Q1',
  'CUARTO 1': 'Q1',
  'PRIMER CUARTO': 'Q1',
  'FIRST QUARTER': 'Q1',
  Q2: 'Q2',
  '2C': 'Q2',
  C2: 'Q2',
  'CUARTO 2': 'Q2',
  'SEGUNDO CUARTO': 'Q2',
  'SECOND QUARTER': 'Q2',
  Q3: 'Q3',
  '3C': 'Q3',
  C3: 'Q3',
  'CUARTO 3': 'Q3',
  'TERCER CUARTO': 'Q3',
  'THIRD QUARTER': 'Q3',
  Q4: 'Q4',
  '4C': 'Q4',
  C4: 'Q4',
  'CUARTO 4': 'Q4',
  'CUARTO CUARTO': 'Q4',
  'FOURTH QUARTER': 'Q4',
  PREVIA: 'PRE',
  PREGAME: 'PRE',
  'PRE MATCH': 'PRE',
  'PRE-MATCH': 'PRE',
  '1': '1T',
  '1T': '1T',
  '1 T': '1T',
  PRIMER: '1T',
  'PRIMER TIEMPO': '1T',
  'FIRST HALF': '1T',
  '1ST HALF': '1T',
  HT: 'HT',
  HALF: 'HT',
  HALFTIME: 'HT',
  'HALF TIME': 'HT',
  ENTRETIEMPO: 'HT',
  '2': '2T',
  '2T': '2T',
  '2 T': '2T',
  SEGUNDO: '2T',
  'SEGUNDO TIEMPO': '2T',
  'SECOND HALF': '2T',
  '2ND HALF': '2T',
  ET: 'ET',
  SUPLEMENTARIO: 'ET',
  SUPLEMENTARIA: 'ET',
  PRORROGA: 'ET',
  PRORROGUE: 'ET',
  'EXTRA TIME': 'ET',
  FT: 'FT',
  FINAL: 'FT',
  FINALIZADO: 'FT',
  FIN: 'FT',
  'FINAL PARTIDO': 'FT',
};

const PERIOD_ORDER: Record<string, number> = {
  PRE: 0,
  // Q1 y Q3 comparten posicion con 1T y 2T a proposito: son el arranque de
  // cada mitad. Ningun deporte mezcla cuartos con tiempos, asi que el empate
  // no se da en la practica y `compareMatchPeriodValues` lo desempata por
  // nombre igual.
  Q1: 10,
  '1T': 10,
  Q2: 15,
  HT: 20,
  Q3: 30,
  '2T': 30,
  Q4: 35,
  ET: 40,
  FT: 50,
};

const PERIOD_LABELS: Record<string, string> = {
  PRE: 'Previa',
  Q1: 'Primer cuarto',
  '1T': 'Primer tiempo',
  Q2: 'Segundo cuarto',
  HT: 'Entretiempo',
  Q3: 'Tercer cuarto',
  '2T': 'Segundo tiempo',
  Q4: 'Cuarto cuarto',
  ET: 'Suplementario',
  FT: 'Final',
};

/**
 * Secuencia de periodos JUGABLES de cada deporte, en orden. No incluye PRE, HT,
 * ET ni FT: son estados, no periodos de juego.
 *
 * De aca sale todo el avance (`end_period`, `match_half`, `start_period`), asi
 * que sumar un deporte con otra estructura es agregar una linea, no tocar la
 * logica. El default son dos mitades, que es lo que hoy hablan rugby, futbol y
 * basquet.
 */
const DEFAULT_PERIOD_SEQUENCE = ['1T', '2T'] as const;

const SPORT_PERIOD_SEQUENCE: Record<string, readonly string[]> = {
  hockey: ['Q1', 'Q2', 'Q3', 'Q4'],
  // Cuatro cuartos de 15' con el descanso largo entre Q2 y Q3. Sin esta fila
  // el deporte caia en dos tiempos: los botones decian "Fin de cuarto" y el
  // selector solo ofrecia 1T y 2T.
  'american-football': ['Q1', 'Q2', 'Q3', 'Q4'],
};

/**
 * Mismos buckets que `normalizeSportBucket` de matchEventCatalog y que
 * `normalizeClockSportBucket` de matchClock, resuelto de nuevo aca por la
 * misma razon que en el reloj: este modulo es la HOJA del arbol (lo importan
 * matchClock, localMatchData y el match center) y tiene que poder cargarse en
 * un test de Node sin arrastrar el catalogo de eventos entero.
 *
 * Solo necesita distinguir los deportes de cuartos; el resto cae al default.
 */
function periodSportBucket(sportId?: string | null) {
  const normalized = String(sportId || '').trim().toLowerCase();
  if (normalized === 'hockey' || normalized === 'field-hockey') return 'hockey';
  return normalized;
}

const QUARTERS_SEQUENCE = ['Q1', 'Q2', 'Q3', 'Q4'] as const;

export function getPeriodSequence(ref?: PeriodSportRef): readonly string[] {
  const { sportId, periodRules } = unpackPeriodSportRef(ref);
  // El reglamento del torneo manda sobre el default del deporte.
  if (periodRules) return periodRules.periods === 4 ? QUARTERS_SEQUENCE : DEFAULT_PERIOD_SEQUENCE;
  return SPORT_PERIOD_SEQUENCE[periodSportBucket(sportId)] ?? DEFAULT_PERIOD_SEQUENCE;
}

/** Primer periodo de la segunda mitad: '2T' con dos tiempos, 'Q3' con cuatro. */
function secondHalfOpener(sequence: readonly string[]) {
  return sequence[Math.floor(sequence.length / 2)] ?? DEFAULT_PERIOD_SEQUENCE[1];
}

/**
 * Lo que el operador puede elegir a mano en el reloj: los periodos jugables
 * del deporte con los estados intercalados donde ocurren (previa, entretiempo
 * a la mitad, suplementario, final). Rugby y futbol siguen dando exactamente
 * PRE/1T/HT/2T/ET/FT; el hockey intercala el entretiempo entre Q2 y Q3.
 *
 * Existe porque los dos selectores del match center tenian la lista escrita a
 * mano con vocabulario de mitades: en un partido de hockey se veia el cuarto
 * actual pero no se podia elegir ningun otro.
 */
export function getClockPeriodOptions(sportId?: PeriodSportRef): string[] {
  const sequence = getPeriodSequence(sportId);
  const half = Math.floor(sequence.length / 2);
  return ['PRE', ...sequence.slice(0, half), 'HT', ...sequence.slice(half), 'ET', 'FT'];
}

/** Periodos en los que puede vivir un evento: los jugables, el suplementario y el cierre. */
export function getEventPeriodOptions(sportId?: PeriodSportRef): string[] {
  return [...getPeriodSequence(sportId), 'ET', 'FT'];
}

function stripAccents(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

export function normalizeMatchPeriod(value: unknown, fallback = DEFAULT_MATCH_PERIOD) {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw) return fallback;

  const key = stripAccents(raw).toUpperCase();
  return PERIOD_ALIAS_MAP[key] || raw;
}

export function getMatchPeriodLabel(value: unknown) {
  const period = normalizeMatchPeriod(value);
  return PERIOD_LABELS[period] || period;
}

export function getMatchPeriodOrder(value: unknown) {
  const period = normalizeMatchPeriod(value);
  return PERIOD_ORDER[period] ?? 1000;
}

// 'start_period' es el arranque generico de periodo: abre tanto el 1T como el 2T.
// Devolver '1T' fijo hacia RETROCEDER el periodo, porque el 'match_half' previo
// ya lo habia adelantado a '2T': la carga en vivo quedaba clavada en el primer
// tiempo despues del entretiempo. Ahora abre el periodo PENDIENTE.
// 'match_start' (saque inicial) si es siempre 1T y no cambia.
function resolveStartedPeriod(period: string, sequence: readonly string[]) {
  if (period === 'PRE') return sequence[0];
  if (period === 'HT') return secondHalfOpener(sequence);
  return period;
}

export function getEventPeriodForType(eventType: string, activePeriod: unknown, sportId?: PeriodSportRef) {
  const period = normalizeMatchPeriod(activePeriod);
  const sequence = getPeriodSequence(sportId);

  if (eventType === 'match_start') return sequence[0];
  if (eventType === 'start_period') return resolveStartedPeriod(period, sequence);
  if (eventType === 'match_half') {
    return period === 'PRE' || period === 'HT' || period === 'FT' ? sequence[0] : period;
  }
  if (eventType === 'match_end') {
    return period === 'PRE' || period === 'HT' ? sequence[sequence.length - 1] : period;
  }

  return period;
}

export function getNextActivePeriodAfterEvent(eventType: string, activePeriod: unknown, sportId?: PeriodSportRef) {
  const period = normalizeMatchPeriod(activePeriod);
  const sequence = getPeriodSequence(sportId);

  if (eventType === 'match_start') return sequence[0];
  if (eventType === 'start_period') return resolveStartedPeriod(period, sequence);
  // El entretiempo cae a la mitad de la secuencia: '2T' con dos tiempos, 'Q3'
  // con cuatro. Para rugby y futbol devuelve exactamente lo mismo que antes.
  if (eventType === 'match_half') return secondHalfOpener(sequence);
  if (eventType === 'match_end') return 'FT';
  if (eventType === 'end_period') {
    if (period === 'HT') return secondHalfOpener(sequence);
    if (period === 'ET') return 'FT';
    const index = sequence.indexOf(period);
    if (index >= 0) return index < sequence.length - 1 ? sequence[index + 1] : 'FT';
    // Periodo desconocido para este deporte (un partido viejo de hockey
    // guardado como '1T'): se cierra al final en vez de quedarse trabado.
    if (period === '1T') return secondHalfOpener(sequence);
    if (period === '2T') return 'FT';
  }

  return period;
}

export function isPeriodTransitionEvent(eventType: string) {
  return eventType === 'match_start'
    || eventType === 'match_half'
    || eventType === 'match_end'
    || eventType === 'start_period'
    || eventType === 'end_period';
}

export function compareMatchPeriodValues(left: unknown, right: unknown) {
  const orderDiff = getMatchPeriodOrder(left) - getMatchPeriodOrder(right);
  if (orderDiff !== 0) return orderDiff;
  return normalizeMatchPeriod(left).localeCompare(normalizeMatchPeriod(right), 'es', { sensitivity: 'base' });
}
