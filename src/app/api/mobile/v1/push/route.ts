import { NextRequest } from 'next/server';
import { mobileJson, preflight } from '@/lib/server/mobileSync/cors';
import { type PushRequest } from '@/lib/server/mobileSync/protocol';
import { ForwardAuthError, LedgerMissingError, processPush } from '@/lib/server/mobileSync/push';
import { MobileAuthError, resolveMobileSession } from '@/lib/server/mobileSync/session';

export const dynamic = 'force-dynamic';
// Una tanda de hasta 50 modificaciones: un PATCH por partido, de a 4 partidos en paralelo.
export const maxDuration = 60;

/** Versiones del protocolo que entiende esta puerta (v2 agrega campos opcionales a v1). */
const SUPPORTED_VERSIONS = new Set([1, 2]);
/**
 * Freno por instancia: con más tandas que esto en curso, se pide esperar (429)
 * en vez de encolar trabajo que va a terminar en timeout. La app espera y
 * reintenta sola, con azar, sin contar la espera como falla.
 */
const MAX_CONCURRENT_PUSHES = 8;
let inFlight = 0;

export function OPTIONS(request: NextRequest) {
  return preflight(request);
}

/**
 * POST /api/mobile/v1/push — la app móvil G22 Gestión sube lo que cargó (también
 * lo cargado sin conexión). Ver src/lib/server/mobileSync/push.ts.
 */
export async function POST(request: NextRequest) {
  let body: PushRequest;
  try {
    body = (await request.json()) as PushRequest;
  } catch {
    return mobileJson(request, { error: 'Cuerpo inválido.' }, { status: 400 });
  }
  if (!SUPPORTED_VERSIONS.has(Number(body?.protocolVersion))) {
    return mobileJson(request, { error: 'Actualizá la app G22 Gestión para seguir sincronizando.' }, { status: 426 });
  }
  if (process.env.MOBILE_GATEWAY_DISABLED === '1') {
    // Interruptor de emergencia: la app vuelve sola al camino directo, sin perder nada.
    return mobileJson(request, { error: 'La sincronización móvil está pausada.', code: 'gateway_disabled' }, { status: 503 });
  }
  if (inFlight >= MAX_CONCURRENT_PUSHES) {
    return mobileJson(request, { error: 'G22 está con mucha carga. Se reintenta solo.' }, { status: 429, headers: { 'Retry-After': '5' } });
  }

  inFlight += 1;
  try {
    const session = await resolveMobileSession(request);
    const origin = process.env.MOBILE_GATEWAY_INTERNAL_ORIGIN || request.nextUrl.origin;
    return mobileJson(request, await processPush(session, body, origin));
  } catch (error) {
    if (error instanceof MobileAuthError) return mobileJson(request, { error: error.message }, { status: error.status });
    if (error instanceof ForwardAuthError) return mobileJson(request, { error: 'La sesión venció.' }, { status: 401 });
    if (error instanceof LedgerMissingError) {
      return mobileJson(request, { error: 'La sincronización móvil no está habilitada: falta aplicar la migración mobile_sync_v2.', code: 'gateway_disabled' }, { status: 503 });
    }
    console.error('[mobileSync] push falló:', error);
    return mobileJson(request, { error: 'Error interno de G22 Scores.' }, { status: 500 });
  } finally {
    inFlight -= 1;
  }
}
