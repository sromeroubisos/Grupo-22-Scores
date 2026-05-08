// Temporary diagnostic helper for tracking down refresh loops on desktop.
// Everything here is gated behind explicit env flags so it can be left in
// production builds with zero overhead until enabled. Remove once the
// refresh-loop investigation is closed.

const SENSITIVE_KEY_PATTERN = /token|access_token|refresh_token|authorization|cookie|set-cookie|apikey|api[_-]?key|service_role|password|secret|jwt/i;
const MAX_DEPTH = 4;
const MAX_STRING_LENGTH = 500;

export type RefreshLoopMetadata = Record<string, unknown>;

export function isRefreshLoopDebugEnabled(): boolean {
    if (typeof window !== 'undefined') {
        return process.env.NEXT_PUBLIC_DEBUG_REFRESH_LOOP === 'true';
    }

    return process.env.DEBUG_REFRESH_LOOP === 'true';
}

function getRuntimeLabel(): 'browser' | 'server' {
    return typeof window === 'undefined' ? 'server' : 'browser';
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function truncateString(value: string): string {
    if (value.length <= MAX_STRING_LENGTH) return value;
    return `${value.slice(0, MAX_STRING_LENGTH)}...[truncated]`;
}

function sanitize(value: unknown, depth = 0): unknown {
    if (depth > MAX_DEPTH) return '[depth-limit]';
    if (value === null || value === undefined) return value;

    if (typeof value === 'string') return truncateString(value);
    if (typeof value === 'number' || typeof value === 'boolean') return value;

    if (Array.isArray(value)) {
        return value.slice(0, 25).map((item) => sanitize(item, depth + 1));
    }

    if (value instanceof Error) {
        return {
            name: value.name,
            message: truncateString(value.message),
        };
    }

    if (!isPlainObject(value)) {
        return truncateString(String(value));
    }

    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
        if (SENSITIVE_KEY_PATTERN.test(key)) {
            result[key] = '[redacted]';
        } else {
            result[key] = sanitize(item, depth + 1);
        }
    }
    return result;
}

export function redactRefreshLoopMetadata(metadata: RefreshLoopMetadata = {}): RefreshLoopMetadata {
    const sanitized = sanitize(metadata);
    return isPlainObject(sanitized) ? sanitized : { value: sanitized };
}

const WARN_EVENT_PATTERN = /error|fail|invalid|cleared|skipped|reload|recovery|loop|401|403|429|5\d\d/i;

function pickLogger(event: string): (...args: unknown[]) => void {
    if (WARN_EVENT_PATTERN.test(event)) {
        return console.warn.bind(console);
    }
    return console.info.bind(console);
}

export function logRefreshLoop(event: string, metadata: RefreshLoopMetadata = {}): void {
    if (!isRefreshLoopDebugEnabled()) return;

    const payload = {
        ts: new Date().toISOString(),
        runtime: getRuntimeLabel(),
        ...redactRefreshLoopMetadata(metadata),
    };

    const logger = pickLogger(event);
    logger(`[REFRESH_LOOP] ${event}`, payload);
}
