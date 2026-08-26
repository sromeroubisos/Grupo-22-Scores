function resolveRequestUrl(input: string | URL | Request): string {
    if (typeof input === 'string') return input;
    if (input instanceof URL) return input.toString();
    return input.url;
}

export function isSupabaseAuthRequest(input: string | URL | Request, supabaseUrl: string) {
    return resolveRequestUrl(input).startsWith(`${supabaseUrl}/auth/v1`);
}

export function isSupabaseRefreshTokenRequest(input: string | URL | Request, supabaseUrl: string) {
    const requestUrl = resolveRequestUrl(input);
    if (!requestUrl.startsWith(`${supabaseUrl}/auth/v1/token`)) return false;
    return requestUrl.includes('grant_type=refresh_token');
}

function buildRetryableRefreshFailureResponse(response: Response, reason: string) {
    const headers = new Headers(response.headers);
    headers.set('Content-Type', 'application/json');
    headers.set('X-G22-Original-Auth-Status', String(response.status));
    headers.set('X-G22-Auth-Preserved-Reason', reason);

    return new Response(
        JSON.stringify({
            error: 'supabase_auth_refresh_preserved',
            message: 'Supabase auth refresh failed transiently; preserving the current session.',
            reason,
        }),
        {
            status: 503,
            statusText: 'Service Unavailable',
            headers,
        },
    );
}

function refreshFailureReasonFromBody(body: unknown): string | null {
    const value = typeof body === 'string'
        ? body
        : body && typeof body === 'object'
            ? JSON.stringify(body)
            : '';
    const normalized = value.toLowerCase();

    if (
        normalized.includes('refresh_token_already_used') ||
        normalized.includes('refresh token already used')
    ) {
        return 'refresh_token_already_used';
    }

    if (
        normalized.includes('invalid_refresh_token') ||
        normalized.includes('refresh_token_not_found') ||
        normalized.includes('refresh token is not valid') ||
        normalized.includes('invalid refresh token')
    ) {
        return 'invalid_refresh_token';
    }

    return null;
}

// ── La gracia del refresh, y por qué tiene que terminarse ────────────────
//
// Coercionar un fallo de refresh a 503 existe para una carrera real:
// cliente y servidor renuevan a la vez, el que pierde ve "already used" o
// "not found" aunque el otro acabe de escribir una sesión buena, y limpiar
// ahí sería borrar una sesión viva.
//
// Pero un refresh token genuinamente muerto devuelve ese mismo error para
// siempre. Sin tope, el 503 sintético lo vuelve eterno: auth-js lo lee como
// AuthRetryableFetchError, nunca borra su storage, nunca emite SIGNED_OUT, y
// el navegador queda pidiendo /token cada pocos segundos sin salida posible.
//
// El presupuesto se lleva POR TOKEN, no global: en el servidor este módulo
// es compartido por todos los usuarios, y un contador global dejaría que el
// token muerto de uno se coma la gracia del otro.
const REFRESH_GRACE_ATTEMPTS = 3;
// Los reintentos internos de auth-js salen en milisegundos. Con la cuenta de
// intentos sola, se comerían la gracia antes de que el otro actor alcance a
// escribir la sesión nueva, así que la gracia también pide tiempo de reloj.
const REFRESH_GRACE_MIN_MS = 8_000;
const REFRESH_LEDGER_TTL_MS = 5 * 60 * 1_000;
const REFRESH_LEDGER_MAX_ENTRIES = 50;

type RefreshLedgerEntry = {
    coercedAttempts: number;
    firstFailureAt: number;
    updatedAt: number;
};

const refreshLedger = new Map<string, RefreshLedgerEntry>();

// FNV-1a de 32 bits. No es criptográfico y no necesita serlo: solo distingue
// un refresh token de otro sin guardar el token en memoria.
function fingerprintToken(token: string): string {
    let hash = 0x811c9dc5;
    for (let index = 0; index < token.length; index += 1) {
        hash ^= token.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return `t${hash.toString(36)}`;
}

async function readRefreshTokenKey(
    input: string | URL | Request,
    init: RequestInit | undefined,
): Promise<string | null> {
    let raw: string | null = null;

    try {
        const body = init?.body;
        if (typeof body === 'string') {
            raw = body;
        } else if (typeof Request !== 'undefined' && input instanceof Request) {
            raw = await input.clone().text();
        }
    } catch {
        return null;
    }

    if (!raw) return null;

    try {
        const parsed = JSON.parse(raw) as unknown;
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            const token = (parsed as { refresh_token?: unknown }).refresh_token;
            if (typeof token === 'string' && token) return fingerprintToken(token);
        }
    } catch {
        // El cuerpo no era JSON: nos quedamos sin llave y el llamador decide.
    }

    return null;
}

function pruneRefreshLedger(now: number) {
    for (const [key, entry] of refreshLedger) {
        if (now - entry.updatedAt > REFRESH_LEDGER_TTL_MS) refreshLedger.delete(key);
    }

    while (refreshLedger.size > REFRESH_LEDGER_MAX_ENTRIES) {
        const oldest = refreshLedger.keys().next();
        if (oldest.done) break;
        refreshLedger.delete(oldest.value);
    }
}

// Devuelve true mientras al token le quede gracia. El fallo se deja pasar
// solo cuando se agotaron los intentos Y pasó el tiempo en que una carrera
// real ya se habría resuelto.
function consumeRefreshGrace(key: string): boolean {
    const now = Date.now();
    pruneRefreshLedger(now);

    const entry = refreshLedger.get(key);
    if (!entry) {
        refreshLedger.set(key, { coercedAttempts: 1, firstFailureAt: now, updatedAt: now });
        return true;
    }

    const attemptsSpent = entry.coercedAttempts >= REFRESH_GRACE_ATTEMPTS;
    const waitedLongEnough = now - entry.firstFailureAt >= REFRESH_GRACE_MIN_MS;
    if (attemptsSpent && waitedLongEnough) return false;

    refreshLedger.set(key, {
        coercedAttempts: entry.coercedAttempts + 1,
        firstFailureAt: entry.firstFailureAt,
        updatedAt: now,
    });
    return true;
}

function releaseRefreshGrace(key: string) {
    refreshLedger.delete(key);
}

// Señal para AuthContext: el último fallo de refresh fue terminal, o sea que
// se dejó pasar el error real y auth-js va a emitir un SIGNED_OUT que esta
// vez hay que creerle. Solo se marca en el navegador: en el servidor el
// módulo es compartido entre usuarios y un flag global mezclaría sesiones.
const TERMINAL_REFRESH_FAILURE_WINDOW_MS = 30_000;
let lastTerminalRefreshFailureAt = 0;

function markTerminalRefreshFailure() {
    if (typeof window === 'undefined') return;
    lastTerminalRefreshFailureAt = Date.now();
}

export function hasRecentTerminalRefreshFailure(
    windowMs: number = TERMINAL_REFRESH_FAILURE_WINDOW_MS,
): boolean {
    if (typeof window === 'undefined') return false;
    if (!lastTerminalRefreshFailureAt) return false;
    return Date.now() - lastTerminalRefreshFailureAt <= windowMs;
}

export function resetTerminalRefreshFailure() {
    lastTerminalRefreshFailureAt = 0;
}

// Solo para tests: deja el ledger y la señal terminal como recién arrancados.
export function __resetRefreshGraceForTests() {
    refreshLedger.clear();
    lastTerminalRefreshFailureAt = 0;
}

export function coerceRefreshRateLimitToRetryable(
    input: string | URL | Request,
    supabaseUrl: string,
    response: Response,
) {
    if (response.status !== 429) return response;
    if (!isSupabaseRefreshTokenRequest(input, supabaseUrl)) return response;

    // auth-js treats 429 as a non-retryable AuthApiError and clears storage.
    // For refresh-token calls that is too destructive: rate limits are
    // transient, so expose them as retryable 503s and keep the session intact.
    return buildRetryableRefreshFailureResponse(response, 'rate_limited');
}

export async function coerceRefreshFailureToRetryable(
    input: string | URL | Request,
    supabaseUrl: string,
    response: Response,
    init?: RequestInit,
) {
    const rateLimitResponse = coerceRefreshRateLimitToRetryable(input, supabaseUrl, response);
    if (rateLimitResponse !== response) return rateLimitResponse;
    if (!isSupabaseRefreshTokenRequest(input, supabaseUrl)) return response;

    const tokenKey = await readRefreshTokenKey(input, init);

    // Una renovación que salió bien cierra el expediente del token viejo: la
    // próxima vez que este token falle, arranca con la gracia entera.
    if (response.ok) {
        if (tokenKey) releaseRefreshGrace(tokenKey);
        resetTerminalRefreshFailure();
        return response;
    }

    if (![400, 401, 403].includes(response.status)) return response;

    let reason: string | null = null;
    try {
        const contentType = response.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
            reason = refreshFailureReasonFromBody(await response.clone().json());
        } else {
            reason = refreshFailureReasonFromBody(await response.clone().text());
        }
    } catch {
        reason = null;
    }

    if (!reason) return response;

    // Sin llave de token no se puede llevar la cuenta por sesión. En el
    // navegador hay una sola sesión, así que una llave compartida alcanza; en
    // el servidor preferimos conceder la gracia antes que arriesgar el
    // contador de otro usuario.
    const ledgerKey = tokenKey ?? (typeof window !== 'undefined' ? 'browser-session' : null);
    if (!ledgerKey) return buildRetryableRefreshFailureResponse(response, reason);

    if (!consumeRefreshGrace(ledgerKey)) {
        // Gracia agotada: el token está muerto de verdad. Se deja pasar el
        // error real para que auth-js limpie su storage y emita SIGNED_OUT.
        markTerminalRefreshFailure();
        return response;
    }

    return buildRetryableRefreshFailureResponse(response, reason);
}

export function createRetryableRefreshFetch(
    supabaseUrl: string | undefined,
    fetchImpl: typeof fetch,
): typeof fetch {
    return async (input, init) => {
        const response = await fetchImpl(input, init);
        if (!supabaseUrl) return response;
        return coerceRefreshFailureToRetryable(input, supabaseUrl, response, init);
    };
}

export function isRetryableAuthRefreshError(error: unknown) {
    if (!error || typeof error !== 'object') return false;

    const name = 'name' in error && typeof error.name === 'string'
        ? error.name
        : '';
    const status = 'status' in error && typeof error.status === 'number'
        ? error.status
        : null;
    const message = 'message' in error && typeof error.message === 'string'
        ? error.message.toLowerCase()
        : '';

    return (
        name === 'AuthRetryableFetchError' ||
        status === 429 ||
        status === 502 ||
        status === 503 ||
        status === 504 ||
        message.includes('rate limit') ||
        message.includes('temporarily unavailable') ||
        message.includes('timed out') ||
        message.includes('refresh failed transiently')
    );
}
