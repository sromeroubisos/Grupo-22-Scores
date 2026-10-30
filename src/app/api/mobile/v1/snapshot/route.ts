import { NextRequest } from 'next/server';
import { mobileJson, preflight } from '@/lib/server/mobileSync/cors';
import { buildSnapshot } from '@/lib/server/mobileSync/snapshot';
import { MobileAuthError, resolveMobileSession } from '@/lib/server/mobileSync/session';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export function OPTIONS(request: NextRequest) {
  return preflight(request);
}

/**
 * GET /api/mobile/v1/snapshot — lo que el usuario puede gestionar en G22, para
 * que la app móvil trabaje sin conexión. Con `?since=<cursor>&scopeHash=<hash>`
 * baja solo lo que cambió. Ver src/lib/server/mobileSync/snapshot.ts.
 */
export async function GET(request: NextRequest) {
  if (process.env.MOBILE_GATEWAY_DISABLED === '1') {
    return mobileJson(request, { error: 'La sincronización móvil está pausada.', code: 'gateway_disabled' }, { status: 503 });
  }
  try {
    const session = await resolveMobileSession(request);
    const since = request.nextUrl.searchParams.get('since');
    const scopeHash = request.nextUrl.searchParams.get('scopeHash');

    // Solo en la foto completa: igual que la web después del login, asegura la fila
    // de `users` con el rol vigente (syncUserProfile). Si falla, la foto se arma igual.
    if (!since) {
      const origin = process.env.MOBILE_GATEWAY_INTERNAL_ORIGIN || request.nextUrl.origin;
      await fetch(new URL('/api/auth/sync-user', origin), {
        method: 'POST',
        cache: 'no-store',
        headers: { cookie: session.cookieHeader, 'content-type': 'application/json' },
        body: '{}',
        signal: AbortSignal.timeout(4000),
      }).catch(() => null);
    }

    return mobileJson(request, await buildSnapshot(session, { since, scopeHash }));
  } catch (error) {
    if (error instanceof MobileAuthError) return mobileJson(request, { error: error.message }, { status: error.status });
    const code = (error as { code?: string } | null)?.code;
    if (code === '42P01' || code === 'PGRST205') {
      // Falta la tabla de borrados (migración sin aplicar): la app usa el camino directo.
      return mobileJson(request, { error: 'Falta aplicar la migración mobile_sync_v2.', code: 'gateway_disabled' }, { status: 503 });
    }
    console.error('[mobileSync] snapshot falló:', error);
    return mobileJson(request, { error: 'Error interno de G22 Scores.' }, { status: 500 });
  }
}
