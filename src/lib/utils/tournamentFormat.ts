export type TournamentFormatId =
  | 'league'
  | 'groups'
  | 'knockout'
  | 'series'
  | 'swiss'
  | 'event'
  | 'circuit';

export type TournamentFormatPhaseType = 'league' | 'groups' | 'playoff';
export type CircuitChampionMode = 'accumulation' | 'final';

export type TournamentCompetitionParameters = {
  season_model?: 'single_event' | 'circuit';
  repeated_participation?: boolean;
  ranking_scope?: 'match_points' | 'event_points';
  champion_mode?: CircuitChampionMode;
  final_stage_enabled?: boolean;
  events_scoring?: 'placement_points';
  stages_mode?: 'independent_phases' | 'subtournaments';
  stage_ranking_source?: 'phase_standings' | 'final_event_result';
  accumulation_method?: 'sum';
  [key: string]: unknown;
};

const FORMAT_ALIASES: Record<string, TournamentFormatId> = {
  league: 'league',
  liga: 'league',
  'round robin': 'league',
  'round-robin': 'league',
  groups: 'groups',
  'group stage': 'groups',
  'group stage + playoffs': 'groups',
  'group_stage': 'groups',
  'group playoff': 'groups',
  'group-playoff': 'groups',
  knockout: 'knockout',
  elimination: 'knockout',
  'direct elimination': 'knockout',
  'single elimination': 'knockout',
  series: 'series',
  'multiple legs': 'series',
  'multiple-legs': 'series',
  swiss: 'swiss',
  event: 'event',
  evento: 'event',
  'single event': 'event',
  'single-event': 'event',
  'final result': 'event',
  circuit: 'circuit',
  circuito: 'circuit',
};

const FORMAT_LABELS: Record<TournamentFormatId, string> = {
  league: 'Liga',
  groups: 'Grupos + Playoffs',
  knockout: 'Eliminacion Directa',
  series: 'Series / Ida y Vuelta',
  swiss: 'Sistema Suizo',
  event: 'Evento Unico',
  circuit: 'Circuito',
};

const FORMAT_DESCRIPTIONS: Record<TournamentFormatId, string> = {
  league: 'Todos contra todos con tabla por partidos.',
  groups: 'Primera fase por grupos y definicion en cruces.',
  knockout: 'Llaves de eliminacion directa hasta definir campeon.',
  series: 'Cruces a varios partidos o ida y vuelta.',
  swiss: 'Rondas por emparejamientos dinamicos sin eliminacion inmediata.',
  event: 'Evento unico con resultado final o ranking directo, sin fases internas.',
  circuit: 'Multiples eventos durante la temporada con ranking acumulado.',
};

function titleizeFallback(value: string): string {
  return value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((chunk) => chunk.charAt(0).toUpperCase() + chunk.slice(1))
    .join(' ');
}

function resolveKnownTournamentFormat(
  value: string | null | undefined,
): TournamentFormatId | null {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');

  return FORMAT_ALIASES[normalized] || null;
}

export function normalizeTournamentFormat(
  value: string | null | undefined,
  fallback: TournamentFormatId = 'league',
): TournamentFormatId {
  return resolveKnownTournamentFormat(value) || fallback;
}

export function getTournamentFormatLabel(
  value: string | null | undefined,
  fallback = 'Liga',
): string {
  if (!value) return fallback;

  const normalized = resolveKnownTournamentFormat(value);
  return normalized ? FORMAT_LABELS[normalized] : titleizeFallback(String(value));
}

export function getTournamentFormatDescription(
  value: string | null | undefined,
): string | null {
  if (!value) return null;

  const normalized = resolveKnownTournamentFormat(value);
  return normalized ? FORMAT_DESCRIPTIONS[normalized] : null;
}

export function getTournamentFormatPhaseType(
  format: string | null | undefined,
): TournamentFormatPhaseType {
  const normalized = normalizeTournamentFormat(format, 'league');

  if (normalized === 'groups') return 'groups';
  if (normalized === 'knockout') return 'playoff';
  return 'league';
}

export function getTournamentFormatFromPhaseType(
  phaseType: string | null | undefined,
  preferredFormat?: string | null,
): TournamentFormatId {
  const normalizedPhaseType = String(phaseType || '').trim().toLowerCase();

  if (normalizedPhaseType === 'group_stage' || normalizedPhaseType === 'groups') {
    return 'groups';
  }

  if (normalizedPhaseType === 'playoff' || normalizedPhaseType === 'knockout') {
    return 'knockout';
  }

  const preferred = normalizeTournamentFormat(preferredFormat, 'league');
  return preferred === 'circuit' ? 'circuit' : 'league';
}

export function getDefaultTournamentCompetitionParameters(
  format: string | null | undefined,
): TournamentCompetitionParameters {
  const normalized = normalizeTournamentFormat(format, 'league');

  if (normalized === 'circuit') {
    return {
      season_model: 'circuit',
      repeated_participation: true,
      ranking_scope: 'event_points',
      events_scoring: 'placement_points',
      stages_mode: 'subtournaments',
      stage_ranking_source: 'phase_standings',
      accumulation_method: 'sum',
      champion_mode: 'accumulation',
      final_stage_enabled: false,
    };
  }

  return {
    season_model: 'single_event',
    ranking_scope: 'match_points',
  };
}

export function buildTournamentCompetitionConfig(
  format: string | null | undefined,
  parameters?: TournamentCompetitionParameters | null,
) {
  const normalized = normalizeTournamentFormat(format, 'league');
  const mergedParameters: TournamentCompetitionParameters = {
    ...getDefaultTournamentCompetitionParameters(normalized),
    ...(parameters || {}),
  };

  if (normalized === 'circuit') {
    const championMode = mergedParameters.champion_mode === 'final' ? 'final' : 'accumulation';
    mergedParameters.champion_mode = championMode;
    mergedParameters.final_stage_enabled = championMode === 'final';
  }
  else {
    delete mergedParameters.champion_mode;
    delete mergedParameters.final_stage_enabled;
    delete mergedParameters.events_scoring;
    delete mergedParameters.repeated_participation;
  }

  return {
    format_type: normalized,
    parameters: mergedParameters,
  };
}
