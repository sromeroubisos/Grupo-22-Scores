import { buildUrbaTournamentExternalId, subcategoriaDeTorneoUrba } from './externalId.ts';

/**
 * Traduce una fila del inventario de URBA a la fila de `tournaments` y a la de
 * `tournament_phases` que la acompaña. Sin escribir nada: es una función pura,
 * igual que `planMatches.ts`, y por el mismo motivo.
 *
 * ── De dónde salen los valores ──────────────────────────────────────────────
 * NO se inventaron acá. Son los que quedaron en los 126 torneos que la carga de
 * 2026 creó, leídos de la base y contrastados campo por campo: la derivación
 * reproduce los 126 sin una sola diferencia (`tournamentRow.test.ts`). Es la
 * misma defensa que el triple del club: una sola implementación, con un test que
 * falla si aparece una segunda que diverge.
 *
 * Los 8 restantes de 2026 NO se derivan y no deberían: son torneos que ya
 * existían en G22 antes de URBA ("Top 14 de la URBA", `age_grade = 'Mayores'`,
 * `gender` NULL) y la carga los VINCULÓ por `external_id` en vez de crearlos.
 * Un torneo histórico nunca cae en ese caso —2021-2025 no tiene nada en la
 * base—, pero el que ejecute tiene que saltearse los que ya tengan `external_id`.
 */

/** Una fila del inventario `inventario-torneos-urba.csv`. */
export interface InventarioTorneoUrba {
  urba_id: number | string;
  nombre: string;
  anio: number | string;
  /** El escalón competitivo → `tournaments.category`. `'otro'` es un valor, no un faltante. */
  division: string;
  /** `mayores` | `M15`…`M22` → `tournaments.age_grade`. */
  age_grade: string;
  /** `masculino` | `femenino` → `tournaments.gender`. */
  gender: string;
  equipos?: number | string | null;
}

/**
 * Lo que la carga histórica escribe en `tournaments`.
 *
 * `is_visible` y `logo_url` son POLÍTICA de carga, no derivación: los pide el
 * llamador. Todo lo demás sale del inventario o es constante.
 */
export interface TournamentRow {
  external_id: string;
  name: string;
  original_name: string;
  season_id: string;
  category: string;
  subcategory: string | null;
  age_grade: string;
  gender: string;
  union_id: 'urba';
  region: 'Buenos Aires';
  country: 'Argentina';
  country_id: 'argentina';
  sport_id: 'rugby';
  sport: 'rugby';
  sport_name: 'Rugby';
  country_name: 'Argentina';
  status: 'draft';
  review_status: 'approved';
  priority: 0;
  display_order: 0;
  ruleset_version: 1;
  is_active: false;
  is_popular: false;
  is_visible: boolean;
  logo_url: string | null;
}

/** El prefijo con el que la carga de 2026 nombró los 126 torneos que creó. */
export const PREFIJO_NOMBRE = 'URBA: ';

/**
 * La fila de `tournaments` de un torneo del inventario.
 *
 * @param isVisible política de carga. El histórico entra en `false`: 2021-2025
 *        no se publica sin decisión, y prenderlo después es un UPDATE de una
 *        columna, mientras que cargar visible y arrepentirse ya ensució el home.
 */
export function planTournamentRow(
  inv: InventarioTorneoUrba,
  opciones: { isVisible: boolean; logoUrl?: string | null },
): TournamentRow {
  const nombre = String(inv.nombre ?? '').trim();
  if (!nombre) throw new Error(`torneo ${inv.urba_id} sin nombre`);
  const name = `${PREFIJO_NOMBRE}${nombre}`;

  return {
    external_id: buildUrbaTournamentExternalId(inv.urba_id),
    name,
    // En los 126 de 2026 `original_name` quedó igual a `name`: URBA no publica
    // un nombre "original" distinto, y dejarlo NULL perdería el único lugar
    // donde el nombre sobrevive si alguien renombra el torneo a mano.
    original_name: name,
    season_id: String(inv.anio),
    category: String(inv.division),
    subcategory: subcategoriaDeTorneoUrba(nombre),
    age_grade: String(inv.age_grade),
    gender: String(inv.gender),
    union_id: 'urba',
    region: 'Buenos Aires',
    country: 'Argentina',
    country_id: 'argentina',
    sport_id: 'rugby',
    sport: 'rugby',
    sport_name: 'Rugby',
    country_name: 'Argentina',
    status: 'draft',
    review_status: 'approved',
    priority: 0,
    display_order: 0,
    ruleset_version: 1,
    is_active: false,
    is_popular: false,
    is_visible: opciones.isVisible,
    logo_url: opciones.logoUrl ?? null,
  };
}

/* ────────────────────────────────────────────────────────────────────────────
 * LA FASE
 *
 * Sin una fila en `tournament_phases`, y sin `matches.phase_id` apuntándole, el
 * torneo NO TIENE TABLA. Es el error que se cometió con los 126 de 2026 —se
 * cargaron sin fase y hubo que backfillear después—, y no falla ruidosamente:
 * el torneo se ve, los partidos se ven, y las posiciones salen vacías.
 *
 * Por eso la fase se planifica acá junto con el torneo y no en un paso aparte
 * que alguien pueda saltear.
 * ──────────────────────────────────────────────────────────────────────────── */

export interface PhaseRow {
  tournament_id: string;
  name: 'Fase Regular';
  phase_type: 'league';
  order_index: 1;
  is_active: true;
  settings: Record<string, unknown>;
}

/**
 * Cuántas veces se cruza el par que más se cruza. Es la definición de "ida y
 * vuelta" que NO depende del nombre del torneo.
 *
 * Contrastado contra las 126 fases de 2026: acierta 125. La única que no es
 * `urba:2025317`, donde el payload trae un par repetido y la fase quedó en 1;
 * es un dato del torneo, no una regla distinta.
 */
export function legsDeChampionship(
  championship: { rounds?: { matches?: { local_team_id: number | null; visit_team_id: number | null }[] }[] },
): 1 | 2 {
  const pares = new Map<string, number>();
  for (const ronda of championship.rounds ?? []) {
    for (const m of ronda.matches ?? []) {
      if (m.local_team_id == null || m.visit_team_id == null) continue;
      const k = [m.local_team_id, m.visit_team_id].sort((a, b) => a - b).join('-');
      const n = (pares.get(k) ?? 0) + 1;
      if (n >= 2) return 2;
      pares.set(k, n);
    }
  }
  return 1;
}

/** Los dos `matchFormat` que usaron las 126 fases de 2026, sin una tercera variante. */
const MATCH_FORMAT = {
  single_match: {
    type: 'single_match',
    label: 'Partido Único',
    behavior: {
      series: { seriesLength: 2, tieResolution: 'extra_time_then_penalty_shootout', aggregateMethod: 'points_sum' },
      single_match: { seriesLength: 1, winnerDetermination: 'most_points_in_match' },
      event_results: { rankingInput: 'final_positions', allowManualRanking: true },
    },
  },
  series: {
    type: 'series',
    label: 'Home and Away',
    behavior: {
      series: { seriesLength: 2, tieResolution: 'extra_time_then_penalty_shootout', aggregateMethod: 'points_sum' },
      single_match: { seriesLength: 1, winnerDetermination: 'most_points_in_match' },
      event_results: { rankingInput: 'final_positions', allowManualRanking: true },
    },
  },
} as const;

/**
 * El orden de desempate de URBA, tal cual quedó en las 126 fases de 2026.
 * Es una constante congelada: cambiarlo acá recalcula tablas ya publicadas.
 */
const TIEBREAKERS = [
  'points', 'points_difference', 'headToHead', 'tries', 'fair_play', 'points_for',
  'points_against', 'won', 'drawn', 'lost', 'bonusOffensive', 'bonusDefensive',
  'red_cards', 'coin_toss',
] as const;

/** 4/2/0 y los dos bonus, los mismos que `PUNTOS_URBA` de `planMatches.ts`. */
const PUNTOS = { win: 4, draw: 2, loss: 0 } as const;

/**
 * La fila de `tournament_phases` de un torneo.
 *
 * `editor_source: 'urba_backfill'` es la marca que ya llevan las 126 fases de
 * 2026. Se mantiene igual a propósito: es lo que permite un `DELETE` exacto en
 * el rollback y distinguir de un vistazo una fase importada de una hecha a mano.
 */
export function planPhaseRow(input: {
  tournamentId: string;
  teamsCount: number;
  legs: 1 | 2;
}): PhaseRow {
  const { tournamentId, teamsCount, legs } = input;
  return {
    tournament_id: tournamentId,
    name: 'Fase Regular',
    phase_type: 'league',
    order_index: 1,
    is_active: true,
    settings: {
      legs,
      bonus: {
        defensive: { label: 'Loss < 7 pts', margin: 7, points: 1 },
        offensive: { label: '4+ Tries', tries: 4, points: 1 },
      },
      points: { ...PUNTOS },
      circuit: null,
      groupTags: [],
      stageKind: 'phase',
      standings: { mode: 'automatic', editable: false },
      teamsCount,
      groupLabels: [],
      group_names: [],
      matchFormat: legs === 2 ? MATCH_FORMAT.series : MATCH_FORMAT.single_match,
      phaseFormat: 'league',
      tiebreakers: [...TIEBREAKERS],
      advanceCount: 0,
      pointsSystem: {
        ...PUNTOS,
        behavior: {
          input: { requires: ['score'], statusRequired: 'finalized' },
          output: { writesTo: ['standings'] },
          bonusTry: 1,
          bonusLoss: 1,
          idempotency: { key: 'match_id', rule: 'ignore_if_already_processed' },
          basePointsLogic: [
            { if: { win: true }, then: { add: PUNTOS.win } },
            { if: { draw: true }, then: { add: PUNTOS.draw } },
            { if: { loss: true }, then: { add: PUNTOS.loss } },
          ],
          whenToCalculate: 'on_match_finalized',
        },
        allowBonusPoints: true,
      },
      editor_source: 'urba_backfill',
      qualification: null,
      rankingSource: 'phase_standings',
      playoffThirdPlace: false,
    },
  };
}
