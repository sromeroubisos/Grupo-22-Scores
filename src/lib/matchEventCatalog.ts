export type MatchEventCategory = 'score' | 'card' | 'discipline' | 'substitution' | 'clock' | 'other';
export type MatchEventRequirement = 'required' | 'optional' | 'none';

export interface MatchEventDefinition {
  type: string;
  label: string;
  category: MatchEventCategory;
  points: number;
  team: MatchEventRequirement;
  player: MatchEventRequirement;
}

type ResolveArgs = {
  sportId?: string | null;
  phaseSettings?: Record<string, unknown> | null;
  tournamentRuleset?: Record<string, unknown> | null;
};

const GENERIC_EVENTS: MatchEventDefinition[] = [
  { type: 'score', label: 'Punto', category: 'score', points: 1, team: 'required', player: 'optional' },
  { type: 'yellow_card', label: 'Tarjeta amarilla', category: 'card', points: 0, team: 'required', player: 'optional' },
  { type: 'red_card', label: 'Tarjeta roja', category: 'card', points: 0, team: 'required', player: 'optional' },
  { type: 'substitution', label: 'Cambio', category: 'substitution', points: 0, team: 'required', player: 'optional' },
  { type: 'start_period', label: 'Inicio de período', category: 'clock', points: 0, team: 'none', player: 'none' },
  { type: 'end_period', label: 'Fin de período', category: 'clock', points: 0, team: 'none', player: 'none' },
];

const SPORT_EVENT_PRESETS: Record<string, MatchEventDefinition[]> = {
  rugby: [
    { type: 'try', label: 'Try', category: 'score', points: 5, team: 'required', player: 'optional' },
    { type: 'penalty_try', label: 'Penalty Try', category: 'score', points: 7, team: 'required', player: 'optional' },
    { type: 'conversion', label: 'Conversion', category: 'score', points: 2, team: 'required', player: 'optional' },
    { type: 'penalty', label: 'Penal', category: 'score', points: 3, team: 'required', player: 'optional' },
    { type: 'penalty_goal', label: 'Penal a los palos', category: 'score', points: 3, team: 'required', player: 'optional' },
    { type: 'drop_goal', label: 'Drop', category: 'score', points: 3, team: 'required', player: 'optional' },
    { type: 'card_yellow', label: 'Tarjeta amarilla', category: 'card', points: 0, team: 'required', player: 'optional' },
    { type: 'card_red', label: 'Tarjeta roja', category: 'card', points: 0, team: 'required', player: 'optional' },
    { type: 'substitution', label: 'Cambio', category: 'substitution', points: 0, team: 'required', player: 'optional' },
    { type: 'injury', label: 'Lesion', category: 'other', points: 0, team: 'required', player: 'optional' },
    { type: 'scrum', label: 'Scrum', category: 'other', points: 0, team: 'required', player: 'optional' },
    { type: 'line', label: 'Line', category: 'other', points: 0, team: 'required', player: 'optional' },
    { type: 'knock_on', label: 'Knock-on', category: 'discipline', points: 0, team: 'required', player: 'optional' },
    { type: 'forward_pass', label: 'Pase forward', category: 'discipline', points: 0, team: 'required', player: 'optional' },
    { type: 'penalty_won', label: 'Penal ganado', category: 'discipline', points: 0, team: 'required', player: 'optional' },
    { type: 'penalty_conceded', label: 'Penal concedido', category: 'discipline', points: 0, team: 'required', player: 'optional' },
    { type: 'free_kick', label: 'Free Kick', category: 'discipline', points: 0, team: 'required', player: 'optional' },
    { type: 'tackle', label: 'Tackle', category: 'other', points: 0, team: 'required', player: 'optional' },
    { type: 'ruck', label: 'Ruck', category: 'other', points: 0, team: 'required', player: 'optional' },
    { type: 'maul', label: 'Maul', category: 'other', points: 0, team: 'required', player: 'optional' },
    { type: 'handling_error', label: 'Error de manejo', category: 'discipline', points: 0, team: 'required', player: 'optional' },
    { type: 'kick', label: 'Patada', category: 'other', points: 0, team: 'required', player: 'optional' },
    { type: 'recovery', label: 'Recuperacion', category: 'other', points: 0, team: 'required', player: 'optional' },
    { type: 'turnover_won', label: 'Recuperacion / turnover ganado', category: 'other', points: 0, team: 'required', player: 'optional' },
    { type: 'turnover_lost', label: 'Perdida / turnover perdido', category: 'discipline', points: 0, team: 'required', player: 'optional' },
    { type: 'pass', label: 'Pase', category: 'other', points: 0, team: 'required', player: 'optional' },
    { type: 'match_start', label: 'Inicio partido', category: 'clock', points: 0, team: 'none', player: 'none' },
    { type: 'match_half', label: 'Entretiempo', category: 'clock', points: 0, team: 'none', player: 'none' },
    { type: 'match_end', label: 'Final partido', category: 'clock', points: 0, team: 'none', player: 'none' },
    { type: 'start_period', label: 'Inicio de periodo', category: 'clock', points: 0, team: 'none', player: 'none' },
    { type: 'end_period', label: 'Fin de periodo', category: 'clock', points: 0, team: 'none', player: 'none' },
  ],
  football: [
    { type: 'goal', label: 'Gol', category: 'score', points: 1, team: 'required', player: 'optional' },
    { type: 'penalty_goal', label: 'Gol de penal', category: 'score', points: 1, team: 'required', player: 'optional' },
    { type: 'own_goal', label: 'Gol en contra', category: 'score', points: 1, team: 'required', player: 'optional' },
    { type: 'yellow_card', label: 'Tarjeta amarilla', category: 'card', points: 0, team: 'required', player: 'optional' },
    { type: 'red_card', label: 'Tarjeta roja', category: 'card', points: 0, team: 'required', player: 'optional' },
    { type: 'substitution', label: 'Cambio', category: 'substitution', points: 0, team: 'required', player: 'optional' },
    { type: 'start_period', label: 'Inicio de tiempo', category: 'clock', points: 0, team: 'none', player: 'none' },
    { type: 'end_period', label: 'Fin de tiempo', category: 'clock', points: 0, team: 'none', player: 'none' },
  ],
  basketball: [
    { type: 'free_throw', label: 'Tiro libre', category: 'score', points: 1, team: 'required', player: 'optional' },
    { type: 'two_pointer', label: 'Doble', category: 'score', points: 2, team: 'required', player: 'optional' },
    { type: 'three_pointer', label: 'Triple', category: 'score', points: 3, team: 'required', player: 'optional' },
    { type: 'foul', label: 'Falta', category: 'discipline', points: 0, team: 'required', player: 'optional' },
    { type: 'timeout', label: 'Tiempo muerto', category: 'other', points: 0, team: 'required', player: 'none' },
    { type: 'substitution', label: 'Cambio', category: 'substitution', points: 0, team: 'required', player: 'optional' },
    { type: 'start_period', label: 'Inicio de cuarto', category: 'clock', points: 0, team: 'none', player: 'none' },
    { type: 'end_period', label: 'Fin de cuarto', category: 'clock', points: 0, team: 'none', player: 'none' },
  ],
  hockey: [
    { type: 'goal', label: 'Gol', category: 'score', points: 1, team: 'required', player: 'optional' },
    { type: 'penalty_goal', label: 'Gol de penal', category: 'score', points: 1, team: 'required', player: 'optional' },
    { type: 'green_card', label: 'Tarjeta verde', category: 'card', points: 0, team: 'required', player: 'optional' },
    { type: 'yellow_card', label: 'Tarjeta amarilla', category: 'card', points: 0, team: 'required', player: 'optional' },
    { type: 'red_card', label: 'Tarjeta roja', category: 'card', points: 0, team: 'required', player: 'optional' },
    { type: 'substitution', label: 'Cambio', category: 'substitution', points: 0, team: 'required', player: 'optional' },
    { type: 'start_period', label: 'Inicio de cuarto', category: 'clock', points: 0, team: 'none', player: 'none' },
    { type: 'end_period', label: 'Fin de cuarto', category: 'clock', points: 0, team: 'none', player: 'none' },
  ],
  handball: [
    { type: 'goal', label: 'Gol', category: 'score', points: 1, team: 'required', player: 'optional' },
    { type: 'seven_meter_goal', label: 'Gol de 7m', category: 'score', points: 1, team: 'required', player: 'optional' },
    { type: 'yellow_card', label: 'Tarjeta amarilla', category: 'card', points: 0, team: 'required', player: 'optional' },
    { type: 'red_card', label: 'Tarjeta roja', category: 'card', points: 0, team: 'required', player: 'optional' },
    { type: 'two_min_suspension', label: 'Suspensión 2 min', category: 'discipline', points: 0, team: 'required', player: 'optional' },
    { type: 'substitution', label: 'Cambio', category: 'substitution', points: 0, team: 'required', player: 'optional' },
    { type: 'start_period', label: 'Inicio de tiempo', category: 'clock', points: 0, team: 'none', player: 'none' },
    { type: 'end_period', label: 'Fin de tiempo', category: 'clock', points: 0, team: 'none', player: 'none' },
  ],
  volleyball: [
    { type: 'point', label: 'Punto', category: 'score', points: 1, team: 'required', player: 'optional' },
    { type: 'ace', label: 'Ace', category: 'score', points: 1, team: 'required', player: 'optional' },
    { type: 'block_point', label: 'Bloqueo ganador', category: 'score', points: 1, team: 'required', player: 'optional' },
    { type: 'timeout', label: 'Tiempo muerto', category: 'other', points: 0, team: 'required', player: 'none' },
    { type: 'substitution', label: 'Cambio', category: 'substitution', points: 0, team: 'required', player: 'optional' },
    { type: 'yellow_card', label: 'Tarjeta amarilla', category: 'card', points: 0, team: 'required', player: 'optional' },
    { type: 'red_card', label: 'Tarjeta roja', category: 'card', points: 0, team: 'required', player: 'optional' },
    { type: 'start_period', label: 'Inicio de set', category: 'clock', points: 0, team: 'none', player: 'none' },
    { type: 'end_period', label: 'Fin de set', category: 'clock', points: 0, team: 'none', player: 'none' },
  ],
  'american-football': [
    { type: 'touchdown', label: 'Touchdown', category: 'score', points: 6, team: 'required', player: 'optional' },
    { type: 'field_goal', label: 'Field goal', category: 'score', points: 3, team: 'required', player: 'optional' },
    { type: 'extra_point', label: 'Punto extra', category: 'score', points: 1, team: 'required', player: 'optional' },
    { type: 'two_point_conversion', label: 'Conversión de 2', category: 'score', points: 2, team: 'required', player: 'optional' },
    { type: 'safety', label: 'Safety', category: 'score', points: 2, team: 'required', player: 'optional' },
    { type: 'penalty', label: 'Penalidad', category: 'discipline', points: 0, team: 'required', player: 'optional' },
    { type: 'timeout', label: 'Tiempo muerto', category: 'other', points: 0, team: 'required', player: 'none' },
    { type: 'start_period', label: 'Inicio de cuarto', category: 'clock', points: 0, team: 'none', player: 'none' },
    { type: 'end_period', label: 'Fin de cuarto', category: 'clock', points: 0, team: 'none', player: 'none' },
  ],
  baseball: [
    { type: 'run', label: 'Carrera', category: 'score', points: 1, team: 'required', player: 'optional' },
    { type: 'home_run', label: 'Home run', category: 'score', points: 1, team: 'required', player: 'optional' },
    { type: 'strikeout', label: 'Strikeout', category: 'other', points: 0, team: 'required', player: 'optional' },
    { type: 'error', label: 'Error', category: 'other', points: 0, team: 'required', player: 'optional' },
    { type: 'substitution', label: 'Cambio', category: 'substitution', points: 0, team: 'required', player: 'optional' },
    { type: 'start_period', label: 'Inicio de inning', category: 'clock', points: 0, team: 'none', player: 'none' },
    { type: 'end_period', label: 'Fin de inning', category: 'clock', points: 0, team: 'none', player: 'none' },
  ],
};

function cloneDefinitions(definitions: MatchEventDefinition[]) {
  return definitions.map((definition) => ({ ...definition }));
}

function normalizeSportBucket(sportId?: string | null) {
  const normalized = String(sportId || '').trim().toLowerCase();

  if (!normalized) return 'generic';
  if (['rugby', 'rugby-union', 'rugby-league', 'rugby7s', 'rugby-7s'].includes(normalized)) return 'rugby';
  if (['football', 'futsal', 'beach-soccer'].includes(normalized)) return 'football';
  if (['hockey', 'field-hockey'].includes(normalized)) return 'hockey';

  return normalized;
}

function isCategory(value: unknown): value is MatchEventCategory {
  return value === 'score' || value === 'card' || value === 'discipline' || value === 'substitution' || value === 'clock' || value === 'other';
}

function isRequirement(value: unknown): value is MatchEventRequirement {
  return value === 'required' || value === 'optional' || value === 'none';
}

function normalizeStoredDefinitions(
  definitions: unknown,
  fallback: MatchEventDefinition[],
): MatchEventDefinition[] {
  if (!Array.isArray(definitions)) {
    return cloneDefinitions(fallback);
  }

  const normalized = definitions
    .map((item) => {
      if (!item || typeof item !== 'object') return null;

      const candidate = item as Partial<MatchEventDefinition> & { key?: string; id?: string };
      const type = typeof candidate.type === 'string' && candidate.type.trim()
        ? candidate.type.trim()
        : typeof candidate.key === 'string' && candidate.key.trim()
          ? candidate.key.trim()
          : typeof candidate.id === 'string' && candidate.id.trim()
            ? candidate.id.trim()
            : '';

      if (!type) return null;

      const fallbackDefinition = fallback.find((definition) => definition.type === type);
      const label = typeof candidate.label === 'string' && candidate.label.trim()
        ? candidate.label.trim()
        : fallbackDefinition?.label || type;
      const category = isCategory(candidate.category)
        ? candidate.category
        : fallbackDefinition?.category || 'other';
      const points = Number.isFinite(Number(candidate.points)) ? Number(candidate.points) : fallbackDefinition?.points || 0;
      const team = isRequirement(candidate.team) ? candidate.team : fallbackDefinition?.team || 'optional';
      const player = isRequirement(candidate.player) ? candidate.player : fallbackDefinition?.player || 'optional';

      return {
        type,
        label,
        category,
        points,
        team,
        player,
      } satisfies MatchEventDefinition;
    })
    .filter((definition): definition is MatchEventDefinition => Boolean(definition));

  if (normalized.length === 0) {
    return cloneDefinitions(fallback);
  }

  return normalized.filter((definition, index) =>
    normalized.findIndex((candidate) => candidate.type === definition.type) === index || definition.type.startsWith('custom_'),
  );
}

export function getDefaultMatchEventDefinitions(sportId?: string | null): MatchEventDefinition[] {
  const bucket = normalizeSportBucket(sportId);
  return cloneDefinitions(SPORT_EVENT_PRESETS[bucket] || GENERIC_EVENTS);
}

export function resolveMatchEventDefinitions({ sportId, phaseSettings, tournamentRuleset }: ResolveArgs): MatchEventDefinition[] {
  const fallback = getDefaultMatchEventDefinitions(sportId);
  const configured =
    phaseSettings?.matchEvents ??
    (phaseSettings?.matchRules as Record<string, unknown> | undefined)?.enabledEvents ??
    tournamentRuleset?.matchEvents ??
    (tournamentRuleset?.matchRules as Record<string, unknown> | undefined)?.enabledEvents ??
    null;

  return normalizeStoredDefinitions(configured, fallback);
}

export function buildMatchEventDefinitionMap(definitions: MatchEventDefinition[]) {
  return definitions.reduce<Record<string, MatchEventDefinition>>((acc, definition) => {
    acc[definition.type] = definition;
    return acc;
  }, {});
}
