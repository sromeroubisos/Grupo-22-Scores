import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Rate limiting en dos capas.
 *
 * 1. **En memoria, por instancia.** Gratis y sin latencia. Frena la ráfaga que
 *    cae en una misma lambda, que es el caso comun de un retry loop.
 * 2. **En Postgres, compartido.** La cuenta real. Sin esta capa, un limite de
 *    10/min en Vercel es 10/min POR INSTANCIA, y la cantidad de instancias
 *    crece justo cuando hay un ataque.
 *
 * La capa 1 va primero a proposito: si ya bloqueo localmente, no tiene sentido
 * pagar un round-trip a la base para confirmarlo.
 *
 * **Falla abierta.** Si la funcion `consume_rate_limit` no existe todavia (este
 * repo tiene migraciones sin correr) o falta la service key, deja pasar y avisa
 * una sola vez por proceso. Un limitador roto no puede dejar a todo el mundo
 * afuera del login; el costo de fallar cerrado es peor que el de fallar
 * abierto, y la capa 1 sigue en pie.
 */

type LimitEntry = {
    count: number;
    resetAt: number;
};

export interface RateLimitResult {
    allowed: boolean;
    retryAfter?: number;
}

const DEFAULT_WINDOW_SECONDS = 60;
const DEFAULT_MAX_REQUESTS = 10;

const store = new Map<string, LimitEntry>();

/**
 * Capa 1. Sincrona, por instancia. NO se exporta a proposito: es el limite
 * debil, y un endpoint que la use por error queda sin contador compartido sin
 * que nadie lo note. La puerta publica es consumeRateLimit().
 */
function rateLimitByIp(
    key: string,
    maxRequests: number = DEFAULT_MAX_REQUESTS,
    windowSeconds: number = DEFAULT_WINDOW_SECONDS,
): RateLimitResult {
    const now = Date.now();
    const windowMs = windowSeconds * 1000;
    const entry = store.get(key);

    if (!entry || now > entry.resetAt) {
        store.set(key, { count: 1, resetAt: now + windowMs });
        return { allowed: true };
    }

    if (entry.count >= maxRequests) {
        return { allowed: false, retryAfter: Math.ceil((entry.resetAt - now) / 1000) };
    }

    entry.count += 1;
    return { allowed: true };
}

let avisoEmitido = false;

function avisarUnaVez(motivo: string, error: unknown) {
    if (avisoEmitido) return;
    avisoEmitido = true;
    console.warn(
        `[rateLimit] sin contador compartido (${motivo}); queda solo el limite por instancia. ` +
        'Corre supabase/migrations/20260819220000_rate_limits.sql.',
        error,
    );
}

/**
 * Las dos capas. Es lo que deberian usar los endpoints.
 *
 * @param key          Namespacealo por ruta (`commit-session:1.2.3.4`), o dos
 *                     endpoints distintos comparten cuota y se bloquean entre si.
 * @param maxRequests  Intentos permitidos por ventana.
 * @param windowSeconds Largo de la ventana.
 */
export async function consumeRateLimit(
    key: string,
    maxRequests: number = DEFAULT_MAX_REQUESTS,
    windowSeconds: number = DEFAULT_WINDOW_SECONDS,
): Promise<RateLimitResult> {
    const local = rateLimitByIp(key, maxRequests, windowSeconds);
    if (!local.allowed) {
        return local;
    }

    try {
        const admin = createAdminClient();
        const { data, error } = await admin.rpc('consume_rate_limit', {
            p_key: key,
            p_max: maxRequests,
            p_window_seconds: windowSeconds,
        });

        if (error) {
            avisarUnaVez('la RPC devolvio error', error);
            return { allowed: true };
        }

        // La funcion devuelve una tabla de una fila; PostgREST la entrega como array.
        const row = (Array.isArray(data) ? data[0] : data) as
            | { allowed?: boolean; retry_after?: number }
            | null
            | undefined;

        if (!row || typeof row.allowed !== 'boolean') {
            avisarUnaVez('la RPC devolvio una forma inesperada', row);
            return { allowed: true };
        }

        return row.allowed
            ? { allowed: true }
            : { allowed: false, retryAfter: row.retry_after ?? windowSeconds };
    } catch (error) {
        avisarUnaVez('no se pudo crear el cliente admin', error);
        return { allowed: true };
    }
}
