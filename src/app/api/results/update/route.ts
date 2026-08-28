import { NextRequest, NextResponse } from 'next/server';
import {
  authorizeResultsApiRequest,
  describeResultsApiAuthFailure,
  parseResultsUpdatePayload,
  toResultsApiError,
  updateResultAndRecalculate,
} from '@/lib/server/resultsApi';
import { traceEditRoute, markEditTrace } from '@/lib/perf/editTrace';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

function jsonError(message: string, status: number, code: string, details: unknown = null) {
  return NextResponse.json(
    {
      ok: false,
      error: message,
      code,
      details,
    },
    { status },
  );
}

export async function POST(request: NextRequest) {
  return traceEditRoute(
    request,
    { routeName: 'POST /api/results/update', routeType: 'results_api', actorType: 'results_api' },
    async () => {
      // El recálculo derivado se AWAITEA dentro de updateResultAndRecalculate,
      // por lo que la respuesta NO vuelve antes de terminar los derivados.
      markEditTrace({ responseBeforeDerived: false });

      // Escribe marcadores: pide el permiso de escritura, no el de lectura.
      const auth = await authorizeResultsApiRequest(request.headers, 'results:write');

      if (!auth.ok) {
        const failure = describeResultsApiAuthFailure(auth.reason);
        return jsonError(failure.message, failure.status, failure.code);
      }

      try {
        const payload = parseResultsUpdatePayload(await request.json().catch(() => null));
        const response = await updateResultAndRecalculate(payload);
        return NextResponse.json(response);
      } catch (error: unknown) {
        const normalized = toResultsApiError(error);
        return jsonError(normalized.message, normalized.status, normalized.code, normalized.details);
      }
    },
  );
}
