import 'server-only';

/**
 * CORS de la puerta móvil. La app nativa no lo necesita; la versión web (PWA)
 * sí, si se publica en otro dominio. La sesión viaja en `Authorization: Bearer`
 * (nunca en cookies), así que no hace falta `Access-Control-Allow-Credentials`.
 *
 * Orígenes permitidos: `MOBILE_GATEWAY_ALLOWED_ORIGINS` (separados por coma).
 * Sin la variable, no se agrega ningún header (solo mismo origen y apps nativas).
 */
import { NextResponse } from 'next/server';

function allowedOrigins(): string[] {
  return (process.env.MOBILE_GATEWAY_ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((origin) => origin.trim().replace(/\/+$/, ''))
    .filter(Boolean);
}

export function corsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get('origin');
  if (!origin || !allowedOrigins().includes(origin)) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, Accept, X-G22-Client',
    'Access-Control-Expose-Headers': 'Retry-After',
    'Access-Control-Max-Age': '600',
    Vary: 'Origin',
  };
}

/** Respuesta JSON con los headers de CORS (y los extra que se pasen, p. ej. Retry-After). */
export function mobileJson(request: Request, body: unknown, init: { status?: number; headers?: Record<string, string> } = {}): NextResponse {
  return NextResponse.json(body, { status: init.status ?? 200, headers: { ...corsHeaders(request), 'Cache-Control': 'no-store', ...(init.headers ?? {}) } });
}

export function preflight(request: Request): NextResponse {
  return new NextResponse(null, { status: 204, headers: corsHeaders(request) });
}
