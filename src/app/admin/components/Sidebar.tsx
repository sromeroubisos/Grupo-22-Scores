'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { getRoleLabel, isGlobalAdminRole } from '@/lib/auth/roles';

type SidebarSection =
    | 'dashboard'
    | 'tournaments'
    | 'matches'
    | 'clubs'
    | 'players'
    | 'roles'
    | 'news'
    | 'moderation'
    | 'sync';

interface SidebarItem {
    id: SidebarSection;
    icon: string;
    label: string;
    badge?: number;
    href: string;
    roles: ('super_admin')[];
}

const ALL_ADMINS = ['super_admin'] as const;

const sidebarItems: SidebarItem[] = [
    { id: 'dashboard', icon: 'dashboard', label: 'Dashboard', href: '/admin/super', roles: ['super_admin'] },
    { id: 'tournaments', icon: 'emoji_events', label: 'Torneos', href: '/admin/super/torneos', roles: ['super_admin'] },
    { id: 'matches', icon: 'sports_score', label: 'Partidos', href: '/admin/super/partidos', roles: ['super_admin'] },
    { id: 'clubs', icon: 'shield', label: 'Clubes', href: '/admin/super/clubes', roles: ['super_admin'] },
    { id: 'players', icon: 'group', label: 'Jugadores', href: '/admin/super/jugadores', roles: ['super_admin'] },
    { id: 'roles', icon: 'badge', label: 'Personas y Roles', href: '/admin/super/personas-roles', roles: ['super_admin'] },
    { id: 'news', icon: 'newspaper', label: 'Noticias', href: '/admin/super/noticias', roles: ['super_admin'] },
    { id: 'moderation', icon: 'policy', label: 'Moderación', href: '/admin/super/moderacion', roles: ['super_admin'] },
    { id: 'sync', icon: 'sync', label: 'Sincronización', href: '/admin/super/sync', roles: ['super_admin'] }
];

export default function Sidebar() {
    const pathname = usePathname();
    const { user, logout } = useAuth();

    const [isOpen, setIsOpen] = React.useState(false);

    const toggleSidebar = () => setIsOpen(!isOpen);
    const closeSidebar = () => setIsOpen(false);

    if (!user || !isGlobalAdminRole(user.role)) return null;

    return (
        <>
            {/* Mobile Toggle Button */}
            <button
                className="lg:hidden fixed top-6 left-6 z-50 w-12 h-12 rounded-2xl bg-[#12141c]/80 backdrop-blur-xl border border-white/10 text-white flex items-center justify-center shadow-2xl active:scale-95 transition-all"
                onClick={toggleSidebar}
                aria-label="Toggle menu"
            >
                <span className="material-symbols-outlined text-2xl">{isOpen ? 'close' : 'menu'}</span>
            </button>

            {/* Overlay */}
            {isOpen && (
                <div
                    className="lg:hidden fixed inset-0 bg-black/80 backdrop-blur-md z-40 animate-in fade-in duration-500"
                    onClick={closeSidebar}
                    aria-hidden="true"
                />
            )}

            <aside className={`
                fixed lg:sticky top-0 left-0 h-screen z-40
                w-[300px] flex-shrink-0 flex flex-col
                bg-[#0a0a0f] border-r border-white/[0.03]
                transition-transform duration-500 cubic-bezier(0.4, 0, 0.2, 1)
                ${isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
            `}>
                {/* Brand Identity */}
                <div className="p-8 mb-4">
                    <Link href="/" className="flex items-center gap-4 group" onClick={closeSidebar}>
                        <div className="w-12 h-12 rounded-[1.25rem] bg-[#00ff88] text-[#0a0a0f] flex items-center justify-center font-black text-2xl shadow-[0_0_30px_rgba(0,255,136,0.3)] group-hover:scale-110 group-hover:rotate-3 transition-all duration-500">
                            G2
                        </div>
                        <div className="flex flex-col">
                            <span className="text-2xl font-black text-white tracking-tighter uppercase italic leading-none">
                                TITAN <span className="text-[#00ff88]">V2</span>
                            </span>
                            <span className="text-[9px] text-slate-500 font-black tracking-[0.3em] uppercase mt-1">
                                Command Console
                            </span>
                        </div>
                    </Link>
                </div>

                {/* Navigation Scroll Area */}
                <nav className="flex-1 overflow-y-auto px-4 pb-10 space-y-1.5 custom-scrollbar">
                    <p className="px-5 mb-4 text-[10px] font-black text-slate-600 uppercase tracking-[0.2em]">Management</p>
                    {sidebarItems.map((item) => {
                        const isActive = pathname === item.href || (item.href !== '/admin' && pathname.startsWith(item.href));

                        return (
                            <Link
                                key={item.id}
                                href={item.href}
                                className={`
                                    flex items-center gap-4 px-5 py-3.5 rounded-2xl transition-all duration-300 group
                                    ${isActive
                                        ? 'bg-[#00ff88]/5 text-[#00ff88] border border-[#00ff88]/20 shadow-[0_10px_20px_-10px_rgba(0,255,136,0.1)]'
                                        : 'text-slate-400 hover:text-white hover:bg-white/[0.03] border border-transparent'}
                                `}
                                onClick={closeSidebar}
                            >
                                <div className={`
                                    w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-300
                                    ${isActive ? 'bg-[#00ff88]/10 text-[#00ff88]' : 'bg-white/[0.02] text-slate-600 group-hover:text-white group-hover:bg-white/5'}
                                `}>
                                    <span className={`
                                        material-symbols-outlined text-[20px]
                                        ${isActive ? 'scale-110' : 'group-hover:scale-110'}
                                    `}>
                                        {item.icon}
                                    </span>
                                </div>
                                <span className="text-xs font-black uppercase tracking-wider flex-1 transition-colors">{item.label}</span>
                                {item.badge && (
                                    <span className="px-2 py-0.5 rounded-lg bg-red-500 text-white text-[9px] font-black shadow-lg shadow-red-500/20">
                                        {item.badge}
                                    </span>
                                )}
                                {isActive && (
                                    <div className="w-1.5 h-1.5 rounded-full bg-[#00ff88] shadow-[0_0_10px_#00ff88]" />
                                )}
                            </Link>
                        );
                    })}
                </nav>

                {/* Bottom User Area */}
                <div className="p-6">
                    <div className="bg-[#12141c]/50 backdrop-blur-xl border border-white/[0.03] rounded-[2rem] p-5 shadow-2xl">
                        <div className="flex items-center gap-4 mb-6">
                            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-slate-800 to-black p-0.5 shadow-xl">
                                <div className="w-full h-full rounded-[0.9rem] bg-[#12141c] flex items-center justify-center text-white font-black text-lg border border-white/5">
                                    {user.name.charAt(0)}
                                </div>
                            </div>
                            <div className="flex flex-col min-w-0">
                                <span className="text-sm font-black text-white truncate tracking-tight">{user.name}</span>
                                <div className="flex items-center gap-1.5 mt-0.5">
                                        <span className="w-1.5 h-1.5 rounded-full bg-[#00ff88] animate-pulse" />
                                        <span className="text-[9px] text-[#00ff88]/80 font-black uppercase tracking-widest truncate">
                                        {isGlobalAdminRole(user.role) ? getRoleLabel(user.role) : 'Staff'}
                                        </span>
                                    </div>
                                </div>
                        </div>
                        <button
                            onClick={logout}
                            className="w-full py-3.5 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 hover:text-white hover:bg-red-500/10 hover:border-red-500/20 transition-all border border-transparent shadow-inner flex items-center justify-center gap-3 bg-white/[0.02]"
                        >
                            <span className="material-symbols-outlined text-[16px]">logout</span>
                            Terminate Session
                        </button>
                    </div>

                    <div className="mt-8 text-center flex flex-col gap-1">
                        <span className="text-[9px] text-slate-600 font-bold uppercase tracking-[0.4em] line-height-none">
                            Obsidian Engine v4.0
                        </span>
                        <span className="text-[8px] text-slate-800 font-bold uppercase tracking-[0.2em]">
                            Authenticated Secure Session
                        </span>
                    </div>
                </div>
            </aside>
        </>
    );
}

