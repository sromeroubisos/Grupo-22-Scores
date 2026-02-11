'use client';

import { useAuth } from '@/context/AuthContext';

export default function MatchAdminLayout({ children }: { children: React.ReactNode }) {
    const { isAuthenticated, isLoading } = useAuth();

    if (isLoading) {
        return (
            <div className="fixed inset-0 bg-[#09090b] flex items-center justify-center z-50">
                <div className="w-8 h-8 border-4 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin" />
            </div>
        );
    }

    if (!isAuthenticated) return (
        <div className="min-h-screen grid place-items-center bg-[#09090b] text-white font-sans">
            <div className="text-center space-y-4">
                <h1 className="text-2xl font-bold">Acceso Restringido</h1>
                <p className="text-zinc-500">Debes iniciar sesión para ver esta página.</p>
            </div>
        </div>
    );

    return (
        <div className="min-h-screen w-full bg-[#09090b] text-slate-200 font-sans selection:bg-emerald-500/30">
            {children}
        </div>
    );
}
