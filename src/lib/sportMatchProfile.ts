import { normalizeSportBucket } from './matchEventCatalog.ts';
import { DEFAULT_OFFENSIVE_BONUS_THRESHOLD, type OffensiveBonusMode } from './bonusRuleMetrics.ts';

/**
 * Lo que cada deporte tiene de propio en la GESTION de un partido: cuanta gente
 * entra en la planilla, cuantos arrancan, y si el marcador tiene una segunda
 * cifra que cargar ademas de los puntos.
 *
 * Existe porque estos tres numeros estaban escritos como constantes de rugby en
 * medio del match center: `DEFAULT_LINEUP_SIZE = 23`, `index < 15` repetido dos
 * veces, y un campo TRIES fijo en el editor de resultado del gestor. Un partido
 * de hockey abria una planilla de 23 con 15 titulares y pedia tries.
 *
 * Va aparte de `SPORTS.matchRules` (data/sports.ts) a proposito: aquello
 * describe el REGLAMENTO (periodos, duracion, shootout) y lo consume el reloj;
 * esto describe la CARGA (planilla, marcador) y lo consume la UI de gestion.
 * Mezclarlos obligaria a que el creador de torneos importe el catalogo entero
 * de 38 deportes para saber cuantos suplentes tiene un partido.
 */

/**
 * La segunda cifra del marcador, cuando el deporte la tiene.
 *
 * Solo existe si el puntaje NO es el conteo de un unico evento. En rugby el
 * try vale 5 y el marcador es compuesto, asi que la cantidad de tries es
 * informacion que el resultado no contiene —y encima es la que alimenta el
 * bonus ofensivo—. En hockey y futbol cada gol vale 1: el marcador YA ES el
 * conteo de goles, y un campo aparte seria una segunda fuente de verdad para
 * el mismo numero, capaz de contradecir al marcador.
 */
export type SecondaryScoreMetric = {
  /** Base de la clave persistida en `score`: 'tries' -> score.homeTries. */
  key: string;
  /** Rotulo de la UI. */
  label: string;
  /** Tipo de evento equivalente, para que el bonus lo pueda contar. */
  eventType: string;
};

export type SportMatchProfile = {
  /** Titulares + suplentes: el tamano de la planilla que se genera. */
  lineupSize: number;
  /** Cuantos de esos arrancan. Los que siguen entran como suplentes. */
  startersCount: number;
  secondaryScoreMetric: SecondaryScoreMetric | null;
};

const RUGBY: SportMatchProfile = {
  lineupSize: 23,
  startersCount: 15,
  secondaryScoreMetric: { key: 'tries', label: 'Tries', eventType: 'try' },
};

const SPORT_MATCH_PROFILE: Record<string, SportMatchProfile> = {
  rugby: RUGBY,
  football: { lineupSize: 18, startersCount: 11, secondaryScoreMetric: null },
  // FIH: once en cancha y cinco suplentes con cambios ilimitados.
  hockey: { lineupSize: 16, startersCount: 11, secondaryScoreMetric: null },
  basketball: { lineupSize: 12, startersCount: 5, secondaryScoreMetric: null },
  'american-football': {
    lineupSize: 46,
    startersCount: 11,
    secondaryScoreMetric: { key: 'touchdowns', label: 'Touchdowns', eventType: 'touchdown' },
  },
  handball: { lineupSize: 16, startersCount: 7, secondaryScoreMetric: null },
  volleyball: { lineupSize: 14, startersCount: 6, secondaryScoreMetric: null },
  baseball: { lineupSize: 26, startersCount: 9, secondaryScoreMetric: null },
};

/**
 * Deporte sin resolver: rugby, igual que hoy.
 *
 * Es deliberado y NO es pereza. El default declarado de la plataforma es rugby
 * (`mapExternalSportToInternalSport` cae ahi "per business rules", y el match
 * center ya hacia `matchSportId ?? 'rugby'`), asi que un partido cuyo deporte
 * no resolvio venia abriendo una planilla de 23 con 15 titulares. Cambiar este
 * fallback moveria justamente los partidos de rugby que no hay que tocar.
 *
 * Los deportes que SI resuelven ya no heredan nada de rugby: cada uno tiene su
 * fila arriba.
 */
const FALLBACK_PROFILE: SportMatchProfile = RUGBY;

export function getSportMatchProfile(sportId?: string | null): SportMatchProfile {
  return SPORT_MATCH_PROFILE[normalizeSportBucket(sportId)] ?? FALLBACK_PROFILE;
}

export function getSportLineupSize(sportId?: string | null): number {
  return getSportMatchProfile(sportId).lineupSize;
}

export function getSportStartersCount(sportId?: string | null): number {
  return getSportMatchProfile(sportId).startersCount;
}

/** null cuando el marcador del deporte ya dice todo (hockey, futbol, basquet). */
export function getSecondaryScoreMetric(sportId?: string | null): SecondaryScoreMetric | null {
  return getSportMatchProfile(sportId).secondaryScoreMetric;
}

/** Claves con las que la metrica secundaria viaja dentro de `score`. */
export function getSecondaryScoreKeys(metric: SecondaryScoreMetric) {
  const pascal = metric.key.charAt(0).toUpperCase() + metric.key.slice(1);
  return { home: `home${pascal}`, away: `away${pascal}` } as const;
}

/**
 * Con que se mide el bonus ofensivo en cada deporte.
 *
 * El toggle del gestor escribia `type: 'tries'` para CUALQUIER deporte. En un
 * torneo de hockey eso resolvia a "contar eventos de tipo try", que nunca
 * existen: el bonus quedaba prendido y nunca sumaba un punto. Un no-op
 * silencioso, que es la peor variante de estar roto.
 *
 * Los deportes cuyo gol vale 1 se miden contra el MARCADOR (`type: 'score'`) en
 * vez de contra un conteo de eventos: asi el bonus funciona igual en un partido
 * cargado a mano, sin evento por evento. El `label` viaja guardado para que la
 * tabla diga "4 goles · +1" y no "4 puntos · +1".
 */
export type OffensiveBonusPreset = {
  /** Lo que se guarda en `ruleset.bonusRules.offensiveBonus.type`. */
  type: string;
  threshold: number;
  /** Contra qué se mide el umbral: lo anotado (`count`) o la diferencia con el rival. */
  mode: OffensiveBonusMode;
  /** Sustantivo para la tabla: 'tries', 'goles', 'touchdowns'. */
  label: string;
  /** Rotulo corto del toggle: "4+ tries". */
  rule: string;
  /** Frase del hint, ya conjugada. */
  hint: string;
};

const GOAL_BUCKETS = new Set(['hockey', 'football', 'handball']);

/**
 * `mode` elige entre los dos reglamentos vivos del bonus por tries: `count`
 * (4 anotados, el clásico) y `difference` (3 más que el rival: 3-0, 4-1, 5-2,
 * World Rugby desde 2016). Sin `mode` es `count`, así que nada de lo que ya
 * llamaba a esta función cambia.
 */
export function getOffensiveBonusPreset(
  sportId?: string | null,
  mode: OffensiveBonusMode = 'count',
): OffensiveBonusPreset {
  const bucket = normalizeSportBucket(sportId);
  const metric = getSecondaryScoreMetric(sportId);

  // Rugby y futbol americano: la cifra secundaria ES la unidad del bonus.
  if (metric) {
    const noun = metric.label.toLowerCase();
    if (mode === 'difference') {
      const threshold = DEFAULT_OFFENSIVE_BONUS_THRESHOLD.difference;
      return {
        type: metric.key,
        threshold,
        mode,
        label: noun,
        rule: `${threshold}+ ${noun} de diferencia`,
        hint: `Un punto extra para el equipo que anote tres ${noun} más que el rival (3-0, 4-1, 5-2).`,
      };
    }
    return {
      type: metric.key,
      threshold: DEFAULT_OFFENSIVE_BONUS_THRESHOLD.count,
      mode: 'count',
      label: noun,
      rule: `4+ ${noun}`,
      hint: `Un punto extra para el equipo que anote cuatro ${noun} o más en un partido.`,
    };
  }

  if (GOAL_BUCKETS.has(bucket)) {
    return {
      type: 'score',
      threshold: 4,
      mode: 'count',
      label: 'goles',
      rule: '4+ goles',
      hint: 'Un punto extra para el equipo que anote cuatro goles o más en un partido.',
    };
  }

  return {
    type: 'score',
    threshold: 4,
    mode: 'count',
    label: 'puntos',
    rule: '4+ puntos',
    hint: 'Un punto extra para el equipo que llegue a cuatro puntos o más en un partido.',
  };
}
