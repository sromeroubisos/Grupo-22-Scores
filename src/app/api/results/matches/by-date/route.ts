import { NextRequest, NextResponse } from 'next/server';
import {
  authorizeResultsApiRequest,
  parseResultsMatchesByDatePayload,
  searchResultsMatchesByDate,
  toResultsApiError,
} from '@/lib/server/resultsApi';

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
  const auth = await authorizeResultsApiRequest(request.headers);

  if (!auth.ok) {
    if (auth.reason === 'missing_secret') {
      return jsonError(
        'Falta configurar una API key para resultados en Super Admin > Configuracion o mediante variables de entorno.',
        500,
        'missing_secret',
      );
    }

    return jsonError('Unauthorized', 401, 'unauthorized');
  }

  try {
    const payload = parseResultsMatchesByDatePayload(await request.json().catch(() => null));
    const response = await searchResultsMatchesByDate(payload);
    return NextResponse.json(response);
  } catch (error: unknown) {
    const normalized = toResultsApiError(error);
    return jsonError(normalized.message, normalized.status, normalized.code, normalized.details);
  }
}
