import { NextResponse } from 'next/server';
import { consumeRateLimit } from '@/lib/rateLimit';

/**
 * Guardas comunes de las rutas anónimas que terminan en un proveedor pago o
 * con cupo (FlashScore vía RapidAPI, ESPN, RugbyPass, el tenis).
 *
 * El problema no es un pedido: es que cada parámetro distinto (`page`, `url`,
 * `season`, `date`) es una llamada nueva al proveedor y una entrada nueva en la
 * caché. Sin tope, cualquiera con un `for` paga la cuenta de RapidAPI y llena la
 * memoria de la lambda. Estas guardas acotan las tres cosas: el pedido por IP,
 * el rango de los parámetros y quién puede cachear la respuesta.
 */

/** Cache-Control corto para respuestas que son iguales para cualquiera. */
export const PUBLIC_SHORT_CACHE_CONTROL = 'public, s-maxage=120, stale-while-revalidate=600';
const PRIVATE_NO_STORE = 'private, no-store';

const DEFAULT_ANON_MAX_PER_MINUTE = 60;

// Mismo patrón que `SUPABASE_STORAGE_KEY_PATTERN` de lib/supabase/client.ts:
// la cookie de sesión de Supabase, partida en chunks (.0, .1) o no.
const SUPABASE_SESSION_COOKIE = /^sb-[a-z0-9]+-auth-token(?:\.\d+)?$/i;

export function getClientIp(request: Request): string {
    const forwarded = request.headers.get('x-forwarded-for');
    if (forwarded) return forwarded.split(',')[0].trim() || 'unknown';
    return request.headers.get('x-real-ip') || 'unknown';
}

/**
 * Límite por IP para una ruta anónima. Devuelve la respuesta 429 lista para
 * devolver, o `null` si el pedido pasa.
 *
 * Respeta la semántica de `consumeRateLimit`: si el contador compartido no está
 * (la RPC no existe todavía en la base), falla abierto y queda solo el límite
 * por instancia. Un limitador roto no puede tirar abajo la página pública.
 *
 * @param namespace Prefijo de la clave (`fs-fixtures`, `rugbypass-stats`): dos
 *                  rutas con el mismo prefijo comparten cuota.
 */
export async function limitAnonymousRequest(
    request: Request,
    namespace: string,
    maxPerMinute: number = DEFAULT_ANON_MAX_PER_MINUTE,
): Promise<NextResponse | null> {
    const result = await consumeRateLimit(`${namespace}:${getClientIp(request)}`, maxPerMinute, 60);
    if (result.allowed) return null;

    const retryAfter = Math.max(1, result.retryAfter ?? 60);
    return NextResponse.json(
        { error: 'Demasiados pedidos. Probá de nuevo en un rato.' },
        {
            status: 429,
            headers: {
                'Retry-After': String(retryAfter),
                'Cache-Control': PRIVATE_NO_STORE,
            },
        },
    );
}

/**
 * `?page=` acotado a 1..max. Lo que no es un entero se toma como 1: la
 * alternativa (rechazar) rompería links viejos sin ganar nada.
 */
export function clampPageParam(raw: string | null, max = 20): number {
    const parsed = Number.parseInt(String(raw ?? '1'), 10);
    if (!Number.isFinite(parsed) || parsed < 1) return 1;
    return Math.min(parsed, max);
}

/** Si el pedido trae la cookie de sesión de Supabase. */
export function hasSupabaseSession(request: Request & { cookies?: { getAll(): Array<{ name: string }> } }): boolean {
    try {
        if (request.cookies?.getAll) {
            return request.cookies.getAll().some((cookie) => SUPABASE_SESSION_COOKIE.test(cookie.name));
        }
        const header = request.headers.get('cookie') || '';
        return header.split(';').some((part) => SUPABASE_SESSION_COOKIE.test(part.split('=')[0]?.trim() || ''));
    } catch {
        return false;
    }
}

/**
 * Cache-Control público corto, salvo que el pedido venga con sesión.
 *
 * Estas rutas leen el torneo con el cliente de sesión (RLS): un admin puede ver
 * un torneo que el público no ve. Si su respuesta quedara en el CDN con
 * `public`, el siguiente anónimo con la misma URL la recibiría. Con sesión,
 * entonces, no se guarda en ningún lado.
 */
export function applyPublicShortCache<T extends Response>(response: T, request: Request): T {
    response.headers.set(
        'Cache-Control',
        hasSupabaseSession(request) ? PRIVATE_NO_STORE : PUBLIC_SHORT_CACHE_CONTROL,
    );
    return response;
}
