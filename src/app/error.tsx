'use client';

import Link from 'next/link';
import { useEffect, useRef } from 'react';

interface ErrorProps {
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

export default function GlobalError({ error, reset }: ErrorProps) {
    const retryCount = useRef(0);
    const abort = isAbortError(error);

    useEffect(() => {
        if (!abort) return;
        if (retryCount.current >= 3) return;

        const delay = [150, 400, 900][retryCount.current] ?? 900;
        retryCount.current += 1;

        const t = setTimeout(() => reset(), delay);
        return () => clearTimeout(t);
    }, [abort, reset]);

    if (abort) {
        return (
            <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-8 h-8 border-2 border-white/10 border-t-[#00ff88] rounded-full animate-spin" />
                    <span className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-600 animate-pulse">
                        Reconectando...
                    </span>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#0a0a0f] flex flex-col items-center justify-center p-8 text-center text-white">
            <div className="w-14 h-14 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mb-6">
                <svg className="w-7 h-7 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                </svg>
            </div>
            <h2 className="text-2xl font-black uppercase italic tracking-tight mb-2">
                Error inesperado
            </h2>
            <p className="text-sm text-slate-500 font-mono mb-8 max-w-md">
                {error.message || 'Ha ocurrido un error inesperado.'}
            </p>
            <div className="flex gap-3">
                <button
                    onClick={reset}
                    className="px-6 py-3 rounded-xl bg-[#00ff88] text-[#0a0a0f] text-[10px] font-black uppercase tracking-widest"
                >
                    Reintentar
                </button>
                <Link
                    href="/"
                    className="px-6 py-3 rounded-xl border border-white/10 text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-white transition-colors"
                >
                    Ir al inicio
                </Link>
            </div>
        </div>
    );
}
