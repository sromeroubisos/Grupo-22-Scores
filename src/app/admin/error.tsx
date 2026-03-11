'use client';

import { useEffect, useRef } from 'react';

interface AdminErrorProps {
    error: Error & { digest?: string };
    reset: () => void;
}

function isAbortError(error: Error) {
    return (
        error.name === 'AbortError' ||
        error.message?.includes('aborted') ||
        error.message?.includes('signal is aborted')
    );
}

export default function AdminError({ error, reset }: AdminErrorProps) {
    const retryCount = useRef(0);
    const abort = isAbortError(error);

    useEffect(() => {
        if (!abort) return;

        // AbortErrors are transient (Turbopack HMR, navigation cancel, etc.)
        // Auto-retry up to 3 times with short backoff: 150ms → 400ms → 900ms
        if (retryCount.current >= 3) return;

        const delay = [150, 400, 900][retryCount.current] ?? 900;
        retryCount.current += 1;

        const t = setTimeout(() => {
            reset();
        }, delay);

        return () => clearTimeout(t);
    }, [abort, reset]);

    // AbortError: show a minimal reconnecting indicator — no jarring error screen
    if (abort) {
        return (
            <div className="flex items-center justify-center min-h-[50vh]">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-8 h-8 border-2 border-white/10 border-t-[#00ff88] rounded-full animate-spin" />
                    <span className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-600 animate-pulse">
                        Reconectando...
                    </span>
                </div>
            </div>
        );
    }

    // Real errors: show actionable UI
    return (
        <div className="min-h-[60vh] flex flex-col items-center justify-center p-8 text-center">
            <div className="w-14 h-14 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mb-6">
                <span className="material-symbols-outlined text-red-500 text-2xl">error</span>
            </div>
            <h2 className="text-xl font-black text-white uppercase italic tracking-tight mb-2">
                Algo salió mal
            </h2>
            <p className="text-xs text-slate-500 font-mono mb-2 max-w-md">
                {error.message || 'Error inesperado'}
            </p>
            {error.digest && (
                <p className="text-[10px] text-slate-700 font-mono mb-8">
                    digest: {error.digest}
                </p>
            )}
            <button
                onClick={reset}
                className="flex items-center gap-2 px-6 py-3 rounded-xl bg-primary-accent text-[#0a0a0f] text-[10px] font-black uppercase tracking-widest shadow-[0_0_20px_rgba(0,255,136,0.2)] hover:shadow-[0_0_30px_rgba(0,255,136,0.4)] transition-all"
            >
                <span className="material-symbols-outlined text-lg">refresh</span>
                Reintentar
            </button>
        </div>
    );
}
