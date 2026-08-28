import { NextRequest, NextResponse } from 'next/server';
import {
  authorizeResultsApiRequest,
  describeResultsApiAuthFailure,
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
    const failure = describeResultsApiAuthFailure(auth.reason);
    return jsonError(failure.message, failure.status, failure.code);
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
