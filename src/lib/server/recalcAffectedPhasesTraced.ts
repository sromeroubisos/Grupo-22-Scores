/**
 * Helper COMPARTIDO para el recálculo de standings tras editar/borrar un partido.
 *
 * Centraliza (para no duplicar en cada ruta):
 *   - el guard del flag de laboratorio `standings` (Etapa 0);
 *   - la ejecución best-effort / no-bloqueante (fire-and-forget);
 *   - la medición en su PROPIO trace `standings_async`, auto-correlacionado con
 *     el request padre por `requestId`.
 *
 * OJO (diagnóstico fire-and-forget): en Vercel, esta promesa NO tiene garantía
 * de completarse tras devolver la respuesta; la función puede congelarse. Ver
 * el informe de Etapa 0. Acá SOLO se instrumenta; no se cambia la arquitectura.
 */
import { recalculatePhaseStandingsScopes } from '@/lib/server/recalculateStandings';
import { runWithEditTrace, appendEditTraceFact, getEditRequestId } from '@/lib/perf/editTrace';
import { isDerivedRecalcSkipped } from '@/lib/perf/labFlags';
import { isFinalStandingsStatus } from '@/lib/standings/matchScope';

type PhaseScope = { tournamentId?: string | null; phaseId?: string | null; status?: string | null } | null | undefined;

export function recalcAffectedPhases(scopes: PhaseScope[]): void {
  // Flag de laboratorio: permite aislar el costo de standings al medir.
  if (isDerivedRecalcSkipped('standings')) {
    appendEditTraceFact('skippedDerived', 'standings');
    return;
  }

  // Gate por status: las standings solo cuentan partidos finales
  // (FINAL_STANDINGS_STATUSES). Un partido live/scheduled no aporta a la tabla,
  // así que recalcular en cada evento en vivo es trabajo inútil. Recalculamos si
  // CUALQUIER scope está (o estaba) en estado final — cubre live→final,
  // final→live (reabierto), correcciones sobre finales y cambios de fase de un
  // final. Fail-safe: un scope null o con status desconocido NO habilita el
  // skip (podría requerir recálculo), así que ante la duda, recalculamos.
  const isKnownNonFinal = (scope: PhaseScope): boolean => {
    if (!scope) return false;
    const status = scope.status;
    if (typeof status !== 'string' || status.trim() === '') return false;
    return !isFinalStandingsStatus(status);
  };

  if (scopes.length > 0 && scopes.every(isKnownNonFinal)) {
    appendEditTraceFact('skippedDerived', 'standings_non_final');
    return;
  }

  const affected = new Map<string, { tournamentId: string; phaseId: string }>();
  for (const scope of scopes) {
    if (scope?.tournamentId && scope?.phaseId) {
      affected.set(`${scope.tournamentId}:${scope.phaseId}`, {
        tournamentId: scope.tournamentId,
        phaseId: scope.phaseId,
      });
    }
  }

  if (affected.size === 0) return;

  const values = [...affected.values()];
  const correlationId = getEditRequestId();

  // Medimos el recálculo fire-and-forget en su propio trace, correlacionado
  // con el request. Sigue siendo no-bloqueante (no se `await`ea la respuesta).
  runWithEditTrace(
    {
      label: 'standings_async',
      endpoint: 'recalcAffectedPhases',
      correlationId,
      tournamentId: values[0]?.tournamentId ?? null,
    },
    () =>
      Promise.all(
        values.map((scope) =>
          recalculatePhaseStandingsScopes(scope.tournamentId, scope.phaseId, 'general'),
        ),
      ),
  ).catch((err) =>
    console.error('[recalcAffectedPhases] Auto-recalculate standings failed:', err),
  );
}
