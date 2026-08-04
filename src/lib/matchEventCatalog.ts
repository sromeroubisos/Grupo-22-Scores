export type MatchEventCategory = 'score' | 'card' | 'discipline' | 'substitution' | 'clock' | 'other';
export type MatchEventRequirement = 'required' | 'optional' | 'none';

export interface MatchEventDefinition {
  type: string;
  label: string;
  category: MatchEventCategory;
  points: number;
  team: MatchEventRequirement;
  player: MatchEventRequirement;
  /**
   * El evento se carga a un equipo pero los puntos van al RIVAL. Hoy lo usa el
   * gol en contra, y es la unica forma de modelarlo sin mentir en la planilla:
   * el gol lo hace un jugador de un equipo (por eso se carga ahi, y por eso la
   * tarjeta o el jugador quedan bien atribuidos), pero el tanto es del otro.
   *
   * Va como DATO del evento y no como `if (type === 'own_goal')` porque los
   * puntos se atribuyen en cinco lugares distintos; con un if disperso alcanza
   * con olvidarse de uno para que el marcador y la tabla dejen de coincidir.
   */
  creditsOpponent?: boolean;
  /**
   * El evento es un TIRO A LOS PALOS: puede errarse, y si se erra no suma. Lo
   * declara el rugby (conversion, penal a palos, drop) y nadie mas.
   *
   * Existe porque la deteccion vivia en `isGoalKickEventType`, que decide por
   * NOMBRE DE TIPO — y `penalty_goal` es a la vez el penal a los palos del
   * rugby y el gol de penal del futbol. Resultado: un gol de penal de futbol
   * con un detalle que dijera "fallo el arquero" se anulaba solo. En futbol el
   * gol de penal ya es el gol convertido; no hay nada que errar.
   */
  kickAtGoal?: boolean;
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
    { type: 'conversion', label: 'Conversion', category: 'score', points: 2, team: 'required', player: 'optional', kickAtGoal: true },
    { type: 'penalty', label: 'Penal', category: 'score', points: 3, team: 'required', player: 'optional', kickAtGoal: true },
    { type: 'penalty_goal', label: 'Penal a los palos', category: 'score', points: 3, team: 'required', player: 'optional', kickAtGoal: true },
    { type: 'drop_goal', label: 'Drop', category: 'score', points: 3, team: 'required', player: 'optional', kickAtGoal: true },
    { type: 'card_yellow', label: 'Tarjeta amarilla', category: 'card', points: 0, team: 'required', player: 'optional' },
    { type: 'card_red', label: 'Tarjeta roja', category: 'card', points: 0, team: 'required', player: 'optional' },
    { type: 'substitution', label: 'Cambio', category: 'substitution', points: 0, team: 'required', player: 'optional' },
    { type: 'injury', label: 'Lesion', category: 'other', points: 0, team: 'required', player: 'optional' },
    { type: 'scrum', label: 'Scrum', category: 'other', points: 0, team: 'required', player: 'optional' },
    { type: 'line', label: 'Line', category: 'other', points: 0, team: 'required', player: 'optional' },
    { type: 'knock_on', label: 'Knock-on', category: 'discipline', points: 0, team: 'required', player: 'optional' },
    { type: 'forward_pass', label: 'Pase forward', category: 'discipline', points: 0, team: 'required', player: 'optional' },
    { type: 'penalty_committed', label: 'Penal cometido', category: 'discipline', points: 0, team: 'required', player: 'none' },
    { type: 'free_kick', label: 'Free Kick', category: 'discipline', points: 0, team: 'required', player: 'optional' },
    { type: 'tackle', label: 'Tackle', category: 'other', points: 0, team: 'required', player: 'optional' },
    { type: 'ruck', label: 'Ruck', category: 'other', points: 0, team: 'required', player: 'optional' },
    { type: 'maul', label: 'Maul', category: 'other', points: 0, team: 'required', player: 'optional' },
    { type: 'handling_error', label: 'Error de manejo', category: 'discipline', points: 0, team: 'required', player: 'optional' },
    { type: 'kick', label: 'Patada', category: 'other', points: 0, team: 'required', player: 'optional' },
    { type: 'recovery', label: 'Recuperacion', category: 'other', points: 0, team: 'required', player: 'optional' },
    { type: 'turnover_won', label: 'Recuperacion / turnover ganado', category: 'other', points: 0, team: 'required', player: 'optional' },
    { type: 'turnover_lost', label: 'Perdida / turnover perdido', category: 'discipline', points: 0, team: 'required', player: 'optional' },
    { type: 'entradas_22', label: 'Entradas en 22', category: 'other', points: 0, team: 'required', player: 'optional' },
    { type: 'pass', label: 'Pase', category: 'other', points: 0, team: 'required', player: 'optional' },
    { type: 'match_start', label: 'Inicio partido', category: 'clock', points: 0, team: 'none', player: 'none' },
    { type: 'match_half', label: 'Entretiempo', category: 'clock', points: 0, team: 'none', player: 'none' },
    { type: 'match_end', label: 'Final partido', category: 'clock', points: 0, team: 'none', player: 'none' },
    { type: 'start_period', label: 'Inicio de periodo', category: 'clock', points: 0, team: 'none', player: 'none' },
    { type: 'end_period', label: 'Fin de periodo', category: 'clock', points: 0, team: 'none', player: 'none' },
  ],
  /**
   * Futbol: el marcador se construye EXCLUSIVAMENTE con estos tres eventos de
   * gol. No hay carga manual del resultado (ver `isManualScoreLocked`).
   *
   * Los cuatro eventos de reloj son la secuencia completa del partido y estan
   * en el orden en que se aprietan:
   *   Inicio del partido   -> rebasa a 1T (00:00)
   *   Fin del primer tiempo-> pausa conservando el tiempo corrido
   *   Inicio del 2do tiempo-> rebasa al offset del 2T (45:00)
   *   Final del partido    -> pausa y cierra en FT
   * `end_period` queda para cerrar el suplementario, que la secuencia de arriba
   * no cubre.
   */
  football: [
    { type: 'goal', label: 'Gol', category: 'score', points: 1, team: 'required', player: 'optional' },
    { type: 'penalty_goal', label: 'Gol de penal', category: 'score', points: 1, team: 'required', player: 'optional' },
    // Se carga al equipo del jugador que lo hizo; el gol se lo lleva el rival.
    { type: 'own_goal', label: 'Gol en contra', category: 'score', points: 1, team: 'required', player: 'optional', creditsOpponent: true },
    { type: 'yellow_card', label: 'Tarjeta amarilla', category: 'card', points: 0, team: 'required', player: 'optional' },
    { type: 'red_card', label: 'Tarjeta roja', category: 'card', points: 0, team: 'required', player: 'optional' },
    { type: 'substitution', label: 'Cambio', category: 'substitution', points: 0, team: 'required', player: 'optional' },
    { type: 'match_start', label: 'Inicio del partido', category: 'clock', points: 0, team: 'none', player: 'none' },
    { type: 'match_half', label: 'Fin del primer tiempo', category: 'clock', points: 0, team: 'none', player: 'none' },
    { type: 'start_period', label: 'Inicio del segundo tiempo', category: 'clock', points: 0, team: 'none', player: 'none' },
    { type: 'match_end', label: 'Final del partido', category: 'clock', points: 0, team: 'none', player: 'none' },
    { type: 'end_period', label: 'Fin de período', category: 'clock', points: 0, team: 'none', player: 'none' },
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

const REMOVED_MATCH_EVENT_TYPES = new Set(['penalty_won', 'penalty_conceded']);

function cloneDefinitions(definitions: MatchEventDefinition[]) {
  return definitions.map((definition) => ({ ...definition }));
}

/**
 * Bucket de comportamiento de un deporte. Es la clave con la que se resuelven
 * el catalogo de eventos Y el reparto de estadisticas: cada deporte muestra lo
 * suyo y nada mas.
 */
export function normalizeSportBucket(sportId?: string | null) {
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
    .map((item): MatchEventDefinition | null => {
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
      if (REMOVED_MATCH_EVENT_TYPES.has(type)) return null;

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
      // Se hereda del preset salvo que la config lo diga explicitamente. Sin
      // esto, un torneo con `matchEvents` guardados perdia el flag y el gol en
      // contra volvia a sumarle al equipo equivocado.
      const creditsOpponent = typeof candidate.creditsOpponent === 'boolean'
        ? candidate.creditsOpponent
        : fallbackDefinition?.creditsOpponent ?? false;
      const kickAtGoal = typeof candidate.kickAtGoal === 'boolean'
        ? candidate.kickAtGoal
        : fallbackDefinition?.kickAtGoal ?? false;

      return {
        type,
        label,
        category,
        points,
        team,
        player,
        creditsOpponent,
        kickAtGoal,
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

/**
 * Deportes cuyo marcador se construye EXCLUSIVAMENTE con los eventos cargados.
 * En estos no hay carga manual del resultado: el numero sale de la planilla o
 * no sale. Hoy es futbol (y su bucket: futsal, futbol playa).
 *
 * En rugby la carga manual se conserva a proposito: el marcador puede venir de
 * una planilla en papel sin evento por evento, y el `manualOverride` con
 * `cutoffMinute` existe justamente para eso.
 */
export function isEventDrivenScoreSport(sportId?: string | null): boolean {
  return normalizeSportBucket(sportId) === 'football';
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
