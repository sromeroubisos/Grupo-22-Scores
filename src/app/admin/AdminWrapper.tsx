'use client';

import { useAuth } from '@/context/AuthContext';
import LoginScreen from './components/LoginScreen';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { hasEditorialAccess, hasFederationAdminAccess, resolveAdminPanel } from '@/lib/auth/roles';
import { useEffect, useState } from 'react';

function buildReturnTo(pathname: string, searchParams: ReturnType<typeof useSearchParams>): string {
    const qs = searchParams.toString();
    return `${pathname}${qs ? '?' + qs : ''}`;
}

export default function AdminWrapper({ children }: { children: React.ReactNode }) {
    const { user, isAuthenticated, isLoading } = useAuth();
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const [hasMounted, setHasMounted] = useState(false);

    useEffect(() => {
        setHasMounted(true);
    }, []);

    const currentReturnTo = buildReturnTo(pathname ?? '', searchParams);

    // Habia un bypass por `/admin/matches/*` que dejaba pasar sin sesion ni
    // rol. Esa pagina no existe: lo unico en esa URL es la ruta de API
    // `/api/admin/matches/[id]`, que no pasa por acá. No habilitaba ninguna
    // consola, solo agujereaba el guard.
    const isEditorialRoute = pathname === '/admin';

    const adminPanel = resolveAdminPanel(user?.role, user?.memberships);
    const isFederationAdmin = hasFederationAdminAccess(user?.role, user?.memberships);
    const isEditorialUser = hasEditorialAccess(user?.role, user?.memberships);
    const isAllowed = user && (isFederationAdmin || (isEditorialUser && isEditorialRoute));

    if (!hasMounted || isLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center relative overflow-hidden bg-[var(--color-bg-primary)] text-[var(--color-text-primary)]">
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-[#00ff88]/10 rounded-full blur-[100px]" />
                <div className="relative flex flex-col items-center gap-6">
                    <div className="w-16 h-16 border-4 border-[#00ff88]/20 border-t-[#00ff88] rounded-full animate-spin shadow-[0_0_30px_rgba(0,255,136,0.1)]" />
                    <span className="text-[10px] font-black uppercase tracking-[0.4em] text-[var(--color-text-tertiary)] animate-pulse">Initializing Neural Link</span>
                </div>
            </div>
        );
    }

    if (!isAuthenticated) {
        return <LoginScreen returnTo={currentReturnTo} />;
    }

    if (isAuthenticated && !isAllowed) {
        return (
            <div className="min-h-screen flex items-center justify-center p-6 relative overflow-hidden bg-[var(--color-bg-primary)] text-[var(--color-text-primary)]">
                <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-red-500/10 rounded-full blur-[120px]" />

                <div className="backdrop-blur-2xl rounded-[3rem] border border-red-500/20 shadow-2xl p-12 max-w-md w-full text-center relative z-10 overflow-hidden bg-[var(--color-glass)]">
                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-red-500 to-transparent opacity-50" />

                    <div className="w-20 h-20 rounded-3xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto mb-8 shadow-inner">
                        <span className="material-symbols-outlined text-4xl text-red-500">lock_open</span>
                    </div>

                    <h1 className="text-3xl font-black text-[var(--color-text-primary)] tracking-tighter uppercase italic mb-4">
                        ACCESS <span className="text-red-500">DENIED</span>
                    </h1>

                    <p className="text-[var(--color-text-secondary)] text-sm font-medium mb-10 leading-relaxed px-4">
                        Your current clearance level is insufficient to access the <span className="text-[var(--color-text-primary)] font-bold">Federation Control Center</span>.
                    </p>

                    {adminPanel?.href ? (
                        <button
                            onClick={() => router.push(adminPanel.href)}
                            className="w-full flex items-center justify-center gap-3 py-4 rounded-2xl bg-[#00ff88] text-[#0a0a0f] font-black text-xs uppercase tracking-widest shadow-[0_15px_30px_-5px_rgba(0,255,136,0.3)] hover:scale-105 active:scale-95 transition-all"
                        >
                            <span className="material-symbols-outlined text-lg">rebase_edit</span>
                            {`Ir a ${adminPanel.label}`}
                        </button>
                    ) : (
                        <button
                            onClick={() => router.push('/')}
                            className="w-full flex items-center justify-center gap-3 py-4 rounded-2xl border font-black text-xs uppercase tracking-widest transition-all bg-[var(--color-bg-tertiary)] border-[var(--color-border)] text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)]"
                        >
                            Return to Public Front
                        </button>
                    )}

                    <div className="mt-10 pt-8 border-t border-[var(--color-border)] opacity-50">
                        <span className="text-[9px] font-black text-[var(--color-text-tertiary)] uppercase tracking-[0.3em]">Code 403 • Unauthorized Intrusion</span>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="flex w-full min-h-screen bg-[var(--color-bg-primary)] text-[var(--color-text-primary)] font-display selection:bg-[#00ff88]/30 selection:text-white">
            <main className="flex-1 w-full min-w-0 flex flex-col relative">
                {/* Global Ambient Glow */}
                <div className="fixed top-0 right-0 w-[50vw] h-[50vh] bg-blue-600/5 rounded-full blur-[150px] -z-10 pointer-events-none" />
                <div className="fixed bottom-0 left-0 w-[30vw] h-[30vh] bg-[#00ff88]/5 rounded-full blur-[150px] -z-10 pointer-events-none" />

                <div className="relative z-10 h-full">
                    {children}
                </div>
            </main>
        </div>
    );
}


