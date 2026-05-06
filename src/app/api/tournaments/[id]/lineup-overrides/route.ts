import { NextRequest, NextResponse } from 'next/server';
import { getExternalMatchLineupOverride } from '@/lib/server/externalMatchLineupOverrides';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const NO_STORE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
  Pragma: 'no-cache',
  Expires: '0',
};

function jsonNoStore(body: unknown, init?: ResponseInit) {
  return NextResponse.json(body, {
    ...init,
    headers: {
      ...NO_STORE_HEADERS,
      ...(init?.headers ?? {}),
    },
  });
}

function parseMatchIds(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get('matchIds') || '';
  return Array.from(
    new Set(
      raw
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean)
        .slice(0, 120),
    ),
  );
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  await params;

  const matchIds = parseMatchIds(request);
  if (matchIds.length === 0) {
    return jsonNoStore({ ok: true, overrides: [] });
  }

  const settled = await Promise.allSettled(
    matchIds.map(async (matchId) => {
      const override = await getExternalMatchLineupOverride(matchId);
      if (!override) return null;

      return {
        matchId,
        provider: override.provider,
        lineups: override.lineups,
        ratedAt: override.rated_at,
      };
    }),
  );

  return jsonNoStore({
    ok: true,
    overrides: settled
      .map((result) => result.status === 'fulfilled' ? result.value : null)
      .filter(Boolean),
  });
}
