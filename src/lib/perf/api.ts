import { NextResponse } from 'next/server';
import {
    approximatePayloadBytes,
    formatDurationMs,
    logLargePayloadWarning,
    logPerf,
    nowMs,
    type PerfMetadata,
} from './measure';

type ApiPerfBucket = 'auth' | 'client' | 'query' | 'serialize' | 'misc';

export function createApiPerfTracker(route: string) {
    const startedAt = nowMs();
    const buckets: Record<ApiPerfBucket, number> = {
        auth: 0,
        client: 0,
        query: 0,
        serialize: 0,
        misc: 0,
    };

    const notes: PerfMetadata = {};

    function addBucket(bucket: ApiPerfBucket, durationMs: number) {
        buckets[bucket] += durationMs;
    }

    async function measureStep<T>(
        step: string,
        fn: () => Promise<T>,
        options?: {
            bucket?: ApiPerfBucket;
            logQuery?: boolean;
            metadata?: PerfMetadata;
        },
    ) {
        const startedStepAt = nowMs();

        try {
            return await fn();
        } finally {
            const durationMs = nowMs() - startedStepAt;
            const bucket = options?.bucket ?? 'misc';
            addBucket(bucket, durationMs);

            if (options?.logQuery) {
                logPerf(
                    ['API', 'QUERY'],
                    {
                        route,
                        step,
                        duration: formatDurationMs(durationMs),
                        ...(options.metadata ?? {}),
                    },
                    'server',
                );
            }
        }
    }

    function note(metadata: PerfMetadata) {
        Object.assign(notes, metadata);
    }

    function finalize(metadata?: PerfMetadata) {
        const payloadBytes = typeof metadata?.payloadBytes === 'number' ? metadata.payloadBytes : undefined;
        const totalDurationMs = nowMs() - startedAt;

        logPerf(
            ['API'],
            {
                route,
                duration: formatDurationMs(totalDurationMs),
                auth: formatDurationMs(buckets.auth),
                client: formatDurationMs(buckets.client),
                query: formatDurationMs(buckets.query),
                serialize: formatDurationMs(buckets.serialize),
                payload: payloadBytes !== undefined ? `${(payloadBytes / 1024).toFixed(1)}kb` : '0.0kb',
                ...notes,
                ...(metadata ?? {}),
            },
            'server',
        );

        if (totalDurationMs > 800) {
            logPerf(
                ['API', 'WARN'],
                {
                    route,
                    duration: formatDurationMs(totalDurationMs),
                    threshold: 800,
                },
                'server',
            );
        }

        if (payloadBytes !== undefined && payloadBytes > 250 * 1024) {
            logLargePayloadWarning(
                {
                    route,
                    payload: `${(payloadBytes / 1024).toFixed(1)}kb`,
                },
                'server',
            );
        }
    }

    function json(payload: unknown, init?: ResponseInit) {
        const serializeStartedAt = nowMs();
        const response = NextResponse.json(payload, init);
        const serializeDurationMs = nowMs() - serializeStartedAt;
        addBucket('serialize', serializeDurationMs);

        const payloadBytes = approximatePayloadBytes(payload);
        finalize({
            status: init?.status ?? 200,
            payloadBytes,
        });

        return response;
    }

    return {
        measureStep,
        note,
        json,
        finalize,
    };
}
