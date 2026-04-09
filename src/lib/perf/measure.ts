const DEFAULT_WARN_THRESHOLDS_MS = [100, 300, 1000] as const;
const duplicateWindowStore = new Map<string, number[]>();

export type PerfRuntime = 'client' | 'server' | 'either';

export type PerfMetadata = Record<string, unknown>;

export type MeasureAsyncOptions<T> = {
    runtime?: PerfRuntime;
    tags?: string[];
    metadata?: PerfMetadata;
    warnThresholdsMs?: number[];
    describeResult?: (result: T) => PerfMetadata;
    describeError?: (error: unknown) => PerfMetadata;
};

function normalizeTag(tag: string) {
    return tag.trim().toUpperCase();
}

function getClientPerfFlag() {
    return process.env.NEXT_PUBLIC_ENABLE_PERF_LOGS === 'true';
}

function getServerPerfFlag() {
    return process.env.ENABLE_SERVER_PERF_LOGS === 'true';
}

export function isPerfEnabled(runtime: PerfRuntime = 'either') {
    const isClient = typeof window !== 'undefined';

    if (runtime === 'client') {
        return isClient && getClientPerfFlag();
    }

    if (runtime === 'server') {
        return !isClient && getServerPerfFlag();
    }

    return isClient ? getClientPerfFlag() : getServerPerfFlag();
}

export function nowMs() {
    if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
        return performance.now();
    }

    return Date.now();
}

export function formatDurationMs(durationMs: number) {
    return `${durationMs.toFixed(1)}ms`;
}

export function normalizeErrorMessage(error: unknown) {
    if (error instanceof Error) return error.message;
    return String(error);
}

function formatValue(value: unknown): string {
    if (typeof value === 'number') {
        return Number.isFinite(value) ? String(value) : 'NaN';
    }

    if (typeof value === 'boolean') {
        return value ? 'true' : 'false';
    }

    if (value === null) return 'null';
    if (value === undefined) return 'undefined';

    if (Array.isArray(value)) {
        return value.map((item) => formatValue(item)).join('|');
    }

    if (typeof value === 'object') {
        try {
            return JSON.stringify(value);
        } catch {
            return '[object]';
        }
    }

    return String(value).replace(/\s+/g, ' ').trim();
}

export function logPerf(
    tags: string[],
    metadata: PerfMetadata = {},
    runtime: PerfRuntime = 'either',
) {
    if (!isPerfEnabled(runtime)) return;

    const prefix = ['[PERF]', ...tags.map((tag) => `[${normalizeTag(tag)}]`)].join('');
    const body = Object.entries(metadata)
        .filter(([, value]) => value !== undefined)
        .map(([key, value]) => `${key}=${formatValue(value)}`)
        .join(' ');

    if (body) {
        console.log(`${prefix} ${body}`);
        return;
    }

    console.log(prefix);
}

function logThresholdWarning(
    operation: string,
    durationMs: number,
    runtime: PerfRuntime,
    tags: string[],
    metadata: PerfMetadata,
    warnThresholdsMs: number[],
) {
    const breachedThreshold = [...warnThresholdsMs]
        .sort((left, right) => left - right)
        .filter((threshold) => durationMs >= threshold)
        .pop();

    if (!breachedThreshold) return;

    logPerf(
        ['WARN'],
        {
            operation,
            duration: formatDurationMs(durationMs),
            threshold: breachedThreshold,
            context: tags.map(normalizeTag).join('/'),
            ...metadata,
        },
        runtime,
    );
}

export async function measureAsync<T>(
    operation: string,
    fn: () => Promise<T>,
    options: MeasureAsyncOptions<T> = {},
) {
    const {
        runtime = 'either',
        tags = [],
        metadata = {},
        warnThresholdsMs = [...DEFAULT_WARN_THRESHOLDS_MS],
        describeResult,
        describeError,
    } = options;

    const startedAt = nowMs();

    try {
        const result = await fn();
        const durationMs = nowMs() - startedAt;
        const resultMetadata = describeResult ? describeResult(result) : {};

        logPerf(
            tags,
            {
                operation,
                duration: formatDurationMs(durationMs),
                ...metadata,
                ...resultMetadata,
            },
            runtime,
        );

        logThresholdWarning(operation, durationMs, runtime, tags, {
            ...metadata,
            ...resultMetadata,
        }, warnThresholdsMs);

        return result;
    } catch (error) {
        const durationMs = nowMs() - startedAt;
        const errorMetadata = describeError ? describeError(error) : {};

        logPerf(
            [...tags, 'ERROR'],
            {
                operation,
                duration: formatDurationMs(durationMs),
                error: normalizeErrorMessage(error),
                ...metadata,
                ...errorMetadata,
            },
            runtime,
        );

        logThresholdWarning(operation, durationMs, runtime, tags, {
            ...metadata,
            ...errorMetadata,
            error: normalizeErrorMessage(error),
        }, warnThresholdsMs);

        throw error;
    }
}

export function approximatePayloadBytes(payload: unknown) {
    try {
        const serialized = typeof payload === 'string' ? payload : JSON.stringify(payload);
        return new TextEncoder().encode(serialized).length;
    } catch {
        return 0;
    }
}

export function approximatePayloadKilobytes(payload: unknown) {
    return approximatePayloadBytes(payload) / 1024;
}

export function extractRowCount(payload: unknown) {
    if (Array.isArray(payload)) return payload.length;
    if (!payload) return 0;
    if (typeof payload === 'object') return 1;
    return 0;
}

export function recordDuplicateWindow(
    key: string,
    windowMs = 2000,
) {
    const currentTime = Date.now();
    const timestamps = duplicateWindowStore.get(key) ?? [];
    const nextTimestamps = [...timestamps.filter((timestamp) => currentTime - timestamp <= windowMs), currentTime];
    duplicateWindowStore.set(key, nextTimestamps);

    return {
        count: nextTimestamps.length,
        duplicate: nextTimestamps.length > 1,
        windowMs,
    };
}

export function warnIfDuplicateWindow(
    key: string,
    tags: string[],
    metadata: PerfMetadata = {},
    runtime: PerfRuntime = 'either',
    options?: {
        windowMs?: number;
        warnAfterCount?: number;
    },
) {
    const windowMs = options?.windowMs ?? 2000;
    const warnAfterCount = options?.warnAfterCount ?? 2;
    const result = recordDuplicateWindow(key, windowMs);

    if (result.count > warnAfterCount) {
        logPerf(
            [...tags, 'WARN'],
            {
                ...metadata,
                count: result.count,
                within: `${windowMs}ms`,
            },
            runtime,
        );
    }

    return result;
}

export function isSelectStar(selectValue: string) {
    const normalized = decodeURIComponent(selectValue).replace(/\s+/g, '');
    return normalized === '*' || normalized.includes('select=*');
}

export function findHeavyFields(
    selectValue: string,
    heavyFields = ['score', 'clock', 'events', 'lineups', 'weather', 'stats', 'ruleset'],
) {
    const normalized = decodeURIComponent(selectValue).toLowerCase();
    return heavyFields.filter((field) => normalized.includes(field.toLowerCase()));
}

export function logOverfetchWarning(
    metadata: PerfMetadata,
    runtime: PerfRuntime = 'either',
) {
    logPerf(['OVERFETCH', 'WARN'], metadata, runtime);
}

export function logLargePayloadWarning(
    metadata: PerfMetadata,
    runtime: PerfRuntime = 'either',
) {
    logPerf(['PAYLOAD', 'WARN'], metadata, runtime);
}
