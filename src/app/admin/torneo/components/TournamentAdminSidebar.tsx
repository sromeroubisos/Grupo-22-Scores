'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
    ClipboardList,
    Home,
    LayoutDashboard,
    MoreHorizontal,
    Shield,
    Trophy,
    UserCog,
    X,
} from 'lucide-react';
import styles from '../tournament-admin.module.css';

type NavItem = {
    href: string;
    label: string;
    Icon: LucideIcon;
    match: (p: string) => boolean;
};

const NAV_ITEMS: NavItem[] = [
    { href: '/admin/torneo', label: 'Inicio', Icon: Home, match: (p) => p === '/admin/torneo' },
    { href: '/admin/torneo/clubes', label: 'Clubes', Icon: Shield, match: (p) => p.startsWith('/admin/torneo/clubes') },
    { href: '/admin/torneo/torneos', label: 'Torneos', Icon: Trophy, match: (p) => p.startsWith('/admin/torneo/torneos') },
    { href: '/admin/torneo/partidos', label: 'Editar partidos', Icon: ClipboardList, match: (p) => p.startsWith('/admin/torneo/partidos') },
    { href: '/admin/torneo/usuarios', label: 'Usuarios', Icon: UserCog, match: (p) => p.startsWith('/admin/torneo/usuarios') },
];

// Mobile bottom-nav exposes the 3 primary destinations; "Más" opens the drawer
// (which holds the full set of sections).
const BOTTOM_ITEMS: NavItem[] = [
    { href: '/admin/torneo', label: 'Inicio', Icon: LayoutDashboard, match: (p) => p === '/admin/torneo' },
    { href: '/admin/torneo/torneos', label: 'Torneos', Icon: Trophy, match: (p) => p.startsWith('/admin/torneo/torneos') },
    { href: '/admin/torneo/clubes', label: 'Clubes', Icon: Shield, match: (p) => p.startsWith('/admin/torneo/clubes') },
];

export default function TournamentAdminSidebar() {
    const pathname = usePathname() ?? '';
    const [open, setOpen] = useState(false);

    return (
        <>
            <header className={styles.mobileHeader}>
                <h1 className={styles.mobileBrand}>
                    Panel <span className={styles.mobileBrandAccent}>Torneos</span>
                </h1>
                <div className={styles.mobileHeaderRight}>
                    <span className={styles.mobileAvatar} aria-hidden>AD</span>
                    <button
                        type="button"
                        onClick={() => setOpen((v) => !v)}
                        className={styles.mobileMenuBtn}
                        aria-label={open ? 'Cerrar menú' : 'Abrir menú'}
                    >
                        <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16m-7 6h7" />
                        </svg>
                    </button>
                </div>
            </header>

            <div
                className={`${styles.drawerBackdrop} ${open ? styles.drawerBackdropOpen : ''}`}
                onClick={() => setOpen(false)}
                aria-hidden
            />

            <aside className={`${styles.sidebar} ${open ? styles.sidebarOpen : ''}`}>
                <div className={styles.sidebarInner}>
                    <div>
                        {/* Mobile-only user header */}
                        <div className={styles.drawerUser}>
                            <div className={styles.drawerUserLeft}>
                                <span className={styles.drawerAvatar} aria-hidden>AD</span>
                                <div>
                                    <p className={styles.drawerUserName}>Admin de Torneos</p>
                                    <p className={styles.drawerUserMeta}>Sistema</p>
                                </div>
                            </div>
                            <button
                                type="button"
                                className={styles.drawerClose}
                                aria-label="Cerrar menú"
                                onClick={() => setOpen(false)}
                            >
                                <X size={20} aria-hidden />
                            </button>
                        </div>

                        {/* Desktop-only brand block (unchanged on >= 1024px) */}
                        <div className={styles.sidebarBrandBlock} style={{ marginBottom: 48 }}>
                            <p className={styles.sidebarEyebrow}>Sistema</p>
                            <h1 className={styles.sidebarBrand}>
                                Panel <span className={styles.sidebarBrandAccent}>Torneos</span>
                            </h1>
                        </div>

                        <nav className={styles.nav}>
                            {NAV_ITEMS.map((item) => {
                                const active = item.match(pathname);
                                const Icon = item.Icon;
                                return (
                                    <Link
                                        key={item.href}
                                        href={item.href}
                                        prefetch={false}
                                        className={`${styles.navItem} ${active ? styles.navItemActive : ''}`}
                                        onClick={() => setOpen(false)}
                                    >
                                        <span className={styles.navDot} aria-hidden />
                                        <Icon className={styles.navIcon} size={18} aria-hidden />
                                        <span className={styles.navLabel}>{item.label}</span>
                                    </Link>
                                );
                            })}
                        </nav>
                    </div>

                    <Link href="/" className={styles.exitLink}>
                        <svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                        </svg>
                        Volver al sitio
                    </Link>
                </div>
            </aside>

            {/* Mobile-only bottom navigation */}
            <nav className={styles.bottomNav}>
                {BOTTOM_ITEMS.map((item) => {
                    const active = item.match(pathname);
                    const Icon = item.Icon;
                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            prefetch={false}
                            className={`${styles.bottomNavItem} ${active ? styles.bottomNavItemActive : ''}`}
                        >
                            <Icon size={20} aria-hidden />
                            <span>{item.label}</span>
                        </Link>
                    );
                })}
                <button type="button" className={styles.bottomNavItem} onClick={() => setOpen(true)}>
                    <MoreHorizontal size={20} aria-hidden />
                    <span>Más</span>
                </button>
            </nav>
        </>
    );
}
