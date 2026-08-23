import { createAdminClient } from '@/lib/supabase/admin';

type LimitEntry = {
    count: number;
    resetAt: number;
};

export interface RateLimitResult {
    allowed: boolean;
    retryAfter?: number;
}

const store = new Map<string, LimitEntry>();
const WINDOW_MS = 60_000;
const MAX_REQUESTS = 10;

/**
 * Capa 1: en memoria, por instancia de lambda. Gratis y sin latencia.
 *
 * `windowSeconds` es opcional y por omisión mantiene el minuto de siempre, así
 * que los llamadores que ya existían no cambian de comportamiento.
 */
export function rateLimitByIp(
    ip: string,
    maxRequests: number = MAX_REQUESTS,
    windowSeconds?: number,
): { allowed: boolean; retryAfter?: number } {
    const now = Date.now();
    const ventanaMs = windowSeconds === undefined ? WINDOW_MS : windowSeconds * 1000;
    const entry = store.get(ip);

    if (!entry || now > entry.resetAt) {
        store.set(ip, { count: 1, resetAt: now + ventanaMs });
        return { allowed: true };
    }

    if (entry.count >= maxRequests) {
        const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
        return { allowed: false, retryAfter };
    }

    entry.count += 1;
    return { allowed: true };
}

// Simple in-memory sliding window for auth callbacks (stricter)
const authStore = new Map<string, LimitEntry>();
const AUTH_WINDOW_MS = 60_000;
const AUTH_MAX_REQUESTS = 5;

export function rateLimitAuthCallback(ip: string): { allowed: boolean; retryAfter?: number } {
    const now = Date.now();
    const entry = authStore.get(ip);

    if (!entry || now > entry.resetAt) {
        authStore.set(ip, { count: 1, resetAt: now + AUTH_WINDOW_MS });
        return { allowed: true };
    }

    if (entry.count >= AUTH_MAX_REQUESTS) {
        const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
        return { allowed: false, retryAfter };
    }

    entry.count += 1;
    return { allowed: true };
}

/**
 * Las dos capas: la de memoria y la compartida en Postgres.
 *
 * Se agrega para el endpoint público de leads (`/api/leads/club-demo`), que es
 * el primero de este archivo abierto a cualquiera sin sesión. Sin la capa
 * compartida, un límite de 5 por instancia es 5 POR LAMBDA, y la cantidad de
 * lambdas crece justo cuando hay un ataque.
 *
 * Los tres llamadores que ya usaban `rateLimitByIp` siguen igual: esto se suma,
 * no los reemplaza.
 *
 * **Falla abierta.** Si la función `consume_rate_limit` todavía no existe en la
 * base (este repo tiene migraciones sin correr) o falta la service key, deja
 * pasar y avisa una sola vez por proceso. Un limitador roto no puede dejar a
 * todo el mundo afuera; la capa 1 sigue en pie de todas formas.
 */
let avisoEmitido = false;

function avisarUnaVez(motivo: string, error: unknown) {
    if (avisoEmitido) return;
    avisoEmitido = true;
    console.warn(
        `[rateLimit] sin contador compartido (${motivo}); queda solo el limite por instancia.`,
        error,
    );
}

export async function consumeRateLimit(
    key: string,
    maxRequests: number = MAX_REQUESTS,
    windowSeconds: number = 60,
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

        // La función devuelve una tabla de una fila; PostgREST la entrega como array.
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
