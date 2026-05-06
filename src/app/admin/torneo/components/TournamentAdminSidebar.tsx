'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import styles from '../tournament-admin.module.css';

const NAV_ITEMS = [
    { href: '/admin/torneo', label: 'Inicio', match: (p: string) => p === '/admin/torneo' },
    { href: '/admin/torneo/clubes', label: 'Clubes', match: (p: string) => p.startsWith('/admin/torneo/clubes') },
    { href: '/admin/torneo/torneos', label: 'Torneos', match: (p: string) => p.startsWith('/admin/torneo/torneos') },
];

export default function TournamentAdminSidebar() {
    const pathname = usePathname() ?? '';
    const [open, setOpen] = useState(false);

    return (
        <>
            <header className={styles.mobileHeader}>
                <h1 className={styles.mobileBrand}>
                    Panel <span style={{ color: '#00f2ff' }}>Torneos</span>
                </h1>
                <button
                    type="button"
                    onClick={() => setOpen((v) => !v)}
                    style={{ background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer' }}
                    aria-label={open ? 'Cerrar menú' : 'Abrir menú'}
                >
                    <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16m-7 6h7" />
                    </svg>
                </button>
            </header>

            <aside className={`${styles.sidebar} ${open ? styles.sidebarOpen : ''}`}>
                <div className={styles.sidebarInner}>
                    <div>
                        <div style={{ marginBottom: 48 }}>
                            <p className={styles.sidebarEyebrow}>Sistema</p>
                            <h1 className={styles.sidebarBrand}>
                                Panel <span className={styles.sidebarBrandAccent}>Torneos</span>
                            </h1>
                        </div>

                        <nav className={styles.nav}>
                            {NAV_ITEMS.map((item) => {
                                const active = item.match(pathname);
                                return (
                                    <Link
                                        key={item.href}
                                        href={item.href}
                                        className={`${styles.navItem} ${active ? styles.navItemActive : ''}`}
                                        onClick={() => setOpen(false)}
                                    >
                                        <span className={styles.navDot} aria-hidden />
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
        </>
    );
}
