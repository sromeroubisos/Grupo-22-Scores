'use client';

import { useAuth } from '@/context/AuthContext';
import LoginScreen from './components/LoginScreen';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useEffect } from 'react';
import { resolveAdminPanel } from '@/lib/auth/roles';

function buildReturnTo(pathname: string, searchParams: ReturnType<typeof useSearchParams>): string {
    const qs = searchParams.toString();
    return `${pathname}${qs ? '?' + qs : ''}`;
}

export default function AdminWrapper({ children }: { children: React.ReactNode }) {
    const { user, isAuthenticated, isLoading } = useAuth();
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();

    const currentReturnTo = buildReturnTo(pathname ?? '', searchParams);

    const isMatchConsole = pathname?.startsWith('/admin/matches/');

    const adminPanel = resolveAdminPanel(user?.role, user?.memberships);
    const isFederationAdmin = Boolean(adminPanel && adminPanel.href.startsWith('/admin'));
    const isAllowed = user && isFederationAdmin;

    if (isLoading) {
        return (
            <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center relative overflow-hidden">
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-[#00ff88]/10 rounded-full blur-[100px]" />
                <div className="relative flex flex-col items-center gap-6">
                    <div className="w-16 h-16 border-4 border-[#00ff88]/20 border-t-[#00ff88] rounded-full animate-spin shadow-[0_0_30px_rgba(0,255,136,0.1)]" />
                    <span className="text-[10px] font-black uppercase tracking-[0.4em] text-slate-500 animate-pulse">Initializing Neural Link</span>
                </div>
            </div>
        );
    }

    if (!isAuthenticated && !isMatchConsole) {
        return <LoginScreen returnTo={currentReturnTo} />;
    }

    if (isAuthenticated && !isAllowed && !isMatchConsole) {
        return (
            <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center p-6 relative overflow-hidden">
                <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-red-500/10 rounded-full blur-[120px]" />

                <div className="bg-[#131022]/80 backdrop-blur-2xl rounded-[3rem] border border-red-500/20 shadow-2xl p-12 max-w-md w-full text-center relative z-10 overflow-hidden">
                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-red-500 to-transparent opacity-50" />

                    <div className="w-20 h-20 rounded-3xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto mb-8 shadow-inner">
                        <span className="material-symbols-outlined text-4xl text-red-500">lock_open</span>
                    </div>

                    <h1 className="text-3xl font-black text-white tracking-tighter uppercase italic mb-4">
                        ACCESS <span className="text-red-500">DENIED</span>
                    </h1>

                    <p className="text-slate-400 text-sm font-medium mb-10 leading-relaxed px-4">
                        Your current clearance level is insufficient to access the <span className="text-white font-bold">Federation Control Center</span>.
                    </p>

                    {adminPanel?.href === '/club-admin' ? (
                        <button
                            onClick={() => router.push('/club-admin')}
                            className="w-full flex items-center justify-center gap-3 py-4 rounded-2xl bg-[#00ff88] text-[#0a0a0f] font-black text-xs uppercase tracking-widest shadow-[0_15px_30px_-5px_rgba(0,255,136,0.3)] hover:scale-105 active:scale-95 transition-all"
                        >
                            <span className="material-symbols-outlined text-lg">rebase_edit</span>
                            Switch to Club Panel
                        </button>
                    ) : (
                        <button
                            onClick={() => router.push('/')}
                            className="w-full flex items-center justify-center gap-3 py-4 rounded-2xl bg-white/5 border border-white/10 text-white font-black text-xs uppercase tracking-widest hover:bg-white/10 transition-all"
                        >
                            Return to Public Front
                        </button>
                    )}

                    <div className="mt-10 pt-8 border-t border-white/5 opacity-40">
                        <span className="text-[9px] font-black text-slate-500 uppercase tracking-[0.3em]">Code 403 • Unauthorized Intrusion</span>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="flex w-full min-h-screen bg-[#0a0a0f] text-white font-display selection:bg-[#00ff88]/30 selection:text-white">
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


