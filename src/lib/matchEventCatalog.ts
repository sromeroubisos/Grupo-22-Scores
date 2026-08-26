/**
 * `shootout` es su propia categoria y no `other` a proposito: la definicion por
 * shoot-out NO es parte del partido. El resultado reglamentario queda empatado
 * y el shoot-out solo decide quien avanza, asi que sus eventos no pueden caer
 * en el mismo grupo que una intercepcion ni sumar al marcador.
 */
import {
  buildAmericanFootballEventDefinitions,
  createAmericanFootballRuleset,
  readAmericanFootballRuleset,
} from './americanFootballRules.ts';

export type MatchEventCategory = 'score' | 'card' | 'discipline' | 'substitution' | 'clock' | 'shootout' | 'other';
export type MatchEventRequirement = 'required' | 'optional' | 'none';

/**
 * Un desenlace posible de un evento que puede terminar de varias formas.
 *
 * Es la version general de lo que el rugby resuelve con `kickAtGoal`: aquello
 * detecta el tiro a los palos POR NOMBRE DE TIPO (`isGoalKickEventType`) y solo
 * distingue acertada/fallada. Un corner corto de hockey tiene seis desenlaces y
 * ninguno se llama como un evento de rugby, asi que necesita declararlos.
 *
 * El elegido se guarda en `detail` con el prefijo `[res:<id>]`, igual que el
 * `[palos:miss]` que ya escribe el asistente de partido.
 */
export interface MatchEventOutcome {
  id: string;
  label: string;
  /** Este desenlace CONVIERTE: el evento suma sus puntos. */
  scores?: boolean;
}

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
  /**
   * Desenlaces posibles. Si estan declarados, el evento SOLO suma sus puntos
   * cuando el desenlace elegido tiene `scores: true`.
   *
   * Un corner corto que termina en gol es UN evento con su resultado, no un
   * corner mas un gol: cargar los dos duplicaria el marcador, y un tipo de gol
   * aparte (`penalty_corner_goal`) miente sobre el deporte, porque en hockey un
   * gol de corner corto es un gol y la diferencia es estadistica.
   */
  outcomes?: MatchEventOutcome[];
  /**
   * Desenlace que se asume cuando el evento NO trae marca `[res:]`.
   *
   * Existe para el touchdown: sus desenlaces son el TIPO (carrera, pase,
   * devolucion) y todos suman seis. Un touchdown importado de ESPN o cargado
   * antes de que existieran los tipos no tiene marca, y sin este campo
   * `outcomeScores` lo trataria como un corner corto sin resultado: cero
   * puntos. Un corner sin desenlace sigue sin sumar, porque no lo declara.
   */
  defaultOutcome?: string;
  /**
   * Como se le pregunta al operador por el desenlace. "Como termino" sirve
   * para un corner corto; a un touchdown se le pregunta "Tipo de touchdown".
   */
  outcomePrompt?: string;
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
  /**
   * Hockey sobre cesped. Tres cosas a tener en cuenta si lo tocas:
   *
   * 1. LOS TRES GOLES VALEN 1 Y SON EXCLUYENTES. Un gol de jugada, uno de
   *    corner corto y uno de penal stroke son el MISMO tanto contado una vez.
   *    No agregues un "corner corto convertido" ADEMAS del gol: se duplica el
   *    marcador.
   *
   * 2. LO FALLADO ES DERIVADO, no un evento. El corner corto se carga cuando se
   *    OTORGA (`penalty_corner`) y el gol cuando entra; los fallados son la
   *    resta. Un evento "corner fallado" obligaria a cargar dos eventos por
   *    jugada y abre la puerta a que las dos cuentas no cierren. Idem stroke.
   *
   * 3. LA POSESION NO ENTRA. Es una medida continua, no un hecho puntual: no
   *    hay minuto en el que "pase" la posesion. Se estima desde pases y
   *    perdidas, no se carga.
   */
  hockey: [
    /* ── Anotacion ──
     * Tres formas de convertir y UNA sola de sumar: el gol de jugada es su
     * propio evento, y los de jugada fija son el corner o el stroke CON su
     * desenlace. No hay un tipo "gol de corner corto": en hockey eso es un gol
     * y la diferencia es estadistica, no de marcador. */
    { type: 'goal', label: 'Gol', category: 'score', points: 1, team: 'required', player: 'optional' },
    {
      type: 'penalty_corner',
      label: 'Corner corto',
      category: 'score',
      points: 1,
      team: 'required',
      player: 'optional',
      // Suma solo si termino en gol. Los otros cinco desenlaces son la razon
      // por la que el corner NO puede ser un evento sin resultado: de aca sale
      // la efectividad, que es la estadistica mas mirada del deporte.
      outcomes: [
        { id: 'goal', label: 'Gol', scores: true },
        { id: 'shot_on_goal', label: 'Tiro al arco' },
        { id: 'wide', label: 'Desviado' },
        { id: 'defended', label: 'Recuperado por la defensa' },
        { id: 'penalty_stroke', label: 'Penal' },
        { id: 'new_corner', label: 'Nuevo corner' },
      ],
    },
    {
      // En la cancha se dice "penal", a secas. El id conserva "stroke" para
      // que los datos guardados y el parser de la FIH sigan entendiendose.
      type: 'penalty_stroke',
      label: 'Penal',
      category: 'score',
      points: 1,
      team: 'required',
      player: 'optional',
      outcomes: [
        { id: 'goal', label: 'Gol', scores: true },
        { id: 'saved', label: 'Atajado' },
        { id: 'wide', label: 'Desviado' },
      ],
    },
    /* ── Ataque ── */
    { type: 'assist', label: 'Asistencia', category: 'other', points: 0, team: 'required', player: 'optional' },
    { type: 'shot_on_goal', label: 'Tiro al arco', category: 'other', points: 0, team: 'required', player: 'optional' },
    { type: 'shot_off_target', label: 'Tiro desviado', category: 'other', points: 0, team: 'required', player: 'optional' },
    { type: 'circle_entry', label: 'Ingreso al circulo', category: 'other', points: 0, team: 'required', player: 'optional' },
    /* ── Defensa ── */
    { type: 'interception', label: 'Intercepcion', category: 'other', points: 0, team: 'required', player: 'optional' },
    { type: 'tackle', label: 'Quite', category: 'other', points: 0, team: 'required', player: 'optional' },
    { type: 'recovery', label: 'Recuperacion', category: 'other', points: 0, team: 'required', player: 'optional' },
    { type: 'block', label: 'Bloqueo', category: 'other', points: 0, team: 'required', player: 'optional' },
    { type: 'save', label: 'Atajada del arquero', category: 'other', points: 0, team: 'required', player: 'optional' },
    { type: 'clearance', label: 'Despeje', category: 'other', points: 0, team: 'required', player: 'optional' },
    /* ── Disciplina ──
     * La falta es la accion mas repetida del deporte y de ella nace casi todo
     * free hit, asi que las dos van juntas. */
    { type: 'foul', label: 'Falta', category: 'discipline', points: 0, team: 'required', player: 'optional' },
    { type: 'free_hit', label: 'Free hit', category: 'discipline', points: 0, team: 'required', player: 'optional' },
    { type: 'turnover_lost', label: 'Perdida', category: 'discipline', points: 0, team: 'required', player: 'optional' },
    { type: 'green_card', label: 'Tarjeta verde', category: 'card', points: 0, team: 'required', player: 'optional' },
    { type: 'yellow_card', label: 'Tarjeta amarilla', category: 'card', points: 0, team: 'required', player: 'optional' },
    { type: 'red_card', label: 'Tarjeta roja', category: 'card', points: 0, team: 'required', player: 'optional' },
    { type: 'substitution', label: 'Cambio', category: 'substitution', points: 0, team: 'required', player: 'optional' },
    /* ── Definicion por shoot-out ──
     * Fuera del partido: `points: 0` y categoria propia. El resultado
     * reglamentario queda empatado; esto solo decide quien avanza. */
    { type: 'shootout_start', label: 'Inicio de shoot-outs', category: 'shootout', points: 0, team: 'none', player: 'none' },
    { type: 'shootout_scored', label: 'Shoot-out convertido', category: 'shootout', points: 0, team: 'required', player: 'optional' },
    { type: 'shootout_missed', label: 'Shoot-out fallado', category: 'shootout', points: 0, team: 'required', player: 'optional' },
    { type: 'shootout_end', label: 'Fin de shoot-outs', category: 'shootout', points: 0, team: 'none', player: 'none' },
    /* ── Reloj: cuatro cuartos de 15', con el descanso largo entre Q2 y Q3 ── */
    { type: 'match_start', label: 'Inicio del partido', category: 'clock', points: 0, team: 'none', player: 'none' },
    { type: 'end_period', label: 'Fin de cuarto', category: 'clock', points: 0, team: 'none', player: 'none' },
    { type: 'start_period', label: 'Inicio de cuarto', category: 'clock', points: 0, team: 'none', player: 'none' },
    { type: 'match_half', label: 'Entretiempo', category: 'clock', points: 0, team: 'none', player: 'none' },
    { type: 'match_end', label: 'Final del partido', category: 'clock', points: 0, team: 'none', player: 'none' },
  ],
  /* ── Handball ──
   * Entra SIN proveedor externo: todo lo que se vea sale de alguien cargando el
   * partido a mano, asi que el catalogo tiene que alcanzar solo. Los tipos que
   * ya estaban (`seven_meter_goal`, `two_min_suspension`) NO se renombran:
   * cualquier evento guardado con esos nombres dejaria de resolver.
   */
  handball: [
    { type: 'goal', label: 'Gol', category: 'score', points: 1, team: 'required', player: 'optional' },
    { type: 'seven_meter_goal', label: 'Gol de 7m', category: 'score', points: 1, team: 'required', player: 'optional' },
    { type: 'seven_meter_miss', label: '7m errado', category: 'other', points: 0, team: 'required', player: 'optional' },
    { type: 'save', label: 'Atajada', category: 'other', points: 0, team: 'required', player: 'optional' },
    { type: 'yellow_card', label: 'Tarjeta amarilla', category: 'card', points: 0, team: 'required', player: 'optional' },
    { type: 'two_min_suspension', label: 'Suspensión 2 min', category: 'discipline', points: 0, team: 'required', player: 'optional' },
    { type: 'red_card', label: 'Tarjeta roja', category: 'card', points: 0, team: 'required', player: 'optional' },
    { type: 'blue_card', label: 'Tarjeta azul', category: 'card', points: 0, team: 'required', player: 'optional' },
    { type: 'timeout', label: 'Tiempo muerto', category: 'other', points: 0, team: 'required', player: 'none' },
    { type: 'substitution', label: 'Cambio', category: 'substitution', points: 0, team: 'required', player: 'optional' },
    { type: 'match_start', label: 'Inicio del partido', category: 'clock', points: 0, team: 'none', player: 'none' },
    { type: 'start_period', label: 'Inicio de tiempo', category: 'clock', points: 0, team: 'none', player: 'none' },
    { type: 'end_period', label: 'Fin de tiempo', category: 'clock', points: 0, team: 'none', player: 'none' },
    { type: 'match_half', label: 'Entretiempo', category: 'clock', points: 0, team: 'none', player: 'none' },
    { type: 'match_end', label: 'Final del partido', category: 'clock', points: 0, team: 'none', player: 'none' },
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
  /**
   * Futbol americano: el catalogo NO vive aca. Sale del reglamento del torneo
   * (tackle o flag, con o sin patadas) en americanFootballRules.ts, y este
   * preset es ese mismo catalogo con el reglamento NFL, para los partidos
   * cuyo torneo no declara ninguno.
   */
  'american-football': buildAmericanFootballEventDefinitions(createAmericanFootballRuleset('nfl')),
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
  return value === 'score' || value === 'card' || value === 'discipline' || value === 'substitution'
    || value === 'clock' || value === 'shootout' || value === 'other';
}

function normalizeOutcomes(value: unknown, fallback: MatchEventOutcome[] | undefined) {
  if (!Array.isArray(value)) return fallback;

  const normalized = value
    .map((item): MatchEventOutcome | null => {
      if (!item || typeof item !== 'object') return null;
      const candidate = item as Partial<MatchEventOutcome>;
      const id = typeof candidate.id === 'string' ? candidate.id.trim() : '';
      if (!id) return null;
      const fallbackOutcome = fallback?.find((outcome) => outcome.id === id);
      return {
        id,
        label: typeof candidate.label === 'string' && candidate.label.trim()
          ? candidate.label.trim()
          : fallbackOutcome?.label || id,
        scores: typeof candidate.scores === 'boolean' ? candidate.scores : fallbackOutcome?.scores,
      };
    })
    .filter((outcome): outcome is MatchEventOutcome => Boolean(outcome));

  return normalized.length > 0 ? normalized : fallback;
}

/** Marca con la que el desenlace elegido viaja dentro de `detail`. */
export function formatOutcomeTag(outcomeId: string) {
  return `[res:${outcomeId}]`;
}

/** Lee el desenlace guardado en `detail`. null si el evento no lleva ninguno. */
export function readOutcomeId(detail: string | null | undefined): string | null {
  const match = String(detail || '').match(/\[res:([a-z0-9_-]+)\]/i);
  return match ? match[1].toLowerCase() : null;
}

/**
 * Si el desenlace registrado convierte. Sin desenlace cargado NO convierte: un
 * corner corto del que no se sabe como termino no es un gol.
 */
export function outcomeScores(definition: MatchEventDefinition | undefined, detail: string | null | undefined) {
  if (!definition?.outcomes?.length) return true;
  const outcomeId = resolveOutcomeId(definition, detail);
  if (!outcomeId) return false;
  return Boolean(definition.outcomes.find((outcome) => outcome.id === outcomeId)?.scores);
}

/**
 * El desenlace efectivo: el guardado en `detail`, o el `defaultOutcome` de la
 * definicion si no hay marca. Es lo que tienen que leer las estadisticas para
 * clasificar (un touchdown sin tipo cae en `other`, no desaparece).
 */
export function resolveOutcomeId(definition: MatchEventDefinition | undefined, detail: string | null | undefined): string | null {
  return readOutcomeId(detail) ?? definition?.defaultOutcome ?? null;
}

const OUTCOME_TAG_RE = /\[res:[a-z0-9_-]+\]\s*/gi;

/** Saca la marca del desenlace. Lo que queda es lo que lee una persona. */
export function stripOutcomeTag(detail: string | null | undefined) {
  return String(detail || '').replace(OUTCOME_TAG_RE, '').trim();
}

/**
 * El `detail` de un evento con desenlace tiene dos partes: el desenlace
 * elegido y el texto libre que agrego el operador. Estas dos funciones son la
 * ida y la vuelta entre esa cadena y sus partes, y son lo UNICO que la escribe
 * o la lee: el operador nunca ve `[res:goal]`, ve "Gol", y la UI edita cada
 * parte por separado sin arriesgarse a romper la marca que suma el punto.
 *
 * Forma persistida: `[res:goal] Gol | texto libre`. El rotulo va escrito al
 * lado de la marca a proposito, para que un lector que no conozca el tag (un
 * export viejo, un log) siga entendiendo el evento.
 */
export function joinOutcomeDetail(definition: MatchEventDefinition, outcomeId: string, extra?: string | null) {
  const label = definition.outcomes?.find((outcome) => outcome.id === outcomeId)?.label ?? outcomeId;
  const cleanExtra = String(extra || '').trim();
  return cleanExtra
    ? `${formatOutcomeTag(outcomeId)} ${label} | ${cleanExtra}`
    : `${formatOutcomeTag(outcomeId)} ${label}`;
}

export function splitOutcomeDetail(
  definition: MatchEventDefinition | undefined,
  detail: string | null | undefined,
): { outcomeId: string | null; extra: string } {
  const outcomeId = readOutcomeId(detail);
  let rest = stripOutcomeTag(detail);
  const label = outcomeId
    ? definition?.outcomes?.find((outcome) => outcome.id === outcomeId)?.label
    : undefined;
  if (label && rest.toLowerCase().startsWith(label.toLowerCase())) {
    rest = rest.slice(label.length).replace(/^\s*\|\s*/, '').trim();
  }
  return { outcomeId, extra: rest };
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
      // Los desenlaces se heredan del preset igual que los flags: sin esto, un
      // torneo con `matchEvents` guardados perdia los seis resultados del
      // corner corto y el evento pasaba a sumar siempre.
      const outcomes = normalizeOutcomes(candidate.outcomes, fallbackDefinition?.outcomes);
      const defaultOutcome = typeof candidate.defaultOutcome === 'string' && candidate.defaultOutcome.trim()
        ? candidate.defaultOutcome.trim()
        : fallbackDefinition?.defaultOutcome;
      const outcomePrompt = typeof candidate.outcomePrompt === 'string' && candidate.outcomePrompt.trim()
        ? candidate.outcomePrompt.trim()
        : fallbackDefinition?.outcomePrompt;

      return {
        type,
        label,
        category,
        points,
        team,
        player,
        creditsOpponent,
        kickAtGoal,
        ...(outcomes ? { outcomes } : {}),
        ...(defaultOutcome ? { defaultOutcome } : {}),
        ...(outcomePrompt ? { outcomePrompt } : {}),
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

/**
 * El catalogo BASE de un partido: el del deporte, salvo que el torneo traiga
 * un reglamento que lo redefina (futbol americano: tackle o flag, con o sin
 * patadas). Es lo que la consola usa como base antes de fundir la
 * configuracion de eventos guardada, y lo que `resolveMatchEventDefinitions`
 * usa como fallback.
 */
export function getBaseMatchEventDefinitions(
  sportId: string | null | undefined,
  tournamentRuleset: Record<string, unknown> | null | undefined,
): MatchEventDefinition[] {
  if (normalizeSportBucket(sportId) === 'american-football') {
    const rules = readAmericanFootballRuleset(tournamentRuleset);
    if (rules) return buildAmericanFootballEventDefinitions(rules);
  }
  return getDefaultMatchEventDefinitions(sportId);
}

export function resolveMatchEventDefinitions({ sportId, phaseSettings, tournamentRuleset }: ResolveArgs): MatchEventDefinition[] {
  const fallback = getBaseMatchEventDefinitions(sportId, tournamentRuleset);
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
