'use client';

import React from 'react';
import { useRouter } from 'next/navigation';

interface LoginScreenProps {
    returnTo?: string;
}

/**
 * Mock role-picker shown to unauthenticated users in the admin panel.
 * Instead of calling AuthContext.login() directly (which does window.location.href),
 * we navigate to /login with returnTo+roleIntent query params.
 * After real auth, EmailLoginForm will router.replace(returnTo).
 */
export default function LoginScreen({ returnTo }: LoginScreenProps) {
    const router = useRouter();

    const navigate = (roleIntent: string) => {
        const query = new URLSearchParams();
        if (returnTo) query.set('returnTo', returnTo);
        query.set('roleIntent', roleIntent);
        router.push(`/login?${query.toString()}`);
    };

    const isConfigured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL);

    return (
        <div className="min-h-screen flex items-center justify-center bg-[#050508] font-display p-6 relative overflow-hidden">
            {/* Titan Cosmic Background */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-[#00ff88]/10 rounded-full blur-[160px] animate-pulse" />
                <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-blue-600/10 rounded-full blur-[160px]" />
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full bg-[radial-gradient(circle_at_center,rgba(0,255,136,0.03)_0%,transparent_70%)]" />
                <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 contrast-150 brightness-100 mix-blend-overlay" />
            </div>

            <div className="relative z-10 w-full max-w-md">
                {/* Main Glass Portal */}
                <div className="bg-[#12141c]/80 backdrop-blur-2xl rounded-[2.5rem] border border-white/5 shadow-[0_40px_100px_-20px_rgba(0,0,0,0.8)] p-10 overflow-hidden group">
                    {/* Interior Glow */}
                    <div className="absolute -top-24 -left-24 w-48 h-48 bg-[#00ff88]/5 rounded-full blur-3xl group-hover:bg-[#00ff88]/10 transition-colors duration-1000" />

                    <div className="relative z-10">
                        <div className="text-center mb-12">
                            <div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-black/40 border border-white/5 shadow-inner mb-8 group-hover:border-[#00ff88]/30 transition-all duration-500 overflow-hidden relative">
                                <div className="absolute inset-0 bg-gradient-to-br from-[#00ff88]/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                                <span className="material-symbols-outlined text-4xl text-[#00ff88] relative z-10 animate-pulse">security</span>
                            </div>

                            <h1 className="text-4xl font-black text-white tracking-tighter mb-3 uppercase italic">
                                TITAN <span className="text-[#00ff88]">CORE</span>
                            </h1>
                            <p className="text-slate-500 text-xs font-bold uppercase tracking-[0.2em]">Administrative Authentication Required</p>

                            {!isConfigured && (
                                <div className="mt-6 p-4 rounded-2xl bg-red-500/5 border border-red-500/20 text-red-400 text-[10px] font-black uppercase tracking-widest animate-bounce">
                                    System Error: Neural Link Inactive
                                </div>
                            )}
                        </div>

                        <div className="space-y-4">
                            <button
                                onClick={() => navigate('admin_general')}
                                className="w-full flex items-center gap-6 p-6 rounded-3xl bg-white/[0.02] border border-white/5 hover:border-[#00ff88]/40 hover:bg-[#00ff88]/5 transition-all duration-500 group/btn relative overflow-hidden"
                            >
                                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[#00ff88]/5 to-transparent -translate-x-full group-hover/btn:translate-x-full transition-transform duration-1000" />

                                <div className="w-14 h-14 rounded-2xl bg-black/40 flex items-center justify-center border border-white/5 group-hover/btn:border-[#00ff88]/20 group-hover/btn:scale-105 transition-all">
                                    <span className="material-symbols-outlined text-2xl text-white group-hover/btn:text-[#00ff88]">terminal</span>
                                </div>

                                <div className="text-left flex-1">
                                    <h3 className="font-black text-sm text-white uppercase tracking-wider group-hover/btn:text-[#00ff88] transition-colors">Command Center</h3>
                                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-0.5">Full System Override</p>
                                </div>

                                <span className="material-symbols-outlined text-slate-700 group-hover/btn:text-[#00ff88] group-hover/btn:translate-x-2 transition-all">
                                    east
                                </span>
                            </button>

                            <button
                                onClick={() => navigate('fan')}
                                className="w-full flex items-center gap-6 p-6 rounded-3xl bg-white/[0.02] border border-white/5 hover:border-blue-500/40 hover:bg-blue-500/5 transition-all duration-500 group/btn"
                            >
                                <div className="w-14 h-14 rounded-2xl bg-black/40 flex items-center justify-center border border-white/5 group-hover/btn:border-blue-500/20 group-hover/btn:scale-105 transition-all">
                                    <span className="material-symbols-outlined text-2xl text-white group-hover/btn:text-blue-400">monitoring</span>
                                </div>

                                <div className="text-left flex-1">
                                    <h3 className="font-black text-sm text-white uppercase tracking-wider group-hover/btn:text-blue-400 transition-colors">Operator Portal</h3>
                                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-0.5">Read-Only Archives</p>
                                </div>

                                <span className="material-symbols-outlined text-slate-700 group-hover/btn:text-blue-400 group-hover/btn:translate-x-2 transition-all">
                                    east
                                </span>
                            </button>
                        </div>
                    </div>

                    {/* Bottom Status Branding */}
                    <div className="mt-12 pt-8 border-t border-white/5 flex items-center justify-between opacity-50">
                        <div className="flex items-center gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-[#00ff88] animate-pulse" />
                            <span className="text-[9px] font-black text-white uppercase tracking-widest">Protocol 22.9 Active</span>
                        </div>
                        <span className="text-[9px] font-bold text-slate-600 uppercase tracking-widest">v4.0 Obsidian</span>
                    </div>
                </div>

                {/* Decorative Elements around the central card */}
                <div className="absolute -bottom-6 -right-6 text-[120px] font-black text-white/[0.02] select-none pointer-events-none italic uppercase">
                    CORE
                </div>
            </div>
        </div>
    );
}

