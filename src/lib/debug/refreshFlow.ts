type DebugChannel = 'auth' | 'route';

const SENSITIVE_KEY_PATTERN = /token|access_token|refresh_token|authorization|cookie|set-cookie|apikey|api[_-]?key|service_role/i;
const MAX_DEPTH = 3;

export function isDebugAuthFlowEnabled() {
    if (typeof window !== 'undefined') {
        return process.env.NEXT_PUBLIC_DEBUG_AUTH_FLOW === 'true';
    }

    return process.env.DEBUG_AUTH_FLOW === 'true';
}

export function isDebugRouteRefreshEnabled() {
    if (typeof window !== 'undefined') {
        return process.env.NEXT_PUBLIC_DEBUG_ROUTE_REFRESH === 'true';
    }

    return process.env.DEBUG_ROUTE_REFRESH === 'true';
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function sanitizeForLog(value: unknown, depth = 0): unknown {
    if (depth > MAX_DEPTH) return '[depth-limit]';
    if (value === null || value === undefined) return value;
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;

    if (Array.isArray(value)) {
        return value.map((item) => sanitizeForLog(item, depth + 1));
    }

    if (!isPlainObject(value)) {
        return String(value);
    }

    return Object.fromEntries(
        Object.entries(value).map(([key, item]) => [
            key,
            SENSITIVE_KEY_PATTERN.test(key) ? '[redacted]' : sanitizeForLog(item, depth + 1),
        ]),
    );
}

export function logRefreshFlow(
    event: string,
    metadata: Record<string, unknown> = {},
    channel: DebugChannel = 'route',
) {
    const enabled = channel === 'auth'
        ? isDebugAuthFlowEnabled()
        : isDebugRouteRefreshEnabled();

    if (!enabled) return;

    console.log(`[RefreshFlow] ${event}`, sanitizeForLog(metadata));
}
