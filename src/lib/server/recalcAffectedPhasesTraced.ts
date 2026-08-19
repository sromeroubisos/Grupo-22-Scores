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

/**
 * Un recálculo en vuelo por fase, y a lo sumo uno esperando.
 *
 * Cargar una fecha son diez o quince resultados seguidos, todos de la MISMA
 * fase. Sin esto, cada guardado largaba su propio recálculo: quince pasadas
 * concurrentes leyendo los mismos partidos y haciendo DELETE+INSERT sobre las
 * mismas filas de `tournament_standings`. Se peleaban el lock entre ellas y
 * catorce quedaban obsoletas antes de terminar — la última es la única que
 * cuenta, porque cada una recalcula la tabla ENTERA desde los partidos.
 *
 * Con la marca de "sucio" no se pierde nada: si llega un guardado mientras hay
 * un recálculo corriendo, se anota y se vuelve a correr UNA vez al terminar, ya
 * con el resultado nuevo en la base. Quince guardados pasan de quince pasadas a
 * dos.
 *
 * Es por instancia, no global. Dos instancias de Vercel pueden solaparse, pero
 * el caso que duele —un operador cargando una fecha— cae siempre en la misma.
 */
const enVuelo = new Map<string, { promesa: Promise<unknown>; sucio: boolean }>();

function recalcularConCoalescing(tournamentId: string, phaseId: string): Promise<unknown> {
  const clave = `${tournamentId}:${phaseId}`;
  const actual = enVuelo.get(clave);

  if (actual) {
    actual.sucio = true;
    return actual.promesa;
  }

  const estado: { promesa: Promise<unknown>; sucio: boolean } = { promesa: Promise.resolve(), sucio: false };

  estado.promesa = (async () => {
    try {
      await recalculatePhaseStandingsScopes(tournamentId, phaseId, 'general');

      // Alguien guardó mientras corríamos: una pasada más y listo.
      if (estado.sucio) {
        estado.sucio = false;
        await recalculatePhaseStandingsScopes(tournamentId, phaseId, 'general');
      }
    } finally {
      enVuelo.delete(clave);
    }
  })();

  enVuelo.set(clave, estado);
  return estado.promesa;
}

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
    () => Promise.all(values.map((scope) => recalcularConCoalescing(scope.tournamentId, scope.phaseId))),
  ).catch((err) =>
    console.error('[recalcAffectedPhases] Auto-recalculate standings failed:', err),
  );
}
