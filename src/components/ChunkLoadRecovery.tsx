'use client';

import { useEffect } from 'react';
import { logRefreshLoop } from '@/lib/debug/refreshLoop';

const RECOVERY_STORAGE_KEY = 'g22-chunk-recovery-attempted-at';
const RECOVERY_WINDOW_MS = 60_000;

function getErrorText(value: unknown): string {
    if (!value) return '';

    if (typeof value === 'string') return value;

    if (value instanceof Error) {
        return `${value.name} ${value.message} ${value.stack || ''}`;
    }

    if (typeof value === 'object') {
        const record = value as Record<string, unknown>;
        return [
            record.name,
            record.message,
            record.stack,
            record.reason,
            record.error,
        ]
            .map(getErrorText)
            .filter(Boolean)
            .join(' ');
    }

    return String(value);
}

function isChunkLoadFailure(value: unknown) {
    const text = getErrorText(value).toLowerCase();
    return (
        text.includes('chunkloaderror') ||
        text.includes('loading chunk') ||
        text.includes('loading css chunk') ||
        text.includes('failed to fetch dynamically imported module') ||
        text.includes('importing a module script failed') ||
        text.includes('error loading dynamically imported module')
    );
}

// rel values whose load failures are non-fatal: the real chunk request
// (via fetch / runtime <script>) will surface a proper ChunkLoadError
// later if the asset is actually unavailable. Treating these as fatal was
// the root cause of the desktop refresh loop:
//   - Next.js eagerly issues <link rel="prefetch" href="/_next/static/..."> on
//     hover (only on desktop, since mobile/tablet have no hover).
//   - When a single prefetch is blocked by an extension/ad-blocker or fails
//     due to a CDN/network blip the <link> fires an `error` event that
//     bubbles to window via the capture-phase listener below, and we used to
//     mistake it for a chunk-load failure and trigger a full reload.
const NON_FATAL_LINK_RELS = new Set([
    'prefetch',
    'preload',
    'modulepreload',
    'preconnect',
    'dns-prefetch',
    'stylesheet-prefetch',
]);

function isNonFatalLinkPreload(target: HTMLLinkElement) {
    const rel = (target.rel || target.getAttribute('rel') || '').toLowerCase();
    if (!rel) return false;
    // `rel` can be space-separated (e.g. "preload prefetch")
    return rel.split(/\s+/).some((token) => NON_FATAL_LINK_RELS.has(token));
}

function isNextStaticAssetError(event: Event) {
    const target = event.target;
    if (!(target instanceof HTMLScriptElement || target instanceof HTMLLinkElement)) {
        return false;
    }

    // Skip non-fatal <link> preload/prefetch failures. Recovery should only
    // be triggered when the asset is actually being executed/loaded.
    if (target instanceof HTMLLinkElement && isNonFatalLinkPreload(target)) {
        return false;
    }

    const assetUrl = target instanceof HTMLScriptElement ? target.src : target.href;
    return assetUrl.includes('/_next/static/');
}

function canAttemptRecovery() {
    try {
        const lastAttempt = Number(window.sessionStorage.getItem(RECOVERY_STORAGE_KEY) || '0');
        return !lastAttempt || Date.now() - lastAttempt > RECOVERY_WINDOW_MS;
    } catch {
        return true;
    }
}

function markRecoveryAttempted() {
    try {
        window.sessionStorage.setItem(RECOVERY_STORAGE_KEY, String(Date.now()));
    } catch {
        // Storage can fail in strict privacy modes; the reload is still useful.
    }
}

async function clearStaleClientCaches() {
    const tasks: Array<Promise<unknown>> = [];

    if ('caches' in window) {
        tasks.push(
            caches.keys().then((names) => (
                Promise.all(names.map((name) => caches.delete(name)))
            )),
        );
    }

    // A proposito NO se desregistra el service worker. El SW no cachea chunks
    // de JS (solo escudos, icono y manifest), asi que sacarlo no arregla un
    // ChunkLoadError; y desregistrarlo mata la suscripcion Web Push del
    // dispositivo: el servidor sigue teniendo el endpoint, el push service
    // contesta 410 y el cron la apaga. Como esto se dispara despues de cada
    // deploy, los avisos del celular se "desactivaban solos".
    await Promise.allSettled(tasks);
}

function reloadWithCacheBust() {
    const url = new URL(window.location.href);
    url.searchParams.set('__g22_reload', String(Date.now()));
    logRefreshLoop('chunk_recovery_reload_called', {
        method: 'window.location.replace',
        reason: 'chunk_load_failure_recovery',
        currentPath: window.location.pathname,
    });
    window.location.replace(url.toString());
}

function clearRecoveryCacheBustParam() {
    const url = new URL(window.location.href);
    if (!url.searchParams.has('__g22_reload')) return;

    url.searchParams.delete('__g22_reload');
    window.history.replaceState(
        window.history.state,
        '',
        `${url.pathname}${url.search}${url.hash}`,
    );
}

export default function ChunkLoadRecovery() {
    useEffect(() => {
        let recoveryStarted = false;
        clearRecoveryCacheBustParam();

        const recover = () => {
            if (recoveryStarted || !canAttemptRecovery()) return;
            recoveryStarted = true;
            markRecoveryAttempted();

            void clearStaleClientCaches().finally(() => {
                reloadWithCacheBust();
            });
        };

        const handleWindowError = (event: ErrorEvent) => {
            if (isChunkLoadFailure(event.error || event.message) || isNextStaticAssetError(event)) {
                const target = event.target;
                const asset = target instanceof HTMLScriptElement
                    ? target.src
                    : target instanceof HTMLLinkElement
                        ? target.href
                        : null;
                logRefreshLoop('chunk_recovery_detected', {
                    source: 'window_error',
                    message: typeof event.message === 'string' ? event.message.slice(0, 200) : null,
                    asset,
                    canAttemptRecovery: canAttemptRecovery(),
                });
                recover();
            }
        };

        const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
            if (isChunkLoadFailure(event.reason)) {
                const reasonText = event.reason instanceof Error
                    ? `${event.reason.name}: ${event.reason.message}`
                    : String(event.reason);
                logRefreshLoop('chunk_recovery_detected', {
                    source: 'unhandledrejection',
                    message: reasonText.slice(0, 200),
                    canAttemptRecovery: canAttemptRecovery(),
                });
                recover();
            }
        };

        window.addEventListener('error', handleWindowError, true);
        window.addEventListener('unhandledrejection', handleUnhandledRejection);

        return () => {
            window.removeEventListener('error', handleWindowError, true);
            window.removeEventListener('unhandledrejection', handleUnhandledRejection);
        };
    }, []);

    return null;
}
