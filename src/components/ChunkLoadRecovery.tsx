'use client';

import { useEffect } from 'react';

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

function isNextStaticAssetError(event: Event) {
    const target = event.target;
    if (!(target instanceof HTMLScriptElement || target instanceof HTMLLinkElement)) {
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

    if ('serviceWorker' in navigator) {
        tasks.push(
            navigator.serviceWorker.getRegistrations().then((registrations) => (
                Promise.all(registrations.map((registration) => registration.unregister()))
            )),
        );
    }

    await Promise.allSettled(tasks);
}

function reloadWithCacheBust() {
    const url = new URL(window.location.href);
    url.searchParams.set('__g22_reload', String(Date.now()));
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
                recover();
            }
        };

        const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
            if (isChunkLoadFailure(event.reason)) {
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
