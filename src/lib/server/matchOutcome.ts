/**
 * Quien gano un partido: la UNICA respuesta del sistema.
 *
 * Existia dos veces y no decian lo mismo. `resolveMatchAdvancement` —el que
 * ESCRIBE el avance de la llave— contemplaba el desempate por penales; el read
 * model del tablero (`loadPlayoffBracket`) comparaba solo el marcador. Con un
 * 2-2 definido por shoot-out el equipo avanzaba de ronda pero el tablero no lo
 * pintaba como ganador: dos criterios sobre el mismo dato, y el usuario viendo
 * el que estaba mal.
 *
 * Va como funcion compartida y no como par de `if` porque el desempate se va a
 * seguir consultando desde mas lugares (export de llave, ficha publica), y con
 * la logica duplicada alcanza con olvidarse de uno para que el tablero vuelva a
 * mentir.
 *
 * La precedencia es la del reglamento:
 *   1. walkover / bye  — un solo equipo presente
 *   2. `score.winner`  — fallo administrativo explicito (DQ, walkover cargado)
 *   3. marcador reglamentario
 *   4. desempate       — shoot-out de hockey, penales de futbol
 *
 * El shoot-out NO toca el marcador reglamentario: un 2-2 definido 4-3 sigue
 * siendo 2-2 en la tabla y en la ficha. Solo decide quien avanza. Es la regla
 * de la FIH y la que ya aplica `matchPoints` para los puntos de la tabla.
 */

export type MatchOutcomeDecidedBy = 'walkover' | 'override' | 'score' | 'shootout';

export interface MatchOutcomeInput {
  status: string | null;
  score: unknown;
  homeClubId: string | null;
  awayClubId: string | null;
}

export interface MatchOutcome {
  resolved: boolean;
  winnerClubId: string | null;
  loserClubId: string | null;
  /** null mientras no haya ganador. Sirve para rotular "por shoot-out" en la UI. */
  decidedBy: MatchOutcomeDecidedBy | null;
}

const UNRESOLVED: MatchOutcome = {
  resolved: false,
  winnerClubId: null,
  loserClubId: null,
  decidedBy: null,
};

function toNumber(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

/**
 * Marcador del desempate, si esta cargado. Acepta los tres nombres con los que
 * quedo guardado historicamente (`penalties` es el que escribe el match center;
 * `shootout` y `po` vienen de importaciones viejas).
 */
export function readShootoutScore(score: unknown): { home: number; away: number } | null {
  const record = asRecord(score);
  const raw = record.penalties ?? record.shootout ?? record.po ?? null;
  if (!raw || typeof raw !== 'object') return null;

  const pens = asRecord(raw);
  if (pens.home == null && pens.away == null) return null;

  return { home: toNumber(pens.home), away: toNumber(pens.away) };
}

export function resolveMatchOutcome(match: MatchOutcomeInput): MatchOutcome {
  if (match.status !== 'final') return UNRESOLVED;

  const home = match.homeClubId;
  const away = match.awayClubId;

  // Walkover / bye: un solo lado presente.
  if (home && !away) return { resolved: true, winnerClubId: home, loserClubId: null, decidedBy: 'walkover' };
  if (away && !home) return { resolved: true, winnerClubId: away, loserClubId: null, decidedBy: 'walkover' };
  if (!home || !away) return UNRESOLVED;

  const score = asRecord(match.score);

  const override = String(score.winner ?? '').toLowerCase();
  if (override === 'home') return { resolved: true, winnerClubId: home, loserClubId: away, decidedBy: 'override' };
  if (override === 'away') return { resolved: true, winnerClubId: away, loserClubId: home, decidedBy: 'override' };

  const scoreHome = toNumber(score.home);
  const scoreAway = toNumber(score.away);
  if (scoreHome > scoreAway) return { resolved: true, winnerClubId: home, loserClubId: away, decidedBy: 'score' };
  if (scoreAway > scoreHome) return { resolved: true, winnerClubId: away, loserClubId: home, decidedBy: 'score' };

  // Empate en el tiempo reglamentario -> shoot-out / penales.
  const shootout = readShootoutScore(score);
  if (shootout) {
    if (shootout.home > shootout.away) return { resolved: true, winnerClubId: home, loserClubId: away, decidedBy: 'shootout' };
    if (shootout.away > shootout.home) return { resolved: true, winnerClubId: away, loserClubId: home, decidedBy: 'shootout' };
  }

  // Empate sin desempate cargado: no avanza nadie todavia.
  return UNRESOLVED;
}
