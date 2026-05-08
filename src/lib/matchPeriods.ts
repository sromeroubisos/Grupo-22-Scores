export const DEFAULT_MATCH_PERIOD = '1T';

const PERIOD_ALIAS_MAP: Record<string, string> = {
  PRE: 'PRE',
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
  '1T': 10,
  HT: 20,
  '2T': 30,
  ET: 40,
  FT: 50,
};

const PERIOD_LABELS: Record<string, string> = {
  PRE: 'Previa',
  '1T': 'Primer tiempo',
  HT: 'Entretiempo',
  '2T': 'Segundo tiempo',
  ET: 'Suplementario',
  FT: 'Final',
};

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

export function getEventPeriodForType(eventType: string, activePeriod: unknown) {
  const period = normalizeMatchPeriod(activePeriod);

  if (eventType === 'match_start' || eventType === 'start_period') return '1T';
  if (eventType === 'match_half') {
    return period === 'PRE' || period === 'HT' || period === 'FT' ? '1T' : period;
  }
  if (eventType === 'match_end') return period === 'PRE' || period === 'HT' ? '2T' : period;

  return period;
}

export function getNextActivePeriodAfterEvent(eventType: string, activePeriod: unknown) {
  const period = normalizeMatchPeriod(activePeriod);

  if (eventType === 'match_start' || eventType === 'start_period') return '1T';
  if (eventType === 'match_half') return '2T';
  if (eventType === 'match_end') return 'FT';
  if (eventType === 'end_period') {
    if (period === '1T' || period === 'HT') return '2T';
    if (period === '2T' || period === 'ET') return 'FT';
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
