'use client';

import { useEffect, useRef } from 'react';
import {
    formatDurationMs,
    logPerf,
    nowMs,
    warnIfDuplicateWindow,
    type PerfMetadata,
} from './measure';

export function usePerfComponentLifecycle(
    component: string,
    metadata: PerfMetadata = {},
) {
    const mountedAtRef = useRef(nowMs());
    const renderCountRef = useRef(0);
    const metadataKey = JSON.stringify(metadata);

    useEffect(() => {
        logPerf(
            ['RENDER'],
            {
                component,
                phase: 'hydrated',
                hydration: formatDurationMs(nowMs() - mountedAtRef.current),
                renderCount: renderCountRef.current,
                ...metadata,
            },
            'client',
        );
    }, [component, metadata, metadataKey]);

    useEffect(() => {
        renderCountRef.current += 1;
        const duplicateInfo = warnIfDuplicateWindow(
            `render:${component}`,
            ['RENDER'],
            {
                component,
                count: renderCountRef.current,
                ...metadata,
            },
            'client',
            {
                windowMs: 2000,
                warnAfterCount: 4,
            },
        );

        if (renderCountRef.current <= 3 || duplicateInfo.count > 4) {
            logPerf(
                ['RENDER'],
                {
                    component,
                    phase: 'commit',
                    renderCount: renderCountRef.current,
                    ...metadata,
                },
                'client',
            );
        }
    });
}

export function beginClientRequest(
    key: string,
    trigger: string,
    metadata: PerfMetadata = {},
) {
    const startedAt = nowMs();
    const duplicateInfo = warnIfDuplicateWindow(
        `request:${key}`,
        ['FETCH'],
        {
            key,
            trigger,
            ...metadata,
        },
        'client',
        {
            windowMs: 2000,
            warnAfterCount: 2,
        },
    );

    logPerf(
        ['FETCH'],
        {
            key,
            trigger,
            count: duplicateInfo.count,
            ...metadata,
        },
        'client',
    );

    return {
        end(extra: PerfMetadata = {}) {
            const durationMs = nowMs() - startedAt;
            logPerf(
                ['FETCH'],
                {
                    key,
                    trigger,
                    duration: formatDurationMs(durationMs),
                    ...metadata,
                    ...extra,
                },
                'client',
            );

            if (durationMs > 800) {
                logPerf(
                    ['FETCH', 'WARN'],
                    {
                        key,
                        trigger,
                        duration: formatDurationMs(durationMs),
                        threshold: 800,
                    },
                    'client',
                );
            }
        },
    };
}
