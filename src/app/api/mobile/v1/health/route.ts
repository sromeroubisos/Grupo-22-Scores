import { NextRequest } from 'next/server';
import { isGlobalAdminRole } from '@/lib/auth/roles';
import { mobileJson, preflight } from '@/lib/server/mobileSync/cors';
import { buildSyncHealth } from '@/lib/server/mobileSync/health';
import { MobileAuthError, resolveMobileSession } from '@/lib/server/mobileSync/session';

export const dynamic = 'force-dynamic';

export function OPTIONS(request: NextRequest) {
  return preflight(request);
}

/** GET /api/mobile/v1/health — métricas de la sincronización móvil. Solo super admin. */
export async function GET(request: NextRequest) {
  try {
    const session = await resolveMobileSession(request);
    if (!isGlobalAdminRole(session.context.role)) return mobileJson(request, { error: 'Solo para administradores de G22.' }, { status: 403 });
    return mobileJson(request, await buildSyncHealth());
  } catch (error) {
    if (error instanceof MobileAuthError) return mobileJson(request, { error: error.message }, { status: error.status });
    console.error('[mobileSync] health falló:', error);
    return mobileJson(request, { error: 'Error interno de G22 Scores.' }, { status: 500 });
  }
}
