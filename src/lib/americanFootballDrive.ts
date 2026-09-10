import type { AmericanFootballRuleset } from './americanFootballRules.ts';
import { readOutcomeId } from './matchEventCatalog.ts';
import { parseYardsFromDetail } from './matchEventStats.ts';

/**
 * El DRIVE de futbol americano, derivado de los eventos.
 *
 * Es lo que distingue a este deporte de todos los demas de la plataforma: la
 * pregunta permanente no es "cuanto va" sino "quien tiene la pelota, en que
 * down y cuanto le falta". Sin eso la consola es un contador de touchdowns.
 *
 * No se guarda nada. La situacion sale de recorrer los eventos en el orden en
 * que se cargaron y aplicar las reglas de posesion del deporte:
 *
 *   - la ofensiva la tiene quien corre, pasa o consigue un primer down;
 *   - cada jugada consume un down; el primer down lo reinicia;
 *   - punt, perdida en downs, intercepcion y fumble perdido la entregan;
 *   - un tanto la entrega tambien: el que anota patea (o, en flag, el rival
 *     arranca desde su 5). Tras el touchdown hay una CONVERSION en el medio;
 *   - tras el safety saca el que lo sufrio, asi que la pelota va al que anoto;
 *   - el kickoff se carga al que patea: recibe el otro;
 *   - en el entretiempo la pelota queda en el aire hasta el kickoff.
 *
 * Lo que no se sabe no se inventa: la posicion en cancha no se lleva (no hay
 * dato), y las yardas por recorrer solo se calculan cuando la regla es por
 * yardas y TODAS las jugadas de la serie llevan yardas cargadas. Con la regla
 * de mitad de cancha (flag) se lleva el down y nada mas.
 *
 * Es una funcion pura de (eventos, reglamento): la usa la consola para pintar
 * la tira y sugerir el proximo evento, y el test la recorre sin DOM.
 */

export type DriveTeam = 'home' | 'away';

export interface DriveEventInput {
  type: string;
  team: DriveTeam | null | undefined;
  detail?: string | null;
  order?: number | null;
}

export type DrivePhase =
  /** Nadie tiene la pelota todavia (previa, entretiempo, esperando el kickoff). */
  | 'open'
  /** Serie ofensiva en curso. */
  | 'series'
  /** Se anoto un touchdown y falta la conversion (punto extra o de dos). */
  | 'conversion';

export interface DriveSituation {
  phase: DrivePhase;
  possession: DriveTeam | null;
  /** Down por jugar. Puede pasar de `rules.downs` cuando la serie se agoto sin primer down. */
  down: number;
  /** Yardas que faltan para el primer down; null cuando no se puede saber. */
  toGo: number | null;
  /** Yardas ganadas en la serie. Solo confiable si `yardsKnown`. */
  seriesYards: number;
  /** Todas las jugadas de la serie llevaban yardas. */
  yardsKnown: boolean;
  /** Se jugo el ultimo down sin primer down: corresponde cargar la perdida en downs. */
  downsExhausted: boolean;
  /** Las yardas de la serie ya alcanzan el primer down, pero nadie lo cargo. */
  firstDownPending: boolean;
  /** Tipo del ultimo evento que movio el drive. */
  lastEventType: string | null;
}

const OPEN: DriveSituation = {
  phase: 'open',
  possession: null,
  down: 1,
  toGo: null,
  seriesYards: 0,
  yardsKnown: true,
  downsExhausted: false,
  firstDownPending: false,
  lastEventType: null,
};

function opponentOf(team: DriveTeam): DriveTeam {
  return team === 'home' ? 'away' : 'home';
}

/** El detalle trae yardas escritas, en cualquiera de las formas que entiende el parser. */
export function hasYardsInDetail(detail: string | null | undefined): boolean {
  const s = String(detail || '');
  return /\bYds?:\s*[+-]?\d+/i.test(s) || /[+-]?\d+\s*(?:yd\b|yds\b|yardas?\b)/i.test(s);
}

function yardsToFirstDown(rules: AmericanFootballRuleset): number | null {
  return rules.firstDownRule === 'yards' ? Math.max(0, rules.firstDownYards) : null;
}

function newSeries(team: DriveTeam | null, rules: AmericanFootballRuleset, lastEventType: string): DriveSituation {
  return {
    ...OPEN,
    phase: team ? 'series' : 'open',
    possession: team,
    toGo: team ? yardsToFirstDown(rules) : null,
    lastEventType,
  };
}

function afterPlay(
  state: DriveSituation,
  team: DriveTeam,
  detail: string | null | undefined,
  rules: AmericanFootballRuleset,
  type: string,
): DriveSituation {
  // Una jugada de un club que no tenia la pelota es una serie que arranca:
  // el operador no cargo el kickoff, el punt o el turnover, y eso no es
  // motivo para dejar la tira mintiendo.
  const base = state.possession === team && state.phase === 'series'
    ? state
    : newSeries(team, rules, type);
  const known = base.yardsKnown && hasYardsInDetail(detail);
  const seriesYards = base.seriesYards + parseYardsFromDetail(detail);
  const need = yardsToFirstDown(rules);
  const down = base.down + 1;
  const reached = need !== null && known && seriesYards >= need;
  return {
    ...base,
    phase: 'series',
    possession: team,
    down,
    seriesYards,
    yardsKnown: known,
    toGo: need !== null && known ? Math.max(0, need - seriesYards) : null,
    firstDownPending: reached,
    downsExhausted: !reached && down > rules.downs,
    lastEventType: type,
  };
}

/** Los eventos que el drive lee. Todo lo demas (tarjetas, reloj, tiempo muerto) no lo mueve. */
const PLAY_TYPES = new Set(['rush', 'pass_complete', 'pass_incomplete']);
const LOSS_PLAY_TYPES = new Set(['sack', 'flag_pull_for_loss']);

function sortByLoadOrder<T extends DriveEventInput>(events: readonly T[]): T[] {
  return events
    .map((event, index) => ({ event, index, order: Number.isFinite(Number(event.order)) ? Number(event.order) : index }))
    .sort((a, b) => a.order - b.order || a.index - b.index)
    .map((entry) => entry.event);
}

export function deriveDriveSituation(
  events: readonly DriveEventInput[],
  rules: AmericanFootballRuleset,
): DriveSituation {
  let state: DriveSituation = { ...OPEN };

  for (const event of sortByLoadOrder(events)) {
    const type = String(event.type || '').trim().toLowerCase();
    const team = event.team === 'home' || event.team === 'away' ? event.team : null;

    if (type === 'match_half' || type === 'match_end') {
      state = { ...OPEN, lastEventType: type };
      continue;
    }
    if (!team) continue;

    if (PLAY_TYPES.has(type)) {
      state = afterPlay(state, team, event.detail, rules, type);
      continue;
    }
    if (LOSS_PLAY_TYPES.has(type)) {
      // Se carga a la DEFENSA: la jugada la sufre el rival.
      state = afterPlay(state, opponentOf(team), event.detail, rules, type);
      continue;
    }

    switch (type) {
      case 'first_down':
        state = newSeries(team, rules, type);
        break;
      case 'kickoff':
        // Patea uno, recibe el otro. El onside recuperado por el que patea es
        // la excepcion, y se corrige sola con la primera jugada que se cargue.
        state = newSeries(opponentOf(team), rules, type);
        break;
      case 'touchdown':
        state = { ...newSeries(team, rules, type), phase: 'conversion', toGo: null };
        break;
      case 'extra_point':
      case 'two_point_conversion':
        // Convertida o no, despues viene el kickoff del que anoto: la pelota
        // pasa al rival. En flag no hay kickoff y el rival arranca igual.
        state = newSeries(opponentOf(team), rules, type);
        break;
      case 'field_goal':
        // Bueno: kickoff del que anoto. Fallado o bloqueado: la toma el rival
        // en el lugar. En los dos casos la pelota cambia de mano.
        state = newSeries(opponentOf(team), rules, type);
        break;
      case 'safety':
        // Saca el que lo sufrio (free kick): recibe el que anoto.
        state = newSeries(team, rules, type);
        break;
      case 'punt':
      case 'turnover_on_downs':
        state = newSeries(opponentOf(team), rules, type);
        break;
      case 'interception':
        // Se carga al que la captura.
        state = newSeries(team, rules, type);
        break;
      case 'fumble': {
        // Se carga al que la suelta. Es turnover solo si la recupera el rival.
        const outcome = readOutcomeId(event.detail);
        state = outcome === 'lost'
          ? newSeries(opponentOf(team), rules, type)
          : { ...state, lastEventType: type };
        break;
      }
      default:
        break;
    }
  }

  return state;
}

/* ─── presentacion ─── */

const ORDINALS = ['', '1°', '2°', '3°', '4°', '5°', '6°', '7°', '8°', '9°', '10°'];

export function formatDown(down: number): string {
  return ORDINALS[down] ?? `${down}°`;
}

/**
 * "2° y 7", "4° y 1", "1° y 10". Sin yardas conocidas, solo el down. Con la
 * regla de mitad de cancha, "2° down" a secas: lo que falta es cruzar.
 */
export function formatDownAndDistance(situation: DriveSituation, rules: AmericanFootballRuleset): string {
  if (situation.phase === 'conversion') return 'Conversión';
  if (situation.phase === 'open' || !situation.possession) return 'Sin posesión';
  if (situation.downsExhausted) return 'Downs agotados';
  const down = formatDown(Math.min(situation.down, rules.downs));
  if (situation.toGo === null) return `${down} down`;
  if (situation.firstDownPending) return `${down} · primer down conseguido`;
  return `${down} y ${situation.toGo}`;
}

/**
 * El evento que corresponde cargar ahora, si el drive lo pide: la perdida en
 * downs cuando se jugo el ultimo sin primer down, el primer down cuando las
 * yardas ya lo alcanzaron. null cuando no hay nada que sugerir.
 */
export function suggestedDriveEventType(situation: DriveSituation): 'turnover_on_downs' | 'first_down' | null {
  if (situation.phase !== 'series') return null;
  if (situation.firstDownPending) return 'first_down';
  if (situation.downsExhausted) return 'turnover_on_downs';
  return null;
}
